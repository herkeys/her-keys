import type { TransitionContext } from '../../../domain/context';
import type { LocalDate } from '../../../domain/logicalDay';
import { applyReschedule, recoverInFlight, undoReschedule, type ApplyOutcome, type RefusalReason, type UndoBlockReason } from '../../../domain/premium/dailyLoadChange';
import { reviewDay, reviewEvidenceFingerprint, type DailyLoadReview, type RescheduleProposal } from '../../../domain/premium/dailyLoadReview';
import type { AppState, TaskPlan } from '../../../domain/state';
import type { GateDecision, GateRequest, GateResult } from '../../../monetization/premiumTypes';
import type { LedgerRow, PremiumLedgerClient } from '../../../monetization/premiumLedgerClient';

/**
 * The Premium Daily Load JOURNEY, as an orchestration over ports (no React, no Supabase): authorize -> review -> approve ->
 * receipt -> apply -> verify saved -> receipt -> (undo). Every step that can fail has a defined, recoverable outcome, and the
 * order is chosen so that a failure at any point leaves the household either UNCHANGED or correctly RECORDED:
 *
 *   1. the server authorizes the review (entitlement, consent-not-needed, ownership, quota);
 *   2. approving first writes the RECEIPT of intent (approved -> applying). If the receipt cannot be written NOTHING is changed;
 *   3. the household change is committed through the canonical store, which resolves true only once it is DURABLY saved;
 *   4. only then is the receipt finished as applied. If that last write fails the change is real and saved; the receipt is
 *      finished on the next open from the household's own state (`recoverOnOpen`). "Saved" is never claimed before it is.
 */
export const FEATURE_KEY = 'daily_load_premium';
const KIND = 'daily_load.reschedule_task';

export interface FlowDeps {
  ledger: PremiumLedgerClient;
  authorize: (request: Omit<GateRequest, 'feature'>) => Promise<GateResult>;
  /** The canonical store's `commit`: resolves true only when the change is durably saved. */
  commit: (transition: (state: AppState, ctx: TransitionContext) => AppState) => Promise<boolean>;
  getState: () => AppState;
  householdId: string;
  appVersion?: string;
}

export type OpenReviewOutcome =
  | { kind: 'ready'; review: DailyLoadReview; reviewKey: string; decision: GateDecision }
  | { kind: 'denied'; decision: GateDecision }
  | { kind: 'unavailable' };

/** The key that names ONE review of ONE day's evidence: re-opening an unchanged day is a replay, not a second charge. */
export const reviewKeyFor = (state: AppState, date: LocalDate): string => `dl-review-${reviewEvidenceFingerprint(state, date).slice(0, 32)}`;

export async function openReview(deps: FlowDeps, date: LocalDate): Promise<OpenReviewOutcome> {
  const state = deps.getState();
  const reviewKey = reviewKeyFor(state, date);
  const result = await deps.authorize({ householdId: deps.householdId, idempotencyKey: reviewKey, ...(deps.appVersion ? { appVersion: deps.appVersion } : {}) });
  if (result.kind !== 'decision') return { kind: 'unavailable' };
  if (result.decision.outcome !== 'allowed') return { kind: 'denied', decision: result.decision };
  // Authorized: only now is the deterministic review computed and shown. Its evidence is the household as of this instant.
  const review = reviewDay(deps.getState(), date);
  return { kind: 'ready', review, reviewKey, decision: result.decision };
}

export type ApproveOutcome =
  | { kind: 'applied'; change: ApplyChange; receipt: 'recorded' | 'pending'; receiptId: string }
  | { kind: 'refused'; reason: RefusalReason }
  | { kind: 'duplicate' }
  | { kind: 'not_saved' }
  | { kind: 'receipt_unavailable' }
  | { kind: 'not_allowed' };

type ApplyChange = Extract<ApplyOutcome, { kind: 'applied' }>['change'];

const slug = (digest: string) => digest.slice(0, 16);

