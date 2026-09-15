/**
 * Her Keys+ entitlement contract.
 *
 * RevenueCat's CustomerInfo is the only authority for whether a customer
 * holds `her_keys_plus`. Nothing in this module, or anywhere under
 * `src/monetization`, persists that fact into household state — see
 * docs/builds/BUILD25_MONETIZATION_FOUNDATION.md.
 */

export const HER_KEYS_PLUS_ENTITLEMENT = 'her_keys_plus';

/** A short-lived, non-authoritative UI read of subscription standing. Never the source of truth. */
export type EntitlementState = 'unknown' | 'free' | 'plus';

/**
 * Build 2.5 default: absence of a configured Offering, or dismissing the
 * paywall, must not make onboarding — or any existing free functionality —
 * impossible. Business/product configuration, not household state.
 */
export type PaywallPolicy = 'soft' | 'enforced';
export const PAYWALL_POLICY: PaywallPolicy = 'soft';

/**
 * Every reason a paywall can open. A presentation is interpreted by this
 * semantic reason, never by the route name that happened to trigger it.
 */
export const PAYWALL_PLACEMENTS = ['onboarding_complete', 'systems_upgrade', 'premium_feature', 'manual_upgrade'] as const;
export type PaywallPlacement = (typeof PAYWALL_PLACEMENTS)[number];

export type PaywallOutcome =
  | { kind: 'purchased' }
  | { kind: 'restored' }
  | { kind: 'cancelled' }
  | { kind: 'already_entitled' }
  | { kind: 'continued_without_plus' }
  | { kind: 'no_offering' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

export type RestoreOutcome =
  | { kind: 'restored' }
  | { kind: 'no_purchases_found' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

/**
 * `her_keys_plus` active -> `plus`. Resolved with no active entitlement ->
 * `free`. Anything that could not be resolved (offline, unconfigured, SDK
 * error) is the caller's job to represent as `unknown`, which must fail open
 * for existing free functionality rather than claim the customer unsubscribed.
 */
export function deriveEntitlementState(activeEntitlementIds: readonly string[]): EntitlementState {
  return activeEntitlementIds.includes(HER_KEYS_PLUS_ENTITLEMENT) ? 'plus' : 'free';
}

/**
 * The one place `null` (the check could not be resolved — unconfigured,
 * offline, SDK error) becomes `unknown`. Every caller goes through this
 * instead of re-deciding the fallback for itself.
 */
export function resolveEntitlementState(activeEntitlementIds: readonly string[] | null): EntitlementState {
  return activeEntitlementIds === null ? 'unknown' : deriveEntitlementState(activeEntitlementIds);
}

/** How the onboarding paywall step was left, regardless of which affordance produced it. */
export type OnboardingPlusResolution =
  | 'already_entitled'
  | 'purchased'
  | 'restored'
  | 'continued_without_plus'
  | 'no_offering_fallback';

/**
 * Whether reaching this resolution may complete onboarding under the given
 * policy. Onboarding completion never inspects CustomerInfo itself — this is
 * the one place that decision is made, so it stays a single, tested rule
 * instead of a UI affordance that could be silently removed.
 */
export function canResolveOnboardingPlus(resolution: OnboardingPlusResolution, policy: PaywallPolicy): boolean {
  if (resolution === 'already_entitled' || resolution === 'purchased' || resolution === 'restored') return true;
  return policy === 'soft';
}
