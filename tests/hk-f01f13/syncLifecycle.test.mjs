/**
 * HK-F01-F13 integration, Phase 9 — local-first and sync, proven the SAME way for every canonical type Features 09-13 added.
 *
 * Each type runs one lifecycle through the real composition (`composeAccountApp` on a device, the in-memory cloud of
 * tests/support/fakeCloud.mjs): created, edited and archived OFFLINE and shown at once; the app relaunched offline with its data and
 * its intent intact; reconnected and pushed; a FRESH device of the same account reconstructing it; that device relaunched and pulled
 * again. Then the failure modes: a lost acknowledgement retried, a stale edit, a row the server refuses. Throughout: no duplicate
 * creation, no resurrection, no silent loss. (The REAL PostgreSQL proof of each table is in supabase/tests: RLS, sync_push, ENV F.)
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addLifeRecord, addLifeRecordTask, archiveLifeRecord, updateLifeRecord } from '../../src/domain/lifeRecords.ts';
import { addOpportunity, archiveOpportunity, updateOpportunity } from '../../src/domain/opportunities.ts';
import { addExternalPerson, addFollowUp, archivePersonContext, contextFor, editPersonContext, followUpLinkId, openPersonContext } from '../../src/domain/people.ts';
import { addRebuildFocus, archiveRebuildFocus, linkToFocus, renameRebuildFocus, unlinkFromFocus } from '../../src/domain/rebuild/commands.ts';
import { unresolvedEvidence } from '../../src/domain/sync/syncTypes.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { cancelMoneyItem, createObligation, editMoneyItem } from '../../src/features/money/mutations.ts';
import { ACCOUNT_A, act, boundDevice, makeDevice, secondDevice } from '../meals/support/twoDevice.mjs';

const stateOf = (device) => device.store.getSnapshot().state;
const syncOf = (device) => device.store.getSnapshot().identity.sync;
const queued = (device, kind, id) => syncOf(device).queue.filter((item) => item.kind === kind && item.localId === id);

async function must(device, transition) {
  const { ok, result } = await act(device, transition);
  assert.ok(ok, 'the change was saved');
  for (const key of ['refusal', 'outcome']) {
    if (result && typeof result === 'object' && key in result) {
      assert.ok(result[key] === null || result[key] === 'saved', `refused: ${result[key]}`);
    }
  }
  return result;
}
const newest = (rows) => rows[rows.length - 1].id;

/** A money obligation, from the Money feature's own command: the F09 fact under test is its payment mechanism. */
const MONEY = { title: 'Water bill', amountText: '84.23', dueDate: '2026-09-28', notes: '', childId: null };

