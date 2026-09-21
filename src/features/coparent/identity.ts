import { categoryWithRole } from '../../domain/categories';
import type { HouseholdPerson } from '../../domain/foundation/responsibility';
import type { AppState, Child, HouseholdCategory } from '../../domain/state';
import type { BlockedReason, ChildRef, CounterpartRef, PersonStanding } from './types';

/**
 * IDENTITY — by canonical id, never by name.
 *
 * Nothing here compares display names to decide who someone is. Two people may share a name (different ids); a child is found by the
 * id a record carries; an unknown id stays unknown.
 */

/** The category that marks a record as co-parenting logistics: the one whose explicit `systemRole` is `coparenting`. */
export function coparentCategory(state: Pick<AppState, 'categories'>): HouseholdCategory | null {
  return categoryWithRole(state, 'coparenting');
}

export function coparentCategoryId(state: Pick<AppState, 'categories'>): string | null {
  return coparentCategory(state)?.id ?? null;
}

/** Why a new co-parenting record cannot be made right now. Empty = it can. */
export function blockedReasons(state: Pick<AppState, 'categories' | 'children'>): BlockedReason[] {
  const category = coparentCategory(state);
  const reasons: BlockedReason[] = [];
  if (category === null) reasons.push('no_category');
  else if (category.status !== 'active') reasons.push('category_archived');
  if (state.children.length === 0) reasons.push('no_child');
  return reasons;
}

/**
 * The child a record points at. `subjectMemberId` is resolved against the household's CHILDREN by id. The adult account user is a
 * member too, but a person is not a child, so that is `unavailable`, not a match.
 */
export function childRefOf(state: Pick<AppState, 'children' | 'user'>, subjectMemberId: string | null): ChildRef {
  if (subjectMemberId === null) return { status: 'not_recorded' };
  const child: Child | undefined = state.children.find((candidate) => candidate.id === subjectMemberId);
  if (child) return { status: 'known', childId: child.id, displayName: child.displayName };
  return { status: 'unavailable', childId: subjectMemberId, cause: subjectMemberId === state.user.id ? 'not_a_child' : 'missing' };
}

const RELATIONSHIP_LABELS: Readonly<Record<HouseholdPerson['relationship'], string>> = {
  'co-parent': 'Co-parent',
  partner: 'partner',
  grandparent: 'grandparent',
  caregiver: 'Caregiver',
  neighbor: 'neighbor',
  contractor: 'contractor',
  friend: 'friend',
  other: 'other',
};

/**
 * What a person's OWN recorded relationship supports. `other` says nothing worth adding, so it is null and the name stands alone.
 * "Co-parent" and "Caregiver" appear only when the person was recorded as exactly that.
 */
export function relationshipLabelOf(relationship: HouseholdPerson['relationship']): string | null {
  return relationship === 'other' ? null : RELATIONSHIP_LABELS[relationship];
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase();

/**
 * A unique label per person. A shared name is disambiguated first by the recorded relationship, then by the order the people were
 * added (`createdAt`, then id) — so two "Alex"es are never the same row on screen, and the order never depends on the array position.
 */
export function personLabels(people: readonly HouseholdPerson[]): Map<string, string> {
  const byName = new Map<string, HouseholdPerson[]>();
  for (const person of people) {
    const key = nameKey(person.displayName);
    byName.set(key, [...(byName.get(key) ?? []), person]);
  }

  const labels = new Map<string, string>();
  for (const group of byName.values()) {
    if (group.length === 1) {
      labels.set(group[0].id, group[0].displayName);
      continue;
    }
    const withRelationship = group.map((person) => ({ person, text: `${person.displayName} (${relationshipLabelOf(person.relationship) ?? 'other'})` }));
    const textCounts = new Map<string, number>();
    for (const entry of withRelationship) textCounts.set(entry.text, (textCounts.get(entry.text) ?? 0) + 1);
    const ordered = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const entry of withRelationship) {
      if ((textCounts.get(entry.text) ?? 0) === 1) labels.set(entry.person.id, entry.text);
      else labels.set(entry.person.id, `${entry.text} #${ordered.findIndex((person) => person.id === entry.person.id) + 1}`);
    }
  }
  return labels;
}

/** The person a responsibility names, with their standing. A missing person keeps their id so nobody is silently substituted. */
export function counterpartOf(
  state: Pick<AppState, 'people'>,
  labels: ReadonlyMap<string, string>,
  personId: string | null
): CounterpartRef | null {
  if (personId === null) return null;
  const person = state.people.find((candidate) => candidate.id === personId);
  if (!person) return { personId, displayName: '', label: 'Someone no longer in Her Keys', relationshipLabel: null, standing: 'missing' };
  const standing: PersonStanding = person.status === 'active' ? 'active' : 'archived';
  return {
    personId,
    displayName: person.displayName,
    label: labels.get(person.id) ?? person.displayName,
    relationshipLabel: relationshipLabelOf(person.relationship),
    standing,
  };
}

/** Owner-only scopes: only the owner's account can open them (RLS `can_access_scoped_row`). Every other scope: say nothing. */
export const isOwnerOnlyScope = (scope: string): boolean => scope === 'personal' || scope === 'professional' || scope === 'coparent-shared';
