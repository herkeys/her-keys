import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { titleForCloud } from '../src/domain/foundation/interpretation.ts';
import { applyCloudRow } from '../src/domain/sync/apply.ts';
import { insertableColumnsOf } from '../src/domain/sync/foundationProjection.ts';
import { FOUNDATION_SPECS } from '../src/domain/sync/foundationSpecs.ts';
import { toCloudRow } from '../src/domain/sync/projection.ts';
import { DEPENDENCY_RANK, UPDATABLE_COLUMNS, emptyNamespace, mappingKey } from '../src/domain/sync/syncTypes.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { validateAppState } from '../src/domain/state.ts';
import { richHousehold } from './support/richHousehold.mjs';
import { TZ } from './support/fixtures.mjs';

/**
 * THE PROJECTION IS LOSSLESS, FOR EVERY KIND.
 *
 * One household holding a row of every synced kind is projected to the cloud shape, given the columns the
 * server owns, and applied to a brand-new device. The second device must end up holding EXACTLY what the
 * first held — provenance, exact money, every facet, every typed reference. No database is involved: this
 * proves the two halves of the projection are inverses. The real-Supabase journeys prove the database
 * accepts what they produce.
 */

const HOUSEHOLD = '00000000-0000-4000-8000-00000000aaaa';
const PROFILE = '00000000-0000-4000-8000-00000000bbbb';

/** [sync kind, AppState collection] for every kind whose rows are pushed as ordinary rows. */
const CORE = [
  ['category', 'categories'], ['event', 'events'], ['task', 'tasks'], ['system', 'systems'], ['meal', 'meals'], ['needsMe', 'needsMe'], ['oneMove', 'oneMoves'],
];

function cloudWorld(state) {
  const cloud = new Map(); // `${kind}:${localId}` -> uuid
  let counter = 0;
  const idFor = (kind, localId) => {
    const key = `${kind}:${localId}`;
    if (!cloud.has(key)) cloud.set(key, `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`);
    return cloud.get(key);
  };
  const kinds = [...CORE.map(([k, c]) => [k, c]), ...FOUNDATION_SPECS.map((s) => [s.kind, s.collection])];
  const rows = [];
  for (const [kind, collection] of kinds) {
    const held = state[collection];
    const locals = kind === 'capacity' ? (held === null ? [] : ['capacity']) : held.map((r) => r.id);
    for (const localId of locals) rows.push({ kind, localId, cloudId: idFor(kind, localId) });
  }
  const mappings = Object.fromEntries(rows.map((r) => [mappingKey(r.kind, r.localId), { kind: r.kind, localId: r.localId, cloudId: r.cloudId, revision: 1 }]));
  return { rows, namespace: { ...emptyNamespace({ accountId: PROFILE, householdId: HOUSEHOLD, deviceId: '00000000-0000-4000-8000-00000000dddd' }), mappings } };
}

