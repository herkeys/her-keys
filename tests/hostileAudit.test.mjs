import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addCategory, archiveCategory, renameCategory, reorderCategories, restoreCategory } from '../src/domain/categories.ts';
import { approveDailyLoadMove } from '../src/domain/dailyLoadDecisions.ts';
import { applyDiscoveryConversation, clearDiscovery, replayDiscovery } from '../src/domain/discovery.ts';
import { addDays, logicalDateAt } from '../src/domain/logicalDay.ts';
import { completeOneMove } from '../src/domain/oneMove.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { validateAppState } from '../src/domain/state.ts';
import { advance, createInitialState } from '../src/features/talk-it-out/engine.ts';
import { createAppStateRepository } from '../src/persistence/appStateRepository.ts';
import { createMemoryStorage } from '../src/persistence/storageAdapter.ts';
import { createAppStore } from '../src/state/appStore.ts';
import {
  DAY,
  MORNING,
  NEXT_DAY,
  STORAGE_KEYS,
  TZ,
  ctx,
  demoState,
  harness,
  launch,
  nyMs,
  onboardedState,
  rawEnvelope,
  stored,
} from './support/fixtures.mjs';

const categoryName = (state, id) => state.categories.find((category) => category.id === id)?.name;

describe('Hostile persistence sequencing', () => {
  test('a completely failed cycle is followed by a successful latest-state catch-up', async () => {
    let primaryAttempts = 0;
    const h = harness({
      initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) },
      storageOptions: {
        failWrite: (key) => key === STORAGE_KEYS.primary && ++primaryAttempts <= 2,
      },
    });
    const store = await launch(h);

    store.dispatch((state) => renameCategory(state, 'cat-home', 'Household'));
    await store.flush();
    assert.equal(categoryName(h.readPrimary().data, 'cat-home'), 'Home');

    store.dispatch((state) => renameCategory(state, 'cat-money', 'Household Finances'));
    await store.flush();
    assert.deepEqual(
      ['cat-home', 'cat-money'].map((id) => categoryName(h.readPrimary().data, id)),
      ['Household', 'Household Finances']
    );
    assert.equal(primaryAttempts, 3);
  });

  test('state can change while an old snapshot writes, but only the newest snapshot becomes canonical', async () => {
    const h = harness({
      initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) },
      storageOptions: { writeDelayMs: (key, attempt) => (key === STORAGE_KEYS.primary && attempt === 1 ? 25 : 0) },
    });
    const store = await launch(h);

    store.dispatch((state) => renameCategory(state, 'cat-home', 'Household'));
    await new Promise((resolve) => setTimeout(resolve, 2));
    store.dispatch((state) => renameCategory(state, 'cat-money', 'Household Finances'));
    await store.flush();

    assert.deepEqual(
      ['cat-home', 'cat-money'].map((id) => categoryName(h.readPrimary().data, id)),
      ['Household', 'Household Finances']
    );
    assert.deepEqual(h.primaryWrites().map((write) => write.ok), [true, true]);
  });

  test('Daily Load and One Move publish before native persistence settles, making the durability window explicit', async () => {
    const h = harness({
      initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) },
      storageOptions: { writeDelayMs: (key) => (key === STORAGE_KEYS.primary ? 30 : 0) },
    });
    const store = await launch(h);

    store.dispatch((state, context) => approveDailyLoadMove(state, context, 'task-2'));
    store.dispatch((state, context) => completeOneMove(state, context));

    assert.deepEqual(store.getSnapshot().state.tasks.find((task) => task.id === 'task-2').plan, { kind: 'day', date: NEXT_DAY });
    assert.equal(store.getSnapshot().state.oneMoves[0].status, 'completed');
    assert.equal(h.readPrimary().data.tasks.find((task) => task.id === 'task-2').plan.kind, 'timed');
    assert.equal(h.readPrimary().data.oneMoves[0].status, 'selected');

    await store.flush();
    assert.deepEqual(h.readPrimary().data.tasks.find((task) => task.id === 'task-2').plan, { kind: 'day', date: NEXT_DAY });
    assert.equal(h.readPrimary().data.oneMoves[0].status, 'completed');
  });
});

