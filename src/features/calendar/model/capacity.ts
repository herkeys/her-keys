import { assessDailyLoadIssues, type DailyLoadIssue, type DailyLoadIssues } from '../../../domain/dailyLoadIssues';
import { computeDailyLoad } from '../../daily-load/computeDailyLoad';
import type { CalendarEventItem, TaskItem } from '../../../types';
import { daysBetween } from './timeFrame';
import type { CapacityState, DayItem, EvidenceRef, MissingEvidence } from './types';

/**
 * CAPACITY IS THE FOUNDATION'S CLASSIFICATION, NOT CALENDAR'S.
 *
 * The tier, the verdict kind and every threshold (45 / 23 minutes, the 06:00-22:00 window) come
 * from `computeDailyLoad` / `assessDailyLoadIssues` unchanged. This module only (1) hands that
 * classifier truthful inputs — elapsed-minute coordinates instead of wall-clock ones — and
 * (2) records what the classification could not know.
 */

/** The foundation's day shape, from Calendar's instant-based items. Equal to `projectDay` on every non-DST day. */
export function foundationDayOf(items: DayItem[], date: string): { events: CalendarEventItem[]; tasks: TaskItem[] } {
  const events: CalendarEventItem[] = [];
  const tasks: TaskItem[] = [];

  for (const item of items) {
    if (item.ref.kind === 'event') {
      if (item.timing.kind !== 'timed') continue;
      events.push({
        id: item.ref.id,
        title: item.title,
        startMinutes: Math.round(item.timing.startMinute),
        endMinutes: Math.round(item.timing.endMinute),
        categoryId: item.source.categoryId,
        subjectMemberId: item.source.subjectMemberId,
        commitment: item.flexibility,
        ...(item.location !== null ? { location: item.location } : {}),
        ...(item.transition.travelBefore !== null ? { travelMinutesBefore: item.transition.travelBefore } : {}),
        ...(item.transition.travelAfter !== null ? { travelMinutesAfter: item.transition.travelAfter } : {}),
        ...(item.transition.preparation !== null ? { preparationMinutes: item.transition.preparation } : {}),
      });
      continue;
    }

    const dueDate = item.source.dueDate;
    tasks.push({
      id: item.ref.id,
      title: item.title,
      durationMinutes: item.source.rawDurationMinutes ?? 0,
      commitment: item.flexibility,
      dueToday: dueDate !== null && dueDate <= date,
      daysOverdue: dueDate !== null && dueDate < date ? daysBetween(dueDate, date) : 0,
      categoryId: item.source.categoryId,
      subjectMemberId: item.source.subjectMemberId,
      ...(item.timing.kind === 'timed' ? { scheduledStartMinutes: Math.round(item.timing.startMinute) } : {}),
    });
  }
  return { events, tasks };
}

export function assessFoundation(items: DayItem[], date: string): DailyLoadIssues {
  const { events, tasks } = foundationDayOf(items, date);
  return assessDailyLoadIssues(events, tasks, computeDailyLoad(events, tasks));
}

function evidenceRefsOf(primary: DailyLoadIssue | null): EvidenceRef[] {
  if (primary === null) return [];
  switch (primary.kind) {
    case 'overlap':
      return [{ kind: 'event', id: primary.eventAId }, { kind: 'event', id: primary.eventBId }];
    case 'transition_conflict':
    case 'tight_window':
      return [{ kind: 'event', id: primary.beforeEventId }, { kind: 'event', id: primary.afterEventId }];
    case 'capacity_pressure':
      return primary.largestTaskId === null ? [] : [{ kind: 'task', id: primary.largestTaskId }];
    case 'overdue':
      return [{ kind: 'task', id: primary.taskId }];
  }
}

/** One entry per canonical field that is null on one item, however many gaps it borders. */
const missingKey = (m: MissingEvidence): string => `${m.field}|${m.itemRef.kind}:${m.itemRef.id}|${m.reason}`;

export function dedupeMissing(entries: MissingEvidence[]): MissingEvidence[] {
  const seen = new Set<string>();
  const result: MissingEvidence[] = [];
  // Entries that know the other commitment of their transition come first, so that context is the one kept.
  const ordered = [...entries].sort((a, b) => Number(b.betweenWith !== null) - Number(a.betweenWith !== null));
  for (const entry of ordered) {
    const key = missingKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result.sort((a, b) => missingKey(a).localeCompare(missingKey(b)));
}

/**
 * The day's capacity outcome in the foundation's vocabulary.
 *
 * UNKNOWN CAN ONLY SHRINK CAPACITY, so `tight` and `overloaded` stand whatever is missing, while
 * `open` is a claim of room and is withheld — `null`, the foundation's "not known" — unless the
 * evidence behind it is complete. There is no unknown tier and none is invented.
 */
export function capacityStateOf(issues: DailyLoadIssues, missing: MissingEvidence[]): CapacityState {
  const incomplete = missing.length > 0;
  return {
    tier: issues.tier === 'open' && incomplete ? null : issues.tier,
    foundationTier: issues.tier,
    verdict: issues.primary?.kind ?? null,
    evidence: { status: incomplete ? 'insufficient' : 'complete', missing },
    evidenceRefs: evidenceRefsOf(issues.primary),
  };
}

