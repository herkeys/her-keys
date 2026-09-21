/**
 * HK-INTEGRATION-READINESS-01 / HA-001 — ACCOUNT BINDING MUST LEAD TO OPERATING DURABLE SYNC.
 *
 * Every test here begins at `composeAccountApp`: the function the production root calls, with the real household store, the real
 * account runtime, the real sync runtime and the real coordinator. Only the platform leaves (storage, keychain, providers, the
 * network) are stand-ins. The cloud is an in-memory model of the real server's relevant behaviour; the REAL PostgreSQL / PostgREST
 * proof of the same journeys is supabase/tests/sync-integration.mjs.
 *
 * A test that hand-builds a coordinator cannot fail when production forgets to build one. These can.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { createProviderRegistry, createScriptedProvider } from '../../src/domain/account/provider.ts';
import { createMemorySecureStorage, createSecureSessionStore } from '../../src/domain/account/secureSession.ts';
import { addEvent } from '../../src/domain/events.ts';
import { starterCategories } from '../../src/domain/categories.ts';
import { addTask, updateTask } from '../../src/domain/tasks.ts';
import { createChangeObserver } from '../../src/domain/sync/changeObserver.ts';
import { namespaceForNewDevice } from '../../src/domain/sync/claimSeam.ts';
import { SourceArtifactSchema } from '../../src/domain/foundation/sourceArtifact.ts';
import { FOUNDATION_SPECS } from '../../src/domain/sync/foundationSpecs.ts';
import { PULL_FETCH_CHUNK } from '../../src/domain/sync/syncTypes.ts';
import { decodeStoredState } from '../../src/persistence/envelope.ts';
import { STORAGE_KEYS, createAppStateRepository } from '../../src/persistence/appStateRepository.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { composeAccountApp } from '../../src/store/composeAccountApp.ts';
import { createFakeCloud } from '../support/fakeCloud.mjs';

const TZ = 'America/Chicago';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const TODAY = '2026-09-21';
const USER = { producer: 'user-action', artifactId: null, confidence: null };
const uuid = () => randomUUID();

const sessionFor = (accountId) => ({
  accountId,
  accessToken: `access-${accountId}`,
  refreshToken: `refresh-${accountId}`,
  expiresAt: NOW + 3_600_000,
  provider: { provider: 'apple', subject: `apple-${accountId}`, suggestedDisplayName: null },
});

/** A withheld One Move for today, so the household does not decide one from its tasks and the claim closure stays trivial. */
const withheldMove = { id: `onemove-${TODAY}`, forDate: TODAY, targetId: null, targetType: 'task', status: 'withheld', decidedAt: '2026-09-21T14:00:00.000Z', completedAt: null, provenance: USER, scope: 'personal' };
const child = { id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' };

/** An in-memory account cloud: what bootstrap_account and claim_local_household answer, and the rows they leave in the cloud. */
function accountCloudFor(cloud, accountId, { householdId = uuid() } = {}) {
  const ids = { householdId, memberId: uuid(), categories: null, claims: 0, failNext: 0, rejectNext: null };
  const ensureBootstrapped = (state) => {
    if (ids.categories !== null) return;
    const starters = state.categories.map((c) => ({ localId: c.id, cloudId: uuid(), name: c.name, sortOrder: c.sortOrder, systemRole: c.systemRole, scope: c.scope }));
    ids.categories = Object.fromEntries(starters.map((c) => [c.localId, c.cloudId]));
    cloud.bootstrap({ householdId, accountId, memberId: ids.memberId, categories: starters });
  };
  const answer = (state, payload) => {
    ensureBootstrapped(state);
    const idMap = { 'household-1': householdId, [state.user.id]: ids.memberId, ...ids.categories };
    for (const c of payload?.childMembers ?? []) {
      const id = uuid();
      idMap[c.localId] = id;
      cloud.seedRow('household_members', { id, household_id: householdId, local_id: c.localId, member_type: 'child', display_name: c.displayName, birth_date: c.birthDate, scope: 'child' });
    }
    for (const row of [...(payload?.tasks ?? []), ...(payload?.needsMeItems ?? []), ...(payload?.oneMoves ?? []), ...(payload?.sourceArtifacts ?? [])]) idMap[row.localId] = uuid();
    return { kind: 'ok', body: { status: 'complete', rejected_reason: null, claim_id: uuid(), household_id: householdId, id_map: idMap, conflict_evidence: [] } };
  };
  return {
    ids,
    _state: null,
    bind(getState) {
      return {
        async bootstrapAccount() {
          if (ids.failNext > 0) { ids.failNext -= 1; return { kind: 'unreachable', detail: 'offline' }; }
          if (ids.rejectNext) return { kind: 'ok', body: { status: 'rejected', rejected_reason: ids.rejectNext, household_id: householdId, claim_id: null, id_map: {} } };
          return answer(getState(), null);
        },
        async claimLocalHousehold({ payload }) {
          ids.claims += 1;
          if (ids.failNext > 0) { ids.failNext -= 1; return { kind: 'unreachable', detail: 'offline' }; }
          if (ids.rejectNext) return { kind: 'ok', body: { status: 'rejected', rejected_reason: ids.rejectNext, household_id: householdId, claim_id: null, id_map: {} } };
          return answer(getState(), payload);
        },
      };
    },
  };
}

function makeClock() {
  const timers = [];
  return {
    schedule: (work) => {
      const timer = { work, live: true };
      timers.push(timer);
      return () => { timer.live = false; };
    },
    pending: () => timers.filter((t) => t.live).length,
    flush() {
      const due = timers.splice(0).filter((t) => t.live);
      for (const t of due) t.work();
    },
  };
}

/** One installation: its own storage, store, observer, account runtime, sync runtime. Shares only the cloud. */
async function makeDevice({ cloud, accountId, accountCloud, storage = createMemoryStorage({}), secure = createMemorySecureStorage({}), mode = 'empty', results, hydrateState = null }) {
  const clock = makeClock();
  const observer = createChangeObserver({ now: () => NOW });
  const repository = createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: false });
  const store = createAppStore({ repository, mode, now: () => NOW, timeZone: () => TZ, observe: observer.observe });
  await store.hydrate();
  if (hydrateState) await store.commit(() => hydrateState);
  await store.flush();

  const events = [];
  const app = composeAccountApp({
    store,
    observer,
    account: {
      sessions: createSecureSessionStore(secure),
      providers: createProviderRegistry([createScriptedProvider('apple', { results: results ?? Array.from({ length: 12 }, () => ({ kind: 'success', session: sessionFor(accountId) })) })]),
      cloud: accountCloud.bind(() => store.getSnapshot().state),
      timezone: () => TZ,
      now: () => NOW,
      newClaimKey: () => uuid(),
      deviceId: uuid(),
    },
    sync: { transport: cloud.transport, newDeviceId: uuid, schedule: clock.schedule, debounceMs: 0, report: (e) => events.push(e) },
  });
  const device = { storage, store, clock, events, secure, ...app, accountId };
  device.persisted = () => {
    const raw = storage.contents()[STORAGE_KEYS.primary];
    return raw === undefined ? null : decodeStoredState(raw);
  };
  device.signIn = async () => {
    const state = await app.accountRuntime.signIn('apple');
    await app.syncRuntime.idle();
    return state;
  };
  device.settle = async () => {
    clock.flush();
    await app.syncRuntime.idle();
  };
  return device;
}

