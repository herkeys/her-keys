/**
 * The Momentum weekly-review JOURNEY over ports: receipts read -> built locally -> authorized -> saved as a receipt -> readable later with
 * no subscription -> an optional next step she approves. Failure modes: gate refusal, gate outage, receipts unreadable, save failure,
 * interrupted save, replay, another household's receipts.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { userProvenance } from '../../src/domain/foundation/provenance.ts';
import { approveNextStep, decisionsFrom, generateWeeklyReview, listSavedReviews, nextStepApproved, reviewKeyFor } from '../../src/features/momentum/premium/momentumFlow.ts';
import { FakeLedger } from '../support/premiumLedger.mjs';

const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000b';
const TODAY = '2026-09-30';
const NOW = Date.parse('2026-09-30T20:00:00Z');
const TZ = 'America/New_York';

let seq = 0;
const obs = (kind, id, outcome, date, extra = {}) => ({
  id: `obs-${++seq}`, about: { kind, id }, outcome, occurredAt: extra.occurredAt ?? `${date}T16:00:00.000Z`, logicalDate: date, plannedDate: extra.plannedDate ?? null, toDate: extra.toDate ?? null,
  createdAt: `${date}T16:00:00.000Z`, provenance: userProvenance(), scope: 'personal',
});
const done = (id, date) => obs('task', id, 'completed', date);
const defer = (id, date, planned, to, extra) => obs('task', id, 'deferred', date, { plannedDate: planned, toDate: to, ...extra });

const ENOUGH = () => ['24', '25', '26', '27', '28'].map((d, i) => done(`t${i}`, `2026-09-${d}`));
const stateOf = (observations, patterns = []) => ({ user: { timezone: TZ }, observations, patterns });

const allowed = (over = {}) => ({ outcome: 'allowed', reason: 'allowed', entitlementState: 'premium_active', via: 'premium', nextAction: 'none', quota: null, decisionId: 'd', replay: false, ...over });
const denied = (reason = 'requires_premium') => ({ outcome: 'denied', reason, entitlementState: 'free', via: null, nextAction: 'open_paywall', quota: null, decisionId: null, replay: false });

function app({ gate = () => allowed(), gateKind = 'decision' } = {}) {
  const ledger = new FakeLedger();
  const gateCalls = [];
  const deps = {
    ledger,
    householdId: HOUSEHOLD,
    authorize: async (request) => {
      gateCalls.push(request);
      if (gateKind !== 'decision') return { kind: gateKind };
      const decision = gate(request);
      if (decision.outcome === 'allowed') ledger.authorize(request.idempotencyKey);
      return { kind: 'decision', decision };
    },
  };
  return { ledger, deps, gateCalls };
}
const run = (a, observations, patterns) => generateWeeklyReview(a.deps, { state: stateOf(observations, patterns), today: TODAY, nowMs: NOW });

// -------------------------------------------------------------------------------------------------------------------- the journey

describe('MOMF-JOURNEY — generate, authorize, save', () => {
  test('too little history is answered locally: no authorization, no quota, nothing saved', async () => {
    const a = app();
    const out = await run(a, [done('a', '2026-09-30')]);
    assert.equal(out.kind, 'insufficient');
    assert.equal(out.report.status, 'insufficient_history');
    assert.equal(a.gateCalls.length, 0, 'a week with nothing in it costs nothing');
    assert.equal(a.ledger.rows.length, 0);
  });

  test('a ready review is authorized once for this household and day, shown, and saved as a receipt', async () => {
    const a = app();
    const out = await run(a, ENOUGH());
    assert.equal(out.kind, 'ready');
    assert.equal(out.saved, 'recorded');
    assert.equal(a.gateCalls.length, 1);
    assert.deepEqual(a.gateCalls[0], { householdId: HOUSEHOLD, idempotencyKey: reviewKeyFor(TODAY) });
    assert.equal(out.reviewKey, `momentum-week-${TODAY}`);
    const [row] = a.ledger.rows;
    assert.equal(row.featureKey, 'momentum_report');
    assert.equal(row.kind, 'momentum.weekly_review');
    assert.equal(row.status, 'applied');
    assert.equal(row.afterSnapshot.counts.tasksCompleted, 5);
  });

  test('the saved receipt carries numbers and typed references only — never a title, note or amount', async () => {
    const a = app();
    await run(a, [...ENOUGH(), defer('Sensitive-Task-Id', '2026-09-26', '2026-09-26', '2026-09-27'), defer('Sensitive-Task-Id', '2026-09-28', '2026-09-28', '2026-09-29'), defer('Sensitive-Task-Id', '2026-09-30', '2026-09-30', '2026-10-01')]);
    const text = JSON.stringify(a.ledger.rows);
    for (const forbidden of ['"title"', '"notes"', '"amount"', '"text"', 'dentist', 'therapy']) assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()), forbidden);
    assert.ok(text.includes('Sensitive-Task-Id'), 'the typed reference is kept so the review can be explained');
  });

  test('a refusal exposes NO report and writes nothing', async () => {
    const a = app({ gate: () => denied('requires_premium') });
    const out = await run(a, ENOUGH());
    assert.equal(out.kind, 'denied');
    assert.equal('report' in out, false);
    assert.equal(a.ledger.rows.length, 0);
  });

  test('a gate outage is "unavailable", never a silent allow, and writes nothing', async () => {
    for (const gateKind of ['unavailable', 'invalid']) {
      const a = app({ gateKind });
      const out = await run(a, ENOUGH());
      assert.deepEqual(out, { kind: 'unavailable', reason: 'server' });
      assert.equal(a.ledger.rows.length, 0);
    }
  });

  test('if receipts cannot be read the review is NOT built (it could blame her for moves she approved) and nothing is charged', async () => {
    const a = app();
    a.ledger.fail = { list: 1 };
    const out = await run(a, ENOUGH());
    assert.deepEqual(out, { kind: 'unavailable', reason: 'receipts' });
    assert.equal(a.gateCalls.length, 0);
  });

  test('opening the review twice the same day is a replay: one authorization key, one receipt', async () => {
    const a = app();
    await run(a, ENOUGH());
    const again = await run(a, ENOUGH());
    assert.equal(again.kind, 'ready');
    assert.equal(again.saved, 'already_saved');
    assert.equal(a.ledger.rows.filter((r) => r.kind === 'momentum.weekly_review').length, 1);
    assert.equal(new Set(a.gateCalls.map((c) => c.idempotencyKey)).size, 1);
  });

  test('a later open the same day with MORE activity still shows the fresh numbers and does not duplicate or overwrite the receipt', async () => {
    const a = app();
    await run(a, ENOUGH());
    const more = await run(a, [...ENOUGH(), done('extra', '2026-09-30')]);
    assert.equal(more.kind, 'ready');
    assert.equal(more.report.counts.tasksCompleted, 6);
    assert.equal(more.saved, 'already_saved');
    assert.equal(a.ledger.rows.length, 1);
    assert.equal(a.ledger.rows[0].afterSnapshot.counts.tasksCompleted, 5, 'the receipt is as-of the first open');
  });

  test('a save failure still shows the review (it was authorized) and says the copy is pending', async () => {
    for (const fail of [{ record: 1 }, { 'transition:approved': 1 }, { 'transition:applied': 1 }]) {
      const a = app();
      a.ledger.fail = fail;
      const out = await run(a, ENOUGH());
      assert.equal(out.kind, 'ready', JSON.stringify(fail));
      assert.equal(out.saved, 'pending', JSON.stringify(fail));
    }
  });

  test('an interrupted save is finished by the next open the same day', async () => {
    const a = app();
    a.ledger.fail = { 'transition:applied': 1 };
    const first = await run(a, ENOUGH());
    assert.equal(first.saved, 'pending');
    assert.equal(a.ledger.rows[0].status, 'approved');
    const second = await run(a, ENOUGH());
    assert.equal(second.saved, 'recorded');
    assert.equal(a.ledger.rows[0].status, 'applied');
    assert.equal(a.ledger.rows.length, 1);
  });

  test('another household’s receipts never enter this household’s review or saved list', async () => {
    const a = app();
    // An applied move that matches a postponement exactly — but in a DIFFERENT household's ledger.
    a.ledger.rows.push({ id: 'x1', householdId: OTHER, featureKey: 'daily_load_premium', kind: 'daily_load.reschedule_task', status: 'applied', idempotencyKey: 'k', proposalRef: { kind: 'task', id: 't1' }, proposalDigest: 'd1', beforeSnapshot: { plan: { kind: 'day', date: '2026-09-28' } }, afterSnapshot: { plan: { kind: 'day', date: '2026-09-29' } }, plannedSnapshot: null, proposedAt: '2026-09-28T15:50:00.000Z', appliedAt: '2026-09-28T16:00:00.000Z', revertedAt: null, updatedAt: '2026-09-28T16:00:00.000Z' });
    const out = await run(a, [...ENOUGH(), defer('t1', '2026-09-28', '2026-09-28', '2026-09-29', { occurredAt: '2026-09-28T16:00:05.000Z' })]);
    assert.equal(out.kind, 'ready');
    assert.equal(out.report.counts.postponements, 1, 'not attributed to a suggestion from someone else’s household');
    assert.equal(out.report.counts.suggestionsApplied, 0);
  });
});

// ---------------------------------------------------------------------------------------------------- attribution through the ledger

describe('MOMF-ATTRIBUTION — receipts from the shared ledger explain the household’s own records', () => {
  const dailyLoadRow = (over = {}) => ({
    id: 'dl-1', householdId: HOUSEHOLD, featureKey: 'daily_load_premium', kind: 'daily_load.reschedule_task', status: 'applied', idempotencyKey: 'k1',
    proposalRef: { kind: 'task', id: 't1' }, sourceRef: { kind: 'day', id: '2026-09-28' }, proposalDigest: 'd1', corrected: false,
    beforeSnapshot: { plan: { kind: 'day', date: '2026-09-28' } }, plannedSnapshot: { plan: { kind: 'day', date: '2026-09-29' } }, afterSnapshot: { plan: { kind: 'day', date: '2026-09-29' } },
    failureCode: null, proposedAt: '2026-09-28T15:50:00.000Z', appliedAt: '2026-09-28T16:00:00.000Z', revertedAt: null, updatedAt: '2026-09-28T16:00:00.000Z', ...over,
  });
  const move = defer('t1', '2026-09-28', '2026-09-28', '2026-09-29', { occurredAt: '2026-09-28T16:00:05.000Z' });

  test('an approved Daily Load move is reported as the suggestion, not as her postponing it — end to end through the real ledger shape', async () => {
    const a = app();
    a.ledger.rows.push(dailyLoadRow());
    const out = await run(a, [...ENOUGH(), move]);
    assert.equal(out.kind, 'ready');
    assert.equal(out.report.counts.suggestionsApplied, 1);
    assert.equal(out.report.counts.postponements, 0);
    assert.deepEqual(out.report.patterns, []);
  });

  test('the same observation with no receipt is her own postponement', async () => {
    const out = await run(app(), [...ENOUGH(), move]);
    assert.equal(out.report.counts.postponements, 1);
  });

  test('an undone suggestion is shown as undone', async () => {
    const a = app();
    a.ledger.rows.push(dailyLoadRow({ status: 'reverted', revertedAt: '2026-09-29T12:00:00.000Z' }));
    const out = await run(a, [...ENOUGH(), move]);
    assert.equal(out.report.counts.suggestionsApplied, 0);
    assert.equal(out.report.counts.suggestionsReverted, 1);
  });

  test('decisionsFrom reads only Daily Load receipts and survives malformed snapshots', () => {
    const rows = [dailyLoadRow(), dailyLoadRow({ id: 'dl-2', beforeSnapshot: null, afterSnapshot: { plan: 'garbage' }, plannedSnapshot: null, proposedAt: 'not-a-date', appliedAt: null, updatedAt: 'nope' }), { ...dailyLoadRow({ id: 'other' }), featureKey: 'momentum_report' }];
    const decisions = decisionsFrom(rows, TZ);
    assert.deepEqual(decisions.map((d) => d.id), ['dl-1', 'dl-2']);
    assert.equal(decisions[0].beforeDate, '2026-09-28');
    assert.equal(decisions[0].afterDate, '2026-09-29');
    assert.equal(decisions[1].beforeDate, null);
    assert.equal(decisions[1].afterDate, null);
    assert.equal(Number.isNaN(decisions[1].proposedAtMs), false);
  });

  test('a timed plan is read as the household’s own logical day', () => {
    const [d] = decisionsFrom([dailyLoadRow({ beforeSnapshot: { plan: { kind: 'timed', startsAt: '2026-09-29T02:30:00.000Z' } } })], TZ);
    assert.equal(d.beforeDate, '2026-09-28', '02:30Z is the previous evening in New York');
  });
});

// ------------------------------------------------------------------------------------------------------------ saved reviews, no subscription

describe('MOMF-SAVED — what she already has stays readable', () => {
  test('saved reviews are listed with NO authorization, even when every new review would be refused (an expired subscription)', async () => {
    const a = app();
    await run(a, ENOUGH());
    const expired = app({ gate: () => denied('entitlement_expired') });
    expired.ledger.rows = a.ledger.rows;
    const calls = expired.gateCalls.length;
    const listed = await listSavedReviews(expired.deps);
    assert.equal(listed.kind, 'ok');
    assert.equal(listed.reviews.length, 1);
    assert.equal(listed.reviews[0].report.counts.tasksCompleted, 5);
    assert.equal(expired.gateCalls.length, calls, 'reading consulted no gate');
    // and a NEW review is refused for the same account
    const fresh = await run(expired, [...ENOUGH(), done('z', '2026-09-30')]);
    assert.equal(fresh.kind, 'denied');
  });

  test('only valid, applied Momentum reviews are returned; invalid, unfinished and foreign rows are left out', async () => {
    const a = app();
    await run(a, ENOUGH());
    const good = a.ledger.rows[0];
    a.ledger.rows.push({ ...good, id: 'bad-version', idempotencyKey: 'k2', afterSnapshot: { ...good.afterSnapshot, v: 'momentum-v0' } });
    a.ledger.rows.push({ ...good, id: 'unfinished', idempotencyKey: 'k3', status: 'approved' });
    a.ledger.rows.push({ ...good, id: 'other-kind', idempotencyKey: 'k4', kind: 'momentum.next_step' });
    a.ledger.rows.push({ ...good, id: 'other-house', idempotencyKey: 'k5', householdId: OTHER });
    const listed = await listSavedReviews(a.deps);
    assert.deepEqual(listed.reviews.map((r) => r.id), [good.id]);
  });

  test('one per period, newest period first', async () => {
    const a = app();
    const mk = (id, end, savedAt) => ({ ...FAKE_ROW(id), afterSnapshot: snapshotEnding(end), appliedAt: savedAt, updatedAt: savedAt });
    const FAKE_ROW = (id) => ({ id, householdId: HOUSEHOLD, featureKey: 'momentum_report', kind: 'momentum.weekly_review', status: 'applied', idempotencyKey: id, proposalRef: { kind: 'period', id: 'x' }, proposalDigest: id });
    const base = (await (async () => { await run(a, ENOUGH()); return a.ledger.rows[0].afterSnapshot; })());
    a.ledger.rows = [];
    const snapshotEnding = (end) => ({ ...base, period: { ...base.period, end } });
    a.ledger.rows.push(mk('r1', '2026-09-23', '2026-09-23T20:00:00.000Z'), mk('r2', '2026-09-30', '2026-09-30T20:00:00.000Z'), mk('r3', '2026-09-30', '2026-09-30T22:00:00.000Z'));
    const listed = await listSavedReviews(a.deps);
    assert.deepEqual(listed.reviews.map((r) => r.id), ['r3', 'r1']);
  });

  test('an unreadable ledger is "unavailable", not an empty history', async () => {
    const a = app();
    a.ledger.fail = { list: 1 };
    assert.deepEqual(await listSavedReviews(a.deps), { kind: 'unavailable' });
  });
});

// ------------------------------------------------------------------------------------------------------------ the next step she approves

describe('MOMF-NEXTSTEP — approval records a choice and changes nothing', () => {
  const about = { kind: 'task', id: 't9' };

  test('it can only be approved for a review the server allowed', async () => {
    const a = app();
    const unauthorized = await approveNextStep(a.deps, { reviewKey: 'momentum-week-2026-09-30', about });
    assert.deepEqual(unauthorized, { kind: 'not_allowed' });
    assert.equal(a.ledger.rows.length, 0);
  });

  test('approving records one approved receipt; approving again is "already approved"', async () => {
    const a = app();
    await run(a, ENOUGH());
    const key = reviewKeyFor(TODAY);
    assert.equal(await nextStepApproved(a.deps, key), false);
    assert.deepEqual(await approveNextStep(a.deps, { reviewKey: key, about }), { kind: 'approved' });
    assert.deepEqual(await approveNextStep(a.deps, { reviewKey: key, about }), { kind: 'already_approved' });
    assert.equal(await nextStepApproved(a.deps, key), true);
    const rows = a.ledger.rows.filter((r) => r.kind === 'momentum.next_step');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'approved');
    assert.deepEqual(rows[0].proposalRef, about);
  });

  test('a ledger outage is "unavailable", and the choice is not claimed', async () => {
    const a = app();
    await run(a, ENOUGH());
    a.ledger.fail = { record: 1 };
    assert.deepEqual(await approveNextStep(a.deps, { reviewKey: reviewKeyFor(TODAY), about }), { kind: 'unavailable' });
    assert.equal(await nextStepApproved(a.deps, reviewKeyFor(TODAY)), false);
  });
});
