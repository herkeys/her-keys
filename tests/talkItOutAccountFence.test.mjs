import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { render } from './support/render.tsx';
import { fixture, store } from './support/talkItOutBoundary.mjs';
const stub = new URL('./support/talkItOutBoundary.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/src/store/TalkItOutContext.tsx') &&
      /(?:AppStateProvider|accountRuntimeInstance|capture\/CaptureContext)$/.test(specifier)) return next(stub, context);
  return next(specifier, context);
} });
const { TalkItOutProvider, useTalkItOut } = await import('../src/store/TalkItOutContext.tsx');
let view;
function Probe() { view = useTalkItOut(); return null; }
const act = async fn => TestRenderer.act(async () => { await fn(); });
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve}; };
function reset() {
  fixture.snapshot = { identity: { binding: { accountId:'a',householdId:'ha',boundAt:'t1' } }, state:{household:{id:'ha'},discovery:null} };
  fixture.writes=0;
}
for (const outcome of ['ready','unavailable']) for (const scenario of ['unmount', 'account-switch', 'household-switch', 'rebind']) {
  test('late ' + outcome + ' Talk It Out turn cannot write after ' + scenario, async () => {
    reset();
    const pending=deferred(); fixture.call=()=>pending.promise;
    const r=await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
    let sent;
    await act(() => {sent=view.sendMessage('I do not know where to start.');});
    if(scenario==='unmount') await act(()=>r.unmount());
    if(scenario==='account-switch') fixture.snapshot.identity.binding={accountId:'b',householdId:'hb',boundAt:'t2'};
    if(scenario==='household-switch') fixture.snapshot.state.household={id:'other-household'};
    if(scenario==='rebind') fixture.snapshot.identity.binding={...fixture.snapshot.identity.binding,boundAt:'t2'};
    await act(async()=>{pending.resolve(outcome==='ready'?{kind:'ready',value:{messages:[],state:{topicId:null,stage:'listening',hypothesis:null,evidence:[],pendingQuestion:null,result:null},quickReplies:[]}}:{kind:'unavailable',reason:'synthetic'}); await sent;});
    assert.equal(fixture.writes,0,'stale provider completion must never dispatch into a replacement household');
    if(scenario!=='unmount') await act(()=>r.unmount());
  });
}
test('a current owner still receives the Free local fallback',async()=>{
  reset(); fixture.call=async()=>({kind:'unavailable',reason:'synthetic'});
  const r=await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  await act(()=>view.sendMessage('I do not know where to start.'));
  assert.equal(fixture.writes,1);
  assert.ok(view.serviceNotice);
  await act(()=>r.unmount());
});
test('an ownership change invalidates retry text and an in-flight turn even if the first account returns',async()=>{
  reset(); fixture.call=async()=>({kind:'unavailable',reason:'synthetic'});
  const r=await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  await act(()=>view.sendMessage('I do not know where to start.'));
  assert.equal(view.canRetry,true);
  const pending=deferred(); fixture.call=()=>pending.promise;
  await act(()=>view.retryLastTurn());
  const original=fixture.snapshot.identity.binding;
  await act(()=>{fixture.snapshot.identity.binding={accountId:'b',householdId:'hb',boundAt:'t2'};store.notify();});
  assert.equal(view.canRetry,false);assert.equal(view.isThinking,false);
  await act(()=>{fixture.snapshot.identity.binding=original;store.notify();});
  await act(()=>pending.resolve({kind:'ready',value:{messages:[],state:{},quickReplies:[]}}));
  assert.equal(fixture.writes,1,'the completed fallback is the only write; the old retry is discarded');
  await act(()=>r.unmount());
});

