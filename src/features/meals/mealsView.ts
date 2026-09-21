import { categoryWithRole } from '../../domain/categories';
import type { DurationSource } from '../../domain/foundation/duration';
import type { Provenance } from '../../domain/foundation/provenance';
import { isUnacknowledged, type Responsibility } from '../../domain/foundation/responsibility';
import { addDays, type LocalDate } from '../../domain/logicalDay';
import { activeMeals, compareMealPlanEntries } from '../../domain/meals';
import { liveResponsibilityFor } from '../../domain/responsibility';
import type { AppState, MealPlanEntry, MealSlot, VisibilityScope } from '../../domain/state';
import { openTasksInCategory, type OpenTaskEntry, type TaskStanding } from '../../domain/taskLists';
import { needsAttention, openTaskLabel } from '../life/openTaskLabel';
import { entryA11yLabel, entrySubtitle, responsibilityText } from './mealCopy';
import { longDate, mealDayLabel } from './mealDates';
import { recurringMealWork, type RecurringWorkView } from './recurringMealWork';

/**
 * The Meals hub as data. One pure function, `buildMealsView(state, today)`: it reads canonical state and mutates nothing, and it
 * carries every fact a screen shows, so no reasoning is left in the JSX.
 *
 * What it will not say. A MealPlanEntry is a PLANNING RECORD: `semantic: 'planning-record'`, `plannedState: 'planned'`,
 * `executionState: 'not-tracked'`. No entry, however far in the past, is ever prepared, cooked, served or eaten here, and a blank
 * day is simply not listed: there is no gap, score, streak or attention field anywhere. `unknownFacts` names what a title never
 * tells us. A meal task's `coverage` is always 'not-established', and its `dueDateSource` is 'not-recorded' because the foundation
 * cannot say who chose a date.
 */

export const MEALS_HORIZON_DAYS = 14;
const LATER_LIMIT = 5;
const PLAN_AGAIN_LIMIT = 5;
const PLAN_AGAIN_LOOKBACK_DAYS = 14;
const TASK_LIMIT = 30;

export const MEAL_ACTIONS = ['edit', 'move', 'changeSlot', 'archive', 'planAgain', 'addTask'] as const;
export type MealAction = (typeof MEAL_ACTIONS)[number];

/** What a meal's title does not tell us. */
export const MEAL_UNKNOWN_FACTS = ['ingredients', 'allergens', 'nutrition', 'pantry'] as const;

export interface MealEntryView {
  mealPlanEntryId: string;
  logicalDate: LocalDate;
  mealSlot: MealSlot;
  title: string;
  scope: VisibilityScope;
  provenance: Provenance;
  lifecycle: 'active';
  semantic: 'planning-record';
  plannedState: 'planned';
  executionState: 'not-tracked';
  unknownFacts: readonly string[];
  availableActions: readonly MealAction[];
  /** The meal type, only when it was stated. */
  subtitle: string | null;
  a11yLabel: string;
}

export interface MealDayView {
  date: LocalDate;
  label: string;
  longLabel: string;
  entries: MealEntryView[];
}

export interface PlanAgainView {
  sourceId: string;
  title: string;
  slot: MealSlot;
  lastPlannedOn: LocalDate;
}

export interface ResponsibilityView {
  state: 'owned' | 'requested' | 'acknowledged' | 'accepted';
  text: string;
  stillNeedsMe: boolean;
}

export interface MealTaskView {
  taskId: string;
  title: string;
  standing: TaskStanding;
  date: LocalDate | null;
  standingText: string;
  needsAttention: boolean;
  dueDate: LocalDate | null;
  dueDateSource: 'not-recorded' | null;
  durationSource: DurationSource | null;
  responsibility: ResponsibilityView | null;
  coverage: 'not-established';
}

export interface MealsView {
  today: LocalDate;
  horizonEnd: LocalDate;
  context: 'ok' | 'no-meals-context';
  mealsCategoryId: string | null;
  upNext: MealDayView[];
  nextDays: MealDayView[];
  later: { entries: MealEntryView[]; moreCount: number };
  planAgain: PlanAgainView[];
  mealTasks: MealTaskView[];
  mealTasksMoreCount: number;
  recurringWork: RecurringWorkView[];
  /** At least one active meal decision is planned on or after today. */
  hasPlannedMeals: boolean;
  /** Nothing of Meals to show at all. */
  isEmpty: boolean;
}

