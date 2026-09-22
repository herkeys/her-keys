import type { DurationKnowledge } from '../../../domain/foundation/duration';
import type { ResponsibilityState } from '../../../domain/foundation/responsibility';
import type { RecurrenceRule } from '../../../domain/foundation/structure';
import type { Instant, LocalDate } from '../../../domain/logicalDay';
import type { AttentionReason, AttentionUrgency } from '../../../domain/reasoning/attention';
import type { HomeContext } from './homeContext';

/**
 * The shape of a Home projection. Everything here is DERIVED from canonical state and the clock; nothing is stored, and there is
 * no HomeRecord entity. A Home item is a task, an event or a System, seen through the Home context, carrying the facts the rest
 * of the household already holds about it — and an explicit list of what is NOT known.
 */

export type HomeItemKind = 'task' | 'event' | 'system';

/**
 * Where the item stands. The words are chosen so none of them claims more than the record proves:
 *   marked_done   she marked a task done. NOT "resolved", NOT "fixed", NOT "verified".
 *   set_aside     a task was removed. REMOVED != COMPLETED.
 *   past_visit    a visit's time has passed; the calendar does not know whether it happened.
 */
export type ResolutionState = 'unresolved' | 'marked_done' | 'set_aside' | 'scheduled' | 'past_visit' | 'removed_visit' | 'not_applicable';

/** DUE != SCHEDULED: a task with only a due date is `not_scheduled`. */
export type ScheduledState = 'not_scheduled' | 'planned_day' | 'planned_time' | 'scheduled_visit' | 'past_visit';

export type DueWhen = 'overdue' | 'today' | 'tomorrow' | 'later';
export type VisitWhen = 'now' | 'today' | 'tomorrow' | 'later' | 'earlier_today' | 'past';

export type TimingFact =
  | { kind: 'due'; when: DueWhen; date: LocalDate }
  | { kind: 'planned'; when: DueWhen | 'earlier'; date: LocalDate; startsAt: Instant | null }
  | { kind: 'visit'; when: VisitWhen; date: LocalDate; startsAt: Instant; endsAt: Instant };

/** One reason the shared attention derivation (`attentionFor`) gave for a Home record — kept exactly as the shared layer said it. */
export interface AttentionFact {
  reason: AttentionReason;
  urgency: AttentionUrgency;
}

export interface HolderFact {
  kind: 'person' | 'child' | 'self';
  id: string | null;
  name: string;
  /** The relationship she recorded for a person ("contractor"). Never a verified qualification. */
  relationship: string | null;
}

/**
 * ASSIGNED != ACKNOWLEDGED != ACCEPTED != COVERED.
 *   not_delegated       nobody has been asked
 *   asked               a request is out, inside its window
 *   no_answer           a request past the time an answer was due
 *   seen                they acknowledged it; they have not said yes
 *   accepted_needs_you  they said yes; it still needs her
 *   covered             they said yes AND she has said it no longer needs her — the only state the shared semantics prove
 *   declined / returned it is hers again
 *   reported_finished   they reported finishing the handoff. Not proof the work, or the physical condition, is done.
 */
export type CoverageState = 'not_delegated' | 'asked' | 'no_answer' | 'seen' | 'accepted_needs_you' | 'covered' | 'declined' | 'returned' | 'reported_finished';

export interface ResponsibilityFact {
  responsibilityId: string | null;
  state: ResponsibilityState | 'none';
  coverage: CoverageState;
  holder: HolderFact | null;
  /** From the shared `needsMePersonally`: true/false when known, null when it is not known. */
  stillNeedsMe: boolean | null;
  requestedAt: Instant | null;
  ackDueAt: Instant | null;
  completedAt: Instant | null;
}

export interface PrerequisiteFact {
  ref: { kind: string; id: string };
  title: string;
  /** REMOVED != COMPLETED and MISSING != SATISFIED: only `satisfied` is met. */
  standing: 'satisfied' | 'pending' | 'unavailable';
  cause: 'retired' | 'missing' | null;
}

