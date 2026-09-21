import type { MealSlot } from '../../domain/state';
import type { LocalDate } from '../../domain/logicalDay';
import { longDate, shortDate } from './mealDates';

/**
 * Every word the Meals screen says. Kept in one place so the copy audit can read it mechanically.
 *
 * The rules this copy keeps: a blank day is not a problem and is never worded as one; a planned meal is a decision, not a
 * preparation, purchase, serving or meal eaten; a removed meal was removed, not skipped; nothing here says what is in a meal,
 * whether it is safe, healthy or fresh, or what the pantry holds. Empty states describe; they never prescribe.
 */

export const SLOT_LABEL: Record<MealSlot, string> = {
  unspecified: 'Not set',
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  other: 'Other',
};

/** The chips offered. None selected is `unspecified`: an unstated meal type is a fact, and it is allowed. */
export const SLOT_CHOICES: readonly Exclude<MealSlot, 'unspecified'>[] = ['breakfast', 'lunch', 'dinner', 'snack', 'other'];

export const MEAL_COPY = {
  // the hub
  addMeal: 'Add a meal',
  noMealsYet: 'No meals planned yet.',
  noMealsDay: 'No meals planned.',
  sectionUpNext: 'Up next',
  sectionNextDays: 'Next 14 days',
  sectionLater: 'Later',
  sectionTasks: 'Meal tasks',
  sectionRecurring: 'Recurring meal work',
  sectionPlanAgain: 'Plan again',
  noMealTasks: 'No meal tasks yet.',
  addTask: 'Add a meal task',

  // when the household cannot be read as a plan
  loading: 'Getting your meals ready…',
  recoveryTitle: 'Meals can’t show your plan right now.',
  recoveryBody: 'Her Keys couldn’t use what was saved on this device, so it started fresh. Nothing shown here is a record of your meals.',
  unavailableTitle: 'Meals isn’t set up on this household yet.',
  unavailableBody: 'Meal plans belong to a Meals category, and this household doesn’t have one.',
  readOnlyNotice: 'Changes can’t be saved right now.',

  // the meal sheet
  sheetAddTitle: 'Add a meal',
  sheetEditTitle: 'Edit meal',
  sheetAgainTitle: 'Plan this again',
  fieldMeal: 'Meal',
  fieldMealPlaceholder: 'For example, tacos',
  fieldDay: 'Day',
  fieldAnotherDay: 'Another day',
  fieldDate: 'Date (YYYY-MM-DD)',
  fieldType: 'Meal type',
  save: 'Add to plan',
  saveChanges: 'Save changes',
  cancel: 'Cancel',
  remove: 'Remove from plan',
  planAgain: 'Plan this again',
  addTaskForMeal: 'Add a task for this meal',

  // feedback
  removed: 'Removed from your plan.',
  errBlank: 'Give the meal a name.',
  errTooLong: 'Keep the name to 120 characters or fewer.',
  errDate: 'Use a date like 2026-09-22.',
  errStale: 'This meal changed somewhere else. The latest version is shown.',
  errFull: 'Her Keys can’t hold any more meals. Remove one to add another.',
  errUnavailable: 'Meals isn’t set up on this household yet.',
  errSave: 'Her Keys couldn’t save that yet. Try again.',

  // the meal task sheet
  taskSheetTitle: 'Add a meal task',
  fieldTask: 'Task',
  fieldTaskPlaceholder: 'For example, buy tortillas or defrost chicken',
  fieldMinutes: 'About how long? (minutes, optional)',
  minutesHint: 'Leave it blank if you’re not sure.',
  taskSave: 'Add task',
  taskAdded: 'Added to your meal tasks.',
  errTaskBlank: 'Give the task a name.',
  errMinutes: 'Use a whole number of minutes, or leave it blank.',
} as const;

/** "Not set" or the slot's name: the visible state of the meal-type choice, so a default is never hidden. */
export const mealTypeSummary = (slot: MealSlot): string => SLOT_LABEL[slot];

export const moreLater = (count: number): string => (count === 1 ? '1 more meal is planned after that.' : `${count} more meals are planned after that.`);
export const moreTasks = (count: number): string => (count === 1 ? '1 more meal task is in your tasks.' : `${count} more meal tasks are in your tasks.`);

/** What a screen reader says for one entry: the title, the meal type only when it was stated, and the full date. */
export function entryA11yLabel(title: string, slot: MealSlot, date: LocalDate): string {
  return slot === 'unspecified' ? `${title}, ${longDate(date)}` : `${title}, ${SLOT_LABEL[slot]}, ${longDate(date)}`;
}

/** The quiet second line of an entry: its meal type, only when it was stated. */
export const entrySubtitle = (slot: MealSlot): string | null => (slot === 'unspecified' ? null : SLOT_LABEL[slot]);

/** The due-date proposal in a meal's task flow. It is a proposal: nothing is recorded until she chooses it. */
export const dueProposalLabel = (date: LocalDate): string => `Due ${shortDate(date)}, the day of this meal`;
export const dueProposalA11yLabel = (date: LocalDate): string => `Due ${longDate(date)}, the day of this meal`;

/**
 * Who has what, said only as far as the record goes. Assigned is not seen, seen is not agreed, and agreed is not done or covered:
 * none of these words says a task is handled.
 */
export function responsibilityText(state: 'owned' | 'requested' | 'acknowledged' | 'accepted', holder: string | null, options: { stillNeedsMe?: boolean; unanswered?: boolean } = {}): string {
  const name = holder ?? 'someone';
  switch (state) {
    case 'owned':
      return 'Yours';
    case 'requested':
      return options.unanswered ? `Asked ${name}, still waiting` : `Asked ${name}, no answer yet`;
    case 'acknowledged':
      return `${name} has seen this`;
    case 'accepted':
      return options.stillNeedsMe ? `${name} said yes · still needs you` : `${name} said yes`;
  }
}
