import type { ReactNode } from 'react';
import { Screen } from '../../../design/components';
import type { LocalDate } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';
import { calendarAvailability, type StoreSnapshotLike } from '../model/availability';
import { CalendarLoading, CalendarRecovery } from './CalendarStates';

/**
 * The gate between the store and everything that REASONS. Calendar derives capacity, conflicts and openings
 * only inside `ready`, which is called only for a loaded, authoritative household. While the household is
 * loading, nothing is asserted (in particular, not "nothing scheduled"); after a recovery, the substituted
 * state is not the household's, so nothing is derived from it.
 */
export function CalendarGate({
  snapshot,
  ready,
}: {
  snapshot: StoreSnapshotLike & { state: AppState | null };
  ready: (state: AppState, today: LocalDate, degraded: boolean) => ReactNode;
}) {
  const availability = calendarAvailability(snapshot);
  if (availability.kind === 'loading') {
    return (
      <Screen>
        <CalendarLoading />
      </Screen>
    );
  }
  if (availability.kind === 'recovery' || snapshot.state === null || snapshot.today === null) {
    return (
      <Screen>
        <CalendarRecovery />
      </Screen>
    );
  }
  return <>{ready(snapshot.state, snapshot.today, availability.persistenceDegraded)}</>;
}
