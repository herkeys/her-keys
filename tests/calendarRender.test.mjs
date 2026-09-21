/**
 * Feature 03 — RENDER EVIDENCE (contract section 73, where tooling supports it).
 *
 * For each scenario this records exactly what the Calendar screen SHOWS (every text node, in order) and what a
 * screen reader ANNOUNCES (every pressable's role, label and state), from the real component tree, and compares it
 * byte-for-byte with a committed file. It is not a pixel screenshot: no second Android emulator could be started in
 * this environment (memory) and the one running was in use by another session, so layout and color are NOT covered
 * here and are recorded as not captured in the ledger. What it does cover is complete and reproducible: wording,
 * order, marks, states and accessibility names, for every scenario.
 *
 * Regenerate after an intentional change:  UPDATE_CALENDAR_EVIDENCE=1 node --test tests/calendarRender.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { computePreview } from '../src/features/calendar/model/preview.ts';
import { projectCalendarDay, projectCalendarWeek } from '../src/features/calendar/model/projectCalendar.ts';
import { PreviewPanel } from '../src/features/calendar/ui/ActionPanels.tsx';
import { CalendarDayView } from '../src/features/calendar/ui/CalendarDayView.tsx';
import { WeekOverview } from '../src/features/calendar/ui/WeekOverview.tsx';
import { CalendarLoading, CalendarRecovery } from '../src/features/calendar/ui/CalendarStates.tsx';
import { DAY, SCENARIOS, household, inputsFor, msAt, scenarioById } from './support/calendarScenarios.mjs';
import { render } from './support/render.tsx';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'calendar', 'render');
const UPDATE = process.env.UPDATE_CALENDAR_EVIDENCE === '1';
const lf = (text) => text.replace(/\r\n/g, '\n');
const noop = () => {};
const textOf = (children) => (Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children));

/** What is shown, then what is announced. Deterministic: tree order, no styles, no ids. */
function describe_(r) {
  const shown = r.root.findAllByType('Text').map((n) => textOf(n.props.children)).filter((t) => t.length > 0);
  const announced = r.root
    .findAll((n) => n.type === 'Pressable')
    .map((n) => {
      const state = n.props.accessibilityState ? ` ${JSON.stringify(n.props.accessibilityState)}` : '';
      return `${n.props.accessibilityRole}: ${n.props.accessibilityLabel}${state}`;
    });
  return `# SHOWN\n${shown.join('\n')}\n\n# ANNOUNCED\n${announced.join('\n')}\n`;
}

function check(name, text) {
  const file = join(DIR, `${name}.txt`);
  if (UPDATE) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, text);
  }
  assert.ok(existsSync(file), `missing render evidence ${name}.txt — generate it, review it, then commit it`);
  assert.equal(text, lf(readFileSync(file, 'utf8')));
}

const actions = { onPreview: noop, onKeep: noop, onProtect: noop, undo: null };

describe('render evidence: what each scenario shows and announces', () => {
  for (const s of SCENARIOS.filter((x) => x.today === x.date)) {
    test(`day ${s.id} (${s.title})`, async () => {
      const r = await render(<CalendarDayView view={projectCalendarDay(inputsFor(s))} onOpenItem={noop} actions={actions} />);
      check(`day-${s.id}`, describe_(r));
    });
  }

  test('day R (the insufficient-information Wednesday of the week scenario)', async () => {
    const r = await render(<CalendarDayView view={projectCalendarDay(inputsFor(scenarioById('R')))} onOpenItem={noop} actions={actions} />);
    check('day-R', describe_(r));
  });

  test('a dense day', async () => {
    const b = household();
    for (let hour = 7; hour < 19; hour++) b.event(`evt-${hour}`, { title: `Meeting ${hour}`, start: `${String(hour).padStart(2, '0')}:00`, end: `${String(hour).padStart(2, '0')}:20`, commitment: hour % 3 === 0 ? 'flexible' : 'fixed' });
    const r = await render(<CalendarDayView view={projectCalendarDay({ state: b.state, date: DAY, today: DAY, nowMs: msAt('06:00') })} onOpenItem={noop} actions={actions} />);
    check('day-dense', describe_(r));
  });

  test('week R', async () => {
    const s = scenarioById('R');
    const week = projectCalendarWeek({ state: s.build().state, selectedDate: s.date, today: s.today, nowMs: msAt(s.now, s.today) });
    check('week-R', describe_(await render(<WeekOverview week={week} today={s.today} onSelectDay={noop} />)));
  });

  test('move preview (N) — current, and stale', async () => {
    const input = inputsFor(scenarioById('N'));
    const { preview } = computePreview({ state: input.state, today: input.today, nowMs: input.nowMs, date: input.date, intent: { kind: 'move_event', id: 'evt-b' } });
    check('preview-N-current', describe_(await render(<PreviewPanel preview={preview} validity="current" notice={null} busy={false} onAccept={noop} onCancel={noop} onPreviewAgain={noop} />)));
    check('preview-N-stale', describe_(await render(<PreviewPanel preview={preview} validity="stale" notice={null} busy={false} onAccept={noop} onCancel={noop} onPreviewAgain={noop} />)));
  });

  test('preview shortening (O)', async () => {
    const input = inputsFor(scenarioById('O'));
    const { preview } = computePreview({ state: input.state, today: input.today, nowMs: input.nowMs, date: input.date, intent: { kind: 'shorten_task', id: 'tsk-garage' } });
    check('preview-O-shorten', describe_(await render(<PreviewPanel preview={preview} validity="current" notice={null} busy={false} onAccept={noop} onCancel={noop} onPreviewAgain={noop} />)));
  });

  test('states: loading, recovery', async () => {
    check('state-loading', describe_(await render(<CalendarLoading />)));
    check('state-recovery', describe_(await render(<CalendarRecovery />)));
  });

  test('a past day is history', async () => {
    const s = scenarioById('B');
    const view = projectCalendarDay({ ...inputsFor(s), date: '2026-09-10', today: DAY });
    check('day-past', describe_(await render(<CalendarDayView view={view} onOpenItem={noop} actions={actions} />)));
  });
});
