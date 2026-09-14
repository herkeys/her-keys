import { weekdayOf, type LocalDate } from '../../domain/logicalDay';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(date: LocalDate): string {
  return WEEKDAYS[weekdayOf(date)];
}

/** "Today" for today, otherwise the weekday. */
export function dayLabel(date: LocalDate, today: LocalDate): string {
  return date === today ? 'Today' : weekdayName(date);
}
