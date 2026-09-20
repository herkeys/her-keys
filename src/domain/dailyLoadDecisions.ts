import { computeDailyLoad } from '../features/daily-load/computeDailyLoad';
import type { DailyLoadDecision } from '../types';
import type { TransitionContext } from './context';
import { assessDailyLoadIssues, type DailyLoadIssues } from './dailyLoadIssues';
import { addDays, toInstant, type LocalDate } from './logicalDay';
import { appendObservation, plannedDateOf } from './observations';
import { projectStateDay } from './projectDay';
import type { ActionRecord, AppState, KeepPlanAction, MoveEventAction, MoveTaskAction, TaskPlan } from './state';

type DailyLoadTransitionAction = MoveTaskAction | MoveEventAction | KeepPlanAction;

/**
 * A Daily Load decision is stored as what she accepted — the item's new time
 * plus a typed action record — never as the analysis that led to it. The
 * assessment is recomputed from the changed facts every time it's needed.
 */

/** What Her Keys told her when she approved moving a task, as recorded at the time. */
export interface AppliedTaskMove {
  taskTitle: string;
  currentBufferMinutes: number;
  projectedBufferMinutes: number;
  requiredBufferMinutes: number;
  resolvesShortfall: boolean;
  windowAfterTitle: string;
}

/** An approved event move, as recorded at the time. */
export interface AppliedEventMove {
  eventTitle: string;
  /** The commitment it was squeezed against. */
  otherTitle: string;
  /** Whether the two ran into each other (a negative buffer) rather than only sitting too close. */
  overlapped: boolean;
  currentBufferMinutes: number;
}

export type AppliedMove = AppliedTaskMove | AppliedEventMove;

export interface DailyLoadDecisionView {
  decision: DailyLoadDecision;
  appliedMove: AppliedMove | null;
}

function isDailyLoadAction(action: ActionRecord): action is DailyLoadTransitionAction {
  return action.type === 'daily_load.move_task' || action.type === 'daily_load.move_event' || action.type === 'daily_load.keep_plan';
}

/**
 * The one-decision-per-logical-day gate for the timing verdicts — a tight or
 * overloaded transition, or two commitments that overlap. Moving a task,
 * moving an event and keeping the plan all count; whichever she chose first is
 * the day's decision.
 */
export function latestTransitionDecision(state: AppState, date: LocalDate): DailyLoadTransitionAction | null {
  for (let index = state.actions.length - 1; index >= 0; index--) {
    const action = state.actions[index];
    if (action.logicalDate === date && isDailyLoadAction(action)) return action;
  }
  return null;
}

const titleOf = (items: ReadonlyArray<{ id: string; title: string }>, id: string) => items.find((item) => item.id === id)?.title ?? '';

export function dailyLoadDecisionFor(state: AppState, date: LocalDate): DailyLoadDecisionView {
  const action = latestTransitionDecision(state, date);
  if (!action) return { decision: 'pending', appliedMove: null };
  if (action.type === 'daily_load.keep_plan') return { decision: 'kept', appliedMove: null };

  const { reason } = action;
  if (action.type === 'daily_load.move_event') {
    const otherId = reason.windowBeforeEventId === action.targetId ? reason.windowAfterEventId : reason.windowBeforeEventId;
    return {
      decision: 'moved',
      appliedMove: {
        eventTitle: titleOf(state.events, action.targetId),
        otherTitle: titleOf(state.events, otherId),
        overlapped: reason.bufferMinutes < 0,
        currentBufferMinutes: reason.bufferMinutes,
      },
    };
  }
  return {
    decision: 'moved',
    appliedMove: {
      taskTitle: titleOf(state.tasks, action.targetId),
      currentBufferMinutes: reason.bufferMinutes,
      projectedBufferMinutes: action.reason.projectedBufferMinutes,
      requiredBufferMinutes: reason.requiredBufferMinutes,
      resolvesShortfall: action.reason.projectedBufferMinutes >= reason.requiredBufferMinutes,
      windowAfterTitle: titleOf(state.events, reason.windowAfterEventId),
    },
  };
}

