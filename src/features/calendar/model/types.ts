import type { LoadTier } from '../../../domain/loadThresholds';
import type { LocalDate } from '../../../domain/logicalDay';
import type { ResponsibilityState } from '../../../domain/foundation/responsibility';

/**
 * The Calendar view model. It is DERIVED from canonical state on every read and is never
 * stored: overloaded/tight/open, conflicts, openings, fit/no-fit and the visual order are
 * all derived facts. Every field is JSON-serialisable so the same object is the committed
 * structural evidence for each scenario.
 *
 *   canonical state -> foundation readers -> this projection -> Calendar UI
 *
 * It chooses what to show and in what order. It never invents product truth: nothing here
 * is a score, a percentage, a guessed duration or a guessed travel time.
 */

export type ItemKind = 'event' | 'task';
export interface ItemRef {
  kind: ItemKind;
  id: string;
}
export type Flexibility = 'fixed' | 'flexible';
export type DayMode = 'past' | 'today' | 'future';
export type ItemProgress = 'upcoming' | 'in_progress' | 'elapsed' | 'untimed';

/** A reference to any canonical row a piece of evidence points at. */
export interface EvidenceRef {
  kind: string;
  id: string;
}

/**
 * Who a commitment concerns. `unstated` is exactly that — a missing subject is NOT "the
 * household" and is never rendered as one.
 */
export type Subject =
  | { kind: 'unstated' }
  | { kind: 'self' }
  | { kind: 'child'; childId: string; displayName: string }
  | { kind: 'unresolved'; memberId: string };

/** What she entered for getting to and ready for a commitment. `null` is "not entered", never zero. */
export interface EnteredTransition {
  travelBefore: number | null;
  travelAfter: number | null;
  preparation: number | null;
}

export interface TimedSpan {
  kind: 'timed';
  startMs: number;
  endMs: number;
  /** Elapsed minutes from the start of the logical day (23 h, 24 h or 25 h long), clipped to the day. */
  startMinute: number;
  endMinute: number;
  /** False for a timed task with no usable duration: its end is not known. */
  endKnown: boolean;
  continuesFromPreviousDay: boolean;
  continuesIntoNextDay: boolean;
}

/** Date-only never means midnight: this item has a day, not a time. */
export interface DateOnly {
  kind: 'date_only';
  basis: 'overdue' | 'due' | 'planned';
  dueDate: LocalDate | null;
  daysOverdue: number;
  /** Set when the task is already planned for a different day or time. */
  plannedElsewhere: { kind: 'day'; date: LocalDate } | { kind: 'timed'; startMs: number } | null;
}
export type Timing = TimedSpan | DateOnly;

export type Coverage = 'mine' | 'awaiting_response' | 'acknowledged_not_accepted' | 'accepted' | 'declined' | 'returned' | 'completed';

/** DELEGATED is not COVERED: only `accepted` and `completed` count as covered. */
export interface ResponsibilityMark {
  responsibilityId: string;
  state: ResponsibilityState;
  coverage: Coverage;
  covered: boolean;
  holder:
    | { kind: 'self' }
    | { kind: 'person'; id: string; displayName: string | null }
    | { kind: 'child'; id: string; displayName: string | null };
  /** Requested, never answered, and past the time an answer was due. Derived from the clock. */
  unacknowledged: boolean;
  /** `null` is not known and is never guessed. */
  stillNeedsMe: boolean | null;
}

/** A required predecessor that is not done. */
export interface Blocker {
  /** The dependency edge this came from. */
  edgeId: string;
  ref: EvidenceRef;
  title: string | null;
  /** Known only when the predecessor has a known finish (a timed event, or a timed task with a usable duration). */
  finishMs: number | null;
  finishMinute: number | null;
}

/** Recurrence RULE metadata only. Calendar never evaluates a rule or generates an occurrence. */
export interface RecurrenceNote {
  ruleId: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  interval: number;
  trigger: 'schedule' | 'after_completion' | 'manual';
  byWeekday: number[] | null;
}

/** The scheduling window facets a task can carry. All nullable; null is not known. */
export interface WindowFacets {
  earliestStartMs: number | null;
  latestFinishMs: number | null;
  dueAtMs: number | null;
  splittable: boolean | null;
}

