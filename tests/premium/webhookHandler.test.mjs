import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { handleWebhook, processBacklog } from '../../supabase/functions/_shared/premium/webhookHandler.ts';
import {
  ACCOUNT_A, ACCOUNT_B, ACCOUNT_C, AUTH_SECRET, DAY, FakeApi, FakeStore, NOW, bytes, rcBody, request, subscriberRecord, webhookDeps,
} from '../support/premium/harness.mjs';

let store;
let api;
let deps;
// Requests are signed at the fake clock's CURRENT instant, so advancing the clock never turns a fresh delivery into a replay.
const send = (body, options) => handleWebhook(deps, request(body, { t: Math.floor(store.nowMs / 1000), ...options }));
const stateOf = (account) => store.getState(account);
const rows = () => [...store.events.values()];

beforeEach(() => {
  store = new FakeStore();
  api = new FakeApi();
  deps = webhookDeps(store, api);
});

describe('webhook endpoint: authentication happens before anything is stored', () => {
  test('an unauthenticated request is refused (401) and leaves NO trace: no event, no projection, no identity', async () => {
    for (const options of [{ auth: null }, { auth: 'wrong-wrong-wrong-wrong' }, { hmac: null }, { hmac: 'a-different-signing-secret-xyz' }]) {
      const response = await send(rcBody(), options);
      assert.equal(response.status, 401, JSON.stringify(Object.keys(options)));
      assert.deepEqual(response.body, { error: 'unauthorized' });
    }
    assert.equal(store.events.size, 0);
    assert.equal(store.projections.size, 0);
    assert.equal(store.identities.size, 0);
  });

  test('a captured request replayed after the tolerance window is refused', async () => {
    const stale = await send(rcBody(), { t: Math.floor(NOW / 1000) - 600 });
    assert.equal(stale.status, 401);
    assert.equal(store.events.size, 0);
  });

  test('non-POST is 405; a deployment without secrets is a 503, never an open endpoint', async () => {
    assert.equal((await handleWebhook(deps, { ...request(rcBody()), method: 'GET' })).status, 405);
    const open = webhookDeps(store, api, { auth: { authorizationSecret: null, hmacSecret: null, requireHmac: false, toleranceSeconds: 300 } });
    const response = await handleWebhook(open, request(rcBody(), { auth: AUTH_SECRET, hmac: null }));
    assert.equal(response.status, 503);
    assert.equal(store.events.size, 0);
  });

  test('an authenticated but malformed body is a 400 and stores nothing', async () => {
    const response = await handleWebhook(deps, request(null, { rawOverride: bytes('{"event": 5}') }));
    assert.equal(response.status, 400);
    assert.equal(store.events.size, 0);
  });
});

