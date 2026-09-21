/**
 * HK-FEATURE-08 / ML2 — a meal decision travels between devices through the PRODUCTION composition.
 *
 * Every device here begins at `composeAccountApp` (see support/twoDevice.mjs), so a test cannot pass by hand-building a
 * coordinator that production forgot to build. The cloud is an in-memory model; the same journeys against real PostgreSQL and
 * PostgREST are in supabase/tests. The claim carries no meals: they reach the cloud as ordinary creates after binding.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { activeMeals, addMeal, archiveMeal, compareMealPlanEntries, updateMeal } from '../../src/domain/meals.ts';
import { MEAL_SLOTS } from '../../src/domain/state.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import {
  ACCOUNT_A, ACCOUNT_B, TUESDAY, WEDNESDAY, accountCloudFor, act, boundDevice, createFakeCloud, makeDevice, secondDevice, withheldMove,
} from './support/twoDevice.mjs';

const MEALS = 'meal_plan_entries';
const meals = (device) => device.store.getSnapshot().state.meals;
const add = async (device, input) => {
  const { result } = await act(device, (s, ctx) => addMeal(s, ctx, input));
  assert.equal(result.refusal, null, 'add refused: ' + result.refusal);
  return result.id;
};
const pushedKeys = (row) => Object.keys(row).filter((k) => !['id', 'revision', 'origin_device_id', 'created_at', '_table'].includes(k)).sort();

describe('the record travels with its slot and status', () => {
  test('[AH] [O] device B receives the exact logical date, slot and status; archiving on A removes it from B\'s active plan', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    const id = await add(a, { title: 'Tacos', date: TUESDAY, slot: 'dinner' });
    await a.settle();

    const [row] = cloud.table(MEALS);
    assert.equal(row.meal_date, TUESDAY, 'the date is the calendar date string, not an instant');
    assert.equal(row.meal_slot, 'dinner');
    assert.equal(row.status, 'active');
    assert.equal(row.title, 'Tacos');
    assert.equal(cloud.table(MEALS).length, 1);

    const b = await secondDevice({ cloud, accountCloud });
    assert.equal(meals(b).length, 1);
    assert.deepEqual([meals(b)[0].date, meals(b)[0].slot, meals(b)[0].status, meals(b)[0].title], [TUESDAY, 'dinner', 'active', 'Tacos']);

    await act(a, (s, ctx) => archiveMeal(s, ctx, id));
    await a.settle();
    assert.equal(cloud.table(MEALS)[0].status, 'archived', 'removal reached the cloud as an ordinary update');
    assert.equal(cloud.table(MEALS).length, 1, 'and nothing was deleted');

    await b.syncRuntime.request('manual');
    await b.settle();
    assert.equal(meals(b).length, 1, 'the row is still held on B');
    assert.equal(meals(b)[0].status, 'archived');
    assert.deepEqual(activeMeals(b.store.getSnapshot().state), [], 'but it is no longer in B\'s active plan');
    assert.equal(b.persisted().identity.sync.queue.length, 0, 'pulled state produced no outbound work');
  });

  test('[H] every one of the six slots reaches the other device unchanged', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    for (const slot of MEAL_SLOTS) await add(a, { title: 'Meal ' + slot, date: TUESDAY, slot });
    await a.settle();
    const b = await secondDevice({ cloud, accountCloud });
    assert.deepEqual(meals(b).map((m) => m.slot).sort(), [...MEAL_SLOTS].sort());
    assert.deepEqual(new Set(cloud.table(MEALS).map((r) => r.meal_slot)), new Set(MEAL_SLOTS));
  });

  test('[I5] a create is queued in the same envelope as the state, before any network work', async () => {
    const { a } = await boundDevice();
    const id = await add(a, { title: 'Tacos', date: TUESDAY });
    const queued = a.persisted().identity.sync.queue.filter((q) => q.kind === 'meal');
    assert.deepEqual(queued.map((q) => [q.op, q.localId]), [['create', id]]);
    assert.equal(a.persisted().state.meals.length, 1, 'state and intent are in one envelope');
  });

  test('[BG] two devices show the same entries in the same order', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    for (const [title, slot] of [['Snack', 'snack'], ['Tacos', 'dinner'], ['Toast', 'breakfast'], ['Soup', 'dinner'], ['Leftovers', undefined]]) {
      await add(a, { title, date: TUESDAY, slot });
    }
    await a.settle();
    const b = await secondDevice({ cloud, accountCloud });
    const order = (device) => [...meals(device)].sort(compareMealPlanEntries).map((m) => m.title);
    assert.equal(order(b).length, 5);
    assert.deepEqual(order(b), order(a));
    assert.deepEqual(order(b).slice(0, 2), ['Toast', order(b)[1]]);
  });
});

describe('offline, restart, retry, refusal', () => {
  test('[AG] create, edit, move and archive offline, restart, reconnect: one row, final values, nothing lost or duplicated', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    cloud.state.offline = true;
    const id = await add(a, { title: 'Tacoz', date: TUESDAY });
    await a.settle();
    await act(a, (s, ctx) => updateMeal(s, ctx, id, { title: 'Tacos', date: WEDNESDAY, slot: 'lunch' }));
    await a.settle();
    await act(a, (s, ctx) => archiveMeal(s, ctx, id));
    await a.settle();
    assert.equal(cloud.table(MEALS).length, 0, 'nothing reached the cloud while offline');
    assert.ok(a.persisted().identity.sync.queue.length >= 1, 'the intent is durable');

    // the app is closed and reopened over the same storage
    const restarted = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage: a.storage, secure: a.secure });
    const held = meals(restarted)[0];
    assert.deepEqual([held.title, held.date, held.slot, held.status], ['Tacos', WEDNESDAY, 'lunch', 'archived'], 'the restart preserved every field');

    cloud.state.offline = false;
    await restarted.signIn();
    assert.equal(cloud.table(MEALS).length, 1, 'exactly one row: no duplicate');
    const row = cloud.table(MEALS)[0];
    assert.deepEqual([row.title, row.meal_date, row.meal_slot, row.status], ['Tacos', WEDNESDAY, 'lunch', 'archived']);
    assert.equal(restarted.persisted().identity.sync.queue.length, 0, 'and the queue drained');
  });

  test('[BB] a lost acknowledgement settles on the same cloud row: no duplicate', async () => {
    const { cloud, a } = await boundDevice();
    cloud.state.loseNextAck = 1;
    await add(a, { title: 'Tacos', date: TUESDAY });
    await a.settle();
    await a.syncRuntime.request('manual');
    assert.equal(cloud.table(MEALS).length, 1);
    assert.equal(a.persisted().identity.sync.queue.length, 0);
  });

  test('[BC] a row the server refuses for its content is recorded once and never re-owed; later meals still sync', async () => {
    const { cloud, a } = await boundDevice();
    cloud.hooks.refuse = (table, row) => (table === MEALS && row.title === 'Poison' ? { kind: 'failure', failure: 'validation', detail: 'check violation', code: '23514' } : null);
    const poison = await add(a, { title: 'Poison', date: TUESDAY });
    await a.settle();
    const attempts = () => cloud.calls.filter((c) => c.op === 'create' && c.localId === poison).length;
    assert.equal(attempts(), 1, 'asked once');
    assert.equal(a.persisted().identity.sync.evidence.filter((e) => !e.resolved && e.localId === poison).length, 1, 'recorded once');

    await a.syncRuntime.request('foreground');
    await a.syncRuntime.request('networkRestored');
    await add(a, { title: 'Fine', date: TUESDAY });
    await a.settle();
    assert.equal(attempts(), 1, 'still asked once after later triggers');
    assert.deepEqual(cloud.table(MEALS).map((r) => r.title), ['Fine'], 'and new work flows past it');
  });

  test('[BD] more meals than the queue ceiling drain completely, and a second device hydrates all of them', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    cloud.state.offline = true;
    const TOTAL = 620;
    await act(a, (s, ctx) => {
      let next = s;
      for (let i = 0; i < TOTAL; i += 1) next = addMeal(next, ctx, { title: 'Meal ' + i, date: TUESDAY }).state;
      return next;
    });
    await a.settle();
    assert.equal(meals(a).length, TOTAL, 'nothing was dropped locally while offline');

    cloud.state.offline = false;
    for (let round = 0; round < 12 && cloud.table(MEALS).length < TOTAL; round += 1) {
      await a.syncRuntime.request('manual');
      await a.settle();
    }
    assert.equal(cloud.table(MEALS).length, TOTAL, 'every meal reached the cloud');
    assert.equal(new Set(cloud.table(MEALS).map((r) => r.local_id)).size, TOTAL, 'each exactly once');
    assert.equal(a.persisted().identity.sync.queue.length, 0);
    // Not asserted: `sync.backlog`. It is set when the queue fills and, at this baseline, never clears (IR01 note D10, a shared
    // sync defect that predates Feature 08). What matters here is that no intent was lost: every meal above was delivered.

    const b = await secondDevice({ cloud, accountCloud });
    assert.equal(meals(b).length, TOTAL, 'the second device hydrated every row across the pull chunks');
  });
});

describe('a concurrent change on another device is never silently overwritten', () => {
  test('[AQ] [AZ] A renames while another device changes the same entry: the server keeps the other edit, A records the conflict and converges', async () => {
    const { cloud, a } = await boundDevice();
    const id = await add(a, { title: 'Tacos', date: TUESDAY });
    await a.settle();
    const cloudId = a.persisted().identity.sync.mappings['meal:' + id].cloudId;

    cloud.hooks.duringUpdate = async () => {
      cloud.hooks.duringUpdate = null;
      cloud.editRow(MEALS, cloudId, { title: 'Their edit', meal_slot: 'breakfast' });
    };
    await act(a, (s, ctx) => updateMeal(s, ctx, id, { title: 'My edit' }));
    await a.settle();

    const row = cloud.table(MEALS)[0];
    assert.deepEqual([row.title, row.meal_slot], ['Their edit', 'breakfast'], 'the newer server state was not overwritten');
    const evidence = a.persisted().identity.sync.evidence.filter((e) => e.evidence === 'cas-conflict' && e.localId === id);
    assert.equal(evidence.length, 1, 'the lost intent is preserved as evidence, not dropped');
    assert.equal(a.syncRuntime.snapshot().needsAttention, true);

    await a.syncRuntime.request('manual');
    await a.settle();
    assert.equal(meals(a)[0].title, 'Their edit', 'the newer state won on this device too');
  });

  test('[BA] A archives while another device edits: the first writer wins, A records the conflict, nothing is silently lost', async () => {
    const { cloud, a } = await boundDevice();
    const id = await add(a, { title: 'Tacos', date: TUESDAY });
    await a.settle();
    const cloudId = a.persisted().identity.sync.mappings['meal:' + id].cloudId;

    cloud.hooks.duringUpdate = async () => {
      cloud.hooks.duringUpdate = null;
      cloud.editRow(MEALS, cloudId, { title: 'Renamed elsewhere' });
    };
    await act(a, (s, ctx) => archiveMeal(s, ctx, id));
    await a.settle();

    assert.equal(cloud.table(MEALS)[0].status, 'active', 'the archive did not overwrite the other device\'s newer row');
    assert.equal(a.persisted().identity.sync.evidence.filter((e) => e.evidence === 'cas-conflict' && e.localId === id).length, 1);
    await a.syncRuntime.request('manual');
    await a.settle();
    assert.deepEqual([meals(a)[0].title, meals(a)[0].status], ['Renamed elsewhere', 'active'], 'both devices converge on the cloud row');
  });
});

describe('a malformed row from the cloud', () => {
  test('[AX] an unknown slot is refused by name by the integrity gate: nothing is coerced or partly applied, and the cursor stays', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    await add(a, { title: 'Tacos', date: TUESDAY });
    await a.settle();
    const before = { meals: meals(a).map((m) => m.title), cursor: a.persisted().identity.sync.cursor };

    const seed = (localId, over) => cloud.seedRow(MEALS, {
      household_id: accountCloud.ids.householdId, local_id: localId, owner_profile_id: null, title: 'From elsewhere ' + localId, meal_date: WEDNESDAY,
      meal_slot: 'unspecified', status: 'active', category_id: accountCloud.ids.categories['cat-meals'], scope: 'household',
      producer: 'user-action', source_artifact_id: null, confidence: null, prep_minutes: null, energy_demand: null, ...over,
    });
    seed('meal-fine', {});
    seed('meal-bad', { meal_slot: 'dessert' });
    await a.syncRuntime.request('manual');
    await a.settle();

    assert.deepEqual(meals(a).map((m) => m.title), before.meals, 'the whole batch was refused: the valid row beside it was not applied either');
    assert.equal(meals(a).some((m) => m.slot === 'dessert'), false, 'and the unknown slot was never coerced into state');
    assert.equal(a.persisted().identity.sync.cursor, before.cursor, 'the cursor did not move past a batch that was not applied');
  });
});

describe('the claim, accounts and demo', () => {
  test('[CF] meals made before binding keep their Tuesday, slot and status when they reach the cloud; the claim carries none of them', async () => {
    let archivedId;
    const { cloud, accountCloud, a } = await boundDevice({
      before: async (device) => {
        await add(device, { title: 'Tacos', date: TUESDAY, slot: 'dinner' });
        archivedId = await add(device, { title: 'Changed my mind', date: WEDNESDAY, slot: 'lunch' });
        await act(device, (s, ctx) => archiveMeal(s, ctx, archivedId));
      },
    });
    await a.settle();
    const byTitle = Object.fromEntries(cloud.table(MEALS).map((r) => [r.title, r]));
    assert.deepEqual([byTitle.Tacos.meal_date, byTitle.Tacos.meal_slot, byTitle.Tacos.status], [TUESDAY, 'dinner', 'active']);
    assert.deepEqual([byTitle['Changed my mind'].meal_date, byTitle['Changed my mind'].meal_slot, byTitle['Changed my mind'].status], [WEDNESDAY, 'lunch', 'archived']);

    const [payload] = accountCloud.ids.payloads;
    assert.equal(payload.claimPayloadVersion, 3, 'claim v3 is untouched');
    assert.deepEqual(Object.keys(payload).filter((k) => /meal/i.test(k)), [], 'the claim carries no meals');
  });

  test('[AK] a device holding account A\'s household meets account B: none of A\'s meals is uploaded under B', async () => {
    const cloud = createFakeCloud();
    const cloudA = accountCloudFor(cloud, ACCOUNT_A);
    const storage = createMemoryStorage({});
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud: cloudA, storage });
    await a.store.commit((s) => ({ ...s, oneMoves: [withheldMove] }));
    await a.signIn();
    await add(a, { title: 'A private meal', date: TUESDAY });
    cloud.state.offline = true;
    await a.settle();
    cloud.state.offline = false;
    await a.accountRuntime.signOut();
    const callsBefore = cloud.calls.length;

    const b = await makeDevice({ cloud, accountId: ACCOUNT_B, accountCloud: accountCloudFor(cloud, ACCOUNT_B), storage });
    const state = await b.signIn();
    assert.equal(state.kind, 'boundOther');
    assert.equal(b.syncRuntime.running(), null);
    await b.settle();
    assert.equal(cloud.calls.length, callsBefore, 'not one request was made on account B\'s behalf');
    assert.equal(cloud.table(MEALS).filter((r) => r.title === 'A private meal').length, 0, 'A\'s pending meal was never uploaded under B');
  });

  test('[BE] a demo household never queues or syncs its meals', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, mode: 'demo' });
    const state = await a.signIn();
    assert.equal(state.kind, 'authenticatedUnbound', 'refused as a whole');
    await add(a, { title: 'Demo dinner', date: TUESDAY });
    await a.settle();
    assert.equal(cloud.calls.length, 0);
    assert.equal(a.persisted().identity.sync, null);
    assert.equal(cloud.table(MEALS).length, 0);
  });
});

describe('what crosses the account boundary', () => {
  test('[BO] [BF] a meal pushes exactly the allow-listed columns, and its title appears nowhere else in the cloud', async () => {
    const { cloud, a } = await boundDevice();
    await add(a, { title: 'Peanut noodles', date: TUESDAY, slot: 'dinner' });
    await a.settle();
    const [row] = cloud.table(MEALS);
    assert.deepEqual(pushedKeys(row), [
      'category_id', 'confidence', 'energy_demand', 'household_id', 'local_id', 'meal_date', 'meal_slot', 'owner_profile_id',
      'prep_minutes', 'producer', 'scope', 'source_artifact_id', 'status', 'title',
    ]);
    assert.equal(row.prep_minutes, null, 'no prep time is claimed');
    assert.equal(row.energy_demand, null, 'no easy or hard claim is made');
    assert.equal(row.confidence, null);
    assert.equal(row.scope, 'household');
    assert.equal(row.owner_profile_id, null, 'a household plan has no private owner');

    for (const other of cloud.rows.values()) {
      if (other._table === MEALS) continue;
      assert.equal(JSON.stringify(other).includes('Peanut noodles'), false, 'the title leaked into ' + other._table);
    }
  });
});