describe('Hostile hydration and mode isolation', () => {
  test('concurrent and sequential hydrate calls share one delayed read and create no write', async () => {
    let release;
    let reads = 0;
    let saves = 0;
    const state = onboardedState();
    const repository = {
      loadAppState: async () => {
        reads += 1;
        await new Promise((resolve) => {
          release = resolve;
        });
        return { kind: 'loaded', state, writeSeq: 9, migratedFrom: null };
      },
      saveAppState: async () => {
        saves += 1;
      },
      // The store reads the identity the blob carried; a hand-built repository
      // has to answer that too, or it is not standing in for the real one.
      currentIdentity: () => UNBOUND_IDENTITY,
      setIdentity: () => {},
      resetAppState: async () => {},
    };
    const store = createAppStore({ repository, mode: 'demo', now: () => MORNING, timeZone: () => TZ });

    const first = store.hydrate();
    const second = store.hydrate();
    assert.equal(first, second);
    assert.equal(store.getSnapshot().status, 'hydrating');
    release();
    await first;
    await store.hydrate();
    await store.flush();

    assert.deepEqual([reads, saves, store.getSnapshot().state.oneMoves.length], [1, 0, 1]);
  });

  test('demo to empty to demo never carries the opposite origin across the boundary', async () => {
    const storage = createMemoryStorage();
    const repository = createAppStateRepository({
      storage,
      appVersion: '1.0.0-test',
      now: () => MORNING,
      quarantineCorruptState: true,
    });
    const start = async (mode) => {
      const store = createAppStore({ repository, mode, now: () => MORNING, timeZone: () => TZ });
      await store.hydrate();
      await store.flush();
      return store.getSnapshot();
    };

    const demo = await start('demo');
    const empty = await start('empty');
    const demoAgain = await start('demo');

    assert.equal(demo.state.origin, 'demo');
    assert.deepEqual([empty.state.origin, empty.state.user.displayName, empty.state.children.length, empty.state.tasks.length], ['empty', null, 0, 0]);
    assert.deepEqual([demoAgain.state.origin, demoAgain.state.user.displayName, demoAgain.state.children.length], ['demo', 'Maren Ellis', 2]);
    assert.equal(JSON.parse(storage.contents()[STORAGE_KEYS.primary]).data.origin, 'empty', 'the demo return preserves real-user storage');
    assert.equal(demoAgain.persistence, 'disabled');
  });

  test('a future-version launch in empty mode exposes no household facts and writes the primary key zero times', async () => {
    const newer = rawEnvelope({ user: 'from a newer app', privateFacts: ['never interpret me'] }, 99);
    const h = harness({ initial: { [STORAGE_KEYS.primary]: newer }, mode: 'empty' });
    const store = await launch(h);

    assert.deepEqual(
      [store.getSnapshot().state.origin, store.getSnapshot().state.user.displayName, store.getSnapshot().state.children.length, store.getSnapshot().state.tasks.length],
      ['empty', null, 0, 0]
    );
    store.dispatch((state) => renameCategory(state, 'cat-home', 'Household'));
    assert.equal(await store.reset(), false);
    await store.flush();
    assert.equal(h.primaryWrites().length, 0);
    assert.equal(h.storage.contents()[STORAGE_KEYS.primary], newer);
  });
});

describe('Hostile logical-day behavior', () => {
  test('23:59, 00:00 and 00:01 switch logical authority exactly at local midnight', () => {
    assert.equal(logicalDateAt(nyMs(23, 59), TZ), DAY);
    assert.equal(logicalDateAt(nyMs(0, 0, 17), TZ), NEXT_DAY);
    assert.equal(logicalDateAt(nyMs(0, 1, 17), TZ), NEXT_DAY);
  });

  test('foregrounding after several days keeps history and initializes only the current day', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    const store = await launch(h);
    store.dispatch((state, context) => completeOneMove(state, context));
    await store.flush();

    h.clock.now = nyMs(9, 0, 20);
    store.refreshDay();
    store.refreshDay();
    await store.flush();

    const { state, today } = store.getSnapshot();
    assert.equal(today, '2026-09-20');
    assert.equal(state.oneMoves.find((record) => record.forDate === DAY).status, 'completed');
    assert.equal(state.oneMoves.filter((record) => record.forDate === '2026-09-20').length, 0, 'the one catalog move was already completed');
    assert.equal(state.oneMoves.some((record) => record.forDate === '2026-09-17'), false, 'absence days are not fabricated');
  });

  test('overdue facts stay on their original date and cannot be approved for an automatic move', () => {
    const base = onboardedState();
    const overdue = {
      ...base,
      tasks: base.tasks.map((task) => (task.id === 'task-2' ? { ...task, dueDate: addDays(DAY, -1) } : task)),
    };
    assert.equal(projectStateDay(overdue, DAY).tasks.find((task) => task.id === 'task-2').dueToday, true);
    assert.equal(approveDailyLoadMove(overdue, ctx(), 'task-2'), overdue);
  });
});