const mutate = (device, fn) => device.store.commit((state, ctx) => fn(state, ctx));
const task = (title, extra = {}) => (state, ctx) => addTask(state, ctx, { title, categoryId: state.categories[0].id, scope: 'household', durationMinutes: 20, durationSource: 'user', ...extra });

/** A real household with content the claim closure does NOT carry. */
async function householdWithContent(device) {
  await mutate(device, (s) => ({ ...s, oneMoves: [withheldMove], children: [child], onboarding: { ...s.onboarding, goalIds: ['calmer-household'], strengthIds: ['cooking'], lastStep: 'struggles' } }));
  await mutate(device, task('Order the permission slip'));
  await mutate(device, task('Book the dentist', { subjectMemberId: 'child-1', scope: 'child' }));
  await mutate(device, (s, ctx) => addEvent(s, ctx, { title: 'Recital', categoryId: s.categories[0].id, startsAt: '2026-09-25T23:00:00.000Z', endsAt: '2026-09-26T00:00:00.000Z', commitment: 'fixed', scope: 'household' }));
  await mutate(device, (s) => ({ ...s, systems: [{ id: 'sys-1', name: 'Homework wind-down', description: '', categoryId: s.categories[0].id, subjectMemberId: 'child-1', automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: USER, scope: 'child' }] }));
  await device.store.flush();
}

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';

/**
 * A fresh install of an account that already has a household in the cloud, bound exactly as adoption of an existing household will
 * leave it. That adoption step is a recorded contract that is not implemented in this build (see the BACKEND doc); this is its
 * stand-in, so the pull path it will feed can be attacked now.
 */
async function bindAsNewDevice(device, accountCloud) {
  device.store.setIdentity({
    binding: { accountId: device.accountId, householdId: accountCloud.ids.householdId, boundAt: '2026-09-21T15:00:00.000Z', kind: 'claim', idMap: {} },
    receipt: null,
    quarantine: null,
    sync: namespaceForNewDevice({ accountId: device.accountId, householdId: accountCloud.ids.householdId, deviceId: uuid() }),
  });
  await device.store.saveIdentity();
}

