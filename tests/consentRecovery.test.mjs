/**
 * SC-05 — the consent gate fails closed AND recovers: Try again, Sign out, bounded waits, and one account's decision never
 * leaks to another.
 *
 * The gate is the real component; only the ledger (network), the account context and the notification provider are scripted.
 * Nothing here proves a live Supabase read: that stays NOT RUN until the engineering build is on a device.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mock, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform } from 'react-native';
import { fixture } from './support/consentGate/stubs.mjs';
import { render } from './support/render.tsx';
import { HER_KEYS_CONSENT_VERSIONS } from '../src/domain/consent.ts';

const stub = new URL('./support/consentGate/stubs.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (/\/(consentBackend|AccountProvider|LocalNotificationProvider)$/.test(specifier)) return next(stub, context);
  return next(specifier, context);
} });
const { ConsentGate, CONSENT_READ_TIMEOUT_MS } = await import('../src/features/consent/ConsentFlow.tsx');
const { Text } = await import('react-native');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const sessionOf = (accountId, accessToken = 'token-1') => ({ accountId, accessToken, refreshToken: 'refresh-1', expiresAt: '2099-01-01T00:00:00.000Z', provider: 'password' });
const receipts = (aiGranted = false) => [
  ...['terms', 'privacy', 'age18'].map((type) => ({ consent_type: type, policy_version: HER_KEYS_CONSENT_VERSIONS[type], granted: true, recorded_at: '2026-10-01T00:00:00.000Z' })),
  { consent_type: 'ai_processing', policy_version: HER_KEYS_CONSENT_VERSIONS.ai_processing, granted: aiGranted, recorded_at: '2026-10-01T00:00:00.000Z' },
];
const consented = { kind: 'ok', receipts: receipts() };
const offline = { kind: 'unavailable' };

const App = () => <Text>APP-IS-OPEN</Text>;
const gate = (session) => <ConsentGate session={session}><App /></ConsentGate>;
const text = (r) => r.root.findAllByType('Text').map((node) => [node.props.children].flat(Infinity).join('')).join(' | ');
const appOpen = (r) => /APP-IS-OPEN/.test(text(r));
const button = (r, label) => r.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
const act = async (f) => TestRenderer.act(async () => { await f(); });
const settle = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const reset = () => { Object.assign(fixture, { reads: [], read: async () => offline, record: async () => offline, signOutCalls: 0, signOut: async () => {} }); };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

for (const platform of ['android', 'ios']) {
  test(`SC-05 ${platform}: unreadable consent keeps the app closed and offers Try again and Sign out`, async () => {
    const previous = Platform.OS;
    Platform.OS = platform;
    reset();
    try {
      const r = await render(gate(sessionOf(A)));
      await settle();
      assert.equal(appOpen(r), false, 'fail closed');
      assert.match(text(r), /could not verify your account/);
      assert.ok(button(r, 'Try again'));
      assert.ok(button(r, 'Sign out'));
      assert.equal(button(r, 'Try again').props.disabled, false);
      assert.equal(button(r, 'Sign out').props.disabled, false);
      assert.doesNotMatch(text(r), /reopen Her Keys/, 'the old dead-end instruction is gone');
      await act(() => r.unmount());
    } finally { Platform.OS = previous; }
  });
}

test('SC-05: Try again recovers once the network is back and only then opens the app', async () => {
  reset();
  const r = await render(gate(sessionOf(A)));
  await settle();
  assert.equal(appOpen(r), false);
  fixture.read = async () => consented;
  await act(() => button(r, 'Try again').props.onPress());
  await settle();
  assert.equal(appOpen(r), true, 'consent was confirmed by the ledger');
  assert.equal(fixture.reads.length, 2);
  await act(() => r.unmount());
});

test('SC-05: Try again that fails again stays closed, says so, and can be repeated', async () => {
  reset();
  const r = await render(gate(sessionOf(A)));
  await settle();
  assert.doesNotMatch(text(r), /still couldn’t reach/, 'no failed retry yet');
  await act(() => button(r, 'Try again').props.onPress());
  await settle();
  assert.equal(appOpen(r), false);
  assert.match(text(r), /still couldn’t reach your account/);
  assert.ok(button(r, 'Try again') && button(r, 'Sign out'), 'recovery stays available');
  fixture.read = async () => consented;
  await act(() => button(r, 'Try again').props.onPress());
  await settle();
  assert.equal(appOpen(r), true);
  await act(() => r.unmount());
});

test('SC-05: a double press of Try again makes one read, and a read that throws is a failure, not a hang', async () => {
  reset();
  const r = await render(gate(sessionOf(A)));
  await settle();
  const press = button(r, 'Try again').props.onPress;
  fixture.read = async () => { throw new Error('socket hang up'); };
  await act(() => { press(); press(); });
  await settle();
  assert.equal(fixture.reads.length, 2, 'one initial read and exactly one retry');
  assert.equal(appOpen(r), false);
  assert.ok(button(r, 'Try again'), 'a thrown read lands on the recoverable error screen');
  await act(() => r.unmount());
});

test('SC-05: an account that has not consented never reaches the app, and a consenting one does', async () => {
  reset();
  fixture.read = async () => ({ kind: 'ok', receipts: [] });
  const none = await render(gate(sessionOf(A)));
  await settle();
  assert.equal(appOpen(none), false);
  assert.match(text(none), /before we begin/i);
  await act(() => none.unmount());

  fixture.read = async () => ({ kind: 'ok', receipts: receipts(true) });
  const yes = await render(gate(sessionOf(A)));
  await settle();
  assert.equal(appOpen(yes), true);
  await act(() => yes.unmount());
});

test('SC-05: Sign out is single-flight, disables the pair while pending and never opens the app', async () => {
  reset();
  const pending = deferred();
  fixture.signOut = () => pending.promise;
  const r = await render(gate(sessionOf(A)));
  await settle();
  const press = button(r, 'Sign out').props.onPress;
  await act(() => { press(); press(); });
  assert.equal(fixture.signOutCalls, 1, 'one sign-out request');
  assert.equal(button(r, 'Signing out…').props.disabled, true);
  assert.equal(button(r, 'Try again').props.disabled, true);
  assert.equal(appOpen(r), false);
  await act(async () => pending.resolve());
  await settle();
  assert.equal(appOpen(r), false, 'signing out never grants access');
  assert.equal(button(r, 'Sign out').props.disabled, false, 'still mounted (the parent unmounts it on sign-out): controls are live again');
  await act(() => r.unmount());
});

test('SC-05: a sign-out that fails does not crash the gate, leaves the app closed and gives the controls back', async () => {
  reset();
  fixture.signOut = async () => { throw new Error('keychain unavailable'); };
  const r = await render(gate(sessionOf(A)));
  await settle();
  await act(() => button(r, 'Sign out').props.onPress());
  await settle();
  assert.equal(appOpen(r), false);
  assert.equal(button(r, 'Sign out').props.disabled, false);
  assert.equal(button(r, 'Try again').props.disabled, false);
  await act(() => r.unmount());
});

test('SC-05: a hung consent read is bounded: it becomes the recoverable error screen', async () => {
  reset();
  fixture.read = () => new Promise(() => {});
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = await render(gate(sessionOf(A)));
    assert.match(text(r), /Checking your account setup/);
    assert.equal(appOpen(r), false);
    await act(async () => { mock.timers.tick(CONSENT_READ_TIMEOUT_MS); });
    await act(async () => { await Promise.resolve(); });
    assert.match(text(r), /could not verify your account/);
    assert.ok(button(r, 'Try again') && button(r, 'Sign out'));
    assert.equal(appOpen(r), false);
    await act(() => r.unmount());
  } finally { mock.timers.reset(); }
});

test('SC-05 session ownership: a token rotation never re-checks consent or unmounts the open app', async () => {
  reset();
  fixture.read = async () => consented;
  const r = await render(gate(sessionOf(A, 'token-1')));
  await settle();
  assert.equal(appOpen(r), true);
  await act(() => r.update(gate(sessionOf(A, 'token-2'))));
  await settle();
  assert.equal(appOpen(r), true, 'the app stayed mounted through the rotation');
  assert.equal(fixture.reads.length, 1, 'and consent was not re-read');
  await act(() => r.unmount());
});

test('SC-05 session ownership: Try again uses the freshest tokens, not the ones the gate first saw', async () => {
  reset();
  const r = await render(gate(sessionOf(A, 'token-1')));
  await settle();
  await act(() => r.update(gate(sessionOf(A, 'token-2'))));
  fixture.read = async () => consented;
  await act(() => button(r, 'Try again').props.onPress());
  await settle();
  assert.equal(fixture.reads.at(-1).accessToken, 'token-2');
  assert.equal(appOpen(r), true);
  await act(() => r.unmount());
});

test('SC-05 session ownership: another account never inherits the first account’s decision', async () => {
  reset();
  fixture.read = async (session) => (session.accountId === A ? consented : offline);
  const r = await render(gate(sessionOf(A)));
  await settle();
  assert.equal(appOpen(r), true);
  await act(() => r.update(gate(sessionOf(B))));
  assert.equal(appOpen(r), false, 'closed at once, before B has been read');
  await settle();
  assert.equal(appOpen(r), false, 'and still closed when B cannot be confirmed');
  assert.ok(button(r, 'Try again'));
  assert.equal(fixture.reads.at(-1).accountId, B);
  await act(() => r.unmount());
});

test('SC-05 session ownership: the app is never RENDERED for a new account before that account is confirmed (no one-frame leak)', async () => {
  reset();
  fixture.read = async (session) => (session.accountId === A ? consented : offline);
  let accountNow = A;
  const rendered = [];
  const Spy = () => { rendered.push(accountNow); return <Text>APP-IS-OPEN</Text>; };
  const withSpy = (session) => <ConsentGate session={session}><Spy /></ConsentGate>;
  const r = await render(withSpy(sessionOf(A)));
  await settle();
  assert.deepEqual([...new Set(rendered)], [A], 'the app rendered for A once A was confirmed');
  accountNow = B;
  await act(() => r.update(withSpy(sessionOf(B))));
  await settle();
  assert.equal(rendered.includes(B), false, 'not a single render of the app happened under account B');
  await act(() => r.unmount());
});

test('SC-05 session ownership: a late answer for the previous account is ignored', async () => {
  reset();
  const lateA = deferred();
  fixture.read = (session) => (session.accountId === A ? lateA.promise : Promise.resolve(offline));
  const r = await render(gate(sessionOf(A)));
  await act(() => r.update(gate(sessionOf(B))));
  await settle();
  assert.match(text(r), /could not verify your account/);
  await act(async () => lateA.resolve(consented));
  await settle();
  assert.equal(appOpen(r), false, 'A’s late "consented" never opens the app for B');
  await act(() => r.unmount());
});
