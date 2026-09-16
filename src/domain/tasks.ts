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

export type UpdateTaskInput = Partial<
  Pick<Task, 'title' | 'categoryId' | 'subjectMemberId' | 'durationMinutes' | 'commitment' | 'dueDate' | 'plan' | 'notes'>
>;

export function updateTask(state: AppState, ctx: TransitionContext, taskId: string, patch: UpdateTaskInput): AppState {
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current) return state;
  return {
    ...state,
    tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...patch, updatedAt: toInstant(ctx.nowMs) } : task)),
  };
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

/** Intentional removal, kept rather than deleted: a past action record can still name it. */
export function archiveTask(state: AppState, ctx: TransitionContext, taskId: string): AppState {
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current || current.status === 'archived') return state;
  return {
    ...state,
    tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, status: 'archived', updatedAt: toInstant(ctx.nowMs) } : task)),
  };
}
