/**
 * HK-INTEGRATION-READINESS-01 — Feature 04 (Systems + Routines) against the repaired common foundation.
 *
 * F04's own commands (`newDraft` / `saveSystemDraft` / `assignResponsibility`) create a child, a child System, a household System,
 * ordered steps, a schedule and a handoff. The household then signs in and everything travels through the ONE production composition
 * (`composeAccountApp`: the store's observer, the sync runtime, the real coordinator) to an in-memory cloud, and a SECOND device
 * hydrates it. Nothing here hand-builds a coordinator or hand-calls `enqueue`, and F04 imports nothing that could.
 *
 * The cloud is the same in-memory model tests/hk-ir01/syncComposition.test.mjs uses (its helpers are copied here on purpose: that
 * file exports none), with the three database rules F04's data can meet added to it, so a wrong row is REFUSED the way the real
 * database would refuse it instead of being accepted by a permissive fake:
 *   - household_systems_child_scope_subject_check  (scope = 'child' requires a subject)
 *   - household_systems' subject must be a `child` household_members row (composite FK)
 *   - system_steps UNIQUE (system_id, position)    (the reorder trap F04's layoutPositions mitigation exists for, MP-04)
 * The real PostgreSQL proof of the same journeys is supabase/tests/journey-composition.mjs (owner-run; not touched here).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { createProviderRegistry, createScriptedProvider } from '../../src/domain/account/provider.ts';
import { createMemorySecureStorage, createSecureSessionStore } from '../../src/domain/account/secureSession.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { stepsInOrder } from '../../src/domain/structure.ts';
import { createChangeObserver } from '../../src/domain/sync/changeObserver.ts';
import { namespaceForNewDevice } from '../../src/domain/sync/claimSeam.ts';
import { CLOUD_TABLE } from '../../src/domain/sync/syncTypes.ts';
import { draftFromState, newDraft } from '../../src/features/systems/commands/draft.ts';
import { assignResponsibility } from '../../src/features/systems/commands/responsibility.ts';
import { projectSystemDetail } from '../../src/features/systems/model/detail.ts';
import { saveSystemDraft } from '../../src/features/systems/useCases/commit.ts';
import { STORAGE_KEYS, createAppStateRepository } from '../../src/persistence/appStateRepository.ts';
import { decodeStoredState } from '../../src/persistence/envelope.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { composeAccountApp } from '../../src/store/composeAccountApp.ts';
import { createFakeCloud } from '../support/fakeCloud.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const TZ = 'America/Chicago';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const TODAY = '2026-09-21';
const USER = { producer: 'user-action', artifactId: null, confidence: null };
const uuid = () => randomUUID();
const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';

const sessionFor = (accountId) => ({
  accountId,
  accessToken: `access-${accountId}`,
  refreshToken: `refresh-${accountId}`,
  expiresAt: NOW + 3_600_000,
  provider: { provider: 'apple', subject: `apple-${accountId}`, suggestedDisplayName: null },
});

/** A withheld One Move for today, so the claim closure stays trivial (the same device fixture syncComposition uses). */
const withheldMove = { id: `onemove-${TODAY}`, forDate: TODAY, targetId: null, targetType: 'task', status: 'withheld', decidedAt: '2026-09-21T14:00:00.000Z', completedAt: null, provenance: USER, scope: 'personal' };
const mia = { id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' };
const theo = { id: 'child-2', displayName: 'Theo', birthDate: '2019-01-15', scope: 'child' };

// ------------------------------------------------------------------ the cloud model (copied from syncComposition.test.mjs) ---

function accountCloudFor(cloud, accountId, { householdId = uuid() } = {}) {
  const ids = { householdId, memberId: uuid(), categories: null, claims: 0 };
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
          return answer(getState(), null);
        },
        async claimLocalHousehold({ payload }) {
          ids.claims += 1;
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
      return () => {
        timer.live = false;
      };
    },
    flush() {
      const due = timers.splice(0).filter((t) => t.live);
      for (const t of due) t.work();
    },
  };
}

