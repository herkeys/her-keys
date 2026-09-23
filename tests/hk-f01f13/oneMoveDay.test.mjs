/**
 * HK13-D28 — a One Move decided on one day and synced on the next.
 *
 * The server owns the logical day (HR-03, the shipping migration's set_one_move_logical_day): on the live path it stamps a new One
 * Move with TODAY in the account's timezone and ignores what the device knows; "historical days can only ever enter through claim".
 * It also keeps one move per (household, profile, day). The fake cloud here is given exactly those two rules (hooks), so the device
 * is proven against the server's real behaviour — which the shared fake cloud never modelled.
 *
 * The case: she opens Her Keys while offline, is given her One Move and does it; the device reaches the cloud only the next morning,
 * when it has already decided that day's move. What she did yesterday must stay yesterday's, and today's move must be today's.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { createProviderRegistry, createScriptedProvider } from '../../src/domain/account/provider.ts';
import { createMemorySecureStorage, createSecureSessionStore } from '../../src/domain/account/secureSession.ts';
import { logicalDateAt, toInstant } from '../../src/domain/logicalDay.ts';
import { completeOneMove, oneMoveForDay } from '../../src/domain/oneMove.ts';
import { unsyncedRows } from '../../src/domain/sync/changeBridge.ts';
import { createChangeObserver } from '../../src/domain/sync/changeObserver.ts';
import { namespaceForNewDevice } from '../../src/domain/sync/claimSeam.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { createAppStateRepository } from '../../src/persistence/appStateRepository.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { composeAccountApp } from '../../src/store/composeAccountApp.ts';
import { createFakeCloud } from '../support/fakeCloud.mjs';
import { ACCOUNT_A, TZ, accountCloudFor } from '../meals/support/twoDevice.mjs';

const MONDAY = '2026-09-21';
const TUESDAY = '2026-09-22';
const MONDAY_AFTERNOON = Date.UTC(2026, 8, 21, 20, 0); // 15:00 in Chicago
const TUESDAY_MORNING = Date.UTC(2026, 8, 22, 14, 0); // 09:00 in Chicago

/** The two server rules the shared fake cloud lacks: HR-03's server-stamped day, and one move per (household, profile, day). */
function withServerDayRules(cloud, server) {
  cloud.hooks.duringCreate = (table, row) => {
    if (table !== 'one_move_records') return;
    row.logical_day = logicalDateAt(server.ms, TZ);
    row.timezone_at_decision = TZ;
  };
  cloud.hooks.refuse = (table, row) => {
    if (table !== 'one_move_records') return null;
    const held = cloud.table('one_move_records');
    if (held.some((r) => r.household_id === row.household_id && r.local_id === row.local_id)) return null; // a replay: identity answers it
    return held.some((r) => r.household_id === row.household_id && r.profile_id === row.profile_id && r.logical_day === row.logical_day)
      ? { kind: 'failure', failure: 'domainConflict', code: '23505',
          detail: 'duplicate key value violates unique constraint "one_move_records_household_profile_logical_day_key"' }
      : null;
  };
}

async function deviceWithClock({ cloud, accountCloud, clock }) {
  const timers = [];
  const schedule = (work) => { const t = { work, live: true }; timers.push(t); return () => { t.live = false; }; };
  const storage = createMemoryStorage({});
  const observer = createChangeObserver({ now: () => clock.ms });
  const repository = createAppStateRepository({ storage, appVersion: 'test', now: () => clock.ms, quarantineCorruptState: false });
  const store = createAppStore({ repository, mode: 'empty', now: () => clock.ms, timeZone: () => TZ, observe: observer.observe });
  await store.hydrate();
  await store.flush();
  const session = { accountId: ACCOUNT_A, accessToken: 'access', refreshToken: 'refresh', expiresAt: clock.ms + 86_400_000 * 3,
    provider: { provider: 'apple', subject: 'apple-a', suggestedDisplayName: null } };
  const app = composeAccountApp({
    store,
    observer,
    account: {
      sessions: createSecureSessionStore(createMemorySecureStorage({})),
      providers: createProviderRegistry([createScriptedProvider('apple', { results: Array.from({ length: 6 }, () => ({ kind: 'success', session })) })]),
      cloud: accountCloud.bind(() => store.getSnapshot().state),
      timezone: () => TZ,
      now: () => clock.ms,
      newClaimKey: () => randomUUID(),
      deviceId: randomUUID(),
    },
    sync: { transport: cloud.transport, newDeviceId: randomUUID, schedule, debounceMs: 0, report: () => {} },
  });
  const settle = async () => {
    for (const t of timers.splice(0).filter((x) => x.live)) t.work();
    await app.syncRuntime.idle();
  };
  return { store, app, settle };
}

const act = (device, transition) => device.store.commit(transition);

