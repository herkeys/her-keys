/**
 * MP-04, reproduced against the REAL push engine.
 *
 * The cloud holds `UNIQUE (system_id, position)` (non-deferrable) and the push engine sends one
 * coalesced row at a time. This drives `pushPending` with a fake transport that enforces exactly
 * that constraint, to show (1) the defect: a swap of two steps' positions collides on whichever row
 * goes first, so neither change reaches the cloud; and (2) Feature 04's mitigation: the rows its
 * layout changes land on slots nobody holds, so they push cleanly in EVERY order.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { draftFromState } from '../../src/features/systems/commands/draft.ts';
import { applySystemDraft } from '../../src/features/systems/commands/saveDraft.ts';
import { pushPending } from '../../src/domain/sync/pushEngine.ts';
import { enqueue } from '../../src/domain/sync/queue.ts';
import { emptyNamespace, mappingKey } from '../../src/domain/sync/syncTypes.ts';
import { MORNING, ctxAt, realHousehold, stepRow, systemRow, withRows } from './support/canon.mjs';

const cloud = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ACCOUNT = cloud(9001);
const HOUSEHOLD = cloud(9002);
const DEVICE = cloud(9003);
const keyFor = (i) => `e${i}`;

/** A cloud that behaves like `system_steps`: rows keyed by cloud id, UNIQUE (system_id, position). */
function fakeCloud(initial) {
  const table = new Map(initial.map((row) => [row.cloudId, { system_id: row.system_id, position: row.position }]));
  return {
    table,
    positionsByLocal: (mappings) => Object.fromEntries(Object.values(mappings).filter((m) => m.kind === 'systemStep').map((m) => [m.localId, table.get(m.cloudId).position])),
    transport: {
      async create() {
        throw new Error('the scenario only edits rows the cloud already has');
      },
      async update(_table, cloudId, baseRevision, patch) {
        const next = { ...table.get(cloudId), ...('position' in patch ? { position: patch.position } : {}) };
        for (const [id, row] of table) {
          if (id !== cloudId && row.system_id === next.system_id && row.position === next.position) {
            return { kind: 'failure', failure: 'domainConflict', code: '23505', detail: 'duplicate key value violates unique constraint "system_steps_system_position_key"' };
          }
        }
        table.set(cloudId, next);
        return { kind: 'updated', cloudId, revision: baseRevision + 1 };
      },
      async pull() {
        throw new Error('not used');
      },
      async fetchRows() {
        throw new Error('not used');
      },
    },
  };
}

/** A synced household: the system and its steps exist in the cloud at the positions they hold locally. */
function synced(positions) {
  const steps = positions.map((position, i) => stepRow({ id: `st-${i}`, systemId: 'sys-1', position, title: `Step ${i}` }));
  const state = withRows(realHousehold(), { systems: [systemRow({ id: 'sys-1', name: 'Reset' })], systemSteps: steps });
  const mappings = { [mappingKey('system', 'sys-1')]: { kind: 'system', localId: 'sys-1', cloudId: cloud(100), revision: 1 } };
  steps.forEach((s, i) => {
    mappings[mappingKey('systemStep', s.id)] = { kind: 'systemStep', localId: s.id, cloudId: cloud(200 + i), revision: 1 };
  });
  const remote = fakeCloud(steps.map((s, i) => ({ cloudId: cloud(200 + i), system_id: cloud(100), position: s.position })));
  return { state, mappings, remote };
}

async function pushChanges(localState, mappings, remote, changedLocalIds) {
  let namespace = { ...emptyNamespace({ accountId: ACCOUNT, householdId: HOUSEHOLD, deviceId: DEVICE }), hydration: 'ready', mappings };
  for (const localId of changedLocalIds) {
    const queued = enqueue(namespace, { kind: 'systemStep', localId, op: 'update', at: new Date(MORNING).toISOString() });
    assert.equal(queued.ok, true);
    namespace = queued.namespace;
  }
  const outcome = await pushPending(namespace, { state: localState, householdId: HOUSEHOLD, profileId: ACCOUNT, deviceId: DEVICE, transport: remote.transport, now: () => MORNING });
  return outcome;
}

const permutations = (items) => (items.length <= 1 ? [items] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])));

describe('MP-04 — a position swap cannot sync; Feature 04’s reorder can', () => {
  test('THE DEFECT: swapping two dense positions collides on whichever row is pushed first, in either order', async () => {
    for (const order of [['st-0', 'st-1'], ['st-1', 'st-0']]) {
      const { state, mappings, remote } = synced([0, 1]);
      // the local truth after a naive swap
      const swapped = { ...state, systemSteps: state.systemSteps.map((s) => (s.id === 'st-0' ? { ...s, position: 1 } : { ...s, position: 0 })) };
      const outcome = await pushChanges(swapped, mappings, remote, order);
      assert.equal(outcome.pushed, 0, `order ${order}: nothing reached the cloud`);
      assert.equal(outcome.conflicted, 2, `order ${order}: both changes became domain-conflict evidence`);
      assert.deepEqual(outcome.namespace.evidence.map((e) => e.evidence), ['domain-conflict', 'domain-conflict']);
      assert.deepEqual(remote.positionsByLocal(mappings), { 'st-0': 0, 'st-1': 1 }, 'the cloud keeps the OLD order while the device shows the new one');
    }
  });

  const cases = [
    ['a sparse swap of two neighbours', [0, 10, 20], (d) => d.steps.splice(0, 2, d.steps[1], d.steps[0])],
    ['moving the last step to the top', [0, 10, 20], (d) => d.steps.unshift(d.steps.pop())],
    ['reversing three steps', [0, 10, 20], (d) => d.steps.reverse()],
    ['a swap on a LEGACY dense layout (0,1,2)', [0, 1, 2], (d) => d.steps.splice(0, 2, d.steps[1], d.steps[0])],
    ['reversing a dense layout', [0, 1, 2, 3], (d) => d.steps.reverse()],
    ['moving a step above position 0', [0, 10, 20], (d) => d.steps.unshift(d.steps.pop())],
  ];

  for (const [label, positions, edit] of cases) {
    test(`THE MITIGATION: ${label} pushes cleanly in EVERY order and the cloud ends in the same order as the device`, async () => {
      const { state, mappings, remote } = synced(positions);
      const { draft, base } = draftFromState(state, 'sys-1', keyFor);
      edit(draft);
      const result = applySystemDraft(state, ctxAt(), draft, base);
      assert.equal(result.outcome.kind, 'saved');
      const changed = result.state.systemSteps.filter((s, i) => s.position !== state.systemSteps[i].position).map((s) => s.id);
      assert.ok(changed.length >= 1, 'something moved');

      for (const order of permutations(changed)) {
        const fresh = synced(positions);
        const outcome = await pushChanges(result.state, fresh.mappings, fresh.remote, order);
        assert.deepEqual([outcome.conflicted, outcome.pushed], [0, changed.length], `order ${order.join(' → ')}: no collision`);
        const cloudOrder = Object.entries(fresh.remote.positionsByLocal(fresh.mappings)).sort((a, b) => a[1] - b[1]).map(([id]) => id);
        const localOrder = [...result.state.systemSteps].sort((a, b) => a.position - b.position).map((s) => s.id);
        assert.deepEqual(cloudOrder, localOrder, `order ${order.join(' → ')}: the cloud reads in the device's order`);
      }
    });
  }
});
