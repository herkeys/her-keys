import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { archiveTask, addTask, completeTask, updateTask } from '../src/domain/tasks.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { validateAppState } from '../src/domain/state.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, NEXT_DAY, TZ, ctx, harness, launch } from './support/fixtures.mjs';

const empty = () => createEmptyState(TZ);
const YESTERDAY = '2026-09-15';

describe('Real tasks', () => {
  test('a quick capture only needs a title and a category — everything else defaults sensibly', () => {
    const state = addTask(empty(), ctx(), { title: 'Return library books', categoryId: 'cat-home', scope: 'household' });
    const task = state.tasks[0];

    assert.equal(task.title, 'Return library books');
    assert.equal(task.categoryId, 'cat-home');
    assert.equal(task.commitment, 'flexible');
    assert.equal(task.durationMinutes > 0, true);
    assert.equal(task.dueDate, null);
    assert.deepEqual(task.plan, { kind: 'unplanned' });
    assert.equal(task.status, 'open');
    assert.equal(validateAppState(state).ok, true);
  });

  test('edit: fields can be filled in later without losing what is already there', () => {
    const created = addTask(empty(), ctx(), { title: 'Pay soccer registration', categoryId: 'cat-money', scope: 'household' });
    const id = created.tasks[0].id;
    const after = updateTask(created, ctx(), id, { dueDate: DAY, durationMinutes: 10 });

    assert.equal(after.tasks[0].title, 'Pay soccer registration');
    assert.equal(after.tasks[0].dueDate, DAY);
    assert.equal(after.tasks[0].durationMinutes, 10);
  });

  test('editing an unknown task changes nothing', () => {
    const state = empty();
    assert.equal(updateTask(state, ctx(), 'task-missing', { title: 'x' }), state);
  });

  test('due today: a task due today is due today, and counted as such by the projected day', () => {
    const state = addTask(empty(), ctx(), { title: 'Call school', categoryId: 'cat-kids', dueDate: DAY, scope: 'household' });
    const projected = projectStateDay(state, DAY).tasks;
    assert.equal(projected.length, 1);
    assert.equal(projected[0].dueToday, true);
    assert.equal(projected[0].daysOverdue, 0);
  });

  test('overdue: a task due yesterday still shows up today, marked overdue, and is never offered as movable', () => {
    const state = addTask(empty(), ctx(), { title: 'Mom birthday gift', categoryId: 'cat-relationships', dueDate: YESTERDAY, scope: 'personal' });
    const projected = projectStateDay(state, DAY).tasks;
    assert.equal(projected[0].dueToday, true, 'overdue still counts as due, so it is never auto-rescheduled');
    assert.equal(projected[0].daysOverdue, 1);
  });

  test('no due date: an undated task does not appear on any particular day unless scheduled', () => {
    const state = addTask(empty(), ctx(), { title: 'Someday: repaint the fence', categoryId: 'cat-home', scope: 'household' });
    assert.deepEqual(projectStateDay(state, DAY).tasks, []);
    assert.deepEqual(projectStateDay(state, NEXT_DAY).tasks, []);
  });

  test('complete: marks status and stamps completedAt, and disappears from the projected day', () => {
    const created = addTask(empty(), ctx(), { title: 'Pick up prescription', categoryId: 'cat-home', dueDate: DAY, scope: 'household' });
    const id = created.tasks[0].id;
    const after = completeTask(created, ctx(), id);

    assert.equal(after.tasks[0].status, 'completed');
    assert.equal(after.tasks[0].completedAt, new Date(ctx().nowMs).toISOString());
    assert.deepEqual(projectStateDay(after, DAY).tasks, []);
    assert.equal(validateAppState(after).ok, true);
  });

  test('completing twice, or an unknown task, changes nothing further', () => {
    const created = addTask(empty(), ctx(), { title: 'x', categoryId: 'cat-home', scope: 'household' });
    const id = created.tasks[0].id;
    const completedOnce = completeTask(created, ctx(), id);
    assert.equal(completeTask(completedOnce, ctx(), id), completedOnce);
    const state = empty();
    assert.equal(completeTask(state, ctx(), 'task-missing'), state);
  });

  test('archive: intentional removal keeps the record but drops it from the day', () => {
    const created = addTask(empty(), ctx(), { title: 'Cancelled errand', categoryId: 'cat-home', dueDate: DAY, scope: 'household' });
    const id = created.tasks[0].id;
    const after = archiveTask(created, ctx(), id);

    assert.equal(after.tasks[0].status, 'archived');
    assert.deepEqual(projectStateDay(after, DAY).tasks, []);
    assert.equal(validateAppState(after).ok, true);
  });

  test('persists across a relaunch', async () => {
    const h = harness({ mode: 'empty' });
    let store = await launch(h);
    store.dispatch((state, context) => addTask(state, context, { title: 'Return library books', categoryId: 'cat-home', scope: 'household' }));
    await store.flush();

    store = await launch(h);
    const { state } = store.getSnapshot();
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0].title, 'Return library books');
  });
});
