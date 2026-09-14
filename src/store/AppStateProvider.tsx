import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { AppState as NativeAppState } from 'react-native';
import type { LocalDate } from '../domain/logicalDay';
import type { AppState } from '../domain/state';
import type { AppStore, StoreSnapshot } from '../state/appStore';

const AppStoreContext = createContext<AppStore | null>(null);

/**
 * Connects the household store to React. Hydration starts once — the store
 * ignores repeat calls, so a remount or StrictMode double effect can't load
 * or write twice.
 */
export function AppStateProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  useEffect(() => {
    void store.hydrate();
  }, [store]);

  // The logical day can turn over while the app is open or in the background.
  // This only re-reads the clock; saving never depends on these events.
  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') store.refreshDay();
    });
    const timer = setInterval(() => store.refreshDay(), 60_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [store]);

  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used within AppStateProvider');
  return store;
}

export function useStoreSnapshot(): StoreSnapshot {
  const store = useAppStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** For everything under the root navigator, which only mounts once state has loaded. */
export function useHouseholdState(): { state: AppState; today: LocalDate } {
  const { state, today } = useStoreSnapshot();
  if (!state || !today) throw new Error('Household state has not loaded yet');
  return { state, today };
}
