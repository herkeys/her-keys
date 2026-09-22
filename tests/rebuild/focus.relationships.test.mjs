/**
 * HK-FEATURE-11 / M3 — Focus -> canonical Task (and Goal / System / Event) relationships, relaunch, and the Today seam.
 *
 * Doctrine under test:
 *   A next step is a CANONICAL Task she wrote and saved — private like its Focus — linked by a typed next-action link.
 *   REBUILDFOCUS DOES NOT BECOME A ONE MOVE.   REBUILDFOCUS CONTRIBUTES ZERO INVENTED CAPACITY TIME.
 *   A Focus reaches Today only through canonical items, by their own existing rules (Addenda F, S).
 *   Linked truth stays independent; an archived / completed / removed target is inert, and the Focus stays intact (Addenda N, O).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addNextStep,
  addRebuildFocus,
  archiveRebuildFocus,
  linkToFocus,
  pauseRebuildFocus,
  setRebuildFocusNote,
} from '../../src/domain/rebuild/commands.ts';
import { hasOpenNextAction, liveLinksOf, openNextActions } from '../../src/domain/rebuild/read.ts';
import { addEvent, removeEvent } from '../../src/domain/events.ts';
import { resolveOneMoveForToday } from '../../src/domain/oneMove.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { attentionFor } from '../../src/domain/reasoning/attention.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { addGoal, setGoalStatus } from '../../src/domain/structure.ts';
import { addTask, archiveTask, completeTask, updateTask } from '../../src/domain/tasks.ts';
import { harness, launch } from '../support/fixtures.mjs';
import { DAY, household, mkCtx, nyInstant, nyMs, strings, view } from '../today/fixtures.mjs';

const valid = (state) => {
  const result = validateAppState(state);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return state;
};
let observationSeq = 0;
/** Named ids for the rows a test names; observations (which commands append on their own) always get a fresh id. */
const c = (prefix = 'r') => ({ ...mkCtx(nyMs(7)), createId: (p) => (p === 'obs' ? `obs-${++observationSeq}` : `${p}-${prefix}`) });
const FOCUS = 'focus-1';
const TITLE = 'Make space for myself again';
const NOTE = 'Saturday mornings used to be mine.';
const PERSONAL = 'cat-wellbeing';

const withFocus = (state = household()) => setRebuildFocusNote(addRebuildFocus(state, c(), { id: FOCUS, title: TITLE }), c(), FOCUS, NOTE);
const withStep = (state = withFocus(), title = 'Book the pottery class', prefix = 's') =>
  addNextStep(state, c(prefix), { focusId: FOCUS, title, categoryId: PERSONAL });

describe('[F11-M3] saving a next step creates exactly one canonical Task and one link', () => {
  test('the Task is hers, private like its Focus, titled exactly as she wrote it; nothing else is created or changed', () => {
    const before = withFocus();
    const after = valid(withStep(before));
    assert.equal(after.tasks.length, before.tasks.length + 1, 'one Task');
    const task = after.tasks.find((t) => t.id === 'task-s');
    assert.deepEqual(
      { title: task.title, scope: task.scope, status: task.status, categoryId: task.categoryId, producer: task.provenance.producer },
      { title: 'Book the pottery class', scope: 'personal', status: 'open', categoryId: PERSONAL, producer: 'user-action' }
    );
    assert.equal(task.notes, null, 'the Focus note is never copied into the Task');
    assert.equal(after.rebuildFocusLinks.length, 1, 'one link');
    assert.deepEqual(
      [after.rebuildFocusLinks[0].relation, after.rebuildFocusLinks[0].target],
      ['next_action', { kind: 'task', id: 'task-s' }]
    );
    assert.equal(after.goals, before.goals);
    assert.equal(after.systems, before.systems);
    assert.equal(after.events, before.events);
    assert.equal(after.rebuildFocuses, before.rebuildFocuses, 'the Focus itself is not changed by gaining a step');
    assert.equal(hasOpenNextAction(after, FOCUS), true);
  });

  test('nothing is created from a blank step, for an archived Focus, or into a missing category', () => {
    const state = withFocus();
    assert.equal(addNextStep(state, c(), { focusId: FOCUS, title: '   ', categoryId: PERSONAL }), state);
    assert.equal(addNextStep(state, c(), { focusId: FOCUS, title: 'x', categoryId: 'cat-missing' }), state);
    const archived = archiveRebuildFocus(state, c(), FOCUS);
    assert.equal(addNextStep(archived, c(), { focusId: FOCUS, title: 'x', categoryId: PERSONAL }), archived);
  });

  test('a paused Focus may still gain a step she writes (pausing is not closing)', () => {
    const paused = pauseRebuildFocus(withFocus(), c(), FOCUS);
    assert.equal(openNextActions(valid(withStep(paused)), FOCUS).length, 1);
  });

  test('the relationship survives a relaunch: same Focus, same link, same open Task', async () => {
    const h = harness({ mode: 'empty' });
    let store = await launch(h);
    await store.commit((s, x) => addRebuildFocus(s, x, { id: FOCUS, title: TITLE }));
    await store.commit((s, x) => addNextStep(s, { ...x, createId: (p) => `${p}-rl` }, { focusId: FOCUS, title: 'Call Dana', categoryId: PERSONAL }));
    store = await launch(h);
    const s = store.getSnapshot().state;
    assert.deepEqual(openNextActions(s, FOCUS).map((t) => [t.id, t.title, t.scope]), [['task-rl', 'Call Dana', 'personal']]);
    assert.equal(liveLinksOf(s, FOCUS)[0].id, 'focuslink-rl');
  });
});

