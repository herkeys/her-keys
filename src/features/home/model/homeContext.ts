import { categoryWithRole } from '../../../domain/categories';
import type { AppState, HouseholdCategory, SystemRole } from '../../../domain/state';

/**
 * THE HOME CONTEXT — the one canonical answer to "is this record about the home?".
 *
 * Home OS is bound to the household category that carries the system role `home`. That is stable identity: a category's `id`
 * and `systemRole` survive renaming, reordering, archiving and every trip through storage and sync, while its `name` is
 * presentation the household may change at any time ("Home" -> "House stuff"). So nothing in Home OS ever reads a name, a title
 * or a keyword to decide what belongs to the home. A record belongs to Home exactly when its own single `categoryId` IS this
 * category's id.
 *
 * V1 LIMITATION (the certified model, not a choice made here): a task, event or System belongs to exactly ONE category. A task
 * she filed under her own "Yard" or "Errands" category has no Home association and does not appear in Home. Home does not guess,
 * parse titles, or reclassify anything to make it appear. A record can belong to several contexts only after the owner approves
 * a multi-context model (a new durable semantic).
 */
export const HOME_ROLE: SystemRole = 'home';

export type HomeContext =
  /** The Home area exists and is in use. */
  | { kind: 'active'; category: HouseholdCategory }
  /** The Home area was archived. Its records still point at it, so they are still Home records — but it is no longer in use. */
  | { kind: 'archived'; category: HouseholdCategory }
  /** No category on this device carries the `home` role. Home cannot say what belongs to the home, and must not pretend it is empty. */
  | { kind: 'missing' };

export function homeContextOf(state: Pick<AppState, 'categories'>): HomeContext {
  const category = categoryWithRole(state, HOME_ROLE);
  if (category === null) return { kind: 'missing' };
  return category.status === 'active' ? { kind: 'active', category } : { kind: 'archived', category };
}

/** The Home category's id, whether or not it is archived; null only when there is no Home category at all. */
export const homeCategoryIdOf = (context: HomeContext): string | null => (context.kind === 'missing' ? null : context.category.id);

/**
 * Whether a record is a Home record. Identity only: the record's own `categoryId` equals the Home category's id. There is no
 * other test, on purpose — never a title, never a category name, never a keyword.
 */
export function isHomeRecord(context: HomeContext, record: { categoryId: string }): boolean {
  return context.kind !== 'missing' && record.categoryId === context.category.id;
}

/**
 * What the household currently CALLS the Home area. Presentation only (a screen title); it is never an input to any decision.
 * Falls back to "Home" when there is no Home category to ask.
 */
export const homeLabelOf = (context: HomeContext): string => (context.kind === 'missing' ? 'Home' : context.category.name);
