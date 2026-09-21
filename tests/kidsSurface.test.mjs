/**
 * Wave 2 hostile audit — the Kids surface.
 *
 * The Kids screen is the only place Her Keys speaks about a child by name, so
 * it is the place a name can be mistaken for an identity and an absence of
 * record can be mistaken for a plan. These tests attack both.
 *
 * Screens have no renderer in this repository, so the row projection is a pure
 * function and is exercised directly; the screen's use of it is checked by
 * reading its source.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { addEvent } from '../src/domain/events.ts';
import { ageOn, toInstant, zonedTimeToEpochMs } from '../src/domain/logicalDay.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { validateAppState } from '../src/domain/state.ts';
import { addTask } from '../src/domain/tasks.ts';
import { childCommitments, childDayRows, childLabel, NOTHING_ON_RECORD } from '../src/features/kids/childDay.ts';
import { ctx, DAY, demoState, TZ } from './support/fixtures.mjs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const at = (hour, minute = 0) => toInstant(zonedTimeToEpochMs(DAY, hour * 60 + minute, TZ));

/** A child of `age` on DAY, born `daysSinceBirthday` after their last birthday. */
function child(id, displayName, age, daysSinceBirthday = 100) {
  const year = Number(DAY.slice(0, 4)) - age;
  const born = `${year}-06-0${(daysSinceBirthday % 9) + 1}`;
  return { id, displayName, birthDate: born, age: ageOn(born, DAY) };
}

const rowsFor = (children, { events = [], tasks = [] } = {}) => childDayRows(children, events, tasks);
const event = (id, subjectMemberId, title, startMinutes) => ({
  id,
  title,
  startMinutes,
  endMinutes: startMinutes + 60,
  categoryId: 'cat-kids',
  subjectMemberId,
  commitment: 'fixed',
});
const task = (id, subjectMemberId, title, scheduledStartMinutes = undefined) => ({
  id,
  title,
  durationMinutes: 10,
  commitment: 'flexible',
  dueToday: true,
  daysOverdue: 0,
  categoryId: 'cat-kids',
  subjectMemberId,
  ...(scheduledStartMinutes === undefined ? {} : { scheduledStartMinutes }),
});

describe('Kids audit — a child is an id, never a name', () => {
  test('two children with the same name and the same age are two rows', () => {
    const children = [child('child-1', 'Josie', 8, 10), child('child-2', 'Josie', 8, 200)];
    const rows = rowsFor(children);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.key), ['child-1', 'child-2']);
  });

  test('children who would read identically are told apart by their own birth date', () => {
    const children = [child('child-1', 'Josie', 8, 10), child('child-2', 'Josie', 8, 200)];
    const [first, second] = rowsFor(children);
    assert.notEqual(first.label, second.label);
    assert.match(first.label, /^Josie, 8 \(born /);
    assert.match(second.label, /^Josie, 8 \(born /);
  });

  test('a name that does not collide is never decorated', () => {
    const rows = rowsFor([child('child-1', 'Josie', 8), child('child-2', 'Theo', 5)]);
    assert.deepEqual(rows.map((r) => r.label), ['Josie, 8', 'Theo, 5']);
  });

  test('the same name at different ages needs no birth date to be distinguishable', () => {
    const rows = rowsFor([child('child-1', 'Josie', 8), child('child-2', 'Josie', 5)]);
    assert.deepEqual(rows.map((r) => r.label), ['Josie, 8', 'Josie, 5']);
  });

  test('two children with the same name and the same birth date are still two rows', () => {
    const twin = child('child-1', 'Josie', 8, 10);
    const rows = rowsFor([twin, { ...twin, id: 'child-2' }]);
    assert.deepEqual(rows.map((r) => r.key), ['child-1', 'child-2']);
  });

  test('renaming a child keeps their identity and their day', () => {
    const before = rowsFor([child('child-1', 'Josie', 8)], { events: [event('evt-1', 'child-1', 'Soccer', 990)] });
    const after = rowsFor([{ ...child('child-1', 'Josie', 8), displayName: 'Jo' }], { events: [event('evt-1', 'child-1', 'Soccer', 990)] });
    assert.equal(before[0].key, after[0].key);
    assert.equal(before[0].value, after[0].value);
  });

  test('a child renamed to a sibling name does not take over the sibling day', () => {
    const children = [child('child-1', 'Josie', 8, 10), { ...child('child-2', 'Josie', 8, 200) }];
    const rows = rowsFor(children, { events: [event('evt-1', 'child-2', 'Soccer', 990)] });
    assert.equal(rows[0].value, NOTHING_ON_RECORD);
    assert.equal(rows[1].value, 'Soccer');
  });

  test('commitments are matched by id — a title naming another child changes nothing', () => {
    const rows = rowsFor([child('child-1', 'Josie', 8), child('child-2', 'Theo', 5)], {
      events: [event('evt-1', 'child-1', "Theo's swim lesson", 600)],
    });
    assert.equal(rows[0].value, "Theo's swim lesson");
    assert.equal(rows[1].value, NOTHING_ON_RECORD);
  });

  test('every child is listed — nothing is merged or dropped at the schema ceiling', () => {
    const children = Array.from({ length: 20 }, (_, i) => child(`child-${i}`, 'Josie', 8, i * 3));
    const rows = rowsFor(children);
    assert.equal(rows.length, 20);
    assert.equal(new Set(rows.map((r) => r.key)).size, 20);
  });
});