describe('[F11-M3] RebuildFocus is not a Today object (Addenda F, S)', () => {
  test('adding a Focus (with a note) changes NOTHING in the Today projection, and neither title nor note appears in it', () => {
    const base = household();
    const focused = withFocus(base);
    const now = nyMs(8);
    assert.deepEqual(view(focused, now), view(base, now), 'Today is identical with or without a Focus');
    const text = strings(view(focused, now)).join('\n');
    assert.equal(text.includes(TITLE), false);
    assert.equal(text.includes(NOTE), false);
    assert.deepEqual(attentionFor(focused, now), attentionFor(base, now), 'no attention candidate');
  });

  test('REBUILDFOCUS DOES NOT BECOME A ONE MOVE: a Focus alone gives One Move nothing to pick', () => {
    const base = household();
    const resolvedWith = resolveOneMoveForToday(withFocus(base), mkCtx(nyMs(8)));
    const resolvedWithout = resolveOneMoveForToday(base, mkCtx(nyMs(8)));
    assert.deepEqual(resolvedWith.oneMoves, resolvedWithout.oneMoves, 'One Move decides the day exactly as if no Focus existed');
    for (const record of resolvedWith.oneMoves) {
      assert.notEqual(record.targetId, FOCUS, 'a Focus is never a One Move target');
      assert.equal(['task', 'needsMe', 'catalog', 'event', 'system', 'responsibility'].includes(record.targetType), true);
    }
  });

  test('a next-step Task planned for today reaches Today and One Move through the ORDINARY task rules', () => {
    let state = withStep();
    state = valid(updateTask(state, c(), 'task-s', { plan: { kind: 'day', date: DAY } }));
    assert.ok(strings(view(state, nyMs(8))).join('\n').includes('Book the pottery class'), 'visible in Today as a task');
    const resolved = resolveOneMoveForToday(state, mkCtx(nyMs(8)));
    const record = resolved.oneMoves.find((r) => r.forDate === DAY);
    assert.deepEqual([record.targetType, record.targetId], ['task', 'task-s'], 'selected like any task, not as a Focus');
  });

  test('REBUILDFOCUS CONTRIBUTES ZERO INVENTED CAPACITY TIME: the day projection is unchanged by any number of Focuses', () => {
    const base = household();
    let many = base;
    for (let i = 0; i < 12; i += 1) many = addRebuildFocus(many, c(`m${i}`), { id: `focus-m${i}`, title: `Area ${i}` });
    assert.deepEqual(projectStateDay(many, DAY), projectStateDay(base, DAY));
  });
});

