import type { TransitionContext } from './context';
import { toInstant, type LocalDate } from './logicalDay';
import type { AppState, NeedsMeItem } from './state';
import { addTask, type AddTaskInput } from './tasks';

/**
 * The lowest-friction capture in the product: a title is enough to get
 * something out of her head and into Her Keys. Category and due date are
 * add-ons for later — classification never blocks capture.
 */

export function captureNeedsMeItem(
  state: AppState,
  ctx: TransitionContext,
  input: { title: string; dueDate?: LocalDate | null }
): AppState {
  const item: NeedsMeItem = {
    id: ctx.createId('needsme'),
    title: input.title,
    status: 'open',
    dueDate: input.dueDate ?? null,
    categoryId: null,
    createdAt: toInstant(ctx.nowMs),
    scope: 'personal',
  };
  return { ...state, needsMe: [...state.needsMe, item] };
}

/** Later classification — adding a category or a due date to something already captured. */
export function updateNeedsMeItem(
  state: AppState,
  itemId: string,
  patch: Partial<Pick<NeedsMeItem, 'title' | 'categoryId' | 'dueDate'>>
): AppState {
  const current = state.needsMe.find((item) => item.id === itemId);
  if (!current) return state;
  return { ...state, needsMe: state.needsMe.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) };
}

export function resolveNeedsMeItem(state: AppState, itemId: string): AppState {
  const current = state.needsMe.find((item) => item.id === itemId);
  if (!current || current.status === 'resolved') return state;
  return { ...state, needsMe: state.needsMe.map((item) => (item.id === itemId ? { ...item, status: 'resolved' } : item)) };
}

/**
 * Promoting turns a captured item into a real task in one change: the task
 * is added and the item resolved together, only when she saves the task. An
 * item is never marked resolved on the way to an editor she might leave.
 */
export function promoteNeedsMeItem(state: AppState, ctx: TransitionContext, itemId: string, task: AddTaskInput): AppState {
  return resolveNeedsMeItem(addTask(state, ctx, task), itemId);
}

/** The details a promotion starts from: whatever she already attached to the item. */
export function promotionDefaults(state: AppState, itemId: string): { title: string; dueDate: LocalDate | null; categoryId: string | null } | null {
  const item = state.needsMe.find((candidate) => candidate.id === itemId && candidate.status === 'open');
  return item ? { title: item.title, dueDate: item.dueDate, categoryId: item.categoryId } : null;
}
