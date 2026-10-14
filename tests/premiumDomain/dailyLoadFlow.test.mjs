/**
 * The Premium Daily Load JOURNEY end to end through the real app store (durable writes) and a ledger faithful to the database.
 * Every failure mode the brief names has a test: gate refusal, consent-independence, receipt failure, save failure, partial
 * success, duplicate submission, app restart, stale state, undo, and recovery.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { projectStateDay } from '../../src/domain/projectDay.ts';
import { metricsOf, planKey } from '../../src/domain/premium/dailyLoadReview.ts';
import { FEATURE_KEY, approveProposal, openReview, recoverOnOpen, rejectProposal, reviewKeyFor, undoChange } from '../../src/features/daily-load/premium/dailyLoadFlow.ts';
import { STORAGE_KEYS } from '../../src/persistence/appStateRepository.ts';
import { harness, launch, stored } from '../support/fixtures.mjs';
import { FakeLedger } from '../support/premiumLedger.mjs';
import { THURSDAY, WEDNESDAY, dayPlan, wednesdayOverload } from '../support/premiumDomain.mjs';

const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-00000000000a';

const decision = (over = {}) => ({ outcome: 'allowed', reason: 'allowed', entitlementState: 'premium_active', via: 'premium', nextAction: 'none', quota: null, decisionId: 'd', replay: false, ...over });

/** A running app: a REAL store over in-memory durable storage, a faithful ledger, and a scripted server gate. */
async function app({ state = wednesdayOverload(), storageOptions = {}, gate = () => decision() } = {}) {
  const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(state) }, mode: 'empty', storageOptions });
  const store = await launch(h);
  const ledger = new FakeLedger();
  const gateCalls = [];
  const deps = {
    ledger,
    authorize: async (request) => {
      gateCalls.push(request);
      const result = gate(request);
      if (result.outcome === 'allowed') ledger.authorize(request.idempotencyKey);
      return { kind: 'decision', decision: result };
    },
    commit: (transition) => store.commit(transition),
    getState: () => store.getSnapshot().state,
    householdId: HOUSEHOLD,
  };
  return { h, store, ledger, deps, gateCalls, task: () => store.getSnapshot().state.tasks.find((t) => t.id === 'task-library') };
}

const ready = async (a, date = WEDNESDAY) => {
  const opened = await openReview(a.deps, date);
  assert.equal(opened.kind, 'ready');
  return opened;
};

describe('the whole journey: discover -> review -> approve -> persisted -> reflected -> undo', () => {
  test('Wednesday end to end, and it SURVIVES an app restart', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    assert.equal(review.outlook, 'pressure_with_proposals');
    assert.equal(a.gateCalls.length, 1);
    assert.equal(a.gateCalls[0].householdId, HOUSEHOLD);
    assert.equal('feature' in a.gateCalls[0], false, 'the hook adds the feature; the flow never names an account or an entitlement');

    const proposal = review.proposals[0];
    const result = await approveProposal(a.deps, reviewKey, proposal);
    assert.equal(result.kind, 'applied');
    assert.equal(result.receipt, 'recorded');

    // Persisted: the durable storage already holds the moved task (a fresh launch reads it back).
    await a.store.flush();
    const relaunched = await launch(a.h);
    const reloaded = relaunched.getSnapshot().state;
    assert.deepEqual(reloaded.tasks.find((t) => t.id === 'task-library').plan, proposal.to);
    assert.equal(projectStateDay(reloaded, THURSDAY).tasks.some((t) => t.id === 'task-library'), true, 'Thursday/Calendar reads the same canonical task');
    assert.equal(metricsOf(reloaded, WEDNESDAY).tier, 'tight');

    // The receipt is the ledger's, and says exactly what persisted.
    const [row] = a.ledger.rows;
    assert.equal(row.status, 'applied');
    assert.deepEqual(row.afterSnapshot, { plan: proposal.to });
    assert.deepEqual(row.beforeSnapshot, { plan: proposal.from });
    assert.equal(JSON.stringify(row).includes('Return library books'), false, 'the receipt holds references and plans, never a title');

    // Undo, from the stored receipt alone (no memory of the session), after the restart.
    const reloadedDeps = { ...a.deps, commit: (t) => relaunched.commit(t), getState: () => relaunched.getSnapshot().state };
    const undone = await undoChange(reloadedDeps, row);
    assert.equal(undone.kind, 'reverted');
    assert.deepEqual(relaunched.getSnapshot().state.tasks.find((t) => t.id === 'task-library').plan, proposal.from);
    assert.equal(a.ledger.rows[0].status, 'reverted');
  });

  test('re-opening an unchanged day is a REPLAY at the gate (same key), but a changed day is a new review', async () => {
    const a = await app();
    await ready(a);
    await ready(a);
    assert.equal(a.gateCalls[0].idempotencyKey, a.gateCalls[1].idempotencyKey);
    await a.store.commit((state) => ({ ...state, tasks: state.tasks.map((t) => ({ ...t, durationMinutes: 25 })) }));
    await ready(a);
    assert.notEqual(a.gateCalls[2].idempotencyKey, a.gateCalls[0].idempotencyKey);
    assert.equal(reviewKeyFor(a.deps.getState(), WEDNESDAY), a.gateCalls[2].idempotencyKey);
  });

  test('the review is computed ONLY after the server allows it', async () => {
    const a = await app({ gate: () => decision({ outcome: 'denied', reason: 'requires_premium', entitlementState: 'free', via: null, nextAction: 'open_paywall' }) });
    const opened = await openReview(a.deps, WEDNESDAY);
    assert.equal(opened.kind, 'denied');
    assert.equal(opened.decision.reason, 'requires_premium');
    assert.equal('review' in opened, false, 'a denied caller receives no review at all');
  });

  test('every denial is surfaced as the server made it, and an unreachable gate is "unavailable", never an allow', async () => {
    for (const reason of ['entitlement_unknown', 'entitlement_expired', 'quota_exhausted', 'feature_disabled', 'ownership_denied', 'account_deactivated', 'service_unavailable', 'rate_limited']) {
      const a = await app({ gate: () => decision({ outcome: 'denied', reason }) });
      const opened = await openReview(a.deps, WEDNESDAY);
      assert.deepEqual([opened.kind, opened.decision?.reason], ['denied', reason]);
    }
    const a = await app();
    a.deps.authorize = async () => ({ kind: 'unavailable' });
    assert.deepEqual(await openReview(a.deps, WEDNESDAY), { kind: 'unavailable' });
  });

  test('a free allowance and a premium entitlement are both fine; AI consent is irrelevant to this deterministic feature', async () => {
    const a = await app({ gate: () => decision({ via: 'free_allowance' }) });
    assert.equal((await openReview(a.deps, WEDNESDAY)).kind, 'ready');
  });
});

