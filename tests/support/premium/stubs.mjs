/**
 * Test doubles for the Premium surfaces: the entitlement provider (RevenueCat boundary), the onboarding store and the Systems hub.
 * The surfaces and hooks under test are the real ones.
 */
export const fixture = {
  navigation: [],
  purchaseReady: true,
  entitlement: { status: 'free', isPlus: false, presentPaywall: async () => ({ kind: 'cancelled' }), restore: async () => ({ kind: 'no_purchases_found' }), refresh: async () => {} },
  onboarding: { completeCalls: 0, complete: async () => true },
  manifest: ['daily_load_premium', 'smart_inbox_extract', 'momentum_report'].map((featureKey) => ({ featureKey, tier: 'premium', available: true })),
};
export const router = { push: (path) => fixture.navigation.push(path) };

export const useEntitlement = () => fixture.entitlement;
export const useOnboarding = () => ({
  complete: async () => {
    fixture.onboarding.completeCalls += 1;
    return fixture.onboarding.complete();
  },
});
export const SystemsHub = () => null;

/** Controlled server manifest stub for onboarding's read-only launch gate. */
export const usePremiumStateIfMounted = () => ({ snapshot: { manifest: fixture.manifest }, canOfferPurchase: async () => fixture.purchaseReady });