describe('webhook endpoint: lifecycle through the real handler', () => {
  test('an initial purchase makes ONLY that account Premium, and the stored evidence carries no price, e-mail or transaction id', async () => {
    const response = await send(rcBody());
    assert.deepEqual(response, { status: 200, body: { status: 'processed' } });
    assert.equal(await stateOf(ACCOUNT_A), 'premium_active');
    assert.equal(await stateOf(ACCOUNT_B), 'unknown', 'another account is untouched');
    const [row] = rows();
    assert.equal(row.status, 'processed');
    const kept = JSON.stringify(row.payload) + JSON.stringify(row.event);
    for (const secret of ['9.99', 'mom@example.com', 'tx-secret-1', 'USD']) assert.equal(kept.includes(secret), false);
  });

  test('purchase, cancellation, refund, late renewal: the late renewal cannot resurrect revoked access', async () => {
    await send(rcBody({ type: 'INITIAL_PURCHASE', event_timestamp_ms: NOW }));
    await send(rcBody({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: NOW + 2 * DAY }));
    api.set(ACCOUNT_A, subscriberRecord({ refundedMs: NOW + 2 * DAY, requestMs: NOW + 3 * DAY }));
    store.nowMs = NOW + 3 * DAY;
    const late = await send(rcBody({ type: 'RENEWAL', event_timestamp_ms: NOW + DAY, expiration_at_ms: NOW + 60 * DAY }));
    assert.deepEqual(late, { status: 200, body: { status: 'processed' } }, 'the late renewal really was received and folded in');
    assert.equal(await stateOf(ACCOUNT_A), 'premium_revoked');
  });

  test('duplicate delivery of one event id is acknowledged and changes nothing (idempotent by provider event id)', async () => {
    const body = rcBody({ id: 'evt-fixed-1' });
    assert.equal((await send(body)).body.status, 'processed');
    const version = store.projections.get(ACCOUNT_A).version;
    assert.equal((await send(body)).body.status, 'duplicate');
    assert.equal((await send(body)).body.status, 'duplicate');
    assert.equal(store.projections.get(ACCOUNT_A).version, version);
    assert.equal(store.events.size, 1);
  });

  test('the same event id in SANDBOX and PRODUCTION are different events', async () => {
    await send(rcBody({ id: 'evt-shared', environment: 'SANDBOX' }));
    await send(rcBody({ id: 'evt-shared', environment: 'PRODUCTION' }));
    assert.equal(store.events.size, 2);
  });

  test('billing grace then renewal, end to end', async () => {
    await send(rcBody({ event_timestamp_ms: NOW, expiration_at_ms: NOW + 30 * DAY }));
    await send(rcBody({ type: 'BILLING_ISSUE', event_timestamp_ms: NOW + 30 * DAY, grace_period_expiration_at_ms: NOW + 33 * DAY, expiration_at_ms: NOW + 30 * DAY }));
    store.nowMs = NOW + 31 * DAY;
    assert.equal(await stateOf(ACCOUNT_A), 'premium_billing_grace');
    await send(rcBody({ type: 'RENEWAL', event_timestamp_ms: NOW + 32 * DAY, expiration_at_ms: NOW + 60 * DAY }));
    store.nowMs = NOW + 34 * DAY;
    assert.equal(await stateOf(ACCOUNT_A), 'premium_active');
  });

  test('an expiration that arrives before the purchase is not trusted: RevenueCat decides', async () => {
    api.set(ACCOUNT_A, subscriberRecord({ expiresMs: NOW + 20 * DAY }));
    const response = await send(rcBody({ type: 'EXPIRATION', event_timestamp_ms: NOW - DAY }));
    assert.equal(response.body.status, 'processed');
    assert.equal(await stateOf(ACCOUNT_A), 'premium_active', 'the authenticated subscriber record, not the stray event, set the state');
    assert.deepEqual(api.calls, [ACCOUNT_A]);
  });
});

describe('webhook endpoint: environment separation', () => {
  test('staging records a PRODUCTION event as evidence but NEVER grants from it', async () => {
    const response = await send(rcBody({ environment: 'PRODUCTION' }));
    assert.deepEqual(response, { status: 200, body: { status: 'ignored_environment' } });
    assert.equal(rows()[0].status, 'ignored_environment');
    assert.equal(store.projections.size, 0);
  });

  test('production records a SANDBOX event as evidence but NEVER grants from it', async () => {
    const productionDeps = webhookDeps(store, api, { deployment: 'production' });
    const response = await handleWebhook(productionDeps, request(rcBody({ environment: 'SANDBOX' })));
    assert.equal(response.body.status, 'ignored_environment');
    assert.equal(store.projections.size, 0);
    const ok = await handleWebhook(productionDeps, request(rcBody({ environment: 'PRODUCTION' })));
    assert.equal(ok.body.status, 'processed');
    assert.equal(await stateOf(ACCOUNT_A), 'premium_active');
  });
});

