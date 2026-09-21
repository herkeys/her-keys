/**
 * Feature 03 — week capacity overview (contract sections 16B, 60; scenario R).
 *
 * The week is compared CATEGORICALLY: the same foundation category the day view uses, conflict kinds,
 * how much flexible work has no time yet, and whether facts were missing. Nothing is scored, ranked,
 * averaged or colored as a heat map, and days stay in calendar order.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { projectCalendarDay, projectCalendarWeek } from '../src/features/calendar/model/projectCalendar.ts';
import { weekEvidenceJson } from '../src/features/calendar/model/structural.ts';
import { reducePresentation } from '../src/features/calendar/model/presentation.ts';
import { weekOf } from '../src/features/calendar/model/timeFrame.ts';
import { WeekOverview } from '../src/features/calendar/ui/WeekOverview.tsx';
import { household, msAt, scenarioById } from './support/calendarScenarios.mjs';
import { render } from './support/render.tsx';

const EVIDENCE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'calendar', 'scenarios', 'R.week.json');
const UPDATE = process.env.UPDATE_CALENDAR_EVIDENCE === '1';
const lf = (text) => text.replace(/\r\n/g, '\n');
const flatten = (node) => StyleSheet.flatten(node.props.style) ?? {};
const textOf = (children) => (Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children));
const joined = (r) => r.root.findAllByType('Text').map((n) => textOf(n.props.children)).join(' | ');

const s = scenarioById('R');
const built = () => s.build();
const nowMs = () => msAt(s.now, s.today);
const weekOfR = () => projectCalendarWeek({ state: built().state, selectedDate: s.date, today: s.today, nowMs: nowMs() });
const day = (week, date) => week.days.find((d) => d.date === date);

describe('R — the week', () => {
  test('seven days, Sunday first, in calendar order', () => {
    const week = weekOfR();
    assert.deepEqual(week.days.map((d) => d.date), ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']);
    assert.deepEqual(weekOf('2026-09-19'), week.days.map((d) => d.date), 'any day of the week resolves to the same seven');
    assert.equal(day(week, '2026-09-16').isSelected, true);
    assert.equal(week.days.filter((d) => d.isSelected).length, 1);
  });

  test('it holds an open day, a tight day, a conflict day and an insufficient-information day', () => {
    const week = weekOfR();
    assert.equal(day(week, '2026-09-13').category, 'room');
    assert.equal(day(week, '2026-09-14').category, 'tight');
    assert.deepEqual(day(week, '2026-09-15').conflictTypes, ['FIXED_OVERLAP']);
    assert.equal(day(week, '2026-09-15').category, 'more_than_fits');
    assert.equal(day(week, '2026-09-16').category, 'not_known');
    assert.equal(day(week, '2026-09-16').evidenceStatus, 'insufficient');
    assert.equal(day(week, '2026-09-17').category, 'room');
    assert.equal(day(week, '2026-09-17').itemCount, 0);
  });

  test('flexible work that has no place shows up on its day', () => {
    const friday = day(weekOfR(), '2026-09-18');
    assert.equal(friday.unplacedCount, 1);
    assert.ok(friday.conflictTypes.includes('PLACEMENT_FAILURE'));
  });

  test('the week uses exactly the category the day view uses — same foundation truth, no second opinion', () => {
    const week = weekOfR();
    const state = built().state;
    for (const d of week.days) {
      const view = projectCalendarDay({ state, date: d.date, today: s.today, nowMs: nowMs() });
      assert.equal(d.category, view.capacityState.category, d.date);
      assert.equal(d.tier, view.capacityState.tier, d.date);
      assert.equal(d.conflictCount, view.conflicts.length, d.date);
    }
  });

  test('structural evidence matches the committed file', () => {
    const json = weekEvidenceJson(weekOfR());
    if (UPDATE) {
      mkdirSync(dirname(EVIDENCE), { recursive: true });
      writeFileSync(EVIDENCE, json);
    }
    assert.ok(existsSync(EVIDENCE), 'missing R.week.json');
    assert.equal(json, lf(readFileSync(EVIDENCE, 'utf8')));
  });
});

describe('the week is categorical: no scores, no ranking, no composite', () => {
  test('a day summary carries only words, kinds and counts', () => {
    for (const d of weekOfR().days) {
      assert.deepEqual(Object.keys(d).sort(), ['category', 'conflictCount', 'conflictTypes', 'date', 'dayMode', 'evidenceStatus', 'isSelected', 'itemCount', 'tier', 'unplacedCount']);
      assert.ok(d.tier === null || ['open', 'tight', 'overloaded'].includes(d.tier));
      assert.ok(d.category === null || ['room', 'tight', 'more_than_fits', 'not_known'].includes(d.category));
    }
  });

  test('days are never reordered by how they fare: adding a conflict to a day leaves the order unchanged', () => {
    const before = weekOfR().days.map((d) => d.date);
    const worse = household()
      .event('a', { start: '10:00', end: '11:00', date: '2026-09-14' })
      .event('b', { start: '10:30', end: '11:30', date: '2026-09-14' }).state;
    const after = projectCalendarWeek({ state: worse, selectedDate: s.date, today: s.today, nowMs: nowMs() }).days.map((d) => d.date);
    assert.deepEqual(after, before);
    assert.deepEqual(after, [...after].sort(), 'always chronological');
  });

  test('no source file computes a composite, average, ranking or “best day”', () => {
    const source = ['projectCalendar.ts', 'types.ts'].map((f) => readFileSync(join(dirname(EVIDENCE), '..', '..', '..', '..', 'src', 'features', 'calendar', 'model', f), 'utf8')).join('\n');
    assert.doesNotMatch(source, /bestDay|worstDay|compositeScore|healthScore|rankDays|\.sort\(\s*\(\s*a\s*,\s*b\s*\)\s*=>\s*\S*\.(tier|category)/i);
  });

  test('paging moves a week at a time and lands on the same seven days from any day in them', () => {
    let p = { view: 'week', selection: { kind: 'date', date: '2026-09-16' } };
    p = reducePresentation(p, { type: 'step', days: 7 }, '2026-09-13');
    assert.deepEqual(p.selection, { kind: 'date', date: '2026-09-23' });
    assert.deepEqual(weekOf('2026-09-23')[0], '2026-09-20');
  });
});

describe('WeekOverview rendering', () => {
  const rows = (r) => r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityHint === 'Opens this day');

  test('every day is a labelled, selectable, 44-point row with its category in words', async () => {
    const week = weekOfR();
    const r = await render(<WeekOverview week={week} today={s.today} onSelectDay={() => {}} />);
    assert.equal(rows(r).length, 7);
    for (const row of rows(r)) assert.ok((flatten(row).minHeight ?? 0) >= 44);
    const text = joined(r);
    for (const word of ['Room', 'Tight', 'More than fits', 'Not enough known']) assert.ok(text.includes(word), word);
    assert.match(text, /Overlap/);
    assert.match(text, /Needs a place/);
    assert.match(text, /1 not on the schedule yet/);
    assert.match(text, /Nothing scheduled/);
  });

  test('accessibility: the selected day is announced, today is named, and the label carries the same facts', async () => {
    const r = await render(<WeekOverview week={weekOfR()} today={s.today} onSelectDay={() => {}} />);
    const wed = rows(r)[3];
    assert.equal(wed.props.accessibilityState.selected, true);
    assert.match(wed.props.accessibilityLabel, /^Wed 16: Not enough known/);
    assert.match(wed.props.accessibilityLabel, /currently open$/);
    assert.match(rows(r)[0].props.accessibilityLabel, /, today/);
    assert.equal(r.root.findByProps({ accessibilityRole: 'list' }).props.accessibilityLabel, 'Week');
  });

  test('pressing a day opens it', async () => {
    const opened = [];
    const r = await render(<WeekOverview week={weekOfR()} today={s.today} onSelectDay={(date) => opened.push(date)} />);
    await TestRenderer.act(async () => rows(r)[2].props.onPress());
    assert.deepEqual(opened, ['2026-09-15']);
  });

  test('nothing in the rows is a number that could be read as a score', async () => {
    const r = await render(<WeekOverview week={weekOfR()} today={s.today} onSelectDay={() => {}} />);
    const text = joined(r).replace(/\d+ not on the schedule yet/g, '').replace(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/g, '');
    const stray = text.replace(/\|/g, ' ').split(/\s+/).filter((w) => /^\d+%?$/.test(w));
    // only the calendar date numbers (13-19) may appear
    assert.deepEqual(stray.filter((w) => !['13', '14', '15', '16', '17', '18', '19'].includes(w)), []);
    assert.doesNotMatch(joined(r), /%|score|rank|best|worst|health|grade/i);
  });

  test('past days in the week are shown as earlier, with no capacity claim', async () => {
    const week = projectCalendarWeek({ state: built().state, selectedDate: '2026-09-16', today: '2026-09-17', nowMs: msAt('07:00', '2026-09-17') });
    const r = await render(<WeekOverview week={week} today="2026-09-17" onSelectDay={() => {}} />);
    assert.match(rows(r)[0].props.accessibilityLabel, /earlier/);
    assert.equal(week.days[0].category, null);
    assert.equal(week.days[0].evidenceStatus, 'not_applicable');
  });
});
