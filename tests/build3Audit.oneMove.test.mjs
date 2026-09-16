/**
 * Build 3 hostile audit — One Move on real household data.
 *
 * A move she has done stays done — across the rest of the day, relaunches
 * and the next morning — whether she tapped "I did it" or finished the item
 * from her own list. And doing the move does the item.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assessDailyLoadIssues } from '../src/domain/dailyLoadIssues.ts';
import { captureNeedsMeItem, resolveNeedsMeItem } from '../src/domain/needsMe.ts';
import { completeOnboarding, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { completeOneMove, oneMoveForDay, resolveOneMoveForToday } from '../src/domain/oneMove.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { validateAppState } from '../src/domain/state.ts';
import { addTask, archiveTask, completeTask } from '../src/domain/tasks.ts';
import { computeDailyLoad } from '../src/features/daily-load/computeDailyLoad.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, NEXT_DAY, STORAGE_KEYS, TZ, ctx, harness, launch, nyMs, onboardedState, stored } from './support/fixtures.mjs';

const nextMorning = () => ctx({ today: NEXT_DAY, nowMs: nyMs(9, 0, 17) });

/** A real household with two tasks due today and today's One Move decided (the smaller task). */
function decidedDay() {
  const context = ctx();
  let state = createEmptyState(TZ);
  for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) {
    state = toggleOnboardingOption(state, group, id);
  }
  state = completeOnboarding(state, context);
  state = addTask(state, context, { title: 'Pay orthodontist', categoryId: 'cat-money', durationMinutes: 10, dueDate: DAY, scope: 'household' });
  state = addTask(state, context, { title: 'Sign up for swim', categoryId: 'cat-kids', durationMinutes: 20, dueDate: DAY, scope: 'household' });
  state = resolveOneMoveForToday(state, context);
  return { state, target: state.oneMoves[0].targetId };
}

describe('Build 3 audit — "I did it" does the item (B3-AUD-011)', () => {
  test('completing a task-based move completes the task, so it is not reported overdue tomorrow', () => {
    const { state, target } = decidedDay();
    assert.equal(state.tasks.find((t) => t.id === target).title, 'Pay orthodontist');

    const done = completeOneMove(state, ctx());
    const task = done.tasks.find((t) => t.id === target);
    assert.deepEqual([task.status, task.completedAt], ['completed', new Date(ctx().nowMs).toISOString()]);
    assert.equal(oneMoveForDay(done, DAY).status, 'completed');
    assert.equal(validateAppState(done).ok, true);

    const tomorrow = projectStateDay(done, NEXT_DAY);
    const overdue = assessDailyLoadIssues(tomorrow.events, tomorrow.tasks, computeDailyLoad(tomorrow.events, tomorrow.tasks)).overdue;
    assert.deepEqual(overdue.map((issue) => issue.taskTitle), ['Sign up for swim'], 'only the task she did not do is overdue');
  });

  test('completing a Needs Me-based move resolves the item', () => {
    let state = decidedDay().state;
    state = { ...state, tasks: [], oneMoves: [] };
    state = captureNeedsMeItem(state, ctx(), { title: 'Call insurance' });
    state = resolveOneMoveForToday(state, ctx());
    const done = completeOneMove(state, ctx());
    assert.equal(done.needsMe[0].status, 'resolved');
    assert.equal(oneMoveForDay(done, DAY).status, 'completed');
  });

  test('the demo catalog move is unchanged: completing it touches no task', () => {
    const state = onboardedState();
    const done = completeOneMove(state, ctx());
    assert.deepEqual(done.tasks, state.tasks);
    assert.equal(oneMoveForDay(done, DAY).status, 'completed');
  });

  test('"I did it" twice, or with no move selected, changes nothing', () => {
    const { state } = decidedDay();
    const once = completeOneMove(state, ctx());
    assert.equal(completeOneMove(once, ctx()), once);
    const none = { ...state, oneMoves: [] };
    assert.equal(completeOneMove(none, ctx()), none);
  });
});

describe('Build 3 audit — a done move stays done (B3-AUD-003)', () => {
  test('finishing the task from her list afterwards keeps the "done" card, across a relaunch, with no new move', async () => {
    const { state, target } = decidedDay();
    const h = harness({ mode: 'empty', initial: { [STORAGE_KEYS.primary]: stored(state) } });
    let store = await launch(h);
    store.dispatch((current, context) => completeOneMove(current, context));
    await store.flush();

    // Build 3 as shipped left the task open; mark it done the way the task list would, whatever state it is in.
    await store.commit((current, context) => completeTask(current, context, target));
    assert.equal(oneMoveForDay(store.getSnapshot().state, DAY).status, 'completed');

    store = await launch(h);
    const relaunched = store.getSnapshot().state;
    assert.equal(oneMoveForDay(relaunched, DAY).status, 'completed');
    assert.deepEqual(relaunched.oneMoves.map((r) => [r.forDate, r.status, r.targetId]), [[DAY, 'completed', target]]);
  });

  test('finishing the offered task from her list counts as doing the move — no second move that day', async () => {
    const { state, target } = decidedDay();
    const listDone = completeTask(state, ctx(), target);
    assert.equal(oneMoveForDay(listDone, DAY).status, 'completed');
    assert.equal(resolveOneMoveForToday(listDone, ctx()), listDone, 'the decision stands');

    const h = harness({ mode: 'empty', initial: { [STORAGE_KEYS.primary]: stored(listDone) } });
    const relaunched = (await launch(h)).getSnapshot().state;
    assert.equal(oneMoveForDay(relaunched, DAY).status, 'completed');
    assert.equal(relaunched.oneMoves.length, 1);
  });

  test('resolving the offered Needs Me item from the inbox counts as doing the move', () => {
    let state = { ...decidedDay().state, tasks: [], oneMoves: [] };
    state = captureNeedsMeItem(state, ctx(), { title: 'Call insurance' });
    state = resolveOneMoveForToday(state, ctx());
    const resolved = resolveNeedsMeItem(state, state.needsMe[0].id);
    assert.equal(oneMoveForDay(resolved, DAY).status, 'completed');
    assert.equal(resolveOneMoveForToday(resolved, ctx()), resolved);
  });

  test('an unfinished move whose task she removed is still replaced, as designed', () => {
    const { state, target } = decidedDay();
    const removed = archiveTask(state, ctx(), target);
    assert.equal(oneMoveForDay(removed, DAY).status, 'none');
    const replaced = resolveOneMoveForToday(removed, ctx());
    assert.equal(oneMoveForDay(replaced, DAY).move.action, 'Sign up for swim');
  });

  test('a completed move is never replaced, even if its task is removed later', () => {
    const { state, target } = decidedDay();
    const done = completeOneMove(state, ctx());
    const later = { ...done, tasks: done.tasks.map((t) => (t.id === target ? { ...t, status: 'archived', completedAt: null } : t)) };
    assert.equal(resolveOneMoveForToday(later, ctx()), later);
    assert.equal(oneMoveForDay(later, DAY).status, 'completed');
  });

  test('the next morning decides afresh and never re-offers what was done', () => {
    const { state } = decidedDay();
    const done = completeOneMove(state, ctx());
    const next = resolveOneMoveForToday(done, nextMorning());
    assert.equal(next.oneMoves.find((r) => r.forDate === DAY).status, 'completed');
    assert.equal(oneMoveForDay(next, NEXT_DAY).move.action, 'Sign up for swim');
  });
});
