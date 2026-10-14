import { computeDailyLoad, listTransitionGaps } from '../../features/daily-load/computeDailyLoad';
import { CAPACITY_DAY_END_MINUTES, CAPACITY_DAY_START_MINUTES, assessDailyLoadIssues, type DailyLoadIssues } from '../dailyLoadIssues';
import { durationKnowledgeOf, type DurationKnowledge } from '../foundation/duration';
import type { LoadTier } from '../loadThresholds';
import { addDays, epochMsOf, logicalDateAt, toInstant, wallClockMinutesAt, zonedTimeToEpochMs, type LocalDate } from '../logicalDay';
import { projectStateDay } from '../projectDay';
import type { AppState, Task, TaskPlan } from '../state';
import { sha256Hex } from './sha256';

/**
 * PREMIUM DAILY LOAD v1 — the deterministic review.
 *
 * What it adds to the Free Daily Load (which names ONE verdict and offers a move to tomorrow): every genuine pressure on the day,
 * ranked, with the exact records responsible; an audit of which records Her Keys may and may not offer to move, and why; and, for a
 * flexible Her Keys task, alternative days that are each EVALUATED — the destination day is recomputed with the task on it, so one
 * day's overload is never "fixed" by blindly overloading another.
 *
 * Rules this module keeps:
 *  - DETERMINISTIC AND REPRODUCIBLE: no clock, no randomness, no AI. Same state in, same review out (ties broken by id).
 *  - NOTHING IS INVENTED: every number is read off a recomputation of the real day (before/after), never a formula's promise. A
 *    duration she never gave, a flexibility she never stated, and travel she never entered are named as assumptions.
 *  - ONLY HER KEYS' OWN, USER-CONTROLLED, NON-FIXED TASKS can be offered. Imported, automation-made, fixed, due-today, overdue,
 *    child, co-parenting, financial and high-consequence items are CONTEXT ONLY — shown, explained, never offered.
 *  - A PROPOSAL IS NOT AN ACTION. Applying one is a separate, user-approved step (`dailyLoadChange.ts`), which re-runs
 *    `evaluateMove` against the CURRENT state and refuses anything that is no longer exactly what was shown.
 */

export const REVIEW_HORIZON_DAYS = 7;
const BUFFER_AROUND_TIMED_TASK_MINUTES = 15;
const MAX_PROPOSALS = 3;

const TIER_RANK: Record<LoadTier, number> = { open: 0, tight: 1, overloaded: 2 };

export type PressureKind = 'overlap' | 'transition_conflict' | 'capacity_pressure' | 'tight_window' | 'overdue';

export interface RecordRef {
  kind: 'task' | 'event';
  id: string;
  title: string;
  minutes: number | null;
  /** True when `minutes` is an estimate (a default or an inference), not something she stated. */
  estimated: boolean;
}

export interface Pressure {
  id: string;
  kind: PressureKind;
  tier: LoadTier;
  /** The size of the problem in the unit its kind uses: minutes of overlap, minutes short, minutes over capacity, days overdue. */
  magnitude: number;
  responsible: RecordRef[];
  /** The numbers behind this pressure rest on at least one duration she never gave. */
  estimated: boolean;
}

export type IneligibleReason =
  | 'fixed'
  | 'not_open'
  | 'due_today_or_overdue'
  | 'imported'
  | 'automation_generated'
  | 'high_consequence'
  | 'child_obligation'
  | 'coparenting'
  | 'financial'
  | 'event_not_offered';

export interface ConsideredRecord {
  kind: 'task' | 'event';
  id: string;
  title: string;
  role: 'responsible' | 'movable' | 'context';
  /** Why it will not be offered; null when it may be. */
  notOfferedBecause: IneligibleReason | null;
}

export type AssumptionCode = 'flexible_by_default' | 'duration_estimated' | 'time_not_kept' | 'destination_gets_tighter';

export type EvidenceGapCode = 'travel_not_entered' | 'external_calendar_not_included' | 'durations_estimated';