describe('Hostile category, history and privacy behavior', () => {
  test('rename, duplicate display name, archive, restore and reorder survive one persisted state', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    let store = await launch(h);
    store.dispatch((state) => renameCategory(state, 'cat-kids', 'Family'));
    store.dispatch((state) => renameCategory(state, 'cat-money', 'Household Finances'));
    store.dispatch((state, context) => addCategory(state, context, { name: 'Money', scope: 'household' }));
    store.dispatch((state, context) => addCategory(state, context, { name: 'Pets', scope: 'household' }));
    const petsId = store.getSnapshot().state.categories.find((category) => category.name === 'Pets').id;
    const customMoneyId = store.getSnapshot().state.categories.find((category) => category.name === 'Money' && category.id !== 'cat-money').id;
    store.dispatch((state) => archiveCategory(state, 'cat-kids'));
    store.dispatch((state) => restoreCategory(state, 'cat-kids'));
    store.dispatch((state) => reorderCategories(state, [petsId, ...state.categories.map((category) => category.id).filter((id) => id !== petsId)]));
    await store.flush();

    store = await launch(h);
    const state = store.getSnapshot().state;
    assert.deepEqual([categoryName(state, 'cat-kids'), categoryName(state, 'cat-money')], ['Family', 'Household Finances']);
    assert.equal(state.categories.find((category) => category.id === customMoneyId).systemRole, null);
    assert.equal(state.categories.find((category) => category.id === petsId).systemRole, null);
    assert.equal(state.categories.find((category) => category.id === petsId).sortOrder, 0);
    assert.equal(state.categories.find((category) => category.id === 'cat-kids').status, 'active');
    assert.equal(state.tasks.find((task) => task.id === 'task-3').categoryId, 'cat-kids');
    assert.equal(validateAppState(state).ok, true);
  });

  test('later fact changes never rewrite the historical Daily Load reason', () => {
    const moved = approveDailyLoadMove(onboardedState(), ctx(), 'task-2');
    const before = structuredClone(moved.actions[0].reason);
    const changed = {
      ...moved,
      events: moved.events.map((event) => (event.id === 'evt-3' ? { ...event, title: 'Renamed practice' } : event)),
      tasks: moved.tasks.map((task) => (task.id === 'task-2' ? { ...task, durationMinutes: 5 } : task)),
    };
    assert.deepEqual(changed.actions[0].reason, before);
  });

  test('prototype-looking and very long unmatched Talk It Out input never enters persisted state', () => {
    let state = demoState();
    for (const value of ['__proto__', 'constructor', 'x'.repeat(100_000)]) {
      const turn = advance(createInitialState(), value, value);
      assert.equal(turn.state.topicId, null);
      assert.equal(applyDiscoveryConversation(state, ctx(), turn.state), state);
    }
    assert.equal({}.polluted, undefined);
  });

  test('corrupted Talk It Out ids are refused and repeated Start Over stays idempotent', () => {
    const base = { id: 'discovery-1', topicId: 'overload', answers: [], scope: 'personal' };
    for (const record of [
      { ...base, topicId: 'constructor' },
      { ...base, answers: [{ questionId: 'constructor', optionId: 'pickup' }] },
      { ...base, answers: [{ questionId: 'overload-when', optionId: '__proto__' }] },
    ]) {
      assert.equal(replayDiscovery(record), null);
    }
    const withDiscovery = { ...demoState(), discovery: base };
    const cleared = clearDiscovery(withDiscovery);
    assert.equal(cleared.discovery, null);
    assert.equal(clearDiscovery(cleared), cleared);
  });
});
