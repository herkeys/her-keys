/**
 * An installation of the app for account-backed tests: its own storage, household store, change observer, account runtime and
 * sync runtime, all composed by `composeAccountApp` — the SAME function the production root calls. Only the platform leaves
 * (storage, keychain, providers, the network) are stand-ins. The cloud is the in-memory model in `fakeCloud.mjs`; the real
 * PostgreSQL / PostgREST proof of the same journeys lives in supabase/tests.
 *
 * Adapted from tests/hk-ir01/syncComposition.test.mjs (which registers tests at import time and so cannot be imported). A test
 * that hand-builds a coordinator cannot fail when production forgets to build one; these can.
 */
import { randomUUID } from 'node:crypto';
import { createProviderRegistry, createScriptedProvider } from '../../src/domain/account/provider.ts';
import { createMemorySecureStorage, createSecureSessionStore } from '../../src/domain/account/secureSession.ts';
import { createChangeObserver } from '../../src/domain/sync/changeObserver.ts';
import { namespaceForNewDevice } from '../../src/domain/sync/claimSeam.ts';
import { decodeStoredState } from '../../src/persistence/envelope.ts';
import { STORAGE_KEYS, createAppStateRepository } from '../../src/persistence/appStateRepository.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { composeAccountApp } from '../../src/store/composeAccountApp.ts';

export const TZ = 'America/Chicago';
export const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
export const TODAY = '2026-09-21';
export const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
export const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
export const USER = { producer: 'user-action', artifactId: null, confidence: null };
export const uuid = () => randomUUID();

/** A withheld One Move for today, so the household does not decide one from its tasks and the claim closure stays trivial. */
export const withheldMove = {
  id: `onemove-${TODAY}`,
  forDate: TODAY,
  targetId: null,
  targetType: 'task',
  status: 'withheld',
  decidedAt: '2026-09-21T14:00:00.000Z',
  completedAt: null,
  provenance: USER,
  scope: 'personal',
};

export const sessionFor = (accountId, now = NOW) => ({
  accountId,
  accessToken: `access-${accountId}`,
  refreshToken: `refresh-${accountId}`,
  expiresAt: now + 3_600_000,
  provider: { provider: 'apple', subject: `apple-${accountId}`, suggestedDisplayName: null },
});

/** An in-memory account cloud: what bootstrap_account and claim_local_household answer, and the rows they leave in the cloud. */
export function accountCloudFor(cloud, accountId, { householdId = uuid() } = {}) {
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
    bind(getState) {
      return {
        async bootstrapAccount() {
          if (ids.failNext > 0) {
            ids.failNext -= 1;
            return { kind: 'unreachable', detail: 'offline' };
          }
          if (ids.rejectNext) return { kind: 'ok', body: { status: 'rejected', rejected_reason: ids.rejectNext, household_id: householdId, claim_id: null, id_map: {} } };
          return answer(getState(), null);
        },
        async claimLocalHousehold({ payload }) {
          ids.claims += 1;
          if (ids.failNext > 0) {
            ids.failNext -= 1;
            return { kind: 'unreachable', detail: 'offline' };
          }
          if (ids.rejectNext) return { kind: 'ok', body: { status: 'rejected', rejected_reason: ids.rejectNext, household_id: householdId, claim_id: null, id_map: {} } };
          return answer(getState(), payload);
        },
      };
    },
  };
}

export function makeClock() {
  const timers = [];
  return {
    schedule: (work) => {
      const timer = { work, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    pending: () => timers.filter((t) => t.live).length,
    flush() {
      const due = timers.splice(0).filter((t) => t.live);
      for (const t of due) t.work();
    },
  };
}

/** One installation. Shares only the cloud (and, for a restart, its storage and secure storage). */
export async function makeDevice({ cloud, accountId, accountCloud, storage = createMemoryStorage({}), secure = createMemorySecureStorage({}), mode = 'empty', results, hydrateState = null, now = NOW }) {
  const clock = makeClock();
  const observer = createChangeObserver({ now: () => now });
  const repository = createAppStateRepository({ storage, appVersion: 'test', now: () => now, quarantineCorruptState: false });
  const store = createAppStore({ repository, mode, now: () => now, timeZone: () => TZ, observe: observer.observe });
  await store.hydrate();
  if (hydrateState) await store.commit(() => hydrateState);
  await store.flush();

  const events = [];
  const app = composeAccountApp({
    store,
    observer,
    account: {
      sessions: createSecureSessionStore(secure),
      providers: createProviderRegistry([createScriptedProvider('apple', { results: results ?? Array.from({ length: 12 }, () => ({ kind: 'success', session: sessionFor(accountId, now) })) })]),
      cloud: accountCloud.bind(() => store.getSnapshot().state),
      timezone: () => TZ,
      now: () => now,
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

/** `mutate(device, transition)` — a canonical mutation through the production store, exactly as a screen would commit it. */
export const mutate = (device, fn) => device.store.commit((state, ctx) => fn(state, ctx));

/**
 * A fresh install of an account that already has a household in the cloud, bound exactly as adoption of an existing household
 * will leave it. That adoption step is a recorded contract that is not implemented on this baseline (see the repair ledger's
 * BACKEND doc); this is its stand-in, so the pull path it will feed can be attacked now.
 */
export async function bindAsNewDevice(device, accountCloud) {
  device.store.setIdentity({
    binding: { accountId: device.accountId, householdId: accountCloud.ids.householdId, boundAt: '2026-09-21T15:00:00.000Z', kind: 'claim', idMap: {} },
    receipt: null,
    quarantine: null,
    sync: namespaceForNewDevice({ accountId: device.accountId, householdId: accountCloud.ids.householdId, deviceId: uuid() }),
  });
  await device.store.saveIdentity();
}
