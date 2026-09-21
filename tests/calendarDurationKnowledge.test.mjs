/**
 * HK-IR01 / HA-010 — Calendar says only as much about a duration as the duration is known to be.
 *
 * DEFAULT != USER-PROVIDED. Calendar may COMPUTE with a task's number under any provenance (capacity needs a number), but every
 * fit / no-fit / conflict / capacity claim that rests on a number she did not give must say it rests on an estimate, and nothing
 * may say or imply "you said N minutes" unless she did. The four provenances the foundation records:
 *
 *   user        she gave it                     -> task_recorded     "About 15 min"
 *   default     nobody supplied one             -> task_default      "About 15 min (assumed)"
 *   inferred    Her Keys read/derived, approved -> task_inferred     "About 15 min (estimated)"
 *   null        never recorded                  -> task_unrecorded   "About 15 min (not confirmed)"
 *
 * A stored 0 is "no usable duration" (basis `none`) whatever its source says: the existing Calendar convention, unchanged.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { updateTask } from '../src/domain/tasks.ts';
import { applyCloudRow } from '../src/domain/sync/apply.ts';
import { toCloudRow } from '../src/domain/sync/projection.ts';
import { emptyNamespace } from '../src/domain/sync/syncTypes.ts';
import { decodeStoredState, encodeStoredState } from '../src/persistence/envelope.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import {
  conflictCopy,
  copyContextFor,
  detailLines,
  headlineFor,
  itemLine,
  narrowCopy,
  narrowGroupCopy,
  offersFor,
  previewLines,
  unplacedCopy,
  weekDayLabel,
  weekDayLines,
} from '../src/features/calendar/copy.ts';
import { acceptIntent, computePreview } from '../src/features/calendar/model/preview.ts';
import { projectCalendarDay, projectCalendarWeek } from '../src/features/calendar/model/projectCalendar.ts';
import { revisionOf } from '../src/features/calendar/model/revision.ts';
import { dayEvidenceJson } from '../src/features/calendar/model/structural.ts';
import { CalendarDayView } from '../src/features/calendar/ui/CalendarDayView.tsx';
import { DAY, TZ, household, msAt, scenarioById } from './support/calendarScenarios.mjs';
import { STORAGE_KEYS, harness, launch, stored } from './support/fixtures.mjs';
import { render } from './support/render.tsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = msAt('07:00');
const tsk = (id) => ({ kind: 'task', id });
const noop = () => {};

/** The four provenances, each asked for through the builder exactly as a scenario states it (15 minutes every time). */
const VARIANTS = {
  user: { minutes: 15 },
  default: {},
  inferred: { minutes: 15, durationSource: 'inferred' },
  unrecorded: { minutes: 15, durationSource: null },
};
const BASIS = { user: 'task_recorded', default: 'task_default', inferred: 'task_inferred', unrecorded: 'task_unrecorded' };

const project = (state, overrides = {}) => projectCalendarDay({ state, date: DAY, today: DAY, nowMs: NOW, ...overrides });
const itemOf = (view, id) => view.dayItems.find((i) => i.ref.id === id);
const lineOf = (view, id) => itemLine(itemOf(view, id), copyContextFor(view));
const withSource = (state, source) => ({ ...state, tasks: state.tasks.map((t) => ({ ...t, durationSource: source })) });

/** A morning meeting and one dated task: the smallest day in which the task has room. */
const dayWith = (opts, extra = (b) => b) =>
  extra(household().event('evt-a', { title: 'Morning meeting', start: '10:00', end: '11:00' }).task('tsk-x', { title: 'Return library books', due: DAY, ...opts }));