describe('HA-001 — the production composition operates sync after binding', () => {
  test('binding an account makes the sync runtime OPERATIONAL, and the content the claim did not carry reaches the cloud', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    assert.equal(a.syncRuntime.running(), null, 'nothing runs before an account is bound');

    const state = await a.signIn();
    assert.equal(state.kind, 'accountBound');
    assert.deepEqual(a.syncRuntime.running(), { accountId: ACCOUNT_A, householdId: accountCloud.ids.householdId }, 'bound means operating');
    assert.equal(a.syncRuntime.constructed(), 1);

    assert.equal(cloud.table('tasks').length, 2, 'both tasks reached the cloud, including the one no claim carried');
    assert.equal(cloud.table('events').length, 1);
    assert.equal(cloud.table('household_systems').length, 1);
    const sys = cloud.table('household_systems')[0];
    assert.ok(sys.subject_member_id, 'the System kept its child across the boundary (HA-011)');
    assert.equal(sys.scope, 'child');
    assert.equal(a.persisted().identity.sync.queue.length, 0, 'and the queue drained');
    assert.equal(a.syncRuntime.snapshot().phase, 'idle');
  });

  test('her local onboarding is NOT overwritten by the server default on the first pull, and reaches the cloud (found by reproduction)', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();
    const local = a.store.getSnapshot().state.onboarding;
    assert.deepEqual(local.goalIds, ['calmer-household'], 'the pull did not wipe her choices');
    const row = cloud.table('onboarding_state')[0];
    assert.deepEqual([row.goal_ids, row.strength_ids, row.last_step], [['calmer-household'], ['cooking'], 'struggles']);
    assert.equal(row.revision, 2, 'an UPDATE of the server-created row, never a refused create');
  });

  test('the seed is durable in the SAME write as the binding: offline at bind, nothing is lost and nothing is stranded', async () => {
    const cloud = createFakeCloud();
    cloud.state.offline = true;
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    const bound = await a.signIn();
    assert.equal(bound.kind, 'accountBound', 'binding does not depend on the sync network');

    const durable = a.persisted();
    assert.ok(durable.identity.binding, 'the binding is on disk');
    assert.ok(durable.identity.sync.queue.length >= 3, `the outbound work is on disk too (${durable.identity.sync.queue.length})`);
    assert.equal(cloud.table('tasks').length, 0);

    // The claim itself is the atomic unit. The FIRST envelope that ever names the binding must already carry the seeded queue, so
    // there is no instant at which the account is bound and her content is owed to nobody. (The runtime also reconciles when it
    // starts; that is a safety net, and must not be what makes this true.)
    const firstBound = a.storage.writeLog
      .filter((w) => w.key === STORAGE_KEYS.primary && w.ok)
      .map((w) => decodeStoredState(w.value))
      .find((decoded) => decoded.kind === 'valid' && decoded.identity.binding !== null);
    assert.ok(firstBound, 'a bound envelope was written');
    assert.ok(firstBound.identity.sync.queue.length >= 3, `the first bound envelope already owes ${firstBound.identity.sync.queue.length} rows`);
    assert.ok(firstBound.identity.sync.mappings[`onboarding:${firstBound.state.user.id}`], 'and already adopts the onboarding row');

    cloud.state.offline = false;
    await a.syncRuntime.request('networkRestored');
    assert.equal(cloud.table('tasks').length, 2);
    assert.equal(a.persisted().identity.sync.queue.length, 0);
  });

  test('a mutation AFTER binding is transported with no feature involved: a new row, then an edit of it', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();

    await mutate(a, task('Renew the passport'));
    assert.ok(a.persisted().identity.sync.queue.length >= 1, 'the intent is durable with the change itself');
    await a.settle();
    assert.equal(cloud.table('tasks').length, 3);

    const id = a.store.getSnapshot().state.tasks.find((t) => t.title === 'Renew the passport').id;
    await mutate(a, (s, ctx) => updateTask(s, ctx, id, { title: 'Renew the passport online' }));
    await a.settle();
    const row = cloud.table('tasks').find((t) => t.local_id === id);
    assert.deepEqual([row.title, row.revision], ['Renew the passport online', 2]);
    assert.equal(a.persisted().identity.sync.evidence.length, 0, 'no false conflict against herself');
  });

  test('restart: the queue and mappings survive process death, and a fresh runtime resumes and converges with no duplicate rows', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const storage = createMemoryStorage({});
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage });
    await householdWithContent(a);
    // die part-way through the initial seed: the third create is the last one the server hears
    let creates = 0;
    cloud.hooks.duringCreate = async () => { creates += 1; if (creates === 3) cloud.state.offline = true; };
    await a.signIn();
    const after = cloud.table('tasks').length + cloud.table('events').length + cloud.table('household_systems').length;
    assert.ok(after < 4, 'the seed was interrupted');
    assert.ok(a.persisted().identity.sync.queue.length > 0, 'the rest is still owed, durably');

    // process death: nothing survives but the storage blob
    cloud.hooks.duringCreate = undefined;
    cloud.state.offline = false;
    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage, secure: a.secure });
    assert.equal(b.syncRuntime.running(), null, 'a relaunch does not start syncing before the session is restored');
    const restored = await b.accountRuntime.restore();
    await b.syncRuntime.idle();
    assert.equal(restored.kind, 'accountBound', 'same account resumes; it does not claim again');
    assert.equal(accountCloud.ids.claims, 1, 'the claim was not repeated');
    assert.equal(cloud.table('tasks').length, 2, 'no duplicate task after the interrupted seed');
    assert.equal(cloud.table('events').length, 1);
    assert.equal(cloud.table('household_systems').length, 1);
    assert.equal(b.persisted().identity.sync.queue.length, 0);
  });
});

