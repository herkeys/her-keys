import type { TransitionContext } from './context';
import { toInstant, type LocalDate } from './logicalDay';
import type { AppState, Task, TaskPlan, VisibilityScope } from './state';

/**
 * Real task capture. A quick capture only needs a title and a category —
 * everything else defaults to something reasonable and can be filled in
 * later, so logging "Return library books" never requires a full form.
 */

const DEFAULT_TASK_DURATION_MINUTES = 15;

export interface AddTaskInput {
  title: string;
  categoryId: string;
  subjectMemberId?: string | null;
  durationMinutes?: number;
  commitment?: 'fixed' | 'flexible';
  dueDate?: LocalDate | null;
  plan?: TaskPlan;
  notes?: string | null;
  scope: VisibilityScope;
}

export function addTask(state: AppState, ctx: TransitionContext, input: AddTaskInput): AppState {
  const now = toInstant(ctx.nowMs);
  const task: Task = {
    id: ctx.createId('task'),
    title: input.title,
    categoryId: input.categoryId,
    subjectMemberId: input.subjectMemberId ?? null,
    durationMinutes: input.durationMinutes ?? DEFAULT_TASK_DURATION_MINUTES,
    commitment: input.commitment ?? 'flexible',
    dueDate: input.dueDate ?? null,
    plan: input.plan ?? { kind: 'unplanned' },
    notes: input.notes ?? null,
    status: 'open',
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    scope: input.scope,
  };
  return { ...state, tasks: [...state.tasks, task] };
}

const EDITABLE_TASK_FIELDS = ['title', 'categoryId', 'subjectMemberId', 'durationMinutes', 'commitment', 'dueDate', 'plan', 'notes'] as const;

export type UpdateTaskInput = Partial<Pick<Task, (typeof EDITABLE_TASK_FIELDS)[number]>>;

/**
 * Only the editable fields are taken from the patch, whatever else the caller
 * passed — an edit never rewrites a task's visibility scope, status or history.
 */
export function updateTask(state: AppState, ctx: TransitionContext, taskId: string, patch: UpdateTaskInput): AppState {
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current) return state;
  const edits = pickFields(patch, EDITABLE_TASK_FIELDS);
  return {
    ...state,
    tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...edits, updatedAt: toInstant(ctx.nowMs) } : task)),
  };
}

export function pickFields<T extends object, K extends keyof T>(patch: T, fields: readonly K[]): Partial<Pick<T, K>> {
  const picked: Partial<Pick<T, K>> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(patch, field) && patch[field] !== undefined) picked[field] = patch[field];
  }
  return picked;
}

export function completeTask(state: AppState, ctx: TransitionContext, taskId: string): AppState {
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current || current.status !== 'open') return state;
  const completedAt = toInstant(ctx.nowMs);
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, status: 'completed', completedAt, updatedAt: completedAt } : task
    ),
  };
}

/**
 * Intentional removal, kept rather than deleted: a past action record can
 * still name it. Only an open task can be removed — a completed one keeps its
 * completion (an archived task carries no completion time).
 */
export function archiveTask(state: AppState, ctx: TransitionContext, taskId: string): AppState {
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current || current.status !== 'open') return state;
  return {
    ...state,
    tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, status: 'archived', updatedAt: toInstant(ctx.nowMs) } : task)),
  };
}
