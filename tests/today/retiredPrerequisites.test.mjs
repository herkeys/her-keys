/**
 * TODAY — a prerequisite that was removed, archived or is missing is not a prerequisite that was met (HA-009).
 *
 * The repaired foundation made REMOVED != COMPLETED and MISSING != SATISFIED: `blockersOf` names only what is still live,
 * and a commitment left with only gone prerequisites is `needsReview` — neither blocked nor ready. Today's promise follows
 * from it, and each half is proved here at the projection, over every kind of "gone" and over the mixed cases:
 *
 *   1. Today never says a commitment "needs" something that was removed, archived, or is not there.
 *   2. Today never says or implies that such a prerequisite was completed or handled.
 *   3. Where ONLY gone prerequisites remain, Today says one neutral thing: it was waiting on something no longer there.
 *   4. What is live, and what is completed, is said exactly as it always was.
 *
 * It also proves the two DEPENDENT-side readers the foundation's change touched: "what can wait" (is the thing that
 * requires it still live?) and the delegated rows (is the thing that was handed off still live work?).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { removeEvent } from '../../src/domain/events.ts';
import { captureNeedsMeItem, resolveNeedsMeItem } from '../../src/domain/needsMe.ts';
import { oneMoveRecordId } from '../../src/domain/oneMove.ts';
import { accept, acknowledge, addPerson, decline, delegate } from '../../src/domain/responsibility.ts';
import { zonedTimeToEpochMs } from '../../src/domain/logicalDay.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { briefingFor } from '../../src/domain/reasoning/briefing.ts';
import { addDependency, isBlocked, isDone, readinessOf } from '../../src/domain/structure.ts';
import { archiveTask, completeTask } from '../../src/domain/tasks.ts';
import { attentionView } from '../../src/features/today/model/attentionView.ts';
import { SYSTEM, USER } from '../support/provenance.mjs';
import { corpus } from './corpus.mjs';
import { DAY, NEXT_DAY, TZ, ev, eventNamed, household, mkCtx, nyInstant, nyMs, strings, taskNamed, tk, valid, view, withMove } from './fixtures.mjs';

const RETIRED = 'It was waiting on something that’s no longer there.';
const MAY_HAVE_BEEN = 'It may have been waiting on something that’s no longer there.';
const UNCONFIRMED = Object.freeze({ producer: 'ai-inference', artifactId: null, confidence: 'possible' });

const T = (s, title) => ({ kind: 'task', id: taskNamed(s, title).id });
const E = (s, title) => ({ kind: 'event', id: eventNamed(s, title).id });

/** `from` requires `to`, as a row with the given provenance (stated by her unless said otherwise). */
function requires(state, from, to, provenance) {
  const result = addDependency(state, mkCtx(), { relation: 'requires', from, to, ...(provenance ? { provenance } : {}) });
  assert.equal(result.refusal, null, 'the fixture edge is accepted');
  return result.state;
}

const removed = (s, title) => removeEvent(s, mkCtx(), eventNamed(s, title).id);
const archived = (s, title) => archiveTask(s, mkCtx(), taskNamed(s, title).id);
const completed = (s, title) => completeTask(s, mkCtx(), taskNamed(s, title).id);

/** A row whose prerequisite is not there at all. State validation refuses a dangling edge, so it is written as a literal. */
const withDanglingEdge = (state, from, to) => ({
  ...state,
  dependencies: [
    ...state.dependencies,
    { id: 'dep-dangling', relation: 'requires', from, to, status: 'active', createdAt: nyInstant(7), updatedAt: nyInstant(7), provenance: USER, scope: 'personal' },
  ],
});

/** A selected One Move on the given row, stored exactly as the domain stores one. `check: false` for a state the store would refuse. */
const moveOn = (state, ref, { check = true } = {}) => {
  const next = {
    ...state,
    oneMoves: [{ id: oneMoveRecordId(DAY), forDate: DAY, targetId: ref.id, targetType: ref.kind, status: 'selected', decidedAt: nyInstant(7), completedAt: null, provenance: SYSTEM, scope: 'personal' }],
  };
  return check ? valid(next) : next;
};
const contextOf = (state, ref, opts) => view(moveOn(state, ref, opts), nyMs(9)).oneMove.why.context;
const upcomingOf = (state, opts = {}) => view(opts.check === false ? state : valid(state), nyMs(15)).upcoming;

/** The wording the projection must never use about something that is gone. */
const IMPLIES_MET = /\b(done|finished|complete[ds]?|handled|covered|taken care|ready|unblocked|no longer needed)\b/i;

