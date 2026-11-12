import { capacityReliefFor, type CapacityRelief } from '../../domain/recommendationActions';

/**
 * What each capacity-pressure option would honestly do, in her words. A smaller task may not clear the whole shortfall,
 * and this never implies it does: when minutes would remain over, it says how many.
 */

const minutes = (n: number): string => (n === 1 ? '1 minute' : `${n} minutes`);

export interface CapacityOptionCopy {
  /** The recommendation sentence for the task being shown. */
  recommendation: string;
  /** What dropping it would free, and what would still be over. */
  dropLine: string;
  /** What shortening it would free. Null when it cannot be shortened (already at or under the 15-minute floor). */
  shortenLine: string | null;
  relief: CapacityRelief;
}

export function capacityOptionCopy(title: string, durationMinutes: number, pressureMinutes: number): CapacityOptionCopy {
  const relief = capacityReliefFor(pressureMinutes, durationMinutes);

  const dropLine =
    relief.stillOverAfterDrop === 0
      ? `Dropping it frees ${minutes(relief.dropFreesMinutes)}, which covers the ${minutes(pressureMinutes)} the day is over.`
      : `Dropping it frees ${minutes(relief.dropFreesMinutes)}, but the day would still be ${minutes(relief.stillOverAfterDrop)} over.`;

  const shortenLine = !relief.canShorten
    ? null
    : relief.stillOverAfterShorten === 0
      ? `Shortening it to ${minutes(relief.shortenToMinutes)} frees ${minutes(relief.shortenFreesMinutes)}, which covers the ${minutes(pressureMinutes)} the day is over.`
      : `Shortening it to ${minutes(relief.shortenToMinutes)} frees ${minutes(relief.shortenFreesMinutes)}, but the day would still be ${minutes(relief.stillOverAfterShorten)} over.`;

  return {
    recommendation: relief.canShorten ? `Shorten or drop “${title}”.` : `Drop “${title}” for today.`,
    dropLine,
    shortenLine,
    relief,
  };
}
