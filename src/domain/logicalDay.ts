/**
 * Dates and times for a household that lives in one timezone.
 *
 * Two kinds of value are stored, and they are never mixed:
 * - an Instant — a moment, written as a UTC ISO-8601 string ("2026-09-14T19:00:00.000Z");
 * - a LocalDate — a calendar day in the user's timezone, written "YYYY-MM-DD".
 *
 * "Today" is always the LocalDate of the current moment in `User.timezone`.
 * Build 2 assumes that timezone doesn't change; travel is deferred.
 *
 * Conversions use the platform's Intl timezone data, so nothing here needs a
 * timezone library. `checkTimeZoneSupport` exists to prove that on a device.
 */

export type LocalDate = string;
export type Instant = string;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINUTE_MS = 60_000;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function isLocalDate(value: string): boolean {
  const match = LOCAL_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseLocalDate(date: LocalDate): DateParts {
  if (!isLocalDate(date)) throw new Error(`Not a calendar date: ${date}`);
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

export function formatLocalDate({ year, month, day }: DateParts): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatLocalDate({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() });
}

/** Same month and day `years` later (or earlier); 29 February falls back to the 28th when it has to. */
export function addYears(date: LocalDate, years: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const target = year + years;
  return formatLocalDate({ year: target, month, day: Math.min(day, daysInMonth(target, month)) });
}

/** Whole years between a birth date and a day — how old someone is on that day. */
export function ageOn(birthDate: LocalDate, date: LocalDate): number {
  const born = parseLocalDate(birthDate);
  const on = parseLocalDate(date);
  const hadBirthday = on.month > born.month || (on.month === born.month && on.day >= born.day);
  return on.year - born.year - (hadBirthday ? 0 : 1);
}

/** 0 = Sunday … 6 = Saturday. A calendar fact, so it needs no timezone. */
export function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// --- Timezone-aware conversions -------------------------------------------

interface ZonedParts extends DateParts {
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(epochMs: number, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMs));
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const zoned = {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Some engines report midnight as hour 24 even when asked for h23.
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  };
  if (Object.values(zoned).some((value) => !Number.isFinite(value))) {
    throw new Error(`Timezone conversion is unavailable for ${timeZone}`);
  }
  return zoned;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function deviceTimeZone(): string {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Minutes the zone is ahead of UTC at that moment (negative west of Greenwich). */
export function offsetMinutesAt(epochMs: number, timeZone: string): number {
  const p = zonedParts(epochMs, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((wallAsUtc - Math.floor(epochMs / 1000) * 1000) / MINUTE_MS);
}

export function logicalDateAt(epochMs: number, timeZone: string): LocalDate {
  return formatLocalDate(zonedParts(epochMs, timeZone));
}

/** Clock time of that moment in the zone, as minutes after midnight. */
export function wallClockMinutesAt(epochMs: number, timeZone: string): number {
  const p = zonedParts(epochMs, timeZone);
  return p.hour * 60 + p.minute;
}

/**
 * The moment a wall-clock time on a calendar day happens in the zone.
 *
 * On a fall-back day the earlier of the two repeated times is used. On a
 * spring-forward day a time that never happens moves forward past the gap,
 * so 2:30 AM becomes 3:30 AM rather than landing before the change.
 */
export function zonedTimeToEpochMs(date: LocalDate, minutesOfDay: number, timeZone: string): number {
  const { year, month, day } = parseLocalDate(date);
  const wall = Date.UTC(year, month - 1, day, 0, minutesOfDay);

  const firstOffset = offsetMinutesAt(wall, timeZone);
  const first = wall - firstOffset * MINUTE_MS;
  const secondOffset = offsetMinutesAt(first, timeZone);
  if (secondOffset === firstOffset) return first;

  const second = wall - secondOffset * MINUTE_MS;
  if (offsetMinutesAt(second, timeZone) === secondOffset) return second;

  return Math.max(first, second);
}

export function toInstant(epochMs: number): Instant {
  return new Date(epochMs).toISOString();
}

export function epochMsOf(instant: Instant): number {
  return Date.parse(instant);
}

/**
 * Known answers the platform's timezone data must reproduce. Run on a device
 * to confirm Intl is good enough before trusting it with a household's day.
 */
export function checkTimeZoneSupport(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const expect = (label: string, actual: unknown, expected: unknown) => {
    if (actual !== expected) failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  };

  try {
    expect('New York winter offset', offsetMinutesAt(Date.UTC(2026, 0, 15, 12), 'America/New_York'), -300);
    expect('New York summer offset', offsetMinutesAt(Date.UTC(2026, 6, 15, 12), 'America/New_York'), -240);
    expect('Kolkata offset', offsetMinutesAt(Date.UTC(2026, 6, 15, 12), 'Asia/Kolkata'), 330);
    expect('date before UTC midnight', logicalDateAt(Date.UTC(2026, 0, 15, 3), 'America/New_York'), '2026-01-14');
    expect('Sydney date ahead of UTC', logicalDateAt(Date.UTC(2026, 0, 15, 20), 'Australia/Sydney'), '2026-01-16');
    expect('wall clock', wallClockMinutesAt(Date.UTC(2026, 8, 14, 19), 'America/New_York'), 15 * 60);
    expect('local 3 PM to UTC', zonedTimeToEpochMs('2026-09-14', 15 * 60, 'America/New_York'), Date.UTC(2026, 8, 14, 19));
    expect('spring-forward gap moves forward', zonedTimeToEpochMs('2026-03-08', 150, 'America/New_York'), Date.UTC(2026, 2, 8, 7, 30));
    expect('fall-back uses first occurrence', zonedTimeToEpochMs('2026-11-01', 90, 'America/New_York'), Date.UTC(2026, 10, 1, 5, 30));
    expect('unknown zone rejected', isValidTimeZone('Not/AZone'), false);
  } catch (error) {
    failures.push(`threw: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { ok: failures.length === 0, failures };
}
