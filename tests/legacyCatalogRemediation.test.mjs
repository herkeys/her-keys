/**
 * B4-BE02-OR-002 — legacy real-household catalog One Move remediation.
 *
 * The v1 -> v2 migration stamped `targetType: 'catalog'` onto every v1 One Move
 * regardless of origin, so a REAL household can be carrying One Moves whose
 * target is a fictional demo catalog item. The v2 -> v3 migration moves those
 * records into durable evidence before anything can try to claim them.
 *
 * Fixture keyword presence is not coverage: every case here asserts what the
 * migration actually produced, and which branch the claim builder took.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodeStoredState, migrateStoredState, CURRENT_SCHEMA_VERSION } from '../src/persistence/envelope.ts';
import { isValidV1AppState } from '../src/persistence/legacySchemas.ts';
import { isValidV2AppState } from '../src/persistence/legacySchemasV2.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { buildClaimPayload } from '../src/domain/account/claim.ts';
import { TZ, demoState } from './support/fixtures.mjs';
import { toV3Shape } from './support/legacyShapes.mjs';

const REAL = () => createEmptyState(TZ);
/**
 * What a real household stored BEFORE v4. Historical blobs (v1, v2) must be built from the
 * historical shape: reusing the live factory silently smuggles v4 fields into a v1 fixture,
 * which the frozen validators correctly refuse. (B12: a test-construction defect, not a product one.)
 */
const LEGACY = () => toV3Shape(REAL());

/** A v1 envelope for a REAL household carrying One Move history. */
function v1Real(oneMoves) {
  const base = LEGACY();
  return JSON.stringify({
    schemaVersion: 1,
    appVersion: '1.0.0-test',
    savedAt: '2026-09-18T18:00:00.000Z',
    writeSeq: 4,
    data: {
      origin: 'empty',
      household: base.household,
      user: base.user,
      children: [],
      categories: base.categories,
      events: [],
      tasks: [],
      systems: [],
      meals: [],
      onboarding: base.onboarding,
      oneMoves,
      discovery: null,
      actions: [],
    },
  });
}

const completedMove = {
  id: 'onemove-2026-09-18',
  forDate: '2026-09-18',
  targetId: 'one-move-1',
  status: 'completed',
  decidedAt: '2026-09-18T12:00:00.000Z',
  completedAt: '2026-09-18T18:00:00.000Z',
  scope: 'personal',
};
const selectedMove = {
  id: 'onemove-2026-09-17',
  forDate: '2026-09-17',
  targetId: 'one-move-2',
  status: 'selected',
  decidedAt: '2026-09-17T12:00:00.000Z',
  completedAt: null,
  scope: 'personal',
};

/** The v2 shape a real household is actually carrying after the v1 -> v2 stamp. */
function v2Real(oneMoves) {
  const base = LEGACY();
  return {
    ...base,
    origin: 'empty',
    oneMoves: oneMoves.map((move) => ({ ...move, targetType: 'catalog' })),
    migrationEvidence: undefined,
    needsMe: [],
  };
}
const asV2 = (state) => {
  const { migrationEvidence, ...rest } = state;
  return rest;
};

