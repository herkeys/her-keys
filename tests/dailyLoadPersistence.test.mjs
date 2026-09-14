import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { approveDailyLoadMove, dailyLoadDecisionFor, keepDailyLoadPlan } from '../src/domain/dailyLoadDecisions.ts';
import { loadTierOf } from '../src/domain/loadTier.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { computeDailyLoad } from '../src/features/daily-load/computeDailyLoad.ts';
import { DAY, MORNING, NEXT_DAY, STORAGE_KEYS, ctx, harness, launch, onboardedState, startEventAt, stored } from './support/fixtures.mjs';

const assess = (state, date = DAY) => {
  const day = projectStateDay(state, date);
  return computeDailyLoad(day.events, day.tasks);
};

describe('Daily Load decisions', () => {
  test('approving "Move it to tomorrow" plans the task for tomorrow and records a typed, approved action', () => {
    const before = onboardedState();
    const state = approveDailyLoadMove(before, ctx(), 'task-2');

    assert.deepEqual(state.tasks.find((t) => t.id === 'task-2').plan, { kind: 'day', date: NEXT_DAY });
    assert.deepEqual(state.actions, [
      {
        id: 'act-1',
        type: 'daily_load.move_task',
        logicalDate: DAY,
        createdAt: new Date(MORNING).toISOString(),
        actor: 'user',
        source: 'her_keys_recommendation',
        approval: 'approved',
        targetId: 'task-2',
        reason: {
          code: 'transition_buffer_shortfall',
          windowBeforeEventId: 'evt-2',
          windowAfterEventId: 'evt-3',
          bufferMinutes: 35,
          projectedBufferMinutes: 65,
          requiredBufferMinutes: 45,
        },
        before: { plan: before.tasks.find((t) => t.id === 'task-2').plan },
        after: { plan: { kind: 'day', date: NEXT_DAY } },
        scope: 'personal',
      },
    ]);
  });

  test('after a relaunch the task is still moved and Daily Load is recomputed from it', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    let store = await launch(h);
    store.dispatch((state, context) => approveDailyLoadMove(state, context, 'task-2'));
    await store.flush();

    store = await launch(h);
    const { state, today } = store.getSnapshot();
    const assessment = assess(state, today);

    assert.deepEqual([assessment.status, assessment.bufferMinutes, loadTierOf(assessment)], ['balanced', 60, 'open']);
    assert.deepEqual(dailyLoadDecisionFor(state, today), {
      decision: 'moved',
      appliedMove: {
        taskTitle: 'Return library books',
        currentBufferMinutes: 35,
        projectedBufferMinutes: 65,
        requiredBufferMinutes: 45,
        resolvesShortfall: true,
        windowAfterTitle: "Josie's soccer practice",
      },
    });
    assert.ok(projectStateDay(state, NEXT_DAY).tasks.some((t) => t.id === 'task-2'), 'waiting for her tomorrow');
  });

  test('nothing about the analysis is stored: a changed fact changes the recomputed day', async () => {
    const moved = approveDailyLoadMove(onboardedState(), ctx(), 'task-2');
    // Soccer now starts 20 minutes earlier in the stored facts.
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(startEventAt(moved, 'evt-3', 16, 10)) } });
    const { state, today } = (await launch(h)).getSnapshot();

    assert.deepEqual([assess(state, today).bufferMinutes, assess(state, today).status], [45, 'balanced']);

    const storedWithoutLedger = JSON.stringify({ ...h.readPrimary(), data: { ...JSON.parse(stored(moved)).data, actions: [] } });
    assert.doesNotMatch(storedWithoutLedger, /assessment|candidates|bufferMinutes|loadTier|"tier"|overloaded|balanced/);
  });

  test('keeping the plan records her decision and changes no facts', () => {
    const before = onboardedState();
    const state = keepDailyLoadPlan(before, ctx(), 'task-2');

    assert.deepEqual(state.tasks, before.tasks);
    assert.deepEqual(
      (({ type, approval, targetId, reason }) => ({ type, approval, targetId, recommended: reason.recommendedTaskId }))(state.actions[0]),
      { type: 'daily_load.keep_plan', approval: 'declined', targetId: 'evt-3', recommended: 'task-2' }
    );
    assert.equal(dailyLoadDecisionFor(state, DAY).decision, 'kept');
  });

  test('one decision per day, and only for a task that is still a recommendation', () => {
    const moved = approveDailyLoadMove(onboardedState(), ctx(), 'task-2');
    assert.equal(approveDailyLoadMove(moved, ctx(), 'task-3'), moved);
    assert.equal(keepDailyLoadPlan(moved, ctx(), null), moved);

    const fresh = onboardedState();
    assert.equal(approveDailyLoadMove(fresh, ctx(), 'task-1'), fresh, 'fixed and due today');
    assert.equal(approveDailyLoadMove(fresh, ctx(), 'task-404'), fresh);
  });

  test('an overdue flexible task in the tight window is never recommended or moved', () => {
    const base = onboardedState();
    const overdue = { ...base, tasks: base.tasks.map((t) => (t.id === 'task-2' ? { ...t, dueDate: '2026-09-15' } : t)) };
    const assessment = assess(overdue);

    assert.equal(assessment.bufferMinutes, 35, 'its time still counts');
    assert.deepEqual(assessment.candidates.map((c) => c.task.id), ['task-3']);
    assert.equal(approveDailyLoadMove(overdue, ctx(), 'task-2'), overdue);
  });

  test('the next day starts without a decision', () => {
    const moved = approveDailyLoadMove(onboardedState(), ctx(), 'task-2');
    assert.equal(dailyLoadDecisionFor(moved, NEXT_DAY).decision, 'pending');
  });
});
