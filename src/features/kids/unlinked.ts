import { categoryWithRole } from '../../domain/categories';
import type { LocalDate } from '../../domain/logicalDay';
import type { AppState } from '../../domain/state';
import { openTasksInCategory, type OpenTaskEntry } from '../../domain/taskLists';

/**
 * NO OPEN TASK IS EVER OUT OF REACH (the Life guarantee, kept).
 *
 * The Kids screen has always listed every open task in the household's kids category. Kids OS now shows a child's own items under that
 * child, so the tasks in the kids category that name NO child (or whose subject is the adult) would otherwise appear nowhere. They are
 * listed here, plainly labelled as not linked to a child, and they never become a child's by being listed: a household-level record does
 * not silently turn child-specific (scenario AB).
 *
 * Together with the child screens this covers every open task in the category: `linked` under its child, `unlinked` here.
 */
export function unlinkedKidsTasks(state: AppState, today: LocalDate): OpenTaskEntry[] {
  const category = categoryWithRole(state, 'kids');
  if (category === null) return [];
  const childIds = new Set(state.children.map((child) => child.id));
  return openTasksInCategory(state, category.id, today).filter((entry) => entry.task.subjectMemberId === null || !childIds.has(entry.task.subjectMemberId));
}
