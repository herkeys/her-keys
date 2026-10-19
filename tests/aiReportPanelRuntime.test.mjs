import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { registerHooks } from 'node:module';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { render } from './support/render.tsx';
import { fixture, store } from './support/talkItOutBoundary.mjs';
import { reportFixture } from './support/aiReportBoundary.mjs';
import { Button } from '../src/design/components/index.ts';
import { AppearanceProvider, useTheme } from '../src/design/theme/index.ts';
import { resetAppearance, setSystemColorScheme } from './support/rn-stub.tsx';
const stub = new URL('./support/aiReportBoundary.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/src/features/ai-safety/AiReportPanel.tsx') &&
      (specifier === 'expo-crypto' || /(?:AppStateProvider|accountRuntimeInstance)$/.test(specifier))) return next(stub, context);
  return next(specifier, context);
} });
const { AiReportPanel } = await import('../src/features/ai-safety/AiReportPanel.tsx');
const act = fn => TestRenderer.act(async () => { await fn(); });
const trees = [];
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(() => tree.unmount());
  resetAppearance();
});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function mount(preference = 'light') {
  fixture.snapshot = { identity: { binding: { accountId: 'a', householdId: 'ha', boundAt: 't1' } }, state: { household: { id: 'ha' }, discovery: null } };
  const r = await render(<AppearanceProvider initialPreference={preference}><AiReportPanel messageId="msg-7" onClose={() => {}} /></AppearanceProvider>);
  trees.push(r); return r;
}
const button = (r, label) => r.root.findAllByType(Button).find(n => n.props.label === label);
const press = (r, label) => act(() => button(r, label).props.onPress());
const text = r => JSON.stringify(r.toJSON());

for (const preference of ['light', 'dark', 'system']) {
  test('the report form offers labelled, actionable reasons in ' + preference + ' appearance', async () => {
    setSystemColorScheme('dark');
    const r = await mount(preference);
    const choices = r.root.findAllByType(Button).filter(b => b.props.accessibilityHint?.includes('report reason'));
    assert.equal(choices.length, 5);
    for (const choice of choices) assert.ok(choice.find(n => n.props.accessibilityRole === 'button').props.accessibilityLabel);
    assert.ok(button(r, 'Submit report'));
    assert.ok(button(r, 'Close report'));
    assert.match(text(r), /not conversation text/);
  });
}

test('deliberate submission selects the correct reference and reason, then confirms only acceptance', async () => {
  let call;
  reportFixture.submit = async (input, owner) => { call = { input, owner }; return 'received'; };
  const r = await mount();
  await press(r, 'Privacy concern'); await press(r, 'Submit report');
  assert.deepEqual(Object.keys(call.input).sort(), ['dedupeKey', 'messageId', 'reason']);
  assert.equal(call.input.messageId, 'msg-7'); assert.equal(call.input.reason, 'privacy');
  assert.equal(call.owner.accountId, 'a');
  assert.match(text(r), /Report submitted/);
  assert.equal(button(r, 'Submit report'), undefined);
});

test('offline failure offers retry with the same idempotency key and no false confirmation', async () => {
  const calls = [];
  reportFixture.submit = async input => { calls.push(input); return calls.length === 1 ? 'unavailable' : 'received'; };
  const r = await mount(); await press(r, 'Submit report');
  assert.match(text(r), /Could not submit/); assert.doesNotMatch(text(r), /Report submitted/);
  assert.equal(button(r, 'Submit report').props.disabled, false);
  await press(r, 'Submit report'); assert.equal(calls[0].dedupeKey, calls[1].dedupeKey);
  assert.match(text(r), /Report submitted/);
});

test('pending and completed submissions disable accidental repeat actions', async () => {
  const pending = deferred(); let calls = 0;
  reportFixture.submit = () => { calls++; return pending.promise; };
  const r = await mount(); await press(r, 'Submit report');
  assert.equal(button(r, 'Submitting…').props.disabled, true);
  assert.equal(calls, 1);
  await act(() => pending.resolve('received'));
  assert.equal(button(r, 'Submit report'), undefined);
});

test('a thrown report failure offers a retry without an unhandled rejection', async () => {
  reportFixture.submit = async () => { throw new Error('private transport detail'); };
  const r = await mount(); await press(r, 'Submit report');
  assert.match(text(r), /Could not submit/); assert.doesNotMatch(text(r), /private transport detail/);
  reportFixture.submit = async () => 'received'; await press(r, 'Submit report');
  assert.match(text(r), /Report submitted/);
});

test('rate limiting gives clear feedback without claiming receipt', async () => {
  reportFixture.submit = async () => 'rate_limited';
  const r = await mount(); await press(r, 'Submit report');
  assert.match(text(r), /report limit for today/); assert.doesNotMatch(text(r), /Report submitted/);
});

test('two taps before React renders start only one submission', async () => {
  const pending = deferred(); let calls = 0;
  reportFixture.submit = () => { calls++; return pending.promise; };
  const r = await mount(); const submit = button(r, 'Submit report').props.onPress;
  await act(() => { submit(); submit(); });
  assert.equal(calls, 1);
  await act(() => pending.resolve('received'));
});

test('an account switch before submission cannot report the old response as the replacement account', async () => {
  let calls = 0; reportFixture.submit = async () => { calls++; return 'received'; };
  const r = await mount(); const submit = button(r, 'Submit report').props.onPress;
  await act(() => { fixture.snapshot.identity.binding = { accountId: 'b', householdId: 'hb', boundAt: 't2' }; store.notify(); });
  await act(() => submit());
  assert.equal(calls, 0);
  assert.doesNotMatch(text(r), /Report submitted/);
});

for (const field of ['account', 'household', 'binding']) {
  test('a pending report cancels after ' + field + ' change and ignores late success', async () => {
    const pending = deferred(); let owner;
    reportFixture.submit = (_input, boundary) => { owner = boundary; return pending.promise; };
    const r = await mount(); await press(r, 'Submit report');
    await act(() => {
      const bound = fixture.snapshot.identity.binding;
      fixture.snapshot.identity.binding = field === 'account' ? { accountId: 'b', householdId: 'hb', boundAt: 't2' }
        : field === 'household' ? { ...bound, householdId: 'hb' } : { ...bound, boundAt: 't2' };
      store.notify();
    });
    assert.equal(owner.signal.aborted, true);
    await act(() => pending.resolve('received'));
    assert.doesNotMatch(text(r), /Report submitted/);
  });
}

test('a signed-out Free user keeps their conversation local and receives a sign-in instruction', async () => {
  let calls = 0; reportFixture.submit = async () => { calls++; return 'received'; };
  const r = await mount(); fixture.snapshot.identity.binding = null;
  await press(r, 'Submit report');
  assert.equal(calls, 0); assert.match(text(r), /Sign in to submit/);
});
