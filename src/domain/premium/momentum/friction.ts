import type { Pattern } from '../../foundation/pattern';
import { weekdayOf } from '../../logicalDay';
import { confidenceRank, independentCorroborations, promoteConfidence } from '../../reasoning/confidence';
import { THRESHOLDS, type ConfidenceTier, type FrictionPattern, type MomentumEvent, type NextStep } from './model';

/**
 * Recurring friction: things she keeps moving. Read over the lookback window, from HER postponements only (a move she approved from a
 * suggestion is not friction, and `deriveEvents` has already taken those out).
 *
 * CONFIDENCE is grounded in observation counts and nothing else, through the one promotion rule the codebase already has:
 *
 *   fewer than 2 independent sightings  -> not reported (one occurrence is an event, never a pattern)
 *   2 independent sightings             -> possible
 *   3 or more independent sightings     -> likely     (`promoteConfidence`: the existing threshold for an inference)
 *   she confirmed a matching pattern    -> established (only she can; see patterns.ts `confirmPattern`)
 *
 * "Independent" is `independentCorroborations`: two postponements by the same producer on the same logical day are ONE sighting, and
 * rows that came from one source artifact are one. Repetition inside a single day is not a pattern.
 */

const tierForSightings = (sightings: number): ConfidenceTier | null =>
  sightings < THRESHOLDS.patternPossibleSightings ? null : promoteConfidence('possible', { source: 'ai-inference', corroborations: sightings, userConfirmed: false });

const asSightings = (events: readonly MomentumEvent[]) => events.map((e) => ({ producer: e.producer as never, artifactId: e.artifactId, logicalDate: e.logicalDate }));

export function detectFriction(input: { postponements: readonly MomentumEvent[]; confirmed: readonly Pattern[] }): FrictionPattern[] {
  const found: FrictionPattern[] = [];
  const confirmedTask = new Set(input.confirmed.filter((p) => p.status === 'confirmed' && p.kind === 'deferral' && p.about?.kind === 'task').map((p) => p.about!.id));
  const confirmedWeekday = new Set(input.confirmed.filter((p) => p.status === 'confirmed' && p.kind === 'deferral' && p.about === null && p.weekday !== null).map((p) => p.weekday as number));

  // ---- the same task, moved again and again ------------------------------------------------------------------------------------
  const byTask = new Map<string, MomentumEvent[]>();
  for (const e of input.postponements) byTask.set(e.about.id, [...(byTask.get(e.about.id) ?? []), e]);
  for (const [taskId, events] of byTask) {
    const sightings = independentCorroborations(asSightings(events));
    const base = tierForSightings(sightings);
    if (base === null) continue;
    const confirmedByHer = confirmedTask.has(taskId);
    const dates = events.map((e) => e.logicalDate).sort();
    found.push({
      kind: 'repeated_postponement',
      tier: confirmedByHer ? 'established' : base,
      about: { kind: 'task', id: taskId },
      weekday: null,
      sightings,
      firstOn: dates[0],
      lastOn: dates[dates.length - 1],
      evidence: events.map((e) => e.source.id).slice(0, THRESHOLDS.maxEvidenceIds),
      confirmedByHer,
    });
  }

  // ---- one weekday keeps losing things -------------------------------------------------------------------------------------------
  // Needs at least two DIFFERENT tasks; one task moved repeatedly is already reported above and must not be reported twice.
  const byWeekday = new Map<number, MomentumEvent[]>();
  for (const e of input.postponements) {
    if (e.plannedDate === null) continue;
    const day = weekdayOf(e.plannedDate);
    byWeekday.set(day, [...(byWeekday.get(day) ?? []), e]);
  }
  for (const [weekday, events] of byWeekday) {
    if (new Set(events.map((e) => e.about.id)).size < 2) continue;
    const plannedDays = new Set(events.map((e) => e.plannedDate as string));
    const sightings = plannedDays.size;
    const base = tierForSightings(sightings);
    if (base === null) continue;
    const confirmedByHer = confirmedWeekday.has(weekday);
    const dates = events.map((e) => e.logicalDate).sort();
    found.push({
      kind: 'weekday_slippage',
      tier: confirmedByHer ? 'established' : base,
      about: null,
      weekday,
      sightings,
      firstOn: dates[0],
      lastOn: dates[dates.length - 1],
      evidence: events.map((e) => e.source.id).slice(0, THRESHOLDS.maxEvidenceIds),
      confirmedByHer,
    });
  }

  return found
    .sort((a, b) => confidenceRank(b.tier) - confidenceRank(a.tier) || b.sightings - a.sightings || b.lastOn.localeCompare(a.lastOn) || `${a.kind}${a.about?.id ?? a.weekday}`.localeCompare(`${b.kind}${b.about?.id ?? b.weekday}`))
    .slice(0, THRESHOLDS.maxPatterns);
}

/** The one thing Momentum may suggest she look at: a task moved repeatedly, only once the evidence is at least "likely". */
export function nextStepFor(patterns: readonly FrictionPattern[]): NextStep | null {
  const pick = patterns.find((p) => p.kind === 'repeated_postponement' && p.about !== null && confidenceRank(p.tier) >= confidenceRank('likely'));
  return pick?.about ? { kind: 'review_repeated_postponement', about: pick.about, requiresApproval: true } : null;
}
