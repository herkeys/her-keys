import type { StoreSnapshot } from '../../../state/appStore';
import type { HomeView } from './types';

/**
 * WHAT HOME MAY SAY ABOUT ITSELF, decided from the store snapshot and the projection — never in JSX.
 *
 *   LOADING / HYDRATING  !=  EMPTY
 *   EMPTY                !=  NOTHING AT HOME NEEDS ATTENTION
 *   RECOVERED / STARTED-OVER STATE  !=  EMPTY
 *
 * The store swaps in a FRESH household when saved data could not be used (`recovery`). A screen that only read `state` would show
 * that fresh household as an empty Home. So Home reads the snapshot: while it is not settled it says it is loading, and once
 * settled after a recovery it says what happened — it never renders the plain empty state.
 */

export interface HomeReadiness {
  /** False until the store has loaded a household. Nothing about the home may be said before that. */
  settled: boolean;
  /** Set when saved data could not be used and this session started over. */
  recovery: { reason: string; quarantined: boolean } | null;
  /** This session cannot make changes durable (memory-only, or writes are failing). */
  memoryOnly: boolean;
}

export function homeReadiness(snapshot: Pick<StoreSnapshot, 'status' | 'state' | 'today' | 'recovery' | 'persistence' | 'persistenceDegraded'>): HomeReadiness {
  const settled = (snapshot.status === 'ready' || snapshot.status === 'recovery') && snapshot.state !== null && snapshot.today !== null;
  return {
    settled,
    recovery: settled && snapshot.recovery !== null ? { reason: snapshot.recovery.reason, quarantined: snapshot.recovery.quarantined } : null,
    memoryOnly: settled && (snapshot.persistence === 'disabled' || snapshot.persistenceDegraded),
  };
}

export type HomeScreenState =
  | { kind: 'loading' }
  /** No category carries the home role: Home cannot say what belongs to the home. Never rendered as empty. */
  | { kind: 'missing_context' }
  /** Recovered or started over, and nothing to list: this is NOT an empty Home. */
  | { kind: 'unrecovered_empty'; reason: string; quarantined: boolean }
  /** Settled, nothing to list. `anySaved` is true when Home records exist that are simply not open (removed, or old completed work). */
  | { kind: 'empty'; anySaved: boolean }
  | { kind: 'content' };

export function homeScreenState(readiness: HomeReadiness, view: HomeView | null): HomeScreenState {
  if (!readiness.settled || view === null) return { kind: 'loading' };
  if (view.context.kind === 'missing') return { kind: 'missing_context' };
  if (view.items.length > 0) return { kind: 'content' };
  if (readiness.recovery !== null) return { kind: 'unrecovered_empty', reason: readiness.recovery.reason, quarantined: readiness.recovery.quarantined };
  return { kind: 'empty', anySaved: view.coverage.recordsConsidered > 0 };
}
