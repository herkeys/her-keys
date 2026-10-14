export const fixture = { account: null, entitlement: null, navigation: [] };
export const useAccount = () => fixture.account;
export const useEntitlement = () => fixture.entitlement;
export const accountProviders = { available: async () => [] };
export const router = { back: () => fixture.navigation.push('back') };
export const WelcomeAuthFlow = () => null;
export const deletionRuntime = { request: async () => { throw new Error('Deletion is not authorized by a Restore Purchases test.'); } };
