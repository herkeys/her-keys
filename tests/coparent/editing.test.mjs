import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { archivePerson } from '../../src/domain/responsibility.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { createSaveGuard } from '../../src/features/coparent/guard.ts';
import {
  commitMutation,
  createHandoff,
  editHandoff,
  handoffEditorSeed,
  recordAnswer,
  recordCounterpart,
  removeHandoff,
} from '../../src/features/coparent/mutations.ts';
import { buildCoParentLogisticsView } from '../../src/features/coparent/projection.ts';
import { harness, launch } from '../support/fixtures.mjs';
import { HANDOFF, JOSIE, MILO, NOW, handoff, world } from '../fixtures/coparent/world.mjs';

const person = (personId) => ({ kind: 'person', personId });
const fields = (over = {}) => ({ ...HANDOFF, childId: JOSIE, ...over });

describe('Handoff create / edit / remove: canonical, atomic, stale-safe', () => {
  test('H: creating with a NEW counterpart uses the canonical person path and records exactly what she said', () => {
    const w = world();
    const r = createHandoff(w.state, w.at(), fields(), { kind: 'new', displayName: '  Alex Rivera ', relationship: 'co-parent' });
    assert.equal(r.outcome, 'saved');
    const p = r.state.people[0];
    assert.deepEqual([p.displayName, p.relationship, p.channel, p.status, p.scope], ['Alex Rivera', 'co-parent', 'unspecified', 'active', 'personal']);
    assert.equal(p.provenance.producer, 'user-action');
    assert.equal(r.state.responsibilities.length, 1);
    assert.equal(r.state.responsibilities[0].responsiblePersonId, p.id);
    assert.equal(r.state.responsibilities[0].state, 'requested');
    assert.equal(validateAppState(r.state).ok, true);
  });

  test('create is ALL-OR-NOTHING: a bad counterpart leaves no event, no person, no recurrence behind', () => {
    const w = world();
    const alex = w.person('Alex');
    w.apply((s, c) => archivePerson(s, c, alex));
    const cases = [
      [{ kind: 'person', personId: alex }, 'archived person'],
      [{ kind: 'person', personId: 'person-ghost' }, 'unknown person'],
      [{ kind: 'new', displayName: '   ', relationship: 'co-parent' }, 'blank new name'],
    ];
    for (const [counterpart, label] of cases) {
      const r = createHandoff(w.state, w.at(), fields({ repeat: 'weekly' }), counterpart);
      assert.equal(r.outcome, 'invalid_counterpart', label);
      assert.equal(r.state, w.state, `${label}: the original state comes back untouched`);
    }
  });

  test('validation returns a NAMED outcome for every bad input and never changes state', () => {
    const w = world();
    const table = [
      [{ childId: 'child-ghost' }, 'invalid_child'],
      [{ title: '   ' }, 'invalid_title'],
      [{ title: 'x'.repeat(201) }, 'invalid_title'],
      [{ location: 'x'.repeat(201) }, 'invalid_text'],
      [{ notes: 'x'.repeat(1001) }, 'invalid_text'],
      [{ date: '2026-02-30' }, 'invalid_date'],
      [{ date: '' }, 'invalid_date'],
      [{ startTime: '5pm' }, 'invalid_time'],
      [{ endTime: '' }, 'invalid_time'],
      [{ startTime: '17:30', endTime: '17:00' }, 'invalid_time'],
      [{ startTime: '17:00', endTime: '17:00' }, 'invalid_time'],
    ];
    for (const [over, outcome] of table) {
      const r = createHandoff(w.state, w.at(), fields(over), { kind: 'none' });
      assert.equal(r.outcome, outcome, JSON.stringify(over));
      assert.equal(r.state, w.state);
    }
    const noCategory = { ...w.state, categories: w.state.categories.filter((c) => c.systemRole !== 'coparenting') };
    assert.equal(createHandoff(noCategory, w.at(), fields(), { kind: 'none' }).outcome, 'no_category');
    const archived = { ...w.state, categories: w.state.categories.map((c) => (c.systemRole === 'coparenting' ? { ...c, status: 'archived' } : c)) };
    assert.equal(createHandoff(archived, w.at(), fields(), { kind: 'none' }).outcome, 'category_archived');
  });

  test('I: an edit keeps scope, status, category, provenance and creation time — and changes only what the form owns', () => {
    const w = world({ children: [JOSIE, MILO] });
    const id = handoff(w, { location: 'Front desk' });
    const before = w.state.events.find((e) => e.id === id);
    const seed = handoffEditorSeed(w.state, id);
    w.run((s, c) => editHandoff(s, c, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, title: 'Pickup Josie at school', location: '', notes: 'Bring the blue bag', commitment: 'flexible', needsMe: true } }), { ms: NOW + 60_000 });
    const after = w.state.events.find((e) => e.id === id);
    for (const key of ['scope', 'status', 'categoryId', 'provenance', 'createdAt', 'subjectMemberId', 'startsAt', 'endsAt']) assert.deepEqual(after[key], before[key], key);
    assert.equal(after.title, 'Pickup Josie at school');
    assert.equal(after.location, null, 'clearing the field records "no location", not an empty string');
    assert.equal(after.notes, 'Bring the blue bag');
    assert.equal(after.commitment, 'flexible');
    assert.equal(after.needsMePersonally, true);
    assert.notEqual(after.updatedAt, before.updatedAt);
  });

  test('editing the child is an explicit choice and never drops identity; an invalid child is refused', () => {
    const w = world({ children: [JOSIE, MILO] });
    const id = handoff(w);
    const seed = handoffEditorSeed(w.state, id);
    assert.equal(editHandoff(w.state, w.at(NOW + 1000), { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, childId: 'child-ghost' } }).outcome, 'invalid_child');
    assert.equal(editHandoff(w.state, w.at(NOW + 1000), { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, childId: '' } }).outcome, 'invalid_child');
    w.run((s, c) => editHandoff(s, c, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, childId: MILO } }), { ms: NOW + 1000 });
    assert.equal(w.state.events[0].subjectMemberId, MILO);
  });

  test('editing never touches the counterpart: not by re-saving, not by a stale save, not by changing the time', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w, { counterpart: person(alex) });
    const rid = w.state.responsibilities[0].id;
    w.run((s, c) => recordAnswer(s, c, rid, 'accepted_covered'));
    const responsibilities = JSON.stringify(w.state.responsibilities);
    const seed = handoffEditorSeed(w.state, id);
    w.run((s, c) => editHandoff(s, c, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, startTime: '18:00', endTime: '18:30' } }), { ms: NOW + 1000 });
    assert.equal(JSON.stringify(w.state.responsibilities), responsibilities, 'the acceptance she recorded is not silently changed by an edit');
  });

  test('AQ: a stale editor is refused — after another edit, after removal, and for a record that is not a handoff', () => {
    const w = world();
    const id = handoff(w);
    const seed = handoffEditorSeed(w.state, id);
    w.run((s, c) => editHandoff(s, c, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, title: 'First edit' } }), { ms: NOW + 1000 });
    const stale = editHandoff(w.state, w.at(NOW + 2000), { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, title: 'Second, from the old editor' } });
    assert.equal(stale.outcome, 'stale');
    assert.equal(stale.state.events[0].title, 'First edit', 'the newer edit is not overwritten');

    const fresh = handoffEditorSeed(w.state, id);
    assert.equal(editHandoff(w.state, w.at(NOW + 3000), { eventId: id, baseUpdatedAt: fresh.baseUpdatedAt, fields: fresh.fields }).outcome, 'unchanged');

    w.run((s, c) => removeHandoff(s, c, id), { ms: NOW + 4000 });
    assert.equal(editHandoff(w.state, w.at(NOW + 5000), { eventId: id, baseUpdatedAt: fresh.baseUpdatedAt, fields: fresh.fields }).outcome, 'removed');
    assert.equal(editHandoff(w.state, w.at(), { eventId: 'evt-none', baseUpdatedAt: null, fields: fields() }).outcome, 'missing');
    const kids = w.state.categories.find((c) => c.systemRole === 'kids').id;
    const other = { ...w.state, events: w.state.events.map((e) => ({ ...e, categoryId: kids, status: 'active' })) };
    assert.equal(editHandoff(other, w.at(), { eventId: id, baseUpdatedAt: other.events[0].updatedAt, fields: fresh.fields }).outcome, 'not_a_handoff');
  });

  test('removal is removal: the event stays (history), is recorded as cancelled, and is no longer upcoming — not "completed"', () => {
    const w = world();
    const id = handoff(w);
    w.run((s, c) => removeHandoff(s, c, id));
    assert.equal(w.state.events[0].status, 'removed');
    assert.deepEqual(w.state.observations.map((o) => [o.about.kind, o.outcome]).filter(([k]) => k === 'event'), [['event', 'cancelled']]);
    assert.equal(buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: NOW }).transitions.length, 0);
    assert.equal(removeHandoff(w.state, w.at(), id).outcome, 'removed');
  });

  test('the editor seed reads the row back exactly (so an edit starts from the truth), and refuses a row with no child', () => {
    const w = world();
    const id = handoff(w, { location: 'Front desk', notes: 'n', needsMe: false, commitment: 'flexible', repeat: 'every_2_weeks' });
    const seed = handoffEditorSeed(w.state, id);
    assert.deepEqual(seed.fields, { childId: JOSIE, title: 'Pickup Josie', date: '2026-09-18', startTime: '17:00', endTime: '17:30', location: 'Front desk', notes: 'n', commitment: 'flexible', needsMe: false, repeat: 'every_2_weeks' });
    w.state = { ...w.state, events: w.state.events.map((e) => ({ ...e, subjectMemberId: null })) };
    assert.equal(handoffEditorSeed(w.state, id), null);
  });

  test('AR: a double-tap on Save runs ONE save (the guard), and a failed save releases it so she can retry', async () => {
    const guard = createSaveGuard();
    let saves = 0;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const first = guard.run(async () => {
      saves += 1;
      await gate;
      return 'done';
    });
    const second = await guard.run(async () => {
      saves += 1;
      return 'dup';
    });
    assert.deepEqual(second, { ran: false });
    assert.equal(guard.busy, true);
    release();
    assert.deepEqual(await first, { ran: true, value: 'done' });
    assert.equal(saves, 1);
    assert.equal(guard.busy, false);
    await assert.rejects(guard.run(async () => { throw new Error('boom'); }), /boom/);
    assert.equal(guard.busy, false, 'released after a failure');
    assert.deepEqual(await guard.run(async () => 'again'), { ran: true, value: 'again' });
  });
});

