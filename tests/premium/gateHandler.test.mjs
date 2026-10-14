import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { SERVER_EXECUTED_FEATURES, SETTLE_ON_AUTHORIZE, handleGate } from '../../supabase/functions/_shared/premium/gateHandler.ts';
import { ACCOUNT_A, ACCOUNT_B, FakeApi, FakeStore, NOW, silentLog, subscriberRecord } from '../support/premium/harness.mjs';

const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-00000000000a';
const KEY = 'op-key-0000001';

const decision = (over = {}) => ({
  outcome: 'allowed', reason: 'allowed', entitlementState: 'premium_active', via: 'premium', nextAction: 'none', quota: null, decisionId: 'd-1', replay: false, ...over,
});
const denied = (reason, nextAction = 'none', state = 'unknown') => decision({ outcome: 'denied', reason, entitlementState: state, via: null, nextAction });

let store;
let api;
const deps = () => ({ store, api, deployment: 'staging', nowMs: () => store.nowMs, log: silentLog, newRequestId: () => 'req-fixed' });
const gate = (userId, body) => handleGate(deps(), userId, body);

beforeEach(() => {
  store = new FakeStore();
  api = new FakeApi();
  store.authorizeImpl = () => decision();
});

describe('the Premium gate: the request schema cannot name an account or an entitlement', () => {
  test('a well-formed request reaches the authorization boundary with the JWT subject as the account', async () => {
    const response = await gate(ACCOUNT_A, { feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY, appVersion: '1.2.3' });
    assert.equal(response.status, 200);
    assert.equal(response.body.outcome, 'allowed');
    assert.deepEqual(store.authorizeCalls[0], {
      accountId: ACCOUNT_A, feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY, requestId: 'req-fixed', appVersion: '1.2.3', units: 1, completeNow: true,
    });
  });

  test('a FORGED Premium flag (or any other unknown key) is rejected outright, never ignored, and never reaches the boundary', async () => {
    for (const forged of [{ isPremium: true }, { premium: true }, { tier: 'plus' }, { userId: ACCOUNT_B }, { accountId: ACCOUNT_B }, { entitlement: 'her_keys_plus' }, { completeNow: true }, { bypass: 1 }]) {
      const response = await gate(ACCOUNT_A, { feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY, ...forged });
      assert.equal(response.status, 400, JSON.stringify(forged));
      assert.equal(response.body.reason, 'invalid_request');
    }
    assert.equal(store.authorizeCalls.length, 0);
  });

  test('the account can never come from the body: a body naming another account is refused', async () => {
    const response = await gate(ACCOUNT_A, { feature: 'daily_load_premium', idempotencyKey: KEY, accountId: ACCOUNT_B });
    assert.equal(response.status, 400);
    assert.equal(store.authorizeCalls.length, 0);
  });

  test('malformed fields are invalid_request', async () => {
    const bad = [
      null, [], 'x', 5, {},
      { feature: 'Daily Load', idempotencyKey: KEY },
      { feature: 'daily_load_premium' },
      { feature: 'daily_load_premium', idempotencyKey: 'short' },
      { feature: 'daily_load_premium', idempotencyKey: 'x'.repeat(129) },
      { feature: 'daily_load_premium', idempotencyKey: KEY, householdId: 'not-a-uuid' },
      { feature: 'daily_load_premium', idempotencyKey: KEY, appVersion: '1.2' },
      { feature: 'daily_load_premium', idempotencyKey: KEY, units: 0 },
      { feature: 'daily_load_premium', idempotencyKey: KEY, units: 101 },
      { feature: 'daily_load_premium', idempotencyKey: KEY, units: 1.5 },
    ];
    for (const body of bad) assert.equal((await gate(ACCOUNT_A, body)).status, 400, JSON.stringify(body));
    assert.equal(store.authorizeCalls.length, 0);
  });

  test('server-executed features (Smart Inbox) are not reachable through the generic gate: a preflight would strand a reservation', async () => {
    assert.ok(SERVER_EXECUTED_FEATURES.includes('smart_inbox_extract'));
    const response = await gate(ACCOUNT_A, { feature: 'smart_inbox_extract', householdId: HOUSEHOLD, idempotencyKey: KEY });
    assert.equal(response.status, 400);
    assert.equal(store.authorizeCalls.length, 0);
  });

  test('only deterministic, no-external-cost features settle at authorization', () => {
    assert.deepEqual([...SETTLE_ON_AUTHORIZE].sort(), ['daily_load_premium', 'momentum_report']);
  });
});

