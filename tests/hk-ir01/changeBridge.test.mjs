/**
 * HK-INTEGRATION-READINESS-01 / HA-001 — the change bridge, the initial seed and the push-result merge, as pure functions.
 *
 * The rules under test: canonical mutations become queue intent without any feature knowing a queue exists; every legitimate
 * pre-binding row is queued (nothing stays device-only by accident); nothing that must not sync is ever queued; the bounded queue
 * never drops work silently; and a push cycle never loses or duplicates what she did while the network was busy.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addChild } from '../../src/domain/children.ts';
import { addEvent } from '../../src/domain/events.ts';
import { starterCategories } from '../../src/domain/categories.ts';
import { addTask, updateTask } from '../../src/domain/tasks.ts';
import {
  SEED_QUEUE_CEILING,
  changedRows,
  queueIntents,
  seedNamespace,
  topUpQueue,
  unsyncedRows,
} from '../../src/domain/sync/changeBridge.ts';
import { createChangeObserver } from '../../src/domain/sync/changeObserver.ts';
import { cloudDisplayName } from '../../src/domain/account/claim.ts';
import { FOUNDATION_SPECS } from '../../src/domain/sync/foundationSpecs.ts';
import { toCloudRow } from '../../src/domain/sync/projection.ts';
import { mergePushResult } from '../../src/domain/sync/cycleMerge.ts';
import { ALLOWED_OPS, DEPENDENCY_RANK, MAX_QUEUE_ITEMS, SYNC_ENTITY_KINDS, emptyNamespace } from '../../src/domain/sync/syncTypes.ts';
import { PUSHABLE_KINDS, collectionRef, rowsOf } from '../../src/domain/sync/syncKinds.ts';
import { UNBOUND_IDENTITY } from '../../src/domain/account/binding.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { richHousehold } from '../support/richHousehold.mjs';

const TZ = 'America/Chicago';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
const DEVICE = '22222222-2222-4222-8222-222222222222';
const AT = '2026-09-21T15:00:00.000Z';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const cloud = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const ns = (over = {}) => ({ ...emptyNamespace({ accountId: ACCOUNT, householdId: HOUSEHOLD, deviceId: DEVICE }), ...over });
const ctx = () => {
  let n = 0;
  return { nowMs: NOW, today: '2026-09-21', createId: (p) => `${p}-${++n}` };
};
const withTask = (s, c, title = 'A task') => addTask(s, c, { title, categoryId: s.categories[0].id, scope: 'household', durationMinutes: 10, durationSource: 'user' });

describe('HA-001 — the inventory of sync-capable canonical kinds', () => {
  test('30 kinds: 28 are pushed, and exactly the two server-written kinds are pull-only', () => {
    // 29 + `member` (a child; HK-FEATURE-05, owner checkpoint OC-01). The account holder's own member row is not a kind of ours.
    assert.equal(SYNC_ENTITY_KINDS.length, 30);
    assert.equal(PUSHABLE_KINDS.length, 28);
    const pullOnly = SYNC_ENTITY_KINDS.filter((kind) => ALLOWED_OPS[kind].length === 0);
    assert.deepEqual([...pullOnly].sort(), ['execution', 'outcome']);
  });

  test('`member` is a CHILD kind: create-only, first in dependency order, over the household\'s children and nothing else', () => {
    assert.deepEqual(ALLOWED_OPS.member, ['create'], 'a child is created and never edited or removed by a client');
    assert.equal(PUSHABLE_KINDS[0], 'member', 'a child is sent before everything that can name it');
    // Every kind whose rows can name a child as their subject: the four core kinds and every foundation kind with a link to `member`.
    const namesAChild = ['category', 'task', 'event', 'system', ...FOUNDATION_SPECS.filter((spec) => spec.fields.some((f) => f.type === 'link' && f.to === 'member')).map((spec) => spec.kind)];
    assert.ok(namesAChild.length > 4, 'the foundation kinds that name a child were found');
    for (const kind of namesAChild) assert.ok(DEPENDENCY_RANK[kind] > DEPENDENCY_RANK.member, `${kind} names a child, so it must rank after member`);
    const state = { ...createEmptyState(TZ), children: [{ id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' }] };
    assert.deepEqual(rowsOf(state, 'member', null).map((row) => row.id), ['child-1'], 'the rows of the member kind are the children');
    assert.equal(rowsOf(state, 'member', null).some((row) => row.id === state.user.id), false, 'the account holder is never a row of it');
  });

  test('every pushed kind can be found in a household that holds one of everything: nothing is invisible to the seed', () => {
    const rich = richHousehold().state;
    const seen = new Set();
    for (const kind of PUSHABLE_KINDS) if (rowsOf(rich, kind, null).length > 0) seen.add(kind);
    // Kinds the rich household does not exercise are the ones a real household starts without (meal, action, discovery, ...).
    const missing = PUSHABLE_KINDS.filter((kind) => !seen.has(kind));
    assert.ok(seen.size >= 22, `only ${seen.size} kinds visible; missing ${missing.join(', ')}`);
    for (const kind of ['category', 'task', 'event', 'system', 'needsMe', 'oneMove', 'onboarding', 'sourceArtifact', 'dependency', 'recurrence', 'responsibility', 'capacity']) {
      assert.ok(seen.has(kind), `${kind} is not visible to the bridge`);
    }
  });

  test('unchanged collections are the same reference, which is what makes observation O(changed)', () => {
    const c = ctx();
    const a = withTask(createEmptyState(TZ), c);
    const b = addEvent(a, c, { title: 'e', categoryId: a.categories[0].id, startsAt: '2026-09-22T15:00:00.000Z', endsAt: '2026-09-22T16:00:00.000Z', commitment: 'fixed', scope: 'household' });
    assert.equal(collectionRef(a, 'task'), collectionRef(b, 'task'));
    assert.notEqual(collectionRef(a, 'event'), collectionRef(b, 'event'));
  });
});

describe('HA-001 — mutations become queue intent (changedRows / queueIntents)', () => {
  test('a new row is a create; an edited row is an update once the cloud knows it; an untouched row is nothing', () => {
    const c = ctx();
    const a = withTask(createEmptyState(TZ), c, 'first');
    const b = withTask(a, c, 'second');
    assert.deepEqual(changedRows(a, b, ns()), [{ kind: 'task', localId: 'task-2', op: 'upsert' }]);

    const known = ns({ mappings: { 'task:task-1': { kind: 'task', localId: 'task-1', cloudId: cloud(1), revision: 3 } } });
    const edited = updateTask(b, c, 'task-1', { title: 'renamed' });
    const intents = changedRows(b, edited, known);
    assert.deepEqual(intents, [{ kind: 'task', localId: 'task-1', op: 'upsert' }]);
    const queued = queueIntents(known, intents, AT);
    assert.equal(queued.namespace.queue[0].op, 'update');
    assert.equal(queued.namespace.queue[0].baseRevision, 3, 'the CAS base is the revision the device last saw');
  });

  test('three edits to one row before a push are ONE queue item that keeps the original base', () => {
    const c = ctx();
    let s = withTask(createEmptyState(TZ), c);
    const known = ns({ mappings: { 'task:task-1': { kind: 'task', localId: 'task-1', cloudId: cloud(1), revision: 5 } } });
    let current = known;
    for (const title of ['a', 'b', 'c']) {
      const next = updateTask(s, c, 'task-1', { title });
      current = queueIntents(current, changedRows(s, next, current), AT).namespace;
      s = next;
    }
    assert.equal(current.queue.length, 1);
    assert.equal(current.queue[0].baseRevision, 5);
  });

  test('a mutation that touches no synced collection queues nothing and returns the same namespace', () => {
    const a = createEmptyState(TZ);
    const b = { ...a, user: { ...a.user, displayName: 'Local only' } };
    assert.deepEqual(changedRows(a, b, ns()), []);
  });

  test('onboarding is UPDATED, never created: with no mapping nothing is queued (the row is adopted, see seed)', () => {
    const a = createEmptyState(TZ);
    const b = { ...a, onboarding: { ...a.onboarding, goalIds: ['calmer-household'] } };
    const intents = changedRows(a, b, ns());
    assert.equal(intents.length, 1);
    assert.equal(queueIntents(ns(), intents, AT).namespace.queue.length, 0);
    const mapped = ns({ mappings: { [`onboarding:${a.user.id}`]: { kind: 'onboarding', localId: a.user.id, cloudId: ACCOUNT, revision: 1 } } });
    assert.equal(queueIntents(mapped, changedRows(a, b, mapped), AT).namespace.queue[0].op, 'update');
  });

  test('an append-only row changed locally is not queued as an update (the ledger has no such operation)', () => {
    const rich = richHousehold().state;
    const action = { kind: 'action', localId: 'act-1', op: 'upsert' };
    const mapped = ns({ mappings: { 'action:act-1': { kind: 'action', localId: 'act-1', cloudId: cloud(4), revision: 1 } } });
    assert.equal(queueIntents(mapped, [action], AT).namespace.queue.length, 0);
    assert.ok(rich);
  });

  test('a server-written kind is never queued', () => {
    const intents = [{ kind: 'execution', localId: 'x-1', op: 'upsert' }, { kind: 'outcome', localId: 'o-1', op: 'upsert' }];
    assert.equal(queueIntents(ns(), intents, AT).namespace.queue.length, 0);
  });

  test('clearing Discovery is a tombstone (the one soft-delete transport); it is queued, not lost', () => {
    const a = { ...createEmptyState(TZ), discovery: { id: 'disc-1', topicId: 'topic-1', answers: [], provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'personal' } };
    const b = { ...a, discovery: null };
    const intents = changedRows(a, b, ns());
    assert.deepEqual(intents, [{ kind: 'discovery', localId: 'disc-1', op: 'tombstone' }]);
    assert.equal(queueIntents(ns(), intents, AT).namespace.queue[0].op, 'tombstone');
  });

  test('a full queue never evicts: the namespace goes into backlog, the overflow is reported, existing intent stays', () => {
    let namespace = ns();
    const filler = Array.from({ length: MAX_QUEUE_ITEMS }, (_, i) => ({ kind: 'task', localId: `t-${i}`, op: 'upsert' }));
    namespace = queueIntents(namespace, filler, AT).namespace;
    assert.equal(namespace.queue.length, MAX_QUEUE_ITEMS);
    const result = queueIntents(namespace, [{ kind: 'task', localId: 'one-too-many', op: 'upsert' }], AT);
    assert.equal(result.namespace.queue.length, MAX_QUEUE_ITEMS);
    assert.equal(result.namespace.backlog, true, 'and it says so, durably');
    assert.deepEqual(result.overflow.map((i) => i.localId), ['one-too-many']);
  });
});

describe('HA-001 — the observer the store calls (nothing that must not sync is ever queued)', () => {
  const bound = () => ({ ...UNBOUND_IDENTITY, binding: { accountId: ACCOUNT, householdId: HOUSEHOLD, boundAt: AT, kind: 'claim', idMap: {} }, sync: ns() });
  const change = (identity, previous, next) => createChangeObserver({ now: () => NOW }).observe({ previous, next, identity });

  test('an unbound household writes nothing', () => {
    const a = createEmptyState(TZ);
    const identity = UNBOUND_IDENTITY;
    assert.equal(change(identity, a, withTask(a, ctx())), identity);
  });

  test('a DEMO household never syncs, even when bound', () => {
    const a = { ...createEmptyState(TZ), origin: 'demo' };
    const identity = bound();
    assert.equal(change(identity, a, withTask(a, ctx())), identity);
  });

  test('a bound real household stages the intent in the identity block, and nudges the runtime', () => {
    const observer = createChangeObserver({ now: () => NOW });
    let nudged = 0;
    observer.onQueued(() => (nudged += 1));
    const a = createEmptyState(TZ);
    const identity = bound();
    const out = observer.observe({ previous: a, next: withTask(a, ctx()), identity });
    assert.notEqual(out, identity);
    assert.equal(out.sync.queue.length, 1);
    assert.equal(nudged, 1);
  });

  test('no change returns the SAME identity object: the store can tell nothing needs writing', () => {
    const a = createEmptyState(TZ);
    const identity = bound();
    assert.equal(change(identity, a, a), identity);
  });

  test('a namespace that belongs to another account is never written to', () => {
    const a = createEmptyState(TZ);
    const identity = { ...bound(), sync: ns({ accountId: '99999999-9999-4999-8999-999999999999' }) };
    assert.equal(change(identity, a, withTask(a, ctx())), identity);
  });
});

describe('HA-001 — the initial seed: pre-binding content cannot silently stay device-only', () => {
  const mappedStarters = (state) =>
    Object.fromEntries(state.categories.map((c, i) => [`category:${c.id}`, { kind: 'category', localId: c.id, cloudId: cloud((i % 8) + 1), revision: 1 }]));

  test('a task, an event and a system nobody claimed are each queued as a create, dependency-ordered', () => {
    const c = ctx();
    let s = withTask(createEmptyState(TZ), c);
    s = addEvent(s, c, { title: 'Recital', categoryId: s.categories[0].id, startsAt: '2026-09-22T15:00:00.000Z', endsAt: '2026-09-22T16:00:00.000Z', commitment: 'fixed', scope: 'household' });
    const seeded = seedNamespace({ state: s, namespace: ns({ mappings: mappedStarters(s) }), accountId: ACCOUNT, at: AT });
    assert.deepEqual(seeded.queue.map((i) => `${i.kind}:${i.op}`).sort(), ['event:create', 'task:create']);
  });

  test('a household that holds one row of every kind queues every one of them (bounded, ordered by dependency rank)', () => {
    const rich = richHousehold().state;
    const seeded = seedNamespace({ state: rich, namespace: ns({ mappings: mappedStarters(rich) }), accountId: ACCOUNT, at: AT });
    const kinds = new Set(seeded.queue.map((item) => item.kind));
    for (const kind of ['task', 'event', 'system', 'needsMe', 'sourceArtifact', 'dependency', 'recurrence', 'responsibility', 'capacity', 'goal', 'person']) {
      assert.ok(kinds.has(kind), `${kind} was left device-only`);
    }
    assert.ok(seeded.queue.length <= SEED_QUEUE_CEILING);
    assert.ok(!kinds.has('execution') && !kinds.has('outcome'), 'server-written rows are never queued');
  });

  test('rows the claim already carried and mapped are NOT queued again (no duplicates)', () => {
    const c = ctx();
    const s = withTask(createEmptyState(TZ), c);
    const mappings = { ...mappedStarters(s), 'task:task-1': { kind: 'task', localId: 'task-1', cloudId: cloud(9), revision: 1 } };
    const seeded = seedNamespace({ state: s, namespace: ns({ mappings }), accountId: ACCOUNT, at: AT, carried: new Set(['task-1']), claimedState: s });
    assert.equal(seeded.queue.length, 0);
  });

  test('a row whose CREATE already ended as evidence is not owed again: it waits for a decision, it is not re-sent on every trigger', () => {
    const c = ctx();
    let s = withTask(createEmptyState(TZ), c, 'Refused');
    s = withTask(s, c, 'Fine');
    const evidence = { id: 'e1', evidence: 'validation-failure', kind: 'task', localId: 'task-1', cloudId: null, attemptedOp: 'create', baseRevision: null, serverRevision: null, detail: 'refused', recordedAt: AT, resolved: false };
    const owed = unsyncedRows(s, ns({ mappings: mappedStarters(s), evidence: [evidence] }), 100);
    assert.deepEqual(owed.map((row) => row.localId), ['task-2'], 'only the row nobody has ruled on');
    assert.deepEqual(unsyncedRows(s, ns({ mappings: mappedStarters(s) }), 100).map((row) => row.localId).sort(), ['task-1', 'task-2'], 'and without the evidence both are owed');
    // Evidence about an UPDATE of some other row does not hide this one.
    const other = { ...evidence, attemptedOp: 'update', localId: 'task-2' };
    assert.deepEqual(unsyncedRows(s, ns({ mappings: mappedStarters(s), evidence: [other] }), 100).map((row) => row.localId).sort(), ['task-1', 'task-2']);
  });

  test('the server-created onboarding row is ADOPTED, and her real onboarding is queued over it (a pull would otherwise overwrite it)', () => {
    const base = createEmptyState(TZ);
    const s = { ...base, onboarding: { ...base.onboarding, goalIds: ['calmer-household'], lastStep: 'strengths' } };
    const seeded = seedNamespace({ state: s, namespace: ns({ mappings: mappedStarters(s) }), accountId: ACCOUNT, at: AT });
    const mapping = seeded.mappings[`onboarding:${s.user.id}`];
    assert.equal(mapping.cloudId, ACCOUNT, 'the row is keyed by the profile');
    assert.equal(mapping.revision, 1);
    assert.equal(seeded.queue.find((i) => i.kind === 'onboarding').op, 'update');
    assert.equal(seeded.queue.find((i) => i.kind === 'onboarding').baseRevision, 1);
  });

  test('pristine onboarding is adopted but nothing is queued: there is nothing to say', () => {
    const s = createEmptyState(TZ);
    const seeded = seedNamespace({ state: s, namespace: ns({ mappings: mappedStarters(s) }), accountId: ACCOUNT, at: AT });
    assert.ok(seeded.mappings[`onboarding:${s.user.id}`]);
    assert.equal(seeded.queue.length, 0);
  });

  test('a starter category she renamed before binding is queued as an update; an untouched starter is not', () => {
    const base = createEmptyState(TZ);
    const starter = starterCategories(base.household.id)[0];
    const s = { ...base, categories: base.categories.map((c) => (c.id === starter.id ? { ...c, name: 'Renamed by her' } : c)) };
    const seeded = seedNamespace({ state: s, namespace: ns({ mappings: mappedStarters(s) }), accountId: ACCOUNT, at: AT });
    assert.deepEqual(seeded.queue.map((i) => `${i.kind}:${i.localId}:${i.op}`), [`category:${starter.id}:update`]);
  });

  test('a claimed row she EDITED while the claim was in flight is queued as an update from the claim\'s revision', () => {
    const c = ctx();
    const claimed = withTask(createEmptyState(TZ), c, 'as claimed');
    const now = updateTask(claimed, c, 'task-1', { title: 'edited during the request' });
    const mappings = { ...mappedStarters(now), 'task:task-1': { kind: 'task', localId: 'task-1', cloudId: cloud(9), revision: 1 } };
    const seeded = seedNamespace({ state: now, namespace: ns({ mappings }), accountId: ACCOUNT, at: AT, carried: new Set(['task-1']), claimedState: claimed });
    assert.equal(seeded.queue.length, 1);
    assert.deepEqual([seeded.queue[0].op, seeded.queue[0].baseRevision], ['update', 1]);
  });

  test('a large backlog is queued in bounded rounds and never dropped: headroom is left for her next edit', () => {
    const c = ctx();
    let s = createEmptyState(TZ);
    for (let i = 0; i < 700; i += 1) s = withTask(s, c, `t${i}`);
    let namespace = ns({ mappings: mappedStarters(s) });
    const first = topUpQueue(s, namespace, AT);
    assert.equal(first.namespace.queue.length, SEED_QUEUE_CEILING, 'stops at the ceiling, leaving headroom');
    assert.ok(SEED_QUEUE_CEILING < MAX_QUEUE_ITEMS);

    // the queue drains (each item is pushed and mapped), and the next round picks up exactly the rest
    const drained = first.namespace.queue.reduce(
      (acc, item) => ({ ...acc, mappings: { ...acc.mappings, [`task:${item.localId}`]: { kind: 'task', localId: item.localId, cloudId: cloud(1), revision: 1 } } }),
      { ...first.namespace, queue: [] }
    );
    const second = topUpQueue(s, drained, AT);
    assert.equal(second.namespace.queue.length, 700 - SEED_QUEUE_CEILING);
    assert.equal(unsyncedRows(s, second.namespace.queue.length ? { ...drained, queue: second.namespace.queue, mappings: { ...drained.mappings, ...Object.fromEntries(second.namespace.queue.map((i) => [`task:${i.localId}`, { kind: 'task', localId: i.localId, cloudId: cloud(2), revision: 1 }])) } } : drained, 10).length, 0, 'nothing is left behind');
  });

  test('the seed is stateless: applying it twice, or after a crash, queues nothing twice', () => {
    const c = ctx();
    const s = withTask(createEmptyState(TZ), c);
    const once = seedNamespace({ state: s, namespace: ns({ mappings: mappedStarters(s) }), accountId: ACCOUNT, at: AT });
    const twice = seedNamespace({ state: s, namespace: once, accountId: ACCOUNT, at: AT });
    assert.equal(twice.queue.length, once.queue.length);
  });
});

describe('HA-001 — merging a push cycle into what she did while it ran', () => {
  const item = (over) => ({ id: `${over.kind}:${over.localId}#0#${AT}`, op: 'update', baseRevision: 1, order: 0, enqueuedAt: AT, attempts: 0, lastAttemptAt: null, lastError: null, ...over });

  const scenario = () => {
    const c = ctx();
    const s0 = withTask(createEmptyState(TZ), c, 'v1');
    const mapped = ns({ mappings: { 'task:task-1': { kind: 'task', localId: 'task-1', cloudId: cloud(1), revision: 1 } } });
    const queued = queueIntents(mapped, [{ kind: 'task', localId: 'task-1', op: 'upsert' }], AT).namespace;
    return { c, s0, queued, mapped };
  };

  test('nothing changed meanwhile: the cycle\'s answer is the answer', () => {
    const { s0, queued } = scenario();
    const result = { ...queued, queue: [], mappings: { ...queued.mappings, 'task:task-1': { ...queued.mappings['task:task-1'], revision: 2 } } };
    const merged = mergePushResult({ basis: { state: s0, namespace: queued }, result, current: { state: s0, namespace: queued } });
    assert.equal(merged, result);
  });

  test('she added NEW work during the cycle: it survives, untouched', () => {
    const { s0, c, queued } = scenario();
    const s1 = withTask(s0, c, 'added during the push');
    const during = queueIntents(queued, changedRows(s0, s1, queued), AT).namespace;
    const result = { ...queued, queue: [], mappings: { ...queued.mappings, 'task:task-1': { ...queued.mappings['task:task-1'], revision: 2 } } };
    const merged = mergePushResult({ basis: { state: s0, namespace: queued }, result, current: { state: s1, namespace: during } });
    assert.deepEqual(merged.queue.map((i) => i.localId), ['task-2']);
    assert.equal(merged.mappings['task:task-1'].revision, 2, 'and the acknowledgement was kept');
  });

  test('she EDITED the row the cycle just sent: it is re-queued as an update from the revision just acknowledged, not the stale base', () => {
    const { s0, c, queued } = scenario();
    const s1 = updateTask(s0, c, 'task-1', { title: 'v2, typed while v1 was on the wire' });
    const during = queueIntents(queued, changedRows(s0, s1, queued), AT).namespace;
    const result = { ...queued, queue: [], mappings: { ...queued.mappings, 'task:task-1': { ...queued.mappings['task:task-1'], revision: 2 } } };
    const merged = mergePushResult({ basis: { state: s0, namespace: queued }, result, current: { state: s1, namespace: during } });
    assert.equal(merged.queue.length, 1, 'her newer content still has to go');
    assert.deepEqual([merged.queue[0].op, merged.queue[0].baseRevision], ['update', 2]);
  });

  test('an unrelated edit during the cycle does not re-queue a row that was sent unchanged', () => {
    const { s0, c, queued } = scenario();
    const s1 = withTask(s0, c, 'other');
    const during = queueIntents(queued, changedRows(s0, s1, queued), AT).namespace;
    const result = { ...queued, queue: [], mappings: { ...queued.mappings, 'task:task-1': { ...queued.mappings['task:task-1'], revision: 2 } } };
    const merged = mergePushResult({ basis: { state: s0, namespace: queued }, result, current: { state: s1, namespace: during } });
    assert.ok(!merged.queue.some((i) => i.localId === 'task-1'));
  });

  test('a deferred item keeps the cycle\'s attempt bookkeeping unless she re-edited it', () => {
    const { s0, c, queued } = scenario();
    const s1 = withTask(s0, c, 'other');
    const during = queueIntents(queued, changedRows(s0, s1, queued), AT).namespace;
    const deferred = { ...queued, queue: queued.queue.map((q) => ({ ...q, attempts: 2, lastAttemptAt: AT, lastError: 'offline' })) };
    const merged = mergePushResult({ basis: { state: s0, namespace: queued }, result: deferred, current: { state: s1, namespace: during } });
    const kept = merged.queue.find((i) => i.localId === 'task-1');
    assert.deepEqual([kept.attempts, kept.lastError], [2, 'offline']);
    assert.ok(item);
  });

  test('a queue that filled up while the cycle ran stays flagged', () => {
    const { s0, queued } = scenario();
    const result = { ...queued, queue: [], backlog: false };
    const during = { ...queued, backlog: true, queue: [...queued.queue] };
    const merged = mergePushResult({ basis: { state: s0, namespace: queued }, result, current: { state: s0, namespace: during } });
    assert.equal(merged.backlog, true);
  });
});

describe('HK-FEATURE-05 / OC-01 — a child in the change bridge', () => {
  const kid = (state, c, name = 'Ava') => addChild(state, c, { displayName: name, birthDate: '2019-03-04' });
  const child = (id, displayName = 'Ava') => ({ id, displayName, birthDate: '2019-03-04', scope: 'child' });
  const mapping = (kind, localId, n) => ({ kind, localId, cloudId: cloud(n), revision: 1 });
  const bound = (sync) => ({ binding: { accountId: ACCOUNT, householdId: HOUSEHOLD, boundAt: AT, kind: 'claim', idMap: {} }, receipt: null, quarantine: null, sync });

  test('adding a child is a CREATE intent; a local change to a child the cloud already holds queues nothing (a child has no update)', () => {
    const c = ctx();
    const a = createEmptyState(TZ);
    const b = kid(a, c);
    const intents = changedRows(a, b, ns());
    assert.deepEqual(intents, [{ kind: 'member', localId: 'child-1', op: 'upsert' }]);
    assert.deepEqual(queueIntents(ns(), intents, AT).namespace.queue.map((q) => [q.kind, q.localId, q.op]), [['member', 'child-1', 'create']]);

    const known = ns({ mappings: { 'member:child-1': mapping('member', 'child-1', 1) } });
    const edited = { ...b, children: b.children.map((row) => ({ ...row, displayName: 'Changed locally' })) };
    const again = changedRows(b, edited, known);
    assert.equal(again.length, 1, 'the bridge sees the change');
    assert.equal(queueIntents(known, again, AT).namespace.queue.length, 0, 'but the child has no update operation, so nothing is queued');
  });

  test('a claimed child is mapped and NOT owed; an unmapped child is owed; the account holder is never owed as a member', () => {
    const state = { ...createEmptyState(TZ), children: [child('child-1', 'Mia'), child('child-2', 'Theo')] };
    const namespace = ns({ mappings: { 'member:child-1': mapping('member', 'child-1', 1), [`member:${state.user.id}`]: mapping('member', state.user.id, 2) } });
    const owed = unsyncedRows(state, namespace, 100).filter((intent) => intent.kind === 'member');
    assert.deepEqual(owed.map((intent) => intent.localId), ['child-2']);
    assert.equal(owed.some((intent) => intent.localId === state.user.id), false);
  });

  test('a child whose CREATE ended as evidence (the server refused it) is not owed again, so it is never retried forever', () => {
    const state = { ...createEmptyState(TZ), children: [child('child-2', 'Theo')] };
    const refused = { id: 'e-1', evidence: 'forbidden', kind: 'member', localId: 'child-2', cloudId: null, attemptedOp: 'create', baseRevision: null, serverRevision: null, detail: 'permission denied', recordedAt: AT, resolved: false };
    assert.equal(unsyncedRows(state, ns({ evidence: [refused] }), 100).some((intent) => intent.kind === 'member'), false);
    assert.equal(unsyncedRows(state, ns(), 100).some((intent) => intent.kind === 'member'), true, 'without the evidence it would have been');
  });

  test('the projection of a child is exactly what a person states about a child, and a name with the letter s survives it', () => {
    const state = { ...createEmptyState(TZ), children: [child('child-1', 'Josie Elias Mason')] };
    const row = toCloudRow(state, { householdId: HOUSEHOLD, profileId: ACCOUNT, namespace: ns() }, 'member', 'child-1');
    assert.deepEqual(Object.keys(row).sort(), ['birth_date', 'display_name', 'household_id', 'local_id', 'member_type', 'scope'], 'no id, role, profile or revision: those are the server\'s');
    assert.deepEqual(row, { household_id: HOUSEHOLD, local_id: 'child-1', member_type: 'child', display_name: 'Josie Elias Mason', birth_date: '2019-03-04', scope: 'child' });
  });

  test('cloudDisplayName cleans NFC, control characters and runs of whitespace and touches nothing else (an "s" is not whitespace)', () => {
    // A defect found by the real-database journey: `/s+/` (no backslash) turned every letter s into a space, so a claim, and later a
    // child added after binding, reached the cloud as "Jo ie". The claim path had no test of the cleaner at all.
    for (const name of ['Josie', 'Elias', 'Mason Ross', 'Sasha', 'Ava-Rose', "O'Neil"]) assert.equal(cloudDisplayName(name), name, name);
    assert.equal(cloudDisplayName('  Mary   Ann \t Lee '), 'Mary Ann Lee');
    assert.equal(cloudDisplayName(`Ava${String.fromCharCode(1)}Rose`), 'Ava Rose');
    assert.equal(cloudDisplayName(`e${String.fromCharCode(0x301)}`), String.fromCharCode(0xe9), 'NFC');
    assert.equal(cloudDisplayName('   '), '   ', 'blank stays blank, so the server refuses it visibly instead of the client inventing a name');
  });

  test('the observer queues a child for a bound account, and for nothing else: not a demo household, not another account\'s namespace, not an unbound one', () => {
    const observer = createChangeObserver({ now: () => NOW });
    const a = createEmptyState(TZ);
    const b = kid(a, ctx());

    const queued = observer.observe({ previous: a, next: b, identity: bound(ns()) });
    assert.deepEqual(queued.sync.queue.map((q) => [q.kind, q.op]), [['member', 'create']], 'a bound household owes its new child');

    const demo = observer.observe({ previous: { ...a, origin: 'demo' }, next: { ...b, origin: 'demo' }, identity: bound(ns()) });
    assert.equal(demo.sync.queue.length, 0, 'fiction never syncs');

    const foreign = ns({ accountId: '99999999-9999-4999-8999-999999999999' });
    const other = bound(foreign);
    assert.equal(observer.observe({ previous: a, next: b, identity: other }), other, 'a namespace that belongs to another account is left exactly as it was');

    const unbound = { binding: null, receipt: null, quarantine: null, sync: null };
    assert.equal(observer.observe({ previous: a, next: b, identity: unbound }), unbound, 'an unbound household has no queue to write to');
  });
});
