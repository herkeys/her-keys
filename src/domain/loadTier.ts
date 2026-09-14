import { computeDailyLoad, REQUIRED_TRANSITION_BUFFER_MINUTES } from '../features/daily-load/computeDailyLoad';
import type { DailyLoadAssessment } from '../types';
import type { LocalDate } from './logicalDay';
import { projectStateDay } from './projectDay';
import type { AppState } from './state';

/**
 * How loaded a day is, as a semantic value every consumer shares — One Move
 * eligibility and the load meter both read this instead of keeping their own
 * thresholds. Measured on the tightest transition buffer:
 *
 *   OPEN        buffer >= 45 minutes
 *   TIGHT       buffer 23–44 minutes
 *   OVERLOADED  buffer <= 22 minutes (negative buffers included)
 */
export type LoadTier = 'open' | 'tight' | 'overloaded';

export const TIGHT_MINIMUM_BUFFER_MINUTES = 23;

export function loadTierForBuffer(bufferMinutes: number): LoadTier {
  if (bufferMinutes >= REQUIRED_TRANSITION_BUFFER_MINUTES) return 'open';
  if (bufferMinutes >= TIGHT_MINIMUM_BUFFER_MINUTES) return 'tight';
  return 'overloaded';
}

/** A day with no transitions between commitments has nothing to be short on. */
export function loadTierOf(assessment: DailyLoadAssessment): LoadTier {
  return assessment.gap === null ? 'open' : loadTierForBuffer(assessment.bufferMinutes);
}

export function loadTierForDay(state: AppState, date: LocalDate): LoadTier {
  const day = projectStateDay(state, date);
  return loadTierOf(computeDailyLoad(day.events, day.tasks));
}
