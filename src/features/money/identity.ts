import { categoryWithRole } from '../../domain/categories';
import type { AppState, HouseholdCategory } from '../../domain/state';

/**
 * IDENTITY — how Money OS finds itself in canonical state.
 *
 * Money is not a new category system: it reuses the `cat-money` starter category
 * (`systemRole: 'money'`), which has existed since Build 2, exactly the way F07
 * reuses the `coparenting` role. See docs/builds/HK_FEATURE_09_MONEY.md, item 8.
 */

export function moneyCategory(state: Pick<AppState, 'categories'>): HouseholdCategory | null {
  return categoryWithRole(state, 'money');
}

export function moneyCategoryId(state: Pick<AppState, 'categories'>): string | null {
  return moneyCategory(state)?.id ?? null;
}
