import {test} from 'node:test';
import assert from 'node:assert/strict';
import {revokeGoogle,revokeApple,deleteRevenueCatCustomer} from '../../supabase/functions/_shared/deletionProviders.ts';
import {verifiedAuthAbsence,verifiedProviderEvidence,deletionHealthNeedsAttention,needsProviderReconciliation} from '../../supabase/functions/_shared/deletionCore.ts';
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

test('Apple credential client-secret uses the approved four Staging/Production secret names',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../../supabase/functions/_shared/deletionApple.ts',import.meta.url),'utf8');
 for(const key of ['APPLE_DELETION_CLIENT_ID','APPLE_DELETION_TEAM_ID','APPLE_DELETION_KEY_ID','APPLE_DELETION_PRIVATE_KEY'])
  assert.ok(source.includes("Deno.env.get('"+key+"')"),'Missing approved secret: '+key);
 for(const wrong of ['APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY'])
  assert.ok(!source.includes("Deno.env.get('"+wrong+"')"),'Legacy secret must not be read: '+wrong);
});