/** How many receipts already exist for this exact move, so a re-approval after an undo gets a fresh derived key. */
async function nextAttempt(deps: FlowDeps, digest: string): Promise<number> {
  const listed = await deps.ledger.list(FEATURE_KEY, deps.householdId, 100);
  if (listed.kind !== 'ok') return 1;
  return listed.value.filter((row) => row.proposalDigest === digest).length + 1;
}

export async function approveProposal(deps: FlowDeps, reviewKey: string, proposal: RescheduleProposal): Promise<ApproveOutcome> {
  const key = `${reviewKey}:${slug(proposal.digest)}:${await nextAttempt(deps, proposal.digest)}`;

  const recorded = await deps.ledger.record({
    householdId: deps.householdId,
    featureKey: FEATURE_KEY,
    kind: KIND,
    idempotencyKey: key,
    proposalRef: { kind: 'task', id: proposal.taskId },
    sourceRef: { kind: 'day', id: proposal.sourceDate },
    proposalDigest: proposal.digest,
    before: { plan: proposal.from },
    planned: { plan: proposal.to },
    inverse: { op: 'restore_task_plan', taskId: proposal.taskId, restore: proposal.from, expect: proposal.to },
  });
  if (recorded.kind === 'refused') return recorded.code === 'duplicate' ? { kind: 'duplicate' } : recorded.code === 'not_authorized' ? { kind: 'not_allowed' } : { kind: 'receipt_unavailable' };
  if (recorded.kind !== 'ok') return { kind: 'receipt_unavailable' };
  const row = recorded.value;

  // Intent first. If any of these cannot be written, NOTHING in the household has changed.
  for (const to of ['approved', 'applying'] as const) {
    const moved = await deps.ledger.transition(row.id, to);
    if (moved.kind !== 'ok') {
      await deps.ledger.transition(row.id, 'abandoned', { failure_code: 'receipt_failed' });
      return { kind: 'receipt_unavailable' };
    }
  }

  let outcome: ApplyOutcome | null = null;
  const saved = await deps.commit((state, ctx) => {
    outcome = applyReschedule(state, ctx, proposal);
    return outcome.kind === 'applied' ? outcome.state : state;
  });
  const result = outcome as ApplyOutcome | null;

  if (result === null || result.kind === 'refused') {
    const reason = result?.kind === 'refused' ? result.reason : 'no_longer_offered';
    await deps.ledger.transition(row.id, 'failed', { failure_code: reason });
    return { kind: 'refused', reason };
  }
  if (!saved) {
    await deps.ledger.transition(row.id, 'failed', { failure_code: 'save_failed' });
    return { kind: 'not_saved' };
  }

  const finished = await deps.ledger.transition(row.id, 'applied', {
    after_snapshot: { plan: result.change.after.plan },
    result_ref: { kind: 'task', id: result.change.taskId },
  });
  return { kind: 'applied', change: result.change, receipt: finished.kind === 'ok' ? 'recorded' : 'pending', receiptId: row.id };
}

/** She chose "Not this one": recorded as a rejection (a decision about a proposal is evidence), changing nothing in the household. */
export async function rejectProposal(deps: FlowDeps, reviewKey: string, proposal: RescheduleProposal): Promise<'recorded' | 'unavailable'> {
  const key = `${reviewKey}:${slug(proposal.digest)}:${await nextAttempt(deps, proposal.digest)}`;
  const recorded = await deps.ledger.record({
    householdId: deps.householdId, featureKey: FEATURE_KEY, kind: KIND, idempotencyKey: key, proposalRef: { kind: 'task', id: proposal.taskId },
    sourceRef: { kind: 'day', id: proposal.sourceDate }, proposalDigest: proposal.digest, before: { plan: proposal.from }, planned: { plan: proposal.to },
  });
  if (recorded.kind !== 'ok') return 'unavailable';
  const moved = await deps.ledger.transition(recorded.value.id, 'rejected');
  return moved.kind === 'ok' ? 'recorded' : 'unavailable';
}