describe('Kids audit — an absence of record is never a plan', () => {
  test('a child with nothing on record is not reported as scheduled', () => {
    const [row] = rowsFor([child('child-1', 'Theo', 5)]);
    assert.equal(row.value, NOTHING_ON_RECORD);
  });

  test('no Kids row ever claims coverage, agreement or a plan', () => {
    const claims = /\b(covered|handled|confirmed|accepted|acknowledged|safe|sorted|taken care of|on the family schedule|plan in place|all set|done)\b/i;
    const rows = rowsFor([child('child-1', 'Theo', 5), child('child-2', 'Josie', 8)], {
      events: [event('evt-1', 'child-2', 'Soccer', 990)],
    });
    for (const row of rows) {
      assert.doesNotMatch(row.value, claims, row.label);
      assert.doesNotMatch(row.accessibilityLabel, claims, row.label);
    }
    assert.doesNotMatch(NOTHING_ON_RECORD, claims);
  });

  test('the Kids screen and its projection carry no coverage copy in source', () => {
    for (const path of ['src/features/kids/KidsOverview.tsx', 'src/features/kids/childDay.ts']) {
      assert.doesNotMatch(source(path), /on the family schedule/i, path);
    }
  });

  test('a household with no children says so instead of showing an empty surface', () => {
    assert.deepEqual(rowsFor([]), []);
    const screen = source('src/features/kids/KidsOverview.tsx');
    assert.match(screen, /rows\.length > 0/);
    assert.match(screen, /No children saved yet\./);
  });
});

describe('Kids audit — a child day is more than the calendar', () => {
  test('a task that names the child appears on that child day', () => {
    const [row] = rowsFor([child('child-1', 'Josie', 8)], { tasks: [task('task-1', 'child-1', 'Field trip form')] });
    assert.equal(row.value, 'Field trip form');
  });

  test('events and tasks for the child are read together', () => {
    const [row] = rowsFor([child('child-1', 'Josie', 8)], {
      events: [event('evt-1', 'child-1', 'Soccer', 990)],
      tasks: [task('task-1', 'child-1', 'Field trip form', 930)],
    });
    assert.equal(row.value, 'Field trip form · Soccer');
  });

  test('a task belonging to nobody, or to a parent, stays off every child row', () => {
    const rows = rowsFor([child('child-1', 'Josie', 8)], {
      tasks: [task('task-1', null, 'Pay orthodontist'), task('task-2', 'user-1', 'Pick up Josie')],
    });
    assert.equal(rows[0].value, NOTHING_ON_RECORD);
  });
});

describe('Kids audit — the day reads in day order', () => {
  test('commitments are ordered by time whatever order they were stored in', () => {
    const [row] = rowsFor([child('child-1', 'Josie', 8)], {
      events: [event('evt-late', 'child-1', 'Soccer', 990), event('evt-early', 'child-1', 'Dentist', 540)],
    });
    assert.equal(row.value, 'Dentist · Soccer');
  });

  test('work with no time of day comes after the timed day', () => {
    const [row] = rowsFor([child('child-1', 'Josie', 8)], {
      tasks: [task('task-1', 'child-1', 'Field trip form')],
      events: [event('evt-1', 'child-1', 'Soccer', 990)],
    });
    assert.equal(row.value, 'Soccer · Field trip form');
  });

  test('items at the same time keep a stable order', () => {
    const forward = childCommitments('child-1', [event('evt-b', 'child-1', 'Bravo', 600), event('evt-a', 'child-1', 'Alpha', 600)], []);
    const reverse = childCommitments('child-1', [event('evt-a', 'child-1', 'Alpha', 600), event('evt-b', 'child-1', 'Bravo', 600)], []);
    assert.deepEqual(forward.map((c) => c.id), reverse.map((c) => c.id));
    assert.deepEqual(forward.map((c) => c.title), ['Alpha', 'Bravo']);
  });
});

