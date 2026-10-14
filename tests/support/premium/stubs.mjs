/**
 * Test doubles for the Premium surfaces: the entitlement provider (RevenueCat boundary), the onboarding store and the Systems hub.
 * The surfaces and hooks under test are the real ones.
 */
export const fixture = {
  navigation: [],
  entitlement: { status: 'free', isPlus: false, presentPaywall: async () => ({ kind: 'cancelled' }), restore: async () => ({ kind: 'no_purchases_found' }), refresh: async () => {} },
  onboarding: { completeCalls: 0, complete: async () => true },
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
