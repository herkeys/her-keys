/**
 * HK13-D08 (P0) — a household saved before a later feature existed must still load (HK-F01-F13 integration audit).
 *
 * Features 10-13 each added a root to the v4 shape without a schema-version bump. F11, F12 and F13 gave theirs a `[]` default; F10 did
 * not, so a household stored by any pre-F10 build failed validation, and hydration handles `invalid` by writing an EMPTY household over
 * the stored one (and production keeps no quarantine copy). These tests hold the convention for every root added after WAVE3_BASE, and
 * prove the real store keeps such a household.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addTask } from '../../src/domain/tasks.ts';
import { AppStateSchema, validateAppState } from '../../src/domain/state.ts';
import { decodeStoredState } from '../../src/persistence/envelope.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { MORNING, STORAGE_KEYS, TZ, harness, launch, rawEnvelope, stored } from '../support/fixtures.mjs';

/** Every root of the state the WAVE3_BASE app (363e473) stored — pinned, because the point is what OLD builds wrote. */
const WAVE3_BASE_ROOTS = [
  'origin', 'household', 'user', 'children', 'categories', 'events', 'tasks', 'systems', 'meals', 'onboarding', 'oneMoves', 'needsMe',
  'discovery', 'actions', 'migrationEvidence', 'migrationLineage', 'sourceArtifacts', 'externalReferences', 'interpretations',
  'observations', 'authorities', 'intents', 'decisions', 'executions', 'outcomes', 'people', 'responsibilities', 'dependencies',
  'recurrences', 'goals', 'systemSteps', 'capacity', 'patterns', 'evidenceLinks',
];
const LATER_ROOTS = Object.keys(AppStateSchema.shape).filter((root) => !WAVE3_BASE_ROOTS.includes(root));

/** A real household (origin `empty`, not the demo) holding two tasks, as the WAVE3_BASE app would have written it. */
function wave3Household() {
  let n = 0;
  const ctx = { nowMs: MORNING, today: '2026-09-16', createId: (prefix) => `${prefix}-w3-${++n}` };
  let state = createEmptyState(TZ);
  state = addTask(state, ctx, { title: 'Renew the car registration', categoryId: 'cat-home', scope: 'household' });
  state = addTask(state, ctx, { title: 'Call the pediatrician', categoryId: 'cat-kids', scope: 'household' });
  const data = JSON.parse(stored(state)).data;
  for (const root of LATER_ROOTS) delete data[root];
  return data;
}

describe('HK13-D08 — roots added after WAVE3_BASE', () => {
  test('the roots Features 10-13 added are exactly the later ones, and every one of them has a default', () => {
    assert.deepEqual([...LATER_ROOTS].sort(), [
      'careerOpportunities', 'lifeRecordLinks', 'lifeRecords', 'personContexts', 'personTaskLinks', 'rebuildFocusLinks', 'rebuildFocuses',
    ].sort());
    for (const root of LATER_ROOTS) {
      assert.equal(AppStateSchema.shape[root].def?.type, 'default', `${root} has no default: a household saved before it existed would not load`);
    }
  });

  test('a household the WAVE3_BASE app stored (none of the later roots) validates, and each later root reads as empty', () => {
    const data = wave3Household();
    for (const root of LATER_ROOTS) assert.equal(root in data, false, root);
    const verdict = validateAppState(data);
    assert.equal(verdict.ok, true, verdict.ok ? '' : verdict.issues.join('; '));
    for (const root of LATER_ROOTS) assert.deepEqual(verdict.state[root], [], root);
  });

  test('the stored envelope decodes as valid (no migration step is needed, no schema version moves)', () => {
    const decoded = decodeStoredState(rawEnvelope(wave3Household()));
    assert.equal(decoded.kind, 'valid', decoded.kind === 'invalid' ? `${decoded.reason}: ${decoded.issues.join('; ')}` : '');
    assert.deepEqual(decoded.state.tasks.map((t) => t.title), ['Renew the car registration', 'Call the pediatrician']);
  });

  test('the real store hydrates that household READY and never writes an empty household over it (production: no quarantine copy)', async () => {
    const h = harness({ mode: 'empty', quarantine: false, initial: { [STORAGE_KEYS.primary]: rawEnvelope(wave3Household()) } });
    const store = await launch(h);
    const snapshot = store.getSnapshot();
    assert.equal(snapshot.status, 'ready');
    assert.equal(snapshot.recovery, null);
    assert.deepEqual(snapshot.state.tasks.map((t) => t.title), ['Renew the car registration', 'Call the pediatrician']);
    const onDisk = h.readPrimary();
    assert.ok(onDisk !== null, 'the household is still stored');
    assert.deepEqual(onDisk.data.tasks.map((t) => t.title), ['Renew the car registration', 'Call the pediatrician'], 'what is on disk is still her household');
  });
});
