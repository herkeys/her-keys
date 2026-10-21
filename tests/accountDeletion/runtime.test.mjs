import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeletionRuntime} from '../../src/domain/account/deletionRuntime.ts';
import {createMemorySecureStorage,createSecureSessionStore} from '../../src/domain/account/secureSession.ts';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const KEY='herkeys.secure.deletionReceipt';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const session=id=>({accountId:id,accessToken:'jwt-'+id,refreshToken:'refresh-'+id,expiresAt:Date.now()+3600000,provider:null});
function harness(options={}) {
 let actor={kind:'accountBound',session:session(A),householdId:'household'},namespace=A;
 const subscribers=new Set(),effects=[],calls=[];
 const storage=createMemorySecureStorage(options.receipt?{[KEY+'.'+A]:JSON.stringify({accountId:A,proof:'p'.repeat(43)})}:{});
 const sessions=createSecureSessionStore(storage);
 const accountRuntime={getState:()=>actor,subscribe:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn);},async signOut(expected){
  assert.equal(expected,actor.session?.accountId);effects.push('signout:'+expected);actor={kind:'unauthenticated'};for(const fn of subscribers)fn();
 }};
 const appStore={currentIdentity:()=>({binding:namespace?{accountId:namespace}:null}),subscribe:accountRuntime.subscribe,
  setAccountAccessBlocked:value=>effects.push('blocked:'+value),async flush(){await options.flush?.();},
  async reset(expected){assert.equal(expected,namespace);effects.push('reset:'+expected);namespace=null;for(const fn of subscribers)fn();return true;}};
 const runtime=createDeletionRuntime({secure:storage,sessions,accountRuntime,appStore,
  syncRuntime:{stop(){},async idle(){await options.idle?.();},onAccountState(){}},
  randomProof:()=> 'p'.repeat(43),fingerprint:async id=>'fingerprint-'+id,
  activeStatus:async token=>options.activeStatus?options.activeStatus(token):true,
  refresh:async value=>options.refresh?options.refresh(value):value,
  call:async(name,body,token)=>{calls.push({name,body,token});return options.call?options.call(name,body,token):{deadline:'2026-11-19T00:00:00Z'};}
 });
 return {runtime,storage,effects,calls,sessions,switch(id){namespace=id;actor={kind:'accountBound',session:session(id),householdId:'household'};for(const fn of subscribers)fn();},actor:()=>actor};
}
for(const stage of ['idle','flush','response'])test('request cannot sign out replacement account at '+stage,async()=>{
 const wait=deferred(),started=deferred();
 const stop=async()=>{started.resolve();await wait.promise;};
 const h=harness({[stage]:stop,call:stage==='response'?async()=>{await stop();return {deadline:'2026-11-19T00:00:00Z'};}:undefined});
 const request=h.runtime.request();await started.promise;h.switch(B);await h.sessions.write(session(B));wait.resolve();
 await assert.rejects(request,/namespace_changed/);
 assert.equal(h.actor().session.accountId,B);assert.ok(!h.effects.some(x=>x.startsWith('signout:')));
 assert.equal((await h.sessions.read(Date.now())).session.accountId,B);
 assert.ok(h.calls.every(c=>c.token===session(A).accessToken));
});
test('a timed-out request retains a durable receipt until active-account authority returns',async()=>{
 const h=harness({call:async()=>{throw new Error('network');},activeStatus:async()=>{throw new Error('network');}});
 await assert.rejects(h.runtime.request(),/network/);
 assert.equal(h.runtime.getSnapshot().kind,'unavailable');
 assert.ok(h.storage.contents()[KEY+'.'+A]);assert.ok(!h.effects.some(x=>x.startsWith('reset:')));
});
for(const status of ['restored','failed','purged'])test('late '+status+' response cannot alter another account',async()=>{
 const wait=deferred(),started=deferred();
 const h=harness({receipt:true,call:async()=>{started.resolve();await wait.promise;return {status};}});
 const checking=h.runtime.check();await started.promise;h.switch(B);await h.sessions.write(session(B));wait.resolve();await checking;
 assert.equal(h.actor().session.accountId,B);assert.ok(!h.effects.some(x=>x.startsWith('reset:')||x.startsWith('signout:')));
 assert.ok(h.storage.contents()[KEY+'.'+A],'the original private receipt is preserved');
});
test('late web receipt import is fenced and cannot replace the new namespace receipt',async()=>{
 const wait=deferred(),started=deferred();const h=harness({call:async()=>{started.resolve();await wait.promise;return {status:'pending',account_fingerprint:'fingerprint-'+A};}});
 const importing=h.runtime.importReceipt('q'.repeat(43));await started.promise;h.switch(B);
 await h.storage.setItem(KEY+'.'+B,JSON.stringify({accountId:B,proof:'b'.repeat(43)}));wait.resolve();
 await assert.rejects(importing,/namespace_changed/);
 assert.equal(JSON.parse(h.storage.contents()[KEY+'.'+B]).accountId,B);assert.equal(h.storage.contents()[KEY+'.'+A],undefined);
});
for(const status of [null,{status:'unknown'},{status:'pending'},{status:'purged',purged_at:'2026-10-14',verified_at:'2026-10-14',expires_at:'2026-10-15'}])
 test('unavailable or expired proof cannot authorize a local reset: '+JSON.stringify(status),async()=>{
  const h=harness({receipt:true,call:async()=>status});await h.runtime.check();
  assert.ok(!h.effects.some(x=>x.startsWith('reset:')));assert.ok(h.storage.contents()[KEY+'.'+A]);
 });
