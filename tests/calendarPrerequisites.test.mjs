/**
 * HK-IR01 / HA-009 — a removed prerequisite is not a completed prerequisite, in Calendar.
 *
 * REMOVED != COMPLETED. MISSING != SATISFIED. Before this repair Calendar held its own, third answer: it SKIPPED a removed or
 * missing event (treating it as met, so the dependent read as free of it) and turned a missing task into a blocker with no title
 * ("Needs another item first"). Calendar now asks the foundation where a prerequisite stands (`standingOf`), and:
 *
 *   satisfied    (a completed task)                 -> no blocker, no note
 *   pending      (a live event / open task)         -> a blocker, exactly as before
 *   unavailable  (a removed event, an archived task, a row that is not there)
 *                -> NOT a blocker, NOT a timing conflict, NOT "waiting"; a neutral "review needed" note instead.
 *
 * Nothing rewrites, deletes or re-points a dependency: history is kept, and retiring the edge is the correction.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { removeEvent } from '../src/domain/events.ts';
import { blockersOf, readinessOf, removeDependency, unavailablePrerequisitesOf } from '../src/domain/structure.ts';
import { archiveTask, completeTask } from '../src/domain/tasks.ts';
import {
  COPY,
  conflictCopy,
  copyContextFor,
  detailLines,
  headlineFor,
  itemAccessibilityLabel,
  itemLine,
  offersFor,
  prerequisiteReviewLine,
  unplacedCopy,
} from '../src/features/calendar/copy.ts';
import { computePreview, refreshPreview, validityOf } from '../src/features/calendar/model/preview.ts';
import { projectCalendarDay } from '../src/features/calendar/model/projectCalendar.ts';
import { revisionOf } from '../src/features/calendar/model/revision.ts';
import { dayEvidenceJson } from '../src/features/calendar/model/structural.ts';
import { CalendarDayView } from '../src/features/calendar/ui/CalendarDayView.tsx';
import { DAY, household, msAt, scenarioById } from './support/calendarScenarios.mjs';
import { render } from './support/render.tsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = msAt('07:00');
const evt = (id) => ({ kind: 'event', id });
const tsk = (id) => ({ kind: 'task', id });
const noop = () => {};
const NEUTRAL = 'Something this needed is no longer there — worth a look.';

const project = (state, overrides = {}) => projectCalendarDay({ state, date: DAY, today: DAY, nowMs: NOW, ...overrides });
const itemOf = (view, id) => view.dayItems.find((i) => i.ref.id === id);
const unplacedOf = (view, id) => view.unplacedItems.find((u) => u.itemRef.id === id);
const idsOf = (refs) => refs.map((r) => `${r.kind}:${r.id}`).sort();

/** The notary appointment (11:00-12:00) is what the permit form requires; the form is a dated, unscheduled task. */
const notaryWorld = () =>
  household()
    .event('evt-notary', { title: 'Notary appointment', start: '11:00', end: '12:00' })
    .event('evt-later', { title: 'Team sync', start: '13:00', end: '13:30' })
    .task('tsk-permit', { title: 'Submit the permit form', minutes: 20, due: DAY })
    .requires(tsk('tsk-permit'), evt('evt-notary'));

/** The receipt task is what the filing requires. */
const receiptWorld = () =>
  household()
    .event('evt-a', { title: 'Morning appointment', start: '10:00', end: '11:00' })
    .task('tsk-receipt', { title: 'Get the receipt', minutes: 15, due: DAY })
    .task('tsk-file', { title: 'File the reimbursement', minutes: 20, due: DAY })
    .requires(tsk('tsk-file'), tsk('tsk-receipt'));

