import type { ActionCategory, ConsequenceLevel, OutcomeKind, Reversibility } from '../../../domain/foundation/authorization';
import type { ConfidenceLevel, ProvenanceSource } from '../../../domain/foundation/provenance';
import type { ResponsibilityState, ResponsibleKind } from '../../../domain/foundation/responsibility';
import type { TypedRef } from '../../../domain/foundation/typedRef';
import type { LoadTier } from '../../../domain/loadTier';
import type { LocalDate } from '../../../domain/logicalDay';
import type { AttentionReason, AttentionUrgency } from '../../../domain/reasoning/attention';
import type { OneMoveTargetType } from '../../../domain/state';
import type { RecoveryReason } from '../../../state/appStore';
import type { DailyLoadIssue } from '../../../domain/dailyLoadIssues';
import type { LoadEstimate } from '../../../types';

/**
 * THE TODAY VIEW MODEL.
 *
 * Pure data, derived from canonical household state and a clock by
 * `buildTodayView`. It is a PROJECTION: never stored, never a second source of
 * truth, and it holds no domain fact that is not already in state or in a
 * foundation derivation. Every string here is a sentence of Her Keys' own that
 * is grounded in a typed fact; nothing in it is model prose.
 *
 * A section is `null` when the day gives it nothing to say. That is the rule
 * the whole screen is built on: complexity follows the user's day, and no box
 * exists waiting for data.
 */

// ---------------------------------------------------------------- shared shapes --

/** The routes Today may open. Each is an existing screen; Today mutates nothing by navigating. */
export type TodayRoute =
  | { pathname: '/task-editor'; params?: { taskId?: string } }
  | { pathname: '/event-editor'; params?: { eventId?: string } }
  | { pathname: '/life/needs-me' }
  | { pathname: '/opportunity-editor'; params?: { opportunityId?: string } };

/** Where a row came from, read off the row's stored provenance — never guessed, never upgraded. */
export interface SourceLine {
  producer: ProvenanceSource;
  /** Non-null only for a claim Her Keys made (`ai-inference`, `import-sync`). */
  confidence: ConfidenceLevel | null;
  /** Her Keys' claim that she has not confirmed: a stored confidence of `possible` or `likely`. */
  uncertain: boolean;
  /** Something she actually told Her Keys (`onboarding`, `user-action`, `talk-it-out`). */
  userStated: boolean;
}

/** An action a row may offer. Each maps to one existing route or one existing domain mutation. */
export type TodayAction =
  | { kind: 'open'; label: string; route: TodayRoute }
  | { kind: 'take_back'; label: string; responsibilityId: string }
  | { kind: 'review_approval'; label: string; intentId: string };

// ----------------------------------------------------------------- orientation --

export interface DayLabel {
  date: LocalDate;
  /** "Wednesday, Sep 16" — the household's logical day, never the device's. */
  label: string;
  weekday: string;
}

// ----------------------------------------------------------------- what matters --

export type MatterReason = 'next_commitment' | 'due_today' | 'fixed_commitment' | 'flexible_commitment';

export interface MatterItem {
  ref: TypedRef;
  kind: 'event' | 'task';
  title: string;
  /** "3:15 PM" for a timed item; `null` for a task that is only due. */
  timeLabel: string | null;
  reason: MatterReason;
  fixed: boolean;
  dueToday: boolean;
  isNext: boolean;
  /** Present only when the row is her keys' unconfirmed claim. Stated facts carry no badge. */
  source: SourceLine | null;
  route: TodayRoute;
}

export interface MattersSection {
  anchors: MatterItem[];
  /** Commitments still ahead that did not earn a first-level place. */
  moreCount: number;
}

// ------------------------------------------------------------------- one move --

export type OneMoveCompletion = 'completes_task' | 'resolves_needs_me' | 'records_only';

export interface OneMoveWhy {
  /** `recorded_evidence` when stored evidence links support the reasons; otherwise the item's own observation only. */
  basis: 'recorded_evidence' | 'item_observation';
  /** First expansion: short facts. Each is re-checked against current state, so a stale link is dropped, not repeated. */
  reasons: string[];
  /** Deeper: the structured evidence, one row per known code. */
  evidence: Array<{ code: string; label: string; aboutTitle: string | null }>;
  /**
   * Deeper: what the target waits on and what waits on it, read from the typed relation as it stands now. Context about the
   * row, never a reason for the choice, and never evidence — the stored decision did not cite it.
   */
  context: string[];
}

export interface OneMoveSection {
  status: 'selected' | 'completed' | 'withheld';
  action: string | null;
  estimatedMinutes: number | null;
  targetType: OneMoveTargetType | null;
  targetId: string | null;
  /** Where "open / adjust" goes, when the kind has a legitimate screen. */
  open: TodayRoute | null;
  /** What "I did it" actually changes — stated so a `records_only` kind is never mistaken for finishing a row. */
  completion: OneMoveCompletion | null;
  why: OneMoveWhy | null;
  /** The provenance of the row the move points at. */
  source: SourceLine | null;
}

