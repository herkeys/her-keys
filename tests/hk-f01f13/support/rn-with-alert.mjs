/**
 * The `react-native` test stub with AppState (Today's variant), plus the one export the dormant Google Calendar panel needs (`Alert`).
 * It re-exports what exists unchanged and adds a recording `Alert`; nothing in tests/support or tests/today is modified.
 */
export * from '../../today/support/rn-with-appstate.mjs';

export const Alert = {
  calls: [],
  alert(...args) { Alert.calls.push(args); },
};