describe('webhook endpoint: identity', () => {
  test('a TEST event is stored and ignored', async () => {
    const response = await send(rcBody({ type: 'TEST', app_user_id: '$RCAnonymousID:test', aliases: [], original_app_user_id: null }));
    assert.equal(response.body.status, 'ignored_test');
    assert.equal(store.projections.size, 0);
  });

  test('an unknown subscriber (a UUID that is no Her Keys account) grants nothing', async () => {
    const stranger = '99999999-9999-4999-8999-999999999999';
    const response = await send(rcBody({ app_user_id: stranger, original_app_user_id: stranger, aliases: [stranger] }));
    assert.equal(response.body.status, 'ignored_unknown');
    assert.equal(rows()[0].error, 'unresolvable_subscriber');
    assert.equal(store.projections.size, 0);
  });

  test('an anonymous RevenueCat id never resolves to an account, and is recorded as rejected evidence', async () => {
    const anon = '$RCAnonymousID:abcdef0123456789abcdef0123456789';
    const response = await send(rcBody({ app_user_id: anon, original_app_user_id: anon, aliases: [anon] }));
    assert.equal(response.body.status, 'ignored_unknown');
    assert.equal(store.projections.size, 0);
    assert.deepEqual(store.identities.get(anon), { accountId: null, status: 'rejected' });
  });

  test('an anonymous alias beside the real account id is evidence only: the purchase belongs to the account', async () => {
    const anon = '$RCAnonymousID:abcdef0123456789abcdef0123456789';
    const response = await send(rcBody({ aliases: [anon, ACCOUNT_A] }));
    assert.equal(response.body.status, 'processed');
    assert.equal(await stateOf(ACCOUNT_A), 'premium_active');
  });

  test('an event implicating TWO real accounts grants nothing from the event; each account is read from RevenueCat', async () => {
    api.set(ACCOUNT_A, subscriberRecord({ expiresMs: NOW + 20 * DAY }));
    api.set(ACCOUNT_B, subscriberRecord({ entitlement: false }));
    const response = await send(rcBody({ app_user_id: ACCOUNT_A, aliases: [ACCOUNT_A, ACCOUNT_B] }));
    assert.equal(response.body.status, 'ambiguous');
    assert.equal(await stateOf(ACCOUNT_A), 'premium_active');
    assert.equal(await stateOf(ACCOUNT_B), 'free', 'B was NOT given A\'s purchase through the alias');
    assert.deepEqual(api.calls.sort(), [ACCOUNT_A, ACCOUNT_B].sort());
  });

  test('if RevenueCat cannot be reached for an ambiguous event, nothing is granted and the event is retried, not lost', async () => {
    const response = await send(rcBody({ app_user_id: ACCOUNT_A, aliases: [ACCOUNT_A, ACCOUNT_B] }));
    assert.equal(response.body.status, 'failed');
    assert.equal(store.projections.size, 0);
    assert.equal(rows()[0].status, 'failed');
  });

  test('a TRANSFER grants nothing by itself: the destination is read from RevenueCat and the source is released', async () => {
    await send(rcBody({ id: 'evt-original' }));
    assert.equal(await stateOf(ACCOUNT_A), 'premium_active');
    api.set(ACCOUNT_A, subscriberRecord({ entitlement: false, requestMs: NOW + DAY }));
    api.set(ACCOUNT_B, subscriberRecord({ expiresMs: NOW + 20 * DAY, requestMs: NOW + DAY }));
    store.nowMs = NOW + DAY;
    const response = await send(rcBody({ type: 'TRANSFER', app_user_id: undefined, transferred_from: [ACCOUNT_A], transferred_to: [ACCOUNT_B], event_timestamp_ms: NOW + DAY, entitlement_ids: ['her_keys_plus'] }));
    assert.equal(response.body.status, 'processed');
    assert.equal(await stateOf(ACCOUNT_B), 'premium_active');
    assert.equal(await stateOf(ACCOUNT_A), 'free');
  });

  test('a TRANSFER is not applied from the event when RevenueCat cannot confirm it: A keeps what it had, B gets nothing', async () => {
    await send(rcBody({ id: 'evt-original' }));
    const response = await send(rcBody({ type: 'TRANSFER', app_user_id: undefined, transferred_from: [ACCOUNT_A], transferred_to: [ACCOUNT_B], event_timestamp_ms: NOW + DAY }));
    assert.equal(response.body.status, 'failed');
    assert.equal(await stateOf(ACCOUNT_B), 'unknown');
    assert.equal(await stateOf(ACCOUNT_A), 'premium_active');
  });
});

