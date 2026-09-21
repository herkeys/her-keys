/**
 * What the Meals screen may say about an empty plan. "No meals planned yet." is true only when the household has actually been
 * read: an empty household state can also mean the store is still loading, that stored data could not be read and Her Keys
 * started fresh, or that a second device has not yet pulled the household from the cloud. In each of those the emptiness is not
 * a fact about her meals, so the screen must not word it as one.
 */

export type MealsScreenState = 'loading' | 'recovery' | 'ready';

export interface MealsGateInput {
  /** The household store's own status. */
  storeStatus: 'unhydrated' | 'hydrating' | 'ready' | 'recovery';
  /** Whether persistence is writing to storage. `disabled` means edits would live in memory only. */
  persistence: 'enabled' | 'disabled';
  /** Null when the household is not bound to an account (a local household has no cloud hydration to wait for). */
  syncHydration: 'unhydrated' | 'hydrating' | 'ready' | null;
}

export interface MealsGate {
  state: MealsScreenState;
  /** Whether a new plan can be saved and expected to last. Never while loading, recovering, or when edits would be memory-only. */
  canWrite: boolean;
}

export function mealsGate(input: MealsGateInput): MealsGate {
  if (input.storeStatus === 'unhydrated' || input.storeStatus === 'hydrating') return { state: 'loading', canWrite: false };
  if (input.storeStatus === 'recovery') return { state: 'recovery', canWrite: false };
  // An account-bound device that has not finished its first pull is showing what it holds so far, which may be nothing.
  if (input.syncHydration !== null && input.syncHydration !== 'ready') return { state: 'loading', canWrite: false };
  return { state: 'ready', canWrite: input.persistence === 'enabled' };
}

export const mealsScreenState = (input: MealsGateInput): MealsScreenState => mealsGate(input).state;
