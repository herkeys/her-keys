import { assessDailyLoadIssues } from './dailyLoadIssues';
import { latestTransitionDecision } from './dailyLoadDecisions';
import type { TransitionContext } from './context';
import { addDays, epochMsOf, toInstant, wallClockMinutesAt, zonedTimeToEpochMs, type LocalDate } from './logicalDay';
import { computeDailyLoad } from '../features/daily-load/computeDailyLoad';
import { projectStateDay } from './projectDay';
import type {
  ActionRecord,
  AppState,
  DropTaskAction,
  KeepCapacityPlanAction,
  MoveEventAction,
  ProtectItemAction,
  ShortenTaskAction,
} from './state';

/**
 * The mutations behind Build 3's recommendation taxonomy: MOVE (for a
 * flexible event, alongside the existing task move), DROP, SHORTEN and
 * PROTECT. DELEGATE and REPLACE are not implemented — there is no
 * delegate-target concept and no alternative-item catalog to offer, and
 * faking either would mean claiming an execution capability Her Keys doesn't
 * have.
 *
 * Every function here re-validates against a freshly computed assessment of
 * the CURRENT state before doing anything, exactly like
 * `dailyLoadDecisions.ts` — a stale screen can never move, drop, shorten or
 * protect something that is no longer the live issue.
 */

const MINIMUM_TASK_MINUTES = 15;
const CAPACITY_ACTION_TYPES = new Set(['daily_load.drop_task', 'daily_load.shorten_task', 'daily_load.keep_capacity_plan']);

function assessToday(state: AppState, ctx: TransitionContext) {
  const day = projectStateDay(state, ctx.today);
  const assessment = computeDailyLoad(day.events, day.tasks);
  return { day, assessment, issues: assessDailyLoadIssues(day.events, day.tasks, assessment) };
}

/** One capacity-pressure decision per logical day, independent of the transition-buffer gate — they are different issues. */
function latestCapacityDecision(state: AppState, date: LocalDate): ActionRecord | null {
  for (let index = state.actions.length - 1; index >= 0; index--) {
    const action = state.actions[index];
    if (action.logicalDate === date && CAPACITY_ACTION_TYPES.has(action.type)) return action;
  }
  return null;
}

/**
 * Moves a FLEXIBLE event bounding today's tightest transition to the same
 * time tomorrow, preserving its duration exactly (DST-safe: the new start is
 * computed from tomorrow's wall clock, not by adding 24 hours). Shares the
 * existing transition-buffer gate with task moves — resolving the same
 * tightest-window issue with a different kind of item is still one decision.
 */
export function approveMoveEvent(state: AppState, ctx: TransitionContext, eventId: string): AppState {
  if (latestTransitionDecision(state, ctx.today)) return state;

  const { assessment } = assessToday(state, ctx);
  const { gap } = assessment;
  if (!gap || (eventId !== gap.beforeEventId && eventId !== gap.afterEventId)) return state;

  const event = state.events.find((e) => e.id === eventId);
  if (!event || event.status !== 'active' || event.commitment !== 'flexible') return state;

  const startMs = epochMsOf(event.startsAt);
  const endMs = epochMsOf(event.endsAt);
  const startMinutesOfDay = wallClockMinutesAt(startMs, state.user.timezone);
  const newStartMs = zonedTimeToEpochMs(addDays(ctx.today, 1), startMinutesOfDay, state.user.timezone);
  const newEndMs = newStartMs + (endMs - startMs);

  const after = { startsAt: toInstant(newStartMs), endsAt: toInstant(newEndMs) };
  const action: MoveEventAction = {
    id: ctx.createId('act'),
    type: 'daily_load.move_event',
    logicalDate: ctx.today,
    createdAt: toInstant(ctx.nowMs),
    actor: 'user',
    source: 'her_keys_recommendation',
    approval: 'approved',
    targetId: event.id,
    reason: {
      code: 'transition_buffer_shortfall',
      windowBeforeEventId: gap.beforeEventId,
      windowAfterEventId: gap.afterEventId,
      bufferMinutes: assessment.bufferMinutes,
      requiredBufferMinutes: assessment.requiredBufferMinutes,
    },
    before: { startsAt: event.startsAt, endsAt: event.endsAt },
    after,
    scope: 'personal',
  };

  return {
    ...state,
    events: state.events.map((e) => (e.id === event.id ? { ...e, ...after, updatedAt: toInstant(ctx.nowMs) } : e)),
    actions: [...state.actions, action],
  };
}

/** Archives the exact task the current capacity-pressure verdict names — never an arbitrary other flexible task. */
export function approveDropTask(state: AppState, ctx: TransitionContext, taskId: string): AppState {
  if (latestCapacityDecision(state, ctx.today)) return state;

  const { issues } = assessToday(state, ctx);
  const pressure = issues.capacityPressure;
  if (!pressure || pressure.largestTaskId !== taskId) return state;

  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== 'open') return state;

  const action: DropTaskAction = {
    id: ctx.createId('act'),
    type: 'daily_load.drop_task',
    logicalDate: ctx.today,
    createdAt: toInstant(ctx.nowMs),
    actor: 'user',
    source: 'her_keys_recommendation',
    approval: 'approved',
    targetId: task.id,
    reason: { code: 'capacity_pressure', totalAvailableMinutes: pressure.availableMinutes, totalFlexibleNeededMinutes: pressure.neededMinutes, shortfallMinutes: pressure.pressureMinutes },
    before: { status: 'open' },
    after: { status: 'archived' },
    scope: 'personal',
  };

  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status: 'archived', updatedAt: toInstant(ctx.nowMs) } : t)),
    actions: [...state.actions, action],
  };
}

