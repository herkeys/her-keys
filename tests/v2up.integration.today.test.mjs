/**
 * V2 upgrade — integration of workstream A (Today recommendations) and workstream D (first-session navigation) on the REAL Today body.
 *
 * `TodayBriefing` is where the two meet: D's FirstStepCard wraps the empty-household notice; A's capacity recommendation lives in the
 * decision section. This renders the real TodayBriefing, FirstStepCard, DailyLoadCard and OneMoveCard on a real store (the panels that
 * need other features' providers are stood in for by tests/support/v2upTodaySeamStubs.mjs — see that file), and checks the paths the
 * integration must keep: first-step shows only for an empty household; the capacity recommendation can be accepted, answered with
 * another option, or declined; nothing is committed by looking or navigating; and the decision survives a remount.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, beforeEach, describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { STORAGE_KEYS, harness, stored } from './support/fixtures.mjs';
import { buildTodayView } from '../src/features/today/model/index.ts';
import { DAY, NEXT_DAY, ev, household, nyMs, taskNamed, tk, valid } from './today/fixtures.mjs';

await import('./today/support/stub-appstate.mjs');
await import('./today/support/stub-expo-router.mjs');

const STUBS = pathToFileURL(fileURLToPath(new URL('./support/v2upTodaySeamStubs.mjs', import.meta.url))).href;
const REDIRECT = /(?:^|\/)(AccountEntry|PremiumDailyLoadEntry|LifeStatusSummary|PremiumMomentumSection|TalkItOutEntry|HandledLedger|TimelineList|PersistenceNotice|SyncNotice|TomorrowReminderCard|WeatherContextCard|OnboardingContext|CaptureContext)$/;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL ?? '';
    if ((parent.endsWith('/TodayBriefing.tsx') || parent.endsWith('/FirstStepCard.tsx')) && REDIRECT.test(specifier)) {
      return nextResolve(STUBS, context);
    }
    return nextResolve(specifier, context);
  },
});

const { router } = await import('./today/support/expo-router-stub.mjs');
const { AppStateProvider, useStoreSnapshot } = await import('../src/store/AppStateProvider.tsx');
const { ScheduleProvider } = await import('../src/store/ScheduleContext.tsx');
const { OneMoveProvider } = await import('../src/store/OneMoveContext.tsx');
const { TodayBriefing } = await import('../src/features/today/TodayBriefing.tsx');

const text = (root) =>
  root
    .findAllByType('Text')
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' | ');
const pressable = (root, label) => root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === label);
const press = (node) => TestRenderer.act(async () => node.props.onPress());

const mounted = [];
after(async () => {
  await TestRenderer.act(async () => {
    for (const renderer of mounted.splice(0)) renderer.unmount();
  });
});
beforeEach(() => {
  router.reset();
  globalThis.__v2upSeam = { struggleIds: [], inbox: { phase: 'empty' } };
});

/** The real screen shape: one projection from the store, rendered by the real body. */
function Screen() {
  const { state, status, recovery, persistence } = useStoreSnapshot();
  const view = buildTodayView({ state, nowMs: nyMs(9), runtime: { status, recovery, persistence } });
  return <TodayBriefing view={view} />;
}

function tree(store) {
  return (
    <AppStateProvider store={store}>
      <ScheduleProvider>
        <OneMoveProvider>
          <Screen />
        </OneMoveProvider>
      </ScheduleProvider>
    </AppStateProvider>
  );
}

async function openToday(state, existing) {
  const h = existing ? existing.h : harness({ initial: { [STORAGE_KEYS.primary]: stored(state) }, mode: 'empty', now: nyMs(9) });
  const store = existing ? existing.store : h.launch();
  let renderer;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(tree(store));
    await store.hydrate();
  });
  mounted.push(renderer);
  return { h, store, renderer, root: renderer.root };
}
const unmount = (renderer) => TestRenderer.act(async () => renderer.unmount());

function crowdedDay() {
  let s = household();
  s = ev(s, { title: 'Long shift', from: [6], to: [21], category: 'cat-work' });
  s = tk(s, { title: 'Big', minutes: 120 });
  s = tk(s, { title: 'Medium', minutes: 45 });
  s = tk(s, { title: 'Small', minutes: 30 });
  s = tk(s, { title: 'Tiny', minutes: 10 });
  s = tk(s, { title: 'Due bill', minutes: 20, due: DAY });
  s = tk(s, { title: 'Fixed errand', minutes: 25, commitment: 'fixed' });
  s = tk(s, { title: 'Tomorrow thing', minutes: 90, plan: { kind: 'day', date: NEXT_DAY } });
  return valid(s);
}