export interface DayMetrics {
  date: LocalDate;
  tier: LoadTier;
  /** What the 6 AM–10 PM household day has left after every active event and the travel/preparation she entered. */
  availableMinutes: number;
  /** Every open, non-overdue task on the list for the day. */
  neededMinutes: number;
  /** needed − available, floored at 0. */
  capacityPressureMinutes: number;
  spareMinutes: number;
  /** The tightest transition between commitments, or null when the day has none. */
  tightestBufferMinutes: number | null;
}

export interface Improvement {
  tierBefore: LoadTier;
  tierAfter: LoadTier;
  capacityPressureBefore: number;
  capacityPressureAfter: number;
  bufferBefore: number | null;
  bufferAfter: number | null;
  /** The pressures this move genuinely eases, by recomputation. */
  eases: PressureKind[];
  /** After the move the day is no longer overloaded. */
  clearsOverload: boolean;
}

export type PlanValue = { kind: 'day'; date: LocalDate } | { kind: 'timed'; startsAt: string };

export interface RescheduleProposal {
  /** 64-hex identity of THIS move (task, from, to, source day): the ledger and the duplicate guard key on it. */
  digest: string;
  kind: 'reschedule_task';
  sourceDate: LocalDate;
  taskId: string;
  taskTitle: string;
  durationMinutes: number;
  durationKnowledge: DurationKnowledge;
  from: TaskPlan;
  to: PlanValue;
  toDate: LocalDate;
  timeKept: boolean;
  source: { before: DayMetrics; after: DayMetrics };
  destination: { before: DayMetrics; after: DayMetrics };
  improvement: Improvement;
  assumptions: AssumptionCode[];
  rank: number;
}

export type Outlook = 'clear' | 'pressure_with_proposals' | 'pressure_without_move';

export interface DailyLoadReview {
  date: LocalDate;
  outlook: Outlook;
  metrics: DayMetrics;
  pressures: Pressure[];
  proposals: RescheduleProposal[];
  considered: ConsideredRecord[];
  evidenceGaps: EvidenceGapCode[];
  /** Identity of the evidence this review rests on; a changed day yields a new one. */
  evidenceFingerprint: string;
}

export interface ReviewOptions {
  horizonDays?: number;
}

// ----------------------------------------------------------------------------------------------------------------------------
// Capacity (a differential twin of `detectCapacityPressure`, which only reports when there IS pressure; proven equal in tests)
// ----------------------------------------------------------------------------------------------------------------------------

function coveredMinutes(intervals: Array<[number, number]>, start: number, end: number): number {
  const clipped = intervals
    .map(([from, to]): [number, number] => [Math.max(from, start), Math.min(to, end)])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = start;
  for (const [from, to] of clipped) {
    const segmentStart = Math.max(from, cursor);
    if (to > segmentStart) {
      total += to - segmentStart;
      cursor = to;
    }
  }
  return total;
}

export function dayCapacity(state: AppState, date: LocalDate): { availableMinutes: number; neededMinutes: number } {
  const day = projectStateDay(state, date);
  const scheduled = coveredMinutes(day.events.map((event): [number, number] => [event.startMinutes, event.endMinutes]), CAPACITY_DAY_START_MINUTES, CAPACITY_DAY_END_MINUTES);
  const margin = day.events.reduce((sum, event) => sum + (event.travelMinutesBefore ?? 0) + (event.travelMinutesAfter ?? 0) + (event.preparationMinutes ?? 0), 0);
  const available = Math.max(0, CAPACITY_DAY_END_MINUTES - CAPACITY_DAY_START_MINUTES - scheduled - margin);
  const needed = day.tasks.filter((task) => task.daysOverdue === 0).reduce((sum, task) => sum + task.durationMinutes, 0);
  return { availableMinutes: available, neededMinutes: needed };
}

function issuesFor(state: AppState, date: LocalDate): { issues: DailyLoadIssues; bufferMinutes: number | null } {
  const day = projectStateDay(state, date);
  const assessment = computeDailyLoad(day.events, day.tasks);
  return { issues: assessDailyLoadIssues(day.events, day.tasks, assessment), bufferMinutes: assessment.gap === null ? null : assessment.bufferMinutes };
}