test('HK13-D28: a One Move decided offline stays on its own day when it reaches the cloud the next morning', async () => {
  const cloud = createFakeCloud();
  const server = { ms: MONDAY_AFTERNOON };
  withServerDayRules(cloud, server);
  const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
  const clock = { ms: MONDAY_AFTERNOON };
  const device = await deviceWithClock({ cloud, accountCloud, clock });

  const bound = await device.app.accountRuntime.signIn('apple');
  assert.equal(bound.kind, 'accountBound');
  await device.app.syncRuntime.idle();

  // Monday, offline: she finishes onboarding and plans one thing for Monday and one for Tuesday; Her Keys gives her Monday's One Move and she does it.
  cloud.state.offline = true;
  assert.ok(await act(device, (s, ctx) => {
    const home = s.categories.find((c) => c.systemRole === 'home').id;
    const onboarded = { ...s, onboarding: { ...s.onboarding, completedAt: toInstant(ctx.nowMs) } };
    const first = addTask(onboarded, ctx, { title: 'Call the plumber', categoryId: home, durationMinutes: 10, durationSource: 'user', scope: 'household', plan: { kind: 'day', date: MONDAY } });
    return addTask(first, ctx, { title: 'Return the library books', categoryId: home, durationMinutes: 10, durationSource: 'user', scope: 'household', plan: { kind: 'day', date: TUESDAY } });
  }));
  const monday = device.store.getSnapshot().state.oneMoves.find((m) => m.forDate === MONDAY);
  assert.ok(monday && monday.status === 'selected', 'Monday has its One Move');
  const mondayTarget = monday.targetId;
  assert.ok(await act(device, (s, ctx) => completeOneMove(s, ctx)));
  await device.settle();

  // Tuesday morning: the device decides Tuesday's move, then reaches the cloud for the first time since Monday.
  clock.ms = TUESDAY_MORNING;
  server.ms = TUESDAY_MORNING;
  device.store.refreshDay();
  const tuesdayLocal = device.store.getSnapshot().state.oneMoves.find((m) => m.forDate === TUESDAY);
  assert.ok(tuesdayLocal && tuesdayLocal.status === 'selected' && tuesdayLocal.targetId !== mondayTarget, 'Tuesday has its own One Move, a different task');
  cloud.state.offline = false;
  await device.app.syncRuntime.request('manual');
  await device.settle();
  await device.app.syncRuntime.request('manual');
  await device.settle();

  // What the cloud (so every other device) now holds for Tuesday must be TUESDAY's decision, never Monday's re-dated.
  const tuesdayInCloud = cloud.table('one_move_records').filter((r) => r.logical_day === TUESDAY);
  assert.equal(tuesdayInCloud.length, 1, 'the cloud holds one move for Tuesday');
  assert.equal(tuesdayInCloud[0].local_id, tuesdayLocal.id, 'and it is Tuesday\'s decision, not Monday\'s completed move re-dated to Tuesday');
  assert.equal(tuesdayInCloud[0].status, 'selected');

  // And on this device, Today on Tuesday offers Tuesday's move; Monday's stays Monday's.
  const state = device.store.getSnapshot().state;
  const today = oneMoveForDay(state, TUESDAY);
  assert.equal(today.status, 'selected', 'Today on Tuesday is not "already done" because of what she did on Monday');
  assert.equal(today.move?.id, tuesdayLocal.targetId);
  const mondayAfter = state.oneMoves.find((m) => m.id === monday.id);
  assert.equal(mondayAfter?.forDate, MONDAY, 'Monday\'s move is still Monday\'s on this device');
  assert.equal(mondayAfter?.status, 'completed');

  // Monday's move is history kept on this device (HR-03: a past day enters the cloud only through claim). The task she did still
  // reached the cloud as done; nothing about Monday's move — nor any fact pointing at it — is sent, and none of it is a sync problem.
  assert.equal(cloud.table('one_move_records').some((r) => r.local_id === monday.id), false, 'Monday\'s move never reached the cloud under another day');
  assert.equal(cloud.table('tasks').find((r) => r.local_id === mondayTarget)?.status, 'completed', 'the task she did on Monday is done everywhere');
  const identity = device.store.getSnapshot().identity;
  assert.deepEqual(identity.sync.evidence.filter((e) => !e.resolved).map((e) => `${e.evidence} ${e.kind} ${e.localId}`), [],
    'an ordinary offline day leaves nothing that "needs your attention" — no conflict, no unresolvable dependency');
  assert.deepEqual(identity.sync.queue, [], 'and nothing is left waiting forever');
  const sync = device.app.syncRuntime.snapshot();
  assert.deepEqual({ phase: sync.phase, queued: sync.queued, needsAttention: sync.needsAttention }, { phase: 'idle', queued: 0, needsAttention: false },
    'the sync status says everything reached the cloud — not "offline", not "needs your attention"');
  const cloudIds = new Set(cloud.table('one_move_records').map((r) => r.id));
  for (const row of [...cloud.table('behavior_observations'), ...cloud.table('evidence_links')]) {
    const move = row.about_one_move_id ?? row.for_one_move_id ?? null;
    assert.ok(move === null || cloudIds.has(move), 'every fact the cloud holds about a One Move points at a move it holds');
  }
});

