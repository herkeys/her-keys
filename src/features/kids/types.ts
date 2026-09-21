import type { DurationKnowledge } from '../../domain/foundation/duration';
import type { PERSON_RELATIONSHIPS, ResponsibilityState } from '../../domain/foundation/responsibility';
import type { TypedRef } from '../../domain/foundation/typedRef';
import type { LocalDate } from '../../domain/logicalDay';
import type { AttentionUrgency } from '../../domain/reasoning/attention';
import type { Readiness } from '../../domain/structure';
import type { ChildLabel } from './identity';

/**
 * THE SEMANTIC OUTPUT OF THE KIDS PROJECTION (HK-FEATURE-05).
 *
 * Everything here is a FACT or a name for a state the foundation already defines. There is no score, no rank, no percentage and no
 * urgency of Kids' own. Copy is chosen from these codes in `copy.ts`; JSX never decides what is true.
 */

/** The two kinds of canonical row a child's operational life is made of. A commitment is an event; an obligation is a task. */
export interface KidsRef {
  kind: 'task' | 'event';
  id: string;
}

export type PersonRelationship = (typeof PERSON_RELATIONSHIPS)[number];

/**
 * Where a handoff has got to, in words that never say more than the record does. ONLY `covered` may be presented as handled, and only
 * because a live holder who is an active person has accepted it AND it is marked as no longer needing her.
 */
export type CoverageState =
  | 'covered'
  | 'accepted_still_yours'
  | 'asked_no_answer'
  | 'seen_not_accepted'
  | 'reply_overdue'
  | 'declined'
  | 'handed_back'
  | 'holder_unavailable'
  | 'held_by_child'
  | 'finished'
  | 'nobody_recorded';

export interface HolderFact {
  kind: 'person' | 'child';
  id: string;
  displayName: string;
  /** A person is available to hold this only while active; a child only while one of this household's children. */
  available: boolean;
  relationship: PersonRelationship | null;
}

export interface ResponsibilityFacts {
  responsibilityId: string | null;
  lifecycle: ResponsibilityState | 'none';
  /** Owned, requested, acknowledged or accepted: somebody still holds it. */
  live: boolean;
  holder: HolderFact | null;
  /** The stored flag, present only while somebody other than her holds it. */
  stillNeedsMe: boolean | null;
  /** The foundation's own answer (`needsMePersonally`). null = not known, never coerced. */
  requiresYou: boolean | null;
  coverage: CoverageState;
  ackDueAt: string | null;
}

export type PlanLabel = 'PLAN_IN_PLACE' | 'NEEDS_A_PLAN' | 'NOT_ENOUGH_KNOWN';

export type PlanReason =
  | 'accepted_and_off_your_list'
  | 'declined'
  | 'handed_back'
  | 'holder_unavailable'
  | 'reply_overdue'
  | 'awaiting_answer'
  | 'seen_not_accepted'
  | 'accepted_still_yours'
  | 'held_by_child'
  | 'finished'
  | 'nothing_recorded';

export interface StepFact {
  ref: { kind: 'task'; id: string };
  title: string;
  status: 'open' | 'completed' | 'archived';
}

export interface PlanFact {
  label: PlanLabel;
  reason: PlanReason;
  /** Who the plan leans on, when it leans on anybody. */
  relies: HolderFact | null;
  /** Open work already recorded toward sorting this out. A step existing is NOT evidence that the gap is closed. */
  openSteps: StepFact[];
}

export type ScheduleFact =
  | {
      kind: 'timed';
      startsAt: string;
      /** Events carry an end. A task planned for a time does not: its length is an estimate, kept in `duration`. */
      endsAt: string | null;
      localDate: LocalDate;
      startMinutes: number;
      endMinutes: number | null;
      endsLocalDate: LocalDate | null;
    }
  | { kind: 'day'; localDate: LocalDate };

export interface DueFact {
  /** The calendar-day deadline. A deadline is not a plan: DUE is not SCHEDULED. */
  date: LocalDate;
  /** A deadline with a time of day, when one was recorded. */
  at: string | null;
}

export interface DurationFact {
  minutes: number;
  knowledge: DurationKnowledge;
}

export interface PrerequisiteFact {
  ref: TypedRef;
  title: string | null;
  cause: 'pending' | 'retired' | 'missing';
}

