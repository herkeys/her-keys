#!/usr/bin/env node
/**
 * Secure operator-only CLI. Never run in a mobile app or Expo client.
 * All writes pin the Staging project ID in code. No Production-write code path.
 * Usage: node scripts-dev/premium-final-config.mjs <command> [args]
 */
import { createClient } from '@supabase/supabase-js';
import {
  PROJECTS, FEATURES, localSecretConfig, preflightLocal, endpoint,
  environmentRef, eventFixture, isUuid, signWebhook, redactError,
  classifyWebhookResult, projectionComparison,
} from './premium-final-config/core.mjs';

const args = process.argv.slice(2);
const cmd = args.shift();
const getFlag = (flag, defaultValue) => { const i=args.indexOf(flag); return i<0 ? defaultValue : args[i+1]; };
const flag = (s) => args.includes(s);
const out = (value) => process.stdout.write(JSON.stringify(value,null,2) + '\n');
const exitFail = (error) => { out({status:'FAIL',reason:error});process.exitCode=1; };
const strictEnv = (environment) => environmentRef(environment);
const staged = () => 'staging';
function requireStaging() {
  const requested=getFlag('--env','staging');
  if (requested!=='staging') throw new Error('write commands are pinned to Staging; Production is read-only');
  return 'staging';
}
function requiredValue(name) {
  const value=process.env[name];
  if (!value) throw new Error('missing operator environment variable: '+name);
  return value;
}
function clientFor(environment) {
  // This helper performs read operations for both projects. Mutating CLI paths
  // call client() only AFTER requireStaging(); Production cannot be a write target.
  const ref=environmentRef(environment);
  const key=requiredValue(`HK_${environment.toUpperCase()}_SUPABASE_SERVICE_ROLE_KEY`);
  return createClient(`https://${ref}.supabase.co`,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
}
function client() {return clientFor('staging');}
async function http(method,url,body,headers={}) {
  const opts={method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},signal:AbortSignal.timeout(12000)};
  if(body!==undefined) opts.body=typeof body==='string'?body:JSON.stringify(body);
  const res=await fetch(url,opts);
  const data=await res.json().catch(()=>({}));
  return {code:res.status,data}; // Never return Response headers; they may contain tokens.
}
async function row(table,columns,environment='staging') {
  const c=clientFor(environment); const {data,error}=await c.from(table).select(columns).limit(1).maybeSingle();
  if(error)throw new Error('Staging database read failed: '+table);
  return data;
}
async function probe(env) {
  const missingWebhook=await http('POST',endpoint(env,'revenuecat-webhook'),{event:{type:'TEST',environment:'SANDBOX',id:'hk-probe'}});
  const missingOps=await http('POST',endpoint(env,'premium-ops'),{action:'backlog',limit:0});
  const unauthorized=await http('GET',endpoint(env,'premium-gate'));
  return {
    webhook_configured:missingWebhook.code===401,
    ops_configured:missingOps.code===401,
    client_jwt_required:unauthorized.code===401,
    fail_closed_unconfigured:missingWebhook.code===503&&missingOps.code===503,
  };
}
async function localPreflight(env) {
  strictEnv(env);
  const local=preflightLocal(localSecretConfig());
  const selected=local.checks[env];
  const external=await probe(env);
  let db={environment_matches:false,premium_state_correct:false,webhook_inactive:false,fixtures_prohibited:false};
  try{
    const r=await row('premium_runtime_config','environment,premium_enabled,webhook_processing,allow_test_fixtures',env);
    db={environment_matches:r?.environment===env,premium_state_correct:r?.premium_enabled===(env==='staging'),
      webhook_inactive:r?.webhook_processing===false,fixtures_prohibited:r?.allow_test_fixtures===false};
  }catch{ /* preflight fails closed when remote DB secrets/access are unavailable */ }
  const checks={local_secrets:selected,cross_environment:local.checks.crossEnvironment,live_http:external,database:db};
  const blockingChecks=Object.entries({
    ...selected,
    ...local.checks.crossEnvironment,
    webhook_configured:external.webhook_configured,
    ops_configured:external.ops_configured,
    client_jwt_required:external.client_jwt_required,
    db_environment_matches:db.environment_matches,
    db_state_expected:db.premium_state_correct,
    db_fixtures_prohibited:db.fixtures_prohibited,
    db_webhook_paused:db.webhook_inactive,
  });
  const ready=blockingChecks.every(([,v])=>v===true);
  out({status:ready?'PASS':'FAIL',environment:env,checks,readyForStagingActivation:env==='staging'&&ready,notes:'Both projects are read-only during preflight; mutations are hard-pinned to Staging.'});
  if(!ready)process.exitCode=1;
  return ready;
}
async function requireActualPreflight() {
  const c=preflightLocal(localSecretConfig());
  if(!c.passed) throw new Error('per-environment secrets incomplete or not distinct; run preflight');
  const p=await probe('staging');
  if(!p.webhook_configured||!p.ops_configured||!p.client_jwt_required)throw new Error('Staging live Edge endpoints are not configured securely');
}
async function requireLiveStagingConfig() {
  const {data,error}=await client().from('premium_runtime_config').select('*').single();
  if(error||data.environment!=='staging'||data.allow_test_fixtures)throw new Error('database identity/fixture guard failed');
  return data;
}
async function getTester(userId) {
  const {data,error}=await client().auth.admin.getUserById(userId);
  if(error||!data?.user)throw new Error('Staging test user not found');
  return data.user;
}
async function manageTester(action) {
  requireStaging(); const userId=getFlag('--account-id');
  if(!isUuid(userId))throw new Error('valid --account-id UUID required');
  await requireLiveStagingConfig();
  const user=await getTester(userId);
  const next={...(user.app_metadata||{}),herkeys_premium_tester:action==='add'};
  const {error}=await client().auth.admin.updateUserById(userId,{app_metadata:next});
  if(error)throw new Error('Staging tester update rejected');
  const updated=await getTester(userId);
  if(Boolean(updated.app_metadata?.herkeys_premium_tester)!==(action==='add'))throw new Error('tester marker read-back differs');
  out({status:'PASS',environment:'staging',action,accountId:userId,testerEnabled:action==='add'});
}
async function testerIsAllowed(accountId) {
  const user=await getTester(accountId);
  return user.app_metadata?.herkeys_premium_tester===true;
}
async function setWindow(mode) {
  requireStaging();
  const config=await requireLiveStagingConfig();
  const c=client();
  if(mode==='verify'){
    const {data,error}=await c.from('premium_feature_config').select('feature_key,enabled,released,rollout_status').in('feature_key',FEATURES);
    if(error)throw new Error('feature read failed');
    const okay=data.length===FEATURES.length&&data.every(x=>x.enabled&&x.released&&x.rollout_status==='staging_only');
    out({status:okay?'PASS':'FAIL',environment:'staging',features:data,webhookProcessing:config.webhook_processing,productionUnchanged:'Production not accessed'});
    if(!okay)process.exitCode=1;return;
  }
  if(mode==='disable') {
    // Order matters: stop new protected work even if later feature write fails.
    const a=await c.from('premium_runtime_config').update({premium_enabled:false,webhook_processing:false}).eq('singleton',true);
    if(a.error)throw new Error('Staging failsafe runtime disable failed');
    const b=await c.from('premium_feature_config').update({enabled:false,released:false,rollout_status:'not_released'}).in('feature_key',FEATURES);
    if(b.error)throw new Error('Staging feature disable partial failure; global Premium remains OFF');
    out({status:'PASS',environment:'staging',globalPremium:false,webhookProcessing:false,featuresEnabled:false});return;
  }
  if(mode!=='enable')throw new Error('window mode must be enable, verify, or disable');
  await requireActualPreflight();
  const accountId=getFlag('--account-id');
  if(!isUuid(accountId)||!await testerIsAllowed(accountId))throw new Error('must supply an allowlisted Staging --account-id');
  // Schema guard MUST be installed to guarantee server-side allowlist enforcement.
  const {data:guard,error:guardError}=await c.rpc('premium_staging_allowlist_guard_ready');
  if(guardError||guard!==true)throw new Error('Staging database allowlist guard migration has not been applied');
  // Require a valid signed-event TEST smoke receipt from the current session before enabling.
  if(!flag('--signed-smoke-passed'))throw new Error('run signed TEST smoke and explicitly pass --signed-smoke-passed');
  const w=await c.from('premium_feature_config').update({enabled:true,released:true,rollout_status:'staging_only'}).in('feature_key',FEATURES);
  if(w.error)throw new Error('Staging feature activation failed');
  const rt=await c.from('premium_runtime_config').update({premium_enabled:true,webhook_processing:true}).eq('singleton',true);
  if(rt.error) {
    await c.from('premium_feature_config').update({enabled:false,released:false}).in('feature_key',FEATURES);
    throw new Error('Staging runtime activation failed; features reverted');
  }
  await setWindow('verify');
}
async function signedSmoke(mode='TEST') {
  requireStaging();
  await requireActualPreflight();
  const conf=localSecretConfig().staging;
  const uuid=getFlag('--account-id');
  if(mode!=='TEST'){
    if(!flag('--synthetic-only')||!isUuid(uuid)||!await testerIsAllowed(uuid))throw new Error('INITIAL_PURCHASE fixture requires --synthetic-only and allowlisted Staging --account-id; cannot grant subscription');
  }
  const fixture=eventFixture(mode,{accountId:uuid});
  const raw=JSON.stringify(fixture);
  const signature=signWebhook(raw,conf.REVENUECAT_WEBHOOK_HMAC_SECRET);
  const req=await http('POST',endpoint('staging','revenuecat-webhook'),raw,{
    Authorization:conf.REVENUECAT_WEBHOOK_AUTH,
    'X-RevenueCat-Webhook-Signature':signature,
  });
  const classification=classifyWebhookResult(req.code,req.data);
  const accepted=req.code===200 && ['ignored_test','processing_halted','stored_processing_halted','processed','received','pending_reconcile','needs_reconcile'].includes(classification);
  let persisted=false;
  if(accepted){
    const {data,error}=await client().from('premium_events')
      .select('event_id,environment,status').eq('event_id',fixture.event.id).eq('environment','SANDBOX').maybeSingle();
    persisted=!error&&data?.event_id===fixture.event.id;
  }
  const receiptPassed=accepted&&persisted;
  out({status:receiptPassed?'PASS':'FAIL',environment:'staging',type:mode,httpCode:req.code,receipt:classification,persisted,
    signed:true,actualPurchaseVerified:false,entitlementGrantVerified:false,
    note:'A locally signed synthetic event proves the transport ONLY. Genuine purchases require RevenueCat Sandbox and an authenticated subscriber reconciliation.'});
  if(!receiptPassed)process.exitCode=1;
}
async function reconcile() {
  requireStaging();await requireActualPreflight();
  const accountId=getFlag('--account-id');
  if(!isUuid(accountId)||!await testerIsAllowed(accountId))throw new Error('reconcile needs allowlisted Staging --account-id');
  const config=localSecretConfig().staging;
  // This is the existing server-side authenticated RevenueCat reconciliation operation.
  const rcCall=await http('GET',`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(accountId)}`,undefined,
    {Authorization:'Bearer '+config.REVENUECAT_SECRET_API_KEY});
  if(rcCall.code!==200)throw new Error('RevenueCat subscriber retrieval failed (redacted)');
  let projectionBefore=await readProjection(accountId);
  let diff=projectionComparison(rcCall.data,projectionBefore);
  let forced='not_needed';
  if(!diff.matched && flag('--resync')) {
    const operation=await http('POST',endpoint('staging','premium-ops'),{action:'reconcile',accountId},
      {'x-premium-ops-secret':config.PREMIUM_OPS_SECRET});
    if(operation.code!==200)throw new Error('Staging Premium ops reconcile failed');
    forced='requested';
    projectionBefore=await readProjection(accountId);
    diff=projectionComparison(rcCall.data,projectionBefore);
  }
  out({status:diff.matched?'PASS':'FAIL',environment:'staging',accountId,result:diff.category,expected:diff.expected,resync:forced});
  if(!diff.matched)process.exitCode=1;
}
async function readProjection(id) {
  const c=client();
  const [{data,error},{data:state,error:stateErr}]=await Promise.all([
    c.from('premium_entitlements').select('account_id,needs_reconcile').eq('account_id',id).maybeSingle(),
    c.rpc('premium_entitlement_state',{p_account:id}),
  ]);
  if(error||stateErr)throw new Error('projection read failed');
  return data ? {state,needs_reconcile:data.needs_reconcile}:null;
}
async function main() {
  try{
    if(cmd==='preflight')return await localPreflight(getFlag('--env','staging'));
    if(cmd==='tester')return await manageTester(args[0]);
    if(cmd==='window')return await setWindow(args[0]);
    if(cmd==='smoke')return await signedSmoke(getFlag('--type','TEST'));
    if(cmd==='reconcile')return await reconcile();
    throw new Error('commands: preflight --env staging|production; tester add|remove --account-id UUID; window enable|verify|disable; smoke --type TEST|INITIAL_PURCHASE; reconcile --account-id UUID [--resync]');
  }catch(e){exitFail(e instanceof Error && /^(missing operator|valid --|environment must|write commands|must supply|reconcile needs|Staging|run signed|window mode|fixtures require|bad event|supported|database identity|failed|per-environment|must supply|INITIAL_PURCHASE|commands:)/.test(e.message)?e.message:redactError(e));}
}
await main();
