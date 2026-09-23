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
  /**
   * Open tasks per category id, counted from stored state rather than today's
   * slice. `tasks` above is only what today's projection includes, so a
   * category holding nothing but undated or future work looks empty there;
   * this is how a reading can tell "nothing is due" apart from "nothing
   * exists". Read by Home, whose fallback would otherwise talk about systems
   * while her list is not empty.
   */
  openTaskCounts: ReadonlyMap<string, number>;
}

/**
 * The Life screens that exist, keyed by the role they specialize in — never by what a household calls the category.
 *
 * `coparenting` joined in the F01-F13 integration (HK13-D10): Feature 07's logistics screen had no entry point anywhere (its ledger left
 * "register the route in the Life hub" to integration). A co-parenting record IS a record in the category whose role is `coparenting`
 * (src/features/coparent/identity.ts), so the category's row — in the household's own order, under the household's own name, gone
 * when the category is archived — is exactly the right entry. Its reading is the generic count of what is due and on today: no child,
 * place or time reaches the hub.
 */
export const LIFE_SCREEN_ROUTES: Partial<Record<SystemRole, string>> = {
  kids: '/life/kids',
  home: '/life/home',
  money: '/life/money',
  meals: '/life/meals',
  work: '/life/work',
  coparenting: '/life/coparent',
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
      return describeHome(tasks, inCategory(input.systems), input.openTaskCounts.get(category.id) ?? 0);
    case 'money':
      // `tasks` is TODAY's slice: "this week" would deny a bill due tomorrow (HK13-D23). Money Home says what is coming.
      return describeTasks(tasks, 'Nothing due today');
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
    const overdue = due.filter((t) => t.daysOverdue > 0).length;
    return { value: describeDue(due.length - overdue, overdue), needsAttention: true };
  }

  const scheduled = tasks.filter((t) => t.scheduledStartMinutes != null);
  if (scheduled.length > 0) {
    return { value: `${scheduled.length} scheduled, nothing due`, needsAttention: false };
  }

  return { value: emptyLabel, needsAttention: false };
}

/**
 * `dueToday` covers what is already overdue too, so the two are counted
 * apart. Announcing a task that was owed a fortnight ago as "due today"
 * misstates when it came due — and the category's own screen, reading the
 * same task, says "Overdue since Sep 1" right beside it.
 */
function describeDue(dueToday: number, overdue: number): string {
  if (overdue === 0) return dueToday === 1 ? '1 thing due today' : `${dueToday} things due today`;
  if (dueToday === 0) return overdue === 1 ? '1 thing overdue' : `${overdue} things overdue`;
  return `${dueToday} due today, ${overdue} overdue`;
}

/**
 * Home is the one category that falls back to describing its systems, so it
 * is the one that can change the subject. Today's slice leaves out everything
 * undated or still ahead, and "2 systems running" beside three untouched home
 * tasks answers a question she didn't ask while reading as reassurance — the
 * hub would call Home clear while her list is not. The open count decides:
 * systems are what's left to say only when nothing is actually on the list.
 */
function describeHome(tasks: TaskItem[], systems: HouseholdSystem[], openTasks: number): Reading {
  const fromTasks = describeTasks(tasks, '');
  if (fromTasks.needsAttention || fromTasks.value !== '') return fromTasks;

  if (openTasks > 0) {
    return { value: `${openTasks} on your list, nothing due`, needsAttention: false };
  }
  if (systems.length > 0) {
    return { value: systems.length === 1 ? '1 system running' : `${systems.length} systems running`, needsAttention: false };
  }
  // Her list, not her house: Her Keys has no way to know the home is fine.
  return { value: 'Nothing on your list', needsAttention: false };
}

/**
 * `meals` are the ACTIVE meal decisions from today on, soonest first. The row names the next one and nothing more: the last
 * entry's date would read as planning coverage ("planned through Friday") that a sparse plan does not have, and a blank plan is
 * described, never counted as a problem.
 */
function describeMeals(meals: Array<{ label: string }>): Reading {
  const next = meals[0];
  return { value: next ? `Next: ${next.label}` : 'No meals planned yet', needsAttention: false };
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
