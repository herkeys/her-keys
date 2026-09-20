import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  addCategory,
  archiveCategory,
  categoriesInOrder,
  categoryWithRole,
  renameCategory,
  reorderCategories,
  restoreCategory,
  starterCategories,
} from '../src/domain/categories.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { validateAppState } from '../src/domain/state.ts';
import { computeDailyLoad } from '../src/features/daily-load/computeDailyLoad.ts';
import { deriveLifeStatus } from '../src/features/life/lifeStatus.ts';
import { dayLabel } from '../src/features/today/formatDay.ts';
import { decodeStoredState } from '../src/persistence/envelope.ts';
import { demoProvenance } from '../src/domain/foundation/provenance.ts';
import { DAY, ctx, demoState, rawEnvelope, stored } from './support/fixtures.mjs';
import { DEMO } from './support/provenance.mjs';

const assessmentFor = (state) => {
  const day = projectStateDay(state, DAY);
  const a = computeDailyLoad(day.events, day.tasks);
  return { status: a.status, buffer: a.bufferMinutes, gap: a.gap, candidates: a.candidates.map((c) => [c.task.id, c.projectedBufferMinutes]) };
};

const lifeStatusFor = (state) => {
  const day = projectStateDay(state, DAY);
  return deriveLifeStatus({
    categories: categoriesInOrder(state),
    events: day.events,
    tasks: day.tasks,
    systems: state.systems,
    upcomingMeals: state.meals.filter((m) => m.date >= DAY).map((m) => ({ label: dayLabel(m.date, DAY), categoryId: m.categoryId })),
  });
};

const withoutLabels = (statuses) => statuses.map(({ label, ...rest }) => rest);

