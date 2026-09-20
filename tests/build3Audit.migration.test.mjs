/**
 * Build 3 hostile audit — schema v1 -> v2 migration against authentic data.
 *
 * `fixtures/build25-v1-envelopes.json` was written by the Build 2.5 store
 * itself (a546ec2, schema v1) — first launches, onboarding, an approved and a
 * kept Daily Load decision, completed and withheld One Moves, customized
 * categories and next-day history — so these tests exercise the exact bytes
 * an upgrade meets on a device, not a hand-built approximation.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { dailyLoadDecisionFor } from '../src/domain/dailyLoadDecisions.ts';
import { oneMoveForDay } from '../src/domain/oneMove.ts';
import { addTask } from '../src/domain/tasks.ts';
import { CURRENT_SCHEMA_VERSION, decodeStoredState, encodeStoredState } from '../src/persistence/envelope.ts';
import { isValidV1AppState } from '../src/persistence/legacySchemas.ts';
import { DAY, MORNING, NEXT_DAY, STORAGE_KEYS, harness, launch, nyMs } from './support/fixtures.mjs';
import { V4_ROW_ADDITIONS, withoutV4Additions } from './support/legacyShapes.mjs';

const V1 = JSON.parse(readFileSync(new URL('./fixtures/build25-v1-envelopes.json', import.meta.url), 'utf8'));
const UNCHANGED_SECTIONS = ['origin', 'household', 'user', 'children', 'categories', 'systems', 'meals', 'onboarding', 'discovery', 'actions'];

const v1Data = (name) => JSON.parse(V1[name]).data;
/** Every household in this authentic corpus is a demo household, so v4 classifies every row as demo-seed. */
const DEMO_PROV = { producer: 'demo-seed', artifactId: null, confidence: null };
const TASK_FACET_KEYS = V4_ROW_ADDITIONS.tasks.filter((key) => key !== 'provenance');
const decodeValid = (raw) => {
  const decoded = decodeStoredState(raw);
  assert.equal(decoded.kind, 'valid', JSON.stringify(decoded).slice(0, 200));
  return decoded;
};
/** An authentic envelope with one hostile edit applied. */
const tampered = (name, edit) => {
  const envelope = JSON.parse(V1[name]);
  edit(envelope.data, envelope);
  return JSON.stringify(envelope);
};
const failureOf = (raw) => {
  const decoded = decodeStoredState(raw);
  return decoded.kind === 'invalid' ? decoded.reason : decoded.kind;
};

