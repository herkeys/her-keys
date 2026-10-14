import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { projectStateDay } from '../../src/domain/projectDay.ts';
import { applyReschedule, recoverInFlight, undoReschedule } from '../../src/domain/premium/dailyLoadChange.ts';
import { metricsOf, planKey, reviewDay } from '../../src/domain/premium/dailyLoadReview.ts';
import { THURSDAY, WEDNESDAY, dayPlan, makeCtx, nyMs, task, timedPlan, updateTask, wednesdayOverload } from '../support/premiumDomain.mjs';

const firstProposal = (state) => reviewDay(state, WEDNESDAY).proposals[0];
const taskOf = (state, id = 'task-library') => state.tasks.find((t) => t.id === id);
const apply = (state, proposal = firstProposal(state), ctx = makeCtx()) => applyReschedule(state, ctx, proposal);

describe('applying one approved change', () => {
  test('moves the task through the canonical mutation, and Wednesday gets better (recomputed, not asserted)', () => {
    const state = wednesdayOverload();
    const proposal = firstProposal(state);
    const result = apply(state, proposal);
    assert.equal(result.kind, 'applied');
    assert.deepEqual(taskOf(result.state).plan, proposal.to);
    assert.equal(result.change.digest, proposal.digest);
    assert.deepEqual(result.change.before.plan, proposal.from);
    assert.deepEqual(result.change.after.plan, proposal.to);
    // Today and the calendar read the same canonical task: the errand has left Wednesday and is on Thursday.
    assert.equal(projectStateDay(result.state, WEDNESDAY).tasks.some((t) => t.id === 'task-library'), false);
    assert.equal(projectStateDay(result.state, THURSDAY).tasks.some((t) => t.id === 'task-library'), true);
    assert.equal(metricsOf(result.state, WEDNESDAY).tier, 'tight');
    assert.equal(metricsOf(result.state, WEDNESDAY).tightestBufferMinutes, 30);
    assert.equal(metricsOf(result.state, THURSDAY).tier, 'open');
  });

  test('writes ONLY the plan: title, notes, duration, flexibility, scope and provenance are untouched', () => {
    const state = wednesdayOverload((s) => ({ ...s, tasks: s.tasks.map((t) => ({ ...t, notes: 'bring the bag', title: 'Return library books' })) }));
    const result = apply(state);
    const { plan: _beforePlan, updatedAt: _a, ...beforeRest } = taskOf(state);
    const { plan: _afterPlan, updatedAt: _b, ...afterRest } = taskOf(result.state);
    assert.deepEqual(afterRest, beforeRest);
  });

  test('changes nothing else in the household: other tasks, events and categories are byte-identical', () => {
    const state = wednesdayOverload((s) => task(s, { id: 'task-other', minutes: 15, plan: dayPlan(THURSDAY) }));
    const result = apply(state);
    assert.deepEqual(result.state.events, state.events);
    assert.deepEqual(taskOf(result.state, 'task-other'), taskOf(state, 'task-other'));
    assert.deepEqual(result.state.categories, state.categories);
  });

  test('records the deferral as a fact through the existing observation path (Momentum\'s evidence), once', () => {
    const state = wednesdayOverload();
    const result = apply(state);
    const added = result.state.observations.slice(state.observations.length);
    assert.equal(added.length, 1);
    assert.deepEqual([added[0].about, added[0].outcome, added[0].plannedDate, added[0].toDate], [{ kind: 'task', id: 'task-library' }, 'deferred', WEDNESDAY, THURSDAY]);
  });

  test('applying the same proposal twice is refused the second time (a double tap cannot move it twice)', () => {
    const state = wednesdayOverload();
    const proposal = firstProposal(state);
    const once = apply(state, proposal);
    const twice = applyReschedule(once.state, makeCtx(), proposal);
    assert.deepEqual(twice, { kind: 'refused', reason: 'plan_changed' });
  });

  test('is pure: the input state is never mutated', () => {
    const state = wednesdayOverload();
    const snapshot = JSON.stringify(state);
    apply(state);
    assert.equal(JSON.stringify(state), snapshot);
  });
});

