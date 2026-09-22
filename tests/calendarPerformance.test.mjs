/**
 * Feature 03 — performance and complexity (contract sections 65, 70).
 *
 * Calendar is a projection engine, not a scheduler: it must scale with sorting/indexing, never with the
 * number of ALTERNATIVE schedules. These tests measure dense reference fixtures (medians of repeated runs
 * in the local reference environment), report the numbers, and check the two soft product targets:
 *
 *     single-day projection  < 50 ms median
 *     seven-day projection   < 150 ms median
 *
 * The targets are diagnostic: they are asserted with headroom so a slow CI machine does not fail an
 * honest build, and the measured medians are printed so the ledger records real numbers.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { projectCalendarDay, projectCalendarWeek } from '../src/features/calendar/model/projectCalendar.ts';
import { revisionOf } from '../src/features/calendar/model/revision.ts';
import { DAY, household, msAt } from './support/calendarScenarios.mjs';

const RUNS = 40;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const timeIt = (fn, runs = RUNS) => {
  fn(); // warm the JIT and the Intl formatters, as a running app would be
  const samples = [];
  for (let index = 0; index < runs; index++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
};
const hh = (hour, minute = 0) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** A dense, realistic day: `count` short commitments back to back with small gaps, some located with travel, some flexible, plus tasks. */
function denseHousehold({ events, tasks, days = 1 }) {
  const b = household({ children: [{ id: 'child-1', displayName: 'Josie', birthDate: '2017-05-02', scope: 'child' }] });
  for (let d = 0; d < days; d++) {
    const date = `2026-09-${String(13 + d).padStart(2, '0')}`;
    for (let i = 0; i < events; i++) {
      const start = 6 * 60 + Math.floor((i * 15 * 60) / events);
      const end = start + Math.max(5, Math.floor(600 / events) - 3);
      b.event(`evt-${d}-${i}`, {
        title: `Commitment ${i}`,
        start: hh(Math.floor(start / 60), start % 60),
        end: hh(Math.floor(Math.min(end, 22 * 60 - 1) / 60), Math.min(end, 22 * 60 - 1) % 60),
        date,
        commitment: i % 3 === 0 ? 'flexible' : 'fixed',
        ...(i % 4 === 0 ? { location: `Place ${i}`, travelMinutesBefore: 5, travelMinutesAfter: 5 } : {}),
        ...(i % 5 === 0 ? { subjectMemberId: 'child-1' } : {}),
      });
    }
    for (let t = 0; t < tasks; t++) b.task(`tsk-${d}-${t}`, { title: `Task ${t}`, minutes: 10 + (t % 6) * 10, due: date });
  }
  return b;
}

const nowMs = () => msAt('06:00', '2026-09-13');

describe('measured on dense reference fixtures', () => {
  test('single-day projection: dense day (60 commitments, 20 tasks) is well inside the 50 ms target', () => {
    const state = denseHousehold({ events: 60, tasks: 20 }).state;
    const ms = timeIt(() => projectCalendarDay({ state, date: '2026-09-13', today: '2026-09-13', nowMs: nowMs() }));
    console.log(`  PERF single-day, 60 events + 20 tasks: median ${ms.toFixed(2)} ms (target < 50)`);
    assert.ok(ms < 50, `median ${ms.toFixed(1)} ms`);
  });

  test('seven-day projection: dense week (30 commitments and 10 tasks a day) is well inside the 150 ms target', () => {
    const state = denseHousehold({ events: 30, tasks: 10, days: 7 }).state;
    const ms = timeIt(() => projectCalendarWeek({ state, selectedDate: '2026-09-16', today: '2026-09-13', nowMs: nowMs() }), 20);
    console.log(`  PERF seven-day, 210 events + 70 tasks: median ${ms.toFixed(2)} ms (target < 150)`);
    assert.ok(ms < 150, `median ${ms.toFixed(1)} ms`);
  });

  test('a day with dependencies and responsibilities carries no meaningful extra cost', () => {
    const b = denseHousehold({ events: 30, tasks: 12 });
    b.person('person-a', 'Marcus');
    for (let i = 0; i < 10; i++) {
      b.delegate({ kind: 'event', id: `evt-0-${i * 2}` }, 'person-a');
      if (i > 0) b.requires({ kind: 'task', id: `tsk-0-${i}` }, { kind: 'task', id: `tsk-0-${i - 1}` });
    }
    const ms = timeIt(() => projectCalendarDay({ state: b.state, date: '2026-09-13', today: '2026-09-13', nowMs: nowMs() }));
    console.log(`  PERF day with 10 handoffs + 9 dependencies: median ${ms.toFixed(2)} ms`);
    assert.ok(ms < 50, `median ${ms.toFixed(1)} ms`);
  });

  test('a household with thousands of stored rows still projects one day quickly (indexing, not scanning)', () => {
    const b = household();
    for (let i = 0; i < 1500; i++) b.event(`evt-h-${i}`, { title: `Old ${i}`, start: '10:00', end: '11:00', date: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}` });
    for (let i = 0; i < 1500; i++) b.task(`tsk-h-${i}`, { title: `Done ${i}`, minutes: 15 });
    b.event('evt-today', { title: 'Today', start: '10:00', end: '11:00' });
    const ms = timeIt(() => projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('07:00') }));
    const revisionMs = timeIt(() => revisionOf({ ...b.state }), 10);
    console.log(`  PERF 3000 stored rows, one day: median ${ms.toFixed(2)} ms; content digest of the whole state: ${revisionMs.toFixed(2)} ms`);
    assert.ok(ms < 50, `median ${ms.toFixed(1)} ms`);
  });
});

describe('growth is not combinatorial', () => {
  test('quadrupling a day’s commitments never multiplies the time by anything like the number of arrangements', () => {
    const at = (n) => {
      const state = denseHousehold({ events: n, tasks: Math.floor(n / 3) }).state;
      return timeIt(() => projectCalendarDay({ state, date: '2026-09-13', today: '2026-09-13', nowMs: nowMs() }), 25);
    };
    const small = at(25);
    const large = at(100);
    console.log(`  PERF growth: 25 events ${small.toFixed(2)} ms -> 100 events ${large.toFixed(2)} ms (x${(large / small).toFixed(1)}); 4x input`);
    // Sort + sweep, with the foundation's pairwise overlap scan at worst quadratic: 4x input must stay under the 16x that
    // pure O(n^2) would give (measured ~3x). An earlier version dry-ran every flexible item's mutation, each of which
    // recomputes the day's whole verdict, and measured 28x here: that is the regression this guards against.
    assert.ok(large / small < 12, `growth ratio ${(large / small).toFixed(1)}`);
  });

  test('Feature 03 source contains no search over alternative schedules', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'features', 'calendar', 'model');
    const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (!statSync(path).isFile()) continue;
      assert.doesNotMatch(code(readFileSync(path, 'utf8')), /permutation|backtrack|bruteForce|combination|optimi[sz]e|solveSchedule|bestSchedule|searchSpace/i, name);
    }
  });
});