/** Shortens the named task by exactly the shortfall the verdict reports, never below a 15-minute floor. */
export function approveShortenTask(state: AppState, ctx: TransitionContext, taskId: string): AppState {
  if (latestCapacityDecision(state, ctx.today)) return state;

  const { issues } = assessToday(state, ctx);
  const pressure = issues.capacityPressure;
  if (!pressure || pressure.largestTaskId !== taskId) return state;

  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== 'open') return state;

  const shortenedMinutes = Math.max(MINIMUM_TASK_MINUTES, task.durationMinutes - pressure.pressureMinutes);
  if (shortenedMinutes >= task.durationMinutes) return state;

  const action: ShortenTaskAction = {
    id: ctx.createId('act'),
    type: 'daily_load.shorten_task',
    logicalDate: ctx.today,
    createdAt: toInstant(ctx.nowMs),
    actor: 'user',
    source: 'her_keys_recommendation',
    approval: 'approved',
    targetId: task.id,
    reason: { code: 'capacity_pressure', totalAvailableMinutes: pressure.availableMinutes, totalFlexibleNeededMinutes: pressure.neededMinutes, shortfallMinutes: pressure.pressureMinutes },
    before: { durationMinutes: task.durationMinutes },
    after: { durationMinutes: shortenedMinutes },
    scope: 'personal',
  };

  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, durationMinutes: shortenedMinutes, updatedAt: toInstant(ctx.nowMs) } : t)),
    actions: [...state.actions, action],
  };
}

/** Declining changes no facts, but is still her decision for the day, so it's recorded — and it stops today's capacity verdict from being re-offered. */
export function keepCapacityPlan(state: AppState, ctx: TransitionContext): AppState {
  if (latestCapacityDecision(state, ctx.today)) return state;

  const { issues } = assessToday(state, ctx);
  const pressure = issues.capacityPressure;
  if (!pressure) return state;

  const action: KeepCapacityPlanAction = {
    id: ctx.createId('act'),
    type: 'daily_load.keep_capacity_plan',
    logicalDate: ctx.today,
    createdAt: toInstant(ctx.nowMs),
    actor: 'user',
    source: 'her_keys_recommendation',
    approval: 'declined',
    targetId: null,
    reason: {
      code: 'capacity_pressure',
      totalAvailableMinutes: pressure.availableMinutes,
      totalFlexibleNeededMinutes: pressure.neededMinutes,
      shortfallMinutes: pressure.pressureMinutes,
      consideredTaskId: pressure.largestTaskId,
    },
    scope: 'personal',
  };

  return { ...state, actions: [...state.actions, action] };
}

/**
 * PROTECT: converts a flexible task or event to fixed, so Her Keys never
 * again suggests moving, shortening or dropping it. Reversible only by
 * editing the item directly — there is no "unprotect" action, matching how
 * commitment is set anywhere else. A no-op if it's already fixed.
 */
export function approveProtectItem(
  state: AppState,
  ctx: TransitionContext,
  target: { targetType: 'task'; targetId: string } | { targetType: 'event'; targetId: string }
): AppState {
  const now = toInstant(ctx.nowMs);

  if (target.targetType === 'task') {
    const task = state.tasks.find((t) => t.id === target.targetId);
    if (!task || task.commitment !== 'flexible') return state;
    const action: ProtectItemAction = {
      id: ctx.createId('act'),
      type: 'daily_load.protect_item',
      logicalDate: ctx.today,
      createdAt: now,
      actor: 'user',
      source: 'her_keys_recommendation',
      approval: 'approved',
      targetType: 'task',
      targetId: task.id,
      reason: { code: 'user_requested_protection' },
      before: { commitment: 'flexible' },
      after: { commitment: 'fixed' },
      scope: 'personal',
    };
    return {
      ...state,
      tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, commitment: 'fixed', updatedAt: now } : t)),
      actions: [...state.actions, action],
    };
  }

  const event = state.events.find((e) => e.id === target.targetId);
  if (!event || event.commitment !== 'flexible') return state;
  const action: ProtectItemAction = {
    id: ctx.createId('act'),
    type: 'daily_load.protect_item',
    logicalDate: ctx.today,
    createdAt: now,
    actor: 'user',
    source: 'her_keys_recommendation',
    approval: 'approved',
    targetType: 'event',
    targetId: event.id,
    reason: { code: 'user_requested_protection' },
    before: { commitment: 'flexible' },
    after: { commitment: 'fixed' },
    scope: 'personal',
  };
  return {
    ...state,
    events: state.events.map((e) => (e.id === event.id ? { ...e, commitment: 'fixed', updatedAt: now } : e)),
    actions: [...state.actions, action],
  };
}
