import type { AccountState } from '../domain/account/authState';
import { createAccountRuntime, type AccountRuntime, type AccountRuntimeOptions } from '../domain/account/accountRuntime';
import { UNBOUND_IDENTITY } from '../domain/account/binding';
import type { ChangeObserver } from '../domain/sync/changeObserver';
import { createSyncRuntime, type SyncRuntime, type SyncRuntimeDeps } from '../domain/sync/syncRuntime';
import type { AppStore } from '../state/appStore';

/**
 * THE ACCOUNT-BACKED SYNCHRONIZATION COMPOSITION.
 *
 * The one place that turns "an account can bind" into "a bound account is synchronized". Both the production root
 * (`accountRuntimeInstance.ts`) and every test call THIS function, so a test that starts here exercises the composition the app
 * runs, not a hand-assembled copy of it.
 *
 * It contains no `expo-*` or `@supabase/*` import: everything platform-specific arrives as a dependency.
 *
 * The wiring, and why it is this way:
 *   - the account runtime reports EVERY state change; the sync runtime starts a coordinator on `accountBound` and drops it on
 *     everything else, so bound really means operating and unbound/signed-out/switched really means stopped;
 *   - the change observer is wired into the store BEFORE this runs (`createAppStore({ observe })`), so canonical mutations
 *     become queue intent in the same envelope write, with no feature involved;
 *   - the observer nudges the sync runtime, which requests a cycle after a short settle.
 */

export interface AccountAppDeps {
  /** The household store. It must have been created with `observe: observer.observe`. */
  store: AppStore;
  observer: ChangeObserver;
  account: Omit<AccountRuntimeOptions, 'identity' | 'localState' | 'onStateChange'>;
  sync: Omit<SyncRuntimeDeps, 'store' | 'activeAccountId' | 'now'>;
  /** Told every account state change, after the sync runtime has reacted to it. */
  onAccountState?: (state: AccountState) => void;
}

export interface AccountApp {
  accountRuntime: AccountRuntime;
  syncRuntime: SyncRuntime;
}

export function composeAccountApp(deps: AccountAppDeps): AccountApp {
  const { store, observer } = deps;

  // `let` because the sync runtime's account guard reads the account runtime it is composed with.
  let accountRuntime: AccountRuntime;

  const syncRuntime = createSyncRuntime({
    ...deps.sync,
    store,
    now: deps.account.now,
    // Only a bound account with a usable session may transport anything. Degraded, signed out and switching all read as null.
    activeAccountId: () => {
      const state = accountRuntime.getState();
      return state.kind === 'accountBound' ? state.session.accountId : null;
    },
  });

  observer.onQueued(() => syncRuntime.noteLocalMutation());

  accountRuntime = createAccountRuntime({
    ...deps.account,
    identity: {
      current: () => store.currentIdentity() ?? UNBOUND_IDENTITY,
      set: (identity) => store.setIdentity(identity),
      save: () => store.saveIdentity(),
    },
    localState: () => {
      const state = store.getSnapshot().state;
      if (state === null) throw new Error('The account runtime read household state before hydration finished.');
      return state;
    },
    onStateChange: (state) => {
      syncRuntime.onAccountState(state);
      deps.onAccountState?.(state);
    },
  });

  return { accountRuntime, syncRuntime };
}
