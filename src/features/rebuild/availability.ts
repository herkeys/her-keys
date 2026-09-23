import type { AccountState } from '../../domain/account/authState';
import type { StoreSnapshot } from '../../state/appStore';

/**
 * WHETHER ME / REBUILD MAY SHOW ANYTHING AT ALL.
 *
 * The same rule the Co-Parent and Systems surfaces keep, kept here as their own copies are (there is no shared gate yet; see the F11
 * ledger's integration candidates). LOADING is not EMPTY: the calm empty state is only ever said of a household that was read. A
 * household that could not be read, and another account's household, show nothing of the Focuses at all — private truth is never
 * rendered for an account it does not belong to.
 */
export type RebuildAvailability =
  | { kind: 'loading' }
  | { kind: 'unrecovered' }
  | { kind: 'other_account' }
  /** `canWrite` is false when this session must not touch stored state: it can read, but offers no edits. */
  | { kind: 'ready'; canWrite: boolean };

export function rebuildAvailabilityOf(
  snapshot: Pick<StoreSnapshot, 'status' | 'state' | 'recovery' | 'persistence'>,
  account: Pick<AccountState, 'kind'>
): RebuildAvailability {
  if (snapshot.status === 'unhydrated' || snapshot.status === 'hydrating' || snapshot.state === null) return { kind: 'loading' };
  if (account.kind === 'boundOther') return { kind: 'other_account' };
  if (account.kind === 'authenticating') return { kind: 'loading' };
  if (snapshot.recovery !== null) return { kind: 'unrecovered' };
  return { kind: 'ready', canWrite: snapshot.persistence === 'enabled' };
}