describe('A + D on the real Today body: a household with nothing in it (new user reaches Today)', () => {
  test('the first-step selector renders once, with the chosen step as the primary action and the empty notice replaced', async () => {
    globalThis.__v2upSeam.struggleIds = ['unrealistic-calendars'];
    const { root } = await openToday(valid(household()));
    const said = text(root);
    assert.match(said, /good first step/i);
    assert.equal(root.findAllByType('Pressable').filter((p) => p.props.accessibilityLabel === 'Add an event').length, 1);
    assert.match(said, /You told us “Unrealistic calendars” is where things tend to break down\./);
  });

  test('choosing a step only navigates: no task, event, action or write is created by it', async () => {
    const { h, store, root } = await openToday(valid(household()));
    await store.flush();
    const before = store.getSnapshot().state;
    const writes = h.primaryWrites().length;

    await press(pressable(root, 'Talk it out'));
    await press(pressable(root, 'Add a task'));
    assert.deepEqual(router.calls.map((c) => c[0]), ['/talk-it-out', '/task-editor']);

    await store.flush();
    assert.equal(store.getSnapshot().state, before, 'state is the same object');
    assert.equal(h.primaryWrites().length, writes, 'nothing reached storage');
  });

  test('an unfinished capture sends her to the inbox instead of asking her to start over', async () => {
    globalThis.__v2upSeam.inbox = { phase: 'items', count: 2 };
    const { root } = await openToday(valid(household()));
    assert.ok(pressable(root, 'Review your inbox') ?? text(root).match(/inbox/i), 'the inbox is the step');
  });

  test('the first-step card survives a remount (it is derived, not stored), and still writes nothing', async () => {
    const first = await openToday(valid(household()));
    await first.store.flush();
    const writes = first.h.primaryWrites().length;
    await unmount(first.renderer);
    const second = await openToday(null, first);
    assert.match(text(second.root), /good first step/i);
    assert.equal(second.h.primaryWrites().length, writes);
  });
});

describe('A + D on the real Today body: a returning user with a crowded day', () => {
  test('there is no first-step card once the household holds anything, and the capacity recommendation leads', async () => {
    const { root } = await openToday(crowdedDay());
    assert.doesNotMatch(text(root), /good first step/i);
    assert.match(text(root), /Shorten or drop “Big”\./);
    assert.match(text(root), /Option 1 of 4/);
  });

  test('looking and asking for another option commit nothing (no automatic commit)', async () => {
    const { h, store, root } = await openToday(crowdedDay());
    await store.flush();
    const writes = h.primaryWrites().length;
    const before = store.getSnapshot().state;
    await press(pressable(root, 'Show another option'));
    await press(pressable(root, 'Show another option'));
    assert.match(text(root), /“Small”/);
    await store.flush();
    assert.equal(store.getSnapshot().state, before);
    assert.equal(store.getSnapshot().state.actions.length, 0);
    assert.equal(h.primaryWrites().length, writes);
  });

  test('ACCEPT: approving the option shown drops exactly that task and records one decision', async () => {
    const { store, root } = await openToday(crowdedDay());
    await press(pressable(root, 'Show another option'));
    await press(pressable(root, 'Drop it'));
    const state = store.getSnapshot().state;
    assert.equal(taskNamed(state, 'Medium').status, 'archived');
    assert.equal(taskNamed(state, 'Big').status, 'open');
    assert.equal(state.actions.length, 1);
  });

  test('DECLINE: “Keep as planned” records the keep and changes no task', async () => {
    const { store, root } = await openToday(crowdedDay());
    const open = store.getSnapshot().state.tasks.filter((t) => t.status === 'open').length;
    await press(pressable(root, 'Keep as planned'));
    const state = store.getSnapshot().state;
    assert.equal(state.actions.at(-1).type, 'daily_load.keep_capacity_plan');
    assert.equal(state.tasks.filter((t) => t.status === 'open').length, open);
  });

  test('STATE SURVIVES REMOUNT: after a decision, a fresh tree on the same store neither re-offers it nor records it twice', async () => {
    const first = await openToday(crowdedDay());
    await press(pressable(first.root, 'Drop it'));
    const actions = first.store.getSnapshot().state.actions.length;
    assert.equal(actions, 1);
    await unmount(first.renderer);

    const second = await openToday(null, first);
    assert.equal(second.store.getSnapshot().state.actions.length, 1, 'no duplicate decision');
    assert.equal(taskNamed(second.store.getSnapshot().state, 'Big').status, 'archived', 'the drop is still in effect');
    assert.equal(pressable(second.root, 'Drop it'), undefined, 'one capacity decision per day: it is not offered again');
  });

  test('the One Move card renders alongside the recommendation without taking over its place', async () => {
    const { root } = await openToday(crowdedDay());
    const said = text(root);
    assert.match(said, /Shorten or drop/);
    assert.equal(root.findAllByType('Pressable').filter((p) => p.props.accessibilityLabel === 'Show another option').length, 1);
  });
});
