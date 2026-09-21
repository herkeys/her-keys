/**
 * HK-FEATURE-08 / ML3 — how Meals meets the rest of Her Keys without becoming any of it.
 *
 * The Life hub row for Meals already existed; it must say only what the data supports. Today and Daily Load read events and tasks and
 * nothing else, so a meal decision, a blank week or a removed plan can never become unfinished work, scheduled time or capacity.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { categoriesInOrder } from '../../src/domain/categories.ts';
import { addMeal, archiveMeal, updateMeal } from '../../src/domain/meals.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { computeDailyLoad } from '../../src/features/daily-load/computeDailyLoad.ts';
import { clearCount, deriveLifeStatus } from '../../src/features/life/lifeStatus.ts';
import { upcomingMealsOf } from '../../src/features/meals/upcomingMeals.ts';
import { at, real } from '../support/acceptance.mjs';

const TODAY = '2026-09-21';
const day = (offset) => {
  const [y, m, d] = TODAY.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + offset));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
const plan = (state, ...dates) => dates.reduce((s, date, i) => addMeal(s, at(), { id: 'meal-l' + i + date, title: 'Meal ' + i, date }).state, state);

const lifeRow = (state) =>
  deriveLifeStatus({ categories: categoriesInOrder(state), events: [], tasks: [], systems: state.systems, upcomingMeals: upcomingMealsOf(state, TODAY) }).find((s) => s.systemRole === 'meals');

describe('[CG] the Life hub row for Meals is truthful', () => {
  test('[CG1] no plan reads as a description, never as a problem', () => {
    const row = lifeRow(real());
    assert.equal(row.value, 'No meals planned yet');
    assert.equal(row.needsAttention, false);
    assert.equal(row.route, '/life/meals', 'the existing direct route, unchanged');
  });

  test('[CG2] a plan names the next decision and never claims coverage', () => {
    assert.equal(lifeRow(plan(real(), TODAY)).value, 'Next: Today');
    assert.equal(lifeRow(plan(real(), day(1), day(5))).value, 'Next: Tomorrow');
    assert.equal(lifeRow(plan(real(), day(3))).value, 'Next: Thursday');
    for (const dates of [[TODAY], [day(1), day(9)], [day(2), day(3), day(4)]]) {
      const value = lifeRow(plan(real(), ...dates)).value;
      assert.equal(/planned through|nothing planned|all set|caught up|behind|need/i.test(value), false, value);
    }
  });

  test('[CG3] an archived plan is not planned', () => {
    const state = plan(real(), day(2));
    assert.equal(lifeRow(state).value, 'Next: Wednesday');
    assert.equal(lifeRow(archiveMeal(state, at(), state.meals[0].id).state).value, 'No meals planned yet');
  });

  test('[CG4] a date a week or more away reads as a calendar date, not a weekday that would name two days', () => {
    assert.equal(lifeRow(plan(real(), day(12))).value, 'Next: Sat 3 Oct');
  });

  test('[CG] the row never asks for attention, so it never lowers the Life hub count', () => {
    const statuses = deriveLifeStatus({ categories: categoriesInOrder(real()), events: [], tasks: [], systems: [], upcomingMeals: [] });
    assert.equal(statuses.find((s) => s.systemRole === 'meals').needsAttention, false);
    assert.equal(clearCount(statuses), statuses.length);
  });

  test('[BL] the upcoming list is active only, from today on, in the shared order', () => {
    let state = plan(real(), day(2), TODAY, day(-2));
    state = archiveMeal(state, at(), state.meals.find((m) => m.date === day(2)).id).state;
    assert.deepEqual(upcomingMealsOf(state, TODAY).map((m) => m.label), ['Today']);
  });
});

describe('[CE] [AO] Today, Needs Me and Daily Load never see a meal', () => {
  const today = (state) => {
    const dayView = projectStateDay(state, TODAY);
    return { dayView, load: computeDailyLoad(dayView.events, dayView.tasks), needsMe: state.needsMe };
  };
  const seed = () => addTask(real(), at(), { title: 'A real task', categoryId: 'cat-home', scope: 'household', dueDate: TODAY });

  test('[CE1] [CE2] the same day, load and Needs Me whether there are no meals, a full month, or a fully blank week', () => {
    const base = seed(); // ONE household: the three variants differ only by their meals, never by a freshly minted task id
    const empty = today(base);
    const dense = today(plan(base, ...Array.from({ length: 60 }, (_, i) => day(i - 5))));
    const archived = today(archiveMeal(plan(base, TODAY), at(), 'meal-l0' + TODAY).state);
    assert.deepEqual(dense, empty);
    assert.deepEqual(archived, empty);
    assert.deepEqual(empty.needsMe, [], 'no Needs Me item comes from a meal or from a blank slot');
  });

  test('[AO1] adding, moving and removing meals leaves events, tasks, Needs Me, One Moves and observations as the very same objects', () => {
    const before = seed();
    let after = addMeal(before, at(), { id: 'meal-o1', title: 'Tacos', date: TODAY, slot: 'dinner' }).state;
    after = updateMeal(after, at(), 'meal-o1', { date: day(1), slot: 'lunch' }).state;
    after = archiveMeal(after, at(), 'meal-o1').state;
    for (const key of ['events', 'tasks', 'needsMe', 'oneMoves', 'observations', 'responsibilities', 'dependencies', 'recurrences', 'systems']) {
      assert.equal(after[key], before[key], key + ' was touched by a meal action');
    }
  });

  test('[AO3] a meal names no time of day anywhere a screen can read it', () => {
    const state = plan(real(), TODAY);
    const meal = state.meals[0];
    assert.equal(Object.keys(meal).some((k) => /time|start|end|duration|at$/i.test(k)), false);
    assert.equal(meal.prepMinutes, null);
    assert.equal(meal.energyDemand, null);
  });
});
