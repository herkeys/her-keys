/**
 * HK-FEATURE-06 / HM3 — LOADING != EMPTY != UNRECOVERED, proven against a REAL store hydrating real (damaged) storage.
 *
 * The store swaps in a FRESH household whenever saved data cannot be used. A Home that only read `state` would show that as an
 * empty Home — a reassuring screen about a house Her Keys could not read. These tests drive the actual store lifecycle.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { STORAGE_KEYS, createAppStateRepository } from '../../src/persistence/appStateRepository.ts';
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/envelope.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { buildHomeView } from '../../src/features/home/model/buildHomeView.ts';
import { homeReadiness, homeScreenState } from '../../src/features/home/model/readiness.ts';
import { commitHomeChange, createHomeTask } from '../../src/features/home/model/mutations.ts';
import { rawEnvelope } from '../support/fixtures.mjs';

const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const TZ = 'America/Chicago';

const open = (initial = {}, storageOptions = {}, { delayLoadMs = 0 } = {}) => {
  const storage = createMemoryStorage(initial, storageOptions);
  const repository = createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: true });
  const guarded = delayLoadMs === 0 ? repository : { ...repository, loadAppState: () => new Promise((resolve) => setTimeout(() => resolve(repository.loadAppState()), delayLoadMs)) };
  const store = createAppStore({ repository: guarded, mode: 'empty', now: () => NOW, timeZone: () => TZ });
  return { store, storage };
};

const screen = (store) => {
  const snapshot = store.getSnapshot();
  const readiness = homeReadiness(snapshot);
  const view = readiness.settled ? buildHomeView(snapshot.state, NOW) : null;
  return { readiness, view, state: homeScreenState(readiness, view) };
};

describe('B — LOADING is never EMPTY', () => {
  test('before hydration starts, and while it is in flight, Home is LOADING — even though a fresh household would be empty', async () => {
    const { store } = open({}, {}, { delayLoadMs: 30 });
    assert.equal(store.getSnapshot().status, 'unhydrated');
    assert.deepEqual(screen(store).state, { kind: 'loading' });

    const hydrating = store.hydrate();
    await Promise.resolve();
    assert.equal(store.getSnapshot().status, 'hydrating');
    assert.deepEqual(screen(store).state, { kind: 'loading' }, 'in flight: still loading');
    assert.equal(screen(store).readiness.settled, false);

    await hydrating;
    assert.equal(store.getSnapshot().status, 'ready');
    assert.deepEqual(screen(store).state, { kind: 'empty', anySaved: false }, 'only now is it the (honest) empty state');
  });
});

describe('C — an UNRECOVERED household is never shown as an empty Home', () => {
  test('C. corrupt saved data: the store starts over, Home says so, and it is NOT the plain empty state', async () => {
    const { store } = open({ [STORAGE_KEYS.primary]: '{ this is not json' });
    await store.hydrate();
    assert.equal(store.getSnapshot().status, 'recovery');
    const { readiness, state } = screen(store);
    assert.ok(readiness.recovery, 'the recovery is surfaced');
    assert.equal(readiness.recovery.quarantined, true, 'and Home knows the earlier data was kept aside');
    assert.equal(state.kind, 'unrecovered_empty');
    assert.notEqual(state.kind, 'empty');
  });

  test('a newer-version household cannot be read: recovery, memory-only, and never an empty Home', async () => {
    const { store } = open({ [STORAGE_KEYS.primary]: rawEnvelope({}, CURRENT_SCHEMA_VERSION + 5) });
    await store.hydrate();
    const { readiness, state } = screen(store);
    assert.equal(readiness.recovery.reason, 'future_version');
    assert.equal(readiness.memoryOnly, true, 'this session cannot make changes durable, and Home can say so');
    assert.equal(state.kind, 'unrecovered_empty');
  });

  test('unreadable storage: recovery, memory-only, and never an empty Home', async () => {
    const { store } = open({}, { failReads: true });
    await store.hydrate();
    const { readiness, state } = screen(store);
    assert.equal(readiness.recovery.reason, 'read_failed');
    assert.equal(readiness.memoryOnly, true);
    assert.equal(state.kind, 'unrecovered_empty');
  });

  test('after recovery she can still use Home — and the recovery notice does NOT go away just because a task now exists', async () => {
    const { store } = open({ [STORAGE_KEYS.primary]: 'garbage' });
    await store.hydrate();
    const saved = await commitHomeChange(store, (s, c) => createHomeTask(s, c, { title: 'First task after recovery', dueDate: null, notes: null, commitment: 'flexible', repeat: null }));
    assert.deepEqual(saved, { ok: true });
    const { readiness, state } = screen(store);
    assert.equal(state.kind, 'content');
    assert.ok(readiness.recovery, 'the screen still has to tell her the earlier household could not be read');
  });

  test('a healthy household has no recovery and is not memory-only', async () => {
    const { store } = open();
    await store.hydrate();
    const { readiness } = screen(store);
    assert.deepEqual([readiness.settled, readiness.recovery, readiness.memoryOnly], [true, null, false]);
  });

  test('a missing Home context after a settled load is its own state, not empty', async () => {
    const { store } = open();
    await store.hydrate();
    const snapshot = store.getSnapshot();
    const noHome = { ...snapshot.state, categories: snapshot.state.categories.filter((c) => c.systemRole !== 'home') };
    const readiness = homeReadiness(snapshot);
    assert.deepEqual(homeScreenState(readiness, buildHomeView(noHome, NOW)), { kind: 'missing_context' });
  });
});