// -------------------------------------------------------------------- attention --

export type AttentionRowReason = AttentionReason | 'delegated_needs_you' | 'returned' | 'declined' | 'action_failed';

export interface AttentionRow {
  key: string;
  reason: AttentionRowReason;
  urgency: AttentionUrgency;
  ref: TypedRef | null;
  title: string | null;
  /** One specific, calm sentence. It names what is unresolved and never characterizes anyone's motives. */
  statement: string;
  needsMe: boolean | null;
  responsibility: null | {
    id: string;
    state: ResponsibilityState;
    holderKind: ResponsibleKind;
    holder: string | null;
  };
  approval: null | { intentId: string; phrase: string; summary: string; consequence: ConsequenceLevel; reversibility: Reversibility };
  /** "Accepted today at 2:10 PM." — present only when a dated observation says it changed today. */
  changedToday: string | null;
  source: SourceLine | null;
  actions: TodayAction[];
}

export interface AttentionSection {
  rows: AttentionRow[];
  /** Rows beyond the first-glance bound; reachable through disclosure. */
  moreRows: AttentionRow[];
}

export interface WaitingRow {
  key: string;
  kind: 'delegated' | 'approved_not_run' | 'attempted' | 'unconfirmed';
  title: string | null;
  statement: string;
  responsibilityState: ResponsibilityState | null;
  changedToday: string | null;
}

export interface WaitingSection {
  rows: WaitingRow[];
  moreRows: WaitingRow[];
}

// ---------------------------------------------------------------------- handled --

export interface HandledRow {
  key: string;
  executionId: string;
  outcome: OutcomeKind;
  category: ActionCategory;
  /** "Reminder — delivered". Only ever built from a succeeded execution AND a success outcome. */
  statement: string;
  aboutTitle: string | null;
}

export interface HandledSection {
  rows: HandledRow[];
}

// ---------------------------------------------------------------------- decision --

export type DecisionKind = Exclude<DailyLoadIssue['kind'], 'overdue'>;

/**
 * The Daily Load decision block. The card that renders it (`DailyLoadCard`) owns
 * every action; this says only WHETHER the day has one to show and in what state.
 */
export interface DecisionSection {
  /** What the day's verdict is about; `null` when she decided it and the cause no longer stands. */
  kind: DecisionKind | null;
  state: 'undecided' | 'moved' | 'kept' | 'adjusted';
  needsDecision: boolean;
  tier: LoadTier;
}

// ------------------------------------------------------------------- can wait ---

export interface CanWaitItem {
  ref: TypedRef;
  title: string;
  route: TodayRoute;
}

export interface CanWaitSection {
  items: CanWaitItem[];
  moreItems: CanWaitItem[];
}

// --------------------------------------------------------------------- upcoming --

export interface UpcomingSection {
  kind: 'unmet_dependency' | 'tomorrow_timing' | 'consequential_due';
  statement: string;
  ref: TypedRef | null;
  route: TodayRoute | null;
  /** Present only when the statement rests on a relationship Her Keys inferred and she has not confirmed. */
  source: SourceLine | null;
}

// ------------------------------------------------------------------ composition --

export type SectionKey =
  | 'sparse'
  | 'decision'
  | 'attention'
  | 'matters'
  | 'oneMove'
  | 'upcoming'
  | 'canWait'
  | 'waiting'
  | 'handled'
  | 'onYourMind'
  | 'approved'
  | 'everything'
  | 'alsoChecked';

export interface Composition {
  key: SectionKey;
  level: 'primary' | 'secondary';
}

export interface SparseSection {
  kind: 'never_entered' | 'light';
  entry: Array<{ label: string; route: TodayRoute }>;
}

export interface OnYourMind {
  count: number;
  oldestTitle: string;
}

// ------------------------------------------------------------------------ view --

export interface TodayUnknown {
  availability: 'unknown';
}

/** The state on screen is a stand-in, not the household she has. Intelligence is withheld. */
export interface TodayUnavailable {
  availability: 'unavailable';
  reason: 'stand_in_state';
  recoveryReason: RecoveryReason | null;
}

export interface TodayReady {
  availability: 'ready';
  day: DayLabel;
  greeting: string | null;
  headline: string;
  nowMinutes: number;
  load: LoadEstimate | null;
  /** Set only when the household has its own capacity settings that Daily Load does not yet apply (TODAY-FD-001). */
  capacityNote: string | null;
  decision: DecisionSection | null;
  attention: AttentionSection | null;
  matters: MattersSection | null;
  oneMove: OneMoveSection | null;
  upcoming: UpcomingSection | null;
  canWait: CanWaitSection | null;
  waiting: WaitingSection | null;
  handled: HandledSection | null;
  onYourMind: OnYourMind | null;
  sparse: SparseSection | null;
  /** Total events plus scheduled tasks today — what the "Everything today" disclosure will hold. */
  everythingCount: number;
  composition: Composition[];
}

export type TodayView = TodayUnknown | TodayUnavailable | TodayReady;