describe('Build 3 audit — authentic v1 data migrates without loss', () => {
  test('the fixture set really is Build 2.5 schema v1 output, and the frozen v1 validator still accepts all of it', () => {
    assert.equal(Object.keys(V1).length, 7);
    for (const [name, raw] of Object.entries(V1)) {
      const envelope = JSON.parse(raw);
      assert.equal(envelope.schemaVersion, 1, name);
      assert.equal(isValidV1AppState(envelope.data), true, `${name}: legacy validator drifted from what v1 actually was`);
    }
  });

  test('every envelope decodes as migrated state that keeps every section v2 did not change', () => {
    for (const [name, raw] of Object.entries(V1)) {
      const decoded = decodeValid(raw);
      assert.equal(decoded.migratedFrom, 1, name);
      assert.equal(decoded.writeSeq, JSON.parse(raw).writeSeq, `${name}: write sequence continues from disk`);
      // v4 added exactly one thing to these sections — stored provenance. Remove only that and every
      // authentic Build 2.5 byte must still be there: the migration is lossless, not merely non-throwing.
      for (const section of UNCHANGED_SECTIONS) {
        assert.deepEqual(withoutV4Additions(decoded.state[section], section), v1Data(name)[section], `${name}.${section}`);
      }
    }
  });

  test('backfills are conservative and never invent a fact: events fixed, tasks open, timestamps unknown, plans kept', () => {
    for (const name of Object.keys(V1)) {
      const { state } = decodeValid(V1[name]);
      const before = v1Data(name);
      // What v2 and v3 backfilled is compared with everything v4 ADDED taken off; what v4 added is then
      // asserted on its own — provenance carries the demo truth, and every new facet is honestly unknown.
      state.events.forEach((event, index) => {
        assert.deepEqual(
          withoutV4Additions(event, 'events'),
          {
            ...before.events[index],
            commitment: 'fixed',
            status: 'active',
            notes: null,
            travelMinutesBefore: null,
            travelMinutesAfter: null,
            preparationMinutes: null,
            createdAt: null,
            updatedAt: null,
          },
          `${name} event ${event.id}`
        );
        // v1 -> v2 stamped source:'demo'; v3 -> v4 carries that truth into stored provenance.
        assert.deepEqual(event.provenance, DEMO_PROV);
        assert.equal('source' in event, false);
      });
      state.tasks.forEach((task, index) => {
        assert.deepEqual(withoutV4Additions(task, 'tasks'), { ...before.tasks[index], status: 'open', notes: null, completedAt: null, createdAt: null, updatedAt: null }, `${name} task ${task.id}`);
        assert.deepEqual(task.provenance, DEMO_PROV);
        assert.ok(TASK_FACET_KEYS.every((key) => task[key] === null), `${name} task ${task.id}: no facet is invented`);
      });
      state.oneMoves.forEach((record, index) => {
        assert.deepEqual(withoutV4Additions(record, 'oneMoves'), { ...before.oneMoves[index], targetType: 'catalog' });
        assert.deepEqual(record.provenance, DEMO_PROV);
      });
      assert.deepEqual(state.needsMe, []);
      // Every One Move in this authentic corpus belongs to a DEMO household, so
      // the v2 -> v3 catalog remediation has nothing to do here. Real Build 2.5
      // households produced no One Moves at all, which is why the v1 -> v2
      // catalog assumption went unnoticed for so long.
      assert.deepEqual(state.migrationEvidence, [], `${name}: authentic demo data needs no remediation`);
    }
  });

  test('migrating is not repeated: the migrated state re-encodes as the current version and reads back identical, unmigrated', () => {
    for (const name of Object.keys(V1)) {
      const first = decodeValid(V1[name]);
      const rewritten = encodeStoredState(first.state, { appVersion: 'audit', savedAt: '2026-09-16T12:00:00.000Z', writeSeq: first.writeSeq + 1 });
      assert.equal(JSON.parse(rewritten).schemaVersion, CURRENT_SCHEMA_VERSION);
      const second = decodeValid(rewritten);
      assert.equal(second.migratedFrom, null, name);
      assert.deepEqual(second.state, first.state, name);
    }
  });

  test('customized categories keep id, role, order and archive status across the migration', () => {
    const { state } = decodeValid(V1.demoKeptCustomCategories);
    const byId = new Map(state.categories.map((category) => [category.id, category]));
    assert.equal(byId.get('cat-kids').name, 'Family');
    assert.equal(byId.get('cat-kids').systemRole, 'kids');
    assert.equal(byId.get('cat-home').status, 'archived');
    const pets = state.categories.find((category) => category.name === 'Pets');
    assert.equal(pets.systemRole, null);
    assert.equal(pets.sortOrder, 0);
    // The archived category is still a valid reference for the task that points at it.
    assert.ok(state.tasks.some((task) => task.categoryId === 'cat-home'));
  });

  test('accepted history keeps its meaning after the upgrade: the approved move and completed One Move still read as done', () => {
    const { state } = decodeValid(V1.demoMovedCompleted);
    assert.equal(dailyLoadDecisionFor(state, DAY).decision, 'moved');
    assert.equal(oneMoveForDay(state, DAY).status, 'completed');
    assert.deepEqual(state.tasks.find((task) => task.id === 'task-2').plan, { kind: 'day', date: NEXT_DAY });
  });
});

