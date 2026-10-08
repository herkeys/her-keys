import type { AppState } from '../state';
import {
  INITIAL_ACCOUNT_STATE,
  accountReducer,
  type AccountEvent,
  type AccountState,
} from './authState';
import {
  UNBOUND_IDENTITY,
  AccountBindingSchema,
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
import { UNAVAILABLE_EMAIL_PASSWORD, type EmailPasswordMode, type EmailPasswordPort, type EmailPasswordResult } from './emailPassword';
import { UNAVAILABLE_EMAIL_OTP, type EmailOtpPort, type EmailOtpRequestResult, type EmailOtpVerifyResult } from './emailOtp';
import { toAccountId, type AccountId, type AccountSession, type AuthProvider } from './identity';
import type { ProviderRegistry } from './provider';
import type { SecureSessionStore } from './secureSession';
import { NOOP_ACCOUNT_SESSION_CLIENT, type AccountSessionClient } from './sessionClient';
import { namespaceForNewDevice, namespaceFromClaim } from '../sync/claimSeam';

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
  /** Passwordless email, the one two-phase method. Absent means this build cannot offer it. */
  emailOtp?: EmailOtpPort;
  /** Optional email/password sign-in and sign-up, using the same identity boundary. */
  emailPassword?: EmailPasswordPort;
  cloud: CloudAccountClient;
  /** Reads and writes the household blob's identity block. */
  identity: {
    current(): IdentityRecord;
    set(identity: IdentityRecord): void;
    save(): Promise<void>;
  };
  /** The household as it stands now. Read, never written, by this module. */
  localState(): AppState;
  /** Recovery from unreadable storage is not a pristine installation. */
  canAdoptCloudHousehold?: () => boolean;
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

/**
 * How verifying an emailed code went. `verified` means the code was accepted
 * and the runtime took the session from there — `state` says how THAT went
 * (bound, quarantined, or an account failure), exactly as it does after a
 * provider sign-in. Every other outcome leaves the account where it was.
 */
export type EmailVerification = { kind: 'verified' } | Exclude<EmailOtpVerifyResult, { kind: 'success' }>;
export type EmailPasswordAttempt = { state: AccountState; outcome: { kind: 'authenticated' } | Exclude<EmailPasswordResult, { kind: 'success' }> };

export interface AccountRuntime {
  getState(): AccountState;
  /** Restore a stored session at launch. Never signs her out on a store failure. */
  restore(): Promise<AccountState>;
  signIn(provider: AuthProvider): Promise<AccountState>;
  /** Whether passwordless email can be offered on this device. */
  emailOtpAvailable(): boolean;
  emailPasswordAvailable(): boolean;
  authenticateEmailPassword(mode: EmailPasswordMode, email: string, password: string): Promise<EmailPasswordAttempt>;
  /** Email phase one: ask for a code. Changes no account state. Calling it again is the resend. */
  requestEmailOtp(email: string): Promise<EmailOtpRequestResult>;
  /** Email phase two: a verified code becomes a session and takes the same path as any provider's. */
  verifyEmailOtp(email: string, code: string): Promise<{ state: AccountState; outcome: EmailVerification }>;
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

  const emailOtp = options.emailOtp ?? UNAVAILABLE_EMAIL_OTP;
  const emailPassword = options.emailPassword ?? UNAVAILABLE_EMAIL_PASSWORD;

  type Degraded = Extract<AccountState, { kind: 'authDegraded' }>;

  /**
   * Start an authentication attempt, whatever the method. A new one may begin
   * only from signed out, from a failed attempt, or to reconnect a degraded
   * account (which stays degraded, and bound, until the SAME account returns).
   */
  type AuthAttempt = { id: number; degraded: Degraded | null };
  let latestAttempt = 0;

  const beginAuth = (): AuthAttempt | null => {
    const degraded = state.kind === 'authDegraded' ? state : null;
    if (degraded === null) {
      if (state.kind !== 'unauthenticated' && state.kind !== 'authError') return null;
      apply({ type: 'authStarted' });
    }
    latestAttempt += 1;
    return { id: latestAttempt, degraded };
  };

  /**
   * Whether the attempt that began is no longer the one in force. A provider
   * sheet or a code check can outlive the state it started from — she signed
   * out, or another account took over — and an answer that arrives then
   * belongs to nobody: it is dropped rather than installed.
   *
   * The state alone cannot say so: by the time a late answer lands, a NEWER
   * attempt may be mid-flight and look exactly the same ('authenticating').
   * So each attempt is numbered, and only the latest one may be answered.
   */
  const superseded = ({ id, degraded }: AuthAttempt): boolean => {
    if (id !== latestAttempt) return true;
    return degraded === null
      ? state.kind !== 'authenticating'
      : !(state.kind === 'authDegraded' && state.accountId === degraded.accountId);
  };

  /**
   * Take a freshly proven session the rest of the way. Every method ends here
   * — Apple, Google and email alike — so wrong-actor refusal, quarantine,
   * activation, durable storage and binding cannot differ by how she signed in.
   */
  const adoptSession = async (session: AccountSession, degraded: Degraded | null): Promise<AccountState> => {
    if (degraded !== null && session.accountId !== degraded.accountId) {
      report('account.reauth_wrong_actor');
      return state;
    }

    // Signing in as B on a device bound to A is a real account conflict, but
    // B must never become the transport credential for A.
    if (degraded === null && bindingFor(session).mode === 'quarantine') {
      await options.sessions.write(session);
      await identify(session.accountId);
      apply({ type: 'sessionEstablished', session });
      return runtime.resolveBinding();
    }

    const activated = await sessionClient.activate(session);
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
    return runtime.resolveBinding();
  };

  const runtime: AccountRuntime = {
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
      const attempt = beginAuth();
      if (attempt === null) return state;
      const { degraded } = attempt;

      const result = await options.providers.signIn(provider);

      if (superseded(attempt)) {
        report('account.auth_superseded');
        return state;
      }

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

      return adoptSession(result.session, degraded);
    },

    emailOtpAvailable: () => emailOtp.isAvailable(),
    emailPasswordAvailable: () => emailPassword.isAvailable(),

    async authenticateEmailPassword(mode, email, password): Promise<EmailPasswordAttempt> {
      if (!emailPassword.isAvailable()) {
        return { state, outcome: { kind: 'unavailable', detail: 'email_password_not_configured' } };
      }
      const attempt = beginAuth();
      if (attempt === null) {
        return { state, outcome: { kind: 'unavailable', detail: 'account_not_awaiting_sign_in' } };
      }

      let result: EmailPasswordResult;
      try {
        result = await emailPassword.authenticate(mode, email, password);
      } catch {
        result = { kind: 'unreachable', detail: 'email_password_request_threw' };
      }
      if (superseded(attempt)) {
        report('account.auth_superseded');
        return { state, outcome: { kind: 'unavailable', detail: 'auth_superseded' } };
      }
      if (result.kind !== 'success') {
        report('account.email_password_' + result.kind, result.kind === 'confirmationRequired' ? undefined : result.detail);
        if (attempt.degraded === null) apply({ type: 'authCancelled' });
        return { state, outcome: result };
      }
      return { state: await adoptSession(result.session, attempt.degraded), outcome: { kind: 'authenticated' } };
    },

    async requestEmailOtp(email) {
      if (!emailOtp.isAvailable()) return { kind: 'unavailable', detail: 'email_otp_not_configured' };
      // A code is only worth asking for from a state that could use one.
      if (state.kind !== 'unauthenticated' && state.kind !== 'authError' && state.kind !== 'authDegraded') {
        return { kind: 'unavailable', detail: 'account_not_awaiting_sign_in' };
      }

      let result: EmailOtpRequestResult;
      try {
        result = await emailOtp.request(email);
      } catch {
        // A port that throws anyway never reached an answer. The thrown text is
        // not kept: it is the one place an address could ride into a log.
        result = { kind: 'unreachable', detail: 'email_otp_request_threw' };
      }
      if (result.kind !== 'sent') report(`account.email_request_${result.kind}`, result.detail);
      return result;
    },

    async verifyEmailOtp(email, code) {
      if (!emailOtp.isAvailable()) return { state, outcome: { kind: 'unavailable', detail: 'email_otp_not_configured' } };

      const attempt = beginAuth();
      if (attempt === null) return { state, outcome: { kind: 'unavailable', detail: 'account_not_awaiting_sign_in' } };
      const { degraded } = attempt;

      let result: EmailOtpVerifyResult;
      try {
        result = await emailOtp.verify(email, code);
      } catch {
        result = { kind: 'unreachable', detail: 'email_otp_verify_threw' };
      }

      if (superseded(attempt)) {
        report('account.auth_superseded');
        return { state, outcome: { kind: 'failed', detail: 'auth_superseded' } };
      }

      if (result.kind !== 'success') {
        // A code that was not accepted is not an account failure. She is exactly
        // where she was, on the same screen, free to try again — the same move
        // as changing her mind in a provider sheet, and nothing local is touched.
        report(`account.email_verify_${result.kind}`, result.detail);
        if (degraded === null) apply({ type: 'authCancelled' });
        return { state, outcome: result };
      }

      return { state: await adoptSession(result.session, degraded), outcome: { kind: 'verified' } };
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

      // A late bootstrap/claim result cannot bind after logout or an account
      // switch. The next authenticated attempt can replay its durable key.
      if (sessionOf(state)?.accountId !== session.accountId) return state;

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
        // A pristine device may adopt the household its authenticated bootstrap
        // resolved. A local claim is still a refusal: never merge its content
        // into an existing household. Recheck after the network wait, because
        // local work or the active account may have changed while it was out.
        if (
          kind === 'bootstrap' && outcome.reason === 'superseded_by_cloud' && outcome.householdId !== null &&
          (options.canAdoptCloudHousehold?.() ?? true) &&
          sessionOf(state)?.accountId === session.accountId && bindingFor(session).mode === 'bootstrap'
        ) {
          const parsed = AccountBindingSchema.safeParse({
            accountId: session.accountId,
            householdId: outcome.householdId,
            boundAt: new Date(options.now()).toISOString(),
            kind: 'bootstrap',
            // A rejected claim's map is not a successful claim receipt. Pull
            // reconstructs the mappings and content from the cloud instead.
            idMap: {},
          });
          if (!parsed.success) {
            return apply({ type: 'bindingFailed', detail: 'cloud household identity was unreadable', recoverable: false });
          }
          const before = options.identity.current();
          options.identity.set({
            ...before,
            binding: parsed.data,
            receipt: null,
            sync: namespaceForNewDevice({
              accountId: session.accountId,
              householdId: outcome.householdId,
              deviceId: options.deviceId ?? session.accountId,
            }),
          });
          if (!(await safeSave(options, report))) {
            options.identity.set(before);
            return apply({ type: 'bindingFailed', detail: 'cloud household adoption could not be recorded locally', recoverable: true });
          }
          report('account.household_adopted');
          // The sync composition pulls first. Its unhydrated namespace blocks
          // seed/top-up work and screens until that first batch is durable.
          return apply({ type: 'bindingSucceeded', householdId: outcome.householdId });
        }
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

  return runtime;
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
