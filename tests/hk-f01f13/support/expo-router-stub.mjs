/**
 * A recording stand-in for `expo-router` for the integration audit's screen tests (the Today stub records `push` only and has no
 * route params or navigation object). Every navigation is recorded; `router.params` is what `useLocalSearchParams` returns.
 */
export const router = {
  calls: [],
  params: {},
  push(...args) { router.calls.push(['push', ...args]); },
  replace(...args) { router.calls.push(['replace', ...args]); },
  back(...args) { router.calls.push(['back', ...args]); },
  reset() { router.calls.length = 0; router.params = {}; },
};
export const useLocalSearchParams = () => router.params;
const navigation = { setOptions() {} };
export const useNavigation = () => navigation;
export default { router, useLocalSearchParams, useNavigation };
