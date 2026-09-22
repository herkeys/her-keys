/**
 * Build 3 hostile audit — capture, the task lists and Needs Me promotion.
 *
 * Whatever she saves stays reachable; promoting a captured item never loses
 * it; and an edit never rewrites what it didn't touch. Screens have no
 * renderer in this repository, so their wiring is checked by reading their
 * source.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { addCategory, archiveCategory } from '../src/domain/categories.ts';
import { addEvent, updateEvent } from '../src/domain/events.ts';
import { toInstant, zonedTimeToEpochMs, addDays } from '../src/domain/logicalDay.ts';
import { captureNeedsMeItem, promoteNeedsMeItem, promotionDefaults } from '../src/domain/needsMe.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { FIELD_LIMITS, SYSTEM_ROLES, validateAppState } from '../src/domain/state.ts';
import { describeOpenTask, hasOwnTaskList, openTasksInCategory, openTasksWithoutList, TASK_LIST_ROLES } from '../src/domain/taskLists.ts';
import { addTask, archiveTask, completeTask, updateTask } from '../src/domain/tasks.ts';
import { buildHomeView } from '../src/features/home/model/buildHomeView.ts';
import { openTaskLabel } from '../src/features/life/openTaskLabel.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, NEXT_DAY, TZ, ctx, harness, launch, onboardedState } from './support/fixtures.mjs';
import { finishOnboarding } from './support/store.mjs';

const source = (path) => readFileSync(path, 'utf8');
const YESTERDAY = '2026-09-15';

/** One of every kind of open task a real household can save, plus closed ones that must stay out of the lists. */
function everyKindOfTask() {
  let n = 0;
  const context = ctx({ createId: (prefix) => `${prefix}-k${++n}` });
  let state = createEmptyState(TZ);
  state = addCategory(state, context, { name: 'Pets', scope: 'household' });
  const add = (title, categoryId, extra = {}) => {
    state = addTask(state, context, { title, categoryId, scope: 'household', ...extra });
  };
  add('Undated home task', 'cat-home');
  add('Future money task', 'cat-money', { dueDate: '2026-10-30' });
  add('Overdue kids form', 'cat-kids', { dueDate: YESTERDAY });
  add('Due today at work', 'cat-work', { dueDate: DAY });
  add('Planned for today', 'cat-home', { plan: { kind: 'day', date: DAY } });
  add('Planned for tomorrow', 'cat-kids', { plan: { kind: 'day', date: NEXT_DAY } });
  add('Missed plan', 'cat-money', { plan: { kind: 'day', date: YESTERDAY } });
  add('Meal prep', 'cat-meals');
  add('Journal', 'cat-wellbeing', { dueDate: DAY });
  add('Call mom', 'cat-relationships');
  add('Swap weekend', 'cat-coparenting');
  add('Vet appointment', state.categories.find((c) => c.name === 'Pets').id);
  add('Done already', 'cat-home');
  state = completeTask(state, context, state.tasks.at(-1).id);
  add('Removed', 'cat-home');
  state = archiveTask(state, context, state.tasks.at(-1).id);
  return state;
}

