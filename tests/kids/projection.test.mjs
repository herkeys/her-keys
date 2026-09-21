/**
 * HK-FEATURE-05 — the Kids projection (Tier 1 core scenarios). The projection is read-only and deterministic; these tests build
 * households through the real transitions and assert on the SEMANTIC output, never on rendered text.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { completeTask, archiveTask } from '../../src/domain/tasks.ts';
import { removeEvent } from '../../src/domain/events.ts';
import { addDependency, addRecurrence, removeDependency } from '../../src/domain/structure.ts';
import { attentionFor } from '../../src/domain/reasoning/attention.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { buildChildDetail, buildKidsView } from '../../src/features/kids/projection.ts';
import { recordAcknowledged, recordAccepted, recordDeclined, requestHandoff, takeBack } from '../../src/features/kids/mutations.ts';
import { DAY, HOUR, NOW, TODAY, addEventFor, addTaskFor, archive, askNewPerson, emptyHousehold, idOf, makeCtx, responsibilityOf, withChildren } from './support.mjs';

const view = (s, nowMs = NOW) => buildKidsView(s, s.household.id, { nowMs });
const detail = (s, childId, nowMs = NOW) => buildChildDetail(s, s.household.id, childId, { nowMs });
const card = (s, childId) => view(s).children.find((entry) => entry.childId === childId);

function twoKids() {
  const c = makeCtx();
  const s = withChildren(emptyHousehold(), c, [['Sam', '2018-03-03'], ['Ivy', '2021-06-10']]);
  return { s, c, sam: idOf(s, 'Sam'), ivy: idOf(s, 'Ivy') };
}

describe('A/B. children', () => {
  test('a household with no children shows none (and nothing is invented)', () => {
    const v = view(emptyHousehold());
    assert.equal(v.status, 'ok');
    assert.deepEqual(v.children, []);
    assert.equal(v.unattributed, 0);
  });

  test('A. one child with no records: known, quiet, nothing claimed', () => {
    const c = makeCtx();
    const s = withChildren(emptyHousehold(), c, [['Sam', '2018-03-03']]);
    const [only] = view(s).children;
    assert.equal(only.label.short, 'Sam, 8');
    assert.equal(only.next, null);
    assert.equal(only.hasAnyRecords, false);
    assert.deepEqual([only.needsYouCount, only.waitingOnOthersCount, only.planGapCount, only.attentionCount], [0, 0, 0, 0]);
    const d = detail(s, only.childId);
    assert.deepEqual(d.upcoming, []);
    assert.deepEqual(d.needsAttention, []);
    assert.deepEqual(d.plans, []);
  });

  test('B. several children in a stable order; each row belongs only to its own child', () => {
    const { s: base, c, sam, ivy } = twoKids();
    let s = addEventFor(base, c, sam, 'Soccer').state;
    s = addTaskFor(s, c, ivy, 'Sign the field-trip form').state;
    const v = view(s);
    assert.deepEqual(v.children.map((k) => k.childId), [sam, ivy], 'oldest first');
    assert.equal(card(s, sam).next.title, 'Soccer');
    assert.equal(card(s, ivy).next, null);
    assert.equal(detail(s, ivy).openWork.nobodyRecorded.length, 1);
    assert.equal(detail(s, sam).openWork.nobodyRecorded.length, 0);
  });

  test('C. two children called Sam: each row still belongs to the right one, and the labels differ', () => {
    const c = makeCtx();
    let s = withChildren(emptyHousehold(), c, [['Sam', '2018-03-03'], ['Sam', '2020-07-07']]);
    const [older, younger] = s.children.map((k) => k.id);
    s = addEventFor(s, c, older, 'Piano', { startText: '4:00 PM', endText: '5:00 PM' }).state;
    s = addEventFor(s, c, younger, 'Swim', { startText: '9:00 AM', endText: '10:00 AM' }).state;
    const cards = view(s).children;
    assert.notEqual(cards[0].label.full, cards[1].label.full);
    assert.equal(cards.find((k) => k.childId === older).next.title, 'Piano');
    assert.equal(cards.find((k) => k.childId === younger).next.title, 'Swim');
  });
});

describe('D/E. what is coming', () => {
  test('D. one upcoming commitment is the next item, in the household zone', () => {
    const { s: base, c, sam } = twoKids();
    const { s } = { s: addEventFor(base, c, sam, 'Soccer practice', { location: 'Riverside Field' }).state };
    const next = card(s, sam).next;
    assert.equal(next.title, 'Soccer practice');
    assert.equal(next.ref.kind, 'event');
    assert.equal(next.schedule.localDate, '2026-09-22');
    assert.equal(next.schedule.startMinutes, 17 * 60);
    assert.equal(next.schedule.endMinutes, 18 * 60);
    assert.equal(next.where, 'Riverside Field');
    assert.equal(next.duration, null, 'an event has a span, not an estimated length');
  });

  test('E. several: soonest first; past, removed and finished ones are not "upcoming"', () => {
    const { s: base, c, sam } = twoKids();
    let s = addEventFor(base, c, sam, 'Later', { date: '2026-09-24', startText: '3:00 PM', endText: '4:00 PM' }).state;
    s = addEventFor(s, c, sam, 'Sooner', { date: '2026-09-22', startText: '8:00 AM', endText: '9:00 AM' }).state;
    const gone = addEventFor(s, c, sam, 'Cancelled', { date: '2026-09-22', startText: '7:00 AM', endText: '7:30 AM' });
    s = removeEvent(gone.state, c, gone.id);
    s = addEventFor(s, c, sam, 'Yesterday', { date: '2026-09-20', startText: '3:00 PM', endText: '4:00 PM' }).state;
    // in progress right now (9:30-10:30 today, now is 10:00): still upcoming until it ends
    s = addEventFor(s, c, sam, 'Happening now', { date: '2026-09-21', startText: '9:30 AM', endText: '10:30 AM' }).state;
    assert.deepEqual(detail(s, sam).upcoming.map((i) => i.title), ['Happening now', 'Sooner', 'Later']);
    assert.equal(card(s, sam).hasAnyRecords, true);
  });

  test('ties break by id, so the order never flips between runs', () => {
    const { s: base, c, sam } = twoKids();
    let s = base;
    for (const t of ['B', 'A', 'C']) s = addEventFor(s, c, sam, t).state;
    const once = detail(s, sam).upcoming.map((i) => i.ref.id);
    assert.deepEqual(detail(s, sam).upcoming.map((i) => i.ref.id), once);
    assert.deepEqual(once, [...once].sort());
  });

  test('the logical day turns over at household midnight: "tomorrow\'s" practice becomes today\'s', () => {
    const { s: base, c, sam } = twoKids();
    const s = addEventFor(base, c, sam, 'Soccer').state;
    assert.equal(view(s).today, '2026-09-21');
    const nextMorning = NOW + 14 * HOUR; // 00:00 Chicago on the 22nd is 05:00Z; NOW+14h = 01:00 local
    assert.equal(view(s, nextMorning).today, '2026-09-22');
    assert.equal(detail(s, sam, nextMorning).upcoming[0].schedule.localDate, '2026-09-22');
  });
});

describe('F. unresolved work, and what each task says it knows', () => {
  test('F. an open child-linked task is open work; a completed or removed one is not', () => {
    const { s: base, c, sam } = twoKids();
    const a = addTaskFor(base, c, sam, 'Permission slip');
    const b = addTaskFor(a.state, c, sam, 'Done thing');
    const d = addTaskFor(b.state, c, sam, 'Dropped thing');
    let s = completeTask(d.state, c, b.id);
    s = archiveTask(s, c, d.id);
    assert.deepEqual(detail(s, sam).openWork.nobodyRecorded.map((i) => i.title), ['Permission slip']);
  });

  test('G/H/I. unknown, default and explicit durations are three different things', () => {
    const { s: base, c, sam } = twoKids();
    const def = addTaskFor(base, c, sam, 'Default length'); // untouched field
    const usr = addTaskFor(def.state, c, sam, 'Stated length', { durationText: '15', durationTouched: true });
    let s = usr.state;
    // A row saved before the contract: a number with no recorded origin.
    s = { ...s, tasks: [...s.tasks, { ...s.tasks[0], id: 'task-legacy', title: 'Old row', durationSource: null }] };
    const by = Object.fromEntries(detail(s, sam).openWork.nobodyRecorded.map((i) => [i.title, i.duration]));
    assert.deepEqual(by['Default length'], { minutes: 15, knowledge: 'default-estimate' });
    assert.deepEqual(by['Stated length'], { minutes: 15, knowledge: 'user-provided' });
    assert.deepEqual(by['Old row'], { minutes: 15, knowledge: 'unrecorded' });
    assert.notDeepEqual(by['Default length'], by['Stated length'], 'an explicit 15 is not a default 15');
  });

  test('an event says when it starts and ends; it never claims "you said"', () => {
    const { s: base, c, sam } = twoKids();
    const item = addEventFor(base, c, sam, 'Recital').state;
    assert.equal(detail(item, sam).upcoming[0].duration, null);
  });
});

describe('O-S. responsibility: assigned != acknowledged != accepted != covered', () => {
  function asked() {
    const { s: base, c, sam } = twoKids();
    const t = addTaskFor(base, c, sam, 'Pick up the costume', { dueDate: '2026-09-23' });
    const ref = { kind: 'task', id: t.id };
    const { state, personId } = askNewPerson(t.state, c, ref);
    return { s: state, c, sam, ref, personId, rid: responsibilityOf(state, ref).id };
  }
  const only = (s, sam) => detail(s, sam).openWork;

  test('O. asked but not answered: assigned, NOT accepted, NOT covered, and it still needs her', () => {
    const { s, sam, ref } = asked();
    const item = [...only(s, sam).needsYou].find((i) => i.ref.id === ref.id);
    assert.ok(item, 'a pending request is still hers');
    assert.equal(item.responsibility.coverage, 'asked_no_answer');
    assert.equal(item.responsibility.lifecycle, 'requested');
    assert.equal(item.responsibility.requiresYou, true);
    assert.equal(item.responsibility.holder.displayName, 'Alex');
    assert.ok(detail(s, sam).needsAttention.some((e) => e.code === 'not_accepted' && e.source === 'fact' && e.urgency === null));
  });

  test('seen is not yes: acknowledged is still not accepted and still not covered', () => {
    const { s, c, sam, rid } = asked();
    const out = recordAcknowledged(s, c, rid);
    assert.equal(out.outcome, 'recorded');
    const item = detail(out.state, sam).openWork.needsYou[0];
    assert.equal(item.responsibility.coverage, 'seen_not_accepted');
    assert.equal(item.responsibility.lifecycle, 'acknowledged');
  });

  test('P. accepted is NOT covered when it is marked as still needing her', () => {
    const { s, c, sam, rid } = asked();
    const out = recordAccepted(s, c, rid, true);
    const item = detail(out.state, sam).openWork.needsYou[0];
    assert.equal(item.responsibility.lifecycle, 'accepted');
    assert.equal(item.responsibility.coverage, 'accepted_still_yours');
    assert.equal(item.responsibility.requiresYou, true);
    assert.equal(item.plan.label, 'NOT_ENOUGH_KNOWN');
  });

  test('Q. covered only when accepted AND marked as off her list; then it is someone else\'s', () => {
    const { s, c, sam, rid, ref } = asked();
    const out = recordAccepted(s, c, rid, false);
    const w = only(out.state, sam);
    assert.deepEqual(w.needsYou, []);
    const item = w.withSomeoneElse.find((i) => i.ref.id === ref.id);
    assert.equal(item.responsibility.coverage, 'covered');
    assert.equal(item.responsibility.requiresYou, false);
    assert.equal(item.plan.label, 'PLAN_IN_PLACE');
  });

  test('R/S. declined and handed-back work is hers again and is said plainly', () => {
    const a = asked();
    const declined = recordDeclined(a.s, a.c, a.rid).state;
    const item = detail(declined, a.sam).openWork.needsYou[0];
    assert.equal(item.responsibility.coverage, 'declined');
    assert.equal(item.responsibility.requiresYou, true);
    assert.equal(item.plan.label, 'NEEDS_A_PLAN');
    assert.ok(detail(declined, a.sam).needsAttention.some((e) => e.code === 'handed_back'));

    const b = asked();
    const taken = takeBack(b.s, b.c, b.rid).state;
    assert.equal(detail(taken, b.sam).openWork.needsYou[0].responsibility.coverage, 'handed_back');
  });

  test('a handoff that goes nowhere never reads as handled: no state but `covered` says so', () => {
    const { s, c, sam, rid } = asked();
    const states = new Map();
    states.set('requested', s);
    states.set('acknowledged', recordAcknowledged(s, c, rid).state);
    states.set('accepted-yours', recordAccepted(s, c, rid, true).state);
    states.set('declined', recordDeclined(s, c, rid).state);
    for (const [name, state] of states) {
      const item = [...Object.values(detail(state, sam).openWork).flat()][0];
      assert.notEqual(item.responsibility.coverage, 'covered', name);
      assert.notEqual(item.plan?.label, 'PLAN_IN_PLACE', name);
    }
  });

  test('nobody recorded is "nobody recorded": never "Mom is picking up", never "does not need you"', () => {
    const { s: base, c, sam } = twoKids();
    const s = addTaskFor(base, c, sam, 'Book the dentist').state;
    const item = detail(s, sam).openWork.nobodyRecorded[0];
    assert.equal(item.responsibility.coverage, 'nobody_recorded');
    assert.equal(item.responsibility.requiresYou, null, 'unknown stays unknown');
    assert.equal(item.responsibility.holder, null);
    assert.ok(item.unknownFacts.includes('who_is_handling'));
    assert.equal(item.plan, null, 'a task nobody was asked to take has no arrangement to judge');
  });
});

describe('T/U/V. dependencies use the shared standing, never a Kids interpretation', () => {
  function chain() {
    const { s: base, c, sam } = twoKids();
    const form = addTaskFor(base, c, sam, 'Get the form signed');
    const trip = addTaskFor(form.state, c, sam, 'Hand in the form');
    const edge = addDependency(trip.state, c, { relation: 'requires', from: { kind: 'task', id: trip.id }, to: { kind: 'task', id: form.id } });
    assert.equal(edge.refusal, null);
    return { s: edge.state, c, sam, form, trip };
  }
  const tripItem = (s, sam, trip) => Object.values(detail(s, sam).openWork).flat().find((i) => i.ref.id === trip.id);

  test('a live prerequisite blocks: the task is waiting', () => {
    const { s, sam, trip, form } = chain();
    const item = tripItem(s, sam, trip);
    assert.equal(item.dependency.readiness, 'blocked');
    assert.deepEqual(item.dependency.waitingOn.map((p) => [p.ref.id, p.title, p.cause]), [[form.id, 'Get the form signed', 'pending']]);
    assert.ok(detail(s, sam).openWork.waiting.some((i) => i.ref.id === trip.id));
  });

  test('T. a COMPLETED prerequisite is satisfied: ready', () => {
    const { s, c, sam, trip, form } = chain();
    const done = completeTask(s, c, form.id);
    assert.equal(tripItem(done, sam, trip).dependency.readiness, 'ready');
  });

  test('U. a REMOVED prerequisite is unavailable, NOT completed: review needed, and it is said', () => {
    const { s, c, sam, trip, form } = chain();
    const gone = archiveTask(s, c, form.id);
    const item = tripItem(gone, sam, trip);
    assert.equal(item.dependency.readiness, 'needsReview');
    assert.deepEqual(item.dependency.unavailable.map((p) => p.cause), ['retired']);
    assert.deepEqual(item.dependency.waitingOn, []);
    assert.ok(detail(gone, sam).needsAttention.some((e) => e.code === 'prerequisite_unavailable' && e.ref.id === trip.id));
    // history is not rewritten: the edge is still there, still active
    assert.equal(gone.dependencies.filter((d) => d.status === 'active').length, 1);
  });

  test('U. a removed EVENT prerequisite is unavailable too (an event never "completes")', () => {
    const { s: base, c, sam } = twoKids();
    const meeting = addEventFor(base, c, sam, 'School meeting');
    const t = addTaskFor(meeting.state, c, sam, 'Prepare questions');
    const linked = addDependency(t.state, c, { relation: 'requires', from: { kind: 'task', id: t.id }, to: { kind: 'event', id: meeting.id } });
    const removed = removeEvent(linked.state, c, meeting.id);
    assert.equal(tripItem(removed, sam, t).dependency.readiness, 'needsReview');
  });

  test('V. a MISSING prerequisite is not satisfied (defensive read of a state validation would refuse)', () => {
    const { s, sam, trip, form } = chain();
    const dangling = { ...s, tasks: s.tasks.filter((t) => t.id !== form.id) };
    assert.equal(validateAppState(dangling).ok, false);
    const item = tripItem(dangling, sam, trip);
    assert.equal(item.dependency.readiness, 'needsReview');
    assert.deepEqual(item.dependency.unavailable.map((p) => p.cause), ['missing']);
  });

  test('retiring the edge (the correction path) clears the fact; nothing else does', () => {
    const { s, c, sam, trip } = chain();
    const edge = s.dependencies[0];
    const cleared = removeDependency(s, c, edge.id);
    assert.equal(tripItem(cleared, sam, trip).dependency, null);
  });
});

describe('W/X/Y/Z/AC. fallback readiness: only what the record can support', () => {
  function pickup() {
    const { s: base, c, sam } = twoKids();
    const e = addEventFor(base, c, sam, 'Tuesday pickup');
    return { s: e.state, c, sam, ref: { kind: 'event', id: e.id } };
  }
  const plan = (s, sam) => detail(s, sam).plans[0].plan;

  test('Y. nothing recorded is NOT ENOUGH KNOWN, never a green state', () => {
    const { s, sam } = pickup();
    assert.deepEqual([plan(s, sam).label, plan(s, sam).reason], ['NOT_ENOUGH_KNOWN', 'nothing_recorded']);
  });

  test('W. accepted by an active person and off her list is PLAN IN PLACE', () => {
    const { s, c, sam, ref } = pickup();
    const asked = askNewPerson(s, c, ref);
    const ok = recordAccepted(asked.state, c, responsibilityOf(asked.state, ref).id, false).state;
    assert.equal(plan(ok, sam).label, 'PLAN_IN_PLACE');
    assert.equal(plan(ok, sam).relies.displayName, 'Alex');
  });

  test('X. declined is a gap: NEEDS A PLAN', () => {
    const { s, c, sam, ref } = pickup();
    const asked = askNewPerson(s, c, ref);
    const no = recordDeclined(asked.state, c, responsibilityOf(asked.state, ref).id).state;
    assert.deepEqual([plan(no, sam).label, plan(no, sam).reason], ['NEEDS_A_PLAN', 'declined']);
  });

  test('Z. the person relied on is archived later: PLAN IN PLACE cannot survive it', () => {
    const { s, c, sam, ref } = pickup();
    const asked = askNewPerson(s, c, ref);
    const ok = recordAccepted(asked.state, c, responsibilityOf(asked.state, ref).id, false).state;
    assert.equal(plan(ok, sam).label, 'PLAN_IN_PLACE');
    const after = archive(ok, c, asked.personId);
    assert.deepEqual([plan(after, sam).label, plan(after, sam).reason], ['NEEDS_A_PLAN', 'holder_unavailable']);
    assert.equal(detail(after, sam).plans[0].item.responsibility.coverage, 'holder_unavailable');
    assert.ok(detail(after, sam).needsAttention.some((e) => e.code === 'holder_unavailable'));
  });

  test('Z. an archived holder is never filed under "someone else has it", even though the foundation says it does not need her (MP-K-16)', () => {
    const { s: base, c, sam } = twoKids();
    const t = addTaskFor(base, c, sam, 'Take the cleats');
    const ref = { kind: 'task', id: t.id };
    const asked = askNewPerson(t.state, c, ref);
    const ok = recordAccepted(asked.state, c, responsibilityOf(asked.state, ref).id, false).state;
    const after = archive(ok, c, asked.personId);
    const w = detail(after, sam).openWork;
    assert.equal(w.needsYou.length, 1);
    assert.equal(w.withSomeoneElse.length, 0);
    assert.equal(w.needsYou[0].responsibility.requiresYou, false, 'the foundation answer is reported as it is');
  });

  test('AC. creating a task to sort a gap out does NOT move the label; the step is reported beside it', () => {
    const { s, c, sam, ref } = pickup();
    const before = plan(s, sam).label;
    const step = addTaskFor(s, c, sam, 'Arrange backup pickup', { partOf: ref });
    const afterPlan = plan(step.state, sam);
    assert.equal(afterPlan.label, before);
    assert.deepEqual(afterPlan.openSteps.map((x) => x.title), ['Arrange backup pickup']);
    const completed = completeTask(step.state, c, step.id);
    assert.equal(plan(completed, sam).label, before, 'even a FINISHED step is not evidence that a plan exists');
    assert.deepEqual(plan(completed, sam).openSteps, []);
  });

  test('a gap is actionable; a plan in place does not ask for more', () => {
    const { s, c, sam, ref } = pickup();
    assert.ok(detail(s, sam).plans[0].item.actions.includes('add_plan_step'));
    const asked = askNewPerson(s, c, ref);
    const ok = recordAccepted(asked.state, c, responsibilityOf(asked.state, ref).id, false).state;
    assert.equal(detail(ok, sam).plans[0].item.actions.includes('add_plan_step'), false);
  });

  test('AA. a person who is not one of this household\'s people cannot hold anything', () => {
    const { s, c, ref } = pickup();
    const out = requestHandoff(s, c, { ref, personId: 'person-from-another-household' });
    assert.equal(out.outcome, 'unknown_person');
    assert.equal(out.state, s);
    assert.equal(s.responsibilities.length, 0);
  });
});

describe('AB/AJ/AL. boundaries: nothing silently becomes a child\'s, or another household\'s', () => {
  test('AB. household-level and adult-subject rows never appear under a child', () => {
    const { s: base, c, sam } = twoKids();
    let s = addTaskFor(base, c, sam, 'Sam only').state;
    const household = { ...s.tasks[0], id: 'task-household', title: 'Household chore', subjectMemberId: null, scope: 'household' };
    const adult = { ...s.tasks[0], id: 'task-adult', title: 'Adult errand', subjectMemberId: s.user.id, scope: 'household' };
    s = { ...s, tasks: [...s.tasks, household, adult] };
    assert.equal(validateAppState(s).ok, true);
    const titles = Object.values(detail(s, sam).openWork).flat().map((i) => i.title);
    assert.deepEqual(titles, ['Sam only']);
    assert.equal(view(s).unattributed, 0, 'household-level rows are not "unattributed"');
  });

  test('AL. a row naming a child that does not exist is counted, never handed to another child', () => {
    const { s: base, c, sam, ivy } = twoKids();
    const ok = addTaskFor(base, c, sam, 'Real').state;
    const bad = { ...ok, tasks: [...ok.tasks, { ...ok.tasks[0], id: 'task-orphan', title: 'Orphan', subjectMemberId: 'child-ghost' }] };
    assert.equal(validateAppState(bad).ok, false, 'the store would refuse this state');
    const v = view(bad);
    assert.equal(v.unattributed, 1);
    for (const kid of [sam, ivy]) {
      assert.equal(Object.values(detail(bad, kid).openWork).flat().some((i) => i.title === 'Orphan'), false);
    }
  });

  test('AJ. a request for another household returns nothing of this one', () => {
    const { s: base, c, sam } = twoKids();
    const s = addEventFor(base, c, sam, 'Soccer').state;
    const foreign = buildKidsView(s, 'household-of-someone-else', { nowMs: NOW });
    assert.equal(foreign.status, 'household_mismatch');
    assert.deepEqual(foreign.children, []);
    assert.equal(buildChildDetail(s, 'household-of-someone-else', sam, { nowMs: NOW }), null);
  });

  test('a child that is not in this household has no detail', () => {
    const { s } = twoKids();
    assert.equal(detail(s, 'child-not-here'), null);
  });
});

describe('attention: the shared primitive is consumed, never re-derived (BB)', () => {
  function withDeadlines() {
    const { s: base, c, sam, ivy } = twoKids();
    let s = base;
    const ids = {};
    for (const [name, due] of [['overdue', '2026-09-20'], ['today', '2026-09-21'], ['soon', '2026-09-23'], ['later', '2026-09-30']]) {
      const t = addTaskFor(s, c, sam, `Due ${name}`, { dueDate: due });
      s = t.state;
      ids[name] = t.id;
    }
    s = addTaskFor(s, c, ivy, 'Ivy today', { dueDate: '2026-09-21' }).state;
    return { s, ids, sam, ivy };
  }

  test('every shared entry Kids shows is an item attentionFor returned, with the same urgency', () => {
    const { s, sam } = withDeadlines();
    const primitive = attentionFor(s, NOW);
    for (const entry of detail(s, sam).needsAttention.filter((e) => e.source === 'shared')) {
      assert.ok(
        primitive.some((p) => p.about && p.about.kind === entry.ref.kind && p.about.id === entry.ref.id && p.reason === entry.code && p.urgency === entry.urgency),
        `${entry.ref.id}/${entry.code} is not in attentionFor`
      );
    }
  });

  test('and nothing the primitive flags for a child is missing (no contradiction with Today or Calendar)', () => {
    const { s, ids, sam } = withDeadlines();
    const shown = new Map(detail(s, sam).needsAttention.filter((e) => e.source === 'shared').map((e) => [e.ref.id, e.urgency]));
    assert.equal(shown.get(ids.overdue), 'now');
    assert.equal(shown.get(ids.today), 'today');
    assert.equal(shown.get(ids.soon), 'soon');
    assert.equal(shown.has(ids.later), false, 'the primitive has no opinion, so Kids has none');
  });

  test('ordering follows the primitive\'s own urgency, then date, then id', () => {
    const { s, ids, sam } = withDeadlines();
    assert.deepEqual(detail(s, sam).needsAttention.map((e) => e.ref.id), [ids.overdue, ids.today, ids.soon]);
  });

  test('where the primitive is silent Kids states a FACT with no urgency of its own', () => {
    const { s: base, c, sam } = twoKids();
    const t = addTaskFor(base, c, sam, 'Costume');
    const asked = askNewPerson(t.state, c, { kind: 'task', id: t.id });
    const facts = detail(asked.state, sam).needsAttention;
    assert.ok(facts.length > 0 && facts.every((e) => e.source === 'fact' && e.urgency === null));
  });

  test('whole-day judgments (conflict, capacity) and Needs Me items are not attributed to a child', () => {
    const { s, sam } = withDeadlines();
    const codes = new Set(detail(s, sam).needsAttention.map((e) => e.code));
    for (const forbidden of ['conflict', 'capacity_overload', 'needs_me']) assert.equal(codes.has(forbidden), false);
  });
});

describe('AF/AT. one canonical item, many sections, still one truth; deterministic and read-only', () => {
  test('AF. a timed task appears under upcoming AND open work as the SAME facts', () => {
    const { s: base, c, sam } = twoKids();
    const startsAt = new Date(NOW + 2 * DAY).toISOString();
    const t = addTaskFor(base, c, sam, 'Drop the form at the office');
    const timed = { ...t.state, tasks: t.state.tasks.map((x) => (x.id === t.id ? { ...x, plan: { kind: 'timed', startsAt } } : x)) };
    const d = detail(timed, sam);
    const up = d.upcoming.find((i) => i.ref.id === t.id);
    const work = Object.values(d.openWork).flat().find((i) => i.ref.id === t.id);
    assert.ok(up && work);
    assert.deepEqual(up, work);
  });

  test('AT. the same state and clock give the identical projection', () => {
    const { s: base, c, sam } = twoKids();
    let s = addEventFor(base, c, sam, 'Soccer').state;
    s = addTaskFor(s, c, sam, 'Form', { dueDate: '2026-09-23' }).state;
    assert.deepEqual(view(s), view(s));
    assert.deepEqual(detail(s, sam), detail(s, sam));
  });

  test('the projection never mutates the state it reads', () => {
    const { s: base, c, sam } = twoKids();
    let s = addEventFor(base, c, sam, 'Soccer').state;
    s = addTaskFor(s, c, sam, 'Form').state;
    const before = JSON.stringify(s);
    const deepFreeze = (o) => {
      Object.freeze(o);
      for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
      return o;
    };
    deepFreeze(s);
    view(s);
    detail(s, sam);
    assert.equal(JSON.stringify(s), before);
  });
});

describe('BE/BI. routines and repetition are shown as recorded facts only', () => {
  test('BE. a child-subject System is listed, read-only', () => {
    const { s: base, sam } = twoKids();
    const system = {
      id: 'sys-1', name: 'School-night launch', description: '', categoryId: base.categories[0].id, subjectMemberId: sam,
      automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'child',
    };
    const s = { ...base, systems: [system] };
    assert.equal(validateAppState(s).ok, true);
    assert.deepEqual(detail(s, sam).routines, [{ id: 'sys-1', name: 'School-night launch' }]);
  });

  test('BI. an event with an active recurrence rule says it repeats; occurrences are not invented', () => {
    const { s: base, c, sam } = twoKids();
    const e = addEventFor(base, c, sam, 'Piano');
    const s = addRecurrence(e.state, c, { kind: 'event', id: e.id }, { anchorDate: '2026-09-22', frequency: 'weekly', byWeekday: [2] });
    const item = detail(s, sam).upcoming[0];
    assert.deepEqual(item.repeats, { frequency: 'weekly', interval: 1, byWeekday: [2] });
    assert.equal(detail(s, sam).upcoming.length, 1);
  });
});

test('the projection needs no network, no clock but the one it is given', () => {
  const { s: base, c, sam } = twoKids();
  const s = addEventFor(base, c, sam, 'Soccer').state;
  const originalNow = Date.now;
  Date.now = () => { throw new Error('the projection must not read the device clock'); };
  try {
    assert.equal(view(s).children.length, 2);
    assert.ok(detail(s, sam));
  } finally {
    Date.now = originalNow;
  }
});
