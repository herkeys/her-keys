import type { TransitionContext } from './context';
import { CAPACITY_DAY_END_MINUTES, CAPACITY_DAY_START_MINUTES } from './dailyLoadIssues';
import { provenanceFor, userProvenance, type Provenance } from './foundation/provenance';
import {
  findDependencyCycle,
  type CapacityProfile,
  type Dependency,
  type DependencyRelation,
  type Goal,
  type RecurrenceRule,
  type SystemStep,
} from './foundation/structure';
import { refExists, refKey, type ContentRefKind, type TypedRef } from './foundation/typedRef';
import { REQUIRED_TRANSITION_BUFFER_MINUTES } from '../features/daily-load/computeDailyLoad';
import { addDays, daysBetween, parseLocalDate, formatLocalDate, toInstant, weekdayOf, type LocalDate } from './logicalDay';
import { appendObservation } from './observations';
import type { AppState } from './state';

/**
 * Structure — dependencies, goals, recurrence, system steps, capacity.
 *
 * The four relations every future feature would otherwise reinvent, each with ONE
 * implementation. None is a scheduler: they hold the semantics a scheduler would read.
 */

const stamp = (state: AppState, provenance: Provenance = userProvenance()) => provenanceFor(state.origin, provenance);

// -------------------------------------------------------------- dependencies ---

export type DependencyRefusal = 'missing_endpoint' | 'self' | 'cycle' | 'duplicate';

/**
 * Record that `from` relates to `to`. Refused, not silently ignored, when an endpoint
 * does not exist, when it would make a thing depend on itself, when it would close a
 * cycle among `requires`/`part_of` edges, or when it is already recorded.
 */
export function addDependency(
  state: AppState,
  ctx: TransitionContext,
  input: { relation: DependencyRelation; from: TypedRef<ContentRefKind>; to: TypedRef<ContentRefKind>; provenance?: Provenance }
): { state: AppState; refusal: DependencyRefusal | null } {
  if (!refExists(state, input.from) || !refExists(state, input.to)) return { state, refusal: 'missing_endpoint' };
  if (refKey(input.from) === refKey(input.to)) return { state, refusal: 'self' };
  if (state.dependencies.some((d) => d.status === 'active' && d.relation === input.relation && refKey(d.from) === refKey(input.from) && refKey(d.to) === refKey(input.to))) {
    return { state, refusal: 'duplicate' };
  }

  const at = toInstant(ctx.nowMs);
  const edge: Dependency = {
    id: ctx.createId('dep'),
    relation: input.relation,
    from: input.from,
    to: input.to,
    status: 'active',
    createdAt: at,
    updatedAt: at,
    provenance: stamp(state, input.provenance),
    scope: 'personal',
  };
  if (findDependencyCycle([...state.dependencies, edge]) !== null) return { state, refusal: 'cycle' };
  return { state: { ...state, dependencies: [...state.dependencies, edge] }, refusal: null };
}

export function removeDependency(state: AppState, ctx: TransitionContext, id: string): AppState {
  const at = toInstant(ctx.nowMs);
  return { ...state, dependencies: state.dependencies.map((d) => (d.id === id && d.status === 'active' ? { ...d, status: 'removed', updatedAt: at } : d)) };
}

/** Whether a referenced thing is finished, in the way its kind finishes. */
export function isDone(state: AppState, ref: TypedRef): boolean {
  switch (ref.kind) {
    case 'task': return state.tasks.find((t) => t.id === ref.id)?.status === 'completed';
    case 'needsMe': return state.needsMe.find((n) => n.id === ref.id)?.status === 'resolved';
    case 'event': return state.events.find((e) => e.id === ref.id)?.status === 'removed';
    case 'goal': return state.goals.find((g) => g.id === ref.id)?.status === 'achieved';
    default: return false;
  }
}

/** What `ref` is still waiting on: the things it `requires` that are not done. */
export function blockersOf(state: AppState, ref: TypedRef): TypedRef[] {
  return state.dependencies
    .filter((d) => d.status === 'active' && d.relation === 'requires' && refKey(d.from) === refKey(ref))
    .map((d) => d.to)
    .filter((to) => !isDone(state, to));
}

export const isBlocked = (state: AppState, ref: TypedRef): boolean => blockersOf(state, ref).length > 0;

