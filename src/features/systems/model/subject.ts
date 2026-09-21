import type { AppState, HouseholdSystem } from '../../../domain/state';
import type { SubjectChoice, SubjectView } from './types';

/**
 * WHICH CHILD A SYSTEM IS ABOUT (HA-011) — the one place Feature 04 reads or offers a System's subject.
 *
 * The subject is the canonical `HouseholdSystem.subjectMemberId`: the id of one of the household's
 * existing children, in the same member identity space a Task or Event subject uses. It is an id.
 * It is never matched by name, never defaulted to "the first child", never taken from the account
 * user or from a person the household delegates to (`people` are not members), and a household that
 * has no such child is never given one. Nothing here writes anything.
 */

/**
 * The child a System is about, resolved ONLY against this household's own children. A household-level
 * System (no subject, not child-scoped) reads exactly as it always did. A row that claims a child but
 * cannot name one that exists is shown as exactly that: the household's records cannot say which child.
 *
 * `?? null` reads a row saved before the field existed as household-level, which is what the
 * foundation says it is.
 */
export function subjectViewFor(state: Pick<AppState, 'children'>, system: Pick<HouseholdSystem, 'subjectMemberId' | 'scope'>): SubjectView {
  const subjectId = system.subjectMemberId ?? null;
  if (subjectId !== null) {
    const child = state.children.find((row) => row.id === subjectId);
    return child === undefined ? { kind: 'child_not_recorded' } : { kind: 'child', id: child.id, name: child.displayName };
  }
  return system.scope === 'child' ? { kind: 'child_not_recorded' } : { kind: 'none' };
}

/**
 * The children an editor may offer as "who it is for": the household's EXISTING children, and no one
 * else. No adult, no delegate, no invented name. Ordered by name (then id) so the list never shuffles.
 */
export function subjectChoicesFor(state: Pick<AppState, 'children'>): SubjectChoice[] {
  return state.children
    .map((child): SubjectChoice => ({ id: child.id, name: child.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Is this id one of the household's children? The only test a subject has to pass to be named. */
export const isChildOf = (state: Pick<AppState, 'children'>, id: string): boolean => state.children.some((child) => child.id === id);

/**
 * The scope a System takes when its subject is set by a draft.
 *
 *  - a NEW System: naming a child makes it child-scoped (the cloud requires a subject for that scope, and now has one);
 *    naming none keeps it a household routine.
 *  - an EXISTING System whose subject the draft leaves alone: its scope stays exactly as it was (the editor changes only
 *    what it owns, so a household-scoped routine that already names a child is not silently re-scoped).
 *  - an EXISTING System whose subject changes: a child means child scope; clearing the child of a child-scoped System
 *    returns it to the household (child scope with no subject is invalid state), and any other scope is left as it was.
 */
export function scopeForSubject(existing: Pick<HouseholdSystem, 'subjectMemberId' | 'scope'> | null, nextSubjectId: string | null): HouseholdSystem['scope'] {
  if (existing === null) return nextSubjectId === null ? 'household' : 'child';
  if ((existing.subjectMemberId ?? null) === nextSubjectId) return existing.scope;
  if (nextSubjectId !== null) return 'child';
  return existing.scope === 'child' ? 'household' : existing.scope;
}
