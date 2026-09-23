/**
 * HK-FEATURE-11 / M4 — the Me / Rebuild surface: its projection and its rendered components.
 *
 * Doctrine under test:
 *   No missing-next-step guilt signal (Addendum E) · no suggestion engine (G) · AFFORDANCE != TASK, OPENING TASK CREATION != SAVING
 *   TASK (H) · the note never leaves its Focus (J) · stable order (K) · paused/archived generate no attention (M) · Recent Progress is
 *   the latest facts, not a window (P) · zero-active is one calm question (Q) · Focus vs Goal is copy, never classification (R) ·
 *   MISSED ROUTINE DOES NOT MEAN PERSONAL REGRESSION · HER KEYS DOES NOT GENERATE A WELLBEING SCORE · static copy audit (T).
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { appendObservation } from '../../src/domain/observations.ts';
import {
  addNextStep,
  addRebuildFocus,
  archiveRebuildFocus,
  linkToFocus,
  pauseRebuildFocus,
  renameRebuildFocus,
  setRebuildFocusNote,
  setRebuildFocusState,
} from '../../src/domain/rebuild/commands.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { addDependency, addGoal, setGoalStatus } from '../../src/domain/structure.ts';
import { addTask, completeTask, updateTask } from '../../src/domain/tasks.ts';
import { addEvent } from '../../src/domain/events.ts';
import { rebuildAvailabilityOf } from '../../src/features/rebuild/availability.ts';
import { REBUILD_COPY } from '../../src/features/rebuild/copy.ts';
import { FocusDetailBody } from '../../src/features/rebuild/FocusDetailBody.tsx';
import { FocusEditorBody } from '../../src/features/rebuild/FocusEditorBody.tsx';
import { buildFocusDetail, buildRebuildHome, defaultStepCategory, RECENT_PROGRESS_LIMIT } from '../../src/features/rebuild/model.ts';
import { RebuildHomeBody } from '../../src/features/rebuild/RebuildHomeBody.tsx';
import { render } from '../support/render.tsx';
import { DAY, household, mkCtx, nyInstant, nyMs, strings } from '../today/fixtures.mjs';

const NOW = nyMs(8);
const READY = { kind: 'ready', canWrite: true };
const FOCUS = 'focus-1';
const TITLE = 'Make space for myself again';
const NOTE = 'Saturday mornings used to be mine.';
const PERSONAL = 'cat-wellbeing';
let seq = 0;
const c = (ms = nyMs(7)) => ({ ...mkCtx(ms), createId: (p) => `${p}-u${++seq}` });
const valid = (state) => {
  const result = validateAppState(state);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return state;
};
const focused = (state = household()) => setRebuildFocusNote(addRebuildFocus(state, c(), { id: FOCUS, title: TITLE }), c(), FOCUS, NOTE);
const stepped = (state = focused(), title = 'Book the pottery class', taskId = 'task-step', due = null) => {
  let next = addNextStep(state, { ...c(), createId: (p) => (p === 'task' ? taskId : `${p}-u${++seq}`) }, { focusId: FOCUS, title, categoryId: PERSONAL });
  if (due !== null) next = updateTask(next, c(), taskId, { dueDate: due });
  return valid(next);
};
const home = (state) => buildRebuildHome(state, DAY, NOW);

const flat = (node) => [].concat(node.props.children ?? []).join('');
const texts = (r) => r.root.findAllByType('Text').map(flat);
const pressables = (r) => r.root.findAllByType('Pressable');
const byLabel = (r, label) => pressables(r).filter((p) => p.props.accessibilityLabel === label);
const press = async (node) => TestRenderer.act(async () => node.props.onPress());
const type = async (input, text) => TestRenderer.act(async () => input.props.onChangeText(text));
const inputs = (r) => r.root.findAllByType('TextInput');
const noop = () => {};
const homeHandlers = (over = {}) => ({ onAddFocus: noop, onNotNow: noop, onOpenFocus: noop, onAddNextStep: noop, ...over });

describe('[F11-M4] the home projection', () => {
  test('[Q] zero Focuses: no verdict and no sections — only the calm question', () => {
    const view = home(household());
    assert.deepEqual(view, { hasActive: false, verdict: null, current: [], needsAttention: [], recentProgress: [], paused: [] });
  });

  test('[E] a new Focus with no step is NOT a problem: the verdict says nothing needs attention, and only a quiet invitation exists', () => {
    const view = home(focused());
    assert.equal(view.verdict, REBUILD_COPY.verdict.nothing);
    assert.deepEqual(view.needsAttention, []);
    assert.deepEqual(view.current.map((f) => [f.id, f.canAddNextStep, f.steps.length]), [[FOCUS, true, 0]]);
    const all = strings(view).join('\n');
    assert.equal(/no next step|without a step|haven.t|lately|neglect|behind|overdue focus/i.test(all), false);
  });

  test('[E] the "no step" state has no clock: the same Focus reads the same a month later', () => {
    const state = focused();
    const later = buildRebuildHome(state, '2026-10-16', nyMs(8, 0, 16) + 30 * 86_400_000);
    assert.equal(later.verdict, REBUILD_COPY.verdict.nothing);
    assert.deepEqual(later.needsAttention, []);
  });

  test('verdict order: a step due today or past its date comes first; otherwise the next dated thing; otherwise nothing', () => {
    assert.equal(home(stepped(focused(), 'Call Dana', 'task-a', DAY)).verdict, REBUILD_COPY.verdict.attention(1));
    const two = stepped(stepped(focused(), 'Call Dana', 'task-a', DAY), 'Return library book', 'task-b', '2026-09-14');
    const view = home(two);
    assert.equal(view.verdict, REBUILD_COPY.verdict.attention(2));
    assert.deepEqual(view.needsAttention.map((a) => [a.taskId, a.label]), [
      ['task-a', REBUILD_COPY.home.dueOn('today')],
      ['task-b', REBUILD_COPY.home.pastDue('Sep 14')],
    ]);
    assert.equal(home(stepped(focused(), 'Buy a sketchbook', 'task-c', '2026-09-19')).verdict, REBUILD_COPY.verdict.next('Buy a sketchbook', 'Sep 19'));
    let evented = addEvent(focused(), { ...c(), createId: () => 'evt-class' }, { title: 'Life drawing class', categoryId: PERSONAL, startsAt: nyInstant(18, 0, 17), endsAt: nyInstant(20, 0, 17), commitment: 'fixed', scope: 'personal' });
    evented = linkToFocus(evented, c(), { focusId: FOCUS, target: { kind: 'event', id: 'evt-class' }, relation: 'supports' });
    assert.equal(home(evented).verdict, REBUILD_COPY.verdict.next('Life drawing class', 'tomorrow'));
  });

  test('[M] a PAUSED Focus contributes no attention and no verdict, even with a step past its date; an ARCHIVED one is not shown', () => {
    const overdue = stepped(focused(), 'Return library book', 'task-b', '2026-09-14');
    const paused = home(pauseRebuildFocus(overdue, c(), FOCUS));
    assert.deepEqual([paused.hasActive, paused.verdict, paused.needsAttention], [false, null, []]);
    assert.deepEqual(paused.paused.map((f) => f.id), [FOCUS]);
    const archived = home(archiveRebuildFocus(overdue, c(), FOCUS));
    assert.deepEqual(archived, { hasActive: false, verdict: null, current: [], needsAttention: [], recentProgress: [], paused: [] });
  });

  test('[P] Recent Progress: the latest linked completions, newest first, at most three, and no window of time', () => {
    let state = focused();
    for (const [i, hour] of [[1, 9], [2, 10], [3, 11], [4, 12]]) {
      state = stepped(state, `Step ${i}`, `task-p${i}`);
      state = completeTask(state, c(nyMs(hour, 0, 2)), `task-p${i}`); // completed on Sep 2: two weeks ago still counts
    }
    const view = home(valid(state));
    assert.equal(view.recentProgress.length, RECENT_PROGRESS_LIMIT);
    assert.deepEqual(view.recentProgress.map((p) => p.title), ['Step 4', 'Step 3', 'Step 2']);
    assert.equal(view.recentProgress[0].label, REBUILD_COPY.home.doneOn('Sep 2'));
  });

  test('[P] a linked Goal actually reached is progress; an unlinked completion is not', () => {
    let state = addGoal(focused(), { ...c(), createId: (p) => (p === 'goal' ? 'goal-q' : `${p}-u${++seq}`) }, { title: 'Finish the quilt', categoryId: PERSONAL });
    state = linkToFocus(state, c(), { focusId: FOCUS, target: { kind: 'goal', id: 'goal-q' }, relation: 'supports' });
    state = setGoalStatus(state, c(nyMs(9, 0, 15)), 'goal-q', 'achieved');
    state = addTask(state, { ...c(), createId: () => 'task-unlinked' }, { title: 'Unlinked chore', categoryId: 'cat-home', scope: 'household' });
    state = completeTask(state, c(nyMs(10, 0, 16)), 'task-unlinked');
    const view = home(valid(state));
    assert.deepEqual(view.recentProgress.map((p) => [p.title, p.label]), [['Finish the quilt', REBUILD_COPY.home.reached('Sep 15')]]);
  });

  test('MISSED ROUTINE DOES NOT MEAN PERSONAL REGRESSION: a missed or skipped linked System changes nothing on Me / Rebuild', () => {
    let state = focused();
    state = { ...state, systems: [...state.systems, {
      id: 'sys-reset', name: 'Sunday reset', description: '', categoryId: PERSONAL, subjectMemberId: null,
      automationMode: 'manual', effortMinutes: null, energyDemand: null,
      provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'household',
    }] };
    state = linkToFocus(state, c(), { focusId: FOCUS, target: { kind: 'system', id: 'sys-reset' }, relation: 'supports' });
    const before = home(valid(state));
    let missed = appendObservation(state, c(), { about: { kind: 'system', id: 'sys-reset' }, outcome: 'missed', plannedDate: '2026-09-13' });
    missed = appendObservation(missed, c(), { about: { kind: 'system', id: 'sys-reset' }, outcome: 'skipped', plannedDate: '2026-09-06' });
    assert.deepEqual(home(valid(missed)), before, 'identical: no regression, no attention, no verdict change');
    assert.deepEqual(buildFocusDetail(missed, FOCUS, DAY, NOW), buildFocusDetail(state, FOCUS, DAY, NOW));
  });

  test('[G] low-energy support: an EXISTING lighter alternative she recorded is shown; nothing is invented when there is none', () => {
    let state = stepped(focused(), 'Paint for an hour', 'task-big');
    assert.equal(home(state).current[0].steps[0].lighterVersion, null, 'no alternative, so none is shown');
    state = addTask(state, { ...c(), createId: () => 'task-small' }, { title: 'Paint for ten minutes', categoryId: PERSONAL, scope: 'personal' });
    const recorded = addDependency(state, c(), { relation: 'alternative_to', from: { kind: 'task', id: 'task-small' }, to: { kind: 'task', id: 'task-big' } });
    assert.equal(recorded.refusal, null);
    state = recorded.state;
    assert.equal(home(valid(state)).current[0].steps[0].lighterVersion, 'Paint for ten minutes');
  });

  test('[J] the note never leaves its Focus: not in the home, the verdict, attention or progress — only on the Focus itself', () => {
    const state = stepped(focused(), 'Call Dana', 'task-a', DAY);
    assert.equal(strings(home(state)).join('\n').includes(NOTE), false);
    assert.equal(buildFocusDetail(state, FOCUS, DAY, NOW).note, NOTE);
    assert.equal(state.tasks.find((t) => t.id === 'task-a').notes, null);
  });

  test('Me Now is explicit links only: a private Task that is not linked to a Focus is not shown', () => {
    const state = addTask(focused(), { ...c(), createId: () => 'task-private' }, { title: 'Private errand', categoryId: PERSONAL, scope: 'personal', dueDate: DAY });
    assert.equal(strings(home(state)).join('\n').includes('Private errand'), false);
  });

  test('[K] the home order is the domain order, however titles change', () => {
    let ordered = addRebuildFocus(household(), c(nyMs(9)), { id: 'focus-z', title: 'Zeta' });
    ordered = addRebuildFocus(ordered, c(nyMs(8)), { id: 'focus-y', title: 'Alpha' });
    ordered = renameRebuildFocus(ordered, c(), 'focus-y', 'Zzz renamed');
    assert.deepEqual(home(ordered).current.map((f) => f.id), ['focus-y', 'focus-z']);
  });

  test('the default category for a step is chosen by owner-private SCOPE and household order, never by a name', () => {
    const cats = household().categories;
    assert.equal(defaultStepCategory(cats), 'cat-wellbeing');
    const renamed = cats.map((cat) => (cat.id === 'cat-wellbeing' ? { ...cat, name: 'Anything at all' } : cat));
    assert.equal(defaultStepCategory(renamed), 'cat-wellbeing');
  });
});

describe('[F11-M4] availability: nothing private is shown for a household that is not hers or not read', () => {
  const snap = (over = {}) => ({ status: 'ready', state: {}, recovery: null, persistence: 'enabled', ...over });
  test('loading, recovery and another account never read as empty', () => {
    assert.equal(rebuildAvailabilityOf(snap({ status: 'hydrating' }), { kind: 'signedOut' }).kind, 'loading');
    assert.equal(rebuildAvailabilityOf(snap({ recovery: { reason: 'x', quarantined: true } }), { kind: 'signedOut' }).kind, 'unrecovered');
    assert.equal(rebuildAvailabilityOf(snap(), { kind: 'boundOther' }).kind, 'other_account');
    assert.deepEqual(rebuildAvailabilityOf(snap({ persistence: 'disabled' }), { kind: 'signedOut' }), { kind: 'ready', canWrite: false });
  });

  for (const gate of [{ kind: 'loading' }, { kind: 'unrecovered' }, { kind: 'other_account' }]) {
    test(`${gate.kind}: the home shows neither the empty question nor any Focus title`, async () => {
      const r = await render(<RebuildHomeBody gate={gate} view={home(focused())} {...homeHandlers()} />);
      const all = texts(r).join('\n');
      assert.equal(all.includes(REBUILD_COPY.home.emptyTitle), false);
      assert.equal(all.includes(TITLE), false);
      assert.equal(byLabel(r, REBUILD_COPY.home.addFocus).length, 0);
    });
  }
});

describe('[F11-M4] the home, rendered', () => {
  test('[Q] zero active Focuses: one calm question, Add one Focus and Not now, and no section headings', async () => {
    let added = 0;
    let skipped = 0;
    const r = await render(<RebuildHomeBody gate={READY} view={home(household())} {...homeHandlers({ onAddFocus: () => added++, onNotNow: () => skipped++ })} />);
    const all = texts(r);
    assert.ok(all.includes(REBUILD_COPY.home.emptyTitle));
    for (const heading of ['CURRENT FOCUSES', 'NEEDS ATTENTION', 'RECENT PROGRESS', 'PAUSED']) assert.equal(all.includes(heading), false, heading);
    await press(byLabel(r, REBUILD_COPY.home.addFocus)[0]);
    await press(byLabel(r, REBUILD_COPY.home.notNow)[0]);
    assert.deepEqual([added, skipped], [1, 1]);
  });

  test('[H] tapping "Add a next step" on the home asks to open the form for that Focus — and nothing else', async () => {
    const asked = [];
    const r = await render(<RebuildHomeBody gate={READY} view={home(focused())} {...homeHandlers({ onAddNextStep: (id) => asked.push(id) })} />);
    await press(byLabel(r, REBUILD_COPY.home.addNextStep)[0]);
    assert.deepEqual(asked, [FOCUS], 'the home has no write handler at all; the form lives on the Focus');
  });

  test('a Focus with a step shows the step, and no invitation; a read-only session disables every add', async () => {
    const view = home(stepped(focused(), 'Book the pottery class', 'task-a', '2026-09-19'));
    const r = await render(<RebuildHomeBody gate={READY} view={view} {...homeHandlers()} />);
    assert.ok(texts(r).includes('Book the pottery class'));
    assert.equal(byLabel(r, REBUILD_COPY.home.addNextStep).length, 0);
    const ro = await render(<RebuildHomeBody gate={{ kind: 'ready', canWrite: false }} view={home(focused())} {...homeHandlers()} />);
    assert.ok(texts(ro).includes(REBUILD_COPY.availability.readOnly));
    assert.equal(byLabel(ro, REBUILD_COPY.home.addNextStep)[0].props.disabled, true);
    assert.equal(byLabel(ro, REBUILD_COPY.home.addAnother)[0].props.disabled, true);
  });
});

describe('[F11-M4] naming a Focus, rendered', () => {
  test('[R] the Focus / Goal distinction is shown as copy; a blank title is refused; a title-only save is accepted', async () => {
    const saves = [];
    const r = await render(<FocusEditorBody canWrite onSave={async (input) => { saves.push(input); return true; }} onCancel={noop} />);
    const all = texts(r);
    assert.ok(all.includes(REBUILD_COPY.editor.distinctionFocus));
    assert.ok(all.includes(REBUILD_COPY.editor.distinctionGoal));
    await press(byLabel(r, REBUILD_COPY.editor.save)[0]);
    assert.deepEqual(saves, [], 'nothing saved without a title');
    assert.ok(texts(r).includes(REBUILD_COPY.editor.titleMissing));
    await type(inputs(r)[0], '  Reconnect with creativity ');
    await press(byLabel(r, REBUILD_COPY.editor.save)[0]);
    assert.deepEqual(saves, [{ title: '  Reconnect with creativity ', note: null }]);
  });
});

describe('[F11-M4] a Focus, rendered — AFFORDANCE != TASK (Addendum H)', () => {
  /** Handlers wired to a real household, so a test sees exactly what each tap would have written. */
  const live = (initial) => {
    const box = { state: initial, calls: [] };
    const apply = (name, fn) => async (...args) => {
      box.calls.push(name);
      const next = fn(box.state, ...args);
      box.state = next;
      return validateAppState(next).ok;
    };
    return {
      box,
      handlers: {
        onRename: apply('rename', (s, title) => renameRebuildFocus(s, c(), FOCUS, title)),
        onSaveNote: apply('note', (s, note) => setRebuildFocusNote(s, c(), FOCUS, note)),
        onSetState: apply('state', (s, next) => setRebuildFocusState(s, c(), FOCUS, next)),
        onAddStep: apply('step', (s, input) => addNextStep(s, c(), { focusId: FOCUS, ...input })),
        onMarkDone: apply('done', (s, taskId) => completeTask(s, c(), taskId)),
        onEditStep: () => box.calls.push('edit'),
        onConnect: apply('connect', (s, target) => linkToFocus(s, c(), { focusId: FOCUS, target, relation: 'supports' })),
        onDisconnect: apply('disconnect', (s) => s),
      },
    };
  };
  const detail = (state, over = {}) => render(<FocusDetailBody gate={READY} view={buildFocusDetail(state, FOCUS, DAY, NOW)} {...over} />);

  test('opening the step form creates NO Task; typing creates none; only Save creates exactly one, as written', async () => {
    const { box, handlers } = live(focused());
    const tasksBefore = box.state.tasks;
    const r = await detail(box.state, handlers);
    await press(byLabel(r, REBUILD_COPY.home.addNextStep)[0]);
    assert.equal(box.state.tasks, tasksBefore, 'opening the form wrote nothing');
    assert.deepEqual(box.calls, []);
    await type(inputs(r)[0], 'Book the pottery class');
    assert.equal(box.state.tasks, tasksBefore, 'typing wrote nothing');
    await press(byLabel(r, REBUILD_COPY.detail.saveStep)[0]);
    assert.deepEqual(box.calls, ['step']);
    assert.equal(box.state.tasks.length, tasksBefore.length + 1);
    const task = box.state.tasks[box.state.tasks.length - 1];
    assert.deepEqual([task.title, task.scope, task.categoryId], ['Book the pottery class', 'personal', PERSONAL]);
  });

  test('arriving from the home with the form open still writes nothing until Save; Cancel writes nothing at all', async () => {
    const { box, handlers } = live(focused());
    const r = await detail(box.state, { ...handlers, startWithStepForm: true });
    assert.equal(byLabel(r, REBUILD_COPY.detail.saveStep)[0].props.disabled, true, 'nothing to save yet');
    await type(inputs(r)[0], 'Walk at lunch');
    await press(byLabel(r, REBUILD_COPY.detail.cancel)[0]);
    assert.deepEqual(box.calls, []);
    assert.equal(box.state.tasks.length, focused().tasks.length);
  });

  test('archiving asks first, and archiving touches only the Focus', async () => {
    const { box, handlers } = live(stepped());
    const r = await detail(box.state, handlers);
    await press(byLabel(r, REBUILD_COPY.detail.archive)[0]);
    assert.deepEqual(box.calls, [], 'the first tap only asks');
    assert.ok(texts(r).includes(REBUILD_COPY.detail.archiveConfirmTitle));
    const tasks = box.state.tasks;
    await press(byLabel(r, REBUILD_COPY.detail.archiveConfirm)[0]);
    assert.deepEqual(box.calls, ['state']);
    assert.equal(box.state.rebuildFocuses[0].state, 'archived');
    assert.equal(box.state.tasks, tasks, 'no Task was touched');
  });

  test('pause, resume, rename and mark-done each run exactly their one command', async () => {
    const { box, handlers } = live(stepped());
    let r = await detail(box.state, handlers);
    await press(byLabel(r, REBUILD_COPY.detail.pause)[0]);
    r = await detail(box.state, handlers);
    await press(byLabel(r, REBUILD_COPY.detail.resume)[0]);
    r = await detail(box.state, handlers);
    await press(byLabel(r, REBUILD_COPY.detail.rename)[0]);
    await type(inputs(r)[0], 'My own time');
    await press(byLabel(r, REBUILD_COPY.detail.saveRename)[0]);
    r = await detail(box.state, handlers);
    await press(byLabel(r, REBUILD_COPY.detail.markDone)[0]);
    assert.deepEqual(box.calls, ['state', 'state', 'rename', 'done']);
    assert.deepEqual([box.state.rebuildFocuses[0].state, box.state.rebuildFocuses[0].title, box.state.rebuildFocuses[0].id], ['active', 'My own time', FOCUS]);
    assert.equal(box.state.tasks.find((t) => t.id === 'task-step').status, 'completed');
  });

  test('the note is shown on its own Focus; a missing Focus says so instead of rendering someone else', async () => {
    const r = await detail(focused());
    assert.ok(texts(r).includes(NOTE));
    const gone = await render(<FocusDetailBody gate={READY} view={null} {...live(focused()).handlers} />);
    assert.ok(texts(gone).includes(REBUILD_COPY.detail.notFoundTitle));
  });
});

