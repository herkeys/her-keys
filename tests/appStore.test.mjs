import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renameCategory } from '../src/domain/categories.ts';
import { approveDailyLoadMove, dailyLoadDecisionFor } from '../src/domain/dailyLoadDecisions.ts';
import { completeOnboarding, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { completeOneMove, oneMoveForDay, resolveOneMoveForToday } from '../src/domain/oneMove.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { DAY, NEXT_DAY, STORAGE_KEYS, demoState, harness, launch, nyMs, onboardedState, rawEnvelope, stored } from './support/fixtures.mjs';
import { finishOnboarding } from './support/store.mjs';

const categoryName = (data, id) => data.categories.find((c) => c.id === id).name;

describe('Hydration lifecycle', () => {
  test('moves from unhydrated through hydrating to ready, with no household state until ready', async () => {
    const store = harness().launch();
    const seen = [[store.getSnapshot().status, store.getSnapshot().state]];
    store.subscribe(() => {
      const { status, state } = store.getSnapshot();
      if (seen[seen.length - 1][0] !== status) seen.push([status, state]);
    });

    await store.hydrate();

    assert.deepEqual(seen.map(([status]) => status), ['unhydrated', 'hydrating', 'ready']);
    assert.equal(seen[0][1], null);
    assert.equal(seen[1][1], null);
    assert.notEqual(seen[2][1], null);
  });

  test('a first launch seeds the demo household for today, onboarding not started, in exactly one write', async () => {
    const h = harness();
    const { status, today, state } = (await launch(h)).getSnapshot();

    assert.equal(status, 'ready');
    assert.equal(today, DAY);
    assert.equal(state.origin, 'demo');
    assert.deepEqual([state.onboarding.lastStep, state.onboarding.completedAt], [null, null]);
    assert.equal(h.primaryWrites().length, 1);
    assert.equal(h.readPrimary().writeSeq, 1);
  });

  test('hydrating again — as a remount or StrictMode double effect would — loads once and writes once', async () => {
    const h = harness();
    const store = h.launch();
    const first = store.hydrate();
    const second = store.hydrate();

    assert.equal(first, second);
    await first;
    await store.hydrate();
    await store.flush();

    assert.equal(h.storage.readCount(), 1);
    assert.equal(h.primaryWrites().length, 1);
  });

  test('relaunching with valid state writes nothing, and numbering continues from the stored sequence', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState(), 5) } });
    const store = await launch(h);

    assert.equal(store.getSnapshot().status, 'ready');
    assert.equal(h.storage.writeLog.length, 0);

    store.dispatch((state) => renameCategory(state, 'cat-kids', 'Children'));
    await store.flush();
    assert.equal(h.readPrimary().writeSeq, 6);
  });

  test('a burst of actions costs at most two writes, and the newest state is what lands', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    const store = await launch(h);

    for (let i = 0; i < 25; i++) store.dispatch((state) => renameCategory(state, 'cat-home', `House ${i}`));
    await store.flush();

    assert.ok(h.primaryWrites().length <= 2, `${h.primaryWrites().length} writes`);
    assert.equal(categoryName(h.readPrimary().data, 'cat-home'), 'House 24');
  });

  test('an action that changes nothing is not written', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    const store = await launch(h);
    store.dispatch((state) => renameCategory(state, 'cat-home', 'Home'));
    await store.flush();
    assert.equal(h.storage.writeLog.length, 0);
  });

  test('commit saves a change before showing it', async () => {
    const h = harness({ storageOptions: { writeDelayMs: () => 15 } });
    const store = await launch(h);
    for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) {
      store.dispatch((state) => toggleOnboardingOption(state, group, id));
    }
    await store.flush();

    const done = store.commit((state, ctx) => resolveOneMoveForToday(completeOnboarding(state, ctx), ctx));
    assert.equal(store.getSnapshot().state.onboarding.completedAt, null);
    assert.equal(h.readPrimary().data.onboarding.completedAt, null);

    await done;
    assert.notEqual(h.readPrimary().data.onboarding.completedAt, null);
    assert.notEqual(store.getSnapshot().state.onboarding.completedAt, null);
  });
});

