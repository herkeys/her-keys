import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform } from 'react-native';
import { fixture } from './support/restoreRoute.mjs';
import { render } from '../support/render.tsx';
import { canOpenScreen } from '../../src/domain/routeAccess.ts';
import { onboardedState } from '../support/fixtures.mjs';

const stub = new URL('./support/restoreRoute.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (/\/(AccountProvider|RevenueCatProvider|accountRuntimeInstance|deletionRuntimeInstance|WelcomeAuthFlow)$/.test(specifier) || specifier === 'expo-router') return next(stub, context);
  return next(specifier, context);
} });
const { default: AccountScreen } = await import('../../app/sign-in.tsx');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const bound = (id) => ({ kind: 'accountBound', session: { accountId: id }, householdId: 'household-a' });
const text = (r) => r.root.findAllByType('Text').map((node) => node.props.children).flat().join(' ');
const button = (r, label) => r.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
const act = async (f) => TestRenderer.act(async () => { await f(); });
const account = (id = A) => ({ state: bound(id), available: true, busy: false, signIn: async () => {}, signOut: async () => {} });

for (const platform of ['android', 'ios']) {
  test(`B2B-N02 ${platform}: persistent account restore is reachable after onboarding and reports each outcome`, async () => {
    const previous = Platform.OS;
    Platform.OS = platform;
    try {
      for (const [outcome, message] of [
        [{ kind: 'restored' }, /purchase was restored/],
        [{ kind: 'no_purchases_found' }, /No Premium purchase/],
        [{ kind: 'unavailable' }, /Reconnect your account/],
        [{ kind: 'error', message: 'private SDK detail' }, /couldn’t be restored/],
      ]) {
        const calls = [];
        fixture.account = account();
        fixture.entitlement = { restore: async (id) => { calls.push(id); return outcome; } };
        assert.equal(canOpenScreen('sign-in', { status: 'ready', accountSettled: true, account: fixture.account.state, internalTools: false, onboarding: onboardedState().onboarding }), true);
        const r = await render(<AccountScreen />);
        try {
          assert.ok(button(r, 'Restore purchases'));
          await act(() => button(r, 'Restore purchases').props.onPress());
          assert.deepEqual(calls, [A]);
          assert.match(text(r), message);
          assert.doesNotMatch(text(r), /private SDK detail/);
          assert.equal(button(r, 'Done').props.disabled, false, 'free app remains reachable');
          assert.equal(button(r, 'Restore purchases').props.disabled, false, 'retry is available');
        } finally { await act(() => r.unmount()); }
      }
    } finally { Platform.OS = previous; }
  });
}

test('B2B-N02: a pending restore is single-flight, disables contradictory actions, and ignores another account’s late result', async () => {
  let settle;
  const calls = [];
  fixture.account = account();
  fixture.entitlement = { restore: (id) => { calls.push(id); return new Promise((resolve) => { settle = resolve; }); } };
  const r = await render(<AccountScreen />);
  try {
    const restore = button(r, 'Restore purchases').props.onPress;
    await act(() => { restore(); restore(); });
    assert.deepEqual(calls, [A]);
    assert.equal(button(r, 'Restoring purchases…').props.disabled, true);
    assert.equal(button(r, 'Sign out').props.disabled, true);
    assert.equal(button(r, 'Done').props.disabled, true);
    assert.equal(button(r, 'Privacy & Data').props.disabled, true, 'deletion entry is held during restore');
    fixture.account = account(B);
    await act(() => r.update(<AccountScreen />));
    await act(() => settle({ kind: 'restored' }));
    assert.doesNotMatch(text(r), /purchase was restored/);
    assert.equal(button(r, 'Restore purchases').props.disabled, false);
  } finally { await act(() => r.unmount()); }
});

test('V2 integration: Account mounts one Restore Purchases control and reaches Privacy & Data without a second restore mount', async () => {
  fixture.account = account();
  fixture.entitlement = { restore: async () => ({ kind: 'no_purchases_found' }) };
  const r = await render(<AccountScreen />);
  try {
    const restoreButtons = () => r.root.findAllByType('Pressable').filter((node) => node.props.accessibilityLabel === 'Restore purchases');
    assert.equal(restoreButtons().length, 1);
    await act(() => button(r, 'Privacy & Data').props.onPress());
    assert.match(text(r), /Delete Account/);
    assert.equal(restoreButtons().length, 0);
    await act(() => button(r, 'Back to Your Account').props.onPress());
    assert.equal(restoreButtons().length, 1);
  } finally { await act(() => r.unmount()); }
});

test('B2B-N02: throwing restore is recoverable and unmount never reports success to a new screen', async () => {
  fixture.account = account();
  fixture.entitlement = { restore: async () => { throw new Error('offline'); } };
  const r = await render(<AccountScreen />);
  await act(() => button(r, 'Restore purchases').props.onPress());
  assert.match(text(r), /couldn’t be restored/);
  assert.equal(button(r, 'Done').props.disabled, false);
  await act(() => r.unmount());
  let settle;
  fixture.entitlement = { restore: () => new Promise((resolve) => { settle = resolve; }) };
  const pending = await render(<AccountScreen />);
  await act(() => button(pending, 'Restore purchases').props.onPress());
  await act(() => pending.unmount());
  await act(() => settle({ kind: 'restored' }));
});

test('B2B-N02: reconnect, quarantine and busy account states cannot initiate restoration', async () => {
  let calls = 0;
  fixture.entitlement = { restore: async () => { calls++; return { kind: 'restored' }; } };
  for (const state of [
    { kind: 'authDegraded', accountId: A, householdId: 'household-a', reason: 'expired' },
    { kind: 'boundOther', session: { accountId: B }, quarantinedAccountId: A },
    { kind: 'unauthenticated' },
  ]) {
    fixture.account = { ...account(), state };
    const r = await render(<AccountScreen />);
    assert.equal(button(r, 'Restore purchases'), undefined);
    await act(() => r.unmount());
  }
  fixture.account = { ...account(), busy: true };
  const r = await render(<AccountScreen />);
  assert.equal(button(r, 'Restore purchases').props.disabled, true);
  await act(() => button(r, 'Restore purchases').props.onPress());
  assert.equal(calls, 0);
  await act(() => r.unmount());
});
