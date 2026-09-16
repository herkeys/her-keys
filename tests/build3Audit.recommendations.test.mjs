/**
 * Build 3 hostile audit — recommendations under stale state, and Undo.
 *
 * A recommendation is only ever applied to what Today is showing right now;
 * a fixed commitment is never moved by anything Her Keys offers; and Undo can
 * only reverse today's move while the item is still exactly where that move
 * put it — and when it does, Today and the ledger say so.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  approveDailyLoadMove,
  dailyLoadDecisionFor,
  moveWasUndone,
  undoableMove,
  undoRecommendedMove,
} from '../src/domain/dailyLoadDecisions.ts';
import { renameCategory } from '../src/domain/categories.ts';
import { addEvent, updateEvent } from '../src/domain/events.ts';
import { approveDropTask, approveMoveEvent, approveProtectItem, approveShortenTask } from '../src/domain/recommendationActions.ts';
import { archiveTask, completeTask, updateTask } from '../src/domain/tasks.ts';
import { toInstant, zonedTimeToEpochMs } from '../src/domain/logicalDay.ts';
import { validateAppState } from '../src/domain/state.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, NEXT_DAY, STORAGE_KEYS, TZ, ctx, harness, launch, nyMs, onboardedState, stored } from './support/fixtures.mjs';

const at = (hour, minute = 0) => toInstant(zonedTimeToEpochMs(DAY, hour * 60 + minute, TZ));
const tomorrow = ctx({ today: NEXT_DAY, nowMs: nyMs(9, 0, 17) });

/** A real household with a fixed pickup and a flexible errand squeezed right after it. */
function errandDay() {
  let state = createEmptyState(TZ);
  state = addEvent(state, ctx({ createId: () => 'evt-pickup' }), { title: 'Pickup', categoryId: 'cat-kids', startsAt: at(15), endsAt: at(15, 15), commitment: 'fixed', scope: 'household' });
  state = addEvent(state, ctx({ createId: () => 'evt-errand' }), { title: 'Errand', categoryId: 'cat-home', startsAt: at(15, 25), endsAt: at(15, 55), commitment: 'flexible', scope: 'household' });
  return state;
}

describe('Build 3 audit — Undo is safe and honest (B3-AUD-009)', () => {
  test('undoing today’s task move puts it back, records the decision to keep the plan, and Today stops saying "moved"', () => {
    const session = ctx();
    const moved = approveDailyLoadMove(onboardedState(), session, 'task-2');
    const move = moved.actions.at(-1);
    assert.equal(undoableMove(moved, DAY).id, move.id);

    const undone = undoRecommendedMove(moved, session, move.id);
    assert.deepEqual(undone.tasks.find((t) => t.id === 'task-2').plan, move.before.plan);
    assert.equal(dailyLoadDecisionFor(undone, DAY).decision, 'kept');
    assert.equal(undone.actions.at(-1).type, 'daily_load.keep_plan');
    assert.equal(undone.actions.at(-1).reason.recommendedTaskId, 'task-2');
    assert.equal(moveWasUndone(undone, move), true);
    assert.equal(validateAppState(undone).ok, true);

    assert.equal(undoableMove(undone, DAY), null, 'nothing left to undo');
    assert.equal(undoRecommendedMove(undone, session, move.id), undone, 'a second undo changes nothing');
    assert.equal(approveDailyLoadMove(undone, session, 'task-2'), undone, 'the day’s decision is made; the move is not re-applied');
  });

  test('undoing an event move puts the event back at its original time', () => {
    const session = ctx();
    const moved = approveMoveEvent(errandDay(), session, 'evt-errand');
    const move = moved.actions.at(-1);
    const undone = undoRecommendedMove(moved, session, move.id);
    const errand = undone.events.find((e) => e.id === 'evt-errand');
    assert.deepEqual([errand.startsAt, errand.endsAt], [at(15, 25), at(15, 55)]);
    assert.equal(dailyLoadDecisionFor(undone, DAY).decision, 'kept');
    assert.equal(validateAppState(undone).ok, true);
  });

  test('a move she has since re-planned is not undone over her newer choice', () => {
    const moved = approveDailyLoadMove(onboardedState(), ctx(), 'task-2');
    const move = moved.actions.at(-1);
    const replanned = updateTask(moved, ctx(), 'task-2', { plan: { kind: 'day', date: '2026-09-20' } });
    assert.equal(undoableMove(replanned, DAY), null);
    assert.equal(undoRecommendedMove(replanned, ctx(), move.id), replanned);
  });

  test('an event she has since protected (now fixed) or rescheduled is never moved back by Undo', () => {
    const moved = approveMoveEvent(errandDay(), ctx(), 'evt-errand');
    const move = moved.actions.at(-1);

    const protectedState = approveProtectItem(moved, ctx(), { targetType: 'event', targetId: 'evt-errand' });
    assert.equal(undoRecommendedMove(protectedState, ctx(), move.id), protectedState);

    const rescheduled = updateEvent(moved, ctx(), 'evt-errand', { startsAt: at(18), endsAt: at(18, 30) });
    assert.equal(undoRecommendedMove(rescheduled, ctx(), move.id), rescheduled);
  });

  test('a move from an earlier day is history, not something Undo can reach', () => {
    const moved = approveDailyLoadMove(onboardedState(), ctx(), 'task-2');
    const move = moved.actions.at(-1);
    assert.equal(undoableMove(moved, NEXT_DAY), null);
    assert.equal(undoRecommendedMove(moved, tomorrow, move.id), moved);
  });

  test('a completed or removed item is left alone', () => {
    const moved = approveDailyLoadMove(onboardedState(), ctx(), 'task-2');
    const move = moved.actions.at(-1);
    const completed = completeTask(moved, ctx(), 'task-2');
    assert.equal(undoRecommendedMove(completed, ctx(), move.id), completed);
    const removed = archiveTask(moved, ctx(), 'task-2');
    assert.equal(undoRecommendedMove(removed, ctx(), move.id), removed);
  });

  test('the undo survives a relaunch: the item stays back and Today still reads "kept"', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    let store = await launch(h);
    store.dispatch((state, context) => approveDailyLoadMove(state, context, 'task-2'));
    await store.flush();
    const moveId = store.getSnapshot().state.actions.at(-1).id;
    assert.equal(await store.commit((state, context) => undoRecommendedMove(state, context, moveId)), true);

    store = await launch(h);
    const { state } = store.getSnapshot();
    assert.equal(dailyLoadDecisionFor(state, DAY).decision, 'kept');
    assert.equal(state.tasks.find((t) => t.id === 'task-2').plan.kind, 'timed');
  });
});

