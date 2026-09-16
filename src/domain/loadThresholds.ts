import { REQUIRED_TRANSITION_BUFFER_MINUTES } from '../features/daily-load/computeDailyLoad';

/**
 * The load thresholds, in one place. `loadTier.ts` re-exports these; they
 * live on their own so the Daily Load issue detectors can use them without
 * an import cycle.
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
