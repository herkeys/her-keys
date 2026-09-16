import type { LocalDate } from '../../domain/logicalDay';
import type { OpenTaskEntry } from '../../domain/taskLists';
import { relativeDay } from '../today/formatDay';

/** The short standing a task list row shows — what's due, what's planned, and what simply has no date yet. */
export function openTaskLabel(entry: OpenTaskEntry, today: LocalDate): string {
  switch (entry.standing) {
    case 'overdue':
      return `Overdue since ${relativeDay(entry.date as LocalDate, today)}`;
    case 'due_today':
      return 'Due today';
    case 'today':
      return 'Planned for today';
    case 'upcoming':
      return entry.date === entry.task.dueDate ? `Due ${relativeDay(entry.date as LocalDate, today)}` : `Planned for ${relativeDay(entry.date as LocalDate, today)}`;
    case 'unscheduled':
      return entry.date === null ? 'No date' : `Was planned for ${relativeDay(entry.date, today)}`;
  }
}

/** Overdue and due-today rows are the ones that want her. */
export function needsAttention(entry: OpenTaskEntry): boolean {
  return entry.standing === 'overdue' || entry.standing === 'due_today';
}
