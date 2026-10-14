import type { BehaviorObservation } from '../../foundation/observation';
import type { Pattern } from '../../foundation/pattern';
import { addDays, type LocalDate } from '../../logicalDay';
import { aggregatePeriod, deltasOf, hasEnoughHistory, inPeriod, periodEndingOn, priorPeriodOf } from './aggregate';
import { deriveEvents, netCompletedTaskIds } from './events';
import { detectFriction, nextStepFor } from './friction';
import { MOMENTUM_VERSION, THRESHOLDS, type MomentumDecision, type MomentumReport } from './model';

export interface ReportInput {
  observations: readonly BehaviorObservation[];
  decisions: readonly MomentumDecision[];
  confirmedPatterns: readonly Pattern[];
  today: LocalDate;
  timeZone: string;
  nowMs: number;
}

/**
 * THE WEEKLY REVIEW, from recorded evidence only.
 *
 * It never invents. With too little recorded it says so and shows what exists so far (a legitimate first-week state); it compares with
 * the prior period only when that period also had enough history; it reports counts, not scores; it estimates no time (there is no
 * defensible calculation of "time recovered" from these records, so none is made); and every pattern carries its sightings and its
 * evidence ids so "why does it say that?" always has an answer.
 */
export function buildWeeklyReview(input: ReportInput): MomentumReport {
  const period = periodEndingOn(input.today);
  const prior = priorPeriodOf(period);
  const lookbackStart = addDays(input.today, -(THRESHOLDS.lookbackDays - 1));

  // Look further back than the period, so "she had postponed this before" and patterns can be seen; never forward past today.
  const observations = input.observations.filter((o) => o.logicalDate <= input.today);
  const { events } = deriveEvents({ observations, decisions: input.decisions, timeZone: input.timeZone });
  const history = events.filter((e) => e.logicalDate >= lookbackStart && e.logicalDate <= input.today);
  const netCompleted = netCompletedTaskIds(observations);

  const counts = aggregatePeriod({ events, history, period, netCompleted });
  if (!hasEnoughHistory(counts)) {
    return {
      status: 'insufficient_history',
      version: MOMENTUM_VERSION,
      period,
      reason: counts.totalEvents === 0 ? 'nothing_recorded' : 'too_little_recorded',
      have: { events: counts.totalEvents, activeDays: counts.activeDays },
      needs: { events: THRESHOLDS.minEventsForReport, activeDays: THRESHOLDS.minActiveDaysForReport },
      generatedAtMs: input.nowMs,
    };
  }

  const priorCounts = aggregatePeriod({ events, history: events.filter((e) => e.logicalDate >= addDays(prior.start, -(THRESHOLDS.lookbackDays - 1)) && e.logicalDate <= prior.end), period: prior, netCompleted });
  const comparable = hasEnoughHistory(priorCounts);

  const postponements = history.filter((e) => e.type === 'postponed_by_you');
  const patterns = detectFriction({ postponements, confirmed: input.confirmedPatterns });

  const inWindow = events.filter((e) => inPeriod(e.logicalDate, period));
  const observationIds = inWindow.filter((e) => e.source.kind === 'observation').map((e) => e.source.id);
  const decisionIds = [...new Set(inWindow.filter((e) => e.source.kind === 'decision').map((e) => e.source.id))];

  return {
    status: 'ready',
    version: MOMENTUM_VERSION,
    period,
    counts,
    comparison: comparable ? { prior, deltas: deltasOf(counts, priorCounts) } : null,
    comparisonUnavailable: comparable ? null : 'prior_history_too_short',
    patterns,
    nextStep: nextStepFor(patterns),
    evidence: {
      observationIds: observationIds.slice(0, THRESHOLDS.maxEvidenceIds),
      decisionIds: decisionIds.slice(0, THRESHOLDS.maxEvidenceIds),
      truncated: observationIds.length > THRESHOLDS.maxEvidenceIds || decisionIds.length > THRESHOLDS.maxEvidenceIds,
    },
    generatedAtMs: input.nowMs,
  };
}
