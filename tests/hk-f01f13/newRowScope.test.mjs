/**
 * HK13-D14 (P2) — a new row takes its CATEGORY's visibility (HK-F01-F13 integration audit).
 *
 * Every category carries the scope the household gave it: Work is `professional`, Wellbeing and Relationships are `personal`,
 * Co-parenting is `coparent-shared` — all owner-only in the cloud (`private.can_access_scoped_row`). Each feature's own flows already
 * honour that (F07, F10, F11, F12, F13). The generic editors did not: a task or event added from Today, Calendar, the Work screen or a
 * Needs Me promotion, and a Talk It Out capture she accepted, were ALWAYS `household` — visible to every member of the household,
 * whatever private category she filed them under (F07 recorded it as MP-07-14 / HK-INT-COPARENT-EVENTSCOPE-01 and left it to
 * integration). These hold the one rule, in the domain and through the real forms.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { scopeForNewRow } from '../../src/domain/categories.ts';
import { acceptInterpretation, proposeInterpretation, recordArtifact } from '../../src/domain/interpretations.ts';
import { captureNeedsMeItem } from '../../src/domain/needsMe.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { addChildToHousehold } from '../../src/features/kids/mutations.ts';
import { DIGEST, at, real } from '../support/acceptance.mjs';
import { harness, launch } from '../support/fixtures.mjs';

await import('../today/support/stub-expo-router.mjs');
await import('../today/support/stub-appstate.mjs');
const { router } = await import('../today/support/expo-router-stub.mjs');
const { AppStateProvider } = await import('../../src/store/AppStateProvider.tsx');
const { TaskForm } = await import('../../src/features/tasks/TaskForm.tsx');
const { EventForm } = await import('../../src/features/calendar/EventForm.tsx');
router.back ??= (...args) => router.calls.push(['back', ...args]);

/** What each starter category declares, and so what a new row filed in it must be. */
const DECLARED = [
  ['Kids', 'cat-kids', 'household'],
  ['Home', 'cat-home', 'household'],
  ['Money', 'cat-money', 'household'],
  ['Meals', 'cat-meals', 'household'],
  ['Work', 'cat-work', 'professional'],
  ['Wellbeing', 'cat-wellbeing', 'personal'],
  ['Relationships', 'cat-relationships', 'personal'],
  ['Co-parenting', 'cat-coparenting', 'coparent-shared'],
];

const withChild = () => addChildToHousehold(real(), at(), { displayName: 'Maya', birthDate: '2016-04-02' });

describe('the rule', () => {
  test('a new row filed in a category gets that category\'s scope', () => {
    const state = real();
    for (const [, id, scope] of DECLARED) assert.equal(scopeForNewRow(state, id), scope, id);
  });

  test('a row about a child is child-scoped in a household category, and stays private in a private one', () => {
    const { state, childId } = withChild();
    assert.equal(scopeForNewRow(state, 'cat-kids', childId), 'child');
    assert.equal(scopeForNewRow(state, 'cat-coparenting', childId), 'coparent-shared', 'Co-parenting stays hers even about a child');
    assert.equal(scopeForNewRow(state, 'cat-wellbeing', childId), 'personal');
    assert.equal(scopeForNewRow(state, 'cat-home', state.user.id), 'household', 'the account holder is not a child');
    assert.equal(scopeForNewRow(state, 'no-such-category'), 'household', 'an unknown category falls back to the household default');
  });
});

describe('Talk It Out: an accepted capture takes the category she filed it under', () => {
  const accepted = (categoryId, subjectMemberId = null, base = real()) => {
    const r = recordArtifact(base, at(), { kind: 'email', origin: 'user-submitted', contentDigest: DIGEST(categoryId.slice(4, 5)) });
    let s = proposeInterpretation(r.state, at(), { artifactId: r.artifact.id, proposedKind: 'task', title: 'Book the appointment', subjectMemberId });
    s = acceptInterpretation(s, at(), s.interpretations.at(-1).id, { categoryId });
    return s.tasks.at(-1);
  };

  test('into each category, the accepted task has that category\'s scope', () => {
    for (const [, id, scope] of DECLARED) assert.equal(accepted(id).scope, scope, id);
  });

  test('a capture about a child, accepted under Kids, is child-scoped (unchanged)', () => {
    const { state, childId } = withChild();
    assert.equal(accepted('cat-kids', childId, state).scope, 'child');
  });
});

