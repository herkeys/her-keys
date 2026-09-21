/**
 * Feature 03 — state and time hardening (contract sections 35-37, 47-50; scenarios S, T, U, X, Y, Z).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { loadTierForDay } from '../src/domain/loadTier.ts';
import { projectCalendarDay } from '../src/features/calendar/model/projectCalendar.ts';
import { copyContextFor, itemLine } from '../src/features/calendar/copy.ts';
import { dayFrameFor } from '../src/features/calendar/model/timeFrame.ts';
import { CalendarDayView } from '../src/features/calendar/ui/CalendarDayView.tsx';
import { CalendarGate } from '../src/features/calendar/ui/CalendarGate.tsx';
import { DAY, SCENARIOS, household, inputsFor, msAt } from './support/calendarScenarios.mjs';
import { DAY as FIXTURE_DAY, demoState, onboardedState } from './support/fixtures.mjs';
import { render } from './support/render.tsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const textOf = (children) => (Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children));
const joined = (r) => r.root.findAllByType('Text').map((n) => textOf(n.props.children)).join(' | ');
const noop = () => {};

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : /\.(ts|tsx)$/.test(name) ? [join(dir, name)] : []));

describe('Y / Z — the gate: loading is not empty, recovery is neither, and nothing reasons over unrecovered state', () => {
  const state = household().event('evt-a', { start: '10:00', end: '11:00' }).state;
  const snapshot = (overrides) => ({ status: 'ready', state, today: DAY, recovery: null, persistenceDegraded: false, ...overrides });
  const gate = async (snap) => {
    const calls = [];
    const r = await render(<CalendarGate snapshot={snap} ready={(s, today, degraded) => { calls.push({ s, today, degraded }); return null; }} />);
    return { calls, text: joined(r) };
  };

  test('while hydrating: says it is loading, asserts nothing, and never reaches the reasoning code', async () => {
    const { calls, text } = await gate(snapshot({ status: 'hydrating', state: null, today: null }));
    assert.deepEqual(calls, []);
    assert.match(text, /Reading your calendar/);
    assert.doesNotMatch(text, /Nothing scheduled|Everything scheduled fits|overlap|room/i);
  });

  test('after a recovery: explains itself and never reaches the reasoning code, even though a substituted state exists', async () => {
    const { calls, text } = await gate(snapshot({ status: 'recovery', recovery: { reason: 'invalid_json', quarantined: true } }));
    assert.deepEqual(calls, [], 'the substituted state must not be assessed');
    assert.match(text, /being restored/);
    assert.doesNotMatch(text, /Nothing scheduled|fits|overlap|room|tight/i);
  });

  test('a loaded household is handed to the reasoning code exactly once, with its logical day', async () => {
    const { calls } = await gate(snapshot({ persistenceDegraded: true }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].s, state);
    assert.equal(calls[0].today, DAY);
    assert.equal(calls[0].degraded, true);
  });

  test('only Calendar’s ready path derives anything: the projection is called nowhere else', () => {
    const screen = readFileSync(join(ROOT, 'src', 'features', 'calendar', 'CalendarScreen.tsx'), 'utf8');
    const outside = screen.split('function ReadyCalendar')[0];
    assert.doesNotMatch(outside, /projectCalendar(Day|Week)\(/, 'no projection before the gate has passed');
  });

  test('no infrastructure detail reaches Calendar: no cursor, sequence, queue or sync badge', () => {
    const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const file of walk(join(ROOT, 'src', 'features', 'calendar'))) {
      assert.doesNotMatch(code(readFileSync(file, 'utf8')), /syncCursor|cursor|queueLength|pendingCount|writeSeq|SyncNotice|syncPhase|backlog/i, file);
    }
  });
});

describe('X — demo isolation', () => {
  test('a demo household projects only its own rows, and a real household beside it is unaffected', () => {
    const demo = onboardedState(demoState(FIXTURE_DAY), undefined);
    const real = household().event('evt-real', { title: 'Real appointment', start: '10:00', end: '11:00' }).state;
    const input = (state) => ({ state, date: FIXTURE_DAY, today: FIXTURE_DAY, nowMs: msAt('07:00') });
    const demoBefore = JSON.stringify(projectCalendarDay(input(demo)).dayItems);
    const realView = projectCalendarDay(input(real));
    const demoAfter = JSON.stringify(projectCalendarDay(input(demo)).dayItems);

    assert.equal(projectCalendarDay(input(demo)).householdOrigin, 'demo');
    assert.equal(realView.householdOrigin, 'real');
    assert.equal(demoBefore, demoAfter, 'projecting another household changed nothing');
    assert.deepEqual(realView.dayItems.map((i) => i.title), ['Real appointment'], 'no demo row appears in a real household');
    assert.ok(projectCalendarDay(input(demo)).dayItems.length > 0, 'the demo household has a real day');
    assert.equal(JSON.stringify(projectCalendarDay(input(demo)).dayItems).includes('Real appointment'), false);
  });

  test('the seeded demo day agrees with Today’s own verdict', () => {
    const demo = onboardedState(demoState(FIXTURE_DAY), undefined);
    const view = projectCalendarDay({ state: demo, date: FIXTURE_DAY, today: FIXTURE_DAY, nowMs: msAt('10:00') });
    assert.equal(view.capacityState.foundationTier, loadTierForDay(demo, FIXTURE_DAY));
  });

  test('Calendar has no path to demo data: it imports no seed, no data mode and no demo constant', () => {
    for (const file of walk(join(ROOT, 'src', 'features', 'calendar'))) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /demoHousehold|materializeDemoState|dataMode|resolveDataMode|EXPO_PUBLIC/, file);
    }
  });

  test('a demo household says so, in words', () => {
    const source = readFileSync(join(ROOT, 'src', 'features', 'calendar', 'CalendarScreen.tsx'), 'utf8');
    assert.match(source, /state\.origin === 'demo'/);
  });
});

describe('S — the household timezone decides every label', () => {
  test('the same instant reads as different clock times in different household zones', async () => {
    const at = async (tz) => {
      const b = household({ tz }).event('evt-x', { title: 'Call', start: '00:00', end: '01:00' });
      const state = b.with((s) => ({ ...s, events: s.events.map((e) => ({ ...e, startsAt: '2026-09-17T00:00:00.000Z', endsAt: '2026-09-17T01:00:00.000Z' })) })).state;
      const v = projectCalendarDay({ state, date: '2026-09-16', today: '2026-09-16', nowMs: Date.UTC(2026, 8, 16, 11) });
      return joined(await render(<CalendarDayView view={v} onOpenItem={noop} />));
    };
    assert.match(await at('America/New_York'), /8:00–9:00 PM/);
    assert.match(await at('America/Los_Angeles'), /5:00–6:00 PM/);
    assert.match(await at('Asia/Kolkata'), /(?!.*8:00–9:00 PM)/, 'a zone where the instant falls on the next day does not show it on this one');
  });
});

describe('T — spring forward, as displayed', () => {
  test('clock labels come from the instant in the household zone: 3:15 AM is 3:15 AM', async () => {
    const state = household().event('evt-b', { start: '03:15', end: '04:00', date: '2026-03-08' }).state;
    const v = projectCalendarDay({ state, date: '2026-03-08', today: '2026-03-08', nowMs: msAt('00:05', '2026-03-08') });
    assert.match(joined(await render(<CalendarDayView view={v} onOpenItem={noop} />)), /3:15–4:00 AM/);
    assert.equal(v.repeatedHour, null, 'the skipped hour is not a repeated one');
  });
});

describe('U — fall back, as displayed', () => {
  const FALL = '2026-11-01';
  const EDT = (hhmm) => Date.parse(`${FALL}T${hhmm}:00.000-04:00`);
  const EST = (hhmm) => Date.parse(`${FALL}T${hhmm}:00.000-05:00`);
  const stateWith = (rows) => {
    const b = household();
    for (const [id] of rows) b.event(id, { title: id, start: '00:00', end: '00:30', date: FALL });
    return b.with((s) => ({ ...s, events: s.events.map((e) => { const row = rows.find(([id]) => id === e.id); return { ...e, startsAt: new Date(row[1]).toISOString(), endsAt: new Date(row[2]).toISOString() }; }) })).state;
  };
  const viewOf = (rows) => projectCalendarDay({ state: stateWith(rows), date: FALL, today: FALL, nowMs: msAt('00:05', FALL) });

  test('the repeated hour is found: 01:00 EDT to 02:00 EST, and only on that day', () => {
    assert.deepEqual(dayFrameFor(FALL, 'America/New_York').repeatedHour, { startMs: Date.parse(`${FALL}T01:00:00.000-04:00`), endMs: Date.parse(`${FALL}T01:00:00.000-05:00`) + 60 * 60_000 });
    assert.equal(dayFrameFor('2026-11-02', 'America/New_York').repeatedHour, null);
    assert.equal(dayFrameFor('2026-03-08', 'America/New_York').repeatedHour, null);
    assert.equal(dayFrameFor('2026-09-16', 'America/New_York').repeatedHour, null);
  });

  test('an event across the repeated hour is not shown as “1:30–1:30 AM”: each end names its zone', async () => {
    const v = viewOf([['evt-span', EDT('01:30'), EST('01:30')]]);
    const line = itemLine(v.dayItems[0], copyContextFor(v));
    assert.match(line, /^1:30 AM EDT–1:30 AM EST · Fixed/);
    assert.match(joined(await render(<CalendarDayView view={v} onOpenItem={noop} />)), /1:30 AM EDT–1:30 AM EST/);
  });

  test('two events at the same wall-clock time say which time they are, and read in real order', async () => {
    const v = viewOf([
      ['evt-first', EDT('01:15'), EDT('01:45')],
      ['evt-second', EST('01:15'), EST('01:45')],
    ]);
    const ctx = copyContextFor(v);
    assert.match(itemLine(v.dayItems[0], ctx), /^1:15 AM EDT–1:45 AM EDT/);
    assert.match(itemLine(v.dayItems[1], ctx), /^1:15 AM EST–1:45 AM EST/);
    assert.deepEqual(v.dayItems.map((i) => i.ref.id), ['evt-first', 'evt-second']);
  });

  test('outside the repeated hour there is never a zone abbreviation, on any scenario', async () => {
    for (const s of SCENARIOS) {
      const v = projectCalendarDay(inputsFor(s));
      assert.doesNotMatch(joined(await render(<CalendarDayView view={v} onOpenItem={noop} />)), /\b(EDT|EST|PDT|PST)\b/, s.id);
    }
  });
});