/** Every string Calendar shows for one item's day, from the same surfaces the screen reads. */
function everythingSaid(view) {
  const ctx = copyContextFor(view);
  const strings = [headlineFor(view, ctx).text];
  for (const item of view.dayItems) strings.push(itemLine(item, ctx), itemAccessibilityLabel(item, ctx), ...detailLines(item));
  for (const conflict of view.conflicts) {
    const c = conflictCopy(conflict, ctx);
    strings.push(c.label, c.sentence, ...c.why);
  }
  for (const unplaced of view.unplacedItems) {
    const u = unplacedCopy(unplaced, ctx);
    strings.push(u.label ?? '', u.sentence, ...u.why);
  }
  for (const offer of offersFor(view, ctx)) strings.push(offer.body, ...offer.why);
  return strings.filter(Boolean);
}

/** What the foundation says about the same edges. Calendar must be able to be checked against it, and agree. */
function assertAgreesWithFoundation(state, view, label) {
  for (const item of view.dayItems) {
    const ref = item.ref;
    assert.deepEqual(idsOf(item.blockedBy.map((b) => b.ref)), idsOf(blockersOf(state, ref)), `${label}: ${ref.id} blockers`);
    assert.deepEqual(
      idsOf(item.unavailablePrerequisites.map((p) => p.ref)),
      idsOf(unavailablePrerequisitesOf(state, ref).map((p) => p.ref)),
      `${label}: ${ref.id} unavailable prerequisites`
    );
    assert.deepEqual(
      item.unavailablePrerequisites.map((p) => p.cause).sort(),
      unavailablePrerequisitesOf(state, ref).map((p) => p.cause).sort(),
      `${label}: ${ref.id} causes`
    );
    const calendar = item.blockedBy.length > 0 ? 'blocked' : item.unavailablePrerequisites.length > 0 ? 'needsReview' : 'ready';
    assert.equal(calendar, readinessOf(state, ref), `${label}: ${ref.id} readiness`);
  }
}

describe('HA-009 — a LIVE prerequisite keeps its existing behaviour', () => {
  test('a live event is a blocker with its known finish; nothing is flagged for review', () => {
    const view = project(notaryWorld().state);
    const permit = itemOf(view, 'tsk-permit');
    assert.deepEqual(permit.blockedBy.map((b) => [b.ref.id, b.finishMinute, b.finishBasis]), [['evt-notary', 12 * 60, 'event_span']]);
    assert.deepEqual(permit.unavailablePrerequisites, []);
    assert.ok(unplacedOf(view, 'tsk-permit').openings.every((o) => o.startMinute >= 12 * 60), 'no opening before the notary appointment ends');
    assert.ok(detailLines(permit).includes('Needs Notary appointment first'));
    assert.doesNotMatch(itemLine(permit, copyContextFor(view)), /Review needed/);
    assert.equal(prerequisiteReviewLine(permit), null);
  });

  test('a live task with no time yet is something to wait for, in the words that were always used', () => {
    const view = project(household().event('evt-a', { title: 'Morning appointment', start: '10:00', end: '11:00' }).task('tsk-first', { title: 'Get the receipt', minutes: 20, due: DAY }).task('tsk-second', { title: 'File it', minutes: 20, due: DAY }).requires(tsk('tsk-second'), tsk('tsk-first')).state);
    assert.equal(unplacedOf(view, 'tsk-second').state, 'waiting_on_predecessor');
    assert.deepEqual(itemOf(view, 'tsk-second').unavailablePrerequisites, []);
    assert.ok(detailLines(itemOf(view, 'tsk-second')).includes('Needs Get the receipt first'));
    assert.equal(unplacedCopy(unplacedOf(view, 'tsk-second'), copyContextFor(view)).label, 'Waiting');
  });

  test('a live event scheduled after a timed dependent is still a DEPENDENCY_CONFLICT (control for the removal below)', () => {
    const view = project(notaryWorld().task('tsk-early', { title: 'Sign early', minutes: 20, at: '10:00', due: DAY }).requires(tsk('tsk-early'), evt('evt-notary')).state);
    assert.deepEqual(view.conflicts.filter((c) => c.type === 'DEPENDENCY_CONFLICT').map((c) => c.id), ['DEPENDENCY_CONFLICT:tsk-early:evt-notary']);
  });

  test('a live event that has simply ELAPSED is over: not a blocker and not a review, and never called "done"', () => {
    const view = project(notaryWorld().state, { nowMs: msAt('12:30') });
    const permit = itemOf(view, 'tsk-permit');
    assert.deepEqual(permit.blockedBy, []);
    assert.deepEqual(permit.unavailablePrerequisites, [], 'an event that happened is not "gone"');
    assert.doesNotMatch(everythingSaid(view).join(' | '), /\bdone\b|handled|completed|attended/i);
  });
});