export function metricsOf(state: AppState, date: LocalDate): DayMetrics {
  const { issues, bufferMinutes } = issuesFor(state, date);
  const { availableMinutes, neededMinutes } = dayCapacity(state, date);
  return {
    date,
    tier: issues.tier,
    availableMinutes,
    neededMinutes,
    capacityPressureMinutes: Math.max(0, neededMinutes - availableMinutes),
    spareMinutes: availableMinutes - neededMinutes,
    tightestBufferMinutes: bufferMinutes,
  };
}

// ----------------------------------------------------------------------------------------------------------------------------
// Eligibility: which records may be OFFERED, and why not
// ----------------------------------------------------------------------------------------------------------------------------

export function ineligibleReason(state: AppState, task: Task, date: LocalDate): IneligibleReason | null {
  if (task.status !== 'open') return 'not_open';
  if (task.commitment === 'fixed') return 'fixed';
  if (task.dueDate !== null && task.dueDate <= date) return 'due_today_or_overdue';
  const producer = task.provenance.producer;
  if (producer === 'import-sync') return 'imported';
  if (producer === 'automation' || producer === 'system-derived') return 'automation_generated';
  if (task.consequence === 'high' || task.consequence === 'critical') return 'high_consequence';
  if (task.subjectMemberId !== null && state.children.some((child) => child.id === task.subjectMemberId)) return 'child_obligation';
  const category = state.categories.find((c) => c.id === task.categoryId);
  if (category?.systemRole === 'coparenting') return 'coparenting';
  if (category?.systemRole === 'money' || task.value !== null || task.paymentMechanism !== null) return 'financial';
  return null;
}

/** The destination days a task may legally go to, honouring every window she gave it. */
export function legalDestinations(state: AppState, task: Task, date: LocalDate, horizon: number): LocalDate[] {
  const tz = state.user.timezone;
  const out: LocalDate[] = [];
  for (let offset = 1; offset <= horizon; offset += 1) {
    const candidate = addDays(date, offset);
    if (task.dueDate !== null && candidate > task.dueDate) continue;
    if (task.dueAt !== null && candidate > logicalDateAt(epochMsOf(task.dueAt), tz)) continue;
    if (task.earliestStartAt !== null && candidate < logicalDateAt(epochMsOf(task.earliestStartAt), tz)) continue;
    if (task.latestFinishAt !== null && candidate > logicalDateAt(epochMsOf(task.latestFinishAt), tz)) continue;
    out.push(candidate);
  }
  return out;
}

const withPlan = (state: AppState, taskId: string, plan: TaskPlan): AppState => ({
  ...state,
  tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, plan } : task)),
});

/** Keep a timed task's clock time on the new day only if that slot is genuinely free; otherwise it keeps the day, not a time. */
function destinationPlan(state: AppState, task: Task, destination: LocalDate): { plan: PlanValue; timeKept: boolean } {
  if (task.plan.kind !== 'timed') return { plan: { kind: 'day', date: destination }, timeKept: false };
  const tz = state.user.timezone;
  const startMinutes = wallClockMinutesAt(epochMsOf(task.plan.startsAt), tz);
  const endMinutes = startMinutes + task.durationMinutes;
  const day = projectStateDay(state, destination);
  const clash =
    day.events.some((event) => event.startMinutes < endMinutes + BUFFER_AROUND_TIMED_TASK_MINUTES && event.endMinutes > startMinutes - BUFFER_AROUND_TIMED_TASK_MINUTES) ||
    day.tasks.some(
      (other) =>
        other.id !== task.id &&
        other.scheduledStartMinutes !== undefined &&
        other.scheduledStartMinutes < endMinutes + BUFFER_AROUND_TIMED_TASK_MINUTES &&
        other.scheduledStartMinutes + other.durationMinutes > startMinutes - BUFFER_AROUND_TIMED_TASK_MINUTES,
    );
  if (clash || endMinutes > 24 * 60) return { plan: { kind: 'day', date: destination }, timeKept: false };
  return { plan: { kind: 'timed', startsAt: toInstant(zonedTimeToEpochMs(destination, startMinutes, tz)) }, timeKept: true };
}

export const planKey = (plan: TaskPlan | PlanValue): string => (plan.kind === 'unplanned' ? 'unplanned' : plan.kind === 'day' ? `day:${plan.date}` : `timed:${plan.startsAt}`);

