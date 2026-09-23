/**
 * HK-FEATURE-11 / M2 — RebuildFocus: model, commands, lifecycle, local persistence and relaunch.
 *
 * Doctrine under test here (the Me / Rebuild ledger, "RebuildFocus semantic contract"):
 *   FOCUS IS NOT A TASK / GOAL / SYSTEM.   PAUSED DOES NOT MEAN FAILED.   ARCHIVED DOES NOT MEAN FAILED.
 *   TASK COMPLETED DOES NOT MEAN FOCUS COMPLETED.   A title-only Focus is valid.   Identity is the id, never the title.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addNextStep,
  addRebuildFocus,
  archiveRebuildFocus,
  focusInputProblem,
  linkToFocus,
  pauseRebuildFocus,
  renameRebuildFocus,
  resumeRebuildFocus,
  setRebuildFocusNote,
  unlinkFromFocus,
} from '../../src/domain/rebuild/commands.ts';
import { hasOpenNextAction, liveLinksOf, openNextActions, orderedFocuses } from '../../src/domain/rebuild/read.ts';
import { RebuildFocusSchema, REBUILD_FOCUS_NOTE_MAX } from '../../src/domain/rebuild/schema.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { addTask, archiveTask, completeTask } from '../../src/domain/tasks.ts';
import { decodeStoredState } from '../../src/persistence/envelope.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, MORNING, TZ, ctx, demoState, harness, launch, nyMs, rawEnvelope, stored } from '../support/fixtures.mjs';

const valid = (state) => {
  const result = validateAppState(state);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return state;
};
const at = (ms = MORNING, context = ctx()) => ({ ...context, nowMs: ms });
const empty = () => createEmptyState(TZ);
const withFocus = (state = empty(), title = 'Make space for myself again', context = ctx()) => addRebuildFocus(state, context, { title });
const onlyFocus = (state) => state.rebuildFocuses[state.rebuildFocuses.length - 1];
const PERSONAL_CATEGORY = 'cat-wellbeing';

describe('[F11-M2] a RebuildFocus is a small, truthful record', () => {
  test('a title-only Focus is valid: active, owner-private, user-stated, and nothing else is created', () => {
    const before = empty();
    const after = valid(withFocus(before));
    const focus = onlyFocus(after);
    assert.equal(after.rebuildFocuses.length, 1);
    assert.deepEqual(
      { title: focus.title, note: focus.note, state: focus.state, scope: focus.scope, producer: focus.provenance.producer },
      { title: 'Make space for myself again', note: null, state: 'active', scope: 'personal', producer: 'user-action' }
    );
    // FOCUS IS NOT A TASK / GOAL / SYSTEM / EVENT: creating one creates none of them, and no link.
    assert.equal(after.tasks, before.tasks, 'no Task is created');
    assert.equal(after.goals, before.goals, 'no Goal is created');
    assert.equal(after.systems, before.systems, 'no System is created');
    assert.equal(after.events, before.events, 'no Event is created');
    assert.equal(after.rebuildFocusLinks.length, 0, 'no link is created');
  });

  test('the model has no score, progress, streak, priority or completion field — and refuses one', () => {
    const focus = onlyFocus(withFocus());
    assert.deepEqual(Object.keys(focus).sort(), ['createdAt', 'id', 'note', 'provenance', 'scope', 'state', 'title', 'updatedAt']);
    for (const extra of ['progress', 'score', 'streak', 'priority', 'completedAt', 'wellbeingScore']) {
      assert.equal(RebuildFocusSchema.safeParse({ ...focus, [extra]: 1 }).success, false, extra);
    }
    for (const state of ['completed', 'failed', 'behind', 'abandoned']) {
      assert.equal(RebuildFocusSchema.safeParse({ ...focus, state }).success, false, `no "${state}" state`);
    }
  });

  test('title and note are stored trimmed; blank is refused; the note is optional and bounded at 500', () => {
    const state = addRebuildFocus(empty(), ctx(), { title: '  Reconnect with creativity  ', note: '   ' });
    assert.equal(onlyFocus(state).title, 'Reconnect with creativity');
    assert.equal(onlyFocus(state).note, null, 'a blank note is no note');
    assert.equal(focusInputProblem({ title: '   ' }), 'title_missing');
    assert.equal(addRebuildFocus(empty(), ctx(), { title: '   ' }).rebuildFocuses.length, 0);
    assert.equal(focusInputProblem({ title: 'x', note: 'n'.repeat(REBUILD_FOCUS_NOTE_MAX) }), null);
    assert.equal(focusInputProblem({ title: 'x', note: 'n'.repeat(REBUILD_FOCUS_NOTE_MAX + 1) }), 'note_too_long');
    assert.equal(addRebuildFocus(empty(), ctx(), { title: 'x', note: 'n'.repeat(REBUILD_FOCUS_NOTE_MAX + 1) }).rebuildFocuses.length, 0);
    const untrimmed = { ...onlyFocus(state), title: ' padded ' };
    assert.equal(RebuildFocusSchema.safeParse(untrimmed).success, false, 'the stored shape itself refuses untrimmed text');
  });

  test('duplicate titles are two Focuses; a replayed save of the same id is one', () => {
    const c = ctx();
    let state = addRebuildFocus(empty(), c, { title: 'Make this home feel like mine' });
    state = valid(addRebuildFocus(state, c, { title: 'Make this home feel like mine' }));
    assert.equal(state.rebuildFocuses.length, 2, 'no uniqueness on titles');
    assert.notEqual(state.rebuildFocuses[0].id, state.rebuildFocuses[1].id);
    const once = addRebuildFocus(empty(), c, { id: 'focus-fixed', title: 'A' });
    assert.equal(addRebuildFocus(once, c, { id: 'focus-fixed', title: 'A' }), once, 'duplicate save is a no-op');
  });

  test('a demo household stamps its Focus demo-seed, so it can never become account truth', () => {
    const focus = onlyFocus(withFocus(demoState()));
    assert.equal(focus.provenance.producer, 'demo-seed');
  });
});

describe('[F11-M2] identity is the id; a rename is display only', () => {
  test('renaming keeps the id, the links and the linked Task exactly as they were', () => {
    let state = withFocus();
    const focus = onlyFocus(state);
    state = addNextStep(state, ctx({ createId: (p) => `${p}-n1` }), { focusId: focus.id, title: 'Book a pottery class', categoryId: PERSONAL_CATEGORY });
    const task = state.tasks[state.tasks.length - 1];
    const renamed = valid(renameRebuildFocus(state, at(nyMs(11)), focus.id, 'Reconnect with making things'));
    assert.equal(renamed.rebuildFocuses.length, 1, 'no new Focus');
    assert.equal(onlyFocus(renamed).id, focus.id, 'same id');
    assert.equal(onlyFocus(renamed).title, 'Reconnect with making things');
    assert.equal(renamed.rebuildFocusLinks, state.rebuildFocusLinks, 'links untouched');
    assert.equal(renamed.tasks, state.tasks, 'linked Task untouched');
    assert.deepEqual(openNextActions(renamed, focus.id).map((t) => t.id), [task.id]);
  });

  test('a blank rename is refused; the note can be set, changed and cleared without touching anything else', () => {
    let state = withFocus();
    const id = onlyFocus(state).id;
    assert.equal(renameRebuildFocus(state, ctx(), id, '  '), state);
    state = valid(setRebuildFocusNote(state, ctx(), id, ' Saturday mornings are mine. '));
    assert.equal(onlyFocus(state).note, 'Saturday mornings are mine.');
    state = valid(setRebuildFocusNote(state, ctx(), id, null));
    assert.equal(onlyFocus(state).note, null);
    assert.equal(setRebuildFocusNote(state, ctx(), id, 'n'.repeat(REBUILD_FOCUS_NOTE_MAX + 1)), state);
  });
});

describe('[F11-M2] pause, resume, archive — no state is a judgment, and none reaches linked truth', () => {
  const scenario = () => {
    let state = withFocus();
    const focusId = onlyFocus(state).id;
    state = addNextStep(state, ctx({ createId: (p) => `${p}-s1` }), { focusId, title: 'Sketch on Sunday', categoryId: PERSONAL_CATEGORY });
    return { state, focusId, taskId: 'task-s1' };
  };

  test('PAUSED DOES NOT MEAN FAILED: pausing changes only the Focus; its open Task stays open and linked', () => {
    const { state, focusId, taskId } = scenario();
    const paused = valid(pauseRebuildFocus(state, at(nyMs(12)), focusId));
    assert.equal(onlyFocus(paused).state, 'paused');
    assert.equal(paused.tasks, state.tasks, 'no Task was completed, cancelled or edited');
    assert.equal(paused.tasks.find((t) => t.id === taskId).status, 'open');
    assert.equal(paused.rebuildFocusLinks, state.rebuildFocusLinks, 'links untouched');
    const resumed = valid(resumeRebuildFocus(paused, at(nyMs(13)), focusId));
    assert.equal(onlyFocus(resumed).state, 'active');
    assert.equal(onlyFocus(resumed).id, focusId);
  });

  test('ARCHIVED DOES NOT MEAN FAILED: archiving keeps the Focus canonical and never completes or deletes its Task', () => {
    const { state, focusId, taskId } = scenario();
    const archived = valid(archiveRebuildFocus(state, at(nyMs(12)), focusId));
    assert.equal(archived.rebuildFocuses.length, 1, 'kept, not deleted');
    assert.equal(onlyFocus(archived).state, 'archived');
    assert.equal(archived.tasks, state.tasks);
    assert.equal(archived.tasks.find((t) => t.id === taskId).status, 'open');
    assert.deepEqual(orderedFocuses(archived), [], 'off the Rebuild surface');
    assert.equal(liveLinksOf(archived, focusId).length, 1, 'its history stays');
    // It can come back: archived is not a terminal verdict.
    assert.equal(onlyFocus(resumeRebuildFocus(archived, ctx(), focusId)).state, 'active');
  });

  test('TASK COMPLETED DOES NOT MEAN FOCUS COMPLETED; an archived Task is not an open next action', () => {
    const { state, focusId, taskId } = scenario();
    assert.equal(hasOpenNextAction(state, focusId), true);
    const done = valid(completeTask(state, at(nyMs(14)), taskId));
    assert.equal(done.rebuildFocuses, state.rebuildFocuses, 'the Focus did not change at all');
    assert.equal(onlyFocus(done).state, 'active');
    assert.equal(hasOpenNextAction(done, focusId), false, 'a completed Task is not an open next action');
    const dropped = valid(archiveTask(state, at(nyMs(14)), taskId));
    assert.equal(onlyFocus(dropped).state, 'active');
    assert.equal(hasOpenNextAction(dropped, focusId), false, 'an archived Task is inert for the count');
  });
});

describe('[F11-M2] the one stable order (Addendum K)', () => {
  test('ACTIVE before PAUSED; oldest first; id breaks a tie; archived excluded; title never matters', () => {
    let state = empty();
    state = addRebuildFocus(state, at(nyMs(9)), { id: 'focus-b', title: 'Zeta' });
    state = addRebuildFocus(state, at(nyMs(9)), { id: 'focus-a', title: 'Alpha' }); // same instant: the id decides
    state = addRebuildFocus(state, at(nyMs(8)), { id: 'focus-old', title: 'Mid' });
    state = addRebuildFocus(state, at(nyMs(7)), { id: 'focus-paused', title: 'Aaa' });
    state = addRebuildFocus(state, at(nyMs(6)), { id: 'focus-gone', title: 'Aardvark' });
    state = pauseRebuildFocus(state, ctx(), 'focus-paused');
    state = archiveRebuildFocus(state, ctx(), 'focus-gone');
    assert.deepEqual(orderedFocuses(valid(state)).map((f) => f.id), ['focus-old', 'focus-a', 'focus-b', 'focus-paused']);
  });
});

describe('[F11-M2] links: typed, checked, never duplicated, removed by status', () => {
  test('a next action must be a Task; a missing target or an archived Focus is refused; the same item twice is one link', () => {
    let state = withFocus();
    const focusId = onlyFocus(state).id;
    state = addTask(state, ctx({ createId: () => 'task-x' }), { title: 'Call Dana', categoryId: PERSONAL_CATEGORY, scope: 'personal' });
    assert.equal(linkToFocus(state, ctx(), { focusId, target: { kind: 'event', id: 'nope' }, relation: 'supports' }), state, 'missing target');
    assert.equal(linkToFocus(state, ctx(), { focusId, target: { kind: 'goal', id: 'g' }, relation: 'next_action' }), state, 'next action must be a Task');
    const linked = valid(linkToFocus(state, ctx(), { focusId, target: { kind: 'task', id: 'task-x' }, relation: 'next_action' }));
    assert.equal(linkToFocus(linked, ctx(), { focusId, target: { kind: 'task', id: 'task-x' }, relation: 'next_action' }), linked);
    const archived = archiveRebuildFocus(state, ctx(), focusId);
    assert.equal(linkToFocus(archived, ctx(), { focusId, target: { kind: 'task', id: 'task-x' }, relation: 'next_action' }), archived);
  });

  test('unlinking keeps the link as removed and leaves the Task and the Focus alone', () => {
    let state = withFocus();
    const focusId = onlyFocus(state).id;
    state = addNextStep(state, ctx({ createId: (p) => `${p}-u` }), { focusId, title: 'Clear the desk', categoryId: PERSONAL_CATEGORY });
    const linkId = state.rebuildFocusLinks[0].id;
    const unlinked = valid(unlinkFromFocus(state, ctx(), linkId));
    assert.equal(unlinked.rebuildFocusLinks.length, 1);
    assert.equal(unlinked.rebuildFocusLinks[0].status, 'removed');
    assert.equal(unlinked.tasks, state.tasks);
    assert.equal(unlinked.rebuildFocuses, state.rebuildFocuses);
    assert.equal(hasOpenNextAction(unlinked, focusId), false, 'a removed link is inert');
  });

  test('integrity: a link to a missing Focus or a missing target, or the same live link twice, is refused on load', () => {
    let state = withFocus();
    const focusId = onlyFocus(state).id;
    state = addNextStep(state, ctx({ createId: (p) => `${p}-i` }), { focusId, title: 'Walk at lunch', categoryId: PERSONAL_CATEGORY });
    const link = state.rebuildFocusLinks[0];
    const orphan = { ...state, rebuildFocusLinks: [{ ...link, focusId: 'focus-missing' }] };
    assert.equal(validateAppState(orphan).ok, false);
    const dangling = { ...state, rebuildFocusLinks: [{ ...link, target: { kind: 'task', id: 'task-missing' } }] };
    assert.equal(validateAppState(dangling).ok, false);
    const twice = { ...state, rebuildFocusLinks: [link, { ...link, id: 'focuslink-dup' }] };
    assert.equal(validateAppState(twice).ok, false);
  });
});

describe('[F11-M2] local-first persistence and relaunch', () => {
  test('create -> saved before shown -> relaunch -> the same Focus (same id, title, state)', async () => {
    const h = harness({ mode: 'empty' });
    const first = await launch(h);
    assert.equal(await first.commit((state, c) => addRebuildFocus(state, c, { id: 'focus-r1', title: 'Build a life outside work' })), true);
    const second = await launch(h);
    const focus = second.getSnapshot().state.rebuildFocuses.find((f) => f.id === 'focus-r1');
    assert.ok(focus, 'recovered after relaunch');
    assert.deepEqual({ title: focus.title, state: focus.state, scope: focus.scope }, { title: 'Build a life outside work', state: 'active', scope: 'personal' });
  });

  test('a household saved before Feature 11 (no rebuild collections at all) still loads, with no Focuses', () => {
    const legacy = stored(empty());
    const parsed = JSON.parse(legacy);
    delete parsed.data.rebuildFocuses;
    delete parsed.data.rebuildFocusLinks;
    const decoded = decodeStoredState(rawEnvelope(parsed.data));
    assert.equal(decoded.kind, 'valid', JSON.stringify(decoded));
    assert.deepEqual([decoded.state.rebuildFocuses, decoded.state.rebuildFocusLinks], [[], []]);
  });

  test('pause, rename and archive each survive a relaunch; the Task stays open throughout', async () => {
    const h = harness({ mode: 'empty' });
    let store = await launch(h);
    await store.commit((s, c) => addRebuildFocus(s, c, { id: 'focus-l', title: 'Feel organized in my own time' }));
    await store.commit((s, c) => addNextStep(s, { ...c, createId: (p) => `${p}-l` }, { focusId: 'focus-l', title: 'Sort the hall drawer', categoryId: PERSONAL_CATEGORY }));
    await store.commit((s, c) => pauseRebuildFocus(s, c, 'focus-l'));
    store = await launch(h);
    assert.equal(store.getSnapshot().state.rebuildFocuses[0].state, 'paused');
    await store.commit((s, c) => renameRebuildFocus(s, c, 'focus-l', 'My own time'));
    await store.commit((s, c) => archiveRebuildFocus(s, c, 'focus-l'));
    store = await launch(h);
    const s = store.getSnapshot().state;
    assert.deepEqual([s.rebuildFocuses[0].id, s.rebuildFocuses[0].title, s.rebuildFocuses[0].state], ['focus-l', 'My own time', 'archived']);
    assert.equal(s.tasks.find((t) => t.id === 'task-l').status, 'open');
    void DAY;
  });
});
