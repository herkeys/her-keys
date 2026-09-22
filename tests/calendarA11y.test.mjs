/**
 * Feature 03 — accessibility and copy verification (contract sections 54, 55, 72).
 *
 * Checked as structure, not by eye: roles, labels, states, touch targets, order, headings, dynamic text and the
 * wording rules. Layout and native focus behaviour are verified in the running app (see the ledger); what can be
 * asserted about the component tree is asserted here across EVERY scenario.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { projectCalendarDay, projectCalendarWeek } from '../src/features/calendar/model/projectCalendar.ts';
import { computePreview } from '../src/features/calendar/model/preview.ts';
import { PreviewPanel } from '../src/features/calendar/ui/ActionPanels.tsx';
import { CalendarDayView } from '../src/features/calendar/ui/CalendarDayView.tsx';
import { DayNavigator, ViewSwitch } from '../src/features/calendar/ui/DayHeader.tsx';
import { WeekOverview } from '../src/features/calendar/ui/WeekOverview.tsx';
import { SCENARIOS, inputsFor, msAt, scenarioById } from './support/calendarScenarios.mjs';
import { render } from './support/render.tsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const flatten = (node) => StyleSheet.flatten(node.props.style) ?? {};
const textOf = (children) => (Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children));
const joined = (r) => r.root.findAllByType('Text').map((n) => textOf(n.props.children)).join(' | ');
const noop = () => {};
const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : /\.(ts|tsx)$/.test(name) ? [join(dir, name)] : []));
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const actions = { onPreview: noop, onKeep: noop, onProtect: noop, undo: null };

describe('every interactive element, in every scenario, is nameable and operable', () => {
  test('each pressable has a button role, a non-empty accessible label, and a touch target of at least 44 points', async () => {
    for (const s of SCENARIOS) {
      const v = projectCalendarDay(inputsFor(s));
      const r = await render(<CalendarDayView view={v} onOpenItem={noop} actions={actions} />);
      for (const p of r.root.findAllByType('Pressable')) {
        const where = `${s.id}: ${p.props.accessibilityLabel}`;
        assert.equal(p.props.accessibilityRole, 'button', where);
        assert.ok(typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel.trim().length > 0, `${s.id}: unlabeled pressable`);
        const style = flatten(p);
        assert.ok((style.minHeight ?? style.height ?? 0) >= 44, `${where} is smaller than 44 points`);
      }
    }
  });

  test('disclosure controls announce whether they are expanded', async () => {
    const r = await render(<CalendarDayView view={projectCalendarDay(inputsFor(scenarioById('D')))} onOpenItem={noop} actions={actions} />);
    const toggles = r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityState && 'expanded' in n.props.accessibilityState);
    assert.ok(toggles.length > 0);
    for (const t of toggles) assert.equal(typeof t.props.accessibilityState.expanded, 'boolean');
  });

  test('action names say what they do, in the imperative', async () => {
    const view = projectCalendarDay(inputsFor(scenarioById('N')));
    const r = await render(<CalendarDayView view={view} onOpenItem={noop} actions={actions} />);
    const labels = r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel);
    assert.ok(labels.includes('Preview the move'));
    assert.ok(labels.includes('Not today'));
    const input = inputsFor(scenarioById('N'));
    const preview = computePreview({ state: input.state, today: input.today, nowMs: input.nowMs, date: input.date, intent: { kind: 'move_event', id: 'evt-b' } }).preview;
    const panel = await render(<PreviewPanel preview={preview} validity="current" notice={null} busy={false} onAccept={noop} onCancel={noop} onPreviewAgain={noop} />);
    const panelLabels = panel.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel);
    assert.deepEqual(panelLabels.sort(), ['Cancel', 'Move to tomorrow']);
    assert.ok(panel.root.findAllByProps({ accessibilityLabel: 'What would change' }).length >= 1, 'the change description is a labelled group');
  });
});

describe('navigation controls', () => {
  const nav = (props) => render(<DayNavigator date="2026-09-16" today="2026-09-16" view="day" onStep={noop} onToday={noop} {...props} />);
  const labels = (r) => r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel);

  test('day view: previous and next day are named; “Today” appears only when she is not on today', async () => {
    assert.deepEqual(labels(await nav({})), ['Previous day', 'Next day']);
    assert.deepEqual(labels(await nav({ date: '2026-09-18' })), ['Previous day', 'Next day', 'Today']);
  });

  test('week view names the week, and steps by week', async () => {
    assert.deepEqual(labels(await nav({ view: 'week' })), ['Previous week', 'Next week']);
    assert.match(joined(await nav({ view: 'week' })), /September 13–19/);
  });

  test('the date is a heading, and today is said in words', async () => {
    const r = await nav({});
    assert.equal(r.root.findAllByProps({ accessibilityRole: 'header' }).filter((n) => n.type === 'Text').length, 1);
    assert.match(joined(r), /Wednesday, September 16/);
    assert.match(joined(r), /TODAY/);
  });

  test('the Day/Week switch is two buttons that report which is selected', async () => {
    const r = await render(<ViewSwitch view="week" onChange={noop} />);
    const buttons = r.root.findAllByType('Pressable');
    assert.deepEqual(buttons.map((b) => [b.props.accessibilityLabel, b.props.accessibilityState.selected]), [['Day', false], ['Week', true]]);
    assert.equal(r.root.findAll((n) => n.props.accessibilityLabel === 'Calendar view').length > 0, true);
  });
});

describe('order, headings and dynamic text', () => {
  test('reading order follows the sections she needs: summary, problems, schedule, not-yet-scheduled, unknowns', async () => {
    const v = projectCalendarDay(inputsFor(scenarioById('AF')));
    const text = joined(await render(<CalendarDayView view={v} onOpenItem={noop} />));
    const lower = text.toLowerCase();
    const order = ['Not enough is entered', 'Schedule |', 'Not on the schedule yet', 'Not known yet'].map((needle) => lower.indexOf(needle.toLowerCase()));
    assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'sections read in the intended order');
  });

  test('a day view has exactly one heading: the summary', async () => {
    for (const id of ['A', 'B', 'D', 'F', 'G', 'I', 'P']) {
      const r = await render(<CalendarDayView view={projectCalendarDay(inputsFor(scenarioById(id)))} onOpenItem={noop} />);
      assert.equal(r.root.findAllByProps({ accessibilityRole: 'header' }).filter((n) => n.type === 'Text').length, 1, id);
    }
  });

  test('text is never clipped or fixed-height: no numberOfLines and no fixed heights in Calendar’s components', async () => {
    for (const file of walk(join(ROOT, 'src', 'features', 'calendar', 'ui'))) {
      const source = code(readFileSync(file, 'utf8'));
      assert.doesNotMatch(source, /numberOfLines|ellipsizeMode|adjustsFontSizeToFit/, file);
      assert.doesNotMatch(source, /(?<![a-zA-Z])height:\s*\d/, `${file} sets a fixed height`);
    }
  });

  test('the week is readable without color: every row says its category in words', async () => {
    const w = projectCalendarWeek({ state: scenarioById('R').build().state, selectedDate: '2026-09-16', today: '2026-09-13', nowMs: msAt('07:00', '2026-09-13') });
    const r = await render(<WeekOverview week={w} today="2026-09-13" onSelectDay={noop} />);
    for (const row of r.root.findAll((n) => n.type === 'Pressable')) {
      assert.match(row.props.accessibilityLabel, /: (Room|Tight|More than fits|Not enough known|earlier)/);
    }
  });
});

describe('copy verification (section 72)', () => {
  const files = () => walk(join(ROOT, 'src', 'features', 'calendar')).filter((f) => !f.endsWith('EventForm.tsx'));
  const FORBIDDEN = [/crazy day/i, /schedule is a mess/i, /overbooked yourself/i, /\byikes\b/i, /you['’]ve got this/i, /crushing it/i, /\bnice work\b/i, /\bawesome\b/i, /\bhustle\b/i];
  const BLAME = [/\byou (should(n’t| not)? have|forgot|failed|neglected|overbooked|double-booked|messed|screwed)/i, /\byour (fault|mistake|failure)\b/i, /\bwhy did you\b/i, /\bnot enough discipline\b/i];

  test('no forbidden phrase and no user-blame language anywhere in Feature 03 (EventForm is inherited and untouched)', () => {
    for (const file of files()) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of [...FORBIDDEN, ...BLAME]) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
    }
  });

  test('every user-facing sentence is in copy.ts: components hold no sentence-length text, in JSX or in props', () => {
    for (const file of files().filter((f) => f.includes(`${join('calendar', 'ui')}`) || f.endsWith('CalendarScreen.tsx'))) {
      const source = code(readFileSync(file, 'utf8'));
      const jsxText = [...source.matchAll(/>\s*([A-Z][^<>{}]{24,})\s*</g)].map((m) => m[1].trim());
      const propText = [...source.matchAll(/(?:label|title|body|accessibilityLabel|accessibilityHint)=["']([^"'{}]{24,})["']/g)].map((m) => m[1]);
      assert.deepEqual([...jsxText, ...propText], [], `${file} hard-codes copy`);
    }
  });

  test('constraints are described, not character: the day’s words contain no judgement of the person', async () => {
    for (const s of SCENARIOS) {
      const r = await render(<CalendarDayView view={projectCalendarDay(inputsFor(s))} onOpenItem={noop} actions={actions} />);
      const text = joined(r);
      for (const pattern of [...FORBIDDEN, ...BLAME, /\b(lazy|behind|slacking|failing|overwhelmed|disaster|chaos)\b/i]) assert.doesNotMatch(text, pattern, `${s.id}: ${pattern}`);
    }
  });

  test('no exclamation marks anywhere in Calendar’s wording', () => {
    const source = code(readFileSync(join(ROOT, 'src', 'features', 'calendar', 'copy.ts'), 'utf8'));
    const strings = [...source.matchAll(/(['`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
    assert.deepEqual(strings.filter((s) => /!(?!=)/.test(s) && !/\$\{/.test(s.replace(/!==?/g, ''))), []);
  });
});
