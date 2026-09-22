/**
 * HK-FEATURE-12 — the Life Admin projection (M4): dates, the bounded Needs Review, the one-category verdict, Coming Up, ordering,
 * the Life hub summary, and the timezone the date rules follow.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addLifeRecord, addLifeRecordTask, archiveLifeRecord } from '../../src/domain/lifeRecords.ts';
import { archiveTask, completeTask } from '../../src/domain/tasks.ts';
import { LIFE_ADMIN_COPY as COPY } from '../../src/features/lifeAdmin/lifeAdminCopy.ts';
import { recordDate } from '../../src/features/lifeAdmin/lifeAdminDates.ts';
import {
  NEEDS_REVIEW_CAP,
  UPCOMING_WINDOW_DAYS,
  buildLifeAdminView,
  buildRecordDetail,
  lifeAdminHubSummary,
  needsReviewOf,
} from '../../src/features/lifeAdmin/lifeAdminView.ts';
import { at, real } from '../support/acceptance.mjs';
import { harness, launch, stored, STORAGE_KEYS } from '../support/fixtures.mjs';

const TODAY = '2026-09-22';
const YESTERDAY = '2026-09-21';
const TOMORROW = '2026-09-23';
const CHILD = { id: 'child-1', displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' };

let n = 0;
const make = (specs, base = { ...real(), children: [CHILD] }) =>
  specs.reduce((state, spec) => {
    const result = addLifeRecord(state, at(Date.UTC(2026, 8, 22, 12) + (n += 1) * 1000, TODAY), { kind: 'other', ...spec });
    assert.equal(result.refusal, null, `${spec.id}: ${result.refusal} ${result.field}`);
    return result.state;
  }, base);
const view = (state, today = TODAY) => buildLifeAdminView(state, today);
const ids = (items) => items.map((item) => item.recordId);

describe('F12 date-only semantics', () => {
  test('EXPIRES TODAY is not PASSED: it is upcoming, and says so factually', () => {
    const v = view(make([{ id: 'r1', title: 'Licence', expiresOn: TODAY }]));
    assert.deepEqual(v.needsReview, []);
    assert.deepEqual(ids(v.comingUp), ['r1']);
    assert.equal(v.comingUp[0].text, COPY.expiresToday);
  });

  test('expired yesterday: the recorded expiration date passed (category 2) — and that is ALL it says', () => {
    const v = view(make([{ id: 'r1', title: 'Licence', expiresOn: YESTERDAY }]));
    assert.equal(v.needsReview.length, 1);
    assert.equal(v.needsReview[0].category, 2);
    assert.equal(v.needsReview[0].text, COPY.expiredOn(recordDate(YESTERDAY)));
    assert.equal(v.verdict, 'One record has passed its recorded expiration date.');
  });

  test('DATE PASSED DOES NOT MEAN LEGALLY INVALID: nothing says invalid, illegal or unusable, and the record stays an ordinary active record', () => {
    const state = make([{ id: 'r1', title: 'Licence', expiresOn: '2020-01-01' }]);
    const v = view(state);
    const detail = buildRecordDetail(state, TODAY, 'r1');
    const words = JSON.stringify({ v, detail });
    assert.equal(/invalid|illegal|unusable|not valid|void|lapsed|cannot legally/i.test(words), false);
    assert.equal(state.lifeRecords[0].status, 'active', 'time passing changes no stored status');
    assert.deepEqual(ids(v.records), ['r1'], 'still on her active list');
    assert.equal(v.archived.length, 0);
  });

  test('renew-by today, renew-by passed, review today, review passed: all category 1, worded factually', () => {
    const v = view(make([
      { id: 'a', title: 'A', renewBy: TODAY },
      { id: 'b', title: 'B', renewBy: '2026-09-10' },
      { id: 'c', title: 'C', reviewOn: TODAY },
      { id: 'd', title: 'D', reviewOn: '2026-09-01' },
    ]));
    assert.deepEqual(v.needsReview.map((item) => [item.recordId, item.category, item.text]), [
      ['d', 1, COPY.reviewWas(recordDate('2026-09-01'))],
      ['b', 1, COPY.renewByWas(recordDate('2026-09-10'))],
      ['a', 1, COPY.renewByToday],
      ['c', 1, COPY.reviewToday],
    ]);
  });

  test('a record with no dates is a quiet record: in Records, never in Needs Review or Coming Up', () => {
    const v = view(make([{ id: 'r1', title: 'Warranty' }]));
    assert.deepEqual(v.needsReview, []);
    assert.deepEqual(v.comingUp, []);
    assert.equal(v.records[0].dateText, null);
    assert.equal(v.verdict, COPY.verdictNothing);
  });

  test('renew-by later than the expiration date is shown as she entered it and raises no warning', () => {
    const state = make([{ id: 'r1', title: 'Permit', expiresOn: '2026-10-01', renewBy: '2026-10-20' }]);
    const detail = buildRecordDetail(state, TODAY, 'r1');
    assert.deepEqual(detail.dates.map((date) => date.key), ['expiresOn', 'renewBy']);
    assert.equal(JSON.stringify(detail).match(/warning|should|must|too late/i), null);
  });
});

describe('F12 Needs Review — bounded and ordered (addendum I)', () => {
  test('category 1 oldest-first, then category 2 oldest-first, then id; at most 3 shown with the rest behind See all', () => {
    const state = make([
      { id: 'e2', title: 'Expired later', expiresOn: '2026-09-20' },
      { id: 'e1', title: 'Expired earlier', expiresOn: '2026-08-01' },
      { id: 'r2', title: 'Renew later', renewBy: '2026-09-15' },
      { id: 'r1b', title: 'Renew same day b', renewBy: '2026-09-01' },
      { id: 'r1a', title: 'Renew same day a', renewBy: '2026-09-01' },
    ]);
    const v = view(state);
    assert.deepEqual(ids(v.needsReview), ['r1a', 'r1b', 'r2', 'e1', 'e2']);
    assert.equal(NEEDS_REVIEW_CAP, 3);
    assert.deepEqual(ids(v.needsReviewShown), ['r1a', 'r1b', 'r2']);
    assert.equal(v.needsReviewMore, 2);
  });

  test('a record appears once, under its highest category, with its OLDEST applicable date', () => {
    const v = view(make([{ id: 'r1', title: 'Both', renewBy: '2026-09-10', reviewOn: '2026-09-01', expiresOn: '2026-08-01' }]));
    assert.equal(v.needsReview.length, 1);
    assert.equal(v.needsReview[0].category, 1);
    assert.equal(v.needsReview[0].date, '2026-09-01');
  });

  test('archived records never ask for review, never come up, and are listed only as archived', () => {
    let state = make([{ id: 'r1', title: 'Old', expiresOn: '2020-01-01', renewBy: '2020-01-01' }, { id: 'r2', title: 'Soon', expiresOn: TOMORROW }]);
    state = archiveLifeRecord(state, at(), 'r1').state;
    state = archiveLifeRecord(state, at(), 'r2').state;
    const v = view(state);
    assert.deepEqual(v.needsReview, []);
    assert.deepEqual(v.comingUp, []);
    assert.deepEqual(v.records, []);
    assert.deepEqual(ids(v.archived), ['r1', 'r2'], 'archived at the same instant: id is the tie-break');
    assert.equal(v.phase, 'records', 'an archived-only household is not "empty": it has records, just none active');
    assert.equal(v.verdict, COPY.verdictNothing);
  });

  test('RENEWAL DUE DOES NOT MEAN RENEWED: completing the linked renewal Task leaves the record needing review', () => {
    let state = make([{ id: 'r1', title: 'Registration', renewBy: '2026-09-01' }]);
    state = addLifeRecordTask(state, at(), { recordId: 'r1', taskId: 'task-r', linkId: 'link-r', relation: 'renewal', title: 'Renew registration', categoryId: 'cat-home' }).state;
    state = completeTask(state, at(), 'task-r');
    const v = view(state);
    assert.deepEqual(ids(v.needsReview), ['r1'], 'a done Task is not a renewed record');
    assert.equal(lifeAdminHubSummary(state, TODAY).value, '1 record needs review.');
  });

  test('an archived or completed linked Task is not active admin work; an open one is', () => {
    let state = make([{ id: 'r1', title: 'Registration' }]);
    state = addLifeRecordTask(state, at(), { recordId: 'r1', taskId: 'task-a', linkId: 'link-a', relation: 'follow_up', title: 'Call', categoryId: 'cat-home' }).state;
    state = addLifeRecordTask(state, at(), { recordId: 'r1', taskId: 'task-b', linkId: 'link-b', relation: 'follow_up', title: 'Email', categoryId: 'cat-home' }).state;
    assert.equal(view(state).records[0].openTaskText, COPY.openTasks(2));
    state = archiveTask(state, at(), 'task-a');
    assert.equal(view(state).records[0].openTaskText, COPY.openTasks(1));
    state = completeTask(state, at(), 'task-b');
    assert.equal(view(state).records[0].openTaskText, null);
    const detail = buildRecordDetail(state, TODAY, 'r1');
    assert.deepEqual(detail.tasks.map((task) => task.standing), [COPY.taskArchived, COPY.taskDone]);
    assert.equal(detail.openTaskCount, 0);
  });

  test('a linked Task that is not on this device is shown as unavailable, never a crash', () => {
    let state = make([{ id: 'r1', title: 'Registration' }]);
    state = addLifeRecordTask(state, at(), { recordId: 'r1', taskId: 'task-x', linkId: 'link-x', relation: 'follow_up', title: 'Call', categoryId: 'cat-home' }).state;
    const purged = { ...state, tasks: state.tasks.filter((task) => task.id !== 'task-x') };
    const detail = buildRecordDetail(purged, TODAY, 'r1');
    assert.deepEqual(detail.tasks.map((task) => [task.title, task.standing, task.open]), [[null, COPY.taskUnavailable, false]]);
    assert.equal(view(purged).records[0].openTaskText, null);
  });
});

describe('F12 verdict — one category, count-aware (addendum J)', () => {
  test('category 1 wins and counts only its own records; categories are never combined', () => {
    const one = view(make([{ id: 'a', title: 'A', renewBy: YESTERDAY }, { id: 'b', title: 'B', expiresOn: YESTERDAY }]));
    assert.equal(one.verdict, 'One record needs review.');
    const many = view(make([{ id: 'a', title: 'A', renewBy: YESTERDAY }, { id: 'c', title: 'C', reviewOn: TODAY }, { id: 'b', title: 'B', expiresOn: YESTERDAY }]));
    assert.equal(many.verdict, '2 records need review.');
  });

  test('category 2 alone: singular and plural', () => {
    assert.equal(view(make([{ id: 'a', title: 'A', expiresOn: YESTERDAY }, { id: 'b', title: 'B', expiresOn: '2026-01-01' }])).verdict, '2 records have passed their recorded expiration dates.');
  });

  test('only upcoming: "Next: title — date." for the soonest explicit date; nothing at all: "Nothing needs review."', () => {
    const v = view(make([{ id: 'a', title: 'Passport', reviewOn: '2026-10-01' }, { id: 'b', title: 'Lease', renewBy: '2026-09-25' }]));
    assert.equal(v.verdict, `Next: Lease — ${recordDate('2026-09-25')}.`);
    assert.equal(view(make([{ id: 'a', title: 'Warranty' }])).verdict, 'Nothing needs review.');
  });
});

describe('F12 Coming Up — the 14-day window (addendum K)', () => {
  test('day 14 is in, day 15 is out; the window is a projection constant', () => {
    assert.equal(UPCOMING_WINDOW_DAYS, 14);
    const v = view(make([{ id: 'in', title: 'In', renewBy: '2026-10-06' }, { id: 'out', title: 'Out', renewBy: '2026-10-07' }]));
    assert.deepEqual(ids(v.comingUp), ['in']);
  });

  test('a record already in Needs Review is not repeated in Coming Up', () => {
    const v = view(make([{ id: 'r1', title: 'Both', renewBy: YESTERDAY, expiresOn: '2026-09-30' }]));
    assert.deepEqual(ids(v.needsReview), ['r1']);
    assert.deepEqual(v.comingUp, []);
  });
});

describe('F12 ordering and identity on the home', () => {
  test('Needs Review first, then upcoming dates, then the rest by most recently updated, id as the tie-break', () => {
    const state = make([
      { id: 'quiet-old', title: 'Quiet old' },
      { id: 'soon', title: 'Soon', expiresOn: '2026-09-30' },
      { id: 'due', title: 'Due', renewBy: YESTERDAY },
      { id: 'quiet-new', title: 'Quiet new' },
    ]);
    assert.deepEqual(ids(view(state).records), ['due', 'soon', 'quiet-new', 'quiet-old']);
    const tied = { ...state, lifeRecords: state.lifeRecords.map((record) => ({ ...record, updatedAt: '2026-09-22T12:00:00.000Z' })) };
    assert.deepEqual(ids(view(tied).records).slice(2), ['quiet-new', 'quiet-old'].sort());
  });

  test('two records with the same title are two rows', () => {
    const v = view(make([{ id: 'r1', title: 'Passport' }, { id: 'r2', title: 'Passport' }]));
    assert.equal(v.records.length, 2);
  });

  test('CHILD DISPLAY NAME DOES NOT DEFINE SUBJECT IDENTITY: a renamed child is shown by her current name, and a missing child is said as missing', () => {
    const state = make([{ id: 'r1', title: 'School enrollment', subjectMemberId: 'child-1' }]);
    assert.equal(view(state).records[0].subjectText, 'Josie');
    const renamed = { ...state, children: [{ ...CHILD, displayName: 'Josephine' }] };
    assert.equal(view(renamed).records[0].subjectText, 'Josephine');
    assert.equal(buildRecordDetail(renamed, TODAY, 'r1').subjectText, 'Josephine');
    const gone = { ...state, children: [] };
    assert.equal(view(gone).records[0].subjectText, COPY.subjectMissing);
  });

  test('the zero-record household is the calm empty state, not a verdict', () => {
    const v = view({ ...real(), children: [CHILD] });
    assert.equal(v.phase, 'empty');
    assert.deepEqual(v.records, []);
  });
});

describe('F12 Life hub summary (addendum T): a count, and nothing that identifies a record', () => {
  test('the three forms', () => {
    const base = { ...real(), children: [CHILD] };
    assert.deepEqual(lifeAdminHubSummary(base, TODAY), { value: 'Nothing needs review.', needsAttention: false });
    assert.deepEqual(lifeAdminHubSummary(make([{ id: 'a', title: 'A' }]), TODAY), { value: '1 record.', needsAttention: false });
    assert.deepEqual(lifeAdminHubSummary(make([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]), TODAY), { value: '2 records.', needsAttention: false });
    assert.deepEqual(lifeAdminHubSummary(make([{ id: 'a', title: 'A', expiresOn: YESTERDAY }, { id: 'b', title: 'B', renewBy: TODAY }]), TODAY), { value: '2 records need review.', needsAttention: true });
  });

  test('no title, type, issuer, reference, location, note or child name reaches the hub', () => {
    const state = make([{ id: 'a', title: 'TITLESENTINEL', typeName: 'TYPESENTINEL', issuerName: 'ISSUERSENTINEL', referenceNumber: 'REF12345678', locationHint: 'LOCSENTINEL', note: 'NOTESENTINEL', subjectMemberId: 'child-1', expiresOn: YESTERDAY }]);
    const text = JSON.stringify(lifeAdminHubSummary(state, TODAY));
    for (const secret of ['TITLESENTINEL', 'TYPESENTINEL', 'ISSUERSENTINEL', '12345678', '5678', 'LOCSENTINEL', 'NOTESENTINEL', 'Josie']) assert.equal(text.includes(secret), false, secret);
  });
});

describe('F12 date source (addendum F): the PROFILE timezone, not the device', () => {
  test('at one instant, a household in Auckland is on the next calendar day: its record has passed while New York is still "expires today"', async () => {
    // 2026-09-16T12:30Z is 00:30 on the 17th in Auckland and 08:30 on the 16th in New York (the test device's zone).
    const instant = Date.UTC(2026, 8, 16, 12, 30);
    const base = { ...real(), user: { ...real().user, timezone: 'Pacific/Auckland' } };
    const withRecord = addLifeRecord(base, at(instant, '2026-09-16'), { id: 'r1', title: 'Licence', kind: 'credential', expiresOn: '2026-09-16' }).state;
    const h = harness({ mode: 'empty', now: instant, initial: { [STORAGE_KEYS.primary]: stored(withRecord) } });
    const store = await launch(h);
    const snapshot = store.getSnapshot();
    assert.equal(snapshot.today, '2026-09-17', 'logical today follows her persisted timezone');
    assert.deepEqual(ids(needsReviewOf(snapshot.state, snapshot.today)), ['r1'], 'in her zone the recorded date has passed');
    assert.deepEqual(needsReviewOf(snapshot.state, '2026-09-16'), [], 'in the device zone it would still be "expires today"');
  });
});
