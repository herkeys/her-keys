/**
 * What the Life Admin screen may say about having no records. "Add one record…" is true only when the household has actually been
 * read: an empty state can also mean the store is still loading, that stored data could not be read, or that a second device has
 * not yet pulled her records from the cloud. In each of those the emptiness is not a fact about her records.
 */

export type LifeAdminScreenState = 'loading' | 'recovery' | 'ready';

export interface LifeAdminGateInput {
  storeStatus: 'unhydrated' | 'hydrating' | 'ready' | 'recovery';
  persistence: 'enabled' | 'disabled';
  /** Null when the household is not bound to an account. */
  syncHydration: 'unhydrated' | 'hydrating' | 'ready' | null;
}

export interface LifeAdminGate {
  state: LifeAdminScreenState;
  /** A save can be expected to last. Never while loading, recovering, or when edits would live in memory only. */
  canWrite: boolean;
}

export function lifeAdminGate(input: LifeAdminGateInput): LifeAdminGate {
  if (input.storeStatus === 'unhydrated' || input.storeStatus === 'hydrating') return { state: 'loading', canWrite: false };
  if (input.storeStatus === 'recovery') return { state: 'recovery', canWrite: false };
  if (input.syncHydration !== null && input.syncHydration !== 'ready') return { state: 'loading', canWrite: false };
  return { state: 'ready', canWrite: input.persistence === 'enabled' };
}
