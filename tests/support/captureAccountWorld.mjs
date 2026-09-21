/**
 * Feature 02 THROUGH THE PRODUCTION COMPOSITION (HK-IR01-F02).
 *
 * `captureWorld.mjs` proves the capture coordinator on a bare store. That cannot show what happens once an account is bound,
 * because nothing there observes canonical changes. This world starts where the app starts: `composeAccountApp`, the one
 * function the production root calls, with the real store (created WITH the change observer, exactly as
 * `appStoreInstance.ts` does), the real account runtime, the real sync runtime and coordinator - and, on top of that same
 * store, the real Talk It Out capture coordinator with the real local reader. Only the platform leaves are stand-ins:
 * storage, keychain, the sign-in provider and the network (an in-memory model of the server, `fakeCloud.mjs`).
 *
 * The helpers `accountCloudFor`, `makeClock`, `makeDevice` and `bindAsNewDevice` are the approach of
 * tests/hk-ir01/syncComposition.test.mjs, copied here because that file exports nothing. Two things are added that it does
 * not have and that this feature needs:
 *   - `tapCloud`: records EVERY request the sync runtime hands to the transport (create rows and update patches, in full),
 *     including ones the server then refuses or loses, so "nothing of hers was sent" is proved against what was SENT and not
 *     only against what the fake server kept;
 *   - `payloadSurfaces` / `leaksOf`: every place a raw utterance could end up (cloud rows, cloud calls, transport requests,
 *     claim payloads, every envelope ever written, the durable outbound queue, the identity block, diagnostics), and a scanner
 *     that looks for the whole utterance, for run of it, and for chosen canary tokens.
 */
import { randomUUID } from 'node:crypto';
import { createProviderRegistry, createScriptedProvider } from '../../src/domain/account/provider.ts';
import { createMemorySecureStorage, createSecureSessionStore } from '../../src/domain/account/secureSession.ts';
import { createCaptureCoordinator } from '../../src/features/talk-it-out/capture/coordinator.ts';
import { localInterpreter } from '../../src/features/talk-it-out/capture/port.ts';
import { createMemoryCaptureTextStore } from '../../src/features/talk-it-out/capture/textStore.ts';
import { createChangeObserver } from '../../src/domain/sync/changeObserver.ts';
import { namespaceForNewDevice } from '../../src/domain/sync/claimSeam.ts';
import { decodeStoredState } from '../../src/persistence/envelope.ts';
import { STORAGE_KEYS, createAppStateRepository } from '../../src/persistence/appStateRepository.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { composeAccountApp } from '../../src/store/composeAccountApp.ts';
import { createFakeCloud } from './fakeCloud.mjs';

export { createFakeCloud, createMemoryStorage, localInterpreter, STORAGE_KEYS };

export const TZ = 'America/Chicago';
/** Monday 2026-09-21, 10:00 in Chicago. "Friday" is 2026-09-25. */
export const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
export const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
export const ALEXA = { id: 'kid-alexa', displayName: 'Alexa', birthDate: '2018-05-19', scope: 'child' };
export const AYDEN = { id: 'kid-ayden', displayName: 'Ayden', birthDate: '2021-08-07', scope: 'child' };

const uuid = () => randomUUID();

const sessionFor = (accountId) => ({
  accountId,
  accessToken: `access-${accountId}`,
  refreshToken: `refresh-${accountId}`,
  expiresAt: NOW + 3_600_000,
  provider: { provider: 'apple', subject: `apple-${accountId}`, suggestedDisplayName: null },
});

/**
 * An in-memory account cloud: what bootstrap_account and claim_local_household answer, and the rows they leave in the cloud.
 * Unlike the original, it also keeps every claim payload it was sent (`payloads`), because the claim is a cloud payload too.
 */
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
    payloads: ids.payloads,
    bind(getState) {
      return {
        async bootstrapAccount() {
          if (ids.failNext > 0) { ids.failNext -= 1; return { kind: 'unreachable', detail: 'offline' }; }
          if (ids.rejectNext) return { kind: 'ok', body: { status: 'rejected', rejected_reason: ids.rejectNext, household_id: householdId, claim_id: null, id_map: {} } };
          return answer(getState(), null);
        },
        async claimLocalHousehold({ payload }) {
          ids.claims += 1;
          ids.payloads.push(JSON.stringify(payload));
          if (ids.failNext > 0) { ids.failNext -= 1; return { kind: 'unreachable', detail: 'offline' }; }
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
      return () => { timer.live = false; };
    },
    pending: () => timers.filter((t) => t.live).length,
    flush() {
      const due = timers.splice(0).filter((t) => t.live);
      for (const t of due) t.work();
    },
  };
}

/**
 * Wraps a fake cloud's transport so every request is recorded IN FULL before it is forwarded. `sent` holds one JSON string per
 * request; `requests` counts them. Anything the runtime tried to send is here, whether or not the server kept it.
 */
export function tapCloud(cloud) {
  const sent = [];
  const record = (op, table, body) => sent.push(JSON.stringify({ op, table, body }));
  const transport = {
    create: (table, deviceId, row) => { record('create', table, row); return cloud.transport.create(table, deviceId, row); },
    update: (table, cloudId, baseRevision, patch, column) => { record('update', table, patch); return cloud.transport.update(table, cloudId, baseRevision, patch, column); },
    pull: (...args) => cloud.transport.pull(...args),
    fetchRows: (...args) => cloud.transport.fetchRows(...args),
  };
  return { transport, sent, requests: () => sent.length };
}