describe('HA-010 — the projection carries how far a duration may be trusted', () => {
  test('explicit 15 and default 15 are the same number with different knowledge, different evidence and different words', () => {
    const typed = dayWith(VARIANTS.user).state;
    const defaulted = dayWith(VARIANTS.default).state;
    assert.deepEqual([typed.tasks[0].durationMinutes, typed.tasks[0].durationSource], [15, 'user']);
    assert.deepEqual([defaulted.tasks[0].durationMinutes, defaulted.tasks[0].durationSource], [15, 'default']);

    const a = project(typed);
    const b = project(defaulted);
    assert.equal(itemOf(a, 'tsk-x').durationMinutes, 15);
    assert.equal(itemOf(b, 'tsk-x').durationMinutes, 15, 'the number is still computed with');
    assert.equal(itemOf(a, 'tsk-x').durationBasis, 'task_recorded');
    assert.equal(itemOf(b, 'tsk-x').durationBasis, 'task_default');

    const evidenceA = dayEvidenceJson(a);
    const evidenceB = dayEvidenceJson(b);
    assert.notEqual(evidenceA, evidenceB, 'the committed evidence tells them apart');

    // The knowledge appears in exactly three places in the evidence: the item, its unplaced verdict, and the capacity `estimated` list.
    const [docA, docB] = [JSON.parse(evidenceA), JSON.parse(evidenceB)];
    assert.equal(docA.dayItems.find((i) => i.ref.id === 'tsk-x').durationBasis, 'task_recorded');
    assert.equal(docB.dayItems.find((i) => i.ref.id === 'tsk-x').durationBasis, 'task_default');
    assert.equal(docA.unplacedItems[0].durationBasis, 'task_recorded');
    assert.equal(docB.unplacedItems[0].durationBasis, 'task_default');
    assert.deepEqual(docA.capacityState.evidence.estimated, []);
    assert.deepEqual(docB.capacityState.evidence.estimated, [{ basis: 'task_default', itemRef: { id: 'tsk-x', kind: 'task' }, minutes: 15 }]);
    // ...and nothing else moved: with those three neutralised the two days are the same day.
    const neutral = (doc) => {
      const copy = JSON.parse(JSON.stringify(doc));
      for (const item of copy.dayItems) if (item.durationBasis !== undefined) item.durationBasis = '*';
      for (const item of copy.unplacedItems) item.durationBasis = '*';
      copy.capacityState.evidence.estimated = '*';
      return copy;
    };
    assert.deepEqual(neutral(docA), neutral(docB));

    assert.match(lineOf(a, 'tsk-x'), /· About 15 min$/);
    assert.match(lineOf(b, 'tsk-x'), /· About 15 min \(assumed\)$/);
  });

  test('explicit 30 stays hers: recorded basis, worded as a plain "About 30 min"', () => {
    const view = project(dayWith({ minutes: 30 }).state);
    assert.equal(itemOf(view, 'tsk-x').durationBasis, 'task_recorded');
    assert.match(lineOf(view, 'tsk-x'), /About 30 min$/);
    assert.deepEqual(view.capacityState.evidence.estimated, []);
    assert.equal(headlineFor(view, copyContextFor(view)).text, 'Everything scheduled fits.', 'nothing is qualified when nothing is estimated');
  });

  test('unrecorded (null) is worded as unrecorded: not hers, not a default', () => {
    const view = project(dayWith(VARIANTS.unrecorded).state);
    const item = itemOf(view, 'tsk-x');
    assert.equal(item.durationMinutes, 15, 'still computed with');
    assert.equal(item.durationBasis, 'task_unrecorded');
    assert.match(lineOf(view, 'tsk-x'), /About 15 min \(not confirmed\)$/);
    assert.doesNotMatch(lineOf(view, 'tsk-x'), /assumed|estimated/, 'never called a default, never called hers');
  });

  test('inferred is worded as Her Keys’ estimate', () => {
    const view = project(dayWith(VARIANTS.inferred).state);
    assert.equal(itemOf(view, 'tsk-x').durationBasis, 'task_inferred');
    assert.match(lineOf(view, 'tsk-x'), /About 15 min \(estimated\)$/);
    assert.ok(detailLines(itemOf(view, 'tsk-x')).includes('Her Keys estimated its length.'));
  });

  test('a stored 0 is no usable duration under every source: the convention is unchanged and no source can make it a fact', () => {
    for (const source of ['user', 'default', 'inferred', null]) {
      const view = project(dayWith({ minutes: 0, durationSource: source }).state);
      const item = itemOf(view, 'tsk-x');
      assert.equal(item.durationMinutes, null, String(source));
      assert.equal(item.durationBasis, 'none', String(source));
      assert.match(lineOf(view, 'tsk-x'), /No duration recorded$/, String(source));
      assert.equal(view.capacityState.tier, null, 'and the open claim is still withheld');
    }
  });

  test('legacy: a 15 stored with no recorded source (a row saved before the contract) reads unrecorded, and stays so across a second save', () => {
    const saved = encodeStoredState(dayWith(VARIANTS.user).state, { appVersion: 'test', savedAt: '2026-09-21T15:00:00.000Z', writeSeq: 1 });
    const envelope = JSON.parse(saved);
    for (const task of envelope.data.tasks) delete task.durationSource;
    const legacy = decodeStoredState(JSON.stringify(envelope));
    assert.equal(legacy.kind, 'valid');
    assert.equal(legacy.state.tasks[0].durationSource, null);

    const view = project(legacy.state);
    assert.equal(itemOf(view, 'tsk-x').durationBasis, 'task_unrecorded');
    assert.match(lineOf(view, 'tsk-x'), /About 15 min \(not confirmed\)$/);

    const again = decodeStoredState(encodeStoredState(legacy.state, { appVersion: 'test', savedAt: '2026-09-21T15:01:00.000Z', writeSeq: 2 }));
    assert.equal(itemOf(project(again.state), 'tsk-x').durationBasis, 'task_unrecorded', 'saving again does not promote it');
  });

  test('the retired vocabulary is gone: no consumer can still read "task_estimate" as if it were a fact', () => {
    const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : /\.(ts|tsx)$/.test(name) ? [join(dir, name)] : []));
    for (const file of walk(join(ROOT, 'src', 'features', 'calendar'))) assert.doesNotMatch(readFileSync(file, 'utf8'), /task_estimate/, file);
  });
});

