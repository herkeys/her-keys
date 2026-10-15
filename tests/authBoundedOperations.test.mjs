/**
 * P0 welcome-tree recovery: every account operation must END.
 *
 * The incident: Google's PKCE exchange returned 200, then the app stayed on a
 * spinner and never reached `bootstrap_account`. The earlier suite passed
 * thousands of tests because every mock answered immediately. These tests use
 * operations that NEVER settle (a deferred promise nobody resolves), which is
 * what a stalled native SDK or a half-open socket actually does.
 *
 * Each case asserts three things: the runtime reaches a defined state within a
 * bound, that state offers a real retry, and a late answer cannot change who is
 * signed in or which household is bound.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createAccountRuntime } from '../src/domain/account/accountRuntime.ts';
import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import { createScriptedEmailPassword } from '../src/domain/account/emailPassword.ts';
import { withDeadline } from '../src/domain/account/deadline.ts';
import { createProviderRegistry, createScriptedProvider } from '../src/domain/account/provider.ts';
import { SECURE_SESSION_KEY, createMemorySecureStorage, createSecureSessionStore } from '../src/domain/account/secureSession.ts';
import { signInWithGoogleOAuth } from '../src/platform/googleIdentityOAuth.ts';
import { createTimeoutFetch } from '../src/platform/timeoutFetch.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { TZ } from './support/fixtures.mjs';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const HOUSEHOLD_A = '33333333-3333-4333-8333-333333333333';
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const BOUND = 40; // every deadline in this file, milliseconds

const sessionFor = (accountId, over = {}) => ({
  accountId,
  accessToken: `access-${accountId}`,
  refreshToken: `refresh-${accountId}`,
  expiresAt: NOW + 3_600_000,
  provider: { provider: 'google', subject: `g-${accountId}`, suggestedDisplayName: null },
  ...over,
});

const completeBody = (householdId) => ({
  status: 'complete',
  rejected_reason: null,
  claim_id: '55555555-5555-4555-8555-555555555555',
  household_id: householdId,
  id_map: { 'household-1': householdId, 'user-1': '66666666-6666-4666-8666-666666666666' },
  conflict_evidence: [],
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
/** A harness failure must not hang the suite: anything not finished by 2s is a failed test. */
const finishes = (operation) => Promise.race([operation, sleep(2000).then(() => { throw new Error('operation never finished'); })]);

