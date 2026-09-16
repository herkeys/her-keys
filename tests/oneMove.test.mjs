import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { approveDailyLoadMove } from '../src/domain/dailyLoadDecisions.ts';
import { loadTierForDay } from '../src/domain/loadTier.ts';
import { completeOnboarding, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { completeOneMove, oneMoveForDay, resolveOneMoveForToday } from '../src/domain/oneMove.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, MORNING, NEXT_DAY, STORAGE_KEYS, TZ, ctx, demoState, harness, launch, nyMs, onboardedState, startEventAt, stored } from './support/fixtures.mjs';

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
      { id: 'onemove-2026-09-16', forDate: DAY, targetId: 'one-move-1', targetType: 'catalog', status: 'selected', decidedAt: new Date(MORNING).toISOString(), completedAt: null, scope: 'personal' },
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

  test('a real household has no catalog, so it is offered no One Move', () => {
    let state = createEmptyState(TZ);
    for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) {
      state = toggleOnboardingOption(state, group, id);
    }
    state = resolveOneMoveForToday(completeOnboarding(state, ctx()), ctx());
    assert.deepEqual(state.oneMoves, []);
    assert.equal(oneMoveForDay(state, DAY).status, 'none');
  });
});
