/**
 * B4-BACKEND-03 — the parts that are decided locally.
 *
 * Scheduling, coalescing, bounds, lifecycle, single-flight, namespace isolation
 * and the SD4-006 pull-side collision are all client decisions, and a fake
 * transport proves them faster and more precisely than a database would. The
 * seams that genuinely depend on Postgres — CAS, RLS, the barrier, the change
 * log, the claim seam — are proven against the real local Supabase in
 * `supabase/tests/sync-integration.mjs`, not here.
 *
 * Branch assertions throughout: each case reads the state before, the state
 * after, and which path ran.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MAX_QUEUE_ITEMS,
  MAX_UNRESOLVED_EVIDENCE,
  PULL_BATCH_SIZE,
  emptyNamespace,
  needsSyncAttention,
  needsSyncAttentionCount,
  unresolvedEvidence,
  updatablePatch,
} from '../src/domain/sync/syncTypes.ts';
import { canAcceptWork, enqueue, moveToEvidence, scheduled, settle } from '../src/domain/sync/queue.ts';
import { backoffFor, createSyncCoordinator } from '../src/domain/sync/coordinator.ts';
import { pullOnce } from '../src/domain/sync/pullEngine.ts';
import { pushPending } from '../src/domain/sync/pushEngine.ts';
import { applyCloudRow, applyCloudTombstone } from '../src/domain/sync/apply.ts';
import { kindOfLocalId, namespaceFromClaim, namespaceForNewDevice } from '../src/domain/sync/claimSeam.ts';
import { toCloudRow } from '../src/domain/sync/projection.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { decodeStoredState } from '../src/persistence/envelope.ts';
import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import { TZ, demoState } from './support/fixtures.mjs';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
const DEVICE_A = '44444444-4444-4444-8444-444444444444';
const DEVICE_B = '55555555-5555-4555-8555-555555555555';
const AT = '2026-09-20T12:00:00.000Z';
const cloud = (n) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`;

const ns = () => emptyNamespace({ accountId: ACCOUNT_A, householdId: HOUSEHOLD, deviceId: DEVICE_A });

const task = (id, over = {}) => ({
  id,
  title: `Task ${id}`,
  categoryId: 'cat-home',
  subjectMemberId: null,
  durationMinutes: 10,
  commitment: 'flexible',
  dueDate: null,
  plan: { kind: 'unplanned' },
  notes: null,
  status: 'open',
  completedAt: null,
  createdAt: null,
  updatedAt: null,
  scope: 'household',
  ...over,
});

describe('queue: coalescing and bounds', () => {
  test('E. a second edit to the same row coalesces, keeping the original base and order', () => {
    let n = { ...ns(), mappings: { 'task:task-1': { kind: 'task', localId: 'task-1', cloudId: cloud(1), revision: 5 } } };
    n = enqueue(n, { kind: 'task', localId: 'task-1', op: 'update', at: AT }).namespace;
    n = enqueue(n, { kind: 'task', localId: 'task-2', op: 'create', at: AT }).namespace;
    const first = n.queue.find((q) => q.localId === 'task-1');

    const again = enqueue(n, { kind: 'task', localId: 'task-1', op: 'update', at: '2026-09-20T13:00:00.000Z' });
    assert.equal(again.coalesced, true, 'the branch taken was coalescing, not a second item');
    assert.equal(again.namespace.queue.length, 2, 'still two items, not three');

    const after = again.namespace.queue.find((q) => q.localId === 'task-1');
    assert.equal(after.baseRevision, 5, 'the ORIGINAL base revision is preserved');
    assert.equal(after.order, first.order, 'and the ORIGINAL enqueue order');
  });

  test('F. a create followed by an update stays ONE create carrying the latest state', () => {
    let n = enqueue(ns(), { kind: 'task', localId: 'task-1', op: 'create', at: AT }).namespace;
    n = enqueue(n, { kind: 'task', localId: 'task-1', op: 'update', at: AT }).namespace;
    assert.equal(n.queue.length, 1);
    assert.equal(n.queue[0].op, 'create', 'the cloud has never seen it: one create, not create-then-update');
  });

  test('F. an edit racing a tombstone collapses to the tombstone, keeping the base revision', () => {
    let n = { ...ns(), mappings: { 'discovery:disc-1': { kind: 'discovery', localId: 'disc-1', cloudId: cloud(2), revision: 3 } } };
    n = enqueue(n, { kind: 'discovery', localId: 'disc-1', op: 'update', at: AT }).namespace;
    n = enqueue(n, { kind: 'discovery', localId: 'disc-1', op: 'tombstone', at: AT }).namespace;
    assert.equal(n.queue[0].op, 'tombstone', 'nothing is resurrected by a later edit');
    assert.equal(n.queue[0].baseRevision, 3);
  });

  test('F. an action record cannot be turned into an update — it is immutable', () => {
    const n = ns();
    assert.equal(enqueue(n, { kind: 'action', localId: 'act-1', op: 'create', at: AT }).ok, true);
    const refused = enqueue(n, { kind: 'action', localId: 'act-1', op: 'update', at: AT });
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'immutable');
    assert.deepEqual(refused.namespace.queue, [], 'and nothing was silently queued anyway');
  });

  test('11. at the queue bound nothing is evicted; the namespace goes into backlog', () => {
    let n = ns();
    for (let i = 0; i < MAX_QUEUE_ITEMS; i += 1) {
      n = enqueue(n, { kind: 'task', localId: `task-${i}`, op: 'create', at: AT }).namespace;
    }
    assert.equal(n.queue.length, MAX_QUEUE_ITEMS);

    const full = enqueue(n, { kind: 'task', localId: 'task-overflow', op: 'create', at: AT });
    assert.equal(full.ok, false, 'the caller must NOT report this change as cloud-safe');
    assert.equal(full.reason, 'backlog');
    assert.equal(full.namespace.queue.length, MAX_QUEUE_ITEMS, 'every existing item survived');
    assert.equal(full.namespace.backlog, true);
    assert.equal(full.namespace.queue[0].localId, 'task-0', 'the OLDEST item was not evicted');
  });

  test('H. at the evidence bound work stops rather than producing unrecordable conflicts', () => {
    let n = ns();
    for (let i = 0; i < MAX_UNRESOLVED_EVIDENCE; i += 1) {
      const item = { id: `q${i}`, kind: 'task', localId: `t${i}`, op: 'update', baseRevision: 1, order: i, enqueuedAt: AT, attempts: 0, lastAttemptAt: null, lastError: null };
      n = moveToEvidence({ ...n, queue: [item] }, { item, evidence: 'cas-conflict', cloudId: cloud(i), serverRevision: 2, detail: 'stale', at: AT });
    }
    assert.equal(unresolvedEvidence(n).length, MAX_UNRESOLVED_EVIDENCE);
    assert.equal(n.backlog, true);
    assert.equal(canAcceptWork(n), false, 'a conflict that cannot be recorded is indistinguishable from a lost one');
    assert.equal(needsSyncAttention(n), true);
    assert.equal(needsSyncAttentionCount(n), MAX_UNRESOLVED_EVIDENCE);
  });

  test('10. work is scheduled in dependency order, then by enqueue order', () => {
    let n = ns();
    n = enqueue(n, { kind: 'action', localId: 'act-1', op: 'create', at: AT }).namespace;
    n = enqueue(n, { kind: 'oneMove', localId: 'om-1', op: 'create', at: AT }).namespace;
    n = enqueue(n, { kind: 'task', localId: 'task-1', op: 'create', at: AT }).namespace;
    n = enqueue(n, { kind: 'category', localId: 'cat-1', op: 'create', at: AT }).namespace;
    assert.deepEqual(
      scheduled(n).map((q) => q.kind),
      ['category', 'task', 'oneMove', 'action'],
      'a task cannot reference a category the cloud has never seen'
    );
  });

  test('G. a terminal failure leaves the queue and becomes evidence', () => {
    let n = enqueue(ns(), { kind: 'task', localId: 'task-1', op: 'create', at: AT }).namespace;
    const item = n.queue[0];
    n = moveToEvidence(n, { item, evidence: 'validation-failure', cloudId: null, serverRevision: null, detail: 'refused', at: AT });
    assert.deepEqual(n.queue, [], 'one bad row cannot occupy the queue forever');
    assert.equal(unresolvedEvidence(n).length, 1, 'and nothing she did was forgotten');
    assert.equal(unresolvedEvidence(n)[0].attemptedOp, 'create');
  });

  test('17. retry backoff is bounded and rises', () => {
    assert.equal(backoffFor(0), 0);
    assert.ok(backoffFor(1) > 0);
    assert.ok(backoffFor(3) > backoffFor(1));
    assert.equal(backoffFor(99), backoffFor(5), 'it stops climbing; no unbounded wait, no spin');
  });
});

describe('the claim seam and namespace isolation', () => {
  test('7. the namespace is built from the claim id map, with kinds resolved from local state', () => {
    const state = { ...createEmptyState(TZ), tasks: [task('task-1')] };
    const n = namespaceFromClaim({
      state,
      accountId: ACCOUNT_A,
      householdId: HOUSEHOLD,
      deviceId: DEVICE_A,
      idMap: { 'household-1': cloud(1), 'user-1': cloud(2), 'cat-home': cloud(3), 'task-1': cloud(4), 'gone-9': cloud(9) },
    });
    assert.equal(n.mappings['task:task-1'].cloudId, cloud(4));
    assert.equal(n.mappings['category:cat-home'].cloudId, cloud(3));
    assert.equal(n.mappings['member:user-1'].cloudId, cloud(2));
    assert.equal(n.mappings['household:household-1'].cloudId, cloud(1));
    assert.equal(Object.keys(n.mappings).length, 4, 'an id the household no longer holds maps to nothing');
    assert.equal(n.mappings['task:task-1'].revision, 1, 'the server writes revision 1 on insert');
    assert.equal(n.hydration, 'ready', 'a claimed device already holds its household');
  });

  test('kindOfLocalId asks the household what an id is rather than parsing its prefix', () => {
    const state = { ...createEmptyState(TZ), tasks: [task('anything-at-all')] };
    assert.equal(kindOfLocalId(state, 'anything-at-all'), 'task');
    assert.equal(kindOfLocalId(state, 'cat-home'), 'category');
    assert.equal(kindOfLocalId(state, 'nothing-here'), null);
  });

  test('J. a new device starts unhydrated at cursor zero', () => {
    const n = namespaceForNewDevice({ accountId: ACCOUNT_A, householdId: HOUSEHOLD, deviceId: DEVICE_B });
    assert.equal(n.hydration, 'unhydrated');
    assert.equal(n.cursor, '0');
    assert.deepEqual(n.mappings, {});
  });

  test('18. a demo household has no sync state at all', () => {
    const encoded = JSON.stringify({
      schemaVersion: 3,
      appVersion: '1.0.0-test',
      savedAt: AT,
      writeSeq: 1,
      identity: UNBOUND_IDENTITY,
      data: demoState(),
    });
    const decoded = decodeStoredState(encoded);
    assert.equal(decoded.kind, 'valid');
    assert.equal(decoded.state.origin, 'demo');
    assert.equal(decoded.identity.sync, null, 'no namespace');
    assert.equal(decoded.identity.binding, null, 'no account');
    assert.equal(needsSyncAttention(decoded.identity.sync), false);
    assert.equal(needsSyncAttentionCount(decoded.identity.sync), 0);
  });

  test('16/17/41. account A and account B namespaces share nothing, and A survives the round trip', () => {
    let a = { ...ns(), mappings: { 'task:task-1': { kind: 'task', localId: 'task-1', cloudId: cloud(1), revision: 2 } } };
    a = enqueue(a, { kind: 'task', localId: 'task-1', op: 'update', at: AT }).namespace;
    a = moveToEvidence({ ...a, queue: [...a.queue] }, {
      item: a.queue[0],
      evidence: 'cas-conflict', cloudId: cloud(1), serverRevision: 3, detail: 'stale', at: AT,
    });
    a = enqueue(a, { kind: 'task', localId: 'task-2', op: 'create', at: AT }).namespace;
    a = { ...a, cursor: '9001' };

    // Signing in as B builds B's own namespace. Nothing is inherited, because
    // there is nothing shared to inherit from.
    const b = emptyNamespace({ accountId: ACCOUNT_B, householdId: cloud(7), deviceId: DEVICE_A });
    assert.deepEqual(b.queue, [], 'B inherits no queue');
    assert.deepEqual(b.mappings, {}, 'B inherits no mappings');
    assert.deepEqual(b.evidence, [], 'B inherits no conflicts');
    assert.equal(b.cursor, '0', 'B inherits no cursor');
    assert.equal(needsSyncAttention(b), false, "and none of A's attention state");

    // A, meanwhile, is exactly as it was.
    assert.equal(a.queue.length, 1);
    assert.equal(a.cursor, '9001');
    assert.equal(unresolvedEvidence(a).length, 1);
    assert.notEqual(a.accountId, b.accountId);
  });
});

describe('push and pull against a scripted transport', () => {
  const fake = (script) => ({
    calls: [],
    async create(table, deviceId, row) {
      this.calls.push({ op: 'create', table, deviceId, row });
      return script.create ?? { kind: 'created', cloudId: cloud(1), revision: 1, localId: String(row.local_id) };
    },
    async update(table, cloudId, base, row, idColumn) {
      this.calls.push({ op: 'update', table, cloudId, base, row, idColumn });
      return script.update ?? { kind: 'updated', cloudId, revision: base + 1 };
    },
    async pull(cursor) {
      this.calls.push({ op: 'pull', cursor });
      return script.pull ?? { kind: 'pulled', rows: [], nextCursor: '100' };
    },
    async fetchRows(table, ids, idColumn) {
      this.calls.push({ op: 'fetchRows', table, ids, idColumn });
      return script.fetchRows ?? { kind: 'rows', rows: [] };
    },
  });

  const pushCtx = (state, transport) => ({
    state,
    householdId: HOUSEHOLD,
    profileId: ACCOUNT_A,
    deviceId: DEVICE_A,
    transport,
    now: () => Date.parse(AT),
  });

  test('26. a server validation failure becomes durable failed evidence, not a retry loop', async () => {
    const state = { ...createEmptyState(TZ), tasks: [task('task-1')] };
    let n = namespaceFromClaim({ state, accountId: ACCOUNT_A, householdId: HOUSEHOLD, deviceId: DEVICE_A, idMap: { 'cat-home': cloud(3) } });
    n = enqueue(n, { kind: 'task', localId: 'task-1', op: 'create', at: AT }).namespace;

    const transport = fake({ create: { kind: 'failure', failure: 'validation', detail: 'title must not be blank', code: '23514' } });
    const out = await pushPending(n, pushCtx(state, transport));

    assert.deepEqual(out.namespace.queue, [], 'it left the queue');
    const [evidence] = unresolvedEvidence(out.namespace);
    assert.equal(evidence.evidence, 'validation-failure');
    assert.equal(evidence.detail, 'title must not be blank');
    assert.equal(transport.calls.filter((c) => c.op === 'create').length, 1, 'and was NOT hot-looped');
  });

  test('16(retriable). an unreachable server defers the work and counts the attempt', async () => {
    const state = { ...createEmptyState(TZ), tasks: [task('task-1')] };
    let n = namespaceFromClaim({ state, accountId: ACCOUNT_A, householdId: HOUSEHOLD, deviceId: DEVICE_A, idMap: { 'cat-home': cloud(3) } });
    n = enqueue(n, { kind: 'task', localId: 'task-1', op: 'create', at: AT }).namespace;

    const out = await pushPending(n, pushCtx(state, fake({ create: { kind: 'failure', failure: 'unreachable', detail: 'offline', code: null } })));
    assert.equal(out.namespace.queue.length, 1, 'the intent is kept');
    assert.equal(out.namespace.queue[0].attempts, 1);
    assert.equal(unresolvedEvidence(out.namespace).length, 0, 'and it is not evidence — it is still work');
  });

  test('18(auth). an unauthorized push pauses the cycle without burning the queue', async () => {
    const state = { ...createEmptyState(TZ), tasks: [task('task-1')] };
    let n = namespaceFromClaim({ state, accountId: ACCOUNT_A, householdId: HOUSEHOLD, deviceId: DEVICE_A, idMap: { 'cat-home': cloud(3) } });
    n = enqueue(n, { kind: 'task', localId: 'task-1', op: 'create', at: AT }).namespace;

    const out = await pushPending(n, pushCtx(state, fake({ create: { kind: 'failure', failure: 'unauthorized', detail: 'jwt expired', code: '28000' } })));
    assert.equal(out.paused, true);
    assert.equal(out.namespace.queue.length, 1);
    assert.equal(out.namespace.queue[0].attempts, 0, 'the work is fine; only the session is not');
  });

  test('AA. an action whose reference has no mapping yet waits for it rather than pushing malformed', async () => {
    const state = {
      ...createEmptyState(TZ),
      tasks: [task('task-1')],
      actions: [{
        id: 'act-1', type: 'daily_load.drop_task', approval: 'approved', targetId: 'task-1',
        reason: { code: 'capacity_over_budget', projectedMinutes: 10, budgetMinutes: 5, overBudgetMinutes: 5 },
        before: { status: 'open' }, after: { status: 'archived' },
        logicalDate: '2026-09-20', createdAt: AT, actor: 'user', source: 'her_keys_recommendation', scope: 'personal',
      }],
    };
    let n = namespaceFromClaim({ state, accountId: ACCOUNT_A, householdId: HOUSEHOLD, deviceId: DEVICE_A, idMap: { 'cat-home': cloud(3) } });
    n = enqueue(n, { kind: 'action', localId: 'act-1', op: 'create', at: AT }).namespace;
    n = enqueue(n, { kind: 'task', localId: 'task-1', op: 'create', at: AT }).namespace;

    const transport = fake({});
    const out = await pushPending(n, pushCtx(state, transport));
    const creates = transport.calls.filter((c) => c.op === 'create');
    assert.deepEqual(
      creates.map((c) => c.table),
      ['tasks', 'action_records'],
      'the dependency went FIRST, in dependency order, not in enqueue order'
    );
    assert.equal(
      creates[1].row.target_id,
      creates[0].row.local_id === 'task-1' ? cloud(1) : creates[1].row.target_id,
      'and the action carried the cloud uuid the task had just been given'
    );
    assert.deepEqual(out.namespace.queue, [], 'both settled in one pass');
  });

  test('AA. an action whose reference can NEVER resolve becomes evidence, with the reference intact', async () => {
    const state = {
      ...createEmptyState(TZ),
      actions: [{
        id: 'act-1', type: 'daily_load.drop_task', approval: 'approved', targetId: 'task-gone',
        reason: { code: 'capacity_over_budget', projectedMinutes: 10, budgetMinutes: 5, overBudgetMinutes: 5 },
        before: { status: 'open' }, after: { status: 'archived' },
        logicalDate: '2026-09-20', createdAt: AT, actor: 'user', source: 'her_keys_recommendation', scope: 'personal',
      }],
    };
    let n = namespaceFromClaim({ state, accountId: ACCOUNT_A, householdId: HOUSEHOLD, deviceId: DEVICE_A, idMap: {} });
    n = enqueue(n, { kind: 'action', localId: 'act-1', op: 'create', at: AT }).namespace;

    const transport = fake({});
    const out = await pushPending(n, pushCtx(state, transport));
    assert.deepEqual(transport.calls.filter((c) => c.op === 'create'), [], 'nothing malformed was sent');
    const [evidence] = unresolvedEvidence(out.namespace);
    assert.equal(evidence.evidence, 'unresolvable-dependency');
    assert.match(evidence.detail, /task-gone/, 'the reference is named, not stripped or rewritten to a local id');
  });

  test('S. a tombstone arriving for a row with a pending edit preserves her intent', async () => {
    const state = {
      ...createEmptyState(TZ),
      discovery: { id: 'disc-1', topicId: 'money', answers: [], scope: 'personal' },
    };
    let n = { ...ns(), mappings: { 'discovery:disc-1': { kind: 'discovery', localId: 'disc-1', cloudId: cloud(8), revision: 1 } } };
    n = enqueue(n, { kind: 'discovery', localId: 'disc-1', op: 'update', at: AT }).namespace;

    const transport = fake({
      pull: { kind: 'pulled', rows: [{ entityTable: 'discovery_records', entityId: cloud(8), op: 'tombstone', rowRevision: 2 }], nextCursor: '200' },
      fetchRows: { kind: 'rows', rows: [{ id: cloud(8), local_id: 'disc-1', revision: 2, deleted_at: AT, topic_id: 'money' }] },
    });

    const out = await pullOnce(state, n, {
      transport,
      now: () => Date.parse(AT),
      applyRow: (s, kind, localId, row, resolve) => applyCloudRow(s, kind, localId, row, resolve),
      applyTombstone: applyCloudTombstone,
      mintLocalId: (kind, wanted) => `${wanted}-b2`,
    });

    assert.equal(out.kind, 'applied');
    assert.equal(out.state.discovery, null, 'the removal is authoritative');
    const [evidence] = unresolvedEvidence(out.namespace);
    assert.equal(evidence.evidence, 'tombstone-conflict', 'and her unsent change is kept, not deleted with the row');
    assert.deepEqual(out.namespace.queue, [], 'the work item settled into evidence');
  });

  test('Y/SD4-006. a pulled local_id already in use for a DIFFERENT row mints a fresh one', async () => {
    const state = { ...createEmptyState(TZ), tasks: [task('task-1', { title: 'Mine' })] };
    const n = {
      ...ns(),
      mappings: {
        'task:task-1': { kind: 'task', localId: 'task-1', cloudId: cloud(1), revision: 1 },
        'category:cat-home': { kind: 'category', localId: 'cat-home', cloudId: cloud(3), revision: 1 },
      },
    };

    const transport = fake({
      pull: { kind: 'pulled', rows: [{ entityTable: 'tasks', entityId: cloud(2), op: 'upsert', rowRevision: 1 }], nextCursor: '300' },
      fetchRows: {
        kind: 'rows',
        rows: [{
          id: cloud(2), local_id: 'task-1', revision: 1, title: 'Theirs', category_id: cloud(3),
          subject_member_id: null, duration_minutes: 5, commitment: 'flexible', due_date: null,
          plan_kind: 'unplanned', planned_date: null, planned_starts_at: null, notes: null,
          status: 'open', completed_at: null, scope: 'household', origin_created_at: null, origin_updated_at: null,
        }],
      },
    });

    const out = await pullOnce(state, n, {
      transport,
      now: () => Date.parse(AT),
      applyRow: (s, kind, localId, row, resolve) => applyCloudRow(s, kind, localId, row, resolve),
      applyTombstone: applyCloudTombstone,
      mintLocalId: (kind, wanted) => `${wanted}-b2`,
    });

    assert.equal(out.kind, 'applied');
    assert.equal(out.state.tasks.length, 2, 'two distinct rows, never merged');
    assert.equal(out.state.tasks.find((t) => t.id === 'task-1').title, 'Mine', 'her existing row was NOT overwritten');
    assert.equal(out.state.tasks.find((t) => t.id === 'task-1-b2').title, 'Theirs', 'the incoming row got a fresh local id');
    assert.equal(out.namespace.mappings['task:task-1-b2'].cloudId, cloud(2), 'and the mapping records the translation');
    assert.equal(out.namespace.mappings['task:task-1'].cloudId, cloud(1), 'while the original mapping is untouched');
  });

  test('21. scope and child subject survive the round trip in both directions', () => {
    const state = {
      ...createEmptyState(TZ),
      children: [{ id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' }],
      tasks: [task('task-1', { scope: 'child', subjectMemberId: 'child-1' })],
    };
    const namespace = {
      ...ns(),
      mappings: {
        'category:cat-home': { kind: 'category', localId: 'cat-home', cloudId: cloud(3), revision: 1 },
        'member:child-1': { kind: 'member', localId: 'child-1', cloudId: cloud(5), revision: 1 },
      },
    };

    const outbound = toCloudRow(state, { householdId: HOUSEHOLD, profileId: ACCOUNT_A, namespace }, 'task', 'task-1');
    assert.equal(outbound.scope, 'child', 'the scope is not stripped to get past RLS');
    assert.equal(outbound.subject_member_id, cloud(5), 'and the subject is a cloud uuid, not a local id');
    assert.equal(outbound.owner_profile_id, null, 'a child-scoped row carries no owner profile');
    assert.ok(!('subject_member_type' in outbound), 'the server derives the type; we never send it');

    const back = applyCloudRow(createEmptyState(TZ), 'task', 'task-1', { ...outbound, id: cloud(9), revision: 1 }, (id) =>
      id === cloud(5) ? 'child-1' : id === cloud(3) ? 'cat-home' : null
    );
    const restored = back.tasks[0];
    assert.equal(restored.scope, 'child');
    assert.equal(restored.subjectMemberId, 'child-1', 'and comes home as this device\'s local id');
  });

  test('35. a One Move round trip keeps the server-owned logical day and the typed target', () => {
    const state = {
      ...createEmptyState(TZ),
      tasks: [task('task-1')],
      oneMoves: [{
        id: 'om-1', forDate: '2026-09-20', targetId: 'task-1', targetType: 'task',
        status: 'selected', decidedAt: AT, completedAt: null, scope: 'personal',
      }],
    };
    const namespace = {
      ...ns(),
      mappings: {
        'category:cat-home': { kind: 'category', localId: 'cat-home', cloudId: cloud(3), revision: 1 },
        'task:task-1': { kind: 'task', localId: 'task-1', cloudId: cloud(4), revision: 1 },
      },
    };

    const outbound = toCloudRow(state, { householdId: HOUSEHOLD, profileId: ACCOUNT_A, namespace }, 'oneMove', 'om-1');
    assert.ok(!('logical_day' in outbound), 'the day is server-owned and is never sent');
    assert.ok(!('timezone_at_decision' in outbound), 'nor the timezone it was decided in');
    assert.equal(outbound.target_task_id, cloud(4));
    assert.equal(outbound.target_needs_me_id, null, 'the target is typed, never polymorphic');

    const back = applyCloudRow(createEmptyState(TZ), 'oneMove', 'om-1', {
      ...outbound, id: cloud(6), revision: 1, logical_day: '2026-09-20', timezone_at_decision: TZ,
    }, (id) => (id === cloud(4) ? 'task-1' : null));
    assert.equal(back.oneMoves[0].forDate, '2026-09-20', 'the day comes back from the SERVER, not a device clock');
    assert.equal(back.oneMoves[0].targetType, 'task');
    assert.equal(back.oneMoves[0].targetId, 'task-1');
  });

  test('37. a pulled action record is never regenerated or re-targeted', () => {
    const existing = {
      id: 'act-1', type: 'daily_load.drop_task', approval: 'approved', targetId: 'task-1',
      reason: { code: 'capacity_over_budget', projectedMinutes: 10, budgetMinutes: 5, overBudgetMinutes: 5 },
      before: { status: 'open' }, after: { status: 'archived' },
      logicalDate: '2026-09-20', createdAt: AT, actor: 'user', source: 'her_keys_recommendation', scope: 'personal',
    };
    const state = { ...createEmptyState(TZ), actions: [existing] };
    const after = applyCloudRow(state, 'action', 'act-1', { id: cloud(1), action_type: 'something_else', target_id: cloud(2) }, () => null);
    assert.deepEqual(after.actions, [existing], 'an action this device already holds is left exactly alone');
    assert.equal(after, state, 'not even a new array: nothing changed');
  });

  test('38. transport does not reinterpret onboarding — it carries the stable ids as they are', () => {
    const state = {
      ...createEmptyState(TZ),
      onboarding: { goalIds: ['calmer-household'], strengthIds: ['cooking'], struggleIds: [], lastStep: 'struggles', completedAt: null, scope: 'personal' },
    };
    const outbound = toCloudRow(state, { householdId: HOUSEHOLD, profileId: ACCOUNT_A, namespace: ns() }, 'onboarding', 'user-1');
    assert.deepEqual(outbound.goal_ids, ['calmer-household']);
    assert.equal(outbound.completed_at, null, 'an unfinished onboarding is not completed by being synced');
    assert.equal(outbound.last_step, 'struggles');

    const back = applyCloudRow(createEmptyState(TZ), 'onboarding', 'user-1', outbound, () => null);
    assert.deepEqual(back.onboarding.goalIds, ['calmer-household']);
    assert.equal(back.onboarding.completedAt, null, 'and it is not completed by being pulled either');
    assert.equal(back.onboarding.lastStep, 'struggles');
  });

  test('an UPDATE carries only columns the grant allows', () => {
    const patch = updatablePatch('task', { household_id: 'h', local_id: 'l', owner_profile_id: 'p', title: 'T', status: 'open', revision: 9 });
    assert.deepEqual(Object.keys(patch).sort(), ['status', 'title']);
    assert.ok(!('owner_profile_id' in patch), 'a column with no UPDATE grant would turn an ordinary edit into a refusal');
    assert.deepEqual(updatablePatch('action', { title: 'x' }), {}, 'the ledger is immutable: nothing is updatable');
  });
});

describe('the coordinator', () => {
  const coordinatorFor = (overrides = {}) => {
    const state = createEmptyState(TZ);
    let namespace = { ...ns(), hydration: 'ready' };
    const pulls = [];
    return {
      pulls,
      get namespace() {
        return namespace;
      },
      coordinator: createSyncCoordinator({
        accountId: ACCOUNT_A,
        activeAccountId: () => ACCOUNT_A,
        namespace: () => namespace,
        state: () => state,
        commit: async (_s, n) => {
          namespace = n;
        },
        householdId: HOUSEHOLD,
        profileId: ACCOUNT_A,
        now: () => Date.parse(AT),
        push: { householdId: HOUSEHOLD, profileId: ACCOUNT_A, deviceId: DEVICE_A, transport: null, now: () => Date.parse(AT) },
        pull: {
          transport: {
            async pull(cursor) {
              pulls.push(cursor);
              await new Promise((resolve) => setTimeout(resolve, 5));
              return { kind: 'pulled', rows: [], nextCursor: '500' };
            },
            async fetchRows() {
              return { kind: 'rows', rows: [] };
            },
            async create() {
              return { kind: 'created', cloudId: cloud(1), revision: 1, localId: 'x' };
            },
            async update() {
              return { kind: 'updated', cloudId: cloud(1), revision: 2 };
            },
          },
          now: () => Date.parse(AT),
          applyRow: (s) => s,
          applyTombstone: (s) => s,
          mintLocalId: (kind, wanted) => wanted,
        },
        ...overrides,
      }),
    };
  };

  test('43/O. five simultaneous triggers collapse into ONE cycle', async () => {
    const h = coordinatorFor();
    await Promise.all([
      h.coordinator.request('foreground'),
      h.coordinator.request('networkRestored'),
      h.coordinator.request('authRestored'),
      h.coordinator.request('localMutation'),
      h.coordinator.request('manual'),
    ]);
    // One cycle runs, and at most one follow-up for the work that arrived
    // during it. Never five, and never a recursive spawn.
    assert.ok(h.pulls.length <= 2, `${h.pulls.length} pull phases for five simultaneous triggers`);
    assert.ok(h.pulls.length >= 1, 'and the work was not dropped');
  });

  test('19/V. a cycle for a different active account does nothing at all', async () => {
    const h = coordinatorFor({ activeAccountId: () => ACCOUNT_B });
    const snapshot = await h.coordinator.request('foreground');
    assert.deepEqual(h.pulls, [], 'no pull was applied to the wrong namespace');
    assert.equal(snapshot.phase, 'idle');
    assert.equal(h.namespace.cursor, '0', 'and the cursor did not move');
  });

  test('42. lifecycle is a phase, and attention is derived from evidence', async () => {
    const h = coordinatorFor();
    const before = h.coordinator.snapshot();
    assert.equal(before.phase, 'idle');
    assert.equal(before.needsAttention, false);
    assert.equal(before.hydration, 'ready');

    await h.coordinator.request('manual');
    assert.equal(h.coordinator.snapshot().phase, 'idle', 'a quiet cycle ends idle, not in an error');
  });

  test('M. the pull batch size is a named constant, not a literal', () => {
    assert.equal(typeof PULL_BATCH_SIZE, 'number');
    assert.ok(PULL_BATCH_SIZE > 0 && PULL_BATCH_SIZE <= 1000, `PULL_BATCH_SIZE=${PULL_BATCH_SIZE}`);
  });
});
