/**
 * Run under a chosen process timezone (env TZ) by tests/meals/logicalDate.test.mjs. It takes one meal for Tuesday through every
 * place a logical date is serialized or rehydrated, and prints what came out. A logical date must come out identical whatever
 * timezone the process runs in: it is a calendar date, never an instant.
 */
import { addMeal } from '../../../src/domain/meals.ts';
import { applyCloudRow } from '../../../src/domain/sync/apply.ts';
import { decodeStoredState, encodeStoredState } from '../../../src/persistence/envelope.ts';
import { buildMealsView } from '../../../src/features/meals/mealsView.ts';
import { at, real } from '../../support/acceptance.mjs';

const TUESDAY = '2026-09-22';
const state = addMeal(real(), at(), { id: 'meal-tz', title: 'Tacos', date: TUESDAY, slot: 'dinner' }).state;

const stored = decodeStoredState(encodeStoredState(state, { appVersion: 'probe', savedAt: '2026-09-21T12:00:00.000Z', writeSeq: 1 }));
const pulled = applyCloudRow(
  real(), 'meal', 'meal-tz',
  { local_id: 'meal-tz', meal_date: TUESDAY, title: 'Tacos', category_id: 'cat-meals', scope: 'household', producer: 'user-action', source_artifact_id: null, confidence: null, prep_minutes: null, energy_demand: null },
  () => null,
).meals[0];
const view = buildMealsView(stored.state, '2026-09-21');

console.log(
  JSON.stringify({
    processTimeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    persisted: stored.state.meals[0].date,
    pulled: pulled.date,
    viewDate: view.upNext[1].entries[0].logicalDate,
    viewLabel: view.upNext[1].label,
    a11y: view.upNext[1].entries[0].a11yLabel,
  }),
);