describe('Kids audit — every row is announced', () => {
  test('each row speaks its own label and value', () => {
    const rows = rowsFor([child('child-1', 'Josie', 8)], { events: [event('evt-1', 'child-1', 'Soccer', 990)] });
    assert.equal(rows[0].accessibilityLabel, 'Josie, 8: Soccer');
  });

  test('a child with nothing on record is still announced', () => {
    const [row] = rowsFor([child('child-1', 'Theo', 5)]);
    assert.equal(row.accessibilityLabel, `Theo, 5: ${NOTHING_ON_RECORD}`);
  });

  test('a row that cannot be pressed is still one accessible statement', () => {
    const list = source('src/design/components/StatusList.tsx');
    assert.match(list, /if \(!item\.onPress\) \{/);
    assert.match(list, /<View accessible accessibilityLabel=\{label\}>/);
  });
});

describe('Kids audit — the real demo household', () => {
  const demo = demoState(DAY);
  const day = projectStateDay(demo, DAY);
  const children = demo.children.map((c) => ({ ...c, age: ageOn(c.birthDate, DAY) }));

  test('the shipped household is valid and its children are distinct', () => {
    assert.equal(validateAppState(demo).ok, true);
    assert.equal(new Set(demo.children.map((c) => c.id)).size, demo.children.length);
  });

  test("a child with no commitments is not told they are on the family schedule", () => {
    const rows = childDayRows(children, day.events, day.tasks);
    const theo = rows.find((r) => r.label.startsWith('Theo'));
    assert.equal(theo.value, NOTHING_ON_RECORD);
  });

  test("the child-named task on today's list reaches that child's row", () => {
    const rows = childDayRows(children, day.events, day.tasks);
    const josie = rows.find((r) => r.label.startsWith('Josie'));
    assert.match(josie.value, /Email Josie's teacher about the field trip form/);
    assert.match(josie.value, /Josie's soccer practice/);
  });

  test('a child added to the real household keeps their own day', () => {
    let state = { ...demo, children: [...demo.children, { id: 'child-3', displayName: 'Josie', birthDate: '2018-01-05', scope: 'child' }] };
    state = addEvent(state, ctx({ createId: () => 'evt-new' }), {
      title: 'Orthodontist',
      categoryId: 'cat-kids',
      subjectMemberId: 'child-3',
      startsAt: at(11),
      endsAt: at(12),
      commitment: 'fixed',
      scope: 'child',
    });
    state = addTask(state, ctx({ createId: () => 'task-new' }), { title: 'Sign the form', categoryId: 'cat-kids', subjectMemberId: 'child-3', dueDate: DAY, scope: 'child' });
    assert.equal(validateAppState(state).ok, true);

    const view = projectStateDay(state, DAY);
    const rows = childDayRows(state.children.map((c) => ({ ...c, age: ageOn(c.birthDate, DAY) })), view.events, view.tasks);
    const added = rows.find((r) => r.key === 'child-3');
    assert.equal(added.value, 'Orthodontist · Sign the form');
    // The original Josie keeps her own day even though the names now collide.
    const original = rows.find((r) => r.key === 'child-1');
    assert.doesNotMatch(original.value, /Orthodontist/);
    assert.notEqual(added.label, original.label);
    assert.match(added.label, /^Josie, 8 \(born /);
  });
});

describe('Kids audit — the limit of what a label can say (documented debt AUD-F05-D1)', () => {
  test('identical name and identical birth date leaves the rows distinct but the labels equal', () => {
    const twin = child('child-1', 'Josie', 8, 10);
    const rows = rowsFor([twin, { ...twin, id: 'child-2' }]);
    // Identity is intact — two rows, two keys.
    assert.deepEqual(rows.map((r) => r.key), ['child-1', 'child-2']);
    // No household fact is left to tell them apart, and none is invented.
    assert.equal(rows[0].label, rows[1].label);
    assert.doesNotMatch(rows[0].label, /\d+\s*of\s*\d+|#\d+|\b(first|second|older|younger)\b/i);
  });
});

describe('Kids audit — identity survives a round trip', () => {
  test('the label is derived, never stored', () => {
    const children = [child('child-1', 'Josie', 8, 10), child('child-2', 'Josie', 8, 200)];
    assert.equal(childLabel(children[0], children), childLabel(children[0], children));
    assert.equal(childLabel(children[0], [children[0]]), 'Josie, 8');
  });
});
