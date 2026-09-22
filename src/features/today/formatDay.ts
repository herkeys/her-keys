import { addDays, parseLocalDate, weekdayOf, type LocalDate } from '../../domain/logicalDay';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "today", "tomorrow", or a short date such as "Sep 30". */
export function relativeDay(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  const { month, day } = parseLocalDate(date);
  return `${MONTHS[month - 1]} ${day}`;
}

export function weekdayName(date: LocalDate): string {
  return WEEKDAYS[weekdayOf(date)];
}

/** "Wednesday, Sep 16" — a calendar fact about a logical date, so it needs no timezone and cannot drift with the device's. */
export function fullDayLabel(date: LocalDate): string {
  const { month, day } = parseLocalDate(date);
  return `${weekdayName(date)}, ${MONTHS[month - 1]} ${day}`;
}

/** "Today" for today, otherwise the weekday. */
export function dayLabel(date: LocalDate, today: LocalDate): string {
  return date === today ? 'Today' : weekdayName(date);
}
