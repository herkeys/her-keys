/**
 * HK-FEATURE-08 / ML2 — the MealPlanEntry as a durable record.
 *
 * A MealPlanEntry is a PLANNING RECORD for a logical date. These tests hold the two fields Feature 08 added (slot, status),
 * the closed slot set, the title contract, the cap, and the record's journey through persistence and the sync projection.
 * Test titles start with the scenario id in brackets (see tests/fixtures/meals/scenario-map.json).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MEAL_SLOT_ORDER, MEAL_TITLE_MAX, checkMealTitle, isMealSlot, mealSlotRank } from '../../src/domain/meals.ts';
import { MEAL_PLAN_CAPACITY, MEAL_SLOTS, MEAL_STATUSES, MealPlanEntrySchema, validateAppState } from '../../src/domain/state.ts';
import { applyCloudRow } from '../../src/domain/sync/apply.ts';
import { UPDATABLE_COLUMNS, updatablePatch } from '../../src/domain/sync/syncTypes.ts';
import { decodeStoredState, encodeStoredState } from '../../src/persistence/envelope.ts';
import { real, USER } from '../support/acceptance.mjs';

const NL = String.fromCharCode(10);
const LS = String.fromCharCode(0x2028);

const meal = (over = {}) => ({
  id: 'meal-1', date: '2026-09-22', title: 'Tacos', categoryId: 'cat-meals', slot: 'unspecified', status: 'active',
  prepMinutes: null, energyDemand: null, provenance: USER, scope: 'household', ...over,
});
const withMeals = (meals) => ({ ...real(), meals });
const encode = (state) => encodeStoredState(state, { appVersion: 'test', savedAt: '2026-09-21T15:00:00.000Z', writeSeq: 1 });

describe('the closed vocabularies', () => {
  test('[H] the slot set is exactly the six contract values, and nothing defaults to dinner', () => {
    assert.deepEqual([...MEAL_SLOTS], ['unspecified', 'breakfast', 'lunch', 'dinner', 'snack', 'other']);
    assert.deepEqual([...MEAL_STATUSES], ['active', 'archived']);
    const parsed = MealPlanEntrySchema.parse({ id: 'meal-1', date: '2026-09-22', title: 'Tacos', categoryId: 'cat-meals', prepMinutes: null, energyDemand: null, provenance: USER, scope: 'household' });
    assert.equal(parsed.slot, 'unspecified');
    assert.equal(parsed.status, 'active');
  });

  test('[H] slot ranks: breakfast 0, lunch 1, dinner 2, snack 3, other 4, unspecified 5', () => {
    assert.deepEqual([...MEAL_SLOT_ORDER], ['breakfast', 'lunch', 'dinner', 'snack', 'other', 'unspecified']);
    assert.deepEqual(MEAL_SLOTS.map((s) => mealSlotRank(s)).sort(), [0, 1, 2, 3, 4, 5]);
    assert.equal(mealSlotRank('unspecified'), 5);
  });

  test('[H] an invalid slot or status is rejected, never coerced', () => {
    assert.equal(isMealSlot('dessert'), false);
    assert.equal(isMealSlot(undefined), false);
    for (const bad of [{ slot: 'dessert' }, { slot: 'DINNER' }, { slot: null }, { status: 'deleted' }, { status: 'skipped' }, { status: 'eaten' }]) {
      assert.equal(validateAppState(withMeals([meal(bad)])).ok, false, JSON.stringify(bad));
    }
  });

  test('[H] each of the six slots survives a save and a reload', () => {
    const meals = MEAL_SLOTS.map((slot, i) => meal({ id: 'meal-' + (i + 1), slot }));
    const state = withMeals(meals);
    const back = decodeStoredState(encode(state));
    assert.equal(back.kind, 'valid');
    assert.deepEqual(back.state.meals.map((m) => m.slot), [...MEAL_SLOTS]);
  });
});

describe('a legacy row is still a truthful row', () => {
  test('[AF] a row written before slot and status existed decodes as unspecified and active', () => {
    const state = withMeals([meal()]);
    const raw = JSON.parse(encode(state));
    for (const row of raw.data.meals) {
      delete row.slot;
      delete row.status;
    }
    const back = decodeStoredState(JSON.stringify(raw));
    assert.equal(back.kind, 'valid');
    assert.equal(back.state.meals[0].slot, 'unspecified');
    assert.equal(back.state.meals[0].status, 'active');
  });

  test('[AX] a legacy title of 200 characters stays valid, and 201 does not', () => {
    assert.equal(validateAppState(withMeals([meal({ title: 'x'.repeat(200) })])).ok, true);
    assert.equal(validateAppState(withMeals([meal({ title: 'x'.repeat(201) })])).ok, false);
  });

  test('[AF] every field survives a save and a reload', () => {
    const state = withMeals([meal({ slot: 'dinner', date: '2026-09-22', title: 'Tacos on Tuesday' })]);
    const back = decodeStoredState(encode(state));
    assert.equal(back.kind, 'valid');
    assert.deepEqual(back.state.meals, state.meals);
  });
});

describe('the title contract', () => {
  test('[I3] trimmed, single line, at most 120', () => {
    assert.deepEqual(checkMealTitle('  Tacos  '), { ok: true, title: 'Tacos' });
    assert.deepEqual(checkMealTitle('Tacos' + NL + 'and rice'), { ok: true, title: 'Tacos and rice' });
    assert.deepEqual(checkMealTitle('Tacos' + LS + NL + NL + 'rice'), { ok: true, title: 'Tacos rice' });
    assert.deepEqual(checkMealTitle('   '), { ok: false, problem: 'blank' });
    assert.deepEqual(checkMealTitle(NL), { ok: false, problem: 'blank' });
    assert.equal(checkMealTitle('x'.repeat(MEAL_TITLE_MAX)).ok, true);
    assert.deepEqual(checkMealTitle('x'.repeat(MEAL_TITLE_MAX + 1)), { ok: false, problem: 'too-long' });
  });

  test('[I3] Unicode is permitted, and the limit is string length so 120 always fits the stored 200', () => {
    assert.equal(checkMealTitle('Crème brûlée').ok, true);
    assert.equal(checkMealTitle('ラーメン').ok, true);
    // an astral character is two UTF-16 units: 61 of them is 122 units, over the limit
    const emoji = String.fromCodePoint(0x1f32e);
    assert.equal(checkMealTitle(emoji.repeat(60)).ok, true);
    assert.equal(checkMealTitle(emoji.repeat(61)).ok, false);
    assert.ok(MEAL_TITLE_MAX <= 200, 'a new title can never exceed what storage tolerates');
  });

  test('[I3] the title is stored as typed: no slug, no parsed ingredients, no slot read out of it', () => {
    const checked = checkMealTitle('Dinner: peanut noodles');
    assert.equal(checked.ok && checked.title, 'Dinner: peanut noodles');
  });
});

describe('the cap', () => {
  test('[BD] the cap is 5000, the size of tasks and events, and a full plan is still valid state', () => {
    assert.equal(MEAL_PLAN_CAPACITY, 5000);
    const full = Array.from({ length: MEAL_PLAN_CAPACITY }, (_, i) => meal({ id: 'meal-' + i }));
    assert.equal(validateAppState(withMeals(full)).ok, true);
    assert.equal(validateAppState(withMeals([...full, meal({ id: 'meal-over' })])).ok, false);
  });
});

describe('the sync projection carries the two fields, and only through the grant', () => {
  test('[H] slot and status are updatable columns of the meal kind, listed by hand', () => {
    assert.ok(UPDATABLE_COLUMNS.meal.includes('meal_slot'));
    assert.ok(UPDATABLE_COLUMNS.meal.includes('status'));
    assert.deepEqual(updatablePatch('meal', { meal_slot: 'lunch', status: 'archived', household_id: 'h', id: 'x' }), { meal_slot: 'lunch', status: 'archived' });
  });

  test('[AX] applying a pulled row: an absent slot or status reads as the default, an unknown value is kept raw for the integrity gate', () => {
    const base = { local_id: 'meal-1', meal_date: '2026-09-22', title: 'Tacos', category_id: 'cat-meals', scope: 'household', producer: 'user-action', source_artifact_id: null, confidence: null, prep_minutes: null, energy_demand: null };
    const state = real();
    const apply = (row) => applyCloudRow(state, 'meal', 'meal-1', row, () => null).meals.find((m) => m.id === 'meal-1');

    const absent = apply(base);
    assert.equal(absent.slot, 'unspecified');
    assert.equal(absent.status, 'active');

    const explicit = apply({ ...base, meal_slot: 'breakfast', status: 'archived' });
    assert.equal(explicit.slot, 'breakfast');
    assert.equal(explicit.status, 'archived');

    // A value this client does not know is NOT coerced to something plausible: it stays as it arrived, so state validation refuses it.
    const unknown = apply({ ...base, meal_slot: 'dessert', status: 'deleted' });
    assert.equal(unknown.slot, 'dessert');
    assert.equal(unknown.status, 'deleted');
    assert.equal(validateAppState({ ...state, meals: [unknown] }).ok, false);
  });
});
