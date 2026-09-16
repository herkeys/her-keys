import {
  isMovable,
  listTransitionGaps,
  rankMoveCandidates,
  REQUIRED_TRANSITION_BUFFER_MINUTES,
  shortfallReason,
  type TransitionGap,
} from '../features/daily-load/computeDailyLoad';
import type { CalendarEventItem, CommitmentType, DailyLoadAssessment, DailyLoadRecommendation, TaskItem } from '../types';
import { loadTierForBuffer, type LoadTier } from './loadThresholds';

/**
 * Real-life issue detection, layered on top of `computeDailyLoad`. Vocabulary
 * is fixed at `open` / `tight` / `overloaded` (the same `LoadTier` Build 2
 * established) — new issue kinds map onto it rather than inventing new status
 * words. Priority when more than one issue is true at once, highest first,
 * with a documented tie-break inside each detector (earliest start time, then
 * id): direct overlap, transition conflict, capacity pressure, tight window,
 * overdue.
 */

/** The household's usable day, for capacity math only — a fixed, documented, tested boundary, not a per-item guess. */
export const CAPACITY_DAY_START_MINUTES = 6 * 60;
export const CAPACITY_DAY_END_MINUTES = 22 * 60;

export interface DirectOverlapIssue {
  kind: 'overlap';
  eventAId: string;
  eventATitle: string;
  eventBId: string;
  eventBTitle: string;
  overlapMinutes: number;
  eventACommitment: CommitmentType;
  eventBCommitment: CommitmentType;
  /**
   * The one flexible side Her Keys may offer to move. Null when both are
   * fixed (nothing can be safely automated) or both are flexible (Her Keys
   * doesn't pick between two of her own choices) — then it is a notice only.
   */
  movableEventId: string | null;
}

export interface TransitionConflictIssue {
  kind: 'transition_conflict';
  /** `raw` reads straight off the scheduled-task buffer, exactly as `computeDailyLoad` reports it. `travel_aware` is a separate calculation that only exists because she entered travel/prep minutes on one of the two commitments. */
  source: 'raw' | 'travel_aware';
  beforeEventId: string;
  beforeTitle: string;
  afterEventId: string;
  afterTitle: string;
  bufferMinutes: number;
  requiredBufferMinutes: number;
  travelMinutesUsed: number;
}

export interface TightWindowIssue {
  kind: 'tight_window';
  beforeEventId: string;
  beforeTitle: string;
  afterEventId: string;
  afterTitle: string;
  bufferMinutes: number;
  requiredBufferMinutes: number;
}

export interface CapacityPressureIssue {
  kind: 'capacity_pressure';
  /** What the 6 AM–10 PM window has left after every active event and the travel/preparation she entered for each. */
  availableMinutes: number;
  /** Every open task on today's list except overdue ones — due today or planned for today, fixed or flexible. */
  neededMinutes: number;
  pressureMinutes: number;
  /** The largest task Her Keys may offer to drop or shorten: flexible and not due today. Null when nothing qualifies — then it is a notice only. */
  largestTaskId: string | null;
  largestTaskTitle: string | null;
  largestTaskMinutes: number | null;
}

export interface OverdueTaskIssue {
  kind: 'overdue';
  taskId: string;
  taskTitle: string;
  daysOverdue: number;
}

export type DailyLoadIssue = DirectOverlapIssue | TransitionConflictIssue | CapacityPressureIssue | TightWindowIssue | OverdueTaskIssue;

const byStartThenId = (a: CalendarEventItem, b: CalendarEventItem) =>
  a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes || a.id.localeCompare(b.id);

const commitmentOf = (event: CalendarEventItem): CommitmentType => (event.commitment === 'flexible' ? 'flexible' : 'fixed');

/**
 * Any two of today's commitments whose ranges intersect. Two fixed ones are a
 * notice — nothing there can be safely automated. When exactly one side is
 * flexible, that side is the move Her Keys can offer.
 */
export function detectOverlaps(events: CalendarEventItem[]): DirectOverlapIssue[] {
  const ordered = [...events].sort(byStartThenId);

  const issues: DirectOverlapIssue[] = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i];
      const b = ordered[j];
      const overlapMinutes = Math.min(a.endMinutes, b.endMinutes) - Math.max(a.startMinutes, b.startMinutes);
      if (overlapMinutes <= 0) continue;
      const eventACommitment = commitmentOf(a);
      const eventBCommitment = commitmentOf(b);
      const movableEventId =
        eventACommitment === eventBCommitment ? null : eventACommitment === 'flexible' ? a.id : b.id;
      issues.push({
        kind: 'overlap',
        eventAId: a.id,
        eventATitle: a.title,
        eventBId: b.id,
        eventBTitle: b.title,
        overlapMinutes,
        eventACommitment,
        eventBCommitment,
        movableEventId,
      });
    }
  }
  return issues;
}

function travelFootprint(before: CalendarEventItem, after: CalendarEventItem): number {
  return (before.travelMinutesAfter ?? 0) + (after.travelMinutesBefore ?? 0) + (after.preparationMinutes ?? 0);
}