describe('Build 3 audit — every open task is reachable (B3-AUD-004)', () => {
  test('each open task appears in exactly one list; closed tasks appear in none', () => {
    const state = everyKindOfTask();
    const listedByCategory = state.categories.filter(hasOwnTaskList).flatMap((category) => openTasksInCategory(state, category.id, DAY));
    const other = openTasksWithoutList(state, DAY);
    const seen = [...listedByCategory, ...other].map((entry) => entry.task.id);

    const open = state.tasks.filter((t) => t.status === 'open').map((t) => t.id);
    assert.deepEqual([...seen].sort(), [...open].sort());
    assert.equal(new Set(seen).size, seen.length, 'no task is listed twice');
    assert.ok(!seen.includes(state.tasks.find((t) => t.title === 'Done already').id));
    assert.ok(!seen.includes(state.tasks.find((t) => t.title === 'Removed').id));
    assert.deepEqual(
      other.map((entry) => entry.task.title),
      ['Journal', 'Call mom', 'Meal prep', 'Swap weekend', 'Vet appointment']
    );
  });

  test('the undated default and a far-off due date are listed, not lost', () => {
    const state = everyKindOfTask();
    const home = openTasksInCategory(state, 'cat-home', DAY).map((entry) => entry.task.title);
    const money = openTasksInCategory(state, 'cat-money', DAY).map((entry) => entry.task.title);
    assert.ok(home.includes('Undated home task'));
    assert.ok(money.includes('Future money task'));
    // Neither is on any day Today looks at in the next two months.
    const undated = state.tasks.find((t) => t.title === 'Undated home task').id;
    for (let k = 0; k < 60; k++) assert.ok(!projectStateDay(state, addDays(DAY, k)).tasks.some((t) => t.id === undated));
  });

  test('order and labels: what wants her first, then what’s coming, then what has no date', () => {
    const state = everyKindOfTask();
    const kids = openTasksInCategory(state, 'cat-kids', DAY);
    assert.deepEqual(kids.map((entry) => [entry.task.title, openTaskLabel(entry, DAY)]), [
      ['Overdue kids form', 'Overdue since Sep 15'],
      ['Planned for tomorrow', 'Planned for tomorrow'],
    ]);
    const money = openTasksInCategory(state, 'cat-money', DAY);
    assert.deepEqual(money.map((entry) => [entry.task.title, openTaskLabel(entry, DAY)]), [
      ['Future money task', 'Due Oct 30'],
      ['Missed plan', 'Was planned for Sep 15'],
    ]);
    const home = openTasksInCategory(state, 'cat-home', DAY);
    assert.deepEqual(home.map((entry) => openTaskLabel(entry, DAY)), ['Planned for today', 'No date']);
    assert.equal(openTaskLabel(openTasksInCategory(state, 'cat-work', DAY)[0], DAY), 'Due today');
  });

  test('the "on today" standings are exactly the tasks Today’s projection includes', () => {
    const state = everyKindOfTask();
    const onToday = new Set(projectStateDay(state, DAY).tasks.map((t) => t.id));
    for (const task of state.tasks.filter((t) => t.status === 'open')) {
      const { standing } = describeOpenTask(task, DAY, TZ);
      assert.equal(['overdue', 'due_today', 'today'].includes(standing), onToday.has(task.id), task.title);
    }
  });

  test('archiving a category moves its open tasks to "Other open tasks" instead of hiding them', () => {
    const state = archiveCategory(everyKindOfTask(), 'cat-kids');
    const other = openTasksWithoutList(state, DAY).map((entry) => entry.task.title);
    assert.ok(other.includes('Overdue kids form'));
    assert.ok(other.includes('Planned for tomorrow'));
  });

  test('every Life screen with a task list is wired to its role, and the hub links to the rest', () => {
    const screens = {
      // REWRITTEN (HK-FEATURE-05, test disposition in the ledger): Kids OS replaced KidsOverview. The INTENT is unchanged - every open task
      // in the kids category stays reachable from the Kids screen - but a child's own items now live under that child, so this screen
      // lists the ones that name no child (`unlinkedKidsTasks`). tests/kids/reachability.test.mjs proves the union covers every task.
      kids: 'src/features/kids/unlinked.ts',
      // HK-FEATURE-06 REWRITE (test disposition: REWRITTEN, not weakened). Home Overview was replaced by Home OS. The invariant this
      // row guarded is unchanged — the Home screen is wired to its ROLE (never a name) and lists every open task in its category, not
      // just today's — and is now checked against Home's own module below.
      home: 'src/features/home/model/homeContext.ts',
      money: 'src/features/money/MoneyOverview.tsx',
      work: 'src/features/work/WorkOverview.tsx',
    };
    assert.deepEqual(Object.keys(screens).sort(), [...TASK_LIST_ROLES].sort());
    for (const [role, path] of Object.entries(screens)) {
      const text = source(path);
      if (role === 'kids') {
        assert.match(text, /categoryWithRole\(state, 'kids'\)/, path);
        assert.match(text, /openTasksInCategory\(/, path);
        assert.match(source('src/features/kids/containers.tsx'), /unlinkedKidsTasks\(/, 'the Kids hub lists them');
        assert.match(source('app/(app)/life/kids.tsx'), /<KidsHub \/>/, 'the Life route renders the Kids hub');
        continue;
      }
      if (role === 'home') {
        assert.match(text, /categoryWithRole\(state, HOME_ROLE\)/, path);
        assert.match(text, /HOME_ROLE: SystemRole = 'home'/, path);
        assert.doesNotMatch(text, /\.name\s*(===|!==)/, 'Home never decides by a category name');
        continue;
      }
      assert.match(text, new RegExp(`categoryIdForRole\\('${role}'\\)`), path);
      assert.match(text, /<CategoryTaskList categoryId=/, path);
    }
    // ...and the behaviour behind it: every open Home task is listed by Home OS (the Life hub does not list them anywhere else).
    const withHomeTasks = everyKindOfTask();
    const openHome = withHomeTasks.tasks.filter((t) => t.categoryId === 'cat-home' && t.status === 'open').map((t) => `task:${t.id}`);
    assert.ok(openHome.length >= 2, 'the fixture has open Home tasks');
    const homeView = buildHomeView(withHomeTasks, zonedTimeToEpochMs(DAY, 10 * 60, TZ));
    const listed = new Set(['attention', 'waiting', 'comingUp', 'unresolved'].flatMap((key) => homeView.sections.find((s) => s.key === key).itemIds));
    assert.deepEqual(openHome.filter((id) => !listed.has(id)), [], 'no open Home task is missing from Home OS');
    for (const role of SYSTEM_ROLES.filter((r) => !TASK_LIST_ROLES.includes(r))) {
      assert.ok(!Object.keys(screens).includes(role));
    }

    const list = source('src/features/life/CategoryTaskList.tsx');
    assert.match(list, /openTasksInCategory\(/);
    assert.doesNotMatch(list, /useSchedule/, 'the category list is not limited to today');

    assert.match(source('app/(app)/life/index.tsx'), /router\.push\('\/life\/other-tasks'\)/);
    assert.match(source('app/(app)/life/other-tasks.tsx'), /OtherTasksList/);
    assert.match(source('app/(app)/life/_layout.tsx'), /<Stack\.Screen name="other-tasks"/);
    assert.match(source('src/features/life/OtherTasksList.tsx'), /openTasksWithoutList\(/);
  });
});

describe('Build 3 audit — promoting a Needs Me item never loses it (B3-AUD-002)', () => {
  test('promotion adds the task and resolves the item in one change', () => {
    let state = captureNeedsMeItem(createEmptyState(TZ), ctx({ createId: () => 'needsme-1' }), { title: 'Renew car registration' });
    state = { ...state, needsMe: state.needsMe.map((item) => ({ ...item, dueDate: '2026-09-30', categoryId: 'cat-money' })) };
    const defaults = promotionDefaults(state, 'needsme-1');
    assert.deepEqual(defaults, { title: 'Renew car registration', dueDate: '2026-09-30', categoryId: 'cat-money' });

    const promoted = promoteNeedsMeItem(state, ctx({ createId: () => 'task-promoted' }), 'needsme-1', { ...defaults, scope: 'household' });
    assert.equal(promoted.needsMe[0].status, 'resolved');
    assert.deepEqual((({ id, title, dueDate, categoryId }) => ({ id, title, dueDate, categoryId }))(promoted.tasks[0]), {
      id: 'task-promoted',
      title: 'Renew car registration',
      dueDate: '2026-09-30',
      categoryId: 'cat-money',
    });
    assert.equal(validateAppState(promoted).ok, true);
  });

  test('backing out of the editor leaves the item open and in the inbox, across a relaunch', async () => {
    const h = harness({ mode: 'empty' });
    const store = await launch(h);
    await finishOnboarding(store);
    await store.commit((state, context) => captureNeedsMeItem(state, context, { title: 'Renew car registration' }));
    // Opening the editor is navigation only; nothing is saved until she saves the task.
    const relaunched = (await launch(h)).getSnapshot().state;
    assert.deepEqual(relaunched.needsMe.map((item) => [item.title, item.status]), [['Renew car registration', 'open']]);
  });

  test('a failed promotion changes nothing: the item stays open and no task appears', async () => {
    let failing = false;
    const h = harness({ mode: 'empty', storageOptions: { failWrite: () => failing } });
    const store = await launch(h);
    await finishOnboarding(store);
    await store.commit((state, context) => captureNeedsMeItem(state, context, { title: 'Renew car registration' }));
    const itemId = store.getSnapshot().state.needsMe[0].id;

    failing = true;
    const saved = await store.commit((state, context) =>
      promoteNeedsMeItem(state, context, itemId, { title: 'Renew car registration', categoryId: 'cat-money', scope: 'household' })
    );
    assert.equal(saved, false);
    const { state } = store.getSnapshot();
    assert.deepEqual([state.needsMe[0].status, state.tasks.length], ['open', 0]);
  });

  test('the inbox screen only navigates on promote; the editor resolves the item when the task is saved', () => {
    const list = source('src/features/life/NeedsMeList.tsx');
    const promote = list.slice(list.indexOf('const onPromote'), list.indexOf('return (', list.indexOf('const onPromote')));
    assert.doesNotMatch(promote, /resolveNeedsMeItem|store\.(commit|dispatch)/);
    assert.match(promote, /needsMeId: id/);
    const form = source('src/features/tasks/TaskForm.tsx');
    assert.match(form, /promoteNeedsMeItem\(current, ctx, needsMeId, input\)/);
    assert.match(source('app/task-editor.tsx'), /needsMeId=\{first\(needsMeId\)\}/);
  });
});

describe('Build 3 audit — an edit changes only what she edited (B3-AUD-019)', () => {
  test('editing a task or event keeps its visibility scope, status and history', () => {
    const state = onboardedState();
    const forged = { producer: 'user-action', artifactId: null, confidence: null };
    const task = updateTask(state, ctx(), 'task-3', { title: 'Email the teacher', scope: 'household', status: 'archived', id: 'task-evil', provenance: forged });
    const edited = task.tasks.find((t) => t.id === 'task-3');
    assert.deepEqual([edited.title, edited.scope, edited.status], ['Email the teacher', 'child', 'open']);
    assert.ok(!task.tasks.some((t) => t.id === 'task-evil'));
    assert.equal(edited.provenance.producer, 'demo-seed', 'an edit never rewrites where a task came from');

    const event = updateEvent(state, ctx(), 'evt-1', { title: 'Team call', scope: 'household', source: 'user', provenance: forged, status: 'removed' });
    const editedEvent = event.events.find((e) => e.id === 'evt-1');
    assert.deepEqual([editedEvent.title, editedEvent.scope, editedEvent.provenance.producer, editedEvent.status], ['Team call', 'professional', 'demo-seed', 'active']);
    assert.equal('source' in editedEvent, false, 'a patched-in legacy flag is not stored');
  });

  test('an explicit null still clears a field', () => {
    const withDue = updateTask(onboardedState(), ctx(), 'task-2', { dueDate: DAY });
    assert.equal(updateTask(withDue, ctx(), 'task-2', { dueDate: null }).tasks.find((t) => t.id === 'task-2').dueDate, null);
  });

  test('the editors send scope only when creating', () => {
    for (const path of ['src/features/tasks/TaskForm.tsx', 'src/features/calendar/EventForm.tsx']) {
      const text = source(path);
      const edits = text.slice(text.indexOf('const edits = {'), text.indexOf('};', text.indexOf('const edits = {')));
      assert.doesNotMatch(edits, /scope/, path);
    }
  });

  test('a completed task cannot be archived into a state the store would refuse', () => {
    const done = completeTask(onboardedState(), ctx(), 'task-1');
    assert.equal(archiveTask(done, ctx(), 'task-1'), done);
  });
});

describe('Build 3 audit — capture limits match what can be stored (B3-AUD-018)', () => {
  test('the editors and quick capture cap every text field at the stored limit, and refuse out-of-range minutes', () => {
    const task = source('src/features/tasks/TaskForm.tsx');
    assert.match(task, /maxLength=\{FIELD_LIMITS\.titleLength\}/);
    assert.match(task, /maxLength=\{FIELD_LIMITS\.notesLength\}/);
    assert.match(task, /duration > FIELD_LIMITS\.durationMinutes/);
    const event = source('src/features/calendar/EventForm.tsx');
    assert.match(event, /maxLength=\{FIELD_LIMITS\.titleLength\}/);
    assert.match(event, /maxLength=\{FIELD_LIMITS\.locationLength\}/);
    assert.match(event, /minutes <= FIELD_LIMITS\.travelMinutes/);
    assert.match(source('src/features/life/NeedsMeQuickAdd.tsx'), /maxLength=\{FIELD_LIMITS\.titleLength\}/);
    assert.match(source('src/design/components/TextField.tsx'), /maxLength=\{maxLength\}/);
  });

  test('the limits the screens use are the ones the schema enforces', () => {
    const state = createEmptyState(TZ);
    const context = ctx();
    const long = 'x'.repeat(FIELD_LIMITS.titleLength);
    assert.equal(validateAppState(addTask(state, context, { title: long, categoryId: 'cat-home', scope: 'household' })).ok, true);
    assert.equal(validateAppState(addTask(state, context, { title: `${long}x`, categoryId: 'cat-home', scope: 'household' })).ok, false);
    assert.equal(validateAppState(addTask(state, context, { title: 't', categoryId: 'cat-home', durationMinutes: FIELD_LIMITS.durationMinutes + 1, scope: 'household' })).ok, false);
    const at = (hour) => toInstant(zonedTimeToEpochMs(DAY, hour * 60, TZ));
    const event = (travel) => addEvent(state, context, { title: 'e', categoryId: 'cat-home', startsAt: at(9), endsAt: at(10), commitment: 'fixed', travelMinutesBefore: travel, scope: 'household' });
    assert.equal(validateAppState(event(FIELD_LIMITS.travelMinutes)).ok, true);
    assert.equal(validateAppState(event(FIELD_LIMITS.travelMinutes + 1)).ok, false);
  });
});
