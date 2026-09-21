import { addDays, parseLocalDate, weekdayOf, type LocalDate } from '../../domain/logicalDay';

/**
 * Labels for a meal's logical date. A meal belongs to a CALENDAR DATE (`YYYY-MM-DD`), never to an instant, so nothing here
 * goes through `Date`, UTC or the device timezone: the weekday and month come from the date's own parts. That is what keeps
 * Tuesday Tuesday across a timezone change, a daylight-saving day and a second device.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const weekdayName = (date: LocalDate): string => WEEKDAYS[weekdayOf(date)];

/** The name of a weekday by its index, 0 = Sunday, as recurrence rules number them. */
export const weekdayNameOfIndex = (index: number): string => WEEKDAYS[index] ?? '';

/** "Tue 22 Sep". */
export function shortDate(date: LocalDate): string {
  const { month, day } = parseLocalDate(date);
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${day} ${MONTHS_SHORT[month - 1]}`;
}

/** "Tuesday 22 September" — what a screen reader says. */
export function longDate(date: LocalDate): string {
  const { month, day } = parseLocalDate(date);
  return `${WEEKDAYS[weekdayOf(date)]} ${day} ${MONTHS[month - 1]}`;
}

/**
 * "Today", "Tomorrow", a weekday for the days that follow (the next six are unambiguous), otherwise the calendar date.
 * A bare weekday is never used for a date a week or more away: "Thursday" would name two different days.
 */
export function mealDayLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date > today && date < addDays(today, 7)) return weekdayName(date);
  return shortDate(date);
}

/** The days offered as one-tap choices: logical today and the days after it. */
export function dayChoices(today: LocalDate, count = 14): LocalDate[] {
  return Array.from({ length: count }, (_, offset) => addDays(today, offset));
}

/** A choice chip's text: "Today", "Tomorrow", then "Thu 25 Sep". */
export function dayChoiceLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return shortDate(date);
}
