import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, describe, test } from 'node:test';
import { sdk } from './support/purchases.mjs';
import { Platform } from 'react-native';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { render } from '../support/render.tsx';

globalThis.__DEV__ = false;
process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = 'synthetic-public-sdk-key';
Platform.OS = 'android';
const stub = new URL('./support/purchases.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'react-native-purchases') return next(stub, context);
  if (specifier === 'react-native-purchases-ui') return next(new URL('./support/purchasesUi.mjs', import.meta.url).href, context);
  if (specifier === 'react-native') return next(new URL('../systems/support/rn-stub-systems.tsx', import.meta.url).href, context);
  return next(specifier, context);
} });
const client = await import('../../src/monetization/revenueCatClient.ts');
const { assessOffering } = await import('../../src/monetization/purchaseReadiness.ts');
const { RevenueCatProvider, useEntitlement } = await import('../../src/monetization/RevenueCatProvider.tsx');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const pkg = (identifier, packageType, priceString = '$0.00') => ({ identifier, packageType, product: { identifier: `${identifier}.sku`, priceString } });
// Prices here are synthetic fixtures for the structure check only; the app never hard-codes a price.
const nativeOffering = { identifier: 'default', availablePackages: [pkg('$rc_monthly', 'MONTHLY'), pkg('$rc_annual', 'ANNUAL')] };

client.configureRevenueCat();
Object.assign(client.REVENUECAT_DEADLINES, { identifyMs: 40, readMs: 40, restoreMs: 40 });

afterEach(async () => {
  Object.assign(sdk, { failLogin: false, failRestore: false, restoreWait: null, loginWait: null, logoutWait: null, identityReadWait: null, offering: null, info: { entitlements: { active: {} } } });
  Object.assign(sdk.hang, { login: false, identityRead: false, customerInfo: false, offerings: false, restore: false });
  await client.identifyRevenueCatAccount(null);
  sdk.calls.length = 0;
});

describe('offering assessment', () => {
  test('only an offering with priced native packages is ready', () => {
    assert.deepEqual(assessOffering(null), { ready: false, reason: 'no_offering' });
    assert.deepEqual(assessOffering({ identifier: 'default', availablePackages: [] }), { ready: false, reason: 'no_packages' });
    assert.deepEqual(assessOffering({ identifier: 'default', availablePackages: [pkg('$rc_monthly', 'MONTHLY', '  ')] }), { ready: false, reason: 'unpriced' });
    assert.deepEqual(assessOffering(nativeOffering), { ready: true, monthly: true, annual: true, packages: 2 });
  });

  test('a single plan is still ready and reports which plans are missing', () => {
    const monthlyOnly = { identifier: 'default', availablePackages: [pkg('$rc_monthly', 'MONTHLY')] };
    assert.deepEqual(assessOffering(monthlyOnly), { ready: true, monthly: true, annual: false, packages: 1 });
  });
});

