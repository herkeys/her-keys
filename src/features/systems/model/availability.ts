import type { HydrationStatus } from '../../../domain/routeAccess';
import type { LocalDate } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';
import type { HubAvailability } from './types';

/**
 * The slice of the store snapshot Systems needs to decide whether it may show anything at all.
 * Structural, so the feature never imports the store and tests can hand it plain objects.
 */
export interface SnapshotSlice {
  status: HydrationStatus;
  state: AppState | null;
  today: LocalDate | null;
  recovery: { reason: string; quarantined: boolean } | null;
  persistence: 'enabled' | 'disabled';
}

/**
 * KNOWN NO SYSTEMS ≠ HYDRATING ≠ RECOVERING ≠ UNRESOLVED.
 *
 *  - Not settled yet → `loading`. Never an empty state, never a "create one" prompt.
 *  - Persistence disabled (newer-version data, unreadable storage, real data under a demo build):
 *    this session's state is a STAND-IN. Its Systems are not hers and nothing saved would survive,
 *    so nothing is shown and nothing can be edited (`unavailable`).
 *  - A normal start-over recovery: the fresh state IS authoritative, so Systems show, with a calm
 *    notice that earlier data was set aside.
 */
export function availabilityOf(snapshot: SnapshotSlice): HubAvailability {
  if (snapshot.status !== 'ready' && snapshot.status !== 'recovery') return { kind: 'loading' };
  if (snapshot.state === null || snapshot.today === null) return { kind: 'loading' };

  if (snapshot.persistence === 'disabled') {
    const reason = snapshot.recovery?.reason;
    return { kind: 'unavailable', reason: reason === 'future_version' ? 'newer_version' : reason === 'read_failed' ? 'unreadable' : 'memory_only' };
  }
  return { kind: 'ready', notice: snapshot.recovery !== null ? 'started_over' : null };
}
