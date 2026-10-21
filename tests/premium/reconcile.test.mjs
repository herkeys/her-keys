import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { deriveEntitlementState } from '../../supabase/functions/_shared/premium/entitlementState.ts';
import { candidateAccountIds, planIdentity } from '../../supabase/functions/_shared/premium/identity.ts';
import { parseWebhookBody } from '../../supabase/functions/_shared/premium/events.ts';
import { mergeReconciled, parseSubscriberResponse } from '../../supabase/functions/_shared/premium/reconcile.ts';
import { reconcileAccount } from '../../supabase/functions/_shared/premium/reconcileService.ts';
import { ACCOUNT_A, ACCOUNT_B, ACCOUNT_C, DAY, FakeApi, FakeStore, NOW, bytes, rcBody, silentLog, subscriberRecord } from '../support/premium/harness.mjs';

const parse = (record, now = NOW, deployment = 'staging') => {
  const result = parseSubscriberResponse(record, now, deployment);
  assert.equal(result.ok, true);
  return result.projection;
};
const stateOf = (projection, at = NOW) => deriveEntitlementState(projection, at, false);

describe('reading the authenticated RevenueCat subscriber record', () => {
  test('an active entitlement', () => {
    const p = parse(subscriberRecord());
    assert.equal(stateOf(p), 'premium_active');
    assert.equal(p.source, 'reconcile');
    assert.equal(p.environment, 'SANDBOX');
    assert.equal(p.needs_reconcile, false);
    assert.equal(p.product_id, 'herkeys_premium_monthly');
  });

  test('no entitlement at all is `free` (a reconciled non-subscriber), never `unknown`', () => {
    assert.equal(stateOf(parse(subscriberRecord({ entitlement: false }))), 'free');
  });

  test('cancel-while-paid, billing grace, lifetime and production environment all map correctly', () => {
    assert.equal(stateOf(parse(subscriberRecord({ unsubscribeMs: NOW - DAY }))), 'premium_canceled_active');
    assert.equal(stateOf(parse(subscriberRecord({ expiresMs: NOW - DAY, graceMs: NOW + 2 * DAY, billingIssueMs: NOW - DAY }))), 'premium_billing_grace');
    assert.equal(stateOf(parse(subscriberRecord({ expiresMs: null }))), 'premium_active');
    assert.equal(parse(subscriberRecord({ sandbox: false })).environment, 'PRODUCTION');
  });

  test('a lapse RevenueCat itself reports is CONFIRMED expired (the read is the confirmation), and grace still wins while it lasts', () => {
    assert.equal(stateOf(parse(subscriberRecord({ expiresMs: NOW - 2 * DAY }))), 'premium_expired');
    assert.equal(stateOf(parse(subscriberRecord({ expiresMs: NOW - 2 * DAY, graceMs: NOW + DAY }))), 'premium_billing_grace');
    assert.equal(stateOf(parse(subscriberRecord({ expiresMs: NOW - 2 * DAY, graceMs: NOW - DAY }))), 'premium_expired');
  });

  test('a refund counts only against the CURRENT purchase, not an earlier transaction of the same product', () => {
    assert.equal(stateOf(parse(subscriberRecord({ purchaseMs: NOW - 5 * DAY, refundedMs: NOW - 20 * DAY }))), 'premium_active');
    assert.equal(stateOf(parse(subscriberRecord({ purchaseMs: NOW - 20 * DAY, refundedMs: NOW - 5 * DAY }))), 'premium_revoked');
  });

  test('every clock is the read instant, so an older webhook event is stale and a newer one still applies', () => {
    const p = parse(subscriberRecord({ requestMs: NOW }));
    for (const key of ['expiry', 'cancel', 'billing', 'revoke', 'expired']) assert.equal(p.clocks[key], NOW);
  });

  test('a wildly different RevenueCat clock is not trusted over ours', () => {
    const p = parse(subscriberRecord({ requestMs: NOW + 30 * DAY, expiresMs: NOW + 10 * DAY }));
    assert.equal(p.clocks.expiry, NOW);
    assert.equal(stateOf(p), 'premium_active');
  });

  test('a malformed response is rejected, never turned into a state', () => {
    for (const body of [null, 'x', [], {}, { subscriber: null }, { subscriber: [] }]) {
      assert.deepEqual(parseSubscriberResponse(body, NOW, 'staging'), { ok: false, reason: 'invalid_response' });
    }
    // A malformed entitlement cannot masquerade as either a verified free account or lifetime access.
    for (const expires_date of [undefined, '', 'broken', 42]) {
      const record=subscriberRecord();record.subscriber.entitlements.her_keys_plus.expires_date=expires_date;
      assert.deepEqual(parseSubscriberResponse(record,NOW,'staging'),{ok:false,reason:'invalid_response'});
    }
    assert.deepEqual(parseSubscriberResponse({subscriber:{entitlements:{her_keys_plus:'yes'},subscriptions:{}}},NOW,'staging'),{ok:false,reason:'invalid_response'});
  });

  test('an entitlement under another key is NOT Premium', () => {
    const record = subscriberRecord();
    record.subscriber.entitlements = { another_entitlement: record.subscriber.entitlements.her_keys_plus };
    assert.equal(stateOf(parse(record)), 'free');
  });

  test('a newer webhook event already folded in beats a slightly older read (merge keeps it and re-flags)', () => {
    const fresh = parse(subscriberRecord({ requestMs: NOW }));
    const current = { ...parse(subscriberRecord()), clocks: { expiry: NOW + 1000 }, last_event_ms: NOW + 1000 };
    const merged = mergeReconciled(current, fresh);
    assert.equal(merged.needs_reconcile, true);
    assert.equal(merged.clocks.expiry, NOW + 1000);
    assert.deepEqual(mergeReconciled(null, fresh), fresh);
    assert.equal(mergeReconciled({ ...fresh, last_event_ms: 5 }, fresh).last_event_ms, 5, 'the webhook high-water mark never rewinds');
  });
});

