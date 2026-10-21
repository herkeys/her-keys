// Stand-ins for DeletionGate's runtime imports (expo-router, the deletion and account runtimes, the store snapshot). The test
// publishes gate states directly, exactly as the real runtime's restrict()/check() do.
const listeners = new Set();
export const gateFixture = { gate: { kind: 'checking' }, hydrated: true, checks: 0 };
export const publishGate = (gate) => { gateFixture.gate = gate; for (const listener of listeners) listener(); };
export const deletionRuntime = {
  getSnapshot: () => gateFixture.gate,
  subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  check: async () => { gateFixture.checks++; },
  restrict: () => publishGate({ kind: 'checking' }),
  continueToSignIn: () => {},
  importReceipt: async () => {},
  resetLocalData: async () => {},
  localAccountId: () => null,
};
export const accountRuntime = { subscribe: () => () => {} };
export const useStoreSnapshot = () => ({ state: gateFixture.hydrated ? {} : null });
export const SplashScreen = { hide: () => {} };