export const proposalDigest = (taskId: string, from: TaskPlan, to: PlanValue, sourceDate: LocalDate): string =>
  sha256Hex(`herkeys.premium.daily_load.reschedule.v1|${sourceDate}|${taskId}|${planKey(from)}|${planKey(to)}`);

/**
 * THE evaluation of one move: would moving this task from `date` to `destination` help the source day, and keep the destination
 * day acceptable? Both days are recomputed with the task on its new day. Returns null when the move is not offerable. Proposal
 * generation and apply-time revalidation both call exactly this, so what is applied is what the same logic would offer now.
 */
export function evaluateMove(state: AppState, taskId: string, date: LocalDate, destination: LocalDate, sourceBefore: DayMetrics = metricsOf(state, date)): RescheduleProposal | null {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (task === undefined || ineligibleReason(state, task, date) !== null) return null;
  if (!legalDestinations(state, task, date, REVIEW_HORIZON_DAYS * 4).includes(destination)) return null;
  // The task must actually be part of the source day (planned or timed there), or "moving" it changes nothing on that day.
  if (!projectStateDay(state, date).tasks.some((item) => item.id === taskId)) return null;

  const { plan, timeKept } = destinationPlan(state, task, destination);
  const moved = withPlan(state, task.id, plan);
  const sourceAfter = metricsOf(moved, date);
  const destBefore = metricsOf(state, destination);
  const destAfter = metricsOf(moved, destination);

  // Never trade one overloaded day for another: the destination must stay out of overload and out of capacity pressure.
  if (destBefore.tier === 'overloaded' || destAfter.tier === 'overloaded' || destAfter.capacityPressureMinutes > 0) return null;

  const eases: PressureKind[] = [];
  if (sourceAfter.capacityPressureMinutes < sourceBefore.capacityPressureMinutes) eases.push('capacity_pressure');
  if (sourceBefore.tightestBufferMinutes !== null && sourceAfter.tightestBufferMinutes !== null && sourceAfter.tightestBufferMinutes > sourceBefore.tightestBufferMinutes) {
    eases.push(sourceBefore.tier === 'overloaded' ? 'transition_conflict' : 'tight_window');
  }
  const tierImproved = TIER_RANK[sourceAfter.tier] < TIER_RANK[sourceBefore.tier];
  // Only a move the recomputed day actually supports is offered.
  if (eases.length === 0 && !tierImproved) return null;

  const knowledge = durationKnowledgeOf(task);
  const assumptions: AssumptionCode[] = ['flexible_by_default'];
  if (knowledge !== 'user-provided') assumptions.push('duration_estimated');
  if (task.plan.kind === 'timed' && !timeKept) assumptions.push('time_not_kept');
  if (destBefore.tier === 'open' && destAfter.tier === 'tight') assumptions.push('destination_gets_tighter');

  return {
    digest: proposalDigest(task.id, task.plan, plan, date),
    kind: 'reschedule_task',
    sourceDate: date,
    taskId: task.id,
    taskTitle: task.title,
    durationMinutes: task.durationMinutes,
    durationKnowledge: knowledge,
    from: task.plan,
    to: plan,
    toDate: destination,
    timeKept,
    source: { before: sourceBefore, after: sourceAfter },
    destination: { before: destBefore, after: destAfter },
    improvement: {
      tierBefore: sourceBefore.tier,
      tierAfter: sourceAfter.tier,
      capacityPressureBefore: sourceBefore.capacityPressureMinutes,
      capacityPressureAfter: sourceAfter.capacityPressureMinutes,
      bufferBefore: sourceBefore.tightestBufferMinutes,
      bufferAfter: sourceAfter.tightestBufferMinutes,
      eases,
      clearsOverload: sourceBefore.tier === 'overloaded' && sourceAfter.tier !== 'overloaded',
    },
    assumptions,
    rank: 0,
  };
}

// ----------------------------------------------------------------------------------------------------------------------------
// The review
// ----------------------------------------------------------------------------------------------------------------------------

const ref = (kind: 'task' | 'event', id: string, title: string, minutes: number | null, estimated: boolean): RecordRef => ({ kind, id, title, minutes, estimated });