describe('a removed event that a commitment required', () => {
  const build = () => {
    let s = ev(household(), { title: 'Fitting appointment', from: [16], to: [17], day: 17 });
    s = tk(s, { title: 'Pay the tailor', due: NEXT_DAY });
    return requires(s, T(s, 'Pay the tailor'), E(s, 'Fitting appointment'));
  };

  test('control: while the fitting is live, it is said as it always was', () => {
    const s = build();
    assert.equal(upcomingOf(s).statement, '“Pay the tailor” is due tomorrow and needs “Fitting appointment” first.');
    assert.deepEqual(contextOf(s, T(s, 'Pay the tailor')), ['It needs “Fitting appointment” first.']);
    assert.equal(readinessOf(s, T(s, 'Pay the tailor')), 'blocked');
  });

  test('once the fitting is removed, Today never says the payment needs it — anywhere on the screen', () => {
    const s = removed(build(), 'Fitting appointment');
    assert.equal(eventNamed(s, 'Fitting appointment').status, 'removed', 'the fixture really removed it');
    assert.equal(upcomingOf(s), null, 'Coming up has nothing to say: nothing live is being waited on');
    const v = view(moveOn(s, T(s, 'Pay the tailor')), nyMs(9));
    for (const line of strings(v)) assert.doesNotMatch(line, /Fitting appointment/, `“${line}” names the removed event`);
    assert.doesNotMatch(strings(v.oneMove.why.context).join(' '), /\bneeds?\b/);
  });

  test('a removed event is not said to be done, and is not counted as handled', () => {
    const s = removed(build(), 'Fitting appointment');
    assert.equal(isDone(s, E(s, 'Fitting appointment')), false, 'the foundation: removal is retirement, not completion');
    assert.equal(isBlocked(s, T(s, 'Pay the tailor')), true, 'and it unlocks nothing');
    const v = view(moveOn(s, T(s, 'Pay the tailor')), nyMs(9));
    assert.equal(v.handled, null);
    for (const line of v.oneMove.why.context) assert.doesNotMatch(line, IMPLIES_MET);
  });

  test('the one neutral line is said, and only in the One Move’s context', () => {
    const s = removed(build(), 'Fitting appointment');
    assert.deepEqual(contextOf(s, T(s, 'Pay the tailor')), [RETIRED]);
    assert.equal(readinessOf(s, T(s, 'Pay the tailor')), 'needsReview');
  });

  test('the same holds for a task due today that was ALREADY her One Move when its prerequisite was removed', () => {
    let s = ev(household(), { title: 'Fitting appointment', from: [16], to: [17], day: 17 });
    s = tk(s, { title: 'Pay the tailor', due: DAY });
    s = requires(s, T(s, 'Pay the tailor'), E(s, 'Fitting appointment'));
    s = removed(moveOn(s, T(s, 'Pay the tailor'), { check: false }), 'Fitting appointment');
    const v = view(valid(s), nyMs(9));
    assert.equal(v.oneMove.action, 'Pay the tailor');
    assert.deepEqual(v.oneMove.why.context, [RETIRED]);
  });

  test('the machinery itself no longer offers such a task as the day\'s One Move (a blocked task cannot honestly be "the one thing")', () => {
    // Build 2A reconciliation: the candidate's selection (HK13) excludes any task that is not `ready`, and a task whose only
    // prerequisite is gone is `needsReview`. The neutral line above is therefore for a move chosen BEFORE the prerequisite went.
    let s = ev(household(), { title: 'Fitting appointment', from: [16], to: [17], day: 17 });
    s = tk(s, { title: 'Pay the tailor', due: DAY });
    s = removed(requires(s, T(s, 'Pay the tailor'), E(s, 'Fitting appointment')), 'Fitting appointment');
    assert.equal(readinessOf(s, T(s, 'Pay the tailor')), 'needsReview');
    const v = view(withMove(valid(s)), nyMs(9));
    assert.notEqual(v.oneMove?.action, 'Pay the tailor');
  });
});

