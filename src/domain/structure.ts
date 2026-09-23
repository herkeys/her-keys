import type { TransitionContext } from './context';
import { CAPACITY_DAY_END_MINUTES, CAPACITY_DAY_START_MINUTES } from './dailyLoadIssues';
import { provenanceFor, userProvenance, type Provenance } from './foundation/provenance';
import {
  findDependencyCycle,
  type CapacityProfile,
  type Dependency,
  type DependencyRefKind,
  type DependencyRelation,
  type Goal,
  type RecurrenceRule,
  type SystemStep,
} from './foundation/structure';
import { refExists, refKey, type TypedRef } from './foundation/typedRef';
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
  input: { relation: DependencyRelation; from: TypedRef<DependencyRefKind>; to: TypedRef<DependencyRefKind>; provenance?: Provenance }
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

/**
 * WHERE A REFERENCED THING STANDS — one vocabulary, derived from lifecycles that already exist.
 *
 *   satisfied    finished in the way its kind finishes (task completed, Needs Me resolved, goal achieved)
 *   pending      still live and unfinished
 *   unavailable  cannot be met as recorded, because the thing was set aside or is not there:
 *                  retired  task archived, event removed, goal abandoned — set aside, NOT finished
 *                  missing  no such row (state validation refuses a dangling edge; this is the defensive read)
 *
 * REMOVED != COMPLETED and MISSING != SATISFIED. An event has no way to be "done" — removal is the only terminal
 * state it has — so a removed event is `unavailable`, exactly as an archived task is. Nothing here changes a
 * dependency row: history is never rewritten to make a prerequisite look met (HA-009).
 */
export type Standing =
  | { standing: 'satisfied' }
  | { standing: 'pending' }
  | { standing: 'unavailable'; cause: 'retired' | 'missing' };

const SATISFIED: Standing = { standing: 'satisfied' };
const PENDING: Standing = { standing: 'pending' };
const RETIRED: Standing = { standing: 'unavailable', cause: 'retired' };
const MISSING: Standing = { standing: 'unavailable', cause: 'missing' };

export function standingOf(state: AppState, ref: TypedRef): Standing {
  switch (ref.kind) {
    case 'task': {
      const status = state.tasks.find((t) => t.id === ref.id)?.status;
      return status === undefined ? MISSING : status === 'completed' ? SATISFIED : status === 'archived' ? RETIRED : PENDING;
    }
    case 'needsMe': {
      const status = state.needsMe.find((n) => n.id === ref.id)?.status;
      return status === undefined ? MISSING : status === 'resolved' ? SATISFIED : PENDING;
    }
    case 'event': {
      const status = state.events.find((e) => e.id === ref.id)?.status;
      // An event never "completes": the calendar does not know whether it was attended. Removal is retirement.
      return status === undefined ? MISSING : status === 'removed' ? RETIRED : PENDING;
    }
    case 'goal': {
      const status = state.goals.find((g) => g.id === ref.id)?.status;
      return status === undefined ? MISSING : status === 'achieved' ? SATISFIED : status === 'abandoned' ? RETIRED : PENDING;
    }
    default:
      // A System or a Meal has no lifecycle, so it is never satisfied by anything but being there.
      return refExists(state, ref) ? PENDING : MISSING;
  }
}

/** Whether a referenced thing is finished, in the way its kind finishes. Removal and absence are not finishing. */
export function isDone(state: AppState, ref: TypedRef): boolean {
  return standingOf(state, ref).standing === 'satisfied';
}

const requiredBy = (state: AppState, ref: TypedRef): TypedRef[] =>
  state.dependencies
    .filter((d) => d.status === 'active' && d.relation === 'requires' && refKey(d.from) === refKey(ref))
    .map((d) => d.to);

/** What `ref` is still waiting on: the live prerequisites it `requires` that are not yet done. Never a retired or missing one. */
export function blockersOf(state: AppState, ref: TypedRef): TypedRef[] {
  return requiredBy(state, ref).filter((to) => standingOf(state, to).standing === 'pending');
}

/**
 * The prerequisites `ref` `requires` that can no longer be met as recorded: retired or missing. They are neither
 * satisfied nor something she can still wait for, so the honest answer is "review", and the correction is to retire the
 * edge (`removeDependency`) or replace what it needs.
 */
export function unavailablePrerequisitesOf(state: AppState, ref: TypedRef): Array<{ ref: TypedRef; cause: 'retired' | 'missing' }> {
  const out: Array<{ ref: TypedRef; cause: 'retired' | 'missing' }> = [];
  for (const to of requiredBy(state, ref)) {
    const standing = standingOf(state, to);
    if (standing.standing === 'unavailable') out.push({ ref: to, cause: standing.cause });
  }
  return out;
}

/** `ready`: every prerequisite is satisfied. `blocked`: something live is still pending. `needsReview`: nothing pending, but a prerequisite is gone. */
export type Readiness = 'ready' | 'blocked' | 'needsReview';

export function readinessOf(state: AppState, ref: TypedRef): Readiness {
  if (blockersOf(state, ref).length > 0) return 'blocked';
  return unavailablePrerequisitesOf(state, ref).length > 0 ? 'needsReview' : 'ready';
}

/** Conservative: only a fully satisfied set of prerequisites is ready. A retired prerequisite does not unlock anything. */
export const isBlocked = (state: AppState, ref: TypedRef): boolean => readinessOf(state, ref) !== 'ready';

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
export function goalProgress(state: AppState, goalId: string): { total: number; done: number; unavailable: number; fraction: number | null } {
  const steps = stepsOf(state, { kind: 'goal', id: goalId });
  const done = steps.filter((step) => isDone(state, step)).length;
  // A step that was set aside is not a step that was finished: it never counts as done, and it is said out loud.
  const unavailable = steps.filter((step) => standingOf(state, step).standing === 'unavailable').length;
  return { total: steps.length, done, unavailable, fraction: steps.length === 0 ? null : done / steps.length };
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
