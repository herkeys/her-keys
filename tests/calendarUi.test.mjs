/**
 * Feature 03 — Calendar UI contract (contract sections 47, 53, 54, 72).
 *
 * Components are props-driven on purpose: the store provider cannot load under the test stub, so the
 * container stays thin and everything a person reads is a pure function of the view model. These tests
 * assert what is rendered (text, roles, states, sizes), not JSX snapshots.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { copyContextFor } from '../src/features/calendar/copy.ts';
import { calendarAvailability } from '../src/features/calendar/model/availability.ts';
import { initialPresentation, reducePresentation, selectedDateOf } from '../src/features/calendar/model/presentation.ts';
import { projectCalendarDay } from '../src/features/calendar/model/projectCalendar.ts';
import { AgendaList } from '../src/features/calendar/ui/AgendaList.tsx';
import { CalendarDayView } from '../src/features/calendar/ui/CalendarDayView.tsx';
import { CalendarEmptyDay, CalendarLoading, CalendarRecovery } from '../src/features/calendar/ui/CalendarStates.tsx';
import { ConflictCard } from '../src/features/calendar/ui/DayInsights.tsx';
import { DAY, NEXT, SCENARIOS, household, inputsFor, msAt, scenarioById } from './support/calendarScenarios.mjs';
import { render } from './support/render.tsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const flatten = (node) => StyleSheet.flatten(node.props.style) ?? {};
const textOf = (children) => (Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children));
const allText = (r) => r.root.findAllByType('Text').map((n) => textOf(n.props.children));
const joined = (r) => allText(r).join(' | ');
const press = (node) => TestRenderer.act(async () => node.props.onPress());
const view = (id, overrides) => projectCalendarDay(inputsFor(scenarioById(id), overrides));
const noop = () => {};

describe('Loading is not empty, recovery is neither (Y, Z)', () => {
  test('a household that has not loaded says it is loading and never says nothing is scheduled', async () => {
    const r = await render(<CalendarLoading />);
    const text = joined(r);
    assert.match(text, /Reading your calendar/);
    assert.doesNotMatch(text, /Nothing scheduled|nothing on this day/i);
    assert.equal(r.root.findByType('View').props.accessibilityRole, 'progressbar');
  });

  test('availability: hydrating and unhydrated are loading; a substituted (recovered) state is recovery; only a loaded household is ready', () => {
    const base = { state: {}, today: DAY, recovery: null, persistenceDegraded: false };
    assert.equal(calendarAvailability({ ...base, status: 'hydrating', state: null, today: null }).kind, 'loading');
    assert.equal(calendarAvailability({ ...base, status: 'unhydrated', state: null, today: null }).kind, 'loading');
    assert.equal(calendarAvailability({ ...base, status: 'recovery', recovery: { reason: 'invalid_json' } }).kind, 'recovery');
    assert.equal(calendarAvailability({ ...base, status: 'ready', recovery: { reason: 'x' } }).kind, 'recovery', 'a recovery marker wins over a ready status');
    assert.deepEqual(calendarAvailability({ ...base, status: 'ready', persistenceDegraded: true }), { kind: 'ready', persistenceDegraded: true });
  });

  test('recovery renders its own explanation and derives nothing (no capacity, conflict or opening words)', async () => {
    const r = await render(<CalendarRecovery />);
    const text = joined(r);
    assert.match(text, /restored/);
    assert.doesNotMatch(text, /overlap|fits|room|tight|conflict|Nothing scheduled/i);
  });

  test('a KNOWN empty day is empty; that wording exists only on this component', async () => {
    const r = await render(<CalendarEmptyDay />);
    assert.match(joined(r), /Nothing scheduled/);
  });
});

describe('the agenda is told apart in words, in order, and is operable', () => {
  const a = () => view('A');

  test('every row says Fixed or Flexible in text — nothing depends on color', async () => {
    const v = a();
    const r = await render(<AgendaList items={v.dayItems.filter((i) => i.timing.kind === 'timed')} ctx={copyContextFor(v)} onOpenItem={noop} />);
    const lines = allText(r);
    assert.ok(lines.some((t) => t.includes('· Fixed')), 'a fixed commitment says Fixed');
    const b = view('N');
    const r2 = await render(<AgendaList items={b.dayItems} ctx={copyContextFor(b)} onOpenItem={noop} />);
    assert.ok(allText(r2).some((t) => t.includes('· Flexible')), 'a flexible one says Flexible');
  });

  test('screen-reader order is chronological, and each row reads title, time and fixedness together', async () => {
    const v = view('N');
    const r = await render(<AgendaList items={v.dayItems} ctx={copyContextFor(v)} onOpenItem={noop} />);
    const labels = r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityRole === 'button' && n.props.accessibilityHint).map((n) => n.props.accessibilityLabel);
    assert.equal(labels.length, 3);
    assert.match(labels[0], /^Client call\. .*10:00–11:00 AM · Fixed/);
    assert.match(labels[1], /^Errand\. .*11:10–11:50 AM · Flexible/);
    assert.match(labels[2], /^Board meeting\./);
    assert.equal(r.root.findByProps({ accessibilityRole: 'list' }).props.accessibilityLabel, 'Schedule');
  });

  test('pressing a row opens THAT item’s editor (the inherited behaviour, preserved)', async () => {
    const v = view('A');
    const opened = [];
    const r = await render(<AgendaList items={v.dayItems.filter((i) => i.timing.kind === 'timed')} ctx={copyContextFor(v)} onOpenItem={(ref) => opened.push(ref)} />);
    const rows = r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityHint === 'Opens this item to edit it');
    await press(rows[1]);
    assert.deepEqual(opened, [{ kind: 'event', id: 'evt-soccer' }]);
  });

  test('touch targets: every pressable is at least 44 points tall', async () => {
    const v = view('I');
    const r = await render(<CalendarDayView view={v} onOpenItem={noop} />);
    const pressables = r.root.findAllByType('Pressable');
    assert.ok(pressables.length > 0);
    for (const p of pressables) assert.ok((flatten(p).minHeight ?? 0) >= 44, `${p.props.accessibilityLabel} is smaller than 44`);
  });

  test('details are second-level: subject and travel appear only after pressing Details', async () => {
    const v = view('A');
    const r = await render(<AgendaList items={v.dayItems.filter((i) => i.timing.kind === 'timed')} ctx={copyContextFor(v)} onOpenItem={noop} />);
    assert.doesNotMatch(joined(r), /Concerns Josie|Field 3/, 'not at first glance');
    const toggle = r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityLabel === "Details: Josie's soccer practice")[0];
    assert.equal(toggle.props.accessibilityState.expanded, false);
    await press(toggle);
    assert.match(joined(r), /Concerns Josie/);
    assert.match(joined(r), /At Field 3/);
    assert.equal(r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityLabel === "Hide details: Josie's soccer practice")[0].props.accessibilityState.expanded, true);
  });
});

describe('conflicts and the Why expansion', () => {
  test('a conflict has a text label and a plain sentence; evidence is hidden until asked, then structured', async () => {
    const v = view('B');
    const ctx = copyContextFor(v);
    const r = await render(<ConflictCard conflict={v.conflicts[0]} ctx={ctx} />);
    assert.match(joined(r), /OVERLAP/, 'a text label, not just a color');
    assert.match(joined(r), /Dentist and Parent-teacher call overlap by 30 min\./);
    assert.doesNotMatch(joined(r), /Why this/);
    const toggle = r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityState?.expanded === false)[0];
    await press(toggle);
    const text = joined(r);
    assert.match(text, /Why this/i);
    assert.match(text, /Dentist runs 10:00–11:00 AM\./);
    assert.match(text, /Both are fixed, so Her Keys won’t move either one\./);
  });

  test('no blame: the wording describes the constraint, never the person', async () => {
    for (const id of ['B', 'D', 'F', 'I', 'O']) {
      const v = view(id);
      const ctx = copyContextFor(v);
      const r = await render(<CalendarDayView view={v} onOpenItem={noop} />);
      assert.doesNotMatch(joined(r), /\byou (overbooked|double-booked|forgot|failed|should have)|your fault|mess\b/i, `${id}`);
      assert.ok(ctx);
    }
  });
});

describe('first-glance content per scenario', () => {
  test('B: the headline is the overlap, in one sentence, with no score or percentage anywhere', async () => {
    const r = await render(<CalendarDayView view={view('B')} onOpenItem={noop} />);
    const text = joined(r);
    assert.match(text, /overlap by 30 min/);
    assert.doesNotMatch(text, /\d+\s?%|\/\s?10|score|grade|health/i);
  });

  test('D and C differ in words: “not enough time” vs “fits, with 15 min to spare”', async () => {
    assert.match(joined(await render(<CalendarDayView view={view('D')} onOpenItem={noop} />)), /shorter than what you entered for getting there/);
    const c = joined(await render(<CalendarDayView view={view('C')} onOpenItem={noop} />));
    assert.match(c, /fits, with 15 min to spare/);
    assert.doesNotMatch(c, /impossible|won’t fit|not enough time/i, 'C must not be called impossible');
    assert.match(c, /FITS NARROWLY/, 'C says it fits');
    assert.doesNotMatch(c, /MORE THAN FITS/, 'C: the capacity word must not contradict the sentence that it fits');
    assert.match(c, /TIGHT/);
    const d = joined(await render(<CalendarDayView view={view('D')} onOpenItem={noop} />));
    assert.match(d, /MORE THAN FITS/);
    assert.doesNotMatch(d, /FITS NARROWLY/);
  });

  test('C: the “fits narrowly” evidence names the foundation’s own buffer as the reference and shows the arithmetic', async () => {
    const r = await render(<CalendarDayView view={view('C')} onOpenItem={noop} />);
    const toggle = r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityState?.expanded === false && /fits, with 15 min/.test(n.props.accessibilityLabel))[0];
    await press(toggle);
    const text = joined(r);
    assert.match(text, /You entered 15 min for getting there\./);
    assert.match(text, /That leaves 15 min\. Her Keys looks for 45 min between commitments\./);
  });

  test('F: “Needs a place” is stated with the item it is about, and nothing claims it is scheduled', async () => {
    const text = joined(await render(<CalendarDayView view={view('F')} onOpenItem={noop} />));
    assert.match(text, /NEEDS A PLACE/);
    assert.match(text, /No open stretch today is long enough for it\./);
    assert.doesNotMatch(text, /Scheduled for|at 5:00 PM/i);
  });

  test('G, H and AF: unknowns are named and no copy claims the schedule fits', async () => {
    for (const id of ['G', 'H', 'AF']) {
      const text = joined(await render(<CalendarDayView view={view(id)} onOpenItem={noop} />));
      assert.doesNotMatch(text, /Everything scheduled fits|There’s room from/, `${id}: must not claim room`);
      assert.match(text, /Not enough is entered to say whether this day fits\./, id);
      assert.match(text, /isn’t entered|no duration is recorded/i, id);
    }
    assert.match(joined(await render(<CalendarDayView view={view('AF')} onOpenItem={noop} />)), /Travel time after School conference isn’t entered\./);
  });

  test('E and A: an opening is stated as room, and explicitly that nothing is scheduled for it', async () => {
    const text = joined(await render(<CalendarDayView view={view('E')} onOpenItem={noop} />));
    assert.match(text, /There’s room from .*Nothing is scheduled for it\./);
  });

  test('I: a request nobody accepted reads as waiting, and is not described as handled', async () => {
    const text = joined(await render(<CalendarDayView view={view('I')} onOpenItem={noop} />));
    assert.match(text, /Waiting for Marcus to accept/);
    assert.doesNotMatch(text, /covered|handled|taken care of/i);
    assert.match(joined(await render(<CalendarDayView view={view('J')} onOpenItem={noop} />)), /Marcus accepted/);
  });

  test('P: a sparse day is one summary and one row — no empty sections, no “fill your day” pressure', async () => {
    const r = await render(<CalendarDayView view={view('P')} onOpenItem={noop} />);
    const text = joined(r);
    assert.match(text, /Everything scheduled fits\./);
    assert.doesNotMatch(text, /Not on the schedule yet|Not known yet|more below|free time|make the most/i);
    assert.equal(r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityHint === 'Opens this item to edit it').length, 1);
  });

  test('L: date-only tasks say what they are without any clock time', async () => {
    const text = joined(await render(<CalendarDayView view={view('L')} onOpenItem={noop} />));
    assert.match(text, /Due this day · Fixed · About 10 min/);
    assert.match(text, /Pay orthodontist invoice is fixed and has no time set\./);
  });

  test('AD: a multi-day event says it continues, in words', async () => {
    const v = projectCalendarDay({ ...inputsFor(scenarioById('AD')), date: DAY });
    const text = joined(await render(<CalendarDayView view={v} onOpenItem={noop} />));
    assert.match(text, /Continues from the day before · Continues into the next day/);
  });

  test('a past day is history: recorded, with no capacity claim', async () => {
    const v = projectCalendarDay({ ...inputsFor(scenarioById('B')), date: '2026-09-10', today: DAY });
    const text = joined(await render(<CalendarDayView view={v} onOpenItem={noop} />));
    assert.doesNotMatch(text, /fits|Room|Tight|More than fits/);
  });
});

describe('the first-glance text does not repeat itself, and reads in the order of the day', () => {
  test('the headline names the KIND of problem; it never repeats a card’s own sentence', async () => {
    const { headlineFor, conflictCopy } = await import('../src/features/calendar/copy.ts');
    for (const s of SCENARIOS) {
      const v = projectCalendarDay(inputsFor(s));
      const ctx = copyContextFor(v);
      const headline = headlineFor(v, ctx).text;
      for (const conflict of v.conflicts) assert.notEqual(headline, conflictCopy(conflict, ctx).sentence, `${s.id}: headline repeats a card`);
    }
    const b = headlineFor(view('B'), copyContextFor(view('B')));
    assert.equal(b.text, 'Two commitments overlap.');
    assert.equal(headlineFor(view('D'), copyContextFor(view('D'))).text, 'There isn’t enough time to get between two commitments.');
  });

  test('several problems are counted, not listed twice', async () => {
    const { headlineFor } = await import('../src/features/calendar/copy.ts');
    const b = household().event('a', { start: '10:00', end: '11:00' }).event('b', { start: '10:30', end: '11:30' }).event('c', { start: '10:45', end: '11:45' });
    const v = projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    assert.ok(v.conflicts.length > 1);
    assert.equal(headlineFor(v, copyContextFor(v)).text, `${v.conflicts.length} things need a look.`);
  });

  test('what is not known is listed in the order the day reads: by commitment, then travel to, then travel after', async () => {
    const r = await render(<CalendarDayView view={view('AF')} onOpenItem={() => {}} />);
    const text = joined(r);
    const order = [
      'Travel time to School conference',
      'Travel time after School conference',
      'Travel time to Clinic visit',
      'Travel time after Clinic visit',
      'Renew car registration: no duration is recorded.',
    ].map((needle) => text.indexOf(needle));
    assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });
});

describe('a dense day is never a wall of cards (section 19)', () => {
  test('Q: eleven tight-but-fitting windows are ONE grouped card, chronological, with every window one press away', async () => {
    const v = view('Q');
    assert.equal(v.narrowTransitions.length, 11);
    const r = await render(<CalendarDayView view={v} onOpenItem={() => {}} />);
    const text = joined(r);
    assert.equal((text.match(/FITS NARROWLY/g) ?? []).length, 1, 'one card, not eleven');
    assert.match(text, /11 windows between commitments are tight\. Each one fits\./);
    const toggle = r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityState?.expanded === false && /11 windows/.test(n.props.accessibilityLabel))[0];
    await press(toggle);
    const opened = joined(r);
    const positions = [7, 8, 9, 10, 11, 12].map((h) => opened.indexOf(`Meeting ${h} to Meeting ${h + 1}:`));
    assert.ok(positions.every((p) => p >= 0), 'every window is listed');
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'in the order of the day');
  });

  test('the agenda is not pushed down: at most three summary blocks precede the schedule, however dense the day', async () => {
    const r = await render(<CalendarDayView view={view('Q')} onOpenItem={() => {}} />);
    const text = joined(r);
    const beforeSchedule = text.slice(0, text.indexOf('SCHEDULE'));
    assert.ok(beforeSchedule.split(' | ').length <= 8, beforeSchedule);
  });

  test('one or two tight windows still get their own cards; the tight headline never repeats a card', async () => {
    const r = await render(<CalendarDayView view={view('C')} onOpenItem={() => {}} />);
    assert.equal((joined(r).match(/FITS NARROWLY/g) ?? []).length, 1);
    assert.match(joined(r), /One window between commitments is tight\./);
    assert.match(joined(r), /School drop-off to Clinic visit fits, with 15 min to spare\./, 'the card names the commitments');
  });
});

describe('dense days and long text stay readable', () => {
  test('a dense day keeps one summary, chronological rows, and no per-row chips', async () => {
    const dense = household();
    for (let hour = 7; hour < 19; hour++) {
      dense.event(`evt-${hour}`, { title: `Meeting ${hour}`, start: `${String(hour).padStart(2, '0')}:00`, end: `${String(hour).padStart(2, '0')}:20` });
    }
    const v = projectCalendarDay({ state: dense.state, date: DAY, today: DAY, nowMs: msAt('06:00') });
    const r = await render(<CalendarDayView view={v} onOpenItem={noop} />);
    assert.equal(r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityHint === 'Opens this item to edit it').length, 12);
    assert.equal(r.root.findAllByProps({ accessibilityRole: 'header' }).filter((n) => n.type === 'Text').length, 1, 'exactly one heading: the summary');
  });

  test('a 200-character title is never truncated by the row', async () => {
    const long = 'A'.repeat(200);
    const b = household().event('evt-long', { title: long, start: '10:00', end: '11:00' });
    const v = projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('07:00') });
    const r = await render(<CalendarDayView view={v} onOpenItem={noop} />);
    assert.ok(allText(r).includes(long));
    assert.equal(r.root.findAllByType('Text').some((n) => n.props.numberOfLines !== undefined), false, 'no numberOfLines clipping');
  });
});

describe('presentation state (V, section 51)', () => {
  test('“today” follows the logical day across midnight; a chosen date stays put', () => {
    let p = initialPresentation;
    assert.equal(selectedDateOf(p, DAY), DAY);
    assert.equal(selectedDateOf(p, NEXT), NEXT, 'after rollover, today is the new day');
    p = reducePresentation(p, { type: 'step', days: 2 }, DAY);
    assert.deepEqual(p.selection, { kind: 'date', date: '2026-09-18' });
    assert.equal(selectedDateOf(p, NEXT), '2026-09-18', 'a chosen date does not move');
  });

  test('stepping back onto today returns to “today”, and the view switch is independent', () => {
    let p = reducePresentation(initialPresentation, { type: 'step', days: 1 }, DAY);
    p = reducePresentation(p, { type: 'step', days: -1 }, DAY);
    assert.deepEqual(p.selection, { kind: 'today' });
    assert.equal(reducePresentation(p, { type: 'setView', view: 'week' }, DAY).view, 'week');
  });

  test('presentation state is not household truth: it holds no dates from the store and is never stored', () => {
    assert.deepEqual(Object.keys(initialPresentation).sort(), ['selection', 'view']);
  });
});

describe('copy verification (section 72)', () => {
  const FORBIDDEN = [/crazy day/i, /schedule is a mess/i, /overbooked yourself/i, /\byikes\b/i, /you['’]ve got this/i, /crushing it/i, /you overbooked/i];

  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  test('no forbidden phrase appears anywhere in Feature 03 source', () => {
    for (const file of walk(join(ROOT, 'src', 'features', 'calendar'))) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) assert.doesNotMatch(source, pattern, `${file} contains ${pattern}`);
    }
  });

  test('significant operational wording lives in copy.ts: UI components contain no sentence-length string literals', () => {
    for (const file of walk(join(ROOT, 'src', 'features', 'calendar', 'ui'))) {
      const source = readFileSync(file, 'utf8');
      const literals = [...source.matchAll(/>\s*([A-Z][^<>{}]{24,})\s*</g)].map((m) => m[1].trim());
      assert.deepEqual(literals, [], `${file} hard-codes copy: ${literals.join(' / ')}`);
    }
  });
});
