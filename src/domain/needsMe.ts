import type { TransitionContext } from './context';
import { toInstant, type LocalDate } from './logicalDay';
import type { AppState, NeedsMeItem } from './state';

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