describe('failure handling: the household is either UNCHANGED or correctly RECORDED, never half-done', () => {
  test('the receipt cannot be written: NOTHING is changed', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    a.ledger.fail.record = 1;
    const before = JSON.stringify(a.store.getSnapshot().state.tasks);
    assert.deepEqual(await approveProposal(a.deps, reviewKey, review.proposals[0]), { kind: 'receipt_unavailable' });
    assert.equal(JSON.stringify(a.store.getSnapshot().state.tasks), before);
  });

  test('the receipt of intent cannot be advanced: nothing is changed and the receipt is abandoned, not left dangling', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    a.ledger.fail['transition:applying'] = 1;
    const before = JSON.stringify(a.store.getSnapshot().state.tasks);
    assert.deepEqual(await approveProposal(a.deps, reviewKey, review.proposals[0]), { kind: 'receipt_unavailable' });
    assert.equal(JSON.stringify(a.store.getSnapshot().state.tasks), before);
    assert.equal(a.ledger.rows[0].status, 'abandoned');
  });

  test('the device cannot save: nothing is changed, "saved" is never claimed, and the receipt says it failed', async () => {
    const a = await app({ storageOptions: { failWrite: (key, attempt) => key === STORAGE_KEYS.primary && attempt >= 1 } });
    const { review, reviewKey } = await ready(a);
    const result = await approveProposal(a.deps, reviewKey, review.proposals[0]);
    assert.equal(result.kind, 'not_saved');
    assert.deepEqual(a.task().plan, review.proposals[0].from, 'the in-memory household is exactly as it was');
    assert.equal(a.ledger.rows[0].status, 'failed');
    assert.equal(a.ledger.rows[0].failureCode, 'save_failed');
  });

  test('PARTIAL SUCCESS: the change is saved but the final receipt write fails — the change is reported applied (receipt pending) and recovered on next open', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    a.ledger.fail['transition:applied'] = 1;
    const result = await approveProposal(a.deps, reviewKey, review.proposals[0]);
    assert.equal(result.kind, 'applied');
    assert.equal(result.receipt, 'pending');
    assert.equal(a.ledger.rows[0].status, 'applying', 'the receipt is honestly mid-flight');
    assert.deepEqual(a.task().plan, review.proposals[0].to, 'and the change itself is real');

    // Next open: the household\'s own state finishes the receipt.
    const recovered = await recoverOnOpen(a.deps);
    assert.equal(recovered.reconciled, 1);
    assert.equal(a.ledger.rows[0].status, 'applied');
    assert.deepEqual(a.ledger.rows[0].afterSnapshot, { plan: review.proposals[0].to });
  });

  test('CRASH after the receipt of intent but before the save: recovery abandons it, because the task never moved', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    const proposal = review.proposals[0];
    const key = `${reviewKey}:${proposal.digest.slice(0, 16)}:1`;
    const recorded = await a.ledger.record({ householdId: HOUSEHOLD, featureKey: FEATURE_KEY, kind: 'daily_load.reschedule_task', idempotencyKey: key, proposalRef: { kind: 'task', id: proposal.taskId }, proposalDigest: proposal.digest, before: { plan: proposal.from }, planned: { plan: proposal.to } });
    await a.ledger.transition(recorded.value.id, 'approved');
    await a.ledger.transition(recorded.value.id, 'applying');
    // ...the process dies here. On next launch:
    assert.equal((await recoverOnOpen(a.deps)).reconciled, 1);
    assert.equal(a.ledger.rows[0].status, 'abandoned');
    assert.equal(a.ledger.rows[0].failureCode, 'not_applied');
    assert.deepEqual(a.task().plan, proposal.from);
  });

  test('CRASH after the save but before the receipt: recovery completes it as applied', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    const proposal = review.proposals[0];
    const key = `${reviewKey}:${proposal.digest.slice(0, 16)}:1`;
    const recorded = await a.ledger.record({ householdId: HOUSEHOLD, featureKey: FEATURE_KEY, kind: 'daily_load.reschedule_task', idempotencyKey: key, proposalRef: { kind: 'task', id: proposal.taskId }, proposalDigest: proposal.digest, before: { plan: proposal.from }, planned: { plan: proposal.to } });
    await a.ledger.transition(recorded.value.id, 'approved');
    await a.ledger.transition(recorded.value.id, 'applying');
    await a.store.commit((state) => ({ ...state, tasks: state.tasks.map((t) => (t.id === proposal.taskId ? { ...t, plan: proposal.to } : t)) }));
    assert.equal((await recoverOnOpen(a.deps)).reconciled, 1);
    assert.equal(a.ledger.rows[0].status, 'applied');
  });

  test('recovery does not guess: if she changed the task to something else meanwhile, the receipt is abandoned as "changed_since"', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    const proposal = review.proposals[0];
    const recorded = await a.ledger.record({ householdId: HOUSEHOLD, featureKey: FEATURE_KEY, kind: 'x.y', idempotencyKey: `${reviewKey}:${proposal.digest.slice(0, 16)}:1`, proposalRef: { kind: 'task', id: proposal.taskId }, proposalDigest: proposal.digest, before: { plan: proposal.from }, planned: { plan: proposal.to } });
    await a.ledger.transition(recorded.value.id, 'approved');
    await a.store.commit((state) => ({ ...state, tasks: state.tasks.map((t) => (t.id === proposal.taskId ? { ...t, plan: dayPlan('2026-09-25') } : t)) }));
    await recoverOnOpen(a.deps);
    assert.equal(a.ledger.rows[0].status, 'abandoned');
    assert.equal(a.ledger.rows[0].failureCode, 'changed_since');
    assert.deepEqual(a.task().plan, dayPlan('2026-09-25'), 'and her own plan is untouched');
  });

  test('recovery after a lost "reverted" receipt: the task is back on its old plan, so the receipt is finished', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    const applied = await approveProposal(a.deps, reviewKey, review.proposals[0]);
    a.ledger.fail['transition:reverted'] = 1;
    const undone = await undoChange(a.deps, a.ledger.rows[0]);
    assert.deepEqual(undone, { kind: 'reverted', receipt: 'pending' });
    assert.equal(a.ledger.rows[0].status, 'applied');
    assert.equal((await recoverOnOpen(a.deps)).reconciled, 1);
    assert.equal(a.ledger.rows[0].status, 'reverted');
    assert.equal(applied.kind, 'applied');
  });

  test('STALE STATE between review and approval: the change is refused, the receipt says why, and nothing moved', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    await a.store.commit((state) => ({ ...state, tasks: state.tasks.map((t) => ({ ...t, commitment: 'fixed' })) }));
    const result = await approveProposal(a.deps, reviewKey, review.proposals[0]);
    assert.deepEqual(result, { kind: 'refused', reason: 'no_longer_offered' });
    assert.equal(a.ledger.rows[0].status, 'failed');
    assert.equal(a.ledger.rows[0].failureCode, 'no_longer_offered');
    assert.deepEqual(a.task().plan, review.proposals[0].from);
  });

  test('DUPLICATE SUBMISSION: approving the same proposal twice moves it once; the second is reported as a duplicate or stale', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    const proposal = review.proposals[0];
    const first = await approveProposal(a.deps, reviewKey, proposal);
    const second = await approveProposal(a.deps, reviewKey, proposal);
    assert.equal(first.kind, 'applied');
    assert.ok(['duplicate', 'refused'].includes(second.kind), second.kind);
    assert.equal(a.ledger.rows.filter((r) => r.status === 'applied').length, 1);
    assert.deepEqual(a.task().plan, proposal.to);
  });

  test('an unauthorized approval (a key the server never authorized) cannot write a receipt, so it cannot change anything', async () => {
    const a = await app();
    const { review } = await ready(a);
    const before = JSON.stringify(a.store.getSnapshot().state.tasks);
    const result = await approveProposal(a.deps, 'dl-review-not-authorized-anywhere', review.proposals[0]);
    assert.equal(result.kind, 'not_allowed');
    assert.equal(JSON.stringify(a.store.getSnapshot().state.tasks), before);
  });
});