/** One installation: its own storage, store, observer, account runtime and sync runtime. Shares only the cloud. */
async function makeDevice({ cloud, accountId, accountCloud }) {
  const storage = createMemoryStorage({});
  const secure = createMemorySecureStorage({});
  const clock = makeClock();
  const observer = createChangeObserver({ now: () => NOW });
  const repository = createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: false });
  const store = createAppStore({ repository, mode: 'empty', now: () => NOW, timeZone: () => TZ, observe: observer.observe });
  await store.hydrate();
  await store.flush();

  const events = [];
  const app = composeAccountApp({
    store,
    observer,
    account: {
      sessions: createSecureSessionStore(secure),
      providers: createProviderRegistry([createScriptedProvider('apple', { results: Array.from({ length: 12 }, () => ({ kind: 'success', session: sessionFor(accountId) })) })]),
      cloud: accountCloud.bind(() => store.getSnapshot().state),
      timezone: () => TZ,
      now: () => NOW,
      newClaimKey: () => uuid(),
      deviceId: uuid(),
    },
    sync: { transport: cloud.transport, newDeviceId: uuid, schedule: clock.schedule, debounceMs: 0, report: (e) => events.push(e) },
  });
  const device = { storage, store, clock, events, ...app, accountId };
  device.persisted = () => {
    const raw = storage.contents()[STORAGE_KEYS.primary];
    return raw === undefined ? null : decodeStoredState(raw);
  };
  device.state = () => store.getSnapshot().state;
  device.signIn = async () => {
    const state = await app.accountRuntime.signIn('apple');
    await app.syncRuntime.idle();
    return state;
  };
  device.settle = async () => {
    clock.flush();
    await app.syncRuntime.idle();
  };
  device.pull = async () => {
    await app.syncRuntime.request('manual');
    await device.settle();
  };
  return device;
}

/** A fresh install of an account that already has a household in the cloud, bound the way adoption of an existing household will leave it. */
async function bindAsNewDevice(device, accountCloud) {
  device.store.setIdentity({
    binding: { accountId: device.accountId, householdId: accountCloud.ids.householdId, boundAt: '2026-09-21T15:00:00.000Z', kind: 'claim', idMap: {} },
    receipt: null,
    quarantine: null,
    sync: namespaceForNewDevice({ accountId: device.accountId, householdId: accountCloud.ids.householdId, deviceId: uuid() }),
  });
  await device.store.saveIdentity();
}

/** The database rules F04's rows can meet. A refused row is answered the way the real database would refuse it. */
function enforceCloudRules(cloud) {
  const { create, update } = cloud.transport;
  const refuse = (failure, code, detail) => ({ kind: 'failure', failure, code, detail });
  const violation = (table, merged, selfId) => {
    if (table === CLOUD_TABLE.system) {
      const subject = merged.subject_member_id ?? null;
      if (merged.scope === 'child' && subject === null) return refuse('validation', '23514', 'violates check constraint "household_systems_child_scope_subject_check"');
      if (subject !== null && !cloud.table('household_members').some((m) => m.id === subject && m.member_type === 'child')) return refuse('validation', '23503', 'violates foreign key: subject is not a child of this household');
    }
    if (table === CLOUD_TABLE.systemStep && cloud.table(table).some((r) => r.id !== selfId && r.system_id === merged.system_id && r.position === merged.position)) {
      return refuse('domainConflict', '23505', 'duplicate key value violates unique constraint "system_steps_system_position_key"');
    }
    return null;
  };
  cloud.transport.create = async (table, deviceId, row) => violation(table, row, null) ?? create(table, deviceId, row);
  cloud.transport.update = async (table, cloudId, baseRevision, patch, column) => {
    const existing = cloud.table(table).find((r) => String(r[column ?? 'id']) === cloudId);
    return (existing ? violation(table, { ...existing, ...patch }, existing.id) : null) ?? update(table, cloudId, baseRevision, patch, column);
  };
  return cloud;
}

// ------------------------------------------------------------------ Feature 04's own commands ---

const kidsArea = (state) => state.categories.find((c) => c.systemRole === 'kids').id;

/** Create a System through F04's real save (the same call the editor makes), and insist it saved. */
async function createSystem(device, { systemId, name, subject = null, steps = [], schedule = null }) {
  const state = device.state();
  const { draft, base } = newDraft(state, systemId, kidsArea(state));
  draft.name = name;
  draft.subjectMemberId = subject;
  draft.steps = steps.map((title, i) => ({ key: `k${i}`, id: null, title, effortMinutes: i === 0 ? 5 : null }));
  if (schedule !== null) {
    draft.scheduleMode = 'calendar';
    draft.schedule = schedule;
  }
  const result = await saveSystemDraft(device.store, draft, base);
  assert.equal(result.kind, 'saved', `${name}: ${JSON.stringify(result)}`);
}

/** Open the editor on an existing System, change the draft, save. Returns the save outcome. */
async function editSystem(device, systemId, change) {
  const { draft, base } = draftFromState(device.state(), systemId, (i) => `e${i}`);
  change(draft);
  return saveSystemDraft(device.store, draft, base);
}

