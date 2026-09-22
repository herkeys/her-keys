/**
 * A copy of the two-device harness in tests/hk-ir01/syncComposition.test.mjs (lines 33-172), which does not export it.
 * Feature 08 copies rather than edits that file so no shared test changes. Every device begins at `composeAccountApp`, the
 * function the production root calls; only the platform leaves (storage, keychain, providers, the network) are stand-ins.
 * The cloud is the in-memory model in tests/support/fakeCloud.mjs; the REAL PostgreSQL proof is in supabase/tests.
 *
 * One addition: `accountCloudFor` records every claim payload, so a test can show what the claim does and does not carry.
 */
import { randomUUID } from 'node:crypto';
import { createProviderRegistry, createScriptedProvider } from '../../../src/domain/account/provider.ts';
import { createMemorySecureStorage, createSecureSessionStore } from '../../../src/domain/account/secureSession.ts';
import { createChangeObserver } from '../../../src/domain/sync/changeObserver.ts';
import { namespaceForNewDevice } from '../../../src/domain/sync/claimSeam.ts';
import { decodeStoredState } from '../../../src/persistence/envelope.ts';
import { STORAGE_KEYS, createAppStateRepository } from '../../../src/persistence/appStateRepository.ts';
import { createMemoryStorage } from '../../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../../src/state/appStore.ts';
import { composeAccountApp } from '../../../src/store/composeAccountApp.ts';
import { createFakeCloud } from '../../support/fakeCloud.mjs';

export { createFakeCloud };
export const TZ = 'America/Chicago';
export const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
/** A Monday in the household's timezone. */
export const TODAY = '2026-09-21';
export const TUESDAY = '2026-09-22';
export const WEDNESDAY = '2026-09-23';
export const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
export const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const USER = { producer: 'user-action', artifactId: null, confidence: null };
export const uuid = () => randomUUID();

const sessionFor = (accountId) => ({
  accountId,
  accessToken: `access-${accountId}`,
  refreshToken: `refresh-${accountId}`,
  expiresAt: NOW + 3_600_000,
  provider: { provider: 'apple', subject: `apple-${accountId}`, suggestedDisplayName: null },
});

/** A withheld One Move for today, so the household does not decide one from its tasks and the claim closure stays trivial. */
export const withheldMove = { id: `onemove-${TODAY}`, forDate: TODAY, targetId: null, targetType: 'task', status: 'withheld', decidedAt: '2026-09-21T14:00:00.000Z', completedAt: null, provenance: USER, scope: 'personal' };

export function accountCloudFor(cloud, accountId, { householdId = uuid() } = {}) {
  const ids = { householdId, memberId: uuid(), categories: null, claims: 0, failNext: 0, rejectNext: null, payloads: [] };
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
          if (ids.failNext > 0) { ids.failNext -= 1; return { kind: 'unreachable', detail: 'offline' }; }
          return answer(getState(), null);
        },
        async claimLocalHousehold({ payload }) {
          ids.claims += 1;
          ids.payloads.push(payload);
          if (ids.failNext > 0) { ids.failNext -= 1; return { kind: 'unreachable', detail: 'offline' }; }
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
export async function makeDevice({ cloud, accountId, accountCloud, storage = createMemoryStorage({}), secure = createMemorySecureStorage({}), mode = 'empty', results }) {
  const clock = makeClock();
  const observer = createChangeObserver({ now: () => NOW });
  const repository = createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: false });
  const store = createAppStore({ repository, mode, now: () => NOW, timeZone: () => TZ, observe: observer.observe });
  await store.hydrate();
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

/** Runs one domain action through the real store (durable before it returns) and hands back the action's result. */
export async function act(device, action) {
  let result;
  const ok = await device.store.commit((state, ctx) => {
    result = action(state, ctx);
    return result.state ?? result;
  });
  return { ok, result };
}

/** A fresh install of an account that already has a household in the cloud, bound exactly as adoption of an existing household will leave it. */
export async function bindAsNewDevice(device, accountCloud) {
  device.store.setIdentity({
    binding: { accountId: device.accountId, householdId: accountCloud.ids.householdId, boundAt: '2026-09-21T15:00:00.000Z', kind: 'claim', idMap: {} },
    receipt: null,
    quarantine: null,
    sync: namespaceForNewDevice({ accountId: device.accountId, householdId: accountCloud.ids.householdId, deviceId: uuid() }),
  });
  await device.store.saveIdentity();
}

/** Device A of account A, signed in and bound, with a household whose claim closure is trivial. */
export async function boundDevice({ before } = {}) {
  const cloud = createFakeCloud();
  const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
  const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
  await a.store.commit((s) => ({ ...s, oneMoves: [withheldMove] }));
  if (before) await before(a);
  const state = await a.signIn();
  if (state.kind !== 'accountBound') throw new Error(`device A did not bind: ${state.kind}`);
  return { cloud, accountCloud, a };
}

/** A second install of the same account, hydrated from the cloud. */
export async function secondDevice({ cloud, accountCloud }) {
  const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
  await bindAsNewDevice(b, accountCloud);
  const state = await b.signIn();
  if (state.kind !== 'accountBound') throw new Error(`device B did not bind: ${state.kind}`);
  return b;
}