describe('HA-009 — a removed EVENT prerequisite is not a completed one', () => {
  const removedWorld = () => {
    const b = notaryWorld();
    const before = b.state;
    b.with((s) => removeEvent(s, b.ctx(), 'evt-notary'));
    return { b, before, after: b.state };
  };

  test('it is not a blocker and not satisfied: the dependent carries a review note and the removed thing stops constraining time', () => {
    const { after } = removedWorld();
    const view = project(after);
    const permit = itemOf(view, 'tsk-permit');
    assert.deepEqual(permit.blockedBy, [], 'nothing keeps asserting that a removed thing is ahead of it');
    assert.deepEqual(permit.unavailablePrerequisites.map((p) => [p.ref, p.cause]), [[evt('evt-notary'), 'retired']]);
    assert.ok(unplacedOf(view, 'tsk-permit').openings.some((o) => o.startMinute < 11 * 60), 'the removed appointment no longer bounds where the form can go');
    assert.equal(unplacedOf(view, 'tsk-permit').state, 'has_opening');
    assertAgreesWithFoundation(after, view, 'removed event');
  });

  test('it creates no "out of order" conflict against a thing that no longer exists', () => {
    const b = notaryWorld().task('tsk-early', { title: 'Sign early', minutes: 20, at: '10:00', due: DAY }).requires(tsk('tsk-early'), evt('evt-notary'));
    const live = project(b.state);
    assert.equal(live.conflicts.filter((c) => c.type === 'DEPENDENCY_CONFLICT').length, 1, 'while the event is live it is a real constraint');

    b.with((s) => removeEvent(s, b.ctx(), 'evt-notary'));
    const view = project(b.state);
    assert.deepEqual(view.conflicts.filter((c) => c.type === 'DEPENDENCY_CONFLICT'), []);
    assert.equal(itemOf(view, 'tsk-early').unavailablePrerequisites.length, 1);
    assert.equal(headlineFor(view, copyContextFor(view)).kind === 'problem', false, 'a gone prerequisite is not a problem headline');
  });

  test('history is kept: the dependency row is exactly as it was, and only the target changed', () => {
    const { before, after } = removedWorld();
    assert.deepEqual(after.dependencies, before.dependencies, 'the edge was neither rewritten nor removed nor re-pointed');
    assert.equal(after.dependencies[0].status, 'active');
    assert.equal(after.events.find((e) => e.id === 'evt-notary').status, 'removed');
    const view = project(after);
    assert.equal(view.dayItems.some((i) => i.ref.id === 'evt-notary'), false, 'the removed event is not on the day');
  });

  test('the row says review is needed; the details say what happened, neutrally', () => {
    const view = project(removedWorld().after);
    const permit = itemOf(view, 'tsk-permit');
    const ctx = copyContextFor(view);
    assert.equal(itemLine(permit, ctx), 'Due this day · Flexible · About 20 min · Review needed');
    assert.deepEqual(detailLines(permit), [NEUTRAL]);
    assert.equal(prerequisiteReviewLine(permit), NEUTRAL);
    assert.equal(COPY.prerequisiteGone, NEUTRAL);
    assert.equal(itemAccessibilityLabel(permit, ctx), 'Submit the permit form. Due this day · Flexible · About 20 min · Review needed');
    assert.ok(unplacedCopy(unplacedOf(view, 'tsk-permit'), ctx).why.includes(NEUTRAL), 'the unplaced verdict carries it too');
  });

  test('a TIMED dependent is flagged the same way', () => {
    const b = notaryWorld().task('tsk-early', { title: 'Sign early', minutes: 20, at: '10:00', due: DAY }).requires(tsk('tsk-early'), evt('evt-notary'));
    b.with((s) => removeEvent(s, b.ctx(), 'evt-notary'));
    const view = project(b.state);
    assert.equal(itemLine(itemOf(view, 'tsk-early'), copyContextFor(view)), '10:00–10:20 AM · Flexible · Review needed');
  });
});

