import type { OneMoveItem } from '../../types';

/**
 * Seeded observation feeding today's One Move. In a later build this would
 * come from the Momentum Agent noticing a recurring avoidance pattern rather
 * than being hard-coded.
 */
export const oneMove: OneMoveItem = {
  id: 'one-move-1',
  observation: 'Mail has been piling up on the kitchen counter for about two weeks.',
  action: "Open the mail basket and pull out just today's mail — nothing else.",
  domain: 'home',
  estimatedMinutes: 2,
};