const WEEKLY = { frequency: 'weekly', interval: 1, byWeekday: [1, 3], byMonthDay: null, timeOfDayMinutes: 1140 };
const byName = (state, name) => state.systems.find((s) => s.name === name);
const childNamed = (state, id) => state.children.find((c) => c.id === id)?.displayName ?? null;

/** Everything a person could read about a System, with children and areas by NAME so two devices' local ids never matter. */
function readSystem(state, name) {
  const system = byName(state, name);
  const rule = state.recurrences.find((r) => r.about.kind === 'system' && r.about.id === system.id) ?? null;
  const handoff = state.responsibilities.find((r) => r.about.kind === 'system' && r.about.id === system.id) ?? null;
  return {
    name: system.name,
    description: system.description,
    scope: system.scope,
    area: state.categories.find((c) => c.id === system.categoryId)?.name,
    subject: system.subjectMemberId === null ? null : childNamed(state, system.subjectMemberId),
    steps: stepsInOrder(state, system.id).map((s) => [s.title, s.effortMinutes, s.position]),
    schedule: rule === null ? null : [rule.frequency, rule.interval, rule.byWeekday, rule.timeOfDayMinutes, rule.anchorDate, rule.status],
    handoff: handoff === null ? null : [handoff.responsibleKind, childNamed(state, handoff.responsibleChildId), handoff.state, handoff.stillNeedsMe],
  };
}

/** Device A holds a child, a child System with steps + a schedule + a handoff, and a household System; A signs in; B hydrates. */
async function twoDevices() {
  const cloud = enforceCloudRules(createFakeCloud());
  const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
  const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
  await a.store.commit((s) => ({ ...s, oneMoves: [withheldMove], children: [mia, theo] }));
  await createSystem(a, { systemId: 'sys-kid', name: 'Mia bedtime', subject: mia.id, steps: ['Pyjamas', 'Teeth', 'Story'], schedule: WEEKLY });
  await createSystem(a, { systemId: 'sys-house', name: 'Sunday reset', steps: ['Wipe counters', 'Take out bins'] });
  // who it is ABOUT (Mia) and who is ASKED (Theo) are different facts, and both must survive the trip
  await a.store.commit((s, ctx) => assignResponsibility(s, ctx, 'sys-kid', { kind: 'child', id: theo.id }));
  await a.store.flush();
  const bound = await a.signIn();
  assert.equal(bound.kind, 'accountBound');

  const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
  await bindAsNewDevice(b, accountCloud);
  assert.equal((await b.signIn()).kind, 'accountBound');
  return { cloud, accountCloud, a, b };
}

const cloudSystem = (cloud, localId) => cloud.table(CLOUD_TABLE.system).find((r) => r.local_id === localId);

const noConflicts = (device) => {
  const sync = device.persisted().identity.sync;
  assert.deepEqual(sync.queue, [], 'the queue drained');
  assert.deepEqual(sync.evidence.filter((e) => /conflict|refused|validation/.test(e.evidence)), [], 'and no push was refused by a database rule');
};

// ------------------------------------------------------------------ tests ---