describe('HA-001 — lifecycle: exactly once, and never for the wrong account', () => {
  test('the same session applied twice, and the binding resolved again, still runs ONE coordinator', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    const state = await a.signIn();
    assert.equal(a.syncRuntime.constructed(), 1);

    a.syncRuntime.onAccountState(state);
    a.syncRuntime.onAccountState(state);
    await a.accountRuntime.resolveBinding();
    await a.accountRuntime.resolveBinding();
    await a.syncRuntime.idle();
    assert.equal(a.syncRuntime.constructed(), 1, 'a repeated callback did not build another coordinator');
    assert.deepEqual(a.syncRuntime.running().accountId, ACCOUNT_A);
  });

  test('two concurrent requests join one cycle; they never run two', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();
    let inFlight = 0;
    let peak = 0;
    cloud.hooks.duringPull = async () => { inFlight += 1; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight -= 1; };
    await Promise.all([a.syncRuntime.request('foreground'), a.syncRuntime.request('foreground'), a.syncRuntime.request('manual')]);
    assert.equal(peak, 1, 'one cycle at a time');
  });

  test('sign-out STOPS sync: her changes keep queueing durably, nothing is sent, and the same account resumes them', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();

    await a.accountRuntime.signOut();
    assert.equal(a.syncRuntime.running(), null, 'the coordinator did not survive sign-out');
    const callsBefore = cloud.calls.length;
    await mutate(a, task('Written while signed out'));
    await a.settle();
    assert.equal(cloud.calls.length, callsBefore, 'nothing was transported while signed out');
    assert.ok(a.persisted().identity.sync.queue.length >= 1, 'but the intent is durable');

    await a.signIn();
    assert.equal(cloud.table('tasks').length, 3, 'the same account resumed and sent it');
    assert.equal(a.persisted().identity.binding.accountId, ACCOUNT_A);
  });

  test('account A -> account B on one device: A\'s sync stops, nothing of A is uploaded under B, B gets no coordinator', async () => {
    const cloud = createFakeCloud();
    const cloudA = accountCloudFor(cloud, ACCOUNT_A);
    const storage = createMemoryStorage({});
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud: cloudA, storage });
    await householdWithContent(a);
    await a.signIn();
    await mutate(a, task('A private task'));
    cloud.state.offline = true;
    await a.settle();
    cloud.state.offline = false;
    await a.accountRuntime.signOut();
    const callsBefore = cloud.calls.length;

    const cloudB = accountCloudFor(cloud, ACCOUNT_B);
    const b = await makeDevice({ cloud, accountId: ACCOUNT_B, accountCloud: cloudB, storage });
    const state = await b.signIn();
    assert.equal(state.kind, 'boundOther', 'the household belongs to another account: quarantined, not merged');
    assert.equal(b.syncRuntime.running(), null);
    await b.settle();
    assert.equal(cloud.calls.length, callsBefore, 'not one request was made on account B\'s behalf, and none carried A\'s rows');
    assert.equal(cloud.table('tasks').filter((t) => t.title === 'A private task').length, 0, 'A\'s pending row was never uploaded under B');
    assert.ok(b.persisted().identity.quarantine);
  });

  test('malformed local storage after binding: nothing crashes, nothing is uploaded, nothing starts (matrix T)', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const storage = createMemoryStorage({});
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage });
    await householdWithContent(a);
    await a.signIn();
    a.syncRuntime.stop();
    const callsBefore = cloud.calls.length;

    // the household's bytes are damaged; the keychain still holds the session
    await storage.write(STORAGE_KEYS.primary, '{ this is not a household');
    accountCloud.ids.rejectNext = 'superseded_by_cloud';
    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage, secure: a.secure });
    const state = await b.accountRuntime.restore();
    await b.syncRuntime.idle();
    assert.notEqual(state.kind, 'accountBound', 'a damaged local household is not silently re-bound as if it were hers');
    assert.equal(b.syncRuntime.running(), null);
    assert.equal(cloud.calls.length, callsBefore, 'and not one request was made');
    assert.equal(b.store.getSnapshot().state.tasks.length, 0, 'the app opens on a fresh household rather than a crash');
  });

  test('a real household that meets a DEMO build is never adopted by it and never uploaded (matrix R)', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const storage = createMemoryStorage({});
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage });
    await householdWithContent(a);
    await a.signIn();
    a.syncRuntime.stop();
    const before = storage.contents()[STORAGE_KEYS.primary];
    const callsBefore = cloud.calls.length;

    const demo = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage, secure: a.secure, mode: 'demo' });
    assert.equal(demo.store.getSnapshot().status, 'recovery', 'the demo build shows a fresh demo, it does not adopt the real household');
    assert.equal(demo.store.getSnapshot().persistence, 'disabled', 'and it must not write over the real household');
    await demo.accountRuntime.restore();
    await demo.syncRuntime.idle();
    assert.equal(demo.syncRuntime.running(), null);
    assert.equal(cloud.calls.length, callsBefore);
    assert.equal(storage.contents()[STORAGE_KEYS.primary], before, 'the real household\'s bytes are untouched');
  });

  test('a session that degrades stops the coordinator; recovery of the SAME account starts exactly one', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    const state = await a.signIn();
    a.syncRuntime.onAccountState({ kind: 'authDegraded', accountId: ACCOUNT_A, householdId: accountCloud.ids.householdId, reason: 'expired' });
    assert.equal(a.syncRuntime.running(), null);
    a.syncRuntime.onAccountState(state);
    await a.syncRuntime.idle();
    assert.equal(a.syncRuntime.constructed(), 2, 'a new coordinator, and only one of them alive');
    assert.equal(a.syncRuntime.running().accountId, ACCOUNT_A);
  });

  test('a cycle still in flight when she signs out can neither commit nor keep uploading (stale coordinator)', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();
    await mutate(a, task('Queued before sign-out'));

    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    cloud.hooks.duringPull = async () => { await gate; };
    const cycle = a.syncRuntime.request('manual');
    await new Promise((r) => setTimeout(r, 5));
    const before = JSON.stringify(a.store.getSnapshot().identity.sync.mappings);
    await a.accountRuntime.signOut();
    const callsAtSignOut = cloud.calls.length;
    release();
    await cycle;
    await a.syncRuntime.idle();
    assert.equal(cloud.calls.filter((c, i) => i >= callsAtSignOut && c.op === 'create').length, 0, 'no create after sign-out');
    assert.equal(JSON.stringify(a.store.getSnapshot().identity.sync.mappings), before, 'and it committed nothing');
  });
});