describe('stale-state protection: apply re-checks the CURRENT household and refuses what is no longer what she was shown', () => {
  test('she moved the task herself since', () => {
    const state = wednesdayOverload();
    const proposal = firstProposal(state);
    const edited = updateTask(state, makeCtx(), 'task-library', { plan: dayPlan('2026-09-19') });
    assert.deepEqual(applyReschedule(edited, makeCtx(), proposal), { kind: 'refused', reason: 'plan_changed' });
  });

  test('she finished it, or removed it', () => {
    const state = wednesdayOverload();
    const proposal = firstProposal(state);
    const completed = { ...state, tasks: state.tasks.map((t) => (t.id === 'task-library' ? { ...t, status: 'completed', completedAt: new Date(nyMs(14)).toISOString() } : t)) };
    const archived = { ...state, tasks: state.tasks.map((t) => (t.id === 'task-library' ? { ...t, status: 'archived' } : t)) };
    assert.deepEqual(applyReschedule(completed, makeCtx(), proposal), { kind: 'refused', reason: 'task_not_open' });
    assert.deepEqual(applyReschedule(archived, makeCtx(), proposal), { kind: 'refused', reason: 'task_not_open' });
    assert.deepEqual(applyReschedule({ ...state, tasks: [] }, makeCtx(), proposal), { kind: 'refused', reason: 'task_missing' });
  });

  test('she marked it fixed in the meantime: it is no longer offered', () => {
    const state = wednesdayOverload();
    const proposal = firstProposal(state);
    const fixed = { ...state, tasks: state.tasks.map((t) => ({ ...t, commitment: 'fixed' })) };
    assert.deepEqual(applyReschedule(fixed, makeCtx(), proposal), { kind: 'refused', reason: 'no_longer_offered' });
  });

  test('the destination filled up since (Thursday became overloaded)', () => {
    const state = wednesdayOverload();
    const proposal = firstProposal(state);
    const filled = wednesdayOverload((s) => ({ ...s, events: [...s.events] }));
    const clash = (x) => ({ ...x, events: [...x.events,
      { ...x.events[0], id: 'evt-new-a', startsAt: new Date(nyMs(9, 0, 17)).toISOString(), endsAt: new Date(nyMs(10, 0, 17)).toISOString() },
      { ...x.events[0], id: 'evt-new-b', startsAt: new Date(nyMs(9, 30, 17)).toISOString(), endsAt: new Date(nyMs(10, 30, 17)).toISOString() }] });
    assert.deepEqual(applyReschedule(clash(filled), makeCtx(), proposal), { kind: 'refused', reason: 'no_longer_offered' });
    assert.equal(proposal.toDate, THURSDAY);
  });

  test('the pressure went away (the dentist moved): there is nothing left to improve, so the move is no longer offered', () => {
    const state = wednesdayOverload();
    const proposal = firstProposal(state);
    const relieved = { ...state, events: state.events.filter((e) => e.id !== 'evt-dentist') };
    assert.deepEqual(applyReschedule(relieved, makeCtx(), proposal), { kind: 'refused', reason: 'no_longer_offered' });
  });

  test('a forged proposal (altered destination) is refused: apply trusts the evaluation, not the object it was handed', () => {
    const state = wednesdayOverload();
    const proposal = firstProposal(state);
    const forged = { ...proposal, toDate: '2026-09-18', to: dayPlan('2026-09-18') };
    assert.deepEqual(applyReschedule(state, makeCtx(), forged), { kind: 'refused', reason: 'no_longer_offered' });
    const forgedTask = { ...proposal, taskId: 'task-does-not-exist' };
    assert.deepEqual(applyReschedule(state, makeCtx(), forgedTask), { kind: 'refused', reason: 'task_missing' });
  });

  test('a refusal changes nothing', () => {
    const state = wednesdayOverload();
    const proposal = firstProposal(state);
    const fixed = { ...state, tasks: state.tasks.map((t) => ({ ...t, commitment: 'fixed' })) };
    const before = JSON.stringify(fixed);
    applyReschedule(fixed, makeCtx(), proposal);
    assert.equal(JSON.stringify(fixed), before);
  });
});

