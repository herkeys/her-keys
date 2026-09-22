/**
 * HK-FEATURE-08 / ML3 — RECURRING MEAL WORK: canonical recurring tasks and Systems in the Meals category, read-only.
 *
 * A meal decision does not repeat. This section is only ever about work that already recurs by the foundation's own rule.
 * Nothing at this baseline writes recurrence or Systems, so the section is exercised with fixtures and is normally empty.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addMeal } from '../../src/domain/meals.ts';
import { addRecurrence, setRecurrenceStatus } from '../../src/domain/structure.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { cadenceText, recurringMealWork } from '../../src/features/meals/recurringMealWork.ts';
import { buildMealsView } from '../../src/features/meals/mealsView.ts';
import { at, real, USER } from '../support/acceptance.mjs';

const TODAY = '2026-09-21'; // a Monday
const task = (state, title, categoryId = 'cat-meals') => addTask(state, at(), { title, categoryId, scope: 'household' });
const idOf = (state, title) => state.tasks.find((t) => t.title === title).id;
const system = (over = {}) => ({ id: 'sys-1', name: 'Sunday meal prep', description: '', categoryId: 'cat-meals', subjectMemberId: null, automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: USER, scope: 'household', ...over });

describe('[CA] recurring meal-prep tasks', () => {
  test('[CA1] an active rule on a Meals task shows its cadence and a DERIVED next date', () => {
    let state = task(real(), 'Prep the week');
    state = addRecurrence(state, at(), { kind: 'task', id: idOf(state, 'Prep the week') }, { anchorDate: '2026-09-22', frequency: 'weekly', byWeekday: [2] });
    const [item] = recurringMealWork(state, TODAY);
    assert.deepEqual([item.kind, item.title, item.cadence, item.next], ['task', 'Prep the week', 'Every Tuesday', '2026-09-22']);
    assert.deepEqual(buildMealsView(state, TODAY).recurringWork, [item], 'and the hub carries it');
  });

  test('[CA2] [AP] a recurrence rule about a MEAL is ignored on purpose, and the meal is unaffected', () => {
    let state = addMeal(real(), at(), { id: 'meal-r', title: 'Tacos', date: '2026-09-22' }).state;
    state = addRecurrence(state, at(), { kind: 'meal', id: 'meal-r' }, { anchorDate: '2026-09-22', frequency: 'weekly', byWeekday: [2] });
    assert.equal(state.recurrences.length, 1, 'precondition: the foundation does allow the rule');
    assert.deepEqual(recurringMealWork(state, TODAY), [], 'but Meals never presents a meal as repeating');
    assert.deepEqual(buildMealsView(state, TODAY).recurringWork, []);
  });

  test('[CA3] the section is empty (and so hidden) when nothing recurs, and a paused rule does not count', () => {
    let state = task(real(), 'Prep the week');
    assert.deepEqual(recurringMealWork(state, TODAY), []);
    state = addRecurrence(state, at(), { kind: 'task', id: idOf(state, 'Prep the week') }, { anchorDate: '2026-09-22' });
    assert.equal(recurringMealWork(state, TODAY).length, 1);
    state = setRecurrenceStatus(state, at(), state.recurrences[0].id, 'paused');
    assert.deepEqual(recurringMealWork(state, TODAY), []);
  });

  test('[CA] only Meals-category, open tasks are listed', () => {
    let state = task(task(real(), 'Meal prep'), 'Laundry', 'cat-home');
    for (const title of ['Meal prep', 'Laundry']) state = addRecurrence(state, at(), { kind: 'task', id: idOf(state, title) }, { anchorDate: '2026-09-22' });
    assert.deepEqual(recurringMealWork(state, TODAY).map((i) => i.title), ['Meal prep'], 'never every household task');
  });

  test('[CA4] creation is unavailable: Feature 08 has no path that creates a rule or a System', () => {
    const view = buildMealsView(real(), TODAY);
    assert.deepEqual(view.recurringWork, []);
  });
});

describe('[BZ] Systems in the Meals category', () => {
  test('[BZ1] a System is listed by name only: no running or working claim, no invented cadence', () => {
    const state = { ...real(), systems: [system(), system({ id: 'sys-2', name: 'Pantry check', categoryId: 'cat-home' })] };
    const items = recurringMealWork(state, TODAY);
    assert.deepEqual(items.map((i) => [i.kind, i.title, i.cadence, i.next]), [['system', 'Sunday meal prep', null, null]]);
    const text = JSON.stringify(items).toLowerCase();
    for (const word of ['running', 'working', 'active', 'automat']) assert.equal(text.includes(word), false, word);
  });

  test('[BZ1] a System that has a rule says only what the rule says', () => {
    let state = { ...real(), systems: [system()] };
    state = addRecurrence(state, at(), { kind: 'system', id: 'sys-1' }, { anchorDate: '2026-09-27', frequency: 'weekly', byWeekday: [0] });
    assert.deepEqual(recurringMealWork(state, TODAY).map((i) => [i.cadence, i.next]), [['Every Sunday', '2026-09-27']]);
  });
});

describe('cadence wording is derived from the rule alone', () => {
  const rule = (over) => ({ trigger: 'schedule', frequency: 'weekly', interval: 1, byWeekday: null, byMonthDay: null, ...over });
  test('every trigger and frequency reads as the rule states it', () => {
    assert.equal(cadenceText(rule({ frequency: 'daily' })), 'Every day');
    assert.equal(cadenceText(rule({ frequency: 'daily', interval: 3 })), 'Every 3 days');
    assert.equal(cadenceText(rule({ byWeekday: [2] })), 'Every Tuesday');
    assert.equal(cadenceText(rule({ byWeekday: [4, 2] })), 'Every Tuesday and Thursday');
    assert.equal(cadenceText(rule({ byWeekday: [1, 3, 5] })), 'Every Monday, Wednesday and Friday');
    assert.equal(cadenceText(rule({ byWeekday: [2], interval: 2 })), 'Every 2 weeks on Tuesday');
    assert.equal(cadenceText(rule({ frequency: 'weekly' })), 'Every week');
    assert.equal(cadenceText(rule({ frequency: 'monthly', byMonthDay: 1 })), 'Every month on the 1st');
    assert.equal(cadenceText(rule({ frequency: 'monthly', byMonthDay: 22 })), 'Every month on the 22nd');
    assert.equal(cadenceText(rule({ frequency: 'monthly', byMonthDay: 13 })), 'Every month on the 13th');
    assert.equal(cadenceText(rule({ frequency: 'yearly' })), 'Every year');
    assert.equal(cadenceText(rule({ trigger: 'manual', frequency: null })), 'Repeats when you ask for it');
    assert.equal(cadenceText(rule({ trigger: 'after_completion' })), 'Repeats after each time it’s done');
  });
});
