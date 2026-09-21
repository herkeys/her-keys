import {
  addDays,
  epochMsOf,
  isLocalDate,
  logicalDateAt,
  parseLocalDate,
  toInstant,
  wallClockMinutesAt,
  weekdayOf,
  zonedTimeToEpochMs,
  type LocalDate,
} from '../../domain/logicalDay';
import type { RecurrenceRule } from '../../domain/foundation/structure';
import { nextOccurrence } from '../../domain/structure';
import type { AppState } from '../../domain/state';

/**
 * TIME — household zone only.
 *
 * A handoff time is an absolute instant. What day and clock time it reads as is decided by the HOUSEHOLD zone (`state.user.timezone`),
 * or by a recurrence rule's own explicit `timezone`. It is never decided by the device, and never by a place name in a location
 * string: Her Keys does not know which zone another household lives in, so it does not guess.
 */

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "17:30" -> 1050. Anything that is not a 24-hour HH:MM is null — never coerced. */
export function parseTimeInput(text: string): number | null {
  const match = TIME_PATTERN.exec(text.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function timeInputOf(minutesOfDay: number): string {
  return `${String(Math.floor(minutesOfDay / 60)).padStart(2, '0')}:${String(minutesOfDay % 60).padStart(2, '0')}`;
}

/** 1050 -> "5:30 PM". */
export function clockLabel(minutesOfDay: number): string {
  const hour24 = Math.floor(minutesOfDay / 60) % 24;
  const minute = minutesOfDay % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** "Today", "Tomorrow", otherwise "Fri, Sep 18" (the year is added only when it is not this year). */
export function dayLabelFor(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return dateLabel(date, today);
}

/** "Fri, Sep 18" — never relative. */
export function dateLabel(date: LocalDate, today?: LocalDate): string {
  const { year, month, day } = parseLocalDate(date);
  const sameYear = today === undefined || parseLocalDate(today).year === year;
  return `${WEEKDAYS_SHORT[weekdayOf(date)]}, ${MONTHS[month - 1]} ${day}${sameYear ? '' : `, ${year}`}`;
}

/** The household-local date and clock minutes an instant reads as. */
export function localParts(epochMs: number, zone: string): { localDate: LocalDate; minutesOfDay: number } {
  return { localDate: logicalDateAt(epochMs, zone), minutesOfDay: wallClockMinutesAt(epochMs, zone) };
}

/** An entered date + HH:MM as an instant in the household zone; null when either is not real. */
export function instantFromInput(date: string, time: string, zone: string): string | null {
  const minutes = parseTimeInput(time);
  if (!isLocalDate(date) || minutes === null) return null;
  return toInstant(zonedTimeToEpochMs(date, minutes, zone));
}

export interface Occurrence {
  startsAtMs: number;
  endsAtMs: number;
  /** `recorded` = the event's own row; `repeat_pattern` = derived from the recorded rule. */
  kind: 'recorded' | 'repeat_pattern';
}

/**
 * The occurrence of a handoff that is coming up (or under way) at `nowMs`, or the recorded one if nothing later exists.
 *
 * The event's own row is the anchor occurrence. If it has ended and it carries an ACTIVE schedule rule, the next date is the shared
 * `nextOccurrence` (which honours recorded exceptions), converted in the RULE'S zone. A rule is an operational pattern the user
 * recorded; deriving a date from it says nothing about anyone else's agreement to it.
 */
export function currentOccurrence(
  state: AppState,
  event: { startsAt: string; endsAt: string },
  rule: RecurrenceRule | null,
  nowMs: number
): Occurrence {
  const startsAtMs = epochMsOf(event.startsAt);
  const endsAtMs = epochMsOf(event.endsAt);
  const anchor: Occurrence = { startsAtMs, endsAtMs, kind: 'recorded' };
  if (endsAtMs > nowMs || rule === null || rule.status !== 'active' || rule.trigger !== 'schedule') return anchor;

  const length = endsAtMs - startsAtMs;
  const zone = rule.timezone;
  const minutesOfDay = rule.timeOfDayMinutes ?? wallClockMinutesAt(startsAtMs, zone);
  let from: LocalDate = logicalDateAt(nowMs, zone);
  // A day whose occurrence has already ended is skipped; a handful of steps is enough because a rule fires at least yearly.
  for (let step = 0; step < 6; step += 1) {
    const date = nextOccurrence(state, rule, from);
    if (date === null) return anchor;
    const start = zonedTimeToEpochMs(date, minutesOfDay, zone);
    if (start + length > nowMs) return { startsAtMs: start, endsAtMs: start + length, kind: 'repeat_pattern' };
    from = addDays(date, 1);
  }
  return anchor;
}

export const EARLIEST_RECENT_DAYS = 14;
export const RECENT_WINDOW_MS = EARLIEST_RECENT_DAYS * 86_400_000;