describe('HA-001 — false success is impossible', () => {
  test('a failed claim leaves nothing running and the household untouched; the retry seeds', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    accountCloud.ids.failNext = 1;
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    const before = JSON.stringify(a.store.getSnapshot().state);
    const failed = await a.signIn();
    assert.equal(failed.kind, 'authenticatedUnbound');
    assert.equal(a.syncRuntime.running(), null, 'not bound, so not syncing');
    assert.equal(JSON.stringify(a.store.getSnapshot().state), before, 'auth never destroys household data');
    assert.equal(a.persisted().identity.sync, null);

    const retried = await a.accountRuntime.resolveBinding();
    await a.syncRuntime.idle();
    assert.equal(retried.kind, 'accountBound');
    assert.equal(cloud.table('tasks').length, 2);
    assert.equal(accountCloud.ids.claims, 2, 'the same claim, retried');
  });

  test('a server refusal (superseded_by_cloud) is recorded, nothing starts, nothing is uploaded', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    accountCloud.ids.rejectNext = 'superseded_by_cloud';
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    const state = await a.signIn();
    assert.equal(state.kind, 'authenticatedUnbound');
    assert.equal(a.syncRuntime.running(), null);
    assert.equal(cloud.table('tasks').length, 0);
  });

  test('a DEMO household never starts sync, never queues, never reaches the cloud', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, mode: 'demo' });
    const state = await a.signIn();
    assert.equal(state.kind, 'authenticatedUnbound', 'refused as a whole');
    assert.equal(a.syncRuntime.running(), null);
    await mutate(a, task('Demo edit'));
    await a.settle();
    assert.equal(cloud.calls.length, 0);
    assert.equal(a.persisted().identity.sync, null);
  });

  test('a memory-only session (unreadable storage) does not pretend to sync', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    a.store.suspendPersistence();
    const state = await a.signIn();
    assert.notEqual(state.kind, 'accountBound', 'a binding cannot be made durable, so it is not made');
    assert.equal(a.syncRuntime.running(), null);
  });

  test('a row the server refuses for its CONTENT is recorded once and asked about once: the top-up never re-queues it into a retry loop', async () => {
    const cloud = createFakeCloud();
    cloud.hooks.refuse = (_table, row) => (row.title === 'Poison' ? { kind: 'failure', failure: 'validation', detail: 'title refused', code: '23514' } : null);
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await mutate(a, task('Poison'));
    await a.signIn();
    const poisonId = a.store.getSnapshot().state.tasks.find((t) => t.title === 'Poison').id;
    const attempts = () => cloud.calls.filter((c) => c.op === 'create' && c.localId === poisonId).length;

    assert.equal(attempts(), 1, 'the server was asked once');
    assert.equal(cloud.table('tasks').length, 2, 'the rest of her household still arrived');
    const [evidence, ...others] = a.persisted().identity.sync.evidence.filter((e) => !e.resolved);
    assert.deepEqual([evidence.evidence, evidence.localId, others.length], ['validation-failure', poisonId, 0], 'and it is recorded, once, for her to see');

    // Every later trigger leaves it alone: a refused row is waiting for HER, not for another attempt.
    await a.syncRuntime.request('foreground');
    await a.syncRuntime.request('networkRestored');
    await mutate(a, task('Another'));
    await a.settle();
    assert.equal(attempts(), 1, 'still asked once after later triggers and another edit');
    assert.equal(a.persisted().identity.sync.evidence.filter((e) => !e.resolved).length, 1, 'still one piece of evidence, not one per trigger');
    assert.equal(cloud.table('tasks').length, 3, 'and new work still flows past it');
  });
});