describe('HA-010 — a change of knowledge is a change (the evidence digest)', () => {
  const ctx = () => ({ nowMs: NOW, today: DAY, createId: (prefix) => `${prefix}-1` });

  test('default -> user with the same number changes the digest, the evidence and the words', () => {
    const before = dayWith(VARIANTS.default).state;
    const after = updateTask(before, ctx(), 'tsk-x', { durationMinutes: 15, durationSource: 'user' });
    assert.deepEqual([after.tasks[0].durationMinutes, after.tasks[0].durationSource], [15, 'user'], 'the same number, now hers');

    assert.notEqual(revisionOf(before), revisionOf(after), 'the digest saw the source change');
    assert.notEqual(dayEvidenceJson(project(before)), dayEvidenceJson(project(after)));
    assert.match(lineOf(project(before), 'tsk-x'), /\(assumed\)$/);
    assert.match(lineOf(project(after), 'tsk-x'), /About 15 min$/);
  });

  test('unrecorded -> user (she confirms it) and user -> default are changes too; the same knowledge is not', () => {
    const unrecorded = dayWith(VARIANTS.unrecorded).state;
    const confirmed = updateTask(unrecorded, ctx(), 'tsk-x', { durationMinutes: 15, durationSource: 'user' });
    assert.notEqual(revisionOf(unrecorded), revisionOf(confirmed));

    const user = dayWith(VARIANTS.user).state;
    assert.notEqual(revisionOf(user), revisionOf(withSource(user, 'default')));
    assert.notEqual(revisionOf(user), revisionOf(withSource(user, null)));

    const sameAgain = { ...user, tasks: user.tasks.map((t) => ({ ...t })) };
    assert.notEqual(sameAgain, user);
    assert.equal(revisionOf(sameAgain), revisionOf(user), 'an equal state, however it was built, has the same digest');
  });

  test('a changed number with no stated origin becomes unrecorded, and Calendar says so rather than keeping the old certainty', () => {
    const typed = dayWith({ minutes: 30 }).state;
    const edited = updateTask(typed, ctx(), 'tsk-x', { durationMinutes: 50 });
    assert.equal(edited.tasks[0].durationSource, null);
    assert.equal(itemOf(project(edited), 'tsk-x').durationBasis, 'task_unrecorded');
    assert.match(lineOf(project(edited), 'tsk-x'), /About 50 min \(not confirmed\)$/);
  });
});

describe('HA-010 — capacity computes with every number and says what its verdict rests on', () => {
  /** Conference 09:00-21:00 leaves 4 hr of the household day. */
  const heavy = (variants) =>
    household()
      .event('evt-long', { title: 'Conference', start: '09:00', end: '21:00' })
      .task('tsk-a', { title: 'File the form', due: DAY, ...variants[0] })
      .task('tsk-b', { title: 'Water the plants', due: DAY, ...variants[1] })
      .task('tsk-c', { title: 'Plan the party', due: DAY, ...variants[2] })
      .task('tsk-d', { title: 'Old task', due: DAY, ...variants[3] });

  const MIXED = [{ minutes: 90 }, {}, { minutes: 60, durationSource: 'inferred' }, { minutes: 90, durationSource: null }];
  const ALL_HERS = [{ minutes: 90 }, { minutes: 15 }, { minutes: 60 }, { minutes: 90 }];

  test('mixing knowledge: every number is counted, and exactly the ones that are not hers are listed', () => {
    const view = project(heavy(MIXED).state);
    assert.deepEqual(view.capacityState.pressure, { availableMinutes: 240, neededMinutes: 255, pressureMinutes: 15 }, '90 + 15 + 60 + 90 are all counted');
    assert.deepEqual(
      view.capacityState.evidence.estimated.map((e) => [e.itemRef.id, e.basis, e.minutes]).sort(),
      [['tsk-b', 'task_default', 15], ['tsk-c', 'task_inferred', 60], ['tsk-d', 'task_unrecorded', 90]]
    );
  });

  test('knowledge never changes the arithmetic or the foundation’s verdict: the same numbers give the same capacity whoever supplied them', () => {
    const mixed = project(heavy(MIXED).state).capacityState;
    const hers = project(heavy(ALL_HERS).state).capacityState;
    const { evidence: mixedEvidence, ...mixedRest } = mixed;
    const { evidence: hersEvidence, ...hersRest } = hers;
    assert.deepEqual(mixedRest, hersRest, 'tier, category, verdict and pressure are identical');
    assert.deepEqual(hersEvidence.estimated, []);
    assert.equal(mixedEvidence.status, hersEvidence.status);
  });

  test('an "over capacity" verdict that counts estimates says so; the same verdict on numbers she gave does not', () => {
    const base = /^More is planned than the day has room for: 4 hr 15 min planned, 4 hr available\./;
    const mixedView = project(heavy(MIXED).state);
    const hersView = project(heavy(ALL_HERS).state);
    assert.match(headlineFor(mixedView, copyContextFor(mixedView)).text, base);
    assert.equal(headlineFor(mixedView, copyContextFor(mixedView)).text.endsWith(' That counts estimated task lengths.'), true);
    assert.equal(headlineFor(hersView, copyContextFor(hersView)).text, 'More is planned than the day has room for: 4 hr 15 min planned, 4 hr available.');
  });

  test('a "fits" verdict says what it counts: estimated, or unconfirmed when every number is of unknown origin', () => {
    const fits = (opts) => {
      const view = project(dayWith(opts).state);
      return headlineFor(view, copyContextFor(view)).text;
    };
    assert.equal(fits(VARIANTS.user), 'Everything scheduled fits.');
    assert.equal(fits(VARIANTS.default), 'Everything scheduled fits, counting estimated task lengths.');
    assert.equal(fits(VARIANTS.inferred), 'Everything scheduled fits, counting estimated task lengths.');
    assert.equal(fits(VARIANTS.unrecorded), 'Everything scheduled fits, counting task lengths that aren’t confirmed.');
  });

  test('an overdue task is not in the day’s capacity, so its length is not something the verdict rests on', () => {
    const view = project(
      household().event('evt-a', { title: 'Morning meeting', start: '10:00', end: '11:00' }).task('tsk-old', { title: 'Overdue thing', due: '2026-09-10' }).state
    );
    assert.equal(itemOf(view, 'tsk-old').durationBasis, 'task_default');
    assert.deepEqual(view.capacityState.evidence.estimated, []);
    assert.equal(headlineFor(view, copyContextFor(view)).text, 'Everything scheduled fits.');
  });

  test('the offer to shorten or drop carries the same qualifier, and its evidence lists the estimates', async () => {
    // Scenario O, with the long task's length no longer hers: the day is still over capacity and the offer says what it counts.
    const built = scenarioById('O').build();
    const state = { ...built.state, tasks: built.state.tasks.map((t) => (t.id === 'tsk-garage' ? { ...t, durationSource: null } : t)) };
    const view = project(state);
    assert.equal(view.availableActions.some((a) => a.action === 'SHORTEN' && a.available), true, 'the foundation still offers it: the number is computed with');
    const [offer] = offersFor(view, copyContextFor(view)).filter((o) => o.keep === 'capacity');
    assert.match(offer.body, /within what fits, counting task lengths that aren’t confirmed\.$/);
    assert.ok(offer.why.some((line) => /^Some task lengths are estimates: Deep clean the garage \(not confirmed\)\.$/.test(line)), offer.why.join(' / '));

    const hers = project(built.state);
    const [plain] = offersFor(hers, copyContextFor(hers)).filter((o) => o.keep === 'capacity');
    assert.doesNotMatch(plain.body, /counting/);
  });
});

