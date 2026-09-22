import { useMemo } from 'react';
import { categoriesInOrder, categoryWithRole } from '../domain/categories';
import { ageOn } from '../domain/logicalDay';
import type { SystemRole } from '../domain/state';
import { openTaskCountsByCategory } from '../domain/taskLists';
import { dayLabel } from '../features/today/formatDay';
import { useHouseholdState } from './AppStateProvider';

/**
 * The household facts screens show, read from canonical state and shaped for
 * display: ages worked out for today, meals labelled relative to today,
 * categories in the household's own order.
 */
export function useHousehold() {
  const { state, today } = useHouseholdState();

  return useMemo(() => {
    const categoryName = new Map(state.categories.map((category) => [category.id, category.name]));

    return {
      today,
      firstName: state.user.displayName?.trim().split(/\s+/)[0] || null,
      children: state.children.map((child) => ({ id: child.id, displayName: child.displayName, age: ageOn(child.birthDate, today) })),
      categories: categoriesInOrder(state),
      systems: state.systems,
      /** Every open task by category, not just today's — a category reading needs both to tell "nothing due" from "nothing there". */
      openTaskCounts: openTaskCountsByCategory(state),
      upcomingMeals: state.meals
        .filter((meal) => meal.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
        .map((meal) => ({ id: meal.id, label: dayLabel(meal.date, today), title: meal.title, categoryId: meal.categoryId })),
      categoryIdForRole: (role: SystemRole) => categoryWithRole(state, role)?.id ?? null,
      categoryName: (categoryId: string) => categoryName.get(categoryId) ?? '',
    };
  }, [state, today]);
}
