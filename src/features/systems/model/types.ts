import type { ConfidenceLevel, ProvenanceSource } from '../../../domain/foundation/provenance';
import type { ResponsibilityState } from '../../../domain/foundation/responsibility';
import type { ContentRefKind } from '../../../domain/foundation/typedRef';
import type { LocalDate } from '../../../domain/logicalDay';
import type { VisibilityScope } from '../../../domain/state';

/**
 * The typed shapes Feature 04 reads canonical state through.
 *
 * Nothing here is stored. Every one of these is DERIVED from `AppState`, carries facts and machine
 * codes (never sentences — wording lives in `../copy.ts`), and says so explicitly when something is
 * not known. Canonical types (`HouseholdSystem`, `SystemStep`, `RecurrenceRule`, `Responsibility`)
 * remain the only durable truth.
 */

// ------------------------------------------------------------------ schedule ---

export type ScheduleState = 'none' | 'active' | 'paused' | 'ended';
export type ScheduleTrigger = 'schedule' | 'after_completion' | 'manual';
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Why there is no "next expected" date. Never guessed: absent means absent for a stated reason. */
export type NoNextReason = 'no_schedule' | 'paused' | 'stopped' | 'not_calendar_based' | 'nothing_upcoming';

export interface ScheduleView {
  /** The canonical rule this describes; null when the System has none. */
  ruleId: string | null;
  state: ScheduleState;
  trigger: ScheduleTrigger | null;
  frequency: ScheduleFrequency | null;
  interval: number | null;
  /** 0 = Sunday … 6 = Saturday. */
  byWeekday: number[] | null;
  byMonthDay: number | null;
  timeOfDayMinutes: number | null;
  endsOn: LocalDate | null;
  occurrenceCount: number | null;
  /** The zone the rule's wall-clock time is read in. */
  timezone: string | null;
  /** DERIVED by the foundation (`nextOccurrence`), honoring recorded skips. Never stored. */
  nextExpected: LocalDate | null;
  noNextReason: NoNextReason | null;
  /** Occurrences she chose to skip, most recent first (history, presented neutrally). */
  skipped: LocalDate[];
}

// --------------------------------------------------------------------- steps ---

export interface StepView {
  id: string;
  /** 1-based reading order. Not the stored `position`, which is never shown. */
  order: number;
  title: string;
  /** Null = not known. Never 0 as a stand-in. */
  effortMinutes: number | null;
  provenance: ProvenanceSource;
  /** Step-level dependencies do not exist in the foundation: always empty, and the evidence says so. */
  dependencyRefs: string[];
}

export type DurationView =
  /** Every step has an estimate, so a total can honestly be stated. */
  | { kind: 'total'; minutes: number; statedMinutes: number | null }
  /** Some steps do. A floor, never a total. */
  | { kind: 'partial'; atLeastMinutes: number; estimatedSteps: number; totalSteps: number }
  /** No step estimates, but she stated how long one run takes on the System itself. */
  | { kind: 'stated'; minutes: number }
  | { kind: 'unknown' };

// ------------------------------------------------------------ responsibility ---

export interface HolderView {
  kind: 'self' | 'person' | 'child';
  id: string | null;
  /** Null when the holder can no longer be found — shown as unknown, never guessed. */
  name: string | null;
}

export interface ResponsibilityView {
  id: string;
  holder: HolderView;
  /** assigned ≠ acknowledged ≠ accepted: the state is carried verbatim. */
  state: ResponsibilityState;
  /** False for the last handoff that ended (declined / handed back / completed) — history, not a current owner. */
  live: boolean;
  /** Requested, never answered, and past the time an answer was due. Derived from the clock. */
  unanswered: boolean;
  stillNeedsMe: boolean;
  requestedAt: string | null;
  ackDueAt: string | null;
}

export interface HolderChoice {
  kind: 'person' | 'child';
  id: string;
  name: string;
}

export type AttentionReason = 'delegation_unanswered';

