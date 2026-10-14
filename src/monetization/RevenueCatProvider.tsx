import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState as NativeAppState } from 'react-native';
import {
  resolveEntitlementState,
  type EntitlementState,
  type PaywallOutcome,
  type PaywallPlacement,
  type RestoreOutcome,
} from './entitlement';
import {
  configureRevenueCat,
  fetchActiveEntitlementIds,
  fetchCurrentOffering,
  presentRevenueCatPaywall,
  restoreRevenueCatPurchases,
  getRevenueCatIdentity,
  subscribeRevenueCatIdentity,
  type RevenueCatIdentity,
} from './revenueCatClient';

/** `'loading'` only while the very first check is in flight; afterward this always settles to one of `EntitlementState`. */
export type EntitlementStatus = 'loading' | EntitlementState;

export interface EntitlementContextValue {
  status: EntitlementStatus;
  isPlus: boolean;
  refresh: () => Promise<void>;
  presentPaywall: (placement: PaywallPlacement) => Promise<PaywallOutcome>;
  restore: (expectedAccountId?: string) => Promise<RestoreOutcome>;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

/**
 * Owns RevenueCat lifecycle: configure once, refresh CustomerInfo on mount
 * and whenever the app returns to the foreground, and expose the
 * application-level questions screens actually need. RevenueCat imports are
 * concentrated in `revenueCatClient.ts`; nothing here reaches into a
 * CustomerInfo object shape.
 */
export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const identity = useSyncExternalStore(subscribeRevenueCatIdentity, getRevenueCatIdentity, getRevenueCatIdentity);
  const [resolved, setResolved] = useState<{ identity: RevenueCatIdentity; status: EntitlementStatus } | null>(null);
  const status: EntitlementStatus = identity.accountId === null ? 'unknown' : resolved?.identity === identity ? resolved.status : 'loading';
  const statusRef = useRef<EntitlementStatus>('loading');
  statusRef.current = status;

  const refresh = useCallback(async () => {
    configureRevenueCat();
    const owner = getRevenueCatIdentity();
    const ids = await fetchActiveEntitlementIds();
    if (owner === getRevenueCatIdentity()) setResolved({ identity: owner, status: resolveEntitlementState(ids) });
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh, identity]);

  const presentPaywall = useCallback(
    async (placement: PaywallPlacement): Promise<PaywallOutcome> => {
      const owner = getRevenueCatIdentity();
      if (owner.accountId === null) return { kind: 'unavailable' };
      if (statusRef.current === 'plus') return { kind: 'already_entitled' };

      const offering = await fetchCurrentOffering();
      if (owner !== getRevenueCatIdentity()) return { kind: 'unavailable' };
      const outcome = await presentRevenueCatPaywall(offering, owner.accountId);
      if (owner !== getRevenueCatIdentity()) return { kind: 'unavailable' };
      if (outcome.kind === 'purchased' || outcome.kind === 'restored') await refresh();
      if (__DEV__) console.info(`[herkeys] ${JSON.stringify({ type: 'paywall_presented', placement, outcome: outcome.kind })}`);
      return outcome;
    },
    [refresh]
  );

  const restore = useCallback(async (expectedAccountId?: string): Promise<RestoreOutcome> => {
    const outcome = await restoreRevenueCatPurchases(expectedAccountId);
    if (outcome.kind === 'restored') await refresh();
    return outcome;
  }, [refresh]);

  const value = useMemo<EntitlementContextValue>(
    () => ({ status, isPlus: status === 'plus', refresh, presentPaywall, restore }),
    [status, refresh, presentPaywall, restore]
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used within RevenueCatProvider');
  return ctx;
}
