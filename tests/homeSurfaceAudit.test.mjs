import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { archiveCategory, categoriesInOrder } from '../src/domain/categories.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { findIntegrityProblems, validateAppState } from '../src/domain/state.ts';
import { hasOwnTaskList, openTaskCountsByCategory, openTasksInCategory, openTasksWithoutList } from '../src/domain/taskLists.ts';
import { addTask, completeTask } from '../src/domain/tasks.ts';
import { clearCount, deriveLifeStatus, shownOnLife } from '../src/features/life/lifeStatus.ts';
import { needsAttention, openTaskLabel } from '../src/features/life/openTaskLabel.ts';
import { dayLabel } from '../src/features/today/formatDay.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, TZ, ctx, demoState } from './support/fixtures.mjs';
import { USER } from './support/provenance.mjs';

/**
 * The Home surface under hostile conditions — Build 3 audit.
 *
 * Home's Life row is the app's reassurance surface: it is what she reads
 * instead of opening the screen. These pin the states where it could tell her
 * the home is handled when the recorded state does not support that, and the
 * states where open household work could stop being reachable.
 */

const empty = () => createEmptyState(TZ);

/** `ctx()` restarts its counter, so ids are drawn from one sequence per run instead. */
let seq = 0;
const nextCtx = () => ctx({ createId: (prefix) => `${prefix}-${++seq}` });

const homeTask = (state, title, extra = {}) => addTask(state, nextCtx(), { title, categoryId: 'cat-home', scope: 'household', ...extra });

const withHomeTasks = (titles, extra = {}) => titles.reduce((state, title) => homeTask(state, title, extra), empty());

const lifeStatusFor = (state) => {
  const day = projectStateDay(state, DAY);
  return deriveLifeStatus({
    categories: categoriesInOrder(state),
    events: day.events,
    tasks: day.tasks,
    systems: state.systems,
    upcomingMeals: state.meals.filter((m) => m.date >= DAY).map((m) => ({ label: dayLabel(m.date, DAY), categoryId: m.categoryId })),
    openTaskCounts: openTaskCountsByCategory(state),
  });
};

const homeRow = (state) => lifeStatusFor(state).find((status) => status.systemRole === 'home');

/** Exactly what StatusList hands a screen reader for a row. */
const spoken = (row) => `${row.label}: ${row.value}`;

describe('Home surface — unresolved work stays visible', () => {
  test('open home work is never answered with a count of systems', () => {
    const state = withHomeTasks(['Fix the leaking bathroom tap', 'Book the boiler service', 'Replace the smoke alarm battery']);
    const row = homeRow(state);

    // Today's projection holds none of them — they are undated, not absent.
    assert.equal(projectStateDay(state, DAY).tasks.filter((t) => t.categoryId === 'cat-home').length, 0);
    assert.equal(openTasksInCategory(state, 'cat-home', DAY).length, 3);

    assert.equal(row.value, '3 on your list, nothing due');
    assert.doesNotMatch(row.value, /systems? running/);
  });

  test('the row and the Home screen never disagree about how much is open', () => {
    for (const titles of [['One'], ['One', 'Two'], ['One', 'Two', 'Three', 'Four']]) {
      const state = withHomeTasks(titles);
      const listed = openTasksInCategory(state, 'cat-home', DAY).length;
      assert.equal(homeRow(state).value, `${listed} on your list, nothing due`);
    }
  });

  test('a task planned for a day already past still counts as on her list', () => {
    const state = withHomeTasks(['Regrout the shower'], { plan: { kind: 'day', date: '2026-08-01' } });
    const entry = openTasksInCategory(state, 'cat-home', DAY)[0];

    assert.equal(entry.standing, 'unscheduled');
    assert.equal(homeRow(state).value, '1 on your list, nothing due');
  });

  test('completing the last home task is what empties the row — nothing else', () => {
    const state = withHomeTasks(['Fix the tap']);
    assert.equal(homeRow(state).value, '1 on your list, nothing due');

    const done = completeTask(state, nextCtx(), state.tasks[0].id);
    assert.equal(homeRow(done).value, 'Nothing on your list');
  });
});

