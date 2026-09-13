import { weekMeals } from '../../data/seed/meals';
import { householdSystems } from '../../data/seed/systems';
import { formatTime } from '../daily-load/computeDailyLoad';
import type { CalendarEventItem, LifeDomain, TaskItem } from '../../types';

export interface LifeDomainStatus {
  key: LifeDomain;
  label: string;
  value: string;
  needsAttention: boolean;
  route: string;
}

/**
 * Derives a one-line state for each life domain from the same seeded schedule
 * the rest of the app reads, so the Today summary and the Life hub can never
 * drift from each other — or from what actually happened when the user moved
 * something.
 *
 * A domain only "needs you" when something in it is genuinely due today.
 */
export function deriveLifeStatus(events: CalendarEventItem[], tasks: TaskItem[]): LifeDomainStatus[] {
  return [
    { key: 'kids', label: 'Kids', route: '/life/kids', ...describeTasks(tasks, 'kids', 'Nothing due') },
    { key: 'home', label: 'Home', route: '/life/home', ...describeHome(tasks) },
    { key: 'money', label: 'Money', route: '/life/money', ...describeTasks(tasks, 'money', 'Nothing due this week') },
    { key: 'meals', label: 'Meals', route: '/life/meals', ...describeMeals() },
    { key: 'work', label: 'Work', route: '/life/work', ...describeWork(events) },
  ];
}

export function clearCount(statuses: LifeDomainStatus[]): number {
  return statuses.filter((s) => !s.needsAttention).length;
}

function describeTasks(
  tasks: TaskItem[],
  domain: LifeDomain,
  emptyLabel: string
): { value: string; needsAttention: boolean } {
  const mine = tasks.filter((t) => t.domain === domain);
  const due = mine.filter((t) => t.dueToday);
  if (due.length > 0) {
    return { value: due.length === 1 ? '1 thing due today' : `${due.length} things due today`, needsAttention: true };
  }

  const scheduled = mine.filter((t) => t.scheduledStartMinutes != null);
  if (scheduled.length > 0) {
    return { value: `${scheduled.length} scheduled, nothing due`, needsAttention: false };
  }

  return { value: emptyLabel, needsAttention: false };
}

function describeHome(tasks: TaskItem[]): { value: string; needsAttention: boolean } {
  const fromTasks = describeTasks(tasks, 'home', '');
  if (fromTasks.needsAttention || fromTasks.value !== '') return fromTasks;
  return { value: `${householdSystems.filter((s) => s.domain === 'home').length} systems running`, needsAttention: false };
}

function describeMeals(): { value: string; needsAttention: boolean } {
  const last = weekMeals[weekMeals.length - 1];
  return { value: last ? `Planned through ${last.day}` : 'Nothing planned', needsAttention: false };
}

function describeWork(events: CalendarEventItem[]): { value: string; needsAttention: boolean } {
  const work = events.filter((e) => e.category === 'work');
  if (work.length === 0) return { value: 'Nothing on the calendar', needsAttention: false };
  const lastEnd = Math.max(...work.map((e) => e.endMinutes));
  return { value: `Clear after ${formatTime(lastEnd)}`, needsAttention: false };
}