export type UndoFlowOutcome = { kind: 'reverted'; receipt: 'recorded' | 'pending' } | { kind: 'blocked'; reason: UndoBlockReason } | { kind: 'not_saved' } | { kind: 'unknown_receipt' };

const planOf = (snapshot: Record<string, unknown> | null): TaskPlan | null => {
  const plan = snapshot?.plan as { kind?: unknown } | undefined;
  return plan !== undefined && (plan.kind === 'day' || plan.kind === 'timed' || plan.kind === 'unplanned') ? (plan as TaskPlan) : null;
};

export async function undoChange(deps: FlowDeps, row: LedgerRow): Promise<UndoFlowOutcome> {
  const taskId = typeof row.proposalRef.id === 'string' ? row.proposalRef.id : null;
  const before = planOf(row.beforeSnapshot);
  const after = planOf(row.afterSnapshot);
  if (taskId === null || before === null || after === null || (row.status !== 'applied' && row.status !== 'revert_blocked')) return { kind: 'unknown_receipt' };

  let outcome: ReturnType<typeof undoReschedule> | null = null;
  const saved = await deps.commit((state, ctx) => {
    outcome = undoReschedule(state, ctx, { taskId, before: { plan: before }, after: { plan: after } });
    return outcome.kind === 'reverted' ? outcome.state : state;
  });
  const result = outcome as ReturnType<typeof undoReschedule> | null;
  if (result === null || result.kind === 'blocked') {
    const reason = result?.kind === 'blocked' ? result.reason : 'plan_changed';
    await deps.ledger.transition(row.id, 'revert_blocked', { failure_code: reason === 'plan_changed' ? 'changed_since' : reason });
    return { kind: 'blocked', reason };
  }
  if (!saved) return { kind: 'not_saved' };
  const finished = await deps.ledger.transition(row.id, 'reverted');
  return { kind: 'reverted', receipt: finished.kind === 'ok' ? 'recorded' : 'pending' };
}

/**
 * On opening: finish any receipt a crash or a dropped connection left half-done, from the household's own state.
 *  - approved/applying whose task now sits on the planned plan  -> it happened: mark applied;
 *  - approved/applying whose task still sits on its old plan    -> it never happened: abandon;
 *  - applied/revert_blocked whose task is back on its old plan  -> the undo happened: mark reverted.
 */
export async function recoverOnOpen(deps: FlowDeps): Promise<{ reconciled: number }> {
  const listed = await deps.ledger.list(FEATURE_KEY, deps.householdId, 50);
  if (listed.kind !== 'ok') return { reconciled: 0 };
  const state = deps.getState();
  let reconciled = 0;
  for (const row of listed.value) {
    const taskId = typeof row.proposalRef.id === 'string' ? row.proposalRef.id : null;
    const before = planOf(row.beforeSnapshot);
    const planned = planOf(row.plannedSnapshot);
    if (taskId === null || before === null || planned === null) continue;
    if (row.status === 'approved' || row.status === 'applying') {
      const decision = recoverInFlight(state, { taskId, before: { plan: before }, planned: { plan: planned } });
      const moved =
        decision.kind === 'mark_applied'
          ? await deps.ledger.transition(row.id, 'applied', { after_snapshot: { plan: decision.after.plan }, result_ref: { kind: 'task', id: taskId } })
          : await deps.ledger.transition(row.id, 'abandoned', { failure_code: decision.reason });
      if (moved.kind === 'ok') reconciled += 1;
    } else if (row.status === 'applied' || row.status === 'revert_blocked') {
      const task = state.tasks.find((t) => t.id === taskId);
      const back = task !== undefined && task.status === 'open' && JSON.stringify(task.plan) === JSON.stringify(before) && JSON.stringify(planOf(row.afterSnapshot)) !== JSON.stringify(before);
      if (back) {
        const moved = await deps.ledger.transition(row.id, 'reverted');
        if (moved.kind === 'ok') reconciled += 1;
      }
    }
  }
  return { reconciled };
}