describe('undo', () => {
  const moved = () => {
    const state = wednesdayOverload();
    const result = apply(state);
    return { state, after: result.state, change: result.change };
  };

  test('restores the original plan, and Wednesday is exactly as it was', () => {
    const { state, after, change } = moved();
    const undone = undoReschedule(after, makeCtx(), change);
    assert.equal(undone.kind, 'reverted');
    assert.deepEqual(taskOf(undone.state).plan, taskOf(state).plan);
    assert.deepEqual(metricsOf(undone.state, WEDNESDAY), metricsOf(state, WEDNESDAY));
  });

  test('survives an app restart: it needs only the stored receipt and the household, not memory', () => {
    const { after, change } = moved();
    const restartedState = JSON.parse(JSON.stringify(after));
    const storedReceipt = JSON.parse(JSON.stringify({ taskId: change.taskId, before: change.before, after: change.after }));
    assert.equal(undoReschedule(restartedState, makeCtx(), storedReceipt).kind, 'reverted');
  });

  test('does NOT overwrite her unrelated edits: a renamed task keeps its new name through the undo', () => {
    const { after, change } = moved();
    const renamed = updateTask(after, makeCtx(), 'task-library', { title: 'Return the library books (overdue fines!)', notes: 'ask about the fine' });
    const undone = undoReschedule(renamed, makeCtx(), change);
    assert.equal(undone.kind, 'reverted');
    assert.equal(taskOf(undone.state).title, 'Return the library books (overdue fines!)');
    assert.equal(taskOf(undone.state).notes, 'ask about the fine');
    assert.deepEqual(taskOf(undone.state).plan, change.before.plan);
  });

  test('is BLOCKED when she moved the task again since (it never overwrites a decision she made)', () => {
    const { after, change } = moved();
    const movedAgain = updateTask(after, makeCtx(), 'task-library', { plan: dayPlan('2026-09-21') });
    assert.deepEqual(undoReschedule(movedAgain, makeCtx(), change), { kind: 'blocked', reason: 'plan_changed' });
    assert.deepEqual(taskOf(movedAgain).plan, dayPlan('2026-09-21'), 'and her newer plan is untouched');
  });

  test('is BLOCKED when she finished it or archived it, or it is gone', () => {
    const { after, change } = moved();
    const completed = { ...after, tasks: after.tasks.map((t) => ({ ...t, status: 'completed', completedAt: new Date(nyMs(15)).toISOString() })) };
    const archived = { ...after, tasks: after.tasks.map((t) => ({ ...t, status: 'archived' })) };
    assert.deepEqual(undoReschedule(completed, makeCtx(), change), { kind: 'blocked', reason: 'task_not_open' });
    assert.deepEqual(undoReschedule(archived, makeCtx(), change), { kind: 'blocked', reason: 'task_not_open' });
    assert.deepEqual(undoReschedule({ ...after, tasks: [] }, makeCtx(), change), { kind: 'blocked', reason: 'task_missing' });
  });

  test('cannot be undone twice (the second attempt reports exactly why)', () => {
    const { after, change } = moved();
    const once = undoReschedule(after, makeCtx(), change);
    assert.deepEqual(undoReschedule(once.state, makeCtx(), change), { kind: 'blocked', reason: 'plan_changed' });
  });

  test('a blocked undo changes nothing', () => {
    const { after, change } = moved();
    const movedAgain = updateTask(after, makeCtx(), 'task-library', { plan: dayPlan('2026-09-21') });
    const snapshot = JSON.stringify(movedAgain);
    undoReschedule(movedAgain, makeCtx(), change);
    assert.equal(JSON.stringify(movedAgain), snapshot);
  });

  test('after undo the same move can be offered and applied again (undo is not a one-way latch)', () => {
    const { after, change } = moved();
    const undone = undoReschedule(after, makeCtx(), change);
    const again = firstProposal(undone.state);
    assert.equal(again.digest, change.digest);
    assert.equal(apply(undone.state, again).kind, 'applied');
  });
});

describe('recovery from a crash between "approved" and "applied"', () => {
  const receiptFor = (state) => {
    const proposal = firstProposal(state);
    return { taskId: proposal.taskId, before: { plan: proposal.from }, planned: { plan: proposal.to } };
  };

  test('the change HAD been saved: finish the receipt as applied', () => {
    const state = wednesdayOverload();
    const receipt = receiptFor(state);
    const applied = apply(state).state;
    const decision = recoverInFlight(applied, receipt);
    assert.equal(decision.kind, 'mark_applied');
    assert.equal(planKey(decision.after.plan), planKey(receipt.planned.plan));
  });

  test('the change was never saved: abandon the receipt (nothing to undo)', () => {
    const state = wednesdayOverload();
    assert.deepEqual(recoverInFlight(state, receiptFor(state)), { kind: 'abandon', reason: 'not_applied' });
  });

  test('she changed it to something else meanwhile: abandon, and say so', () => {
    const state = wednesdayOverload();
    const receipt = receiptFor(state);
    const elsewhere = updateTask(state, makeCtx(), 'task-library', { plan: dayPlan('2026-09-25') });
    assert.deepEqual(recoverInFlight(elsewhere, receipt), { kind: 'abandon', reason: 'changed_since' });
    assert.deepEqual(recoverInFlight({ ...state, tasks: [] }, receipt), { kind: 'abandon', reason: 'changed_since' });
  });

  test('a stored receipt (plain JSON, as read back from the ledger) is enough', () => {
    const state = wednesdayOverload();
    const receipt = JSON.parse(JSON.stringify(receiptFor(state)));
    assert.equal(recoverInFlight(apply(state).state, receipt).kind, 'mark_applied');
  });
});

describe('what Premium must NOT do to the Free Daily Load', () => {
  test('the Free "move to tomorrow" and the Premium move can both be computed from one household without either mutating it', () => {
    const state = wednesdayOverload();
    const before = JSON.stringify(state);
    reviewDay(state, WEDNESDAY);
    assert.equal(JSON.stringify(state), before);
  });

  test('applying a Premium move records NO action record: it is not a second "decision of the day" and cannot block the Free gate', () => {
    const state = wednesdayOverload();
    const result = apply(state);
    assert.deepEqual(result.state.actions, state.actions);
  });
});
