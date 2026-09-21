import { commitmentFacetsOf } from '../../../domain/foundation/commitment';
import { consequenceRank } from '../../../domain/foundation/authorization';
import { refKey, type TypedRef } from '../../../domain/foundation/typedRef';
import { addDays, epochMsOf, logicalDateAt, type LocalDate } from '../../../domain/logicalDay';
import type { DayView } from '../../../domain/projectDay';
import type { AttentionItem } from '../../../domain/reasoning/attention';
import { liveResponsibilityFor } from '../../../domain/responsibility';
import type { AppState } from '../../../domain/state';
import { isDone } from '../../../domain/structure';
import { isMovable } from '../../daily-load/computeDailyLoad';
import { taskRoute } from './refs';
import type { CanWaitItem, CanWaitSection } from './types';

/**
 * WHAT CAN SAFELY WAIT.
 *
 * Telling her what she may ignore is part of taking load off her — and it is a claim,
 * so it is made only when nothing in the household says otherwise. The starting point is
 * the product's OWN definition of "safe to move": `isMovable`, the test Daily Load uses
 * before it will recommend deferring a task (flexible, not due today, has minutes).
 * Everything below only REMOVES items from that set; nothing can make an item qualify
 * that Daily Load would not already move. An item is excluded when:
 *
 *   - any attention reason names it (a deadline today, soon, or overdue; a risk)
 *   - it has a stated consequence of high or worse
 *   - it has a deadline-with-a-time, or a latest-finish, on or before tomorrow
 *   - something live requires it (a dependency: deferring it would strand that)
 *   - it is delegated, or a handoff is in flight
 *   - it is today's One Move
 *
 * A consequence that is simply not known does not exclude an item: Daily Load already
 * treats a flexible not-due task as movable without one, and this does not claim more
 * than Daily Load does. If the household cannot show that something can wait, it is not
 * listed — a sentence that hides an obligation is worse than no sentence.
 */

export const FIRST_GLANCE_CAN_WAIT = 3;

export function canWaitSection(args: {
  state: AppState;
  day: DayView;
  today: LocalDate;
  attention: AttentionItem[];
  oneMoveKey: string | null;
}): CanWaitSection | null {
  const { state, day, today, attention, oneMoveKey } = args;
  const tz = state.user.timezone;
  const tomorrow = addDays(today, 1);
  const named = new Set(attention.flatMap((a) => (a.about !== null && a.about.kind === 'task' ? [refKey(a.about)] : [])));

  const eligible: Array<{ ref: TypedRef; title: string; minutes: number }> = [];
  for (const item of day.tasks) {
    const row = state.tasks.find((t) => t.id === item.id);
    if (!row || row.status !== 'open') continue;
    const ref: TypedRef = { kind: 'task', id: row.id };
    const key = refKey(ref);

    if (!isMovable(item)) continue;
    if (named.has(key) || oneMoveKey === key) continue;

    const facets = commitmentFacetsOf({ kind: 'task', row });
    if (facets.consequence !== null && consequenceRank(facets.consequence) >= consequenceRank('high')) continue;
    if (facets.dueAt !== null && logicalDateAt(epochMsOf(facets.dueAt), tz) <= tomorrow) continue;
    if (facets.latestFinishAt !== null && logicalDateAt(epochMsOf(facets.latestFinishAt), tz) <= tomorrow) continue;

    const requiredByLive = state.dependencies.some(
      (d) => d.status === 'active' && d.relation === 'requires' && d.to.kind === 'task' && d.to.id === row.id && !isDone(state, d.from)
    );
    if (requiredByLive) continue;
    if (liveResponsibilityFor(state, ref) !== null) continue;

    eligible.push({ ref, title: row.title, minutes: item.durationMinutes });
  }

  if (eligible.length === 0) return null;
  const all: CanWaitItem[] = eligible
    .sort((a, b) => b.minutes - a.minutes || a.ref.id.localeCompare(b.ref.id))
    .map((e) => ({ ref: e.ref, title: e.title, route: taskRoute(e.ref.id) }));
  return { items: all.slice(0, FIRST_GLANCE_CAN_WAIT), moreItems: all.slice(FIRST_GLANCE_CAN_WAIT) };
}