describe('every SDK call ends', () => {
  test('a timed-out native logIn quarantines paid identity until the old SDK work actually settles', async () => {
    let resolveLogin;
    sdk.loginWait = new Promise((resolve) => { resolveLogin = resolve; });
    assert.equal(await client.identifyRevenueCatAccount(A), 'sdk_error');
    assert.equal(client.getRevenueCatIdentity().accountId, null, 'a timed-out identify never claims the account');
    sdk.loginWait = null;
    assert.equal(await client.identifyRevenueCatAccount(B), 'sdk_error',
      'a newer native mutation is refused while the timed-out one might still write SDK identity');
    assert.equal(sdk.calls.filter(([kind]) => kind === 'login').length, 1, 'no overlapping native logIns');
    resolveLogin();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sdk.id, A, 'the old SDK operation can still change native identity after its deadline');
    assert.equal(client.getRevenueCatIdentity().accountId, null, 'late native completion never republishes stale identity');
    assert.equal(await client.identifyRevenueCatAccount(B), 'identified',
      'after the native operation genuinely settles, a fresh identify can recover');
    assert.equal(sdk.id, B);
  });

  test('a timed-out native logOut cannot collide with a later account logIn', async () => {
    await client.identifyRevenueCatAccount(A);
    let resolveLogout;
    sdk.logoutWait = new Promise((resolve) => { resolveLogout = resolve; });
    assert.equal(await client.identifyRevenueCatAccount(B), 'sdk_error');
    sdk.logoutWait = null;
    assert.equal(await client.identifyRevenueCatAccount(A), 'sdk_error',
      'even the earlier account cannot purchase while an old native logout is pending');
    resolveLogout();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(client.getRevenueCatIdentity().accountId, null);
    assert.equal(await client.identifyRevenueCatAccount(A), 'identified',
      'the current account may retry after the late native logout finishes');
    assert.equal(sdk.id, A);
  });

  test('an indefinitely pending native identity read has a finite fail-closed outcome', async () => {
    await client.identifyRevenueCatAccount(A);
    sdk.hang.identityRead = true;
    assert.equal(await client.fetchActiveEntitlementIds(), null);
    assert.deepEqual(await client.restoreRevenueCatPurchases(A), { kind: 'unavailable' });
    assert.deepEqual(await client.presentRevenueCatPaywall(nativeOffering, A), { kind: 'unavailable' });
    assert.equal(sdk.calls.filter(([kind]) => kind === 'paywall').length, 0,
      'identity uncertainty cannot show a purchase sheet');
    sdk.hang.identityRead = false;
    assert.equal(await client.ensureRevenueCatIdentity(), true, 'a later verified identity read recovers');
  });

  test('a readable SDK identity drift denies the stale actor and rebinds only the current account', async () => {
    assert.equal(await client.identifyRevenueCatAccount(A), 'identified');
    sdk.id = B; // Simulates an out-of-band native identity mutation that completed late.
    assert.equal(await client.fetchActiveEntitlementIds(), null,
      'the stale actor cannot read entitlements through a mismatched native account');
    assert.deepEqual(await client.presentRevenueCatPaywall(nativeOffering, A), { kind: 'unavailable' },
      'an unverified native identity cannot open a purchase sheet');
    assert.equal(sdk.calls.filter(([kind]) => kind === 'paywall').length, 0);
    assert.equal(await client.ensureRevenueCatIdentity(), true,
      'a definitive SDK mismatch may be repaired for the current desired account');
    assert.equal(sdk.id, A);
    assert.equal(client.getRevenueCatIdentity().accountId, A);
  });

  test('a native identity-read result arriving after account switch cannot certify stale readiness', async () => {
    assert.equal(await client.identifyRevenueCatAccount(A), 'identified');
    let releaseRead;
    sdk.identityReadWait = new Promise((resolve) => { releaseRead = resolve; });
    const oldReadiness = client.ensureRevenueCatIdentity();
    await new Promise((resolve) => setImmediate(resolve));
    const switchToB = client.identifyRevenueCatAccount(B); // Invalidates published A immediately.
    sdk.identityReadWait = null;
    releaseRead();
    assert.equal(await oldReadiness, false, 'a read started under A cannot authorize after B is desired');
    assert.equal(await switchToB, 'identified');
    assert.equal(sdk.id, B);
    assert.equal(client.getRevenueCatIdentity().accountId, B);
  });

  test('an unreadable SDK ID never starts a second native identity mutation', async () => {
    assert.equal(await client.identifyRevenueCatAccount(A), 'identified');
    const loginsBefore = sdk.calls.filter(([kind]) => kind === 'login').length;
    sdk.hang.identityRead = true;
    assert.equal(await client.ensureRevenueCatIdentity(), false);
    assert.equal(sdk.calls.filter(([kind]) => kind === 'login').length, loginsBefore,
      'unknown identity is not permission to log in again');
    sdk.hang.identityRead = false;
    assert.equal(await client.ensureRevenueCatIdentity(), true, 'the queue can recover when reads resume');
  });

  test('customer info, offerings and restore each resolve to the safe fallback', async () => {
    await client.identifyRevenueCatAccount(A);
    sdk.hang.customerInfo = true;
    assert.equal(await client.fetchActiveEntitlementIds(), null);
    sdk.hang.offerings = true;
    assert.equal(await client.fetchCurrentOffering(), null);
    sdk.hang.restore = true;
    assert.deepEqual(await client.restoreRevenueCatPurchases(A), { kind: 'unavailable' });
  });
});