describe('B4-BE02-OR-002 — legacy catalog One Move remediation', () => {
  // 1. The premise: this state really is what v1/v2 decoding produces.
  test('a REAL v1 household with One Move history really does decode to catalog historical state', () => {
    const decoded = decodeStoredState(v1Real([completedMove]));
    assert.equal(decoded.kind, 'valid');
    assert.equal(decoded.state.origin, 'empty');
    // v3 has already moved it, so the premise is checked one step earlier: the
    // v1 -> v2 step is what stamps 'catalog' onto a real household's record.
    const v2 = migrateStoredState(1, JSON.parse(v1Real([completedMove])).data, {
      currentVersion: 2,
      migrations: new Map([[1, (data) => {
        const v1 = data;
        return {
          ...v1,
          events: v1.events.map((e) => ({ ...e, commitment: 'fixed', status: 'active', notes: null, travelMinutesBefore: null, travelMinutesAfter: null, preparationMinutes: null, source: 'demo', createdAt: null, updatedAt: null })),
          tasks: v1.tasks.map((t) => ({ ...t, status: 'open', notes: null, completedAt: null, createdAt: null, updatedAt: null })),
          oneMoves: v1.oneMoves.map((r) => ({ ...r, targetType: 'catalog' })),
          needsMe: [],
        };
      }]]),
      validators: new Map([[1, isValidV1AppState], [2, isValidV2AppState]]),
    });
    assert.equal(v2.ok, true);
    assert.equal(v2.data.oneMoves[0].targetType, 'catalog', 'the v1 -> v2 stamp does not check origin');
  });

  // 2/4/5/6/7. Completed: every surviving fact is preserved verbatim.
  test('a completed catalog One Move becomes evidence with its status and metadata intact', () => {
    const decoded = decodeStoredState(v1Real([completedMove]));
    assert.equal(decoded.kind, 'valid');
    assert.equal(decoded.state.migrationEvidence.length, 1);
    const [evidence] = decoded.state.migrationEvidence;

    assert.equal(evidence.kind, 'one-move');
    assert.equal(evidence.reason, 'LEGACY_REAL_CATALOG_ONE_MOVE');
    assert.equal(evidence.sourceSchemaVersion, 2);
    assert.deepEqual(evidence.original, {
      oneMoveId: 'onemove-2026-09-18',
      forDate: '2026-09-18',
      targetId: 'one-move-1',
      targetType: 'catalog',
      status: 'completed',
      decidedAt: '2026-09-18T12:00:00.000Z',
      completedAt: '2026-09-18T18:00:00.000Z',
      scope: 'personal',
    });
  });

  // 3. Selected keeps its own status; it is not normalized to anything.
  test('a selected catalog One Move keeps status selected, not rewritten to withheld', () => {
    const decoded = decodeStoredState(v1Real([selectedMove]));
    assert.equal(decoded.kind, 'valid');
    assert.equal(decoded.state.migrationEvidence[0].original.status, 'selected');
    assert.equal(decoded.state.migrationEvidence[0].original.completedAt, null);
  });

  // 10. The remediated record leaves the claimable collection.
  test('the remediated record is gone from the claimable One Moves', () => {
    const decoded = decodeStoredState(v1Real([completedMove, selectedMove]));
    assert.equal(decoded.kind, 'valid');
    assert.deepEqual(decoded.state.oneMoves, [], 'no catalog record may survive in real claimable state');
  });

  // 16. One evidence entry per original record, not one lump.
  test('several legacy records produce one evidence entry each, in order', () => {
    const decoded = decodeStoredState(v1Real([completedMove, selectedMove]));
    assert.equal(decoded.state.migrationEvidence.length, 2);
    assert.deepEqual(
      decoded.state.migrationEvidence.map((e) => e.original.oneMoveId),
      ['onemove-2026-09-18', 'onemove-2026-09-17']
    );
  });

  // 8/9. Deterministic and idempotent: re-running cannot duplicate.
  test('re-running the migration creates no duplicate evidence', () => {
    const once = migrateStoredState(2, asV2(v2Real([completedMove])));
    assert.equal(once.ok, true);
    assert.equal(once.data.migrationEvidence.length, 1);

    // Same input again -> byte-identical output, not a second entry.
    const twice = migrateStoredState(2, asV2(v2Real([completedMove])));
    assert.deepEqual(twice.data, once.data);

    // And a duplicated source record still yields exactly one entry, because
    // the evidence id is derived from the record rather than from position.
    const dupes = migrateStoredState(2, asV2(v2Real([completedMove, completedMove])));
    assert.equal(dupes.data.migrationEvidence.length, 1);
  });

  // 14. Demo is untouched. Its catalog targets are exactly what they say.
  test('a DEMO catalog One Move is left alone and is never turned into evidence', () => {
    const demo = { ...toV3Shape(demoState()), oneMoves: [{ ...completedMove, targetType: 'catalog' }] };
    const migrated = migrateStoredState(2, asV2(demo));
    assert.equal(migrated.ok, true);
    assert.equal(migrated.data.oneMoves.length, 1, 'the demo record stays in the demo household');
    assert.deepEqual(migrated.data.migrationEvidence, []);
  });

  // 12/13. Real, supported targets are untouched by the remediation.
  test('task and needsMe One Moves stay claimable', () => {
    const base = LEGACY();
    const state = asV2({
      ...base,
      tasks: [{ id: 'task-1', title: 'Rinse the recycling', categoryId: 'cat-home', subjectMemberId: null, durationMinutes: 10, commitment: 'flexible', dueDate: null, plan: { kind: 'unplanned' }, notes: null, status: 'open', completedAt: null, createdAt: null, updatedAt: null, scope: 'household' }],
      needsMe: [{ id: 'needsme-1', title: 'Call the dentist back', status: 'open', dueDate: null, categoryId: null, createdAt: '2026-09-15T08:30:00.000Z', scope: 'personal' }],
      oneMoves: [
        { ...completedMove, targetId: 'task-1', targetType: 'task' },
        { ...selectedMove, targetId: 'needsme-1', targetType: 'needsMe' },
      ],
    });
    const migrated = migrateStoredState(2, state);
    assert.equal(migrated.ok, true);
    assert.equal(migrated.data.oneMoves.length, 2);
    assert.deepEqual(migrated.data.migrationEvidence, []);
  });

  // 15. A failed migration keeps the pre-migration state; nothing partial lands.
  test('a migration that fails validation returns a failure rather than half-migrated data', () => {
    const broken = { ...asV2(v2Real([completedMove])), household: { id: 'household-1' } };
    const result = migrateStoredState(2, broken);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'migration_failed');
    assert.equal(result.data, undefined, 'a failed migration hands back no data to write');
  });

  // 5. Atomic at the storage boundary too: a real envelope either decodes to
  // fully remediated v3 state, or does not decode at all.
  test('the decoded envelope is remediated and valid as a whole, or not valid at all', () => {
    const decoded = decodeStoredState(v1Real([completedMove]));
    assert.equal(decoded.kind, 'valid');
    assert.equal(decoded.migratedFrom, 1);
    assert.equal(decoded.state.oneMoves.length, 0);
    assert.equal(decoded.state.migrationEvidence.length, 1);
    // The remediation still happens at v2 -> v3; the household then continues on to the current schema (v4).
    assert.equal(CURRENT_SCHEMA_VERSION, 4);
  });

  // 11. The claim builder does not trust the migration to have run.
  test('buildClaimPayload REFUSES a residual catalog record instead of filtering it', () => {
    const state = { ...REAL(), oneMoves: [{ ...completedMove, targetType: 'catalog' }] };
    assert.throws(
      () => buildClaimPayload(state),
      (error) => /catalog/i.test(error.message) && /onemove-2026-09-18/.test(error.message),
      'a residual catalog record is a local invariant failure, not something to quietly drop'
    );
  });
});
