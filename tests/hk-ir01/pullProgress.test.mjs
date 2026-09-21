/**
 * HK-INTEGRATION-READINESS-01 / HA-001 - a pull is COMPLETE for its range (IR-D11).
 *
 * The server's sync_pull has no limit, and its cursor is a transaction id: a claim writes a household in ONE transaction, so there
 * is no cursor value between two of its rows. The engine used to keep the first 200 rows and stay at the old cursor, which reads the
 * same 200 rows forever and never hydrates a larger household. These pin the contract at the two places it lived: the engine
 * (nothing is cut, only the row REQUESTS are bounded) and the PostgREST transport (nothing is sliced).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { namespaceForNewDevice } from '../../src/domain/sync/claimSeam.ts';
import { applyPullBatch, fetchPullBatch } from '../../src/domain/sync/pullEngine.ts';
import { PULL_FETCH_CHUNK } from '../../src/domain/sync/syncTypes.ts';
import { createSupabaseSyncTransport } from '../../src/platform/supabaseSyncTransport.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
const DEVICE = '22222222-2222-4222-8222-222222222222';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);

const namespace = () => namespaceForNewDevice({ accountId: ACCOUNT, householdId: HOUSEHOLD, deviceId: DEVICE });
const changes = (count, table = 'tasks') => Array.from({ length: count }, () => ({ entityTable: table, entityId: randomUUID(), op: 'upsert', rowRevision: 1 }));

function context(transport, overrides = {}) {
  return {
    transport,
    now: () => NOW,
    applyRow: (state) => state,
    applyTombstone: (state) => state,
    mintLocalId: (_kind, wanted) => wanted,
    ...overrides,
  };
}

describe('the engine consumes a pull whole and bounds only the row requests', () => {
  test('450 changes: every id is requested exactly once, in requests no larger than the chunk, and the SERVER cursor is adopted', async () => {
    const rows = changes(450);
    const requests = [];
    const transport = {
      pull: async () => ({ kind: 'pulled', rows, nextCursor: '999' }),
      fetchRows: async (_table, ids) => {
        requests.push([...ids]);
        return { kind: 'rows', rows: [] };
      },
    };
    const out = await fetchPullBatch(namespace(), context(transport));

    assert.equal(out.kind, 'fetched');
    assert.equal(out.batch.nextCursor, '999', 'the cursor moves to the barrier: it is never held at the old value');
    assert.ok(requests.every((ids) => ids.length <= PULL_FETCH_CHUNK), 'no request is larger than the chunk');
    assert.deepEqual(requests.flat().sort(), rows.map((r) => r.entityId).sort(), 'and together they name every change, once');
    assert.equal(out.batch.tables[0].ids.length, 450);
    assert.equal('more' in out.batch, false, 'there is no "more": the batch is everything settled before the cursor');
  });

  test('the transport is asked for a cursor and a household and nothing that could be used to cut the answer short', async () => {
    let seen = null;
    const transport = { pull: async (...args) => ((seen = args), { kind: 'pulled', rows: [], nextCursor: '5' }), fetchRows: async () => ({ kind: 'rows', rows: [] }) };
    await fetchPullBatch(namespace(), context(transport));
    assert.deepEqual(seen, ['0', HOUSEHOLD]);
  });

  test('the chunk is the context\'s to shrink', async () => {
    const sizes = [];
    const transport = {
      pull: async () => ({ kind: 'pulled', rows: changes(23), nextCursor: '9' }),
      fetchRows: async (_t, ids) => (sizes.push(ids.length), { kind: 'rows', rows: [] }),
    };
    await fetchPullBatch(namespace(), context(transport, { fetchChunk: 10 }));
    assert.deepEqual(sizes, [10, 10, 3]);
  });

  test('a change named twice is requested once', async () => {
    const one = changes(1)[0];
    const sizes = [];
    const transport = {
      pull: async () => ({ kind: 'pulled', rows: [one, { ...one, rowRevision: 2 }, one], nextCursor: '9' }),
      fetchRows: async (_t, ids) => (sizes.push(ids.length), { kind: 'rows', rows: [] }),
    };
    await fetchPullBatch(namespace(), context(transport));
    assert.deepEqual(sizes, [1]);
  });

  test('a failure in a LATER chunk discards the whole fetch: no partial batch, and a retriable outcome', async () => {
    let calls = 0;
    const transport = {
      pull: async () => ({ kind: 'pulled', rows: changes(350), nextCursor: '9' }),
      fetchRows: async () => (++calls === 3 ? { kind: 'failure', failure: 'unreachable', detail: 'offline', code: null } : { kind: 'rows', rows: [] }),
    };
    const out = await fetchPullBatch(namespace(), context(transport));
    assert.deepEqual([out.kind, out.retriable], ['failed', true]);
    assert.equal('batch' in out, false, 'nothing partial is handed up to be applied');
  });

  test('an expired session in a later chunk PAUSES the cycle instead of counting as a failure', async () => {
    let calls = 0;
    const transport = {
      pull: async () => ({ kind: 'pulled', rows: changes(250), nextCursor: '9' }),
      fetchRows: async () => (++calls === 2 ? { kind: 'failure', failure: 'unauthorized', detail: 'jwt expired', code: '28000' } : { kind: 'rows', rows: [] }),
    };
    assert.equal((await fetchPullBatch(namespace(), context(transport))).kind, 'paused');
  });

  test('a table this client does not sync is never requested at all', async () => {
    let requested = 0;
    const transport = { pull: async () => ({ kind: 'pulled', rows: changes(300, 'some_server_only_table'), nextCursor: '9' }), fetchRows: async () => (requested++, { kind: 'rows', rows: [] }) };
    const out = await fetchPullBatch(namespace(), context(transport));
    assert.equal(requested, 0);
    assert.deepEqual([out.kind, out.batch.tables.length, out.batch.nextCursor], ['fetched', 0, '9']);
  });
});

describe('one durable batch completes hydration', () => {
  test('an empty range still moves the cursor and finishes hydration; a device never sits "unhydrated" because the household was empty', () => {
    const before = namespace();
    assert.equal(before.hydration, 'unhydrated');
    const out = applyPullBatch(createEmptyState('America/Chicago'), before, { nextCursor: '42', tables: [] }, context({}));
    assert.equal(out.kind, 'upToDate');
    assert.deepEqual([out.namespace.cursor, out.namespace.hydration], ['42', 'ready']);
  });
});

describe('the PostgREST transport hands up the whole change list', () => {
  test('a 450-row sync_pull answer is returned whole, with the server cursor, for exactly the arguments the RPC takes', async () => {
    const calls = [];
    const client = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: { rows: changes(450).map((c) => ({ entity_table: c.entityTable, entity_id: c.entityId, op: 'upsert', row_revision: 1 })), next_cursor: '77' }, error: null };
      },
    };
    const out = await createSupabaseSyncTransport(client).pull('5', HOUSEHOLD);
    assert.equal(out.kind, 'pulled');
    assert.equal(out.rows.length, 450, 'not truncated to a batch');
    assert.equal(out.nextCursor, '77');
    assert.deepEqual(calls, [{ name: 'sync_pull', args: { p_cursor: '5', p_household_id: HOUSEHOLD } }]);
  });
});