/** Today's verdict, computed from the current facts — the only thing an approval is ever checked against. */
export function todaysIssues(state: AppState, today: LocalDate): DailyLoadIssues {
  const day = projectStateDay(state, today);
  return assessDailyLoadIssues(day.events, day.tasks, computeDailyLoad(day.events, day.tasks));
}

/** The window a timing decision is about: the verdict's transition, or the two overlapping commitments (a negative buffer). */
export interface DecisionWindow {
  windowBeforeEventId: string;
  windowAfterEventId: string;
  bufferMinutes: number;
  requiredBufferMinutes: number;
}

export const REQUIRED_BUFFER_FOR_DECISIONS = 45;

export function decisionWindowFor(issues: DailyLoadIssues): DecisionWindow | null {
  const { primary, focus } = issues;
  if (focus) {
    return {
      windowBeforeEventId: focus.issue.beforeEventId,
      windowAfterEventId: focus.issue.afterEventId,
      bufferMinutes: focus.issue.bufferMinutes,
      requiredBufferMinutes: focus.issue.requiredBufferMinutes,
    };
  }
  if (primary?.kind === 'overlap' && primary.movableEventId !== null) {
    return {
      windowBeforeEventId: primary.eventAId,
      windowAfterEventId: primary.eventBId,
      bufferMinutes: -primary.overlapMinutes,
      requiredBufferMinutes: REQUIRED_BUFFER_FOR_DECISIONS,
    };
  }
  return null;
}

/**
 * "Move it to tomorrow" does what it says: the task is planned for the next
 * logical day. It only applies to a task the current verdict still recommends,
 * so a stale screen can't move something that's no longer a candidate — or
 * anything due or overdue, which is never a candidate.
 */
export function approveDailyLoadMove(state: AppState, ctx: TransitionContext, taskId: string): AppState {
  if (latestTransitionDecision(state, ctx.today)) return state;

  const issues = todaysIssues(state, ctx.today);
  const window = decisionWindowFor(issues);
  const candidate = issues.focus?.candidates.find((c) => c.task.id === taskId);
  const task = state.tasks.find((t) => t.id === taskId);
  if (!candidate || !task || !window || task.status !== 'open') return state;

  const after: TaskPlan = { kind: 'day', date: addDays(ctx.today, 1) };
  const action: MoveTaskAction = {
    id: ctx.createId('act'),
    type: 'daily_load.move_task',
    logicalDate: ctx.today,
    createdAt: toInstant(ctx.nowMs),
    actor: 'user',
    source: 'her_keys_recommendation',
    approval: 'approved',
    targetId: task.id,
    reason: {
      code: 'transition_buffer_shortfall',
      windowBeforeEventId: window.windowBeforeEventId,
      windowAfterEventId: window.windowAfterEventId,
      bufferMinutes: window.bufferMinutes,
      projectedBufferMinutes: candidate.projectedBufferMinutes,
      requiredBufferMinutes: window.requiredBufferMinutes,
    },
    before: { plan: task.plan },
    after: { plan: after },
    scope: 'personal',
  };

  const moved: AppState = {
    ...state,
    tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, plan: after } : t)),
    actions: [...state.actions, action],
  };
  // The ledger holds her DECISION; the observation holds what became of the task: it was put off a day.
  return appendObservation(moved, ctx, {
    about: { kind: 'task', id: task.id },
    outcome: 'deferred',
    plannedDate: plannedDateOf(task, state.user.timezone),
    toDate: after.date,
  });
}

/**
 * Keeping the plan changes no facts, but it is still her decision for the day,
 * so it's recorded — for whatever timing verdict Today is showing, including a
 * travel-aware one and an overlap Her Keys offered to fix.
 */
export function keepDailyLoadPlan(state: AppState, ctx: TransitionContext, recommendedTaskId: string | null): AppState {
  if (latestTransitionDecision(state, ctx.today)) return state;

  const issues = todaysIssues(state, ctx.today);
  const window = decisionWindowFor(issues);
  if (!window) return state;

  const recommended =
    recommendedTaskId !== null && (issues.focus?.candidates.some((c) => c.task.id === recommendedTaskId) ?? false) ? recommendedTaskId : null;

  return { ...state, actions: [...state.actions, keepPlanRecord(ctx, window, recommended)] };
}

