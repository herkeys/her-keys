import type { AppState } from '../state';
import {
  INITIAL_ACCOUNT_STATE,
  accountReducer,
  type AccountEvent,
  type AccountState,
} from './authState';
import {
  UNBOUND_IDENTITY,
  isRetryable,
  recordAttempt,
  startReceipt,
  type AccountBinding,
  type ClaimKind,
  type IdentityRecord,
} from './binding';
import {
  buildClaimPayload,
  claimKindOf,
  decideBinding,
  describeLocalHousehold,
  parseClaimOutcome,
  type BindingDecision,
  type ClaimOutcome,
} from './claim';
import type { CloudAccountClient } from './cloudClient';
import { toAccountId, type AccountId, type AccountSession, type AuthProvider } from './identity';
import type { ProviderRegistry } from './provider';
import type { SecureSessionStore } from './secureSession';
import { NOOP_ACCOUNT_SESSION_CLIENT, type AccountSessionClient } from './sessionClient';
import { namespaceFromClaim } from '../sync/claimSeam';

/**
 * THE ACCOUNT ORCHESTRATOR.
 *
 * Everything the identity wave does in order, in one place: restore a session,
 * sign in, decide what binding this device needs, run it, and record the result
 * durably before anything is called bound.
 *
 * Two rules shape all of it.
 *
 * **Auth never destroys household data.** No failure here deletes, resets or
 * rewrites her household. The worst outcomes are "signed out" and "degraded",
 * and both leave the local household exactly as it was.
 *
 * **Bound means written down.** The binding and the complete id map are saved
 * before the state machine reports `accountBound`, so a crash one instruction
 * later resumes rather than starting a second household.
 */

export interface AccountRuntimeOptions {
  sessions: SecureSessionStore;
  /** Supabase's in-memory session lifecycle. SecureSessionStore stays the only durable home. */
  sessionClient?: AccountSessionClient;
  providers: ProviderRegistry;
  cloud: CloudAccountClient;
  /** Reads and writes the household blob's identity block. */
  identity: {
    current(): IdentityRecord;
    set(identity: IdentityRecord): void;
    save(): Promise<void>;
  };
  /** The household as it stands now. Read, never written, by this module. */
  localState(): AppState;
  timezone(): string;
  now(): number;
  /** A fresh uuid for a claim key. Injected so a claim is reproducible in a test. */
  newClaimKey(): string;
  deviceId?: string | null;
  /** Told which account is signed in, before any paywall is shown. */
  onAccountIdentified?: (accountId: AccountId | null) => Promise<void>;
  onStateChange?: (state: AccountState) => void;
  report?: (event: { type: string; detail?: string }) => void;
}

export interface AccountRuntime {
  getState(): AccountState;
  /** Restore a stored session at launch. Never signs her out on a store failure. */
  restore(): Promise<AccountState>;
  signIn(provider: AuthProvider): Promise<AccountState>;
  /** Run the binding this device needs. Safe to call again after a failure. */
  resolveBinding(): Promise<AccountState>;
  signOut(): Promise<AccountState>;
  /** What the device would do for the signed-in account, without doing it. */
  plannedBinding(): BindingDecision | null;
  lastClaimOutcome(): ClaimOutcome | null;
  /** Observe runtime transitions, including background token degradation/recovery. */
  subscribe(listener: (state: AccountState) => void): () => void;
  /** React Native foreground ownership for Supabase auto refresh. */
  setSessionRefreshActive(active: boolean): void;
}

