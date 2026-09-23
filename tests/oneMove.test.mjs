import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { approveDailyLoadMove } from '../src/domain/dailyLoadDecisions.ts';
import { addEvent } from '../src/domain/events.ts';
import { loadTierForDay } from '../src/domain/loadTier.ts';
import { captureNeedsMeItem } from '../src/domain/needsMe.ts';
import { completeOnboarding, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { completeOneMove, oneMoveForDay, resolveOneMoveForToday } from '../src/domain/oneMove.ts';
import { addDependency } from '../src/domain/structure.ts';
import { addTask } from '../src/domain/tasks.ts';
import { toInstant, zonedTimeToEpochMs } from '../src/domain/logicalDay.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, MORNING, NEXT_DAY, STORAGE_KEYS, TZ, ctx, demoState, harness, launch, nyMs, onboardedState, startEventAt, stored } from './support/fixtures.mjs';

const at = (hour, minute = 0) => toInstant(zonedTimeToEpochMs(DAY, hour * 60 + minute, TZ));

/** A real household, onboarded, with nothing else in it yet. */
function onboardedEmpty(context = ctx()) {
  let state = createEmptyState(TZ);
  for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) {
    state = toggleOnboardingOption(state, group, id);
  }
  return completeOnboarding(state, context);
}

/** The demo day with soccer moved so the tightest buffer is exactly `buffer` minutes (pickup ends 3:15, 40 minutes of tasks). */
const demoWithBuffer = (buffer) => {
  const soccerStart = 15 * 60 + 15 + 40 + buffer;
  return startEventAt(demoState(), 'evt-3', Math.floor(soccerStart / 60), soccerStart % 60);
};

describe('One Move', () => {
  test('nothing is decided before onboarding is finished', () => {
    const state = demoState();
    assert.equal(resolveOneMoveForToday(state, ctx()), state);
  });

  test("a tight day is offered its One Move, stored as that day's decision", () => {
    const state = onboardedState();
    assert.deepEqual(state.oneMoves, [
      { id: 'onemove-2026-09-16', forDate: DAY, targetId: 'one-move-1', targetType: 'catalog', status: 'selected', decidedAt: new Date(MORNING).toISOString(), completedAt: null, provenance: { producer: 'demo-seed', artifactId: null, confidence: null }, scope: 'personal' },
    ]);
    assert.equal(oneMoveForDay(state, DAY).move.id, 'one-move-1');
  });

  test('boundary: 23 minutes of buffer still gets a One Move; 22 gets none', () => {
    const tight = onboardedState(demoWithBuffer(23));
    const overloaded = onboardedState(demoWithBuffer(22));

    assert.deepEqual([loadTierForDay(tight, DAY), oneMoveForDay(tight, DAY).status], ['tight', 'selected']);
    assert.deepEqual([loadTierForDay(overloaded, DAY), oneMoveForDay(overloaded, DAY).status], ['overloaded', 'withheld']);
    assert.deepEqual((({ targetId, status }) => ({ targetId, status }))(overloaded.oneMoves[0]), { targetId: null, status: 'withheld' });
  });

  test('a withheld day stays withheld after she frees up time, across a relaunch', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState(demoWithBuffer(22))) } });
    let store = await launch(h);
    store.dispatch((state, context) => approveDailyLoadMove(state, context, 'task-2'));
    await store.flush();
    assert.equal(loadTierForDay(store.getSnapshot().state, DAY), 'open');

    store.refreshDay();
    store = await launch(h);
    assert.equal(oneMoveForDay(store.getSnapshot().state, DAY).status, 'withheld');
  });

  test('completion survives a relaunch, and completing twice changes nothing', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    let store = await launch(h);
    store.dispatch((state, context) => completeOneMove(state, context));
    await store.flush();

    const completed = store.getSnapshot().state;
    store.dispatch((state, context) => completeOneMove(state, context));
    assert.equal(store.getSnapshot().state, completed);

    store = await launch(h);
    assert.equal(oneMoveForDay(store.getSnapshot().state, DAY).status, 'completed');
    assert.equal(h.primaryWrites().length, 1);
  });

  test("the day's decision isn't swapped when the rest of the day changes", () => {
    const selected = onboardedState();
    const nowOverloaded = startEventAt(selected, 'evt-3', 16, 0);
    assert.equal(loadTierForDay(nowOverloaded, DAY), 'overloaded');
    assert.equal(resolveOneMoveForToday(nowOverloaded, ctx()), nowOverloaded);
    assert.equal(oneMoveForDay(nowOverloaded, DAY).status, 'selected');
  });

  test('a new day decides afresh, and a move already done is not offered again', () => {
    const tomorrow = ctx({ today: NEXT_DAY, nowMs: nyMs(9, 0, 17) });

    const done = completeOneMove(onboardedState(), ctx());
    const afterDone = resolveOneMoveForToday(done, tomorrow);
    assert.equal(afterDone, done);
    assert.equal(oneMoveForDay(afterDone, NEXT_DAY).status, 'none');

    const notDone = resolveOneMoveForToday(onboardedState(), tomorrow);
    assert.deepEqual(notDone.oneMoves.map((r) => [r.forDate, r.status]), [[DAY, 'selected'], [NEXT_DAY, 'selected']]);
  });

  test('a decision whose move left the catalog is replaced by a fresh one', () => {
    const base = onboardedState();
    const retired = { ...base, oneMoves: base.oneMoves.map((r) => ({ ...r, targetId: 'retired-move' })) };
    assert.equal(resolveOneMoveForToday(retired, ctx()).oneMoves[0].targetId, 'one-move-1');
  });

  test('a real household with nothing entered yet is offered no One Move', () => {
    const state = resolveOneMoveForToday(onboardedEmpty(), ctx());
    assert.deepEqual(state.oneMoves, []);
    assert.equal(oneMoveForDay(state, DAY).status, 'none');
  });
});

