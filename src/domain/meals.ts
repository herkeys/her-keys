import { categoryWithRole } from './categories';
import type { TransitionContext } from './context';
import { emptyMealFacets } from './foundation/commitment';
import { provenanceFor, userProvenance, type Provenance } from './foundation/provenance';
import { isLocalDate, type LocalDate } from './logicalDay';
import { ID_PATTERN } from './schemaPrimitives';
import { MEAL_PLAN_CAPACITY, MEAL_SLOTS, type AppState, type MealPlanEntry, type MealSlot, type MealStatus } from './state';

/**
 * Meal decisions. A MealPlanEntry is a PLANNING RECORD: "this household plans this meal for this logical date". Nothing here
 * says a meal was prepared, cooked, served or eaten, and removing one is not skipping it. The actions are pure
 * `(state, ctx, …) → result` like `tasks.ts`; a refusal returns the SAME state reference (a no-op the change bridge ignores),
 * and a changed entry is a new object while every other entry keeps its reference.
 */

/**
 * The longest title NEW input may have. Counted as string length (UTF-16 units), the unit every other title limit here uses, so
 * it always fits the stored limit (200). Legacy or foreign rows may hold up to 200 and must still load: only new input is held to 120.
 */
export const MEAL_TITLE_MAX = 120;

// CR, LF, NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR, built from char codes so this source holds no invisible characters.
const LINE_BREAK_CHARS = String.fromCharCode(0x0d, 0x0a, 0x85, 0x2028, 0x2029);
const LINE_BREAKS = new RegExp(`[${LINE_BREAK_CHARS}]+`, 'g');

export type MealTitleCheck = { ok: true; title: string } | { ok: false; problem: 'blank' | 'too-long' };

/** User-entered text: line breaks collapse to one space, then trimmed. Unicode is permitted; no slug, no parsing. */
export function checkMealTitle(raw: string): MealTitleCheck {
  const title = raw.replace(LINE_BREAKS, ' ').trim();
  if (title.length === 0) return { ok: false, problem: 'blank' };
  if (title.length > MEAL_TITLE_MAX) return { ok: false, problem: 'too-long' };
  return { ok: true, title };
}

export function isMealSlot(value: unknown): value is MealSlot {
  return typeof value === 'string' && (MEAL_SLOTS as readonly string[]).includes(value);
}

/** Display order inside a day. `unspecified` claims no time of day, so it sorts last. */
export const MEAL_SLOT_ORDER: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'other', 'unspecified'];
export const mealSlotRank = (slot: MealSlot): number => MEAL_SLOT_ORDER.indexOf(slot);

/**
 * The one order every surface uses: date, then slot, then id. Ids are compared by code unit, not by locale, so two devices
 * holding the same entries always show them in the same order (ids embed their creation time, so this is creation order too).
 */
export function compareMealPlanEntries(a: Pick<MealPlanEntry, 'date' | 'slot' | 'id'>, b: Pick<MealPlanEntry, 'date' | 'slot' | 'id'>): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const bySlot = mealSlotRank(a.slot) - mealSlotRank(b.slot);
  if (bySlot !== 0) return bySlot;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Entries still in active planning. Archived entries stay in state (so references resolve) but are never planning. */
export const activeMeals = (state: Pick<AppState, 'meals'>): MealPlanEntry[] => state.meals.filter((meal) => meal.status === 'active');

export type MealRefusal =
  | 'no-meals-context'
  | 'invalid-title'
  | 'invalid-date'
  | 'invalid-slot'
  | 'invalid-id'
  | 'plan-full'
  | 'not-found'
  | 'archived'
  | 'stale'
  | 'exists';

export interface MealResult {
  state: AppState;
  /** Null when the action changed nothing wrong. `exists` is a repeat of a save that already happened: treat it as success. */
  refusal: MealRefusal | null;
  id: string | null;
}

const refuse = (state: AppState, refusal: MealRefusal, id: string | null = null): MealResult => ({ state, refusal, id });

/** The fields an editor opens against. Handing it back as `expected` makes a save refuse when the entry changed underneath it. */
export interface MealSnapshot {
  title: string;
  date: LocalDate;
  slot: MealSlot;
  status: MealStatus;
}

export const snapshotOfMeal = (meal: MealPlanEntry): MealSnapshot => ({ title: meal.title, date: meal.date, slot: meal.slot, status: meal.status });

const sameSnapshot = (a: MealSnapshot, b: MealSnapshot) => a.title === b.title && a.date === b.date && a.slot === b.slot && a.status === b.status;