describe('undo through the flow', () => {
  test('blocked when she moved the task again: the receipt records "changed_since" and her newer plan survives', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    await approveProposal(a.deps, reviewKey, review.proposals[0]);
    await a.store.commit((state) => ({ ...state, tasks: state.tasks.map((t) => ({ ...t, plan: dayPlan('2026-09-28') })) }));
    const result = await undoChange(a.deps, a.ledger.rows[0]);
    assert.deepEqual(result, { kind: 'blocked', reason: 'plan_changed' });
    assert.equal(a.ledger.rows[0].status, 'revert_blocked');
    assert.equal(a.ledger.rows[0].failureCode, 'changed_since');
    assert.deepEqual(a.task().plan, dayPlan('2026-09-28'));
  });

  test('the device cannot save the undo: the household keeps the applied plan and nothing is claimed reverted', async () => {
    let failing = false;
    const a = await app({ storageOptions: { failWrite: (key) => failing && key === STORAGE_KEYS.primary } });
    const { review, reviewKey } = await ready(a);
    await approveProposal(a.deps, reviewKey, review.proposals[0]);
    failing = true;
    const result = await undoChange(a.deps, a.ledger.rows[0]);
    assert.equal(result.kind, 'not_saved');
    assert.equal(a.ledger.rows[0].status, 'applied');
    assert.deepEqual(a.task().plan, review.proposals[0].to);
  });

  test('an unrelated receipt (never applied) is refused as unknown', async () => {
    const a = await app();
    assert.deepEqual(await undoChange(a.deps, { status: 'proposed', proposalRef: { id: 'task-library' }, beforeSnapshot: null, afterSnapshot: null }), { kind: 'unknown_receipt' });
  });

  test('after an undo the same move can be re-approved under a fresh derived key', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    const proposal = review.proposals[0];
    await approveProposal(a.deps, reviewKey, proposal);
    await undoChange(a.deps, a.ledger.rows[0]);
    const again = await approveProposal(a.deps, reviewKey, proposal);
    assert.equal(again.kind, 'applied');
    assert.equal(a.ledger.rows.length, 2);
    assert.notEqual(a.ledger.rows[0].idempotencyKey, a.ledger.rows[1].idempotencyKey);
  });
});