describe('One Move on real household data', () => {
  test('a small open task on today\'s radar is offered, using its own real duration as the estimate', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    // She typed the 10 (the task form records `user` when she touches the field). A bare number of unrecorded origin is NOT her
    // estimate (HA-010) — see "a task saved without a duration" below (HK13-D12).
    state = addTask(state, context, { title: 'Return library books', categoryId: 'cat-home', durationMinutes: 10, durationSource: 'user', dueDate: DAY, scope: 'household' });

    const after = resolveOneMoveForToday(state, ctx());
    const view = oneMoveForDay(after, DAY);
    assert.equal(view.status, 'selected');
    assert.equal(view.move.action, 'Return library books');
    assert.equal(view.move.estimatedMinutes, 10);
  });

  test('a task not due today and not scheduled today is not in today\'s pool', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addTask(state, context, { title: 'Someday task', categoryId: 'cat-home', durationMinutes: 10, scope: 'household' });
    assert.deepEqual(resolveOneMoveForToday(state, ctx()).oneMoves, []);
  });

  test('the smallest eligible task is preferred over a larger one', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addTask(state, context, { title: 'Big task', categoryId: 'cat-home', durationMinutes: 60, dueDate: DAY, scope: 'household' });
    state = addTask(state, context, { title: 'Small task', categoryId: 'cat-home', durationMinutes: 5, dueDate: DAY, scope: 'household' });

    const after = resolveOneMoveForToday(state, ctx());
    assert.equal(oneMoveForDay(after, DAY).move.action, 'Small task');
  });

  test('a blocked task is never offered as the One Move, however small — she cannot do it yet (audit W2-01)', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addTask(state, context, { title: 'Big prerequisite', categoryId: 'cat-home', durationMinutes: 60, dueDate: DAY, scope: 'household' });
    state = addTask(state, context, { title: 'Small blocked task', categoryId: 'cat-home', durationMinutes: 5, dueDate: DAY, scope: 'household' });
    const big = state.tasks.find((t) => t.title === 'Big prerequisite');
    const small = state.tasks.find((t) => t.title === 'Small blocked task');
    state = addDependency(state, context, { relation: 'requires', from: { kind: 'task', id: small.id }, to: { kind: 'task', id: big.id } }).state;

    const after = resolveOneMoveForToday(state, ctx());
    // The small task is smaller, but it requires the still-open big one: it must be skipped in favor of the unblocked task.
    assert.equal(oneMoveForDay(after, DAY).move.action, 'Big prerequisite');
  });

  test('every open task blocked leaves no honest move to offer', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addTask(state, context, { title: 'Prerequisite', categoryId: 'cat-home', durationMinutes: 10, scope: 'household' });
    state = addTask(state, context, { title: 'Blocked task', categoryId: 'cat-home', durationMinutes: 5, dueDate: DAY, scope: 'household' });
    const pre = state.tasks.find((t) => t.title === 'Prerequisite');
    const blocked = state.tasks.find((t) => t.title === 'Blocked task');
    state = addDependency(state, context, { relation: 'requires', from: { kind: 'task', id: blocked.id }, to: { kind: 'task', id: pre.id } }).state;

    assert.deepEqual(resolveOneMoveForToday(state, ctx()).oneMoves, []);
  });

  test('a Needs Me item never claims a duration it does not have', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = captureNeedsMeItem(state, context, { title: 'Call insurance' });

    const after = resolveOneMoveForToday(state, ctx());
    const view = oneMoveForDay(after, DAY);
    assert.equal(view.status, 'selected');
    assert.equal(view.move.action, 'Call insurance');
    assert.equal(view.move.estimatedMinutes, undefined);
  });

  test('a task saved without a duration never claims one: the planning default, or a number of unrecorded origin, is not her estimate (HK13-D12)', () => {
    for (const input of [{}, { durationMinutes: 10 }, { durationMinutes: 10, durationSource: 'default' }]) {
      const context = ctx();
      let state = onboardedEmpty(context);
      state = addTask(state, context, { title: 'Call the school', categoryId: 'cat-home', dueDate: DAY, scope: 'household', ...input });
      const view = oneMoveForDay(resolveOneMoveForToday(state, ctx()), DAY);
      assert.equal(view.status, 'selected', JSON.stringify(input));
      assert.equal(view.move.estimatedMinutes, undefined, JSON.stringify(input));
      assert.equal(view.move.effect, 'adds_work', `an unknown size is never "small": ${JSON.stringify(input)}`);
    }
  });

  test('on an overloaded day, a small (<=15 minute) real task is still offered — it does not add meaningful work', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addEvent(state, context, { title: 'Pickup', categoryId: 'cat-kids', startsAt: at(15), endsAt: at(15, 15), commitment: 'fixed', scope: 'household' });
    state = addEvent(state, context, { title: 'Soccer', categoryId: 'cat-kids', startsAt: at(15, 20), endsAt: at(16, 30), commitment: 'fixed', scope: 'household' });
    // "Real" = she gave the 10 (`user`), or approved Her Keys' reading of it (`inferred`).
    for (const durationSource of ['user', 'inferred']) {
      const withTask = addTask(state, context, { title: 'Quick call', categoryId: 'cat-home', durationMinutes: 10, durationSource, dueDate: DAY, scope: 'household' });
      assert.equal(loadTierForDay(withTask, DAY), 'overloaded');
      const after = resolveOneMoveForToday(withTask, ctx());
      assert.equal(oneMoveForDay(after, DAY).status, 'selected', durationSource);
    }
  });

  test('on an overloaded day, a task whose size is only the planning default is withheld, never offered as "small" (HK13-D12)', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addEvent(state, context, { title: 'Pickup', categoryId: 'cat-kids', startsAt: at(15), endsAt: at(15, 15), commitment: 'fixed', scope: 'household' });
    state = addEvent(state, context, { title: 'Soccer', categoryId: 'cat-kids', startsAt: at(15, 20), endsAt: at(16, 30), commitment: 'fixed', scope: 'household' });
    state = addTask(state, context, { title: 'Quick call', categoryId: 'cat-home', dueDate: DAY, scope: 'household' });
    assert.equal(state.tasks.at(-1).durationSource, 'default');
    assert.equal(loadTierForDay(state, DAY), 'overloaded');
    assert.equal(oneMoveForDay(resolveOneMoveForToday(state, ctx()), DAY).status, 'withheld');
  });

  test('on an overloaded day, a larger task or a Needs Me item (unknown size) is withheld — "no additional move today"', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addEvent(state, context, { title: 'Pickup', categoryId: 'cat-kids', startsAt: at(15), endsAt: at(15, 15), commitment: 'fixed', scope: 'household' });
    state = addEvent(state, context, { title: 'Soccer', categoryId: 'cat-kids', startsAt: at(15, 20), endsAt: at(16, 30), commitment: 'fixed', scope: 'household' });
    state = addTask(state, context, { title: 'Big errand', categoryId: 'cat-home', durationMinutes: 60, dueDate: DAY, scope: 'household' });

    assert.equal(loadTierForDay(state, DAY), 'overloaded');
    const after = resolveOneMoveForToday(state, ctx());
    assert.equal(oneMoveForDay(after, DAY).status, 'withheld');
  });

  test('One Move never fabricates a hidden task: it only ever points at an id that already existed before the decision', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addTask(state, context, { title: 'Return library books', categoryId: 'cat-home', durationMinutes: 10, dueDate: DAY, scope: 'household' });
    const knownIds = new Set([...state.tasks.map((t) => t.id), ...state.needsMe.map((n) => n.id)]);

    const after = resolveOneMoveForToday(state, ctx());
    assert.equal(after.tasks.length, state.tasks.length);
    assert.equal(after.needsMe.length, state.needsMe.length);
    const record = after.oneMoves[0];
    assert.ok(record.targetId === null || knownIds.has(record.targetId));
  });

  test('persists across a relaunch', async () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addTask(state, context, { title: 'Return library books', categoryId: 'cat-home', durationMinutes: 10, dueDate: DAY, scope: 'household' });

    const h = harness({ mode: 'empty', initial: { [STORAGE_KEYS.primary]: stored(state) } });
    let store = await launch(h);
    store.dispatch((current, runtime) => resolveOneMoveForToday(current, runtime));
    await store.flush();

    store = await launch(h);
    assert.equal(oneMoveForDay(store.getSnapshot().state, DAY).status, 'selected');
  });

  test('a new logical day makes its own fresh decision, independent of today\'s', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addTask(state, context, { title: 'Return library books', categoryId: 'cat-home', durationMinutes: 10, dueDate: DAY, scope: 'household' });
    state = resolveOneMoveForToday(state, ctx());
    state = completeOneMove(state, ctx());
    assert.equal(oneMoveForDay(state, DAY).status, 'completed');

    const tomorrow = resolveOneMoveForToday(state, ctx({ today: NEXT_DAY, nowMs: nyMs(9, 0, 17) }));
    assert.deepEqual(tomorrow.oneMoves.map((r) => [r.forDate, r.status]), [[DAY, 'completed']], 'the completed task is not offered again, so no candidate exists and no record is created for tomorrow');
    assert.equal(oneMoveForDay(tomorrow, NEXT_DAY).status, 'none');
  });
});
