/**
 * HK-FEATURE-05 — no open task is ever out of reach (the Life guarantee) and the Kids screen never invents a child link (scenario AB).
 *
 * Every open task in the household's kids category is reachable from Life -> Kids: a task that names a child is under that child, and
 * one that names no child (or names the adult) is in the "not linked to a child" list. Neither set is empty because of the other.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addTask, archiveTask, completeTask } from '../../src/domain/tasks.ts';
import { unlinkedKidsTasks } from '../../src/features/kids/unlinked.ts';
import { buildChildDetail } from '../../src/features/kids/projection.ts';
import { NOW, TODAY, addTaskFor, emptyHousehold, idOf, makeCtx, withChildren } from './support.mjs';

const under = (s, childId) => {
  const d = buildChildDetail(s, s.household.id, childId, { nowMs: NOW });
  return new Set(Object.values(d.openWork).flat().map((i) => i.ref.id));
};

describe('reachability of the kids category\'s open tasks', () => {
  function world() {
    const c = makeCtx();
    let s = withChildren(emptyHousehold(), c, [['Sam', '2018-03-03'], ['Ivy', '2021-06-10']]);
    const sam = idOf(s, 'Sam');
    const kidsCategory = s.categories.find((k) => k.systemRole === 'kids').id;
    const linked = addTaskFor(s, c, sam, 'Linked to Sam');
    s = linked.state;
    // created through the ordinary task path: kids category, no child
    s = addTask(s, c, { title: 'Unlinked kids task', categoryId: kidsCategory, scope: 'household' });
    s = addTask(s, c, { title: 'Adult errand in kids list', categoryId: kidsCategory, subjectMemberId: s.user.id, scope: 'household' });
    // a household task in another category is not the Kids screen's business
    s = addTask(s, c, { title: 'Home chore', categoryId: s.categories.find((k) => k.systemRole === 'home').id, scope: 'household' });
    return { s, c, sam, linkedId: linked.id, kidsCategory };
  }

  test('a child-linked task is under its child; a task naming no child (or the adult) is in the unlinked list', () => {
    const { s, sam, linkedId } = world();
    assert.deepEqual([...under(s, sam)], [linkedId]);
    assert.deepEqual(unlinkedKidsTasks(s, TODAY).map((e) => e.task.title).sort(), ['Adult errand in kids list', 'Unlinked kids task']);
  });

  test('together they cover EVERY open task in the kids category, and neither list duplicates the other', () => {
    const { s, sam, kidsCategory } = world();
    const open = s.tasks.filter((t) => t.status === 'open' && t.categoryId === kidsCategory).map((t) => t.id);
    const covered = new Set([...under(s, sam), ...unlinkedKidsTasks(s, TODAY).map((e) => e.task.id)]);
    assert.deepEqual([...covered].sort(), [...open].sort());
    for (const e of unlinkedKidsTasks(s, TODAY)) assert.equal(under(s, sam).has(e.task.id), false);
  });

  test('AB. listing a task as "not linked" never links it: no child gains it', () => {
    const { s } = world();
    const before = JSON.stringify(s.tasks);
    unlinkedKidsTasks(s, TODAY);
    assert.equal(JSON.stringify(s.tasks), before);
    for (const child of s.children) assert.equal(under(s, child.id).has(s.tasks.find((t) => t.title === 'Unlinked kids task').id), false);
  });

  test('finished and removed tasks leave the list; a household with no kids category lists nothing', () => {
    const { s, c } = world();
    const target = s.tasks.find((t) => t.title === 'Unlinked kids task');
    assert.equal(unlinkedKidsTasks(completeTask(s, c, target.id), TODAY).some((e) => e.task.id === target.id), false);
    assert.equal(unlinkedKidsTasks(archiveTask(s, c, target.id), TODAY).some((e) => e.task.id === target.id), false);
    assert.deepEqual(unlinkedKidsTasks({ ...s, categories: s.categories.filter((k) => k.systemRole !== 'kids') }, TODAY), []);
  });
});
