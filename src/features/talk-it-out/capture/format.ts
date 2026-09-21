import { formatAmount, type Money } from '../../../domain/foundation/money';
import { addDays, epochMsOf, logicalDateAt, parseLocalDate, wallClockMinutesAt, weekdayOf, type Instant, type LocalDate } from '../../../domain/logicalDay';

/**
 * Plain, deterministic formatting for the capture surfaces. No Intl: the same input reads the same on
 * every device and in every test. Deliberately not shared with, or imported from, any other feature.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekdayName = (weekday: number): string => WEEKDAYS_LONG[weekday];

export function formatClock(minutesOfDay: number): string {
  const h24 = Math.floor(minutesOfDay / 60) % 24;
  const m = minutesOfDay % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** "Today", "Tomorrow", or "Fri, Sep 25". */
export function formatDay(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const { month, day } = parseLocalDate(date);
  return `${WEEKDAYS[weekdayOf(date)]}, ${MONTHS[month - 1]} ${day}`;
}

/** "Fri, Sep 25" always — used where "today" would hide which day is meant. */
export function formatDayFull(date: LocalDate): string {
  const { month, day } = parseLocalDate(date);
  return `${WEEKDAYS[weekdayOf(date)]}, ${MONTHS[month - 1]} ${day}`;
}

export function formatEventWhen(startsAt: Instant, endsAt: Instant, timeZone: string, today: LocalDate): string {
  const start = epochMsOf(startsAt);
  const end = epochMsOf(endsAt);
  return `${formatDay(logicalDateAt(start, timeZone), today)} · ${formatClock(wallClockMinutesAt(start, timeZone))}–${formatClock(wallClockMinutesAt(end, timeZone))}`;
}

/** Which way money goes, in her words. The direction is never dropped and never implied. */
export function formatMoneyLine(money: Money): string {
  return `${money.direction === 'outflow' ? 'You pay' : 'Owed to you'} · $${formatAmount(money)}`;
}

/** A calm, absolute-enough label for when something was said, without a clock. */
export function formatReceived(receivedAt: Instant, timeZone: string, today: LocalDate): string {
  return formatDay(logicalDateAt(epochMsOf(receivedAt), timeZone), today);
}