describe('webhook endpoint: failure, backlog and dead letters', () => {
  test('a failure to STORE the event is a 503 so RevenueCat retries', async () => {
    store.faults.recordEvent = 1;
    const response = await send(rcBody());
    assert.equal(response.status, 503);
    assert.equal(store.events.size, 0);
  });

  test('a failure AFTER the durable receipt is still 200 (the event is safe) and the backlog processor completes it', async () => {
    store.faults.getProjection = 1;
    const response = await send(rcBody());
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'failed');
    assert.equal(await stateOf(ACCOUNT_A), 'unknown');
    const result = await processBacklog(deps, 50);
    assert.deepEqual(result, { attempted: 1, processed: 1, stillFailing: 0 });
    assert.equal(await stateOf(ACCOUNT_A), 'premium_active');
  });

  test('the fifth failed attempt dead-letters the event and flags the account for reconcile', async () => {
    await send(rcBody({ id: 'evt-seed', event_timestamp_ms: NOW }));
    const body = rcBody({ id: 'evt-poison', type: 'RENEWAL', event_timestamp_ms: NOW + DAY, expiration_at_ms: NOW + 60 * DAY });
    store.faults.getProjection = 20;
    await send(body);
    for (let i = 0; i < 3; i += 1) await processBacklog(deps, 50);
    assert.equal(rows().find((r) => r.event.event_id === 'evt-poison').status, 'failed');
    await processBacklog(deps, 50);
    // dead-lettered rows leave the backlog: nothing left to attempt
    store.faults.getProjection = 0;
    assert.equal(rows().find((r) => r.event.event_id === 'evt-poison').status, 'dead_letter');
    assert.deepEqual(await processBacklog(deps, 50), { attempted: 0, processed: 0, stillFailing: 0 });
  });

  test('losing a compare-and-swap race re-reads and re-applies, it does not lose or double the update', async () => {
    await send(rcBody({ id: 'evt-1' }));
    store.faults.casLose = 2;
    const response = await send(rcBody({ id: 'evt-2', type: 'RENEWAL', event_timestamp_ms: NOW + DAY, expiration_at_ms: NOW + 60 * DAY }));
    assert.equal(response.body.status, 'processed');
    assert.equal(store.projections.get(ACCOUNT_A).projection.expires_at, new Date(NOW + 60 * DAY).toISOString());
  });

  test('when the operator halts processing the event is still stored, and the backlog resumes it later', async () => {
    store.runtime.webhookProcessing = false;
    assert.equal((await send(rcBody())).body.status, 'stored');
    assert.equal(rows()[0].status, 'received');
    assert.deepEqual(await processBacklog(deps, 50), { attempted: 0, processed: 0, stillFailing: 0 });
    store.runtime.webhookProcessing = true;
    assert.deepEqual(await processBacklog(deps, 50), { attempted: 1, processed: 1, stillFailing: 0 });
    assert.equal(await stateOf(ACCOUNT_A), 'premium_active');
  });

  test('responses and logs never carry payload content', async () => {
    const lines = [];
    const logging = webhookDeps(store, api, { log: (record) => lines.push(JSON.stringify(record)) });
    await handleWebhook(logging, request(rcBody()));
    await handleWebhook(logging, request(rcBody(), { auth: 'nope-nope-nope-nope-nope' }));
    const all = lines.join('\n');
    for (const secret of [ACCOUNT_A, 'mom@example.com', '9.99', 'tx-secret-1', AUTH_SECRET]) assert.equal(all.includes(secret), false, `${secret} reached a log line`);
    assert.ok(lines.length >= 2);
  });
});