describe('F04 Systems and steps reach a second device through the central composition (HA-001 + HA-011)', () => {
  test('a child System, a household System, ordered steps, a schedule and a handoff created by F04 arrive on device B intact, subject identity included', async () => {
    const { cloud, a, b } = await twoDevices();
    const stateA = a.state();
    const stateB = b.state();

    // ---- what reached the cloud
    const rows = cloud.table(CLOUD_TABLE.system);
    assert.equal(rows.length, 2);
    const kidRow = rows.find((r) => r.local_id === 'sys-kid');
    const houseRow = rows.find((r) => r.local_id === 'sys-house');
    const miaCloud = cloud.table('household_members').find((m) => m.local_id === mia.id);
    assert.deepEqual([kidRow.scope, kidRow.subject_member_id], ['child', miaCloud.id], 'the child System reached the cloud WITH the child (the database refuses child scope without one)');
    assert.deepEqual([houseRow.scope, houseRow.subject_member_id ?? null], ['household', null], 'the household System carries no subject');
    assert.equal(cloud.table(CLOUD_TABLE.systemStep).length, 5);
    noConflicts(a);

    // ---- what device B hydrated: the same Systems, read by name and by child NAME
    assert.deepEqual(stateB.children.map((c) => c.displayName).sort(), ['Mia', 'Theo'], 'the second device learned the children');
    for (const name of ['Mia bedtime', 'Sunday reset']) assert.deepEqual(readSystem(stateB, name), readSystem(stateA, name), name);
    const kid = readSystem(stateB, 'Mia bedtime');
    assert.equal(kid.scope, 'child');
    assert.equal(kid.subject, 'Mia');
    assert.deepEqual(kid.steps.map(([title]) => title), ['Pyjamas', 'Teeth', 'Story'], 'step order survived');
    assert.deepEqual(kid.handoff, ['child', 'Theo', 'requested', true], 'ABOUT Mia, asked of Theo: two children, never collapsed');
    assert.equal(readSystem(stateB, 'Sunday reset').subject, null);

    // ---- the subject is an id that resolves on B, and F04's own detail view says who it is for there
    const system = byName(stateB, 'Mia bedtime');
    assert.equal(stateB.children.find((c) => c.id === system.subjectMemberId).displayName, 'Mia');
    const view = projectSystemDetail(stateB, system.id, { nowMs: NOW, today: TODAY });
    assert.deepEqual(view.subject, { kind: 'child', id: system.subjectMemberId, name: 'Mia' });
    assert.deepEqual(projectSystemDetail(stateB, byName(stateB, 'Sunday reset').id, { nowMs: NOW, today: TODAY }).subject, { kind: 'none' });
    assert.equal(validateAppState(stateB).ok, true);
    assert.deepEqual(b.persisted().identity.sync.queue, [], 'pulled state produced no outbound work');
  });

  test('after binding, F04 edits travel with no feature involvement: a new child System, a reorder, a correction of the child, then clearing it', async () => {
    const { cloud, a, b } = await twoDevices();

    // (1) a System created AFTER binding, with steps, in one commit: the observer must order the System before its steps
    await createSystem(a, { systemId: 'sys-post', name: 'Theo homework', subject: theo.id, steps: ['Open planner', 'Start timer'] });
    assert.ok(a.persisted().identity.sync.queue.length >= 3, 'the intent is durable with the change itself');
    await a.settle();
    noConflicts(a);
    assert.equal(cloud.table(CLOUD_TABLE.system).length, 3);
    assert.equal(cloud.table(CLOUD_TABLE.systemStep).length, 7);
    await b.pull();
    assert.deepEqual(readSystem(b.state(), 'Theo homework'), readSystem(a.state(), 'Theo homework'));
    assert.equal(readSystem(b.state(), 'Theo homework').subject, 'Theo');

    // (2) REORDER: the cloud holds UNIQUE (system_id, position); F04's layout moves the fewest rows onto slots nobody holds
    const order = () => stepsInOrder(a.state(), 'sys-kid').map((s) => s.title);
    assert.deepEqual(order(), ['Pyjamas', 'Teeth', 'Story']);
    const reordered = await editSystem(a, 'sys-kid', (d) => d.steps.unshift(d.steps.pop()));
    assert.equal(reordered.kind, 'saved');
    assert.deepEqual(order(), ['Story', 'Pyjamas', 'Teeth']);
    assert.ok(a.persisted().identity.sync.queue.length >= 1, 'a reorder queues a sane amount of work');
    await a.settle();
    noConflicts(a);
    const cloudOrder = cloud
      .table(CLOUD_TABLE.systemStep)
      .filter((r) => r.system_id === cloudSystem(cloud, 'sys-kid').id)
      .sort((x, y) => x.position - y.position)
      .map((r) => r.title);
    assert.deepEqual(cloudOrder, ['Story', 'Pyjamas', 'Teeth'], 'the cloud reads in the order the device shows');
    await b.pull();
    assert.deepEqual(readSystem(b.state(), 'Mia bedtime').steps.map(([title]) => title), ['Story', 'Pyjamas', 'Teeth'], 'and so does the second device');

    // (3) CORRECT THE CHILD: Mia -> Theo. One row, one update carrying scope and subject together.
    assert.equal((await editSystem(a, 'sys-kid', (d) => (d.subjectMemberId = theo.id))).kind, 'saved');
    await a.settle();
    noConflicts(a);
    const theoCloud = cloud.table('household_members').find((m) => m.local_id === theo.id);
    assert.deepEqual([cloudSystem(cloud, 'sys-kid').scope, cloudSystem(cloud, 'sys-kid').subject_member_id], ['child', theoCloud.id]);
    await b.pull();
    assert.equal(readSystem(b.state(), 'Mia bedtime').subject, 'Theo', 'device B follows the correction (the System keeps its name; the child it is about changed)');
    assert.equal(readSystem(b.state(), 'Mia bedtime').handoff[1], 'Theo', 'the handoff is a separate fact and did not move');

    // (4) CLEAR IT: back to a household routine. Scope and subject leave TOGETHER, or the database would refuse the row.
    assert.equal((await editSystem(a, 'sys-kid', (d) => (d.subjectMemberId = null))).kind, 'saved');
    await a.settle();
    noConflicts(a);
    assert.deepEqual([cloudSystem(cloud, 'sys-kid').scope, cloudSystem(cloud, 'sys-kid').subject_member_id ?? null], ['household', null]);
    await b.pull();
    const cleared = byName(b.state(), 'Mia bedtime');
    assert.deepEqual([cleared.scope, cleared.subjectMemberId], ['household', null]);
    assert.deepEqual(projectSystemDetail(b.state(), cleared.id, { nowMs: NOW, today: TODAY }).subject, { kind: 'none' });
    assert.equal(validateAppState(b.state()).ok, true);
    assert.deepEqual(b.persisted().identity.sync.queue, [], 'pulled state produced no outbound work on B either');
  });

  test('a save F04 REFUSES (an unknown, adult or delegate subject) queues nothing and reaches no cloud table', async () => {
    const { cloud, a } = await twoDevices();
    const queued = a.persisted().identity.sync.queue.length;
    const rowsBefore = cloud.rows.size;
    for (const subject of ['child-nope', a.state().user.id, 'Mia']) {
      const outcome = await editSystem(a, 'sys-house', (d) => (d.subjectMemberId = subject));
      assert.deepEqual(outcome, { kind: 'invalid', issues: [{ code: 'subject_unavailable', field: 'subject' }] }, String(subject));
    }
    await a.settle();
    assert.equal(a.persisted().identity.sync.queue.length, queued, 'a refused save produced no queue intent');
    assert.equal(cloud.rows.size, rowsBefore);
    assert.equal(byName(a.state(), 'Sunday reset').subjectMemberId, null);
  });

  test('STALE EDITOR ACROSS DEVICES: an editor open on B when A changes the child is refused after the pull, and the newer child stands', async () => {
    const { a, b } = await twoDevices();
    const open = draftFromState(b.state(), byName(b.state(), 'Mia bedtime').id, (i) => `e${i}`); // B's screen opens on Mia
    assert.equal((await editSystem(a, 'sys-kid', (d) => (d.subjectMemberId = theo.id))).kind, 'saved');
    await a.settle();
    await b.pull(); // the change lands on B underneath its open editor
    assert.equal(readSystem(b.state(), 'Mia bedtime').subject, 'Theo');

    open.draft.name = 'Edited on the screen that was opened before the pull';
    const before = b.state();
    assert.deepEqual(await saveSystemDraft(b.store, open.draft, open.base), { kind: 'stale' });
    assert.equal(b.state(), before, 'nothing was written');
    assert.equal(readSystem(b.state(), 'Mia bedtime').subject, 'Theo', 'the pulled subject was not put back');
    assert.deepEqual(b.persisted().identity.sync.queue, [], 'and nothing was queued to undo it');
  });
});

