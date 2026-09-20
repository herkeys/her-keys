import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { INITIAL_ACCOUNT_STATE, type AccountState } from '../domain/account/authState';
import type { AuthProvider } from '../domain/account/identity';
import { accountRuntime, accountsAvailable } from './accountRuntimeInstance';
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
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const snapshot = useStoreSnapshot();
  const [state, setState] = useState<AccountState>(INITIAL_ACCOUNT_STATE);
  const [busy, setBusy] = useState(false);
  const hydrated = snapshot.state !== null;

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
      busy,
      signIn: (provider) => run(() => accountRuntime.signIn(provider)),
      signOut: () => run(() => accountRuntime.signOut()),
      retryBinding: () => run(() => accountRuntime.resolveBinding()),
    }),
    [state, busy, run]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside AccountProvider');
  return value;
}
