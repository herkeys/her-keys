import {test} from 'node:test';
import assert from 'node:assert/strict';
import {revokeGoogle,settleGoogleRevocation,revokeApple,settleAppleRevocation,deleteRevenueCatCustomer} from '../../supabase/functions/_shared/deletionProviders.ts';
import {verifiedAuthAbsence,verifiedProviderEvidence,deletionHealthNeedsAttention,needsProviderReconciliation,providerSettled,recoveryEmail,APPLE_MANUAL_REVOCATION,GOOGLE_ACCESS_CHECK} from '../../supabase/functions/_shared/deletionCore.ts';
test('a crash after the final provider acknowledgement still reconciles the missing aggregate on retry',()=>{
 const acknowledged={google_revoked:true,apple_revoked:true,revenuecat_deleted:true};
 assert.equal(needsProviderReconciliation(acknowledged),true);
 assert.equal(needsProviderReconciliation({...acknowledged,providers:true}),false);
 for(const key of Object.keys(acknowledged))assert.equal(needsProviderReconciliation({...acknowledged,providers:true,[key]:'requires_retry'}),true);
});
test('disabled processing never hides an overdue deletion backlog from monitoring',()=>{
 assert.equal(deletionHealthNeedsAttention({enabled:false,overdue_requests:1}),true);
 assert.equal(deletionHealthNeedsAttention({enabled:false,overdue_requests:0,failed:0}),false);
 assert.equal(deletionHealthNeedsAttention({retention_failed:true}),true);
});

test('Auth absence requires an explicit authoritative 404; aggregate provider booleans cannot skip cleanup',()=>{
 assert.equal(verifiedAuthAbsence({data:{user:null},error:{status:404}}),true);
 for(const result of [{data:{user:null},error:null},{data:{user:{}},error:{status:404}},... [401,403,429,500,503].map(status=>({data:{user:null},error:{status}}))])assert.equal(verifiedAuthAbsence(result),false);
 assert.equal(verifiedProviderEvidence({providers:true}),false);
 const verified={google_revoked:true,apple_revoked:true,revenuecat_deleted:true};assert.equal(verifiedProviderEvidence(verified),true);
 for(const key of Object.keys(verified))assert.equal(verifiedProviderEvidence({...verified,[key]:'requires_retry'}),false);
});
test('OAuth endpoint absence never certifies credential revocation',async()=>{
 const absent=async()=>new Response('{}',{status:404});
 await assert.rejects(revokeGoogle('disposable-token',absent),/provider_unavailable/);
 await assert.rejects(revokeApple('disposable-token','client','secret',absent),/provider_unavailable/);
});
test('RevenueCat deletion requires a subsequent authoritative absence check',async()=>{
 const calls=[];
 const absent=async(url,init)=>{calls.push({url,method:init.method});return new Response('{}',{status:404});};
 await deleteRevenueCatCustomer('fixture-customer','test-secret','proj93809efe',absent);
 assert.deepEqual(calls.map(c=>c.method),['DELETE','GET']);
 assert.ok(calls.every(c=>c.url.endsWith('/customers/fixture-customer')));
 let count=0;
 await assert.rejects(deleteRevenueCatCustomer('fixture','test-secret','proj93809efe',async()=>new Response('{}',{status:++count===1?202:200})),/deletion_pending/);
});
test('provider outages and unrelated project configuration cannot become purge proof',async()=>{
 let calls=0;
 const outage=async()=>{calls++;return new Response('{}',{status:503});};
 await assert.rejects(deleteRevenueCatCustomer('fixture','test-secret','proj93809efe',outage),/provider_unavailable/);
 assert.equal(calls,1);
 await assert.rejects(deleteRevenueCatCustomer('fixture','test-secret','proj46588afb',outage),/not_configured_for_herkeys/);
 assert.equal(calls,1);
 for(const status of [401,403,429]) {
  let attempted=0;
  await assert.rejects(deleteRevenueCatCustomer('fixture','test-secret','proj93809efe',async()=>{attempted++;return new Response('{}',{status});}),/provider_unavailable/);
  assert.equal(attempted,1);
 }
});
test('Google cleanup revokes the credential without modifying calendar events',async()=>{
 let observed;
 await revokeGoogle('disposable-token',async(url,init)=>{observed={url,init};return new Response('{}',{status:200});});
 assert.equal(observed.url,'https://oauth2.googleapis.com/revoke');assert.equal(observed.init.method,'POST');
 assert.equal(observed.init.body.get('token'),'disposable-token');
});