const TYPES = [
  {
    name: 'F09 — a Money obligation\'s payment mechanism (a Task)',
    kind: 'task', table: 'tasks', collection: 'tasks',
    create: async (d) => (await must(d, (s, ctx) => createObligation(s, ctx, { ...MONEY, paymentMechanism: 'autopay' }))).id,
    local: (r) => `${r.title}|${r.paymentMechanism}|${r.status}`,
    cloud: (r) => `${r.title}|${r.payment_mechanism}|${r.status}`,
    edit: (d, id, words = 'Water bill') => must(d, (s, ctx) => {
      const task = s.tasks.find((t) => t.id === id);
      return editMoneyItem(s, ctx, { taskId: id, baseUpdatedAt: task.updatedAt, fields: { ...MONEY, title: words, paymentMechanism: 'manual' } });
    }),
    editedTo: 'Water bill|manual|open',
    racePatch: { title: 'Written by another device' },
    archive: (d, id) => must(d, (s, ctx) => cancelMoneyItem(s, ctx, id)),
    archivedTo: 'Water bill|manual|archived',
  },
  {
    name: 'F10 — a CareerOpportunity',
    kind: 'opportunity', table: 'career_opportunities', collection: 'careerOpportunities',
    create: async (d) => { await must(d, (s, ctx) => addOpportunity(s, ctx, { title: 'Program manager', opportunityType: 'job' })); return newest(stateOf(d).careerOpportunities); },
    local: (r) => `${r.title}|${r.notes}|${r.archivedAt !== null}`,
    cloud: (r) => `${r.title}|${r.notes}|${r.archived_at !== null}`,
    edit: (d, id, words = 'Referred by Dana') => must(d, (s, ctx) => updateOpportunity(s, ctx, id, { notes: words })),
    editedTo: 'Program manager|Referred by Dana|false',
    racePatch: { notes: 'Written by another device' },
    archive: (d, id) => must(d, (s, ctx) => archiveOpportunity(s, ctx, id)),
    archivedTo: 'Program manager|Referred by Dana|true',
  },
  {
    name: 'F11 — a RebuildFocus',
    kind: 'rebuildFocus', table: 'rebuild_focuses', collection: 'rebuildFocuses',
    create: async (d) => { await must(d, (s, ctx) => addRebuildFocus(s, ctx, { id: 'focus-matrix', title: 'Sleep' })); return 'focus-matrix'; },
    local: (r) => `${r.title}|${r.state}`,
    cloud: (r) => `${r.title}|${r.state}`,
    edit: (d, id, words = 'Sleep by eleven') => must(d, (s, ctx) => renameRebuildFocus(s, ctx, id, words)),
    editedTo: 'Sleep by eleven|active',
    racePatch: { title: 'Written by another device' },
    archive: (d, id) => must(d, (s, ctx) => archiveRebuildFocus(s, ctx, id)),
    archivedTo: 'Sleep by eleven|archived',
  },
  {
    name: 'F11 — a RebuildFocusLink (a next step on a Focus)',
    kind: 'rebuildFocusLink', table: 'rebuild_focus_links', collection: 'rebuildFocusLinks',
    create: async (d) => {
      await must(d, (s, ctx) => addRebuildFocus(s, ctx, { id: 'focus-for-link', title: 'Health' }));
      await must(d, (s, ctx) => addTask(s, ctx, { title: 'Book a check-up', categoryId: 'cat-wellbeing', scope: 'personal' }));
      const taskId = newest(stateOf(d).tasks);
      await must(d, (s, ctx) => linkToFocus(s, ctx, { id: 'focuslink-matrix', focusId: 'focus-for-link', target: { kind: 'task', id: taskId }, relation: 'next_action' }));
      return 'focuslink-matrix';
    },
    local: (r) => `${r.relation}|${r.status}`,
    cloud: (r) => `${r.relation}|${r.status}`,
    archive: (d, id) => must(d, (s, ctx) => unlinkFromFocus(s, ctx, id)),
    archivedTo: 'next_action|removed',
  },
  {
    name: 'F12 — a LifeRecord',
    kind: 'lifeRecord', table: 'life_records', collection: 'lifeRecords',
    create: async (d) => (await must(d, (s, ctx) => addLifeRecord(s, ctx, { id: 'life-record-matrix', title: 'Passport', kind: 'credential' }))).id,
    local: (r) => `${r.title}|${r.note}|${r.status}`,
    cloud: (r) => `${r.title}|${r.note}|${r.status}`,
    edit: (d, id, words = 'In the safe') => must(d, (s, ctx) => updateLifeRecord(s, ctx, id, { note: words })),
    editedTo: 'Passport|In the safe|active',
    racePatch: { note: 'Written by another device' },
    archive: (d, id) => must(d, (s, ctx) => archiveLifeRecord(s, ctx, id)),
    archivedTo: 'Passport|In the safe|archived',
  },
  {
    name: 'F12 — a LifeRecordLink (a renewal Task on a record)',
    kind: 'lifeRecordLink', table: 'life_record_task_links', collection: 'lifeRecordLinks',
    create: async (d) => {
      await must(d, (s, ctx) => addLifeRecord(s, ctx, { id: 'life-record-for-link', title: 'Lease', kind: 'credential' }));
      await must(d, (s, ctx) => addLifeRecordTask(s, ctx, { recordId: 'life-record-for-link', taskId: 'task-f12-matrix', linkId: 'life-link-matrix', relation: 'renewal', title: 'Renew the lease', categoryId: 'cat-home' }));
      return 'life-link-matrix';
    },
    local: (r) => `${r.relation}`,
    cloud: (r) => `${r.relation}`,
  },
  {
    name: 'F13 — a PersonContext',
    kind: 'personContext', table: 'person_contexts', collection: 'personContexts',
    create: async (d) => {
      const person = (await must(d, (s, ctx) => addExternalPerson(s, ctx, { displayName: 'Coach Ray' }))).id;
      return (await must(d, (s, ctx) => openPersonContext(s, ctx, { kind: 'person', id: person }, { relationshipName: 'Coach' }))).id;
    },
    local: (r) => `${r.relationshipName}|${r.contextNote}|${r.status}`,
    cloud: (r) => `${r.relationship_name}|${r.context_note}|${r.status}`,
    edit: (d, id, words = 'Practice is on Tuesdays') => must(d, (s, ctx) => editPersonContext(s, ctx, id, { contextNote: words })),
    editedTo: 'Coach|Practice is on Tuesdays|active',
    racePatch: { context_note: 'Written by another device' },
    archive: (d, id) => must(d, (s, ctx) => archivePersonContext(s, ctx, id)),
    archivedTo: 'Coach|Practice is on Tuesdays|archived',
  },
  {
    name: 'F13 — a PersonTaskLink (a follow-up)',
    kind: 'personTaskLink', table: 'person_task_links', collection: 'personTaskLinks',
    create: async (d) => {
      const person = (await must(d, (s, ctx) => addExternalPerson(s, ctx, { displayName: 'Aunt Mae' }))).id;
      await must(d, (s, ctx) => openPersonContext(s, ctx, { kind: 'person', id: person }, { relationshipName: 'Aunt' }));
      const context = contextFor(stateOf(d), { kind: 'person', id: person });
      const draftKey = 'matrixfollowup0000000000';
      await must(d, (s, ctx) => addFollowUp(s, ctx, { contextId: context.id, draftKey, title: 'Call Aunt Mae back' }));
      return followUpLinkId(draftKey);
    },
    local: (r) => `${r.relation}`,
    cloud: (r) => `${r.relation}`,
  },
];