describe('HA-001 — she keeps using the app while the network is busy (no silent loss)', () => {
  test('an edit made DURING a pull survives it, and is transported afterwards', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();
    // another device wrote a category row; while THIS device is waiting for that pull, she adds a task
    let added = false;
    cloud.hooks.duringPull = async () => {
      if (added) return;
      added = true;
      cloud.seedRow('household_categories', { household_id: accountCloud.ids.householdId, local_id: 'cat-from-elsewhere', name: 'From another device', system_role: null, status: 'active', sort_order: 99, scope: 'household', producer: 'user-action' });
      await mutate(a, task('Typed while the pull was in flight'));
    };
    await a.syncRuntime.request('foreground');
    await a.settle();
    const local = a.store.getSnapshot().state;
    assert.ok(local.tasks.some((t) => t.title === 'Typed while the pull was in flight'), 'her edit was not replaced by the state the cycle started from');
    assert.ok(local.categories.some((c) => c.id === 'cat-from-elsewhere'), 'and the pulled row arrived');
    assert.ok(cloud.table('tasks').some((t) => t.title === 'Typed while the pull was in flight'), 'and her edit reached the cloud');
  });

  test('an edit made DURING a push is neither lost nor turned into a conflict with herself', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();
    await mutate(a, task('Version one'));
    const id = a.store.getSnapshot().state.tasks.find((t) => t.title === 'Version one').id;
    a.clock.flush();

    let edited = false;
    cloud.hooks.duringCreate = async (table, row) => {
      if (table !== 'tasks' || row.local_id !== id || edited) return;
      edited = true;
      await mutate(a, (s, ctx) => updateTask(s, ctx, id, { title: 'Version two, typed while version one was on the wire' }));
    };
    await a.syncRuntime.request('manual');
    cloud.hooks.duringCreate = undefined;
    await a.settle();
    await a.syncRuntime.request('manual');

    const row = cloud.table('tasks').find((t) => t.local_id === id);
    assert.equal(row.title, 'Version two, typed while version one was on the wire', 'the newer content reached the cloud');
    assert.equal(a.persisted().identity.sync.evidence.length, 0, 'and it did not conflict with her own first edit');
    assert.equal(a.persisted().identity.sync.queue.length, 0);
  });

  test('another device edited the same row she has pending: the disagreement is RECORDED, never silently resolved', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();
    const id = a.store.getSnapshot().state.tasks[0].id;
    const cloudId = a.persisted().identity.sync.mappings[`task:${id}`].cloudId;

    cloud.state.offline = true;
    await mutate(a, (s, ctx) => updateTask(s, ctx, id, { title: 'My offline edit' }));
    await a.settle();
    cloud.state.offline = false;
    cloud.editRow('tasks', cloudId, { title: 'Their edit, from another device' });
    await a.syncRuntime.request('manual');

    const sync = a.persisted().identity.sync;
    assert.ok(sync.evidence.some((e) => e.evidence === 'cas-conflict' && e.localId === id), 'a conflict was recorded');
    assert.equal(a.syncRuntime.snapshot().needsAttention, true, 'and it is surfaced');
  });

  test('a lost acknowledgement settles on the SAME cloud row: no duplicate', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();
    cloud.state.loseNextAck = 1;
    await mutate(a, task('Ack will be lost'));
    await a.settle();
    cloud.state.loseNextAck = 0;
    await a.syncRuntime.request('manual');
    assert.equal(cloud.table('tasks').filter((t) => t.title === 'Ack will be lost').length, 1);
    assert.equal(a.persisted().identity.sync.queue.length, 0);
  });
});

describe('HA-001 — a second device hydrates the household, children included (HA-011 across devices)', () => {
  test('device B pulls A\'s rows, and a child-scoped System arrives with its child', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();

    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await bindAsNewDevice(b, accountCloud);
    // the real path: same account, already bound on this device -> resume -> the sync runtime starts and hydrates
    const resumed = await b.signIn();
    assert.equal(resumed.kind, 'accountBound');

    const stateA = a.store.getSnapshot().state;
    const stateB = b.store.getSnapshot().state;
    assert.deepEqual(stateB.tasks.map((t) => t.title).sort(), stateA.tasks.map((t) => t.title).sort());
    assert.equal(stateB.events.length, 1);
    assert.equal(stateB.children.length, 1, 'the child exists on the second device');
    assert.equal(stateB.children[0].displayName, 'Mia');
    const system = stateB.systems[0];
    assert.deepEqual([system.scope, system.subjectMemberId], ['child', stateB.children[0].id], 'the child-scoped System kept its child');
    const dentist = stateB.tasks.find((t) => t.title === 'Book the dentist');
    assert.equal(dentist.subjectMemberId, stateB.children[0].id);
    assert.equal(dentist.durationSource, 'user', 'and duration knowledge survived the trip');
    assert.equal(b.persisted().identity.sync.queue.length, 0, 'pulled state produced no outbound work');
  });

  // Found while writing the initial-sync matrix (row K). The server's sync_pull has no limit and a claim is ONE transaction, so a
  // change cannot be paged by count: the engine used to keep the cursor where it was whenever a response held more than one batch,
  // and so re-read the same first batch forever.
  test('a household bigger than one fetch batch hydrates COMPLETELY on a second device, and the cursor moves past it', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await mutate(a, (s) => ({ ...s, oneMoves: [withheldMove] }));
    await mutate(a, (state, ctx) => {
      let next = state;
      for (let i = 0; i < 450; i += 1) next = addTask(next, ctx, { title: `Task ${i}`, categoryId: state.categories[0].id, scope: 'household', durationMinutes: 20, durationSource: 'user' });
      return next;
    });
    await a.store.flush();
    await a.signIn();
    // A household bigger than the queue ceiling is sent in full by ONE sign-in, not left half-sent until some later trigger.
    assert.equal(cloud.table('tasks').length, 450, 'device A delivered its whole household');
    assert.equal(a.persisted().identity.sync.queue.length, 0);

    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await bindAsNewDevice(b, accountCloud);
    const callsBeforeB = cloud.calls.length;
    await b.signIn();

    const stored = b.persisted();
    assert.equal(b.store.getSnapshot().state.tasks.length, 450, 'every task arrived, not just the first batch');
    assert.equal(stored.identity.sync.hydration, 'ready', 'hydration completed');
    assert.notEqual(stored.identity.sync.cursor, '0', 'and the cursor moved past what it read');
    assert.equal(stored.identity.sync.queue.length, 0, 'pulled state produced no outbound work');
    const fetched = cloud.calls.slice(callsBeforeB).filter((c) => c.op === 'fetchRows' && c.table === 'tasks').map((c) => c.count);
    assert.ok(fetched.every((count) => count <= PULL_FETCH_CHUNK), `each row request stays bounded (largest ${Math.max(...fetched)})`);
    assert.equal(fetched.reduce((sum, count) => sum + count, 0), 450, 'and every task was requested exactly once');
  });
});

