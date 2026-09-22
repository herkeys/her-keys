/**
 * HK-FEATURE-05 — what Kids may write (scenarios J, K, L, AM, AN and the truth rules that ride with them).
 * Creates and edits go through the real domain transitions; duration provenance, dependency history and responsibility survive an edit.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addDependency } from '../../src/domain/structure.ts';
import { archiveTask } from '../../src/domain/tasks.ts';
import { validateAppState } from '../../src/domain/state.ts';
import {
  addChildToHousehold,
  commitKids,
  completeChildTask,
  createChildEvent,
  createChildTask,
  editChildEvent,
  editChildTask,
  eventFingerprint,
  eventFormValues,
  kidsCategoryId,
  recordAccepted,
  recordAcknowledged,
  recordDeclined,
  removeChildItem,
  requestHandoff,
  requestHandoffToNewPerson,
  takeBack,
  taskFingerprint,
} from '../../src/features/kids/mutations.ts';
import { buildChildDetail } from '../../src/features/kids/projection.ts';
import { DAY as FIXTURE_DAY, harness, launch } from '../support/fixtures.mjs';
import { NOW, TZ, addEventFor, addTaskFor, askNewPerson, emptyHousehold, idOf, makeCtx, responsibilityOf, withChildren } from './support.mjs';

function world() {
  const c = makeCtx();
  const s = withChildren(emptyHousehold(), c, [['Sam', '2018-03-03'], ['Ivy', '2021-06-10']]);
  return { s, c, sam: idOf(s, 'Sam'), ivy: idOf(s, 'Ivy') };
}
const DRAFT = { dueDate: '', durationText: '', durationTouched: false, notes: '', commitment: 'flexible', handoffToPersonId: null, partOf: null };

describe('J. creating a child-linked task', () => {
  test('writes ONE canonical task: the child as subject, child scope, the kids category, provenance user-action', () => {
    const { s, c, sam } = world();
    const out = createChildTask(s, c, { childId: sam, title: '  Sign the permission slip ', ...DRAFT, dueDate: '2026-09-23', notes: ' bring a pen ' });
    assert.equal(out.outcome, 'created');
    assert.equal(out.state.tasks.length, 1);
    const [t] = out.state.tasks;
    assert.equal(t.title, 'Sign the permission slip');
    assert.equal(t.subjectMemberId, sam);
    assert.equal(t.scope, 'child');
    assert.equal(t.categoryId, kidsCategoryId(out.state));
    assert.equal(out.state.categories.find((k) => k.id === t.categoryId).systemRole, 'kids');
    assert.equal(t.dueDate, '2026-09-23');
    assert.equal(t.notes, 'bring a pen');
    assert.deepEqual(t.provenance, { producer: 'user-action', artifactId: null, confidence: null });
    assert.equal(t.status, 'open');
    assert.equal(validateAppState(out.state).ok, true);
    assert.equal(out.state.tasks.length + out.state.events.length, 1, 'no second "kid item" of any kind');
  });

  test('duration provenance: an untouched prefill is the DEFAULT; touching the field makes it hers - even if it is still 15', () => {
    const { s, c, sam } = world();
    const untouched = createChildTask(s, c, { childId: sam, title: 'A', ...DRAFT, durationText: '15', durationTouched: false }).state.tasks[0];
    const typed = createChildTask(s, c, { childId: sam, title: 'B', ...DRAFT, durationText: '15', durationTouched: true }).state.tasks[0];
    assert.deepEqual([untouched.durationMinutes, untouched.durationSource], [15, 'default']);
    assert.deepEqual([typed.durationMinutes, typed.durationSource], [15, 'user']);
    const other = createChildTask(s, c, { childId: sam, title: 'C', ...DRAFT, durationText: '45', durationTouched: true }).state.tasks[0];
    assert.deepEqual([other.durationMinutes, other.durationSource], [45, 'user']);
  });

  test('every refusal names why and returns the SAME state (nothing is half-written)', () => {
    const { s, c, sam } = world();
    const cases = [
      [{ childId: null, title: 'x' }, 'no_child'],
      [{ childId: 'child-ghost', title: 'x' }, 'unknown_child'],
      [{ childId: sam, title: '   ' }, 'blank_title'],
      [{ childId: sam, title: 'x'.repeat(201) }, 'title_too_long'],
      [{ childId: sam, title: 'x', dueDate: '2026-02-30' }, 'bad_due_date'],
      [{ childId: sam, title: 'x', durationTouched: true, durationText: '' }, 'bad_duration'],
      [{ childId: sam, title: 'x', durationTouched: true, durationText: '12.5' }, 'bad_duration'],
      [{ childId: sam, title: 'x', durationTouched: true, durationText: '1441' }, 'bad_duration'],
      [{ childId: sam, title: 'x', notes: 'n'.repeat(1001) }, 'notes_too_long'],
    ];
    for (const [over, reason] of cases) {
      const out = createChildTask(s, c, { ...DRAFT, ...over });
      assert.equal(out.outcome, reason);
      assert.equal(out.state, s, reason);
      assert.equal(out.taskId, null);
    }
  });

  test('a step is attached to the commitment it belongs to (part_of) - or nothing is written at all', () => {
    const { s, c, sam, ivy } = world();
    const ev = addEventFor(s, c, sam, 'Tuesday pickup');
    const step = createChildTask(ev.state, c, { childId: sam, title: 'Arrange backup pickup', ...DRAFT, partOf: { kind: 'event', id: ev.id } });
    assert.equal(step.outcome, 'created');
    const edge = step.state.dependencies.at(-1);
    assert.deepEqual([edge.relation, edge.from, edge.to, edge.status], ['part_of', { kind: 'task', id: step.taskId }, { kind: 'event', id: ev.id }, 'active']);

    const wrongChild = createChildTask(ev.state, c, { childId: ivy, title: 'x', ...DRAFT, partOf: { kind: 'event', id: ev.id } });
    assert.equal(wrongChild.outcome, 'unknown_parent');
    assert.equal(wrongChild.state, ev.state);
    const missing = createChildTask(ev.state, c, { childId: sam, title: 'x', ...DRAFT, partOf: { kind: 'event', id: 'evt-nope' } });
    assert.equal(missing.outcome, 'unknown_parent');
    assert.equal(missing.state.tasks.length, 0, 'no orphan step');
  });

  test('a handoff at creation is one atomic step; a person who does not exist leaves no task behind', () => {
    const { s, c, sam } = world();
    const bad = createChildTask(s, c, { childId: sam, title: 'x', ...DRAFT, handoffToPersonId: 'person-nobody' });
    assert.equal(bad.outcome, 'unknown_person');
    assert.equal(bad.state, s);

    const seed = addTaskFor(s, c, sam, 'seed');
    const first = askNewPerson(seed.state, c, { kind: 'task', id: seed.id }, 'Alex');
    const ok = createChildTask(first.state, c, { childId: sam, title: 'Costume', ...DRAFT, handoffToPersonId: first.personId });
    assert.equal(ok.outcome, 'created');
    const r = responsibilityOf(ok.state, { kind: 'task', id: ok.taskId });
    assert.deepEqual([r.state, r.responsibleKind, r.stillNeedsMe], ['requested', 'person', true], 'asked - not accepted, not covered');
  });
});

describe('creating a child-linked event', () => {
  test('writes the instants for the household zone, the child as subject and child scope', () => {
    const { s, c, sam } = world();
    const out = createChildEvent(s, c, { childId: sam, title: 'Soccer', date: '2026-09-22', startText: '5:00 PM', endText: '6:15 PM', location: ' Riverside Field ', notes: '', commitment: 'fixed', handoffToPersonId: null });
    assert.equal(out.outcome, 'created');
    const [e] = out.state.events;
    assert.equal(e.startsAt, '2026-09-22T22:00:00.000Z');
    assert.equal(e.endsAt, '2026-09-22T23:15:00.000Z');
    assert.equal(e.location, 'Riverside Field');
    assert.deepEqual([e.subjectMemberId, e.scope, e.status, e.commitment], [sam, 'child', 'active', 'fixed']);
    assert.equal(validateAppState(out.state).ok, true);
    assert.deepEqual(out.timeNotes, { start: null, end: null });
  });

  test('a time that does not exist (spring forward) is adjusted AND reported, never silently absorbed', () => {
    const c = makeCtx(Date.UTC(2026, 2, 7, 15), '2026-03-07');
    const s0 = withChildren(emptyHousehold('America/New_York'), c, [['Sam', '2018-03-03']]);
    const out = createChildEvent(s0, c, { childId: s0.children[0].id, title: 'Early swim', date: '2026-03-08', startText: '2:30 AM', endText: '4:00 AM', location: '', notes: '', commitment: 'fixed', handoffToPersonId: null });
    assert.equal(out.outcome, 'created');
    assert.equal(out.timeNotes.start, 'gap');
    assert.equal(out.state.events[0].startsAt, '2026-03-08T07:30:00.000Z');
  });

  test('a repeated hour (fall back) takes the first and says so', () => {
    const c = makeCtx(Date.UTC(2026, 9, 31, 15), '2026-10-31');
    const s0 = withChildren(emptyHousehold('America/New_York'), c, [['Sam', '2018-03-03']]);
    const out = createChildEvent(s0, c, { childId: s0.children[0].id, title: 'Sleepover pickup', date: '2026-11-01', startText: '1:30 AM', endText: '2:30 AM', location: '', notes: '', commitment: 'fixed', handoffToPersonId: null });
    assert.equal(out.timeNotes.start, 'repeated');
    assert.equal(out.state.events[0].startsAt, '2026-11-01T05:30:00.000Z');
  });

  test('refusals: bad date/time, end not after start, unknown child, over-long text', () => {
    const { s, c, sam } = world();
    const base = { childId: sam, title: 'x', date: '2026-09-22', startText: '5:00 PM', endText: '6:00 PM', location: '', notes: '', commitment: 'fixed', handoffToPersonId: null };
    const cases = [
      [{ date: '2026-13-01' }, 'bad_date'],
      [{ startText: 'five' }, 'bad_start_time'],
      [{ endText: '' }, 'bad_end_time'],
      [{ endText: '5:00 PM' }, 'end_not_after_start'],
      [{ endText: '4:00 PM' }, 'end_not_after_start'],
      [{ childId: 'child-ghost' }, 'unknown_child'],
      [{ childId: null }, 'no_child'],
      [{ title: ' ' }, 'blank_title'],
      [{ location: 'l'.repeat(201) }, 'location_too_long'],
    ];
    for (const [over, reason] of cases) {
      const out = createChildEvent(s, c, { ...base, ...over });
      assert.equal(out.outcome, reason);
      assert.equal(out.state, s, reason);
    }
  });
});

describe('K. editing keeps what the edit does not touch', () => {
  function editable() {
    const { s, c, sam, ivy } = world();
    const t = addTaskFor(s, c, sam, 'Permission slip', { dueDate: '2026-09-23', durationText: '10', durationTouched: true });
    const ref = { kind: 'task', id: t.id };
    const withPerson = askNewPerson(t.state, c, ref);
    const other = addTaskFor(withPerson.state, c, sam, 'Prerequisite');
    const dep = addDependency(other.state, c, { relation: 'requires', from: ref, to: { kind: 'task', id: other.id } });
    const state = dep.state;
    const row = state.tasks.find((x) => x.id === t.id);
    const draft = (over = {}) => ({ taskId: t.id, baseline: taskFingerprint(row), title: row.title, dueDate: row.dueDate ?? '', durationText: String(row.durationMinutes), durationTouched: false, notes: row.notes ?? '', commitment: row.commitment, childId: sam, ...over });
    return { state, c, sam, ivy, id: t.id, ref, row, draft, other };
  }

  test('saving with nothing changed is "unchanged", the same state, and rewrites nothing', () => {
    const { state, c, draft } = editable();
    const out = editChildTask(state, c, draft());
    assert.equal(out.outcome, 'unchanged');
    assert.equal(out.state, state);
  });

  test('a title edit changes the title only: child, scope, category, duration source, dependency and responsibility are untouched', () => {
    const { state, c, id, draft } = editable();
    const out = editChildTask(state, c, draft({ title: 'Signed permission slip' }));
    assert.equal(out.outcome, 'saved');
    const before = state.tasks.find((x) => x.id === id);
    const after = out.state.tasks.find((x) => x.id === id);
    assert.equal(after.title, 'Signed permission slip');
    for (const key of ['subjectMemberId', 'scope', 'categoryId', 'durationMinutes', 'durationSource', 'dueDate', 'status', 'provenance', 'commitment']) {
      assert.deepEqual(after[key], before[key], key);
    }
    assert.deepEqual(out.state.dependencies, state.dependencies, 'dependency history is not rewritten');
    assert.deepEqual(out.state.responsibilities, state.responsibilities, 'an edit cannot upgrade a responsibility');
    assert.equal(validateAppState(out.state).ok, true);
  });

  test('an UNTOUCHED duration is not upgraded to hers - not even a legacy row whose origin was never recorded', () => {
    const { state, c, id, draft } = editable();
    const legacy = { ...state, tasks: state.tasks.map((x) => (x.id === id ? { ...x, durationSource: null } : x)) };
    const row = legacy.tasks.find((x) => x.id === id);
    const out = editChildTask(legacy, c, { ...draft({ title: 'Renamed' }), baseline: taskFingerprint(row) });
    assert.equal(out.outcome, 'saved');
    assert.equal(out.state.tasks.find((x) => x.id === id).durationSource, null, 'unknown stays unknown across a second save');
  });

  test('touching the length makes it hers - even when she confirms the very number that was there', () => {
    const { state, c, id, draft } = editable();
    const defaulted = { ...state, tasks: state.tasks.map((x) => (x.id === id ? { ...x, durationMinutes: 15, durationSource: 'default' } : x)) };
    const row = defaulted.tasks.find((x) => x.id === id);
    const out = editChildTask(defaulted, c, { ...draft({ durationText: '15', durationTouched: true }), baseline: taskFingerprint(row) });
    assert.equal(out.outcome, 'saved');
    const after = out.state.tasks.find((x) => x.id === id);
    assert.deepEqual([after.durationMinutes, after.durationSource], [15, 'user']);
  });

  test('a changed length she typed is hers', () => {
    const { state, c, id, draft } = editable();
    const out = editChildTask(state, c, draft({ durationText: '40', durationTouched: true }));
    const after = out.state.tasks.find((x) => x.id === id);
    assert.deepEqual([after.durationMinutes, after.durationSource], [40, 'user']);
  });

  test('a task can move to a sibling but can never lose its child', () => {
    const { state, c, id, ivy, draft } = editable();
    const moved = editChildTask(state, c, draft({ childId: ivy }));
    assert.equal(moved.state.tasks.find((x) => x.id === id).subjectMemberId, ivy);
    const ghost = editChildTask(state, c, draft({ childId: 'child-ghost' }));
    assert.equal(ghost.outcome, 'unknown_child');
    assert.equal(ghost.state, state);
    const none = editChildTask(state, c, draft({ childId: null }));
    assert.equal(none.state, state, 'no child is refused, not written');
  });

  test('AM. a stale editor cannot overwrite a newer version', () => {
    const { state, c, id, draft } = editable();
    const opened = draft();
    // somebody else (another screen, a pull from another device) changes the task while the editor is open
    const changed = editChildTask(state, c, draft({ title: 'Changed elsewhere' })).state;
    const late = editChildTask(changed, c, { ...opened, title: 'My old edit' });
    assert.equal(late.outcome, 'stale');
    assert.equal(late.state, changed);
    assert.equal(changed.tasks.find((x) => x.id === id).title, 'Changed elsewhere');
  });

  test('a change that stamps no timestamp is still caught (the fingerprint reads content, not only updatedAt)', () => {
    const { state, c, id, draft } = editable();
    const opened = draft();
    const moved = { ...state, tasks: state.tasks.map((x) => (x.id === id ? { ...x, plan: { kind: 'day', date: '2026-09-25' } } : x)) }; // like a Daily Load move
    assert.equal(editChildTask(moved, c, { ...opened, title: 'x' }).outcome, 'stale');
  });

  test('editing something that was completed, removed or never existed is "missing"', () => {
    const { state, c, id, draft } = editable();
    const opened = draft();
    assert.equal(editChildTask(archiveTask(state, c, id), c, opened).outcome, 'missing');
    assert.equal(editChildTask(state, c, { ...opened, taskId: 'task-nope' }).outcome, 'missing');
  });

  test('event edits: untouched times keep their exact stored moment (seconds and all)', () => {
    const { s, c, sam } = world();
    const ev = addEventFor(s, c, sam, 'Piano');
    const preciseStart = '2026-09-22T22:00:07.123Z';
    const precise = { ...ev.state, events: ev.state.events.map((x) => (x.id === ev.id ? { ...x, startsAt: preciseStart } : x)) };
    const row = precise.events[0];
    const shown = eventFormValues(row, TZ);
    const draft = (over = {}) => ({ eventId: ev.id, baseline: eventFingerprint(row), title: row.title, date: shown.date, startText: shown.startText, endText: shown.endText, location: row.location ?? '', notes: row.notes ?? '', commitment: row.commitment, childId: sam, ...over });
    assert.equal(editChildEvent(precise, c, draft()).outcome, 'unchanged');
    const renamed = editChildEvent(precise, c, draft({ title: 'Piano lesson' }));
    assert.equal(renamed.outcome, 'saved');
    assert.equal(renamed.state.events[0].startsAt, preciseStart, 'a title edit did not rewrite the time');
    const moved = editChildEvent(precise, c, draft({ startText: '4:00 PM', endText: '4:45 PM' }));
    assert.equal(moved.state.events[0].startsAt, '2026-09-22T21:00:00.000Z');
    assert.equal(editChildEvent(precise, c, draft({ endText: '4:00 PM' })).outcome, 'end_not_after_start');
    const stale = editChildEvent(moved.state, c, draft({ title: 'old' }));
    assert.equal(stale.outcome, 'stale');
  });
});

describe('remove and complete are not the same thing', () => {
  test('removing a task archives it (REMOVED != COMPLETED): no completion time, and what needed it reads "review"', () => {
    const { s, c, sam } = world();
    const pre = addTaskFor(s, c, sam, 'Prerequisite');
    const dep = addTaskFor(pre.state, c, sam, 'Depends on it');
    const linked = addDependency(dep.state, c, { relation: 'requires', from: { kind: 'task', id: dep.id }, to: { kind: 'task', id: pre.id } }).state;
    const out = removeChildItem(linked, c, { kind: 'task', id: pre.id });
    assert.equal(out.outcome, 'removed');
    const row = out.state.tasks.find((x) => x.id === pre.id);
    assert.deepEqual([row.status, row.completedAt], ['archived', null]);
    const d = buildChildDetail(out.state, out.state.household.id, sam, { nowMs: NOW });
    assert.equal(Object.values(d.openWork).flat().find((i) => i.ref.id === dep.id).dependency.readiness, 'needsReview');
  });

  test('completing records completion; completing something that is not there is "missing"', () => {
    const { s, c, sam } = world();
    const t = addTaskFor(s, c, sam, 'Done soon');
    const out = completeChildTask(t.state, c, t.id);
    assert.equal(out.outcome, 'completed');
    assert.equal(out.state.tasks[0].status, 'completed');
    assert.equal(completeChildTask(out.state, c, t.id).outcome, 'missing');
  });

  test('an event is removed, not deleted; a household-level task is not Kids\' to remove', () => {
    const { s, c, sam } = world();
    const e = addEventFor(s, c, sam, 'Recital');
    assert.equal(removeChildItem(e.state, c, { kind: 'event', id: e.id }).state.events[0].status, 'removed');
    const household = { ...e.state, tasks: [{ ...addTaskFor(s, c, sam, 'x').state.tasks[0], id: 'task-h', subjectMemberId: null, scope: 'household' }] };
    assert.equal(removeChildItem(household, c, { kind: 'task', id: 'task-h' }).outcome, 'missing');
  });
});

describe('responsibility: only the foundation\'s own lifecycle, recorded as she was told', () => {
  function asked() {
    const { s, c, sam } = world();
    const t = addTaskFor(s, c, sam, 'Pick up the costume');
    const ref = { kind: 'task', id: t.id };
    const a = askNewPerson(t.state, c, ref);
    return { s: a.state, c, sam, ref, personId: a.personId, rid: responsibilityOf(a.state, ref).id };
  }

  test('the request makes a person and one live handoff, or nothing: no half-written people', () => {
    const { s, c, sam } = world();
    const t = addTaskFor(s, c, sam, 'x');
    const ref = { kind: 'task', id: t.id };
    const blank = requestHandoffToNewPerson(t.state, c, { ref, name: '  ', relationship: 'co-parent' });
    assert.equal(blank.outcome, 'blank_name');
    assert.equal(blank.state.people.length, 0);
    assert.equal(requestHandoffToNewPerson(t.state, c, { ref, name: 'Alex', relationship: 'overlord' }).outcome, 'bad_relationship');
    const ok = requestHandoffToNewPerson(t.state, c, { ref, name: ' Alex   B ', relationship: 'grandparent' });
    assert.equal(ok.state.people.length, 1);
    assert.equal(ok.state.people[0].displayName, 'Alex B');
    assert.deepEqual([ok.state.people[0].status, ok.state.people[0].relationship, ok.state.people[0].channel], ['active', 'grandparent', 'unspecified']);
    assert.equal(ok.state.responsibilities.length, 1);
    assert.equal(validateAppState(ok.state).ok, true);
  });

  test('one live handoff per thing: a second request is refused, not a second owner', () => {
    const { s, c, ref, personId } = asked();
    const again = requestHandoff(s, c, { ref, personId });
    assert.equal(again.outcome, 'already_held');
    assert.equal(again.state, s);
    assert.equal(s.responsibilities.length, 1);
  });

  test('acknowledge, accept, decline, take back: each is recorded once; a step that does not apply says so', () => {
    const a = asked();
    const ack = recordAcknowledged(a.s, a.c, a.rid);
    assert.equal(ack.outcome, 'recorded');
    assert.equal(recordAcknowledged(ack.state, a.c, a.rid).outcome, 'not_applicable', 'already acknowledged');
    const accepted = recordAccepted(ack.state, a.c, a.rid, false);
    assert.equal(accepted.outcome, 'recorded');
    assert.equal(recordAccepted(accepted.state, a.c, a.rid, true).outcome, 'not_applicable', 'a second accept cannot change the answer');
    assert.equal(recordDeclined(accepted.state, a.c, a.rid).outcome, 'not_applicable', 'accepted cannot be declined');
    const back = takeBack(accepted.state, a.c, a.rid);
    assert.equal(back.outcome, 'recorded');
    assert.equal(back.state.responsibilities.find((r) => r.id === a.rid).state, 'returned');
  });

  test('accepting demands an explicit answer to "does this still need you?": a missing one is refused, so it can never become coverage', () => {
    const a = asked();
    for (const missing of [undefined, null, 'no', 0]) {
      const out = recordAccepted(a.s, a.c, a.rid, missing);
      assert.equal(out.outcome, 'not_applicable');
      assert.equal(out.state, a.s);
    }
  });

  test('Kids acts only on child-linked items: it will not touch a household-level handoff', () => {
    const { s, c, sam } = world();
    const t = addTaskFor(s, c, sam, 'x');
    const ref = { kind: 'task', id: t.id };
    const a = askNewPerson(t.state, c, ref);
    const rid = responsibilityOf(a.state, ref).id;
    const detached = { ...a.state, tasks: a.state.tasks.map((x) => ({ ...x, subjectMemberId: null, scope: 'household' })) };
    assert.equal(recordAcknowledged(detached, c, rid).outcome, 'not_a_child_item');
    assert.equal(recordAcknowledged(a.state, c, 'resp-nope').outcome, 'missing');
    assert.equal(requestHandoff(detached, c, { ref, personId: a.personId }).outcome, 'not_a_child_item');
  });
});

describe('through the real store: outcome, restart, concurrency', () => {
  const store = async () => {
    const h = harness({ mode: 'empty' });
    const s = await launch(h);
    return { h, s };
  };
  const today = FIXTURE_DAY; // 2026-09-16, New York

  test('commitKids reports the OUTCOME: a refused step still "commits" (nothing changed), and only the outcome tells the truth', async () => {
    const { s } = await store();
    const out = await commitKids(s, (state, ctx) => addChildToHousehold(state, ctx, { displayName: '', birthDate: '2018-03-03' }));
    assert.equal(out.committed, true, 'the store saw an unchanged state and resolved true');
    assert.equal(out.result.outcome, 'blank_name');
    assert.equal(s.getSnapshot().state.children.length, 0);
  });

  test('L. child, items, handoff, dependency and duration provenance all survive a restart', async () => {
    const { h, s } = await store();
    const kid = await commitKids(s, (state, ctx) => addChildToHousehold(state, ctx, { displayName: 'Sam', birthDate: '2018-03-03' }));
    const childId = kid.result.childId;
    const a = await commitKids(s, (state, ctx) => createChildTask(state, ctx, { childId, title: 'Sign the slip', ...DRAFT, dueDate: '2026-09-18', durationText: '10', durationTouched: true }));
    const b = await commitKids(s, (state, ctx) => createChildTask(state, ctx, { childId, title: 'Untouched length', ...DRAFT }));
    const e = await commitKids(s, (state, ctx) => createChildEvent(state, ctx, { childId, title: 'Soccer', date: '2026-09-17', startText: '5:00 PM', endText: '6:00 PM', location: 'Field 2', notes: '', commitment: 'fixed', handoffToPersonId: null }));
    const asked = await commitKids(s, (state, ctx) => requestHandoffToNewPerson(state, ctx, { ref: { kind: 'event', id: e.result.eventId }, name: 'Alex', relationship: 'co-parent' }));
    await commitKids(s, (state, ctx) => ({ state: addDependency(state, ctx, { relation: 'requires', from: { kind: 'task', id: a.result.taskId }, to: { kind: 'task', id: b.result.taskId } }).state }));
    await s.flush();
    const before = s.getSnapshot().state;

    const relaunched = await launch(h);
    const after = relaunched.getSnapshot().state;
    assert.deepEqual(after.children, before.children, 'child identity');
    assert.deepEqual(after.tasks.map((t) => [t.id, t.subjectMemberId, t.scope, t.durationMinutes, t.durationSource]), before.tasks.map((t) => [t.id, t.subjectMemberId, t.scope, t.durationMinutes, t.durationSource]));
    assert.deepEqual(after.tasks.map((t) => t.durationSource).sort(), ['default', 'user']);
    assert.deepEqual(after.events, before.events);
    assert.deepEqual(after.responsibilities, before.responsibilities);
    assert.equal(after.responsibilities[0].state, 'requested', 'asked stays asked across a restart');
    assert.deepEqual(after.dependencies, before.dependencies);
    assert.equal(asked.result.outcome, 'requested');
    assert.ok(today);
  });

  test('two saves at once both land and neither is lost (the store runs commits one after another)', async () => {
    const { s } = await store();
    const kid = await commitKids(s, (state, ctx) => addChildToHousehold(state, ctx, { displayName: 'Sam', birthDate: '2018-03-03' }));
    const childId = kid.result.childId;
    const make = (title) => commitKids(s, (state, ctx) => createChildTask(state, ctx, { childId, title, ...DRAFT }));
    const [x, y] = await Promise.all([make('First'), make('Second')]);
    assert.deepEqual([x.result.outcome, y.result.outcome], ['created', 'created']);
    assert.deepEqual(s.getSnapshot().state.tasks.map((t) => t.title).sort(), ['First', 'Second']);
  });

  test('AM. a stale edit through the store is reported stale and changes nothing', async () => {
    const { s } = await store();
    const kid = await commitKids(s, (state, ctx) => addChildToHousehold(state, ctx, { displayName: 'Sam', birthDate: '2018-03-03' }));
    const childId = kid.result.childId;
    const made = await commitKids(s, (state, ctx) => createChildTask(state, ctx, { childId, title: 'Slip', ...DRAFT }));
    const taskId = made.result.taskId;
    const opened = s.getSnapshot().state.tasks.find((t) => t.id === taskId);
    const draft = (title) => ({ taskId, baseline: taskFingerprint(opened), title, dueDate: '', durationText: '15', durationTouched: false, notes: '', commitment: 'flexible', childId });
    const first = await commitKids(s, (state, ctx) => editChildTask(state, ctx, draft('Winner')));
    const second = await commitKids(s, (state, ctx) => editChildTask(state, ctx, draft('Loser')));
    assert.equal(first.result.outcome, 'saved');
    assert.equal(second.result.outcome, 'stale');
    assert.equal(s.getSnapshot().state.tasks.find((t) => t.id === taskId).title, 'Winner');
  });
});
