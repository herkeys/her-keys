/**
 * HK-F01-F13 integration, Phase 10 — ACCOUNT / HOUSEHOLD ISOLATION, with every Wave 3/4 feature's private data on one device at once.
 *
 * Account A holds, some already in the cloud and some still pending: a private RebuildFocus and its next step, a private LifeRecord
 * (with a reference number) and its renewal Task, a private PersonContext and its follow-up Task, a CareerOpportunity, and Money
 * (an obligation with a payment mechanism). A signs out; B signs in on the SAME device; then A comes back.
 *
 * Proven: none of A's rows is visible or renderable to B; no cached projection of A's household is reachable by B; not one request is
 * made on B's behalf, so nothing of A's is uploaded as B and none of A's change pointers is consumed as B; nothing of B's lands on the
 * device, so B cannot overwrite A; and when A returns, her whole household — the pending rows too — reconstructs and syncs as HERS.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addLifeRecord, addLifeRecordTask } from '../../src/domain/lifeRecords.ts';
import { addOpportunity, updateOpportunity } from '../../src/domain/opportunities.ts';
import { addExternalPerson, addFollowUp, contextFor, openPersonContext } from '../../src/domain/people.ts';
import { addRebuildFocus, linkToFocus } from '../../src/domain/rebuild/commands.ts';
import { canOpenScreen } from '../../src/domain/routeAccess.ts';
import { unresolvedEvidence } from '../../src/domain/sync/syncTypes.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { createObligation } from '../../src/features/money/mutations.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { ACCOUNT_A, ACCOUNT_B, accountCloudFor, act, createFakeCloud, makeDevice, uuid, withheldMove } from '../meals/support/twoDevice.mjs';

const SECRET = 'A-PRIVATE-7731';
const TABLES = ['tasks', 'career_opportunities', 'rebuild_focuses', 'rebuild_focus_links', 'life_records', 'life_record_task_links',
  'person_contexts', 'person_task_links', 'household_people'];
const COLLECTIONS = ['tasks', 'careerOpportunities', 'rebuildFocuses', 'rebuildFocusLinks', 'lifeRecords', 'lifeRecordLinks',
  'personContexts', 'personTaskLinks', 'people'];

async function must(device, transition) {
  const { ok, result } = await act(device, transition);
  assert.ok(ok);
  for (const key of ['refusal', 'outcome']) {
    if (result && typeof result === 'object' && key in result) assert.ok(result[key] === null || result[key] === 'saved', `refused: ${result[key]}`);
  }
  return result;
}

const counts = (state) => Object.fromEntries(COLLECTIONS.map((c) => [c, state[c].length]));

/**
 * The real `sync_pull` answers for ONE household (its `p_household_id`) and RLS hides every other household's rows; the shared fake
 * cloud's pull does neither — it hands every entry in its log to whoever asks. Only account A's devices ever sync in this test, so
 * the pull and the row fetch are narrowed to A's household exactly as the server narrows them (onboarding is keyed by profile).
 */
function asTheServerScopesPulls(cloud, householdId, profileId) {
  const { pull, fetchRows } = cloud.transport;
  const mine = (row) => row !== undefined && (row.household_id === householdId || row.profile_id === profileId);
  cloud.transport.pull = async (cursor) => {
    const answer = await pull(cursor);
    if (answer.kind !== 'pulled') return answer;
    return { ...answer, rows: answer.rows.filter((entry) => mine(cloud.rows.get(`${entry.entityTable}:${entry.entityId}`))) };
  };
  cloud.transport.fetchRows = async (table, ids, column) => {
    const answer = await fetchRows(table, ids, column);
    return answer.kind === 'rows' ? { ...answer, rows: answer.rows.filter(mine) } : answer;
  };
}
const routeAccess = (device, account) => {
  const snapshot = device.store.getSnapshot();
  return { status: snapshot.status, onboarding: snapshot.state.onboarding, internalTools: false, account };
};

