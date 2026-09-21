/**
 * A recording stand-in for `expo-router`, for Today's component tests.
 *
 * Real `expo-router` needs Metro's pipeline (see tests/support/rn-stub.tsx for the same reason
 * `react-native` is stubbed). Today's components call only `router.push`, and the tests care about
 * WHERE she is sent, so this records every call. It is registered by `stub-expo-router.mjs`, for this
 * feature's tests only — no shared test support is changed.
 */
export const router = {
  calls: [],
  push(...args) {
    router.calls.push(args);
  },
  reset() {
    router.calls.length = 0;
  },
};

export const useLocalSearchParams = () => ({});
export default { router, useLocalSearchParams };