describe('an archived task that a commitment required', () => {
  const build = () => {
    let s = ev(household(), { title: 'Field trip', from: [9], to: [12], day: 17 });
    s = tk(s, { title: 'Sign the permission form', plan: { kind: 'unplanned' } });
    return requires(s, E(s, 'Field trip'), T(s, 'Sign the permission form'));
  };

  test('control: while the form is open, the trip needs it', () => {
    const s = build();
    assert.equal(upcomingOf(s).statement, '“Field trip” tomorrow at 9:00 AM needs “Sign the permission form” first.');
    assert.deepEqual(contextOf(s, E(s, 'Field trip')), ['It needs “Sign the permission form” first.']);
  });

  test('once the form is archived, Today never says the trip needs it — an archived task is set aside, not finished', () => {
    const s = archived(build(), 'Sign the permission form');
    assert.equal(taskNamed(s, 'Sign the permission form').status, 'archived');
    assert.equal(upcomingOf(s), null);
    const v = view(moveOn(s, E(s, 'Field trip')), nyMs(9));
    for (const line of strings(v)) assert.doesNotMatch(line, /Sign the permission form/, `“${line}” names the archived task`);
    assert.deepEqual(v.oneMove.why.context, [RETIRED]);
    for (const line of v.oneMove.why.context) assert.doesNotMatch(line, IMPLIES_MET);
    assert.equal(isDone(s, T(s, 'Sign the permission form')), false);
  });
});

describe('a completed prerequisite is unchanged: it is met, so nothing is said about it at all', () => {
  test('a completed task adds neither “needs” nor the neutral line: the commitment is simply ready', () => {
    let s = ev(household(), { title: 'Field trip', from: [9], to: [12], day: 17 });
    s = tk(s, { title: 'Sign the permission form', plan: { kind: 'unplanned' } });
    s = requires(s, E(s, 'Field trip'), T(s, 'Sign the permission form'));
    const done = completed(s, 'Sign the permission form');
    assert.equal(readinessOf(done, E(done, 'Field trip')), 'ready');
    assert.equal(upcomingOf(done), null);
    assert.deepEqual(contextOf(done, E(done, 'Field trip')), [], 'a met prerequisite is not “gone”, so it is not said to be');
  });

  test('a resolved Needs Me item is met in the same way', () => {
    let s = captureNeedsMeItem(ev(household(), { title: 'Field trip', from: [9], to: [12], day: 17 }), mkCtx(), { title: 'Send the RSVP' });
    const item = { kind: 'needsMe', id: s.needsMe[0].id };
    s = requires(s, E(s, 'Field trip'), item);
    assert.equal(upcomingOf(s).statement, '“Field trip” tomorrow at 9:00 AM needs “Send the RSVP” first.');
    const resolved = resolveNeedsMeItem(s, item.id, mkCtx());
    assert.equal(readinessOf(resolved, E(resolved, 'Field trip')), 'ready');
    assert.equal(upcomingOf(resolved), null);
    assert.deepEqual(contextOf(resolved, E(resolved, 'Field trip')), []);
  });
});

describe('several prerequisites at once: only the live one is spoken of', () => {
  const build = () => {
    let s = ev(household(), { title: 'Site visit', from: [16], to: [17], day: 17 });
    for (const title of ['Get the quote', 'Pick the date', 'Pay the deposit']) s = tk(s, { title, plan: { kind: 'unplanned' } });
    s = tk(s, { title: 'Book the venue', due: NEXT_DAY });
    for (const to of [T(s, 'Get the quote'), T(s, 'Pick the date'), T(s, 'Pay the deposit'), E(s, 'Site visit')]) s = requires(s, T(s, 'Book the venue'), to);
    return s;
  };
  /** One live, one archived, one completed, one removed event. */
  const mixed = () => removed(completed(archived(build(), 'Pick the date'), 'Pay the deposit'), 'Site visit');

  test('Coming up names the live prerequisite, counts none of the others, and never mentions them', () => {
    const s = mixed();
    assert.equal(readinessOf(s, T(s, 'Book the venue')), 'blocked');
    const u = upcomingOf(s);
    assert.equal(u.statement, '“Book the venue” is due tomorrow and needs “Get the quote” first.', 'no “and N more”: the gone ones are not counted');
    assert.deepEqual(u.ref, T(s, 'Get the quote'));
    for (const gone of ['Pick the date', 'Pay the deposit', 'Site visit']) assert.doesNotMatch(u.statement, new RegExp(gone));
  });

  test('the One Move’s context says what is live, and does not add the neutral line while anything live remains', () => {
    const s = mixed();
    assert.deepEqual(contextOf(s, T(s, 'Book the venue')), ['It needs “Get the quote” first.']);
  });

  test('when the last live prerequisite is done, what remains is only gone things: the neutral line, once', () => {
    const s = completed(mixed(), 'Get the quote');
    assert.equal(readinessOf(s, T(s, 'Book the venue')), 'needsReview', 'two gone prerequisites, none live: review, not ready');
    assert.equal(upcomingOf(s), null);
    assert.deepEqual(contextOf(s, T(s, 'Book the venue')), [RETIRED], 'one line, not one per gone prerequisite');
  });

  test('live prerequisites are still counted exactly as before, beside a gone one', () => {
    const s = archived(build(), 'Pick the date');
    const u = upcomingOf(s);
    assert.equal(u.statement, '“Book the venue” is due tomorrow and needs “Get the quote” and 2 more first.', 'three are live — the quote, the deposit, the site visit — and the archived date is not one of them');
  });
});