describe('HA-010 — no-fit and conflict claims are as certain as the number they rest on', () => {
  const NEVER = /you (said|told|typed|gave)|you entered .*(min|hr)/i;

  test('NEEDS A PLACE: a fully booked day gives "needs about 15 min", "(assumed)", "(estimated)" or "(not confirmed)" — each with its own reason', () => {
    const expected = {
      user: { qualifier: '', why: null, headline: 'Something doesn’t have a place today.' },
      default: { qualifier: ' (assumed)', why: 'No length was entered for it, so its length is a planning assumption.', headline: 'Something may not have a place today.' },
      inferred: { qualifier: ' (estimated)', why: 'Her Keys estimated its length.', headline: 'Something may not have a place today.' },
      unrecorded: { qualifier: ' (not confirmed)', why: 'Where its length came from isn’t recorded, so it isn’t confirmed.', headline: 'Something may not have a place today.' },
    };
    for (const [name, opts] of Object.entries(VARIANTS)) {
      const view = project(household().event('evt-all', { title: 'All day', start: '06:00', end: '22:00' }).task('tsk-x', { title: 'Return books', due: DAY, ...opts }).state);
      const conflict = view.conflicts.find((c) => c.type === 'PLACEMENT_FAILURE');
      assert.ok(conflict, name);
      assert.equal(conflict.evidence.durationBasis, BASIS[name], `${name}: the evidence carries the basis`);
      const ctx = copyContextFor(view);
      const copy = conflictCopy(conflict, ctx);
      assert.equal(copy.sentence, `Return books needs about 15 min${expected[name].qualifier}, and no open stretch is long enough.`, name);
      assert.equal(copy.why.includes(expected[name].why), expected[name].why !== null, `${name}: ${copy.why.join(' / ')}`);
      assert.equal(headlineFor(view, ctx).text, expected[name].headline, name);
      assert.doesNotMatch([copy.sentence, ...copy.why].join(' '), NEVER, name);
    }
  });

  test('NEEDS A PLACE in the unplaced list, and the room it finds: both are "going by" the length they used', () => {
    const cases = { user: '', default: ', going by an assumed length', inferred: ', going by an estimated length', unrecorded: ', going by a length that isn’t confirmed' };
    for (const [name, tail] of Object.entries(cases)) {
      const view = project(dayWith(VARIANTS[name]).state);
      const unplaced = view.unplacedItems.find((u) => u.itemRef.id === 'tsk-x');
      assert.equal(unplaced.durationBasis, BASIS[name]);
      assert.equal(unplaced.state, 'has_opening');
      assert.equal(unplacedCopy(unplaced, copyContextFor(view)).sentence, `There’s room from 7:00–10:00 AM, and 1 more window${tail}. Nothing is scheduled for it.`, name);
    }
    const full = project(household().event('evt-all', { title: 'All day', start: '06:00', end: '22:00' }).task('tsk-x', { title: 'Return books', due: DAY }).state);
    const none = full.unplacedItems.find((u) => u.itemRef.id === 'tsk-x');
    assert.equal(unplacedCopy(none, copyContextFor(full)).sentence, 'No open stretch today is long enough for it, going by an assumed length.');
  });

  test('OUT OF ORDER: a predecessor task’s finish is only as certain as its length; an event’s end is a fact', () => {
    const order = (opts) =>
      household()
        .task('tsk-first', { title: 'Prepare the form', due: DAY, at: '10:00', ...opts })
        .task('tsk-second', { title: 'Submit the form', minutes: 20, due: DAY, at: '10:05' })
        .requires(tsk('tsk-second'), tsk('tsk-first')).state;

    const hers = project(order(VARIANTS.user));
    const [factual] = hers.conflicts.filter((c) => c.type === 'DEPENDENCY_CONFLICT');
    assert.equal(factual.evidence.predecessorFinishBasis, 'task_recorded');
    assert.equal(conflictCopy(factual, copyContextFor(hers)).sentence, 'Submit the form is scheduled before Prepare the form is done, and it needs Prepare the form first.');

    for (const name of ['default', 'inferred', 'unrecorded']) {
      const view = project(order(VARIANTS[name]));
      const [conflict] = view.conflicts.filter((c) => c.type === 'DEPENDENCY_CONFLICT');
      assert.equal(conflict.evidence.predecessorFinishBasis, BASIS[name], name);
      const copy = conflictCopy(conflict, copyContextFor(view));
      assert.equal(copy.sentence, 'Submit the form may be scheduled before Prepare the form is done, and it needs Prepare the form first.', name);
      assert.ok(copy.why.includes('Prepare the form is expected to finish at 10:15 AM.'), copy.why.join(' / '));
      assert.equal(headlineFor(view, copyContextFor(view)).text, 'Something may be scheduled before what it needs.', name);
    }

    // An event predecessor (scenario K) is a fact of the calendar: its wording and its evidence are unchanged.
    const k = project(scenarioById('K').build().task('tsk-early', { minutes: 20, at: '10:00', due: DAY }).requires(tsk('tsk-early'), { kind: 'event', id: 'evt-notary' }).state);
    const [eventConflict] = k.conflicts.filter((c) => c.type === 'DEPENDENCY_CONFLICT');
    assert.equal(eventConflict.evidence.predecessorFinishBasis, 'event_span');
    assert.match(conflictCopy(eventConflict, copyContextFor(k)).sentence, /is scheduled before Notary appointment is done/);
  });

  test('NOT ENOUGH TIME / FITS NARROWLY: a task scheduled in the gap counts by its length, so the claim says it counts an estimate', () => {
    const gap = (startB, opts) =>
      household()
        .event('evt-a', { title: 'Meeting A', start: '10:00', end: '11:00' })
        .event('evt-b', { title: 'Meeting B', start: startB, end: '12:30' })
        .task('tsk-mid', { title: 'Call the school', due: DAY, at: '11:00', ...opts }).state;

    // 12 minutes between the meetings, 15 minutes of task in it: does not fit.
    for (const [name, opts] of Object.entries(VARIANTS)) {
      const view = project(gap('11:12', opts));
      const [conflict] = view.conflicts.filter((c) => c.type === 'TRANSITION_CONFLICT');
      assert.ok(conflict, name);
      const estimated = name !== 'user';
      assert.deepEqual(conflict.evidence.estimatedTasks.map((e) => e.basis), estimated ? [BASIS[name]] : [], name);
      const copy = conflictCopy(conflict, copyContextFor(view));
      assert.equal(/^The 12 min between Meeting A and Meeting B is shorter than what you entered for getting there\.$/.test(copy.sentence), !estimated, `${name}: ${copy.sentence}`);
      assert.equal(/ may be shorter than .*, counting (estimated task lengths|task lengths that aren’t confirmed)\.$/.test(copy.sentence), estimated, `${name}: ${copy.sentence}`);
    }

    // 40 minutes between them: it fits, narrowly.
    for (const [name, opts] of Object.entries(VARIANTS)) {
      const view = project(gap('11:40', opts));
      const [narrow] = view.narrowTransitions;
      assert.ok(narrow, name);
      const estimated = name !== 'user';
      assert.equal(narrow.estimatedTasks.length, estimated ? 1 : 0, name);
      const copy = narrowCopy(narrow, copyContextFor(view));
      assert.equal(copy.sentence.startsWith('Meeting A to Meeting B fits, with 25 min to spare'), true);
      assert.equal(/, counting /.test(copy.sentence), estimated, `${name}: ${copy.sentence}`);
      assert.equal(headlineFor(view, copyContextFor(view)).text.includes('That counts'), estimated, name);
    }
  });

  test('a group of tight windows tells once what it counts', () => {
    // Four back-to-back meetings with three 30-minute gaps; a 15-minute task sits in the last one.
    const day = (opts) =>
      household()
        .event('evt-1', { title: 'Meeting 1', start: '09:00', end: '10:00' })
        .event('evt-2', { title: 'Meeting 2', start: '10:30', end: '11:30' })
        .event('evt-3', { title: 'Meeting 3', start: '12:00', end: '13:00' })
        .event('evt-4', { title: 'Meeting 4', start: '13:30', end: '14:30' })
        .task('tsk-mid', { title: 'Call the school', due: DAY, at: '13:05', ...opts }).state;

    const view = project(day(VARIANTS.default));
    const windows = view.narrowTransitions;
    assert.equal(windows.length, 3, 'three windows that fit but are tight');
    assert.deepEqual(windows.map((w) => w.estimatedTasks.length), [0, 0, 1], 'only the window holding the task counts an estimate');
    const copy = narrowGroupCopy(windows, copyContextFor(view));
    assert.equal(copy.sentence, '3 windows between commitments are tight. Each one fits, counting estimated task lengths.');
    assert.ok(copy.why.includes('Some task lengths are estimates: Call the school (assumed).'), copy.why.join(' / '));

    // The same day with a length she gave says nothing of the kind.
    const hers = project(day(VARIANTS.user));
    assert.deepEqual(hers.narrowTransitions.map((w) => w.estimatedTasks.length), [0, 0, 0]);
    assert.equal(narrowGroupCopy(hers.narrowTransitions, copyContextFor(hers)).sentence, '3 windows between commitments are tight. Each one fits.');
  });

  test('a timed task’s end is its start plus its length: the end says when the length is not hers', () => {
    const cases = { user: '3:00–3:15 PM · Flexible', default: '3:00–3:15 PM · Flexible · Length assumed', inferred: '3:00–3:15 PM · Flexible · Length estimated', unrecorded: '3:00–3:15 PM · Flexible · Length not confirmed' };
    for (const [name, line] of Object.entries(cases)) {
      const view = project(household().task('tsk-x', { title: 'Return books', due: DAY, at: '15:00', ...VARIANTS[name] }).state);
      assert.equal(lineOf(view, 'tsk-x'), line, name);
    }
  });
});

