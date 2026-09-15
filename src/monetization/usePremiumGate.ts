import { useCallback } from 'react';
import { useEntitlement } from './RevenueCatProvider';
import { checkFeatureAccess, type FeatureKey } from './featureAccess';
import type { PaywallPlacement } from './entitlement';

export interface RequirePlusInput {
  placement: PaywallPlacement;
  feature: FeatureKey;
}

/**
 * The single call a future premium capability makes. It never imports
 * RevenueCat, never reads CustomerInfo, and never decides free-vs-paid
 * itself — that stays in `featureAccess.ts`. Returns whether the caller may
 * proceed, presenting the paywall first if the feature is gated and not yet
 * unlocked.
 */
export function usePremiumGate() {
  const { status, presentPaywall } = useEntitlement();

  return useCallback(
    async ({ placement, feature }: RequirePlusInput): Promise<boolean> => {
      if (status === 'loading') return checkFeatureAccess(feature, 'unknown').allowed;
      if (checkFeatureAccess(feature, status).allowed) return true;

      const outcome = await presentPaywall(placement);
      return outcome.kind === 'purchased' || outcome.kind === 'restored' || outcome.kind === 'already_entitled';
    },
    [status, presentPaywall]
  );
}