describe('Household categories', () => {
  // 1
  test('the default household starts with all eight starter categories, in order, with their roles', () => {
    const state = demoState();
    assert.deepEqual(
      categoriesInOrder(state).map((c) => [c.id, c.name, c.systemRole, c.status]),
      [
        ['cat-kids', 'Kids', 'kids', 'active'],
        ['cat-home', 'Home', 'home', 'active'],
        ['cat-money', 'Money', 'money', 'active'],
        ['cat-meals', 'Meals', 'meals', 'active'],
        ['cat-work', 'Work', 'work', 'active'],
        ['cat-wellbeing', 'Wellbeing', 'wellbeing', 'active'],
        ['cat-relationships', 'Relationships', 'relationships', 'active'],
        ['cat-coparenting', 'Co-parenting', 'coparenting', 'active'],
      ]
    );
    assert.ok(state.categories.every((c) => c.householdId === state.household.id));
    // The same eight rows, and a demo household says so: the starters are demo-seed there, system-derived elsewhere.
    assert.deepEqual(starterCategories('hh-1', demoProvenance()), state.categories);
  });

  // 2
  test('a household can add its own category and attach commitments to it without a schema change', () => {
    let state = addCategory(demoState(), ctx(), { name: '  Pets ', scope: 'household' });
    const pets = state.categories.find((c) => c.name === 'Pets');
    assert.equal(pets.systemRole, null);
    assert.equal(pets.sortOrder, 8);

    state = {
      ...state,
      tasks: [
        ...state.tasks,
        { id: 'task-vet', title: 'Call the vet', categoryId: pets.id, subjectMemberId: null, durationMinutes: 5, commitment: 'fixed', dueDate: DAY, plan: { kind: 'unplanned' }, notes: null, status: 'open', completedAt: null, createdAt: null, updatedAt: null, provenance: DEMO, scope: 'household' },
      ],
    };
    assert.equal(validateAppState(state).ok, true);

    const petsStatus = lifeStatusFor(state).find((s) => s.key === pets.id);
    assert.deepEqual(petsStatus, { key: pets.id, label: 'Pets', systemRole: null, route: null, value: '1 thing due today', needsAttention: true });
  });

  // 3, 4
  test('renaming a category keeps its references, its filtering and its system role', () => {
    const before = demoState();
    const after = renameCategory(before, 'cat-kids', 'The Boys');

    assert.equal(validateAppState(after).ok, true);
    assert.equal(categoryWithRole(after, 'kids').name, 'The Boys');
    assert.equal(categoryWithRole(after, 'kids').id, 'cat-kids');
    assert.deepEqual(assessmentFor(after), assessmentFor(before));
    assert.deepEqual(withoutLabels(lifeStatusFor(after)), withoutLabels(lifeStatusFor(before)));
    assert.equal(lifeStatusFor(after)[0].label, 'The Boys');
  });

  // 5
  test('a custom category with a similar name does not become the system category', () => {
    const state = addCategory(demoState(), ctx(), { name: 'Money Stuff', scope: 'household' });
    assert.equal(state.categories.find((c) => c.name === 'Money Stuff').systemRole, null);
    assert.equal(categoryWithRole(state, 'money').id, 'cat-money');
  });

  // 6
  test('category order survives being stored and loaded', () => {
    const reversed = [...demoState().categories].reverse().map((c) => c.id);
    const state = reorderCategories(demoState(), reversed);
    const decoded = decodeStoredState(stored(state));

    assert.equal(decoded.kind, 'valid');
    assert.deepEqual(categoriesInOrder(decoded.state).map((c) => c.id), reversed);
  });

  test('a reorder that does not list every category exactly once changes nothing', () => {
    const state = demoState();
    assert.equal(reorderCategories(state, ['cat-kids', 'cat-home']), state);
    assert.equal(reorderCategories(state, [...state.categories.map((c) => c.id).slice(1), 'cat-home']), state);
  });

  // 7
  test('an archived category stays a valid reference, leaves Life, and can be restored', () => {
    const archived = archiveCategory(demoState(), 'cat-kids');

    assert.equal(validateAppState(archived).ok, true);
    assert.ok(!categoriesInOrder(archived).some((c) => c.id === 'cat-kids'));
    assert.ok(categoriesInOrder(archived, { includeArchived: true }).some((c) => c.id === 'cat-kids'));
    assert.ok(!lifeStatusFor(archived).some((s) => s.key === 'cat-kids'));
    assert.deepEqual(assessmentFor(archived), assessmentFor(demoState()));
    assert.equal(restoreCategory(archived, 'cat-kids').categories.find((c) => c.id === 'cat-kids').status, 'active');
  });

  // 8
  test('a dangling category reference fails validation, in memory and when loaded', () => {
    const state = demoState();
    const dangling = { ...state, tasks: state.tasks.map((t) => (t.id === 'task-2' ? { ...t, categoryId: 'cat-missing' } : t)) };

    const result = validateAppState(dangling);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'integrity_violation');
    assert.match(result.issues.join('\n'), /task task-2 references missing category cat-missing/);
    assert.deepEqual(
      (({ kind, reason }) => ({ kind, reason }))(decodeStoredState(rawEnvelope(dangling))),
      { kind: 'invalid', reason: 'integrity_violation' }
    );
  });

  test('category structure is checked: household, unique roles and orders, known roles', () => {
    const state = demoState();
    const expectInvalid = (categories, reason) => {
      const result = validateAppState({ ...state, categories });
      assert.equal(result.ok, false);
      assert.equal(result.reason, reason);
    };
    expectInvalid(state.categories.map((c, i) => (i === 0 ? { ...c, householdId: 'hh-other' } : c)), 'integrity_violation');
    expectInvalid(state.categories.map((c, i) => (i === 1 ? { ...c, systemRole: 'kids' } : c)), 'integrity_violation');
    expectInvalid(state.categories.map((c, i) => (i === 1 ? { ...c, sortOrder: 0 } : c)), 'integrity_violation');
    expectInvalid(state.categories.map((c, i) => (i === 0 ? { ...c, systemRole: 'pets' } : c)), 'invalid_state');
    expectInvalid(state.categories.map((c, i) => (i === 0 ? { ...c, name: '   ' } : c)), 'invalid_state');
  });

  // 9
  test('Daily Load works the same when commitments belong to custom categories', () => {
    const context = ctx();
    let state = addCategory(demoState(), context, { name: 'School', scope: 'household' });
    state = addCategory(state, context, { name: 'Side Business', scope: 'professional' });
    const [school, business] = state.categories.filter((c) => c.systemRole === null).map((c) => c.id);
    const custom = {
      ...state,
      events: state.events.map((e) => ({ ...e, categoryId: school })),
      tasks: state.tasks.map((t) => ({ ...t, categoryId: business })),
    };

    assert.equal(validateAppState(custom).ok, true);
    assert.deepEqual(assessmentFor(custom), assessmentFor(demoState()));
  });

  // 10
  test('no behavior changes when every category is renamed', () => {
    const before = demoState();
    let renamed = before;
    for (const [index, category] of before.categories.entries()) renamed = renameCategory(renamed, category.id, `Area ${index} ${Math.random().toString(36).slice(2, 7)}`);

    assert.deepEqual(assessmentFor(renamed), assessmentFor(before));
    assert.deepEqual(withoutLabels(lifeStatusFor(renamed)), withoutLabels(lifeStatusFor(before)));
  });

  test('no source file compares a category or any name against a display string', () => {
    const offenders = [];
    const starterNames = ['Kids', 'Home', 'Money', 'Meals', 'Work', 'Wellbeing', 'Relationships', 'Co-parenting', 'Children'];
    const namePattern = /\bname\s*[!=]==?\s*['"`]|['"`]\s*[!=]==?\s*[\w.]*\bname\b/;
    const literalPattern = new RegExp(`[!=]==?\\s*['"\`](${starterNames.join('|')})['"\`]`);

    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry)) {
          readFileSync(path, 'utf8')
            .split('\n')
            .forEach((line, index) => {
              if (namePattern.test(line) || literalPattern.test(line)) offenders.push(`${path}:${index + 1}: ${line.trim()}`);
            });
        }
      }
    };
    walk('src');
    walk('app');

    assert.deepEqual(offenders, []);
  });
});