describe('HA-010 — the week’s capacity word says when it counts an estimate', () => {
  test('only the days whose word counts a length that is not hers carry the flag, and only they say so', () => {
    const state = dayWith(VARIANTS.default).state;
    const week = projectCalendarWeek({ state, selectedDate: DAY, today: DAY, nowMs: NOW });
    assert.deepEqual(week.days.filter((d) => d.estimatedDurations).map((d) => d.date), [DAY]);
    const wednesday = week.days.find((d) => d.date === DAY);
    assert.deepEqual(weekDayLines(wednesday).lines, ['1 not on the schedule yet', 'Some task lengths estimated']);
    assert.match(weekDayLabel(wednesday), /some task lengths estimated$/);
    for (const other of week.days.filter((d) => d.date !== DAY)) assert.doesNotMatch(weekDayLabel(other) + weekDayLines(other).lines.join(' '), /estimated/, other.date);

    const hers = projectCalendarWeek({ state: dayWith(VARIANTS.user).state, selectedDate: DAY, today: DAY, nowMs: NOW });
    assert.equal(hers.days.some((d) => d.estimatedDurations), false);
    assert.doesNotMatch(weekDayLines(hers.days.find((d) => d.date === DAY)).lines.join(' '), /estimated/);
  });

  test('a day whose capacity claim is withheld makes no claim about estimates either', () => {
    const state = household().event('evt-a', { title: 'Morning meeting', start: '10:00', end: '11:00' }).task('tsk-zero', { title: 'Renew it', minutes: 0, due: DAY }).task('tsk-x', { title: 'Return books', due: DAY }).state;
    const day = projectCalendarWeek({ state, selectedDate: DAY, today: DAY, nowMs: NOW }).days.find((d) => d.date === DAY);
    assert.equal(day.tier, null, 'not enough known: the word is withheld');
    assert.doesNotMatch(weekDayLabel(day) + weekDayLines(day).lines.join(' '), /estimated/);
  });
});

