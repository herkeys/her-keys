/**
 * HK-FEATURE-13 (People OS) — the read side: one projection over canonical identities, name order, explicit follow-ups only, a factual
 * verdict, and nothing that ranks a human or infers anything about a relationship.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addExternalPerson,
  addFollowUp,
  archiveExternalPerson,
  archivePersonContext,
  followUpTaskId,
  openPersonContext,
} from '../../src/domain/people.ts';
import { archiveTask, completeTask } from '../../src/domain/tasks.ts';
import { peopleLifeTile } from '../../src/features/people/lifeTile.ts';
import { personDetail } from '../../src/features/people/privateNote.ts';
import {
  NEEDS_FOLLOW_UP_CAP,
  buildPeopleHome,
  compareRows,
  followUps,
  peopleRows,
  peopleVerdict,
  recentlyUpdated,
} from '../../src/features/people/projection.ts';
import { DAY, JOSIE, MILO, draft, world } from './world.mjs';

const add = (w, s, name, fields = {}) => {
  const r = addExternalPerson(s, w.at(), { displayName: name, ...fields });
  return { state: r.state, id: r.id };
};

describe('the People list is ONE projection over the canonical identities', () => {
  test('children and non-account people appear once each; the account holder never does; nothing is duplicated', () => {
    const w = world();
    const s = add(w, w.state, 'Jordan Lee').state;
    const rows = peopleRows(s);
    assert.deepEqual(rows.map((r) => r.key).sort(), [`child:${JOSIE}`, `child:${MILO}`, `person:${w.coParentId}`, `person:${s.people.at(-1).id}`].sort());
    assert.ok(!rows.some((r) => r.source.id === s.user.id), 'the current user is excluded (F11 owns self)');
    assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
  });

  test('each row is traceable to its canonical source; the co-parent is a read-only "Co-parent" row; a child is a "Child" row', () => {
    const w = world();
    const rows = peopleRows(w.state);
    const alex = rows.find((r) => r.source.kind === 'person' && r.source.id === w.coParentId);
    assert.equal(alex.kindLabel, 'Co-parent');
    assert.equal(alex.identityEditable, false);
    const josie = rows.find((r) => r.source.kind === 'child' && r.source.id === JOSIE);
    assert.equal(josie.kindLabel, 'Child');
    assert.equal(josie.identityEditable, false);
  });

  test('ORDER: by name (case-insensitive, deterministic), then by canonical key — never by Tasks, recency or "importance"', () => {
    const w = world({ coParent: false });
    let s = w.state;
    for (const name of ['beth', 'Anna', 'Zed', 'anna']) s = add(w, s, name).state;
    const names = peopleRows(s).map((r) => r.displayName);
    assert.deepEqual(names, ['Anna', 'anna', 'beth', 'Josie', 'Milo', 'Zed'].sort((a, b) => compareRows({ displayName: a, key: a }, { displayName: b, key: b })));
    assert.equal(names[0].toLowerCase(), 'anna');
    // Giving one person many follow-ups does not move them.
    const zed = s.people.find((p) => p.displayName === 'Zed');
    const opened = openPersonContext(s, w.at(), { kind: 'person', id: zed.id });
    let t = opened.state;
    for (let i = 0; i < 4; i += 1) t = addFollowUp(t, w.at(), { contextId: opened.id, draftKey: draft(i), title: `t${i}`, dueDate: DAY }).state;
    assert.deepEqual(peopleRows(t).map((r) => r.displayName), names, 'the order of HUMANS does not depend on their work');
  });

  test('DUPLICATE NAMES: two rows, told apart by her label, then her organization, else shown identical — never numbered or merged', () => {
    const w = world({ coParent: false });
    let s = w.state;
    s = add(w, s, 'Jordan Lee', { relationshipName: 'Friend' }).state;
    s = add(w, s, 'Jordan Lee', { organizationName: 'Riverside FC' }).state;
    s = add(w, s, 'Jordan Lee').state;
    const jordans = peopleRows(s).filter((r) => r.displayName === 'Jordan Lee');
    assert.equal(jordans.length, 3);
    assert.deepEqual(jordans.map((r) => r.secondary).sort((a, b) => String(a).localeCompare(String(b))), ['Friend', 'Riverside FC', null].sort((a, b) => String(a).localeCompare(String(b))));
    for (const row of jordans) assert.doesNotMatch(row.displayName, /#|\(\d\)|\d$/, 'no invented disambiguator');
  });

  test('an archived non-account person leaves the active list; their context stays and becomes inert', () => {
    const w = world();
    const p = add(w, w.state, 'Casey', { relationshipName: 'Friend' });
    const pctx = p.state.personContexts.at(-1).id;
    const withTask = addFollowUp(p.state, w.at(), { contextId: pctx, draftKey: draft(9), title: 'Lunch', dueDate: DAY }).state;
    const archived = archiveExternalPerson(withTask, w.at(), p.id).state;
    assert.ok(!peopleRows(archived).some((r) => r.source.id === p.id));
    assert.equal(followUps(archived, DAY).length, 0, 'an inert context produces no follow-up');
    assert.equal(archived.personContexts.find((c) => c.id === pctx).status, 'active', 'no automatic context archive');
    assert.ok(buildPeopleHome(archived, DAY).archived.some((a) => a.what === 'person'), 'and it is restorable from Archived');
  });

  test('a context whose canonical target has VANISHED (a child removed elsewhere) never crashes, never counts, never re-attaches', () => {
    const w = world();
    const opened = openPersonContext(w.state, w.at(), { kind: 'child', id: MILO }, { relationshipName: 'Son' });
    const saved = addFollowUp(opened.state, w.at(), { contextId: opened.id, draftKey: draft(10), title: 'Pack the bag', dueDate: DAY }).state;
    const gone = { ...saved, children: saved.children.filter((c) => c.id !== MILO) };
    const home = buildPeopleHome(gone, DAY);
    assert.equal(home.followUpTotal, 0);
    assert.equal(home.verdict, 'Nothing needs attention.');
    assert.ok(!home.people.some((r) => r.key === `child:${MILO}`));
    assert.equal(personDetail(gone, `child:${MILO}`, DAY), null);
    const restored = { ...gone, children: saved.children };
    assert.equal(buildPeopleHome(restored, DAY).followUpTotal, 1, 'restoring the target makes the context eligible again');
  });
});

describe('NEEDS FOLLOW-UP — only explicit, open, linked Tasks', () => {
  const setup = () => {
    const w = world();
    const opened = openPersonContext(w.state, w.at(), { kind: 'person', id: w.coParentId });
    return { w, s: opened.state, ctx: opened.id };
  };

  test('a person alone needs nothing; the verdict says so', () => {
    const w = world();
    const home = buildPeopleHome(w.state, DAY);
    assert.equal(home.followUpTotal, 0);
    assert.equal(home.verdict, 'Nothing needs attention.');
  });

  test('ordering: overdue (earliest first), today, upcoming (earliest first), undated (created first); the cap is three with See all', () => {
    const { w, s: base, ctx } = setup();
    let s = base;
    const plan = [['u2', null, 3], ['f2', '2026-09-25', 1], ['o2', '2026-09-14', 1], ['t', DAY, 1], ['o1', '2026-09-10', 1], ['f1', '2026-09-20', 1], ['u1', null, 2]];
    plan.forEach(([title, due, minute], index) => {
      s = addFollowUp(s, w.at(Date.UTC(2026, 8, 16, 14, minute)), { contextId: ctx, draftKey: draft(100 + index), title, dueDate: due }).state;
    });
    const titles = followUps(s, DAY).map((f) => f.title);
    assert.deepEqual(titles, ['o1', 'o2', 't', 'f1', 'f2', 'u1', 'u2']);
    const home = buildPeopleHome(s, DAY);
    assert.equal(home.followUps.length, NEEDS_FOLLOW_UP_CAP);
    assert.equal(home.followUpTotal, 7);
    assert.deepEqual(home.allFollowUps.map((f) => f.title), titles);
  });

  test('VERDICT is count-aware and one category only', () => {
    const { w, s: base, ctx } = setup();
    let s = addFollowUp(base, w.at(), { contextId: ctx, draftKey: draft(1), title: 'a', dueDate: '2026-09-18' }).state;
    assert.equal(buildPeopleHome(s, DAY).verdict, 'Next follow-up: Friday.');
    s = addFollowUp(s, w.at(), { contextId: ctx, draftKey: draft(2), title: 'b', dueDate: DAY }).state;
    assert.equal(buildPeopleHome(s, DAY).verdict, 'One follow-up needs attention.');
    s = addFollowUp(s, w.at(), { contextId: ctx, draftKey: draft(3), title: 'c', dueDate: '2026-09-01' }).state;
    assert.equal(buildPeopleHome(s, DAY).verdict, 'Two follow-ups need attention.');
    assert.equal(peopleVerdict([], DAY), 'Nothing needs attention.');
  });

  test('LINK TARGET: a completed, archived or missing Task stops counting; the context is untouched; nothing is re-linked', () => {
    const { w, s: base, ctx } = setup();
    let s = addFollowUp(base, w.at(), { contextId: ctx, draftKey: draft(4), title: 'x', dueDate: DAY }).state;
    const id = followUpTaskId(draft(4));
    for (const t of [completeTask(s, w.at(), id), archiveTask(s, w.at(), id), { ...s, tasks: s.tasks.filter((task) => task.id !== id) }]) {
      assert.equal(followUps(t, DAY).length, 0);
      assert.equal(buildPeopleHome(t, DAY).verdict, 'Nothing needs attention.');
      assert.deepEqual(t.personContexts, s.personContexts);
    }
  });

  test('an ARCHIVED context contributes no follow-up on People surfaces (the Task itself stays a Task)', () => {
    const { w, s: base, ctx } = setup();
    const s = addFollowUp(base, w.at(), { contextId: ctx, draftKey: draft(5), title: 'x', dueDate: DAY }).state;
    const archived = archivePersonContext(s, w.at(), ctx).state;
    assert.equal(followUps(archived, DAY).length, 0);
    assert.equal(archived.tasks.find((t) => t.id === followUpTaskId(draft(5))).status, 'open');
  });
});

describe('recently updated, Life tile, detail', () => {
  test('recently updated: latest five ACTIVE contexts by updatedAt then id; name, her label and date — no note', () => {
    const w = world({ coParent: false });
    let s = w.state;
    for (let i = 0; i < 7; i += 1) s = addExternalPerson(s, w.at(Date.UTC(2026, 8, 16, 12, i)), { displayName: `P${i}`, relationshipName: `L${i}`, contextNote: `NOTE${i}` }).state;
    const recent = recentlyUpdated(s);
    assert.deepEqual(recent.map((r) => r.displayName), ['P6', 'P5', 'P4', 'P3', 'P2']);
    assert.ok(!JSON.stringify(recent).includes('NOTE'), 'no note');
    assert.equal(buildPeopleHome(w.state, DAY).recent.length, 0, 'omitted when there are no contexts');
  });

  test('the Life tile is a count or a date — never a name, a label or a note', () => {
    const w = world();
    const opened = openPersonContext(w.state, w.at(), { kind: 'person', id: w.coParentId }, { relationshipName: 'LABEL-X', contextNote: 'NOTE-X' });
    assert.equal(peopleLifeTile(opened.state, DAY).value, '3 people');
    const s = addFollowUp(opened.state, w.at(), { contextId: opened.id, draftKey: draft(1), title: 'TITLE-X', dueDate: DAY }).state;
    const tile = peopleLifeTile(s, DAY);
    assert.equal(tile.value, 'One follow-up needs attention.');
    assert.equal(tile.needsAttention, true);
    const text = JSON.stringify(tile);
    for (const secret of ['Alex', 'LABEL-X', 'NOTE-X', 'TITLE-X']) assert.ok(!text.includes(secret), secret);
    assert.equal(peopleLifeTile({ ...w.state, children: [], people: [] }, DAY).value, 'Nothing needs attention');
  });

  test('the detail is the ONE surface that carries the note', () => {
    const w = world();
    const opened = openPersonContext(w.state, w.at(), { kind: 'person', id: w.coParentId }, { contextNote: 'Prefers texts.' });
    const detail = personDetail(opened.state, `person:${w.coParentId}`, DAY);
    assert.equal(detail.context.contextNote, 'Prefers texts.');
    assert.equal(detail.identityEditable, false);
    assert.equal(detail.readOnlyReason, 'Their details are managed in Co-Parent.');
    const home = JSON.stringify(buildPeopleHome(opened.state, DAY));
    assert.ok(!home.includes('Prefers texts.'), 'the home never carries it');
  });

  test('EMPTY: no projected person at all ⇒ the gentle empty state; people without context are NOT empty', () => {
    const w = world({ coParent: false });
    assert.equal(buildPeopleHome({ ...w.state, children: [] }, DAY).empty, true);
    assert.equal(buildPeopleHome(w.state, DAY).empty, false);
  });
});
