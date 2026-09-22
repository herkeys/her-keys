/**
 * What Money Home may say about an empty ledger. "Nothing needs attention." is true only when the
 * household has actually been read — the same reasoning as Meals' own gate (mealsGate.ts).
 */

export type MoneyScreenState = 'loading' | 'recovery' | 'ready';

export interface MoneyGateInput {
  storeStatus: 'unhydrated' | 'hydrating' | 'ready' | 'recovery';
  persistence: 'enabled' | 'disabled';
  syncHydration: 'unhydrated' | 'hydrating' | 'ready' | null;
}

export interface MoneyGate {
  state: MoneyScreenState;
  canWrite: boolean;
}

export function moneyGate(input: MoneyGateInput): MoneyGate {
  if (input.storeStatus === 'unhydrated' || input.storeStatus === 'hydrating') return { state: 'loading', canWrite: false };
  if (input.storeStatus === 'recovery') return { state: 'recovery', canWrite: false };
  if (input.syncHydration !== null && input.syncHydration !== 'ready') return { state: 'loading', canWrite: false };
  return { state: 'ready', canWrite: input.persistence === 'enabled' };
}
