import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addDependency } from '../../src/domain/structure.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { mattersSection } from '../../src/features/today/model/mattersView.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, TZ, ctx } from '../support/fixtures.mjs';

/**
 * AUDIT W2-01 — "What Matters Today" must never present a task she cannot actually do yet.
 * A task due today that still requires a live prerequisite is not an honest "matters" item:
 * she would open it, find it blocked, and Her Keys would have claimed authority it didn't have.
 */

function onboardedEmpty(context = ctx()) {
  let state = createEmptyState(TZ);
  for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) {
    state = toggleOnboardingOption(state, group, id);
  }
  return completeOnboarding(state, context);
}

const mattersFor = (state) => {
  const day = projectStateDay(state, DAY);
  return mattersSection({ state, day, nowMinutes: 9 * 60, exclude: new Set() });
};

describe('What Matters Today never lists a blocked task (audit W2-01)', () => {
  test('a due-today task blocked on a live prerequisite is left out', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addTask(state, context, { title: 'Prerequisite', categoryId: 'cat-home', durationMinutes: 10, dueDate: DAY, scope: 'household' });
    state = addTask(state, context, { title: 'Blocked task', categoryId: 'cat-home', durationMinutes: 10, dueDate: DAY, scope: 'household' });
    const pre = state.tasks.find((t) => t.title === 'Prerequisite');
    const blocked = state.tasks.find((t) => t.title === 'Blocked task');
    state = addDependency(state, context, { relation: 'requires', from: { kind: 'task', id: blocked.id }, to: { kind: 'task', id: pre.id } }).state;

    const matters = mattersFor(state);
    const titles = matters.anchors.map((a) => a.title);
    assert.ok(titles.includes('Prerequisite'), 'the unblocked task still matters');
    assert.ok(!titles.includes('Blocked task'), 'the blocked task must not be offered as something to do today');
  });

  test('once the prerequisite is done, the previously blocked task matters again', () => {
    const context = ctx();
    let state = onboardedEmpty(context);
    state = addTask(state, context, { title: 'Prerequisite', categoryId: 'cat-home', durationMinutes: 10, dueDate: DAY, scope: 'household' });
    state = addTask(state, context, { title: 'Now unblocked', categoryId: 'cat-home', durationMinutes: 10, dueDate: DAY, scope: 'household' });
    const pre = state.tasks.find((t) => t.title === 'Prerequisite');
    const blocked = state.tasks.find((t) => t.title === 'Now unblocked');
    state = addDependency(state, context, { relation: 'requires', from: { kind: 'task', id: blocked.id }, to: { kind: 'task', id: pre.id } }).state;
    state = { ...state, tasks: state.tasks.map((t) => (t.id === pre.id ? { ...t, status: 'completed' } : t)) };

    const titles = mattersFor(state).anchors.map((a) => a.title);
    assert.ok(titles.includes('Now unblocked'));
  });
});