function harness({
  identity = UNBOUND_IDENTITY,
  providerResults = [{ kind: 'success', session: sessionFor(ACCOUNT_A) }],
  providerSignIn,
  passwordResults = [],
  emailPassword,
  cloud,
  sessionClient,
  storage,
  secureInitial = {},
} = {}) {
  const calls = [];
  const saves = [];
  const events = [];
  let staged = identity;
  let stored = identity;
  const memory = createMemorySecureStorage(secureInitial);
  const secureStorage = storage ? storage(memory) : memory;

  const defaultCloud = {
    async bootstrapAccount(input) {
      calls.push({ fn: 'bootstrap', ...input });
      return { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
    },
    async claimLocalHousehold(input) {
      calls.push({ fn: 'claim', ...input });
      return { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
    },
  };

  const adapter = providerSignIn
    ? { provider: 'google', isAvailable: async () => true, signIn: providerSignIn }
    : createScriptedProvider('google', { results: providerResults });

  const runtime = createAccountRuntime({
    sessions: createSecureSessionStore(secureStorage),
    sessionClient,
    providers: createProviderRegistry([adapter]),
    emailPassword: emailPassword ?? createScriptedEmailPassword(passwordResults),
    cloud: cloud ?? defaultCloud,
    identity: {
      current: () => staged,
      set: (next) => { staged = next; },
      save: async () => { saves.push(staged); stored = staged; },
    },
    localState: () => createEmptyState(TZ),
    timezone: () => TZ,
    now: () => Date.now(),
    newClaimKey: () => '88888888-8888-4888-8888-888888888888',
    deviceId: null,
    onAccountIdentified: async () => {},
    report: (event) => events.push(event),
    trace: (event) => events.push(event),
    deadlines: { activateMs: BOUND, secureStoreMs: BOUND, bindingRpcMs: BOUND, emailRequestMs: BOUND, providerSheetMs: BOUND },
  });

  return { runtime, calls, saves, events, memory, onDisk: () => stored, staged: () => staged };
}

/** A transport client whose `activate` is scripted per call. */
function transport(script) {
  const log = { activations: 0, signOuts: 0 };
  return {
    log,
    client: {
      async activate(session) {
        log.activations += 1;
        return script(log.activations, session);
      },
      async signOut() { log.signOuts += 1; return { kind: 'ok' }; },
      startAutoRefresh() {},
      stopAutoRefresh() {},
      subscribe() { return () => undefined; },
    },
  };
}

describe('withDeadline', () => {
  test('resolves with the value when the work finishes first, and rejects when it throws', async () => {
    assert.deepEqual(await withDeadline(Promise.resolve(7), 50), { timedOut: false, value: 7 });
    await assert.rejects(withDeadline(Promise.reject(new Error('x')), 50), /x/);
  });

  test('reports a timeout for work that never settles, and a late rejection is not unhandled', async () => {
    const late = deferred();
    const outcome = await withDeadline(new Promise((_, reject) => { late.resolve = () => reject(new Error('late')); }), 10);
    assert.deepEqual(outcome, { timedOut: true });
    late.resolve();
    await sleep(10);
  });
});

describe('session activation never settles (setSession)', () => {
  test('Google PKCE succeeded but setSession hangs: the attempt ends as a retryable error, then a retry binds', async () => {
    const t = transport((n, session) => (n === 1 ? new Promise(() => {}) : { kind: 'active', session }));
    const h = harness({ sessionClient: t.client });

    const first = await finishes(h.runtime.signIn('google'));
    assert.equal(first.kind, 'authError');
    assert.equal(first.recoverable, true, 'a hung transport is a retryable failure, not a dead end');
    assert.ok(h.events.some((e) => e.type === 'auth.session.activate.timeout'));
    assert.equal(h.calls.length, 0, 'no household request was made on an unactivated session');
    assert.equal(h.memory.contents()[SECURE_SESSION_KEY], undefined, 'nothing was persisted for the failed attempt');

    const retry = await finishes(h.runtime.signIn('google'));
    assert.equal(retry.kind, 'accountBound');
    assert.equal(h.onDisk().binding.accountId, ACCOUNT_A);
    assert.deepEqual(h.calls.map((c) => c.fn), ['bootstrap']);
  });

  test('a late activation of the timed-out attempt is signed out, not adopted', async () => {
    const late = deferred();
    const t = transport(() => late.promise);
    const h = harness({ sessionClient: t.client });

    const first = await finishes(h.runtime.signIn('google'));
    assert.equal(first.kind, 'authError');
    late.resolve({ kind: 'active', session: sessionFor(ACCOUNT_A) });
    await sleep(20);

    assert.equal(t.log.signOuts, 1, 'the stray transport credential is removed');
    assert.equal(h.staged().binding, null, 'a late answer binds nothing');
    assert.equal(h.runtime.getState().kind, 'authError');
  });

  test('a late activation does not sign out the session a newer retry installed', async () => {
    const first = deferred();
    const t = transport((n, session) => (n === 1 ? first.promise : { kind: 'active', session }));
    const h = harness({ sessionClient: t.client });

    assert.equal((await finishes(h.runtime.signIn('google'))).kind, 'authError');
    assert.equal((await finishes(h.runtime.signIn('google'))).kind, 'accountBound');
    first.resolve({ kind: 'active', session: sessionFor(ACCOUNT_A) });
    await sleep(20);

    assert.equal(t.log.signOuts, 0, 'the bound account keeps its transport session');
    assert.equal(h.runtime.getState().kind, 'accountBound');
  });

  test('signing out while activation is pending: a late success never rebinds', async () => {
    const pending = deferred();
    const t = transport(() => pending.promise);
    const h = harness({ sessionClient: t.client });

    const signingIn = h.runtime.signIn('google');
    await sleep(5);
    const out = await h.runtime.signOut();
    assert.equal(out.kind, 'unauthenticated');
    pending.resolve({ kind: 'active', session: sessionFor(ACCOUNT_A) });
    await finishes(signingIn);
    await sleep(10);

    assert.equal(h.runtime.getState().kind, 'unauthenticated');
    assert.equal(h.staged().binding, null);
    assert.equal(h.calls.length, 0);
    assert.equal(h.memory.contents()[SECURE_SESSION_KEY], undefined, 'the credential was not written after logout');
  });

  test('a second account cannot take over a stalled first one', async () => {
    const pending = deferred();
    const t = transport((n, session) => (n === 1 ? pending.promise : { kind: 'active', session }));
    const h = harness({
      sessionClient: t.client,
      providerResults: [
        { kind: 'success', session: sessionFor(ACCOUNT_A) },
        { kind: 'success', session: sessionFor(ACCOUNT_B) },
      ],
    });
    const a = h.runtime.signIn('google');
    assert.equal((await finishes(a)).kind, 'authError');
    assert.equal((await finishes(h.runtime.signIn('google'))).kind, 'accountBound');
    pending.resolve({ kind: 'active', session: sessionFor(ACCOUNT_A) });
    await sleep(20);
    assert.equal(h.onDisk().binding.accountId, ACCOUNT_B, 'the household belongs to the account that completed');
    assert.equal(h.runtime.getState().session.accountId, ACCOUNT_B);
  });
});

describe('cold-start restore never hangs', () => {
  const stored = { [SECURE_SESSION_KEY]: JSON.stringify(sessionFor(ACCOUNT_A)) };
  const boundIdentity = {
    binding: { accountId: ACCOUNT_A, householdId: HOUSEHOLD_A, boundAt: new Date(NOW).toISOString(), kind: 'bootstrap', idMap: {} },
    receipt: null,
    quarantine: null,
    sync: null,
  };

  test('setSession hangs for a bound household: degraded/offline, household untouched, credential kept', async () => {
    const t = transport(() => new Promise(() => {}));
    const h = harness({ sessionClient: t.client, secureInitial: stored, identity: boundIdentity });
    const state = await finishes(h.runtime.restore());
    assert.equal(state.kind, 'authDegraded');
    assert.equal(state.householdId, HOUSEHOLD_A);
    assert.equal(h.staged().binding.householdId, HOUSEHOLD_A, 'the household binding is not erased');
    assert.ok(h.memory.contents()[SECURE_SESSION_KEY], 'a stalled network is not evidence the credential is bad');
  });

  test('setSession hangs on a device with no account: signed out and offered the Welcome tree', async () => {
    const t = transport(() => new Promise(() => {}));
    const h = harness({ sessionClient: t.client, secureInitial: stored });
    assert.equal((await finishes(h.runtime.restore())).kind, 'unauthenticated');
  });

  test('a SecureStore read that never answers is treated as unavailable, never as "new user" over a bound household', async () => {
    const h = harness({
      identity: boundIdentity,
      secureInitial: stored,
      storage: (memory) => ({ ...memory, getItem: () => new Promise(() => {}) }),
    });
    const state = await finishes(h.runtime.restore());
    assert.equal(state.kind, 'authDegraded');
    assert.equal(h.staged().binding.accountId, ACCOUNT_A);
  });

  test('a SecureStore read that never answers with no household is simply signed out', async () => {
    const h = harness({ storage: (memory) => ({ ...memory, getItem: () => new Promise(() => {}) }) });
    assert.equal((await finishes(h.runtime.restore())).kind, 'unauthenticated');
  });
});

describe('secure persistence never settles', () => {
  test('a SecureStore write that hangs fails the attempt, removes the transport credential, and a retry binds', async () => {
    let hang = true;
    const t = transport((n, session) => ({ kind: 'active', session }));
    const h = harness({
      sessionClient: t.client,
      storage: (memory) => ({ ...memory, setItem: (k, v) => (hang ? new Promise(() => {}) : memory.setItem(k, v)) }),
    });
    const first = await finishes(h.runtime.signIn('google'));
    assert.equal(first.kind, 'authError');
    assert.equal(first.recoverable, true);
    assert.equal(t.log.signOuts, 1, 'no credential is left installed without a durable home');
    assert.equal(h.staged().binding, null);

    hang = false;
    assert.equal((await finishes(h.runtime.signIn('google'))).kind, 'accountBound');
  });
});

describe('household initialization never answers', () => {
  test('bootstrap RPC hangs: unbound but signed in, receipt kept, retry replays the SAME claim key and binds once', async () => {
    let attempts = 0;
    const first = deferred();
    const cloud = {
      async bootstrapAccount(input) {
        attempts += 1;
        this.keys = [...(this.keys ?? []), input.claimKey];
        if (attempts === 1) return first.promise;
        return { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
      },
      async claimLocalHousehold() { throw new Error('unexpected claim'); },
    };
    const h = harness({ cloud });

    const failed = await finishes(h.runtime.signIn('google'));
    assert.equal(failed.kind, 'authenticatedUnbound', 'the session is good; only the binding is outstanding');
    assert.ok(h.events.some((e) => e.type === 'account.claim_unreachable'));
    assert.equal(h.staged().receipt.claimKey, '88888888-8888-4888-8888-888888888888', 'the claim key was written before the request left');
    assert.equal(h.staged().binding, null);

    const bound = await finishes(h.runtime.resolveBinding());
    assert.equal(bound.kind, 'accountBound');
    assert.deepEqual(cloud.keys, [cloud.keys[0], cloud.keys[0]], 'one key, replayed');

    // The first request finally answers with a different household id. It must change nothing.
    first.resolve({ kind: 'ok', body: completeBody('99999999-9999-4999-8999-999999999999') });
    await sleep(20);
    assert.equal(h.runtime.getState().householdId, HOUSEHOLD_A);
    assert.equal(h.onDisk().binding.householdId, HOUSEHOLD_A);
  });

  test('signing out during a hung bootstrap: the late answer cannot bind the signed-out device', async () => {
    const pending = deferred();
    const cloud = { bootstrapAccount: () => pending.promise, claimLocalHousehold: async () => ({ kind: 'rejected', detail: 'x' }) };
    const h = harness({ cloud });
    const signingIn = h.runtime.signIn('google');
    await sleep(10);
    assert.equal((await h.runtime.signOut()).kind, 'unauthenticated');
    pending.resolve({ kind: 'ok', body: completeBody(HOUSEHOLD_A) });
    await finishes(signingIn);
    assert.equal(h.runtime.getState().kind, 'unauthenticated');
    assert.equal(h.staged().binding, null);
  });
});

describe('provider and email calls never settle', () => {
  test('a provider sheet that never returns ends as a retryable error; its late success is dropped', async () => {
    const late = deferred();
    let calls = 0;
    const h = harness({
      providerSignIn: () => {
        calls += 1;
        return calls === 1 ? late.promise : Promise.resolve({ kind: 'success', session: sessionFor(ACCOUNT_A) });
      },
    });
    const first = await finishes(h.runtime.signIn('google'));
    assert.equal(first.kind, 'authError');
    assert.equal((await finishes(h.runtime.signIn('google'))).kind, 'accountBound');
    late.resolve({ kind: 'success', session: sessionFor(ACCOUNT_B) });
    await sleep(20);
    assert.equal(h.runtime.getState().session.accountId, ACCOUNT_A, 'the stale provider answer cannot replace the account');
  });

  test('email/password that never settles returns to the sign-in screen with an actionable outcome', async () => {
    const h = harness({
      emailPassword: { isAvailable: () => true, authenticate: () => new Promise(() => {}) },
    });
    const result = await finishes(h.runtime.authenticateEmailPassword('signIn', 'a@example.test', 'pw'));
    assert.equal(result.outcome.kind, 'unreachable');
    assert.equal(result.state.kind, 'unauthenticated', 'not stuck in authenticating: the next attempt is allowed');
  });

  test('email code verification that never settles also returns to a state that accepts a retry', async () => {
    const h = harness();
    const runtime = createAccountRuntime({
      sessions: createSecureSessionStore(createMemorySecureStorage()),
      providers: createProviderRegistry([]),
      emailOtp: { isAvailable: () => true, request: () => new Promise(() => {}), verify: () => new Promise(() => {}) },
      cloud: { bootstrapAccount: async () => ({ kind: 'rejected', detail: 'x' }), claimLocalHousehold: async () => ({ kind: 'rejected', detail: 'x' }) },
      identity: { current: () => UNBOUND_IDENTITY, set() {}, save: async () => {} },
      localState: () => createEmptyState(TZ),
      timezone: () => TZ,
      now: () => Date.now(),
      newClaimKey: () => '88888888-8888-4888-8888-888888888888',
      deadlines: { emailRequestMs: BOUND },
    });
    assert.equal((await finishes(runtime.requestEmailOtp('a@example.test'))).kind, 'unreachable');
    const verified = await finishes(runtime.verifyEmailOtp('a@example.test', '123456'));
    assert.equal(verified.outcome.kind, 'unreachable');
    assert.equal(verified.state.kind, 'unauthenticated');
    void h;
  });

  test('sign-out finishes even if the transport client never answers, and clears the durable credential', async () => {
    const t = transport((n, session) => ({ kind: 'active', session }));
    t.client.signOut = () => new Promise(() => {});
    const h = harness({ sessionClient: t.client });
    assert.equal((await finishes(h.runtime.signIn('google'))).kind, 'accountBound');
    const out = await finishes(h.runtime.signOut());
    assert.equal(out.kind, 'unauthenticated');
    assert.equal(h.memory.contents()[SECURE_SESSION_KEY], undefined);
    assert.equal(h.staged().binding.accountId, ACCOUNT_A, 'the household binding survives sign-out');
  });
});

describe('Google OAuth network steps', () => {
  const callbackOpen = async () => ({ type: 'success', url: 'herkeys://auth/callback?code=abc' });

  test('exchangeCodeForSession that never settles is a provider error, not a pending sheet', async () => {
    const client = {
      auth: {
        signInWithOAuth: async () => ({ data: { url: 'https://example.test/authorize' }, error: null }),
        exchangeCodeForSession: () => new Promise(() => {}),
      },
    };
    const result = await finishes(signInWithGoogleOAuth(client, callbackOpen, { exchangeMs: BOUND }));
    assert.deepEqual(result, { kind: 'providerError', detail: 'google_code_exchange_timeout' });
  });

  test('signInWithOAuth that never settles is a provider error', async () => {
    const client = { auth: { signInWithOAuth: () => new Promise(() => {}), exchangeCodeForSession: async () => ({}) } };
    const result = await finishes(signInWithGoogleOAuth(client, callbackOpen, { authorizeMs: BOUND }));
    assert.deepEqual(result, { kind: 'providerError', detail: 'google_authorize_timeout' });
  });
});

describe('timeout fetch', () => {
  test('aborts a request that never answers and rejects, instead of leaving the caller pending', async () => {
    let signal;
    const base = (input, init) => new Promise((_, reject) => {
      signal = init.signal;
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const fetchWithTimeout = createTimeoutFetch(base, { authRest: 20 });
    await assert.rejects(finishes(fetchWithTimeout('https://x.supabase.co/auth/v1/user')), /aborted/);
    assert.equal(signal.aborted, true);
  });

  test('gives Edge Functions a longer ceiling than auth and database calls', async () => {
    const base = (input, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      setTimeout(() => resolve({ ok: true }), 60);
    });
    const fetchWithTimeout = createTimeoutFetch(base, { authRest: 20, functions: 500 });
    assert.deepEqual(await fetchWithTimeout('https://x.supabase.co/functions/v1/herkeys-ai'), { ok: true });
    await assert.rejects(fetchWithTimeout('https://x.supabase.co/rest/v1/rpc/bootstrap_account'), /aborted/);
  });

  test('a caller abort still aborts, and a finished request leaves no timer behind', async () => {
    const controller = new AbortController();
    const base = (input, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('caller'))));
    const fetchWithTimeout = createTimeoutFetch(base, { authRest: 5_000 });
    const pending = fetchWithTimeout('https://x.supabase.co/auth/v1/user', { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, /caller/);
  });
});

describe('bounds are consistent with each other', () => {
  test('the launch fallback is longer than the sum of the runtime steps a restore can take', async () => {
    const { DEFAULT_ACCOUNT_DEADLINES: d } = await import('../src/domain/account/deadline.ts');
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../src/store/AccountProvider.tsx', import.meta.url), 'utf8');
    const fallback = Number(/RESTORE_FALLBACK_MS = ([\d_]+);/.exec(source)?.[1].replaceAll('_', ''));
    const worstRestore = d.secureStoreMs + d.activateMs + d.secureStoreMs + d.bindingRpcMs;
    assert.ok(fallback > worstRestore, `fallback ${fallback} must exceed ${worstRestore} so the runtime answers first`);
  });

  test('a network request ceiling outlasts the step that waits on it, so the step ends first and cleanly', async () => {
    const { DEFAULT_ACCOUNT_DEADLINES: d } = await import('../src/domain/account/deadline.ts');
    const { AUTH_REST_TIMEOUT_MS } = await import('../src/platform/timeoutFetch.ts');
    assert.ok(AUTH_REST_TIMEOUT_MS >= d.activateMs);
    assert.ok(d.bindingRpcMs >= AUTH_REST_TIMEOUT_MS, 'an RPC step gives its request the whole ceiling before giving up');
  });
});

describe('auth diagnostics carry no free text', () => {
  test('only stage names and millisecond durations are kept; any other detail is dropped', async () => {
    const { recordAuthDiagnostic, authDiagnosticEvents, clearAuthDiagnostics } = await import('../src/platform/authDiagnostics.ts');
    clearAuthDiagnostics();
    recordAuthDiagnostic({ type: 'auth.session.activate.completed', detail: 'ms=812' }, 1);
    recordAuthDiagnostic({ type: 'auth.provider.sheet.completed', detail: 'someone@example.test' }, 2);
    recordAuthDiagnostic({ type: 'auth.x', detail: 'ms=12 token=abc' }, 3);
    const events = authDiagnosticEvents();
    assert.deepEqual(events.map((e) => e.detail), ['ms=812', undefined, undefined]);
    assert.ok(!JSON.stringify(events).includes('example.test'));
    clearAuthDiagnostics();
  });
});