/**
 * The raw-gap read (unchanged from `computeDailyLoad`, task time only) and a
 * separate travel-aware read, kept distinct. Travel/prep minutes are only ever
 * what she entered — never invented — so the travel-aware read never fires
 * without a real value. It looks at every transition of the day, not just the
 * tightest raw one, and only reports a transition that her entered travel
 * pushes into overloaded; a transition already overloaded on task time alone
 * doesn't get a second, redundant travel-aware issue.
 */
export function detectTransitionIssues(
  events: CalendarEventItem[],
  assessment: DailyLoadAssessment,
  tasks: TaskItem[] = []
): Array<TransitionConflictIssue | TightWindowIssue> {
  const issues: Array<TransitionConflictIssue | TightWindowIssue> = [];
  const { gap } = assessment;

  if (gap) {
    const rawTier = loadTierForBuffer(assessment.bufferMinutes);
    const shared = { beforeEventId: gap.beforeEventId, beforeTitle: gap.beforeTitle, afterEventId: gap.afterEventId, afterTitle: gap.afterTitle };
    if (rawTier === 'overloaded') {
      issues.push({
        kind: 'transition_conflict',
        source: 'raw',
        ...shared,
        bufferMinutes: assessment.bufferMinutes,
        requiredBufferMinutes: assessment.requiredBufferMinutes,
        travelMinutesUsed: 0,
      });
    } else if (rawTier === 'tight') {
      issues.push({ kind: 'tight_window', ...shared, bufferMinutes: assessment.bufferMinutes, requiredBufferMinutes: assessment.requiredBufferMinutes });
    }
  }

  let worst: { gap: TransitionGap; bufferMinutes: number; travelMinutesUsed: number } | null = null;
  for (const candidate of listTransitionGaps(events, tasks)) {
    const travelMinutesUsed = travelFootprint(candidate.before, candidate.after);
    if (travelMinutesUsed <= 0 || loadTierForBuffer(candidate.bufferMinutes) === 'overloaded') continue;
    const bufferMinutes = candidate.bufferMinutes - travelMinutesUsed;
    if (loadTierForBuffer(bufferMinutes) !== 'overloaded') continue;
    // Gaps come in day order, so on a tie the earlier transition is kept.
    if (!worst || bufferMinutes < worst.bufferMinutes) worst = { gap: candidate, bufferMinutes, travelMinutesUsed };
  }
  if (worst) {
    issues.push({
      kind: 'transition_conflict',
      source: 'travel_aware',
      beforeEventId: worst.gap.before.id,
      beforeTitle: worst.gap.before.title,
      afterEventId: worst.gap.after.id,
      afterTitle: worst.gap.after.title,
      bufferMinutes: worst.bufferMinutes,
      requiredBufferMinutes: REQUIRED_TRANSITION_BUFFER_MINUTES,
      travelMinutesUsed: worst.travelMinutesUsed,
    });
  }

  return issues;
}

/** Total minutes the intervals cover inside [start, end], each minute counted once however many events share it. */
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

/**
 * Whether today's workload fits in what the day actually has left, inside the
 * fixed household day window. Available time is the window minus every active
 * event (fixed or flexible — both are on her calendar today) and the travel
 * and preparation she entered for each. Demand is every open task on today's
 * list — due today or planned for today, fixed or flexible — except overdue
 * ones, which are their own issue (below). Needs Me items never enter this
 * math: an inbox that makes the day look worse is one she'll stop using.
 *
 * Only a flexible task that isn't due today is ever named as something to drop
 * or shorten. When the pressure is real but nothing qualifies, the issue is
 * still reported — as a notice with nothing to act on automatically.
 */
export function detectCapacityPressure(events: CalendarEventItem[], tasks: TaskItem[]): CapacityPressureIssue | null {
  const dayWindowMinutes = CAPACITY_DAY_END_MINUTES - CAPACITY_DAY_START_MINUTES;

  const scheduledMinutes = coveredMinutes(
    events.map((event): [number, number] => [event.startMinutes, event.endMinutes]),
    CAPACITY_DAY_START_MINUTES,
    CAPACITY_DAY_END_MINUTES
  );
  const marginMinutes = events.reduce(
    (sum, event) => sum + (event.travelMinutesBefore ?? 0) + (event.travelMinutesAfter ?? 0) + (event.preparationMinutes ?? 0),
    0
  );
  const availableMinutes = Math.max(0, dayWindowMinutes - scheduledMinutes - marginMinutes);

  const demand = tasks.filter((task) => task.daysOverdue === 0);
  const neededMinutes = demand.reduce((sum, task) => sum + task.durationMinutes, 0);
  const pressureMinutes = neededMinutes - availableMinutes;
  if (pressureMinutes <= 0) return null;

  const largest = demand.filter(isMovable).sort((a, b) => b.durationMinutes - a.durationMinutes || a.id.localeCompare(b.id))[0] ?? null;
  return {
    kind: 'capacity_pressure',
    availableMinutes,
    neededMinutes,
    pressureMinutes,
    largestTaskId: largest?.id ?? null,
    largestTaskTitle: largest?.title ?? null,
    largestTaskMinutes: largest?.durationMinutes ?? null,
  };
}

