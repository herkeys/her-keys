import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
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
  if (specifier === 'react-native-purchases' || specifier === 'react-native-purchases-ui') return next(stub, context);
  return next(specifier, context);
} });
// purchases-ui's default differs from purchases; a separate loader uses the actual named export.
// The adapter below supplies only that default, keeping SDK calls scriptable in this process.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'react-native-purchases-ui') return next(new URL('./support/purchasesUi.mjs', import.meta.url).href, context);
  if (specifier === 'react-native') return next(new URL('../systems/support/rn-stub-systems.tsx', import.meta.url).href, context);
  return next(specifier, context);
} });
const client = await import('../../src/monetization/revenueCatClient.ts');
const { RevenueCatProvider, useEntitlement } = await import('../../src/monetization/RevenueCatProvider.tsx');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const premium = { entitlements: { active: { her_keys_plus: {} } } };
client.configureRevenueCat();

test('B2B-N02: anonymous and mismatched SDK identities never restore, open checkout, or expose entitlements', async () => {
  assert.deepEqual(await client.restoreRevenueCatPurchases(A), { kind: 'unavailable' });
  assert.equal(await client.fetchActiveEntitlementIds(), null);
  assert.deepEqual(await client.presentRevenueCatPaywall({}), { kind: 'unavailable' });
  assert.equal(sdk.calls.length, 0);
  await client.identifyRevenueCatAccount(A);
  sdk.id = B;
  assert.deepEqual(await client.restoreRevenueCatPurchases(A), { kind: 'unavailable' });
  assert.equal(await client.fetchActiveEntitlementIds(), null);
  assert.equal(sdk.calls.filter(([kind]) => kind === 'restore').length, 0);
});

for (const platform of ['android', 'ios']) {
  test(`B2B-N02 ${platform}: correct identity restores only the canonical entitlement and recovers from store errors`, async () => {
    Platform.OS = platform;
    await client.identifyRevenueCatAccount(A);
    sdk.info = premium;
    assert.deepEqual(await client.restoreRevenueCatPurchases(A), { kind: 'restored' });
    assert.deepEqual(await client.fetchActiveEntitlementIds(), ['her_keys_plus']);
    sdk.info = { entitlements: { active: { unrelated: {} } } };
    assert.deepEqual(await client.restoreRevenueCatPurchases(A), { kind: 'no_purchases_found' });
    sdk.failRestore = true;
    assert.equal((await client.restoreRevenueCatPurchases(A)).kind, 'error');
    sdk.failRestore = false;
    assert.deepEqual(await client.restoreRevenueCatPurchases(A), { kind: 'no_purchases_found' });
  });
}

test('B2B-N02: account switching waits for the store transaction, and the previous account cannot restore afterward', async () => {
  await client.identifyRevenueCatAccount(A);
  let settle;
  sdk.restoreWait = new Promise((resolve) => { settle = resolve; });
  const restoring = client.restoreRevenueCatPurchases(A);
  await new Promise((resolve) => setImmediate(resolve));
  const switching = client.identifyRevenueCatAccount(B);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sdk.id, A, 'login cannot interleave inside the native transaction');
  settle(premium);
  assert.deepEqual(await restoring, { kind: 'restored' });
  assert.equal(await switching, 'identified');
  assert.equal(sdk.id, B);
  sdk.restoreWait = null;
  assert.deepEqual(await client.restoreRevenueCatPurchases(A), { kind: 'unavailable' });
});

test('B2B-N02: failed identity change clears prior restore authority, even if the SDK retains old data', async () => {
  await client.identifyRevenueCatAccount(A);
  sdk.info = premium;
  sdk.failLogin = true;
  assert.equal(await client.identifyRevenueCatAccount(B), 'sdk_error');
  sdk.failLogin = false;
  assert.deepEqual(await client.restoreRevenueCatPurchases(), { kind: 'unavailable' });
  assert.equal(await client.fetchActiveEntitlementIds(), null);
  assert.deepEqual(await client.presentRevenueCatPaywall({}), { kind: 'unavailable' });
  await client.identifyRevenueCatAccount(null);
  assert.deepEqual(await client.restoreRevenueCatPurchases(), { kind: 'unavailable' });
});

test('B2B-N02: actual entitlement provider refreshes canonical CustomerInfo through its existing restore boundary', async () => {
  await client.identifyRevenueCatAccount(A);
  sdk.info = { entitlements: { active: {} } };
  let value;
  function Probe() { value = useEntitlement(); return null; }
  const r = await render(<RevenueCatProvider><Probe /></RevenueCatProvider>);
  try {
    assert.equal(value.status, 'free');
    sdk.info = premium;
    let outcome;
    await TestRenderer.act(async () => { outcome = await value.restore(A); });
    assert.deepEqual(outcome, { kind: 'restored' });
    assert.equal(value.status, 'plus');
    assert.equal(value.isPlus, true);
    await client.identifyRevenueCatAccount(B);
    sdk.info = { entitlements: { active: {} } };
    await TestRenderer.act(async () => value.refresh());
    assert.equal(value.status, 'free');
    await TestRenderer.act(async () => { outcome = await value.restore(A); });
    assert.deepEqual(outcome, { kind: 'unavailable' });
    assert.equal(value.isPlus, false, 'A cannot unlock B');
  } finally { await TestRenderer.act(async () => r.unmount()); }
});
