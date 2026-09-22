/**
 * HK-FEATURE-13 (People OS) — local-first through a REAL store: immediate, durable, restart-safe, all-or-nothing.
 *
 * The store saves before it shows (`commit`), so what a relaunch reads back is exactly what was durable. Every People command runs
 * through `commitPeople`, which reports the command's NAMED outcome and never calls a failed write a save.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addPerson } from '../../src/domain/responsibility.ts';
import {
  addExternalPerson,
  addFollowUp,
  archivePersonContext,
  editPersonContext,
  followUpTaskId,
  openPersonContext,
  renamePerson,
} from '../../src/domain/people.ts';
import { commitPeople } from '../../src/features/people/commit.ts';
import { buildPeopleHome } from '../../src/features/people/projection.ts';
import { harness, launch } from '../support/fixtures.mjs';
import { DAY, JOSIE, MILO, draft } from './world.mjs';

async function boot(h) {
  const store = await launch(h);
  await store.commit((state, ctx) => addPerson({
    ...state,
    children: [
      { id: JOSIE, displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' },
      { id: MILO, displayName: 'Milo', birthDate: '2019-11-20', scope: 'child' },
    ],
  }, ctx, { displayName: 'Alex Rivera', relationship: 'co-parent' }));
  await store.flush();
  return store;
}

describe('LOCAL-FIRST: create -> immediate -> persist -> relaunch -> same identity and context', () => {
  test('an external person and her private context survive a relaunch with the same ids and words', async () => {
    const h = harness({ mode: 'empty' });
    const store = await boot(h);
    const created = await commitPeople(store, (s, c) => addExternalPerson(s, c, { displayName: 'Jordan Lee', relationshipLabel: 'Neighbor', organizationLabel: 'Elm Street', contextNote: 'Has a spare key.' }));
    assert.equal(created.outcome, 'saved');
    // Immediate: the change is in the snapshot the moment commit resolves — no network, no acknowledgement.
    const now = store.getSnapshot().state;
    assert.equal(now.people.find((p) => p.id === created.id).displayName, 'Jordan Lee');
    await store.flush();

    const store2 = await launch(h);
    const s = store2.getSnapshot().state;
    const person = s.people.find((p) => p.id === created.id);
    assert.ok(person, 'the same person id after relaunch');
    const context = s.personContexts.find((c) => c.personId === created.id);
    assert.deepEqual([context.relationshipLabel, context.organizationLabel, context.contextNote], ['Neighbor', 'Elm Street', 'Has a spare key.']);
  });

  test('rename, a follow-up and an archive all survive relaunch, and the follow-up link still names the same Task', async () => {
    const h = harness({ mode: 'empty' });
    const store = await boot(h);
    const opened = await commitPeople(store, (s, c) => openPersonContext(s, c, { kind: 'child', id: JOSIE }, { relationshipLabel: 'Daughter' }));
    const person = await commitPeople(store, (s, c) => addExternalPerson(s, c, { displayName: 'Sam', relationshipLabel: 'Coach' }));
    await commitPeople(store, (s, c) => renamePerson(s, c, person.id, 'Sam Ortiz'));
    const saved = await commitPeople(store, (s, c) => addFollowUp(s, c, { contextId: opened.id, draftKey: draft(1), title: 'Ask about the recital', dueDate: DAY }));
    assert.equal(saved.outcome, 'saved');
    const coachCtx = store.getSnapshot().state.personContexts.find((c) => c.personId === person.id).id;
    await commitPeople(store, (s, c) => archivePersonContext(s, c, coachCtx));
    await store.flush();

    const store2 = await launch(h);
    const s = store2.getSnapshot().state;
    assert.equal(s.people.find((p) => p.id === person.id).displayName, 'Sam Ortiz', 'rename kept the identity');
    assert.equal(s.personContexts.find((c) => c.id === coachCtx).status, 'archived', 'no resurrection on relaunch');
    assert.equal(s.personTaskLinks.length, 1);
    assert.equal(s.personTaskLinks[0].followUp.id, followUpTaskId(draft(1)));
    assert.equal(s.tasks.find((t) => t.id === followUpTaskId(draft(1))).scope, 'personal');
    const home = buildPeopleHome(s, DAY);
    assert.equal(home.verdict, 'One follow-up needs attention.');
  });
});

describe('ADD FOLLOW-UP through the store: all or nothing', () => {
  test('a write that fails leaves NEITHER the Task nor the link — in memory or on disk — and is reported not_saved', async () => {
    let failing = false;
    const h = harness({ mode: 'empty', storageOptions: { failWrite: () => failing } });
    const store = await boot(h);
    const opened = await commitPeople(store, (s, c) => openPersonContext(s, c, { kind: 'child', id: MILO }));
    await store.flush();
    const tasksBefore = store.getSnapshot().state.tasks.length;

    failing = true;
    const attempt = await commitPeople(store, (s, c) => addFollowUp(s, c, { contextId: opened.id, draftKey: draft(2), title: 'Buy cleats' }));
    assert.equal(attempt.outcome, 'not_saved');
    const shown = store.getSnapshot().state;
    assert.equal(shown.tasks.length, tasksBefore, 'no Task was shown');
    assert.equal(shown.personTaskLinks.length, 0, 'no link was shown');

    failing = false;
    const store2 = await launch(h);
    assert.equal(store2.getSnapshot().state.personTaskLinks.length, 0, 'nothing reached storage');
    assert.equal(store2.getSnapshot().state.tasks.filter((t) => t.scope === 'personal' && t.id.startsWith('task-fu-')).length, 0);

    // The same draft, retried once writes work again, creates exactly one of each.
    const retry = await commitPeople(store2, (s, c) => addFollowUp(s, c, { contextId: opened.id, draftKey: draft(2), title: 'Buy cleats' }));
    assert.equal(retry.outcome, 'saved');
    const again = await commitPeople(store2, (s, c) => addFollowUp(s, c, { contextId: opened.id, draftKey: draft(2), title: 'Buy cleats' }));
    assert.equal(again.outcome, 'already_saved');
    const s = store2.getSnapshot().state;
    assert.equal(s.personTaskLinks.length, 1);
    assert.equal(s.tasks.filter((t) => t.id === followUpTaskId(draft(2))).length, 1);
  });

  test('a transition the store refuses as invalid state is not shown and not stored (the store is the atomic boundary)', async () => {
    const h = harness({ mode: 'empty' });
    const store = await boot(h);
    const opened = await commitPeople(store, (s, c) => openPersonContext(s, c, { kind: 'child', id: MILO }));
    // A follow-up whose resulting state is corrupt (a second context for the same child sneaks in): the WHOLE transition is refused.
    const attempt = await commitPeople(store, (s, c) => {
      const r = addFollowUp(s, c, { contextId: opened.id, draftKey: draft(3), title: 'x' });
      return { ...r, state: { ...r.state, personContexts: [...r.state.personContexts, { ...r.state.personContexts[0], id: 'pctx-evil' }] } };
    });
    assert.equal(attempt.outcome, 'not_saved');
    const s = store.getSnapshot().state;
    assert.equal(s.personTaskLinks.length, 0);
    assert.equal(s.tasks.some((t) => t.id === followUpTaskId(draft(3))), false);
  });

  test('a refused command never reaches the store and reports its own reason', async () => {
    const h = harness({ mode: 'empty' });
    const store = await boot(h);
    const opened = await commitPeople(store, (s, c) => openPersonContext(s, c, { kind: 'child', id: MILO }));
    const before = h.primaryWrites().length;
    const r = await commitPeople(store, (s, c) => editPersonContext(s, c, opened.id, { relationshipLabel: 'x'.repeat(61) }));
    assert.equal(r.outcome, 'invalid_label');
    await store.flush();
    assert.equal(h.primaryWrites().length, before, 'nothing was written');
  });
});
