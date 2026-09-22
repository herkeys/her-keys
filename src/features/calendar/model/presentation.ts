import { addDays, type LocalDate } from '../../../domain/logicalDay';

/**
 * PRESENTATION STATE (contract section 51): what she is looking at, never household truth. It lives
 * in memory only and is never persisted. It survives no restart, by design.
 *
 * `selection: today` FOLLOWS the logical day: when midnight rolls over, "today" is the new day and
 * nothing stale is left selected. A specific date, once she moves to it, stays where she put it.
 */
export type CalendarView = 'day' | 'week';
export type Selection = { kind: 'today' } | { kind: 'date'; date: LocalDate };

export interface CalendarPresentation {
  view: CalendarView;
  selection: Selection;
}

export const initialPresentation: CalendarPresentation = { view: 'day', selection: { kind: 'today' } };

export const selectedDateOf = (presentation: CalendarPresentation, today: LocalDate): LocalDate =>
  presentation.selection.kind === 'today' ? today : presentation.selection.date;

export type PresentationAction =
  | { type: 'goToday' }
  | { type: 'select'; date: LocalDate }
  | { type: 'step'; days: number }
  | { type: 'setView'; view: CalendarView };

export function reducePresentation(current: CalendarPresentation, action: PresentationAction, today: LocalDate): CalendarPresentation {
  const selected = selectedDateOf(current, today);
  const to = (date: LocalDate): Selection => (date === today ? { kind: 'today' } : { kind: 'date', date });
  switch (action.type) {
    case 'goToday':
      return { ...current, selection: { kind: 'today' } };
    case 'select':
      return { ...current, selection: to(action.date) };
    case 'step':
      return { ...current, selection: to(addDays(selected, action.days)) };
    case 'setView':
      return { ...current, view: action.view };
  }
}
