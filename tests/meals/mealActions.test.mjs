/**
 * HK-FEATURE-08 / ML2 — creating, correcting, moving and removing a meal decision.
 *
 * The actions are pure. A refusal returns the SAME state reference, a changed entry is a new object, and every other entry keeps
 * its reference (the change bridge diffs by reference, so this is what keeps a sync queue honest). Removing an entry is archiving
 * it: not eaten, not skipped, not completed, and no observation is written.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  activeMeals, addMeal, archiveMeal, compareMealPlanEntries, mealDraftFrom, snapshotOfMeal, updateMeal,
} from '../../src/domain/meals.ts';
import { MEAL_PLAN_CAPACITY, validateAppState } from '../../src/domain/state.ts';
import { at, real, USER } from '../support/acceptance.mjs';
import { demoState } from '../support/fixtures.mjs';

const TUESDAY = '2026-09-22';
const WEDNESDAY = '2026-09-23';

const add = (state, input) => {
  const result = addMeal(state, at(), input);
  assert.equal(result.refusal, null, 'add refused: ' + result.refusal);
  return result;
};
const idOf = (state, title) => state.meals.find((m) => m.title === title).id;

describe('[I] create', () => {
  test('[I1] a new stable entry: active, household scope, the Meals category, no slot stated', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    assert.equal(state.meals.length, 1);
    const meal = state.meals[0];
    assert.equal(meal.id, id);
    assert.equal(meal.date, TUESDAY);
    assert.equal(meal.status, 'active');
    assert.equal(meal.scope, 'household');
    assert.equal(meal.categoryId, 'cat-meals');
    assert.equal(meal.prepMinutes, null, 'no prep time is claimed');
    assert.equal(meal.energyDemand, null, 'no easy or hard claim is made');
    assert.equal(validateAppState(state).ok, true);
  });

  test('[G1] the slot is unspecified unless she chose one; nothing defaults to dinner', () => {
    const { state } = add(real(), { title: 'Tacos', date: TUESDAY });
    assert.equal(state.meals[0].slot, 'unspecified');
    const chosen = add(real(), { title: 'Pancakes', date: TUESDAY, slot: 'breakfast' });
    assert.equal(chosen.state.meals[0].slot, 'breakfast');
  });

  test('[I2] provenance is user-action, or demo-seed in a demo household', () => {
    assert.equal(add(real(), { title: 'Tacos', date: TUESDAY }).state.meals[0].provenance.producer, 'user-action');
    const demo = addMeal(demoState(), at(), { title: 'Tacos', date: TUESDAY });
    assert.equal(demo.state.meals[demo.state.meals.length - 1].provenance.producer, 'demo-seed');
  });

  test('[I3] the title is normalized before it is stored', () => {
    assert.equal(add(real(), { title: '   Tacos  ', date: TUESDAY }).state.meals[0].title, 'Tacos');
  });

  test('[I4] a refusal returns the SAME state reference and never throws', () => {
    const state = real();
    for (const [input, refusal] of [
      [{ title: '   ', date: TUESDAY }, 'invalid-title'],
      [{ title: 'x'.repeat(121), date: TUESDAY }, 'invalid-title'],
      [{ title: 'Tacos', date: '2026-02-30' }, 'invalid-date'],
      [{ title: 'Tacos', date: 'Tuesday' }, 'invalid-date'],
      [{ title: 'Tacos', date: TUESDAY, slot: 'dessert' }, 'invalid-slot'],
      [{ title: 'Tacos', date: TUESDAY, id: 'not a valid id' }, 'invalid-id'],
    ]) {
      const result = addMeal(state, at(), input);
      assert.equal(result.refusal, refusal, JSON.stringify(input));
      assert.equal(result.state, state, JSON.stringify(input));
    }
  });

  test('[Y1] no Meals context: creation is refused honestly, not guessed into another category', () => {
    const state = { ...real(), categories: real().categories.filter((c) => c.systemRole !== 'meals') };
    const result = addMeal(state, at(), { title: 'Tacos', date: TUESDAY });
    assert.equal(result.refusal, 'no-meals-context');
    assert.equal(result.state, state);
  });

  test('[Y2] an archived Meals category still resolves and still works', () => {
    const state = real();
    const archived = { ...state, categories: state.categories.map((c) => (c.systemRole === 'meals' ? { ...c, status: 'archived' } : c)) };
    assert.equal(addMeal(archived, at(), { title: 'Tacos', date: TUESDAY }).refusal, null);
  });

  test('[BD] a full plan refuses with plan-full and never makes state invalid', () => {
    const seed = add(real(), { title: 'Seed', date: TUESDAY }).state.meals[0];
    const full = { ...real(), meals: Array.from({ length: MEAL_PLAN_CAPACITY }, (_, i) => ({ ...seed, id: 'meal-full-' + i })) };
    assert.equal(validateAppState(full).ok, true);
    const result = addMeal(full, at(), { title: 'One more', date: TUESDAY });
    assert.equal(result.refusal, 'plan-full');
    assert.equal(result.state, full);
  });

  test('[AY] saving the same draft twice creates exactly one entry', () => {
    const first = add(real(), { title: 'Tacos', date: TUESDAY, id: 'meal-draft-1' });
    const second = addMeal(first.state, at(), { title: 'Tacos', date: TUESDAY, id: 'meal-draft-1' });
    assert.equal(second.refusal, 'exists');
    assert.equal(second.state, first.state, 'the repeat is a same-reference no-op');
    assert.equal(second.state.meals.length, 1);
  });
});

describe('[J] edit the title', () => {
  test('[J1] the same entry, only the title changed, provenance not restamped', () => {
    const { state, id } = add(real(), { title: 'Tacoz', date: TUESDAY, slot: 'dinner' });
    const before = state.meals[0];
    const edited = updateMeal(state, at(), id, { title: 'Tacos' });
    assert.equal(edited.refusal, null);
    const after = edited.state.meals[0];
    assert.equal(after.id, before.id);
    assert.equal(after.title, 'Tacos');
    assert.deepEqual({ ...after, title: before.title }, before);
    assert.deepEqual(after.provenance, before.provenance);
  });

  test('[J3] an unchanged edit is a same-reference no-op', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const result = updateMeal(state, at(), id, { title: 'Tacos', date: TUESDAY, slot: 'unspecified' });
    assert.equal(result.state, state);
    assert.equal(result.refusal, null);
  });

  test('[J] a blank or over-long title is refused and the entry is unchanged', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    for (const title of ['  ', 'x'.repeat(121)]) {
      const result = updateMeal(state, at(), id, { title });
      assert.equal(result.refusal, 'invalid-title');
      assert.equal(result.state, state);
    }
  });

  test('[J] only the edited entry becomes a new object; every other entry keeps its reference', () => {
    let state = add(real(), { title: 'A', date: TUESDAY }).state;
    state = add(state, { title: 'B', date: TUESDAY }).state;
    const [a, b] = state.meals;
    const edited = updateMeal(state, at(), a.id, { title: 'A2' }).state;
    assert.notEqual(edited.meals[0], a);
    assert.equal(edited.meals[1], b);
  });
});

describe('[K] move the date', () => {
  test('[K1] the same stable id moves; the count is unchanged and nothing is duplicated', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const moved = updateMeal(state, at(), id, { date: WEDNESDAY });
    assert.equal(moved.refusal, null);
    assert.equal(moved.state.meals.length, 1);
    assert.equal(moved.state.meals[0].id, id);
    assert.equal(moved.state.meals[0].date, WEDNESDAY);
    assert.equal(moved.state.meals.filter((m) => m.title === 'Tacos').length, 1);
  });

  test('[K3] an invalid date is refused', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    for (const date of ['2026-13-01', '2026-02-30', 'tomorrow', '']) {
      const result = updateMeal(state, at(), id, { date });
      assert.equal(result.refusal, 'invalid-date', date);
      assert.equal(result.state, state);
    }
  });

  test('[K4] the date is stored exactly as given: a calendar date, never an instant', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const moved = updateMeal(state, at(), id, { date: '2026-12-31' }).state.meals[0];
    assert.equal(moved.date, '2026-12-31');
    assert.match(moved.date, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('[L] change the slot', () => {
  test('[L1] same entry, slot changed, every other field intact; and back to unspecified is allowed', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const lunch = updateMeal(state, at(), id, { slot: 'lunch' }).state.meals[0];
    assert.equal(lunch.slot, 'lunch');
    assert.deepEqual({ ...lunch, slot: 'unspecified' }, state.meals[0]);
    const back = updateMeal({ ...state, meals: [lunch] }, at(), id, { slot: 'unspecified' }).state.meals[0];
    assert.equal(back.slot, 'unspecified');
  });

  test('[L] an unknown slot is refused', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const result = updateMeal(state, at(), id, { slot: 'dessert' });
    assert.equal(result.refusal, 'invalid-slot');
    assert.equal(result.state, state);
  });
});

describe('several entries share a date and a slot', () => {
  test('[F1] three dinners on one date all survive with distinct ids', () => {
    let state = real();
    for (const title of ['Tacos', 'Soup', 'Pasta']) state = add(state, { title, date: TUESDAY, slot: 'dinner' }).state;
    assert.equal(state.meals.length, 3);
    assert.equal(new Set(state.meals.map((m) => m.id)).size, 3);
  });

  test('[M] moving into an occupied date and slot is allowed and overwrites nothing', () => {
    let state = add(real(), { title: 'X', date: TUESDAY, slot: 'dinner' }).state;
    state = add(state, { title: 'Y', date: WEDNESDAY, slot: 'dinner' }).state;
    const x = idOf(state, 'X');
    const y = idOf(state, 'Y');
    const moved = updateMeal(state, at(), y, { date: TUESDAY });
    assert.equal(moved.refusal, null);
    assert.equal(moved.state.meals.length, 2);
    const onTuesday = moved.state.meals.filter((m) => m.date === TUESDAY && m.slot === 'dinner').map((m) => m.id).sort();
    assert.deepEqual(onTuesday, [x, y].sort());
    assert.equal(moved.state.meals.find((m) => m.id === x).title, 'X', 'the entry already there was not touched');
  });

  test('[BG] ordering is date, then slot, then id by code unit, whatever order the entries are stored in', () => {
    const template = add(real(), { title: 'T', date: TUESDAY }).state.meals[0];
    const rows = [
      { ...template, id: 'meal-a', slot: 'dinner' },
      { ...template, id: 'meal-B', slot: 'dinner' },
      { ...template, id: 'meal-c', slot: 'breakfast' },
      { ...template, id: 'meal-d', slot: 'unspecified' },
      { ...template, id: 'meal-e', slot: 'dinner', date: '2026-09-21' },
    ];
    const order = (list) => [...list].sort(compareMealPlanEntries).map((m) => m.id);
    const expected = ['meal-e', 'meal-c', 'meal-B', 'meal-a', 'meal-d'];
    assert.deepEqual(order(rows), expected);
    assert.deepEqual(order([...rows].reverse()), expected);
    assert.deepEqual(order([rows[3], rows[0], rows[4], rows[2], rows[1]]), expected);
    // a locale compare would put 'meal-a' before 'meal-B'; the code-unit compare must not
    assert.ok('meal-a'.localeCompare('meal-B') < 0, 'precondition: localeCompare disagrees with code-unit order for these ids');
  });
});

describe('[N] archive', () => {
  test('[N1] status becomes archived; the row is kept with its id; nothing else changes', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY, slot: 'dinner' });
    const result = archiveMeal(state, at(), id);
    assert.equal(result.refusal, null);
    assert.equal(result.state.meals.length, 1);
    const kept = result.state.meals[0];
    assert.equal(kept.id, id);
    assert.equal(kept.status, 'archived');
    assert.deepEqual({ ...kept, status: 'active' }, state.meals[0]);
  });

  test('[N2] an archived entry is no longer in active planning', () => {
    let state = add(real(), { title: 'A', date: TUESDAY }).state;
    state = add(state, { title: 'B', date: TUESDAY }).state;
    const archived = archiveMeal(state, at(), idOf(state, 'A')).state;
    assert.deepEqual(activeMeals(archived).map((m) => m.title), ['B']);
    assert.equal(archived.meals.length, 2, 'the removed entry is still held');
  });

  test('[N3] archiving an archived entry is a refused same-reference no-op', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const archived = archiveMeal(state, at(), id).state;
    const again = archiveMeal(archived, at(), id);
    assert.equal(again.refusal, 'archived');
    assert.equal(again.state, archived);
  });

  test('[N4] an archived entry cannot be edited or moved', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const archived = archiveMeal(state, at(), id).state;
    for (const patch of [{ title: 'New' }, { date: WEDNESDAY }, { slot: 'lunch' }]) {
      const result = updateMeal(archived, at(), id, patch);
      assert.equal(result.refusal, 'archived');
      assert.equal(result.state, archived);
    }
  });

  test('[N] an unknown id is refused as not-found', () => {
    const state = real();
    assert.equal(archiveMeal(state, at(), 'meal-nope').refusal, 'not-found');
    assert.equal(updateMeal(state, at(), 'meal-nope', { title: 'x' }).refusal, 'not-found');
  });

  test('[P] removal is not skipping: no observation is written and no outcome is recorded', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const before = state.observations;
    const archived = archiveMeal(state, at(), id).state;
    assert.equal(archived.observations, before, 'the observations list is the very same reference');
    assert.equal(archived.observations.length, 0);
    const kept = archived.meals[0];
    for (const forbidden of ['skipped', 'eaten', 'completed', 'cooked', 'served']) {
      assert.equal(JSON.stringify(kept).includes(forbidden), false, forbidden + ' must not appear on a removed entry');
    }
  });

  test('[CC1] no meal operation appends an observation', () => {
    let state = real();
    const start = state.observations;
    const created = add(state, { title: 'Tacos', date: TUESDAY });
    state = created.state;
    state = updateMeal(state, at(), created.id, { title: 'Tacos!', date: WEDNESDAY, slot: 'dinner' }).state;
    state = archiveMeal(state, at(), created.id).state;
    assert.equal(state.observations, start);
  });
});

describe('[AQ] a stale editor cannot silently overwrite', () => {
  test('[AQ1] a save against a snapshot that no longer matches is refused as stale', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const opened = snapshotOfMeal(state.meals[0]);
    const changedElsewhere = updateMeal(state, at(), id, { title: 'Burritos' }).state;

    const stale = updateMeal(changedElsewhere, at(), id, { slot: 'dinner' }, opened);
    assert.equal(stale.refusal, 'stale');
    assert.equal(stale.state, changedElsewhere, 'the newer state is kept');
    assert.equal(stale.state.meals[0].title, 'Burritos');

    const archivedStale = archiveMeal(changedElsewhere, at(), id, opened);
    assert.equal(archivedStale.refusal, 'stale');
    assert.equal(archivedStale.state, changedElsewhere);
  });

  test('[AQ1] a fresh snapshot is accepted', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const result = updateMeal(state, at(), id, { slot: 'dinner' }, snapshotOfMeal(state.meals[0]));
    assert.equal(result.refusal, null);
    assert.equal(result.state.meals[0].slot, 'dinner');
  });

  test('[AQ1] an entry archived elsewhere makes an edit refuse (archived), not resurrect it', () => {
    const { state, id } = add(real(), { title: 'Tacos', date: TUESDAY });
    const opened = snapshotOfMeal(state.meals[0]);
    const archived = archiveMeal(state, at(), id).state;
    const result = updateMeal(archived, at(), id, { title: 'Tacos 2' }, opened);
    assert.equal(result.refusal, 'archived');
    assert.equal(result.state.meals[0].status, 'archived');
  });
});

describe('[T] Plan This Again', () => {
  test('[T1] the draft carries title and slot and defaults the date to logical today', () => {
    const { state } = add(real(), { title: 'Tacos', date: TUESDAY, slot: 'dinner' });
    assert.deepEqual(mealDraftFrom(state.meals[0], '2026-09-25'), { title: 'Tacos', slot: 'dinner', date: '2026-09-25' });
  });

  test('[T2] saving creates a NEW entry with a new id; provenance is user-action; no lineage is stored', () => {
    const { state } = add(real(), { title: 'Tacos', date: TUESDAY, slot: 'dinner' });
    const source = state.meals[0];
    const draft = mealDraftFrom(source, '2026-09-29');
    const again = add(state, draft);
    assert.equal(again.state.meals.length, 2);
    const fresh = again.state.meals.find((m) => m.id !== source.id);
    assert.notEqual(fresh.id, source.id);
    assert.equal(fresh.date, '2026-09-29');
    assert.equal(fresh.provenance.producer, 'user-action');
    assert.equal(fresh.provenance.artifactId, null, 'no lineage: provenance cannot name another entry');
  });

  test('[T4] it creates no recurrence, favorite or library entity', () => {
    const { state } = add(real(), { title: 'Tacos', date: TUESDAY });
    const again = add(state, mealDraftFrom(state.meals[0], WEDNESDAY)).state;
    assert.deepEqual(again.recurrences, state.recurrences);
    assert.deepEqual(Object.keys(again).sort(), Object.keys(state).sort());
  });

  test('[U1] the source entry keeps its object reference and is deep-equal to its snapshot', () => {
    const { state } = add(real(), { title: 'Tacos', date: TUESDAY, slot: 'dinner' });
    const source = state.meals[0];
    const snapshot = structuredClone(source);
    const again = add(state, mealDraftFrom(source, WEDNESDAY)).state;
    assert.equal(again.meals[0], source, 'same object reference');
    assert.deepEqual(again.meals[0], snapshot);
  });
});

describe('[E] entries on one date', () => {
  test('[E2] a day reads breakfast, dinner, snack, then the entry with no stated slot', () => {
    let state = real();
    for (const [title, slot] of [['Snack', 'snack'], ['Tacos', 'dinner'], ['Toast', 'breakfast'], ['Leftovers', undefined]]) {
      state = add(state, { title, date: TUESDAY, slot }).state;
    }
    const ordered = [...state.meals].sort(compareMealPlanEntries).map((m) => m.title);
    assert.deepEqual(ordered, ['Toast', 'Tacos', 'Snack', 'Leftovers']);
  });
});

describe('the provenance rule survives', () => {
  test('[I2] a supplied provenance is honoured but the default is a user capture', () => {
    const claimed = { producer: 'talk-it-out', artifactId: null, confidence: null };
    assert.equal(add(real(), { title: 'Tacos', date: TUESDAY, provenance: claimed }).state.meals[0].provenance.producer, 'talk-it-out');
    assert.deepEqual(add(real(), { title: 'Tacos', date: TUESDAY }).state.meals[0].provenance, USER);
  });
});
