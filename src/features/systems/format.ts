import { daysBetween, parseLocalDate, weekdayOf, type LocalDate } from '../../domain/logicalDay';

/**
 * Plain, deterministic English for dates and clock times.
 *
 * Built from the household's own calendar arithmetic (`LocalDate` in, text out), so a date reads the
 * same on every device and in every timezone. It deliberately does not call `toLocale*`/`Intl`:
 * those read the DEVICE's locale and zone, and a routine's "Sunday" is the household's Sunday.
 */

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "Sun, Sep 20" */
export function formatDay(date: LocalDate): string {
  const { month, day } = parseLocalDate(date);
  return `${WEEKDAYS_SHORT[weekdayOf(date)]}, ${MONTHS[month - 1]} ${day}`;
}

/** "Today", "Tomorrow", otherwise "Sun, Sep 20". Capitalized: it opens a phrase. */
export function relativeDay(date: LocalDate, today: LocalDate): string {
  const distance = daysBetween(today, date);
  if (distance === 0) return 'Today';
  if (distance === 1) return 'Tomorrow';
  return formatDay(date);
}

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** "7:30 AM" — minutes after midnight in the household's zone. */
export function formatClock(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, '0');
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${mm} ${suffix}`;
}

/**
 * "7:30", "07:30", "7:30 pm", "19:00", "7 am" → minutes after midnight, or null when it is not a
 * clock time she could have meant. Never guesses: "730" and "25:00" are refused.
 */
export function parseClock(text: string): number | null {
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]m)?\s*$/i.exec(text);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'pm' ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/** "Monday", "Monday and Thursday", "Monday, Wednesday and Friday" */
export function listWeekdays(days: readonly number[]): string {
  const names = [...days].sort((a, b) => a - b).map((day) => WEEKDAYS[day]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function monthDayName(date: LocalDate): string {
  const { month, day } = parseLocalDate(date);
  return `${MONTHS[month - 1]} ${day}`;
}

/** "20 min", "1 hr", "1 hr 30 min" */
export function minutesText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