export interface DayItem {
  ref: ItemRef;
  title: string;
  flexibility: Flexibility;
  timing: Timing;
  progress: ItemProgress;
  subject: Subject;
  location: string | null;
  transition: EnteredTransition;
  /** The recorded estimate for a task (null when the recorded value is 0), the elapsed span for an event. */
  durationMinutes: number | null;
  durationBasis: 'event_span' | 'task_estimate' | 'none';
  window: WindowFacets | null;
  responsibility: ResponsibilityMark | null;
  blockedBy: Blocker[];
  repeats: RecurrenceNote | null;
  /** Raw values the foundation classifier needs; also the audit trail. */
  source: { categoryId: string; subjectMemberId: string | null; rawDurationMinutes: number | null; dueDate: LocalDate | null };
}

// ------------------------------------------------------------------ evidence ---

export interface IntervalEvidence {
  ref: ItemRef;
  startMinute: number;
  endMinute: number;
}

export type ConflictType =
  | 'FIXED_OVERLAP'
  | 'TRANSITION_CONFLICT'
  | 'PLACEMENT_FAILURE'
  | 'DEPENDENCY_CONFLICT'
  | 'RESPONSIBILITY_RISK'
  | 'PROTECTED_TIME_CONFLICT';

export interface GapEvidence {
  startMinute: number;
  endMinute: number;
  lengthMinutes: number;
  /** The gap could hold the item only if a missing travel value were zero. */
  uncertain: boolean;
}

export type ConflictEvidence =
  | {
      kind: 'overlap';
      a: IntervalEvidence;
      b: IntervalEvidence;
      overlapMinutes: number;
      flexibilityA: Flexibility;
      flexibilityB: Flexibility;
      /** The one side the foundation would offer to move, when exactly one is flexible. */
      movable: ItemRef | null;
    }
  | {
      kind: 'transition';
      before: IntervalEvidence;
      after: IntervalEvidence;
      gapMinutes: number;
      /** Minutes of tasks already scheduled inside the gap. */
      scheduledMinutes: number;
      /** Only what she entered. */
      entered: { travelAfter: number | null; travelBefore: number | null; preparation: number | null };
      storedTransitionMinutes: number;
      /** gap - scheduled - stored. Negative: the transition does not fit. */
      slackMinutes: number;
    }
  | {
      kind: 'placement';
      item: ItemRef;
      durationMinutes: number;
      windowStartMinute: number;
      windowEndMinute: number;
      occupied: IntervalEvidence[];
      gaps: GapEvidence[];
    }
  | { kind: 'dependency'; item: ItemRef; predecessor: EvidenceRef; itemStartMinute: number; predecessorFinishMinute: number }
  | { kind: 'responsibility'; item: ItemRef; responsibilityId: string; state: ResponsibilityState; coverage: Coverage; unacknowledged: boolean };

export interface Conflict {
  id: string;
  type: ConflictType;
  itemRefs: ItemRef[];
  evidence: ConflictEvidence;
  evidenceRefs: EvidenceRef[];
}

/**
 * A transition that PHYSICALLY FITS (slack >= 0) yet leaves less room than the foundation calls open. The foundation
 * tiers the leftover buffer as tight or overloaded; this keeps that verdict while making it possible to say "fits
 * narrowly" instead of "impossible" (scenario C vs D). Derived from stored values only.
 */
export interface NarrowTransition {
  before: IntervalEvidence;
  after: IntervalEvidence;
  gapMinutes: number;
  scheduledMinutes: number;
  storedTransitionMinutes: number;
  slackMinutes: number;
  tier: LoadTier;
}

export interface MissingEvidence {
  /** The canonical field that is null: a task's duration, or an event's travel on one side. */
  field: 'durationMinutes' | 'travelMinutesBefore' | 'travelMinutesAfter';
  itemRef: ItemRef;
  /** The other commitment of the transition the field belongs to, when known. Context only. */
  betweenWith: ItemRef | null;
  reason: 'no_usable_duration' | 'location_entered_travel_not_entered';
}

export type UnplacedState =
  | 'needs_a_place'
  | 'has_opening'
  | 'insufficient_information'
  | 'waiting_on_predecessor'
  | 'not_evaluated'
  | 'fixed_without_time';