/** The steps of something, in the order they were added. */
export function stepsOf(state: AppState, parent: TypedRef): TypedRef[] {
  return state.dependencies.filter((d) => d.status === 'active' && d.relation === 'part_of' && refKey(d.to) === refKey(parent)).map((d) => d.from);
}

/** The lighter ways to satisfy something. */
export function alternativesTo(state: AppState, ref: TypedRef): TypedRef[] {
  return state.dependencies.filter((d) => d.status === 'active' && d.relation === 'alternative_to' && refKey(d.to) === refKey(ref)).map((d) => d.from);
}

// --------------------------------------------------------------------- goals ---

export function addGoal(
  state: AppState,
  ctx: TransitionContext,
  input: { title: string; targetDate?: LocalDate | null; categoryId?: string | null; catalogGoalId?: string | null; provenance?: Provenance }
): AppState {
  const at = toInstant(ctx.nowMs);
  const goal: Goal = {
    id: ctx.createId('goal'),
    title: input.title,
    status: 'active',
    targetDate: input.targetDate ?? null,
    categoryId: input.categoryId ?? null,
    catalogGoalId: input.catalogGoalId ?? null,
    createdAt: at,
    updatedAt: at,
    provenance: stamp(state, input.provenance),
    scope: 'personal',
  };
  return { ...state, goals: [...state.goals, goal] };
}

export function setGoalStatus(state: AppState, ctx: TransitionContext, id: string, status: Goal['status']): AppState {
  const goal = state.goals.find((g) => g.id === id);
  if (!goal || goal.status === status) return state;
  const next = { ...state, goals: state.goals.map((g) => (g.id === id ? { ...g, status, updatedAt: toInstant(ctx.nowMs) } : g)) };
  return status === 'achieved' || status === 'abandoned'
    ? appendObservation(next, ctx, { about: { kind: 'goal', id }, outcome: status === 'achieved' ? 'completed' : 'cancelled' })
    : next;
}

/** Progress is DERIVED from the steps: never stored on the goal, so it cannot disagree with them. */
export function goalProgress(state: AppState, goalId: string): { total: number; done: number; fraction: number | null } {
  const steps = stepsOf(state, { kind: 'goal', id: goalId });
  const done = steps.filter((step) => isDone(state, step)).length;
  return { total: steps.length, done, fraction: steps.length === 0 ? null : done / steps.length };
}

// ---------------------------------------------------------------- recurrence ---

export type RuleInput = Pick<RecurrenceRule, 'trigger' | 'frequency' | 'interval' | 'byWeekday' | 'byMonthDay' | 'anchorDate' | 'timeOfDayMinutes' | 'endsOn' | 'occurrenceCount'>;

/** One active rule per thing — a second would be two answers to "when does this happen?". */
export function addRecurrence(
  state: AppState,
  ctx: TransitionContext,
  about: TypedRef<RecurrenceRule['about']['kind']>,
  rule: Partial<RuleInput> & Pick<RuleInput, 'anchorDate'>,
  provenance?: Provenance
): AppState {
  if (!refExists(state, about)) return state;
  if (state.recurrences.some((r) => r.status === 'active' && refKey(r.about) === refKey(about))) return state;
  const at = toInstant(ctx.nowMs);
  const created: RecurrenceRule = {
    id: ctx.createId('rule'),
    about,
    trigger: rule.trigger ?? 'schedule',
    frequency: rule.frequency ?? (rule.trigger === 'manual' ? null : 'weekly'),
    interval: rule.interval ?? 1,
    byWeekday: rule.byWeekday ?? null,
    byMonthDay: rule.byMonthDay ?? null,
    anchorDate: rule.anchorDate,
    timeOfDayMinutes: rule.timeOfDayMinutes ?? null,
    timezone: state.user.timezone,
    endsOn: rule.endsOn ?? null,
    occurrenceCount: rule.occurrenceCount ?? null,
    status: 'active',
    createdAt: at,
    updatedAt: at,
    provenance: stamp(state, provenance),
    scope: 'personal',
  };
  return { ...state, recurrences: [...state.recurrences, created] };
}

