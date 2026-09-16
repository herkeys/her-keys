import type { CalendarEventItem, DailyLoadAssessment, TaskItem } from '../types';
import { loadTierForBuffer, type LoadTier } from './loadTier';

/**
 * Real-life issue detection, layered on top of `computeDailyLoad` without
 * changing it. Vocabulary is fixed at `open` / `tight` / `overloaded` (the
 * same `LoadTier` Build 2 already established) — new issue kinds map onto it
 * rather than inventing new status words. Priority when more than one issue
 * is true at once, highest first, with a documented tie-break inside each
 * detector (earliest start time, then id): direct overlap, transition
 * conflict, capacity pressure, tight window, overdue.
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
  availableMinutes: number;
  neededMinutes: number;
  pressureMinutes: number;
  largestTaskId: string | null;
  largestTaskTitle: string | null;
}

export interface OverdueTaskIssue {
  kind: 'overdue';
  taskId: string;
  taskTitle: string;
  daysOverdue: number;
}

export type DailyLoadIssue = DirectOverlapIssue | TransitionConflictIssue | CapacityPressureIssue | TightWindowIssue | OverdueTaskIssue;

/** Two FIXED commitments whose ranges intersect — nothing here can be safely automated, so this is a notice, never a recommendation. */
export function detectOverlaps(events: CalendarEventItem[]): DirectOverlapIssue[] {
  const fixed = [...events]
    .filter((event) => event.commitment === 'fixed')
    .sort((a, b) => a.startMinutes - b.startMinutes || a.id.localeCompare(b.id));

  const issues: DirectOverlapIssue[] = [];
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      const a = fixed[i];
      const b = fixed[j];
      const overlapMinutes = Math.min(a.endMinutes, b.endMinutes) - Math.max(a.startMinutes, b.startMinutes);
      if (overlapMinutes > 0) {
        issues.push({ kind: 'overlap', eventAId: a.id, eventATitle: a.title, eventBId: b.id, eventBTitle: b.title, overlapMinutes });
      }
    }
  }
  return issues;
}

function travelFootprint(events: CalendarEventItem[], beforeEventId: string, afterEventId: string): number {
  const before = events.find((event) => event.id === beforeEventId);
  const after = events.find((event) => event.id === afterEventId);
  return (before?.travelMinutesAfter ?? 0) + (after?.travelMinutesBefore ?? 0) + (after?.preparationMinutes ?? 0);
}

/**
 * The raw-gap read (unchanged from `computeDailyLoad`, task time only) and a
 * separate travel-aware read, kept distinct per instruction. Travel/prep
 * minutes are only ever what she entered — never invented — so this never
 * fires unless a real value is present, and only when it changes the tier:
 * a gap that is already overloaded on task time alone doesn't get a second,
 * redundant travel-aware issue.
 */
export function detectTransitionIssues(
  events: CalendarEventItem[],
  assessment: DailyLoadAssessment
): Array<TransitionConflictIssue | TightWindowIssue> {
  const { gap } = assessment;
  if (!gap) return [];

  const issues: Array<TransitionConflictIssue | TightWindowIssue> = [];
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

  const travelMinutesUsed = travelFootprint(events, gap.beforeEventId, gap.afterEventId);
  if (travelMinutesUsed > 0) {
    const travelAwareBuffer = assessment.bufferMinutes - travelMinutesUsed;
    if (rawTier !== 'overloaded' && loadTierForBuffer(travelAwareBuffer) === 'overloaded') {
      issues.push({
        kind: 'transition_conflict',
        source: 'travel_aware',
        ...shared,
        bufferMinutes: travelAwareBuffer,
        requiredBufferMinutes: assessment.requiredBufferMinutes,
        travelMinutesUsed,
      });
    }
  }

  return issues;
}

function clipToWindow(startMinutes: number, endMinutes: number, windowStart: number, windowEnd: number): number {
  return Math.max(0, Math.min(endMinutes, windowEnd) - Math.max(startMinutes, windowStart));
}

