import type { AppState, Task } from '../state';
import type { RebuildFocus, RebuildFocusLink } from './schema';

/**
 * Deterministic reads over RebuildFocus truth. Nothing here scores, ranks by importance, measures activity or looks at time passing.
 */

const STATE_ORDER: Record<RebuildFocus['state'], number> = { active: 0, paused: 1, archived: 2 };

/**
 * The Focuses shown on Me / Rebuild, in the one stable order (Addendum K): ACTIVE, then PAUSED; within each, oldest first, then by id.
 * Archived Focuses are not shown here — they stay canonical, and are simply off this surface. No title, activity, inferred importance
 * or number of linked Tasks ever changes the order.
 */
export function orderedFocuses(state: AppState): RebuildFocus[] {
  return state.rebuildFocuses
    .filter((focus) => focus.state !== 'archived')
    .sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
}

/** The live connections of one Focus, oldest first. A removed link is history, not a connection. */
export function liveLinksOf(state: AppState, focusId: string): RebuildFocusLink[] {
  return state.rebuildFocusLinks
    .filter((link) => link.focusId === focusId && link.status === 'active')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The OPEN next-action Tasks of a Focus. A completed or archived Task, a Task that no longer exists, and a removed link are all inert
 * here (Addenda N, O): only a live `next_action` link to a Task whose own status is `open` counts.
 */
export function openNextActions(state: AppState, focusId: string): Task[] {
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));
  const out: Task[] = [];
  for (const link of liveLinksOf(state, focusId)) {
    if (link.relation !== 'next_action' || link.target.kind !== 'task') continue;
    const task = tasks.get(link.target.id);
    if (task !== undefined && task.status === 'open') out.push(task);
  }
  return out;
}

export const hasOpenNextAction = (state: AppState, focusId: string): boolean => openNextActions(state, focusId).length > 0;