describe('a prerequisite that is not there at all', () => {
  const build = () => {
    let s = tk(household(), { title: 'Book the venue', due: NEXT_DAY });
    s = tk(s, { title: 'Get the quote', plan: { kind: 'unplanned' } });
    s = requires(s, T(s, 'Book the venue'), T(s, 'Get the quote'));
    // The row is gone but the edge remains: the defensive read the foundation names `missing`.
    return { ...s, tasks: s.tasks.filter((t) => t.title !== 'Get the quote') };
  };

  test('the projection does not throw, and never says the commitment needs a row that is not there', () => {
    const s = build();
    assert.equal(readinessOf(s, T(s, 'Book the venue')), 'needsReview', 'the fixture really exercises the missing path');
    assert.equal(upcomingOf(s, { check: false }), null);
    const v = view(moveOn(s, T(s, 'Book the venue'), { check: false }), nyMs(9));
    assert.deepEqual(v.oneMove.why.context, [RETIRED]);
    for (const line of strings(v)) assert.doesNotMatch(line, /\bneeds\b|Get the quote/, line);
  });

  test('an edge that points at nothing, from an event, says nothing either — and is not read as satisfied', () => {
    const trip = ev(household(), { title: 'Field trip', from: [9], to: [12], day: 17 });
    const ghost = { kind: 'task', id: 'task-that-was-never-there' };
    const s = withDanglingEdge(trip, E(trip, 'Field trip'), ghost);
    assert.equal(isDone(s, ghost), false, 'MISSING != SATISFIED');
    assert.equal(readinessOf(s, E(s, 'Field trip')), 'needsReview');
    assert.equal(upcomingOf(s, { check: false }), null);
    assert.deepEqual(contextOf(s, E(s, 'Field trip'), { check: false }), [RETIRED]);
  });
});

describe('an unconfirmed relationship is still only a possibility, gone or not', () => {
  const build = (retiredProvenance) => {
    let s = tk(household(), { title: 'Book the venue', due: NEXT_DAY });
    s = tk(s, { title: 'Get the quote', plan: { kind: 'unplanned' } });
    s = tk(s, { title: 'Pick the date', plan: { kind: 'unplanned' } });
    s = requires(s, T(s, 'Book the venue'), T(s, 'Get the quote'), retiredProvenance);
    return { s, book: T(s, 'Book the venue') };
  };

  test('a gone prerequisite Her Keys only inferred is “may have been”, never a flat statement', () => {
    const { s, book } = build(UNCONFIRMED);
    assert.deepEqual(contextOf(archived(s, 'Get the quote'), book), [MAY_HAVE_BEEN]);
  });

  test('one she stated among them makes it a statement, again without one line per prerequisite', () => {
    let { s, book } = build(UNCONFIRMED);
    s = requires(s, book, T(s, 'Pick the date'));
    s = archived(archived(s, 'Get the quote'), 'Pick the date');
    assert.deepEqual(contextOf(s, book), [RETIRED]);
  });

  test('a live prerequisite Her Keys inferred is still “may need”, and a gone stated one is not mentioned beside it', () => {
    let { s, book } = build(UNCONFIRMED);
    s = requires(s, book, T(s, 'Pick the date'));
    s = archived(s, 'Pick the date');
    assert.deepEqual(contextOf(s, book), ['It may need “Get the quote” first.']);
  });
});