describe('every synced kind projects to the cloud and back without loss', () => {
  const { state } = richHousehold({ withServerRows: true });
  const world = cloudWorld(state);
  const ctx = { householdId: HOUSEHOLD, profileId: PROFILE, namespace: world.namespace };
  const reverse = new Map(world.rows.map((r) => [r.cloudId, r.localId]));
  const resolve = (cloudId) => (cloudId ? (reverse.get(cloudId) ?? null) : null);

  const projected = world.rows.map((r) => {
    const row = toCloudRow(state, ctx, r.kind, r.localId);
    // The server owns a One Move's logical day: it derives it and freezes it, so it is added here as the server would.
    const serverDay = r.kind === 'oneMove' ? { logical_day: state.oneMoves.find((o) => o.id === r.localId).forDate } : {};
    return { ...r, row: { ...row, ...serverDay, id: r.cloudId, revision: 1, created_at: '2026-09-16T12:00:00.000Z', updated_at: '2026-09-16T12:00:00.000Z' } };
  });

  test('a row of every one of the 25 synced kinds is present', () => {
    const present = new Set(projected.map((p) => p.kind));
    assert.deepEqual(FOUNDATION_SPECS.filter((s) => !present.has(s.kind)).map((s) => s.kind), []);
    assert.deepEqual(CORE.filter(([k]) => !present.has(k)).map(([k]) => k), [], 'and every core kind too');
  });

  for (const spec of FOUNDATION_SPECS) {
    test(`${spec.kind}: it sends only columns the client may name on INSERT, and every editable column is in the row`, () => {
      const allowed = new Set(insertableColumnsOf(spec));
      for (const p of projected.filter((x) => x.kind === spec.kind)) {
        const extra = Object.keys(p.row).filter((k) => !['id', 'revision', 'created_at', 'updated_at'].includes(k) && !allowed.has(k));
        assert.deepEqual(extra, [], 'a column the client has no INSERT grant on');
        for (const column of UPDATABLE_COLUMNS[spec.kind]) assert.ok(column in p.row, `${column} is updatable but never projected`);
        assert.equal(p.row.scope, 'personal');
        assert.equal(p.row.profile_id, PROFILE);
      }
    });
  }

  test('no server-owned column is ever sent, and no credential-shaped column is ever produced', () => {
    for (const p of projected) {
      for (const forbidden of ['id', 'revision', 'created_at', 'updated_at', 'subject_member_type', 'responsible_child_type', 'logical_day', 'timezone_at_decision']) {
        assert.ok(!(forbidden in toCloudRow(state, ctx, p.kind, p.localId)), `${p.kind} sends ${forbidden}`);
      }
      for (const column of Object.keys(p.row)) assert.ok(!/token|secret|password|credential|api_?key|refresh|bearer/i.test(column), `${p.kind}.${column}`);
    }
  });

  test('a second device applying those rows, in dependency order, holds exactly what the first held', () => {
    const rank = (kind) => DEPENDENCY_RANK[kind];
    let device = createEmptyState(TZ);
    // Start from the SAME household shell (starter categories included) so the comparison is the rows themselves.
    device = { ...device, categories: [], onboarding: state.onboarding };
    for (const p of [...projected].sort((a, b) => rank(a.kind) - rank(b.kind) || a.row.created_at.localeCompare(b.row.created_at))) {
      device = applyCloudRow(device, p.kind, p.localId, p.row, resolve);
    }

    const byId = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    // OD-A: the ONE deliberate loss. A reading that she has not accepted crosses the boundary under a neutral label, because its title
    // is copied or derived from her words. Everything else about it round-trips; only an accepted reading carries its own title.
    const expected = (spec) => (spec.kind === 'interpretation' ? state.interpretations.map((r) => ({ ...r, title: titleForCloud(r) })) : state[spec.collection]);
    for (const spec of FOUNDATION_SPECS) {
      if (spec.singleton) {
        assert.deepEqual(device[spec.collection], state[spec.collection], spec.kind);
      } else {
        assert.deepEqual(byId(device[spec.collection]), byId(expected(spec)), `${spec.kind} differs after a round trip`);
      }
    }
    const undecided = state.interpretations.filter((r) => r.state !== 'accepted');
    assert.ok(undecided.length > 0, 'the household holds an undecided reading, so the deliberate difference is exercised');
    assert.ok(undecided.every((r) => device.interpretations.find((d) => d.id === r.id).title !== r.title), 'and its title really did not cross');
    for (const [kind, collection] of CORE) {
      assert.deepEqual(byId(device[collection]), byId(state[collection]), `${kind} differs after a round trip`);
    }
    const valid = validateAppState(device);
    assert.equal(valid.ok, true, valid.ok ? '' : JSON.stringify(valid.issues));
  });

  test('facets and exact money arrive as they were sent — NULL stays "not known", an amount stays exact', () => {
    let device = createEmptyState(TZ);
    device = { ...device, categories: [] };
    for (const p of projected.filter((x) => x.kind === 'category' || x.kind === 'task')) device = applyCloudRow(device, p.kind, p.localId, p.row, resolve);
    const form = device.tasks.find((t) => t.title === 'Sign the permission form');
    assert.deepEqual(form.value, { amountMinor: 3500, currency: 'USD', direction: 'outflow' });
    assert.deepEqual([form.splittable, form.minChunkMinutes, form.energyDemand, form.consequence, form.needsMePersonally], [true, 5, 'low', 'high', true]);
    const fee = device.tasks.find((t) => t.title === 'Pay the $35 trip fee');
    assert.deepEqual(fee.provenance.producer, 'ai-inference');
    assert.equal(fee.provenance.confidence, 'established', 'persistence and transport never promote a level');
    assert.equal(fee.earliestStartAt, null, 'a facet nobody answered is still not known');
  });
});
