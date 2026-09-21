import type { AccountState } from '../../domain/account/authState';
import type { StoreSnapshot } from '../../state/appStore';

/**
 * WHETHER THE HUB MAY SAY ANYTHING AT ALL.
 *
 * LOADING is not EMPTY, and a household that could not be read is not EMPTY either. An empty projection is only meaningful once the
 * household the user actually saved has been loaded; until then the screen must not offer a reassuring "nothing here". This is a pure
 * function of the store snapshot and the account state, so the rule is testable without rendering.
 */
export type Availability =
  | { kind: 'loading' }
  /** Stored data could not be used (damaged, newer version, unreadable, other data mode): what is on screen is a FRESH household, not hers. */
  | { kind: 'unrecovered'; reason: string; quarantined: boolean }
  /** This device holds another account's household. It is never rendered. */
  | { kind: 'other_account' }
  | { kind: 'ready' };

export function availabilityOf(snapshot: Pick<StoreSnapshot, 'status' | 'state' | 'recovery'>, account: AccountState): Availability {
  if (snapshot.status === 'unhydrated' || snapshot.status === 'hydrating' || snapshot.state === null) return { kind: 'loading' };
  if (account.kind === 'boundOther') return { kind: 'other_account' };
  // A provider flow is in flight: the account this screen belongs to is about to change.
  if (account.kind === 'authenticating') return { kind: 'loading' };
  if (snapshot.recovery !== null) return { kind: 'unrecovered', reason: snapshot.recovery.reason, quarantined: snapshot.recovery.quarantined };
  return { kind: 'ready' };
}
