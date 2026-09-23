/**
 * THE INTEGRATED PRODUCT ON REAL DEVICES (HK-F01-F13 integration audit, Phases 6, 9, 10 and 11).
 *
 * Every device starts at `composeAccountApp` — the same composition the production root builds — over the shared in-memory cloud
 * (tests/support/fakeCloud.mjs, reused through the Meals two-device harness). The cloud here models the server's behaviour the
 * composition depends on; the owner-private, same-household and cross-household proofs against real PostgreSQL and PostgREST are in
 * supabase/tests. Where a real server constraint matters to the journey (a unique index), it is modelled explicitly with the real
 * transport's own classifier, so the device sees exactly the refusal it would see.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addExternalPerson, addFollowUp, editPersonContext, openPersonContext } from '../../src/domain/people.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { addChildToHousehold } from '../../src/features/kids/mutations.ts';
import { failureFrom } from '../../src/platform/supabaseSyncTransport.ts';
import { act, boundDevice, secondDevice } from '../meals/support/twoDevice.mjs';

const snapshot = (device) => device.store.getSnapshot().state;
const sync = (device) => device.persisted().identity.sync;

/** The real server's `person_contexts_one_per_{person,child}_uq`, answered exactly as the real transport classifies it. */
function modelOneContextPerPerson(cloud) {
  cloud.hooks.refuse = (table, row) => {
    if (table !== 'person_contexts') return null;
    const clash = cloud.table('person_contexts').find((r) => r.household_id === row.household_id
      && ((row.person_id != null && r.person_id === row.person_id) || (row.child_id != null && r.child_id === row.child_id)));
    if (!clash) return null;
    const index = row.person_id != null ? 'person_contexts_one_per_person_uq' : 'person_contexts_one_per_child_uq';
    return failureFrom({ code: '23505', message: `duplicate key value violates unique constraint "${index}"`, details: 'Key (household_id, profile_id, person_id)=(…) already exists.' });
  };
}

