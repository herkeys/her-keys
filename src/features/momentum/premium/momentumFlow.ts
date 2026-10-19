import type { LocalDate } from '../../../domain/logicalDay';
import { logicalDateAt } from '../../../domain/logicalDay';
import { MOMENTUM_FEATURE_KEY, MOMENTUM_LEDGER_KIND, MOMENTUM_NEXT_STEP_KIND, type MomentumDecision, type MomentumReport } from '../../../domain/premium/momentum/model';
import { buildWeeklyReview } from '../../../domain/premium/momentum/report';
import { parseSnapshot, toSnapshot, type SavedReport } from '../../../domain/premium/momentum/snapshot';
import { sha256Hex } from '../../../domain/premium/sha256';
import type { AppState } from '../../../domain/state';
import type { LedgerRow, PremiumLedgerClient } from '../../../monetization/premiumLedgerClient';
import type { GateDecision, GateRequest, GateResult } from '../../../monetization/premiumTypes';

/**
 * The Momentum weekly review as an orchestration over ports (no React, no Supabase).
 *
 *   1. Read the Premium decision receipts (needed to tell a move she approved from a postponement she made). If they cannot be read
 *      the review is NOT built: guessing would blame her for moves Her Keys proposed.
 *   2. Build the review LOCALLY from the household's own records. Too little history is answered right here, with no authorization and
 *      no quota used: a week with nothing in it must never cost her anything.
 *   3. Only a review that has something to say is authorized (entitlement, quota, ownership) — and shown only if the server allows it.
 *   4. A copy is saved as a receipt in the shared ledger (aggregates and typed references only). Reading saved copies needs no
 *      subscription: Premium gates NEW analysis, never access to what she already has.
 */

export const DAILY_LOAD_FEATURE_KEY = 'daily_load_premium';

export interface MomentumFlowDeps {
  ledger: PremiumLedgerClient;
  authorize: (request: Omit<GateRequest, 'feature'>) => Promise<GateResult>;
  householdId: string;
  appVersion?: string;
}

/** One review per household per day: opening it twice is a replay, never a second charge. */
export const reviewKeyFor = (today: LocalDate): string => `momentum-week-${today}`;

const ms = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const planDate = (value: unknown, timeZone: string): LocalDate | null => {
  const plan = (value as { plan?: { kind?: string; date?: string; startsAt?: string } } | null | undefined)?.plan;
  if (!plan) return null;
  if (plan.kind === 'day' && typeof plan.date === 'string') return plan.date;
  if (plan.kind === 'timed' && typeof plan.startsAt === 'string') {
    const at = Date.parse(plan.startsAt);
    return Number.isNaN(at) ? null : logicalDateAt(at, timeZone);
  }
  return null;
};

/** A ledger receipt, reduced to what Momentum is allowed to read: ids, states, times and plan DATES. */
export function decisionsFrom(rows: readonly LedgerRow[], timeZone: string): MomentumDecision[] {
  return rows
    .filter((row) => row.featureKey === DAILY_LOAD_FEATURE_KEY)
    .map((row) => {
      const proposedAtMs = ms(row.proposedAt) ?? 0;
      return {
        id: row.id,
        status: row.status,
        taskId: row.proposalRef.kind === 'task' && typeof row.proposalRef.id === 'string' ? row.proposalRef.id : null,
        proposedAtMs,
        appliedAtMs: ms(row.appliedAt),
        revertedAtMs: ms(row.revertedAt),
        updatedAtMs: ms(row.updatedAt) ?? proposedAtMs,
        beforeDate: planDate(row.beforeSnapshot, timeZone),
        afterDate: planDate(row.afterSnapshot, timeZone) ?? planDate(row.plannedSnapshot, timeZone),
      };
    });
}

export type ReviewOutcome =
  | { kind: 'ready'; report: Extract<MomentumReport, { status: 'ready' }>; saved: 'recorded' | 'already_saved' | 'pending'; reviewKey: string; replay: boolean }
  | { kind: 'insufficient'; report: Extract<MomentumReport, { status: 'insufficient_history' }> }
  | { kind: 'denied'; decision: GateDecision }
  | { kind: 'unavailable'; reason: 'receipts' | 'server' };

export async function generateWeeklyReview(deps: MomentumFlowDeps, input: { state: AppState; today: LocalDate; nowMs: number }): Promise<ReviewOutcome> {
  const { state, today, nowMs } = input;
  const timeZone = state.user.timezone;

  const listed = await deps.ledger.list(DAILY_LOAD_FEATURE_KEY, deps.householdId, 200);
  if (listed.kind !== 'ok') return { kind: 'unavailable', reason: 'receipts' };
  // A full bounded window may have omitted older receipts that explain recorded moves.
  // Do not misattribute those moves or publish partial counts as a complete weekly review.
  if (listed.value.length >= 200) return { kind: 'unavailable', reason: 'receipts' };

  const report = buildWeeklyReview({
    observations: state.observations,
    decisions: decisionsFrom(listed.value, timeZone),
    confirmedPatterns: state.patterns,
    today,
    timeZone,
    nowMs,
  });
  if (report.status === 'insufficient_history') return { kind: 'insufficient', report };

  const reviewKey = reviewKeyFor(today);
  const result = await deps.authorize({ householdId: deps.householdId, idempotencyKey: reviewKey, ...(deps.appVersion ? { appVersion: deps.appVersion } : {}) });
  if (result.kind !== 'decision') return { kind: 'unavailable', reason: 'server' };
  if (result.decision.outcome !== 'allowed') return { kind: 'denied', decision: result.decision };

  const snapshot = toSnapshot(report);
  if (snapshot === null) return { kind: 'ready', report, saved: 'pending', reviewKey, replay: result.decision.replay };
  const saved = await saveReport(deps, reviewKey, snapshot);
  return { kind: 'ready', report, saved, reviewKey, replay: result.decision.replay };
}