describe('F04 imports no sync mechanism (HA-001: features never own or drive synchronization)', () => {
  const walk = (dir) => (statSync(dir, { throwIfNoEntry: false }) ? readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])) : []);
  const files = [...walk(join(ROOT, 'src', 'features', 'systems')), ...walk(join(ROOT, 'app', '(app)', 'systems'))].filter((f) => /\.(ts|tsx)$/.test(f));
  const code = (file) => readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const rel = (file) => relative(ROOT, file).replace(/\\/g, '/');

  test('nothing under src/features/systems or app/(app)/systems imports the sync domain, the transport, persistence, or Supabase', () => {
    const offenders = files.filter((f) => /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*(?:domain\/sync|platform\/supabase|persistence\/|supabase)/.test(readFileSync(f, 'utf8'))).map(rel);
    assert.ok(files.length > 15, 'the scan really covered the feature');
    assert.deepEqual(offenders, []);
  });

  test('and no code there names a queue, a coordinator, an observer, a runtime, a projection or a transport call', () => {
    const mechanism = /\b(enqueue|dequeue|createSyncCoordinator|createChangeObserver|composeAccountApp|syncRuntime|pushPending|pullOnce|changeBridge|claimSeam|createSupabaseSyncTransport|toCloudRow|applyCloudRow|namespaceFromClaim)\b/;
    assert.deepEqual(files.filter((f) => mechanism.test(code(f))).map(rel), []);
  });
});