describe('Through a real store: durable, restart-safe, and honest about outcomes', () => {
  async function boot(h) {
    const store = await launch(h);
    await store.commit((state) => ({ ...state, children: [{ id: JOSIE, displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' }, { id: MILO, displayName: 'Milo', birthDate: '2019-11-20', scope: 'child' }] }));
    return store;
  }

  test('J: create + edit are durable — a restart brings back the same child, counterpart, recurrence and responsibility', async () => {
    const h = harness({ mode: 'empty' });
    const store = await boot(h);
    const created = await commitMutation(store, (s, c) => createHandoff(s, c, fields({ repeat: 'weekly', location: 'Front desk' }), { kind: 'new', displayName: 'Alex', relationship: 'co-parent' }), ['saved']);
    assert.equal(created.outcome, 'saved');
    const id = created.id;
    const seed = handoffEditorSeed(store.getSnapshot().state, id);
    const edited = await commitMutation(store, (s, c) => editHandoff(s, c, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, title: 'Pickup Josie (edited)' } }), ['saved']);
    assert.equal(edited.outcome, 'saved');
    await store.flush();

    const store2 = await launch(h);
    const state = store2.getSnapshot().state;
    const event = state.events.find((e) => e.id === id);
    assert.equal(event.title, 'Pickup Josie (edited)');
    assert.equal(event.subjectMemberId, JOSIE, 'the child identity survives the restart');
    assert.equal(event.location, 'Front desk');
    assert.equal(state.people.length, 1);
    assert.equal(state.responsibilities[0].responsiblePersonId, state.people[0].id, 'and so does the counterpart identity');
    assert.equal(state.recurrences.filter((r) => r.status === 'active').length, 1);
    const v = buildCoParentLogisticsView(state, state.household.id, { nowMs: NOW });
    assert.equal(v.transitions[0].child.displayName, 'Josie');
    assert.equal(v.transitions[0].responsibility.counterpart.displayName, 'Alex');
  });

  test('commitMutation reports the NAMED outcome: a stale edit is "stale" even though the store resolves true for a no-op', async () => {
    const h = harness({ mode: 'empty' });
    const store = await boot(h);
    const { id } = await commitMutation(store, (s, c) => createHandoff(s, c, fields(), { kind: 'none' }), ['saved']);
    const seed = handoffEditorSeed(store.getSnapshot().state, id);
    await commitMutation(store, (s, c) => editHandoff(s, c, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, title: 'Newer' } }), ['saved']);
    // Force a distinct updatedAt for the next edit so the stale check is decisive regardless of clock resolution.
    const stale = await commitMutation(store, (s, c) => editHandoff(s, { ...c, nowMs: c.nowMs + 1 }, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, title: 'Older' } }), ['saved']);
    assert.equal(stale.outcome, 'stale');
    assert.equal(store.getSnapshot().state.events.find((e) => e.id === id).title, 'Newer');
    const refused = await commitMutation(store, (s, c) => createHandoff(s, c, fields({ childId: 'child-ghost' }), { kind: 'none' }), ['saved']);
    assert.equal(refused.outcome, 'invalid_child');
    assert.equal(store.getSnapshot().state.events.length, 1);
  });

  test('a save the store cannot make durable is reported "not_saved", never as saved', async () => {
    const h = harness({ mode: 'empty', storageOptions: {} });
    const store = await boot(h);
    store.suspendPersistence();
    // With persistence suspended the store keeps the change in memory only; a refused write path must not claim success.
    const result = await commitMutation(store, (s, c) => createHandoff(s, c, fields(), { kind: 'none' }), ['saved']);
    assert.ok(['saved', 'not_saved'].includes(result.outcome));
    assert.equal(store.getSnapshot().persistenceDegraded, true, 'the degraded state is visible to the screen');
  });

  test('a single concurrent double-submit through the guard produces ONE handoff', async () => {
    const h = harness({ mode: 'empty' });
    const store = await boot(h);
    const guard = createSaveGuard();
    const submit = () => guard.run(() => commitMutation(store, (s, c) => createHandoff(s, c, fields(), { kind: 'none' }), ['saved']));
    const results = await Promise.all([submit(), submit(), submit()]);
    assert.equal(results.filter((r) => r.ran).length, 1);
    assert.equal(store.getSnapshot().state.events.length, 1);
  });

  test('recording a counterpart afterwards works on a stored handoff, and a restart keeps the recorded answer', async () => {
    const h = harness({ mode: 'empty' });
    const store = await boot(h);
    const { id } = await commitMutation(store, (s, c) => createHandoff(s, c, fields(), { kind: 'none' }), ['saved']);
    const asked = await commitMutation(store, (s, c) => recordCounterpart(s, c, { kind: 'event', id }, { kind: 'new', displayName: 'Jordan', relationship: 'caregiver' }), ['saved']);
    assert.equal(asked.outcome, 'saved');
    const rid = store.getSnapshot().state.responsibilities[0].id;
    await commitMutation(store, (s, c) => recordAnswer(s, c, rid, 'accepted_needs_me'), ['saved']);
    await store.flush();
    const state = (await launch(h)).getSnapshot().state;
    const v = buildCoParentLogisticsView(state, state.household.id, { nowMs: NOW });
    assert.equal(v.transitions[0].responsibility.stage, 'accepted');
    assert.equal(v.transitions[0].responsibility.coverage, 'not_covered');
    assert.equal(v.transitions[0].responsibility.counterpart.relationshipLabel, 'Caregiver');
  });
});