export interface Opening {
  startMinute: number;
  endMinute: number;
  lengthMinutes: number;
  before: ItemRef | null;
  after: ItemRef | null;
  /** Minutes left in the opening once the task is placed. */
  leavesMinutes: number;
  /** The foundation's tier for that leftover buffer, only when both edges are commitments. */
  leavesTier: LoadTier | null;
}

export interface UnplacedItem {
  itemRef: ItemRef;
  state: UnplacedState;
  reason:
    | 'no_feasible_window'
    | 'certain_opening_exists'
    | 'opening_depends_on_missing_facts'
    | 'predecessor_unscheduled'
    | 'no_usable_duration'
    | 'splittable_not_evaluated'
    | 'fixed_commitment_no_time';
  durationKnown: boolean;
  openings: Opening[];
  missing: MissingEvidence[];
}

export interface OpenWindow {
  startMinute: number;
  endMinute: number;
  lengthMinutes: number;
}

/**
 * The day's capacity outcome, in the foundation's own vocabulary.
 *
 * `tier: null` is the foundation's convention for "not known" (commitment.ts: NULL MEANS NOT
 * KNOWN) — there is no unknown tier and none is invented. Unknown can only shrink capacity,
 * so `tight` and `overloaded` stand regardless of what is missing, while `open` is withheld
 * (`null`) unless the evidence behind it is complete.
 */
export interface CapacityState {
  tier: LoadTier | null;
  /** Exactly what the foundation classifier returned, before completeness was considered. */
  foundationTier: LoadTier;
  verdict: 'overlap' | 'transition_conflict' | 'capacity_pressure' | 'tight_window' | 'overdue' | null;
  /** The foundation's own numbers when the verdict is capacity pressure: what the household day has left vs what is planned. */
  pressure: { availableMinutes: number; neededMinutes: number; pressureMinutes: number } | null;
  evidence: { status: 'complete' | 'insufficient'; missing: MissingEvidence[] };
  evidenceRefs: EvidenceRef[];
}

export type ActionName = 'MOVE' | 'KEEP' | 'DROP' | 'SHORTEN' | 'KEEP_CAPACITY' | 'PROTECT' | 'UNDO' | 'EDIT';

export interface ActionAvailability {
  action: ActionName;
  itemRef: ItemRef | null;
  available: boolean;
  reason:
    | 'offered_by_verdict'
    | 'legitimate_edit_path'
    | 'not_today'
    | 'not_offered_by_verdict'
    | 'decision_already_made'
    | 'fixed_commitment'
    | 'elapsed'
    | 'nothing_to_undo'
    | 'undoable_today'
    | 'flexible_item'
    | 'no_recommendation_shown';
}

export type PreviewValidity = 'current' | 'stale' | 'invalid';
export type PreviewState =
  | { active: false }
  | { active: true; basedOnRevision: string; validity: PreviewValidity };

export interface CalendarDayViewModel {
  selectedDate: LocalDate;
  dayMode: DayMode;
  timeZone: string;
  /** The instant this logical day starts. Used only to turn elapsed minutes into clock times for display. */
  frameStartMs: number;
  /** The clock the projection was computed against (elapsed items and unacknowledged requests depend on it). */
  asOfMs: number;
  householdOrigin: 'demo' | 'real';
  dayItems: DayItem[];
  conflicts: Conflict[];
  narrowTransitions: NarrowTransition[];
  unplacedItems: UnplacedItem[];
  openWindows: OpenWindow[];
  /** `null` for a past day: the foundation has no as-of view, so no capacity claim is made. */
  capacityState: CapacityState | null;
  unknownStates: MissingEvidence[];
  availableActions: ActionAvailability[];
  preview: PreviewState;
  /** A digest of the canonical inputs this was computed from. In-memory only, never persisted. */
  revision: string;
}

// ---------------------------------------------------------------------- week ---

/** One day of the week, compared CATEGORICALLY. No number here is a score and nothing is ranked. */
export interface WeekDaySummary {
  date: LocalDate;
  dayMode: DayMode;
  isSelected: boolean;
  itemCount: number;
  /** null: not known (past day, or `open` withheld for missing evidence). */
  tier: LoadTier | null;
  evidenceStatus: 'complete' | 'insufficient' | 'not_applicable';
  conflictTypes: ConflictType[];
  conflictCount: number;
  unplacedCount: number;
}

export interface CalendarWeekViewModel {
  selectedDate: LocalDate;
  days: WeekDaySummary[];
}