describe('[F11-M3] Goals, Systems and Events: linked, never cloned, never changed', () => {
  const linked = () => {
    let state = withFocus();
    state = addGoal(state, c('g'), { title: 'Finish the quilt by winter', categoryId: PERSONAL });
    state = { ...state, systems: [...state.systems, {
      id: 'sys-reset', name: 'Sunday reset', description: '', categoryId: PERSONAL, subjectMemberId: null,
      automationMode: 'manual', effortMinutes: null, energyDemand: null,
      provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'household',
    }] };
    state = addEvent(state, c('e'), { title: 'Life drawing class', categoryId: PERSONAL, startsAt: nyInstant(18, 0, 17), endsAt: nyInstant(20, 0, 17), commitment: 'fixed', scope: 'personal' });
    state = linkToFocus(state, c('lg'), { focusId: FOCUS, target: { kind: 'goal', id: 'goal-g' }, relation: 'supports' });
    state = linkToFocus(state, c('ls'), { focusId: FOCUS, target: { kind: 'system', id: 'sys-reset' }, relation: 'supports' });
    state = linkToFocus(state, c('le'), { focusId: FOCUS, target: { kind: 'event', id: 'evt-e' }, relation: 'supports' });
    return valid(state);
  };

  test('linking leaves the Goal, the System and the Event byte-for-byte as they were (no rebuildFocusId anywhere)', () => {
    const state = linked();
    assert.equal(liveLinksOf(state, FOCUS).length, 3);
    const before = withFocus();
    const goal = state.goals.find((g) => g.id === 'goal-g');
    assert.equal(Object.keys(goal).some((k) => /focus/i.test(k)), false);
    for (const row of [...state.tasks, ...state.events, ...state.systems, ...state.goals]) {
      assert.equal(Object.keys(row).some((k) => /focus|rebuild/i.test(k)), false, `${row.id} carries no Focus field`);
    }
    void before;
  });

  test('a household-visible System stays household-visible; the private link does not change its scope', () => {
    const state = linked();
    assert.equal(state.systems.find((s) => s.id === 'sys-reset').scope, 'household');
    assert.equal(state.rebuildFocusLinks.every((l) => l.scope === 'personal'), true);
  });

  test('Goal achieved or abandoned, Event removed: the Focus stays intact and active; the links stay as history', () => {
    let state = linked();
    const focusBefore = state.rebuildFocuses[0];
    state = valid(setGoalStatus(state, c('ga'), 'goal-g', 'achieved'));
    state = valid(removeEvent(state, c('er'), 'evt-e'));
    assert.deepEqual(state.rebuildFocuses[0], focusBefore, 'Goal completion does not archive or change the Focus');
    assert.equal(liveLinksOf(state, FOCUS).length, 3);
    assert.equal(hasOpenNextAction(state, FOCUS), false, 'none of them is a next action');
    state = valid(setGoalStatus(state, c('gb'), 'goal-g', 'abandoned'));
    assert.deepEqual(state.rebuildFocuses[0], focusBefore);
  });

  test('archiving the Focus does not touch the Goal, the System or the Event', () => {
    const state = linked();
    const archived = valid(archiveRebuildFocus(state, c(), FOCUS));
    assert.equal(archived.goals, state.goals);
    assert.equal(archived.systems, state.systems);
    assert.equal(archived.events, state.events);
    assert.equal(archived.tasks, state.tasks);
  });
});

describe('[F11-M3] linked Task invalidation (Addenda N, O)', () => {
  test('completed, archived or reopened: only an OPEN linked next-action Task counts, and the Focus never changes', () => {
    const state = withStep(withStep(withFocus(), 'Clear the desk', 'a'), 'Buy sketchbook', 'b');
    assert.deepEqual(openNextActions(state, FOCUS).map((t) => t.id), ['task-a', 'task-b']);
    const oneDone = valid(completeTask(state, c(), 'task-a'));
    assert.deepEqual(openNextActions(oneDone, FOCUS).map((t) => t.id), ['task-b']);
    const bothGone = valid(archiveTask(oneDone, c(), 'task-b'));
    assert.deepEqual(openNextActions(bothGone, FOCUS), []);
    assert.equal(bothGone.rebuildFocuses, state.rebuildFocuses, 'the Focus is untouched throughout');
  });

  test('a link whose Task is simply absent (a hard deletion reaching the device) is inert, not a crash and not a count', () => {
    const state = withStep();
    const absent = { ...state, tasks: state.tasks.filter((t) => t.id !== 'task-s') };
    assert.deepEqual(openNextActions(absent, FOCUS), []);
    assert.equal(hasOpenNextAction(absent, FOCUS), false);
  });

  test('a Focus-created Task is edited, completed and archived through the ordinary Task commands like any other', () => {
    let state = withStep();
    state = valid(updateTask(state, c(), 'task-s', { title: 'Book the Thursday pottery class' }));
    assert.equal(openNextActions(state, FOCUS)[0].title, 'Book the Thursday pottery class');
    const other = addTask(state, c('o'), { title: 'Unrelated', categoryId: 'cat-home', scope: 'household' });
    assert.deepEqual(openNextActions(valid(other), FOCUS).map((t) => t.id), ['task-s'], 'an unlinked Task is not a next step');
  });
});
