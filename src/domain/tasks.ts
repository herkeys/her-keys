import type { TransitionContext } from './context';
import { emptyTaskFacets } from './foundation/commitment';
import type { Money } from './foundation/money';
import { provenanceFor, userProvenance, type Provenance } from './foundation/provenance';
import { toInstant, type LocalDate } from './logicalDay';
import { appendObservation, plannedDateOf } from './observations';
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
  /** Where this task really came from. Only a capture the user made is `user-action`, which is the default. */
  provenance?: Provenance;
  /** What it is worth, exactly. Unknown unless stated. */
  value?: Money | null;
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
    ...emptyTaskFacets(),
    value: input.value ?? null,
    provenance: provenanceFor(state.origin, input.provenance ?? userProvenance()),
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
  const updated = { ...current, ...edits, updatedAt: toInstant(ctx.nowMs) };
  const next = { ...state, tasks: state.tasks.map((task) => (task.id === taskId ? updated : task)) };

  // Moving something to a LATER day is a deferral. It is what she did to it, so it is hers.
  const from = plannedDateOf(current, state.user.timezone);
  const to = plannedDateOf(updated, state.user.timezone);
  if (current.status === 'open' && from !== null && to !== null && to > from) {
    return appendObservation(next, ctx, { about: { kind: 'task', id: taskId }, outcome: 'deferred', plannedDate: from, toDate: to });
  }
  return next;
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
  const next: AppState = {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, status: 'completed', completedAt, updatedAt: completedAt } : task
    ),
  };
  // `completedAt` is one mutable timestamp; the observation is the append-only fact that it happened.
  return appendObservation(next, ctx, {
    about: { kind: 'task', id: taskId },
    outcome: 'completed',
    plannedDate: plannedDateOf(current, state.user.timezone),
  });
}

/**
 * Intentional removal, kept rather than deleted: a past action record can
 * still name it. Only an open task can be removed — a completed one keeps its
 * completion (an archived task carries no completion time).
 */
export function archiveTask(state: AppState, ctx: TransitionContext, taskId: string): AppState {
  const current = state.tasks.find((task) => task.id === taskId);
  if (!current || current.status !== 'open') return state;
  const next: AppState = {
    ...state,
    tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, status: 'archived', updatedAt: toInstant(ctx.nowMs) } : task)),
  };
  return appendObservation(next, ctx, {
    about: { kind: 'task', id: taskId },
    outcome: 'cancelled',
    plannedDate: plannedDateOf(current, state.user.timezone),
  });
}
