import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { archivePerson } from '../../src/domain/responsibility.ts';
import { buildCoParentLogisticsView, buildTransitionDetail } from '../../src/features/coparent/projection.ts';
import { personLabels } from '../../src/features/coparent/identity.ts';
import { DAY, JOSIE, MILO, NOW, RUBY, TZ, handoff, prep, request, world } from '../fixtures/coparent/world.mjs';

const view = (w) => buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: w.nowMs });
const byId = (v, id) => v.transitions.find((t) => t.id === id);
const asPerson = (personId) => ({ kind: 'person', personId });

describe('Identity: child and counterpart are ids, never names', () => {
  test('D: different children keep different counterpart adults', () => {
    const w = world({ children: [JOSIE, MILO] });
    const alex = w.person('Alex', 'co-parent');
    const jordan = w.person('Jordan', 'caregiver');
    const a = handoff(w, { child: JOSIE, counterpart: asPerson(alex) });
    const b = handoff(w, { child: MILO, date: '2026-09-19', title: 'Drop off Milo', counterpart: asPerson(jordan) });
    const v = view(w);
    assert.equal(byId(v, a).responsibility.counterpart.personId, alex);
    assert.equal(byId(v, b).responsibility.counterpart.personId, jordan);
    assert.equal(byId(v, a).child.childId, JOSIE);
    assert.equal(byId(v, b).child.childId, MILO);
    // The hub is organised by child + need: there is no per-adult grouping anywhere in the view.
    assert.ok(!('byCounterpart' in v) && !('counterparts' in v));
  });

  test('E: two people with the SAME display name (and relationship) remain distinct rows with distinct labels', () => {
    const w = world({ children: [JOSIE, MILO] });
    const alex1 = w.person('Alex', 'co-parent');
    const alex2 = w.person('Alex', 'co-parent');
    assert.notEqual(alex1, alex2);
    const a = handoff(w, { child: JOSIE, counterpart: asPerson(alex1) });
    const b = handoff(w, { child: MILO, date: '2026-09-19', title: 'Drop off Milo', counterpart: asPerson(alex2) });
    const v = view(w);
    const ca = byId(v, a).responsibility.counterpart;
    const cb = byId(v, b).responsibility.counterpart;
    assert.equal(ca.personId, alex1);
    assert.equal(cb.personId, alex2);
    assert.notEqual(ca.label, cb.label, 'the same name must not collapse into one label');
    assert.equal(ca.displayName, 'Alex');
    assert.equal(cb.displayName, 'Alex');
    assert.equal(new Set(v.people.map((p) => p.label)).size, v.people.length, 'the picker options are unique');
  });

  test('E: same name, different recorded relationship — the relationship disambiguates without an ordinal', () => {
    const w = world();
    const a = w.person('Sam', 'co-parent');
    const b = w.person('Sam', 'grandparent');
    const labels = personLabels(w.state.people);
    assert.equal(labels.get(a), 'Sam (Co-parent)');
    assert.equal(labels.get(b), 'Sam (grandparent)');
  });

  test('label order for identical name AND relationship follows add order, not array position', () => {
    const w = world();
    const first = w.person('Alex', 'co-parent');
    const second = w.person('Alex', 'co-parent');
    const reversed = [...w.state.people].reverse();
    const labels = personLabels(reversed);
    assert.ok(labels.get(first).endsWith('#1') || labels.get(first).endsWith('#2'));
    assert.notEqual(labels.get(first), labels.get(second));
    // Same result whatever order the array is in.
    const forward = personLabels(w.state.people);
    assert.equal(forward.get(first), labels.get(first));
    assert.equal(forward.get(second), labels.get(second));
  });

  test('one household, more than one other responsible adult: each record names its own person', () => {
    const w = world();
    const alex = w.person('Alex', 'co-parent');
    const june = w.person('Grandma June', 'grandparent');
    const a = handoff(w, { title: 'Pickup Josie', counterpart: asPerson(alex) });
    const b = handoff(w, { title: 'Sunday drop-off', date: '2026-09-20', counterpart: asPerson(june) });
    const v = view(w);
    assert.equal(byId(v, a).responsibility.counterpart.label, 'Alex');
    assert.equal(byId(v, b).responsibility.counterpart.label, 'Grandma June');
    assert.equal(byId(v, a).responsibility.counterpart.relationshipLabel, 'Co-parent');
    assert.equal(byId(v, b).responsibility.counterpart.relationshipLabel, 'grandparent', 'a relationship is worded exactly as recorded');
  });

  test('a person recorded as something other than co-parent is never labelled "Co-parent"', () => {
    const w = world();
    const friend = w.person('Chris', 'friend');
    const other = w.person('Pat', 'other');
    const a = handoff(w, { counterpart: asPerson(friend) });
    const b = handoff(w, { date: '2026-09-19', counterpart: asPerson(other) });
    const v = view(w);
    assert.notEqual(byId(v, a).responsibility.counterpart.relationshipLabel, 'Co-parent');
    assert.equal(byId(v, b).responsibility.counterpart.relationshipLabel, null, 'an "other" relationship adds nothing: the name stands alone');
  });

  test('a second child with the SAME display name is a different identity — records never cross by name', () => {
    const w = world({ children: [JOSIE, MILO] });
    w.state = { ...w.state, children: [...w.state.children, { id: 'child-josie-2', displayName: 'Josie', birthDate: '2012-01-05', scope: 'child' }] };
    const a = handoff(w, { child: 'child-josie-2', title: 'Pickup Josie (older)' });
    const v = view(w);
    assert.equal(byId(v, a).child.childId, 'child-josie-2');
    assert.notEqual(byId(v, a).child.childId, JOSIE);
  });

  test('AO/K: a handoff whose child is not in the household is NEEDS REVIEW — never re-attached, never matched by name', () => {
    const w = world({ children: [JOSIE, MILO] });
    const id = handoff(w, { child: JOSIE });
    const taskId = prep(w, { child: JOSIE, linkEventId: id });
    // The child leaves the household (defensive read on hand-built, unvalidated state — the foundation has no child lifecycle).
    const broken = { ...w.state, children: w.state.children.filter((c) => c.id !== JOSIE) };
    const v = buildCoParentLogisticsView(broken, broken.household.id, { nowMs: NOW });
    const t = byId(v, id);
    assert.deepEqual(t.child, { status: 'unavailable', childId: JOSIE, cause: 'missing' });
    assert.ok(t.review.includes('child_unavailable'));
    assert.equal(t.section, 'needs_review');
    assert.ok(v.needsReviewIds.includes(id));
    assert.notEqual(t.child.childId, MILO, 'Milo is still in the household and must never be substituted');
    const task = v.needsReviewTasks.find((x) => x.taskId === taskId);
    assert.ok(task, 'the preparation task for the missing child is flagged too');
    assert.ok(task.reasons.includes('child_unavailable'));
  });

  test('AO: the adult account user is not a child — a handoff whose subject is the adult is NEEDS REVIEW', () => {
    const w = world();
    const id = handoff(w);
    w.state = { ...w.state, events: w.state.events.map((e) => (e.id === id ? { ...e, subjectMemberId: w.state.user.id } : e)) };
    const t = byId(view(w), id);
    assert.deepEqual(t.child, { status: 'unavailable', childId: 'user-1', cause: 'not_a_child' });
    assert.equal(t.section, 'needs_review');
  });

  test('a handoff filed with no child is NEEDS REVIEW and is not shown as an ordinary transition', () => {
    const w = world();
    const id = handoff(w);
    w.state = { ...w.state, events: w.state.events.map((e) => (e.id === id ? { ...e, subjectMemberId: null } : e)) };
    const t = byId(view(w), id);
    assert.equal(t.child.status, 'not_recorded');
    assert.ok(t.review.includes('child_not_recorded'));
    assert.ok(t.unknowns.includes('child_not_recorded'));
    assert.equal(t.section, 'needs_review');
  });

  test('AP: a responsibility naming a person who is not in the household is NEEDS REVIEW and keeps the id', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w, { counterpart: asPerson(alex) });
    const broken = { ...w.state, people: [] };
    const t = byId(buildCoParentLogisticsView(broken, broken.household.id, { nowMs: NOW }), id);
    assert.equal(t.responsibility.counterpart.standing, 'missing');
    assert.equal(t.responsibility.counterpart.personId, alex);
    assert.equal(t.responsibility.coverage, 'needs_review');
    assert.equal(t.section, 'needs_review');
  });

  test('archiving a person changes nothing but their status: no responsibility is rewritten or handed to her', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w, { counterpart: asPerson(alex) });
    const before = JSON.stringify(w.state.responsibilities);
    w.apply((s, ctx) => archivePerson(s, ctx, alex));
    assert.equal(JSON.stringify(w.state.responsibilities), before, 'archivePerson never touches responsibilities, and neither may Feature 07');
    const t = byId(view(w), id);
    assert.equal(t.responsibility.holder, 'person');
    assert.equal(t.responsibility.counterpart.standing, 'archived');
  });

  test('the detail view opens only co-parenting handoffs, and only for its own household', () => {
    const w = world({ children: [JOSIE, MILO, RUBY] });
    const id = handoff(w);
    const ok = buildTransitionDetail(w.state, w.state.household.id, id, { nowMs: NOW });
    assert.equal(ok.status, 'ok');
    assert.equal(buildTransitionDetail(w.state, 'household-other', id, { nowMs: NOW }).status, 'household_mismatch');
    assert.equal(buildTransitionDetail(w.state, w.state.household.id, 'evt-none', { nowMs: NOW }).status, 'not_found');
    const kidsCat = w.state.categories.find((c) => c.systemRole === 'kids').id;
    w.state = { ...w.state, events: w.state.events.map((e) => (e.id === id ? { ...e, categoryId: kidsCat } : e)) };
    assert.equal(buildTransitionDetail(w.state, w.state.household.id, id, { nowMs: NOW }).status, 'not_a_handoff');
    assert.ok(DAY && TZ);
  });
});