describe('what can wait — “something live requires it” is judged by the dependent’s own standing, not by isDone', () => {
  const titles = (state) => {
    const c = view(withMove(valid(state)), nyMs(9)).canWait;
    return c === null ? [] : [...c.items, ...c.moreItems].map((i) => i.title);
  };
  /** `Tidy the entryway` is the One Move; `Print the permit` is deferrable unless something live requires it. */
  const base = () => tk(tk(household(), { title: 'Tidy the entryway', minutes: 5 }), { title: 'Print the permit', minutes: 15 });

  test('control: nothing requires the permit, so it can wait', () => {
    assert.deepEqual(titles(base()), ['Print the permit']);
  });

  test('a live event that requires it keeps it off the list — deferring it would strand the event', () => {
    let s = ev(base(), { title: 'City hall appointment', from: [9], to: [10], day: 17 });
    s = requires(s, E(s, 'City hall appointment'), T(s, 'Print the permit'));
    assert.deepEqual(titles(s), []);
  });

  test('a REMOVED event that required it does not: a removed event is not done, but it is not live either', () => {
    let s = ev(base(), { title: 'City hall appointment', from: [9], to: [10], day: 17 });
    s = requires(s, E(s, 'City hall appointment'), T(s, 'Print the permit'));
    assert.equal(isDone(removed(s, 'City hall appointment'), E(s, 'City hall appointment')), false, 'the premise: the foundation no longer calls it done');
    assert.deepEqual(titles(removed(s, 'City hall appointment')), ['Print the permit']);
  });

  test('an open task that requires it keeps it off the list; finished, or set aside, it no longer does', () => {
    let s = tk(base(), { title: 'Submit the application', plan: { kind: 'unplanned' } });
    s = requires(s, T(s, 'Submit the application'), T(s, 'Print the permit'));
    assert.deepEqual(titles(s), [], 'live: it would be stranded');
    assert.deepEqual(titles(completed(s, 'Submit the application')), ['Print the permit'], 'finished: nothing is stranded');
    assert.deepEqual(titles(archived(s, 'Submit the application')), ['Print the permit'], 'set aside: nothing is stranded either — the same reading as a removed event');
  });

  test('a live event and a removed one together: the live one still holds it', () => {
    let s = ev(ev(base(), { title: 'City hall appointment', from: [9], to: [10], day: 17 }), { title: 'Second visit', from: [11], to: [12], day: 17 });
    s = requires(requires(s, E(s, 'City hall appointment'), T(s, 'Print the permit')), E(s, 'Second visit'), T(s, 'Print the permit'));
    assert.deepEqual(titles(removed(s, 'City hall appointment')), []);
  });
});

describe('delegated things — a target that was set aside is not live work, and it was not handled', () => {
  const NOW = nyMs(14);
  /** Hands `about` to Grandma June and moves it to `step`. `accepted` (she took it, and it no longer needs her) is a WAITING row; the others need her. */
  const handOff = (s, about, step) => {
    let next = addPerson(s, mkCtx(nyMs(9)), { displayName: 'Grandma June', relationship: 'grandparent' });
    const holder = { kind: 'person', id: next.people[0].id };
    next = delegate(next, mkCtx(nyMs(12)), { about, to: holder, ackWithinMinutes: 30 });
    const id = next.responsibilities[0].id;
    if (step === 'acknowledged') next = acknowledge(next, mkCtx(nyMs(13)), id);
    if (step === 'accepted') next = accept(acknowledge(next, mkCtx(nyMs(13)), id), mkCtx(nyMs(13, 30)), id);
    if (step === 'declined') next = decline(next, mkCtx(nyMs(13)), id);
    return next;
  };
  const rows = (v) => [...(v.attention?.rows ?? []), ...(v.waiting?.rows ?? [])];
  const STEPS = ['acknowledged', 'accepted', 'declined'];
  const pickup = () => ev(household(), { title: 'School pickup', from: [15, 30], to: [16] });

  test('control: while the pickup is live and handed off, it is shown, without a word about it being handled', () => {
    for (const step of STEPS) {
      const base = pickup();
      const v = view(valid(handOff(base, E(base, 'School pickup'), step)), NOW);
      assert.equal(rows(v).length, 1, step);
      assert.match(rows(v)[0].statement, /School pickup/, step);
      assert.doesNotMatch(rows(v)[0].statement, /handled|covered|taken care/i, step);
    }
  });

  test('removed after it was handed off: it is gone from waiting and from what needs her, and nothing says it was handled', () => {
    for (const step of STEPS) {
      const base = pickup();
      const handed = handOff(base, E(base, 'School pickup'), step);
      const v = view(valid(removed(handed, 'School pickup')), NOW);
      assert.deepEqual(rows(v), [], `${step}: a removed event is not live work`);
      assert.equal(v.handled, null, `${step}: and it is not counted as handled`);
      for (const line of strings(v)) assert.doesNotMatch(line, /School pickup|handled|covered|taken care/i, `${step}: “${line}”`);
    }
  });

  test('archived after it was handed off: the same — set aside is not shown as live, and is not finished', () => {
    for (const step of STEPS) {
      const base = tk(household(), { title: 'Ask Dad to move the box', minutes: 12 });
      const handed = handOff(base, T(base, 'Ask Dad to move the box'), step);
      assert.equal(rows(view(valid(handed), NOW)).length, 1, `${step}: the control row is there while the task is open`);
      const v = view(valid(archived(handed, 'Ask Dad to move the box')), NOW);
      assert.deepEqual(rows(v), [], step);
      assert.equal(v.handled, null, step);
    }
  });

  test('completed after it was handed off: unchanged — a finished thing has nothing left to wait for', () => {
    for (const step of STEPS) {
      const base = tk(household(), { title: 'Ask Dad to move the box', minutes: 12 });
      const handed = handOff(base, T(base, 'Ask Dad to move the box'), step);
      assert.deepEqual(rows(view(valid(completed(handed, 'Ask Dad to move the box')), NOW)), [], step);
    }
  });

  test('the reader does not lean on the projection: handed a day that still lists the removed event, it still shows nothing', () => {
    const attentionRows = (state, day) => {
      const briefing = briefingFor(state, NOW, zonedTimeToEpochMs(DAY, 0, TZ));
      const out = attentionView(state, NOW, DAY, day, [], briefing);
      return [...out.rows, ...out.waiting];
    };
    const base = pickup();
    const live = valid(handOff(base, E(base, 'School pickup'), 'acknowledged'));
    assert.equal(attentionRows(live, projectStateDay(live, DAY)).length, 1, 'control: the same reader shows the row while the event is live');

    const gone = valid(removed(live, 'School pickup'));
    const day = projectStateDay(gone, DAY);
    assert.equal(day.events.length, 0, 'the projection already drops a removed event');
    const stillListed = { ...day, events: [{ id: eventNamed(gone, 'School pickup').id, title: 'School pickup', startMinutes: 15 * 60 + 30, endMinutes: 16 * 60, categoryId: 'cat-kids', subjectMemberId: null, commitment: 'fixed' }] };
    assert.deepEqual(attentionRows(gone, stillListed), [], 'a removed event is retired: never shown as live work, even if something upstream still lists it');
  });
});

