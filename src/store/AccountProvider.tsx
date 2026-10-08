import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { EmailVerification } from '../domain/account/accountRuntime';
import { INITIAL_ACCOUNT_STATE, type AccountState } from '../domain/account/authState';
import type { EmailOtpRequestResult } from '../domain/account/emailOtp';
import type { EmailPasswordMode } from '../domain/account/emailPassword';
import type { EmailPasswordAttempt } from '../domain/account/accountRuntime';
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
  /**
   * Whether the stored session has been resolved since launch. Until it has, `state` is only the runtime's starting value,
   * not an answer, and nothing may be routed on it — that is what keeps Welcome, onboarding and the app from flashing while
   * a returning account is being restored. Derived each launch from the restore itself; never persisted.
   */
  settled: boolean;
  /** Resolves to the account state the attempt ended in — the only evidence of how it went. */
  signIn: (provider: AuthProvider) => Promise<AccountState>;
  /** Whether passwordless email can be offered on this device. */
  emailAvailable: boolean;
  emailPasswordAvailable: boolean;
  authenticateEmailPassword: (mode: EmailPasswordMode, email: string, password: string) => Promise<EmailPasswordAttempt>;
  /** Email phase one. Changes no account state; calling it again is the resend. */
  requestEmailOtp: (email: string) => Promise<EmailOtpRequestResult>;
  /** Email phase two. The code goes straight to the runtime and is kept nowhere. */
  verifyEmailOtp: (email: string, code: string) => Promise<{ state: AccountState; outcome: EmailVerification }>;
  signOut: () => Promise<AccountState>;
  /** Retry the binding this device needs, after a failure she can see. */
  retryBinding: () => Promise<AccountState>;
  busy: boolean;
  /** The sync namespace for the bound account, or null. Read-only here. */
  syncNamespace: SyncNamespace | null;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const snapshot = useStoreSnapshot();
  const [state, setState] = useState<AccountState>(INITIAL_ACCOUNT_STATE);
  const [busy, setBusy] = useState(false);
  // A build with no account backend has nothing to restore, so it is settled from the start.
  const [settled, setSettled] = useState(!accountsAvailable);
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
        if (!live) return;
        setBusy(false);
        // Settled however the restore ended: signed out, bound, degraded and quarantined are all answers.
        setSettled(true);
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
      const next = await work();
      setState(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      state,
      available: accountsAvailable,
      settled,
      syncNamespace: snapshot.identity?.sync ?? null,
      busy,
      signIn: (provider) => run(() => accountRuntime.signIn(provider)),
      emailAvailable: accountRuntime.emailOtpAvailable(),
      emailPasswordAvailable: accountRuntime.emailPasswordAvailable(),
      authenticateEmailPassword: async (mode, email, password) => {
        setBusy(true);
        try {
          const result = await accountRuntime.authenticateEmailPassword(mode, email, password);
          setState(result.state);
          return result;
        } finally {
          setBusy(false);
        }
      },
      requestEmailOtp: (email) => accountRuntime.requestEmailOtp(email),
      verifyEmailOtp: async (email, code) => {
        setBusy(true);
        try {
          const verified = await accountRuntime.verifyEmailOtp(email, code);
          setState(verified.state);
          return verified;
        } finally {
          setBusy(false);
        }
      },
      signOut: () => run(() => accountRuntime.signOut()),
      retryBinding: () => run(() => accountRuntime.resolveBinding()),
    }),
    [state, settled, busy, run, snapshot.identity]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useOptionalAccount(): AccountContextValue | null {
  return useContext(AccountContext);
}

export function useAccount(): AccountContextValue {
  const value = useOptionalAccount();
  if (!value) throw new Error('useAccount must be used inside AccountProvider');
  return value;
}
