import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createPremiumServerClient } from '../../src/monetization/premiumServerClient.ts';
import { createPremiumLedgerClient } from '../../src/monetization/premiumLedgerClient.ts';
import { decisionsFrom } from '../../src/features/momentum/premium/momentumFlow.ts';
import { buildWeeklyReview } from '../../src/domain/premium/momentum/report.ts';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const session = id => ({ user: { id }, access_token: 'synthetic-' + id });
const extractInput = { householdId: 'shared-household', idempotencyKey: 'synthetic-operation', text: 'Synthetic A note', context: { today: '2026-10-19', timeZone: 'UTC', children: [], people: [], areas: [] } };
const recordInput = { householdId: 'shared-household', featureKey: 'daily_load_premium', kind: 'move', idempotencyKey: 'synthetic-operation', proposalRef: {}, proposalDigest: 'synthetic' };
const operations = [
  ['entitlement', h => h.server.entitlement()],
  ['manifest', h => h.server.manifest()],
  ['readiness', h => h.server.purchaseReadiness()],
  ['reconcile', h => h.server.verify()],
  ['authorize', h => h.server.authorize({ feature: 'daily_load_premium', householdId: 'shared-household', idempotencyKey: 'synthetic-operation' })],
  ['extract', h => h.server.extract(extractInput)],
  ['record', h => h.ledger.record(recordInput)],
  ['transition', h => h.ledger.transition('synthetic-row', 'approved')],
  ['list', h => h.ledger.list('daily_load_premium', 'shared-household', 10)],
];

function harness() {
  const h = { session: session(A), current: true, requests: [], lookups: 0, beforeSession: async () => {}, response: null };
  const sdk = createClient('https://premium-boundary.invalid', 'sb_publishable_local_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      h.requests.push({ url: String(url), authorization: new Headers(init.headers).get('Authorization'), body: init.body, signal: init.signal });
      if (h.response) return h.response(init.signal);
      return Response.json(String(url).includes('/premium_decisions?') ? [] : { status: 'reconciled', ready: true, reason: 'ready' });
    } },
  });
  sdk.auth.getSession = async () => { h.lookups++; await h.beforeSession(); return { data: { session: h.session }, error: null }; };
  // This owner is supplied by PremiumStateProvider's keyed account/household scope.
  const owner = { accountId: A, isCurrent: () => h.current };
  h.server = createPremiumServerClient(sdk, owner);
  h.ledger = createPremiumLedgerClient(sdk, owner);
  return h;
}

test('an extraction cancelled before or during session lookup never reaches HTTP', async () => {
  for (const duringLookup of [false, true]) {
    const h = harness(); const pending = new AbortController();
    if (duringLookup) h.beforeSession = async () => pending.abort();
    else pending.abort();
    const result = await h.server.extract(extractInput, pending.signal);
    assert.equal(result.kind, 'unavailable');
    assert.equal(h.requests.length, 0);
    if (!duringLookup) assert.equal(h.lookups, 0);
  }
});

test('the installed Supabase SDK propagates extraction cancellation to the actual fetch', async () => {
  const h = harness(); const pending = new AbortController();
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  h.response = signal => new Promise((_resolve, reject) => {
    assert.ok(signal instanceof AbortSignal);
    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    started();
  });
  const request = h.server.extract(extractInput, pending.signal);
  await ready;
  assert.equal(h.requests.length, 1);
  pending.abort();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal((await request).kind, 'unavailable');
});

test('an abort-ignoring transport cannot return an extraction after cancellation', async () => {
  const h = harness(); const pending = new AbortController();
  h.response = async () => { pending.abort(); return Response.json({ status: 'invalid_request' }); };
  assert.deepEqual(await h.server.extract(extractInput, pending.signal), { kind: 'unavailable', reason: 'account_changed' });
});

for (const [name, run] of operations) {
  test(name + ': a replacement session cannot send the old actor request', async () => {
    const h = harness(); h.session = session(B);
    await run(h);
    assert.equal(h.requests.length, 0, 'A request must never leave using B JWT, even in a shared household');
  });
  test(name + ': the SDK cannot substitute a later JWT for the captured owner token', async () => {
    const h = harness();
    h.beforeSession = async () => { if (h.lookups > 1) h.session = session(B); };
    await run(h);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].authorization, 'Bearer ' + session(A).access_token);
  });
  test(name + ': a switch during session lookup prevents transmission', async () => {
    const h = harness(); h.beforeSession = async () => { h.current = false; };
    await run(h);
    assert.equal(h.requests.length, 0);
  });
}

test('Momentum can receive its requested 200 receipts through the real ledger adapter, including receipt 101', async () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({
    id: `receipt-${i}`, feature_key: 'daily_load_premium', kind: 'daily_load.reschedule_task', status: 'applied',
    idempotency_key: `key-${i}`, proposal_ref: { kind: 'task', id: `task-${i}` }, proposal_digest: `digest-${i}`,
    before_snapshot: { plan: { kind: 'day', date: '2026-10-18' } }, after_snapshot: { plan: { kind: 'day', date: '2026-10-19' } },
    proposed_at: `2026-10-${16 + i % 3}T12:00:00Z`, applied_at: `2026-10-${16 + i % 3}T12:01:00Z`, updated_at: `2026-10-${16 + i % 3}T12:01:00Z`,
  }));
  let limit;
  const sdk = createClient('https://premium-boundary.invalid', 'sb_publishable_local_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async url => {
      limit = Number(new URL(url).searchParams.get('limit'));
      return Response.json(rows.slice(0, limit));
    } },
  });
  sdk.auth.getSession = async () => ({ data: { session: session(A) }, error: null });
  const result = await createPremiumLedgerClient(sdk, { accountId: A, isCurrent: () => true }).list('daily_load_premium', 'shared-household', 200);
  assert.equal(result.kind, 'ok');
  assert.equal(result.value.length, 101, 'the requested evidence window must not be silently halved');
  assert.equal(limit, 200);
  assert.equal(decisionsFrom(result.value, 'UTC').length, 101);
  const report = buildWeeklyReview({ observations: [], decisions: decisionsFrom(result.value, 'UTC'), confirmedPatterns: [], today: '2026-10-19', timeZone: 'UTC', nowMs: Date.parse('2026-10-19T15:00:00Z') });
  assert.equal(report.status, 'ready');
  assert.equal(report.counts.suggestionsApplied, 101, 'the weekly count includes the real receipt beyond the old cap');
});