export interface DependencyFact {
  readiness: Readiness;
  /** Live prerequisites that are still open. */
  waitingOn: PrerequisiteFact[];
  /** Prerequisites that were set aside or are gone: neither met nor something she can wait for. */
  unavailable: PrerequisiteFact[];
}

export interface RecurrenceFact {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  interval: number;
  byWeekday: number[] | null;
}

/** Facts the record does not hold. Named so nothing is silently rendered as a value. */
export type UnknownFact = 'location' | 'when' | 'who_is_handling' | 'length_confirmed';

/** What she can do about an item right now, derived from state (never from what a screen happens to render). */
export type ItemAction =
  | 'edit'
  | 'mark_done'
  | 'remove'
  | 'request_handoff'
  | 'record_acknowledged'
  | 'record_accepted'
  | 'record_declined'
  | 'take_back'
  | 'add_plan_step';

export interface ItemFact {
  ref: KidsRef;
  childId: string;
  title: string;
  flexibility: 'fixed' | 'flexible';
  schedule: ScheduleFact | null;
  due: DueFact | null;
  where: string | null;
  notes: string | null;
  /** A task's length with what is known about where it came from; null for an event. */
  duration: DurationFact | null;
  preparation: { preparationMinutes: number | null; travelBefore: number | null; travelAfter: number | null } | null;
  responsibility: ResponsibilityFacts;
  dependency: DependencyFact | null;
  steps: StepFact[];
  repeats: RecurrenceFact | null;
  /** Present for the commitments a plan is about (an upcoming event; a task somebody else was asked to hold). */
  plan: PlanFact | null;
  unknownFacts: UnknownFact[];
  actions: ItemAction[];
}

/** Reasons the shared attention primitive can give for a child's item. Kids never adds to this list. */
export type SharedAttentionCode = 'deadline' | 'risk' | 'unacknowledged_delegation' | 'external_source_changed' | 'approval_required';
/** Grounded facts Kids states WITHOUT any urgency of its own. */
export type FactAttentionCode = 'not_accepted' | 'handed_back' | 'holder_unavailable' | 'prerequisite_unavailable';

export interface AttentionEntry {
  ref: KidsRef;
  childId: string;
  /** `shared`: the foundation's `attentionFor` returned it. `fact`: Kids is only stating a recorded fact. */
  source: 'shared' | 'fact';
  code: SharedAttentionCode | FactAttentionCode;
  /** The primitive's own urgency; always null for a fact. */
  urgency: AttentionUrgency | null;
  /** The date the reason is about (a deadline, an event's day), for ordering and words. */
  date: LocalDate | null;
}

export interface OpenWork {
  /** The foundation says this still needs her (`needsMePersonally === true`). */
  needsYou: ItemFact[];
  /** Somebody else holds it, and it is not marked as still needing her. Holding is not covering: read `coverage`. */
  withSomeoneElse: ItemFact[];
  /** Live prerequisites are still open. */
  waiting: ItemFact[];
  /** Nobody is recorded as handling it. */
  nobodyRecorded: ItemFact[];
}

export interface PlanRow {
  item: ItemFact;
  plan: PlanFact;
}

export interface ChildDetail {
  childId: string;
  label: ChildLabel;
  /** Events and timed tasks that have not finished yet, soonest first. `upcoming[0]` is the next one. */
  upcoming: ItemFact[];
  needsAttention: AttentionEntry[];
  openWork: OpenWork;
  /** Child-subject Systems (routines). Read-only: Kids has no run or completion behavior. */
  routines: Array<{ id: string; name: string }>;
  plans: PlanRow[];
}

export interface ChildCard {
  childId: string;
  label: ChildLabel;
  next: ItemFact | null;
  /** Plain counts of recorded facts; none of them is a score. */
  needsYouCount: number;
  waitingOnOthersCount: number;
  planGapCount: number;
  attentionCount: number;
  hasAnyRecords: boolean;
}

export interface KidsView {
  householdId: string;
  /** `household_mismatch`: the caller asked about a different household than the state holds. Nothing of the state is returned. */
  status: 'ok' | 'household_mismatch';
  today: LocalDate;
  children: ChildCard[];
  /** Open child-linked rows whose child is not one of this household's children. Counted, never assigned to any child. */
  unattributed: number;
}