/** Identity of the evidence a review of `date` rests on (structure only, never a title): the idempotency key's root. */
export function reviewEvidenceFingerprint(state: AppState, date: LocalDate): string {
  const day = projectStateDay(state, date);
  const parts = [
    ...day.events.map((e) => `e|${e.id}|${e.startMinutes}|${e.endMinutes}|${e.commitment}|${e.travelMinutesBefore ?? ''}|${e.travelMinutesAfter ?? ''}|${e.preparationMinutes ?? ''}`),
    ...day.tasks.map((t) => `t|${t.id}|${t.durationMinutes}|${t.commitment}|${t.dueToday ? 1 : 0}|${t.scheduledStartMinutes ?? ''}`),
  ].sort();
  return sha256Hex(`herkeys.premium.daily_load.evidence.v1|${date}|${state.user.timezone}|${parts.join(';')}`);
}

export function reviewDay(state: AppState, date: LocalDate, options: ReviewOptions = {}): DailyLoadReview {
  const horizon = options.horizonDays ?? REVIEW_HORIZON_DAYS;
  const day = projectStateDay(state, date);
  const { issues } = issuesFor(state, date);
  const before = metricsOf(state, date);
  const taskById = new Map(state.tasks.map((task) => [task.id, task]));
  const estimatedTask = (id: string): boolean => {
    const task = taskById.get(id);
    return task === undefined ? true : durationKnowledgeOf(task) !== 'user-provided';
  };

  // ---- 1. every genuine pressure, ranked (overlap > transition > capacity > tight > overdue) -----------------------------------
  const pressures: Pressure[] = [];
  for (const overlap of issues.overlaps) {
    pressures.push({
      id: `overlap:${overlap.eventAId}:${overlap.eventBId}`,
      kind: 'overlap',
      tier: 'overloaded',
      magnitude: overlap.overlapMinutes,
      responsible: [ref('event', overlap.eventAId, overlap.eventATitle, null, false), ref('event', overlap.eventBId, overlap.eventBTitle, null, false)],
      estimated: false,
    });
  }
  const gapTasks = (beforeId: string, afterId: string): RecordRef[] => {
    const gap = listTransitionGaps(day.events, day.tasks).find((g) => g.before.id === beforeId && g.after.id === afterId);
    // Largest first, then by id: the same day must read the same whatever order its records were stored in.
    return [...(gap?.tasksInWindow ?? [])]
      .sort((a, b) => b.durationMinutes - a.durationMinutes || a.id.localeCompare(b.id))
      .map((t) => ref('task', t.id, t.title, t.durationMinutes, estimatedTask(t.id)));
  };
  for (const issue of [issues.transitionConflict, issues.tightWindow]) {
    if (issue === null) continue;
    const tasks = gapTasks(issue.beforeEventId, issue.afterEventId);
    pressures.push({
      id: `${issue.kind}:${issue.beforeEventId}:${issue.afterEventId}`,
      kind: issue.kind,
      tier: issue.kind === 'transition_conflict' ? 'overloaded' : 'tight',
      magnitude: Math.max(0, issue.requiredBufferMinutes - issue.bufferMinutes),
      responsible: [ref('event', issue.beforeEventId, issue.beforeTitle, null, false), ref('event', issue.afterEventId, issue.afterTitle, null, false), ...tasks],
      estimated: tasks.some((t) => t.estimated),
    });
  }
  if (issues.capacityPressure !== null) {
    const demand = day.tasks
      .filter((t) => t.daysOverdue === 0)
      .sort((a, b) => b.durationMinutes - a.durationMinutes || a.id.localeCompare(b.id))
      .slice(0, 5)
      .map((t) => ref('task', t.id, t.title, t.durationMinutes, estimatedTask(t.id)));
    pressures.push({ id: 'capacity_pressure', kind: 'capacity_pressure', tier: 'overloaded', magnitude: issues.capacityPressure.pressureMinutes, responsible: demand, estimated: demand.some((d) => d.estimated) });
  }
  for (const overdue of issues.overdue) {
    pressures.push({ id: `overdue:${overdue.taskId}`, kind: 'overdue', tier: 'tight', magnitude: overdue.daysOverdue, responsible: [ref('task', overdue.taskId, overdue.taskTitle, null, false)], estimated: false });
  }
  const kindOrder: Record<PressureKind, number> = { overlap: 0, transition_conflict: 1, capacity_pressure: 2, tight_window: 3, overdue: 4 };
  pressures.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || b.magnitude - a.magnitude || a.id.localeCompare(b.id));

  // ---- 2. the audit: every record on the day, offerable or context-only -------------------------------------------------------
  const responsibleIds = new Set(pressures.flatMap((p) => p.responsible.map((r) => r.id)));
  const considered: ConsideredRecord[] = [];
  const eligibleTasks: Task[] = [];
  for (const item of day.tasks) {
    const task = taskById.get(item.id);
    if (task === undefined) continue;
    const reason = ineligibleReason(state, task, date);
    if (reason === null) eligibleTasks.push(task);
    considered.push({ kind: 'task', id: task.id, title: task.title, role: reason === null ? 'movable' : responsibleIds.has(task.id) ? 'responsible' : 'context', notOfferedBecause: reason });
  }
  for (const event of day.events) {
    // v1 offers Her Keys TASKS only. An event — fixed or flexible — is context: what the day is built around, never a move target.
    considered.push({
      kind: 'event',
      id: event.id,
      title: event.title,
      role: responsibleIds.has(event.id) ? 'responsible' : 'context',
      notOfferedBecause: event.commitment === 'fixed' ? 'fixed' : 'event_not_offered',
    });
  }
  considered.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  // ---- 3. evaluated alternatives ------------------------------------------------------------------------------------------------
  const proposals: RescheduleProposal[] = [];
  if (before.tier !== 'open' || pressures.length > 0) {
    for (const task of eligibleTasks) {
      const options_: RescheduleProposal[] = [];
      for (const destination of legalDestinations(state, task, date, horizon)) {
        const proposal = evaluateMove(state, task.id, date, destination, before);
        if (proposal !== null) options_.push(proposal);
      }
      // The best destination for THIS task: a day that stays easy (open beats tight), then the NEAREST such day — she should not
      // find an errand three days out merely because that day is emptier — then, only to break a tie, the one with more room.
      options_.sort(
        (a, b) =>
          TIER_RANK[a.destination.after.tier] - TIER_RANK[b.destination.after.tier] ||
          a.toDate.localeCompare(b.toDate) ||
          b.destination.after.spareMinutes - a.destination.after.spareMinutes,
      );
      if (options_.length > 0) proposals.push(options_[0]);
    }
  }
  // Across tasks: clear the overload first, then ease the most, then disturb the destination least, then deterministic ties.
  const eased = (p: RescheduleProposal) => p.improvement.capacityPressureBefore - p.improvement.capacityPressureAfter + Math.max(0, (p.improvement.bufferAfter ?? 0) - (p.improvement.bufferBefore ?? 0));
  proposals.sort(
    (a, b) =>
      Number(b.improvement.clearsOverload) - Number(a.improvement.clearsOverload) ||
      TIER_RANK[a.improvement.tierAfter] - TIER_RANK[b.improvement.tierAfter] ||
      eased(b) - eased(a) ||
      TIER_RANK[a.destination.after.tier] - TIER_RANK[b.destination.after.tier] ||
      a.toDate.localeCompare(b.toDate) ||
      a.taskId.localeCompare(b.taskId),
  );
  const top = proposals.slice(0, MAX_PROPOSALS).map((proposal, index) => ({ ...proposal, rank: index + 1 }));

  // ---- 4. what the review could not see ----------------------------------------------------------------------------------------
  const evidenceGaps: EvidenceGapCode[] = [];
  if (day.events.some((event) => event.location !== undefined && event.travelMinutesBefore === undefined && event.travelMinutesAfter === undefined)) evidenceGaps.push('travel_not_entered');
  if (day.tasks.some((task) => estimatedTask(task.id))) evidenceGaps.push('durations_estimated');
  // Always true, so always said: events from a connected Google Calendar are a read-only overlay outside the household's state.
  evidenceGaps.push('external_calendar_not_included');

  const outlook: Outlook = pressures.length === 0 && before.tier === 'open' ? 'clear' : top.length > 0 ? 'pressure_with_proposals' : 'pressure_without_move';
  return { date, outlook, metrics: before, pressures, proposals: top, considered, evidenceGaps, evidenceFingerprint: reviewEvidenceFingerprint(state, date) };
}