describe('HA-009 — an ARCHIVED task prerequisite means the same thing as a removed event', () => {
  test('one edge must not change meaning by target kind: same shape, same words', () => {
    const viaTask = receiptWorld();
    viaTask.with((s) => archiveTask(s, viaTask.ctx(), 'tsk-receipt'));
    const viaEvent = notaryWorld();
    viaEvent.with((s) => removeEvent(s, viaEvent.ctx(), 'evt-notary'));

    const taskView = project(viaTask.state);
    const eventView = project(viaEvent.state);
    const file = itemOf(taskView, 'tsk-file');
    const permit = itemOf(eventView, 'tsk-permit');
    assert.deepEqual(file.blockedBy, []);
    assert.deepEqual(file.unavailablePrerequisites.map((p) => [p.ref, p.cause]), [[tsk('tsk-receipt'), 'retired']]);
    assert.deepEqual(detailLines(file), detailLines(permit));
    assert.equal(itemLine(file, copyContextFor(taskView)).replace(/About \d+ min/, ''), itemLine(permit, copyContextFor(eventView)).replace(/About \d+ min/, ''));
    assert.deepEqual(taskView.conflicts, []);
    assertAgreesWithFoundation(viaTask.state, taskView, 'archived task');
  });
});

describe('HA-009 — a MISSING target is not a satisfied one (the defensive read)', () => {
  // State validation refuses a dangling edge, so the app cannot produce this. Calendar must still not treat it as met.
  test('a missing event: not a blocker, not satisfied, a review note', () => {
    const s = notaryWorld().state;
    const missing = { ...s, events: s.events.filter((e) => e.id !== 'evt-notary') };
    const view = project(missing);
    const permit = itemOf(view, 'tsk-permit');
    assert.deepEqual(permit.blockedBy, []);
    assert.deepEqual(permit.unavailablePrerequisites.map((p) => [p.ref, p.cause]), [[evt('evt-notary'), 'missing']]);
    assert.equal(itemLine(permit, copyContextFor(view)).endsWith('Review needed'), true);
    assertAgreesWithFoundation(missing, view, 'missing event');
  });

  test('a missing task no longer becomes an untitled blocker ("Needs another item first", "Waiting")', () => {
    const s = receiptWorld().state;
    const missing = { ...s, tasks: s.tasks.filter((t) => t.id !== 'tsk-receipt') };
    const view = project(missing);
    const file = itemOf(view, 'tsk-file');
    assert.deepEqual(file.blockedBy, []);
    assert.deepEqual(file.unavailablePrerequisites.map((p) => p.cause), ['missing']);
    assert.notEqual(unplacedOf(view, 'tsk-file').state, 'waiting_on_predecessor');
    assert.doesNotMatch(everythingSaid(view).join(' | '), /Needs another item first|Waiting/);
    assertAgreesWithFoundation(missing, view, 'missing task');
  });
});

describe('HA-009 — a COMPLETED target still satisfies', () => {
  test('a completed task prerequisite: no blocker, no note, and the dependent reads as ready', () => {
    const b = receiptWorld();
    b.with((s) => completeTask(s, b.ctx(), 'tsk-receipt'));
    const view = project(b.state);
    const file = itemOf(view, 'tsk-file');
    assert.deepEqual([file.blockedBy, file.unavailablePrerequisites], [[], []]);
    assert.doesNotMatch(itemLine(file, copyContextFor(view)), /Review needed/);
    assert.deepEqual(detailLines(file), []);
    assert.equal(readinessOf(b.state, tsk('tsk-file')), 'ready');
    assertAgreesWithFoundation(b.state, view, 'completed task');
  });
});