describe('Recovery from unusable stored state', () => {
  const demo = demoState();
  const cases = [
    ['malformed JSON', '{"schemaVersion":1,', 'malformed_json'],
    ['missing schema version', JSON.stringify({ data: demo }), 'missing_schema_version'],
    ['partial snapshot', rawEnvelope({ household: demo.household, user: demo.user }), 'invalid_state'],
    ['impossible values', rawEnvelope({ ...demo, tasks: demo.tasks.map((t) => ({ ...t, durationMinutes: -30 })) }), 'invalid_state'],
    ['invalid ids', rawEnvelope({ ...demo, events: demo.events.map((e) => ({ ...e, id: '__proto__' })) }), 'invalid_state'],
    ['dangling category', rawEnvelope({ ...demo, tasks: demo.tasks.map((t, i) => (i === 0 ? { ...t, categoryId: 'cat-missing' } : t)) }), 'integrity_violation'],
  ];

  for (const [name, raw, reason] of cases) {
    test(`${name}: recovers to a fresh household through the normal launch path`, async () => {
      const h = harness({ initial: { [STORAGE_KEYS.primary]: raw } });
      const snapshot = (await launch(h)).getSnapshot();

      assert.equal(snapshot.status, 'recovery');
      assert.deepEqual(snapshot.recovery, { reason, quarantined: true });
      // Exactly what a first launch produces — no special recovery state.
      assert.deepEqual(snapshot.state, (await launch(harness())).getSnapshot().state);
      assert.equal(h.primaryWrites().length, 1);
      assert.equal(JSON.parse(h.storage.contents()[STORAGE_KEYS.corrupt]).raw, raw);
      assert.ok(h.diagnostics.some((event) => event.type === 'recovered' && event.reason === reason));

      assert.equal((await launch(h)).getSnapshot().status, 'ready', 'the next launch loads cleanly');
    });
  }

  test('a newer schema version is left untouched: no primary writes for the whole session', async () => {
    const newer = rawEnvelope({ writtenBy: 'a newer app' }, 2);
    const h = harness({ initial: { [STORAGE_KEYS.primary]: newer } });
    const store = await launch(h);
    const snapshot = store.getSnapshot();

    assert.equal(snapshot.status, 'recovery');
    assert.deepEqual(snapshot.recovery, { reason: 'future_version', quarantined: true });
    assert.deepEqual([snapshot.persistence, snapshot.persistenceDegraded], ['disabled', true]);

    store.dispatch((state) => toggleOnboardingOption(state, 'goals', 'calmer-household'));
    assert.equal(await store.reset(), false, 'reset is refused rather than overwriting newer data');
    await store.flush();

    assert.equal(h.primaryWrites().length, 0);
    assert.equal(h.storage.contents()[STORAGE_KEYS.primary], newer);
    assert.equal(h.storage.contents()[STORAGE_KEYS.future], newer);
  });

  test('storage that cannot be read is never overwritten', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) }, storageOptions: { failReads: true } });
    const store = await launch(h);

    assert.deepEqual(store.getSnapshot().recovery, { reason: 'read_failed', quarantined: false });
    store.dispatch((state) => toggleOnboardingOption(state, 'goals', 'calmer-household'));
    await store.flush();
    assert.equal(h.storage.writeLog.length, 0);
  });

  test('a build for real users never shows a demo household left behind by a demo build', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) }, mode: 'empty' });
    const { status, recovery, state } = (await launch(h)).getSnapshot();

    assert.equal(status, 'recovery');
    assert.deepEqual(recovery, { reason: 'mode_mismatch', quarantined: false });
    assert.equal(state.origin, 'empty');
    assert.deepEqual([state.user.displayName, state.household.displayName, state.children, state.events, state.tasks], [null, null, [], [], []]);
    assert.doesNotMatch(JSON.stringify(h.readPrimary()), /Maren|Josie|Ellis/);
  });

  test('answers the app no longer offers are let go without discarding the household', async () => {
    const base = onboardedState();
    const outdated = {
      ...base,
      onboarding: { ...base.onboarding, goalIds: ['calmer-household', 'retired-goal'] },
      discovery: { id: 'discovery-1', topicId: 'overload', answers: [{ questionId: 'overload-when', optionId: 'no-longer-offered' }], scope: 'personal' },
    };
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(outdated) } });
    const snapshot = (await launch(h)).getSnapshot();

    assert.equal(snapshot.status, 'ready');
    assert.equal(snapshot.diagnostics.repairs.length, 2);
    assert.deepEqual(snapshot.state.onboarding.goalIds, ['calmer-household']);
    assert.equal(snapshot.state.discovery, null);
    assert.deepEqual(snapshot.state.events, base.events);
    assert.equal(h.primaryWrites().length, 1);
  });
});