describe('[F11-M4] [T] static copy audit — no therapy, wellness, grading or guilt language', () => {
  const BANNED = [
    /you.re healing/i, /healing journey/i, /better version of yourself/i, /you.re doing great/i, /falling behind/i,
    /wellness score/i, /wellbeing score/i, /self-care score/i, /personal growth score/i, /\bscore\b/i, /\bstreak/i,
    /\bproud\b/i, /amazing/i, /great job/i, /\bbehind\b/i, /neglect/i, /should have/i, /\bfailed?\b/i, /journey/i,
    /\bheal/i, /therapy/i, /self-care/i, /\bmood\b/i, /\bdiagnos/i, /%/,
  ];
  const leaves = (value, out = []) => {
    if (typeof value === 'string') out.push(value);
    else if (typeof value === 'function') out.push(String(value.length === 2 ? value('Sample', 'today') : value.length === 1 ? value(2) : value()));
    else if (value && typeof value === 'object') for (const v of Object.values(value)) leaves(v, out);
    return out;
  };
  test('every static string (and every sentence a copy function can form) is free of the banned phrases', () => {
    const all = [...leaves(REBUILD_COPY), REBUILD_COPY.verdict.attention(1), REBUILD_COPY.life.rowValue(0), REBUILD_COPY.life.rowValue(1)];
    const hits = all.flatMap((text) => BANNED.filter((re) => re.test(text)).map((re) => `${re} in "${text}"`));
    // `saveFailed` says the SAVE did not go through ("couldn't save") — not a judgment of her. No other phrase is allowed.
    assert.deepEqual(hits, []);
  });
});