test('HK13-D28: the queue top-up owes the cloud today\'s move, never an earlier day\'s unsent move or a fact about one', () => {
  const USER = { producer: 'user-action', artifactId: null, confidence: null };
  const move = (id, forDate) => ({ id, forDate, targetId: null, targetType: 'task', status: 'withheld', decidedAt: '2026-09-21T14:00:00.000Z', completedAt: null, provenance: USER, scope: 'personal' });
  const fact = (id, moveId) => ({ id, about: { kind: 'oneMove', id: moveId } });
  const state = {
    ...createEmptyState(TZ),
    oneMoves: [move('om-mon', MONDAY), move('om-tue', TUESDAY), move('om-sun', '2026-09-20')],
    observations: [fact('obs-mon', 'om-mon'), fact('obs-tue', 'om-tue'), fact('obs-sun', 'om-sun')],
    evidenceLinks: [{ id: 'ev-mon', for: { kind: 'oneMove', id: 'om-mon' } }, { id: 'ev-tue', for: { kind: 'oneMove', id: 'om-tue' } }],
  };
  // Sunday's move reached the cloud on Sunday; its observation did not yet. Monday's never did.
  const namespace = { ...namespaceForNewDevice({ accountId: ACCOUNT_A, householdId: randomUUID(), deviceId: randomUUID() }),
    mappings: { 'oneMove:om-sun': { kind: 'oneMove', localId: 'om-sun', cloudId: randomUUID(), revision: 1 } } };
  const owed = (today) => unsyncedRows(state, namespace, 100, today).filter((row) => ['oneMove', 'observation', 'evidenceLink'].includes(row.kind))
    .map((row) => row.localId).sort();

  assert.deepEqual(owed(TUESDAY), ['ev-tue', 'obs-sun', 'obs-tue', 'om-tue'],
    'Tuesday: today\'s move and its facts are owed; a fact about a move the cloud holds is owed; Monday\'s unsent move and its facts are not');
  assert.deepEqual(owed(MONDAY), ['ev-mon', 'obs-mon', 'obs-sun', 'om-mon'],
    'on Monday, Monday\'s move is today\'s and owed (a move for any other day — here Tuesday\'s, which a real device cannot hold yet — is not)');
  assert.deepEqual(unsyncedRows(state, namespace, 100).filter((row) => row.kind === 'oneMove').map((row) => row.localId).sort(), ['om-mon', 'om-tue'],
    'without a day nothing is kept back (the rule needs a clock)');
});

test('HK13-D28: a move the cloud already holds still sends a late edit after midnight — its day is fixed and never moves', async () => {
  const cloud = createFakeCloud();
  const server = { ms: MONDAY_AFTERNOON };
  withServerDayRules(cloud, server);
  const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
  const clock = { ms: MONDAY_AFTERNOON };
  const device = await deviceWithClock({ cloud, accountCloud, clock });
  assert.equal((await device.app.accountRuntime.signIn('apple')).kind, 'accountBound');
  await device.app.syncRuntime.idle();

  // Monday, online: Monday's move reaches the cloud as Monday's.
  assert.ok(await act(device, (s, ctx) => {
    const home = s.categories.find((c) => c.systemRole === 'home').id;
    const onboarded = { ...s, onboarding: { ...s.onboarding, completedAt: toInstant(ctx.nowMs) } };
    return addTask(onboarded, ctx, { title: 'Call the plumber', categoryId: home, durationMinutes: 10, durationSource: 'user', scope: 'household', plan: { kind: 'day', date: MONDAY } });
  }));
  await device.app.syncRuntime.request('manual');
  await device.settle();
  const monday = device.store.getSnapshot().state.oneMoves.find((m) => m.forDate === MONDAY);
  assert.equal(cloud.table('one_move_records').find((r) => r.local_id === monday.id)?.logical_day, MONDAY);

  // Late Monday, offline, she does it; the device reaches the cloud after midnight.
  cloud.state.offline = true;
  clock.ms = Date.UTC(2026, 8, 22, 4, 50); // 23:50 Monday in Chicago
  assert.ok(await act(device, (s, ctx) => completeOneMove(s, ctx)));
  await device.settle();
  clock.ms = TUESDAY_MORNING;
  server.ms = TUESDAY_MORNING;
  cloud.state.offline = false;
  await device.app.syncRuntime.request('manual');
  await device.settle();

  const inCloud = cloud.table('one_move_records').find((r) => r.local_id === monday.id);
  assert.equal(inCloud.status, 'completed', 'the completion reached the cloud');
  assert.equal(inCloud.logical_day, MONDAY, 'on the day it was always for');
  assert.deepEqual(device.store.getSnapshot().identity.sync.evidence.filter((e) => !e.resolved), []);
});
