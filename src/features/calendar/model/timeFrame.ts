import { addDays, daysBetween, weekdayOf, zonedTimeToEpochMs, type LocalDate } from '../../../domain/logicalDay';
import { CAPACITY_DAY_END_MINUTES, CAPACITY_DAY_START_MINUTES } from '../../../domain/dailyLoadIssues';
import type { DayMode } from './types';

/**
 * One logical day in one household timezone, measured in ELAPSED time.
 *
 * The foundation's `projectDay` reports wall-clock minutes-after-midnight and treats them as
 * elapsed time. That is right on 363 days a year. On the two DST days a wall clock skips or
 * repeats an hour, so an event from 01:30 EDT to 01:30 EST is reported as 90 -> 90 (zero
 * length) and a spring-forward gap looks an hour longer than it is (F03-FG-03). Calendar
 * therefore keeps instants and derives minutes as (instant - start of the day) / 60 000, so
 * a 23-hour or 25-hour day is simply a day of that many minutes.
 */
export interface DayFrame {
  date: LocalDate;
  timeZone: string;
  startMs: number;
  endMs: number;
  /** 1380 on the spring-forward day, 1500 on the fall-back day, 1440 otherwise. */
  lengthMinutes: number;
}

const MINUTE_MS = 60_000;

export function dayFrameFor(date: LocalDate, timeZone: string): DayFrame {
  const startMs = zonedTimeToEpochMs(date, 0, timeZone);
  const endMs = zonedTimeToEpochMs(addDays(date, 1), 0, timeZone);
  return { date, timeZone, startMs, endMs, lengthMinutes: Math.round((endMs - startMs) / MINUTE_MS) };
}

/** Elapsed minutes from the start of the day; not clipped, so it may be negative or beyond the day's length. */
export const minuteOf = (frame: DayFrame, ms: number): number => (ms - frame.startMs) / MINUTE_MS;

/** The household's usable day (the foundation's capacity window), in elapsed minutes of this frame. */
export function capacityWindowIn(frame: DayFrame): { startMinute: number; endMinute: number } {
  return {
    startMinute: minuteOf(frame, zonedTimeToEpochMs(frame.date, CAPACITY_DAY_START_MINUTES, frame.timeZone)),
    endMinute: minuteOf(frame, zonedTimeToEpochMs(frame.date, CAPACITY_DAY_END_MINUTES, frame.timeZone)),
  };
}

export function dayModeOf(date: LocalDate, today: LocalDate): DayMode {
  if (date === today) return 'today';
  return date < today ? 'past' : 'future';
}

/** The seven days of the week containing `date`, Sunday first (the same 0 = Sunday convention the recurrence rules use). */
export function weekOf(date: LocalDate): LocalDate[] {
  const first = addDays(date, -weekdayOf(date));
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

export { addDays, daysBetween };

/** Two free-text places are the same known place only when they are equal after trimming, collapsing spaces and folding case. */
export function normalizePlace(location: string | null): string | null {
  if (location === null) return null;
  const normalized = location.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized === '' ? null : normalized;
}

export function roundMinute(value: number): number {
  return Math.round(value);
}