test('valid terminal proof removes exactly its namespace after scoped sign-out',async()=>{
 const verified=new Date(Date.now()-1000).toISOString();
 const h=harness({receipt:true,call:async()=>({status:'purged',purged_at:verified,verified_at:verified,expires_at:new Date(Date.parse(verified)+365*86400000).toISOString()})});
 await h.runtime.check();assert.equal(h.runtime.getSnapshot().kind,'purged');
 assert.ok(h.effects.includes('signout:'+A));assert.ok(h.effects.includes('reset:'+A));
 assert.equal(h.storage.contents()[KEY+'.'+A],undefined);
});
test('local reset is separately confirmed and fenced while synchronization drains',async()=>{
 const wait=deferred(),started=deferred();const h=harness({idle:async()=>{started.resolve();await wait.promise;}});
 await assert.rejects(h.runtime.resetLocalData('DELETE',A),/confirmation_required/);
 const resetting=h.runtime.resetLocalData('DELETE LOCAL DATA',A);await started.promise;h.switch(B);wait.resolve();
 await assert.rejects(resetting,/namespace_changed/);assert.ok(!h.effects.some(x=>x.startsWith('reset:')||x.startsWith('signout:')));
});
test('concurrent requests share no mutation authority',async()=>{
 const wait=deferred(),started=deferred();const h=harness({idle:async()=>{started.resolve();await wait.promise;}});
 const first=h.runtime.request();await started.promise;
 await assert.rejects(h.runtime.request(),/in_progress/);wait.resolve();await first;
 assert.equal(h.calls.filter(c=>c.name==='request-account-deletion').length,1);
});
test('account A to B to A still invalidates the original deletion operation',async()=>{
 const wait=deferred(),started=deferred();const h=harness({call:async()=>{started.resolve();await wait.promise;return {deadline:'2026-11-19T00:00:00Z'};}});
 const pending=h.runtime.request();await started.promise;h.switch(B);h.switch(A);wait.resolve();
 await assert.rejects(pending,/namespace_changed/);assert.ok(!h.effects.some(x=>x.startsWith('signout:')));
});
test('a stale durable credential cannot authorize the replacement namespace',async()=>{
 const h=harness();await h.sessions.write(session(A));h.switch(B);await h.runtime.check();
 assert.equal(h.runtime.getSnapshot().kind,'unavailable');assert.ok(!h.effects.includes('reset:'+B));
});