test('DEL-P2-001: legacy Apple accounts without usable revocation material are deleted, never recorded as revoked',async()=>{
 const neverCalled=async()=>{throw new Error('revocation must not be attempted');};
 // Missing / legacy: an Apple identity with no captured refresh token.
 assert.equal(await settleAppleRevocation(true,[],neverCalled),'manual_revocation_required');
 // Not linked to Apple at all: nothing to revoke.
 assert.equal(await settleAppleRevocation(false,[],neverCalled),'not_linked');
 // Confirmed revocation of every stored token.
 const revoked=[];
 assert.equal(await settleAppleRevocation(true,['t1','t2'],async t=>{revoked.push(t);}),'revoked');
 assert.deepEqual(revoked,['t1','t2']);
 // Expired / already revoked by the user: Apple answers invalid_grant.
 const invalidGrant=async()=>new Response(JSON.stringify({error:'invalid_grant'}),{status:400});
 await assert.rejects(revokeApple('expired-token','client','secret',invalidGrant),/apple_credential_unusable/);
 assert.equal(await settleAppleRevocation(true,['expired'],t=>revokeApple(t,'client','secret',invalidGrant)),'manual_revocation_required');
 // One revoked and one unusable token is still not a confirmed revocation.
 assert.equal(await settleAppleRevocation(true,['ok','expired'],t=>revokeApple(t,'client','secret',t==='ok'?async()=>new Response('',{status:200}):invalidGrant)),'manual_revocation_required');
});
test('DEL-P2-001: Apple outages and configuration errors stay retryable and never settle',async()=>{
 for(const response of [()=>new Response('{}',{status:503}),()=>new Response('{}',{status:500}),()=>new Response('{}',{status:429}),
  ()=>new Response(JSON.stringify({error:'invalid_client'}),{status:400}),()=>new Response(JSON.stringify({error:'invalid_request'}),{status:400}),
  ()=>new Response('not json',{status:400}),()=>new Response('{}',{status:401})]) {
  const fetcher=async()=>response();
  await assert.rejects(revokeApple('token','client','secret',fetcher),/provider_unavailable/);
  await assert.rejects(settleAppleRevocation(true,['token'],t=>revokeApple(t,'client','secret',fetcher)),/provider_unavailable/);
 }
 // A network timeout or unconfigured key is an outage, not missing material.
 await assert.rejects(settleAppleRevocation(true,['token'],async()=>{throw new Error('apple_revocation_unconfigured');}),/unconfigured/);
 await assert.rejects(settleAppleRevocation(true,['token'],async()=>{throw new DOMException('timed out','TimeoutError');}));
});
test('DEL-P2-001: only Apple may settle as manual revocation; every other provider still needs confirmed evidence',()=>{
 const settled={google_revoked:true,apple_revoked:'manual_revocation_required',revenuecat_deleted:true};
 assert.equal(verifiedProviderEvidence(settled),true);
 assert.equal(needsProviderReconciliation({...settled,providers:true}),false);
 assert.equal(providerSettled('apple_revoked','manual_revocation_required'),true);
 for(const key of ['google_revoked','revenuecat_deleted']) {
  assert.equal(providerSettled(key,'manual_revocation_required'),false);
  assert.equal(verifiedProviderEvidence({...settled,[key]:'manual_revocation_required'}),false);
 }
 for(const value of ['requires_retry','revoked',false,null,undefined,1])
  assert.equal(verifiedProviderEvidence({...settled,apple_revoked:value}),false,'apple_revoked='+String(value));
});
test('DEL-P2-001: the worker routes Apple through the settlement and tells users how to revoke manually',async()=>{
 const {readFileSync}=await import('node:fs');
 const worker=readFileSync(new URL('../../supabase/functions/_shared/deletionWorker.ts',import.meta.url),'utf8');
 assert.match(worker,/settleAppleRevocation\(/);
 assert.doesNotMatch(worker,/apple_revocation_requires_action/,'missing legacy material must not block deletion forever');
 assert.match(worker,/providerSettled\(name,request\.evidence\[name\]\)/);
 // Identity must still be verified before Apple can be settled at all.
 assert.match(worker,/if\(authLookupUnavailable\)throw new Error\('apple_identity_unverified'\)/);
 const completed=recoveryEmail('completed','2026-11-14T00:00:00Z');
 assert.ok(completed.text.includes(APPLE_MANUAL_REVOCATION)&&completed.html.includes('Sign in with Apple'));
 assert.ok(!recoveryEmail('restored','2026-11-14T00:00:00Z').text.includes('Stop Using'));
 const panel=readFileSync(new URL('../../src/features/account/DeleteAccountPanel.tsx',import.meta.url),'utf8');
 assert.match(panel,/Sign in with Apple/);
});

test('DEL-P2-002: a Google token Google already rejects as invalid settles distinctly; outages stay retryable',async()=>{
 const invalidToken=async()=>new Response(JSON.stringify({error:'invalid_token',error_description:'Token expired or revoked'}),{status:400});
 await assert.rejects(revokeGoogle('removed-grant',invalidToken),/google_credential_unusable/);
 assert.equal(await settleGoogleRevocation(['removed-grant'],t=>revokeGoogle(t,invalidToken)),'credential_already_invalid');
 assert.equal(await settleGoogleRevocation([],async()=>{throw new Error('must not be called');}),'revoked');
 assert.equal(await settleGoogleRevocation(['a','b'],async()=>{}),'revoked');
 for(const response of [()=>new Response('{}',{status:503}),()=>new Response('{}',{status:429}),()=>new Response('{}',{status:404}),
  ()=>new Response(JSON.stringify({error:'invalid_request'}),{status:400}),()=>new Response('html',{status:400})]) {
  await assert.rejects(settleGoogleRevocation(['t'],t=>revokeGoogle(t,async()=>response())),/provider_unavailable/);
 }
 assert.equal(providerSettled('google_revoked','credential_already_invalid'),true);
 for(const key of ['apple_revoked','revenuecat_deleted'])assert.equal(providerSettled(key,'credential_already_invalid'),false);
 assert.equal(verifiedProviderEvidence({google_revoked:'credential_already_invalid',apple_revoked:true,revenuecat_deleted:true}),true);
 assert.equal(verifiedProviderEvidence({google_revoked:'credential_already_invalid',apple_revoked:true,revenuecat_deleted:'credential_already_invalid'}),false);
 const {readFileSync}=await import('node:fs');
 assert.match(readFileSync(new URL('../../supabase/functions/_shared/deletionWorker.ts',import.meta.url),'utf8'),/settleGoogleRevocation\(/);
 const completed=recoveryEmail('completed','2026-11-14T00:00:00Z').text;
 assert.ok(completed.includes(GOOGLE_ACCESS_CHECK)&&/events are not deleted/.test(completed));
});

test('Apple credential client-secret uses the approved four Staging/Production secret names',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../../supabase/functions/_shared/deletionApple.ts',import.meta.url),'utf8');
 for(const key of ['APPLE_DELETION_CLIENT_ID','APPLE_DELETION_TEAM_ID','APPLE_DELETION_KEY_ID','APPLE_DELETION_PRIVATE_KEY'])
  assert.ok(source.includes("Deno.env.get('"+key+"')"),'Missing approved secret: '+key);
 for(const wrong of ['APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY'])
  assert.ok(!source.includes("Deno.env.get('"+wrong+"')"),'Legacy secret must not be read: '+wrong);
});
