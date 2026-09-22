/**
 * HK-FEATURE-07 — Co-Parent Logistics through the PRODUCTION composition.
 *
 * Every test begins at `composeAccountApp`, the function the app's root calls, with the real household store, account runtime, sync
 * runtime and coordinator; only the platform leaves (storage, keychain, provider, network) are stand-ins. Feature 07 has NO sync code:
 * its mutations are ordinary canonical transitions that the store's change observer queues. The REAL PostgreSQL / PostgREST / RLS
 * proof of the representative journey is `supabase/tests/run-coparent.mjs`; this file attacks the failure modes deterministically.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { createProviderRegistry, createScriptedProvider } from '../../src/domain/account/provider.ts';
import { createMemorySecureStorage, createSecureSessionStore } from '../../src/domain/account/secureSession.ts';
import { createChangeObserver } from '../../src/domain/sync/changeObserver.ts';
import { namespaceForNewDevice } from '../../src/domain/sync/claimSeam.ts';
import { PULL_FETCH_CHUNK, needsSyncAttention } from '../../src/domain/sync/syncTypes.ts';
import { decodeStoredState } from '../../src/persistence/envelope.ts';
import { STORAGE_KEYS, createAppStateRepository } from '../../src/persistence/appStateRepository.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { composeAccountApp } from '../../src/store/composeAccountApp.ts';
import {
  commitMutation,
  createHandoff,
  createMoneyFollowUp,
  createPreparation,
  editHandoff,
  handoffEditorSeed,
  recordAnswer,
} from '../../src/features/coparent/mutations.ts';
import { buildCoParentLogisticsView } from '../../src/features/coparent/projection.ts';
import { createFakeCloud } from '../support/fakeCloud.mjs';

const TZ = 'America/New_York';
const NOW = Date.UTC(2026, 8, 16, 14, 0, 0);
const TODAY = '2026-09-16';
const USER = { producer: 'user-action', artifactId: null, confidence: null };
const uuid = () => randomUUID();
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const withheldMove = { id: `onemove-${TODAY}`, forDate: TODAY, targetId: null, targetType: 'task', status: 'withheld', decidedAt: '2026-09-16T13:00:00.000Z', completedAt: null, provenance: USER, scope: 'personal' };
const CHILDREN = [
  { id: 'child-josie', displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' },
  { id: 'child-milo', displayName: 'Milo', birthDate: '2019-11-20', scope: 'child' },
];

const sessionFor = (accountId) => ({ accountId, accessToken: `access-${accountId}`, refreshToken: `refresh-${accountId}`, expiresAt: NOW + 3_600_000, provider: { provider: 'apple', subject: `apple-${accountId}`, suggestedDisplayName: null } });

function accountCloudFor(cloud, accountId, { householdId = uuid() } = {}) {
  const ids = { householdId, memberId: uuid(), categories: null };
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
        async bootstrapAccount() { return answer(getState(), null); },
        async claimLocalHousehold({ payload }) { return answer(getState(), payload); },
      };
    },
  };
}

function makeClock() {
  const timers = [];
  return {
    schedule: (work) => { const timer = { work, live: true }; timers.push(timer); return () => { timer.live = false; }; },
    flush() { const due = timers.splice(0).filter((t) => t.live); for (const t of due) t.work(); },
  };
}

async function makeDevice({ cloud, accountCloud, storage = createMemoryStorage({}), secure = createMemorySecureStorage({}), seed = true }) {
  const clock = makeClock();
  const observer = createChangeObserver({ now: () => NOW });
  const repository = createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: false });
  const store = createAppStore({ repository, mode: 'empty', now: () => NOW, timeZone: () => TZ, observe: observer.observe });
  await store.hydrate();
  if (seed && store.getSnapshot().state.children.length === 0) await store.commit((s) => ({ ...s, oneMoves: [withheldMove], children: CHILDREN }));
  await store.flush();
  const app = composeAccountApp({
    store,
    observer,
    account: {
      sessions: createSecureSessionStore(secure),
      providers: createProviderRegistry([createScriptedProvider('apple', { results: Array.from({ length: 12 }, () => ({ kind: 'success', session: sessionFor(ACCOUNT) })) })]),
      cloud: accountCloud.bind(() => store.getSnapshot().state),
      timezone: () => TZ,
      now: () => NOW,
      newClaimKey: () => uuid(),
      deviceId: uuid(),
    },
    sync: { transport: cloud.transport, newDeviceId: uuid, schedule: clock.schedule, debounceMs: 0 },
  });
  const device = { storage, store, clock, secure, ...app };
  device.persisted = () => decodeStoredState(storage.contents()[STORAGE_KEYS.primary]);
  device.signIn = async () => { const state = await app.accountRuntime.signIn('apple'); await app.syncRuntime.idle(); return state; };
  device.settle = async () => { clock.flush(); await app.syncRuntime.idle(); };
  device.view = () => { const s = store.getSnapshot().state; return buildCoParentLogisticsView(s, s.household.id, { nowMs: NOW }); };
  return device;
}

async function bindAsNewDevice(device, accountCloud) {
  device.store.setIdentity({
    binding: { accountId: ACCOUNT, householdId: accountCloud.ids.householdId, boundAt: '2026-09-16T14:00:00.000Z', kind: 'claim', idMap: {} },
    receipt: null, quarantine: null,
    sync: namespaceForNewDevice({ accountId: ACCOUNT, householdId: accountCloud.ids.householdId, deviceId: uuid() }),
  });
  await device.store.saveIdentity();
}

const base = { title: 'Pickup Josie', date: '2026-09-18', startTime: '17:00', endTime: '17:30', location: 'Front desk', notes: '', commitment: 'fixed', needsMe: true, repeat: 'weekly' };
const fields = (over = {}) => ({ ...base, childId: 'child-josie', ...over });
const OK = ['saved'];

async function journey(a) {
  const h1 = await commitMutation(a.store, (s, c) => createHandoff(s, c, fields(), { kind: 'new', displayName: 'Alex', relationship: 'co-parent' }), OK);
  const h2 = await commitMutation(a.store, (s, c) => createHandoff(s, c, fields({ childId: 'child-milo', title: 'Drop off Milo', date: '2026-09-19', repeat: 'none', location: '' }), { kind: 'new', displayName: 'Alex', relationship: 'co-parent' }), OK);
  await commitMutation(a.store, (s, c) => createPreparation(s, c, { childId: 'child-josie', title: 'Pack the school laptop', dueDate: '2026-09-17', notes: '', linkEventId: h1.id }), OK);
  await commitMutation(a.store, (s, c) => createMoneyFollowUp(s, c, { title: 'Soccer registration', childId: 'child-josie', amountText: '80', currency: 'USD', direction: 'inflow', followUpDate: '2026-09-25', notes: '' }, { kind: 'person', personId: a.store.getSnapshot().state.people[0].id }), OK);
  const rid = a.store.getSnapshot().state.responsibilities.find((r) => r.about.id === h1.id).id;
  await commitMutation(a.store, (s, c) => recordAnswer(s, c, rid, 'accepted_needs_me'), OK);
  return { h1: h1.id, h2: h2.id, rid };
}

describe('Feature 07 through the production composition (in-model cloud)', () => {
  test('a representative journey reaches the cloud through the queue with no feature sync code, and a SECOND device shows the identical logistics', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT);
    const a = await makeDevice({ cloud, accountCloud });
    const bound = await a.signIn();
    assert.equal(bound.kind, 'accountBound');
    assert.equal(a.syncRuntime.constructed(), 1);
    const ids = await journey(a);
    await a.settle();

    for (const [table, count] of [['events', 2], ['household_people', 2], ['responsibilities', 3], ['dependencies', 1], ['recurrence_rules', 1], ['tasks', 2]]) {
      assert.equal(cloud.table(table).length, count, table);
    }
    const eventRow = cloud.table('events').find((e) => e.title === 'Pickup Josie');
    assert.equal(eventRow.scope, 'coparent-shared');
    assert.ok(eventRow.owner_profile_id, 'an owner-only row carries its owner');
    assert.ok(eventRow.subject_member_id, 'the child crossed the boundary as a member reference');
    assert.equal(a.persisted().identity.sync.queue.length, 0);
    assert.equal(a.persisted().identity.sync.evidence.length, 0, 'no false conflict against herself');

    const b = await makeDevice({ cloud, accountCloud, seed: false });
    await bindAsNewDevice(b, accountCloud);
    assert.equal((await b.signIn()).kind, 'accountBound');
    const brief = (v) => JSON.stringify({ t: v.transitions, p: v.preparation, m: v.moneyFollowUps, n: v.people, c: v.children });
    assert.equal(brief(b.view()), brief(a.view()), 'CLIENT A -> queue -> cloud -> CLIENT B: identical projection');
    const t = b.view().transitions.find((x) => x.id === ids.h1);
    assert.equal(t.child.childId, 'child-josie');
    assert.equal(t.child.displayName, 'Josie', 'the child name survives claim and pull unchanged');
    assert.equal(t.responsibility.counterpart.displayName, 'Alex');
    assert.equal(t.responsibility.coverage, 'not_covered');
    assert.equal(b.persisted().identity.sync.queue.length, 0, 'pulled state produced no outbound work');
  });

  test('only synced canonical kinds are written: no artifacts, interpretations or intents leave the device from this feature', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT);
    const a = await makeDevice({ cloud, accountCloud });
    await a.signIn();
    await journey(a);
    await a.settle();
    const touched = new Set([...cloud.rows.values()].map((r) => r._table));
    for (const forbidden of ['source_artifacts', 'interpretations', 'action_intents', 'action_executions', 'action_outcomes', 'intent_decisions', 'external_references']) {
      assert.equal(touched.has(forbidden), false, forbidden);
    }
  });

  test('K: create + edit OFFLINE, restart still offline, then reconnect — one row each, the edit applied, nothing lost, second device converges', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT);
    const a = await makeDevice({ cloud, accountCloud });
    await a.signIn();
    cloud.state.offline = true;

    const created = await commitMutation(a.store, (s, c) => createHandoff(s, c, fields(), { kind: 'new', displayName: 'Alex', relationship: 'co-parent' }), OK);
    const seed = handoffEditorSeed(a.store.getSnapshot().state, created.id);
    const edited = await commitMutation(a.store, (s, c) => editHandoff(s, c, { eventId: created.id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, title: 'Pickup Josie (edited offline)' } }), OK);
    assert.equal(edited.outcome, 'saved');
    await a.settle();
    assert.ok(a.persisted().identity.sync.queue.length >= 3, 'the intent is durable with the change itself');
    assert.equal(cloud.table('events').length, 0, 'nothing reached a cloud that is unreachable');

    // Restart while still offline: process death, then a fresh runtime from the persisted envelope alone.
    a.syncRuntime.stop();
    const a2 = await makeDevice({ cloud, accountCloud, storage: a.storage, secure: a.secure, seed: false });
    await a2.accountRuntime.restore();
    const restarted = a2.view();
    assert.equal(restarted.transitions[0].title, 'Pickup Josie (edited offline)');
    assert.equal(restarted.transitions[0].child.childId, 'child-josie', 'child identity survives the restart');
    assert.equal(restarted.transitions[0].responsibility.counterpart.displayName, 'Alex', 'counterpart identity survives the restart');

    cloud.state.offline = false;
    await a2.syncRuntime.request('networkRestored');
    await a2.settle();
    assert.equal(cloud.table('events').length, 1, 'exactly one event — no duplicate from the restart');
    assert.equal(cloud.table('events')[0].title, 'Pickup Josie (edited offline)');
    assert.equal(cloud.table('household_people').length, 1);
    assert.equal(cloud.table('responsibilities').length, 1);
    assert.equal(a2.persisted().identity.sync.queue.length, 0);

    const b = await makeDevice({ cloud, accountCloud, seed: false });
    await bindAsNewDevice(b, accountCloud);
    await b.signIn();
    assert.equal(b.view().transitions[0].title, 'Pickup Josie (edited offline)');
    assert.equal(b.view().transitions[0].responsibility.stage, 'requested', 'no upgrade: a recorded request never arrives as accepted');
  });

  test('AS: a lost acknowledgement is retried without a duplicate — the create is idempotent', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT);
    const a = await makeDevice({ cloud, accountCloud });
    await a.signIn();
    cloud.state.loseNextAck = 1;
    await commitMutation(a.store, (s, c) => createHandoff(s, c, fields({ repeat: 'none' }), { kind: 'none' }), OK);
    await a.settle();
    await a.settle();
    assert.equal(cloud.table('events').length, 1, 'the server created it once; the retry found it, it did not create a second');
    assert.equal(a.persisted().identity.sync.queue.length, 0);
    assert.equal(needsSyncAttention(a.persisted().identity.sync), false, 'a lost ack is not a conflict');
  });

  test('AT: a permanent server refusal keeps her record, is not retried forever, and is surfaced — never silently dropped', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT);
    const a = await makeDevice({ cloud, accountCloud });
    await a.signIn();
    cloud.hooks.refuse = (table) => (table === 'events' ? { kind: 'failure', failure: 'validation', detail: 'refused by a content rule', code: '23514' } : null);
    await commitMutation(a.store, (s, c) => createHandoff(s, c, fields({ repeat: 'none' }), { kind: 'none' }), OK);
    await a.settle();
    await a.settle();
    assert.equal(cloud.table('events').length, 0);
    assert.equal(a.view().transitions.length, 1, 'her local record is untouched — the refusal is not a deletion');
    assert.equal(needsSyncAttention(a.persisted().identity.sync), true, 'the refusal is durable evidence she can be told about');
    const attempts = cloud.calls.filter((c) => c.op === 'create' && c.table === 'events').length;
    await a.settle();
    await a.settle();
    assert.equal(cloud.calls.filter((c) => c.op === 'create' && c.table === 'events').length, attempts, 'a permanent refusal is not hammered');
  });

  test('AU: a household above the queue and pull thresholds hydrates COMPLETELY on a second device', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT);
    const a = await makeDevice({ cloud, accountCloud });
    await a.signIn();
    // 30 handoffs + 430 preparation items in ONE canonical change set (> the 400-row seed ceiling and > 4 pull-fetch chunks).
    await a.store.commit((state, ctx) => {
      let next = state;
      for (let i = 0; i < 30; i += 1) {
        const r = createHandoff(next, ctx, fields({ title: `Handoff ${i}`, date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, repeat: 'none', location: '' }), { kind: 'none' });
        assert.equal(r.outcome, 'saved');
        next = r.state;
      }
      for (let i = 0; i < 430; i += 1) {
        const r = createPreparation(next, ctx, { childId: i % 2 ? 'child-milo' : 'child-josie', title: `Item ${i}`, dueDate: '', notes: '', linkEventId: null });
        assert.equal(r.outcome, 'saved');
        next = r.state;
      }
      return next;
    });
    for (let i = 0; i < 8; i += 1) await a.settle();
    assert.ok(460 > PULL_FETCH_CHUNK * 4);
    assert.equal(cloud.table('events').length, 30);
    assert.equal(cloud.table('tasks').length, 430);
    assert.equal(a.persisted().identity.sync.queue.length, 0);

    const b = await makeDevice({ cloud, accountCloud, seed: false });
    await bindAsNewDevice(b, accountCloud);
    await b.signIn();
    for (let i = 0; i < 6; i += 1) await b.settle();
    const sb = b.store.getSnapshot().state;
    assert.equal(sb.events.length, 30);
    assert.equal(sb.tasks.length, 430);
    const av = a.view();
    const bv = b.view();
    assert.equal(bv.transitions.length, av.transitions.length);
    assert.deepEqual(bv.preparation.map((g) => [g.child.childId, g.items.length]), av.preparation.map((g) => [g.child.childId, g.items.length]));
  });
});
