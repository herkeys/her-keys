import { categoryWithRole } from './categories';
import type { TransitionContext } from './context';
import { emptyMealFacets } from './foundation/commitment';
import { provenanceFor, userProvenance, type Provenance } from './foundation/provenance';
import { isLocalDate, type LocalDate } from './logicalDay';
import { ID_PATTERN } from './schemaPrimitives';
import { FIELD_LIMITS, MEAL_PLAN_CAPACITY, MEAL_SLOTS, type AppState, type MealPlanEntry, type MealSlot, type MealStatus } from './state';
import { addTask } from './tasks';

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

/** User-entered single-line text: line breaks collapse to one space, then trimmed. Unicode is permitted; no slug, no parsing. */
function checkLine(raw: string, max: number): MealTitleCheck {
  const title = raw.replace(LINE_BREAKS, ' ').trim();
  if (title.length === 0) return { ok: false, problem: 'blank' };
  if (title.length > max) return { ok: false, problem: 'too-long' };
  return { ok: true, title };
}

export const checkMealTitle = (raw: string): MealTitleCheck => checkLine(raw, MEAL_TITLE_MAX);

/** A meal task's title is an ordinary task title, so it is held to the task limit, and to the same single-line rule. */
export const checkMealTaskTitle = (raw: string): MealTitleCheck => checkLine(raw, FIELD_LIMITS.titleLength);

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

// ------------------------------------------------------------------------------------------------------- meal tasks ---

/**
 * A MEAL TASK is an ordinary canonical Task filed under the Meals category: buy tortillas, defrost chicken, pack lunches. It means
 * only that she chose to track that work. It proves no pantry state, no purchase and no preparation, it is not linked to any meal
 * (no truthful link exists yet), and Feature 08 stores no grocery-or-prep distinction, which would be a second semantic.
 */

/** The longest a task may be said to take, in minutes (a day). */
export const MEAL_TASK_MAX_MINUTES = 1440;

/** The task limit in state.ts; a refused add is friendlier than a whole-state validation failure. */
const TASK_CAPACITY = 5000;

export interface AddMealTaskInput {
  title: string;
  /** Minutes she typed. Omitted or null means she did not say: the task takes the planning default and is recorded AS a default. */
  minutes?: number | null;
  /**
   * The day of the meal this task is for, offered as a PROPOSAL. It is stored only when `confirmed` is true, which only her explicit
   * choice sets. The foundation records no provenance for a due date, so a date Her Keys suggested must never be stored as if she
   * had chosen it; unconfirmed, the task simply has no due date.
   */
  due?: { date: LocalDate; confirmed: boolean } | null;
  /** A draft id allocated when the sheet opened: saving the same draft twice creates one task. */
  id?: string;
}

export type MealTaskRefusal = 'no-meals-context' | 'invalid-title' | 'invalid-minutes' | 'invalid-date' | 'invalid-id' | 'task-full' | 'exists';

export interface MealTaskResult {
  state: AppState;
  /** `exists` is a repeat of a save that already happened: treat it as success. */
  refusal: MealTaskRefusal | null;
  id: string | null;
}

export function addMealTask(state: AppState, ctx: TransitionContext, input: AddMealTaskInput): MealTaskResult {
  const id = input.id ?? ctx.createId('task');
  const refuseTask = (refusal: MealTaskRefusal, at: string | null = null): MealTaskResult => ({ state, refusal, id: at });
  if (state.tasks.some((task) => task.id === id)) return refuseTask('exists', id);
  if (!ID_PATTERN.test(id)) return refuseTask('invalid-id');

  const title = checkMealTaskTitle(input.title);
  if (!title.ok) return refuseTask('invalid-title');

  const minutes = input.minutes ?? null;
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > MEAL_TASK_MAX_MINUTES)) return refuseTask('invalid-minutes');

  const confirmedDue = input.due?.confirmed === true ? input.due.date : null;
  if (confirmedDue !== null && !isLocalDate(confirmedDue)) return refuseTask('invalid-date');

  const context = categoryWithRole(state, 'meals');
  if (context === null) return refuseTask('no-meals-context');
  if (state.tasks.length >= TASK_CAPACITY) return refuseTask('task-full');

  // The one place an id is chosen for the task: addTask asks its context for it, so the draft id becomes the task's id.
  const withId: TransitionContext = { ...ctx, createId: (prefix) => (prefix === 'task' ? id : ctx.createId(prefix)) };
  const next = addTask(state, withId, {
    title: title.title,
    categoryId: context.id,
    scope: 'household',
    // Typed minutes are hers ('user'); no minutes is the planning default, recorded AS a default (never promoted to hers).
    ...(minutes === null ? {} : { durationMinutes: minutes, durationSource: 'user' as const }),
    // Only a date she confirmed. It never sets a plan, so it claims no Calendar time and no capacity beyond an ordinary due date.
    dueDate: confirmedDue,
  });
  return { state: next, refusal: null, id };
}