describe('identity planning', () => {
  const event = (over) => parseWebhookBody(bytes(rcBody(over))).event;
  const known = new Map([[ACCOUNT_A, ACCOUNT_A], [ACCOUNT_B, ACCOUNT_B]]);

  test('the current app_user_id names the account; aliases and the original id are only evidence', () => {
    const plan = planIdentity(event({ aliases: [ACCOUNT_A, '$RCAnonymousID:zzz'] }), known);
    assert.equal(plan.kind, 'single');
    assert.equal(plan.accountId, ACCOUNT_A);
    assert.deepEqual(plan.evidence.map((e) => e.kind), ['primary', 'anonymous']);
  });

  test('an alias that happens to be a real account is NOT promoted to the account when the current id is not one', () => {
    const plan = planIdentity(event({ app_user_id: '$RCAnonymousID:zzz', original_app_user_id: '$RCAnonymousID:zzz', aliases: [ACCOUNT_B] }), known);
    assert.equal(plan.kind, 'none');
  });

  test('two real accounts in one event is ambiguous', () => {
    const plan = planIdentity(event({ aliases: [ACCOUNT_A, ACCOUNT_B] }), known);
    assert.equal(plan.kind, 'ambiguous');
    assert.deepEqual([...plan.accountIds].sort(), [ACCOUNT_A, ACCOUNT_B].sort());
  });

  test('a transfer names every real account it touches, and only those', () => {
    const plan = planIdentity(event({ type: 'TRANSFER', app_user_id: undefined, transferred_from: [ACCOUNT_A, '$RCAnonymousID:q'], transferred_to: [ACCOUNT_B] }), known);
    assert.equal(plan.kind, 'transfer');
    assert.deepEqual([...plan.accountIds].sort(), [ACCOUNT_A, ACCOUNT_B].sort());
  });

  test('candidate ids for resolution are UUID-shaped only, so anonymous ids never reach the account lookup', () => {
    const ids = candidateAccountIds(event({ aliases: [ACCOUNT_A, '$RCAnonymousID:zzz', 'not-a-uuid', ACCOUNT_B] }));
    assert.deepEqual(ids.sort(), [ACCOUNT_A, ACCOUNT_B].sort());
  });
});

