import type { BehaviorObservation } from '../../foundation/observation';
import { logicalDateAt, type LocalDate } from '../../logicalDay';
import { THRESHOLDS, type MomentumDecision, type MomentumEvent, type MomentumEventType } from './model';

/**
 * Deriving Momentum events from what was RECORDED: the append-only behaviour observations and the Premium decision receipts.
 *
 * Two rules keep the count honest.
 *
 *  1. ONE REAL THING IS ONE EVENT. Observations dedupe by id; a decision phase dedupes by decision id and phase. A re-read, a re-sync or
 *     a duplicate row can never count twice.
 *
 *  2. A SUGGESTION SHE APPROVED IS NOT A POSTPONEMENT SHE MADE. When she approves a Premium Daily Load move to a later day, the task
 *     system (correctly) writes a "deferred" observation, because the task did move later. Counting that as her postponing it would
 *     blame her for a move Her Keys proposed and she approved, and would count the same move twice (once as the observation, once as
 *     the applied decision). Each applied decision therefore CLAIMS at most one matching observation, and a claimed observation is
 *     reported only as the decision.
 */

const OBSERVATION_EVENT: Record<string, Partial<Record<string, MomentumEventType>>> = {
  task: { completed: 'task_completed', deferred: 'postponed_by_you' },
  needsMe: { completed: 'item_completed' },
  oneMove: { completed: 'one_move_completed' },
  system: { completed: 'routine_completed', skipped: 'routine_skipped', missed: 'routine_missed' },
  responsibility: { accepted: 'delegation_accepted', completed: 'delegation_completed' },
};

const LIVE_DECISION = new Set(['applied', 'reverted', 'revert_blocked']);

/** The observation a decision claims: same task, same move, inside the decision's life; the one nearest the apply time wins. */
function claimFor(decision: MomentumDecision, candidates: readonly BehaviorObservation[], taken: ReadonlySet<string>): BehaviorObservation | null {
  if (decision.taskId === null || !LIVE_DECISION.has(decision.status)) return null;
  const appliedAt = decision.appliedAtMs ?? decision.updatedAtMs;
  const from = decision.proposedAtMs - THRESHOLDS.attributionSkewMs;
  const to = appliedAt + THRESHOLDS.attributionSkewMs;
  let best: BehaviorObservation | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const o of candidates) {
    if (taken.has(o.id) || o.outcome !== 'deferred' || o.about.id !== decision.taskId) continue;
    const at = Date.parse(o.occurredAt);
    if (!(at >= from && at <= to)) continue;
    // The move must be the SAME move: where it came from and where it went (a null side means the decision could not say).
    if (decision.beforeDate !== null && o.plannedDate !== decision.beforeDate) continue;
    if (decision.afterDate !== null && o.toDate !== decision.afterDate) continue;
    const gap = Math.abs(at - appliedAt);
    if (gap < bestGap) {
      best = o;
      bestGap = gap;
    }
  }
  return best;
}

export interface DerivedEvents {
  events: MomentumEvent[];
  /** Observation ids that were reported as a decision instead of as her own postponement. */
  claimedObservationIds: string[];
}

export function deriveEvents(input: { observations: readonly BehaviorObservation[]; decisions: readonly MomentumDecision[]; timeZone: string }): DerivedEvents {
  const { timeZone } = input;
  const byId = new Map<string, BehaviorObservation>();
  for (const o of input.observations) if (!byId.has(o.id)) byId.set(o.id, o);
  const observations = [...byId.values()];

  // ---- decisions first: they claim observations --------------------------------------------------------------------------------
  const taken = new Set<string>();
  const decisionEvents = new Map<string, MomentumEvent>();
  const decisions = [...new Map(input.decisions.map((d) => [d.id, d] as const)).values()].sort((a, b) => a.proposedAtMs - b.proposedAtMs || a.id.localeCompare(b.id));
  const deferred = observations.filter((o) => o.outcome === 'deferred' && o.about.kind === 'task');
  for (const d of decisions) {
    const claimed = claimFor(d, deferred, taken);
    if (claimed) taken.add(claimed.id);
    const base = { about: { kind: 'task', id: d.taskId ?? '' }, plannedDate: d.beforeDate, toDate: d.afterDate, source: { kind: 'decision' as const, id: d.id }, producer: 'premium-decision', artifactId: null };
    const at = (ms: number): { logicalDate: LocalDate; occurredAtMs: number } => ({ logicalDate: logicalDateAt(ms, timeZone), occurredAtMs: ms });
    if (LIVE_DECISION.has(d.status) && d.taskId !== null) {
      const appliedAt = d.appliedAtMs ?? d.updatedAtMs;
      decisionEvents.set(`dec:${d.id}:applied`, { key: `dec:${d.id}:applied`, type: 'suggestion_applied', ...base, ...at(appliedAt) });
      if (d.status === 'reverted' && d.revertedAtMs !== null) {
        decisionEvents.set(`dec:${d.id}:reverted`, { key: `dec:${d.id}:reverted`, type: 'suggestion_reverted', ...base, ...at(d.revertedAtMs) });
      }
    } else if (d.status === 'rejected' && d.taskId !== null) {
      decisionEvents.set(`dec:${d.id}:declined`, { key: `dec:${d.id}:declined`, type: 'suggestion_declined', ...base, ...at(d.updatedAtMs) });
    }
    // proposed / approved / applying / failed / abandoned: nothing happened to her household, so nothing is reported.
  }

  // ---- observations ------------------------------------------------------------------------------------------------------------
  const observationEvents: MomentumEvent[] = [];
  for (const o of observations) {
    const type = OBSERVATION_EVENT[o.about.kind]?.[o.outcome];
    if (type === undefined) continue;
    if (taken.has(o.id)) continue;
    observationEvents.push({
      key: `obs:${o.id}`,
      type,
      about: { kind: o.about.kind, id: o.about.id },
      logicalDate: o.logicalDate,
      occurredAtMs: Date.parse(o.occurredAt),
      plannedDate: o.plannedDate,
      toDate: o.toDate,
      source: { kind: 'observation', id: o.id },
      producer: o.provenance.producer,
      artifactId: o.provenance.artifactId,
    });
  }

  const events = [...observationEvents, ...decisionEvents.values()].sort((a, b) => a.occurredAtMs - b.occurredAtMs || a.key.localeCompare(b.key));
  return { events, claimedObservationIds: [...taken].sort() };
}

/**
 * Tasks whose most recent completed/reopened observation is a completion. A task she completed, reopened and left open is not
 * "completed"; one she completed, reopened and completed again is completed once.
 */
export function netCompletedTaskIds(observations: readonly BehaviorObservation[]): Set<string> {
  const latest = new Map<string, { at: number; outcome: string }>();
  for (const o of observations) {
    if (o.about.kind !== 'task' || (o.outcome !== 'completed' && o.outcome !== 'reopened')) continue;
    const at = Date.parse(o.occurredAt);
    const seen = latest.get(o.about.id);
    if (!seen || at >= seen.at) latest.set(o.about.id, { at, outcome: o.outcome });
  }
  return new Set([...latest].filter(([, v]) => v.outcome === 'completed').map(([id]) => id));
}