async function mountForm(element, setup = (s) => s) {
  const store = await launch(harness({ mode: 'empty', initial: {} }));
  await store.commit(() => setup(real()));
  await store.flush();
  let renderer;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<AppStateProvider store={store}>{element(store)}</AppStateProvider>);
  });
  return {
    store,
    root: renderer.root,
    state: () => store.getSnapshot().state,
    done: async () => {
      await store.flush();
      await TestRenderer.act(async () => renderer.unmount());
    },
  };
}
/** Always unmounts — even when an assertion fails — so the provider's minute timer never keeps the test process alive. */
async function withForm(element, setup, body) {
  const live = await mountForm(element, setup);
  try {
    await body(live);
  } finally {
    await live.done();
  }
}
const byLabel = (root, label) => {
  const found = root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === label);
  assert.ok(found, `a control labelled "${label}" is on screen`);
  return found;
};
const press = async (node) => TestRenderer.act(async () => node.props.onPress());
const typeInto = async (root, index, text) => {
  const input = root.findAllByType('TextInput')[index];
  await TestRenderer.act(async () => input.props.onChangeText(text));
};

describe('the generic editors, rendered against a real store', () => {
  test('a task added from the generic editor is filed with its category\'s visibility', async () => {
    for (const [name, , scope] of DECLARED) {
      await withForm(() => <TaskForm />, undefined, async (live) => {
        await typeInto(live.root, 0, `Something for ${name}`);
        await press(byLabel(live.root, name));
        await press(byLabel(live.root, 'Add task'));
        await live.store.flush();
        assert.equal(live.state().tasks.at(-1).scope, scope, `${name}: ${live.state().tasks.at(-1).scope}`);
      });
    }
  });

  test('an event added from Calendar is filed with its category\'s visibility', async () => {
    for (const [name, , scope] of DECLARED) {
      await withForm(() => <EventForm />, undefined, async (live) => {
        await typeInto(live.root, 0, `Appointment for ${name}`);
        await press(byLabel(live.root, name));
        await press(byLabel(live.root, 'Add event'));
        await live.store.flush();
        assert.equal(live.state().events.at(-1).scope, scope, `${name}: ${live.state().events.at(-1).scope}`);
      });
    }
  });

  test('a Needs Me item promoted to a task in Relationships is private to her', async () => {
    await withForm(
      (store) => <TaskForm needsMeId={store.getSnapshot().state.needsMe[0].id} />,
      (s) => captureNeedsMeItem(s, at(), { title: 'Call Jordan about the weekend' }),
      async (live) => {
        await press(byLabel(live.root, 'Relationships'));
        await press(byLabel(live.root, 'Add task'));
        await live.store.flush();
        const task = live.state().tasks.at(-1);
        assert.equal(task.title, 'Call Jordan about the weekend');
        assert.equal(task.scope, 'personal');
      },
    );
  });

  test('moving a PRIVATE task into a household category never widens it: an edit keeps the visibility it was created with', async () => {
    await withForm(
      (store) => <TaskForm taskId={store.getSnapshot().state.tasks[0].id} />,
      (s) => addTask(s, at(), { title: 'Therapy intake form', categoryId: 'cat-wellbeing', scope: 'personal' }),
      async (live) => {
        await press(byLabel(live.root, 'Home'));
        await press(byLabel(live.root, 'Save changes'));
        await live.store.flush();
        const [task] = live.state().tasks;
        assert.deepEqual([task.categoryId, task.scope], ['cat-home', 'personal']);
      },
    );
  });
});