function entryView(meal: MealPlanEntry): MealEntryView {
  return {
    mealPlanEntryId: meal.id,
    logicalDate: meal.date,
    mealSlot: meal.slot,
    title: meal.title,
    scope: meal.scope,
    provenance: meal.provenance,
    lifecycle: 'active',
    semantic: 'planning-record',
    plannedState: 'planned',
    executionState: 'not-tracked',
    unknownFacts: MEAL_UNKNOWN_FACTS,
    availableActions: MEAL_ACTIONS,
    subtitle: entrySubtitle(meal.slot),
    a11yLabel: entryA11yLabel(meal.title, meal.slot, meal.date),
  };
}

function dayView(date: LocalDate, today: LocalDate, entries: MealEntryView[]): MealDayView {
  return { date, label: mealDayLabel(date, today), longLabel: longDate(date), entries };
}

function responsibilityView(state: AppState, live: Responsibility, nowMs: number | null): ResponsibilityView | null {
  if (live.state !== 'owned' && live.state !== 'requested' && live.state !== 'acknowledged' && live.state !== 'accepted') return null;
  const holder =
    live.responsibleKind === 'person'
      ? (state.people.find((person) => person.id === live.responsiblePersonId)?.displayName ?? null)
      : live.responsibleKind === 'child'
        ? (state.children.find((child) => child.id === live.responsibleChildId)?.displayName ?? null)
        : null;
  const unanswered = live.state === 'requested' && nowMs !== null && isUnacknowledged(live, nowMs);
  return { state: live.state, text: responsibilityText(live.state, holder, { stillNeedsMe: live.stillNeedsMe, unanswered }), stillNeedsMe: live.stillNeedsMe };
}

function taskView(state: AppState, entry: OpenTaskEntry, today: LocalDate, nowMs: number | null): MealTaskView {
  const task = entry.task;
  const live = liveResponsibilityFor(state, { kind: 'task', id: task.id });
  return {
    taskId: task.id,
    title: task.title,
    standing: entry.standing,
    date: entry.date,
    standingText: openTaskLabel(entry, today),
    needsAttention: needsAttention(entry),
    dueDate: task.dueDate,
    dueDateSource: task.dueDate === null ? null : 'not-recorded',
    durationSource: task.durationSource ?? null,
    responsibility: live === null ? null : responsibilityView(state, live, nowMs),
    coverage: 'not-established',
  };
}

export function buildMealsView(state: AppState, today: LocalDate, nowMs: number | null = null): MealsView {
  const context = categoryWithRole(state, 'meals');
  const active = activeMeals(state).sort(compareMealPlanEntries);

  const tomorrow = addDays(today, 1);
  const horizonEnd = addDays(today, MEALS_HORIZON_DAYS);

  const upNext = [today, tomorrow].map((date) => dayView(date, today, active.filter((meal) => meal.date === date).map(entryView)));

  const nextDays: MealDayView[] = [];
  for (const meal of active) {
    if (meal.date <= tomorrow || meal.date > horizonEnd) continue;
    const last = nextDays[nextDays.length - 1];
    if (last !== undefined && last.date === meal.date) last.entries.push(entryView(meal));
    else nextDays.push(dayView(meal.date, today, [entryView(meal)]));
  }

  const beyond = active.filter((meal) => meal.date > horizonEnd);
  const later = { entries: beyond.slice(0, LATER_LIMIT).map(entryView), moreCount: Math.max(0, beyond.length - LATER_LIMIT) };

  const lookbackStart = addDays(today, -PLAN_AGAIN_LOOKBACK_DAYS);
  const seen = new Set<string>();
  const planAgain: PlanAgainView[] = [];
  for (let i = active.length - 1; i >= 0 && planAgain.length < PLAN_AGAIN_LIMIT; i -= 1) {
    const meal = active[i];
    if (meal.date >= today || meal.date < lookbackStart) continue;
    const key = `${meal.title.toLowerCase()}|${meal.slot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    planAgain.push({ sourceId: meal.id, title: meal.title, slot: meal.slot, lastPlannedOn: meal.date });
  }

  const openTasks = context === null ? [] : openTasksInCategory(state, context.id, today);
  const mealTasks = openTasks.slice(0, TASK_LIMIT).map((entry) => taskView(state, entry, today, nowMs));
  const recurringWork = recurringMealWork(state, today);

  const hasPlannedMeals = active.some((meal) => meal.date >= today);
  return {
    today,
    horizonEnd,
    context: context === null ? 'no-meals-context' : 'ok',
    mealsCategoryId: context?.id ?? null,
    upNext,
    nextDays,
    later,
    planAgain,
    mealTasks,
    mealTasksMoreCount: Math.max(0, openTasks.length - TASK_LIMIT),
    recurringWork,
    hasPlannedMeals,
    isEmpty: !hasPlannedMeals && mealTasks.length === 0 && recurringWork.length === 0 && planAgain.length === 0,
  };
}
