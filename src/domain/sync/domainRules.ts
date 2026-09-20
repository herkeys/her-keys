import type { AppState } from '../state';
import { sameCloudValue, type LocalIdResolver } from './applySupport';
import { classify, withoutClash, type Encounter, type IsPending } from './clash';
import { toCloudRow, type ProjectionContext } from './projection';
import type { SyncEntityKind } from './syncTypes';

/**
 * The two decisions the pull engine cannot make for itself, as product code.
 *
 * The engine is shape-free by design: it does not know what a One Move is, or that two devices can
 * each answer the same intent. These are the callbacks that carry that knowledge in, so wiring a
 * coordinator is one line and every test exercises the rules the product will.
 */

/**
 * Whether the server row IS what this device was trying to send — how a lost acknowledgement is told
 * apart from somebody else's edit. It compares what the device would send with what the cloud holds,
 * column by column, so an acknowledgement that was lost settles instead of raising a conflict the
 * device would be inventing against itself.
 */
export function rowMatchesLocal(state: AppState, ctx: ProjectionContext, kind: SyncEntityKind, localId: string, row: Record<string, unknown>): boolean {
  let mine: Record<string, unknown>;
  try {
    mine = toCloudRow(state, ctx, kind, localId);
  } catch {
    return false;
  }
  const notCompared = new Set(['household_id', 'local_id', 'profile_id']);
  return Object.entries(mine).every(([column, value]) => notCompared.has(column) || sameCloudValue(value, row[column] ?? null));
}

/**
 * The local row an incoming authoritative row displaces, if any — a domain uniqueness rule that means
 * two devices legitimately decided the same slot. See `clash.ts`.
 */
export function displacedBy(
  state: AppState,
  kind: SyncEntityKind,
  _localId: string,
  row: Record<string, unknown>,
  resolve: LocalIdResolver,
  isPending: IsPending
): Encounter | null {
  return classify(state, kind, row, resolve, isPending);
}

/** Remove the displaced local row, so state never holds two answers to one question. */
export const dropLocal = (state: AppState, kind: SyncEntityKind, localId: string): AppState => withoutClash(state, kind, localId);