describe('HA-010 — a shortened task is worded as an estimate (preview and accept keep working)', () => {
  const open = async () => {
    const built = scenarioById('O').build();
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(built.state) }, mode: 'empty', now: msAt('10:00') });
    const store = await launch(h);
    return { store, snap: () => store.getSnapshot(), nowMs: msAt('10:00') };
  };
  const SHORTEN = { kind: 'shorten_task', id: 'tsk-garage' };

  test('preview: the length she entered is hers, the shorter one is an estimate, and the day counts it', async () => {
    const { snap, nowMs } = await open();
    const { preview } = computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent: SHORTEN });
    assert.equal(preview.before.dayItems.find((i) => i.ref.id === 'tsk-garage').durationBasis, 'task_recorded');
    assert.equal(preview.after.dayItems.find((i) => i.ref.id === 'tsk-garage').durationBasis, 'task_inferred');
    const lines = previewLines(preview, copyContextFor(preview.before));
    assert.equal(lines[0], 'Deep clean the garage would go from about 3 hr 20 min to about 2 hr 20 min (estimated).');
    assert.match(lines[1], /^Today would (stay|go from) .*, counting estimated task lengths\.$/);
  });

  test('accept records the shortened length as inferred, and Calendar words the stored result as an estimate', async () => {
    const { store, snap, nowMs } = await open();
    const { preview } = computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent: SHORTEN });
    assert.equal((await acceptIntent(store, SHORTEN, preview.basedOn)).status, 'applied');

    const task = snap().state.tasks.find((t) => t.id === 'tsk-garage');
    assert.deepEqual([task.durationMinutes, task.durationSource], [140, 'inferred']);
    const view = projectCalendarDay({ state: snap().state, date: DAY, today: DAY, nowMs });
    assert.equal(itemOf(view, 'tsk-garage').durationBasis, 'task_inferred');
    assert.match(lineOf(view, 'tsk-garage'), /About 2 hr 20 min \(estimated\)$/);
    assert.ok(view.capacityState.evidence.estimated.some((e) => e.itemRef.id === 'tsk-garage' && e.basis === 'task_inferred'));
  });

  test('the offer to MOVE a task names the length it frees the way that length is known', () => {
    // 20 minutes between two commitments with a flexible, not-due-today task already scheduled in it: the foundation offers to move it.
    const arrangement = (opts) =>
      household()
        .event('evt-a', { title: 'Client call', start: '10:00', end: '11:00' })
        .event('evt-b', { title: 'Board meeting', start: '11:20', end: '12:00' })
        .task('tsk-mid', { title: 'Sort the mail', at: '11:00', ...opts }).state;
    const cases = { user: 'would free about 15 min today.', default: 'would free about 15 min (assumed) today.', inferred: 'would free about 15 min (estimated) today.', unrecorded: 'would free about 15 min (not confirmed) today.' };
    for (const [name, tail] of Object.entries(cases)) {
      const view = project(arrangement(VARIANTS[name]));
      const offer = offersFor(view, copyContextFor(view)).find((o) => o.key === 'move:tsk-mid');
      assert.ok(offer, `${name}: the foundation offers this move`);
      assert.equal(offer.body, `Moving Sort the mail to tomorrow ${tail}`, name);
    }
  });
});

