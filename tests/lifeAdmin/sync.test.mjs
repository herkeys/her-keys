/**
 * HK-FEATURE-12 — Life Admin records travel through the PRODUCTION composition (M5).
 *
 * Every device begins at `composeAccountApp` (the Meals two-device harness, reused, not copied), over the shared in-memory cloud.
 * The cloud here does not model RLS; the owner-private, same-household and cross-household proofs against real PostgreSQL and
 * PostgREST are in supabase/tests (79-f12-life-records.sql and journey-life-admin.mjs).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decideBinding, describeLocalHousehold } from '../../src/domain/account/claim.ts';
import { addLifeRecord, addLifeRecordTask, archiveLifeRecord, updateLifeRecord } from '../../src/domain/lifeRecords.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { unresolvedEvidence } from '../../src/domain/sync/syncTypes.ts';
import { buildLifeAdminView } from '../../src/features/lifeAdmin/lifeAdminView.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { failureFrom } from '../../src/platform/supabaseSyncTransport.ts';
import {
  ACCOUNT_A, ACCOUNT_B, TODAY, accountCloudFor, act, boundDevice, createFakeCloud, makeDevice, secondDevice, withheldMove,
} from '../meals/support/twoDevice.mjs';

const RECORDS = 'life_records';
const LINKS = 'life_record_task_links';
const records = (device) => device.store.getSnapshot().state.lifeRecords;
const links = (device) => device.store.getSnapshot().state.lifeRecordLinks;
const tasks = (device) => device.store.getSnapshot().state.tasks;

async function addRecord(device, input) {
  const { result } = await act(device, (s, ctx) => addLifeRecord(s, ctx, { kind: 'credential', ...input }));
  assert.equal(result.refusal, null, `add refused: ${result.refusal} ${result.field}`);
  return result.id;
}
async function addTaskFor(device, recordId, n = 1) {
  const { result } = await act(device, (s, ctx) =>
    addLifeRecordTask(s, ctx, { recordId, taskId: `task-f12-${n}`, linkId: `life-link-f12-${n}`, relation: 'renewal', title: `Renew ${n}`, categoryId: 'cat-home' }));
  assert.equal(result.refusal, null, `task refused: ${result.refusal}`);
}

describe('F12 create offline, then sync', () => {
  test('offline: record, Task and link are durable locally and queued in the same envelope; online: all three reach the cloud, owner-private', async () => {
    const { cloud, a } = await boundDevice();
    cloud.state.offline = true;
    const id = await addRecord(a, { id: 'rec-1', title: 'Passport', referenceNumber: 'P-12345678', expiresOn: '2027-01-01', note: 'In the safe' });
    await addTaskFor(a, id);
    await a.settle();
    assert.equal(cloud.table(RECORDS).length, 0, 'nothing reached the cloud while offline');
    const persisted = a.persisted();
    assert.equal(persisted.state.lifeRecords.length, 1, 'the record is durable on the device');
    assert.deepEqual(new Set(persisted.identity.sync.queue.map((q) => `${q.kind}:${q.op}`)), new Set(['lifeRecord:create', 'task:create', 'lifeRecordLink:create']));

    cloud.state.offline = false;
    await a.syncRuntime.request('manual');
    await a.settle();
    const [record] = cloud.table(RECORDS);
    assert.equal(record.profile_id, ACCOUNT_A, 'the owner is the bound account');
    assert.equal(record.scope, 'personal');
    assert.equal(record.title, 'Passport');
    assert.equal(record.record_kind, 'credential');
    assert.equal(record.reference_number, 'P-12345678', 'private context travels to her own cloud row (transport is not logging)');
    assert.equal(record.expires_on, '2027-01-01', 'a calendar date, not an instant');
    const task = cloud.table('tasks').find((row) => row.local_id === 'task-f12-1');
    assert.equal(task.scope, 'personal');
    assert.equal(task.owner_profile_id, ACCOUNT_A);
    const [link] = cloud.table(LINKS);
    assert.equal(link.life_record_id, record.id, 'the link names the record by its CLOUD id');
    assert.equal(link.task_id, task.id, 'and the Task by its cloud id');
    assert.equal(link.profile_id, ACCOUNT_A);
    assert.equal(a.persisted().identity.sync.queue.length, 0);
  });

  test('offline EDIT and offline ARCHIVE: both are durable and queued locally, and reach the cloud as updates of the same row once online', async () => {
    const { cloud, a } = await boundDevice();
    const id = await addRecord(a, { id: 'rec-1', title: 'Registration', referenceNumber: 'R-12345678' });
    await a.settle();
    cloud.state.offline = true;
    await act(a, (s, ctx) => updateLifeRecord(s, ctx, id, { title: 'Car registration', referenceNumber: '' }));
    await act(a, (s, ctx) => archiveLifeRecord(s, ctx, id));
    await a.settle();
    assert.equal(cloud.table(RECORDS)[0].title, 'Registration', 'nothing reached the cloud while offline');
    const persisted = a.persisted();
    assert.equal(persisted.state.lifeRecords[0].status, 'archived', 'the offline archive is durable on the device');
    assert.deepEqual(persisted.identity.sync.queue.map((q) => `${q.kind}:${q.op}`), ['lifeRecord:update'], 'two offline changes coalesce into one pending update');

    cloud.state.offline = false;
    await a.syncRuntime.request('manual');
    await a.settle();
    const [row] = cloud.table(RECORDS);
    assert.deepEqual([row.title, row.reference_number, row.status, cloud.table(RECORDS).length], ['Car registration', null, 'archived', 1]);
    assert.equal(a.persisted().identity.sync.queue.length, 0);
  });

  test('a lost acknowledgement settles on retry: still exactly one record in the cloud', async () => {
    const { cloud, a } = await boundDevice();
    cloud.state.loseNextAck = 1;
    await addRecord(a, { id: 'rec-1', title: 'Lease' });
    await a.settle();
    await a.syncRuntime.request('manual');
    await a.settle();
    assert.equal(cloud.table(RECORDS).length, 1);
    assert.equal(a.persisted().identity.sync.queue.length, 0);
  });

  test('a row the server refuses stays on her device as evidence: never lost, never retried forever, never silently dropped', async () => {
    const { cloud, a } = await boundDevice();
    cloud.hooks.refuse = (table) => (table === RECORDS ? { kind: 'failure', failure: 'validation', detail: 'refused for the test', code: '23514' } : null);
    await addRecord(a, { id: 'rec-1', title: 'Lease' });
    await a.settle();
    assert.equal(cloud.table(RECORDS).length, 0);
    assert.equal(records(a).length, 1, 'the record is still hers, locally');
    const evidence = unresolvedEvidence(a.persisted().identity.sync);
    assert.deepEqual(evidence.map((e) => [e.kind, e.evidence]), [['lifeRecord', 'validation-failure']]);
  });
});

describe('F12 fresh client, edits, archive and stale revisions', () => {
  test('a fresh device of the same account reconstructs the record, the link and the owner-private Task, valid and identical', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    const id = await addRecord(a, { id: 'rec-1', title: 'Passport', typeName: 'Passport', referenceNumber: 'P-12345678', expiresOn: '2027-01-01', renewBy: '2026-12-01' });
    await addTaskFor(a, id);
    await a.settle();

    const b = await secondDevice({ cloud, accountCloud });
    const [record] = records(b);
    const [original] = records(a);
    for (const field of ['title', 'kind', 'typeName', 'referenceNumber', 'expiresOn', 'renewBy', 'status', 'archivedAt', 'scope']) {
      assert.equal(record[field], original[field], field);
    }
    const [link] = links(b);
    assert.equal(link.lifeRecordId, record.id, 'the link resolves to THIS device\'s record');
    const task = tasks(b).find((row) => row.id === link.taskId);
    assert.ok(task, 'and to this device\'s copy of the Task');
    assert.equal(task.scope, 'personal');
    assert.equal(validateAppState(b.store.getSnapshot().state).ok, true);
    assert.equal(b.persisted().identity.sync.queue.length, 0, 'hydration created no outbound work');
  });

  test('rename and clear on A reach B as the SAME record (same local id, link intact, cleared value gone from the cloud too)', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    const id = await addRecord(a, { id: 'rec-1', title: 'Passport', referenceNumber: 'P-12345678', locationHint: 'Desk' });
    await addTaskFor(a, id);
    await a.settle();
    const b = await secondDevice({ cloud, accountCloud });
    const bId = records(b)[0].id;

    await act(a, (s, ctx) => updateLifeRecord(s, ctx, id, { title: 'Passport (current)', referenceNumber: '', locationHint: null }));
    await a.settle();
    assert.equal(cloud.table(RECORDS)[0].reference_number, null, 'cleared in the cloud, not just hidden');
    assert.equal(cloud.table(RECORDS)[0].location_hint, null);
    assert.equal(cloud.table(RECORDS).length, 1, 'a rename is never a second row');

    await b.syncRuntime.request('manual');
    await b.settle();
    assert.equal(records(b).length, 1);
    assert.equal(records(b)[0].id, bId, 'same canonical record on B');
    assert.equal(records(b)[0].title, 'Passport (current)');
    assert.equal(records(b)[0].referenceNumber, null);
    assert.equal(links(b)[0].lifeRecordId, bId);
  });

  test('ARCHIVE PROPAGATES: archived on A, archived on a fresh B, still archived after B relaunches and pulls again (no resurrection)', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    const id = await addRecord(a, { id: 'rec-1', title: 'Old lease' });
    await addTaskFor(a, id);
    await a.settle();
    await act(a, (s, ctx) => archiveLifeRecord(s, ctx, id));
    await a.settle();
    assert.equal(cloud.table(RECORDS)[0].status, 'archived');
    assert.notEqual(cloud.table(RECORDS)[0].archived_at, null);
    assert.equal(cloud.table('tasks').find((row) => row.local_id === 'task-f12-1').status, 'open', 'archiving the record did not touch its Task');

    const b = await secondDevice({ cloud, accountCloud });
    assert.equal(records(b)[0].status, 'archived');
    assert.deepEqual(buildLifeAdminView(b.store.getSnapshot().state, TODAY).records, [], 'not on B\'s active list');

    const relaunched = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage: b.storage, secure: b.secure });
    await relaunched.signIn();
    await relaunched.syncRuntime.request('manual');
    await relaunched.settle();
    assert.equal(records(relaunched)[0].status, 'archived', 'a relaunch and another pull do not resurrect it');
    assert.equal(relaunched.persisted().identity.sync.queue.length, 0);
  });

  test('STALE REVISION: an offline edit on B cannot overwrite a newer archive from A; B keeps the cloud\'s truth and her edit as evidence', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    const id = await addRecord(a, { id: 'rec-1', title: 'Registration' });
    await a.settle();
    const b = await secondDevice({ cloud, accountCloud });
    const bId = records(b)[0].id;

    // B edits (queued, not yet pushed); A archives and pushes first. B's cycle then pulls the newer row before pushing.
    await act(b, (s, ctx) => updateLifeRecord(s, ctx, bId, { note: 'B edit made offline' }));
    await act(a, (s, ctx) => archiveLifeRecord(s, ctx, id));
    await a.settle();
    await b.settle();

    const [row] = cloud.table(RECORDS);
    assert.equal(row.status, 'archived', 'the newer archive stands');
    assert.notEqual(row.note, 'B edit made offline', 'the stale edit did not overwrite it');
    const evidence = unresolvedEvidence(b.persisted().identity.sync);
    assert.ok(evidence.some((e) => e.kind === 'lifeRecord' && e.evidence === 'cas-conflict'), `B kept her edit as conflict evidence: ${JSON.stringify(evidence.map((e) => e.evidence))}`);
    assert.equal(records(b)[0].status, 'archived', 'and B now shows the cloud\'s truth');
  });
});

describe('F12 claim, account switch and demo', () => {
  test('the claim carries NO record: records made before binding reach the cloud as ordinary creates afterwards', async () => {
    const { cloud, accountCloud, a } = await boundDevice({
      before: async (device) => {
        await addRecord(device, { id: 'rec-pre', title: 'Pre-binding record', referenceNumber: 'PRE-12345678' });
      },
    });
    await a.settle();
    const [payload] = accountCloud.ids.payloads;
    assert.equal(JSON.stringify(payload).includes('Pre-binding record'), false, 'the claim payload carries no record');
    assert.equal(JSON.stringify(payload).includes('PRE-12345678'), false);
    assert.equal(cloud.table(RECORDS).length, 1, 'it arrived afterwards, through ordinary sync');
  });

  test('ACCOUNT SWITCH: a device holding A\'s private records meets account B — none is uploaded under B, and nothing of A renders for B', async () => {
    const cloud = createFakeCloud();
    const cloudA = accountCloudFor(cloud, ACCOUNT_A);
    const storage = createMemoryStorage({});
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud: cloudA, storage });
    await a.store.commit((s) => ({ ...s, oneMoves: [withheldMove] }));
    await a.signIn();
    cloud.state.offline = true;
    const id = await addRecord(a, { id: 'rec-1', title: 'A private passport', referenceNumber: 'A-99887766' });
    await addTaskFor(a, id);
    await a.settle();
    cloud.state.offline = false;
    await a.accountRuntime.signOut();
    const callsBefore = cloud.calls.length;

    const b = await makeDevice({ cloud, accountId: ACCOUNT_B, accountCloud: accountCloudFor(cloud, ACCOUNT_B), storage });
    const state = await b.signIn();
    assert.equal(state.kind, 'boundOther', 'the device is quarantined, not handed to B');
    assert.equal(b.syncRuntime.running(), null);
    await b.settle();
    assert.equal(cloud.calls.length, callsBefore, 'not one request was made on account B\'s behalf');
    for (const table of [RECORDS, LINKS, 'tasks']) {
      assert.equal(JSON.stringify(cloud.table(table)).includes('A-99887766'), false, `${table}: nothing of A under B`);
      assert.equal(JSON.stringify(cloud.table(table)).includes('A private passport'), false);
    }
  });

  test('a household holding ONLY records is not empty: an interrupted claim by A is quarantined from B, not bootstrapped over', () => {
    const empty = createEmptyState('America/Chicago');
    const onlyRecords = addLifeRecord(empty, { nowMs: Date.UTC(2026, 8, 21, 15), today: TODAY, createId: (p) => `${p}-1` }, { id: 'rec-1', title: 'Passport', kind: 'credential' }).state;
    // The receipt path is where "has content" decides: an unbound device still holding a claim A started.
    const interrupted = { binding: null, receipt: { accountId: ACCOUNT_A } };
    assert.equal(describeLocalHousehold(onlyRecords).hasContent, true, 'records are content');
    assert.equal(decideBinding(describeLocalHousehold(onlyRecords), interrupted, ACCOUNT_B).mode, 'quarantine');
    assert.equal(decideBinding(describeLocalHousehold(empty), interrupted, ACCOUNT_B).mode, 'bootstrap', 'control: a truly empty household is not quarantined');
  });

  test('DEMO: a demo household never queues or syncs its records', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, mode: 'demo' });
    const state = await a.signIn();
    assert.equal(state.kind, 'authenticatedUnbound', 'refused as a whole');
    assert.ok(records(a).length > 0, 'the demo shows its fictional records');
    await addRecord(a, { id: 'rec-demo-extra', title: 'Sample Permit' });
    await a.settle();
    assert.equal(cloud.calls.length, 0);
    assert.equal(a.persisted().identity.sync, null);
    assert.equal(cloud.table(RECORDS).length, 0);
  });
});

describe('F12 error payloads', () => {
  test('a CHECK refusal keeps the constraint name and withholds the refused row\'s values from durable sync evidence', () => {
    const failure = failureFrom({
      code: '23514',
      message: 'new row for relation "life_records" violates check constraint "life_records_note_check"',
      details: 'Failing row contains (5f0d…, household, rec-1, …, Passport, credential, REF-99887766, Blue drawer, NOTESENTINEL, …).',
    });
    assert.equal(failure.failure, 'validation');
    assert.match(failure.detail, /life_records_note_check/);
    assert.match(failure.detail, /values withheld/);
    for (const secret of ['REF-99887766', 'Blue drawer', 'NOTESENTINEL', 'Passport']) assert.equal(failure.detail.includes(secret), false, secret);
    const unique = failureFrom({ code: '23505', message: 'duplicate key value violates unique constraint "x"', details: 'Key (household_id, local_id)=(h, t-1) already exists.' });
    assert.match(unique.detail, /Key \(household_id, local_id\)/, 'a key detail (ids only) is kept as it was');
  });
});
