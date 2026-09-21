import type { LocalDate } from '../../domain/logicalDay';
import type { CalendarEventItem, TaskItem } from '../../types';
import { shortDate } from '../today/formatDay';

/**
 * What Her Keys actually holds about one child's day.
 *
 * Two rules govern everything here:
 *
 * - Identity is `id`. Two children who share a display name — and a birth date
 *   — are two children, and stay two rows. Nothing is ever grouped, matched or
 *   de-duplicated by name.
 * - Knowing nothing about a child's day is not the same as that day being
 *   covered. When there is nothing on record the row says so plainly; it never
 *   reports the child as scheduled, handled or on anyone's plan.
 */

/** A child as the Kids screen reads them. `age` is worked out for the day being shown. */
export interface KidsChild {
  id: string;
  displayName: string;
  birthDate: LocalDate;
  age: number;
}

export interface ChildDayRow {
  /** The child's id — never the name, and never a position in the list. */
  key: string;
  label: string;
  value: string;
  accessibilityLabel: string;
}

/** Shown when Her Keys holds nothing for the child on this day. It is an absence of record, not a verdict about the day. */
export const NOTHING_ON_RECORD = 'Nothing today';

interface Commitment {
  /** Minutes after local midnight, or null when the item has no time of day. */
  at: number | null;
  title: string;
  id: string;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Everything on record for this child today — events that name them and tasks
 * that name them alike — earliest first, with undated work last. A child's day
 * is not only the calendar, so a task nobody has given a time to still counts.
 */
export function childCommitments(childId: string, events: CalendarEventItem[], tasks: TaskItem[]): Commitment[] {
  const items: Commitment[] = [
    ...events.filter((event) => event.subjectMemberId === childId).map((event) => ({ at: event.startMinutes, title: event.title, id: event.id })),
    ...tasks.filter((task) => task.subjectMemberId === childId).map((task) => ({ at: task.scheduledStartMinutes ?? null, title: task.title, id: task.id })),
  ];

  // projectDay yields items in storage order, so the day is ordered here rather than assumed.
  return items.sort((a, b) => {
    if (a.at !== b.at) {
      if (a.at === null) return 1;
      if (b.at === null) return -1;
      return a.at - b.at;
    }
    return compareText(a.title, b.title) || compareText(a.id, b.id);
  });
}

/**
 * The name and age a row shows. When two children would read identically, the
 * birth date is added so the user can tell whose row is whose — the household's
 * own fact, never an invented ordinal.
 */
export function childLabel(child: KidsChild, allChildren: readonly KidsChild[]): string {
  const base = `${child.displayName}, ${child.age}`;
  const collides = allChildren.filter((other) => `${other.displayName}, ${other.age}` === base).length > 1;
  return collides ? `${base} (born ${shortDate(child.birthDate)})` : base;
}

/** One row per child, in household order. A child is never dropped, merged or summarized away. */
export function childDayRows(children: readonly KidsChild[], events: CalendarEventItem[], tasks: TaskItem[]): ChildDayRow[] {
  return children.map((child) => {
    const label = childLabel(child, children);
    const commitments = childCommitments(child.id, events, tasks);
    const value = commitments.length > 0 ? commitments.map((item) => item.title).join(' · ') : NOTHING_ON_RECORD;
    return { key: child.id, label, value, accessibilityLabel: `${label}: ${value}` };
  });
}