describe('purchase readiness never blocks Free and never uses the wrong identity', () => {
  test('ensureRevenueCatIdentity retries a bind-time failure, then succeeds', async () => {
    sdk.failLogin = true;
    assert.equal(await client.identifyRevenueCatAccount(A), 'sdk_error');
    assert.equal(await client.ensureRevenueCatIdentity(), false, 'still failing: not ready');
    sdk.failLogin = false;
    assert.equal(await client.ensureRevenueCatIdentity(), true);
    assert.equal(client.getRevenueCatIdentity().accountId, A);
  });

  test('signed out is never ready, and a switch retargets the retry to the new account', async () => {
    assert.equal(await client.ensureRevenueCatIdentity(), false);
    await client.identifyRevenueCatAccount(A);
    sdk.failLogin = true;
    await client.identifyRevenueCatAccount(B);
    sdk.failLogin = false;
    assert.equal(await client.ensureRevenueCatIdentity(), true);
    assert.equal(client.getRevenueCatIdentity().accountId, B, 'the retry follows the CURRENT account, not A');
    await client.identifyRevenueCatAccount(null);
    assert.equal(await client.ensureRevenueCatIdentity(), false);
  });

  async function mount() {
    let value;
    function Probe() { value = useEntitlement(); return null; }
    const view = await render(<RevenueCatProvider><Probe /></RevenueCatProvider>);
    return { view, get api() { return value; } };
  }

  test('paywall: identity failure and a missing native offering are worded outcomes with no store sheet', async () => {
    sdk.failLogin = true;
    await client.identifyRevenueCatAccount(A);
    const h = await mount();
    try {
      let outcome;
      await TestRenderer.act(async () => { outcome = await h.api.presentPaywall('onboarding_complete'); });
      assert.deepEqual(outcome, { kind: 'unavailable' });
      sdk.failLogin = false;
      sdk.offering = { identifier: 'default', availablePackages: [] };
      await TestRenderer.act(async () => { outcome = await h.api.presentPaywall('onboarding_complete'); });
      assert.deepEqual(outcome, { kind: 'no_offering' });
      assert.equal(sdk.calls.filter(([kind]) => kind === 'paywall').length, 0, 'nothing was offered');
    } finally {
      await TestRenderer.act(async () => { h.view.unmount(); });
    }
  });

  test('paywall: ready identity and a priced native offering present exactly once, for the signed-in account', async () => {
    sdk.offering = nativeOffering;
    await client.identifyRevenueCatAccount(A);
    const h = await mount();
    try {
      let outcome;
      await TestRenderer.act(async () => { outcome = await h.api.presentPaywall('onboarding_complete'); });
      assert.deepEqual(outcome, { kind: 'cancelled' }, 'cancelling the store sheet is not an error');
      assert.deepEqual(sdk.calls.filter(([kind]) => kind === 'paywall'), [['paywall', A]]);
    } finally {
      await TestRenderer.act(async () => { h.view.unmount(); });
    }
  });

  test('paywall: an offering that hangs cannot freeze the caller', async () => {
    await client.identifyRevenueCatAccount(A);
    sdk.hang.offerings = true;
    const h = await mount();
    try {
      let outcome;
      await TestRenderer.act(async () => { outcome = await h.api.presentPaywall('onboarding_complete'); });
      assert.deepEqual(outcome, { kind: 'no_offering' });
    } finally {
      await TestRenderer.act(async () => { h.view.unmount(); });
    }
  });
});
