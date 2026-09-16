/**
 * Build 3 hostile audit — persistence, races and restart.
 *
 * Build 3 made `commit` the write path for every capture and recommendation,
 * so the store now has to hold up when saves overlap: each commit is its own
 * decision with its own outcome, a tap made while something is saving is
 * applied after it rather than dropped, and a change the store would refuse
 * to write never looks like a storage failure.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addEvent } from '../src/domain/events.ts';
import { captureNeedsMeItem } from '../src/domain/needsMe.ts';
import { completeOneMove, oneMoveForDay } from '../src/domain/oneMove.ts';
import { addTask } from '../src/domain/tasks.ts';
import { renameCategory } from '../src/domain/categories.ts';
import { DAY, STORAGE_KEYS, harness, launch, nyInstant, onboardedState, stored } from './support/fixtures.mjs';
import { finishOnboarding } from './support/store.mjs';

const slowWrites = { writeDelayMs: () => 25 };

async function realHousehold(storageOptions = {}) {
  const h = harness({ mode: 'empty', storageOptions });
  const store = await launch(h);
  await finishOnboarding(store);
  return { h, store };
}

describe('Build 3 audit — overlapping saves (B3-AUD-001)', () => {
  test('two different commits in flight both apply, each with its own outcome, and both survive a relaunch', async () => {
    const { h, store } = await realHousehold(slowWrites);

    const capture = store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: 'Call insurance' }));
    const task = store.commit((state, ctx) => addTask(state, ctx, { title: 'Pay water bill', categoryId: 'cat-money', dueDate: DAY, scope: 'household' }));
    const event = store.commit((state, ctx) =>
      addEvent(state, ctx, { title: 'Dentist', categoryId: 'cat-home', startsAt: nyInstant(14), endsAt: nyInstant(15), commitment: 'fixed', scope: 'household' })
    );
    assert.deepEqual(await Promise.all([capture, task, event]), [true, true, true]);

    const { state } = store.getSnapshot();
    assert.deepEqual(state.needsMe.map((item) => item.title), ['Call insurance']);
    assert.deepEqual(state.tasks.map((t) => t.title), ['Pay water bill']);
    assert.deepEqual(state.events.map((e) => e.title), ['Dentist']);

    const relaunched = (await launch(h)).getSnapshot().state;
    assert.deepEqual(relaunched.needsMe.map((item) => item.title), ['Call insurance']);
    assert.deepEqual(relaunched.tasks.map((t) => t.title), ['Pay water bill']);
    assert.deepEqual(relaunched.events.map((e) => e.title), ['Dentist']);
  });

  test('a failed commit does not decide the outcome of the one queued behind it', async () => {
    let failuresLeft = 0;
    const { h, store } = await realHousehold({ failWrite: (key) => key === STORAGE_KEYS.primary && failuresLeft-- > 0 });
    failuresLeft = 2; // both attempts of the first commit's write

    const first = store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: 'Lost on the first try' }));
    const second = store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: 'Saved on its own turn' }));
    assert.deepEqual(await Promise.all([first, second]), [false, true]);

    assert.deepEqual(store.getSnapshot().state.needsMe.map((item) => item.title), ['Saved on its own turn']);
    assert.deepEqual(h.readPrimary().data.needsMe.map((item) => item.title), ['Saved on its own turn']);
  });

  test('each commit sees what the previous one left, so identical commits apply one after another', async () => {
    const { store } = await realHousehold(slowWrites);
    const add = () => store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: 'Same words' }));
    assert.deepEqual(await Promise.all([add(), add()]), [true, true]);
    // The store no longer merges different taps into one result; screens guard their own double taps.
    assert.equal(store.getSnapshot().state.needsMe.length, 2);
    assert.notEqual(store.getSnapshot().state.needsMe[0].id, store.getSnapshot().state.needsMe[1].id);
  });
});

describe('Build 3 audit — taps during a save (B3-AUD-017)', () => {
  test('"I did it" pressed while a capture is saving is applied after it, not dropped', async () => {
    const h = harness({ storageOptions: slowWrites, initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    const store = await launch(h);

    const saving = store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: 'Sign permission slip' }));
    store.dispatch((state, ctx) => completeOneMove(state, ctx));
    assert.equal(oneMoveForDay(store.getSnapshot().state, DAY).status, 'selected', 'nothing is shown ahead of the pending save');

    assert.equal(await saving, true);
    await store.flush();
    const { state } = store.getSnapshot();
    assert.equal(oneMoveForDay(state, DAY).status, 'completed');
    assert.equal(state.needsMe.length, 1);

    const disk = (await launch(h)).getSnapshot().state;
    assert.equal(oneMoveForDay(disk, DAY).status, 'completed');
    assert.equal(disk.needsMe.length, 1);
  });

  test('order is kept: a tap queued behind a commit cannot be overwritten by that commit', async () => {
    const h = harness({ storageOptions: slowWrites, initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    const store = await launch(h);

    const saving = store.commit((state) => renameCategory(state, 'cat-home', 'House'));
    store.dispatch((state) => renameCategory(state, 'cat-money', 'Budget'));
    await saving;
    await store.flush();

    const names = Object.fromEntries(store.getSnapshot().state.categories.map((c) => [c.id, c.name]));
    assert.deepEqual([names['cat-home'], names['cat-money']], ['House', 'Budget']);
    const disk = Object.fromEntries(h.readPrimary().data.categories.map((c) => [c.id, c.name]));
    assert.deepEqual([disk['cat-home'], disk['cat-money']], ['House', 'Budget']);
  });

  test('a reset requested while a commit is saving runs after it, and the commit cannot resurrect cleared state', async () => {
    const h = harness({ storageOptions: slowWrites, initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    const store = await launch(h);

    const saving = store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: 'Before the reset' }));
    const reset = store.reset();
    assert.deepEqual(await Promise.all([saving, reset]), [true, true]);
    await store.flush();

    assert.deepEqual(store.getSnapshot().state.needsMe, []);
    assert.equal(store.getSnapshot().state.onboarding.completedAt, null);
    assert.deepEqual(h.readPrimary().data.needsMe, []);
  });
});

describe('Build 3 audit — refused changes are not storage failures (B3-AUD-018)', () => {
  test('a capture beyond the stored limits is refused before storage, without a false "may not be saved" notice', async () => {
    const { h, store } = await realHousehold();
    const writesBefore = h.storage.writeLog.length;
    const tooLong = 'x'.repeat(201);

    assert.equal(await store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: tooLong })), false);
    assert.equal(await store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: tooLong })), false);

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.persistenceDegraded, false);
    assert.deepEqual(snapshot.state.needsMe, []);
    assert.equal(h.storage.writeLog.length, writesBefore, 'nothing was attempted');

    assert.equal(await store.commit((state, ctx) => captureNeedsMeItem(state, ctx, { title: 'x'.repeat(200) })), true);
    assert.equal(h.readPrimary().data.needsMe.length, 1);
  });
});

describe('Build 3 audit — One Move without a restart (B3-AUD-020)', () => {
  test("a real household's first capture gets today's One Move in the same saved change", async () => {
    const { h, store } = await realHousehold();
    assert.equal(oneMoveForDay(store.getSnapshot().state, DAY).status, 'none');

    await store.commit((state, ctx) => addTask(state, ctx, { title: 'Pay water bill', categoryId: 'cat-money', durationMinutes: 10, dueDate: DAY, scope: 'household' }));

    const view = oneMoveForDay(store.getSnapshot().state, DAY);
    assert.equal(view.status, 'selected');
    assert.equal(view.move.action, 'Pay water bill');
    assert.equal(oneMoveForDay(h.readPrimary().data, DAY).status, 'selected', 'decided and saved together');
  });

  test('an existing decision is never revisited by later changes', async () => {
    const { store } = await realHousehold();
    await store.commit((state, ctx) => addTask(state, ctx, { title: 'First', categoryId: 'cat-money', durationMinutes: 10, dueDate: DAY, scope: 'household' }));
    const decided = store.getSnapshot().state.oneMoves;

    await store.commit((state, ctx) => addTask(state, ctx, { title: 'Smaller', categoryId: 'cat-money', durationMinutes: 2, dueDate: DAY, scope: 'household' }));
    assert.deepEqual(store.getSnapshot().state.oneMoves, decided);
  });

  test('a change that alters nothing is still not written', async () => {
    const { h, store } = await realHousehold();
    const writes = h.primaryWrites().length;
    store.dispatch((state) => state);
    assert.equal(await store.commit((state) => state), true);
    await store.flush();
    assert.equal(h.primaryWrites().length, writes);
  });
});
