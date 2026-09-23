import { addDays, parseLocalDate, type LocalDate } from '../../domain/logicalDay';

/**
 * Labels for a record's dates. Every Life Admin date is a CALENDAR DATE, so nothing here goes through `Date`, UTC or the device
 * timezone: the parts come from the date itself, which keeps an expiration date the same date on every device and in every zone.
 * Administrative dates span years, so the year is always said.
 */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** "22 Sep 2026". */
export function recordDate(date: LocalDate): string {
  const { year, month, day } = parseLocalDate(date);
  return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
}

/** "22 September 2026" — what a screen reader says. */
export function recordDateLong(date: LocalDate): string {
  const { year, month, day } = parseLocalDate(date);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** The last day of the upcoming window that starts after `today`. */
export const windowEnd = (today: LocalDate, days: number): LocalDate => addDays(today, days);