describe('Build 3 audit — recommendations never apply to stale state', () => {
  test('a task completed, removed or protected after the card rendered cannot be moved', () => {
    const base = onboardedState();
    for (const changed of [
      completeTask(base, ctx(), 'task-2'),
      archiveTask(base, ctx(), 'task-2'),
      approveProtectItem(base, ctx(), { targetType: 'task', targetId: 'task-2' }),
      updateTask(base, ctx(), 'task-2', { dueDate: DAY }),
    ]) {
      assert.equal(approveDailyLoadMove(changed, ctx(), 'task-2'), changed);
    }
  });

  test('an event that stopped bounding the named window, or became fixed, cannot be moved', () => {
    const base = errandDay();
    const later = updateEvent(base, ctx(), 'evt-errand', { startsAt: at(18), endsAt: at(18, 30) });
    assert.equal(approveMoveEvent(later, ctx(), 'evt-errand'), later);
    const fixed = updateEvent(base, ctx(), 'evt-errand', { commitment: 'fixed' });
    assert.equal(approveMoveEvent(fixed, ctx(), 'evt-errand'), fixed);
  });

  test('renaming the category after the card rendered changes nothing about what is offered', () => {
    const base = onboardedState();
    const renamed = renameCategory(base, 'cat-home', 'House stuff');
    const moved = approveDailyLoadMove(renamed, ctx(), 'task-2');
    assert.notEqual(moved, renamed);
    assert.equal(moved.tasks.find((t) => t.id === 'task-2').categoryId, 'cat-home');
  });

  test('no Her Keys control moves, drops or shortens a fixed commitment', () => {
    const base = onboardedState();
    // task-1 is fixed and due today; evt-2 is the fixed pickup.
    assert.equal(approveDailyLoadMove(base, ctx(), 'task-1'), base);
    assert.equal(approveDropTask(base, ctx(), 'task-1'), base);
    assert.equal(approveShortenTask(base, ctx(), 'task-1'), base);
    assert.equal(approveMoveEvent(base, ctx(), 'evt-2'), base);
    const errands = errandDay();
    assert.equal(approveMoveEvent(errands, ctx(), 'evt-pickup'), errands);
  });

  test('a recommendation only touches the item it names — nothing else in the household changes', () => {
    const base = onboardedState();
    const moved = approveDailyLoadMove(base, ctx(), 'task-2');
    assert.deepEqual(moved.tasks.filter((t) => t.id !== 'task-2'), base.tasks.filter((t) => t.id !== 'task-2'));
    assert.deepEqual(moved.events, base.events);
    assert.deepEqual([moved.household, moved.categories, moved.children], [base.household, base.categories, base.children]);
  });
});
