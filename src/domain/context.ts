import type { LocalDate } from './logicalDay';

/** What a state transition needs from the outside world, passed in so transitions stay pure and testable. */
export interface TransitionContext {
  /** When the action happened. */
  nowMs: number;
  /** The logical day the user is looking at, in the household's timezone. */
  today: LocalDate;
  createId: (prefix: string) => string;
}
