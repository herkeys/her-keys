import type { HouseholdCategory, HouseholdSystem, SystemRole } from '../../domain/state';
import type { CalendarEventItem, TaskItem } from '../../types';
import { formatTime } from '../daily-load/computeDailyLoad';

export interface LifeCategoryStatus {
  key: string;
  /** The household's own name for the category — presentation only. */
  label: string;
  systemRole: SystemRole | null;
  value: string;
  needsAttention: boolean;
  /** The Life screen for this category, if one exists yet. */
  route: string | null;
}

export type ShownLifeStatus = LifeCategoryStatus & { route: string };

export interface LifeStatusInput {
  /** Active categories, in the household's order. */
  categories: HouseholdCategory[];
  events: CalendarEventItem[];
  tasks: TaskItem[];
  systems: HouseholdSystem[];
  upcomingMeals: Array<{ label: string; categoryId: string }>;
}

/** The Life screens that exist, keyed by the role they specialize in — never by what a household calls the category. */
const LIFE_SCREEN_ROUTES: Partial<Record<SystemRole, string>> = {
  kids: '/life/kids',
  home: '/life/home',
  money: '/life/money',
  meals: '/life/meals',
  work: '/life/work',
};

/**
 * A one-line state for every active category, derived from the same day the
 * rest of the app reads, so the Today summary and the Life hub can never drift
 * from each other — or from what actually happened when the user moved
 * something.
 *
 * Categories with a known role get the specialized reading their Life screen
 * has always shown. Any other category — a household's own "Pets", say — is
 * summarized generically from its commitments; Her Keys doesn't pretend to
 * understand it more deeply than that. A category only "needs you" when
 * something in it is genuinely due today.
 */
export function deriveLifeStatus(input: LifeStatusInput): LifeCategoryStatus[] {
  return input.categories.map((category) => ({
    key: category.id,
    label: category.name,
    systemRole: category.systemRole,
    route: category.systemRole ? LIFE_SCREEN_ROUTES[category.systemRole] ?? null : null,
    ...describeCategory(category, input),
  }));
}

/**
 * What the Life hub and Today list for now: categories that have a Life screen.
 * Others are summarized but not yet shown — rendering them needs design work
 * that is out of scope while the visual direction is under review.
 */
export function shownOnLife(statuses: LifeCategoryStatus[]): ShownLifeStatus[] {
  return statuses.filter((status): status is ShownLifeStatus => status.route !== null);
}

export function clearCount(statuses: LifeCategoryStatus[]): number {
  return statuses.filter((s) => !s.needsAttention).length;
}

type Reading = { value: string; needsAttention: boolean };

function describeCategory(category: HouseholdCategory, input: LifeStatusInput): Reading {
  const inCategory = <T extends { categoryId: string }>(items: T[]) => items.filter((item) => item.categoryId === category.id);
  const tasks = inCategory(input.tasks);

  switch (category.systemRole) {
    case 'kids':
      return describeTasks(tasks, 'Nothing due');
    case 'home':
      return describeHome(tasks, inCategory(input.systems));
    case 'money':
      return describeTasks(tasks, 'Nothing due this week');
    case 'meals':
      return describeMeals(inCategory(input.upcomingMeals));
    case 'work':
      return describeWork(inCategory(input.events));
    default:
      return describeCommitments(tasks, inCategory(input.events));
  }
}

function describeTasks(tasks: TaskItem[], emptyLabel: string): Reading {
  const due = tasks.filter((t) => t.dueToday);
  if (due.length > 0) {
    return { value: due.length === 1 ? '1 thing due today' : `${due.length} things due today`, needsAttention: true };
  }

  const scheduled = tasks.filter((t) => t.scheduledStartMinutes != null);
  if (scheduled.length > 0) {
    return { value: `${scheduled.length} scheduled, nothing due`, needsAttention: false };
  }

  return { value: emptyLabel, needsAttention: false };
}

function describeHome(tasks: TaskItem[], systems: HouseholdSystem[]): Reading {
  const fromTasks = describeTasks(tasks, '');
  if (fromTasks.needsAttention || fromTasks.value !== '') return fromTasks;
  return { value: `${systems.length} systems running`, needsAttention: false };
}

function describeMeals(meals: Array<{ label: string }>): Reading {
  const last = meals[meals.length - 1];
  return { value: last ? `Planned through ${last.label}` : 'Nothing planned', needsAttention: false };
}

function describeWork(events: CalendarEventItem[]): Reading {
  if (events.length === 0) return { value: 'Nothing on the calendar', needsAttention: false };
  const lastEnd = Math.max(...events.map((e) => e.endMinutes));
  return { value: `Clear after ${formatTime(lastEnd)}`, needsAttention: false };
}

/** A category Her Keys has no specialized understanding of: count what's due and what's on today. */
function describeCommitments(tasks: TaskItem[], events: CalendarEventItem[]): Reading {
  const due = describeTasks(tasks, '');
  if (due.needsAttention) return due;

  const onToday = events.length + tasks.filter((t) => t.scheduledStartMinutes != null).length;
  if (onToday > 0) return { value: onToday === 1 ? '1 thing today' : `${onToday} things today`, needsAttention: false };
  return { value: 'Nothing today', needsAttention: false };
}