export function setRecurrenceStatus(state: AppState, ctx: TransitionContext, id: string, status: RecurrenceRule['status']): AppState {
  return { ...state, recurrences: state.recurrences.map((r) => (r.id === id ? { ...r, status, updatedAt: toInstant(ctx.nowMs) } : r)) };
}

/** Days this rule falls on, from `from` (inclusive) up to `limit` occurrences or `until`. Pure calendar arithmetic; no scheduler. */
export function occurrencesOf(rule: Pick<RecurrenceRule, 'frequency' | 'interval' | 'byWeekday' | 'byMonthDay' | 'anchorDate' | 'endsOn' | 'occurrenceCount' | 'trigger'>, from: LocalDate, until: LocalDate): LocalDate[] {
  if (rule.trigger !== 'schedule' || rule.frequency === null) return [];
  const out: LocalDate[] = [];
  let produced = 0;
  const step = (date: LocalDate): boolean => {
    if (rule.endsOn !== null && date > rule.endsOn) return false;
    if (rule.occurrenceCount !== null && produced >= rule.occurrenceCount) return false;
    produced += 1;
    if (date >= from && date <= until) out.push(date);
    return true;
  };

  const anchor = parseLocalDate(rule.anchorDate);
  switch (rule.frequency) {
    case 'daily': {
      const firstIndex = rule.occurrenceCount === null
        ? Math.max(0, Math.ceil(daysBetween(rule.anchorDate, from) / rule.interval))
        : 0;
      produced = firstIndex;
      for (let i = firstIndex, d = addDays(rule.anchorDate, firstIndex * rule.interval); d <= until; i += 1, d = addDays(rule.anchorDate, i * rule.interval)) {
        if (!step(d)) break;
      }
      break;
    }
    case 'weekly': {
      const days = rule.byWeekday ?? [weekdayOf(rule.anchorDate)];
      // Walk week by week from the anchor's own week, so an interval keeps its phase.
      const weekStart = addDays(rule.anchorDate, -weekdayOf(rule.anchorDate));
      const firstWeekIndex = rule.occurrenceCount === null
        ? Math.max(0, Math.floor(daysBetween(weekStart, from) / (7 * rule.interval)))
        : 0;
      for (let i = firstWeekIndex, week = addDays(weekStart, firstWeekIndex * 7 * rule.interval); week <= until; i += 1, week = addDays(weekStart, i * 7 * rule.interval)) {
        for (const wd of [...days].sort((a, b) => a - b)) {
          const date = addDays(week, wd);
          if (date < rule.anchorDate) continue;
          if (!step(date)) return out;
        }
      }
      break;
    }
    case 'monthly': {
      const day = rule.byMonthDay ?? anchor.day;
      const fromParts = parseLocalDate(from);
      const monthsFromAnchor = (fromParts.year - anchor.year) * 12 + fromParts.month - anchor.month;
      const firstIndex = rule.occurrenceCount === null ? Math.max(0, Math.floor(monthsFromAnchor / rule.interval)) : 0;
      produced = firstIndex;
      for (let i = firstIndex, y = anchor.year, m = anchor.month; ; i += 1) {
        const months = m - 1 + i * rule.interval;
        const year = y + Math.floor(months / 12);
        const month = (months % 12) + 1;
        const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const date = formatLocalDate({ year, month, day: Math.min(day, last) });
        if (date > until) break;
        if (date >= rule.anchorDate && !step(date)) break;
      }
      break;
    }
    case 'yearly': {
      const firstIndex = rule.occurrenceCount === null
        ? Math.max(0, Math.floor((parseLocalDate(from).year - anchor.year) / rule.interval))
        : 0;
      produced = firstIndex;
      for (let i = firstIndex; ; i += 1) {
        const year = anchor.year + i * rule.interval;
        const last = new Date(Date.UTC(year, anchor.month, 0)).getUTCDate();
        const date = formatLocalDate({ year, month: anchor.month, day: Math.min(anchor.day, last) });
        if (date > until) break;
        if (!step(date)) break;
      }
      break;
    }
  }
  return out;
}

/**
 * The next occurrence on or after `from`, DERIVED — and skipping any day she recorded as
 * an exception (a `skipped` observation about the subject on that day). Nothing is stored:
 * a stored next-run would be a second copy of a fact that goes stale.
 */
