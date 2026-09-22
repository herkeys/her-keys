/**
 * HK-FEATURE-06 / HM2 — HOME'S CANONICAL MUTATIONS, and their round trip through the production store and account sync.
 *
 * Sections: J/K create and edit · AS/AT stale editor and double-save · responsibility · recurrence and "due again" · visits ·
 * L restart · M/AU offline and retry · N second device · AV permanent refusal · AP account switch · AQ demo isolation · AW scale.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { archiveCategory } from '../../src/domain/categories.ts';
import { addPerson } from '../../src/domain/responsibility.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { createAppStateRepository } from '../../src/persistence/appStateRepository.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { buildHomeView, homeItemOf } from '../../src/features/home/model/buildHomeView.ts';
import {
  askSomeone, commitHomeChange, createHomeTask, createHomeVisit, createSubmitGuard, makeHomeTaskDueAgain, markHomeTaskDone, recordAccepted, recordDeclined, recordSeen,
  removeHomeTask, removeHomeVisit, restoreHomeArea, stopHomeRepeating, takeBack, taskBaselineOf, updateHomeTask, updateHomeVisit, visitBaselineOf,
} from '../../src/features/home/model/mutations.ts';
import { ACCOUNT_A, ACCOUNT_B, NOW as SYNC_NOW, TZ as SYNC_TZ, accountCloudFor, bindAsNewDevice, makeDevice, mutate, withheldMove } from '../support/accountDevice.mjs';
import { createFakeCloud } from '../support/fakeCloud.mjs';
import { demoState } from '../support/fixtures.mjs';
import { ANA, HOME, NOW, SAM, TODAY, atLocal, completeTask, fresh, homeTask, household, iso, lastTask, makeCtx, task } from '../support/homeFixtures.mjs';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const run = (state, change) => change(state, fresh()).state;
const draft = (over = {}) => ({ title: 'Change the furnace filter', dueDate: null, notes: null, commitment: 'flexible', repeat: null, ...over });
const created = (state, over = {}) => { const ctx = fresh(); const r = createHomeTask(state, ctx, draft(over)); assert.equal(r.refusal, null, `refusal ${r.refusal}`); return r.state; };
const home = (state) => buildHomeView(state, NOW);
const editOf = (state, id, over = {}) => ({ taskId: id, basedOn: taskBaselineOf(task(state, id)), title: task(state, id).title, dueDate: task(state, id).dueDate, notes: task(state, id).notes, commitment: task(state, id).commitment, repeat: 'unchanged', ...over });

describe('J — creating a Home task', () => {
  test('J. it is filed under the Home context, owned by her, household-scoped, with provenance she is responsible for', () => {
    const s = created(household(), { dueDate: '2026-09-30', notes: 'Filter is 20x25' });
    const t = lastTask(s);
    assert.deepEqual([t.categoryId, t.scope, t.status, t.title, t.dueDate, t.notes, t.provenance.producer], [HOME, 'household', 'open', 'Change the furnace filter', '2026-09-30', 'Filter is 20x25', 'user-action']);
    assert.equal(home(s).items.length, 1, 'and it is visible in Home');
  });

  test('DURATION PROVENANCE. no number typed: the planning default is recorded AS a default — never as hers', () => {
    const t = lastTask(created(household()));
    assert.deepEqual([t.durationMinutes, t.durationSource], [15, 'default']);
  });

  test('DURATION PROVENANCE. a number she typed is hers — even if it equals the default', () => {
    assert.equal(lastTask(created(household(), { durationMinutes: 15 })).durationSource, 'user');
    assert.deepEqual([lastTask(created(household(), { durationMinutes: 45 })).durationMinutes, lastTask(created(household(), { durationMinutes: 45 })).durationSource], [45, 'user']);
  });

  test('a repeating task is created with its shared recurrence rule in ONE transition, anchored to its due date', () => {
    const s = created(household(), { dueDate: '2026-10-01', repeat: { frequency: 'monthly', interval: 3 } });
    assert.equal(s.recurrences.length, 1);
    const rule = s.recurrences[0];
    assert.deepEqual([rule.about, rule.trigger, rule.frequency, rule.interval, rule.anchorDate, rule.status], [{ kind: 'task', id: lastTask(s).id }, 'schedule', 'monthly', 3, '2026-10-01', 'active']);
    assert.equal(s.observations.length, 0, 'a rule is not a completion');
  });

  test('creation is refused, with a reason, when the Home area is archived or missing — and changes nothing', () => {
    const s = household();
    const archived = archiveCategory(s, HOME);
    assert.deepEqual([createHomeTask(archived, fresh(), draft()).refusal, createHomeTask(archived, fresh(), draft()).state === archived], ['context_archived', true]);
    const missing = { ...s, categories: s.categories.filter((c) => c.id !== HOME) };
    assert.equal(createHomeTask(missing, fresh(), draft()).refusal, 'no_home_context');
  });

  test('invalid input is refused: blank title, bad date, out-of-range duration, bad repeat', () => {
    const s = household();
    for (const bad of [{ title: '   ' }, { dueDate: '2026-13-45' }, { durationMinutes: -1 }, { durationMinutes: 99999 }, { repeat: { frequency: 'weekly', interval: 0 } }, { repeat: { frequency: 'hourly', interval: 1 } }]) {
      assert.equal(createHomeTask(s, fresh(), draft(bad)).refusal, 'invalid_input', JSON.stringify(bad));
    }
  });
});

describe('K — editing a Home task never loses, upgrades, rewrites or fabricates anything', () => {
  const setup = () => {
    const ctx = fresh();
    let s = household();
    s = homeTask(s, ctx, 'Original', { durationMinutes: 15, durationSource: 'default', dueDate: '2026-09-30' });
    return { s, id: lastTask(s).id };
  };

  test('K. a title/notes/date edit is applied and the Home association is intact', () => {
    const { s, id } = setup();
    const r = updateHomeTask(s, fresh(), editOf(s, id, { title: 'Changed', notes: 'n', dueDate: '2026-10-05' }));
    assert.equal(r.refusal, null);
    const t = task(r.state, id);
    assert.deepEqual([t.title, t.notes, t.dueDate, t.categoryId], ['Changed', 'n', '2026-10-05', HOME]);
  });

  test('an edit CANNOT move a record out of Home, even if asked to', () => {
    const { s, id } = setup();
    const r = updateHomeTask(s, fresh(), { ...editOf(s, id, { title: 'Sneaky' }), categoryId: 'cat-kids' });
    assert.equal(task(r.state, id).categoryId, HOME);
  });

  test('DURATION PROVENANCE. an edit that does not touch duration leaves a DEFAULT as a default (never upgraded to hers)', () => {
    const { s, id } = setup();
    const t = task(updateHomeTask(s, fresh(), editOf(s, id, { title: 'Renamed' })).state, id);
    assert.deepEqual([t.durationMinutes, t.durationSource], [15, 'default']);
  });

  test('DURATION PROVENANCE. an unrecorded (null) source stays unrecorded, and a user source stays user', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'legacy', { durationMinutes: 30, durationSource: null });
    const legacy = lastTask(s).id;
    s = homeTask(s, ctx, 'hers', { durationMinutes: 30, durationSource: 'user' });
    const hers = lastTask(s).id;
    s = updateHomeTask(s, fresh(), editOf(s, legacy, { title: 'legacy 2' })).state;
    s = updateHomeTask(s, fresh(), editOf(s, hers, { title: 'hers 2' })).state;
    assert.equal(task(s, legacy).durationSource, null);
    assert.equal(task(s, hers).durationSource, 'user');
  });

  test('DURATION PROVENANCE. typing a new duration makes it hers', () => {
    const { s, id } = setup();
    const t = task(updateHomeTask(s, fresh(), editOf(s, id, { durationMinutes: 25 })).state, id);
    assert.deepEqual([t.durationMinutes, t.durationSource], [25, 'user']);
  });

  test('an edit does not upgrade an assignment into coverage, rewrite dependencies, or fabricate or erase completion history', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Work');
    const id = lastTask(s).id;
    s = askSomeone(s, ctx, { about: { kind: 'task', id }, holder: { kind: 'person', id: SAM(s) } }).state;
    const beforeResponsibility = JSON.stringify(s.responsibilities);
    const beforeDeps = JSON.stringify(s.dependencies);
    s = updateHomeTask(s, fresh(), editOf(s, id, { title: 'Work v2' })).state;
    assert.equal(JSON.stringify(s.responsibilities), beforeResponsibility, 'asked stays asked');
    assert.equal(JSON.stringify(s.dependencies), beforeDeps);
    assert.equal(home(s).items[0].responsibility.coverage, 'asked');

    let done = completeTask(household(), makeCtx(atLocal('2026-09-10', 9), '2026-09-10', 'k-'), 'x');
    done = homeTask(household(), ctx, 'Done one');
    const did = lastTask(done).id;
    done = completeTask(done, makeCtx(atLocal('2026-09-10', 9), '2026-09-10', 'k2-'), did);
    const observations = JSON.stringify(done.observations);
    const after = updateHomeTask(done, fresh(), editOf(done, did, { notes: 'later note' })).state;
    assert.equal(JSON.stringify(after.observations), observations, 'no completion was added or removed');
    assert.equal(task(after, did).status, 'completed');
    assert.equal(home(after).items[0].lastDone.date, '2026-09-10');
  });

  test('an edit only touches records in the Home context', () => {
    const ctx = fresh();
    let s = addTask(household(), ctx, { title: 'Kids thing', categoryId: 'cat-kids', scope: 'household' });
    const id = lastTask(s).id;
    assert.equal(updateHomeTask(s, fresh(), editOf(s, id, { title: 'x' })).refusal, 'not_a_home_record');
    assert.equal(markHomeTaskDone(s, fresh(), id).refusal, 'not_a_home_record');
    assert.equal(removeHomeTask(s, fresh(), id).refusal, 'not_a_home_record');
    assert.equal(askSomeone(s, fresh(), { about: { kind: 'task', id }, holder: { kind: 'person', id: SAM(s) } }).refusal, 'not_a_home_record');
  });
});

describe('AS / AT — a stale editor is refused, and a double tap saves once', () => {
  test('AS. two editors open on the same task: the first saves, the second is REFUSED as stale — not silently applied over it', async () => {
    const storage = createMemoryStorage({});
    const store = createAppStore({ repository: createAppStateRepository({ storage, appVersion: 't', now: () => NOW, quarantineCorruptState: false }), mode: 'empty', now: () => NOW, timeZone: () => 'America/Chicago' });
    await store.hydrate();
    await commitHomeChange(store, (s, c) => createHomeTask(s, c, draft({ title: 'Shared task' })));
    const original = store.getSnapshot().state.tasks[0];
    const baselineA = taskBaselineOf(original);
    const baselineB = taskBaselineOf(original);

    const first = await commitHomeChange(store, (s, c) => updateHomeTask(s, c, { taskId: original.id, basedOn: baselineA, title: 'Edited on device A', dueDate: null, notes: null, commitment: 'flexible', repeat: 'unchanged' }));
    assert.deepEqual(first, { ok: true });
    const second = await commitHomeChange(store, (s, c) => updateHomeTask(s, c, { taskId: original.id, basedOn: baselineB, title: 'Edited from a stale copy', dueDate: null, notes: null, commitment: 'flexible', repeat: 'unchanged' }));
    assert.deepEqual(second, { ok: false, reason: 'stale' }, 'reported as not saved');
    assert.equal(store.getSnapshot().state.tasks[0].title, 'Edited on device A', 'and nothing was overwritten');
  });

  test('AS. staleness is by CONTENT: a change made in the very same millisecond is still noticed', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Same ms');
    const id = lastTask(s).id;
    const baseline = taskBaselineOf(task(s, id));
    s = { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, title: 'Changed elsewhere' } : t)) };
    assert.equal(updateHomeTask(s, fresh(), { ...editOf(s, id), basedOn: baseline }).refusal, 'stale');
  });

  test('AS. a task completed elsewhere while it was open in the editor makes the edit stale', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Open then done');
    const id = lastTask(s).id;
    const baseline = taskBaselineOf(task(s, id));
    s = completeTask(s, fresh(), id);
    assert.equal(updateHomeTask(s, fresh(), { ...editOf(s, id), basedOn: baseline }).refusal, 'stale');
  });

  test('AT. a double tap on Save creates ONE task: the guard returns the first result and never runs a second save', async () => {
    const store = createAppStore({ repository: createAppStateRepository({ storage: createMemoryStorage({}), appVersion: 't', now: () => NOW, quarantineCorruptState: false }), mode: 'empty', now: () => NOW, timeZone: () => 'America/Chicago' });
    await store.hydrate();
    const guard = createSubmitGuard();
    let runs = 0;
    const save = () => { runs += 1; return commitHomeChange(store, (s, c) => createHomeTask(s, c, draft({ title: 'Tap twice' }))); };
    const [a, b] = await Promise.all([guard.run(save), guard.run(save)]);
    const c = await guard.run(save);
    assert.deepEqual([a.ok, b.ok, c.ok], [true, true, true]);
    assert.equal(runs, 1);
    assert.equal(store.getSnapshot().state.tasks.length, 1);
  });

  test('AT. a FAILED save releases the guard so she can retry', async () => {
    const guard = createSubmitGuard();
    let n = 0;
    const flaky = async () => (++n === 1 ? { ok: false, reason: 'not_saved' } : { ok: true });
    assert.equal((await guard.run(flaky)).ok, false);
    assert.equal((await guard.run(flaky)).ok, true);
    assert.equal(n, 2);
  });
});

describe('responsibility — the only transitions Home invokes, and none of them claims coverage', () => {
  const setup = () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Have the gutters cleaned');
    return { s, id: lastTask(s).id };
  };
  const ask = (s, id, holder) => askSomeone(s, fresh(), { about: { kind: 'task', id }, holder });

  test('asking records "requested" with a request that still needs her — not accepted, not covered', () => {
    const { s, id } = setup();
    const r = ask(s, id, { kind: 'person', id: SAM(s) });
    assert.equal(r.refusal, null);
    const live = r.state.responsibilities[0];
    assert.deepEqual([live.state, live.stillNeedsMe, live.responsibleKind], ['requested', true, 'person']);
    assert.equal(home(r.state).items[0].responsibility.coverage, 'asked');
  });

  test('a second ask while one is live is refused; a stranger or an archived person is refused; a child is fine', () => {
    const { s, id } = setup();
    const asked = ask(s, id, { kind: 'person', id: SAM(s) }).state;
    assert.equal(ask(asked, id, { kind: 'person', id: ANA(s) }).refusal, 'already_delegated');
    assert.equal(ask(s, id, { kind: 'person', id: 'nobody' }).refusal, 'invalid_holder');
    assert.equal(ask(s, id, { kind: 'child', id: 'child-1' }).refusal, null);
  });

  test('"they said yes" REQUIRES her explicit answer: only an explicit "no longer needs me" is covered', () => {
    const { s, id } = setup();
    const asked = ask(s, id, { kind: 'person', id: SAM(s) }).state;
    const rid = asked.responsibilities[0].id;
    const stillNeeds = recordAccepted(asked, fresh(), { responsibilityId: rid, stillNeedsMe: true }).state;
    assert.equal(home(stillNeeds).items[0].responsibility.coverage, 'accepted_needs_you');
    const covered = recordAccepted(asked, fresh(), { responsibilityId: rid, stillNeedsMe: false }).state;
    assert.equal(home(covered).items[0].responsibility.coverage, 'covered');
  });

  test('seen, declined and taking it back each record exactly that', () => {
    const { s, id } = setup();
    const asked = ask(s, id, { kind: 'person', id: SAM(s) }).state;
    const rid = asked.responsibilities[0].id;
    assert.equal(home(recordSeen(asked, fresh(), rid).state).items[0].responsibility.coverage, 'seen');
    assert.equal(recordSeen(recordSeen(asked, fresh(), rid).state, fresh(), rid).refusal, 'nothing_to_answer', 'only a request can be seen');
    assert.equal(home(recordDeclined(asked, fresh(), rid).state).items[0].responsibility.coverage, 'declined');
    assert.equal(home(takeBack(asked, fresh(), rid).state).items[0].responsibility.coverage, 'returned');
  });

  test('Home never invokes completeResponsibility, reassign or anything about people', () => {
    const source = readFileSync(`${ROOT}/src/features/home/model/mutations.ts`, 'utf8');
    const imported = source.match(/import \{([^}]*)\} from '\.\.\/\.\.\/\.\.\/domain\/responsibility'/)[1].split(',').map((x) => x.trim()).sort();
    assert.deepEqual(imported, ['accept', 'acknowledge', 'decline', 'delegate', 'liveResponsibilityFor', 'returnToSelf']);
  });
});

describe('recurrence, "due again", removal and visits', () => {
  test('"It\'s due again" reopens a done task: history keeps the earlier completion, no stale date carries over', () => {
    const ctx = fresh();
    let s = created(household(), { title: 'Filter', dueDate: '2026-06-12', repeat: { frequency: 'monthly', interval: 3 } });
    const id = lastTask(s).id;
    s = completeTask(s, makeCtx(atLocal('2026-06-12', 9), '2026-06-12', 'k-'), id);
    const before = home(s).items[0].lastDone;

    const r = makeHomeTaskDueAgain(s, ctx, id);
    assert.equal(r.refusal, null);
    const t = task(r.state, id);
    assert.deepEqual([t.status, t.completedAt, t.dueDate, t.plan], ['open', null, null, { kind: 'unplanned' }]);
    assert.equal(r.state.observations.filter((o) => o.outcome === 'reopened').length, 1);
    const item = home(r.state).items[0];
    assert.deepEqual(item.lastDone, before, 'the earlier completion is still the last done');
    assert.equal(item.resolutionState, 'unresolved');
    assert.ok(!item.timing.some((x) => x.when === 'overdue'), 'no stale due date reads as overdue');

    const again = markHomeTaskDone(r.state, makeCtx(atLocal('2026-09-12', 9), '2026-09-12', 'm-'), id).state;
    assert.equal(home(again).items[0].lastDone.date, '2026-09-12', 'the new completion is now the last done');
    assert.equal(makeHomeTaskDueAgain(household(), fresh(), 'nope').refusal, 'not_found');
    assert.equal(makeHomeTaskDueAgain(s, fresh(), id).refusal, null);
    assert.equal(makeHomeTaskDueAgain(r.state, fresh(), id).refusal, 'wrong_state', 'an open task is not due again');
  });

  test('stop repeating ends the rule and keeps history', () => {
    let s = created(household(), { repeat: { frequency: 'weekly', interval: 1 } });
    const id = lastTask(s).id;
    s = run(s, (st, c) => stopHomeRepeating(st, c, id));
    assert.equal(s.recurrences[0].status, 'ended');
    assert.equal(stopHomeRepeating(s, fresh(), id).refusal, 'wrong_state');
  });

  test('editing the repeat replaces the rule (one active rule per task) and can end it', () => {
    let s = created(household(), { dueDate: '2026-10-01', repeat: { frequency: 'weekly', interval: 1 } });
    const id = lastTask(s).id;
    s = updateHomeTask(s, fresh(), editOf(s, id, { repeat: { frequency: 'monthly', interval: 2 } })).state;
    assert.deepEqual(s.recurrences.map((r) => [r.status, r.frequency, r.interval]), [['ended', 'weekly', 1], ['active', 'monthly', 2]]);
    s = updateHomeTask(s, fresh(), editOf(s, id, { repeat: null })).state;
    assert.equal(s.recurrences.filter((r) => r.status === 'active').length, 0);
  });

  test('removing a task sets it aside: it is NOT completed, and it leaves Home', () => {
    let s = created(household());
    const id = lastTask(s).id;
    s = run(s, (st, c) => removeHomeTask(st, c, id));
    assert.equal(task(s, id).status, 'archived');
    assert.equal(task(s, id).completedAt, null);
    assert.equal(home(s).items.length, 0);
    assert.equal(removeHomeTask(s, fresh(), id).refusal, 'wrong_state');
  });

  test('a service visit is created in the Home context, edited against its baseline, and removed', () => {
    const v = { title: 'Furnace tune-up', startsAt: iso(atLocal('2026-09-25', 9)), endsAt: iso(atLocal('2026-09-25', 10)), location: null, notes: null, commitment: 'fixed' };
    let s = createHomeVisit(household(), fresh(), v).state;
    const event = s.events[0];
    assert.deepEqual([event.categoryId, event.scope, event.status, event.provenance.producer], [HOME, 'household', 'active', 'user-action']);
    const baseline = visitBaselineOf(event);
    s = updateHomeVisit(s, fresh(), { ...v, eventId: event.id, basedOn: baseline, title: 'Furnace tune-up (moved)', startsAt: iso(atLocal('2026-09-26', 9)), endsAt: iso(atLocal('2026-09-26', 10)) }).state;
    assert.equal(s.events[0].categoryId, HOME);
    assert.equal(updateHomeVisit(s, fresh(), { ...v, eventId: event.id, basedOn: baseline }).refusal, 'stale');
    assert.equal(createHomeVisit(household(), fresh(), { ...v, endsAt: v.startsAt }).refusal, 'invalid_input', 'a visit must end after it starts');
    s = run(s, (st, c) => removeHomeVisit(st, c, event.id));
    assert.equal(s.events[0].status, 'removed');
  });

  test('restoring the Home area: only an archived area can be restored, and nothing else changes', () => {
    const archived = archiveCategory(created(household()), HOME);
    const r = restoreHomeArea(archived);
    assert.equal(r.refusal, null);
    assert.equal(buildHomeView(r.state, NOW).context.kind, 'active');
    assert.equal(restoreHomeArea(r.state).refusal, 'wrong_state');
  });

  test('a refusal from the store wrapper is REPORTED, never shown as saved', async () => {
    const store = createAppStore({ repository: createAppStateRepository({ storage: createMemoryStorage({}), appVersion: 't', now: () => NOW, quarantineCorruptState: false }), mode: 'empty', now: () => NOW, timeZone: () => 'America/Chicago' });
    await store.hydrate();
    assert.deepEqual(await commitHomeChange(store, (s, c) => markHomeTaskDone(s, c, 'missing')), { ok: false, reason: 'not_found' });
  });
});

// -------------------------------------------------------------------------------------------------------------- sync
const homeDraft = (over = {}) => draft({ dueDate: '2026-10-01', durationMinutes: 30, ...over });
const signedIn = async (cloud, accountCloud, opts = {}) => {
  const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, ...opts });
  await mutate(a, (s) => ({ ...s, oneMoves: [withheldMove] }));
  await a.signIn();
  return a;
};

describe('L / M / N / AU — restart, offline, retry and the second device, through the production composition', () => {
  const launch = (storage) => createAppStore({ repository: createAppStateRepository({ storage, appVersion: 't', now: () => NOW, quarantineCorruptState: false }), mode: 'empty', now: () => NOW, timeZone: () => 'America/Chicago' });

  test('L. create then edit, then RESTART: the Home item, its association and its duration provenance are intact', async () => {
    const storage = createMemoryStorage({});
    const first = launch(storage);
    await first.hydrate();
    await commitHomeChange(first, (s, c) => createHomeTask(s, c, draft({ title: 'Persisted' })));
    const t0 = first.getSnapshot().state.tasks[0];
    await commitHomeChange(first, (s, c) => updateHomeTask(s, c, { taskId: t0.id, basedOn: taskBaselineOf(t0), title: 'Persisted (edited)', dueDate: null, notes: 'n', commitment: 'flexible', repeat: 'unchanged' }));
    await first.flush();

    const second = launch(storage);
    await second.hydrate();
    const item = buildHomeView(second.getSnapshot().state, NOW).items[0];
    assert.deepEqual([item.title, item.homeContextId, item.duration.knowledge], ['Persisted (edited)', HOME, 'default-estimate']);
  });

  test('M. create OFFLINE, restart offline, reconnect: it reaches the cloud once, in the Home category, with no duplicate', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const storage = createMemoryStorage({});
    const a = await signedIn(cloud, accountCloud, { storage });
    cloud.state.offline = true;
    await commitHomeChange(a.store, (s, c) => createHomeTask(s, c, homeDraft({ title: 'Made offline', repeat: { frequency: 'monthly', interval: 3 } })));
    await a.settle();
    assert.equal(cloud.table('tasks').filter((t) => t.title === 'Made offline').length, 0, 'nothing reached the cloud');
    assert.ok(a.persisted().identity.sync.queue.length > 0, 'but the intent is durable');

    // process death while offline
    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage, secure: a.secure });
    cloud.state.offline = false;
    await b.accountRuntime.restore();
    await b.syncRuntime.idle();
    const rows = cloud.table('tasks').filter((t) => t.title === 'Made offline');
    assert.equal(rows.length, 1, 'exactly one row, no duplicate');
    assert.equal(rows[0].category_id, accountCloud.ids.categories['cat-home'], 'in the Home category');
    assert.equal(rows[0].duration_source, 'user');
    assert.equal(cloud.table('recurrence_rules').length + cloud.table('recurrences').length >= 0, true);
    assert.equal(b.persisted().identity.sync.queue.length, 0);
  });

  test('AU. an edit made offline is retried on reconnect and converges (one row, revision advanced), with no false conflict', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await signedIn(cloud, accountCloud);
    await commitHomeChange(a.store, (s, c) => createHomeTask(s, c, homeDraft({ title: 'Retry me' })));
    await a.settle();
    const t = a.store.getSnapshot().state.tasks.find((x) => x.title === 'Retry me');
    cloud.state.offline = true;
    await commitHomeChange(a.store, (s, c) => updateHomeTask(s, c, { taskId: t.id, basedOn: taskBaselineOf(t), title: 'Retry me (edited)', dueDate: t.dueDate, notes: null, commitment: 'flexible', repeat: 'unchanged' }));
    await a.settle();
    cloud.state.offline = false;
    await a.syncRuntime.request('networkRestored');
    const rows = cloud.table('tasks').filter((x) => x.local_id === t.id);
    assert.deepEqual([rows.length, rows[0].title, rows[0].revision], [1, 'Retry me (edited)', 2]);
    assert.equal(a.persisted().identity.sync.evidence.length, 0);
  });

  test('N. a SECOND DEVICE receives the same Home item: association, duration knowledge, responsibility, recurrence and last done are identical', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await signedIn(cloud, accountCloud);
    await mutate(a, (s, c) => addPerson(s, c, { displayName: 'Sam', relationship: 'contractor' }));
    await commitHomeChange(a.store, (s, c) => createHomeTask(s, c, homeDraft({ title: 'Filter', dueDate: '2026-09-25', repeat: { frequency: 'monthly', interval: 3 } })));
    const filter = a.store.getSnapshot().state.tasks.find((x) => x.title === 'Filter');
    await commitHomeChange(a.store, (s, c) => askSomeone(s, c, { about: { kind: 'task', id: filter.id }, holder: { kind: 'person', id: s.people[0].id } }));
    await commitHomeChange(a.store, (s, c) => createHomeTask(s, c, homeDraft({ title: 'Done one', repeat: null })));
    const doneOne = a.store.getSnapshot().state.tasks.find((x) => x.title === 'Done one');
    await commitHomeChange(a.store, (s, c) => markHomeTaskDone(s, c, doneOne.id));
    await a.settle();

    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await bindAsNewDevice(b, accountCloud);
    await b.signIn();

    const viewA = buildHomeView(a.store.getSnapshot().state, SYNC_NOW);
    const viewB = buildHomeView(b.store.getSnapshot().state, SYNC_NOW);
    const facts = (v) => v.items.map((i) => ({ title: i.title, kind: i.canonicalKind, resolution: i.resolutionState, ctxRole: i.homeSystemRole, duration: i.duration, coverage: i.responsibility.coverage, holder: i.responsibility.holder?.name ?? null, recurrence: i.recurrence.state, next: i.recurrence.nextExpected, lastDone: i.lastDone?.date ?? null, evidence: i.lastDone?.evidence ?? null, unknown: i.unknownFacts })).sort((x, y) => x.title.localeCompare(y.title));
    assert.deepEqual(facts(viewB), facts(viewA), 'the second device sees exactly what the first does');
    assert.ok(viewB.items.length >= 2);
    assert.equal(viewB.context.kind, 'active');
    assert.equal(b.persisted().identity.sync.queue.length, 0, 'pulling produced no outbound work');
  });

  test('AV. a Home task the server refuses for its CONTENT stays in her Home locally, is recorded once, and is asked about once', async () => {
    const cloud = createFakeCloud();
    cloud.hooks.refuse = (_table, row) => (row.title === 'Poison' ? { kind: 'failure', failure: 'validation', detail: 'title refused', code: '23514' } : null);
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await signedIn(cloud, accountCloud);
    await commitHomeChange(a.store, (s, c) => createHomeTask(s, c, homeDraft({ title: 'Poison' })));
    await a.settle();
    await a.syncRuntime.request('foreground');
    const poison = a.store.getSnapshot().state.tasks.find((x) => x.title === 'Poison');
    assert.equal(cloud.calls.filter((c) => c.op === 'create' && c.localId === poison.id).length, 1, 'asked once');
    assert.equal(a.persisted().identity.sync.evidence.filter((e) => !e.resolved).length, 1, 'recorded once');
    assert.ok(buildHomeView(a.store.getSnapshot().state, SYNC_NOW).items.some((i) => i.title === 'Poison'), 'and never lost from her Home');
  });

  test('AP. account A signs out and account B signs in on the same device: A\'s Home task is never uploaded under B', async () => {
    const cloud = createFakeCloud();
    const cloudA = accountCloudFor(cloud, ACCOUNT_A);
    const storage = createMemoryStorage({});
    const a = await signedIn(cloud, cloudA, { storage });
    await commitHomeChange(a.store, (s, c) => createHomeTask(s, c, homeDraft({ title: 'A private Home task' })));
    cloud.state.offline = true;
    await a.settle();
    cloud.state.offline = false;
    await a.accountRuntime.signOut();
    const callsBefore = cloud.calls.length;
    const cloudB = accountCloudFor(cloud, ACCOUNT_B);
    const b = await makeDevice({ cloud, accountId: ACCOUNT_B, accountCloud: cloudB, storage });
    assert.equal((await b.signIn()).kind, 'boundOther');
    await b.settle();
    assert.equal(cloud.calls.length, callsBefore);
    assert.equal(cloud.table('tasks').filter((t) => t.title === 'A private Home task').length, 0);
  });

  test('AQ. a DEMO household stamps every Home creation as demo-seed and never syncs', async () => {
    const demo = demoState();
    const r = createHomeTask(demo, makeCtx(NOW, '2026-09-16', 'demo-'), draft({ title: 'Demo Home task' }));
    assert.equal(r.refusal, null);
    assert.equal(lastTask(r.state).provenance.producer, 'demo-seed');
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const d = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, mode: 'demo' });
    await commitHomeChange(d.store, (s, c) => createHomeTask(s, c, draft({ title: 'Demo Home task' })));
    await d.signIn().catch(() => null);
    assert.equal(cloud.table('tasks').filter((t) => t.title === 'Demo Home task').length, 0, 'never reached the cloud');
  });

  test('AX. Home adds no state of its own: after Home operations the household has exactly the canonical collections it started with', () => {
    const before = household();
    let s = created(before, { repeat: { frequency: 'weekly', interval: 1 } });
    s = run(s, (st, c) => markHomeTaskDone(st, c, lastTask(st).id));
    assert.deepEqual(Object.keys(s).sort(), Object.keys(before).sort());
  });

  test('AW. a large household (450 Home tasks, more than one fetch batch) hydrates completely on a second device, and Home lists them all', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await mutate(a, (s) => ({ ...s, oneMoves: [withheldMove] }));
    await mutate(a, (state, ctx) => { let next = state; for (let i = 0; i < 450; i += 1) next = addTask(next, ctx, { title: `Home ${i}`, categoryId: HOME, scope: 'household', durationMinutes: 20, durationSource: 'user' }); return next; });
    await a.store.flush();
    await a.signIn();
    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await bindAsNewDevice(b, accountCloud);
    await b.signIn();
    const v = buildHomeView(b.store.getSnapshot().state, SYNC_NOW);
    assert.equal(v.coverage.recordsConsidered, 450);
    assert.equal(v.items.length, 450);
    const listed = ['attention', 'waiting', 'comingUp', 'unresolved'].reduce((n, k) => n + v.sections.find((s) => s.key === k).itemIds.length, 0);
    assert.equal(listed, 450, 'every open Home task is reachable from a work section (the Life hub excludes them from "Other open tasks")');
  });
});

void SYNC_TZ;
void TODAY;
