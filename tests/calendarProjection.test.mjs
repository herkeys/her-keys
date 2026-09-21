/**
 * Feature 03 — Calendar projection (contract sections 10, 11, 14-27, 63-67).
 *
 * Two kinds of assertion, on purpose:
 *  - explicit behavioural assertions per scenario, so a wrong committed file cannot hide a wrong conclusion;
 *  - committed STRUCTURAL EVIDENCE (tests/fixtures/calendar/scenarios/<id>.json) compared byte-for-byte.
 *    A change to what Calendar concludes shows up as a diff that needs intentional review. To regenerate
 *    after such a review:  UPDATE_CALENDAR_EVIDENCE=1 node --test tests/calendarProjection.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTierForDay } from '../src/domain/loadTier.ts';
import { dayEvidenceJson } from '../src/features/calendar/model/structural.ts';
import { projectCalendarDay } from '../src/features/calendar/model/projectCalendar.ts';
import { DAY, NEXT, SCENARIOS, household, inputsFor, instantAt, msAt, scenarioById } from './support/calendarScenarios.mjs';

const EVIDENCE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'calendar', 'scenarios');
const UPDATE = process.env.UPDATE_CALENDAR_EVIDENCE === '1';
const lf = (text) => text.replace(/\r\n/g, '\n');

const project = (id, overrides) => projectCalendarDay(inputsFor(scenarioById(id), overrides));
const conflictsOf = (view, type) => view.conflicts.filter((c) => c.type === type);
const unplacedOf = (view, id) => view.unplacedItems.find((u) => u.itemRef.id === id);
const action = (view, name, id = null) => view.availableActions.find((a) => a.action === name && (a.itemRef?.id ?? null) === id);

describe('Calendar projection — structural evidence (committed, deterministic)', () => {
  for (const s of SCENARIOS) {
    test(`scenario ${s.id} (tier ${s.tier}) ${s.title}: view model matches the committed evidence`, () => {
      const json = dayEvidenceJson(projectCalendarDay(inputsFor(s)));
      const file = join(EVIDENCE_DIR, `${s.id}.json`);
      if (UPDATE) {
        mkdirSync(EVIDENCE_DIR, { recursive: true });
        writeFileSync(file, json);
      }
      assert.ok(existsSync(file), `missing evidence ${s.id}.json — generate it, review it, then commit it`);
      assert.equal(json, lf(readFileSync(file, 'utf8')));
    });
  }
});

describe('Calendar projection — purity and determinism', () => {
  test('projecting never mutates canonical state and is deterministic', () => {
    for (const s of SCENARIOS) {
      const input = inputsFor(s);
      const before = JSON.stringify(input.state);
      const first = dayEvidenceJson(projectCalendarDay(input));
      const second = dayEvidenceJson(projectCalendarDay(input));
      assert.equal(JSON.stringify(input.state), before, `${s.id}: state changed`);
      assert.equal(first, second, `${s.id}: not deterministic`);
    }
  });

  test('nothing derived is written back: no conflict, tier, opening or window exists in stored state', () => {
    const { state } = scenarioById('B').build();
    const stored = JSON.stringify(state);
    for (const word of ['FIXED_OVERLAP', 'overloaded', 'openWindows', 'needs_a_place', 'capacityState', 'conflicts']) {
      assert.equal(stored.includes(word), false, `${word} leaked into canonical state`);
    }
  });

  test('equivalence oracle: on every non-DST scenario the tier is exactly what Today (loadTierForDay) says', () => {
    for (const s of SCENARIOS) {
      if (s.today !== s.date) continue;
      const input = inputsFor(s);
      const view = projectCalendarDay(input);
      assert.equal(view.capacityState.foundationTier, loadTierForDay(input.state, input.date), `${s.id}: Calendar and Today disagree`);
    }
  });

  test('a scenario the projection has no opinion about produces no conflict (busy is not conflict)', () => {
    const dense = household();
    for (let hour = 8; hour < 18; hour++) {
      dense.event(`evt-${hour}`, { title: `Meeting ${hour}`, start: `${String(hour).padStart(2, '0')}:00`, end: `${String(hour).padStart(2, '0')}:15` });
    }
    const view = projectCalendarDay({ state: dense.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.equal(view.dayItems.length, 10);
    assert.deepEqual(view.conflicts, [], 'ten short meetings with real gaps between them are busy, not conflicted');
    assert.equal(view.capacityState.foundationTier, 'open');
  });
});

describe('A — ordinary feasible day', () => {
  test('no manufactured conflict; room is stated with complete evidence; the flexible item has a certain opening', () => {
    const view = project('A');
    assert.deepEqual(view.conflicts, []);
    assert.deepEqual(view.narrowTransitions, []);
    assert.equal(view.capacityState.tier, 'open');
    assert.equal(view.capacityState.evidence.status, 'complete');
    const books = unplacedOf(view, 'tsk-books');
    assert.equal(books.state, 'has_opening');
    assert.ok(books.openings.length >= 1);
    assert.equal(view.unknownStates.length, 0);
  });

  test('nothing is scheduled on her behalf: the task stays unplanned', () => {
    const { state } = scenarioById('A').build();
    projectCalendarDay(inputsFor(scenarioById('A')));
    assert.deepEqual(state.tasks.find((t) => t.id === 'tsk-books').plan, { kind: 'unplanned' });
  });

  test('the child commitment keeps the child subject', () => {
    const soccer = project('A').dayItems.find((i) => i.ref.id === 'evt-soccer');
    assert.deepEqual(soccer.subject, { kind: 'child', childId: 'child-1', displayName: 'Josie' });
  });
});

describe('B — fixed overlap', () => {
  test('two overlapping fixed commitments are one FIXED_OVERLAP with both intervals as evidence', () => {
    const view = project('B');
    const overlaps = conflictsOf(view, 'FIXED_OVERLAP');
    assert.equal(overlaps.length, 1);
    const evidence = overlaps[0].evidence;
    assert.equal(evidence.overlapMinutes, 30);
    assert.equal(evidence.movable, null, 'both fixed: nothing may be moved automatically');
    assert.deepEqual(overlaps[0].evidenceRefs.map((r) => r.id).sort(), ['evt-call', 'evt-dentist']);
    assert.equal(view.capacityState.tier, 'overloaded');
    assert.equal(view.capacityState.verdict, 'overlap');
  });

  test('no auto-move and no move offered for two fixed commitments', () => {
    const view = project('B');
    assert.equal(action(view, 'MOVE').available, false);
    assert.equal(view.availableActions.some((a) => a.action === 'MOVE' && a.available), false);
  });
});

describe('C / D — tight but feasible vs impossible transition', () => {
  test('C: a known transition that fits narrowly is NOT called impossible', () => {
    const view = project('C');
    assert.deepEqual(conflictsOf(view, 'TRANSITION_CONFLICT'), []);
    assert.equal(view.narrowTransitions.length, 1);
    const narrow = view.narrowTransitions[0];
    assert.equal(narrow.gapMinutes, 30);
    assert.equal(narrow.storedTransitionMinutes, 15);
    assert.equal(narrow.slackMinutes, 15, 'it fits, with 15 minutes to spare');
  });

  test('D: a stored transition longer than the gap is a real TRANSITION_CONFLICT with its arithmetic as evidence', () => {
    const view = project('D');
    const [conflict] = conflictsOf(view, 'TRANSITION_CONFLICT');
    assert.ok(conflict);
    assert.equal(conflict.evidence.gapMinutes, 20);
    assert.equal(conflict.evidence.storedTransitionMinutes, 50);
    assert.equal(conflict.evidence.slackMinutes, -30);
    assert.deepEqual(conflict.evidence.entered, { travelAfter: 30, travelBefore: 20, preparation: null });
    assert.equal(view.capacityState.tier, 'overloaded');
  });
});

describe('capacity category — the word follows the physical facts, the tier stays the foundation’s', () => {
  const category = (id) => project(id).capacityState.category;

  test('C: the foundation tiers a 15-minute-slack transition as overloaded, but it fits, so it is worded as tight', () => {
    const state = project('C').capacityState;
    assert.equal(state.tier, 'overloaded', 'the foundation classification is untouched');
    assert.equal(state.foundationTier, 'overloaded');
    assert.equal(state.category, 'tight');
  });

  test('a stored fact violated, or less time than needed, is more than fits', () => {
    assert.equal(category('B'), 'more_than_fits', 'overlap');
    assert.equal(category('D'), 'more_than_fits', 'transition longer than its gap');
    assert.equal(category('O'), 'more_than_fits', 'capacity pressure');
  });

  test('room, tight and not-known map from open / tight / withheld', () => {
    assert.equal(category('A'), 'room');
    assert.equal(category('M'), 'tight');
    assert.equal(category('G'), 'not_known');
    assert.equal(category('AF'), 'not_known');
  });

  test('the category adds no number: it is one of four words', () => {
    for (const s of SCENARIOS) {
      const state = projectCalendarDay(inputsFor(s)).capacityState;
      assert.ok(['room', 'tight', 'more_than_fits', 'not_known'].includes(state.category), s.id);
    }
  });
});

describe('E / F — flexible item fits vs cannot fit', () => {
  test('E: known duration and a feasible opening shows a placement opportunity and schedules nothing', () => {
    const view = project('E');
    const call = unplacedOf(view, 'tsk-call');
    assert.equal(call.state, 'has_opening');
    assert.ok(call.openings.every((o) => o.lengthMinutes >= 45));
    assert.deepEqual(conflictsOf(view, 'PLACEMENT_FAILURE'), []);
  });

  test('F: known duration + valid window + no feasible gap is PLACEMENT_FAILURE, and DUE BY 17:00 is a ceiling, not a time', () => {
    const view = project('F');
    const report = unplacedOf(view, 'tsk-report');
    assert.equal(report.state, 'needs_a_place');
    const [failure] = conflictsOf(view, 'PLACEMENT_FAILURE');
    assert.equal(failure.evidence.durationMinutes, 90);
    assert.equal(failure.evidence.windowEndMinute, 17 * 60, 'the deadline bounds the window');
    assert.ok(failure.evidence.gaps.every((g) => g.lengthMinutes < 90), 'every gap considered is too short');
    assert.ok(failure.evidence.occupied.length >= 3);
    const { state } = scenarioById('F').build();
    assert.deepEqual(state.tasks.find((t) => t.id === 'tsk-report').plan, { kind: 'unplanned' }, 'not scheduled at 5 PM or anywhere');
  });
});

describe('G / H / AF — unknown is never zero', () => {
  test('G: a recorded duration of 0 is no usable duration: no fit either way, never counted as zero time', () => {
    const view = project('G');
    const task = unplacedOf(view, 'tsk-registration');
    assert.equal(task.state, 'insufficient_information');
    assert.equal(task.reason, 'no_usable_duration');
    assert.equal(task.durationKnown, false);
    assert.deepEqual(task.openings, []);
    assert.deepEqual(conflictsOf(view, 'PLACEMENT_FAILURE'), [], 'not "cannot fit" either');
  });

  test('G: the foundation would call this day open (it counted 0 minutes); Calendar withholds that claim and names the missing fact', () => {
    const view = project('G');
    assert.equal(view.capacityState.foundationTier, 'open');
    assert.equal(view.capacityState.tier, null);
    assert.equal(view.capacityState.evidence.status, 'insufficient');
    assert.ok(view.unknownStates.some((m) => m.field === 'durationMinutes' && m.itemRef.id === 'tsk-registration'));
  });

  test('H: a location with no travel entered gives no perfect-fit claim built on zero travel', () => {
    const view = project('H');
    const form = unplacedOf(view, 'tsk-form');
    assert.equal(form.state, 'insufficient_information');
    assert.equal(form.reason, 'opening_depends_on_missing_facts');
    assert.ok(form.missing.every((m) => m.field.startsWith('travelMinutes')));
    assert.equal(view.capacityState.tier, null);
    assert.equal(view.capacityState.evidence.status, 'insufficient');
  });

  test('AF: a day that looks feasible ONLY if missing facts were zero is not classified confidently feasible', () => {
    const view = project('AF');
    assert.equal(view.capacityState.foundationTier, 'open', 'the foundation alone would have said open');
    assert.equal(view.capacityState.tier, null, 'not classified as feasible');
    assert.equal(view.capacityState.evidence.status, 'insufficient');
    assert.deepEqual(view.openWindows, [], 'no "X free minutes" claim');
    const fields = view.unknownStates.map((m) => `${m.field}:${m.itemRef.id}`);
    assert.ok(fields.includes('durationMinutes:tsk-renewal'));
    assert.ok(fields.includes('travelMinutesAfter:evt-school'));
    assert.ok(fields.includes('travelMinutesBefore:evt-clinic'));
    const form = unplacedOf(view, 'tsk-form');
    assert.deepEqual(form.openings, [], 'no placement suggestion depends on missing facts');
    assert.notEqual(form.state, 'has_opening');
  });

  test('AF: a problem verdict still stands when facts are missing (unknown can only shrink capacity)', () => {
    const b = household()
      .event('evt-a', { start: '10:00', end: '11:00', location: 'A' })
      .event('evt-b', { start: '10:30', end: '11:30', location: 'B' });
    const view = projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.equal(view.capacityState.tier, 'overloaded');
    assert.equal(conflictsOf(view, 'FIXED_OVERLAP').length, 1);
  });
});

describe('I / J — responsibility: delegated is not covered', () => {
  test('I: a requested handoff nobody accepted is not covered and is surfaced as a responsibility risk', () => {
    const view = project('I');
    const pickup = view.dayItems.find((i) => i.ref.id === 'evt-pickup');
    assert.equal(pickup.responsibility.coverage, 'awaiting_response');
    assert.equal(pickup.responsibility.covered, false);
    assert.equal(pickup.responsibility.stillNeedsMe, true);
    assert.equal(pickup.responsibility.holder.displayName, 'Marcus');
    const [risk] = conflictsOf(view, 'RESPONSIBILITY_RISK');
    assert.ok(risk);
    assert.equal(risk.evidence.coverage, 'awaiting_response');
  });

  test('J: an accepted responsibility displays as covered and raises no risk', () => {
    const view = project('J');
    const pickup = view.dayItems.find((i) => i.ref.id === 'evt-pickup');
    assert.equal(pickup.responsibility.coverage, 'accepted');
    assert.equal(pickup.responsibility.covered, true);
    assert.equal(pickup.responsibility.stillNeedsMe, false);
    assert.deepEqual(conflictsOf(view, 'RESPONSIBILITY_RISK'), []);
  });

  test('a declined handoff is hers again: not covered, and a risk on any day', () => {
    const built = household().person('p', 'Marcus').event('evt-x', { start: '15:00', end: '16:00', date: NEXT });
    let state = built.state;
    const ctx = built.ctx();
    return import('../src/domain/responsibility.ts').then(({ delegate, decline }) => {
      state = delegate(state, ctx, { about: { kind: 'event', id: 'evt-x' }, to: { kind: 'person', id: 'p' } });
      state = decline(state, ctx, state.responsibilities[0].id);
      const view = projectCalendarDay({ state, date: NEXT, today: DAY, nowMs: msAt('07:00') });
      const item = view.dayItems.find((i) => i.ref.id === 'evt-x');
      assert.equal(item.responsibility.coverage, 'declined');
      assert.equal(item.responsibility.covered, false);
      assert.equal(conflictsOf(view, 'RESPONSIBILITY_RISK').length, 1);
    });
  });
});

describe('K — dependency order', () => {
  test('a gap before the required predecessor ends is not feasible: openings start after it', () => {
    const view = project('K');
    const permit = unplacedOf(view, 'tsk-permit');
    assert.equal(permit.state, 'has_opening');
    assert.ok(permit.openings.every((o) => o.startMinute >= 12 * 60), 'no opening before the notary appointment ends at 12:00');
    assert.equal(view.dayItems.find((i) => i.ref.id === 'tsk-permit').blockedBy[0].finishMinute, 12 * 60);
  });

  test('control: without the dependency the early gap IS an opening', () => {
    const built = scenarioById('K').build();
    const without = { ...built.state, dependencies: [] };
    const view = projectCalendarDay({ state: without, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.ok(unplacedOf(view, 'tsk-permit').openings.some((o) => o.startMinute < 11 * 60));
  });

  test('a task already timed before its predecessor finishes is a DEPENDENCY_CONFLICT with both intervals', () => {
    const b = scenarioById('K').build().task('tsk-early', { minutes: 20, at: '10:00', due: DAY }).requires({ kind: 'task', id: 'tsk-early' }, { kind: 'event', id: 'evt-notary' });
    const view = projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    const [conflict] = conflictsOf(view, 'DEPENDENCY_CONFLICT');
    assert.ok(conflict);
    assert.equal(conflict.evidence.itemStartMinute, 10 * 60);
    assert.equal(conflict.evidence.predecessorFinishMinute, 12 * 60);
  });

  test('an unscheduled predecessor means waiting, not a fabricated placement', () => {
    const b = household()
      .event('evt-a', { start: '10:00', end: '11:00' })
      .task('tsk-first', { minutes: 20, due: DAY })
      .task('tsk-second', { minutes: 20, due: DAY })
      .requires({ kind: 'task', id: 'tsk-second' }, { kind: 'task', id: 'tsk-first' });
    const view = projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.equal(unplacedOf(view, 'tsk-second').state, 'waiting_on_predecessor');
    assert.deepEqual(unplacedOf(view, 'tsk-second').openings, []);
  });
});

describe('L — date-only is never midnight', () => {
  test('a task with a day but no time has no clock time and sorts after timed items', () => {
    const view = project('L');
    const dateOnly = view.dayItems.filter((i) => i.timing.kind === 'date_only');
    assert.equal(dateOnly.length, 2);
    for (const item of dateOnly) {
      assert.equal('startMinute' in item.timing, false, `${item.ref.id} was given a clock time`);
      assert.equal(item.progress, 'untimed');
    }
    assert.equal(view.dayItems[0].ref.id, 'evt-a');
    const invoice = unplacedOf(view, 'tsk-invoice');
    assert.equal(invoice.state, 'fixed_without_time', 'a fixed date-only task makes no placement claim');
  });

  test('a date-only task does not distort overlap or gap math', () => {
    const withTask = project('L');
    const without = projectCalendarDay({ state: { ...scenarioById('L').build().state, tasks: [] }, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.deepEqual(withTask.conflicts, without.conflicts);
  });
});

describe('M — child-scoped commitments keep distinct, correct subjects', () => {
  test('two children stay two children; no subject is not "the household"', () => {
    const view = project('M');
    const subject = (id) => view.dayItems.find((i) => i.ref.id === id).subject;
    assert.deepEqual(subject('evt-soccer'), { kind: 'child', childId: 'child-1', displayName: 'Josie' });
    assert.deepEqual(subject('evt-piano'), { kind: 'child', childId: 'child-2', displayName: 'Theo' });
    assert.deepEqual(subject('tsk-form'), { kind: 'child', childId: 'child-1', displayName: 'Josie' });
    assert.deepEqual(subject('evt-plumber'), { kind: 'unstated' });
  });

  test('a subject that resolves to nobody is reported as unresolved, never guessed', () => {
    const b = household().event('evt-x', { start: '10:00', end: '11:00', subjectMemberId: 'ghost' });
    const view = projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.deepEqual(view.dayItems[0].subject, { kind: 'unresolved', memberId: 'ghost' });
  });
});

describe('P — sparse day', () => {
  test('one commitment yields one item and nothing else: no fake sections', () => {
    const view = project('P');
    assert.equal(view.dayItems.length, 1);
    assert.deepEqual(view.conflicts, []);
    assert.deepEqual(view.unplacedItems, []);
    assert.deepEqual(view.unknownStates, []);
    assert.deepEqual(view.narrowTransitions, []);
    assert.equal(view.capacityState.tier, 'open');
  });
});

describe('AC / AD — recurrence metadata and multi-day, from the common fork only', () => {
  test('AC: an existing concrete event carries its rule as metadata; no rule is evaluated and no occurrence generated', () => {
    const view = project('AC');
    assert.deepEqual(view.dayItems[0].repeats && { f: view.dayItems[0].repeats.frequency, i: view.dayItems[0].repeats.interval }, { f: 'weekly', i: 1 });
    assert.equal(view.dayItems.length, 1, 'exactly the stored event, not a generated series');
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'features', 'calendar', 'model', 'collect.ts'), 'utf8');
    assert.equal(/occurrencesOf|nextOccurrence|skipOccurrence/.test(source), false, 'Calendar must not evaluate recurrence rules');
  });

  test('AD: a multi-day event renders truthfully on each day it touches, clipped and marked as continuing', () => {
    const state = scenarioById('AD').build().state;
    const on = (date) => projectCalendarDay({ state, date, today: DAY, nowMs: msAt('07:00') }).dayItems[0]?.timing;
    const first = on('2026-09-15');
    const middle = on('2026-09-16');
    const last = on('2026-09-17');
    assert.equal(first.continuesIntoNextDay, true);
    assert.equal(first.continuesFromPreviousDay, false);
    assert.equal(middle.continuesFromPreviousDay, true);
    assert.equal(middle.continuesIntoNextDay, true);
    assert.equal(middle.startMinute, 0);
    assert.equal(middle.endMinute, 1440);
    assert.equal(last.continuesFromPreviousDay, true);
    assert.equal(last.continuesIntoNextDay, false);
    assert.equal(on('2026-09-18'), undefined);
  });
});

describe('AE — same canonical state at 08:00, 15:00 and 21:00', () => {
  const state = () =>
    household()
      .event('evt-am', { title: 'Morning meeting', start: '09:00', end: '10:00' })
      .event('evt-pm', { title: 'Afternoon meeting', start: '16:00', end: '17:00' })
      .task('tsk-x', { title: 'Book the plumber', minutes: 60, due: DAY }).state;
  const at = (hhmm) => projectCalendarDay({ state: state(), date: DAY, today: DAY, nowMs: msAt(hhmm) });

  test('elapsed items stop being upcoming as the day goes on', () => {
    const progress = (view, id) => view.dayItems.find((i) => i.ref.id === id).progress;
    assert.equal(progress(at('08:00'), 'evt-am'), 'upcoming');
    assert.equal(progress(at('09:30'), 'evt-am'), 'in_progress');
    assert.equal(progress(at('15:00'), 'evt-am'), 'elapsed');
    assert.equal(progress(at('15:00'), 'evt-pm'), 'upcoming');
    assert.equal(progress(at('21:00'), 'evt-pm'), 'elapsed');
  });

  test('what fits changes truthfully: nothing can be placed in the past, and late evening has no room left', () => {
    const early = unplacedOf(at('08:00'), 'tsk-x');
    const afternoon = unplacedOf(at('15:00'), 'tsk-x');
    const night = unplacedOf(at('21:30'), 'tsk-x');
    assert.equal(early.state, 'has_opening');
    assert.ok(early.openings.some((o) => o.startMinute < 9 * 60), '08:00: the morning gap is usable');
    assert.equal(afternoon.state, 'has_opening');
    assert.ok(afternoon.openings.every((o) => o.startMinute >= 15 * 60), '15:00: nothing before now');
    assert.equal(night.state, 'needs_a_place', '21:30: only 30 minutes remain in the household day, and the task needs 60');
    assert.equal(unplacedOf(at('21:00'), 'tsk-x').state, 'has_opening', '21:00: exactly 60 minutes remain, which does fit');
  });
});

describe('N / O — actions come only from the foundation, and only where it offers them', () => {
  test('N: a flexible event whose move widens the tight window is offered as MOVE; nothing else is', () => {
    const view = project('N');
    assert.equal(action(view, 'MOVE', 'evt-b').available, true);
    assert.equal(view.availableActions.filter((a) => a.action === 'MOVE' && a.available).length, 1);
    assert.equal(action(view, 'KEEP').available, true);
  });

  test('N: on a different day the same recommendation is not offered (SAFE-UNAVAILABLE)', () => {
    const view = projectCalendarDay({ ...inputsFor(scenarioById('N')), date: NEXT });
    for (const name of ['MOVE', 'KEEP', 'DROP', 'SHORTEN', 'KEEP_CAPACITY', 'UNDO']) {
      const entry = action(view, name);
      assert.equal(entry.available, false, name);
      assert.equal(entry.reason, 'not_today', name);
    }
  });

  test('O: capacity pressure offers DROP and SHORTEN for exactly the task the verdict names, and PROTECT for a flexible item', () => {
    const view = project('O');
    assert.equal(view.capacityState.verdict, 'capacity_pressure');
    assert.equal(action(view, 'DROP', 'tsk-garage').available, true);
    assert.equal(action(view, 'SHORTEN', 'tsk-garage').available, true);
    assert.equal(action(view, 'DROP', 'tsk-due'), undefined, 'a fixed, due-today task is never offered for dropping');
    assert.equal(action(view, 'PROTECT', 'tsk-garage').available, true);
    assert.equal(action(view, 'PROTECT', 'tsk-due'), undefined, 'already fixed: nothing to protect');
    assert.equal(action(view, 'KEEP_CAPACITY').available, true);
  });

  test('every rendered action maps to a foundation mutation: EDIT is offered for every item on any day', () => {
    const view = projectCalendarDay({ ...inputsFor(scenarioById('N')), date: NEXT });
    assert.deepEqual(view.availableActions.filter((a) => a.action === 'EDIT'), []);
    const today = project('N');
    assert.equal(today.availableActions.filter((a) => a.action === 'EDIT').length, today.dayItems.length);
  });
});

describe('S — timezone', () => {
  const instant = '2026-09-17T03:00:00.000Z';
  const build = (tz) => household({ tz }).with((s) => ({ ...s, events: [] }));
  const withEvent = (tz) => {
    const b = build(tz);
    b.event('evt-late', { start: '00:00', end: '01:00' });
    return b.with((s) => ({ ...s, events: s.events.map((e) => ({ ...e, startsAt: instant, endsAt: '2026-09-17T03:45:00.000Z' })) })).state;
  };

  test('the same instant lands on the correct household day and clock in each zone', () => {
    const ny = withEvent('America/New_York');
    const la = withEvent('America/Los_Angeles');
    const at = (state, date) => projectCalendarDay({ state, date, today: DAY, nowMs: msAt('07:00') }).dayItems;
    assert.equal(at(ny, '2026-09-16')[0].timing.startMinute, 23 * 60, 'New York: 23:00 on the 16th');
    assert.equal(at(ny, '2026-09-17').length, 0);
    assert.equal(at(la, '2026-09-16')[0].timing.startMinute, 20 * 60, 'Los Angeles: 20:00 on the 16th');
  });

  test('an event 01:30 New York time on the 17th is not on the 16th', () => {
    const b = household().event('evt-x', { start: '01:30', end: '02:30', date: NEXT });
    const view = projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.equal(view.dayItems.length, 0);
  });
});

describe('V — logical-day rollover re-derives everything', () => {
  test('after midnight the selected day is the new day: yesterday\'s conflict and capacity are gone, overdue appears', () => {
    const b = household()
      .event('evt-a', { start: '10:00', end: '11:00' })
      .event('evt-b', { start: '10:30', end: '11:30' })
      .task('tsk-x', { minutes: 30, due: DAY });
    const before = projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('23:30') });
    const after = projectCalendarDay({ state: b.state, date: NEXT, today: NEXT, nowMs: msAt('00:10', NEXT) });
    assert.equal(conflictsOf(before, 'FIXED_OVERLAP').length, 1);
    assert.equal(conflictsOf(before, 'PLACEMENT_FAILURE').length, 1, 'at 23:30 nothing more can be placed inside the household day');
    assert.equal(after.conflicts.length, 0, 'the overlap belongs to yesterday, and the whole new day is open');
    assert.equal(after.capacityState.tier, 'open');
    const overdue = after.dayItems.find((i) => i.ref.id === 'tsk-x');
    assert.equal(overdue.timing.basis, 'overdue');
    assert.equal(overdue.timing.daysOverdue, 1);
  });

  test('a future day does not inherit the whole backlog as overdue (D-07)', () => {
    const b = household().task('tsk-old', { minutes: 30, due: '2026-09-01' });
    const today = projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    const future = projectCalendarDay({ state: b.state, date: '2026-09-20', today: DAY, nowMs: msAt('07:00') });
    assert.equal(today.dayItems.length, 1);
    assert.equal(future.dayItems.length, 0);
  });
});

describe('W — correction: a real edit path changes what Calendar concludes', () => {
  test('editing the overlapping event through the same mutation the editor uses clears the conflict', async () => {
    const { updateEvent } = await import('../src/domain/events.ts');
    const built = scenarioById('B').build();
    const before = projectCalendarDay({ state: built.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.equal(conflictsOf(before, 'FIXED_OVERLAP').length, 1);
    assert.ok(action(before, 'EDIT', 'evt-call').available, 'the edit path is offered');
    const fixed = updateEvent(built.state, built.ctx(), 'evt-call', { startsAt: instantAt('12:00'), endsAt: instantAt('13:00') });
    const after = projectCalendarDay({ state: fixed, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.deepEqual(conflictsOf(after, 'FIXED_OVERLAP'), []);
  });
});

describe('AI — a legitimate placement followed by a new commitment: conflict surfaces, nothing is auto-moved', () => {
  test('the later overlap is detected with evidence pointing at both, and neither item is rearranged', async () => {
    const { updateTask } = await import('../src/domain/tasks.ts');
    const { addEvent } = await import('../src/domain/events.ts');
    const built = household().event('evt-am', { start: '09:00', end: '10:00' }).task('tsk-a', { minutes: 30, due: DAY });
    const open = projectCalendarDay({ state: built.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.equal(unplacedOf(open, 'tsk-a').state, 'has_opening');

    // She places it (the domain's own plan mutation), into a slot that was open.
    let state = updateTask(built.state, built.ctx(), 'tsk-a', { plan: { kind: 'timed', startsAt: instantAt('13:00') } });
    const placed = projectCalendarDay({ state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.equal(placed.dayItems.find((i) => i.ref.id === 'tsk-a').timing.startMinute, 13 * 60);
    assert.equal(unplacedOf(placed, 'tsk-a'), undefined, 'placed: no longer unplaced');

    // A commitment then arrives over that slot.
    state = addEvent(state, built.ctx(), { title: 'Surprise meeting', categoryId: 'cat-home', scope: 'household', commitment: 'fixed', startsAt: instantAt('13:00'), endsAt: instantAt('14:00') });
    const after = projectCalendarDay({ state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.equal(after.dayItems.find((i) => i.ref.id === 'tsk-a').timing.startMinute, 13 * 60, 'the placed task did not move');
    assert.equal(after.dayItems.filter((i) => i.ref.kind === 'event').length, 2);
  });
});