describe('the Premium gate: denial, verification and failure', () => {
  test('a denial is reported faithfully with its next action and is not an HTTP error', async () => {
    store.authorizeImpl = () => denied('requires_premium', 'open_paywall', 'free');
    const response = await gate(ACCOUNT_A, { feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY });
    assert.equal(response.status, 200);
    assert.equal(response.body.reason, 'requires_premium');
    assert.equal(response.body.nextAction, 'open_paywall');
  });

  test('an unknown entitlement triggers ONE bounded reconcile and re-evaluates, so a late webhook does not strand a paying customer', async () => {
    api.set(ACCOUNT_A, subscriberRecord());
    store.authorizeImpl = (args, s) => (s.projections.has(args.accountId) ? decision() : denied('entitlement_unknown', 'retry_verification'));
    const response = await gate(ACCOUNT_A, { feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY });
    assert.equal(response.body.outcome, 'allowed');
    assert.equal(store.authorizeCalls.length, 2);
    assert.deepEqual(api.calls, [ACCOUNT_A]);
  });

  test('if the reconcile cannot run (rate limit, provider down) the denial stands and the customer is told to retry verification', async () => {
    api.set(ACCOUNT_A, { __status: 500 });
    store.authorizeImpl = () => denied('entitlement_unknown', 'retry_verification');
    const first = await gate(ACCOUNT_A, { feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY });
    assert.equal(first.body.reason, 'entitlement_unknown');
    assert.equal(first.body.nextAction, 'retry_verification');
    const second = await gate(ACCOUNT_A, { feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY });
    assert.equal(second.body.reason, 'entitlement_unknown');
    assert.equal(api.calls.length, 1, 'the second attempt was rate-limited and did not call RevenueCat again');
  });

  test('a reconcile that finds NO subscription ends in a plain upgrade prompt, not a loop', async () => {
    api.set(ACCOUNT_A, subscriberRecord({ entitlement: false }));
    store.authorizeImpl = (args, s) => (s.projections.has(args.accountId) ? denied('requires_premium', 'open_paywall', 'free') : denied('entitlement_unknown', 'retry_verification'));
    const response = await gate(ACCOUNT_A, { feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY });
    assert.equal(response.body.reason, 'requires_premium');
    assert.equal(response.body.nextAction, 'open_paywall');
  });

  test('any failure at the boundary is fail-closed: 503 service_unavailable, never "allowed"', async () => {
    store.faults.authorize = 1;
    const response = await gate(ACCOUNT_A, { feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY });
    assert.equal(response.status, 503);
    assert.equal(response.body.outcome, 'denied');
    assert.equal(response.body.reason, 'service_unavailable');
  });

  test('two accounts never share a decision: each call carries its own JWT subject', async () => {
    store.authorizeImpl = (args) => (args.accountId === ACCOUNT_A ? decision() : denied('requires_premium', 'open_paywall', 'free'));
    const a = await gate(ACCOUNT_A, { feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY });
    const b = await gate(ACCOUNT_B, { feature: 'daily_load_premium', householdId: HOUSEHOLD, idempotencyKey: KEY });
    assert.equal(a.body.outcome, 'allowed');
    assert.equal(b.body.outcome, 'denied');
  });
});
