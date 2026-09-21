import {
  daysBetween,
  logicalDateAt,
  parseLocalDate,
  wallClockMinutesAt,
  weekdayOf,
  zonedTimeToEpochMs,
  type LocalDate,
} from '../../domain/logicalDay';

/**
 * TIME, IN THE HOUSEHOLD'S OWN ZONE (HK-FEATURE-05).
 *
 * Every date and clock time Kids shows or accepts goes through the household timezone (`state.user.timezone`) and the shared
 * logical-day utilities. Nothing reads the device clock's local zone. The formatting is hand-written on purpose: it does not depend on a
 * runtime's locale data, so a test on a desktop and a phone say the same thing.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Tomorrow", "Yesterday", a weekday within the next week, otherwise "Sep 30" (with the year when it is not this year). */
export function dayPhrase(date: LocalDate, today: LocalDate): string {
  const delta = daysBetween(today, date);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta > 1 && delta <= 6) return WEEKDAYS[weekdayOf(date)];
  const { year, month, day } = parseLocalDate(date);
  const sameYear = year === parseLocalDate(today).year;
  return sameYear ? `${MONTHS[month - 1]} ${day}` : `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** "4:30 PM". 0 is 12:00 AM (midnight), 720 is 12:00 PM (noon). */
export function clockText(minutesOfDay: number): string {
  const hour24 = Math.floor(minutesOfDay / 60) % 24;
  const minute = minutesOfDay % 60;
  const meridiem = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

export interface ZonedMoment {
  localDate: LocalDate;
  minutesOfDay: number;
}

export const momentAt = (epochMs: number, timeZone: string): ZonedMoment => ({
  localDate: logicalDateAt(epochMs, timeZone),
  minutesOfDay: wallClockMinutesAt(epochMs, timeZone),
});

/** "4:30–5:30 PM" when both ends share a meridiem, "11:30 AM–1:00 PM" otherwise; "(next day)" when it ends on a later day. */
export function rangeText(start: ZonedMoment, end: ZonedMoment | null): string {
  if (end === null) return clockText(start.minutesOfDay);
  const a = clockText(start.minutesOfDay);
  const b = clockText(end.minutesOfDay);
  const later = end.localDate > start.localDate;
  const sameMeridiem = a.slice(-2) === b.slice(-2) && !later;
  const left = sameMeridiem ? a.slice(0, -3) : a;
  return `${left}–${b}${later ? ' (next day)' : ''}`;
}

/** Accepts "4:30 PM", "4:30pm", "16:30", "9:05". Returns minutes after midnight, or null for anything else. */
export function parseClockInput(text: string): number | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?\s*$/i.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59) return null;
  const meridiem = match[3]?.[0]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

export interface ResolvedWallTime {
  epochMs: number;
  /**
   * `gap`: that wall-clock time does not exist on that day (clocks moved forward) and the moment is the first real one after the gap.
   * `repeated`: that wall-clock time happens twice (clocks moved back) and the FIRST occurrence was taken.
   * null: an ordinary time.
   */
  adjusted: 'gap' | 'repeated' | null;
}

/** A wall-clock time on a calendar day in the zone, with the two daylight-saving cases named rather than silently absorbed. */
export function resolveWallTime(date: LocalDate, minutesOfDay: number, timeZone: string): ResolvedWallTime {
  const epochMs = zonedTimeToEpochMs(date, minutesOfDay, timeZone);
  if (wallClockMinutesAt(epochMs, timeZone) !== minutesOfDay || logicalDateAt(epochMs, timeZone) !== date) {
    return { epochMs, adjusted: 'gap' };
  }
  // Repeated hour: the same wall-clock time is reachable again shortly afterwards (a fold is 30 or 60 minutes in practice).
  for (const minutes of [30, 60]) {
    const later = epochMs + minutes * 60_000;
    if (logicalDateAt(later, timeZone) === date && wallClockMinutesAt(later, timeZone) === minutesOfDay) return { epochMs, adjusted: 'repeated' };
  }
  return { epochMs, adjusted: null };
}
