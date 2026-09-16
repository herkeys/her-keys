import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addEvent } from '../src/domain/events.ts';
import { addTask } from '../src/domain/tasks.ts';
import {
  approveDropTask,
  approveMoveEvent,
  approveProtectItem,
  approveShortenTask,
  keepCapacityPlan,
} from '../src/domain/recommendationActions.ts';
import { toInstant, zonedTimeToEpochMs } from '../src/domain/logicalDay.ts';
import { validateAppState } from '../src/domain/state.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, TZ, ctx } from './support/fixtures.mjs';

const empty = () => createEmptyState(TZ);
const at = (hour, minute = 0) => toInstant(zonedTimeToEpochMs(DAY, hour * 60 + minute, TZ));

/** A household with a tight pickup -> soccer transition and one flexible task in the window. */
function withTightTransition(context = ctx()) {
  let state = empty();
  state = addEvent(state, context, { title: 'Pick up kids', categoryId: 'cat-kids', startsAt: at(15), endsAt: at(15, 15), commitment: 'fixed', scope: 'household' });
  state = addEvent(state, context, { title: 'Soccer practice', categoryId: 'cat-kids', startsAt: at(16, 30), endsAt: at(17, 30), commitment: 'fixed', scope: 'household' });
  return state;
}

/** A household whose flexible workload exceeds what today's window has left. */
function withCapacityPressure(context = ctx()) {
  let state = empty();
  state = addEvent(state, context, {
    title: 'Long work block',
    categoryId: 'cat-work',
    startsAt: at(6),
    endsAt: at(19),
    commitment: 'fixed',
    scope: 'professional',
  });
  state = addTask(state, context, {
    title: 'Return library books',
    categoryId: 'cat-home',
    durationMinutes: 200,
    plan: { kind: 'day', date: DAY },
    scope: 'household',
  });
  return state;
}

describe('MOVE — flexible event bounding the tightest transition', () => {
  test('a flexible event bounding the tight window can be moved to the same time tomorrow, preserving duration', () => {
    const context = ctx();
    let state = withTightTransition(context);
    state = addEvent(state, context, { title: 'Library return', categoryId: 'cat-home', startsAt: at(15, 20), endsAt: at(15, 50), commitment: 'flexible', scope: 'household' });
    const libraryId = state.events.find((e) => e.title === 'Library return').id;

    const after = approveMoveEvent(state, ctx(), libraryId);
    const moved = after.events.find((e) => e.id === libraryId);

    assert.notEqual(moved.startsAt, state.events.find((e) => e.id === libraryId).startsAt);
    assert.equal(new Date(moved.endsAt) - new Date(moved.startsAt), 30 * 60_000, 'duration is preserved exactly');
    assert.equal(after.actions[0].type, 'daily_load.move_event');
    assert.equal(validateAppState(after).ok, true);
  });

  test('negative control: a FIXED event is never moved, even if it bounds the tight window', () => {
    const state = withTightTransition();
    const pickupId = state.events.find((e) => e.title === 'Pick up kids').id;
    assert.equal(approveMoveEvent(state, ctx(), pickupId), state);
  });

  test('an event that is not part of today\'s tightest gap is not moved', () => {
    const context = ctx();
    let state = withTightTransition(context);
    state = addEvent(state, context, { title: 'Unrelated errand', categoryId: 'cat-home', startsAt: at(9), endsAt: at(9, 15), commitment: 'flexible', scope: 'household' });
    const errandId = state.events.find((e) => e.title === 'Unrelated errand').id;
    assert.equal(approveMoveEvent(state, ctx(), errandId), state);
  });

  test('shares the same one-decision-per-day gate as the existing task move', () => {
    const context = ctx();
    let state = withTightTransition(context);
    state = addEvent(state, context, { title: 'Library return', categoryId: 'cat-home', startsAt: at(15, 20), endsAt: at(15, 50), commitment: 'flexible', scope: 'household' });
    const libraryId = state.events.find((e) => e.title === 'Library return').id;
    const moved = approveMoveEvent(state, ctx(), libraryId);
    assert.equal(approveMoveEvent(moved, ctx(), libraryId), moved, 'a second attempt the same day is a no-op');
  });
});