async function saveReport(deps: MomentumFlowDeps, key: string, snapshot: SavedReport): Promise<'recorded' | 'already_saved' | 'pending'> {
  const recorded = await deps.ledger.record({
    householdId: deps.householdId,
    featureKey: MOMENTUM_FEATURE_KEY,
    kind: MOMENTUM_LEDGER_KIND,
    idempotencyKey: key,
    proposalRef: { kind: 'period', id: `${snapshot.period.start}..${snapshot.period.end}` },
    proposalDigest: sha256Hex(JSON.stringify(snapshot)),
  });
  // Today's review already has a receipt (opened before, possibly with fewer records at the time): nothing to add, and nothing wrong.
  if (recorded.kind === 'refused' && (recorded.code === 'duplicate' || recorded.code === 'idempotency_conflict')) return 'already_saved';
  if (recorded.kind !== 'ok') return 'pending';
  // A receipt from an earlier open: finished already, or interrupted between "approved" and "applied" (finish it now).
  if (recorded.value.status === 'applied') return 'already_saved';
  if (recorded.value.status === 'proposed') {
    const approved = await deps.ledger.transition(recorded.value.id, 'approved');
    if (approved.kind !== 'ok') return 'pending';
  } else if (recorded.value.status !== 'approved') {
    return 'already_saved';
  }
  const applied = await deps.ledger.transition(recorded.value.id, 'applied', { after_snapshot: snapshot as unknown as Record<string, unknown> });
  return applied.kind === 'ok' ? 'recorded' : 'pending';
}

// -------------------------------------------------------------------------------------------------------------- saved reviews

export interface SavedReview {
  id: string;
  savedAtMs: number;
  report: SavedReport;
}

/**
 * Reviews she already has. NO authorization and no entitlement: these are her records, readable after a subscription ends. A row that
 * is not a valid report (wrong version, tampered, unfinished) is left out, never guessed at. One per period end, newest first.
 */
export async function listSavedReviews(deps: Pick<MomentumFlowDeps, 'ledger' | 'householdId'>, limit = 30): Promise<{ kind: 'ok'; reviews: SavedReview[] } | { kind: 'unavailable' }> {
  const listed = await deps.ledger.list(MOMENTUM_FEATURE_KEY, deps.householdId, 100);
  if (listed.kind !== 'ok') return { kind: 'unavailable' };
  const byEnd = new Map<string, SavedReview>();
  for (const row of listed.value) {
    if (row.kind !== MOMENTUM_LEDGER_KIND || row.status !== 'applied') continue;
    const report = parseSnapshot(row.afterSnapshot);
    if (!report) continue;
    const savedAtMs = ms(row.appliedAt) ?? ms(row.updatedAt) ?? 0;
    const existing = byEnd.get(report.period.end);
    if (!existing || savedAtMs > existing.savedAtMs) byEnd.set(report.period.end, { id: row.id, savedAtMs, report });
  }
  return { kind: 'ok', reviews: [...byEnd.values()].sort((a, b) => b.report.period.end.localeCompare(a.report.period.end)).slice(0, limit) };
}

// -------------------------------------------------------------------------------------------------------------- the next step

export type NextStepOutcome = { kind: 'approved' } | { kind: 'already_approved' } | { kind: 'not_allowed' } | { kind: 'unavailable' };

/**
 * She chooses to look at the thing the review pointed to. Approving RECORDS her choice and changes nothing in her household: Momentum
 * never moves, completes or deletes anything. The receipt is keyed under the review's own authorization, so a next step can only be
 * approved for a review the server allowed.
 */
export async function approveNextStep(deps: MomentumFlowDeps, input: { reviewKey: string; about: { kind: string; id: string } }): Promise<NextStepOutcome> {
  const key = `${input.reviewKey}:next`;
  const recorded = await deps.ledger.record({
    householdId: deps.householdId,
    featureKey: MOMENTUM_FEATURE_KEY,
    kind: MOMENTUM_NEXT_STEP_KIND,
    idempotencyKey: key,
    proposalRef: { kind: input.about.kind, id: input.about.id },
    proposalDigest: sha256Hex(`${MOMENTUM_NEXT_STEP_KIND}:${input.about.kind}:${input.about.id}:${input.reviewKey}`),
  });
  if (recorded.kind === 'refused') {
    if (recorded.code === 'duplicate' || recorded.code === 'idempotency_conflict') return { kind: 'already_approved' };
    return recorded.code === 'not_authorized' ? { kind: 'not_allowed' } : { kind: 'unavailable' };
  }
  if (recorded.kind !== 'ok') return { kind: 'unavailable' };
  if (recorded.value.status === 'approved') return { kind: 'already_approved' };
  const approved = await deps.ledger.transition(recorded.value.id, 'approved');
  return approved.kind === 'ok' ? { kind: 'approved' } : { kind: 'unavailable' };
}

/** Has she already approved the next step for this review? Read from her own receipts. */
export async function nextStepApproved(deps: Pick<MomentumFlowDeps, 'ledger' | 'householdId'>, reviewKey: string): Promise<boolean> {
  const listed = await deps.ledger.list(MOMENTUM_FEATURE_KEY, deps.householdId, 100);
  return listed.kind === 'ok' && listed.value.some((row) => row.kind === MOMENTUM_NEXT_STEP_KIND && row.idempotencyKey === `${reviewKey}:next` && row.status === 'approved');
}