/**
 * Whether today's flexible workload fits in what the day actually has left,
 * inside the fixed household day window, after fixed commitments (and their
 * own entered travel/prep) are subtracted. Overdue tasks are deliberately
 * excluded from demand — an overdue item is its own issue (below), never
 * folded into whether today has room. Needs Me items never enter this math
 * at all: an inbox that makes the day look worse is one she'll stop using.
 */
export function detectCapacityPressure(events: CalendarEventItem[], tasks: TaskItem[]): CapacityPressureIssue | null {
  const dayWindowMinutes = CAPACITY_DAY_END_MINUTES - CAPACITY_DAY_START_MINUTES;

  const committedMinutes = events
    .filter((event) => event.commitment === 'fixed')
    .reduce((sum, event) => {
      const scheduled = clipToWindow(event.startMinutes, event.endMinutes, CAPACITY_DAY_START_MINUTES, CAPACITY_DAY_END_MINUTES);
      const margin = (event.travelMinutesBefore ?? 0) + (event.travelMinutesAfter ?? 0) + (event.preparationMinutes ?? 0);
      return sum + scheduled + margin;
    }, 0);
  const availableMinutes = Math.max(0, dayWindowMinutes - committedMinutes);

  const flexibleDemand = tasks.filter((task) => task.commitment === 'flexible' && !task.dueToday && task.daysOverdue === 0);
  const neededMinutes = flexibleDemand.reduce((sum, task) => sum + task.durationMinutes, 0);
  const pressureMinutes = neededMinutes - availableMinutes;
  if (pressureMinutes <= 0) return null;

  const largest = [...flexibleDemand].sort((a, b) => b.durationMinutes - a.durationMinutes || a.id.localeCompare(b.id))[0] ?? null;
  return {
    kind: 'capacity_pressure',
    availableMinutes,
    neededMinutes,
    pressureMinutes,
    largestTaskId: largest?.id ?? null,
    largestTaskTitle: largest?.title ?? null,
  };
}

/** Reporting only — an overdue task is never, by itself, a movable recommendation (its exclusion from capacity math and from `computeDailyLoad`'s candidates already guarantees that). */
export function detectOverdueTasks(tasks: TaskItem[]): OverdueTaskIssue[] {
  return tasks
    .filter((task) => task.daysOverdue > 0)
    .map((task) => ({ kind: 'overdue' as const, taskId: task.id, taskTitle: task.title, daysOverdue: task.daysOverdue }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.taskId.localeCompare(b.taskId));
}

export interface DailyLoadIssues {
  primary: DailyLoadIssue | null;
  tier: LoadTier;
  overlaps: DirectOverlapIssue[];
  transitionConflict: TransitionConflictIssue | null;
  tightWindow: TightWindowIssue | null;
  capacityPressure: CapacityPressureIssue | null;
  overdue: OverdueTaskIssue[];
}

/** The single verdict Today shows. Everything else detected is still available for the Handled ledger and tests, but only `primary` is ever surfaced as "the" issue — Her Keys shows one thing at a time. */
export function assessDailyLoadIssues(events: CalendarEventItem[], tasks: TaskItem[], assessment: DailyLoadAssessment): DailyLoadIssues {
  const overlaps = detectOverlaps(events);
  const transitions = detectTransitionIssues(events, assessment);
  const transitionConflict = transitions.find((issue): issue is TransitionConflictIssue => issue.kind === 'transition_conflict') ?? null;
  const tightWindow = transitions.find((issue): issue is TightWindowIssue => issue.kind === 'tight_window') ?? null;
  const capacityPressure = detectCapacityPressure(events, tasks);
  const overdue = detectOverdueTasks(tasks);

  const primary: DailyLoadIssue | null = overlaps[0] ?? transitionConflict ?? capacityPressure ?? tightWindow ?? overdue[0] ?? null;
  const tier: LoadTier = overlaps.length > 0 || transitionConflict || capacityPressure ? 'overloaded' : tightWindow ? 'tight' : 'open';

  return { primary, tier, overlaps, transitionConflict, tightWindow, capacityPressure, overdue };
}