export interface AddMealInput {
  title: string;
  date: LocalDate;
  /** Omitted means `unspecified`. Nothing ever defaults to dinner. */
  slot?: MealSlot;
  /** A draft id allocated when the sheet opened: saving the same draft twice creates one entry. */
  id?: string;
  /** Only a capture the user made is `user-action`, which is the default. */
  provenance?: Provenance;
}

export function addMeal(state: AppState, ctx: TransitionContext, input: AddMealInput): MealResult {
  const id = input.id ?? ctx.createId('meal');
  if (state.meals.some((meal) => meal.id === id)) return refuse(state, 'exists', id);
  if (!ID_PATTERN.test(id)) return refuse(state, 'invalid-id');

  const title = checkMealTitle(input.title);
  if (!title.ok) return refuse(state, 'invalid-title');
  if (!isLocalDate(input.date)) return refuse(state, 'invalid-date');
  const slot = input.slot ?? 'unspecified';
  if (!isMealSlot(slot)) return refuse(state, 'invalid-slot');

  const context = categoryWithRole(state, 'meals');
  if (context === null) return refuse(state, 'no-meals-context');
  if (state.meals.length >= MEAL_PLAN_CAPACITY) return refuse(state, 'plan-full');

  const meal: MealPlanEntry = {
    id,
    date: input.date,
    title: title.title,
    categoryId: context.id,
    slot,
    status: 'active',
    ...emptyMealFacets(),
    provenance: provenanceFor(state.origin, input.provenance ?? userProvenance()),
    scope: 'household',
  };
  return { state: { ...state, meals: [...state.meals, meal] }, refusal: null, id };
}

export interface MealPatch {
  title?: string;
  date?: LocalDate;
  slot?: MealSlot;
}

const replaceMeal = (state: AppState, next: MealPlanEntry): AppState => ({
  ...state,
  meals: state.meals.map((meal) => (meal.id === next.id ? next : meal)),
});

/**
 * Corrects, moves or re-slots an entry. It is always the SAME entry (same id): moving to another date is never a copy, and
 * moving into a date and slot that already has an entry is allowed, because several entries may share both. Provenance is not
 * restamped. With `expected`, a save against an entry that changed since the editor opened is refused as `stale`.
 */
export function updateMeal(state: AppState, _ctx: TransitionContext, id: string, patch: MealPatch, expected?: MealSnapshot): MealResult {
  const current = state.meals.find((meal) => meal.id === id);
  if (current === undefined) return refuse(state, 'not-found', id);
  if (current.status === 'archived') return refuse(state, 'archived', id);
  if (expected !== undefined && !sameSnapshot(expected, snapshotOfMeal(current))) return refuse(state, 'stale', id);

  let title = current.title;
  if (patch.title !== undefined) {
    const checked = checkMealTitle(patch.title);
    if (!checked.ok) return refuse(state, 'invalid-title', id);
    title = checked.title;
  }
  let date = current.date;
  if (patch.date !== undefined) {
    if (!isLocalDate(patch.date)) return refuse(state, 'invalid-date', id);
    date = patch.date;
  }
  let slot = current.slot;
  if (patch.slot !== undefined) {
    if (!isMealSlot(patch.slot)) return refuse(state, 'invalid-slot', id);
    slot = patch.slot;
  }

  if (title === current.title && date === current.date && slot === current.slot) return { state, refusal: null, id };
  return { state: replaceMeal(state, { ...current, title, date, slot }), refusal: null, id };
}

/**
 * Removes an entry from active planning. That is all it means: not eaten, not skipped, not completed, and no observation is
 * written. The row stays (same id, status archived) so the removal is an ordinary update every device receives.
 */
export function archiveMeal(state: AppState, _ctx: TransitionContext, id: string, expected?: MealSnapshot): MealResult {
  const current = state.meals.find((meal) => meal.id === id);
  if (current === undefined) return refuse(state, 'not-found', id);
  if (current.status === 'archived') return refuse(state, 'archived', id);
  if (expected !== undefined && !sameSnapshot(expected, snapshotOfMeal(current))) return refuse(state, 'stale', id);
  return { state: replaceMeal(state, { ...current, status: 'archived' }), refusal: null, id };
}

export interface MealDraft {
  title: string;
  slot: MealSlot;
  date: LocalDate;
}

/**
 * Plan This Again: what a NEW entry starts from. Title and slot come from the earlier entry; the date is logical today as a
 * visible default she confirms or changes. It reads the earlier entry and changes nothing about it, infers no recurrence, and
 * stores no lineage (provenance cannot name another entry).
 */
export const mealDraftFrom = (source: Pick<MealPlanEntry, 'title' | 'slot'>, today: LocalDate): MealDraft => ({
  title: source.title,
  slot: source.slot,
  date: today,
});
