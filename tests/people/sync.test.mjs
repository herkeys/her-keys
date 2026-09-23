/**
 * HK-FEATURE-13 (People OS) through the PRODUCTION sync composition (store + account runtime + coordinator), against the in-memory
 * cloud (tests/support/fakeCloud.mjs). People rows travel on the ordinary queue, push, CAS and pull: no People-specific sync exists.
 * The real database, real HTTP and real RLS version of these journeys is supabase/tests/journey-people.mjs.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addChild } from '../../src/domain/children.ts';
import {
  addExternalPerson,
  addFollowUp,
  archivePersonContext,
  editPersonContext,
  followUpTaskId,
  openPersonContext,
} from '../../src/domain/people.ts';
import { canOpenScreen } from '../../src/domain/routeAccess.ts';
import { buildPeopleHome } from '../../src/features/people/projection.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { ACCOUNT_A, ACCOUNT_B, TODAY, accountCloudFor, bindAsNewDevice, makeDevice, mutate } from '../support/accountDevice.mjs';
import { createFakeCloud } from '../support/fakeCloud.mjs';
import { draft } from './world.mjs';

const NOTE = 'Keeps the spare key; ask before 8.';

async function signedIn({ storage } = {}) {
  const cloud = createFakeCloud();
  const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
  const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, storage });
  await mutate(a, (s, ctx) => addChild(s, ctx, { displayName: 'Mia', birthDate: '2016-04-02' }));
  assert.equal(a.store.getSnapshot().state.children.length, 1, 'the household has a child to hold a context about');
  const state = await a.signIn();
  assert.equal(state.kind, 'accountBound');
  return { cloud, accountCloud, a };
}

const peopleState = (device) => device.store.getSnapshot().state;
const cloudRows = (cloud, table) => cloud.table(table);

async function writePeople(a) {
  await mutate(a, (s, c) => addExternalPerson(s, c, { displayName: 'Jordan Lee', relationshipName: 'Neighbor', contextNote: NOTE }).state);
  const contextId = peopleState(a).personContexts.at(-1).id;
  await mutate(a, (s, c) => addFollowUp(s, c, { contextId, draftKey: draft(1), title: 'Return the ladder', dueDate: TODAY }).state);
  await mutate(a, (s, c) => editPersonContext(s, c, contextId, { organizationName: 'Elm Street' }).state);
  await mutate(a, (s, c) => archivePersonContext(s, c, contextId).state);
  return contextId;
}

describe('LOCAL-FIRST + SYNC: offline create/edit/archive -> reconnect -> a fresh device reconstructs', () => {
  test('offline writes are durable and local; on reconnect exactly one person, one context (archived, edited), one link and one private task reach the cloud', async () => {
    const { cloud, a } = await signedIn();
    cloud.state.offline = true;
    const contextId = await writePeople(a);
    await a.settle();
    assert.equal(cloudRows(cloud, 'person_contexts').length, 0, 'nothing left the device while offline');
    assert.ok(a.persisted().identity.sync.queue.some((item) => item.kind === 'personContext'), 'the intent is durable in the queue');
    assert.equal(peopleState(a).personContexts.find((c) => c.id === contextId).status, 'archived', 'and the UI already shows it (no network wait)');

    cloud.state.offline = false;
    await a.syncRuntime.request('manual');
    const [context] = cloudRows(cloud, 'person_contexts');
    assert.equal(cloudRows(cloud, 'person_contexts').length, 1);
    assert.deepEqual([context.status, context.relationship_name, context.organization_name, context.context_note, context.producer],
      ['archived', 'Neighbor', 'Elm Street', NOTE, 'user-action']);
    assert.equal(cloudRows(cloud, 'household_people').filter((p) => p.display_name === 'Jordan Lee').length, 1);
    const [link] = cloudRows(cloud, 'person_task_links');
    assert.equal(cloudRows(cloud, 'person_task_links').length, 1);
    const task = cloudRows(cloud, 'tasks').find((t) => t.id === link.follow_up_task_id);
    assert.deepEqual([task.title, task.scope, link.relation, link.context_id], ['Return the ladder', 'personal', 'follow_up', context.id], 'the link names the private task and the context by CLOUD id');
    assert.equal(a.persisted().identity.sync.queue.length, 0);
    assert.equal(a.persisted().identity.sync.evidence.length, 0);
  });

  test('a FRESH device of the same account rebuilds the same people, the archived context stays archived (no resurrection), and the follow-up is re-linked to the same task', async () => {
    const { cloud, accountCloud, a } = await signedIn();
    await writePeople(a);
    await a.settle();

    const b = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await bindAsNewDevice(b, accountCloud);
    assert.equal((await b.signIn()).kind, 'accountBound');
    const sa = peopleState(a);
    const sb = peopleState(b);
    const strip = (c) => ({ status: c.status, relationshipName: c.relationshipName, organizationName: c.organizationName, contextNote: c.contextNote, provenance: c.provenance });
    assert.deepEqual(sb.personContexts.map(strip), sa.personContexts.map(strip));
    assert.equal(sb.personContexts[0].status, 'archived', 'NO RESURRECTION on a fresh device');
    const personB = sb.people.find((p) => p.id === sb.personContexts[0].personId);
    assert.equal(personB.displayName, 'Jordan Lee', 'the context names the same person (by its reconstructed id)');
    assert.equal(sb.personTaskLinks.length, 1);
    const taskB = sb.tasks.find((t) => t.id === sb.personTaskLinks[0].followUp.id);
    assert.deepEqual([taskB.title, taskB.scope], ['Return the ladder', 'personal']);
    assert.deepEqual(buildPeopleHome(sb, TODAY).verdict, buildPeopleHome(sa, TODAY).verdict);
    assert.equal(b.persisted().identity.sync.queue.length, 0, 'hydration produced no outbound work');
  });
});

describe('People made BEFORE the first sign-in', () => {
  test('a household that saved People while unbound carries them up after the claim, through the seeded queue (nothing is lost, nothing duplicated)', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await mutate(a, (s, ctx) => addChild(s, ctx, { displayName: 'Mia', birthDate: '2016-04-02' }));
    await writePeople(a);
    assert.equal(cloud.calls.length, 0, 'unbound: nothing leaves the device');
    assert.equal((await a.signIn()).kind, 'accountBound');
    await a.settle();
    assert.equal(cloudRows(cloud, 'person_contexts').length, 1);
    assert.equal(cloudRows(cloud, 'person_contexts')[0].status, 'archived');
    assert.equal(cloudRows(cloud, 'person_task_links').length, 1);
    assert.equal(cloudRows(cloud, 'household_people').filter((p) => p.display_name === 'Jordan Lee').length, 1);
    await a.syncRuntime.request('manual');
    assert.equal(cloudRows(cloud, 'person_contexts').length, 1, 'a second cycle adds nothing');
    assert.equal(a.persisted().identity.sync.queue.length, 0);
  });
});

describe('the ordinary failure semantics apply to People rows', () => {
  test('a REFUSED context is kept as evidence, is not deleted, is not retried, and its follow-up waits instead of inventing a reference', async () => {
    const { cloud, a } = await signedIn();
    cloud.hooks.refuse = (table) => (table === 'person_contexts' ? { kind: 'failure', failure: 'forbidden', detail: 'permission denied', code: '42501' } : null);
    await mutate(a, (s, c) => openPersonContext(s, c, { kind: 'child', id: peopleState(a).children[0].id }, { relationshipName: 'Daughter' }).state);
    const contextId = peopleState(a).personContexts[0].id;
    await mutate(a, (s, c) => addFollowUp(s, c, { contextId, draftKey: draft(2), title: 'Sign the form' }).state);
    await a.settle();
    const sync = a.persisted().identity.sync;
    assert.ok(sync.evidence.some((e) => e.kind === 'personContext' && e.evidence === 'forbidden' && !e.resolved), 'refused, truthfully, and inspectable');
    assert.ok(sync.evidence.some((e) => e.kind === 'personTaskLink' && e.evidence === 'unresolvable-dependency'), 'the link is held, not sent with an invented reference');
    assert.equal(peopleState(a).personContexts.length, 1, 'her context is not silently deleted');
    assert.ok(cloudRows(cloud, 'tasks').some((t) => t.id && t.title === 'Sign the form'), 'the private Task itself, which names no context, syncs normally');
    const creates = () => cloud.calls.filter((call) => call.op === 'create' && call.table === 'person_contexts').length;
    const before = creates();
    for (let round = 0; round < 3; round += 1) await a.syncRuntime.request('manual');
    assert.equal(creates(), before, 'the refused create is never retried');
  });

  test('STALE REVISION: another device\'s newer edit is never overwritten; the disagreement is recorded', async () => {
    const { cloud, a } = await signedIn();
    await mutate(a, (s, c) => openPersonContext(s, c, { kind: 'child', id: peopleState(a).children[0].id }, { relationshipName: 'Daughter' }).state);
    await a.settle();
    const contextId = peopleState(a).personContexts[0].id;
    const cloudId = a.persisted().identity.sync.mappings[`personContext:${contextId}`].cloudId;

    cloud.state.offline = true;
    await mutate(a, (s, c) => editPersonContext(s, c, contextId, { relationshipName: 'My offline edit' }).state);
    await a.settle();
    cloud.state.offline = false;
    cloud.editRow('person_contexts', cloudId, { relationship_name: 'Their newer edit' });
    await a.syncRuntime.request('manual');
    assert.equal(cloudRows(cloud, 'person_contexts').find((r) => r.id === cloudId).relationship_name, 'Their newer edit', 'stale sync never overwrites newer context');
    assert.ok(a.persisted().identity.sync.evidence.some((e) => e.evidence === 'cas-conflict' && e.localId === contextId), 'the conflict is recorded');
  });
});

describe('ACCOUNT-SWITCH ISOLATION and DEMO ISOLATION', () => {
  test('account A -> account B on one device: A\'s People are never uploaded under B and never rendered to B; nothing of A\'s is deleted', async () => {
    const storage = createMemoryStorage({});
    const { cloud, a } = await signedIn({ storage });
    cloud.state.offline = true;
    await writePeople(a);
    await mutate(a, (s, c) => openPersonContext(s, c, { kind: 'child', id: peopleState(a).children[0].id }, { contextNote: 'PENDING-A' }).state);
    await a.settle();
    cloud.state.offline = false;
    await a.accountRuntime.signOut();
    const callsBefore = cloud.calls.length;

    const cloudB = accountCloudFor(cloud, ACCOUNT_B);
    const b = await makeDevice({ cloud, accountId: ACCOUNT_B, accountCloud: cloudB, storage });
    const accountB = await b.signIn();
    assert.equal(accountB.kind, 'boundOther', 'the household on this device is A\'s: quarantined, not merged');
    await b.settle();
    assert.equal(cloud.calls.length, callsBefore, 'not one request on B\'s behalf, so none of A\'s People (pending or not) went up under B');
    assert.equal(cloudRows(cloud, 'person_contexts').filter((r) => r.household_id === cloudB.ids.householdId).length, 0);
    const snapshot = b.store.getSnapshot();
    const access = { status: snapshot.status, onboarding: snapshot.state.onboarding, internalTools: false, account: accountB };
    assert.equal(canOpenScreen('(app)', access), false, 'no app screen — People included — can render A\'s household to B');
    assert.equal(canOpenScreen('account-conflict', access), true);
    assert.ok(b.persisted().identity.quarantine, 'A\'s household is preserved in quarantine');
    assert.equal(b.persisted().state.personContexts.length, 2, 'and nothing of A\'s was deleted to make room');
  });

  test('DEMO People never sync, never claim and never reach an account', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const demo = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud, mode: 'demo' });
    assert.ok(peopleState(demo).people.length >= 2, 'the demo cast is present locally');
    assert.equal((await demo.signIn()).kind, 'authenticatedUnbound', 'a demo household is refused as a whole');
    await mutate(demo, (s, c) => addExternalPerson(s, c, { displayName: 'Demo Friend', relationshipName: 'Friend' }).state);
    await demo.settle();
    assert.equal(cloud.calls.length, 0);
    assert.equal(cloudRows(cloud, 'household_people').length + cloudRows(cloud, 'person_contexts').length, 0);
    assert.ok(peopleState(demo).personContexts.every((c) => c.provenance.producer === 'demo-seed'), 'every demo context is demo-seed, which the cloud refuses anyway');
    void followUpTaskId;
  });
});
