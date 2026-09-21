/**
 * The shared `react-native` test stub, plus the one export `AppStateProvider` needs (`AppState`), for the
 * hook-level tests of Today only. It re-exports the shared stub unchanged and adds a no-op `AppState`; nothing in
 * tests/support is modified.
 */
export * from '../../support/rn-stub.tsx';

export const AppState = {
  addEventListener() {
    return { remove() {} };
  },
};
