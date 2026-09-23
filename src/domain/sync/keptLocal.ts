import { logicalDateAt, type LocalDate } from '../logicalDay';
import type { AppState } from '../state';
import { mappingKey, type SyncEntityKind, type SyncNamespace } from './syncTypes';

/**
 * ONE MOVES KEPT ON THIS DEVICE (HK13-D28).
 *
 * The server owns the logical day (HR-03): a NEW One Move is stamped with the server's today, whatever the device knows, and
 * "historical days can only ever enter through claim". So a move for a day that has already passed, which the cloud has never
 * seen — decided offline, or its push kept failing until midnight — cannot be sent on the live path: it would land as TODAY's
 * move, carrying what she did on an earlier day, and today's real decision would be refused as a competing one. Such a move is
 * history that stays on this device, exactly as she made it, and so does every fact about it (its observations, the evidence for
 * it), since the cloud cannot hold a row that points at a move it will never have.
 *
 * A move the cloud already holds is never kept back: an update cannot move its day (the server pins it on update).
 */

/** Today as the push path judges it: the account's timezone, the device's clock (the same rule the store decides moves by). */
export const syncToday = (state: AppState, nowMs: number): LocalDate => logicalDateAt(nowMs, state.user.timezone);

/** Local ids of the One Moves kept on this device: an earlier day's, never acknowledged by the cloud. */
export function keptMoveIds(state: AppState, namespace: SyncNamespace, today: LocalDate): Set<string> {
  return new Set(
    state.oneMoves
      .filter((move) => move.forDate !== today && namespace.mappings[mappingKey('oneMove', move.id)] === undefined)
      .map((move) => move.id)
  );
}

/** Whether a row is one of the kept moves, or a fact about one: an observation of it or the evidence for it. */
export function isKeptLocal(kind: SyncEntityKind, localId: string, row: unknown, kept: ReadonlySet<string>): boolean {
  if (kept.size === 0) return false;
  if (kind === 'oneMove') return kept.has(localId);
  const ref = kind === 'observation' ? (row as { about?: { kind: string; id: string } }).about
    : kind === 'evidenceLink' ? (row as { for?: { kind: string; id: string } }).for
    : undefined;
  return ref?.kind === 'oneMove' && kept.has(ref.id);
}
