/**
 * Whether doing the move adds work to the day or takes some away. An
 * overloaded day never gets a move that adds work.
 */
export type OneMoveEffect = 'adds_work' | 'reduces_load';

export interface OneMoveItem {
  id: string;
  observation: string;
  action: string;
  effect: OneMoveEffect;
  /** Kept small on purpose — a One Move should read as doable right now. Absent rather than guessed when there's no real estimate behind it (a Needs Me item, for instance). */
  estimatedMinutes?: number;
}