describe('HA-009 — several prerequisites', () => {
  const two = () =>
    household()
      .event('evt-notary', { title: 'Notary appointment', start: '11:00', end: '12:00' })
      .event('evt-bank', { title: 'Bank visit', start: '15:00', end: '16:00' })
      .task('tsk-receipt', { title: 'Get the receipt', minutes: 15, due: DAY })
      .task('tsk-file', { title: 'File the reimbursement', minutes: 20, due: DAY })
      .requires(tsk('tsk-file'), tsk('tsk-receipt'))
      .requires(tsk('tsk-file'), evt('evt-notary'))
      .requires(tsk('tsk-file'), evt('evt-bank'));

  test('a live one and a removed one: the live one is still what it waits for, and the removed one is still flagged', () => {
    const b = two();
    b.with((s) => removeEvent(s, b.ctx(), 'evt-notary'));
    const view = project(b.state);
    const file = itemOf(view, 'tsk-file');
    assert.deepEqual(idsOf(file.blockedBy.map((x) => x.ref)), ['event:evt-bank', 'task:tsk-receipt']);
    assert.deepEqual(file.unavailablePrerequisites.map((p) => p.ref), [evt('evt-notary')]);
    assert.deepEqual(detailLines(file), ['Needs Get the receipt first', 'Needs Bank visit first', NEUTRAL]);
    assert.equal(readinessOf(b.state, tsk('tsk-file')), 'blocked', 'the foundation agrees: a pending prerequisite outranks a retired one');
    assertAgreesWithFoundation(b.state, view, 'live + removed');
  });

  test('a completed one and a removed one: NOT ready — the removal is not cancelled out by the completion', () => {
    const b = household()
      .event('evt-notary', { title: 'Notary appointment', start: '11:00', end: '12:00' })
      .task('tsk-receipt', { title: 'Get the receipt', minutes: 15, due: DAY })
      .task('tsk-file', { title: 'File the reimbursement', minutes: 20, due: DAY })
      .requires(tsk('tsk-file'), tsk('tsk-receipt'))
      .requires(tsk('tsk-file'), evt('evt-notary'));
    b.with((s) => completeTask(s, b.ctx(), 'tsk-receipt'));
    b.with((s) => removeEvent(s, b.ctx(), 'evt-notary'));
    const view = project(b.state);
    const file = itemOf(view, 'tsk-file');
    assert.deepEqual(file.blockedBy, []);
    assert.deepEqual(file.unavailablePrerequisites.map((p) => p.ref), [evt('evt-notary')]);
    assert.equal(readinessOf(b.state, tsk('tsk-file')), 'needsReview');
    assertAgreesWithFoundation(b.state, view, 'completed + removed');
  });

  test('two removed ones are said once, with the count', () => {
    const b = two();
    b.with((s) => removeEvent(s, b.ctx(), 'evt-notary'));
    b.with((s) => removeEvent(s, b.ctx(), 'evt-bank'));
    b.with((s) => archiveTask(s, b.ctx(), 'tsk-receipt'));
    const view = project(b.state);
    const file = itemOf(view, 'tsk-file');
    assert.equal(file.unavailablePrerequisites.length, 3);
    assert.equal(prerequisiteReviewLine(file), '3 things this needed are no longer there — worth a look.');
    assert.equal(itemLine(file, copyContextFor(view)).endsWith('Review needed'), true);
    assertAgreesWithFoundation(b.state, view, 'all gone');
  });

  test('a completed one and a live one: only the live one is a blocker and nothing is flagged', () => {
    const b = two();
    b.with((s) => completeTask(s, b.ctx(), 'tsk-receipt'));
    const view = project(b.state);
    assert.deepEqual(idsOf(itemOf(view, 'tsk-file').blockedBy.map((x) => x.ref)), ['event:evt-bank', 'event:evt-notary']);
    assert.deepEqual(itemOf(view, 'tsk-file').unavailablePrerequisites, []);
    assertAgreesWithFoundation(b.state, view, 'completed + live');
  });
});

