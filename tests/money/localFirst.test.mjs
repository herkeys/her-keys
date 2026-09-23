/**
 * LOCAL-FIRST — the representative F09 mutation, through the real store and storage (not a
 * direct AppState transform, unlike the rest of tests/money/**). Money has NO sync code of its
 * own (addTask/completeTask/archiveTask are the same canonical transitions every feature uses),
 * so the full cloud round-trip is not re-proven here — that guarantee is the shared store's,
 * already exhaustively proven by F07's/F08's own production-composition suites
 * (tests/coparent/syncComposition.test.mjs). This proves the part that IS specific to how Money's
 * own mutations are called: create -> visible immediately -> persists to storage -> a fresh store
 * reading the SAME storage (a relaunch) still has it -> resolve survives a relaunch too.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createObligation, createExpectedIncome, resolveMoneyItem } from '../../src/features/money/mutations.ts';
import { moneyCategoryId } from '../../src/features/money/identity.ts';
import { harness, launch } from '../support/fixtures.mjs';

const fields = (overrides = {}) => ({ title: 'Car insurance', amountText: '84.50', dueDate: '2026-09-25', paymentMechanism: 'manual', childId: null, notes: '', ...overrides });

describe('Money OS — local-first (representative mutation)', () => {
  test('an obligation is visible immediately after commit, in a real (non-demo) empty household', async () => {
    const h = harness({ mode: 'empty' });
    const store = await launch(h);
    let createdId = null;
    const committed = await store.commit((state, ctx) => {
      const result = createObligation(state, ctx, fields());
      createdId = result.id;
      return result.state;
    });
    assert.equal(committed, true);
    const task = store.getSnapshot().state.tasks.find((t) => t.id === createdId);
    assert.ok(task, 'visible in the live snapshot immediately, before any relaunch');
    assert.equal(task.title, 'Car insurance');
  });

  test('it persists to storage and survives a relaunch (a fresh store reading the same storage)', async () => {
    const h = harness({ mode: 'empty' });
    const first = await launch(h);
    let createdId = null;
    await first.commit((state, ctx) => {
      const result = createObligation(state, ctx, fields({ title: 'Rent', amountText: '1800' }));
      createdId = result.id;
      return result.state;
    });
    await first.flush();
    assert.ok(h.primaryWrites().length > 0, 'the create actually wrote to storage, not just to memory');

    // Relaunch: a brand-new store instance over the SAME underlying storage, exactly what a real app restart is.
    const second = await launch(h);
    const task = second.getSnapshot().state.tasks.find((t) => t.id === createdId);
    assert.ok(task, 'the obligation is still there after relaunch');
    assert.equal(task.title, 'Rent');
    assert.deepEqual(task.value, { amountMinor: 180000, currency: 'USD', direction: 'outflow' });
    assert.equal(task.status, 'open', 'still open — nothing about a relaunch resolves it');
  });

  test('expected income and a resolve both survive a relaunch too', async () => {
    const h = harness({ mode: 'empty' });
    const first = await launch(h);
    let createdId = null;
    await first.commit((state, ctx) => {
      const result = createExpectedIncome(state, ctx, fields({ title: 'Paycheck' }));
      createdId = result.id;
      return result.state;
    });
    await first.commit((state, ctx) => resolveMoneyItem(state, ctx, createdId).state);
    await first.flush();

    const second = await launch(h);
    const task = second.getSnapshot().state.tasks.find((t) => t.id === createdId);
    assert.equal(task.status, 'completed');
    assert.equal(task.value.direction, 'inflow');
    assert.ok(task.completedAt);
  });

  test('an edit made offline (no sync namespace) is still visible after relaunch, unsynced', async () => {
    const h = harness({ mode: 'empty' });
    const first = await launch(h);
    await first.commit((state, ctx) => createObligation(state, ctx, fields({ title: 'Utilities' })).state);
    await first.flush();
    const categoryId = moneyCategoryId(first.getSnapshot().state);
    assert.ok(categoryId, 'the money category exists on a real empty household, same as every other starter category');

    const second = await launch(h);
    assert.equal(second.getSnapshot().state.tasks.some((t) => t.title === 'Utilities'), true);
  });
});
