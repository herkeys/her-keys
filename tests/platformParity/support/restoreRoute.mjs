export const fixture = { account: null, entitlement: null, navigation: [] };
export const useAccount = () => fixture.account;
export const useEntitlement = () => fixture.entitlement;
export const accountProviders = { available: async () => [] };
export const router = { back: () => fixture.navigation.push('back') };
export const WelcomeAuthFlow = () => null;
// V2UP-E added a status section to the account screen that reads notifications, location and consent; this test is about Restore Purchases, and that section has its own tests (v2up.e.accountStatus).
export const AccountStatusSection = () => null;
export const deletionRuntime = { request: async () => { throw new Error('Deletion is not authorized by a Restore Purchases test.'); } };
