import { buildMoneyFollowUpDetail, type Clock, type MoneyFollowUpView } from '../coparent';
import { categoryWithRole } from '../../domain/categories';
import type { AppState } from '../../domain/state';

/**
 * F07 REIMBURSEMENT MAPPING — read-side only. Zero changes to src/features/coparent/**.
 *
 * F07 has no single reimbursement status enum (see docs/builds/HK_FEATURE_09_MONEY.md, "F07
 * reimbursement mapping"). The only thing that ever moves an item out of "outstanding" is real
 * payment evidence — every other distinction (requested, acknowledged, accepted, marked done)
 * stays outstanding, by construction, so "acknowledged/accepted/marked done" can never read as
 * paid.
 *
 * `buildCoParentLogisticsView(...).moneyFollowUps` only carries OPEN follow-ups — a completed one
 * moves to a separate, time-windowed `recentlyCompleted` array with a different shape, which would
 * silently drop an older "marked done, no payment record" item out of Money's view entirely. So
 * this reads every money-category task id from canonical state (via the generic, non-F07-owned
 * `categoryWithRole(state, 'coparenting')`) and asks the exported `buildMoneyFollowUpDetail` for
 * each one, which returns the full view regardless of standing — still zero changes to F07, and
 * still only its own public exports.
 */

export type ReimbursementInterpretation =
  | 'not_followed_up'
  | 'requested'
  | 'acknowledged'
  | 'accepted'
  | 'declined'
  | 'marked_done_no_payment_record'
  | 'paid';

export interface ReimbursementProjection {
  taskId: string;
  title: string;
  amountMinor: number;
  currency: string;
  direction: 'inflow' | 'outflow';
  decimal: string;
  child: MoneyFollowUpView['child'];
  followUpDate: string | null;
  interpretation: ReimbursementInterpretation;
  /** The only two buckets that matter financially: this never derives from time, only from real evidence or her own action. */
  resolved: boolean;
  completedAt: string | null;
}

function interpretationOf(view: MoneyFollowUpView): ReimbursementInterpretation {
  if (view.paymentEvidence === 'service_reported_paid') return 'paid';
  if (view.standing === 'done') return 'marked_done_no_payment_record';
  switch (view.responsibility.stage) {
    case 'requested':
      return 'requested';
    case 'acknowledged':
      return 'acknowledged';
    case 'accepted':
      return 'accepted';
    case 'declined':
      return 'declined';
    default:
      return 'not_followed_up';
  }
}

/** Every task in the coparenting category that carries a `value` — the same "task bridge" membership rule F07 itself uses. */
function moneyFollowUpTaskIds(state: AppState): string[] {
  const category = categoryWithRole(state, 'coparenting');
  if (category === null) return [];
  return state.tasks.filter((task) => task.categoryId === category.id && task.value !== null).map((task) => task.id);
}

/**
 * Every non-removed F07 money follow-up, re-interpreted, regardless of standing or age.
 * `householdId` must equal `state.household.id` — the same guard `buildMoneyFollowUpDetail`
 * itself uses (a mismatch resolves every detail to `not_found`, so the result is simply empty).
 */
export function reimbursementProjections(state: AppState, householdId: string, clock: Clock): ReimbursementProjection[] {
  return moneyFollowUpTaskIds(state)
    .map((taskId) => buildMoneyFollowUpDetail(state, householdId, taskId, clock))
    .filter((detail) => detail.status === 'ok' && detail.followUp !== null && detail.followUp.standing !== 'removed')
    .map((detail) => {
      const f = detail.followUp as MoneyFollowUpView;
      return {
        taskId: f.taskId,
        title: f.title,
        amountMinor: f.amount.amountMinor,
        currency: f.amount.currency,
        direction: f.amount.direction,
        decimal: f.amount.decimal,
        child: f.child,
        followUpDate: f.followUpDate,
        interpretation: interpretationOf(f),
        resolved: f.paymentEvidence === 'service_reported_paid',
        completedAt: f.completedAt,
      };
    });
}

/** Only the ones worth her attention on Money Home: something has actually moved, and it is not yet resolved. */
export function outstandingReimbursements(state: AppState, householdId: string, clock: Clock): ReimbursementProjection[] {
  return reimbursementProjections(state, householdId, clock).filter((r) => !r.resolved && r.interpretation !== 'not_followed_up');
}

/** For "Recently resolved" — only ones with real payment evidence. Dormant today: no provider exists (MP-07-06). */
export function recentlyResolvedReimbursements(state: AppState, householdId: string, clock: Clock): ReimbursementProjection[] {
  return reimbursementProjections(state, householdId, clock).filter((r) => r.resolved);
}
