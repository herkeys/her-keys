/**
 * B4-BACKEND-02 — the auth / account / claim matrix.
 *
 * The runtime is exercised with real domain objects and scripted adapters: no
 * Apple, no Google, no network, no keychain. Two rules are asserted everywhere:
 * auth never destroys household data, and an account is not bound until the
 * binding and its complete id map are on disk.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createAccountRuntime } from '../src/domain/account/accountRuntime.ts';
import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import { createProviderRegistry, createScriptedProvider } from '../src/domain/account/provider.ts';
import {
  SECURE_SESSION_KEY,
  createMemorySecureStorage,
  createSecureSessionStore,
  parseStoredSession,
} from '../src/domain/account/secureSession.ts';
import { canRenderAccountData, canWriteToCloud } from '../src/domain/account/authState.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { TZ, demoState } from './support/fixtures.mjs';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const HOUSEHOLD_A = '33333333-3333-4333-8333-333333333333';
const HOUSEHOLD_B = '44444444-4444-4444-8444-444444444444';
const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);

const sessionFor = (accountId, over = {}) => ({
  accountId,
  accessToken: `access-${accountId}`,
  refreshToken: `refresh-${accountId}`,
  expiresAt: NOW + 3_600_000,
  provider: { provider: 'apple', subject: `apple-${accountId}`, suggestedDisplayName: null },
  ...over,
});

const task = (id) => ({
  id,
  title: 'Rinse the recycling',
  categoryId: 'cat-home',
  subjectMemberId: null,
  durationMinutes: 10,
  commitment: 'flexible',
  dueDate: null,
  plan: { kind: 'unplanned' },
  notes: null,
  status: 'open',
  completedAt: null,
  createdAt: null,
  updatedAt: null,
  provenance: { producer: 'user-action', artifactId: null, confidence: null },
  scope: 'household',
});

const completeBody = (householdId, idMap = {}) => ({
  status: 'complete',
  rejected_reason: null,
  claim_id: '55555555-5555-4555-8555-555555555555',
  household_id: householdId,
  id_map: { 'household-1': householdId, 'user-1': '66666666-6666-4666-8666-666666666666', ...idMap },
  conflict_evidence: [],
});

/** A runtime with every dependency scripted and every effect observable. */
function runtimeFor({
  state = createEmptyState(TZ),
  identity = UNBOUND_IDENTITY,
  providerResults = [{ kind: 'success', session: sessionFor(ACCOUNT_A) }],
  cloud,
  secureInitial = {},
  secureOptions = {},
  saveFails = false,
  now = NOW,
} = {}) {
  const calls = [];
  const identified = [];
  const saves = [];
  let stored = identity;
  let staged = identity;

  const secureStorage = createMemorySecureStorage(secureInitial, secureOptions);

  const defaultCloud = {
    async bootstrapAccount(input) {
      calls.push({ fn: 'bootstrap', ...input });
      return { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
    },
    async claimLocalHousehold(input) {
      calls.push({ fn: 'claim', ...input });
      return { kind: 'ok', body: completeBody(HOUSEHOLD_A, { 'task-1': '77777777-7777-4777-8777-777777777777' }) };
    },
  };

  const runtime = createAccountRuntime({
    sessions: createSecureSessionStore(secureStorage),
    providers: createProviderRegistry([createScriptedProvider('apple', { results: providerResults })]),
    cloud: cloud ?? defaultCloud,
    identity: {
      current: () => staged,
      set: (next) => {
        staged = next;
      },
      save: async () => {
        saves.push(staged);
        if (saveFails) throw new Error('Simulated storage failure');
        stored = staged;
      },
    },
    localState: () => state,
    timezone: () => TZ,
    now: () => now,
    newClaimKey: () => '88888888-8888-4888-8888-888888888888',
    deviceId: null,
    onAccountIdentified: async (accountId) => identified.push(accountId),
  });

  return {
    runtime,
    calls,
    identified,
    saves,
    secureStorage,
    onDisk: () => stored,
    staged: () => staged,
  };
}

describe('secure session boundary', () => {
  test('1. the credential lives under its own key, never the household one', () => {
    assert.equal(SECURE_SESSION_KEY, 'herkeys.secure.session');
    assert.ok(!SECURE_SESSION_KEY.startsWith('herkeys.appState'));
  });

  test('2. a stored session round-trips, and every field is checked on the way back', () => {
    const session = sessionFor(ACCOUNT_A);
    assert.deepEqual(parseStoredSession(JSON.stringify(session)), session);
  });

  test('3. anything malformed is refused rather than half-trusted', () => {
    const base = sessionFor(ACCOUNT_A);
    assert.equal(parseStoredSession('not json'), null);
    assert.equal(parseStoredSession('[]'), null);
    assert.equal(parseStoredSession(JSON.stringify({ ...base, accountId: 'user-1' })), null, 'a local id is not an account id');
    assert.equal(parseStoredSession(JSON.stringify({ ...base, accessToken: '' })), null);
    assert.equal(parseStoredSession(JSON.stringify({ ...base, expiresAt: 'soon' })), null);
    assert.equal(parseStoredSession(JSON.stringify({ ...base, provider: { provider: 'facebook' } })), null);
  });

  test('4. an unreadable credential is discarded; a store failure discards nothing', async () => {
    const bad = createMemorySecureStorage({ [SECURE_SESSION_KEY]: 'garbage' });
    const store = createSecureSessionStore(bad);
    assert.equal((await store.read(NOW)).kind, 'unreadable');
    assert.equal(bad.contents()[SECURE_SESSION_KEY], undefined, 'a token we cannot parse is a token we cannot use');

    const broken = createMemorySecureStorage({ [SECURE_SESSION_KEY]: JSON.stringify(sessionFor(ACCOUNT_A)) }, { failReads: true });
    const failing = createSecureSessionStore(broken);
    assert.equal((await failing.read(NOW)).kind, 'unavailable');
    assert.ok(broken.contents()[SECURE_SESSION_KEY], 'a read failure is not evidence the credential is bad');
  });

  test('5. expiry is reported, not acted on, by the store', async () => {
    const storage = createMemorySecureStorage({ [SECURE_SESSION_KEY]: JSON.stringify(sessionFor(ACCOUNT_A, { expiresAt: NOW - 1 })) });
    const loaded = await createSecureSessionStore(storage).read(NOW);
    assert.equal(loaded.kind, 'session');
    assert.equal(loaded.expired, true);
  });
});

describe('sign-in', () => {
  test('6. a cancelled sign-in returns her exactly where she was', async () => {
    const h = runtimeFor({ providerResults: [{ kind: 'cancelled' }] });
    const state = await h.runtime.signIn('apple');
    assert.equal(state.kind, 'unauthenticated');
    assert.deepEqual(h.calls, [], 'nothing was sent');
    assert.deepEqual(h.onDisk(), UNBOUND_IDENTITY, 'nothing local was touched');
  });

  test('7. a misconfigured build is an unrecoverable auth error, a flaky provider a recoverable one', async () => {
    const bad = await runtimeFor({ providerResults: [{ kind: 'configurationError', detail: 'no client id' }] }).runtime.signIn('apple');
    assert.equal(bad.kind, 'authError');
    assert.equal(bad.recoverable, false);

    const flaky = await runtimeFor({ providerResults: [{ kind: 'providerError', detail: 'network' }] }).runtime.signIn('apple');
    assert.equal(flaky.kind, 'authError');
    assert.equal(flaky.recoverable, true);
  });

  test('8. a successful sign-in stores the credential and identifies the account before anything else', async () => {
    const h = runtimeFor();
    await h.runtime.signIn('apple');
    assert.ok(h.secureStorage.contents()[SECURE_SESSION_KEY], 'the credential is in secure storage');
    assert.deepEqual(h.identified, [ACCOUNT_A], 'RevenueCat learns the account uuid and nothing else');
  });

  test('9. an unknown provider is refused without reaching an adapter', async () => {
    const h = runtimeFor();
    const state = await h.runtime.signIn('google');
    assert.equal(state.kind, 'authError');
    assert.equal(state.recoverable, false);
  });
});

describe('bootstrap and claim', () => {
  test('10. an empty real household bootstraps and lands bound', async () => {
    const h = runtimeFor();
    const state = await h.runtime.signIn('apple');
    assert.equal(state.kind, 'accountBound');
    assert.equal(state.householdId, HOUSEHOLD_A);
    assert.equal(h.calls[0].fn, 'bootstrap');
    assert.equal(canWriteToCloud(state), true);
  });

  test('11. a real household with content claims, and carries its closure', async () => {
    const state = { ...createEmptyState(TZ), tasks: [task('task-1')], oneMoves: [
      { id: 'onemove-1', forDate: '2026-09-18', targetId: 'task-1', targetType: 'task', status: 'completed', decidedAt: '2026-09-18T12:00:00.000Z', completedAt: '2026-09-18T18:00:00.000Z', scope: 'personal' },
    ] };
    const h = runtimeFor({ state });
    const next = await h.runtime.signIn('apple');
    assert.equal(next.kind, 'accountBound');
    assert.equal(h.calls[0].fn, 'claim');
    assert.equal(h.calls[0].payload.claimPayloadVersion, 1);
    assert.deepEqual(h.calls[0].payload.tasks.map((t) => t.localId), ['task-1']);
  });

  test('12. a demo household is never claimed, and stays usable', async () => {
    const h = runtimeFor({ state: demoState() });
    const state = await h.runtime.signIn('apple');
    assert.equal(state.kind, 'authenticatedUnbound', 'signed in, but her demo is not an account');
    assert.deepEqual(h.calls, [], 'no demo payload ever left the device');
    assert.equal(h.onDisk().binding, null);
  });

  test('13. the claim key is recorded BEFORE the request leaves', async () => {
    const order = [];
    const h = runtimeFor({
      cloud: {
        async bootstrapAccount(input) {
          order.push(`send:${input.claimKey}`);
          return { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
        },
        async claimLocalHousehold() {
          throw new Error('not used');
        },
      },
    });
    const saveOrder = h.saves;
    await h.runtime.signIn('apple');
    assert.ok(saveOrder.length >= 2, 'the receipt is saved, then the binding');
    assert.equal(saveOrder[0].receipt.claimKey, '88888888-8888-4888-8888-888888888888');
    assert.equal(order[0], 'send:88888888-8888-4888-8888-888888888888');
  });

  test('14. the complete id map is durable before the account is called bound', async () => {
    const h = runtimeFor({
      state: { ...createEmptyState(TZ), tasks: [task('task-1')], oneMoves: [
        { id: 'onemove-1', forDate: '2026-09-18', targetId: 'task-1', targetType: 'task', status: 'completed', decidedAt: '2026-09-18T12:00:00.000Z', completedAt: '2026-09-18T18:00:00.000Z', scope: 'personal' },
      ] },
    });
    const state = await h.runtime.signIn('apple');
    assert.equal(state.kind, 'accountBound');
    const binding = h.onDisk().binding;
    assert.ok(binding, 'the binding reached disk');
    assert.equal(binding.householdId, HOUSEHOLD_A);
    assert.equal(binding.idMap['task-1'], '77777777-7777-4777-8777-777777777777');
    assert.equal(binding.idMap['household-1'], HOUSEHOLD_A);
    assert.equal(h.onDisk().receipt, null, 'a finished claim closes its receipt');
  });

  test('15. a server refusal is not retried, and is recorded as the server worded it', async () => {
    const h = runtimeFor({
      cloud: {
        async bootstrapAccount() {
          return { kind: 'ok', body: { status: 'rejected', rejected_reason: 'superseded_by_cloud', household_id: HOUSEHOLD_B, claim_id: null, id_map: {} } };
        },
        async claimLocalHousehold() {
          throw new Error('not used');
        },
      },
    });
    const state = await h.runtime.signIn('apple');
    assert.equal(state.kind, 'authenticatedUnbound');
    assert.equal(h.onDisk().receipt.rejectedReason, 'superseded_by_cloud');
    assert.equal(h.onDisk().binding, null);
  });

  test('16. an unreachable server leaves a retryable receipt and no binding', async () => {
    const h = runtimeFor({
      cloud: {
        async bootstrapAccount() {
          return { kind: 'unreachable', detail: 'offline' };
        },
        async claimLocalHousehold() {
          throw new Error('not used');
        },
      },
    });
    const state = await h.runtime.signIn('apple');
    assert.equal(state.kind, 'authenticatedUnbound');
    assert.equal(h.onDisk().receipt.rejectedReason, null, 'still retryable');
    assert.equal(h.onDisk().receipt.attempts, 1);
  });

  test('17. a retry reuses the SAME claim key rather than starting a second household', async () => {
    let attempt = 0;
    const seen = [];
    const h = runtimeFor({
      cloud: {
        async bootstrapAccount(input) {
          seen.push(input.claimKey);
          attempt += 1;
          return attempt === 1 ? { kind: 'unreachable', detail: 'offline' } : { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
        },
        async claimLocalHousehold() {
          throw new Error('not used');
        },
      },
    });
    await h.runtime.signIn('apple');
    const state = await h.runtime.resolveBinding();
    assert.equal(state.kind, 'accountBound');
    assert.equal(seen.length, 2);
    assert.equal(seen[0], seen[1], 'the same claim key replays, so the server resumes instead of creating another household');
    assert.equal(h.onDisk().receipt, null);
  });

  test('18. a claim that succeeds but cannot be recorded stays retryable and does not claim to be bound', async () => {
    const h = runtimeFor({ saveFails: true });
    const state = await h.runtime.signIn('apple');
    assert.notEqual(state.kind, 'accountBound', 'bound means written down');
    assert.equal(state.kind, 'authenticatedUnbound');
  });

  test('19. an unreadable server answer is a failure, not an optimistic success', async () => {
    const h = runtimeFor({
      cloud: {
        async bootstrapAccount() {
          return { kind: 'ok', body: { status: 'maybe' } };
        },
        async claimLocalHousehold() {
          throw new Error('not used');
        },
      },
    });
    const state = await h.runtime.signIn('apple');
    assert.equal(state.kind, 'authenticatedUnbound');
    assert.equal(h.onDisk().binding, null);
  });
});

describe('restore, degrade, quarantine and switching', () => {
  test('20. a stored session restores and re-identifies the account', async () => {
    const h = runtimeFor({ secureInitial: { [SECURE_SESSION_KEY]: JSON.stringify(sessionFor(ACCOUNT_A)) } });
    const state = await h.runtime.restore();
    assert.equal(state.kind, 'accountBound');
    assert.deepEqual(h.identified, [ACCOUNT_A]);
  });

  test('21. an expired session degrades instead of signing her out, and local work continues', async () => {
    const identity = {
      binding: { accountId: ACCOUNT_A, householdId: HOUSEHOLD_A, boundAt: '2026-09-18T12:00:00.000Z', kind: 'bootstrap', idMap: {} },
      receipt: null,
      quarantine: null,
    };
    const h = runtimeFor({ identity, secureInitial: { [SECURE_SESSION_KEY]: JSON.stringify(sessionFor(ACCOUNT_A, { expiresAt: NOW - 1 })) } });
    const state = await h.runtime.restore();
    assert.equal(state.kind, 'authDegraded');
    assert.equal(state.reason, 'expired');
    assert.equal(state.householdId, HOUSEHOLD_A);
    assert.equal(canRenderAccountData(state), true, 'her household still opens');
    assert.equal(canWriteToCloud(state), false, 'but nothing is sent');
    assert.deepEqual(h.calls, []);
  });

  test('22. a keychain that will not answer degrades a bound device rather than offering a fresh start', async () => {
    const identity = {
      binding: { accountId: ACCOUNT_A, householdId: HOUSEHOLD_A, boundAt: '2026-09-18T12:00:00.000Z', kind: 'claim', idMap: {} },
      receipt: null,
      quarantine: null,
    };
    const h = runtimeFor({ identity, secureOptions: { failReads: true } });
    const state = await h.runtime.restore();
    assert.equal(state.kind, 'authDegraded');
    assert.equal(state.reason, 'refreshFailed');
    assert.equal(h.onDisk().binding.householdId, HOUSEHOLD_A, 'the binding is untouched');
  });

  test('23. a second account is quarantined: nothing renders, nothing uploads, nothing is deleted', async () => {
    const identity = {
      binding: { accountId: ACCOUNT_A, householdId: HOUSEHOLD_A, boundAt: '2026-09-18T12:00:00.000Z', kind: 'claim', idMap: { 'task-1': '77777777-7777-4777-8777-777777777777' } },
      receipt: null,
      quarantine: null,
    };
    const h = runtimeFor({
      identity,
      state: { ...createEmptyState(TZ), tasks: [task('task-1')] },
      providerResults: [{ kind: 'success', session: sessionFor(ACCOUNT_B) }],
    });
    const state = await h.runtime.signIn('apple');

    assert.equal(state.kind, 'boundOther');
    assert.equal(state.quarantinedAccountId, ACCOUNT_A);
    assert.equal(canRenderAccountData(state), false, "the other account's household must not reach the screen");
    assert.equal(canWriteToCloud(state), false);
    assert.deepEqual(h.calls, [], 'a quarantined household is never uploaded');

    const onDisk = h.onDisk();
    assert.equal(onDisk.binding.accountId, ACCOUNT_A, 'the original binding is preserved exactly');
    assert.deepEqual(onDisk.binding.idMap, identity.binding.idMap);
    assert.equal(onDisk.quarantine.accountId, ACCOUNT_A);
  });

  test('24. signing out clears the credential but keeps the binding, so the same account resumes', async () => {
    const h = runtimeFor();
    await h.runtime.signIn('apple');
    const out = await h.runtime.signOut();

    assert.equal(out.kind, 'unauthenticated');
    assert.equal(h.secureStorage.contents()[SECURE_SESSION_KEY], undefined, 'the credential is gone');
    assert.equal(h.onDisk().binding.accountId, ACCOUNT_A, 'the binding is not');
    assert.deepEqual(h.identified, [ACCOUNT_A, null], 'RevenueCat is returned to an anonymous id');

    // Signing back in resumes rather than claiming a second time.
    const back = await h.runtime.signIn('apple');
    assert.equal(back.kind, 'accountBound');
    assert.equal(h.calls.length, 1, 'no second bootstrap was sent');
  });

  test('25. a RevenueCat failure never undoes a claim the server already committed', async () => {
    const state = createEmptyState(TZ);
    let stored = UNBOUND_IDENTITY;
    let staged = UNBOUND_IDENTITY;
    const runtime = createAccountRuntime({
      sessions: createSecureSessionStore(createMemorySecureStorage()),
      providers: createProviderRegistry([createScriptedProvider('apple', { results: [{ kind: 'success', session: sessionFor(ACCOUNT_A) }] })]),
      cloud: {
        async bootstrapAccount() {
          return { kind: 'ok', body: completeBody(HOUSEHOLD_A) };
        },
        async claimLocalHousehold() {
          throw new Error('not used');
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
      onAccountIdentified: async () => {
        throw new Error('RevenueCat is down');
      },
    });

    const next = await runtime.signIn('apple');
    assert.equal(next.kind, 'accountBound', 'entitlement is not identity');
    assert.equal(stored.binding.householdId, HOUSEHOLD_A);
  });
});