// ---------------------------------------------------------------- references ---

export interface RefView {
  kind: ContentRefKind;
  id: string;
  /** Null when the referenced row cannot be found. */
  label: string | null;
}

/** What Her Keys itself recorded about acting on this System — only ever real rows. */
export interface ActionEvidenceView {
  intentId: string;
  category: string;
  /** Her decision on the proposal, or null while it is unanswered. */
  decision: 'approved' | 'declined' | 'withdrawn' | null;
  decisionBasis: 'explicit' | 'standing_authority' | null;
  attempts: Array<{ attempt: number; result: 'succeeded' | 'failed' | 'partial' | 'unknown'; attemptedAt: string }>;
  outcomes: Array<{ kind: string; observedAt: string }>;
}

// -------------------------------------------------------------------- actions ---

export type SystemAction =
  | 'edit'
  | 'add_step'
  | 'edit_step'
  | 'remove_step'
  | 'reorder_steps'
  | 'set_schedule'
  | 'stop_schedule'
  | 'pause_schedule'
  | 'resume_schedule'
  | 'skip_next'
  | 'assign_responsibility'
  | 'reassign_responsibility'
  | 'take_back_responsibility'
  | 'record_answer'
  | 'archive'
  | 'delete'
  | 'duplicate'
  | 'start_run'
  | 'complete_step';

export interface ActionAvailability {
  action: SystemAction;
  available: boolean;
  /** A machine code, not a sentence. `available` when it is; otherwise why it is not. */
  reason: string;
}

// -------------------------------------------------------------------- detail ---

export type SubjectView =
  /** No child is claimed: a household System. */
  | { kind: 'none' }
  /** The System is child-scoped but the canonical row cannot say which child (MP-02). Never guessed. */
  | { kind: 'child_not_recorded' };

export interface UnknownState {
  field: string;
  reason: string;
}

export interface SystemDetailView {
  id: string;
  name: string;
  purpose: string;
  area: { id: string; name: string | null };
  scope: VisibilityScope;
  subject: SubjectView;
  provenance: { producer: ProvenanceSource; confidence: ConfidenceLevel | null };
  steps: StepView[];
  duration: DurationView;
  schedule: ScheduleView;
  responsibility: ResponsibilityView | null;
  holderChoices: HolderChoice[];
  attention: AttentionReason[];
  needs: RefView[];
  neededBy: RefView[];
  actionEvidence: ActionEvidenceView[];
  actions: ActionAvailability[];
  /** RUN = ABSENT at the common fork. Recorded, never simulated. */
  run: { supported: false; currentRef: null; progress: null; reason: 'no_run_semantics' };
  unknownStates: UnknownState[];
}

// ----------------------------------------------------------------------- hub ---

export type HubUnavailableReason = 'newer_version' | 'unreadable' | 'memory_only';
export type HubNotice = 'started_over';

export type HubAvailability =
  /** State is not known yet. NOT empty. */
  | { kind: 'loading' }
  /** This session's state is a stand-in and nothing here would be saved. No Systems are shown or editable. */
  | { kind: 'unavailable'; reason: HubUnavailableReason }
  | { kind: 'ready'; notice: HubNotice | null };

export interface HubItem {
  id: string;
  name: string;
  purpose: string;
  areaName: string | null;
  stepCount: number;
  duration: DurationView;
  schedule: Pick<
    ScheduleView,
    'state' | 'trigger' | 'frequency' | 'interval' | 'byWeekday' | 'byMonthDay' | 'timeOfDayMinutes' | 'nextExpected' | 'noNextReason'
  >;
  responsibility: { holderName: string | null; holderKind: HolderView['kind']; state: ResponsibilityState; unanswered: boolean } | null;
  needsAttention: boolean;
}

export interface HubView {
  availability: HubAvailability;
  items: HubItem[];
  /** True only when the state is KNOWN and holds no Systems. Never true while loading or unavailable. */
  isEmpty: boolean;
  canCreate: boolean;
}
