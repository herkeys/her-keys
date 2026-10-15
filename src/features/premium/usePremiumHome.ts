import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { premiumHomeCopyFor, capabilityViews, type CapabilityView, type PremiumHomeCopy } from '../../monetization/premiumHomeCopy';
import { derivePremiumHomeState, type PremiumHomeState } from '../../monetization/premiumHomeState';
import { usePremiumState, usePremiumUpgrade, type PremiumUpgradeApi } from '../../monetization/PremiumStateProvider';
import { useEntitlement } from '../../monetization/RevenueCatProvider';
import { defaultManageDeps, openSubscriptionManagement, type ManageDeps } from '../../monetization/subscriptionManagement';

export const MANAGE_UNAVAILABLE_NOTICE = 'Her Keys couldn’t open your store’s subscription settings. Open your store app and look for Subscriptions. Nothing has changed on your account.';

export interface PremiumHomeApi {
  state: PremiumHomeState;
  copy: PremiumHomeCopy;
  capabilities: CapabilityView[];
  /** The purchase interface (the store's own paywall). Verification is handed to the SERVER after a purchase. */
  upgrade: PremiumUpgradeApi;
  /** "Check again": the server re-reads the store's record for THIS account. */
  verify: () => Promise<void>;
  /** "Try again": re-read the server's view. */
  retry: () => Promise<void>;
  /** Open the platform's own subscriptions screen. */
  manage: () => Promise<void>;
  managing: boolean;
  manageNotice: string | null;
}

/**
 * The Premium home's one hook. Every statement it makes about her subscription comes from the SERVER's state (through the same
 * derivation every Premium feature uses); the store SDK is a hint that can only make the app verify. It never calls the store's
 * restore (the Account surface owns the one Restore control) and it never shows a price.
 *
 * `manageDeps` is for tests; production reads the platform.
 */
export function usePremiumHome(manageDeps?: ManageDeps): PremiumHomeApi {
  const { snapshot, controller, accountBound, isCurrent } = usePremiumState();
  const { status: storeStatus } = useEntitlement();
  const upgrade = usePremiumUpgrade('manual_upgrade');
  const mounted = useRef(true);
  const managingRef = useRef(false);
  const [managing, setManaging] = useState(false);
  const [manageNotice, setManageNotice] = useState<string | null>(null);

  const state = useMemo(() => derivePremiumHomeState({ accountBound, snapshot, storeStatus }), [accountBound, snapshot, storeStatus]);
  const copy = useMemo(() => premiumHomeCopyFor(state), [state]);
  const capabilities = useMemo(() => capabilityViews(state, snapshot.manifest), [state, snapshot.manifest]);

  useEffect(() => {
    mounted.current = true;
    // Opening the home shows what the server says NOW, not what it said when the app last came to the foreground.
    if (isCurrent()) void controller.refresh();
    return () => {
      mounted.current = false;
    };
  }, [controller, isCurrent]);

  const verify = useCallback(() => (isCurrent() ? controller.startVerification() : Promise.resolve()), [controller, isCurrent]);
  const retry = useCallback(() => (isCurrent() ? controller.refresh() : Promise.resolve()), [controller, isCurrent]);

  const manage = useCallback(async () => {
    if (managingRef.current) return;
    managingRef.current = true;
    setManaging(true);
    setManageNotice(null);
    try {
      const outcome = await openSubscriptionManagement(manageDeps ?? defaultManageDeps(Platform.OS));
      if (mounted.current) setManageNotice(outcome === 'opened' ? null : MANAGE_UNAVAILABLE_NOTICE);
    } finally {
      managingRef.current = false;
      if (mounted.current) setManaging(false);
    }
  }, [manageDeps]);

  return { state, copy, capabilities, upgrade, verify, retry, manage, managing, manageNotice };
}
