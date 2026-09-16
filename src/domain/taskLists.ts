import { epochMsOf, logicalDateAt, type LocalDate } from './logicalDay';
import type { AppState, HouseholdCategory, SystemRole, Task } from './state';

/**
 * Where every open task can be found. Today and Daily Load only ever read
 * today's slice; these lists are the rest of the picture, so a task saved
 * without a date, with a later date, or in a category that has no screen of
 * its own is never out of reach.
 *
 * - A category whose role has its own Life screen (and is active) lists all
 *   of its open tasks there.
 * - Every other open task is listed under "Other open tasks" on the Life hub.
 */

/** The Life screens that list their category's tasks. */
export const TASK_LIST_ROLES: readonly SystemRole[] = ['kids', 'home', 'money', 'work'];

export type TaskStanding = 'overdue' | 'due_today' | 'today' | 'upcoming' | 'unscheduled';

export interface OpenTaskEntry {
  task: Task;
  standing: TaskStanding;
  /** The date the standing is about: the due date, or the planned or timed day. Null when nothing dates the task. */
  date: LocalDate | null;
}

const STANDING_ORDER: Record<TaskStanding, number> = { overdue: 0, due_today: 1, today: 2, upcoming: 3, unscheduled: 4 };

function plannedDate(task: Task, timeZone: string): LocalDate | null {
  if (task.plan.kind === 'day') return task.plan.date;
  if (task.plan.kind === 'timed') return logicalDateAt(epochMsOf(task.plan.startsAt), timeZone);
  return null;
}

/**
 * The first three standings are exactly the tasks today's projection
 * includes; `upcoming` and `unscheduled` are the ones it leaves out.
 */
export function describeOpenTask(task: Task, today: LocalDate, timeZone: string): OpenTaskEntry {
  const due = task.dueDate;
  const planned = plannedDate(task, timeZone);
  if (due !== null && due < today) return { task, standing: 'overdue', date: due };
  if (due === today) return { task, standing: 'due_today', date: due };
  if (planned === today) return { task, standing: 'today', date: planned };

  const later = [due, planned].filter((date): date is LocalDate => date !== null && date > today).sort()[0];
  if (later) return { task, standing: 'upcoming', date: later };

  // What's left is undated, or planned for a day that has already passed.
  return { task, standing: 'unscheduled', date: planned };
}

function compareText(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareEntries(a: OpenTaskEntry, b: OpenTaskEntry): number {
  const byStanding = STANDING_ORDER[a.standing] - STANDING_ORDER[b.standing];
  if (byStanding !== 0) return byStanding;
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? -1 : 1;
  }
  return compareText(a.task.title, b.task.title) || compareText(a.task.id, b.task.id);
}

/** Whether a category's open tasks are listed on its own Life screen. */
export function hasOwnTaskList(category: HouseholdCategory): boolean {
  return category.status === 'active' && category.systemRole !== null && TASK_LIST_ROLES.includes(category.systemRole);
}

type TaskListSource = Pick<AppState, 'tasks' | 'categories' | 'user'>;

/** Every open task in one category: overdue first, then due today, on today, upcoming, and undated last. */
export function openTasksInCategory(state: TaskListSource, categoryId: string, today: LocalDate): OpenTaskEntry[] {
  return state.tasks
    .filter((task) => task.status === 'open' && task.categoryId === categoryId)
    .map((task) => describeOpenTask(task, today, state.user.timezone))
    .sort(compareEntries);
}

/** Every open task no category screen lists — "Other open tasks" on the Life hub. */
export function openTasksWithoutList(state: TaskListSource, today: LocalDate): OpenTaskEntry[] {
  const listed = new Set(state.categories.filter(hasOwnTaskList).map((category) => category.id));
  return state.tasks
    .filter((task) => task.status === 'open' && !listed.has(task.categoryId))
    .map((task) => describeOpenTask(task, today, state.user.timezone))
    .sort(compareEntries);
}