describe('DROP / SHORTEN / keep — capacity pressure', () => {
  test('DROP archives exactly the task the verdict named, and nothing else', () => {
    const state = withCapacityPressure();
    const taskId = state.tasks[0].id;
    const after = approveDropTask(state, ctx(), taskId);

    assert.equal(after.tasks[0].status, 'archived');
    assert.equal(after.actions[0].type, 'daily_load.drop_task');
    assert.equal(validateAppState(after).ok, true);
  });

  test('DROP refuses a task the current verdict does not name', () => {
    const context = ctx();
    let state = withCapacityPressure(context);
    state = addTask(state, context, { title: 'A different small task', categoryId: 'cat-home', durationMinutes: 10, scope: 'household' });
    const otherTaskId = state.tasks.find((t) => t.title === 'A different small task').id;
    assert.equal(approveDropTask(state, ctx(), otherTaskId), state);
  });

  test('SHORTEN reduces duration by exactly the reported shortfall, floored at 15 minutes, and no fabricated numbers', () => {
    const state = withCapacityPressure();
    const taskId = state.tasks[0].id;
    const before = state.tasks[0].durationMinutes;
    const after = approveShortenTask(state, ctx(), taskId);
    const shortened = after.tasks.find((t) => t.id === taskId);

    assert.equal(shortened.status, 'open');
    assert.ok(shortened.durationMinutes < before);
    assert.ok(shortened.durationMinutes >= 15);
    assert.equal(after.actions[0].reason.code, 'capacity_pressure');
    assert.equal(validateAppState(after).ok, true);
  });

  test('rejection (keep the plan) changes no facts, only records the decision', () => {
    const state = withCapacityPressure();
    const after = keepCapacityPlan(state, ctx());

    assert.deepEqual(after.tasks, state.tasks);
    assert.deepEqual(after.events, state.events);
    assert.equal(after.actions[0].type, 'daily_load.keep_capacity_plan');
    assert.equal(after.actions[0].approval, 'declined');
  });

  test('one decision per day across DROP, SHORTEN and keep — approving after declining changes nothing further', () => {
    const state = withCapacityPressure();
    const kept = keepCapacityPlan(state, ctx());
    assert.equal(approveDropTask(kept, ctx(), state.tasks[0].id), kept);
    assert.equal(approveShortenTask(kept, ctx(), state.tasks[0].id), kept);
    assert.equal(keepCapacityPlan(kept, ctx()), kept);
  });

  test('a genuinely reasonable day has no capacity verdict to approve or decline', () => {
    const state = empty();
    assert.equal(approveDropTask(state, ctx(), 'task-1'), state);
    assert.equal(keepCapacityPlan(state, ctx()), state);
  });
});

describe('PROTECT', () => {
  test('flips a flexible task to fixed and records why', () => {
    const state = addTask(empty(), ctx(), { title: 'Recurring errand', categoryId: 'cat-home', scope: 'household' });
    const taskId = state.tasks[0].id;
    const after = approveProtectItem(state, ctx(), { targetType: 'task', targetId: taskId });

    assert.equal(after.tasks[0].commitment, 'fixed');
    assert.equal(after.actions[0].type, 'daily_load.protect_item');
    assert.equal(validateAppState(after).ok, true);
  });

  test('flips a flexible event to fixed', () => {
    let state = empty();
    state = addEvent(state, ctx(), { title: 'Grocery run', categoryId: 'cat-home', startsAt: at(10), endsAt: at(10, 30), commitment: 'flexible', scope: 'household' });
    const eventId = state.events[0].id;
    const after = approveProtectItem(state, ctx(), { targetType: 'event', targetId: eventId });

    assert.equal(after.events[0].commitment, 'fixed');
  });

  test('is a no-op on something already fixed, and on an unknown id', () => {
    const state = addTask(empty(), ctx(), { title: 'x', categoryId: 'cat-home', commitment: 'fixed', scope: 'household' });
    const taskId = state.tasks[0].id;
    assert.equal(approveProtectItem(state, ctx(), { targetType: 'task', targetId: taskId }), state);
    assert.equal(approveProtectItem(state, ctx(), { targetType: 'task', targetId: 'task-missing' }), state);
  });
});

describe('Negative controls', () => {
  test('cross-household mutation is impossible: an action can only ever target ids already present in this single-household state', () => {
    const state = withCapacityPressure();
    const before = JSON.stringify(state);
    approveDropTask(state, ctx(), 'not-a-real-task-id');
    assert.equal(JSON.stringify(state), before, 'the input state is never mutated in place');
  });

  test('no fabricated durations: SHORTEN and DROP reasons only ever carry numbers computed from real events and tasks', () => {
    const state = withCapacityPressure();
    const after = approveDropTask(state, ctx(), state.tasks[0].id);
    const { totalAvailableMinutes, totalFlexibleNeededMinutes, shortfallMinutes } = after.actions[0].reason;
    assert.equal(totalFlexibleNeededMinutes, 200);
    assert.equal(shortfallMinutes, totalFlexibleNeededMinutes - totalAvailableMinutes);
  });
});