/**
 * One installation: its own storage, store (with the observer), account runtime, sync runtime AND capture coordinator.
 * `restart` gives the same installation a new process: same storage and keychain, a new store, an EMPTY session text store.
 */
export async function makeCaptureDevice({
  cloud,
  tap = tapCloud(cloud),
  accountId = ACCOUNT_A,
  accountCloud,
  storage = createMemoryStorage({}),
  secure = createMemorySecureStorage({}),
  mode = 'empty',
  kids = [ALEXA, AYDEN],
  results,
  /** A test double for the reader, used only to prove that a leak WOULD be caught. The default is the app's own local reader. */
  interpreter = localInterpreter,
}) {
  const clock = makeClock();
  const observer = createChangeObserver({ now: () => NOW });
  const repository = createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: false });
  const store = createAppStore({ repository, mode, now: () => NOW, timeZone: () => TZ, observe: observer.observe });
  await store.hydrate();
  if (mode === 'empty' && kids.length > 0 && store.getSnapshot().state.children.length === 0) await store.commit((s) => ({ ...s, children: kids }));
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
    sync: { transport: tap.transport, newDeviceId: uuid, schedule: clock.schedule, debounceMs: 0, report: (e) => events.push(e) },
  });

  // The capture feature, mounted exactly as CaptureProvider mounts it: on the app's own store, with a session-only text store.
  const text = createMemoryCaptureTextStore();
  const coordinator = createCaptureCoordinator({ store, interpreter, text, now: () => NOW });

  const device = { storage, secure, store, clock, events, text, coordinator, tap, cloud, accountCloud, accountId, ...app };
  device.persisted = () => {
    const raw = storage.contents()[STORAGE_KEYS.primary];
    return raw === undefined ? null : decodeStoredState(raw);
  };
  device.state = () => store.getSnapshot().state;
  device.queue = () => device.persisted()?.identity?.sync?.queue ?? [];
  device.queueKinds = () => device.queue().map((item) => item.kind);
  device.signIn = async () => {
    const state = await app.accountRuntime.signIn('apple');
    await app.syncRuntime.idle();
    return state;
  };
  device.settle = async () => {
    await store.flush();
    clock.flush();
    await app.syncRuntime.idle();
  };
  /** A relaunch of the same installation: same disk and keychain, new process. The session's held words are gone. */
  device.restart = async () => {
    const next = await makeCaptureDevice({ cloud, tap, accountId, accountCloud, storage, secure, mode, kids, results, interpreter });
    const restored = await next.accountRuntime.restore();
    await next.syncRuntime.idle();
    next.restored = restored;
    return next;
  };
  return device;
}

/**
 * A fresh install of an account that already has a household in the cloud, bound the way adoption of an existing household will
 * leave it (that step is a recorded contract that is not implemented; see the BACKEND doc). Pull hydrates it, children included.
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

// ------------------------------------------------------------ leak scanning ---

/**
 * Everything an utterance could be found in, as named strings. Devices are scanned for every envelope ever written (the
 * storage write log, not just the latest), the durable outbound queue, the identity block and the runtime diagnostics.
 */
export function payloadSurfaces({ cloud, tap, accountCloud, devices = [] }) {
  const parts = {
    'cloud rows': JSON.stringify([...cloud.rows.values()]),
    'cloud calls': JSON.stringify(cloud.calls),
    'cloud change log': JSON.stringify(cloud.log),
    'transport requests': tap.sent.join('\n'),
    'claim payloads': accountCloud.payloads.join('\n'),
  };
  devices.forEach((device, index) => {
    const durable = device.persisted();
    parts[`device ${index} storage (every key)`] = JSON.stringify(device.storage.contents());
    parts[`device ${index} storage (every envelope ever written)`] = (device.storage.writeLog ?? []).map((w) => String(w.value)).join('\n');
    parts[`device ${index} durable outbound queue`] = JSON.stringify(durable?.identity?.sync?.queue ?? []);
    parts[`device ${index} durable identity`] = JSON.stringify(durable?.identity ?? null);
    parts[`device ${index} runtime diagnostics`] = JSON.stringify(device.events);
  });
  return parts;
}

/**
 * Where a raw utterance shows up in `surfaces`: the whole of it, any run of `window` characters of it, or one of `tokens`.
 * A short derived title (a few words) is below the window, so a legitimately structured field is not reported as a leak.
 * Returns human-readable findings; an empty array means nothing was found.
 */
export function leaksOf(surfaces, utterance, { window = 30, tokens = [] } = {}) {
  const found = [];
  for (const [where, haystack] of Object.entries(surfaces)) {
    if (haystack.includes(utterance)) found.push(`${where}: the whole utterance`);
    for (const token of tokens) if (haystack.includes(token)) found.push(`${where}: token ${token}`);
    for (let i = 0; i + window <= utterance.length; i += 1) {
      const run = utterance.slice(i, i + window);
      if (haystack.includes(run)) {
        found.push(`${where}: a ${window}-character run of the utterance ("${run}")`);
        break;
      }
    }
  }
  return found;
}
