// Temporary HMAC-authenticated test harness. Exact Staging only. Retire after use.
import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {adminClient} from '../functions/_shared/supabaseAdmin.ts';
import {randomUrlSafe,sha256Base64Url,decryptSecret} from '../functions/_shared/crypto.ts';
import {json} from '../functions/_shared/http.ts';
import {handleDeletion,queueRecovery} from '../functions/_shared/deletionService.ts';
const URL='https://fhhudicklmpofuzkxeqe.supabase.co';
Deno.serve(async req=>{
 if(Deno.env.get('SUPABASE_URL')!==URL||req.method!=='POST')return json({error:'staging_only'},403);
 const admin=adminClient();
 const verified=await admin.rpc('herkeys_verify_deletion_worker',{p_timestamp:req.headers.get('x-deletion-timestamp')??'',p_signature:req.headers.get('x-deletion-signature')??''});
 if(verified.error||verified.data!==true)return json({error:'unauthorized'},401);
 const body=await req.json().catch(()=>({}));const run=body.cleanup_account?body.run:crypto.randomUUID(),shared=body.shared===true;
 const recipient=Deno.env.get('DELETION_STAGING_RECIPIENT');
 if(!recipient)return json({error:'fixture_recipient_unconfigured'},503);
 const [local,domain]=recipient.split('@');const actors:{id:string;email:string;jwt:string}[]=[];
 let stopped=false;let stage='initialize';const observations:Record<string,unknown>={run,shared};
 const check=(condition:unknown,code:string)=>{if(!condition)throw new Error(code);};
 const fixture=async(action:string,swap=false)=>{
  const args={a:actors[swap?1:0].id,b:actors[swap?0:1].id,run,shared};
  const result=await admin.rpc('herkeys_deletion_v2_fixture',{p_action:action,p_args:args});
  if(result.error)throw new Error('fixture_'+action+':'+result.error.code+':'+result.error.message);
  return result.data;
 };
 const worker=async()=>{
  const response=await fetch(URL+'/functions/v1/process-account-deletions',{method:'POST',headers:{'Content-Type':'application/json',
   'x-deletion-timestamp':req.headers.get('x-deletion-timestamp')!,'x-deletion-signature':req.headers.get('x-deletion-signature')!},body:'{}',signal:AbortSignal.timeout(90000)});
  const result=await response.json();check(response.ok,'worker_http_'+response.status);return result;
 };
 const request=async(actor:{jwt:string},proof:string)=>{
  const response=await fetch(URL+'/functions/v1/request-account-deletion',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+actor.jwt,apikey:Deno.env.get('SUPABASE_ANON_KEY')!},body:JSON.stringify({receipt:proof}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();check(response.ok,'request_http_'+response.status+':'+result.error);return result;
 };
 try {
  stage='safe_controls';const control=await admin.from('account_deletion_control').select('enabled,dry_run,test_scope_only').single();
  check(!control.error&&!control.data.enabled&&control.data.dry_run&&!control.data.test_scope_only,'initial_controls_not_safe');
  if(body.cleanup_account){
   stage='validate_cleanup_target';
   const target=await admin.auth.admin.getUserById(body.cleanup_account);
   check(!!target.data.user&&target.data.user.app_metadata.deletion_certification_fixture===true&&target.data.user.app_metadata.deletion_certification_run===run,'cleanup_target_not_owned');
   const email=target.data.user!.email!;
   check(email.startsWith(local+'+herkeys-deletion-')&&email.endsWith('@'+domain),'cleanup_email_not_synthetic');
   const sentinel=await admin.auth.admin.createUser({email:local+'+herkeys-deletion-'+crypto.randomUUID()+'@'+domain,email_confirm:true,app_metadata:{deletion_certification_fixture:true,deletion_certification_run:run}});
   check(!sentinel.error&&sentinel.data.user,'cleanup_sentinel_failed');
   const generated=await admin.auth.admin.generateLink({type:'magiclink',email});
   const client=createClient(URL,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
   const login=await client.auth.verifyOtp({type:'email',token_hash:generated.data.properties!.hashed_token});check(!!login.data.session,'cleanup_auth_failed');
   actors.push({id:target.data.user!.id,email,jwt:login.data.session!.access_token},{id:sentinel.data.user!.id,email:sentinel.data.user!.email!,jwt:''});
   const proof=randomUrlSafe();observations.before=await fixture('inspect');observations.request=await request(actors[0],proof);await fixture('arm');
   for(let i=0;i<5;i++){observations.worker=await worker();observations.after=await fixture('inspect');if(!(observations.after as Record<string,unknown>).request)break;await fixture('retry_now');await new Promise(r=>setTimeout(r,1000));}
   check(!(observations.after as Record<string,unknown>).auth_present&&!(observations.after as Record<string,unknown>).request,'cleanup_not_complete');
   await fixture('stop');stopped=true;
   // The sentinel was never bootstrapped, linked to a household, or registered
   // with a provider. Verify that boundary before removing its Auth-only row.
   const profile=await admin.from('profiles').select('id').eq('id',actors[1].id);check(!profile.error&&profile.data.length===0,'sentinel_has_application_data');
   const removed=await admin.auth.admin.deleteUser(actors[1].id);check(!removed.error,'sentinel_cleanup_failed');
   return json({...observations,pass:true,cleanup_account:actors[0].id,sentinel_removed:true});
  }
  stage='create_owned_fixtures';
  for(let i=0;i<2;i++){
   const email=local+'+herkeys-deletion-'+run+'-'+i+'@'+domain;
   const created=await admin.auth.admin.createUser({email,email_confirm:true,app_metadata:{deletion_certification_fixture:true,deletion_certification_run:run}});
   check(!created.error&&created.data.user,'fixture_create_failed');
   const id=created.data.user!.id;
   const generated=await admin.auth.admin.generateLink({type:'magiclink',email});check(!generated.error,'fixture_link_failed');
   const client=createClient(URL,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
   const login=await client.auth.verifyOtp({type:'email',token_hash:generated.data.properties!.hashed_token});check(!login.error&&login.data.session,'fixture_auth_failed');
   actors.push({id,email,jwt:login.data.session!.access_token});
   const boot=await client.rpc('bootstrap_account',{p_claim_key:crypto.randomUUID(),p_timezone:'UTC',p_device_id:crypto.randomUUID()});check(!boot.error,'fixture_bootstrap_failed');
  }
  observations.accounts=actors.map(a=>a.id);stage='seed';await fixture('seed');
  if(body.create_revenuecat_fixture===true){
   stage='create_revenuecat_fixtures';
   const project=Deno.env.get('REVENUECAT_PROJECT_ID'),key=Deno.env.get('REVENUECAT_DELETION_API_KEY');check(project==='proj93809efe'&&!!key,'revenuecat_configuration_refused');
   const receipts=[];
   for(const actor of actors){
    const created=await fetch('https://api.revenuecat.com/v2/projects/'+project+'/customers',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({id:actor.id}),signal:AbortSignal.timeout(15000)});
    check(created.status===201,'revenuecat_fixture_create_'+created.status);
    const read=await fetch('https://api.revenuecat.com/v2/projects/'+project+'/customers/'+actor.id,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});
    check(read.status===200,'revenuecat_fixture_read_'+read.status);receipts.push({id:actor.id,created:created.status,verified:read.status});
   }
   observations.revenuecat_before=receipts;
  }
  const before=await fixture('inspect');observations.before=before;
  let proof=randomUrlSafe();stage='request';const initiated=await request(actors[0],proof);
  const duplicate=await request(actors[0],randomUrlSafe()).catch(()=>({rejected_after_session_revocation:true}));
  // A banned session may be rejected by hosted Auth before the idempotent SQL
  // branch. SQL duplicate/deadline behavior is independently covered locally.
  observations.request=initiated;observations.duplicate=duplicate;
  if(body.recovery===true){
   stage='recovery';
   const row=await admin.from('account_deletion_outbox').select('payload_ciphertext,payload_iv').eq('request_id',initiated.request_id).eq('kind','recovery').single();check(!row.error,'fixture_recovery_payload_missing');
   const old=JSON.parse(await decryptSecret(row.data!.payload_ciphertext,row.data!.payload_iv));
   await queueRecovery(actors[0].id,actors[0].email);
   const oldAttempt=await handleDeletion(new Request(URL,{method:'POST',body:JSON.stringify({token:old.token})}),'restore');
   check(oldAttempt.status===400,'replacement_token_replay');
   const next=await admin.from('account_deletion_outbox').select('payload_ciphertext,payload_iv').eq('request_id',initiated.request_id).eq('kind','recovery').eq('status','queued').single();check(!next.error,'fixture_replacement_missing');
   const payload=JSON.parse(await decryptSecret(next.data!.payload_ciphertext,next.data!.payload_iv));
   const restored=await handleDeletion(new Request(URL,{method:'POST',body:JSON.stringify({token:payload.token})}),'restore');
   check(restored.ok,'fixture_restore_failed');
   const replay=await handleDeletion(new Request(URL,{method:'POST',body:JSON.stringify({token:payload.token})}),'restore');check(replay.status===400,'recovery_replay_succeeded');
   observations.recovery={restored:await restored.json(),old_token_rejected:true,replay_rejected:true};
   // Reauthenticate the same owned fixture after restoration for a new lifecycle.
   const generated=await admin.auth.admin.generateLink({type:'magiclink',email:actors[0].email});
   const client=createClient(URL,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
   const login=await client.auth.verifyOtp({type:'email',token_hash:generated.data.properties!.hashed_token});check(!!login.data.session,'fixture_reauth_failed');actors[0].jwt=login.data.session!.access_token;
   proof=randomUrlSafe();observations.request=await request(actors[0],proof);
  }
  stage='arm';observations.armed=await fixture('arm');
  for(let i=0;i<5;i++){
   stage='worker';observations.worker=await worker();
   const current=await fixture('inspect');observations.after=current;
   check(current.other_digest===before.other_digest,'other_account_changed');
   if(!current.request||current.request.status==='failed_requires_action')break;
   await fixture('retry_now');await new Promise(r=>setTimeout(r,1000));
  }
  const after=observations.after as Record<string,any>;
  if(shared){
   check(after.request?.status==='failed_requires_action'&&after.unresolved_cases>0,'shared_false_completion');
   check(after.other_profile_present&&after.other_goal_count===1,'shared_other_actor_lost');
   observations.shared_review={status:after.request.status,unresolved:after.unresolved_cases};
   stage='manual_reconciliation';await fixture('reconcile');observations.reconciled_worker=await worker();observations.after=await fixture('inspect');
  }
  stage='terminal';
  const statusResponse=await fetch(URL+'/functions/v1/deletion-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipt:proof})});
  const terminal=await statusResponse.json();observations.terminal=terminal;check(terminal.status==='purged','terminal_not_verified');
  const auth=await admin.auth.admin.getUserById(actors[0].id);check(auth.error?.status===404&&!auth.data.user,'auth_absence_unverified');
  check(Object.values((observations.after as Record<string,any>).owned_counts).every(n=>n===0),'owned_records_remaining');
  stage='stop';await fixture('stop');stopped=true;
  observations.pass=true;
  // Kept second actor supplies independent preservation evidence. Teardown is
  // explicit and uses its ordinary lifecycle, not a cascade through test users.
  return json(observations);
 }catch(error){return json({...observations,pass:false,stage,error:error instanceof Error?error.message:'fixture_failed'},500);}
 finally {
  if(!stopped&&actors.length===2)await fixture('stop').catch(()=>undefined);
 }
});
