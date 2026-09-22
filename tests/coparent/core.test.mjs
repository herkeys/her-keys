import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildCoParentLogisticsView, buildTransitionDetail } from '../../src/features/coparent/projection.ts';
import { createHandoff, editHandoff, handoffEditorSeed } from '../../src/features/coparent/mutations.ts';
import { DAY, HANDOFF, JOSIE, MILO, NOW, answer, handoff, prep, request, world, finishPrep } from '../fixtures/coparent/world.mjs';

const view = (w, extra = {}) => buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: w.nowMs, ...extra });

describe('Co-parent logistics: the core, on a real household', () => {
  test('A: no records — empty means "nothing represented", and creation is possible when a child exists', () => {
    const w = world();
    const v = view(w);
    assert.equal(v.status, 'ok');
    assert.equal(v.isEmpty, true);
    assert.equal(v.nextTransitionId, null);
    assert.equal(v.capability.canCreate, true);
    assert.deepEqual(v.capability.blocked, []);
  });

  test('a household with no child is a NAMED blocked state, never a phantom child', () => {
    const w = world({ children: [] });
    const v = view(w);
    assert.equal(v.capability.canCreate, false);
    assert.deepEqual(v.capability.blocked, ['no_child']);
    const result = createHandoff(w.state, w.at(), { ...HANDOFF, childId: 'child-nobody' }, { kind: 'none' });
    assert.equal(result.outcome, 'invalid_child');
    assert.equal(result.state, w.state, 'a refusal returns the original state untouched');
  });

  test('B/F/G: one child, one handoff — a real canonical event, child by id, owner-only scope, unknown location stays unknown', () => {
    const w = world();
    const id = handoff(w);
    const event = w.state.events.find((e) => e.id === id);
    assert.equal(event.subjectMemberId, JOSIE);
    assert.equal(event.scope, 'coparent-shared');
    assert.equal(event.status, 'active');
    assert.equal(event.provenance.producer, 'user-action');
    assert.equal(event.location, null, 'no location entered is null, never an invented place');
    assert.equal(w.state.categories.find((c) => c.id === event.categoryId).systemRole, 'coparenting');

    const v = view(w);
    assert.equal(v.nextTransitionId, id);
    const t = v.transitions[0];
    assert.deepEqual(t.child, { status: 'known', childId: JOSIE, displayName: 'Josie' });
    assert.equal(t.localDate, '2026-09-18');
    assert.equal(t.minutesOfDay, 17 * 60);
    assert.equal(t.hasLocation, false);
    assert.ok(t.unknowns.includes('location_not_recorded'));
    assert.ok(t.unknowns.includes('counterpart_not_recorded'));
    assert.ok(t.unknowns.includes('preparation_not_recorded'));
    assert.equal(t.responsibility.stage, 'none_recorded');
    assert.equal(t.responsibility.coverage, 'unknown', 'no counterpart recorded is NOT "she is handling it"');
    assert.equal(t.preparation.readiness, 'no_prep_recorded', 'no packing item is NOT "nothing needs packing" and NOT "ready"');
    assert.equal(v.isEmpty, false);
  });

  test('the hub view never carries the location text; only the detail view does', () => {
    const w = world();
    const id = handoff(w, { location: "Dad's place, 12 Elm St" });
    const hub = JSON.stringify(view(w));
    assert.ok(!hub.includes('Elm St'), 'the exact location must not appear anywhere on the hub view');
    const detail = buildTransitionDetail(w.state, w.state.household.id, id, { nowMs: w.nowMs });
    assert.equal(detail.location, "Dad's place, 12 Elm St");
    assert.equal(view(w).transitions[0].hasLocation, true);
  });

  test('C: multiple children — each handoff keeps its own child, in time order', () => {
    const w = world({ children: [JOSIE, MILO] });
    const a = handoff(w, { child: MILO, title: 'Drop off Milo', date: '2026-09-19' });
    const b = handoff(w, { child: JOSIE, title: 'Pickup Josie', date: '2026-09-18' });
    const v = view(w);
    assert.deepEqual(v.transitions.map((t) => t.id), [b, a]);
    assert.equal(v.transitions.find((t) => t.id === a).child.childId, MILO);
    assert.equal(v.transitions.find((t) => t.id === b).child.childId, JOSIE);
  });

  test('I: editing keeps child identity, never touches the counterpart, and reports STALE instead of overwriting', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w, { counterpart: { kind: 'person', personId: alex } });
    const seed = handoffEditorSeed(w.state, id);
    assert.equal(seed.fields.childId, JOSIE);
    assert.equal(seed.fields.startTime, '17:00');

    // She edits the time; the counterpart and child are untouched.
    w.run((s, ctx) => editHandoff(s, ctx, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, startTime: '18:00', endTime: '18:30' } }), { ms: NOW + 60_000 });
    const after = w.state.events.find((e) => e.id === id);
    assert.equal(after.subjectMemberId, JOSIE);
    assert.equal(w.state.responsibilities.length, 1);
    assert.equal(w.state.responsibilities[0].responsiblePersonId, alex);

    // A second editor opened on the OLD row must not silently overwrite the newer one.
    const stale = editHandoff(w.state, w.at(NOW + 120_000), { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, title: 'Stale title' } });
    assert.equal(stale.outcome, 'stale');
    assert.equal(stale.state, w.state);
  });

  test('N/O/P: assigned ≠ acknowledged ≠ accepted ≠ covered, and every state is labelled as recorded by her', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    request(w, { kind: 'event', id }, alex);
    let t = view(w).transitions[0];
    assert.equal(t.responsibility.stage, 'requested');
    assert.equal(t.responsibility.coverage, 'not_covered');
    assert.equal(t.responsibility.recordedBy, 'you');
    assert.equal(t.section, 'waiting');

    const rid = w.state.responsibilities[0].id;
    answer(w, rid, 'acknowledged');
    t = view(w).transitions[0];
    assert.equal(t.responsibility.stage, 'acknowledged');
    assert.equal(t.responsibility.coverage, 'not_covered');

    answer(w, rid, 'accepted_needs_me');
    t = view(w).transitions[0];
    assert.equal(t.responsibility.stage, 'accepted');
    assert.equal(t.responsibility.coverage, 'not_covered', 'ACCEPTED ≠ COVERED when it still needs her');
    assert.equal(t.section, 'needs_me');
    assert.deepEqual(t.needsMeReasons, ['accepted_still_needs_you']);
  });

  test('P: covered only when she says the accepted request no longer needs her', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    request(w, { kind: 'event', id }, alex);
    answer(w, w.state.responsibilities[0].id, 'accepted_covered');
    const t = view(w).transitions[0];
    assert.equal(t.responsibility.coverage, 'covered');
    assert.equal(t.section, 'none');
  });

  test('S/T/U: preparation is tied only by an explicit edge; done is not received; removal is unavailable, not completed', () => {
    const w = world();
    const id = handoff(w);
    const packed = prep(w, { title: 'Pack the school laptop', linkEventId: id });
    prep(w, { title: 'Return library book', linkEventId: id });
    let t = view(w).transitions[0];
    assert.equal(t.preparation.linked, 2);
    assert.equal(t.preparation.readiness, 'waiting_on_prep');

    finishPrep(w, packed);
    t = view(w).transitions[0];
    assert.equal(t.preparation.done, 1);
    assert.equal(t.preparation.readiness, 'waiting_on_prep');
    assert.equal(t.preparation.items.find((i) => i.taskId === packed).standing, 'done');
  });
});