export function nextOccurrence(state: AppState, rule: RecurrenceRule, from: LocalDate): LocalDate | null {
  if (rule.status !== 'active') return null;
  const skipped = new Set(
    state.observations
      .filter((o) => o.outcome === 'skipped' && o.about.kind === rule.about.kind && o.about.id === rule.about.id)
      .map((o) => o.plannedDate ?? o.logicalDate)
  );
  const skippedPeriods = skipped.size + 1;
  const periodDays = rule.frequency === 'daily'
    ? rule.interval
    : rule.frequency === 'weekly'
      ? 7 * rule.interval
      : rule.frequency === 'monthly'
        ? 31 * rule.interval
        : rule.frequency === 'yearly'
          ? 366 * rule.interval
          : 1;
  const horizon = addDays(from, periodDays * skippedPeriods);
  return occurrencesOf(rule, from, horizon).find((d) => !skipped.has(d)) ?? null;
}

/** An exception to the rule — this occurrence is skipped. History, not an edit to the rule. */
export function skipOccurrence(state: AppState, ctx: TransitionContext, about: TypedRef<'task' | 'system' | 'meal'>, occurrence: LocalDate): AppState {
  return appendObservation(state, ctx, { about, outcome: 'skipped', plannedDate: occurrence });
}

// --------------------------------------------------------------- system steps ---

export function addSystemStep(
  state: AppState,
  ctx: TransitionContext,
  systemId: string,
  input: { title: string; effortMinutes?: number | null }
): AppState {
  if (!state.systems.some((s) => s.id === systemId)) return state;
  const position = state.systemSteps.filter((s) => s.systemId === systemId).reduce((max, s) => Math.max(max, s.position), -1) + 1;
  const at = toInstant(ctx.nowMs);
  const step: SystemStep = {
    id: ctx.createId('step'),
    systemId,
    position,
    title: input.title,
    effortMinutes: input.effortMinutes ?? null,
    createdAt: at,
    updatedAt: at,
    provenance: stamp(state),
    scope: 'personal',
  };
  return { ...state, systemSteps: [...state.systemSteps, step] };
}

export const stepsInOrder = (state: Pick<AppState, 'systemSteps'>, systemId: string): SystemStep[] =>
  state.systemSteps.filter((s) => s.systemId === systemId).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

// ------------------------------------------------------------------ capacity ---

export interface CapacityWindow {
  dayStartMinutes: number;
  dayEndMinutes: number;
  transitionBufferMinutes: number;
}

/** The product defaults — the constants Daily Load has always used, now the FALLBACK rather than the only answer. */
export const DEFAULT_CAPACITY: CapacityWindow = {
  dayStartMinutes: CAPACITY_DAY_START_MINUTES,
  dayEndMinutes: CAPACITY_DAY_END_MINUTES,
  transitionBufferMinutes: REQUIRED_TRANSITION_BUFFER_MINUTES,
};

/** This household's capacity: its own overrides where it has set them, the defaults everywhere else. */
export function capacityWindowFor(state: Pick<AppState, 'capacity'>): CapacityWindow {
  const c = state.capacity;
  return {
    dayStartMinutes: c?.dayStartMinutes ?? DEFAULT_CAPACITY.dayStartMinutes,
    dayEndMinutes: c?.dayEndMinutes ?? DEFAULT_CAPACITY.dayEndMinutes,
    transitionBufferMinutes: c?.transitionBufferMinutes ?? DEFAULT_CAPACITY.transitionBufferMinutes,
  };
}

export function setCapacity(
  state: AppState,
  ctx: TransitionContext,
  overrides: Partial<Pick<CapacityProfile, 'dayStartMinutes' | 'dayEndMinutes' | 'transitionBufferMinutes'>>
): AppState {
  const at = toInstant(ctx.nowMs);
  const current = state.capacity;
  const next: CapacityProfile = {
    dayStartMinutes: current?.dayStartMinutes ?? null,
    dayEndMinutes: current?.dayEndMinutes ?? null,
    transitionBufferMinutes: current?.transitionBufferMinutes ?? null,
    ...overrides,
    createdAt: current?.createdAt ?? at,
    updatedAt: at,
    provenance: current?.provenance ?? stamp(state),
    scope: 'personal',
  };
  return { ...state, capacity: next };
}
