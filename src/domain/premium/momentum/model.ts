import type { LocalDate } from '../../logicalDay';

/**
 * MOMENTUM FOUNDATION — the vocabulary. See docs/premium/PREMIUM_MOMENTUM_FOUNDATION.md for the reasoning behind every number here.
 *
 * Momentum measures mental load REMOVED, not tasks completed, and it says only what recorded evidence supports. Every figure it reports is
 * a count of real records inside a stated window; nothing is estimated, extrapolated or inferred without a label.
 */

export const MOMENTUM_VERSION = 'momentum-v1';
export const MOMENTUM_FEATURE_KEY = 'momentum_report';
export const MOMENTUM_LEDGER_KIND = 'momentum.weekly_review';
export const MOMENTUM_NEXT_STEP_KIND = 'momentum.next_step';

/**
 * Every threshold, and why. They are PRODUCT JUDGEMENTS (flagged as owner decision OD-P1-09), not measurements; each is the smallest
 * value that avoids calling noise a finding, and each is exercised by a boundary test.
 */
export const THRESHOLDS = {
  /** A review covers seven logical days ending today, so it is never empty on a Monday and never a partial calendar week. */
  periodDays: 7,
  /** Patterns are read over four periods: four occurrences of any given weekday, enough to see "it keeps slipping on Tuesdays". */
  lookbackDays: 28,
  /** Below this a week is mostly noise: a report is withheld and the history so far is shown instead. */
  minEventsForReport: 5,
  minActiveDaysForReport: 3,
  /** One occurrence is an event, never a pattern. Two is possible. */
  patternPossibleSightings: 2,
  /**
   * Three independent sightings is the EXISTING promotion rule for an inference (reasoning/confidence.ts `promoteConfidence`); this
   * module calls that function rather than restating the number, so the two can never drift apart. 'established' is reachable only
   * when she has confirmed a matching pattern.
   */
  patternLikelySightings: 3,
  /**
   * An applied suggestion and the "deferred" observation the task system wrote for the same move are one event. They are matched when
   * the observation falls inside the decision's life, widened by this skew (device and server clocks differ).
   */
  attributionSkewMs: 10 * 60_000,
  /** The saved snapshot must fit the ledger's 4000-byte column with room to spare. */
  snapshotMaxBytes: 3600,
  maxPatterns: 6,
  maxEvidenceIds: 10,
} as const;

export type ConfidenceTier = 'possible' | 'likely' | 'established';

export const EVENT_TYPES = [
  'task_completed',
  'item_completed',
  'one_move_completed',
  'routine_completed',
  'routine_skipped',
  'routine_missed',
  'postponed_by_you',
  'suggestion_applied',
  'suggestion_reverted',
  'suggestion_declined',
  'delegation_accepted',
  'delegation_completed',
] as const;
export type MomentumEventType = (typeof EVENT_TYPES)[number];

export interface MomentumRef {
  kind: string;
  id: string;
}

export interface MomentumEvent {
  /** Dedupe identity: `obs:<id>` for an observation, `dec:<id>:<phase>` for a decision phase. One real thing is one key. */
  key: string;
  type: MomentumEventType;
  about: MomentumRef;
  logicalDate: LocalDate;
  occurredAtMs: number;
  plannedDate: LocalDate | null;
  toDate: LocalDate | null;
  source: { kind: 'observation' | 'decision'; id: string };
  /** Independence inputs for corroboration counting (see reasoning/confidence.ts `independentCorroborations`). */
  producer: string;
  artifactId: string | null;
}

/** What Momentum needs to know about one Premium decision. No titles, no content. */
export interface MomentumDecision {
  id: string;
  status: string;
  taskId: string | null;
  proposedAtMs: number;
  appliedAtMs: number | null;
  revertedAtMs: number | null;
  updatedAtMs: number;
  beforeDate: LocalDate | null;
  afterDate: LocalDate | null;
}

export interface Period {
  start: LocalDate;
  end: LocalDate;
  days: number;
}

export interface PeriodCounts {
  tasksCompleted: number;
  itemsCompleted: number;
  oneMovesCompleted: number;
  routinesDone: number;
  routinesSkipped: number;
  routinesMissed: number;
  /** Observations of her moving something later, EXCLUDING moves she approved from a suggestion. */
  postponements: number;
  postponedTasks: number;
  /** Tasks she finished this period that she had postponed at least once in the lookback. */
  finishedAfterPostponing: number;
  suggestionsApplied: number;
  suggestionsReverted: number;
  suggestionsDeclined: number;
  delegationsAccepted: number;
  delegationsCompleted: number;
  totalEvents: number;
  activeDays: number;
}

export type PatternKind = 'repeated_postponement' | 'weekday_slippage';

export interface FrictionPattern {
  kind: PatternKind;
  tier: ConfidenceTier;
  /** What it is about: a task for repeated postponement; absent for a weekday. */
  about: MomentumRef | null;
  weekday: number | null;
  /** Independent sightings it stands on. */
  sightings: number;
  firstOn: LocalDate;
  lastOn: LocalDate;
  /** The observation ids it stands on, capped. Refs only. */
  evidence: string[];
  /** She confirmed this pattern herself (state.patterns). The only route to 'established'. */
  confirmedByHer: boolean;
}

export interface NextStep {
  kind: 'review_repeated_postponement';
  about: MomentumRef;
  /** A proposal: nothing happens until she approves it, and approving only records that she chose to look. */
  requiresApproval: true;
}

export interface Comparison {
  prior: Period;
  /** Signed differences (this period minus the prior period of equal length). Only counts, only when both periods had enough history. */
  deltas: Partial<Record<keyof PeriodCounts, number>>;
}

export type InsufficientReason = 'nothing_recorded' | 'too_little_recorded';

export type MomentumReport =
  | {
      status: 'ready';
      version: typeof MOMENTUM_VERSION;
      period: Period;
      counts: PeriodCounts;
      comparison: Comparison | null;
      /** Why there is no comparison, when there is none. */
      comparisonUnavailable: 'prior_history_too_short' | null;
      patterns: FrictionPattern[];
      nextStep: NextStep | null;
      evidence: { observationIds: string[]; decisionIds: string[]; truncated: boolean };
      generatedAtMs: number;
    }
  | {
      status: 'insufficient_history';
      version: typeof MOMENTUM_VERSION;
      period: Period;
      reason: InsufficientReason;
      /** What exists so far, and what a review needs. */
      have: { events: number; activeDays: number };
      needs: { events: number; activeDays: number };
      generatedAtMs: number;
    };