describe('HA-001 — initial sync attack matrix (the rows the journeys above do not already name)', () => {
  test('A. a brand-new user with no content: bound, ONE pull, nothing uploaded, no starter duplicated', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    const starters = a.store.getSnapshot().state.categories.length;

    const bound = await a.signIn();
    assert.equal(bound.kind, 'accountBound');
    assert.equal(cloud.calls.filter((c) => c.op === 'create').length, 0, 'nothing of hers to upload, so nothing is');
    assert.equal(cloud.table('household_categories').length, starters, 'the cloud holds exactly the starters it made itself');
    assert.equal(a.store.getSnapshot().state.categories.length, starters, 'and the device holds the same: the pull did not double them');
    const sync = a.persisted().identity.sync;
    assert.deepEqual([sync.queue.length, sync.hydration], [0, 'ready']);
    assert.equal(cloud.calls.filter((c) => c.op === 'pull').length, 1, 'one pull, not a loop');
  });

  test('C. an existing cloud account on a device with no content: the household arrives, nothing is uploaded, nothing is duplicated', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await householdWithContent(a);
    await a.signIn();
    const createsByA = cloud.calls.filter((c) => c.op === 'create').length;
    const rowsBefore = cloud.rows.size;

    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await bindAsNewDevice(b, accountCloud);
    await b.signIn();

    assert.equal(cloud.calls.filter((c) => c.op === 'create').length, createsByA, 'the new device uploaded nothing');
    assert.equal(cloud.rows.size, rowsBefore, 'and the cloud holds exactly what it held');
    const names = (device) => device.store.getSnapshot().state.categories.map((c) => c.name).sort();
    assert.deepEqual(names(b), names(a), 'no starter category twice on the new device');
    assert.equal(b.store.getSnapshot().state.tasks.length, 2);
    assert.equal(b.persisted().identity.sync.queue.length, 0);
  });

  test('K. an initial pull interrupted part-way leaves NOTHING half-applied, and a relaunch completes it exactly once', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await mutate(a, (s) => ({ ...s, oneMoves: [withheldMove] }));
    await mutate(a, (state, ctx) => {
      let next = state;
      for (let i = 0; i < 250; i += 1) next = addTask(next, ctx, { title: `Task ${i}`, categoryId: state.categories[0].id, scope: 'household', durationMinutes: 20, durationSource: 'user' });
      return next;
    });
    await a.store.flush();
    await a.signIn();
    const createsByA = cloud.calls.filter((c) => c.op === 'create').length;
    const rowsBefore = cloud.rows.size;

    const storage = createMemoryStorage({});
    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage });
    await bindAsNewDevice(b, accountCloud);
    // The network goes away during the third row request: two were answered, the rest never will be this launch.
    let requests = 0;
    cloud.hooks.duringFetch = async () => {
      requests += 1;
      if (requests === 3) cloud.state.offline = true;
    };
    await b.signIn();

    const interrupted = b.persisted();
    assert.equal(b.syncRuntime.snapshot().phase, 'offline');
    assert.deepEqual([interrupted.identity.sync.hydration, interrupted.identity.sync.cursor], ['unhydrated', '0'], 'the cursor did not move past what it never applied');
    assert.equal(interrupted.state.tasks.length, 0, 'no half-applied household: a pull is all or nothing');
    assert.equal(interrupted.identity.sync.queue.length, 0, 'and nothing is owed for a household she has not yet seen');
    assert.equal(cloud.calls.filter((c) => c.op === 'create').length, createsByA, 'so nothing was uploaded either');

    // A relaunch with the network back reads it again and lands the whole thing, once.
    cloud.hooks.duringFetch = undefined;
    cloud.state.offline = false;
    const relaunched = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage, secure: b.secure });
    const restored = await relaunched.accountRuntime.restore();
    await relaunched.syncRuntime.idle();
    assert.equal(restored.kind, 'accountBound');

    const done = relaunched.persisted();
    const tasks = done.state.tasks;
    assert.equal(tasks.length, 250, 'the whole household arrived');
    assert.equal(new Set(tasks.map((t) => t.id)).size, 250, 'with no duplicate row');
    assert.deepEqual([done.identity.sync.hydration, done.identity.sync.queue.length], ['ready', 0]);
    assert.equal(cloud.rows.size, rowsBefore, 'and the cloud was not written to by a device that only reads');
  });
});

