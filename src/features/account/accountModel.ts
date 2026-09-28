import type { AccountState } from '../../domain/account/authState';
import type { AuthProvider } from '../../domain/account/identity';

/**
 * Your Account — what the one account surface shows, decided from account state alone.
 *
 * The modal is the existing `/sign-in` route. It signs her in, reconnects a degraded account, and — once her
 * household is connected — lets her sign out. Every action goes through AccountRuntime (via `useAccount`); nothing here
 * touches a session, a token or a store. There is no platform in any of these decisions: the providers offered are the
 * ones the device reports available, which is where Apple's iOS-only exception (EX-01) already lives.
 */
export type AccountModalMode =
  /** Signed out, or the last attempt failed: offer the available providers. */
  | 'signIn'
  /** Her household is bound but the credential lapsed: same account, sign in again. */
  | 'reconnect'
  /** Bound and syncing: the account-management surface, with Sign out. */
  | 'connected'
  /** A provider flow or the binding is in flight: show progress, offer no contradictory action. */
  | 'resolving'
  /** This build has no account backend. */
  | 'unavailable'
  /** Another account's household is on this device. Only `account-conflict` may act; this surface never does. */
  | 'quarantined';

export function accountModalMode(state: AccountState, available: boolean): AccountModalMode {
  switch (state.kind) {
    case 'boundOther':
      return 'quarantined';
    case 'authDegraded':
      return 'reconnect';
    case 'accountBound':
      return 'connected';
    case 'authenticating':
    case 'authenticatedUnbound':
    case 'bootstrapping':
    case 'claiming':
      return 'resolving';
    case 'unauthenticated':
    case 'authError':
      return available ? 'signIn' : 'unavailable';
  }
}

/** The quiet entry on Today. `null` means no entry: nothing an entry could open would work, or quarantine owns the screen. */
export function accountEntryLabel(mode: AccountModalMode): string | null {
  switch (mode) {
    case 'signIn':
      return 'Sign in';
    case 'reconnect':
      return 'Reconnect';
    case 'connected':
    case 'resolving':
      return 'Your account';
    case 'unavailable':
    case 'quarantined':
      return null;
  }
}

/** The single route the entry opens. Account switching is Sign out, then Sign in: the runtime's binding rules decide the rest. */
export const ACCOUNT_ROUTE = '/sign-in';

export const PROVIDER_LABELS: Record<AuthProvider, string> = {
  apple: 'Continue with Apple',
  google: 'Continue with Google',
};
