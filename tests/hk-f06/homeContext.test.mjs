/**
 * HK-FEATURE-06 / HM1 — THE HOME-CONTEXT CONTRACT, TESTED.
 *
 * Home OS is bound to the household category that carries the system role `home`. These tests prove, against the real domain
 * modules, the real store and repository, and the production account-sync composition:
 *
 *   1. NAME INDEPENDENCE        association never depends on a display name
 *   2. CONTEXT LIFECYCLE        what archive / restore / "missing" mean, and that a category cannot be deleted
 *   3. SINGLE-CONTEXT LIMIT     a record has exactly one category; nothing is guessed to make it appear
 *   4. ROUND TRIP               create -> local persistence -> restart -> account sync -> cloud -> second device
 *
 * COVERAGE HONESTY (the fifth point of the contract) is a property of the projection and its copy and is tested there
 * (homeView.test.mjs, homeCopy.test.mjs).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { addCategory, archiveCategory, categoriesInOrder, categoryWithRole, renameCategory, restoreCategory } from '../../src/domain/categories.ts';
import * as categoriesModule from '../../src/domain/categories.ts';
import { CalendarEventSchema, HouseholdSystemSchema, TaskSchema, validateAppState } from '../../src/domain/state.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { applyCloudRow } from '../../src/domain/sync/apply.ts';
import { createAppStateRepository } from '../../src/persistence/appStateRepository.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { homeCategoryIdOf, homeContextOf, homeLabelOf, isHomeRecord } from '../../src/features/home/model/homeContext.ts';
import { ACCOUNT_A, NOW, TZ, accountCloudFor, bindAsNewDevice, makeDevice, mutate, withheldMove } from '../support/accountDevice.mjs';
import { createFakeCloud } from '../support/fakeCloud.mjs';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ctx = (start = 0) => {
  let n = start;
  return { nowMs: NOW, today: '2026-09-21', createId: (prefix) => `${prefix}-${++n}` };
};

/** Each entry is a way to decide "is this about the home?" from words. None may appear in Home OS source. */
const FORBIDDEN_DECISIONS = [
  [/\b(category|cat|area|context|c)\.name\s*(===|!==|==|!=)/, 'compares a category name'],
  [/\.name\s*\.\s*(toLowerCase|toUpperCase|includes|startsWith|endsWith|match|localeCompare)\s*\(/, 'string-tests a name'],
  [/\btitle\s*\.\s*(toLowerCase|includes|startsWith|endsWith|match|test)\s*\(/, 'string-tests a title'],
  [/(===|!==|==|!=)\s*['"`](home|house)['"`]/i, 'compares to the word home/house'],
  [/['"`](home|house)['"`]\s*(===|!==|==|!=)/i, 'compares to the word home/house'],
  [/\.(includes|startsWith|endsWith)\(\s*['"`][^'"`]*\b(home|house)\b[^'"`]*['"`]\s*\)/i, 'keyword-tests for home/house'],
  [/\/[^/\n]*\b(home|house)\b[^/\n]*\/[gimsuy]*\s*\.test\(/i, 'regex-tests for home/house'],
];

const realHousehold = () => createEmptyState(TZ);
const withHomeTask = (state, title = 'Change the furnace filter') => addTask(state, ctx(), { title, categoryId: categoryWithRole(state, 'home').id, scope: 'household', durationMinutes: 10, durationSource: 'user' });

// ------------------------------------------------------------------------------------------------------------ 1. NAME
describe('HOME CONTEXT 1 — association is stable identity, never a display name', () => {
  test('the Home context is the category carrying system role "home"', () => {
    const state = realHousehold();
    const context = homeContextOf(state);
    assert.equal(context.kind, 'active');
    assert.equal(context.category.id, 'cat-home');
    assert.equal(context.category.systemRole, 'home');
    assert.equal(homeCategoryIdOf(context), 'cat-home');
  });

  test('renaming "Home" to "House stuff" does not change the context or which records belong to it', () => {
    let state = withHomeTask(realHousehold());
    const before = homeContextOf(state);
    state = renameCategory(state, 'cat-home', 'House stuff');
    const after = homeContextOf(state);

    assert.equal(after.kind, 'active', 'a renamed Home area is still the Home area');
    assert.equal(after.category.id, before.category.id, 'same identity');
    assert.equal(after.category.name, 'House stuff', 'the new name is presentation and is honoured for display');
    assert.equal(homeLabelOf(after), 'House stuff');
    assert.equal(isHomeRecord(after, state.tasks[0]), true, 'the task is still a Home record after the rename');
    assert.equal(validateAppState(state).ok, true);
  });

  test('renaming the Home area to another area\'s name changes nothing about which area is Home', () => {
    let state = withHomeTask(realHousehold());
    state = renameCategory(state, 'cat-home', 'Money');
    const context = homeContextOf(state);
    assert.equal(context.category.id, 'cat-home');
    assert.equal(categoryWithRole(state, 'money').id, 'cat-money', 'the real Money area is still Money');
    assert.equal(isHomeRecord(context, state.tasks[0]), true);
    assert.equal(isHomeRecord(context, { categoryId: 'cat-money' }), false);
  });

  test('a role-less category that is literally named "Home" is NOT the Home context, and its records are not Home records', () => {
    let state = realHousehold();
    state = renameCategory(state, 'cat-home', 'The house');
    state = addCategory(state, ctx(100), { name: 'Home', scope: 'household' });
    const impostor = state.categories.find((category) => category.name === 'Home');
    assert.equal(impostor.systemRole, null, 'naming something "Home" does not make it the home category');

    const context = homeContextOf(state);
    assert.equal(context.category.id, 'cat-home');
    assert.equal(isHomeRecord(context, { categoryId: impostor.id }), false);
  });

  test('STRUCTURAL: nothing under src/features/home decides by a name, a title or a keyword', () => {
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
      }
    };
    walk(join(ROOT, 'src/features/home'));
    assert.ok(files.length > 0);

    const hits = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const [pattern, why] of FORBIDDEN_DECISIONS) if (pattern.test(text)) hits.push(`${file.replace(ROOT, '')}: ${why}`);
    }
    assert.deepEqual(hits, [], 'Home decides only by the role-bound category id');
  });

  test('the scan can see: each way of deciding "is this about the home?" from words WOULD be caught, and legitimate code is not', () => {
    const offenders = [
      'const isHome = category.name === "Home";',
      'const isHome = area.name !== \'House stuff\';',
      'return c.name.toLowerCase() === x;',
      'if (task.title.toLowerCase().includes("furnace")) {}',
      'if (title.includes("home")) return true;',
      'const isHomey = kind === "home";',
      'if ("house" === kind) {}',
      'return items.filter((i) => i.title.startsWith("Home:"));',
      'if (/home|house/i.test(task.title)) {}',
    ];
    for (const source of offenders) {
      assert.ok(FORBIDDEN_DECISIONS.some(([pattern]) => pattern.test(source)), `would be caught: ${source}`);
    }
    const legitimate = [
      'export const homeLabelOf = (context) => context.category.name;',
      'return record.categoryId === context.category.id;',
      'const category = categoryWithRole(state, HOME_ROLE);',
      "export const HOME_ROLE = 'home';",
    ];
    for (const source of legitimate) {
      assert.ok(!FORBIDDEN_DECISIONS.some(([pattern]) => pattern.test(source)), `not flagged: ${source}`);
    }
  });
});

// ------------------------------------------------------------------------------------------------------- 2. LIFECYCLE
describe('HOME CONTEXT 2 — lifecycle: rename, archive, restore, missing, and no deletion', () => {
  test('ARCHIVED: still resolves, its records are still Home records, and the context says it is archived', () => {
    let state = withHomeTask(realHousehold());
    state = archiveCategory(state, 'cat-home');
    const context = homeContextOf(state);
    assert.equal(context.kind, 'archived');
    assert.equal(context.category.id, 'cat-home');
    assert.equal(isHomeRecord(context, state.tasks[0]), true, 'archiving the area does not disassociate its records');
    assert.equal(validateAppState(state).ok, true, 'and the state stays valid');
  });

  test('the Life hub\'s own category list drops an archived Home area — which is exactly why Home resolves by role over ALL categories', () => {
    let state = realHousehold();
    state = archiveCategory(state, 'cat-home');
    assert.equal(categoriesInOrder(state).some((category) => category.id === 'cat-home'), false, 'shared behaviour: the hub lists ACTIVE categories only');
    assert.equal(homeContextOf(state).kind, 'archived', 'Home does not read that list, so it still finds its own area');
  });

  test('RESTORED: the same identity is active again', () => {
    let state = archiveCategory(realHousehold(), 'cat-home');
    state = restoreCategory(state, 'cat-home');
    const context = homeContextOf(state);
    assert.equal(context.kind, 'active');
    assert.equal(context.category.id, 'cat-home');
  });

  test('MISSING: no category carries the home role -> "missing", never "active" and never an empty Home', () => {
    const state = realHousehold();
    const without = { ...state, categories: state.categories.filter((category) => category.id !== 'cat-home') };
    assert.equal(validateAppState(without).ok, true, 'a household with no tasks in it may lack the category and still be valid');
    const context = homeContextOf(without);
    assert.deepEqual(context, { kind: 'missing' });
    assert.equal(homeCategoryIdOf(context), null);
    assert.equal(isHomeRecord(context, { categoryId: 'cat-home' }), false, 'nothing can be a Home record when there is no Home area to be in');
    assert.equal(homeLabelOf(context), 'Home', 'only a fallback label for a screen heading');
  });

  test('NO DELETION: the domain exposes no way to remove a category', () => {
    const exported = Object.keys(categoriesModule);
    assert.deepEqual(exported.filter((name) => /delete|remove|destroy|drop/i.test(name)), []);
    for (const expected of ['addCategory', 'renameCategory', 'reorderCategories', 'archiveCategory', 'restoreCategory']) {
      assert.ok(exported.includes(expected), `${expected} is the whole lifecycle`);
    }
  });

  test('NO DELETION ACROSS SYNC: applying category rows only upserts — an archive and a rename arrive, a category never disappears', () => {
    let state = realHousehold();
    const resolve = (id) => id;
    const count = state.categories.length;
    const row = { name: 'House stuff', system_role: 'home', status: 'archived', sort_order: 1, scope: 'household', producer: 'user-action', artifact_id: null, confidence: null };
    state = applyCloudRow(state, 'category', 'cat-home', row, resolve);
    assert.equal(state.categories.length, count, 'no category was added or removed');
    const context = homeContextOf(state);
    assert.deepEqual([context.kind, context.category.name, context.category.systemRole], ['archived', 'House stuff', 'home']);
  });

  test('a category the pulled row does not name as home cannot displace the real Home area', () => {
    let state = realHousehold();
    const row = { name: 'Home', system_role: null, status: 'active', sort_order: 50, scope: 'household', producer: 'user-action', artifact_id: null, confidence: null };
    state = applyCloudRow(state, 'category', 'cat-x', row, (id) => id);
    assert.equal(homeContextOf(state).category.id, 'cat-home');
  });
});

// ------------------------------------------------------------------------------------------- 3. SINGLE-CONTEXT LIMITATION
describe('HOME CONTEXT 3 — the V1 single-context limitation, stated and pinned', () => {
  test('the certified model gives a task, an event and a System exactly ONE category and no multi-context field', () => {
    for (const [label, schema] of [['task', TaskSchema], ['event', CalendarEventSchema], ['system', HouseholdSystemSchema]]) {
      const keys = Object.keys(schema.shape ?? schema._def?.schema?.shape ?? {});
      assert.ok(keys.includes('categoryId'), `${label} has categoryId`);
      assert.deepEqual(keys.filter((key) => /^(categoryIds|categories|contexts|areas|tags|labels)$/i.test(key)), [], `${label} has no multi-context field`);
    }
  });

  test('a task filed under her own "Yard" category has NO Home association, however its title reads', () => {
    let state = realHousehold();
    state = addCategory(state, ctx(100), { name: 'Yard', scope: 'household' });
    const yard = state.categories.find((category) => category.name === 'Yard');
    state = addTask(state, ctx(200), { title: 'Fix the house gutter at home', categoryId: yard.id, scope: 'household' });
    state = addTask(state, ctx(300), { title: 'Home: call the plumber', categoryId: 'cat-kids', scope: 'household' });
    const context = homeContextOf(state);
    assert.deepEqual(state.tasks.map((task) => isHomeRecord(context, task)), [false, false], 'no title parsing, no keyword matching');
  });

  test('a Home-created record uses the Home context, so it stays visible in Home', () => {
    const state = withHomeTask(realHousehold());
    assert.equal(isHomeRecord(homeContextOf(state), state.tasks[0]), true);
  });
});

// ---------------------------------------------------------------------------------------------------------- 4. ROUND TRIP
describe('HOME CONTEXT 4 — the association survives persistence, restart, account sync and a second device', () => {
  const launch = (storage) => {
    const repository = createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: false });
    return createAppStore({ repository, mode: 'empty', now: () => NOW, timeZone: () => TZ });
  };

  test('CREATE -> LOCAL PERSISTENCE -> RESTART: the Home association is intact', async () => {
    const storage = createMemoryStorage({});
    const first = launch(storage);
    await first.hydrate();
    assert.equal(await first.commit((state, c) => addTask(state, c, { title: 'Change the furnace filter', categoryId: categoryWithRole(state, 'home').id, scope: 'household', durationMinutes: 10, durationSource: 'user' })), true);
    await first.flush();

    const second = launch(storage);
    await second.hydrate();
    const state = second.getSnapshot().state;
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0].categoryId, 'cat-home');
    assert.equal(isHomeRecord(homeContextOf(state), state.tasks[0]), true);
  });

  test('a RENAME made before a restart survives it, and the association is unchanged', async () => {
    const storage = createMemoryStorage({});
    const first = launch(storage);
    await first.hydrate();
    await first.commit((state, c) => addTask(state, c, { title: 'Bleed the radiators', categoryId: categoryWithRole(state, 'home').id, scope: 'household' }));
    await first.commit((state) => renameCategory(state, 'cat-home', 'House stuff'));
    await first.flush();

    const second = launch(storage);
    await second.hydrate();
    const state = second.getSnapshot().state;
    const context = homeContextOf(state);
    assert.deepEqual([context.kind, context.category.name], ['active', 'House stuff']);
    assert.equal(isHomeRecord(context, state.tasks[0]), true);
  });

  test('an ARCHIVE made before a restart survives it, and its records are still Home records', async () => {
    const storage = createMemoryStorage({});
    const first = launch(storage);
    await first.hydrate();
    await first.commit((state, c) => addTask(state, c, { title: 'Winterize the hose bib', categoryId: categoryWithRole(state, 'home').id, scope: 'household' }));
    await first.commit((state) => archiveCategory(state, 'cat-home'));
    await first.flush();

    const second = launch(storage);
    await second.hydrate();
    const state = second.getSnapshot().state;
    assert.equal(homeContextOf(state).kind, 'archived');
    assert.equal(isHomeRecord(homeContextOf(state), state.tasks[0]), true);
  });

  test('ACCOUNT SYNC -> CLOUD -> SECOND DEVICE, through the production composition: the association and a later rename both arrive', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await mutate(a, (state) => ({ ...state, oneMoves: [withheldMove] }));
    await a.signIn();

    // A canonical Home mutation through the production store, with no feature-specific sync involved.
    await mutate(a, (state, c) => addTask(state, c, { title: 'Change the furnace filter', categoryId: categoryWithRole(state, 'home').id, scope: 'household', durationMinutes: 10, durationSource: 'user' }));
    await a.settle();

    const homeCloudId = accountCloud.ids.categories['cat-home'];
    const homeCloudRow = cloud.table('household_categories').find((row) => row.id === homeCloudId);
    assert.equal(homeCloudRow.system_role, 'home', 'the cloud category is the home role');
    const taskRow = cloud.table('tasks').find((row) => row.title === 'Change the furnace filter');
    assert.equal(taskRow.category_id, homeCloudId, 'the task row points at the cloud Home category');

    // A rename is presentation: it travels, and it does not touch the association.
    await mutate(a, (state) => renameCategory(state, 'cat-home', 'House stuff'));
    await a.settle();
    assert.equal(cloud.table('household_categories').find((row) => row.id === homeCloudId).name, 'House stuff');
    assert.equal(cloud.table('tasks').find((row) => row.title === 'Change the furnace filter').category_id, homeCloudId, 'the task was not re-pointed');

    // A second device pulls it.
    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await bindAsNewDevice(b, accountCloud);
    assert.equal((await b.signIn()).kind, 'accountBound');

    const state = b.store.getSnapshot().state;
    const context = homeContextOf(state);
    assert.equal(context.kind, 'active', 'the second device knows which area is Home');
    assert.equal(context.category.systemRole, 'home');
    assert.equal(context.category.name, 'House stuff', 'and what the household now calls it');
    const task = state.tasks.find((t) => t.title === 'Change the furnace filter');
    assert.ok(task, 'the Home task arrived');
    assert.equal(isHomeRecord(context, task), true, 'and it is still a Home record on the second device');
    assert.equal(task.durationSource, 'user', 'with its duration knowledge');
    assert.equal(b.persisted().identity.sync.queue.length, 0, 'pulling produced no outbound work');
  });

  test('an ARCHIVE made on one device reaches the second device as an archived Home area, records intact', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await mutate(a, (state) => ({ ...state, oneMoves: [withheldMove] }));
    await mutate(a, (state, c) => addTask(state, c, { title: 'Drain the water heater', categoryId: categoryWithRole(state, 'home').id, scope: 'household' }));
    await a.signIn();
    await mutate(a, (state) => archiveCategory(state, 'cat-home'));
    await a.settle();

    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await bindAsNewDevice(b, accountCloud);
    await b.signIn();
    const state = b.store.getSnapshot().state;
    const context = homeContextOf(state);
    assert.equal(context.kind, 'archived');
    assert.equal(isHomeRecord(context, state.tasks.find((t) => t.title === 'Drain the water heater')), true);
  });
});