describe('Build 3 audit — migrated data through a real launch', () => {
  test('loading migrated state writes nothing; the first change writes the current version (v4) and continues the sequence', async () => {
    const h = harness({ mode: 'empty', initial: { [STORAGE_KEYS.primary]: V1.emptyOnboarded } });
    const store = await launch(h);
    assert.equal(store.getSnapshot().status, 'ready');
    assert.equal(h.primaryWrites().length, 0);
    assert.equal(h.readPrimary().schemaVersion, 1, 'nothing rewrote the stored v1 envelope just by reading it');

    const saved = await store.commit((state, ctx) => addTask(state, ctx, { title: 'First real task', categoryId: 'cat-home', dueDate: DAY, scope: 'household' }));
    assert.equal(saved, true);
    const disk = h.readPrimary();
    assert.equal(disk.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(disk.writeSeq, JSON.parse(V1.emptyOnboarded).writeSeq + 1);
    assert.equal(disk.data.origin, 'empty');
    // Losslessly carried: strip only what v4 added and the authentic v1 bytes remain.
    assert.deepEqual(withoutV4Additions(disk.data.onboarding, 'onboarding'), v1Data('emptyOnboarded').onboarding);
    // This is a REAL (non-demo) household, so the backfill classified it by what v3 could prove:
    assert.equal(disk.data.onboarding.provenance.producer, 'onboarding', 'the intake flow wrote it');
    assert.ok(disk.data.categories.every((c) => c.provenance.producer === 'system-derived'), 'a real household untouched by categories keeps only its starter set');
    const added = disk.data.tasks.find((t) => t.title === 'First real task');
    assert.equal(added.provenance.producer, 'user-action', 'a task she adds AFTER the upgrade is stored as hers');
    const lineage = disk.data.migrationLineage[0];
    assert.equal(lineage.kind, 'provenance-backfill');
    assert.deepEqual([lineage.fromSchemaVersion, lineage.toSchemaVersion], [3, 4]);
  });

  test('demo/real isolation survives the migration in both directions', async () => {
    const demoOnRealBuild = harness({ mode: 'empty', initial: { [STORAGE_KEYS.primary]: V1.demoMovedCompleted } });
    const realStore = await launch(demoOnRealBuild);
    const real = realStore.getSnapshot();
    assert.equal(real.recovery.reason, 'mode_mismatch');
    assert.equal(real.state.origin, 'empty');
    assert.deepEqual([real.state.events, real.state.tasks, real.state.oneMoves, real.state.actions], [[], [], [], []]);
    assert.equal(demoOnRealBuild.readPrimary().data.origin, 'empty', 'fictional data is not kept on a real-user build');

    const realOnDemoBuild = harness({ mode: 'demo', initial: { [STORAGE_KEYS.primary]: V1.emptyOnboarded } });
    const demoStore = await launch(realOnDemoBuild);
    assert.equal(demoStore.getSnapshot().persistence, 'disabled');
    assert.equal(realOnDemoBuild.primaryWrites().length, 0);
    assert.equal(realOnDemoBuild.storage.contents()[STORAGE_KEYS.primary], V1.emptyOnboarded, 'the real household is untouched byte for byte');
  });

  test('migrated history across a day boundary: yesterday stays done and nothing is re-offered', async () => {
    const h = harness({ mode: 'demo', now: nyMs(9, 0, 17), initial: { [STORAGE_KEYS.primary]: V1.demoNextDayHistory } });
    const store = await launch(h);
    const { state, today } = store.getSnapshot();
    assert.equal(today, NEXT_DAY);
    assert.equal(oneMoveForDay(state, DAY).status, 'completed');
    assert.equal(oneMoveForDay(state, NEXT_DAY).status, 'none');
    assert.equal(dailyLoadDecisionFor(state, NEXT_DAY).decision, 'pending');
    assert.equal(h.primaryWrites().length, 0);
    assert.ok(MORNING < nyMs(9, 0, 17));
  });
});

describe('Build 3 audit — hostile v1 input fails closed, never into a false fact', () => {
  test('partial, unknown, mixed-version and malformed v1 records are refused instead of guessed', () => {
    const cases = [
      ['event missing a field', (d) => delete d.events[0].location],
      ['unknown field on a task', (d) => (d.tasks[0].color = 'red')],
      ['v2-only field inside a v1 envelope', (d) => (d.events[0].commitment = 'flexible')],
      ['impossible timestamp', (d) => (d.events[0].startsAt = '2026-02-30T10:00:00.000Z')],
      ['timestamp without a zone', (d) => (d.events[0].startsAt = '2026-09-16T10:00:00')],
      ['negative duration', (d) => (d.tasks[0].durationMinutes = -5)],
      ['fractional duration', (d) => (d.tasks[0].durationMinutes = 7.5)],
      ['absurd duration', (d) => (d.tasks[0].durationMinutes = 1e9)],
      ['needsMe array in a v1 envelope', (d) => (d.needsMe = [])],
    ];
    for (const [label, edit] of cases) assert.equal(failureOf(tampered('demoFresh', edit)), 'migration_failed', label);
  });

  test('broken relationships are integrity violations, and a household id is never rewritten', () => {
    assert.equal(failureOf(tampered('demoFresh', (d) => (d.tasks[0].categoryId = 'cat-gone'))), 'integrity_violation');
    assert.equal(failureOf(tampered('demoFresh', (d) => (d.categories[0].householdId = 'hh-other'))), 'integrity_violation');
    const { state } = decodeValid(V1.demoFresh);
    assert.equal(state.household.id, v1Data('demoFresh').household.id);
  });

  test('a mislabeled version is not reinterpreted: v1 data claiming a later version is invalid, and a newer version is left alone', () => {
    // Claiming to be v2 is caught by the frozen v2 validator on the way IN to
    // the v2 -> v3 step, rather than by the shape check at the end. Either way
    // the data is never reinterpreted under rules it was not written for.
    // The ladder moved up one rung with v4. Every claim below the current version is caught by the FROZEN
    // validator of the version it claims, on the way into the next step; the current version is caught by the
    // live schema; anything above is left alone. Nothing is ever reinterpreted under rules it was not written for.
    assert.equal(failureOf(tampered('demoFresh', (d, envelope) => (envelope.schemaVersion = 2))), 'migration_failed');
    assert.equal(failureOf(tampered('demoFresh', (d, envelope) => (envelope.schemaVersion = 3))), 'migration_failed');
    assert.equal(failureOf(tampered('demoFresh', (d, envelope) => (envelope.schemaVersion = 4))), 'invalid_state');
    assert.equal(failureOf(tampered('demoFresh', (d, envelope) => (envelope.schemaVersion = 5))), 'future_version');
  });

  test('the largest stored write sequence still migrates', () => {
    const decoded = decodeValid(tampered('demoFresh', (d, envelope) => (envelope.writeSeq = 2_147_483_647)));
    assert.equal(decoded.writeSeq, 2_147_483_647);
  });
});
