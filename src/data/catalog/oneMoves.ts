import type { OneMoveItem } from '../../types';

/**
 * One Moves Her Keys can offer the fictional demo household. In a later build
 * these would come from the Momentum Agent noticing a recurring avoidance
 * pattern. A real household has no catalog yet, so it is offered none rather
 * than someone else's observation.
 */
export const demoOneMoves: readonly OneMoveItem[] = [
  {
    id: 'one-move-1',
    observation: 'Mail has been piling up on the kitchen counter for about two weeks.',
    action: "Open the mail basket and pull out just today's mail — nothing else.",
    estimatedMinutes: 2,
    effect: 'adds_work',
  },
];

export function findOneMove(catalog: readonly OneMoveItem[], id: string): OneMoveItem | null {
  return catalog.find((move) => move.id === id) ?? null;
}
