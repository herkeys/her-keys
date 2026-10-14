import type { TransitionContext } from '../context';
import type { LocalDate } from '../logicalDay';
import type { AppState, TaskPlan } from '../state';
import { updateTask } from '../tasks';
import { evaluateMove, planKey, type RescheduleProposal } from './dailyLoadReview';

/**
 * Applying, undoing and recovering a Premium Daily Load change. All pure state transitions over the CANONICAL task mutation
 * (`updateTask`) — there is no parallel write path, no new durable type, and no Google write-back.
 *
 * Safety rules (each is pinned by a test):
 *  - APPLY RE-RUNS THE SAME EVALUATION against the CURRENT state. If anything the proposal rested on has changed (the task was
 *    edited, completed, moved, the destination filled up, the day no longer needs it), the change is REFUSED, never forced.
 *  - ONLY `plan` IS EVER WRITTEN. Her edits to a title, notes or duration are never touched by apply or by undo.
 *  - UNDO DETECTS INTERVENING CHANGES: it restores the old plan only if the task's plan is still exactly what Her Keys set. If she
 *    moved it again, finished it or removed it, undo is BLOCKED and says why — it never overwrites a decision she made since.
 *  - APPROVAL AUTHORIZES THIS ONE CHANGE. Nothing here creates a standing rule or a future automation.
 */

export interface AppliedChange {
  digest: string;
  taskId: string;
  sourceDate: LocalDate;
  toDate: LocalDate;
  before: { plan: TaskPlan };
  after: { plan: TaskPlan };
}

export type RefusalReason = 'task_missing' | 'task_not_open' | 'plan_changed' | 'no_longer_offered';

export type ApplyOutcome = { kind: 'applied'; state: AppState; change: AppliedChange } | { kind: 'refused'; reason: RefusalReason };

export function applyReschedule(state: AppState, ctx: TransitionContext, proposal: RescheduleProposal): ApplyOutcome {
  const task = state.tasks.find((candidate) => candidate.id === proposal.taskId);
  if (task === undefined) return { kind: 'refused', reason: 'task_missing' };
  if (task.status !== 'open') return { kind: 'refused', reason: 'task_not_open' };
  if (planKey(task.plan) !== planKey(proposal.from)) return { kind: 'refused', reason: 'plan_changed' };

  // The same evaluation that produced the proposal, against what is true NOW. Its digest must be the one she saw.
  const current = evaluateMove(state, proposal.taskId, proposal.sourceDate, proposal.toDate);
  if (current === null || current.digest !== proposal.digest) return { kind: 'refused', reason: 'no_longer_offered' };

  const next = updateTask(state, ctx, proposal.taskId, { plan: current.to });
  const moved = next.tasks.find((candidate) => candidate.id === proposal.taskId);
  if (moved === undefined || planKey(moved.plan) !== planKey(current.to)) return { kind: 'refused', reason: 'plan_changed' };
  return {
    kind: 'applied',
    state: next,
    change: { digest: current.digest, taskId: proposal.taskId, sourceDate: proposal.sourceDate, toDate: proposal.toDate, before: { plan: task.plan }, after: { plan: moved.plan } },
  };
}

export type UndoBlockReason = 'task_missing' | 'task_not_open' | 'plan_changed';

export type UndoOutcome = { kind: 'reverted'; state: AppState } | { kind: 'blocked'; reason: UndoBlockReason };

/** Restore ONLY the plan, and only if the plan is still exactly what Her Keys set. */
export function undoReschedule(state: AppState, ctx: TransitionContext, change: Pick<AppliedChange, 'taskId' | 'before' | 'after'>): UndoOutcome {
  const task = state.tasks.find((candidate) => candidate.id === change.taskId);
  if (task === undefined) return { kind: 'blocked', reason: 'task_missing' };
  if (task.status !== 'open') return { kind: 'blocked', reason: 'task_not_open' };
  if (planKey(task.plan) !== planKey(change.after.plan)) return { kind: 'blocked', reason: 'plan_changed' };
  return { kind: 'reverted', state: updateTask(state, ctx, change.taskId, { plan: change.before.plan }) };
}

/**
 * After a crash or a lost connection a receipt can be left `approved`/`applying`. The household's own state is the truth:
 *  - the task already sits on the planned plan  -> the change HAPPENED: finish the receipt as applied;
 *  - the task still sits on its original plan   -> it never happened: abandon the receipt (nothing to undo);
 *  - anything else                              -> she changed it since: abandon, and say so.
 */
export type RecoveryDecision = { kind: 'mark_applied'; after: { plan: TaskPlan } } | { kind: 'abandon'; reason: 'not_applied' | 'changed_since' };

export function recoverInFlight(state: AppState, receipt: { taskId: string; before: { plan: TaskPlan }; planned: { plan: TaskPlan } }): RecoveryDecision {
  const task = state.tasks.find((candidate) => candidate.id === receipt.taskId);
  if (task === undefined || task.status !== 'open') return { kind: 'abandon', reason: 'changed_since' };
  if (planKey(task.plan) === planKey(receipt.planned.plan)) return { kind: 'mark_applied', after: { plan: task.plan } };
  if (planKey(task.plan) === planKey(receipt.before.plan)) return { kind: 'abandon', reason: 'not_applied' };
  return { kind: 'abandon', reason: 'changed_since' };
}
