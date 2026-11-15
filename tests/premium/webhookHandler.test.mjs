import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

import { handleWebhook, processBacklog } from '../../supabase/functions/_shared/premium/webhookHandler.ts';
import * as ingress from '../../supabase/functions/_shared/premium/events.ts';
import {
  ACCOUNT_A, ACCOUNT_B, ACCOUNT_C, AUTH_SECRET, DAY, FakeApi, FakeStore, NOW, bytes, rcBody, request, signature, subscriberRecord, webhookDeps,
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

// Execute the actual Deno HTTP adapter with its existing runtime ports supplied by the test harness.
// The handler, raw-body reader, parser and signature verifier are real; no hosted credentials or network are used.
function httpAdapter() {
  const entry = readFileSync(new URL('../../supabase/functions/revenuecat-webhook/index.ts', import.meta.url), 'utf8');
  const code = transformSync(entry.replace(/^import[^;]+;\r?\n/gm, ''), { loader: 'ts', format: 'cjs' }).code;
  let handler;
  let handled = 0;
  const allocations = [];
  const module = { exports: {} };
  const ingressCode = transformSync(readFileSync(new URL('../../supabase/functions/_shared/premium/events.ts', import.meta.url), 'utf8').replace(/^import[^;]+;\r?\n/gm, ''), { loader: 'ts', format: 'cjs' }).code;
  runInNewContext(ingressCode, {
    module, exports: module.exports, TextDecoder,
    Uint8Array: new Proxy(Uint8Array, { construct(Target, args) {
      const array = Reflect.construct(Target, args);
      allocations.push(array.byteLength);
      return array;
    } }),
  });
  runInNewContext(code, {
    Deno: { serve(fn) { handler = fn; } },
    handleWebhook: (...args) => { handled += 1; return handleWebhook(...args); },
    readWebhookBody: module.exports.readWebhookBody,
    createApi: () => api, createStore: () => store, log: deps.log,
    readDeployment: () => store.runtime.environment, readWebhookAuthConfig: () => deps.auth, unavailableApi: {},
    Response, Uint8Array, Date: class extends Date { static now() { return NOW; } },
  });
  return { send: (req) => handler(req), handled: () => handled, allocated: () => allocations.reduce((a, b) => a + b, 0) };
}

function streamedRequest(raw, { contentLength, signed = false, chunkSize = 64 * 1024, broken = false, stallCancel = false } = {}) {
  const progress = { produced: 0, cancelled: false };
  const headers = new Headers();
  if (contentLength !== undefined) headers.set('content-length', String(contentLength));
  if (signed) {
    headers.set('authorization', AUTH_SECRET);
    headers.set('x-revenuecat-webhook-signature', signature(raw));
  }
  const req = new Request('https://example.invalid/revenuecat-webhook', {
    method: 'POST', duplex: 'half', headers,
    body: new ReadableStream({
      pull(controller) {
        if (broken) return controller.error(new Error('synthetic_body_failure'));
        if (progress.produced >= raw.byteLength) return controller.close();
        const end = Math.min(raw.byteLength, progress.produced + chunkSize);
        controller.enqueue(raw.subarray(progress.produced, end));
        progress.produced = end;
      },
      cancel() { progress.cancelled = true; if (stallCancel) return new Promise(() => {}); },
    }, { highWaterMark: 0 }),
  });
  return { req, progress };
}

describe('webhook HTTP adapter: enforce the existing raw-body budget before authentication', () => {
  test('rejects declared oversize without allocating a body buffer or invoking the handler', async () => {
    const adapter = httpAdapter();
    const { req, progress } = streamedRequest(new Uint8Array(ingress.MAX_BODY_BYTES * 2), { contentLength: ingress.MAX_BODY_BYTES * 2 });
    assert.equal((await adapter.send(req)).status, 413);
    assert.equal(adapter.allocated(), 0, 'discard transport chunks without retaining an oversized body');
    assert.equal(progress.produced, ingress.MAX_BODY_BYTES * 2);
    assert.equal(progress.cancelled, false, 'do not cancel the HTTP transport while returning a response');
    assert.equal(adapter.handled(), 0);
    assert.equal(store.events.size, 0);
  });

  for (const contentLength of [undefined, 1]) {
    test(`bounds an oversized stream with ${contentLength === undefined ? 'no' : 'misleading'} Content-Length`, async () => {
      const adapter = httpAdapter();
      const raw = new Uint8Array(ingress.MAX_BODY_BYTES * 2);
      const { req, progress } = streamedRequest(raw, { contentLength });
      assert.equal((await adapter.send(req)).status, 413);
      assert.equal(adapter.allocated(), ingress.MAX_BODY_BYTES, 'retained body allocation must not grow with the upload');
      assert.equal(progress.produced, raw.byteLength, 'finish consuming the HTTP upload without retaining excess data');
      assert.equal(progress.cancelled, false, 'the HTTP server owns transport cleanup');
      assert.equal(req.body.locked, false, 'release the application reader on refusal');
      assert.equal(adapter.handled(), 0);
      assert.equal(store.events.size, 0);
      assert.equal(store.projections.size, 0);
      assert.equal(store.identities.size, 0);
    });
  }

  test('stream errors fail as a bounded client error before any authentication or persistence', async () => {
    const adapter = httpAdapter();
    const { req } = streamedRequest(bytes('unused'), { broken: true });
    const response = await adapter.send(req);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_payload' });
    assert.equal(adapter.handled(), 0);
    assert.equal(store.events.size, 0);
  });

  test('oversize refusal never invokes an unresponsive HTTP stream cancellation', { timeout: 2000 }, async () => {
    for (const contentLength of [undefined, ingress.MAX_BODY_BYTES * 2]) {
      const adapter = httpAdapter();
      const { req, progress } = streamedRequest(new Uint8Array(ingress.MAX_BODY_BYTES * 2), { contentLength, stallCancel: true });
      assert.equal((await adapter.send(req)).status, 413);
      assert.equal(progress.cancelled, false);
      assert.equal(adapter.handled(), 0);
    }
  });

  test('a much larger declared upload never increases application body-buffer allocation', async () => {
    const adapter = httpAdapter();
    const raw = new Uint8Array(ingress.MAX_BODY_BYTES * 8);
    const { req } = streamedRequest(raw, { contentLength: raw.byteLength });
    const response = await adapter.send(req);
    assert.equal(response.status, 413);
    assert.equal(adapter.allocated(), 0);
    assert.equal(adapter.handled(), 0);
  });

  test('a missing request body retains the authenticated-handler refusal contract', async () => {
    const adapter = httpAdapter();
    const response = await adapter.send(new Request('https://example.invalid/webhook', { method: 'POST' }));
    assert.equal(response.status, 401);
    assert.equal(store.events.size, 0);
  });

  test('non-POST requests never attempt to consume a body', async () => {
    const adapter = httpAdapter();
    const response = await adapter.send({
      method: 'GET', headers: new Headers(),
      get body() { throw new Error('GET body must not be read'); },
      arrayBuffer() { throw new Error('GET body must not be read'); },
    });
    assert.equal(response.status, 405);
    assert.equal(store.events.size, 0);
  });

  test('preserves original signed bytes across UTF-8 fragments and whitespace', async () => {
    const adapter = httpAdapter();
    const raw = bytes(`\n${JSON.stringify(rcBody({ type: 'TEST', app_user_id: '$RCAnonymousID:ingress', original_app_user_id: null, aliases: [], ignored_text: '🌷 café' }), null, 2)}\n`);
    const { req } = streamedRequest(raw, { signed: true, chunkSize: 7 });
    const response = await adapter.send(req);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ignored_test' });
    assert.equal(store.events.size, 1);
    assert.equal(store.projections.size, 0);
  });

  test('accepts a valid signed payload exactly at the existing byte limit', async () => {
    const adapter = httpAdapter();
    const json = bytes(rcBody({ type: 'TEST', app_user_id: '$RCAnonymousID:ingress', original_app_user_id: null, aliases: [] }));
    const raw = new Uint8Array(ingress.MAX_BODY_BYTES).fill(32);
    raw.set(json);
    const { req } = streamedRequest(raw, { signed: true, contentLength: raw.byteLength });
    const response = await adapter.send(req);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ignored_test' });
    assert.equal(store.events.size, 1);
  });

  test('ordinary missing authentication and changed signed bytes remain 401', async () => {
    const adapter = httpAdapter();
    const raw = bytes(rcBody());
    assert.equal((await adapter.send(streamedRequest(raw).req)).status, 401);
    const { req } = streamedRequest(bytes(`${new TextDecoder().decode(raw)}\n`), { signed: true });
    req.headers.set('x-revenuecat-webhook-signature', signature(raw));
    assert.equal((await adapter.send(req)).status, 401);
    assert.equal(store.events.size, 0);
  });
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
  for (const deployment of ['staging', 'production']) {
    for (const type of ['INITIAL_PURCHASE', 'TRANSFER']) {
      test(`${deployment} backlog cannot process a foreign ${type} after the ignore-status write failed`, async () => {
        const processing = webhookDeps(store, api, { deployment });
        const environment = deployment === 'production' ? 'SANDBOX' : 'PRODUCTION';
        const setStatus = store.setEventStatus.bind(store);
        let failIgnore = true;
        store.setEventStatus = async (...args) => {
          if (failIgnore && args[1] === 'ignored_environment') throw new Error('synthetic status write outage');
          return setStatus(...args);
        };
        const body = rcBody({ environment, type, ...(type === 'TRANSFER' ? { transferred_from: [ACCOUNT_A], transferred_to: [ACCOUNT_B] } : {}) });
        const received = await handleWebhook(processing, request(body));
        assert.equal(received.status, 200, 'the authenticated event is durably received');
        assert.equal(rows()[0].status, 'received', 'failed classification leaves a real backlog row');
        // The status store is still failing on the first recovery attempt. No identity lookup,
        // provider reconcile, entitlement grant or retry may bypass the environment gate.
        await processBacklog(processing, 50);
        assert.equal(store.projections.size, 0);
        assert.equal(store.identities.size, 0);
        assert.deepEqual(api.calls, []);
        failIgnore = false;
        await processBacklog(processing, 50);
        assert.equal(rows()[0].status, 'ignored_environment');
        assert.equal(rows()[0].accountId, null);
        assert.equal(store.projections.size, 0);
        assert.equal(store.identities.size, 0);
        assert.deepEqual(api.calls, []);
      });
    }
  }

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
