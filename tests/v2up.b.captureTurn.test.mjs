/**
 * V2UP-B - a capture that is being read must (1) say so, (2) never swallow a second message, and (3) never land in another account.
 *
 * The conversation turn was already fenced against an account switch (tests/talkItOutAccountFence.test.mjs). The CAPTURE turn, which is
 * the longer one when Her Keys Premium's reader is on the other end of a network call, was not: when the household changed hands while
 * it waited, her words were added to the replacement household's conversation as a message, with a capture reference to a household
 * that does not hold it. It also left the screen silent for the whole wait, and a second message sent in that window returned
 * "ignored" after the composer had already cleared it, so what she typed was lost.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { render } from './support/render.tsx';
import { fixture, store } from './support/v2upCaptureBoundary.mjs';

const stub = new URL('./support/v2upCaptureBoundary.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/src/store/TalkItOutContext.tsx') && /(?:AppStateProvider|accountRuntimeInstance|capture\/CaptureContext)$/.test(specifier)) return next(stub, context);
    if (context.parentURL?.endsWith('/src/features/talk-it-out/TalkItOutView.tsx') && /(?:expo-router|CaptureCards|AiReportPanel)$/.test(specifier)) return next(stub, context);
    return next(specifier, context);
  },
});
const { TalkItOutProvider, useTalkItOut } = await import('../src/store/TalkItOutContext.tsx');
const { TalkItOutView } = await import('../src/features/talk-it-out/TalkItOutView.tsx');

let view;
function Probe() {
  view = useTalkItOut();
  return null;
}
const act = async (fn) => TestRenderer.act(async () => { await fn(); });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const captured = (captureId) => ({ kind: 'captured', captureId, readingIds: ['r1'], duplicate: false, failure: null, unsupported: [] });
const WORDS = 'CANARY-ZEBRA-7731 dentist friday at 3pm';

function reset() {
  fixture.snapshot = { identity: { binding: { accountId: 'a', householdId: 'ha', boundAt: 't1' } }, state: { household: { id: 'ha' }, discovery: null } };
  fixture.writes = 0;
  fixture.submits = [];
  fixture.submit = async () => captured('cap-a');
}
const allText = () => JSON.stringify(view.messages);

test('while a capture is being read the conversation says it is working, and the capture is shown once it is read', async () => {
  reset();
  const pending = deferred();
  fixture.submit = () => pending.promise;
  const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  let sent;
  await act(() => { sent = view.sendMessage(WORDS); });
  assert.equal(view.isThinking, true, 'the composer and quick replies are held, and the screen shows it is working');
  assert.equal(view.captures.length, 0, 'nothing is shown as understood yet');
  await act(async () => { pending.resolve(captured('cap-a')); assert.equal(await sent, 'sent'); });
  assert.equal(view.isThinking, false);
  assert.deepEqual(view.captures.map((c) => c.captureId), ['cap-a']);
  assert.ok(view.messages.some((m) => m.speaker === 'user' && m.text === WORDS), 'her message is shown once it was taken');
  await act(() => r.unmount());
});

test('a second message while the first is being read is NOT taken, and says so (busy) so the composer gives it back', async () => {
  reset();
  const pending = deferred();
  fixture.submit = () => pending.promise;
  const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  let first;
  await act(() => { first = view.sendMessage(WORDS); });
  let second;
  await act(async () => { second = await view.sendMessage('call the plumber tomorrow'); });
  assert.equal(second, 'busy', 'not "ignored": ignored means there was nothing to keep');
  assert.equal(fixture.submits.length, 1, 'only the first was submitted');
  await act(async () => { pending.resolve(captured('cap-a')); await first; });
  assert.deepEqual(view.captures.map((c) => c.captureId), ['cap-a']);
  assert.ok(!allText().includes('plumber'), 'the second message was never added to the conversation');
  await act(() => r.unmount());
});

test('empty input is still "ignored": there is nothing to give back', async () => {
  reset();
  const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  await act(async () => { assert.equal(await view.sendMessage('   '), 'ignored'); });
  assert.equal(fixture.submits.length, 0);
  await act(() => r.unmount());
});

test('a save that could not be made still gives her words back, and the screen stops working', async () => {
  reset();
  fixture.submit = async () => ({ kind: 'not-saved' });
  const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  await act(async () => { assert.equal(await view.sendMessage(WORDS), 'not-saved'); });
  assert.equal(view.isThinking, false);
  assert.equal(view.captures.length, 0);
  assert.ok(!allText().includes('CANARY'));
  await act(() => r.unmount());
});

for (const scenario of ['account-switch', 'household-switch', 'rebind', 'unmount']) {
  test(`a capture that finishes after ${scenario} adds nothing to the replacement conversation: no message, no capture, none of her words`, async () => {
    reset();
    const pending = deferred();
    fixture.submit = () => pending.promise;
    const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
    let sent;
    await act(() => { sent = view.sendMessage(WORDS); });
    assert.equal(view.isThinking, true);
    await act(() => {
      if (scenario === 'unmount') r.unmount();
      if (scenario === 'account-switch') fixture.snapshot.identity.binding = { accountId: 'b', householdId: 'hb', boundAt: 't2' };
      if (scenario === 'household-switch') fixture.snapshot.state.household = { id: 'other-household' };
      if (scenario === 'rebind') fixture.snapshot.identity.binding = { ...fixture.snapshot.identity.binding, boundAt: 't2' };
      if (scenario !== 'unmount') store.notify();
    });
    if (scenario !== 'unmount') {
      assert.equal(view.isThinking, false, 'the replacement household is not shown as busy with the old one\'s work');
      assert.equal(view.captures.length, 0);
    }
    await act(async () => { pending.resolve(captured('cap-a')); await sent; });
    if (scenario !== 'unmount') {
      assert.deepEqual(view.captures, [], 'no capture reference to a household that does not hold it');
      assert.ok(!allText().includes('CANARY') && !allText().includes('dentist'), 'none of her words reached the new household\'s conversation');
      assert.equal(view.isThinking, false);
      await act(() => r.unmount());
    }
    assert.equal(fixture.writes, 0);
  });
}

test('after the switch the new household can send its own message normally', async () => {
  reset();
  const pending = deferred();
  fixture.submit = () => pending.promise;
  const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  let first;
  await act(() => { first = view.sendMessage(WORDS); });
  await act(() => { fixture.snapshot.identity.binding = { accountId: 'b', householdId: 'hb', boundAt: 't2' }; store.notify(); });
  fixture.submit = async () => captured('cap-b');
  await act(async () => { assert.equal(await view.sendMessage('renew the library card friday'), 'sent'); });
  assert.deepEqual(view.captures.map((c) => c.captureId), ['cap-b']);
  await act(async () => { pending.resolve(captured('cap-a')); await first; });
  assert.deepEqual(view.captures.map((c) => c.captureId), ['cap-b'], 'the late answer for the old household changed nothing');
  assert.ok(!allText().includes('CANARY'));
  await act(() => r.unmount());
});

// ---------------------------------------------------------------------------------------------- the reset window

const resetHousehold = () => {
  // A reset builds a NEW household object with the SAME id, and forgets the binding.
  fixture.snapshot = { identity: { binding: null }, state: { household: { id: 'ha' }, discovery: null } };
  store.notify();
};

test('a send that lands while the household is reset writes nothing, gives her words back, and is not shown as a message', async () => {
  reset();
  const pending = deferred();
  fixture.submit = () => pending.promise;
  const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  const before = view.householdRevision;
  let sent;
  await act(() => { sent = view.sendMessage(WORDS); });
  await act(() => resetHousehold());
  assert.equal(view.householdRevision, before + 1, 'the composer is told the household changed, so it lets go of what it held');
  assert.equal(view.isThinking, false);
  let result;
  await act(async () => { pending.resolve({ kind: 'not-saved' }); result = await sent; });
  assert.equal(result, 'not-saved', 'the coordinator refused to write, so the words go back to the composer');
  assert.deepEqual(view.captures, []);
  assert.ok(!allText().includes('CANARY'), 'and they are not in the new conversation');
  assert.equal(fixture.writes, 0);
  await act(() => r.unmount());
});

test('a send that finishes after a switch to ANOTHER ACCOUNT is not handed back: its words belonged to the account that is gone', async () => {
  reset();
  const pending = deferred();
  fixture.submit = () => pending.promise;
  const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  let sent;
  await act(() => { sent = view.sendMessage(WORDS); });
  await act(() => { fixture.snapshot.identity.binding = { accountId: 'b', householdId: 'hb', boundAt: 't2' }; store.notify(); });
  let result;
  await act(async () => { pending.resolve({ kind: 'not-saved' }); result = await sent; });
  assert.equal(result, 'sent', 'not "not-saved": the composer must not put account A\'s words in front of account B');
  assert.ok(!allText().includes('CANARY'));
  await act(() => r.unmount());
});

test('a send tapped while the store has no household (mid-reset, not yet hydrated) writes nothing and keeps her words', async () => {
  reset();
  fixture.snapshot = { identity: { binding: null }, state: null };
  fixture.submit = async () => ({ kind: 'not-saved' });
  const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  await act(async () => { assert.equal(await view.sendMessage(WORDS), 'not-saved'); });
  assert.deepEqual(view.captures, []);
  assert.ok(!allText().includes('CANARY'));
  assert.equal(fixture.writes, 0);
  await act(() => r.unmount());
});

test('a send on a household that was reset BEFORE the tap is simply a send into the household she is looking at (control)', async () => {
  reset();
  const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  await act(() => resetHousehold());
  await act(async () => { assert.equal(await view.sendMessage('renew the library card friday'), 'sent'); });
  assert.deepEqual(view.captures.map((c) => c.captureId), ['cap-a']);
  await act(() => r.unmount());
});

test('the household revision does not move for anything but a change of household', async () => {
  reset();
  const r = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  const before = view.householdRevision;
  await act(async () => { assert.equal(await view.sendMessage(WORDS), 'sent'); });
  await act(() => store.notify());
  assert.equal(view.householdRevision, before);
  await act(() => r.unmount());
});

// ---------------------------------------------------------------------------------------------- the composer's draft

const field = (r) => r.root.findAllByType('TextInput')[0];
const typeInto = async (r, value) => act(() => field(r).props.onChangeText(value));

test('COMPOSER: what she typed under one household is let go when the household is reset or another account arrives', async () => {
  for (const change of ['reset', 'account-switch']) {
    reset();
    const r = await render(<TalkItOutProvider><TalkItOutView /></TalkItOutProvider>);
    await typeInto(r, WORDS);
    assert.equal(field(r).props.value, WORDS);
    await act(() => {
      if (change === 'reset') resetHousehold();
      else { fixture.snapshot.identity.binding = { accountId: 'b', householdId: 'hb', boundAt: 't2' }; store.notify(); }
    });
    assert.equal(field(r).props.value, '', `${change}: nothing she typed is left for the next household to send`);
    await act(() => r.unmount());
  }
});

test('COMPOSER: with no change of household, what she typed stays', async () => {
  reset();
  const r = await render(<TalkItOutProvider><TalkItOutView /></TalkItOutProvider>);
  await typeInto(r, WORDS);
  await act(() => store.notify());
  assert.equal(field(r).props.value, WORDS);
  await act(() => r.unmount());
});

test('COMPOSER: a send refused because the household was reset puts her words back; a send for another account does not', async () => {
  for (const [change, expected] of [['reset', WORDS], ['account-switch', '']]) {
    reset();
    const pending = deferred();
    fixture.submit = () => pending.promise;
    const r = await render(<TalkItOutProvider><TalkItOutView /></TalkItOutProvider>);
    await typeInto(r, WORDS);
    const send = r.root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === 'Send' && !p.props.disabled);
    assert.ok(send, 'Send is enabled once she has typed');
    await act(() => { void send.props.onPress(); });
    assert.equal(field(r).props.value, '', 'cleared while it is being read');
    await act(() => {
      if (change === 'reset') resetHousehold();
      else { fixture.snapshot.identity.binding = { accountId: 'b', householdId: 'hb', boundAt: 't2' }; store.notify(); }
    });
    await act(async () => { pending.resolve({ kind: 'not-saved' }); await new Promise((resolve) => setTimeout(resolve, 5)); });
    assert.equal(field(r).props.value, expected, change);
    await act(() => r.unmount());
  }
});