export function createAccountRuntime(options: AccountRuntimeOptions): AccountRuntime {
  let state: AccountState = INITIAL_ACCOUNT_STATE;
  let lastOutcome: ClaimOutcome | null = null;
  const sessionClient = options.sessionClient ?? NOOP_ACCOUNT_SESSION_CLIENT;
  const listeners = new Set<(state: AccountState) => void>();

  const replaceState = (next: AccountState): AccountState => {
    if (next !== state) {
      state = next;
      options.onStateChange?.(state);
      for (const listener of listeners) listener(state);
    }
    return state;
  };

  const apply = (event: AccountEvent): AccountState => replaceState(accountReducer(state, event));

  const report = (type: string, detail?: string) => options.report?.({ type, detail });

  /**
   * RevenueCat is told the Supabase account id and nothing else, before a
   * paywall can appear (B4-P0-036). A failure here is logged and stepped over:
   * entitlement is not identity, and it must not be able to undo a claim the
   * server already committed.
   */
  const identify = async (accountId: AccountId | null) => {
    try {
      await options.onAccountIdentified?.(accountId);
    } catch (error) {
      report('account.identify_failed', error instanceof Error ? error.message : String(error));
    }
  };

  const bindingFor = (session: AccountSession): BindingDecision =>
    decideBinding(describeLocalHousehold(options.localState()), options.identity.current(), session.accountId);

  // Serialize refresh persistence so an older rotated pair can never finish its
  // SecureStore write after a newer one.
  let refreshPersistence = Promise.resolve();
  sessionClient.subscribe((event) => {
    if (event.type === 'signedOut') {
      if (state.kind !== 'accountBound') return;
      replaceState(accountReducer(state, { type: 'sessionDegraded', reason: 'refreshFailed' }));
      refreshPersistence = refreshPersistence
        .then(() => options.sessions.clear())
        .catch((error) => report('account.session_clear_failed', error instanceof Error ? error.message : String(error)));
      return;
    }

    const current = accountIdOf(state);
    if (current === null || current !== event.session.accountId) {
      report('account.refresh_wrong_actor');
      return;
    }

    refreshPersistence = refreshPersistence
      .then(async () => {
        await options.sessions.write(event.session);
        apply({ type: 'sessionRecovered', session: event.session });
      })
      .catch((error) => {
        report('account.refresh_store_failed', error instanceof Error ? error.message : String(error));
        apply({ type: 'sessionDegraded', reason: 'refreshFailed' });
      });
  });

  return {
    getState: () => state,
    lastClaimOutcome: () => lastOutcome,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSessionRefreshActive(active) {
      if (active) sessionClient.startAutoRefresh();
      else sessionClient.stopAutoRefresh();
    },

    plannedBinding() {
      const accountId = sessionOf(state)?.accountId ?? null;
      if (accountId === null) return null;
      return decideBinding(describeLocalHousehold(options.localState()), options.identity.current(), accountId);
    },

    async restore() {
      const loaded = await options.sessions.read(options.now());

      if (loaded.kind === 'none') return apply({ type: 'signedOut' });

      if (loaded.kind === 'unavailable') {
        // The keychain is not answering. If the blob says this household is
        // bound, stay bound and degraded rather than pretending she is a new
        // user and offering to start over on top of her real data.
        const bound = options.identity.current().binding;
        if (bound !== null) {
          const accountId = toAccountId(bound.accountId);
          if (accountId !== null) {
            replaceState({
              kind: 'authDegraded',
              accountId,
              householdId: bound.householdId,
              reason: 'refreshFailed',
            });
            report('account.degraded', loaded.detail);
            return state;
          }
        }
        return apply({ type: 'signedOut' });
      }

      if (loaded.kind === 'unreadable') {
        report('account.session_unreadable', loaded.detail);
        return apply({ type: 'signedOut' });
      }

      const bound = options.identity.current().binding;

      // A credential for another account may describe a real sign-in, but it
      // is never installed in the data-transport client for this household.
      if (bound !== null && bound.accountId !== loaded.session.accountId) {
        await identify(loaded.session.accountId);
        apply({ type: 'sessionEstablished', session: loaded.session });
        return this.resolveBinding();
      }

      // Install/refresh BEFORE resolveBinding can produce accountBound. Since
      // accountBound is what starts sync, no launch can race an anonymous RPC.
      const activated = await sessionClient.activate(loaded.session);
      if (activated.kind !== 'active') {
        report('account.session_restore_failed', activated.detail);
        if (bound !== null && bound.accountId === loaded.session.accountId) {
          if (activated.kind === 'invalid') {
            try {
              await options.sessions.clear();
            } catch (error) {
              report('account.session_clear_failed', error instanceof Error ? error.message : String(error));
            }
          }
          replaceState({
            kind: 'authDegraded',
            accountId: loaded.session.accountId,
            householdId: bound.householdId,
            reason: activated.kind === 'unreachable' ? 'offline' : loaded.expired ? 'expired' : 'refreshFailed',
          });
          return state;
        }

        if (activated.kind === 'invalid') {
          try {
            await options.sessions.clear();
          } catch {
            // Nothing account-bound exists here; signed out remains the safest state.
          }
        }
        return apply({ type: 'signedOut' });
      }

      try {
        // setSession may have rotated an expired pair. Durable first, bound second.
        await options.sessions.write(activated.session);
      } catch (error) {
        report('account.session_store_failed', error instanceof Error ? error.message : String(error));
        await sessionClient.signOut();
        if (bound !== null && bound.accountId === activated.session.accountId) {
          replaceState({
            kind: 'authDegraded',
            accountId: activated.session.accountId,
            householdId: bound.householdId,
            reason: 'refreshFailed',
          });
          return state;
        }
        return apply({ type: 'signedOut' });
      }

      await identify(activated.session.accountId);
      apply({ type: 'sessionEstablished', session: activated.session });
      return this.resolveBinding();
    },

    async signIn(provider) {
      const degraded = state.kind === 'authDegraded' ? state : null;
      if (degraded === null) {
        if (state.kind !== 'unauthenticated' && state.kind !== 'authError') return state;
        apply({ type: 'authStarted' });
      }

      const result = await options.providers.signIn(provider);

      switch (result.kind) {
        case 'cancelled':
          return degraded === null ? apply({ type: 'authCancelled' }) : state;
        case 'unavailable':
        case 'configurationError':
          if (degraded !== null) {
            report('account.reauth_failed', result.detail);
            return state;
          }
          return apply({ type: 'authFailed', detail: result.detail, recoverable: false });
        case 'providerError':
          if (degraded !== null) {
            report('account.reauth_failed', result.detail);
            return state;
          }
          return apply({ type: 'authFailed', detail: result.detail, recoverable: true });
        case 'success':
          break;
      }

      if (degraded !== null && result.session.accountId !== degraded.accountId) {
        report('account.reauth_wrong_actor');
        return state;
      }

      // Signing in as B on a device bound to A is a real account conflict, but
      // B must never become the transport credential for A.
      if (degraded === null && bindingFor(result.session).mode === 'quarantine') {
        await options.sessions.write(result.session);
        await identify(result.session.accountId);
        apply({ type: 'sessionEstablished', session: result.session });
        return this.resolveBinding();
      }

      const activated = await sessionClient.activate(result.session);
      if (activated.kind !== 'active') {
        report('account.session_activate_failed', activated.detail);
        if (degraded !== null) return state;
        return apply({ type: 'authFailed', detail: activated.detail, recoverable: activated.kind === 'unreachable' });
      }

      try {
        await options.sessions.write(activated.session);
      } catch (error) {
        await sessionClient.signOut();
        report('account.session_store_failed', error instanceof Error ? error.message : String(error));
        if (degraded !== null) return state;
        return apply({ type: 'authFailed', detail: 'could not safely store the account session', recoverable: true });
      }

      await identify(activated.session.accountId);
      if (degraded !== null) return apply({ type: 'sessionRecovered', session: activated.session });

      apply({ type: 'sessionEstablished', session: activated.session });
      return this.resolveBinding();
    },

    async resolveBinding() {
      const session = sessionOf(state);
      if (session === null) return state;

      const decision = bindingFor(session);

      if (decision.mode === 'quarantine') {
        // Her other household is preserved untouched and never rendered,
        // uploaded or merged (B4-P0-035). Nothing is deleted to make room.
        report('account.quarantined', decision.otherAccountId);
        const identity = options.identity.current();
        options.identity.set({
          ...identity,
          quarantine: { accountId: decision.otherAccountId, detectedAt: new Date(options.now()).toISOString() },
        });
        await safeSave(options, report);
        return apply({ type: 'foundBoundOther', quarantinedAccountId: decision.otherAccountId });
      }

      if (decision.mode === 'resume') {
        return apply({ type: 'bindingSucceeded', householdId: decision.householdId });
      }

      if (decision.mode === 'refuseDemo') {
        // A demo household never becomes an account's real data. She stays
        // signed in and unbound; the demo keeps working, locally, as a demo.
        report('account.demo_not_claimable');
        return state;
      }

      const kind = claimKindOf(decision) as ClaimKind;
      apply({ type: 'bindingStarted', mode: kind === 'bootstrap' ? 'bootstrap' : 'claim' });

      // The receipt is written BEFORE the request leaves. If the server commits
      // and this device dies before hearing so, the retry carries the same key,
      // and the server resumes instead of creating a second household.
      const existing = options.identity.current().receipt;
      const reusable =
        existing !== null && existing.accountId === session.accountId && existing.kind === kind && isRetryable(existing);
      let receipt = reusable
        ? existing
        : startReceipt({
            claimKey: options.newClaimKey(),
            accountId: session.accountId,
            kind,
            startedAt: new Date(options.now()).toISOString(),
          });
      receipt = recordAttempt(receipt, new Date(options.now()).toISOString());

      options.identity.set({ ...options.identity.current(), receipt });
      if (!(await safeSave(options, report))) {
        // We could not even record the intent, so we do not send the request.
        // An unrecorded claim key is exactly how duplicate households happen.
        return apply({ type: 'bindingFailed', detail: 'could not record the claim before sending it', recoverable: true });
      }

      // The household the claim is built from. Anything she changes while the request is out differs from this, and the seed
      // queues it, so an edit made during the network call is not stranded behind a binding that says everything is safe.
      const claimedState = options.localState();
      const payload = kind === 'claim' ? buildClaimPayload(claimedState) : null;

      const call =
        kind === 'bootstrap'
          ? await options.cloud.bootstrapAccount({
              claimKey: receipt.claimKey,
              timezone: options.timezone(),
              deviceId: options.deviceId ?? null,
            })
          : await options.cloud.claimLocalHousehold({
              claimKey: receipt.claimKey,
              timezone: options.timezone(),
              deviceId: options.deviceId ?? null,
              payload: payload as NonNullable<typeof payload>,
            });

      if (call.kind !== 'ok') {
        report(`account.claim_${call.kind}`, call.detail);
        return apply({ type: 'bindingFailed', detail: call.detail, recoverable: call.kind === 'unreachable' });
      }

      const outcome = parseClaimOutcome(call.body);
      lastOutcome = outcome;

      if (outcome.kind === 'unreadable') {
        report('account.claim_unreadable', outcome.detail);
        return apply({ type: 'bindingFailed', detail: outcome.detail, recoverable: false });
      }

      if (outcome.kind === 'rejected') {
        // The server gave its answer. Repeating the request would only get it
        // again, so the receipt records the refusal and stops being retryable.
        options.identity.set({
          ...options.identity.current(),
          receipt: { ...receipt, rejectedReason: outcome.reason },
        });
        await safeSave(options, report);
        report('account.claim_rejected', outcome.reason);
        return apply({ type: 'bindingFailed', detail: outcome.reason, recoverable: false });
      }

      // Durable first, bound second. The complete id map is part of the binding,
      // because B4-BACKEND-03 starts from it to know what is already in the
      // cloud; an object claimed but missing from the map becomes a duplicate.
      const binding: AccountBinding = {
        accountId: session.accountId,
        householdId: outcome.householdId,
        boundAt: new Date(options.now()).toISOString(),
        kind,
        idMap: outcome.idMap,
      };
      // The sync namespace is born here, from the claim's own id map. Sync
      // adopts what claim established rather than rediscovering the cloud by
      // guessing, which is what stops the first sync re-creating the rows the
      // claim just made (B4-BACKEND-03 section 8).
      const carried = new Set<string>(
        payload === null
          ? []
          : [...payload.categories, ...payload.tasks, ...payload.needsMeItems, ...payload.oneMoves, ...payload.sourceArtifacts].map((row) => row.localId)
      );
      const sync = namespaceFromClaim({
        state: options.localState(),
        accountId: session.accountId,
        householdId: outcome.householdId,
        deviceId: options.deviceId ?? session.accountId,
        idMap: outcome.idMap,
        // Seeded in the SAME write as the binding: durable outbound work exists the moment the account is called bound.
        seed: { at: new Date(options.now()).toISOString(), claimedState, carried },
      });
      options.identity.set({ binding, receipt: null, quarantine: options.identity.current().quarantine, sync });

      if (!(await safeSave(options, report))) {
        // The server committed but we could not write it down. Stay unbound and
        // retryable: the same claim key replays, and the server hands the same
        // household and the same map straight back.
        options.identity.set({ ...options.identity.current(), binding: null, receipt });
        return apply({ type: 'bindingFailed', detail: 'claim succeeded but could not be recorded locally', recoverable: true });
      }

      return apply({ type: 'bindingSucceeded', householdId: outcome.householdId });
    },

    async signOut() {
      // Stop sync before the client credential is ended.
      if (state.kind === 'accountBound') apply({ type: 'sessionDegraded', reason: 'refreshFailed' });

      const ended = await sessionClient.signOut();
      if (ended.kind === 'error') {
        report('account.sign_out_client_failed', ended.detail);
        return state;
      }

      try {
        await options.sessions.clear();
      } catch (error) {
        report('account.sign_out_store_failed', error instanceof Error ? error.message : String(error));
        return state;
      }

      await identify(null);
      // The binding stays. Signing out is not leaving the account, and the next
      // sign-in of the same account must resume rather than claim again.
      return apply({ type: 'signedOut' });
    },
  };
}

async function safeSave(
  options: AccountRuntimeOptions,
  report: (type: string, detail?: string) => void
): Promise<boolean> {
  try {
    await options.identity.save();
    return true;
  } catch (error) {
    report('account.identity_save_failed', error instanceof Error ? error.message : String(error));
    return false;
  }
}

function accountIdOf(state: AccountState): AccountId | null {
  if (state.kind === 'authDegraded') return state.accountId;
  return sessionOf(state)?.accountId ?? null;
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

export { UNBOUND_IDENTITY };
