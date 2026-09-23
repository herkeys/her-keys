import { categoryWithRole } from './categories';
import type { AppState } from './state';

/**
 * A co-parenting handoff is Feature 07's row: an event in the co-parenting category (F07 `isHandoff`). Moving it in Co-Parent moves
 * the repeat she recorded with it; a generic editor would move the event and leave the pattern behind. So Calendar, Today and Kids
 * open it in Co-Parent and never edit it themselves (HK13-D35; F07's contract HK-INT-COPARENT-KIDS-01: link into `life/coparent`).
 * A read, never a write — which is why it lives apart from the modules that hold mutations.
 */
export function isCoparentingHandoff(state: Pick<AppState, 'categories' | 'events'>, eventId: string): boolean {
  const category = categoryWithRole(state, 'coparenting');
  return category !== null && state.events.some((event) => event.id === eventId && event.categoryId === category.id);
}