describe('HA-009 — stale: what changes when a prerequisite goes away, and the correction path', () => {
  test('a projection made while the prerequisite was live is not the projection after it goes: evidence, digest and rows all move', () => {
    const b = notaryWorld();
    const before = b.state;
    b.with((s) => removeEvent(s, b.ctx(), 'evt-notary'));
    const after = b.state;
    assert.notEqual(revisionOf(before), revisionOf(after));
    const [a, z] = [project(before), project(after)];
    assert.notEqual(dayEvidenceJson(a), dayEvidenceJson(z));
    assert.equal(itemOf(a, 'tsk-permit').blockedBy.length, 1);
    assert.equal(itemOf(z, 'tsk-permit').blockedBy.length, 0);
    assert.equal(itemOf(a, 'tsk-permit').unavailablePrerequisites.length, 0);
    assert.equal(itemOf(z, 'tsk-permit').unavailablePrerequisites.length, 1);
  });

  test('a preview computed while the prerequisite was live goes stale when it is removed, and is never applied against the new world', () => {
    const b = scenarioById('N').build().task('tsk-dep', { title: 'Follow up', minutes: 10, due: DAY }).requires(tsk('tsk-dep'), evt('evt-a'));
    const state = b.state;
    const intent = { kind: 'move_event', id: 'evt-b' };
    const outcome = computePreview({ state, today: DAY, nowMs: NOW, date: DAY, intent });
    assert.equal(outcome.ok, true);
    assert.equal(validityOf(outcome.preview, state, DAY), 'current');

    const removed = removeEvent(state, b.ctx(), 'evt-a');
    assert.equal(validityOf(outcome.preview, removed, DAY), 'stale');
    // The same action is still legitimately offered, so the preview is RECOMPUTED against the world as it now is (never left describing the old one).
    const refreshed = refreshPreview(outcome.preview, { state: removed, today: DAY, nowMs: NOW });
    assert.equal(refreshed.status, 'updated');
    const dep = refreshed.preview.after.dayItems.find((i) => i.ref.id === 'tsk-dep');
    assert.deepEqual(dep.unavailablePrerequisites.map((p) => p.ref), [evt('evt-a')]);
    assert.deepEqual(dep.blockedBy, []);
  });

  test('the correction path works and is the only thing that clears the note: retiring the edge, not the removal', () => {
    const b = notaryWorld();
    b.with((s) => removeEvent(s, b.ctx(), 'evt-notary'));
    const flagged = project(b.state);
    assert.equal(itemOf(flagged, 'tsk-permit').unavailablePrerequisites.length, 1, 'removing the target did not clear it');

    const edgeId = itemOf(flagged, 'tsk-permit').unavailablePrerequisites[0].edgeId;
    b.with((s) => removeDependency(s, b.ctx(), edgeId));
    const cleared = project(b.state);
    const permit = itemOf(cleared, 'tsk-permit');
    assert.deepEqual([permit.blockedBy, permit.unavailablePrerequisites], [[], []]);
    assert.doesNotMatch(itemLine(permit, copyContextFor(cleared)), /Review needed/);
    assert.equal(b.state.dependencies[0].status, 'removed', 'and the edge is still on record as retired');
    assert.equal(readinessOf(b.state, tsk('tsk-permit')), 'ready');
  });
});