/** Reporting only — an overdue task is never, by itself, a movable recommendation (its exclusion from capacity math and from `computeDailyLoad`'s candidates already guarantees that). */
export function detectOverdueTasks(tasks: TaskItem[]): OverdueTaskIssue[] {
  return tasks
    .filter((task) => task.daysOverdue > 0)
    .map((task) => ({ kind: 'overdue' as const, taskId: task.id, taskTitle: task.title, daysOverdue: task.daysOverdue }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.taskId.localeCompare(b.taskId));
}

/**
 * What a transition verdict is about, and what could be done about it — the
 * same window the verdict names, whether it came from the raw read or the
 * travel-aware one. The card shows this and the approvals check against it,
 * so a recommendation can never point at a different gap than the verdict.
 */
export interface TransitionFocus {
  issue: TransitionConflictIssue | TightWindowIssue;
  windowStartMinutes: number;
  windowEndMinutes: number;
  /** Movable tasks scheduled in that window, largest first. */
  candidates: DailyLoadRecommendation[];
  /** Flexible events whose move would actually widen that window (an edge shared with another event wouldn't). */
  movableEventIds: string[];
}

function travelReason(bufferMinutes: number, travelMinutes: number): string {
  const shortfall = REQUIRED_TRANSITION_BUFFER_MINUTES - bufferMinutes;
  return `Counting the ${travelMinutes} minutes of travel and preparation you entered, ${bufferMinutes} minutes is ${shortfall} short of the ${REQUIRED_TRANSITION_BUFFER_MINUTES} Her Keys allows by default to get there unrushed.`;
}

function transitionFocusFor(
  events: CalendarEventItem[],
  tasks: TaskItem[],
  issue: TransitionConflictIssue | TightWindowIssue
): TransitionFocus | null {
  const gap = listTransitionGaps(events, tasks).find(
    (candidate) => candidate.before.id === issue.beforeEventId && candidate.after.id === issue.afterEventId
  );
  if (!gap) return null;

  const reason =
    issue.kind === 'transition_conflict' && issue.source === 'travel_aware'
      ? travelReason(issue.bufferMinutes, issue.travelMinutesUsed)
      : shortfallReason(issue.bufferMinutes);

  // Moving one event only widens the window if no other event shares that edge.
  const soleEdge = (event: CalendarEventItem, edge: 'start' | 'end') =>
    !events.some((other) =>
      other.id !== event.id &&
      (edge === 'start' ? other.endMinutes === gap.windowStart && other.startMinutes < gap.windowEnd : other.startMinutes === gap.windowEnd)
    );
  const movableEventIds = [
    ...(commitmentOf(gap.before) === 'flexible' && soleEdge(gap.before, 'start') ? [gap.before.id] : []),
    ...(commitmentOf(gap.after) === 'flexible' && soleEdge(gap.after, 'end') ? [gap.after.id] : []),
  ];

  return {
    issue,
    windowStartMinutes: gap.windowStart,
    windowEndMinutes: gap.windowEnd,
    candidates: rankMoveCandidates(gap, issue.bufferMinutes, reason),
    movableEventIds,
  };
}

export interface DailyLoadIssues {
  primary: DailyLoadIssue | null;
  tier: LoadTier;
  overlaps: DirectOverlapIssue[];
  transitionConflict: TransitionConflictIssue | null;
  tightWindow: TightWindowIssue | null;
  capacityPressure: CapacityPressureIssue | null;
  overdue: OverdueTaskIssue[];
  /** Set when the primary verdict is about a transition. */
  focus: TransitionFocus | null;
}

/** The single verdict Today shows. Everything else detected is still available for tests, but only `primary` is ever surfaced as "the" issue — Her Keys shows one thing at a time. */
export function assessDailyLoadIssues(events: CalendarEventItem[], tasks: TaskItem[], assessment: DailyLoadAssessment): DailyLoadIssues {
  const overlaps = detectOverlaps(events);
  const transitions = detectTransitionIssues(events, assessment, tasks);
  const transitionConflict = transitions.find((issue): issue is TransitionConflictIssue => issue.kind === 'transition_conflict') ?? null;
  const tightWindow = transitions.find((issue): issue is TightWindowIssue => issue.kind === 'tight_window') ?? null;
  const capacityPressure = detectCapacityPressure(events, tasks);
  const overdue = detectOverdueTasks(tasks);

  const primary: DailyLoadIssue | null = overlaps.at(0) ?? transitionConflict ?? capacityPressure ?? tightWindow ?? overdue.at(0) ?? null;
  const tier: LoadTier = overlaps.length > 0 || transitionConflict || capacityPressure ? 'overloaded' : tightWindow ? 'tight' : 'open';
  const focus =
    primary && (primary.kind === 'transition_conflict' || primary.kind === 'tight_window') ? transitionFocusFor(events, tasks, primary) : null;

  return { primary, tier, overlaps, transitionConflict, tightWindow, capacityPressure, overdue, focus };
}
