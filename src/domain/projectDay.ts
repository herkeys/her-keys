import type { CalendarEventItem, TaskItem } from '../types';
import {
  addDays,
  epochMsOf,
  logicalDateAt,
  wallClockMinutesAt,
  zonedTimeToEpochMs,
  type LocalDate,
} from './logicalDay';
import type { AppState } from './state';

export interface DayView {
  date: LocalDate;
  events: CalendarEventItem[];
  tasks: TaskItem[];
}

type ScheduleSource = Pick<AppState, 'events' | 'tasks'> & { timeZone: string };

/**
 * One logical day, in the minutes-after-midnight shape the Daily Load engine,
 * the timeline and life status already understand. The stored facts are dated
 * instants; this is the only place they're turned into "today".
 *
 * - An event is on the day when any part of it is; parts outside the day are
 *   clipped to midnight.
 * - A task is on the day when it's due by then (overdue counts as due), or
 *   planned for that day, or timed on that day.
 */
export function projectDay(source: ScheduleSource, date: LocalDate): DayView {
  const { timeZone } = source;
  const dayStart = zonedTimeToEpochMs(date, 0, timeZone);
  const dayEnd = zonedTimeToEpochMs(addDays(date, 1), 0, timeZone);

  const events: CalendarEventItem[] = [];
  for (const event of source.events) {
    const start = epochMsOf(event.startsAt);
    const end = epochMsOf(event.endsAt);
    if (start >= dayEnd || end <= dayStart) continue;

    events.push({
      id: event.id,
      title: event.title,
      startMinutes: start <= dayStart ? 0 : wallClockMinutesAt(start, timeZone),
      endMinutes: end >= dayEnd ? 24 * 60 : wallClockMinutesAt(end, timeZone),
      categoryId: event.categoryId,
      subjectMemberId: event.subjectMemberId,
      ...(event.location !== null ? { location: event.location } : {}),
    });
  }

  const tasks: TaskItem[] = [];
  for (const task of source.tasks) {
    const due = task.dueDate !== null && task.dueDate <= date;
    const plan = task.plan;
    const timedToday = plan.kind === 'timed' && logicalDateAt(epochMsOf(plan.startsAt), timeZone) === date;
    const plannedToday = plan.kind === 'day' && plan.date === date;
    if (!due && !timedToday && !plannedToday) continue;

    tasks.push({
      id: task.id,
      title: task.title,
      durationMinutes: task.durationMinutes,
      commitment: task.commitment,
      dueToday: due,
      categoryId: task.categoryId,
      subjectMemberId: task.subjectMemberId,
      ...(timedToday && plan.kind === 'timed' ? { scheduledStartMinutes: wallClockMinutesAt(epochMsOf(plan.startsAt), timeZone) } : {}),
    });
  }

  return { date, events, tasks };
}

export function projectStateDay(state: AppState, date: LocalDate): DayView {
  return projectDay({ events: state.events, tasks: state.tasks, timeZone: state.user.timezone }, date);
}
