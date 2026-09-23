import type { TransitionContext } from './context';
import { provenanceFor, systemProvenance, userProvenance, type Provenance } from './foundation/provenance';
import type { AppState, HouseholdCategory, SystemRole, VisibilityScope } from './state';

/**
 * Households define their structure; Her Keys coordinates that structure.
 *
 * Every household starts from the same eight categories, but they are a
 * starting configuration rather than a closed list. Names are presentation and
 * can change freely; identity is `id`, and `systemRole` is explicit semantic
 * metadata that is never inferred from a name.
 */

const STARTER_CATEGORIES: ReadonlyArray<{ id: string; name: string; systemRole: SystemRole; scope: VisibilityScope }> = [
  { id: 'cat-kids', name: 'Kids', systemRole: 'kids', scope: 'household' },
  { id: 'cat-home', name: 'Home', systemRole: 'home', scope: 'household' },
  { id: 'cat-money', name: 'Money', systemRole: 'money', scope: 'household' },
  { id: 'cat-meals', name: 'Meals', systemRole: 'meals', scope: 'household' },
  { id: 'cat-work', name: 'Work', systemRole: 'work', scope: 'professional' },
  { id: 'cat-wellbeing', name: 'Wellbeing', systemRole: 'wellbeing', scope: 'personal' },
  { id: 'cat-relationships', name: 'Relationships', systemRole: 'relationships', scope: 'personal' },
  { id: 'cat-coparenting', name: 'Co-parenting', systemRole: 'coparenting', scope: 'coparent-shared' },
];

export const MAX_CATEGORY_NAME_LENGTH = 60;

/**
 * The eight starters arrive with the household, so by default they are
 * `system-derived`. A demo household passes `demo-seed` instead: the same rows,
 * a different truth about where they came from.
 */
export function starterCategories(householdId: string, provenance: Provenance = systemProvenance()): HouseholdCategory[] {
  return STARTER_CATEGORIES.map((category, index) => ({
    ...category,
    householdId,
    status: 'active',
    sortOrder: index,
    provenance: { ...provenance },
  }));
}

/** Categories in the household's own order; ties can't happen (sortOrder is unique) but ids keep it deterministic. */
export function categoriesInOrder(state: Pick<AppState, 'categories'>, options: { includeArchived?: boolean } = {}): HouseholdCategory[] {
  return state.categories
    .filter((category) => options.includeArchived || category.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** The category carrying a role, whatever it is called and whether or not it is archived. */
export function categoryWithRole(state: Pick<AppState, 'categories'>, role: SystemRole): HouseholdCategory | null {
  return state.categories.find((category) => category.systemRole === role) ?? null;
}

const PRIVATE_SCOPES: ReadonlySet<VisibilityScope> = new Set(['personal', 'professional', 'coparent-shared']);

/**
 * The visibility a NEW row gets when nothing more specific decides it: its category's (HK13-D14).
 *
 * A category carries the scope the household gave it, and the cloud enforces it (`private.can_access_scoped_row`: `personal`,
 * `professional` and `coparent-shared` rows are hers alone). Filed under a private category — Work, Wellbeing, Relationships,
 * Co-parenting — a new row is private to her; under a household category it is shared, and about a child it is child-scoped. The
 * generic editors and an accepted Talk It Out capture used to write `household` whatever the category, so a Wellbeing appointment
 * added from Calendar was visible to every member of the household. Scope is fixed when a row is created; an edit never changes it.
 */
export function scopeForNewRow(state: Pick<AppState, 'categories' | 'children'>, categoryId: string, subjectMemberId: string | null = null): VisibilityScope {
  const declared = state.categories.find((category) => category.id === categoryId)?.scope ?? 'household';
  if (PRIVATE_SCOPES.has(declared)) return declared;
  return subjectMemberId !== null && state.children.some((child) => child.id === subjectMemberId) ? 'child' : 'household';
}

function normalizeName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_CATEGORY_NAME_LENGTH ? trimmed : null;
}

/** A household's own category. It starts with no system role: naming something "Money Stuff" doesn't make it the money category. */
export function addCategory(state: AppState, ctx: TransitionContext, input: { name: string; scope: VisibilityScope }): AppState {
  const name = normalizeName(input.name);
  if (!name) return state;

  const sortOrder = state.categories.reduce((max, category) => Math.max(max, category.sortOrder), -1) + 1;
  const category: HouseholdCategory = {
    id: ctx.createId('cat'),
    householdId: state.household.id,
    name,
    systemRole: null,
    status: 'active',
    sortOrder,
    provenance: provenanceFor(state.origin, userProvenance()),
    scope: input.scope,
  };
  return { ...state, categories: [...state.categories, category] };
}

/** Presentation only — references, filtering and the system role are untouched. */
export function renameCategory(state: AppState, categoryId: string, name: string): AppState {
  const next = normalizeName(name);
  const current = state.categories.find((category) => category.id === categoryId);
  if (!next || !current || current.name === next) return state;
  return { ...state, categories: state.categories.map((category) => (category.id === categoryId ? { ...category, name: next } : category)) };
}

/** `orderedIds` must list every category exactly once, archived ones included. */
export function reorderCategories(state: AppState, orderedIds: readonly string[]): AppState {
  const known = new Set(state.categories.map((category) => category.id));
  const unique = new Set(orderedIds);
  if (orderedIds.length !== known.size || unique.size !== known.size || orderedIds.some((id) => !known.has(id))) return state;

  const position = new Map(orderedIds.map((id, index) => [id, index]));
  return { ...state, categories: state.categories.map((category) => ({ ...category, sortOrder: position.get(category.id) ?? category.sortOrder })) };
}

/** Archive rather than delete: records that already point at a category keep a valid reference. */
export function archiveCategory(state: AppState, categoryId: string): AppState {
  return setStatus(state, categoryId, 'archived');
}

export function restoreCategory(state: AppState, categoryId: string): AppState {
  return setStatus(state, categoryId, 'active');
}

function setStatus(state: AppState, categoryId: string, status: HouseholdCategory['status']): AppState {
  const current = state.categories.find((category) => category.id === categoryId);
  if (!current || current.status === status) return state;
  return { ...state, categories: state.categories.map((category) => (category.id === categoryId ? { ...category, status } : category)) };
}
