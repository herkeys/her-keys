import { useMemo, type ReactNode } from 'react';
import { usePremiumState } from '../../monetization/PremiumStateProvider';
import { isEntitledState } from '../../monetization/premiumTypes';
import { PremiumReaderContext, type PremiumReaderView } from './premiumReaderContext';

/**
 * Publishes Premium's SERVER-confirmed state to Talk It Out as a small read-only view. Mount inside `PremiumStateProvider`.
 * `entitled` is the server's projection (premium_active, canceled-but-paid, billing grace); the store SDK is never consulted here.
 */
export function PremiumReaderBridge({ children }: { children: ReactNode }) {
  const { snapshot, accountBound, householdId, appVersion, extract } = usePremiumState();
  const entitled = snapshot.server !== null && isEntitledState(snapshot.server.state);
  const view = useMemo<PremiumReaderView>(() => ({ accountBound, householdId, entitled, appVersion, extract }), [accountBound, householdId, entitled, appVersion, extract]);
  return <PremiumReaderContext.Provider value={view}>{children}</PremiumReaderContext.Provider>;
}
