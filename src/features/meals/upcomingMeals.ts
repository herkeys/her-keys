import type { LocalDate } from '../../domain/logicalDay';
import { activeMeals, compareMealPlanEntries } from '../../domain/meals';
import type { AppState } from '../../domain/state';
import { mealDayLabel } from './mealDates';

/**
 * The active meal decisions from today on, soonest first, as the Life hub row reads them. One selector for the hook and its test.
 * Archived entries were removed from planning, so they never count as planned; the order is the shared device-independent one.
 */
export function upcomingMealsOf(state: Pick<AppState, 'meals'>, today: LocalDate) {
  return activeMeals(state)
    .filter((meal) => meal.date >= today)
    .sort(compareMealPlanEntries)
    .map((meal) => ({ id: meal.id, label: mealDayLabel(meal.date, today), title: meal.title, categoryId: meal.categoryId }));
}