const cloudRows = (cloud, t, id) => cloud.table(t.table).filter((row) => row.local_id === id);
const localRow = (device, t, id) => stateOf(device)[t.collection].find((row) => row.id === id);
const expectedFinal = (t) => t.archivedTo ?? t.editedTo ?? null;

for (const t of TYPES) {
  describe(`[P9] ${t.name}`, () => {
    test('offline create / edit / archive: shown at once, durable across a relaunch, pushed once on reconnect, reconstructed on a fresh device, never resurrected', async () => {
      const { cloud, accountCloud, a } = await boundDevice();
      cloud.state.offline = true;

      const id = await t.create(a);
      assert.ok(localRow(a, t, id), 'immediately visible on this device');
      assert.equal(queued(a, t.kind, id).length, 1, 'and owed to the cloud');
      const created = t.local(localRow(a, t, id));
      if (t.edit) {
        await t.edit(a, id);
        assert.equal(t.local(localRow(a, t, id)), t.editedTo, 'the offline edit shows at once');
      }
      if (t.archive) {
        await t.archive(a, id);
        assert.equal(t.local(localRow(a, t, id)), t.archivedTo, 'the offline archive shows at once');
      }
      assert.equal(queued(a, t.kind, id).length, 1, 'every offline change coalesces into ONE piece of work for the row');
      const final = t.local(localRow(a, t, id));
      await a.settle();
      assert.equal(cloudRows(cloud, t, id).length, 0, 'nothing reached the cloud while offline');

      // Relaunch, still offline: the row and the intent to send it are both on disk.
      const relaunched = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud: accountCloud, storage: a.storage, secure: a.secure });
      await relaunched.signIn();
      assert.equal(t.local(localRow(relaunched, t, id)), final, 'the relaunched app shows exactly what she left');
      assert.equal(queued(relaunched, t.kind, id).length, 1, 'and still owes it to the cloud');

      // Reconnect.
      cloud.state.offline = false;
      await relaunched.syncRuntime.request('manual');
      await relaunched.settle();
      const rows = cloudRows(cloud, t, id);
      assert.equal(rows.length, 1, 'exactly one row reached the cloud: no duplicate creation');
      assert.equal(t.cloud(rows[0]), final, `the cloud holds the latest truth (created as ${created})`);
      assert.deepEqual(syncOf(relaunched).queue, [], 'nothing left owed');
      assert.deepEqual(unresolvedEvidence(syncOf(relaunched)), [], 'nothing needs her attention');

      // A fresh device of the same account reconstructs it; relaunched and pulled again, it is unchanged (no resurrection).
      const b = await secondDevice({ cloud, accountCloud });
      assert.equal(t.local(localRow(b, t, id)), final, 'a fresh device reconstructs the same row, under the same id');
      const bAgain = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage: b.storage, secure: b.secure });
      await bAgain.signIn();
      await bAgain.syncRuntime.request('manual');
      await bAgain.settle();
      assert.equal(t.local(localRow(bAgain, t, id)), final, 'a relaunch and another pull change nothing');
      assert.equal(cloudRows(cloud, t, id).length, 1, 'and still create nothing');
      if (expectedFinal(t) !== null) assert.equal(final, expectedFinal(t));
    });

    test('a lost acknowledgement is retried into the SAME row, never a second one', async () => {
      const { cloud, a } = await boundDevice();
      cloud.state.loseNextAck = 99; // every create lands but its answer is lost, until switched off below
      const id = await t.create(a);
      await a.settle();
      cloud.state.loseNextAck = 0;
      await a.syncRuntime.request('manual');
      await a.settle();
      assert.equal(cloudRows(cloud, t, id).length, 1, 'one row, whatever the retries');
      assert.deepEqual(syncOf(a).queue, []);
      assert.deepEqual(unresolvedEvidence(syncOf(a)), []);
    });

    if (t.edit) {
      test('a STALE edit never overwrites newer cloud truth; her edit is kept as evidence and the device converges', async () => {
        const { cloud, accountCloud, a } = await boundDevice();
        const id = await t.create(a);
        await a.settle();
        const b = await secondDevice({ cloud, accountCloud });
        assert.ok(localRow(b, t, id), 'B holds it');

        // B edits and syncs first; A (which has not pulled) edits the same row DIFFERENTLY, offline, from the older revision.
        await t.edit(b, id, 'Written on device B');
        await b.settle();
        const newer = t.cloud(cloudRows(cloud, t, id)[0]);
        cloud.state.offline = true;
        await t.edit(a, id, 'Written on device A');
        cloud.state.offline = false;
        await a.syncRuntime.request('manual');
        await a.settle();
        await a.syncRuntime.request('manual');
        await a.settle();

        assert.ok(newer.includes('Written on device B'), 'B\'s edit reached the cloud');
        assert.equal(t.cloud(cloudRows(cloud, t, id)[0]), newer, 'the newer cloud truth stands: A\'s stale edit did not overwrite it');
        assert.equal(cloudRows(cloud, t, id).length, 1);
        const evidence = unresolvedEvidence(syncOf(a)).filter((e) => e.kind === t.kind && e.localId === id);
        assert.deepEqual(evidence.map((e) => e.evidence), ['cas-conflict'], 'A\'s edit is not lost: it is kept, unapplied, as a CAS conflict');
        assert.equal(t.local(localRow(a, t, id)), newer, 'A shows the cloud\'s truth');
      });
    }

    if (t.racePatch) {
      test('a STALE edit that races the push (another device writes while this one sends) is kept as evidence, never applied over the newer row', async () => {
        const { cloud, a } = await boundDevice();
        const id = await t.create(a);
        await a.settle();
        const [row] = cloudRows(cloud, t, id);
        cloud.hooks.duringUpdate = (table, cloudId) => {
          if (table !== t.table || cloudId !== row.id) return;
          cloud.hooks.duringUpdate = null;
          cloud.editRow(t.table, row.id, t.racePatch);
        };
        await t.edit(a, id, 'Written on device A');
        await a.settle();
        const raced = t.cloud(cloudRows(cloud, t, id)[0]);
        assert.ok(raced.includes('Written by another device') && !raced.includes('Written on device A'), `the newer row stands: ${raced}`);
        const evidence = unresolvedEvidence(syncOf(a)).filter((e) => e.kind === t.kind && e.localId === id);
        assert.deepEqual(evidence.map((e) => e.evidence), ['cas-conflict'], 'her edit is kept, unapplied, as a CAS conflict');
        await a.syncRuntime.request('manual');
        await a.settle();
        assert.equal(t.local(localRow(a, t, id)), raced, 'and the device converges on the cloud\'s truth');
      });
    }

    test('a row the server REFUSES is kept as evidence: not retried forever, not deleted, and nothing else is blocked', async () => {
      const { cloud, a } = await boundDevice();
      cloud.state.offline = true;
      const id = await t.create(a);
      await must(a, (s, ctx) => addTask(s, ctx, { title: 'An unrelated chore', categoryId: 'cat-home', scope: 'household' }));
      const other = newest(stateOf(a).tasks);
      cloud.hooks.refuse = (table, row) => (table === t.table && row.local_id === id
        ? { kind: 'failure', failure: 'validation', code: '23514', detail: `new row for relation "${t.table}" violates check constraint "${t.table}_matrix_check"` }
        : null);
      cloud.state.offline = false;
      await a.syncRuntime.request('manual');
      await a.settle();
      await a.syncRuntime.request('manual');
      await a.settle();

      assert.equal(cloudRows(cloud, t, id).length, 0, 'the refused row is not in the cloud');
      assert.equal(cloud.calls.filter((c) => c.op === 'create' && c.table === t.table && c.localId === id).length, 1, 'it was tried once, not on every cycle');
      assert.ok(localRow(a, t, id), 'it is still on her device');
      assert.ok(unresolvedEvidence(syncOf(a)).some((e) => e.kind === t.kind && e.localId === id && e.evidence === 'validation-failure'), 'and kept as evidence');
      assert.equal(cloud.table('tasks').filter((row) => row.local_id === other).length, 1, 'an unrelated row still reached the cloud');
    });
  });
}
