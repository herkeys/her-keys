import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createEmptyState } from '../../src/state/initialState.ts';
import { acknowledge, accept, decline } from '../../src/domain/responsibility.ts';
import { completeFollowUp, createMoneyFollowUp } from '../../src/features/coparent/mutations.ts';
import { outstandingReimbursements, recentlyResolvedReimbursements, reimbursementProjections } from '../../src/features/money/reimbursements.ts';

/**
 * The F07 -> Money mapping (docs/builds/HK_FEATURE_09_MONEY.md, "F07 reimbursement mapping").
 * Zero imports from src/features/coparent beyond its own public index-equivalent exports —
 * these tests prove the read-side interpretation against F07's REAL states, not an assumption.
 */

const TZ = 'America/New_York';
const DAY = '2026-09-16';
const MORNING = Date.UTC(2026, 8, 16, 14, 0);

function ctx(overrides = {}) {
  let counter = 0;
  return { nowMs: MORNING, today: DAY, createId: (prefix) => `${prefix}-${++counter}`, ...overrides };
}

const followUpFields = (overrides = {}) => ({
  childId: null,
  title: 'Soccer registration',
  amountText: '80',
  currency: 'USD',
  direction: 'inflow',
  followUpDate: '2026-09-25',
  notes: '',
  ...overrides,
});

function worldWithFollowUp(c, counterpart = { kind: 'none' }) {
  const state = createEmptyState(TZ);
  const result = createMoneyFollowUp(state, c, followUpFields(), counterpart);
  return { state: result.state, taskId: result.id, householdId: result.state.household.id };
}

const clockOf = (c) => ({ nowMs: c.nowMs });

describe('F07 reimbursement mapping — real states only, zero changes to src/features/coparent', () => {
  test('a bare follow-up with no responsibility recorded is "not_followed_up", and excluded from outstanding', () => {
    const c = ctx();
    const w = worldWithFollowUp(c);
    const all = reimbursementProjections(w.state, w.householdId, clockOf(c));
    assert.equal(all.length, 1);
    assert.equal(all[0].interpretation, 'not_followed_up');
    assert.equal(all[0].resolved, false);
    assert.equal(outstandingReimbursements(w.state, w.householdId, clockOf(c)).length, 0, 'not surfaced until she has recorded a request');
  });

  test('REQUESTED: recording a request to a counterpart is outstanding, never treated as paid', () => {
    const c = ctx();
    const w = worldWithFollowUp(c, { kind: 'new', displayName: 'Alex', relationship: 'co-parent' });
    const projections = outstandingReimbursements(w.state, w.householdId, clockOf(c));
    assert.equal(projections.length, 1);
    assert.equal(projections[0].interpretation, 'requested');
    assert.equal(projections[0].resolved, false);
  });

  test('ACKNOWLEDGED is still outstanding: seeing a request is not agreeing to it, and never reads as paid', () => {
    const c = ctx();
    const w = worldWithFollowUp(c, { kind: 'new', displayName: 'Alex', relationship: 'co-parent' });
    const responsibilityId = w.state.responsibilities.find((r) => r.about.id === w.taskId).id;
    const acked = acknowledge(w.state, c, responsibilityId);
    const projections = outstandingReimbursements(acked, w.householdId, clockOf(c));
    assert.equal(projections[0].interpretation, 'acknowledged');
    assert.equal(projections[0].resolved, false, 'ACKNOWLEDGED != ACCEPTED != PAID');
  });

  test('ACCEPTED is still outstanding: an agreement is not money', () => {
    const c = ctx();
    const w = worldWithFollowUp(c, { kind: 'new', displayName: 'Alex', relationship: 'co-parent' });
    const responsibilityId = w.state.responsibilities.find((r) => r.about.id === w.taskId).id;
    const accepted = accept(w.state, c, responsibilityId);
    const projections = outstandingReimbursements(accepted, w.householdId, clockOf(c));
    assert.equal(projections[0].interpretation, 'accepted');
    assert.equal(projections[0].resolved, false);
  });

  test('DECLINED is still outstanding financially — declining the follow-up work is not a financial resolution', () => {
    const c = ctx();
    const w = worldWithFollowUp(c, { kind: 'new', displayName: 'Alex', relationship: 'co-parent' });
    const responsibilityId = w.state.responsibilities.find((r) => r.about.id === w.taskId).id;
    const declined = decline(w.state, c, responsibilityId);
    const projections = outstandingReimbursements(declined, w.householdId, clockOf(c));
    assert.equal(projections[0].interpretation, 'declined');
    assert.equal(projections[0].resolved, false);
  });

  test('MARKED DONE, NO PAYMENT EVIDENCE: the doctrine-critical row — task completion never implies payment', () => {
    const c = ctx();
    const w = worldWithFollowUp(c, { kind: 'new', displayName: 'Alex', relationship: 'co-parent' });
    const responsibilityId = w.state.responsibilities.find((r) => r.about.id === w.taskId).id;
    let state = accept(w.state, c, responsibilityId);
    state = completeFollowUp(state, c, w.taskId).state;
    const all = reimbursementProjections(state, w.householdId, clockOf(c));
    assert.equal(all[0].interpretation, 'marked_done_no_payment_record');
    assert.equal(all[0].resolved, false, 'done != paid, even after an ACCEPTED agreement');
    assert.equal(outstandingReimbursements(state, w.householdId, clockOf(c)).length, 1, 'stays in Outstanding, not Recently resolved');
    assert.equal(recentlyResolvedReimbursements(state, w.householdId, clockOf(c)).length, 0);
  });

  test('no reimbursement is ever paid without real payment evidence (there is none reachable on this baseline — MP-07-06)', () => {
    const c = ctx();
    const w = worldWithFollowUp(c, { kind: 'new', displayName: 'Alex', relationship: 'co-parent' });
    const responsibilityId = w.state.responsibilities.find((r) => r.about.id === w.taskId).id;
    const state = accept(w.state, c, responsibilityId);
    for (const r of reimbursementProjections(state, w.householdId, clockOf(c))) {
      assert.notEqual(r.interpretation, 'paid');
      assert.equal(r.resolved, false);
    }
  });

  test('a removed follow-up is excluded from Money entirely, not resurrected as anything', () => {
    const c = ctx();
    const w = worldWithFollowUp(c);
    // F07 only allows removing an open follow-up; simulate the removed state directly via canonical status,
    // exactly how buildCoParentLogisticsView reads it (status archived => standing 'removed').
    const removed = { ...w.state, tasks: w.state.tasks.map((t) => (t.id === w.taskId ? { ...t, status: 'archived' } : t)) };
    assert.equal(reimbursementProjections(removed, w.householdId, clockOf(c)).length, 0);
  });
});
