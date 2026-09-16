import { computeDailyLoad } from '../features/daily-load/computeDailyLoad';
import type { DailyLoadAssessment } from '../types';
import { assessDailyLoadIssues } from './dailyLoadIssues';
import { loadTierForBuffer, type LoadTier } from './loadThresholds';
import type { LocalDate } from './logicalDay';
import { projectStateDay } from './projectDay';
import type { AppState } from './state';

/**
 * How loaded a day is, as a semantic value every consumer shares. The
 * thresholds live in `loadThresholds.ts`; everything here reads them.
 */
export { loadTierForBuffer, TIGHT_MINIMUM_BUFFER_MINUTES, type LoadTier } from './loadThresholds';

/** The tightest transition alone. A day with no transitions between commitments has nothing to be short on. */
export function loadTierOf(assessment: DailyLoadAssessment): LoadTier {
  return assessment.gap === null ? 'open' : loadTierForBuffer(assessment.bufferMinutes);
}

/**
 * The day as Daily Load judges it — overlaps, travel-aware transitions and
 * capacity included, not only the tightest raw gap. One Move withholding
 * reads this, so a day Daily Load calls overloaded never gets a move that adds
 * work.
 */
export function loadTierForDay(state: AppState, date: LocalDate): LoadTier {
  const day = projectStateDay(state, date);
  return assessDailyLoadIssues(day.events, day.tasks, computeDailyLoad(day.events, day.tasks)).tier;
}