describe('HA-010 — nothing says or implies "you said" for a length she did not give', () => {
  const NEVER = /\byou (said|told|typed|gave|set)\b|\byou entered\b[^.]*\b(min|hr|length|duration)\b/i;

  /** Every string Calendar shows for a day, for one provenance, from the same surfaces the screen reads. */
  const everythingSaid = (state) => {
    const view = project(state);
    const ctx = copyContextFor(view);
    const strings = [headlineFor(view, ctx).text];
    for (const item of view.dayItems) strings.push(itemLine(item, ctx), ...detailLines(item));
    for (const conflict of view.conflicts) {
      const c = conflictCopy(conflict, ctx);
      strings.push(c.label, c.sentence, ...c.why);
    }
    for (const unplaced of view.unplacedItems) {
      const u = unplacedCopy(unplaced, ctx);
      strings.push(u.sentence, ...u.why);
    }
    for (const offer of offersFor(view, ctx)) strings.push(offer.body, ...offer.why);
    return strings;
  };

  test('no provenance produces a claim of "you said / you entered N minutes" on any surface', () => {
    for (const [name, opts] of Object.entries(VARIANTS)) {
      for (const state of [dayWith(opts).state, household().event('evt-all', { title: 'All day', start: '06:00', end: '22:00' }).task('tsk-x', { title: 'Return books', due: DAY, ...opts }).state]) {
        for (const line of everythingSaid(state)) assert.doesNotMatch(line, NEVER, `${name}: ${line}`);
      }
    }
  });

  test('every surface that names a length that is not hers also carries an estimate word', () => {
    for (const name of ['default', 'inferred', 'unrecorded']) {
      const strings = everythingSaid(dayWith(VARIANTS[name]).state);
      const row = strings.find((s) => /^Due this day · Flexible · About 15 min/.test(s));
      assert.match(row, /\((assumed|estimated|not confirmed)\)$/, name);
      assert.ok(strings.some((s) => /counting (estimated task lengths|task lengths that aren’t confirmed)/.test(s)), `${name}: the fit verdict says what it counts`);
      assert.ok(strings.some((s) => /going by (an assumed length|an estimated length|a length that isn’t confirmed)/.test(s)), `${name}: the opening says what it rests on`);
    }
  });

  test('the wording is centralised: copy.ts never attributes a length to her, and the UI files hold no duration wording of their own', () => {
    const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const copySource = code(readFileSync(join(ROOT, 'src', 'features', 'calendar', 'copy.ts'), 'utf8'));
    assert.doesNotMatch(copySource, /\byou (said|told|typed|gave)\b/i);
    for (const line of copySource.split('\n').filter((l) => /length|duration/i.test(l))) assert.doesNotMatch(line, /you entered/i, line.trim());
    const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : /\.tsx$/.test(name) ? [join(dir, name)] : []));
    for (const file of walk(join(ROOT, 'src', 'features', 'calendar'))) assert.doesNotMatch(code(readFileSync(file, 'utf8')), /assumed|estimated|not confirmed|planning assumption/i, `${file} words a duration itself`);
  });

  test('on the rendered screen the estimate is on the row, not only in the evidence', async () => {
    const view = project(dayWith(VARIANTS.default).state);
    const r = await render(<CalendarDayView view={view} onOpenItem={noop} />);
    const textOf = (children) => (Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children));
    const text = r.root.findAllByType('Text').map((n) => textOf(n.props.children)).join(' | ');
    assert.match(text, /Due this day · Flexible · About 15 min \(assumed\)/);
    assert.match(text, /Everything scheduled fits, counting estimated task lengths\./);
    assert.doesNotMatch(text, NEVER);
  });
});