describe('the reconcile service', () => {
  let store;
  let api;
  const deps = () => ({ store, api, deployment: 'staging', nowMs: () => store.nowMs, log: silentLog });
  beforeEach(() => {
    store = new FakeStore();
    api = new FakeApi();
  });

  test('writes the projection from RevenueCat, keyed to the exact account, and reports success', async () => {
    api.set(ACCOUNT_A, subscriberRecord());
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: false }), 'reconciled');
    assert.equal(await store.getState(ACCOUNT_A), 'premium_active');
    assert.equal(store.projections.has(ACCOUNT_B), false);
    assert.deepEqual(api.calls, [ACCOUNT_A]);
  });

  test('is rate-limited per account, with exponential backoff after failures (a user cannot hammer RevenueCat)', async () => {
    api.set(ACCOUNT_A, { __status: 500 });
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: false }), 'provider_unavailable');
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: false }), 'rate_limited');
    assert.equal(api.calls.length, 1);
    store.nowMs += 41_000; // one failure => the wait doubled to 40s
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: false }), 'provider_unavailable');
    store.nowMs += 41_000; // two failures => 80s: 41s is NOT enough
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: false }), 'rate_limited');
    store.nowMs += 60_000;
    api.set(ACCOUNT_A, subscriberRecord({ requestMs: store.nowMs }));
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: false }), 'reconciled');
    store.nowMs += 21_000;
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: false }), 'reconciled', 'a success resets the backoff');
  });

  test('a server-initiated (forced) reconcile bypasses the per-account gate', async () => {
    api.set(ACCOUNT_A, subscriberRecord());
    await reconcileAccount(deps(), ACCOUNT_A, { force: false });
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: false }), 'rate_limited');
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: true }), 'reconciled');
  });

  test('an unreachable or malformed provider response leaves the projection exactly as it was', async () => {
    api.set(ACCOUNT_A, subscriberRecord());
    await reconcileAccount(deps(), ACCOUNT_A, { force: true });
    const before = JSON.stringify(store.projections.get(ACCOUNT_A));
    api.set(ACCOUNT_A, { __status: 503 });
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: true }), 'provider_unavailable');
    api.set(ACCOUNT_A, { nonsense: true });
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: true }), 'invalid_response');
    assert.equal(JSON.stringify(store.projections.get(ACCOUNT_A)), before);
  });

  test('reconcile failure never invents access: an account with no projection stays unknown', async () => {
    api.set(ACCOUNT_C, { __status: 500 });
    await reconcileAccount(deps(), ACCOUNT_C, { force: false });
    assert.equal(await store.getState(ACCOUNT_C), 'unknown');
  });

  test('survives a lost compare-and-swap race by re-reading, and gives up (reporting failure) if it keeps losing', async () => {
    api.set(ACCOUNT_A, subscriberRecord());
    await reconcileAccount(deps(), ACCOUNT_A, { force: true });
    store.faults.casLose = 2;
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: true }), 'reconciled');
    store.faults.casLose = 99;
    assert.equal(await reconcileAccount(deps(), ACCOUNT_A, { force: true }), 'conflict');
  });

  test('reflects a downgrade: premium becomes free/expired when RevenueCat says so (the projection is not sticky)', async () => {
    api.set(ACCOUNT_A, subscriberRecord());
    await reconcileAccount(deps(), ACCOUNT_A, { force: true });
    api.set(ACCOUNT_A, subscriberRecord({ expiresMs: NOW - 2 * DAY, requestMs: NOW + 1000 }));
    store.nowMs = NOW + 1000;
    await reconcileAccount(deps(), ACCOUNT_A, { force: true });
    assert.equal(await store.getState(ACCOUNT_A), 'premium_expired');
  });
});