describe('two devices of one account, one person (HK13-D13)', () => {
  test('each opened a context for the same person offline: ONE context survives on both, the other is kept as evidence, and sync keeps flowing', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    modelOneContextPerPerson(cloud);
    const { result: added } = await act(a, (s, ctx) => addExternalPerson(s, ctx, { displayName: 'Jordan Lee' }));
    await a.settle();
    const b = await secondDevice({ cloud, accountCloud });
    const personOnB = snapshot(b).people.find((p) => p.displayName === 'Jordan Lee');
    assert.ok(personOnB, 'the person reached the second device');

    cloud.state.offline = true;
    const { result: onA } = await act(a, (s, ctx) => openPersonContext(s, ctx, { kind: 'person', id: added.id }, { contextNote: 'Met at the school fair' }));
    await act(b, (s, ctx) => openPersonContext(s, ctx, { kind: 'person', id: personOnB.id }, { contextNote: 'Prefers texts' }));
    await a.settle();
    await b.settle();
    cloud.state.offline = false;
    await a.settle();
    await b.settle();

    assert.equal(cloud.table('person_contexts').length, 1, 'the cloud keeps one context per person');
    for (const device of [a, b]) {
      const state = snapshot(device);
      assert.equal(validateAppState(state).ok, true);
      assert.equal(state.personContexts.filter((c) => c.personId === state.people.find((p) => p.displayName === 'Jordan Lee').id).length, 1, 'one context on each device');
    }
    assert.equal(snapshot(b).personContexts[0].contextNote, 'Met at the school fair', 'the cloud\'s context is what stands');
    assert.ok(sync(b).evidence.some((e) => e.kind === 'personContext' && !e.resolved), 'her other note is recorded as a conflict, never silently gone');

    // Sync is not stuck: a later edit on A reaches B on B's next cycle (before the repair, every cycle was refused by the integrity gate).
    await act(a, (s, ctx) => editPersonContext(s, ctx, onA.id, { relationshipName: 'Coach' }));
    await a.settle();
    await b.syncRuntime.request('manual');
    await b.settle();
    assert.equal(snapshot(b).personContexts[0].relationshipName, 'Coach', 'B still pulls');
    assert.equal(sync(b).queue.length, 0);
  });

  test('a follow-up B saved against its own context offline survives, attached to the ONE context, in the cloud and on A', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    modelOneContextPerPerson(cloud);
    const { result: added } = await act(a, (s, ctx) => addExternalPerson(s, ctx, { displayName: 'Sam Rivera' }));
    await a.settle();
    const b = await secondDevice({ cloud, accountCloud });
    const personOnB = snapshot(b).people.find((p) => p.displayName === 'Sam Rivera');

    cloud.state.offline = true;
    await act(a, (s, ctx) => openPersonContext(s, ctx, { kind: 'person', id: added.id }, { relationshipName: 'Neighbour' }));
    const { result: contextOnB } = await act(b, (s, ctx) => openPersonContext(s, ctx, { kind: 'person', id: personOnB.id }, { relationshipName: 'Neighbour' }));
    const { result: followUp } = await act(b, (s, ctx) => addFollowUp(s, ctx, { contextId: contextOnB.id, draftKey: 'returnladderfollowup000000001', title: 'Return the ladder' }));
    assert.equal(followUp.outcome, 'saved');
    await a.settle();
    await b.settle();
    cloud.state.offline = false;
    await a.settle();
    await b.settle();
    await b.syncRuntime.request('manual');
    await b.settle();

    assert.equal(cloud.table('person_contexts').length, 1);
    const [cloudContext] = cloud.table('person_contexts');
    const cloudLinks = cloud.table('person_task_links');
    assert.equal(cloudLinks.length, 1, 'her follow-up reached the cloud');
    assert.equal(cloudLinks[0].context_id, cloudContext.id, 'attached to the one context');
    assert.equal(sync(b).queue.length, 0, 'nothing left waiting');
    assert.deepEqual(sync(b).evidence.filter((e) => e.kind === 'personContext'), [], 'the same words on both devices: one context, nothing to record');

    await a.syncRuntime.request('manual');
    await a.settle();
    const onA = snapshot(a);
    const linkOnA = onA.personTaskLinks.find((l) => onA.tasks.find((t) => t.id === l.followUp.id)?.title === 'Return the ladder');
    assert.ok(linkOnA, 'A sees the follow-up B made');
    assert.equal(linkOnA.contextId, onA.personContexts[0].id);
    assert.equal(validateAppState(onA).ok, true);
    assert.equal(validateAppState(snapshot(b)).ok, true);
  });

  test('the same race over a CHILD\'s context resolves the same way', async () => {
    const { cloud, accountCloud, a } = await boundDevice();
    modelOneContextPerPerson(cloud);
    const { result: child } = await act(a, (s, ctx) => addChildToHousehold(s, ctx, { displayName: 'Maya', birthDate: '2016-04-02' }));
    await a.settle();
    const b = await secondDevice({ cloud, accountCloud });
    const childOnB = snapshot(b).children.find((c) => c.displayName === 'Maya');
    assert.ok(childOnB);

    cloud.state.offline = true;
    await act(a, (s, ctx) => openPersonContext(s, ctx, { kind: 'child', id: child.childId }, { contextNote: 'Allergic to wasps' }));
    await act(b, (s, ctx) => openPersonContext(s, ctx, { kind: 'child', id: childOnB.id }, { contextNote: 'Loves the library' }));
    await a.settle();
    await b.settle();
    cloud.state.offline = false;
    await a.settle();
    await b.settle();

    assert.equal(cloud.table('person_contexts').length, 1);
    const onB = snapshot(b);
    assert.equal(onB.personContexts.filter((c) => c.childId === childOnB.id).length, 1);
    assert.equal(onB.personContexts[0].contextNote, 'Allergic to wasps');
    assert.ok(sync(b).evidence.some((e) => e.kind === 'personContext' && e.evidence === 'domain-conflict'));
    assert.equal(validateAppState(onB).ok, true);
  });
});
