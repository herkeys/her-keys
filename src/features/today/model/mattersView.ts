import { commitmentFacetsOf } from '../../../domain/foundation/commitment';
import { consequenceRank } from '../../../domain/foundation/authorization';
import { refKey, type TypedRef } from '../../../domain/foundation/typedRef';
import type { DayView } from '../../../domain/projectDay';
import type { AppState } from '../../../domain/state';
import { isBlocked } from '../../../domain/structure';
import type { CalendarEventItem, TaskItem } from '../../../types';
import { formatTime } from '../../daily-load/computeDailyLoad';
import { eventRoute, sourceOf, taskRoute } from './refs';
import type { MatterItem, MatterReason, MattersSection } from './types';

/**
 * WHAT MATTERS TODAY — not every event and every task.
 *
 * The full day lives behind "Everything today". This picks the few items that shape
 * the day, using only typed facts the household already holds, in a fixed and
 * explainable order:
 *
 *   1. the next commitment that has not yet ended (a calendar fact)
 *   2. tasks due today (a deadline), highest stated consequence first
 *   3. the remaining fixed commitments, in time order
 *   4. the remaining flexible commitments, in time order
 *
 * Anything already shown as needing her, and the One Move's own target, is left out:
 * the same thing is never said twice on one screen. Elapsed commitments are not
 * "what matters" any more, and are dropped by the clock alone — no product
 * classification is derived from the time of day.
 *
 * `null` when nothing is left to say. That is what lets a one-item day stay simple.
 */

export const FIRST_GLANCE_MATTERS = 3;

export function nextRemainingEvent(day: DayView, nowMinutes: number): CalendarEventItem | null {
  return remainingEvents(day, nowMinutes)[0] ?? null;
}

function remainingEvents(day: DayView, nowMinutes: number): CalendarEventItem[] {
  return day.events
    .filter((e) => e.endMinutes > nowMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes || a.id.localeCompare(b.id));
}

export function mattersSection(args: { state: AppState; day: DayView; nowMinutes: number; exclude: ReadonlySet<string> }): MattersSection | null {
  const { state, day, nowMinutes, exclude } = args;
  const remaining = remainingEvents(day, nowMinutes);
  const next = remaining[0] ?? null;

  const consequenceOf = (task: TaskItem): number => {
    const row = state.tasks.find((t) => t.id === task.id);
    const level = row ? commitmentFacetsOf({ kind: 'task', row }).consequence : null;
    return level === null ? -1 : consequenceRank(level);
  };
  // A task still waiting on something live is not yet hers to do — it does not belong among today's actionable matters.
  const dueTasks = day.tasks
    .filter((t) => t.dueToday && t.daysOverdue === 0 && !isBlocked(state, { kind: 'task', id: t.id }))
    .sort((a, b) => consequenceOf(b) - consequenceOf(a) || a.id.localeCompare(b.id));

  const ordered: Array<{ reason: MatterReason; event?: CalendarEventItem; task?: TaskItem }> = [];
  if (next) ordered.push({ reason: 'next_commitment', event: next });
  for (const task of dueTasks) ordered.push({ reason: 'due_today', task });
  for (const event of remaining) if (event !== next && event.commitment === 'fixed') ordered.push({ reason: 'fixed_commitment', event });
  for (const event of remaining) if (event !== next && event.commitment !== 'fixed') ordered.push({ reason: 'flexible_commitment', event });

  const candidates = ordered.filter((c) => !exclude.has(refKey(c.event ? { kind: 'event', id: c.event.id } : { kind: 'task', id: (c.task as TaskItem).id })));
  const anchors = candidates.slice(0, FIRST_GLANCE_MATTERS).map((c) => matterItem(state, c, next));
  if (anchors.length === 0) return null;
  return { anchors, moreCount: candidates.length - anchors.length };
}

function matterItem(state: AppState, c: { reason: MatterReason; event?: CalendarEventItem; task?: TaskItem }, next: CalendarEventItem | null): MatterItem {
  if (c.event) {
    const row = state.events.find((e) => e.id === c.event!.id);
    const source = row ? sourceOf(row) : null;
    const ref: TypedRef = { kind: 'event', id: c.event.id };
    return {
      ref,
      kind: 'event',
      title: c.event.title,
      timeLabel: formatTime(c.event.startMinutes),
      reason: c.reason,
      fixed: c.event.commitment === 'fixed',
      dueToday: false,
      isNext: next !== null && next.id === c.event.id,
      source: source && source.uncertain ? source : null,
      route: eventRoute(c.event.id),
    };
  }
  const task = c.task as TaskItem;
  const row = state.tasks.find((t) => t.id === task.id);
  const source = row ? sourceOf(row) : null;
  return {
    ref: { kind: 'task', id: task.id },
    kind: 'task',
    title: task.title,
    timeLabel: task.scheduledStartMinutes !== undefined ? formatTime(task.scheduledStartMinutes) : null,
    reason: c.reason,
    fixed: task.commitment === 'fixed',
    dueToday: task.dueToday,
    isNext: false,
    source: source && source.uncertain ? source : null,
    route: taskRoute(task.id),
  };
}
