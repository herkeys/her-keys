import type { LocalDate } from '../../../domain/logicalDay';

/**
 * KNOWN EMPTY is not HYDRATING is not RECOVERY (contract section 47).
 *
 * The store reports a status and possibly a recovery. Calendar reads only whether it may REASON:
 *  - `loading`   — the household has not loaded, so "nothing scheduled" would be a claim about
 *                  something unknown. Nothing is shown as empty.
 *  - `recovery`  — the store substituted a fresh state for data it could not recover. That state is
 *                  not the household's, so no capacity, conflict or opening is derived from it.
 *  - `ready`     — the household is loaded and authoritative. Only here can an empty day be
 *                  called empty.
 * `persistenceDegraded` is product-level uncertainty ("some recent changes may not be saved") and is
 * the only infrastructure-derived fact Calendar surfaces: no cursor, queue count or sync badge.
 */
export interface StoreSnapshotLike {
  status: string;
  state: unknown | null;
  today: LocalDate | null;
  recovery: unknown | null;
  persistenceDegraded: boolean;
}

export type CalendarAvailability = { kind: 'loading' } | { kind: 'recovery' } | { kind: 'ready'; persistenceDegraded: boolean };

export function calendarAvailability(snapshot: StoreSnapshotLike): CalendarAvailability {
  if (snapshot.status === 'unhydrated' || snapshot.status === 'hydrating' || snapshot.state === null || snapshot.today === null) {
    return { kind: 'loading' };
  }
  if (snapshot.status === 'recovery' || snapshot.recovery !== null) return { kind: 'recovery' };
  return { kind: 'ready', persistenceDegraded: snapshot.persistenceDegraded };
}
