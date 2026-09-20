import type { AccountId, AccountSession } from './identity';

/**
 * THE ACCOUNT STATE BOUNDARY.
 *
 * One named place answers "what account state is the app in?". Before this,
 * the answer would have been spread across booleans on several screens; the
 * routing table, the claim runner and the monetization boundary all read it
 * from here instead (B4-P0-014).
 *
 * Auth state is deliberately distinct from hydration, onboarding, bootstrap,
 * claim, sync and entitlement. Those are separate questions and are not folded
 * in.
 */
export type AccountState =
  /** No session, and none being obtained. Existing local data is untouched. */
  | { kind: 'unauthenticated' }
  /** A provider flow is in progress. */
  | { kind: 'authenticating' }
  /** Signed in, but this device's local state is not yet bound to the account. */
  | { kind: 'authenticatedUnbound'; session: AccountSession }
  /** A new account is being created server-side. */
  | { kind: 'bootstrapping'; session: AccountSession }
  /** An existing local household is being claimed. */
  | { kind: 'claiming'; session: AccountSession }
  /** Signed in and local state belongs to this account. The normal state. */
  | { kind: 'accountBound'; session: AccountSession; householdId: string }
  /**
   * Bound, but the session cannot currently be refreshed. Local execution
   * continues; cloud writes do not. Never unbinds, never discards (B4-P0-015).
   */
  | { kind: 'authDegraded'; accountId: AccountId; householdId: string; reason: DegradedReason }
  /**
   * Local state belongs to a DIFFERENT account than the one signed in. The
   * other household is preserved and never rendered, uploaded or merged
   * (B4-P0-035).
   */
  | { kind: 'boundOther'; session: AccountSession; quarantinedAccountId: AccountId }
  /** Authentication itself failed. Local data is untouched. */
  | { kind: 'authError'; detail: string; recoverable: boolean };

export type DegradedReason = 'expired' | 'refreshFailed' | 'offline';

export type AccountStateKind = AccountState['kind'];

/**
 * Whether account-bound screens may render.
 *
 * `boundOther` is deliberately false: the other account's cache must never
 * reach the screen, not even for a frame. Namespace selection happens before
 * anything account-bound renders, which is what makes that guarantee hold.
 */
export function canRenderAccountData(state: AccountState): boolean {
  return state.kind === 'accountBound' || state.kind === 'authDegraded';
}

/** The account currently in force, or null. */
export function activeAccountId(state: AccountState): AccountId | null {
  switch (state.kind) {
    case 'authenticatedUnbound':
    case 'bootstrapping':
    case 'claiming':
    case 'accountBound':
    case 'boundOther':
      return state.session.accountId;
    case 'authDegraded':
      return state.accountId;
    default:
      return null;
  }
}

/** Whether a cloud mutation may be attempted right now. */
export function canWriteToCloud(state: AccountState): boolean {
  return state.kind === 'accountBound';
}

/** Whether local household work may continue. Almost always yes. */
export function canUseAppLocally(state: AccountState): boolean {
  return state.kind !== 'authenticating';
}

/**
 * Does this state represent work in flight that a retry should resume rather
 * than restart?
 */
export function isResolving(state: AccountState): boolean {
  return state.kind === 'bootstrapping' || state.kind === 'claiming' || state.kind === 'authenticating';
}

export const INITIAL_ACCOUNT_STATE: AccountState = { kind: 'unauthenticated' };

/**
 * Transitions. Written as a function rather than scattered assignments so the
 * legal moves are inspectable and testable in one place.
 */
export type AccountEvent =
  | { type: 'authStarted' }
  | { type: 'authCancelled' }
  | { type: 'authFailed'; detail: string; recoverable: boolean }
  | { type: 'sessionEstablished'; session: AccountSession }
  | { type: 'bindingStarted'; mode: 'bootstrap' | 'claim' }
  | { type: 'bindingSucceeded'; householdId: string }
  | { type: 'bindingFailed'; detail: string; recoverable: boolean }
  | { type: 'foundBoundOther'; quarantinedAccountId: AccountId }
  | { type: 'sessionDegraded'; reason: DegradedReason }
  | { type: 'sessionRecovered'; session: AccountSession }
  | { type: 'signedOut' };

export function accountReducer(state: AccountState, event: AccountEvent): AccountState {
  switch (event.type) {
    case 'authStarted':
      return state.kind === 'unauthenticated' || state.kind === 'authError'
        ? { kind: 'authenticating' }
        : state;

    case 'authCancelled':
      // Cancelling returns to exactly where she was. Nothing local is touched.
      return state.kind === 'authenticating' ? { kind: 'unauthenticated' } : state;

    case 'authFailed':
      return state.kind === 'authenticating'
        ? { kind: 'authError', detail: event.detail, recoverable: event.recoverable }
        : state;

    case 'sessionEstablished':
      return { kind: 'authenticatedUnbound', session: event.session };

    case 'bindingStarted': {
      const session = sessionOf(state);
      if (session === null) return state;
      return event.mode === 'bootstrap' ? { kind: 'bootstrapping', session } : { kind: 'claiming', session };
    }

    case 'bindingSucceeded': {
      const session = sessionOf(state);
      if (session === null) return state;
      return { kind: 'accountBound', session, householdId: event.householdId };
    }

    case 'bindingFailed': {
      const session = sessionOf(state);
      if (session === null) return state;
      // Binding failure returns to signed-in-but-unbound, never to signed out:
      // the session is still good and the claim is retryable.
      return { kind: 'authenticatedUnbound', session };
    }

    case 'foundBoundOther': {
      const session = sessionOf(state);
      if (session === null) return state;
      return { kind: 'boundOther', session, quarantinedAccountId: event.quarantinedAccountId };
    }

    case 'sessionDegraded':
      return state.kind === 'accountBound'
        ? {
            kind: 'authDegraded',
            accountId: state.session.accountId,
            householdId: state.householdId,
            reason: event.reason,
          }
        : state;

    case 'sessionRecovered':
      // Only the SAME account may resume a degraded session. A different
      // account signing in is a switch, not a recovery.
      return state.kind === 'authDegraded' && event.session.accountId === state.accountId
        ? { kind: 'accountBound', session: event.session, householdId: state.householdId }
        : state;

    case 'signedOut':
      return { kind: 'unauthenticated' };
  }
}

function sessionOf(state: AccountState): AccountSession | null {
  switch (state.kind) {
    case 'authenticatedUnbound':
    case 'bootstrapping':
    case 'claiming':
    case 'accountBound':
    case 'boundOther':
      return state.session;
    default:
      return null;
  }
}