describe('HA-010 — sync round trip: the knowledge Calendar reads survives the cloud row', () => {
  const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
  const ACCOUNT = '11111111-1111-4111-8111-111111111111';
  const DEVICE = '22222222-2222-4222-8222-222222222222';
  const CAT_CLOUD = '44444444-4444-4444-8444-444444444444';
  const CAT = 'cat-home';
  const namespace = () => ({
    ...emptyNamespace({ accountId: ACCOUNT, householdId: HOUSEHOLD, deviceId: DEVICE }),
    mappings: { [`category:${CAT}`]: { kind: 'category', localId: CAT, cloudId: CAT_CLOUD, revision: 1 } },
  });
  const rowOf = (state, id) => toCloudRow(state, { householdId: HOUSEHOLD, profileId: ACCOUNT, namespace: namespace() }, 'task', id);
  const homeOf = (row) => applyCloudRow(createEmptyState(TZ), 'task', row.local_id, { ...row, id: '55555555-5555-4555-8555-555555555555', revision: 1 }, (id) => (id === CAT_CLOUD ? CAT : null)).tasks[0];

  const state = () =>
    household()
      .event('evt-a', { title: 'Morning meeting', start: '10:00', end: '11:00' })
      .task('tsk-user', { title: 'Typed fifteen', minutes: 15, due: DAY })
      .task('tsk-default', { title: 'Defaulted fifteen', due: DAY })
      .task('tsk-inferred', { title: 'Estimated twenty', minutes: 20, durationSource: 'inferred', due: DAY })
      .task('tsk-null', { title: 'Old task', minutes: 45, durationSource: null, due: DAY }).state;

  test('each provenance leaves the device as its own value and comes home as the same value', () => {
    const local = state();
    const rows = Object.fromEntries(local.tasks.map((t) => [t.id, rowOf(local, t.id)]));
    assert.deepEqual(
      Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, [row.duration_minutes, row.duration_source]])),
      { 'tsk-user': [15, 'user'], 'tsk-default': [15, 'default'], 'tsk-inferred': [20, 'inferred'], 'tsk-null': [45, null] }
    );
    for (const task of local.tasks) {
      const back = homeOf(rows[task.id]);
      assert.deepEqual([back.durationMinutes, back.durationSource], [task.durationMinutes, task.durationSource], task.id);
    }
  });

  test('Calendar reads exactly the same thing after the round trip: the same evidence, the same words', () => {
    const local = state();
    const home = { ...local, tasks: local.tasks.map((t) => ({ ...t, ...homeOf(rowOf(local, t.id)), id: t.id })) };
    const before = project(local);
    const after = project(home);
    assert.equal(dayEvidenceJson(after), dayEvidenceJson(before));
    for (const id of ['tsk-user', 'tsk-default', 'tsk-inferred', 'tsk-null']) assert.equal(lineOf(after, id), lineOf(before, id), id);
    assert.deepEqual(
      ['tsk-user', 'tsk-default', 'tsk-inferred', 'tsk-null'].map((id) => itemOf(after, id).durationBasis),
      ['task_recorded', 'task_default', 'task_inferred', 'task_unrecorded']
    );
  });

  test('a cloud row that carries no source (an older server) arrives unrecorded, and Calendar says "not confirmed"', () => {
    const local = state();
    const { duration_source, ...bare } = rowOf(local, 'tsk-user');
    const back = homeOf(bare);
    assert.equal(back.durationSource, null);
    const view = project({ ...local, tasks: local.tasks.map((t) => (t.id === 'tsk-user' ? { ...t, ...back, id: t.id } : t)) });
    assert.equal(itemOf(view, 'tsk-user').durationBasis, 'task_unrecorded');
    assert.match(lineOf(view, 'tsk-user'), /About 15 min \(not confirmed\)$/);
  });
});