export interface DependencyFact {
  /** `none` when the item requires nothing; otherwise the shared `readinessOf`. */
  readiness: 'none' | 'ready' | 'blocked' | 'needsReview';
  prerequisites: PrerequisiteFact[];
}

/** UNKNOWN != ZERO, and DEFAULT != USER-PROVIDED. */
export type DurationFact =
  | { kind: 'task'; minutes: number; knowledge: DurationKnowledge }
  | { kind: 'visit_window'; minutes: number }
  | { kind: 'none' };

export type RecurrenceState = 'none' | 'active' | 'paused' | 'ended';

export interface RecurrenceFact {
  state: RecurrenceState;
  ruleId: string | null;
  rule: Pick<RecurrenceRule, 'trigger' | 'frequency' | 'interval' | 'byWeekday' | 'byMonthDay' | 'anchorDate'> | null;
  /** The next date the RULE expects, derived by the shared `nextOccurrence`. Not a completion, not a due date. */
  nextExpected: LocalDate | null;
  nextExpectedBasis: 'schedule_rule' | 'not_derivable' | 'not_active' | null;
}

/** Only completion evidence — never `updatedAt`, creation, edit or scheduled time. */
export type LastDoneEvidence = 'completion_observation' | 'task_completed_at' | 'system_completion_observation';

export interface LastDoneFact {
  date: LocalDate;
  at: Instant;
  evidence: LastDoneEvidence;
}

/** What Home does NOT know about the item, said out loud. */
export type UnknownFact =
  | 'duration_unrecorded'
  | 'duration_default_estimate'
  | 'duration_inferred_estimate'
  | 'no_completion_recorded'
  | 'condition_not_verified'
  | 'visit_outcome_unknown'
  | 'next_date_not_derivable'
  | 'no_due_date'
  | 'provider_not_verified';

export type HomeAction =
  | 'edit'
  | 'mark_done'
  | 'due_again'
  | 'remove'
  | 'ask_someone'
  | 'record_seen'
  | 'record_accepted'
  | 'record_declined'
  | 'take_back'
  | 'stop_repeating'
  | 'open_systems';

export interface HomeItem {
  /** `task:<id>` / `event:<id>` / `system:<id>` — the canonical typed reference, never a new identity. */
  homeItemId: string;
  canonicalKind: HomeItemKind;
  entityId: string;
  title: string;
  homeContextId: string;
  homeSystemRole: 'home';
  resolutionState: ResolutionState;
  scheduledState: ScheduledState;
  timing: TimingFact[];
  attentionFacts: AttentionFact[];
  responsibility: ResponsibilityFact;
  dependency: DependencyFact;
  duration: DurationFact;
  recurrence: RecurrenceFact;
  /** `applicable` is false for an event: a visit has no completion concept, so there is no "last done" and no "never done". */
  lastDoneApplicable: boolean;
  lastDone: LastDoneFact | null;
  unknownFacts: UnknownFact[];
  availableActions: HomeAction[];
  /** Free text the household typed, carried only so a detail screen can show it. Never logged, never sent anywhere by Home. */
  notes: string | null;
  location: string | null;
}

/**
 * Work sections are mutually exclusive by precedence (attention > waiting > coming up > unresolved), so a row appears once.
 * `repeats`, `recentlyDone` and `pastVisits` are LENSES over the same items: an item in them is the same item with the same facts.
 */
export type HomeSectionKey = 'attention' | 'waiting' | 'comingUp' | 'unresolved' | 'repeats' | 'recentlyDone' | 'pastVisits';

export interface HomeSection {
  key: HomeSectionKey;
  itemIds: string[];
}

/** What Home is willing to say about its own reach. Always the same statement: only what is saved under the Home context. */
export interface HomeCoverage {
  scope: 'saved_under_home_context';
  recordsConsidered: number;
}

export interface HomeView {
  context: HomeContext;
  label: string;
  today: LocalDate;
  items: HomeItem[];
  sections: HomeSection[];
  coverage: HomeCoverage;
  /** Creating Home items is allowed only while the Home area is active. */
  canCreate: boolean;
  /** Existing people and children an item can be handed to. Empty means "Ask someone" is not offered. */
  holders: HolderFact[];
}