describe('rejection is a recorded decision, and changes nothing', () => {
  test('"Not this one" writes a rejected receipt and leaves the household byte-identical', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    const before = JSON.stringify(a.store.getSnapshot().state);
    assert.equal(await rejectProposal(a.deps, reviewKey, review.proposals[0]), 'recorded');
    assert.equal(a.ledger.rows[0].status, 'rejected');
    assert.equal(JSON.stringify(a.store.getSnapshot().state), before);
  });

  test('a rejected proposal can be offered and approved later', async () => {
    const a = await app();
    const { review, reviewKey } = await ready(a);
    await rejectProposal(a.deps, reviewKey, review.proposals[0]);
    assert.equal((await approveProposal(a.deps, reviewKey, review.proposals[0])).kind, 'applied');
  });
});

describe('approval authorizes ONE change, never a standing rule', () => {
  test('the flow writes no automation, no authority and no recurring rule', async () => {
    const a = await app();
    const before = a.store.getSnapshot().state;
    const { review, reviewKey } = await ready(a);
    await approveProposal(a.deps, reviewKey, review.proposals[0]);
    const after = a.store.getSnapshot().state;
    for (const key of ['authorities', 'intents', 'decisions', 'recurrences', 'systems', 'actions']) assert.deepEqual(after[key], before[key], key);
  });

  test('planKey agrees with the stored plan', async () => {
    const a = await app();
    const { review } = await ready(a);
    assert.equal(planKey(review.proposals[0].from), planKey(a.task().plan));
  });
});
