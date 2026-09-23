/**
 * HK-FEATURE-12 — Life Admin / Documents: the local commands (M2) and the record → Task creation (M3).
 * Every test names the doctrine line it proves; the mutation check (scripts-dev/life-admin-mutation-check.cjs) holds several of them
 * to failing under a deliberately broken implementation.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  activeLifeRecords,
  addLifeRecord,
  addLifeRecordTask,
  archiveLifeRecord,
  checkLifeRecordTitle,
  linkedTasksOf,
  openLinkedTaskCount,
  restoreLifeRecord,
  snapshotOfLifeRecord,
  updateLifeRecord,
} from '../../src/domain/lifeRecords.ts';
import { archiveTask, completeTask } from '../../src/domain/tasks.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { at, real, survives } from '../support/acceptance.mjs';
import { harness, launch } from '../support/fixtures.mjs';

const CHILD = { id: 'child-1', displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' };
const household = () => ({ ...real(), children: [CHILD] });
const add = (state, input) => addLifeRecord(state, at(), { kind: 'other', ...input });
const only = (result) => {
  assert.equal(result.refusal, null, `refused: ${result.refusal} ${result.field ?? ''}`);
  return result.state;
};
const recordOf = (state, id) => state.lifeRecords.find((row) => row.id === id);
const taskInput = (over = {}) => ({ recordId: 'rec-1', taskId: 'task-f12-1', linkId: 'link-f12-1', relation: 'renewal', title: 'Renew passport', categoryId: 'cat-home', ...over });

describe('F12 LifeRecord — creation and the minimum content', () => {
  test('a title-only record is a complete record: valid, owner-private, active, and identical after a save and a reload', () => {
    const state = only(add(household(), { id: 'rec-1', title: 'Passport' }));
    const record = recordOf(state, 'rec-1');
    assert.equal(record.title, 'Passport');
    assert.equal(record.kind, 'other');
    assert.equal(record.scope, 'personal');
    assert.equal(record.status, 'active');
    assert.equal(record.archivedAt, null);
    for (const optional of ['typeName', 'issuerName', 'referenceNumber', 'issuedOn', 'expiresOn', 'renewBy', 'reviewOn', 'locationHint', 'note', 'subjectMemberId']) {
      assert.equal(record[optional], null, `${optional} is not required`);
    }
    assert.equal(record.provenance.producer, 'user-action');
    survives(state, 'title-only record');
  });

  test('the title is trimmed and single-line; blank and over-long titles are refused by field, never echoed', () => {
    const state = only(add(household(), { id: 'rec-1', title: '  Car\nregistration  ' }));
    assert.equal(recordOf(state, 'rec-1').title, 'Car registration');
    for (const bad of ['', '   ', 'x'.repeat(201)]) {
      const result = add(household(), { id: 'rec-2', title: bad });
      assert.equal(result.refusal, 'invalid-field');
      assert.equal(result.field, 'title');
      if (bad.trim() !== '') assert.equal(JSON.stringify({ refusal: result.refusal, field: result.field, id: result.id }).includes(bad), false, 'the refusal never echoes what she typed');
    }
    assert.deepEqual(checkLifeRecordTitle('x'.repeat(201)), { ok: false, problem: 'too-long' });
  });

  test('every optional field is stored normalised, and a renew-by date later than the expiration date is kept exactly as entered', () => {
    const state = only(add(household(), {
      id: 'rec-1', title: 'Passport', kind: 'credential', typeName: ' Passport ', issuerName: 'Issuing office', referenceNumber: ' X1234567 ',
      issuedOn: '2020-01-10', expiresOn: '2030-01-09', renewBy: '2030-03-01', reviewOn: '2029-06-01', locationHint: 'Blue filing cabinet', note: '  Photo page copy in the folder.  ',
      subjectMemberId: 'child-1',
    }));
    const record = recordOf(state, 'rec-1');
    assert.equal(record.typeName, 'Passport');
    assert.equal(record.referenceNumber, 'X1234567');
    assert.equal(record.renewBy, '2030-03-01', 'renewBy > expiresOn is unusual, allowed, and never corrected');
    assert.equal(record.expiresOn, '2030-01-09');
    assert.equal(record.note, 'Photo page copy in the folder.');
    assert.equal(record.subjectMemberId, 'child-1');
    survives(state, 'full record');
  });

  test('bad dates, over-long fields and an unknown child are refused by field', () => {
    const cases = [
      [{ expiresOn: '2030-02-30' }, 'expiresOn'],
      [{ renewBy: 'next spring' }, 'renewBy'],
      [{ typeName: 'x'.repeat(61) }, 'typeName'],
      [{ referenceNumber: 'x'.repeat(65) }, 'referenceNumber'],
      [{ locationHint: 'x'.repeat(121) }, 'locationHint'],
      [{ note: 'x'.repeat(501) }, 'note'],
      [{ subjectMemberId: 'child-404' }, 'subjectMemberId'],
      [{ kind: 'passport' }, 'kind'],
    ];
    for (const [over, field] of cases) {
      const before = household();
      const result = add(before, { id: 'rec-1', title: 'Passport', ...over });
      assert.equal(result.refusal, 'invalid-field', field);
      assert.equal(result.field, field);
      assert.equal(result.state, before, 'a refusal returns the same state reference');
    }
  });

  test('MATCHING TITLES DO NOT MEAN SAME RECORD: two records named alike are two records', () => {
    let state = only(add(household(), { id: 'rec-1', title: 'Passport', referenceNumber: 'A-1' }));
    state = only(add(state, { id: 'rec-2', title: 'Passport', referenceNumber: 'A-1' }));
    assert.equal(state.lifeRecords.length, 2);
    assert.deepEqual(state.lifeRecords.map((row) => row.id), ['rec-1', 'rec-2']);
    assert.deepEqual(activeLifeRecords(state).map((row) => row.id), ['rec-1', 'rec-2'], 'a newer same-title record does not replace (archive) the older one');
    survives(state, 'duplicate titles');
  });

  test('saving the same draft twice creates one record (exists is a success), and the second save changes nothing', () => {
    const first = only(add(household(), { id: 'rec-1', title: 'Lease' }));
    const again = add(first, { id: 'rec-1', title: 'Lease' });
    assert.equal(again.refusal, 'exists');
    assert.equal(again.state, first);
  });

  test('LIFERECORD DOES NOT BECOME A TASK and a date never creates one: records with every date create zero Tasks', () => {
    const before = household();
    const state = only(add(before, { id: 'rec-1', title: 'Registration', expiresOn: '2020-01-01', renewBy: '2020-01-01', reviewOn: '2020-01-01' }));
    assert.equal(state.tasks.length, before.tasks.length);
    assert.equal(state.lifeRecordLinks.length, 0);
    assert.equal(state.needsMe.length, before.needsMe.length);
    assert.equal(state.oneMoves.length, before.oneMoves.length);
    assert.equal(state.events.length, before.events.length, 'no Calendar Event either');
  });
});

describe('F12 LifeRecord — editing, identity and sensitive-field clearing', () => {
  test('a rename is the SAME record: same id, links intact, nothing else rewritten', () => {
    let state = only(add(household(), { id: 'rec-1', title: 'Passport', referenceNumber: 'P-1' }));
    state = addLifeRecordTask(state, at(), taskInput()).state;
    const createdAt = recordOf(state, 'rec-1').createdAt;
    state = only(updateLifeRecord(state, at(Date.UTC(2026, 8, 17, 14)), 'rec-1', { title: 'Passport (mine)' }));
    const record = recordOf(state, 'rec-1');
    assert.equal(record.title, 'Passport (mine)');
    assert.equal(record.createdAt, createdAt);
    assert.equal(record.referenceNumber, 'P-1');
    assert.equal(linkedTasksOf(state, 'rec-1').length, 1, 'the link follows the id, not the title');
    survives(state, 'renamed');
  });

  test('every sensitive optional field can be CLEARED (blank or null), so something entered by mistake leaves the record', () => {
    let state = only(add(household(), {
      id: 'rec-1', title: 'Policy', typeName: 'Insurance', issuerName: 'Insurer', referenceNumber: 'POL-99887766', locationHint: 'Email from insurer', note: 'Renewal letter', subjectMemberId: 'child-1', reviewOn: '2027-01-01',
    }));
    state = only(updateLifeRecord(state, at(), 'rec-1', { referenceNumber: '', locationHint: null, note: '   ', issuerName: '', typeName: null, subjectMemberId: null, reviewOn: '' }));
    const record = recordOf(state, 'rec-1');
    for (const cleared of ['referenceNumber', 'locationHint', 'note', 'issuerName', 'typeName', 'subjectMemberId', 'reviewOn']) {
      assert.equal(record[cleared], null, `${cleared} cleared`);
    }
    assert.equal(JSON.stringify(state).includes('POL-99887766'), false, 'the cleared reference is gone from the stored state');
    survives(state, 'cleared');
  });

  test('the title cannot be cleared; an unchanged save is a no-op (same state reference)', () => {
    const state = only(add(household(), { id: 'rec-1', title: 'Lease' }));
    assert.equal(updateLifeRecord(state, at(), 'rec-1', { title: '  ' }).field, 'title');
    assert.equal(updateLifeRecord(state, at(), 'rec-1', { title: 'Lease' }).state, state);
  });

  test('an editor that opened on an older version is refused as stale instead of overwriting', () => {
    let state = only(add(household(), { id: 'rec-1', title: 'Lease' }));
    const opened = snapshotOfLifeRecord(recordOf(state, 'rec-1'));
    state = only(updateLifeRecord(state, at(), 'rec-1', { note: 'from another device' }));
    const late = updateLifeRecord(state, at(), 'rec-1', { title: 'Old lease' }, opened);
    assert.equal(late.refusal, 'stale');
    assert.equal(recordOf(late.state, 'rec-1').note, 'from another device');
  });

  test('CHILD DISPLAY NAME DOES NOT DEFINE SUBJECT IDENTITY: the subject is the id, whatever the child is called', () => {
    let state = only(add(household(), { id: 'rec-1', title: 'School enrollment', subjectMemberId: 'child-1' }));
    state = { ...state, children: [{ ...CHILD, displayName: 'Josephine' }] };
    assert.equal(recordOf(state, 'rec-1').subjectMemberId, 'child-1');
    assert.equal(validateAppState(state).ok, true);
    const other = { ...state, children: [CHILD, { id: 'child-2', displayName: 'Josie', birthDate: '2018-05-05', scope: 'child' }] };
    assert.equal(recordOf(other, 'rec-1').subjectMemberId, 'child-1', 'another child taking the old name does not take the record');
  });
});

describe('F12 LifeRecord — archive and restore', () => {
  test('ARCHIVED DOES NOT MEAN DESTROYED: archiving keeps the record, its fields and its links, and leaves every Task untouched', () => {
    let state = only(add(household(), { id: 'rec-1', title: 'Old lease', referenceNumber: 'L-1' }));
    state = addLifeRecordTask(state, at(), taskInput({ title: 'Return keys' })).state;
    const taskBefore = state.tasks.find((task) => task.id === 'task-f12-1');
    state = only(archiveLifeRecord(state, at(), 'rec-1'));
    const record = recordOf(state, 'rec-1');
    assert.equal(record.status, 'archived');
    assert.notEqual(record.archivedAt, null);
    assert.equal(record.referenceNumber, 'L-1');
    assert.equal(state.lifeRecords.length, 1);
    assert.equal(state.lifeRecordLinks.length, 1);
    assert.equal(state.tasks.find((task) => task.id === 'task-f12-1'), taskBefore, 'the Task is the same object: not completed, not archived');
    assert.deepEqual(activeLifeRecords(state), []);
    survives(state, 'archived');
  });

  test('an archived record can still be corrected (clear a mistaken reference) and restored; archiving twice is refused', () => {
    let state = only(add(household(), { id: 'rec-1', title: 'Old lease', referenceNumber: 'L-1' }));
    state = only(archiveLifeRecord(state, at(), 'rec-1'));
    assert.equal(archiveLifeRecord(state, at(), 'rec-1').refusal, 'archived');
    state = only(updateLifeRecord(state, at(), 'rec-1', { referenceNumber: '' }));
    assert.equal(recordOf(state, 'rec-1').referenceNumber, null);
    state = only(restoreLifeRecord(state, at(), 'rec-1'));
    assert.equal(recordOf(state, 'rec-1').status, 'active');
    assert.equal(recordOf(state, 'rec-1').archivedAt, null);
    assert.equal(restoreLifeRecord(state, at(), 'rec-1').refusal, 'active');
  });
});

describe('F12 record → Task: one accepted creation, one Task, one link', () => {
  test('saving creates exactly ONE owner-private canonical Task and ONE owner-private link; nothing is inferred onto the Task', () => {
    const base = only(add(household(), { id: 'rec-1', title: 'Passport', subjectMemberId: 'child-1', renewBy: '2026-10-01', expiresOn: '2026-12-01' }));
    const result = addLifeRecordTask(base, at(), taskInput());
    assert.equal(result.refusal, null);
    const { state } = result;
    assert.equal(state.tasks.length, base.tasks.length + 1);
    assert.equal(state.lifeRecordLinks.length, 1);
    const task = state.tasks.find((row) => row.id === 'task-f12-1');
    assert.equal(task.scope, 'personal', 'a private record only ever gets private work');
    assert.equal(task.status, 'open');
    assert.equal(task.categoryId, 'cat-home', 'her explicit category');
    assert.equal(task.subjectMemberId, null, 'the record subject is not copied onto the Task');
    assert.equal(task.dueDate, null, 'the renew-by date is not copied in unless she set it');
    assert.equal(task.durationSource, 'default', 'no minutes stated is the planning default, recorded AS a default');
    const [link] = state.lifeRecordLinks;
    assert.deepEqual({ id: link.id, rec: link.lifeRecordId, task: link.taskId, relation: link.relation, scope: link.scope }, {
      id: 'link-f12-1', rec: 'rec-1', task: 'task-f12-1', relation: 'renewal', scope: 'personal',
    });
    survives(state, 'record + task + link');
  });

  test('a date she chose and minutes she typed are stored as hers', () => {
    const base = only(add(household(), { id: 'rec-1', title: 'Passport', renewBy: '2026-10-01' }));
    const { state } = addLifeRecordTask(base, at(), taskInput({ dueDate: '2026-10-01', minutes: 45 }));
    const task = state.tasks.find((row) => row.id === 'task-f12-1');
    assert.equal(task.dueDate, '2026-10-01');
    assert.equal(task.durationMinutes, 45);
    assert.equal(task.durationSource, 'user');
  });

  test('saving the same draft twice is ONE Task and ONE link; a draft id naming something else is a conflict, not an overwrite', () => {
    const base = only(add(household(), { id: 'rec-1', title: 'Passport' }));
    const first = addLifeRecordTask(base, at(), taskInput());
    const again = addLifeRecordTask(first.state, at(), taskInput());
    assert.equal(again.refusal, 'exists');
    assert.equal(again.state, first.state);
    assert.equal(again.state.tasks.filter((task) => task.id === 'task-f12-1').length, 1);
    assert.equal(again.state.lifeRecordLinks.length, 1);
    assert.equal(addLifeRecordTask(first.state, at(), taskInput({ linkId: 'link-f12-2' })).refusal, 'conflict');
    assert.equal(addLifeRecordTask(first.state, at(), taskInput({ taskId: 'task-f12-2' })).refusal, 'conflict');
  });

  test('refusals create nothing: unknown or archived record, blank title, missing or archived category, bad date or minutes', () => {
    let base = only(add(household(), { id: 'rec-1', title: 'Passport' }));
    base = only(add(base, { id: 'rec-old', title: 'Old passport' }));
    base = only(archiveLifeRecord(base, at(), 'rec-old'));
    const archivedCategory = { ...base.categories[0], id: 'cat-gone', sortOrder: 9000, systemRole: null, status: 'archived' };
    base = { ...base, categories: [...base.categories, archivedCategory] };
    const cases = [
      [{ recordId: 'rec-404' }, 'not-found'],
      [{ recordId: 'rec-old' }, 'archived'],
      [{ title: '  ' }, 'invalid-title'],
      [{ categoryId: 'cat-404' }, 'invalid-category'],
      [{ categoryId: 'cat-gone' }, 'invalid-category'],
      [{ dueDate: '2026-13-01' }, 'invalid-date'],
      [{ minutes: 0 }, 'invalid-minutes'],
      [{ relation: 'auto-renew' }, 'invalid-relation'],
    ];
    for (const [over, refusal] of cases) {
      const result = addLifeRecordTask(base, at(), taskInput(over));
      assert.equal(result.refusal, refusal, JSON.stringify(over));
      assert.equal(result.state, base);
    }
  });

  test('TASK COMPLETED DOES NOT MEAN RECORD UPDATED: completing or archiving the linked Task leaves the record exactly as it was', () => {
    let state = only(add(household(), { id: 'rec-1', title: 'Registration', expiresOn: '2026-09-01', renewBy: '2026-08-20' }));
    state = addLifeRecordTask(state, at(), taskInput()).state;
    const recordBefore = recordOf(state, 'rec-1');
    const completed = completeTask(state, at(), 'task-f12-1');
    assert.equal(recordOf(completed, 'rec-1'), recordBefore, 'same object: no field, date or status moved');
    assert.equal(completed.lifeRecordLinks.length, 1, 'the link stays; nothing re-links');
    assert.equal(openLinkedTaskCount(completed, 'rec-1'), 0, 'done work is not open work');
    const archived = archiveTask(state, at(), 'task-f12-1');
    assert.equal(recordOf(archived, 'rec-1'), recordBefore);
    assert.equal(openLinkedTaskCount(archived, 'rec-1'), 0, 'an archived Task is not active admin work');
    assert.equal(openLinkedTaskCount(state, 'rec-1'), 1);
  });

  test('a link whose Task is not on this device resolves to an unavailable Task, never a crash', () => {
    let state = only(add(household(), { id: 'rec-1', title: 'Registration' }));
    state = addLifeRecordTask(state, at(), taskInput()).state;
    const purged = { ...state, tasks: state.tasks.filter((task) => task.id !== 'task-f12-1') };
    assert.doesNotThrow(() => linkedTasksOf(purged, 'rec-1'), 'a missing Task never crashes the record');
    assert.deepEqual(linkedTasksOf(purged, 'rec-1').map((linked) => linked.task), [null]);
    assert.equal(openLinkedTaskCount(purged, 'rec-1'), 0);
    assert.equal(validateAppState(purged).ok, false, 'the stored-state gate still refuses a dangling link by name');
  });

  test('local integrity refuses a link to a Task that is not owner-private', () => {
    let state = only(add(household(), { id: 'rec-1', title: 'Registration' }));
    state = addLifeRecordTask(state, at(), taskInput()).state;
    const widened = { ...state, tasks: state.tasks.map((task) => (task.id === 'task-f12-1' ? { ...task, scope: 'household' } : task)) };
    const verdict = validateAppState(widened);
    assert.equal(verdict.ok, false);
    assert.match(verdict.issues.join(' '), /not owner-private/);
  });
});

describe('F12 local-first: create, relaunch, edit, archive — all without a network', () => {
  test('a record and its Task survive a relaunch as the same canonical rows; edits and archive persist too', async () => {
    const h = harness({ mode: 'empty' });
    const store = await launch(h);
    assert.equal(await store.commit((state, ctx) => addLifeRecord(state, ctx, { id: 'rec-1', title: 'Passport', kind: 'credential', referenceNumber: 'P-1' }).state), true);
    assert.equal(await store.commit((state, ctx) => addLifeRecordTask(state, ctx, taskInput()).state), true);
    await store.flush();

    const second = await launch(h);
    const relaunched = second.getSnapshot().state;
    assert.equal(relaunched.lifeRecords.length, 1);
    assert.equal(relaunched.lifeRecords[0].id, 'rec-1');
    assert.equal(relaunched.lifeRecords[0].referenceNumber, 'P-1');
    assert.deepEqual(relaunched.lifeRecordLinks.map((link) => [link.lifeRecordId, link.taskId]), [['rec-1', 'task-f12-1']]);
    assert.equal(relaunched.tasks.find((task) => task.id === 'task-f12-1').scope, 'personal');

    await second.commit((state, ctx) => updateLifeRecord(state, ctx, 'rec-1', { title: 'Passport (renewed copy)' }).state);
    await second.commit((state, ctx) => archiveLifeRecord(state, ctx, 'rec-1').state);
    await second.flush();
    const third = (await launch(h)).getSnapshot().state;
    assert.equal(third.lifeRecords[0].id, 'rec-1');
    assert.equal(third.lifeRecords[0].title, 'Passport (renewed copy)');
    assert.equal(third.lifeRecords[0].status, 'archived');
    assert.equal(third.tasks.find((task) => task.id === 'task-f12-1').status, 'open', 'archiving the record did not touch its Task');
  });

  test('a v4 blob written before Life Admin existed loads with no records (the truth for that household), and stays loadable', async () => {
    const legacy = household();
    delete legacy.lifeRecords;
    delete legacy.lifeRecordLinks;
    const verdict = validateAppState(legacy);
    assert.equal(verdict.ok, true);
    assert.deepEqual(verdict.state.lifeRecords, []);
    assert.deepEqual(verdict.state.lifeRecordLinks, []);
  });
});
