import type { Household } from '../../types';

/**
 * Entirely fictional household used to demonstrate Build 1. No real
 * person's data is represented here.
 */
export const household: Household = {
  id: 'hh-1',
  name: 'The Ellis Household',
  user: { id: 'user-1', name: 'Maren Ellis', role: 'parent' },
  children: [
    { id: 'child-1', name: 'Josie', role: 'child', age: 8 },
    { id: 'child-2', name: 'Theo', role: 'child', age: 5 },
  ],
  coParent: { id: 'coparent-1', name: 'Nate', role: 'co-parent' },
};