describe('the projection as a whole, over the scenario corpus', () => {
  const all = corpus();
  const said = (name) => {
    const entry = all.find((c) => c.name === name);
    assert.ok(entry, `the corpus has “${name}”`);
    return strings(view(entry.state, entry.nowMs));
  };

  test('the neutral line reaches the screen in exactly the scenarios that call for it — where the tone rules then lint it', () => {
    assert.ok(said('R removed event prerequisite').includes(RETIRED));
    assert.ok(said('R archived task prerequisite').includes(RETIRED));
    assert.equal(said('R mixed prerequisites').includes(RETIRED), false, 'something live remains, so it is not said');
    assert.ok(said('R mixed prerequisites').includes('It needs “Get the quote” first.'));
    assert.equal(said('A ordinary 08:00').includes(RETIRED), false);
  });

  test('no scenario says a commitment needs, or that it finished, a thing that was removed or archived', () => {
    for (const [name, gone] of [['R removed event prerequisite', 'Fitting appointment'], ['R archived task prerequisite', 'Get the quote']]) {
      for (const line of said(name)) assert.doesNotMatch(line, new RegExp(gone), `${name}: “${line}”`);
    }
    for (const line of said('R mixed prerequisites')) assert.doesNotMatch(line, /Pick the date|Pay the deposit|Site visit/, line);
  });

  test('a delegated event that was then removed is nowhere on the screen', () => {
    for (const line of said('C delegated, then removed')) assert.doesNotMatch(line, /School pickup|Grandma June/, line);
  });
});

describe('the sentence is said in one place', () => {
  const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  test('“no longer there” is defined once, in the feature’s phrases module, and nowhere else in Today or the One Move card', () => {
    const files = [
      ...readdirSync('src/features/today').filter((f) => /\.tsx?$/.test(f)).map((f) => `src/features/today/${f}`),
      ...readdirSync('src/features/today/model').filter((f) => f.endsWith('.ts')).map((f) => `src/features/today/model/${f}`),
      'src/features/one-move/OneMoveCard.tsx',
    ];
    const holders = files.filter((f) => strip(readFileSync(f, 'utf8')).includes('no longer there'));
    assert.deepEqual(holders, ['src/features/today/model/phrases.ts']);
  });
});
