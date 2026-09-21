/**
 * Feature 03 — action UI contract (contract sections 29, 30, 32, 33; scenarios N, O, AA, AG).
 *
 * Only actions the action map lists as available are ever rendered. A recommendation opens a PREVIEW; it
 * never applies anything. A stale preview cannot be accepted. There is no drag interaction.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { addEvent } from '../src/domain/events.ts';
import { ACCEPT_LABEL, copyContextFor, offersFor, previewLines } from '../src/features/calendar/copy.ts';
import { computePreview } from '../src/features/calendar/model/preview.ts';
import { projectCalendarDay } from '../src/features/calendar/model/projectCalendar.ts';
import { PreviewPanel, UndoNotice } from '../src/features/calendar/ui/ActionPanels.tsx';
import { CalendarDayView } from '../src/features/calendar/ui/CalendarDayView.tsx';
import { DAY, NEXT, inputsFor, instantAt, msAt, scenarioById } from './support/calendarScenarios.mjs';
import { render } from './support/render.tsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const textOf = (children) => (Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children));
const joined = (r) => r.root.findAllByType('Text').map((n) => textOf(n.props.children)).join(' | ');
const press = (node) => TestRenderer.act(async () => node.props.onPress());
const button = (r, label) => r.root.findAll((n) => n.type === 'Pressable' && n.props.accessibilityLabel === label)[0];

const view = (id, overrides) => projectCalendarDay(inputsFor(scenarioById(id), overrides));
const previewOf = (id, intent) => {
  const input = inputsFor(scenarioById(id));
  const outcome = computePreview({ state: input.state, today: input.today, nowMs: input.nowMs, date: input.date, intent });
  assert.equal(outcome.ok, true);
  return outcome.preview;
};
const actions = (overrides = {}) => ({ onPreview: () => {}, onKeep: () => {}, onProtect: () => {}, undo: null, ...overrides });

describe('recommendations are the foundation’s offers, needing her yes', () => {
  test('N: the one move the foundation offers is shown as a recommendation that needs approval', async () => {
    const r = await render(<CalendarDayView view={view('N')} onOpenItem={() => {}} actions={actions()} />);
    const text = joined(r);
    assert.match(text, /Moving Errand to tomorrow, at the same time, would open up the time around it today\./);
    assert.match(text, /NEEDS YOUR YES/);
    assert.ok(button(r, 'Preview the move'));
    assert.equal(offersFor(view('N'), copyContextFor(view('N'))).length, 1, 'exactly one offer');
  });

  test('pressing the primary action opens a preview; it never applies anything', async () => {
    const opened = [];
    const r = await render(<CalendarDayView view={view('N')} onOpenItem={() => {}} actions={actions({ onPreview: (intent) => opened.push(intent) })} />);
    await press(button(r, 'Preview the move'));
    assert.deepEqual(opened, [{ kind: 'move_event', id: 'evt-b' }]);
  });

  test('“Not today” records her decision to keep the plan', async () => {
    const kept = [];
    const r = await render(<CalendarDayView view={view('N')} onOpenItem={() => {}} actions={actions({ onKeep: (k) => kept.push(k) })} />);
    await press(button(r, 'Not today'));
    assert.deepEqual(kept, ['timing']);
  });

  test('O: capacity pressure offers shortening for the task the verdict names, with dropping as the alternative', async () => {
    const opened = [];
    const r = await render(<CalendarDayView view={view('O')} onOpenItem={() => {}} actions={actions({ onPreview: (i) => opened.push(i) })} />);
    assert.match(joined(r), /Shortening Deep clean the garage would bring today back within what fits\./);
    await press(button(r, 'Preview shortening it'));
    await press(button(r, 'Show another option'));
    assert.deepEqual(opened, [{ kind: 'shorten_task', id: 'tsk-garage' }, { kind: 'drop_task', id: 'tsk-garage' }]);
  });

  test('B (two fixed commitments): nothing is offered — no fake action', async () => {
    const r = await render(<CalendarDayView view={view('B')} onOpenItem={() => {}} actions={actions()} />);
    assert.doesNotMatch(joined(r), /NEEDS YOUR YES|What I recommend/i);
    assert.equal(button(r, 'Preview the move'), undefined);
  });

  test('another day: the same state offers nothing, because the foundation only acts on today (SAFE-UNAVAILABLE)', async () => {
    const v = view('N', { date: NEXT });
    const r = await render(<CalendarDayView view={v} onOpenItem={() => {}} actions={actions()} />);
    assert.doesNotMatch(joined(r), /NEEDS YOUR YES/);
    assert.deepEqual(offersFor(v, copyContextFor(v)), []);
  });

  test('read-only: without actions a day renders no recommendation and no Protect, whatever the foundation would offer', async () => {
    const r = await render(<CalendarDayView view={view('N')} onOpenItem={() => {}} />);
    assert.doesNotMatch(joined(r), /NEEDS YOUR YES|Protect this/);
  });
});

describe('PROTECT appears only inside Details, only for what the action map allows', () => {
  test('a flexible item offers Protect after opening Details; a fixed one does not', async () => {
    const protectedRefs = [];
    const r = await render(<CalendarDayView view={view('N')} onOpenItem={() => {}} actions={actions({ onProtect: (ref) => protectedRefs.push(ref) })} />);
    assert.doesNotMatch(joined(r), /Protect this/, 'not at first glance');
    const toggles = r.root.findAll((n) => n.type === 'Pressable' && /^Details: /.test(n.props.accessibilityLabel ?? ''));
    assert.equal(toggles.length, 1, 'only the flexible Errand has anything to protect');
    assert.equal(toggles[0].props.accessibilityLabel, 'Details: Errand');
    await press(toggles[0]);
    await press(button(r, 'Protect this'));
    assert.deepEqual(protectedRefs, [{ kind: 'event', id: 'evt-b' }]);
  });
});

describe('the preview panel', () => {
  test('it is marked as a preview, speaks in the conditional, and says what tomorrow would look like', async () => {
    const preview = previewOf('N', { kind: 'move_event', id: 'evt-b' });
    const r = await render(<PreviewPanel preview={preview} validity="current" notice={null} busy={false} onAccept={() => {}} onCancel={() => {}} onPreviewAgain={() => {}} />);
    const text = joined(r);
    assert.match(text, /Preview — nothing has changed yet\./);
    assert.match(text, /Errand would move to tomorrow at 11:10 AM\./);
    assert.match(text, /Today would go from tight to room\./);
    assert.match(text, /Nothing new would conflict tomorrow\./);
    assert.doesNotMatch(text, /moved|has been|is now/i, 'a hypothesis is never worded as a done thing');
    assert.ok(button(r, ACCEPT_LABEL.move_event));
    assert.ok(button(r, 'Cancel'));
  });

  test('a collision at the destination is shown BEFORE anything is applied', async () => {
    const input = inputsFor(scenarioById('N'));
    const collide = addEvent(input.state, { nowMs: input.nowMs, today: DAY, createId: (p) => `${p}-x` }, {
      title: 'Tomorrow client lunch', categoryId: 'cat-home', scope: 'household', commitment: 'fixed', startsAt: instantAt('11:00', NEXT), endsAt: instantAt('12:00', NEXT),
    });
    const outcome = computePreview({ state: collide, today: DAY, nowMs: input.nowMs, date: DAY, intent: { kind: 'move_event', id: 'evt-b' } });
    const lines = previewLines(outcome.preview, copyContextFor(outcome.preview.before));
    // Named in start order, as the foundation's overlap detector orders them: the 11:00 lunch, then the 11:10 errand.
    assert.ok(lines.some((l) => /^Tomorrow: Tomorrow client lunch and Errand overlap by 40 min\.$/.test(l)), lines.join(' / '));
  });

  test('DROP says it cannot be restored here; PROTECT says how to undo it; SHORTEN says the numbers', () => {
    const drop = previewLines(previewOf('O', { kind: 'drop_task', id: 'tsk-garage' }), copyContextFor(view('O')));
    assert.ok(drop[0].includes('can’t be restored here'));
    const shorten = previewLines(previewOf('O', { kind: 'shorten_task', id: 'tsk-garage' }), copyContextFor(view('O')));
    assert.match(shorten[0], /Deep clean the garage would go from about 3 hr 20 min to about 2 hr 20 min\./);
    const protect = previewLines(previewOf('N', { kind: 'protect', targetType: 'event', targetId: 'evt-b' }), copyContextFor(view('N')));
    assert.match(protect[0], /would become fixed\. Her Keys would stop suggesting to move, shorten or drop it\. You can change it back by editing it\./);
  });

  test('accept and cancel call back; a busy panel cannot be accepted twice', async () => {
    const calls = [];
    const preview = previewOf('N', { kind: 'move_event', id: 'evt-b' });
    const r = await render(<PreviewPanel preview={preview} validity="current" notice={null} busy={false} onAccept={() => calls.push('accept')} onCancel={() => calls.push('cancel')} onPreviewAgain={() => {}} />);
    await press(button(r, 'Move to tomorrow'));
    await press(button(r, 'Cancel'));
    assert.deepEqual(calls, ['accept', 'cancel']);
    const busy = await render(<PreviewPanel preview={preview} validity="current" notice={null} busy onAccept={() => {}} onCancel={() => {}} onPreviewAgain={() => {}} />);
    assert.equal(button(busy, 'Move to tomorrow').props.accessibilityState.disabled, true);
  });

  test('AG: a stale preview says so, cannot be accepted, and offers to preview again', async () => {
    const calls = [];
    const preview = previewOf('N', { kind: 'move_event', id: 'evt-b' });
    const r = await render(<PreviewPanel preview={preview} validity="stale" notice={null} busy={false} onAccept={() => calls.push('accept')} onCancel={() => {}} onPreviewAgain={() => calls.push('again')} />);
    assert.match(joined(r), /The schedule changed\. Preview again before applying this\./);
    assert.equal(button(r, 'Move to tomorrow').props.accessibilityState.disabled, true);
    await press(button(r, 'Preview again'));
    assert.deepEqual(calls, ['again']);
  });

  test('AG: a recomputed preview says it was updated', async () => {
    const preview = previewOf('N', { kind: 'move_event', id: 'evt-b' });
    const r = await render(<PreviewPanel preview={preview} validity="current" notice="updated" busy={false} onAccept={() => {}} onCancel={() => {}} onPreviewAgain={() => {}} />);
    assert.match(joined(r), /The schedule changed, so this preview was updated to match\./);
  });

  test('every accept label is a verb phrase that names the change', () => {
    assert.deepEqual(Object.values(ACCEPT_LABEL).sort(), ['Drop it', 'Move to tomorrow', 'Move to tomorrow', 'Protect it', 'Shorten it']);
  });
});

describe('undo', () => {
  test('a move made today shows a quiet undo, and pressing it calls back', async () => {
    let undone = 0;
    const r = await render(<UndoNotice title="Errand" busy={false} onUndo={() => undone++} />);
    assert.match(joined(r), /You moved Errand to tomorrow\. That can still be undone today\./);
    await press(button(r, 'Undo'));
    assert.equal(undone, 1);
  });
});

describe('no drag and drop (section 33)', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : /\.(ts|tsx)$/.test(name) ? [join(dir, name)] : []));

  test('Calendar contains no drag, pan or long-press interaction and no gesture library', () => {
    for (const file of walk(join(ROOT, 'src', 'features', 'calendar'))) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /PanResponder|onLongPress|Draggable|draggable|gesture-handler|reanimated|onDrag|onPanGesture/, file);
    }
  });

  test('no new dependency was added for Calendar', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    for (const banned of ['react-native-calendars', 'date-fns', 'dayjs', 'moment', 'luxon', 'react-native-draggable-flatlist', 'react-native-gesture-handler', 'react-native-reanimated']) {
      assert.equal(banned in { ...pkg.dependencies, ...pkg.devDependencies }, false, banned);
    }
  });
});
