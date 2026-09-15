/**
 * Semantic feature-access layer. Future premium code asks
 * `checkFeatureAccess('some_feature', entitlement)` — never RevenueCat, and
 * never `customerInfo.entitlements.active[...]` directly. This file must not
 * import RevenueCat (proven by a source scan in tests/monetization.test.mjs),
 * so the free/plus boundary can move later without touching any screen.
 */
import type { EntitlementState } from './entitlement';

type FeatureAccessLevel = 'free' | 'plus';

/**
 * A small number of real placeholders for Build 2.5. This is not the full
 * Her Keys+ package — no existing Build 1/2 functionality is locked here.
 */
const FEATURE_KEYS = ['daily_load_core', 'advanced_daily_load_patterns', 'momentum_insights'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_ACCESS: Record<FeatureKey, FeatureAccessLevel> = {
  // Existing Build 1/2 functionality. Recorded explicitly so the free/plus
  // boundary lives in one manifest instead of being implied by omission.
  daily_load_core: 'free',
  advanced_daily_load_patterns: 'plus',
  momentum_insights: 'plus',
};

export interface FeatureAccessResult {
  allowed: boolean;
  reason: 'granted_free' | 'granted_plus' | 'requires_plus' | 'entitlement_unknown';
}

/**
 * Free features are always allowed, independent of entitlement status. A
 * Plus feature is allowed only once `plus` is actually confirmed; an
 * unresolved check reports `entitlement_unknown` rather than falsely
 * declaring the customer unsubscribed.
 */
export function checkFeatureAccess(featureKey: FeatureKey, entitlement: EntitlementState): FeatureAccessResult {
  const required = FEATURE_ACCESS[featureKey];
  if (required === 'free') return { allowed: true, reason: 'granted_free' };
  if (entitlement === 'plus') return { allowed: true, reason: 'granted_plus' };
  if (entitlement === 'unknown') return { allowed: false, reason: 'entitlement_unknown' };
  return { allowed: false, reason: 'requires_plus' };
}
