import {test} from 'node:test';
import assert from 'node:assert/strict';
import {revokeGoogle,revokeApple,deleteRevenueCatCustomer} from '../../supabase/functions/_shared/deletionProviders.ts';
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