describe('Write failures', () => {
  test('memory stays authoritative, degraded is reported after repeated failures, and a later write catches up', async () => {
    let failing = false;
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) }, storageOptions: { failWrite: () => failing } });
    const store = await launch(h);
    failing = true;

    store.dispatch((state) => renameCategory(state, 'cat-home', 'House'));
    await store.flush();
    assert.equal(store.getSnapshot().persistenceDegraded, false, 'one failed cycle');

    store.dispatch((state) => renameCategory(state, 'cat-money', 'Budget'));
    await store.flush();
    assert.equal(store.getSnapshot().persistenceDegraded, true);
    assert.equal(categoryName(store.getSnapshot().state, 'cat-home'), 'House');
    assert.equal(categoryName(h.readPrimary().data, 'cat-home'), 'Home', 'nothing claims to be saved');

    failing = false;
    store.dispatch((state) => renameCategory(state, 'cat-meals', 'Food'));
    await store.flush();
    assert.equal(store.getSnapshot().persistenceDegraded, false);
    assert.deepEqual(['cat-home', 'cat-money', 'cat-meals'].map((id) => categoryName(h.readPrimary().data, id)), ['House', 'Budget', 'Food']);
    assert.ok(h.diagnostics.some((event) => event.type === 'persistence_degraded'));
  });
});

describe('Demo reset', () => {
  test('restores the demo household for today with onboarding back at the start, the same way every time', async () => {
    const h = harness();
    const store = await launch(h);
    await finishOnboarding(store);
    store.dispatch((state, ctx) => approveDailyLoadMove(state, ctx, 'task-2'));
    store.dispatch((state) => renameCategory(state, 'cat-kids', 'Children'));
    await store.flush();

    await store.reset();
    const once = store.getSnapshot().state;
    await store.reset();

    assert.deepEqual(once, demoState());
    assert.deepEqual(store.getSnapshot().state, once);
    assert.equal(store.getSnapshot().status, 'ready');
    assert.deepEqual(h.readPrimary().data, demoState());
  });

  test('reset re-anchors the demo to the current day', async () => {
    const h = harness();
    const store = await launch(h);
    h.clock.now = nyMs(10, 0, 17);
    await store.reset();

    const { today, state } = store.getSnapshot();
    assert.equal(today, NEXT_DAY);
    assert.equal(projectStateDay(state, NEXT_DAY).events.length, 4);
    assert.equal(projectStateDay(state, DAY).events.length, 0);
  });
});

describe('Day rollover', () => {
  test('a new day keeps yesterday as history and decides today afresh', async () => {
    const h = harness();
    let store = await launch(h);
    await finishOnboarding(store);
    store.dispatch((state, ctx) => approveDailyLoadMove(state, ctx, 'task-2'));
    store.dispatch((state, ctx) => completeOneMove(state, ctx));
    await store.flush();

    h.clock.now = nyMs(9, 0, 17);
    store = await launch(h);
    const { state, today } = store.getSnapshot();

    assert.equal(today, NEXT_DAY);
    assert.equal(state.oneMoves.find((r) => r.forDate === DAY).status, 'completed');
    assert.equal(oneMoveForDay(state, NEXT_DAY).status, 'none', 'the only demo move is already done');
    assert.equal(dailyLoadDecisionFor(state, DAY).decision, 'moved');
    assert.equal(dailyLoadDecisionFor(state, NEXT_DAY).decision, 'pending');
    assert.deepEqual(projectStateDay(state, NEXT_DAY).tasks.map((t) => [t.id, t.dueToday]), [['task-1', true], ['task-2', false]]);
  });

  test("yesterday's unfinished One Move doesn't become today's — today gets its own decision", async () => {
    const h = harness();
    let store = await launch(h);
    await finishOnboarding(store);

    h.clock.now = nyMs(9, 0, 17);
    store = await launch(h);
    const { oneMoves } = store.getSnapshot().state;

    assert.deepEqual(oneMoves.map((r) => [r.id, r.status]), [['onemove-2026-09-16', 'selected'], ['onemove-2026-09-17', 'selected']]);
    assert.equal(oneMoves[1].decidedAt, new Date(nyMs(9, 0, 17)).toISOString());
  });

  test('midnight passing while the app stays open is picked up', async () => {
    const h = harness();
    const store = await launch(h);
    await finishOnboarding(store);
    const writes = h.primaryWrites().length;

    h.clock.now = nyMs(0, 5, 17);
    store.refreshDay();
    await store.flush();

    assert.equal(store.getSnapshot().today, NEXT_DAY);
    assert.ok(store.getSnapshot().state.oneMoves.some((r) => r.forDate === NEXT_DAY));
    assert.equal(h.primaryWrites().length, writes + 1);
  });
});