function keepPlanRecord(ctx: TransitionContext, window: DecisionWindow, recommendedTaskId: string | null): KeepPlanAction {
  return {
    id: ctx.createId('act'),
    type: 'daily_load.keep_plan',
    logicalDate: ctx.today,
    createdAt: toInstant(ctx.nowMs),
    actor: 'user',
    source: 'her_keys_recommendation',
    approval: 'declined',
    targetId: window.windowAfterEventId,
    reason: {
      code: 'transition_buffer_shortfall',
      windowBeforeEventId: window.windowBeforeEventId,
      windowAfterEventId: window.windowAfterEventId,
      bufferMinutes: window.bufferMinutes,
      requiredBufferMinutes: window.requiredBufferMinutes,
      recommendedTaskId,
    },
    scope: 'personal',
  };
}

const samePlan = (a: TaskPlan, b: TaskPlan) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The approved move that Undo may still reverse: only today's decision, only
 * while it is still the day's decision, and only while the item is exactly
 * where the move put it — still open or active, still flexible, and not
 * rescheduled since. Anything else would overwrite something newer.
 */
export function undoableMove(state: AppState, today: LocalDate): MoveTaskAction | MoveEventAction | null {
  const action = latestTransitionDecision(state, today);
  if (!action || action.type === 'daily_load.keep_plan') return null;

  if (action.type === 'daily_load.move_task') {
    const task = state.tasks.find((t) => t.id === action.targetId);
    const unchanged = task && task.status === 'open' && task.commitment === 'flexible' && samePlan(task.plan, action.after.plan);
    return unchanged ? action : null;
  }
  const event = state.events.find((e) => e.id === action.targetId);
  const unchanged =
    event &&
    event.status === 'active' &&
    event.commitment === 'flexible' &&
    event.startsAt === action.after.startsAt &&
    event.endsAt === action.after.endsAt;
  return unchanged ? action : null;
}

/**
 * Undo puts the item back and records that she kept the original plan, in the
 * same change — so Today stops describing a move that no longer stands, the
 * history keeps both decisions, and the day's one decision stays made.
 */
export function undoRecommendedMove(state: AppState, ctx: TransitionContext, actionId: string): AppState {
  const action = undoableMove(state, ctx.today);
  if (!action || action.id !== actionId) return state;

  const window: DecisionWindow = {
    windowBeforeEventId: action.reason.windowBeforeEventId,
    windowAfterEventId: action.reason.windowAfterEventId,
    bufferMinutes: action.reason.bufferMinutes,
    requiredBufferMinutes: action.reason.requiredBufferMinutes,
  };
  const now = toInstant(ctx.nowMs);

  if (action.type === 'daily_load.move_task') {
    return {
      ...state,
      tasks: state.tasks.map((t) => (t.id === action.targetId ? { ...t, plan: action.before.plan, updatedAt: now } : t)),
      actions: [...state.actions, keepPlanRecord(ctx, window, action.targetId)],
    };
  }
  return {
    ...state,
    events: state.events.map((e) => (e.id === action.targetId ? { ...e, ...action.before, updatedAt: now } : e)),
    actions: [...state.actions, keepPlanRecord(ctx, window, null)],
  };
}

/** A move followed, on the same day, by her decision to keep the plan was undone — the gate allows nothing else in between. */
export function moveWasUndone(state: AppState, move: MoveTaskAction | MoveEventAction): boolean {
  const index = state.actions.indexOf(move);
  return state.actions.some(
    (action, position) =>
      position > index &&
      action.type === 'daily_load.keep_plan' &&
      action.logicalDate === move.logicalDate &&
      action.reason.windowBeforeEventId === move.reason.windowBeforeEventId &&
      action.reason.windowAfterEventId === move.reason.windowAfterEventId
  );
}