describe('HA-009 — Calendar’s wording for a dependent that lost a prerequisite', () => {
  const VARIANTS = {
    'removed event': () => {
      const b = notaryWorld();
      b.with((s) => removeEvent(s, b.ctx(), 'evt-notary'));
      return b.state;
    },
    'archived task': () => {
      const b = receiptWorld();
      b.with((s) => archiveTask(s, b.ctx(), 'tsk-receipt'));
      return b.state;
    },
    'missing event': () => {
      const s = notaryWorld().state;
      return { ...s, events: s.events.filter((e) => e.id !== 'evt-notary') };
    },
  };

  test('says the neutral thing and none of what the foundation prohibits: not handled, done, completed, ready, waiting, out of order, or "needs {the thing that is gone}"', () => {
    for (const [name, build] of Object.entries(VARIANTS)) {
      const view = project(build());
      const said = everythingSaid(view);
      assert.ok(said.includes(NEUTRAL), `${name}: the neutral line is present`);
      const text = said.join(' | ');
      assert.doesNotMatch(text, /\b(handled|done|completed|satisfied|met|ready|taken care of|resolved)\b/i, name);
      assert.doesNotMatch(text, /Waiting|Out of order|is scheduled before|Needs .* first|Needs another item/, name);
      assert.doesNotMatch(text, /Notary appointment|Get the receipt/, `${name}: it does not name the thing that is gone as something still needed`);
      assert.equal(headlineFor(view, copyContextFor(view)).kind === 'problem', false, name);
    }
  });

  test('it is not an alarm: no conflict, no attention tag, and the day’s verdict is about time, unchanged', () => {
    for (const [name, build] of Object.entries(VARIANTS)) {
      const view = project(build());
      assert.deepEqual(view.conflicts, [], name);
      assert.equal(view.capacityState.category, 'room', `${name}: the day still fits`);
      assert.equal(headlineFor(view, copyContextFor(view)).text, 'Everything scheduled fits.', name);
    }
  });

  test('on the rendered screen the row says "Review needed", and a screen reader hears it', async () => {
    const view = project(VARIANTS['removed event']());
    const r = await render(<CalendarDayView view={view} onOpenItem={noop} />);
    const textOf = (children) => (Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children));
    const shown = r.root.findAllByType('Text').map((n) => textOf(n.props.children)).join(' | ');
    const announced = r.root.findAll((n) => n.type === 'Pressable').map((n) => String(n.props.accessibilityLabel)).join(' | ');
    assert.match(shown, /Submit the permit form/);
    assert.match(shown, /About 20 min · Review needed/);
    assert.match(announced, /Submit the permit form\. Due this day · Flexible · About 20 min · Review needed\./);
    assert.doesNotMatch(shown + announced, /Waiting|Out of order|Needs Notary appointment first/);
  });

  test('a dependent with nothing wrong is not flagged: the note appears only where a prerequisite is gone', () => {
    for (const state of [notaryWorld().state, receiptWorld().state, household().event('evt-a', { title: 'Meeting', start: '10:00', end: '11:00' }).state]) {
      const view = project(state);
      for (const item of view.dayItems) assert.doesNotMatch(itemLine(item, copyContextFor(view)), /Review needed/);
    }
  });
});

describe('HA-009 — Calendar no longer holds its own answer', () => {
  test('the foundation and Calendar agree across every kind and lifecycle', () => {
    const cases = [];
    const push = (label, state) => cases.push([label, state]);
    push('live event', notaryWorld().state);
    push('live task', receiptWorld().state);
    let b = notaryWorld();
    b.with((s) => removeEvent(s, b.ctx(), 'evt-notary'));
    push('removed event', b.state);
    b = receiptWorld();
    b.with((s) => archiveTask(s, b.ctx(), 'tsk-receipt'));
    push('archived task', b.state);
    b = receiptWorld();
    b.with((s) => completeTask(s, b.ctx(), 'tsk-receipt'));
    push('completed task', b.state);
    const s = notaryWorld().state;
    push('missing event', { ...s, events: s.events.filter((e) => e.id !== 'evt-notary') });
    for (const [label, state] of cases) assertAgreesWithFoundation(state, project(state), label);
  });

  test('the source no longer decides completion itself: it imports the one read-only standing function and nothing else from structure', () => {
    const collect = readFileSync(join(ROOT, 'src', 'features', 'calendar', 'model', 'collect.ts'), 'utf8');
    assert.match(collect, /import \{ standingOf \} from '\.\.\/\.\.\/\.\.\/domain\/structure';/);
    assert.doesNotMatch(collect, /\bisDone\b|\bisBlocked\b/);
    assert.doesNotMatch(collect, /status !== 'active'\) continue;\s*\n\s*const finishMs/, 'the old "skip a removed or missing event" line is gone');
  });
});
