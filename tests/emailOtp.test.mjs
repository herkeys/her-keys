/**
 * Passwordless email through the account runtime.
 *
 * Email is the one two-phase method (ask for a code, then verify it), so it has its own port rather than a provider
 * adapter — and that is the ONLY way it differs. A verified code is an ordinary session keyed on the Supabase user id and
 * takes the same path as Apple's or Google's: wrong-actor refusal, quarantine, activation, durable storage, binding. These
 * tests hold it to exactly that, with real domain objects and a scripted port: no network, no keychain.
 *
 * Nothing here is a real address or a real code. `EMAIL` and `CODE` are sentinels, searched for in everything the runtime
 * stores or reports to prove neither can leak.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createAccountRuntime } from '../src/domain/account/accountRuntime.ts';
import { canRenderAccountData, canWriteToCloud } from '../src/domain/account/authState.ts';
import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import { UNAVAILABLE_EMAIL_OTP, createScriptedEmailOtp } from '../src/domain/account/emailOtp.ts';
import { createProviderRegistry, createScriptedProvider } from '../src/domain/account/provider.ts';
import { SECURE_SESSION_KEY, createMemorySecureStorage, createSecureSessionStore, parseStoredSession } from '../src/domain/account/secureSession.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { TZ } from './support/fixtures.mjs';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const HOUSEHOLD_A = '33333333-3333-4333-8333-333333333333';
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const EMAIL = 'Sentinel.Address+tag@example.test';
const CODE = '918273';

const emailSession = (accountId, over = {}) => ({
  accountId,
  accessToken: `access-${accountId}`,
  refreshToken: `refresh-${accountId}`,
  expiresAt: NOW + 3_600_000,
  provider: { provider: 'email', subject: null, suggestedDisplayName: null },
  ...over,
});
const appleSession = (accountId) => ({ ...emailSession(accountId), provider: { provider: 'apple', subject: `apple-${accountId}`, suggestedDisplayName: null } });

const boundTo = (accountId, householdId = HOUSEHOLD_A) => ({
  binding: { accountId, householdId, boundAt: '2026-10-01T12:00:00.000Z', kind: 'bootstrap', idMap: {} },
  receipt: null,
  quarantine: null,
});

const completeBody = (householdId) => ({
  status: 'complete',
  rejected_reason: null,
  claim_id: '55555555-5555-4555-8555-555555555555',
  household_id: householdId,
  id_map: { 'household-1': householdId, 'user-1': '66666666-6666-4666-8666-666666666666' },
  conflict_evidence: [],
});

/** A transport session client that records which account was ever installed on the client that reaches data. */
function recordingSessionClient({ activation } = {}) {
  const installed = [];
  let signOuts = 0;
  return {
    installed,
    signOuts: () => signOuts,
    async activate(session) {
      installed.push(session.accountId);
      return activation ?? { kind: 'active', session };
    },
    async signOut() {
      signOuts += 1;
      return { kind: 'ok' };
    },
    startAutoRefresh() {},
    stopAutoRefresh() {},
    subscribe() {
      return () => undefined;
    },
  };
}

