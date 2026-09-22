/**
 * HK-FEATURE-08 / ML3 — the Meals hub as data.
 *
 * buildMealsView is pure and reads canonical state. These tests hold what it must never say (a blank day is not a gap, a plan is not
 * a meal eaten, a title is not an ingredient list) as structure, not as prose: the keys and values of the view itself.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { describe, test } from 'node:test';
import { addMeal } from '../../src/domain/meals.ts';
import { addTask, completeTask } from '../../src/domain/tasks.ts';
import { MEALS_HORIZON_DAYS, MEAL_ACTIONS, MEAL_UNKNOWN_FACTS, buildMealsView } from '../../src/features/meals/mealsView.ts';
import { mealsGate, mealsScreenState } from '../../src/features/meals/mealsGate.ts';
import { at, real } from '../support/acceptance.mjs';

const TODAY = '2026-09-21'; // a Monday
const day = (offset) => {
  const [y, m, d] = TODAY.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + offset));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

let counter = 0;
const withMeals = (specs, base = real()) =>
  specs.reduce((state, spec) => {
    counter += 1;
    const result = addMeal(state, at(), { id: spec.id ?? 'meal-t' + String(counter).padStart(5, '0'), title: spec.title, date: spec.date, slot: spec.slot });
    assert.equal(result.refusal, null, spec.title + ' refused: ' + result.refusal);
    return result.state;
  }, base);

const keysDeep = (value, into = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, into));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      keysDeep(v, into);
    }
  }
  return into;
};
const stringsDeep = (value, into = []) => {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsDeep(v, into));
  else if (value !== null && typeof value === 'object') Object.values(value).forEach((v) => stringsDeep(v, into));
  return into;
};
const allEntries = (view) => [...view.upNext.flatMap((d) => d.entries), ...view.nextDays.flatMap((d) => d.entries), ...view.later.entries];

describe('[A] no meal entries', () => {
  test('[A1] [A2] nothing planned is an empty view with today and tomorrow present and blank', () => {
    const view = buildMealsView(real(), TODAY);
    assert.equal(view.isEmpty, true);
    assert.equal(view.hasPlannedMeals, false);
    assert.equal(view.context, 'ok');
    assert.deepEqual(view.upNext.map((d) => [d.date, d.label, d.entries.length]), [[TODAY, 'Today', 0], [day(1), 'Tomorrow', 0]]);
    assert.deepEqual([view.nextDays.length, view.later.entries.length, view.later.moreCount, view.planAgain.length, view.mealTasks.length, view.recurringWork.length], [0, 0, 0, 0, 0, 0]);
  });

  test('[A3] no attention, score, gap or failure key exists anywhere in the view', () => {
    const forbidden = /gap|missing|unplanned|attention|score|streak|percent|complet|overdue.*meal|failure|behind|remaining/i;
    const view = buildMealsView(withMeals([{ title: 'Tacos', date: day(3) }]), TODAY);
    // `needsAttention` belongs to a TASK row (a task she gave a date); no meal-side value may carry any of these words
    const mealSide = { upNext: view.upNext, nextDays: view.nextDays, later: view.later, planAgain: view.planAgain };
    for (const key of keysDeep(mealSide)) assert.equal(forbidden.test(key), false, 'meal-side key ' + key);
    for (const key of keysDeep({ ...view, mealTasks: undefined })) {
      if (key === 'isEmpty') continue;
      assert.equal(/score|streak|percent|gap|missing|unplanned|completion/i.test(key), false, 'view key ' + key);
    }
  });
});

describe('[B] loading is not empty', () => {
  test('[B1] [B2] [B3] the gate says loading while the store or the account has not finished, and never ready', () => {
    const base = { persistence: 'enabled' };
    for (const storeStatus of ['unhydrated', 'hydrating']) {
      assert.deepEqual(mealsGate({ ...base, storeStatus, syncHydration: null }), { state: 'loading', canWrite: false }, storeStatus);
    }
    for (const syncHydration of ['unhydrated', 'hydrating']) {
      assert.equal(mealsScreenState({ ...base, storeStatus: 'ready', syncHydration }), 'loading', 'account hydration ' + syncHydration);
    }
  });

  test('[B4] an unbound local household in ready state is ready, and so is a hydrated account', () => {
    assert.equal(mealsScreenState({ storeStatus: 'ready', persistence: 'enabled', syncHydration: null }), 'ready');
    assert.equal(mealsScreenState({ storeStatus: 'ready', persistence: 'enabled', syncHydration: 'ready' }), 'ready');
  });

  test('[BK] a recovered (fresh) household is recovery, never ready, and cannot be written to', () => {
    assert.deepEqual(mealsGate({ storeStatus: 'recovery', persistence: 'enabled', syncHydration: null }), { state: 'recovery', canWrite: false });
    assert.deepEqual(mealsGate({ storeStatus: 'recovery', persistence: 'disabled', syncHydration: 'ready' }), { state: 'recovery', canWrite: false });
  });

  test('[BK] memory-only persistence is ready to read but cannot promise a saved plan', () => {
    assert.deepEqual(mealsGate({ storeStatus: 'ready', persistence: 'disabled', syncHydration: null }), { state: 'ready', canWrite: false });
  });
});

describe('[C] one entry', () => {
  test('[C1] [C2] [C3] [C4] it carries the structural evidence and is a planning record', () => {
    const view = buildMealsView(withMeals([{ id: 'meal-c1', title: 'Tacos', date: TODAY, slot: 'dinner' }]), TODAY);
    const entry = view.upNext[0].entries[0];
    assert.equal(entry.mealPlanEntryId, 'meal-c1');
    assert.equal(entry.logicalDate, TODAY);
    assert.equal(entry.mealSlot, 'dinner');
    assert.equal(entry.title, 'Tacos');
    assert.equal(entry.scope, 'household');
    assert.equal(entry.provenance.producer, 'user-action');
    assert.equal(entry.lifecycle, 'active');
    assert.equal(entry.semantic, 'planning-record');
    assert.equal(entry.plannedState, 'planned');
    assert.equal(entry.executionState, 'not-tracked');
    assert.deepEqual([...entry.unknownFacts], [...MEAL_UNKNOWN_FACTS]);
    assert.deepEqual([...entry.availableActions], [...MEAL_ACTIONS]);
    assert.equal(view.hasPlannedMeals, true);
    assert.equal(view.isEmpty, false);
  });

  test('[BH] the row is announced with the title, the stated meal type and the full date', () => {
    const view = buildMealsView(withMeals([{ title: 'Tacos', date: '2026-09-22', slot: 'dinner' }, { title: 'Soup', date: '2026-09-22' }]), TODAY);
    const [tacos, soup] = view.upNext[1].entries;
    assert.equal(tacos.a11yLabel, 'Tacos, Dinner, Tuesday 22 September');
    assert.equal(soup.a11yLabel, 'Soup, Tuesday 22 September', 'an unstated meal type is not announced');
    assert.equal(soup.subtitle, null);
  });
});

describe('[D] several dates', () => {
  test('[D1] [D2] [D3] [D4] today and tomorrow are up next; the fortnight lists only days that hold entries; the rest is later', () => {
    const view = buildMealsView(
      withMeals([
        { title: 'Today meal', date: TODAY }, { title: 'Tomorrow meal', date: day(1) }, { title: 'Plus five', date: day(5) },
        { title: 'Plus fourteen', date: day(14) }, { title: 'Plus fifteen', date: day(15) }, { title: 'Plus forty', date: day(40) },
      ]),
      TODAY,
    );
    assert.deepEqual(view.upNext.map((d) => d.entries.map((e) => e.title)), [['Today meal'], ['Tomorrow meal']]);
    assert.deepEqual(view.nextDays.map((d) => [d.date, d.entries.map((e) => e.title)]), [[day(5), ['Plus five']], [day(14), ['Plus fourteen']]]);
    assert.deepEqual(view.later.entries.map((e) => e.title), ['Plus fifteen', 'Plus forty']);
    assert.equal(view.later.moreCount, 0);
    assert.equal(view.horizonEnd, day(MEALS_HORIZON_DAYS));
    assert.deepEqual(view.nextDays.map((d) => d.date), [...view.nextDays.map((d) => d.date)].sort());
  });

  test('[D] a date beyond a week is labelled by its calendar date, never a bare weekday that would name two days', () => {
    const view = buildMealsView(withMeals([{ title: 'Soon', date: day(3) }, { title: 'Next week', date: day(9) }]), TODAY);
    assert.equal(view.nextDays[0].label, 'Thursday');
    assert.equal(view.nextDays[1].label, 'Wed 30 Sep');
  });

  test('[D] later is bounded to five, with an honest count of the rest', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ title: 'Far ' + i, date: day(20 + i) }));
    const view = buildMealsView(withMeals(many), TODAY);
    assert.equal(view.later.entries.length, 5);
    assert.equal(view.later.moreCount, 4);
  });
});

describe('[E] [F] entries share a date and a slot', () => {
  test('[E1] [E2] a day reads breakfast, dinner, snack, then the unstated entry', () => {
    const view = buildMealsView(
      withMeals([{ title: 'Snack', date: day(1), slot: 'snack' }, { title: 'Tacos', date: day(1), slot: 'dinner' }, { title: 'Toast', date: day(1), slot: 'breakfast' }, { title: 'Leftovers', date: day(1) }]),
      TODAY,
    );
    assert.deepEqual(view.upNext[1].entries.map((e) => e.title), ['Toast', 'Tacos', 'Snack', 'Leftovers']);
  });

  test('[E3] [F3] the order is identical however state.meals is ordered', () => {
    const state = withMeals([{ id: 'meal-a', title: 'A', date: day(1), slot: 'dinner' }, { id: 'meal-B', title: 'B', date: day(1), slot: 'dinner' }, { id: 'meal-c', title: 'C', date: day(1), slot: 'dinner' }]);
    const titles = (s) => buildMealsView(s, TODAY).upNext[1].entries.map((e) => e.title);
    const forward = titles(state);
    assert.deepEqual(titles({ ...state, meals: [...state.meals].reverse() }), forward);
    assert.deepEqual(titles({ ...state, meals: [state.meals[1], state.meals[2], state.meals[0]] }), forward);
    assert.deepEqual(forward, ['B', 'A', 'C'], 'code-unit order: capital B sorts before lower-case a and c');
  });
});

describe('[Q] a past planned entry does not become eaten', () => {
  test('[Q1] [Q2] [Q3] it stays a planning record, leaves the upcoming sections, and can be planned again', () => {
    const view = buildMealsView(withMeals([{ id: 'meal-past', title: 'Last week tacos', date: day(-3), slot: 'dinner' }]), TODAY);
    assert.deepEqual(allEntries(view), [], 'a past plan is not an upcoming plan');
    assert.deepEqual(view.planAgain.map((p) => [p.sourceId, p.title, p.slot, p.lastPlannedOn]), [['meal-past', 'Last week tacos', 'dinner', day(-3)]]);
    const text = JSON.stringify(view).toLowerCase();
    for (const word of ['eaten', 'cooked', 'served', 'completed', 'skipped', 'consumed', 'prepared']) assert.equal(text.includes(word), false, word);
  });

  test('[Q4] the passage of time does not change the row', () => {
    const state = withMeals([{ id: 'meal-time', title: 'Tacos', date: day(1) }]);
    const before = state.meals[0];
    const later = buildMealsView(state, day(30));
    assert.equal(state.meals[0], before, 'the projection never touches state');
    assert.equal(later.planAgain.length, 0, 'beyond the lookback it is simply not offered');
    assert.equal(before.status, 'active');
  });

  test('[Q] the plan-again list is bounded, distinct, most recent first, and only from the recent past', () => {
    const specs = [
      { title: 'Tacos', date: day(-1), slot: 'dinner' }, { title: 'tacos', date: day(-2), slot: 'dinner' }, { title: 'Soup', date: day(-3) },
      { title: 'Pasta', date: day(-4) }, { title: 'Rice', date: day(-5) }, { title: 'Eggs', date: day(-6) }, { title: 'Stir fry', date: day(-7) },
      { title: 'Too old', date: day(-20) },
    ];
    const view = buildMealsView(withMeals(specs), TODAY);
    assert.deepEqual(view.planAgain.map((p) => p.title), ['Tacos', 'Soup', 'Pasta', 'Rice', 'Eggs']);
  });
});

describe('[R] [S] a blank date is neutral and nothing is scored', () => {
  test('[R1] [R2] blank days are not listed, and there is no gap in any key', () => {
    const view = buildMealsView(withMeals([{ title: 'Only one', date: day(5) }]), TODAY);
    assert.deepEqual(view.nextDays.map((d) => d.date), [day(5)]);
    assert.equal(view.upNext.every((d) => d.entries.length === 0), true);
  });

  test('[S1] [S2] no score, streak, percent, completion or weekly key exists anywhere', () => {
    const view = buildMealsView(withMeals([{ title: 'A', date: TODAY }, { title: 'B', date: day(2) }, { title: 'C', date: day(9) }]), TODAY);
    for (const key of keysDeep(view)) assert.equal(/score|streak|percent|completion|weekly|rating|progress/i.test(key), false, key);
    for (const text of stringsDeep(view)) assert.equal(/\d\s*(%|of\s+\d+\s+(meals|days)\s+planned)/i.test(text), false, text);
  });

  test('[CE3] a fully empty week and a partial week are both valid states, with nothing owed either way', () => {
    const empty = buildMealsView(real(), TODAY);
    const partial = buildMealsView(withMeals([{ title: 'Just Tuesday', date: day(1) }]), TODAY);
    for (const view of [empty, partial]) {
      assert.equal(view.context, 'ok');
      assert.equal(view.mealTasks.length, 0, 'no task is invented for a blank slot');
    }
  });
});

describe('[G] the unspecified slot', () => {
  test('[G3] an unspecified entry shows no meal-type label and sorts last in its day', () => {
    const view = buildMealsView(withMeals([{ title: 'Whenever', date: day(1) }, { title: 'Breakfast', date: day(1), slot: 'breakfast' }]), TODAY);
    const entries = view.upNext[1].entries;
    assert.deepEqual(entries.map((e) => e.title), ['Breakfast', 'Whenever']);
    assert.equal(entries[1].subtitle, null);
    assert.equal(entries[1].mealSlot, 'unspecified');
  });
});

describe('[AP] the same title on several dates stays separate', () => {
  test('[AP1] [AP2] three Tuesdays of tacos are three records and nothing says they repeat', () => {
    const view = buildMealsView(withMeals([{ id: 'meal-p1', title: 'Tacos', date: day(1) }, { id: 'meal-p2', title: 'Tacos', date: day(8) }, { id: 'meal-p3', title: 'Tacos', date: day(15) }]), TODAY);
    const entries = allEntries(view);
    assert.equal(new Set(entries.map((e) => e.mealPlanEntryId)).size, 3);
    assert.deepEqual(view.recurringWork, [], 'the recurring-work section holds canonical recurring tasks and Systems only, never repeated titles');
    // the meal-side structures carry no notion of repetition (the section NAME `recurringWork` is the one place the word belongs)
    for (const key of keysDeep({ upNext: view.upNext, nextDays: view.nextDays, later: view.later, planAgain: view.planAgain })) assert.equal(/repeat|recurr|every|weekly/i.test(key), false, key);
  });
});

describe('[AM] a title is not an ingredient list', () => {
  test('[AM1] [AM2] [AM3] nothing is inferred from a title: no safety claim, and the unknowns are named', () => {
    const view = buildMealsView(withMeals([{ title: 'Peanut noodles', date: TODAY }, { title: 'Gluten-free pancakes', date: TODAY }]), TODAY);
    for (const entry of view.upNext[0].entries) {
      assert.ok(entry.unknownFacts.includes('allergens'));
      assert.ok(entry.unknownFacts.includes('ingredients'));
    }
    const text = JSON.stringify(view).toLowerCase();
    for (const word of ['safe', 'allergen-free', 'allergenfree', 'fine for', 'ok for', 'healthy', 'nutritious', 'fresh', 'expired', 'in stock']) assert.equal(text.includes(word), false, word);
  });
});

describe('[AO] a plan is not scheduled time', () => {
  test('[AO2] an entry has no time, start, end, duration or minutes field', () => {
    const view = buildMealsView(withMeals([{ title: 'Tacos', date: TODAY, slot: 'dinner' }]), TODAY);
    for (const key of keysDeep({ upNext: view.upNext, nextDays: view.nextDays, later: view.later })) assert.equal(/time|start|end|duration|minutes|at$/i.test(key), false, key);
  });
});

describe('[AE] [AD] work is not the plan', () => {
  const withTask = (state, title, over = {}) => addTask(state, at(), { title, categoryId: 'cat-meals', scope: 'household', ...over });
  const idOf = (state, title) => state.tasks.find((t) => t.title === title).id;

  test('[AE1] [AE2] completing a prep task leaves the meal byte-identical and does not mark it served', () => {
    let state = withMeals([{ id: 'meal-ae', title: 'Chicken', date: TODAY, slot: 'dinner' }]);
    state = withTask(state, 'Defrost chicken');
    const before = JSON.stringify(buildMealsView(state, TODAY).upNext);
    const done = completeTask(state, at(), idOf(state, 'Defrost chicken'));
    assert.equal(buildMealsView(done, TODAY).mealTasks.length, 0, 'the completed task left the open list');
    assert.equal(JSON.stringify(buildMealsView(done, TODAY).upNext), before);
    assert.equal(buildMealsView(done, TODAY).upNext[0].entries[0].executionState, 'not-tracked');
  });

  test('[AD1] [AD2] [AD3] completing a grocery task creates no pantry, stock or availability fact anywhere', () => {
    let state = withTask(withMeals([{ title: 'Milkshake', date: TODAY }]), 'Buy milk');
    const before = buildMealsView(state, TODAY);
    state = completeTask(state, at(), idOf(state, 'Buy milk'));
    const after = buildMealsView(state, TODAY);
    assert.deepEqual(after.upNext, before.upNext, 'no meal gained any state');
    // `availableActions` lists what a person can DO with an entry; it says nothing about food, so it is the one key that may hold the word
    for (const key of keysDeep(after)) {
      if (key === 'availableActions') continue;
      assert.equal(/inventory|pantry|stock|available|purchased|bought/i.test(key), false, key);
    }
    for (const text of stringsDeep(after).filter((s) => !MEAL_UNKNOWN_FACTS.includes(s) && !MEAL_ACTIONS.includes(s))) assert.equal(/inventory|pantry|in stock|available|purchased|bought/i.test(text), false, text);
  });
});

describe('[BG] deterministic ordering', () => {
  test('[BG1] ids that differ by case are ordered by code unit whatever order they arrive in', () => {
    const ids = ['meal-b', 'meal-B', 'meal-a', 'meal-A', 'meal-_'];
    const state = withMeals(ids.map((id) => ({ id, title: id, date: day(1), slot: 'dinner' })));
    const expected = [...ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    for (const meals of [state.meals, [...state.meals].reverse(), [state.meals[2], state.meals[4], state.meals[0], state.meals[3], state.meals[1]]]) {
      assert.deepEqual(buildMealsView({ ...state, meals }, TODAY).upNext[1].entries.map((e) => e.mealPlanEntryId), expected);
    }
  });
});

describe('[Y] the Meals context', () => {
  test('[Y1] [Y3] without a Meals category the view says so, lists no tasks, and never falls back to all tasks', () => {
    let state = withMeals([{ title: 'Tacos', date: TODAY }]);
    state = addTask(state, at(), { title: 'Not a meal task', categoryId: 'cat-home', scope: 'household' });
    const noContext = { ...state, categories: state.categories.filter((c) => c.systemRole !== 'meals') };
    const view = buildMealsView(noContext, TODAY);
    assert.equal(view.context, 'no-meals-context');
    assert.equal(view.mealsCategoryId, null);
    assert.deepEqual(view.mealTasks, [], 'not every household task');
    assert.equal(view.upNext[0].entries.length, 1, 'existing plans are still shown');
  });
});

describe('[AR] [AS] dense fixtures', () => {
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const p95 = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)];

  test('[AR1] [AR2] 80 entries over 30 dates and every slot: the right sections, and a median under 100 ms', () => {
    const slots = ['breakfast', 'lunch', 'dinner', 'snack', 'other', undefined];
    const specs = Array.from({ length: 80 }, (_, i) => ({ title: 'Meal ' + i, date: day(i % 30), slot: slots[i % slots.length] }));
    const state = withMeals(specs);
    const samples = [];
    let view;
    for (let i = 0; i < 25; i += 1) {
      const t0 = performance.now();
      view = buildMealsView(state, TODAY);
      samples.push(performance.now() - t0);
    }
    const inHorizon = specs.filter((s) => s.date <= day(MEALS_HORIZON_DAYS)).length;
    assert.equal(view.upNext.reduce((n, d) => n + d.entries.length, 0) + view.nextDays.reduce((n, d) => n + d.entries.length, 0), inHorizon);
    assert.equal(view.later.entries.length + view.later.moreCount, specs.length - inHorizon);
    assert.ok(median(samples) < 100, 'median ' + median(samples).toFixed(2) + ' ms');
    console.log(`  perf AR: 80 entries, ${process.version} ${process.platform}/${process.arch}, warm, 25 samples, median ${median(samples).toFixed(2)} ms, p95 ${p95(samples).toFixed(2)} ms`);
  });

  test('[AS1] [AS2] 120 open meal tasks: standings are correct, rendering is bounded, and the median is under 100 ms', () => {
    let state = withMeals([{ title: 'Tacos', date: TODAY }]);
    for (let i = 0; i < 120; i += 1) {
      state = addTask(state, at(), { title: 'Task ' + String(i).padStart(3, '0'), categoryId: 'cat-meals', scope: 'household', dueDate: i % 3 === 0 ? day((i % 9) - 3) : null });
    }
    const samples = [];
    let view;
    for (let i = 0; i < 25; i += 1) {
      const t0 = performance.now();
      view = buildMealsView(state, TODAY);
      samples.push(performance.now() - t0);
    }
    assert.equal(view.mealTasks.length, 30, 'the list is bounded');
    assert.equal(view.mealTasksMoreCount, 90, 'with an honest count of the rest');
    const order = ['overdue', 'due_today', 'today', 'upcoming', 'unscheduled'];
    const ranks = view.mealTasks.map((t) => order.indexOf(t.standing));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'overdue first, undated last');
    assert.ok(median(samples) < 100, 'median ' + median(samples).toFixed(2) + ' ms');
    console.log(`  perf AS: 120 tasks + 1 entry, ${process.version} ${process.platform}/${process.arch}, warm, 25 samples, median ${median(samples).toFixed(2)} ms, p95 ${p95(samples).toFixed(2)} ms`);
  });
});
