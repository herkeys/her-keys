/**
 * HK-FEATURE-08 / ML5 — grocery and prep work is ordinary canonical TASK work.
 *
 * A meal task means only that she chose to track that work. It is not a pantry fact, not a preparation, not linked to a meal, and
 * not classified as grocery or prep in stored state. A date offered from a meal's context is a PROPOSAL and is stored only when she
 * explicitly confirms it; a duration she did not state stays a default; someone being asked is not the task being covered.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addMeal, addMealTask, checkMealTaskTitle } from '../../src/domain/meals.ts';
import { acknowledge, accept, addPerson, delegate } from '../../src/domain/responsibility.ts';
import { openTasksInCategory, openTasksWithoutList } from '../../src/domain/taskLists.ts';
import { addTask, completeTask } from '../../src/domain/tasks.ts';
import { buildMealsView } from '../../src/features/meals/mealsView.ts';
import { at, real } from '../support/acceptance.mjs';

const TODAY = '2026-09-16'; // the shared acceptance clock's day
const TUESDAY = '2026-09-22';

const add = (state, input) => {
  const result = addMealTask(state, at(), input);
  assert.equal(result.refusal, null, 'refused: ' + result.refusal);
  return result;
};

describe('[V] [W] a grocery or prep task is a canonical task', () => {
  test('[V1] it lands in the Meals category as an ordinary open task, household scope, unplanned, by the user', () => {
    const { state, id } = add(real(), { title: 'Buy tortillas' });
    const task = state.tasks.find((t) => t.id === id);
    assert.equal(task.title, 'Buy tortillas');
    assert.equal(task.categoryId, 'cat-meals');
    assert.equal(task.status, 'open');
    assert.equal(task.scope, 'household');
    assert.deepEqual(task.plan, { kind: 'unplanned' }, 'never planned for a day or a time: no Calendar or capacity claim');
    assert.equal(task.provenance.producer, 'user-action');
    assert.equal(task.subjectMemberId, null);
    assert.equal(task.value, null, 'no cost is claimed');
    assert.equal(task.notes, null);
  });

  test('[V2] it is listed by the canonical lister and by the Meals view', () => {
    const { state, id } = add(real(), { title: 'Buy tortillas' });
    assert.deepEqual(openTasksInCategory(state, 'cat-meals', TODAY).map((e) => e.task.id), [id]);
    assert.deepEqual(buildMealsView(state, TODAY).mealTasks.map((t) => t.taskId), [id]);
  });

  test('[V3] [W1] a grocery task and a prep task have the SAME stored shape: no grocery or prep field exists', () => {
    let state = add(real(), { title: 'Buy tortillas' }).state;
    state = add(state, { title: 'Defrost chicken' }).state;
    const [grocery, prep] = state.tasks;
    assert.deepEqual(Object.keys(grocery).sort(), Object.keys(prep).sort());
    // the strongest form of "no new field": the key set is exactly that of a task made with no Meals code at all
    const plain = addTask(real(), at(), { title: 'Plain', categoryId: 'cat-home', scope: 'household' }).tasks[0];
    assert.deepEqual(Object.keys(grocery).sort(), Object.keys(plain).sort());
    const view = buildMealsView(state, TODAY);
    for (const key of Object.keys(view.mealTasks[0])) assert.equal(/grocery|meal|link/i.test(key) || key === 'prep' || key === 'kind', false, key);
  });

  test('[V] a task made for a meal is not linked to that meal (no truthful link exists), and nothing else is created', () => {
    let state = addMeal(real(), at(), { id: 'meal-v', title: 'Tacos', date: TUESDAY }).state;
    const before = state;
    state = add(state, { title: 'Buy tortillas', due: { date: TUESDAY, confirmed: true } }).state;
    assert.equal(state.dependencies, before.dependencies, 'no dependency of any relation');
    assert.equal(state.responsibilities, before.responsibilities);
    assert.equal(state.recurrences, before.recurrences);
    assert.equal(state.observations, before.observations, 'and no observation');
    assert.equal(state.meals, before.meals, 'the meal itself is untouched');
  });

  test('[V] the title is one line, trimmed, and held to the task limit', () => {
    assert.deepEqual(checkMealTaskTitle('  Buy milk  '), { ok: true, title: 'Buy milk' });
    assert.equal(checkMealTaskTitle('   ').ok, false);
    assert.equal(checkMealTaskTitle('x'.repeat(200)).ok, true);
    assert.equal(checkMealTaskTitle('x'.repeat(201)).ok, false);
  });
});

describe('[BW] the stable Meals context exists', () => {
  test('[BW1] a fresh real household has exactly one Meals-role category, found by role and never by name', () => {
    const meals = real().categories.filter((c) => c.systemRole === 'meals');
    assert.equal(meals.length, 1);
    assert.equal(meals[0].id, 'cat-meals');
    assert.equal(buildMealsView(real(), TODAY).mealsCategoryId, 'cat-meals');
  });
});

describe('[X] [Y] the Meals context', () => {
  test('[X1] [X2] only the Meals-category task is in the Meals view, and it is still in the Life hub\'s Other open tasks (no shared role change)', () => {
    let state = add(real(), { title: 'Buy tortillas' }).state;
    state = { ...state, tasks: [...state.tasks, { ...state.tasks[0], id: 'task-home', title: 'Laundry', categoryId: 'cat-home' }] };
    assert.deepEqual(buildMealsView(state, TODAY).mealTasks.map((t) => t.title), ['Buy tortillas']);
    assert.ok(openTasksWithoutList(state, TODAY).some((e) => e.task.title === 'Buy tortillas'), 'the task is never hidden from the Life hub');
  });

  test('[X3] the association is the stable role, not the display name', () => {
    let state = add(real(), { title: 'Buy tortillas' }).state;
    state = { ...state, categories: state.categories.map((c) => (c.systemRole === 'meals' ? { ...c, name: 'Dinner stuff' } : c)) };
    assert.deepEqual(buildMealsView(state, TODAY).mealTasks.map((t) => t.title), ['Buy tortillas']);
  });

  test('[Y1] without a Meals category creation is refused honestly and nothing is filed elsewhere', () => {
    const state = { ...real(), categories: real().categories.filter((c) => c.systemRole !== 'meals') };
    const result = addMealTask(state, at(), { title: 'Buy tortillas' });
    assert.equal(result.refusal, 'no-meals-context');
    assert.equal(result.state, state);
  });

  test('[Y2] an archived Meals category still works', () => {
    const base = real();
    const state = { ...base, categories: base.categories.map((c) => (c.systemRole === 'meals' ? { ...c, status: 'archived' } : c)) };
    assert.equal(addMealTask(state, at(), { title: 'Buy tortillas' }).refusal, null);
  });
});

describe('duration provenance (HA-010 is not regressed)', () => {
  const task = (state, id) => state.tasks.find((t) => t.id === id);

  test('[AA1] [Z] no minutes stated: the planning default, recorded AS a default, never as hers', () => {
    const { state, id } = add(real(), { title: 'Buy milk' });
    assert.equal(task(state, id).durationSource, 'default');
    assert.equal(task(state, id).durationMinutes, 15);
    assert.equal(buildMealsView(state, TODAY).mealTasks[0].durationSource, 'default');
  });

  test('[AA2] typed minutes are hers', () => {
    const { state, id } = add(real(), { title: 'Buy milk', minutes: 20 });
    assert.deepEqual([task(state, id).durationMinutes, task(state, id).durationSource], [20, 'user']);
  });

  test('[AA2] typing the very number the default would have is still hers, and an untouched field is still a default', () => {
    let state = add(real(), { title: 'Typed fifteen', minutes: 15 }).state;
    state = add(state, { title: 'Untouched' }).state;
    assert.deepEqual(state.tasks.map((t) => [t.durationMinutes, t.durationSource]), [[15, 'user'], [15, 'default']]);
  });

  test('[Z1] a task whose duration was never recorded reports null, not the default and not hers', () => {
    const { state } = add(real(), { title: 'Legacy' });
    const legacy = { ...state, tasks: state.tasks.map((t) => ({ ...t, durationSource: null })) };
    assert.equal(buildMealsView(legacy, TODAY).mealTasks[0].durationSource, null);
  });

  test('[AA] invalid minutes are refused', () => {
    for (const minutes of [0, -5, 1.5, 1441, Number.NaN]) {
      const result = addMealTask(real(), at(), { title: 'x', minutes });
      assert.equal(result.refusal, 'invalid-minutes', String(minutes));
    }
  });
});

describe('[AB] a due date offered from a meal is not laundered into a fact she stated', () => {
  const due = (state, id) => state.tasks.find((t) => t.id === id).dueDate;

  test('[AB1] proposed but unconfirmed: the task has NO due date', () => {
    const { state, id } = add(real(), { title: 'Buy tortillas', due: { date: TUESDAY, confirmed: false } });
    assert.equal(due(state, id), null);
  });

  test('[AB2] confirmed by her: the due date is the day she chose, and the task is still unplanned', () => {
    const { state, id } = add(real(), { title: 'Buy tortillas', due: { date: TUESDAY, confirmed: true } });
    assert.equal(due(state, id), TUESDAY);
    assert.deepEqual(state.tasks.find((t) => t.id === id).plan, { kind: 'unplanned' });
  });

  test('[AB] no proposal at all: no due date', () => {
    const { state, id } = add(real(), { title: 'Buy tortillas' });
    assert.equal(due(state, id), null);
    const explicitNull = add(real(), { title: 'Buy tortillas', due: null });
    assert.equal(due(explicitNull.state, explicitNull.id), null);
  });

  test('[AB3] any dated task reports its date source as not-recorded: the foundation cannot say who chose a date', () => {
    const { state } = add(real(), { title: 'Buy tortillas', due: { date: TUESDAY, confirmed: true } });
    const [view] = buildMealsView(state, TODAY).mealTasks;
    assert.equal(view.dueDate, TUESDAY);
    assert.equal(view.dueDateSource, 'not-recorded');
    const undated = buildMealsView(add(real(), { title: 'Buy tortillas' }).state, TODAY).mealTasks[0];
    assert.equal(undated.dueDateSource, null);
  });

  test('[AB] a confirmed date must be a real date', () => {
    const result = addMealTask(real(), at(), { title: 'x', due: { date: '2026-02-30', confirmed: true } });
    assert.equal(result.refusal, 'invalid-date');
  });

  test('[AB] a bad proposal is ignored, not an error: nothing was confirmed, so nothing is stored', () => {
    const result = addMealTask(real(), at(), { title: 'x', due: { date: 'soon', confirmed: false } });
    assert.equal(result.refusal, null);
    assert.equal(result.state.tasks[0].dueDate, null);
  });
});

describe('[AY] a double save creates one task', () => {
  test('[AY] the same draft id is a same-reference no-op the second time', () => {
    const first = add(real(), { title: 'Buy milk', id: 'task-draft-1' });
    const second = addMealTask(first.state, at(), { title: 'Buy milk', id: 'task-draft-1' });
    assert.equal(second.refusal, 'exists');
    assert.equal(second.state, first.state);
    assert.equal(second.state.tasks.length, 1);
  });
});

describe('[AC] someone being asked is not the task being covered', () => {
  const setup = () => {
    let state = add(real(), { title: 'Buy tortillas' }).state;
    state = addPerson(state, at(), { displayName: 'Sam', relationship: 'partner' });
    const personId = state.people[0].id;
    const taskId = state.tasks[0].id;
    return { state, personId, taskId };
  };
  const text = (state, nowMs = null) => buildMealsView(state, TODAY, nowMs).mealTasks[0].responsibility;
  const respId = (state) => state.responsibilities[0].id;

  test('[AC1] nothing shown when nobody was asked', () => {
    assert.equal(text(setup().state), null);
  });

  test('[AC1] asked: "no answer yet", and "still waiting" only once the answer was due', () => {
    let { state, personId, taskId } = setup();
    const ctx = at();
    state = delegate(state, ctx, { about: { kind: 'task', id: taskId }, to: { kind: 'person', id: personId }, ackWithinMinutes: 60 });
    assert.equal(text(state, ctx.nowMs).text, 'Asked Sam, no answer yet');
    assert.equal(text(state, ctx.nowMs + 2 * 3_600_000).text, 'Asked Sam, still waiting');
    assert.equal(text(state, null).text, 'Asked Sam, no answer yet', 'without a clock it never claims lateness');
  });

  test('[AC1] seen is not yes; yes is not done', () => {
    let { state, personId, taskId } = setup();
    state = delegate(state, at(), { about: { kind: 'task', id: taskId }, to: { kind: 'person', id: personId } });
    state = acknowledge(state, at(), respId(state));
    assert.equal(text(state).text, 'Sam has seen this');
    state = accept(state, at(), respId(state), false);
    assert.equal(text(state).text, 'Sam said yes');
    assert.equal(text(state).stillNeedsMe, false);
  });

  test('[AC1] yes while it still needs her says so', () => {
    let { state, personId, taskId } = setup();
    state = delegate(state, at(), { about: { kind: 'task', id: taskId }, to: { kind: 'person', id: personId } });
    state = accept(state, at(), respId(state), true);
    assert.equal(text(state).text, 'Sam said yes · still needs you');
  });

  test('[AC2] [AC3] coverage is never established, and no word says covered or handled', () => {
    let { state, personId, taskId } = setup();
    state = delegate(state, at(), { about: { kind: 'task', id: taskId }, to: { kind: 'person', id: personId } });
    for (const step of [(s) => s, (s) => acknowledge(s, at(), respId(s)), (s) => accept(s, at(), respId(s), false)]) {
      state = step(state);
      const [view] = buildMealsView(state, TODAY).mealTasks;
      assert.equal(view.coverage, 'not-established');
      assert.equal(/cover|handled|taken care|done|assigned|delegated|complete/i.test(view.responsibility.text), false, view.responsibility.text);
      assert.equal(view.standing, 'unscheduled', 'and the task is still open and hers to see');
    }
  });
});

describe('[AD] [AE] work is not the plan', () => {
  test('[AD2] completing a task removes it from the open list and creates nothing else', () => {
    const { state, id } = add(real(), { title: 'Buy milk' });
    const done = completeTask(state, at(), id);
    assert.deepEqual(buildMealsView(done, TODAY).mealTasks, []);
    assert.equal(done.meals, state.meals);
  });
});

describe('[BX] the money facet is not used', () => {
  test('[BX1] a meal task carries no value: no cost, budget or estimate is claimed', () => {
    const { state } = add(real(), { title: 'Buy milk' });
    assert.equal(state.tasks[0].value, null);
  });
});