describe('Home surface — the row never claims the house is fine', () => {
  test('an empty Home speaks about her list, not about the home', () => {
    const row = homeRow(empty());

    assert.equal(row.value, 'Nothing on your list');
    assert.equal(row.needsAttention, false);
    // "0 systems running" read as reassurance and was not even true of the record.
    assert.doesNotMatch(row.value, /^0 /);
    assert.doesNotMatch(row.value, /\b(fine|safe|handled|covered|all good|nothing wrong)\b/i);
  });

  test('systems are mentioned only when the list is genuinely empty', () => {
    const base = demoState();
    assert.ok(base.systems.some((s) => s.categoryId === 'cat-home'), 'demo household should seed home systems');

    const cleared = base.tasks
      .filter((task) => task.categoryId === 'cat-home' && task.status === 'open')
      .reduce((state, task) => completeTask(state, nextCtx(), task.id), base);

    assert.equal(homeRow(cleared).value, '2 systems running');

    // One new undated task and the systems line gives way to her list again.
    assert.equal(homeRow(homeTask(cleared, 'Descale the kettle')).value, '1 on your list, nothing due');
  });

  test('a single system is not announced in the plural', () => {
    // A stored v4 system row, in the shape the current schema accepts — the
    // reading is about the count, so the row is built the way the rest of the
    // suite builds one rather than by hand.
    const one = {
      id: 'sys-1',
      name: 'Sunday reset',
      description: 'A weekly tidy',
      categoryId: 'cat-home',
      subjectMemberId: null,
      automationMode: 'manual',
      effortMinutes: null,
      energyDemand: null,
      provenance: USER,
      scope: 'household',
    };
    const state = { ...empty(), systems: [one] };

    assert.equal(validateAppState(state).ok, true);
    assert.equal(homeRow(state).value, '1 system running');
  });
});

describe('Home surface — overdue is not "due today"', () => {
  test('a task owed a fortnight ago is called overdue', () => {
    const state = withHomeTasks(['Boiler service'], { dueDate: '2026-09-01' });
    const row = homeRow(state);

    assert.equal(row.value, '1 thing overdue');
    assert.equal(row.needsAttention, true);

    // The Home screen already said this; the hub now agrees with it.
    const entry = openTasksInCategory(state, 'cat-home', DAY)[0];
    assert.equal(entry.standing, 'overdue');
    assert.equal(openTaskLabel(entry, DAY), 'Overdue since Sep 1');
    assert.equal(needsAttention(entry), true);
  });

  test('due today stays "due today"', () => {
    assert.equal(homeRow(withHomeTasks(['Bin night'], { dueDate: DAY })).value, '1 thing due today');
  });

  test('a mix names both rather than folding one into the other', () => {
    let state = withHomeTasks(['Bin night'], { dueDate: DAY });
    state = homeTask(state, 'Boiler service', { dueDate: '2026-09-01' });
    state = homeTask(state, 'Gutter clean', { dueDate: '2026-09-10' });

    assert.equal(homeRow(state).value, '1 due today, 2 overdue');
    assert.equal(homeRow(state).needsAttention, true);
  });
});

