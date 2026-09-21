import { isActiveResponsibility, type Responsibility } from '../../domain/foundation/responsibility';
import { refKey } from '../../domain/foundation/typedRef';
import { needsMePersonally } from '../../domain/responsibility';
import type { AppState } from '../../domain/state';
import type { CoverageState, HolderFact, KidsRef, PlanFact, PlanReason, ResponsibilityFacts } from './types';

/**
 * RESPONSIBILITY TRUTH, AS KIDS READS IT (HK-FEATURE-05).
 *
 *   ASSIGNED != ACKNOWLEDGED != ACCEPTED != COVERED
 *
 * Kids has no boolean like `handled`. It reads the foundation's lifecycle and its own answer to "does this still need her?"
 * (`needsMePersonally`), and names the state. A person who has since been archived, or who is not one of this household's people, no
 * longer satisfies anything: the state is re-read from the current record every time, so a stale name can never keep a positive state.
 */

export interface ResponsibilityIndex {
  byRef: Map<string, Responsibility[]>;
  people: Map<string, AppState['people'][number]>;
  children: Map<string, AppState['children'][number]>;
}

export function indexResponsibilities(state: Pick<AppState, 'responsibilities' | 'people' | 'children'>): ResponsibilityIndex {
  const byRef = new Map<string, Responsibility[]>();
  for (const row of state.responsibilities) {
    const key = refKey(row.about);
    const list = byRef.get(key);
    if (list) list.push(row);
    else byRef.set(key, [row]);
  }
  return {
    byRef,
    people: new Map(state.people.map((person) => [person.id, person])),
    children: new Map(state.children.map((child) => [child.id, child])),
  };
}

/** The most recent handoff of a thing: latest update, then latest creation, then id. Deterministic. */
function latestOf(rows: readonly Responsibility[]): Responsibility | null {
  let best: Responsibility | null = null;
  for (const row of rows) {
    if (best === null) best = row;
    else if (
      row.updatedAt > best.updatedAt ||
      (row.updatedAt === best.updatedAt && (row.createdAt > best.createdAt || (row.createdAt === best.createdAt && row.id > best.id)))
    ) {
      best = row;
    }
  }
  return best;
}

function holderOf(row: Responsibility, index: ResponsibilityIndex): HolderFact | null {
  if (row.responsibleKind === 'person' && row.responsiblePersonId !== null) {
    const person = index.people.get(row.responsiblePersonId);
    return {
      kind: 'person',
      id: row.responsiblePersonId,
      displayName: person?.displayName ?? '',
      available: person !== undefined && person.status === 'active',
      relationship: person?.relationship ?? null,
    };
  }
  if (row.responsibleKind === 'child' && row.responsibleChildId !== null) {
    const child = index.children.get(row.responsibleChildId);
    return { kind: 'child', id: row.responsibleChildId, displayName: child?.displayName ?? '', available: child !== undefined, relationship: null };
  }
  return null;
}

function coverageOf(row: Responsibility | null, live: boolean, holder: HolderFact | null, nowMs: number): CoverageState {
  if (row === null) return 'nobody_recorded';
  if (!live) {
    if (row.state === 'declined') return 'declined';
    if (row.state === 'returned') return 'handed_back';
    if (row.state === 'completed') return 'finished';
    return 'nobody_recorded';
  }
  // Somebody holds it. She herself holding it (`owned`) is not a handoff.
  if (row.responsibleKind === 'self' || holder === null) return 'nobody_recorded';
  if (holder.kind === 'child') return holder.available ? 'held_by_child' : 'holder_unavailable';
  // From here the holder is a person, and only an active one can satisfy anything.
  if (!holder.available) return 'holder_unavailable';
  switch (row.state) {
    case 'requested':
      return row.ackDueAt !== null && Date.parse(row.ackDueAt) <= nowMs ? 'reply_overdue' : 'asked_no_answer';
    case 'acknowledged':
      return 'seen_not_accepted';
    case 'accepted':
      return row.stillNeedsMe ? 'accepted_still_yours' : 'covered';
    default:
      return 'nobody_recorded';
  }
}

export function responsibilityFactsOf(state: AppState, ref: KidsRef, nowMs: number, index: ResponsibilityIndex): ResponsibilityFacts {
  const rows = index.byRef.get(refKey(ref)) ?? [];
  const liveRow = rows.find((row) => isActiveResponsibility(row)) ?? null;
  const row = liveRow ?? latestOf(rows);
  const live = liveRow !== null;
  const holder = row === null ? null : holderOf(row, index);
  const heldByOther = live && row !== null && row.responsibleKind !== 'self';
  return {
    responsibilityId: row?.id ?? null,
    lifecycle: row?.state ?? 'none',
    live,
    holder: row !== null && row.responsibleKind !== 'self' ? holder : null,
    stillNeedsMe: heldByOther && row !== null ? row.stillNeedsMe : null,
    // The foundation's own answer, unmodified. Kids never overrides it and never turns unknown into a guess.
    requiresYou: needsMePersonally(state, { kind: ref.kind, id: ref.id }, nowMs),
    coverage: coverageOf(row, live, holder, nowMs),
    ackDueAt: row?.ackDueAt ?? null,
  };
}

/**
 * The readiness of the arrangement around a commitment: PLAN IN PLACE, NEEDS A PLAN or NOT ENOUGH KNOWN.
 *
 * Defined ONLY over what the foundation records (see the ledger, section 16). It says whether the recorded arrangement holds today. It
 * does not say a person is free, willing, present, or recognised by a school, a court or a doctor, and it never turns a task that was
 * created to sort a gap out into evidence that the gap is closed: steps are reported beside the label and never feed it.
 */
export function planFromCoverage(coverage: CoverageState): { label: PlanFact['label']; reason: PlanReason } {
  switch (coverage) {
    case 'covered':
      return { label: 'PLAN_IN_PLACE', reason: 'accepted_and_off_your_list' };
    case 'declined':
      return { label: 'NEEDS_A_PLAN', reason: 'declined' };
    case 'handed_back':
      return { label: 'NEEDS_A_PLAN', reason: 'handed_back' };
    case 'holder_unavailable':
      return { label: 'NEEDS_A_PLAN', reason: 'holder_unavailable' };
    case 'reply_overdue':
      return { label: 'NEEDS_A_PLAN', reason: 'reply_overdue' };
    case 'asked_no_answer':
      return { label: 'NOT_ENOUGH_KNOWN', reason: 'awaiting_answer' };
    case 'seen_not_accepted':
      return { label: 'NOT_ENOUGH_KNOWN', reason: 'seen_not_accepted' };
    case 'accepted_still_yours':
      return { label: 'NOT_ENOUGH_KNOWN', reason: 'accepted_still_yours' };
    case 'held_by_child':
      return { label: 'NOT_ENOUGH_KNOWN', reason: 'held_by_child' };
    case 'finished':
      return { label: 'NOT_ENOUGH_KNOWN', reason: 'finished' };
    case 'nobody_recorded':
      return { label: 'NOT_ENOUGH_KNOWN', reason: 'nothing_recorded' };
  }
}
