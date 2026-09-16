import { computeDailyLoad } from '../features/daily-load/computeDailyLoad';
import type { DailyLoadDecision } from '../types';
import type { TransitionContext } from './context';
import { addDays, toInstant, type LocalDate } from './logicalDay';
import { projectStateDay } from './projectDay';
import type { ActionRecord, AppState, KeepPlanAction, MoveTaskAction, TaskPlan } from './state';

type DailyLoadTransitionAction = MoveTaskAction | KeepPlanAction;

/**
 * A Daily Load decision is stored as what she accepted — the task's new plan
 * plus a typed action record — never as the analysis that led to it. The
 * assessment is recomputed from the changed facts every time it's needed.
 */

export interface AppliedMove {
  taskTitle: string;
  currentBufferMinutes: number;
  projectedBufferMinutes: number;
  requiredBufferMinutes: number;
  resolvesShortfall: boolean;
  windowAfterTitle: string;
}

export interface DailyLoadDecisionView {
  decision: DailyLoadDecision;
  /** What Her Keys told her when she approved the move, as recorded at the time. */
  appliedMove: AppliedMove | null;
}

function isDailyLoadAction(action: ActionRecord): action is DailyLoadTransitionAction {
  return action.type === 'daily_load.move_task' || action.type === 'daily_load.keep_plan';
}

function latestDecision(state: AppState, date: LocalDate): DailyLoadTransitionAction | null {
  for (let index = state.actions.length - 1; index >= 0; index--) {
    const action = state.actions[index];
    if (action.logicalDate === date && isDailyLoadAction(action)) return action;
  }
  return null;
}

export function dailyLoadDecisionFor(state: AppState, date: LocalDate): DailyLoadDecisionView {
  const action = latestDecision(state, date);
  if (!action) return { decision: 'pending', appliedMove: null };
  if (action.type === 'daily_load.keep_plan') return { decision: 'kept', appliedMove: null };

  const { reason } = action;
  return {
    decision: 'moved',
    appliedMove: {
      taskTitle: state.tasks.find((task) => task.id === action.targetId)?.title ?? '',
      currentBufferMinutes: reason.bufferMinutes,
      projectedBufferMinutes: reason.projectedBufferMinutes,
      requiredBufferMinutes: reason.requiredBufferMinutes,
      resolvesShortfall: reason.projectedBufferMinutes >= reason.requiredBufferMinutes,
      windowAfterTitle: state.events.find((event) => event.id === reason.windowAfterEventId)?.title ?? '',
    },
  };
}

function assessToday(state: AppState, ctx: TransitionContext) {
  const day = projectStateDay(state, ctx.today);
  return computeDailyLoad(day.events, day.tasks);
}

/**
 * "Move it to tomorrow" does what it says: the task is planned for the next
 * logical day. It only applies to a task the current assessment still
 * recommends, so a stale screen can't move something that's no longer a
 * candidate — or anything due or overdue, which is never a candidate.
 */
export function approveDailyLoadMove(state: AppState, ctx: TransitionContext, taskId: string): AppState {
  if (latestDecision(state, ctx.today)) return state;

  const assessment = assessToday(state, ctx);
  const candidate = assessment.candidates.find((c) => c.task.id === taskId);
  const task = state.tasks.find((t) => t.id === taskId);
  if (!candidate || !task || !assessment.gap) return state;

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
      windowBeforeEventId: assessment.gap.beforeEventId,
      windowAfterEventId: assessment.gap.afterEventId,
      bufferMinutes: assessment.bufferMinutes,
      projectedBufferMinutes: candidate.projectedBufferMinutes,
      requiredBufferMinutes: assessment.requiredBufferMinutes,
    },
    before: { plan: task.plan },
    after: { plan: after },
    scope: 'personal',
  };

  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, plan: after } : t)),
    actions: [...state.actions, action],
  };
}

/** Keeping the plan changes no facts, but it is still her decision for the day, so it's recorded. */
export function keepDailyLoadPlan(state: AppState, ctx: TransitionContext, recommendedTaskId: string | null): AppState {
  if (latestDecision(state, ctx.today)) return state;

  const assessment = assessToday(state, ctx);
  if (!assessment.gap || assessment.status !== 'overloaded') return state;

  const recommended =
    recommendedTaskId !== null && assessment.candidates.some((c) => c.task.id === recommendedTaskId) ? recommendedTaskId : null;

  const action: KeepPlanAction = {
    id: ctx.createId('act'),
    type: 'daily_load.keep_plan',
    logicalDate: ctx.today,
    createdAt: toInstant(ctx.nowMs),
    actor: 'user',
    source: 'her_keys_recommendation',
    approval: 'declined',
    targetId: assessment.gap.afterEventId,
    reason: {
      code: 'transition_buffer_shortfall',
      windowBeforeEventId: assessment.gap.beforeEventId,
      windowAfterEventId: assessment.gap.afterEventId,
      bufferMinutes: assessment.bufferMinutes,
      requiredBufferMinutes: assessment.requiredBufferMinutes,
      recommendedTaskId: recommended,
    },
    scope: 'personal',
  };

  return { ...state, actions: [...state.actions, action] };
}
