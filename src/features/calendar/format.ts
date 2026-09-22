import { daysBetween, parseLocalDate, wallClockMinutesAt, weekdayOf, type LocalDate } from '../../domain/logicalDay';

/**
 * Calendar-local formatting (MGP-05). Feature-owned on purpose: it does not import Today's
 * formatters, which belong to a file another feature may change. Every clock time is produced
 * from an INSTANT in the household's zone, so a DST day reads correctly.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

function parts(ms: number, timeZone: string): { hour12: number; minute: string; period: 'AM' | 'PM' } {
  const total = wallClockMinutesAt(ms, timeZone);
  const hour24 = Math.floor(total / 60);
  return { hour12: ((hour24 + 11) % 12) + 1, minute: String(total % 60).padStart(2, '0'), period: hour24 >= 12 ? 'PM' : 'AM' };
}

/** The zone's short name at that instant ("EDT", "EST"), used only where a clock time is ambiguous. */
function zoneName(ms: number, timeZone: string): string {
  const found = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date(ms)).find((part) => part.type === 'timeZoneName');
  return found === undefined ? '' : found.value;
}

export interface ClockOptions {
  /** True when this wall-clock time happens twice that day, so the zone says which one. */
  ambiguous?: boolean;
}

/** "9:00 AM", or "1:30 AM EDT" inside a repeated hour. */
export function formatClock(ms: number, timeZone: string, options: ClockOptions = {}): string {
  const p = parts(ms, timeZone);
  const base = `${p.hour12}:${p.minute} ${p.period}`;
  return options.ambiguous === true ? `${base} ${zoneName(ms, timeZone)}` : base;
}

/** "9:00–10:00 AM", or "11:30 AM–12:30 PM" when the period changes. */
export function formatClockRange(startMs: number, endMs: number, timeZone: string, options: { startAmbiguous?: boolean; endAmbiguous?: boolean } = {}): string {
  if (options.startAmbiguous === true || options.endAmbiguous === true) {
    // A repeated hour: each end names its own zone, so "1:30 AM EDT–1:30 AM EST" cannot be read as zero minutes.
    return `${formatClock(startMs, timeZone, { ambiguous: options.startAmbiguous === true })}–${formatClock(endMs, timeZone, { ambiguous: options.endAmbiguous === true })}`;
  }
  const a = parts(startMs, timeZone);
  const b = parts(endMs, timeZone);
  const start = a.period === b.period ? `${a.hour12}:${a.minute}` : `${a.hour12}:${a.minute} ${a.period}`;
  return `${start}–${b.hour12}:${b.minute} ${b.period}`;
}

/** "45 min", "1 hr", "1 hr 30 min". */
export function formatMinutes(minutes: number): string {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** "Wednesday, September 16" */
export function formatDayTitle(date: LocalDate): string {
  const { month, day } = parseLocalDate(date);
  return `${WEEKDAYS[weekdayOf(date)]}, ${MONTHS[month - 1]} ${day}`;
}

/** "Wed" */
export const formatWeekdayShort = (date: LocalDate): string => WEEKDAYS[weekdayOf(date)].slice(0, 3);

/** "16" */
export const formatDayNumber = (date: LocalDate): string => String(parseLocalDate(date).day);

/** "Today", "Tomorrow", "Yesterday", or the weekday. */
export function relativeDayLabel(date: LocalDate, today: LocalDate): string {
  const offset = daysBetween(today, date);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  return WEEKDAYS[weekdayOf(date)];
}

/** "September 13–19" for a week that stays in one month, otherwise "Sep 28 – Oct 4". */
export function formatWeekRange(days: readonly LocalDate[]): string {
  const first = parseLocalDate(days[0]);
  const last = parseLocalDate(days[days.length - 1]);
  if (first.month === last.month) return `${MONTHS[first.month - 1]} ${first.day}–${last.day}`;
  return `${MONTHS[first.month - 1].slice(0, 3)} ${first.day} – ${MONTHS[last.month - 1].slice(0, 3)} ${last.day}`;
}