function runtimeFor({ identity = UNBOUND_IDENTITY, emailOtp, providerResults, cloud, secureInitial = {}, sessionClient = recordingSessionClient(), state = createEmptyState(TZ) } = {}) {
  const calls = [];
  const identified = [];
  const reports = [];
  let stored = identity;
  let staged = identity;
  const secureStorage = createMemorySecureStorage(secureInitial);

  const runtime = createAccountRuntime({
    sessions: createSecureSessionStore(secureStorage),
    sessionClient,
    providers: createProviderRegistry([createScriptedProvider('apple', { results: providerResults ?? [{ kind: 'success', session: appleSession(ACCOUNT_A) }] })]),
    emailOtp,
    cloud: cloud ?? {
      async bootstrapAccount(input) {
        calls.push({ fn: 'bootstrap', ...input });
        return { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
      },
      async claimLocalHousehold(input) {
        calls.push({ fn: 'claim', ...input });
        return { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
      },
    },
    identity: {
      current: () => staged,
      set: (next) => {
        staged = next;
      },
      save: async () => {
        stored = staged;
      },
    },
    localState: () => state,
    timezone: () => TZ,
    now: () => NOW,
    newClaimKey: () => '88888888-8888-4888-8888-888888888888',
    deviceId: null,
    onAccountIdentified: async (accountId) => identified.push(accountId),
    report: (event) => reports.push(event),
  });

  return { runtime, calls, identified, reports, secureStorage, sessionClient, onDisk: () => stored };
}

/** Everything the runtime wrote down or said, as one string to search for a sentinel. */
const everythingKept = (h) => JSON.stringify([h.secureStorage.contents(), h.onDisk(), h.reports, h.runtime.getState()]);

describe('email OTP — requesting a code', () => {
  test('1. a request reaches the port and changes no account state', async () => {
    const port = createScriptedEmailOtp({});
    const h = runtimeFor({ emailOtp: port });
    assert.equal(h.runtime.emailOtpAvailable(), true);

    assert.deepEqual(await h.runtime.requestEmailOtp(EMAIL), { kind: 'sent' });
    assert.equal(h.runtime.getState().kind, 'unauthenticated', 'asking for a code is not authenticating');
    assert.deepEqual(port.calls(), { request: 1, verify: 0 });
    assert.deepEqual(h.secureStorage.contents(), {}, 'nothing is stored for a code that has only been asked for');
    assert.deepEqual([h.calls, h.identified], [[], []]);
  });

  test('2. RESEND is the same request again — and a rate-limit refusal is returned once, never retried', async () => {
    const port = createScriptedEmailOtp({ requests: [{ kind: 'sent' }, { kind: 'rateLimited', detail: 'over_email_send_rate_limit' }] });
    const h = runtimeFor({ emailOtp: port });

    assert.deepEqual(await h.runtime.requestEmailOtp(EMAIL), { kind: 'sent' });
    assert.deepEqual(await h.runtime.requestEmailOtp(EMAIL), { kind: 'rateLimited', detail: 'over_email_send_rate_limit' });
    assert.deepEqual(port.calls(), { request: 2, verify: 0 }, 'one resend is one request: the service\'s limit is the authority, and it is not hammered');
    assert.equal(h.runtime.getState().kind, 'unauthenticated');
    assert.deepEqual(h.reports, [{ type: 'account.email_request_rateLimited', detail: 'over_email_send_rate_limit' }]);
  });

  test('3. every refusal comes back as itself: rejected, unreachable, and a port that throws anyway', async () => {
    for (const result of [{ kind: 'rejected', detail: 'email_address_invalid' }, { kind: 'unreachable', detail: 'status_0' }]) {
      const h = runtimeFor({ emailOtp: createScriptedEmailOtp({ requests: [result] }) });
      assert.deepEqual(await h.runtime.requestEmailOtp(EMAIL), result);
      assert.equal(h.runtime.getState().kind, 'unauthenticated');
    }
    const throwing = { isAvailable: () => true, request: async () => { throw new Error(`boom for ${EMAIL}`); }, verify: async () => ({ kind: 'failed', detail: 'x' }) };
    const h = runtimeFor({ emailOtp: throwing });
    assert.deepEqual(await h.runtime.requestEmailOtp(EMAIL), { kind: 'unreachable', detail: 'email_otp_request_threw' });
    assert.equal(everythingKept(h).includes(EMAIL), false, 'the thrown text — the one place an address could ride into a log — is not kept');
  });

  test('4. a build with no email backend refuses honestly, and never reaches a port', async () => {
    const h = runtimeFor({});
    assert.equal(h.runtime.emailOtpAvailable(), false);
    assert.deepEqual(await h.runtime.requestEmailOtp(EMAIL), { kind: 'unavailable', detail: 'email_otp_not_configured' });
    const verified = await h.runtime.verifyEmailOtp(EMAIL, CODE);
    assert.deepEqual(verified.outcome, { kind: 'unavailable', detail: 'email_otp_not_configured' });
    assert.equal(verified.state.kind, 'unauthenticated');
    assert.equal(UNAVAILABLE_EMAIL_OTP.isAvailable(), false);
  });

  test('5. a code is only asked for from a state that could use one', async () => {
    const port = createScriptedEmailOtp({});
    const h = runtimeFor({ emailOtp: port, identity: boundTo(ACCOUNT_A), secureInitial: { [SECURE_SESSION_KEY]: JSON.stringify(emailSession(ACCOUNT_A)) } });
    assert.equal((await h.runtime.restore()).kind, 'accountBound');

    assert.deepEqual(await h.runtime.requestEmailOtp(EMAIL), { kind: 'unavailable', detail: 'account_not_awaiting_sign_in' });
    const verified = await h.runtime.verifyEmailOtp(EMAIL, CODE);
    assert.equal(verified.outcome.kind, 'unavailable');
    assert.equal(verified.state.kind, 'accountBound', 'a bound account is not disturbed by a stray code');
    assert.deepEqual(port.calls(), { request: 0, verify: 0 });
  });
});

describe('email OTP — verifying a code', () => {
  test('6. NEW EMAIL IDENTITY: a verified code bootstraps and lands bound — keyed on the Supabase user id, never the address', async () => {
    const port = createScriptedEmailOtp({ verifications: [{ kind: 'success', session: emailSession(ACCOUNT_A) }] });
    const h = runtimeFor({ emailOtp: port });
    await h.runtime.requestEmailOtp(EMAIL);
    const { state, outcome } = await h.runtime.verifyEmailOtp(EMAIL, CODE);

    assert.deepEqual(outcome, { kind: 'verified' });
    assert.equal(state.kind, 'accountBound');
    assert.equal(state.session.accountId, ACCOUNT_A);
    assert.equal(state.householdId, HOUSEHOLD_A);
    assert.equal(canRenderAccountData(state) && canWriteToCloud(state), true);
    assert.deepEqual(h.calls.map((c) => c.fn), ['bootstrap'], 'the existing bootstrap, once');
    assert.deepEqual(h.identified, [ACCOUNT_A], 'the account is identified by its user id before anything else');
    assert.deepEqual(h.sessionClient.installed, [ACCOUNT_A]);
    assert.equal(h.onDisk().binding.accountId, ACCOUNT_A, 'the binding is to the user id');

    const kept = parseStoredSession(h.secureStorage.contents()[SECURE_SESSION_KEY]);
    assert.equal(kept.accountId, ACCOUNT_A);
    assert.deepEqual(kept.provider, { provider: 'email', subject: null, suggestedDisplayName: null }, 'email is recorded as provenance, with no subject');
  });

  test('7. PRIVACY: neither the address nor the code is stored, bound to, or reported — on success or on failure', async () => {
    const outcomes = [
      [{ kind: 'success', session: emailSession(ACCOUNT_A) }],
      [{ kind: 'codeRejected', detail: 'otp_expired' }],
      [{ kind: 'rateLimited', detail: 'status_429' }],
      [{ kind: 'unreachable', detail: 'status_0' }],
      [{ kind: 'failed', detail: 'no_session' }],
    ];
    for (const verifications of outcomes) {
      const h = runtimeFor({ emailOtp: createScriptedEmailOtp({ verifications }) });
      await h.runtime.requestEmailOtp(EMAIL);
      await h.runtime.verifyEmailOtp(EMAIL, CODE);
      const kept = everythingKept(h);
      assert.equal(kept.includes(EMAIL) || kept.toLowerCase().includes(EMAIL.toLowerCase()), false, `${verifications[0].kind}: the address is nowhere`);
      assert.equal(kept.includes(CODE), false, `${verifications[0].kind}: the code is nowhere`);
    }
  });

  test('8. a code that is not accepted is not an account failure: she is exactly where she was, and may try again', async () => {
    const port = createScriptedEmailOtp({
      verifications: [{ kind: 'codeRejected', detail: 'otp_expired' }, { kind: 'success', session: emailSession(ACCOUNT_A) }],
    });
    const h = runtimeFor({ emailOtp: port });
    const first = await h.runtime.verifyEmailOtp(EMAIL, '000000');

    assert.deepEqual(first.outcome, { kind: 'codeRejected', detail: 'otp_expired' });
    assert.equal(first.state.kind, 'unauthenticated', 'not authError: there is no failure banner to show, only the field to correct');
    assert.deepEqual([h.secureStorage.contents(), h.calls, h.identified, h.sessionClient.installed], [{}, [], [], []], 'nothing local moved');
    assert.deepEqual(h.onDisk(), UNBOUND_IDENTITY);

    const second = await h.runtime.verifyEmailOtp(EMAIL, CODE);
    assert.equal(second.state.kind, 'accountBound', 'the next code works from the same screen');
  });

  test('9. rate limit, network failure, no session, and a throwing port all leave the account untouched', async () => {
    for (const result of [{ kind: 'rateLimited', detail: 'status_429' }, { kind: 'unreachable', detail: 'status_0' }, { kind: 'failed', detail: 'no_session' }]) {
      const h = runtimeFor({ emailOtp: createScriptedEmailOtp({ verifications: [result] }) });
      const { state, outcome } = await h.runtime.verifyEmailOtp(EMAIL, CODE);
      assert.deepEqual(outcome, result);
      assert.equal(state.kind, 'unauthenticated');
      assert.deepEqual([h.secureStorage.contents(), h.calls, h.sessionClient.installed], [{}, [], []]);
    }
    const throwing = { isAvailable: () => true, request: async () => ({ kind: 'sent' }), verify: async () => { throw new Error(`boom ${EMAIL} ${CODE}`); } };
    const h = runtimeFor({ emailOtp: throwing });
    const { state, outcome } = await h.runtime.verifyEmailOtp(EMAIL, CODE);
    assert.deepEqual(outcome, { kind: 'unreachable', detail: 'email_otp_verify_threw' });
    assert.equal(state.kind, 'unauthenticated');
    assert.equal(everythingKept(h).includes(CODE), false);
  });

  test('10. a verified code whose session cannot be activated is an account failure like any provider\'s — and nothing is stored', async () => {
    const h = runtimeFor({
      emailOtp: createScriptedEmailOtp({ verifications: [{ kind: 'success', session: emailSession(ACCOUNT_A) }] }),
      sessionClient: recordingSessionClient({ activation: { kind: 'unreachable', detail: 'offline' } }),
    });
    const { state, outcome } = await h.runtime.verifyEmailOtp(EMAIL, CODE);
    assert.deepEqual(outcome, { kind: 'verified' }, 'the code itself was right');
    assert.deepEqual(state, { kind: 'authError', detail: 'offline', recoverable: true });
    assert.deepEqual([h.secureStorage.contents(), h.calls], [{}, []]);
  });
});

describe('email OTP — the same account rules as every other method', () => {
  test('11. RETURNING EMAIL IDENTITY: sign out, then the same email again — the same account, the same household, no second one', async () => {
    const port = createScriptedEmailOtp({ verifications: [{ kind: 'success', session: emailSession(ACCOUNT_A) }] });
    const h = runtimeFor({ emailOtp: port });
    const first = (await h.runtime.verifyEmailOtp(EMAIL, CODE)).state;
    assert.equal(first.kind, 'accountBound');

    assert.equal((await h.runtime.signOut()).kind, 'unauthenticated');
    assert.deepEqual(h.secureStorage.contents(), {}, 'the credential is gone');
    assert.equal(h.onDisk().binding.accountId, ACCOUNT_A, 'the binding is not');

    const again = (await h.runtime.verifyEmailOtp(EMAIL, CODE)).state;
    assert.equal(again.kind, 'accountBound');
    assert.equal(again.householdId, first.householdId, 'the same Supabase user resumes the same household');
    assert.deepEqual(h.calls.map((c) => c.fn), ['bootstrap'], 'no second bootstrap and no claim: nothing was created by signing in again');
  });

  test('12. one account, two methods: an email session for the SAME user id resumes the household an Apple sign-in bound', async () => {
    // Whether Supabase links an email identity to a provider identity is Supabase's decision. What this app guarantees is
    // only this: the same user id is the same account, and nothing here compares addresses to decide that.
    const h = runtimeFor({ emailOtp: createScriptedEmailOtp({ verifications: [{ kind: 'success', session: emailSession(ACCOUNT_A) }] }) });
    const viaApple = await h.runtime.signIn('apple');
    assert.equal(viaApple.kind, 'accountBound');
    await h.runtime.signOut();

    const viaEmail = (await h.runtime.verifyEmailOtp(EMAIL, CODE)).state;
    assert.equal(viaEmail.kind, 'accountBound');
    assert.equal(viaEmail.householdId, viaApple.householdId);
    assert.deepEqual(h.calls.map((c) => c.fn), ['bootstrap']);
  });

  test('13. BOUND_OTHER: an email code for another account on a bound device is quarantined — nothing renders, uploads, merges or is deleted', async () => {
    const identity = boundTo(ACCOUNT_A);
    const h = runtimeFor({ identity, emailOtp: createScriptedEmailOtp({ verifications: [{ kind: 'success', session: emailSession(ACCOUNT_B) }] }) });
    const { state, outcome } = await h.runtime.verifyEmailOtp(EMAIL, CODE);

    assert.deepEqual(outcome, { kind: 'verified' });
    assert.equal(state.kind, 'boundOther');
    assert.equal(state.quarantinedAccountId, ACCOUNT_A);
    assert.equal(canRenderAccountData(state), false, 'A\'s household must not reach the screen for B');
    assert.equal(canWriteToCloud(state), false);
    assert.deepEqual(h.calls, [], 'no bootstrap, no claim: nothing of A\'s goes up as B, and B gets no household made here');
    assert.deepEqual(h.sessionClient.installed, [], 'B\'s credential is never installed on the client that reaches A\'s data');
    assert.deepEqual(h.onDisk().binding, identity.binding, 'A\'s binding is preserved exactly');
    assert.equal(h.onDisk().quarantine.accountId, ACCOUNT_A);

    // The only way out is signing out, which returns the device to A's household, untouched.
    assert.equal((await h.runtime.signOut()).kind, 'unauthenticated');
    assert.deepEqual(h.onDisk().binding, identity.binding);
  });

  test('14. ACCOUNT SWITCH by email: A → sign out → B is quarantined; back to A resumes A, with no claim sent for anyone', async () => {
    const port = createScriptedEmailOtp({
      verifications: [
        { kind: 'success', session: emailSession(ACCOUNT_A) },
        { kind: 'success', session: emailSession(ACCOUNT_B) },
        { kind: 'success', session: emailSession(ACCOUNT_A) },
      ],
    });
    const h = runtimeFor({ emailOtp: port });

    const a = (await h.runtime.verifyEmailOtp(EMAIL, CODE)).state;
    assert.equal(a.kind, 'accountBound');
    await h.runtime.signOut();

    const b = (await h.runtime.verifyEmailOtp('other@example.test', CODE)).state;
    assert.equal(b.kind, 'boundOther', 'B does not inherit A\'s household or A\'s sync namespace');
    assert.equal(h.onDisk().sync?.accountId ?? h.onDisk().binding.accountId, ACCOUNT_A, 'the namespace on disk is still A\'s');
    assert.deepEqual(h.sessionClient.installed, [ACCOUNT_A], 'only A was ever a transport credential');
    await h.runtime.signOut();

    const back = (await h.runtime.verifyEmailOtp(EMAIL, CODE)).state;
    assert.equal(back.kind, 'accountBound');
    assert.equal(back.session.accountId, ACCOUNT_A);
    assert.equal(back.householdId, a.householdId, 'returning to A restores A');
    assert.deepEqual(h.calls.map((c) => c.fn), ['bootstrap'], 'one bootstrap, ever: B never wrote through A\'s household');
    assert.deepEqual(h.identified, [ACCOUNT_A, null, ACCOUNT_B, null, ACCOUNT_A]);
  });

  test('15. AUTH DEGRADED: the same account reconnects by email and is bound again; the household never unbound in between', async () => {
    const h = runtimeFor({
      identity: boundTo(ACCOUNT_A),
      emailOtp: createScriptedEmailOtp({ verifications: [{ kind: 'success', session: emailSession(ACCOUNT_A) }] }),
      secureInitial: { [SECURE_SESSION_KEY]: JSON.stringify(emailSession(ACCOUNT_A)) },
      sessionClient: (() => {
        // The stored credential is refused once (the lapse), then a fresh one activates.
        const client = recordingSessionClient();
        let first = true;
        const activate = client.activate.bind(client);
        client.activate = async (session) => {
          if (first) {
            first = false;
            return { kind: 'invalid', detail: 'refresh token revoked' };
          }
          return activate(session);
        };
        return client;
      })(),
    });
    const degraded = await h.runtime.restore();
    assert.equal(degraded.kind, 'authDegraded');
    assert.equal(canRenderAccountData(degraded), true, 'her household stays on screen while the credential is lapsed');

    assert.deepEqual(await h.runtime.requestEmailOtp(EMAIL), { kind: 'sent' }, 'a degraded account may ask for a code to reconnect');
    assert.equal(h.runtime.getState().kind, 'authDegraded');

    const { state, outcome } = await h.runtime.verifyEmailOtp(EMAIL, CODE);
    assert.deepEqual(outcome, { kind: 'verified' });
    assert.equal(state.kind, 'accountBound');
    assert.equal(state.householdId, HOUSEHOLD_A);
    assert.deepEqual(h.calls, [], 'a reconnect is not a claim');
    assert.equal(parseStoredSession(h.secureStorage.contents()[SECURE_SESSION_KEY]).accountId, ACCOUNT_A);
  });

  test('16. AUTH DEGRADED, wrong actor: another account\'s code does not reconnect, replace or quarantine a degraded household', async () => {
    const h = runtimeFor({
      identity: boundTo(ACCOUNT_A),
      emailOtp: createScriptedEmailOtp({ verifications: [{ kind: 'success', session: emailSession(ACCOUNT_B) }, { kind: 'codeRejected', detail: 'otp_expired' }] }),
      secureInitial: { [SECURE_SESSION_KEY]: JSON.stringify(emailSession(ACCOUNT_A)) },
      sessionClient: recordingSessionClient({ activation: { kind: 'unreachable', detail: 'offline' } }),
    });
    const degraded = await h.runtime.restore();
    assert.equal(degraded.kind, 'authDegraded');

    const wrong = await h.runtime.verifyEmailOtp('other@example.test', CODE);
    assert.deepEqual(wrong.outcome, { kind: 'verified' });
    assert.deepEqual(wrong.state, degraded, 'still A\'s household, still degraded');
    assert.ok(h.reports.some((event) => event.type === 'account.reauth_wrong_actor'));
    assert.equal(h.onDisk().binding.accountId, ACCOUNT_A);
    assert.equal(h.onDisk().quarantine, null);

    const rejected = await h.runtime.verifyEmailOtp(EMAIL, '000000');
    assert.equal(rejected.outcome.kind, 'codeRejected');
    assert.deepEqual(rejected.state, degraded, 'a rejected code leaves a degraded account degraded, not signed out');
  });
});

describe('stale answers — an authentication that outlives the state it started from', () => {
  /** A port (or provider) whose answer is held back until the test releases it. */
  const deferred = () => {
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    return { promise, release };
  };

  test('17. a code check that returns after she signed out is dropped: no session is installed, stored, or bound', async () => {
    const gate = deferred();
    const port = { isAvailable: () => true, request: async () => ({ kind: 'sent' }), verify: () => gate.promise };
    const h = runtimeFor({ emailOtp: port });

    const pending = h.runtime.verifyEmailOtp(EMAIL, CODE);
    assert.equal(h.runtime.getState().kind, 'authenticating');
    assert.equal((await h.runtime.signOut()).kind, 'unauthenticated');

    gate.release({ kind: 'success', session: emailSession(ACCOUNT_A) });
    const { state, outcome } = await pending;
    assert.deepEqual(outcome, { kind: 'failed', detail: 'auth_superseded' });
    assert.equal(state.kind, 'unauthenticated');
    assert.deepEqual([h.secureStorage.contents(), h.calls, h.sessionClient.installed, h.identified], [{}, [], [], [null]]);
    assert.deepEqual(h.onDisk(), UNBOUND_IDENTITY);
  });

  test('18. A\'s late provider answer cannot land on B: a superseded sign-in never becomes the account in force', async () => {
    const gate = deferred();
    const slowApple = { provider: 'apple', isAvailable: async () => true, signIn: () => gate.promise };
    const calls = [];
    const secureStorage = createMemorySecureStorage({});
    const sessionClient = recordingSessionClient();
    let staged = UNBOUND_IDENTITY;
    const runtime = createAccountRuntime({
      sessions: createSecureSessionStore(secureStorage),
      sessionClient,
      providers: createProviderRegistry([slowApple]),
      emailOtp: createScriptedEmailOtp({ verifications: [{ kind: 'success', session: emailSession(ACCOUNT_B) }] }),
      cloud: {
        async bootstrapAccount() {
          calls.push('bootstrap');
          return { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
        },
        async claimLocalHousehold() {
          calls.push('claim');
          return { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
        },
      },
      identity: { current: () => staged, set: (next) => { staged = next; }, save: async () => {} },
      localState: () => createEmptyState(TZ),
      timezone: () => TZ,
      now: () => NOW,
      newClaimKey: () => '88888888-8888-4888-8888-888888888888',
    });

    // A starts Apple and walks away from the sheet; the device is signed out and B signs in by email.
    const stale = runtime.signIn('apple');
    await runtime.signOut();
    const b = (await runtime.verifyEmailOtp(EMAIL, CODE)).state;
    assert.equal(b.kind, 'accountBound');
    assert.equal(b.session.accountId, ACCOUNT_B);

    // A's answer finally arrives. B is the account in force and stays so.
    gate.release({ kind: 'success', session: appleSession(ACCOUNT_A) });
    const afterStale = await stale;
    assert.equal(afterStale.kind, 'accountBound');
    assert.equal(afterStale.session.accountId, ACCOUNT_B, 'the stale answer changed nothing');
    assert.equal(runtime.getState().session.accountId, ACCOUNT_B);
    assert.deepEqual(sessionClient.installed, [ACCOUNT_B], 'A\'s credential was never installed');
    assert.equal(parseStoredSession(secureStorage.contents()[SECURE_SESSION_KEY]).accountId, ACCOUNT_B, 'and never stored');
    assert.equal(staged.binding.accountId, ACCOUNT_B);
    assert.deepEqual(calls, ['bootstrap']);
  });

  test('18b. A\'s answer arriving WHILE B is still signing in is dropped too: only the latest attempt may be answered', async () => {
    // The hard case: at the moment A's answer lands, the state is 'authenticating' again — B's attempt — so the state
    // alone cannot tell the two apart. Each attempt is numbered; A's is no longer the latest.
    const appleGate = deferred();
    const emailGate = deferred();
    const sessionClient = recordingSessionClient();
    const secureStorage = createMemorySecureStorage({});
    let staged = UNBOUND_IDENTITY;
    const runtime = createAccountRuntime({
      sessions: createSecureSessionStore(secureStorage),
      sessionClient,
      providers: createProviderRegistry([{ provider: 'apple', isAvailable: async () => true, signIn: () => appleGate.promise }]),
      emailOtp: { isAvailable: () => true, request: async () => ({ kind: 'sent' }), verify: () => emailGate.promise },
      cloud: {
        bootstrapAccount: async () => ({ kind: 'ok', body: completeBody(HOUSEHOLD_A) }),
        claimLocalHousehold: async () => ({ kind: 'ok', body: completeBody(HOUSEHOLD_A) }),
      },
      identity: { current: () => staged, set: (next) => { staged = next; }, save: async () => {} },
      localState: () => createEmptyState(TZ),
      timezone: () => TZ,
      now: () => NOW,
      newClaimKey: () => '88888888-8888-4888-8888-888888888888',
    });

    const stale = runtime.signIn('apple');
    await runtime.signOut();
    const current = runtime.verifyEmailOtp(EMAIL, CODE);
    assert.equal(runtime.getState().kind, 'authenticating', 'B\'s attempt is in flight');

    appleGate.release({ kind: 'success', session: appleSession(ACCOUNT_A) });
    assert.equal((await stale).kind, 'authenticating', 'A\'s answer is dropped; B\'s attempt is undisturbed');
    assert.deepEqual([sessionClient.installed, secureStorage.contents()], [[], {}], 'nothing of A\'s was installed or stored');

    emailGate.release({ kind: 'success', session: emailSession(ACCOUNT_B) });
    const b = (await current).state;
    assert.equal(b.kind, 'accountBound');
    assert.equal(b.session.accountId, ACCOUNT_B);
    assert.deepEqual(sessionClient.installed, [ACCOUNT_B]);
    assert.equal(staged.binding.accountId, ACCOUNT_B);
  });

  test('19. a provider sheet cancelled or failed after a sign-out reports nothing and moves nothing', async () => {
    for (const late of [{ kind: 'cancelled' }, { kind: 'providerError', detail: 'late failure' }]) {
      const gate = deferred();
      const slow = createAccountRuntime({
        sessions: createSecureSessionStore(createMemorySecureStorage({})),
        providers: createProviderRegistry([{ provider: 'apple', isAvailable: async () => true, signIn: () => gate.promise }]),
        cloud: { bootstrapAccount: async () => ({ kind: 'rejected', detail: 'x' }), claimLocalHousehold: async () => ({ kind: 'rejected', detail: 'x' }) },
        identity: { current: () => UNBOUND_IDENTITY, set: () => {}, save: async () => {} },
        localState: () => createEmptyState(TZ),
        timezone: () => TZ,
        now: () => NOW,
        newClaimKey: () => '88888888-8888-4888-8888-888888888888',
      });
      const pending = slow.signIn('apple');
      await slow.signOut();
      gate.release(late);
      assert.equal((await pending).kind, 'unauthenticated', `${late.kind}: no error state appears for an attempt she already left`);
    }
  });
});

describe('email provenance in the credential store', () => {
  test('20. an email session round-trips; an unknown method is still refused rather than half-trusted', () => {
    const stored = JSON.stringify(emailSession(ACCOUNT_A));
    assert.deepEqual(parseStoredSession(stored).provider, { provider: 'email', subject: null, suggestedDisplayName: null });
    for (const provider of ['apple', 'google', 'email']) {
      assert.equal(parseStoredSession(JSON.stringify(emailSession(ACCOUNT_A, { provider: { provider, subject: null, suggestedDisplayName: null } }))).provider.provider, provider);
    }
    for (const provider of ['password', 'magiclink', 'sms', 'Email', '']) {
      assert.equal(parseStoredSession(JSON.stringify(emailSession(ACCOUNT_A, { provider: { provider, subject: null, suggestedDisplayName: null } }))), null, provider);
    }
  });
});
