import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { INITIAL_ACCOUNT_STATE, type AccountState } from '../domain/account/authState';
import type { AuthProvider } from '../domain/account/identity';
import type { SyncNamespace } from '../domain/sync/syncTypes';
import { accountRuntime, accountsAvailable, syncRuntime } from './accountRuntimeInstance';
import { useStoreSnapshot } from './AppStateProvider';

/**
 * The account state the whole app reads.
 *
 * It only ever mirrors the runtime; every decision is made there, so there is
 * still exactly one boundary answering "what account state is the app in?".
 */
export interface AccountContextValue {
  state: AccountState;
  /** Whether this build can bind to an account at all. */
  available: boolean;
  signIn: (provider: AuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
  /** Retry the binding this device needs, after a failure she can see. */
  retryBinding: () => Promise<void>;
  busy: boolean;
  /** The sync namespace for the bound account, or null. Read-only here. */
  syncNamespace: SyncNamespace | null;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const snapshot = useStoreSnapshot();
  const [state, setState] = useState<AccountState>(INITIAL_ACCOUNT_STATE);
  const [busy, setBusy] = useState(false);
  const hydrated = snapshot.state !== null;

  useEffect(() => accountRuntime.subscribe(setState), []);

  useEffect(() => {
    // The runtime reads household state, so it cannot run before hydration.
    if (!hydrated || !accountsAvailable) return;
    let live = true;
    setBusy(true);
    accountRuntime
      .restore()
      .then((next) => {
        if (live) setState(next);
      })
      .catch(() => {
        // restore() already reports; a failure here must not stop the app from
        // opening on her own local household.
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!accountsAvailable) return;

    // Supabase recommends explicit foreground ownership for React Native auth
    // refresh. Rotated credentials are persisted by AccountRuntime, not by
    // Supabase storage.
    accountRuntime.setSessionRefreshActive(AppState.currentState === 'active');

    const subscription = AppState.addEventListener('change', (next) => {
      const active = next === 'active';
      accountRuntime.setSessionRefreshActive(active);
      if (active) void syncRuntime.request('foreground');
    });

    return () => {
      accountRuntime.setSessionRefreshActive(false);
      subscription.remove();
    };
  }, []);

  const run = useCallback(async (work: () => Promise<AccountState>) => {
    setBusy(true);
    try {
      setState(await work());
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      state,
      available: accountsAvailable,
      syncNamespace: snapshot.identity?.sync ?? null,
      busy,
      signIn: (provider) => run(() => accountRuntime.signIn(provider)),
      signOut: () => run(() => accountRuntime.signOut()),
      retryBinding: () => run(() => accountRuntime.resolveBinding()),
    }),
    [state, busy, run, snapshot.identity]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside AccountProvider');
  return value;
}