test('[P10] A -> B -> A on one device, with every Wave 3/4 feature\'s private rows: B sees, sends and overwrites nothing; A comes back whole', async () => {
  const cloud = createFakeCloud();
  const cloudA = accountCloudFor(cloud, ACCOUNT_A);
  const cloudB = accountCloudFor(cloud, ACCOUNT_B);
  const storage = createMemoryStorage({});
  asTheServerScopesPulls(cloud, cloudA.ids.householdId, ACCOUNT_A);

  // A, online: an opportunity, a Focus with a private next step, a record with its renewal Task, a person with a context and a
  // follow-up, and a bill — all in the cloud.
  const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud: cloudA, storage });
  await a.store.commit((s) => ({ ...s, oneMoves: [withheldMove] }));
  assert.equal((await a.signIn()).kind, 'accountBound');
  await must(a, (s, ctx) => addOpportunity(s, ctx, { title: `Program manager ${SECRET}`, opportunityType: 'job' }));
  await must(a, (s, ctx) => addRebuildFocus(s, ctx, { id: 'focus-a', title: `Sleep ${SECRET}` }));
  await must(a, (s, ctx) => addTask(s, ctx, { title: `Private next step ${SECRET}`, categoryId: 'cat-wellbeing', scope: 'personal' }));
  const nextStep = a.store.getSnapshot().state.tasks.at(-1).id;
  await must(a, (s, ctx) => linkToFocus(s, ctx, { id: 'focuslink-a', focusId: 'focus-a', target: { kind: 'task', id: nextStep }, relation: 'next_action' }));
  await must(a, (s, ctx) => addLifeRecord(s, ctx, { id: 'life-record-a', title: 'Passport', kind: 'credential', referenceNumber: SECRET }));
  await must(a, (s, ctx) => addLifeRecordTask(s, ctx, { recordId: 'life-record-a', taskId: 'task-f12-a', linkId: 'life-link-a', relation: 'renewal', title: 'Renew the passport', categoryId: 'cat-home' }));
  const person = (await must(a, (s, ctx) => addExternalPerson(s, ctx, { displayName: 'Coach Ray' }))).id;
  await must(a, (s, ctx) => openPersonContext(s, ctx, { kind: 'person', id: person }, { contextNote: SECRET }));
  const context = contextFor(a.store.getSnapshot().state, { kind: 'person', id: person });
  await must(a, (s, ctx) => addFollowUp(s, ctx, { contextId: context.id, draftKey: 'accountswitchfollowup0001', title: `Call Ray ${SECRET}` }));
  await must(a, (s, ctx) => createObligation(s, ctx, { title: 'Water bill', amountText: '84.23', dueDate: '2026-09-28', notes: '', childId: null, paymentMechanism: 'autopay' }));
  await a.settle();
  assert.deepEqual(a.store.getSnapshot().identity.sync.queue, [], 'A\'s first rows are all in the cloud');

  // Still A, offline: more private work that has NOT reached the cloud.
  cloud.state.offline = true;
  const opportunity = a.store.getSnapshot().state.careerOpportunities[0].id;
  await must(a, (s, ctx) => updateOpportunity(s, ctx, opportunity, { notes: `Pending note ${SECRET}` }));
  await must(a, (s, ctx) => addRebuildFocus(s, ctx, { id: 'focus-a-pending', title: `Pending focus ${SECRET}` }));
  await must(a, (s, ctx) => addLifeRecord(s, ctx, { id: 'life-record-a-pending', title: 'Lease', kind: 'credential', note: SECRET }));
  await a.settle();
  const beforeSwitch = a.persisted();
  const pendingA = beforeSwitch.identity.sync.queue.map((item) => `${item.kind}:${item.localId}`).sort();
  assert.ok(pendingA.length >= 3, `A has work waiting: ${pendingA.join(', ')}`);
  const cursorA = beforeSwitch.identity.sync.cursor;
  const rowsA = counts(beforeSwitch.state);
  cloud.state.offline = false;
  await a.accountRuntime.signOut();

  // B already has her own household in the cloud, with her own row.
  cloud.bootstrap({ householdId: cloudB.ids.householdId, accountId: ACCOUNT_B, memberId: uuid(), categories: [] });
  cloud.seedRow('tasks', { household_id: cloudB.ids.householdId, local_id: 'task-b-own', title: 'B-OWN-ROW', scope: 'household', status: 'open' });
  const callsBefore = cloud.calls.length;

  // B signs in on A's device.
  const b = await makeDevice({ cloud, accountId: ACCOUNT_B, accountCloud: cloudB, storage });
  const accountB = await b.signIn();
  await b.settle();
  assert.equal(accountB.kind, 'boundOther', 'the device holds A\'s household: it is quarantined from B, not handed over');
  assert.equal(b.syncRuntime.running(), null, 'no sync runs for B on this device');
  assert.equal(cloud.calls.length, callsBefore, 'not one request on B\'s behalf: nothing of A\'s is uploaded as B, no change pointer consumed as B');
  const access = routeAccess(b, accountB);
  for (const screen of ['(app)', 'onboarding']) assert.equal(canOpenScreen(screen, access), false, `B can open no ${screen} screen, so no cached projection of A's household renders`);
  assert.equal(canOpenScreen('account-conflict', access), true, 'B sees the one screen that says this device holds another account');
  for (const table of TABLES) {
    const underB = cloud.table(table).filter((row) => row.household_id === cloudB.ids.householdId);
    assert.equal(JSON.stringify(underB).includes(SECRET), false, `${table}: nothing of A's under B's household`);
  }
  const quarantined = b.persisted();
  assert.ok(quarantined.identity.quarantine, 'A\'s household is preserved in quarantine');
  assert.deepEqual(counts(quarantined.state), rowsA, 'every one of A\'s rows is still on the device: nothing was deleted to make room for B');
  assert.equal(JSON.stringify(quarantined.state).includes('B-OWN-ROW'), false, 'nothing of B\'s landed on the device, so B cannot overwrite A');
  assert.deepEqual(quarantined.identity.sync.queue.map((item) => `${item.kind}:${item.localId}`).sort(), pendingA, 'A\'s pending work is untouched');
  assert.deepEqual(quarantined.identity.sync.cursor, cursorA, 'A\'s change pointer is untouched');
  await b.accountRuntime.signOut();

  // A returns: the whole household reconstructs, and the pending rows reach the cloud as hers.
  const back = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud: cloudA, storage });
  assert.equal((await back.signIn()).kind, 'accountBound', 'A is bound to her own household again');
  await back.syncRuntime.request('manual');
  await back.settle();
  const again = back.store.getSnapshot();
  assert.deepEqual(counts(again.state), rowsA, 'A\'s truth reconstructs: every row of every feature');
  assert.equal(again.state.careerOpportunities[0].notes, `Pending note ${SECRET}`, 'including the edit that was still pending');
  assert.deepEqual(again.identity.sync.queue, [], 'and her pending work has now reached the cloud');
  assert.deepEqual(unresolvedEvidence(again.identity.sync), []);
  for (const [table, localId] of [['rebuild_focuses', 'focus-a-pending'], ['life_records', 'life-record-a-pending']]) {
    const rows = cloud.table(table).filter((row) => row.local_id === localId);
    assert.equal(rows.length, 1, `${table}: the pending row reached the cloud once`);
    assert.equal(rows[0].household_id, cloudA.ids.householdId, '...in A\'s household');
    assert.equal(rows[0].profile_id, ACCOUNT_A, '...as A\'s own row');
  }
  assert.equal(cloud.table('career_opportunities')[0].notes, `Pending note ${SECRET}`);
  for (const table of TABLES) {
    assert.deepEqual(cloud.table(table).filter((row) => JSON.stringify(row).includes(SECRET) && row.household_id !== cloudA.ids.householdId), [],
      `${table}: every row carrying A's words is in A's household`);
  }
});
