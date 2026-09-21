/**
 * HK-INTEGRATION-READINESS-01 / HA-001 — the store seam that makes "the change" and "the intent to send it" one durable fact.
 *
 * The store knows nothing about synchronization. It lets an observer stage an identity block beside every canonical state change
 * and persists both in ONE envelope write, and it offers `applySync` so a sync cycle can write against the CURRENT household.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { UNBOUND_IDENTITY } from '../../src/domain/account/binding.ts';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { createChangeObserver } from '../../src/domain/sync/changeObserver.ts';
import { emptyNamespace } from '../../src/domain/sync/syncTypes.ts';
import { STORAGE_KEYS, createAppStateRepository } from '../../src/persistence/appStateRepository.ts';
import { decodeStoredState, encodeStoredState } from '../../src/persistence/envelope.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

const TZ = 'America/Chicago';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
const DEVICE = '22222222-2222-4222-8222-222222222222';

const bound = () => ({
  ...UNBOUND_IDENTITY,
  binding: { accountId: ACCOUNT, householdId: HOUSEHOLD, boundAt: '2026-09-21T14:00:00.000Z', kind: 'claim', idMap: {} },
  sync: { ...emptyNamespace({ accountId: ACCOUNT, householdId: HOUSEHOLD, deviceId: DEVICE }), hydration: 'ready' },
});

const task = (title) => (state, ctx) => addTask(state, ctx, { title, categoryId: state.categories[0].id, scope: 'household', durationMinutes: 10, durationSource: 'user' });
const persisted = (storage) => decodeStoredState(storage.contents()[STORAGE_KEYS.primary]);

async function launch({ storage = createMemoryStorage({}), observe = createChangeObserver({ now: () => NOW }).observe, identity = bound(), seed = null } = {}) {
  if (seed !== null) {
    storage = createMemoryStorage({ [STORAGE_KEYS.primary]: encodeStoredState(seed, { appVersion: 't', savedAt: '2026-09-21T14:00:00.000Z', writeSeq: 1, identity }) });
  }
  const repository = createAppStateRepository({ storage, appVersion: 't', now: () => NOW, quarantineCorruptState: false });
  const store = createAppStore({ repository, mode: 'empty', now: () => NOW, timeZone: () => TZ, observe });
  await store.hydrate();
  if (seed === null) {
    store.setIdentity(identity);
    await store.saveIdentity();
  }
  await store.flush();
  return { store, storage, repository };
}

describe('the store persists a change and its sync intent in ONE envelope', () => {
  test('commit: the FIRST envelope that contains the new task already contains its queue item', async () => {
    const { store, storage } = await launch();
    await store.commit(task('one'));
    await store.flush();
    const writes = storage.writeLog.filter((w) => w.key === STORAGE_KEYS.primary && w.ok).map((w) => decodeStoredState(w.value));
    const first = writes.find((w) => w.state.tasks.length === 1);
    assert.ok(first, 'an envelope holding the task was written');
    assert.equal(first.identity.sync.queue.length, 1, 'and it already carries the intent: never one without the other');
  });

  test('dispatch stages the intent the same way', async () => {
    const { store, storage } = await launch();
    store.dispatch(task('via dispatch'));
    await store.flush();
    assert.equal(persisted(storage).identity.sync.queue.length, 1);
  });

  test('a change the store REFUSES leaves no intent behind', async () => {
    const { store, storage } = await launch();
    const refused = await store.commit((s) => ({ ...s, tasks: [{ ...s.tasks[0] }] })); // no such task shape: invalid
    void refused;
    const bad = await store.commit((s) => ({ ...s, tasks: [{ id: 'x' }] }));
    assert.equal(bad, false);
    await store.flush();
    assert.equal(persisted(storage).identity.sync.queue.length, 0);
  });

  test('a write that FAILS rolls the staged intent back with the change that was never shown', async () => {
    let attempts = 0;
    const storage = createMemoryStorage({}, { failWrite: (key) => key === STORAGE_KEYS.primary && ++attempts > 2 });
    const { store } = await launch({ storage });
    const before = store.getSnapshot().identity.sync.queue.length;
    const ok = await store.commit(task('will not be saved'));
    assert.equal(ok, false, 'the change was not shown');
    assert.equal(store.getSnapshot().state.tasks.length, 0);
    assert.equal(store.getSnapshot().identity.sync.queue.length, before);
    assert.equal(store.currentIdentity().sync.queue.length, before, 'and the repository does not hold a phantom queue item either');
  });

  test('an unbound household stages nothing and the same identity object stays', async () => {
    const { store } = await launch({ identity: UNBOUND_IDENTITY });
    await store.commit(task('local only'));
    assert.equal(store.getSnapshot().identity.sync, null);
  });
});

describe('what HYDRATION changes is a canonical change like any other', () => {
  test('a bound real household that decides today\'s One Move on launch queues that One Move', async () => {
    const c = { nowMs: NOW, today: '2026-09-21', createId: (p) => `${p}-1` };
    // One Moves are only decided once onboarding is complete.
    let s = toggleOnboardingOption(toggleOnboardingOption(toggleOnboardingOption(createEmptyState(TZ), 'goals', 'calmer-household'), 'strengths', 'cooking'), 'struggles', 'overcommitting');
    s = completeOnboarding(s, c);
    const seeded = addTask(s, c, { title: 'A task', categoryId: 'cat-home', scope: 'household', durationMinutes: 10, durationSource: 'user', plan: { kind: 'day', date: '2026-09-21' } });
    const { storage } = await launch({ seed: seeded });
    const back = persisted(storage);
    assert.ok(back.state.oneMoves.length >= 1, 'hydration decided a One Move');
    assert.ok(back.identity.sync.queue.some((item) => item.kind === 'oneMove'), 'and the decision was queued, in the same write');
  });
});

describe('applySync: a sync cycle writes against the CURRENT household', () => {
  test('work sees the state and identity as they are NOW and its result is durable and published', async () => {
    const { store, storage } = await launch();
    await store.commit(task('first'));
    let seen = null;
    const wrote = await store.applySync(({ state, identity }) => {
      seen = state.tasks.length;
      return { state, identity: { ...identity, sync: { ...identity.sync, cursor: '42' } } };
    });
    await store.flush();
    assert.equal(wrote, true);
    assert.equal(seen, 1, 'it ran against the state that includes the earlier commit');
    assert.equal(store.getSnapshot().identity.sync.cursor, '42');
    assert.equal(persisted(storage).identity.sync.cursor, '42');
  });

  test('a result that would be an invalid household is REFUSED and nothing changes', async () => {
    const { store, storage } = await launch();
    const writesBefore = storage.writeLog.length;
    const wrote = await store.applySync(({ state, identity }) => ({ state: { ...state, tasks: [{ id: 'not-a-task' }] }, identity }));
    assert.equal(wrote, false);
    assert.equal(store.getSnapshot().state.tasks.length, 0);
    assert.equal(storage.writeLog.length, writesBefore, 'nothing was written');
  });

  test('null work writes nothing at all', async () => {
    const { store, storage } = await launch();
    const writesBefore = storage.writeLog.length;
    assert.equal(await store.applySync(() => null), true);
    assert.equal(storage.writeLog.length, writesBefore);
  });

  test('it takes its turn: a commit already in flight lands first, and the work sees it', async () => {
    const { store } = await launch();
    const commit = store.commit(task('in flight'));
    let seen = -1;
    const sync = store.applySync(({ state, identity }) => {
      seen = state.tasks.length;
      return { state, identity };
    });
    await Promise.all([commit, sync]);
    assert.equal(seen, 1);
  });
});
