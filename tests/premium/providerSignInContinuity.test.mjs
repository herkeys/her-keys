/**
 * AE2E-D03 (Android emulator, 2026-10-21): PremiumStateProvider keyed its whole consumer subtree — which is the root navigator and so
 * the welcome flow — on the account-state KIND while unbound. Every sign-in transition therefore remounted the app: tapping
 * "Create account" returned her to Welcome instead of showing "check your email", and the code screen and an in-flight provider
 * sign-in were discarded the same way. Only an actor/household change may reset the subtree.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import React, { useEffect, useState } from 'react';
import TestRenderer from 'react-test-renderer';
import { render } from '../support/render.tsx';

const stub = new URL('../support/premium/stubs.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (/\/RevenueCatProvider$/.test(specifier)) return next(stub, context);
  return next(specifier, context);
} });
const { PremiumStateProvider } = await import('../../src/monetization/PremiumStateProvider.tsx');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const session = (id) => ({ accountId: id, accessToken: 't', refreshToken: 'r', expiresAt: 0, provider: null });
const bound = (id, householdId = 'h') => ({ kind: 'accountBound', householdId, session: session(id) });
const client = {
  entitlement: async () => ({ kind: 'ok', value: { state: 'free', expiresAt: null, graceExpiresAt: null, canceled: false, needsReconcile: false, checkedAt: '' } }),
  purchaseReadiness: async () => ({ ready: false, reason: 'unavailable' }),
  manifest: async () => ({ kind: 'ok', entries: [] }),
  verify: async () => ({ kind: 'ok', status: 'reconciled' }),
  authorize: async () => ({ kind: 'unavailable' }),
};

const life = { mounts: 0 };
/** Stands for the welcome flow: its own step lives in local state, exactly as the reducer's does. */
function Flow() {
  const [step] = useState(() => `step-of-mount-${life.mounts + 1}`);
  useEffect(() => { life.mounts++; }, []);
  return React.createElement('Text', null, step);
}
const tree = (state) => React.createElement(PremiumStateProvider, { client, accountState: state }, React.createElement(Flow));
const set = (r, state) => TestRenderer.act(async () => { r.update(tree(state)); });

test('sign-in transitions while unbound keep the welcome flow mounted', async () => {
  life.mounts = 0;
  const r = await render(tree({ kind: 'unauthenticated' }));
  for (const state of [
    { kind: 'authenticating' },
    { kind: 'unauthenticated' }, // sign-up that needs email confirmation ends here
    { kind: 'authenticating' },
    { kind: 'authError', detail: 'x', recoverable: true },
    { kind: 'authenticating' },
    { kind: 'authenticatedUnbound', session: session(A) },
    { kind: 'bootstrapping', session: session(A) },
    { kind: 'claiming', session: session(A) },
  ]) {
    await set(r, state);
    assert.equal(life.mounts, 1, `${state.kind} must not remount the flow`);
  }
  assert.match(JSON.stringify(r.toJSON()), /step-of-mount-1/);
  await TestRenderer.act(async () => r.unmount());
});

test('an actor or household change still resets the subtree before it can show the previous actor', async () => {
  life.mounts = 0;
  const r = await render(tree({ kind: 'unauthenticated' }));
  await set(r, bound(A));
  assert.equal(life.mounts, 2, 'binding A resets');
  await set(r, bound(A, 'h2'));
  assert.equal(life.mounts, 3, 'a household change resets');
  await set(r, { kind: 'authDegraded', accountId: A, householdId: 'h2', reason: 'expired' });
  assert.equal(life.mounts, 4, 'leaving the bound state resets');
  await set(r, bound(B));
  assert.equal(life.mounts, 5, 'a different actor resets');
  await set(r, { kind: 'unauthenticated' });
  assert.equal(life.mounts, 6, 'signing out resets');
  await TestRenderer.act(async () => r.unmount());
});