describe('Home surface — work stays reachable when the category does not', () => {
  test('archiving the Home category does not strand its open work', () => {
    const state = archiveCategory(withHomeTasks(['Fix the tap']), 'cat-home');
    const category = state.categories.find((c) => c.id === 'cat-home');

    assert.equal(validateAppState(state).ok, true);
    assert.equal(category.status, 'archived');

    // It leaves the Life hub, so "Other open tasks" has to pick it up.
    assert.equal(hasOwnTaskList(category), false);
    assert.equal(lifeStatusFor(state).some((s) => s.systemRole === 'home'), false);
    assert.deepEqual(openTasksWithoutList(state, DAY).map((e) => e.task.title), ['Fix the tap']);

    // And the screen itself still lists it if she reaches it directly.
    assert.deepEqual(openTasksInCategory(state, 'cat-home', DAY).map((e) => e.task.title), ['Fix the tap']);
  });

  test('a second category claiming the home role is refused, not silently preferred', () => {
    const state = empty();
    const rival = { ...state.categories[0], id: 'cat-home-2', name: 'House', systemRole: 'home', sortOrder: 99 };
    const forged = { ...state, categories: [...state.categories, rival] };

    // Otherwise the role lookup would pick one and the other's tasks would be listed nowhere.
    assert.deepEqual(findIntegrityProblems(forged), ['duplicate category systemRole home']);
    assert.equal(validateAppState(forged).ok, false);
  });
});

describe('Home surface — what a screen reader is handed', () => {
  test('every Home row speaks as a clean sentence', () => {
    const states = [
      empty(),
      demoState(),
      withHomeTasks(['Fix the tap']),
      withHomeTasks(['Fix the tap', 'Book the boiler']),
      withHomeTasks(['Boiler service'], { dueDate: '2026-09-01' }),
      withHomeTasks(['Bin night'], { dueDate: DAY }),
    ];

    for (const state of states) {
      const row = homeRow(state);
      const line = spoken(row);

      assert.notEqual(row.value.trim(), '', `empty value spoken as "${line}"`);
      assert.equal(row.value, row.value.trim());
      assert.doesNotMatch(line, /\s[,.;:]/, `stray space before punctuation in "${line}"`);
      assert.doesNotMatch(line, /\s{2,}/, `doubled space in "${line}"`);
      assert.doesNotMatch(line, /[,;:]\s*$/, `trailing punctuation in "${line}"`);
    }
  });

  test('attention is carried by the words, not only by the colour', () => {
    // StatusList tints the value and adds a dot; neither reaches a screen reader.
    const attention = homeRow(withHomeTasks(['Boiler service'], { dueDate: '2026-09-01' }));
    assert.equal(attention.needsAttention, true);
    assert.match(attention.value, /overdue/);

    const calm = homeRow(withHomeTasks(['Fix the tap']));
    assert.equal(calm.needsAttention, false);
    assert.match(calm.value, /nothing due/);
  });
});

describe('Home surface — counting stays honest under density', () => {
  test('two hundred open home tasks are counted, not sampled', () => {
    const titles = Array.from({ length: 200 }, (_, i) => `Home task ${i + 1}`);
    const state = withHomeTasks(titles);

    assert.equal(homeRow(state).value, '200 on your list, nothing due');
    assert.equal(openTasksInCategory(state, 'cat-home', DAY).length, 200);
  });

  test('the count reads only open tasks, and only this category', () => {
    let state = withHomeTasks(['Home one', 'Home two']);
    state = addTask(state, nextCtx(), { title: 'Kids thing', categoryId: 'cat-kids', scope: 'household' });
    state = completeTask(state, nextCtx(), state.tasks[0].id);

    const counts = openTaskCountsByCategory(state);
    assert.equal(counts.get('cat-home'), 1);
    assert.equal(counts.get('cat-kids'), 1);
    assert.equal(homeRow(state).value, '1 on your list, nothing due');
  });

  test('the Life hub counts Home clear only on the strength of what is due', () => {
    // Documented shared behaviour, pinned so a change to it is a decision:
    // `clearCount` reads needsAttention, which is "due today" only.
    const shown = shownOnLife(lifeStatusFor(withHomeTasks(['Fix the tap', 'Book the boiler'])));
    const home = shown.find((s) => s.systemRole === 'home');

    assert.equal(home.needsAttention, false);
    assert.equal(clearCount(shown), shown.length);
    // The row it sits beside must therefore carry the truth itself.
    assert.equal(home.value, '2 on your list, nothing due');
  });
});