describe('HA-001 — a source artifact carries arrival metadata and NEVER her words (the foundation half of raw-source exclusion)', () => {
  const artifact = {
    id: 'artifact-1', kind: 'voice-utterance', origin: 'voice', provider: null, receivedAt: '2026-09-21T14:00:00.000Z',
    contentDigest: 'a'.repeat(64), contentRef: null, retractedAt: null, createdAt: '2026-09-21T14:00:00.000Z', scope: 'personal',
  };
  const RAW_TEXT = /text|body|transcript|utterance|words|message/i;

  test('the model has no place to put text: a source artifact with any of the obvious fields is refused', () => {
    assert.equal(SourceArtifactSchema.safeParse(artifact).success, true);
    for (const field of ['text', 'body', 'transcript', 'utterance', 'content', 'words']) {
      assert.equal(SourceArtifactSchema.safeParse({ ...artifact, [field]: 'CANARY-RAW-WORDS' }).success, false, `"${field}" is not a field of a source artifact`);
    }
  });

  test('the cloud projection has no column that could hold text', () => {
    const spec = FOUNDATION_SPECS.find((s) => s.kind === 'sourceArtifact');
    assert.deepEqual(spec.fields.map((f) => f.col).filter((col) => RAW_TEXT.test(col)), []);
    assert.deepEqual(spec.fields.map((f) => f.col).sort(), ['content_digest', 'content_ref', 'kind', 'origin', 'provider', 'received_at', 'retracted_at']);
  });

  test('a bound household\'s source artifact reaches the cloud as arrival metadata and a digest, in no column that could be text', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await mutate(a, (s) => ({ ...s, oneMoves: [withheldMove], sourceArtifacts: [artifact] }));
    await a.store.flush();
    await a.signIn();
    const [row] = cloud.table('source_artifacts');
    assert.ok(row, 'the artifact was transported');
    assert.equal(row.content_digest, 'a'.repeat(64), 'as a digest');
    assert.deepEqual(Object.keys(row).filter((key) => RAW_TEXT.test(key)), [], 'and in no text-shaped column');
    assert.equal(a.persisted().identity.sync.queue.length, 0);
  });
});

describe('HA-001 — cost', () => {
  test('observing a mutation in a 5,000-task household is not a full scan and stays well under a millisecond-scale budget', async () => {
    const observer = createChangeObserver({ now: () => NOW });
    let state = { ...(await (async () => { const { createEmptyState } = await import('../../src/state/initialState.ts'); return createEmptyState(TZ); })()) };
    const c = { nowMs: NOW, today: TODAY, createId: (p) => `${p}-${Math.random().toString(36).slice(2)}` };
    for (let i = 0; i < 5000; i += 1) state = addTask(state, c, { title: `t${i}`, categoryId: state.categories[0].id, scope: 'household' });
    const identity = { binding: { accountId: ACCOUNT_A, householdId: uuid(), boundAt: '2026-09-21T15:00:00.000Z', kind: 'claim', idMap: {} }, receipt: null, quarantine: null, sync: null };
    const { emptyNamespace } = await import('../../src/domain/sync/syncTypes.ts');
    identity.sync = emptyNamespace({ accountId: ACCOUNT_A, householdId: identity.binding.householdId, deviceId: uuid() });
    // events are a different collection: the 5,000 tasks must not be walked at all
    const next = addEvent(state, c, { title: 'e', categoryId: state.categories[0].id, startsAt: '2026-09-25T23:00:00.000Z', endsAt: '2026-09-26T00:00:00.000Z', commitment: 'fixed', scope: 'household' });
    const t0 = performance.now();
    for (let i = 0; i < 200; i += 1) observer.observe({ previous: state, next, identity });
    const perCall = (performance.now() - t0) / 200;
    assert.ok(perCall < 1, `an untouched 5,000-row collection cost ${perCall.toFixed(3)} ms per observed change`);

    const edited = updateTask(state, c, state.tasks[2500].id, { title: 'one edit' });
    const t1 = performance.now();
    for (let i = 0; i < 50; i += 1) observer.observe({ previous: state, next: edited, identity });
    const perEdit = (performance.now() - t1) / 50;
    assert.ok(perEdit < 5, `one edit inside a 5,000-row collection cost ${perEdit.toFixed(3)} ms`);
    console.log(`      observe: untouched collection ${perCall.toFixed(4)} ms, one edit in 5,000 rows ${perEdit.toFixed(4)} ms`);
  });
});

void starterCategories;
