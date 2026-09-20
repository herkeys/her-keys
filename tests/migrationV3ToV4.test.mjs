import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, test } from 'node:test';
import { isUserStated } from '../src/domain/foundation/provenance.ts';
import { promoteConfidence } from '../src/domain/reasoning/confidence.ts';
import { AppStateSchema } from '../src/domain/state.ts';
import { CURRENT_SCHEMA_VERSION, decodeStoredState, encodeStoredState } from '../src/persistence/envelope.ts';
import { isValidV3AppState } from '../src/persistence/legacySchemasV3.ts';
import { classifyV3Row } from '../src/persistence/migrateV3ToV4.ts';
import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import { UNKNOWN_FACET, V4_ROOTS, V4_ROW_ADDITIONS } from './support/legacyShapes.mjs';

/**
 * B4-FE01-029 — v3 -> v4, proven against byte-exact v3 envelopes.
 *
 * The fixtures under `tests/fixtures/v3` were written by the v3 code at the entry
 * head (32b1601), not hand-built. The manifest pins their SHA-256, so the first
 * test below fails if anyone edits history to make a migration pass
 * (Addendum 02 B10). If a case here fails, the MIGRATION is what is wrong.
 */

const DIR = new URL('./fixtures/v3/', import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8'));
const NAMES = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'manifest.json').sort();

const raw = (file) => readFileSync(new URL(file, DIR), 'utf8');
const envelope = (file) => JSON.parse(raw(file));
const decode = (file) => {
  const decoded = decodeStoredState(raw(file));
  assert.equal(decoded.kind, 'valid', `${file}: ${JSON.stringify(decoded).slice(0, 300)}`);
  return decoded;
};
const producers = (rows) => rows.map((row) => row.provenance.producer);
const REQUIRED = [
  'fresh-empty', 'real-populated', 'claimed', 'sync-active', 'pending-queue', 'unresolved-conflict',
  'legacy-catalog-remediated', 'real-with-actions', 'one-move-states', 'real-child-scoped', 'demo', 'auth-degraded',
  'unstamped-legacy-rows',
];

/** The collections that carry provenance in v4. */
const STAMPED = ['categories', 'events', 'tasks', 'systems', 'meals', 'needsMe', 'oneMoves'];

/**
 * Structural losslessness, independent of the migration's own logic: every field a v3
 * row had is still there and equal, and the only addition is `provenance`. The event
 * `source` flag is the one deliberate retirement — it is subsumed by provenance.
 */
function assertLossless(before, after, label, { retired = [], collection }) {
  const beforeKeys = Object.keys(before).filter((key) => !retired.includes(key));
  for (const key of beforeKeys) assert.deepEqual(after[key], before[key], `${label}.${key} was not carried across intact`);
  // v4 may add exactly the fields it declared for this kind: provenance, plus facets that read as "not known".
  const added = Object.keys(after).filter((key) => !(key in before)).sort();
  assert.deepEqual(added, [...V4_ROW_ADDITIONS[collection]].sort(), `${label}: v4 added something it did not declare`);
  for (const key of added.filter((k) => k !== 'provenance')) {
    assert.equal(after[key], UNKNOWN_FACET(key), `${label}.${key}: a new facet must be honestly unknown, never a guess`);
  }
  assert.ok(after.provenance && typeof after.provenance.producer === 'string', `${label} carries provenance`);
}

describe('v3 fixtures are frozen and genuinely v3', () => {
  test('every required v3 shape has a fixture, and the manifest matches the files on disk', () => {
    assert.deepEqual(NAMES.map((n) => n.replace(/\.json$/, '')), [...REQUIRED].sort());
    assert.deepEqual(Object.keys(MANIFEST.fixtures).sort(), NAMES);
  });

  test('no fixture has been altered: the SHA-256 of each file is the one recorded when the v3 code wrote it', () => {
    for (const name of NAMES) {
      const digest = createHash('sha256').update(readFileSync(new URL(name, DIR))).digest('hex');
      assert.equal(digest, MANIFEST.fixtures[name].sha256, `${name} was edited — fix the migration, never the fixture`);
    }
  });

  test('each is a v3 envelope whose data passes the FROZEN v3 schema — and fails the live v4 one', () => {
    for (const name of NAMES) {
      const env = envelope(name);
      assert.equal(env.schemaVersion, 3, name);
      assert.equal(isValidV3AppState(env.data), true, `${name}: not what v3 actually was`);
      assert.equal(AppStateSchema.safeParse(env.data).success, false, `${name}: must not already satisfy v4`);
    }
  });
});

describe('every v3 fixture migrates losslessly to v4', () => {
  for (const name of REQUIRED) {
    const file = `${name}.json`;

    test(`${name}: decodes valid at v4, keeps its write sequence and identity, and every row survives intact`, () => {
      const env = envelope(file);
      const decoded = decode(file);

      assert.equal(decoded.migratedFrom, 3);
      assert.equal(decoded.writeSeq, env.writeSeq, 'the write sequence continues from disk');
      // Identity is the envelope's, and the data migration never touches it: binding, claim receipt,
      // quarantine, and the whole sync namespace — queue, cursor, mappings, evidence, device id.
      assert.deepEqual(decoded.identity, env.identity ?? UNBOUND_IDENTITY, 'account binding and sync namespace preserved verbatim');

      for (const collection of STAMPED) {
        assert.equal(decoded.state[collection].length, env.data[collection].length, `${name}.${collection} row count`);
        decoded.state[collection].forEach((row, i) =>
          assertLossless(env.data[collection][i], row, `${name}.${collection}[${i}]`, { collection, retired: collection === 'events' ? ['source'] : [] })
        );
      }
      for (const collection of ['children', 'actions', 'migrationEvidence']) {
        assert.deepEqual(decoded.state[collection], env.data[collection], `${name}.${collection} must be untouched (they carry no v4 field)`);
      }
      assert.deepEqual(decoded.state.household, env.data.household);
      assert.deepEqual(decoded.state.user, env.data.user);
      assert.equal(decoded.state.origin, env.data.origin);
      if (env.data.discovery === null) assert.equal(decoded.state.discovery, null);
      else assertLossless(env.data.discovery, decoded.state.discovery, `${name}.discovery`, { collection: 'discovery' });
      assertLossless(env.data.onboarding, decoded.state.onboarding, `${name}.onboarding`, { collection: 'onboarding' });

      // Every root v4 introduced starts empty: nothing pre-existing can have arrived from an artifact, an external
      // system, a delegation or an authority, so none is inferred.
      for (const root of V4_ROOTS.filter((r) => r !== 'migrationLineage')) {
        assert.deepEqual(decoded.state[root], root === 'capacity' ? null : [], `${name}.${root} starts empty`);
      }
    });

    test(`${name}: migration lineage accounts for every classified row exactly once, and is recorded apart from the rows`, () => {
      const env = envelope(file);
      const { state } = decode(file);
      assert.equal(state.migrationLineage.length, 1);
      const [lineage] = state.migrationLineage;
      assert.deepEqual([lineage.kind, lineage.fromSchemaVersion, lineage.toSchemaVersion], ['provenance-backfill', 3, 4]);

      const expected = { discovery: env.data.discovery === null ? 0 : 1, onboarding: 1 };
      for (const collection of STAMPED) expected[collection] = env.data[collection].length;
      for (const [collection, count] of Object.entries(expected)) {
        const tallied = lineage.tallies.filter((t) => t.collection === collection).reduce((sum, t) => sum + t.count, 0);
        assert.equal(tallied, count, `${name}.${collection}: every row is tallied once`);
      }
      // Migration is lineage, never a producer.
      for (const collection of [...STAMPED, 'discovery', 'onboarding']) {
        const rows = Array.isArray(state[collection]) ? state[collection] : state[collection] === null ? [] : [state[collection]];
        for (const row of rows) assert.ok(!/migrat/i.test(row.provenance.producer), `${name}: a row was stamped "${row.provenance.producer}"`);
      }
    });

    test(`${name}: re-encoding reads back identical and is not migrated a second time`, () => {
      const first = decode(file);
      const rewritten = encodeStoredState(first.state, { appVersion: 't', savedAt: '2026-09-19T12:00:00.000Z', writeSeq: first.writeSeq + 1, identity: first.identity });
      assert.equal(JSON.parse(rewritten).schemaVersion, CURRENT_SCHEMA_VERSION);
      const second = decodeStoredState(rewritten);
      assert.equal(second.kind, 'valid');
      assert.equal(second.migratedFrom, null);
      assert.deepEqual(second.state, first.state);
      assert.deepEqual(second.identity, first.identity);
    });
  }
});

describe('the backfill attributes only what v3 can PROVE', () => {
  test('a fresh household: the eight starters are system-derived and the intake record is onboarding — nothing is hers yet', () => {
    const { state } = decode('fresh-empty.json');
    assert.deepEqual(producers(state.categories), Array(8).fill('system-derived'));
    assert.equal(state.onboarding.provenance.producer, 'onboarding');
    const lineage = state.migrationLineage[0];
    assert.deepEqual(
      lineage.tallies.map((t) => [t.collection, t.producer, t.rule, t.count]),
      [['categories', 'system-derived', 'starter-set', 8], ['onboarding', 'onboarding', 'intake-flow', 1]]
    );
  });

  test('a real user-populated household: what she made stays hers, and a rename or archive does not change who made a row', () => {
    const { state } = decode('real-populated.json');
    assert.ok(state.tasks.length === 5 && state.tasks.every((t) => t.provenance.producer === 'user-action'));
    assert.ok(state.tasks.every((t) => t.createdAt !== null), 'attributed BECAUSE the capture stamp proves it, not because of the entity type');
    assert.ok(state.events.every((e) => e.provenance.producer === 'user-action'));
    assert.ok(state.needsMe.every((n) => n.provenance.producer === 'user-action'));

    const byName = (name) => state.categories.find((c) => c.name === name);
    assert.equal(byName('Pets').provenance.producer, 'user-action', 'a category she added is hers');
    assert.equal(byName('Family').systemRole, 'kids');
    assert.equal(byName('Family').provenance.producer, 'system-derived', 'renaming a starter does not make it hers');
    assert.equal(state.categories.find((c) => c.id === 'cat-meals').status, 'archived');
    assert.equal(state.categories.find((c) => c.id === 'cat-meals').provenance.producer, 'system-derived', 'archiving does not either');

    assert.equal(state.oneMoves[0].provenance.producer, 'system-derived', 'the engine chose it; she did not capture it');
    assert.equal(state.discovery.provenance.producer, 'talk-it-out');
    assert.equal(state.onboarding.provenance.producer, 'onboarding');
    assert.ok(state.tasks.some((t) => t.status === 'completed') && state.tasks.some((t) => t.status === 'archived'), 'history is preserved, not just open rows');
  });

  test('a real household with pre-Build-3 leftovers: unprovable rows are LEGACY/UNKNOWN, provable ones are not demoted', () => {
    const { state } = decode('unstamped-legacy-rows.json');
    const task = (id) => state.tasks.find((t) => t.id === id);

    assert.equal(task('task-legacy-1').provenance.producer, 'legacy-unknown', 'createdAt is null: no capture ever stamped it');
    assert.equal(task('task-legacy-2').provenance.producer, 'legacy-unknown');
    const hers = state.tasks.find((t) => t.title === 'A task she really added');
    assert.equal(hers.provenance.producer, 'user-action', 'a genuinely captured task in the SAME household keeps its attribution — no mass demotion');

    assert.equal(state.events[0].provenance.producer, 'demo-seed', 'the stored v1->v2 demo flag is preserved as demo, even in a real household');
    assert.equal(state.systems[0].provenance.producer, 'legacy-unknown', 'no production create path ever existed, so it cannot be attributed');
    assert.equal(state.meals[0].provenance.producer, 'legacy-unknown');
  });

  test('legacy-unknown is conservative everywhere: it is not user-stated and it can never lower a promotion threshold', () => {
    const { state } = decode('unstamped-legacy-rows.json');
    const unknown = state.tasks.find((t) => t.provenance.producer === 'legacy-unknown');
    assert.equal(isUserStated(unknown.provenance.producer), false);
    assert.equal(unknown.provenance.confidence, null, 'no level is invented for a row nobody can vouch for');
    // One corroboration would promote a user-stated claim; it must not promote an unknown one.
    assert.equal(promoteConfidence('possible', { source: unknown.provenance.producer, corroborations: 1, userConfirmed: false }), 'possible');
    assert.equal(promoteConfidence('possible', { source: 'user-action', corroborations: 1, userConfirmed: false }), 'likely');
  });

  test('a demo household is classified as a whole: every row is demo-seed, whoever typed it', () => {
    const { state } = decode('demo.json');
    for (const collection of ['categories', 'events', 'tasks', 'systems', 'meals', 'oneMoves']) {
      assert.ok(state[collection].length > 0 && state[collection].every((r) => r.provenance.producer === 'demo-seed'), collection);
    }
    assert.equal(state.onboarding.provenance.producer, 'demo-seed');
    assert.equal(state.origin, 'demo');
  });

  test('One Move history keeps every status it had, and each record is system-derived', () => {
    const { state } = decode('one-move-states.json');
    assert.deepEqual(state.oneMoves.map((o) => o.status), ['completed', 'selected', 'withheld']);
    assert.deepEqual(state.oneMoves.map((o) => o.targetType), ['task', 'needsMe', 'task']);
    assert.deepEqual(producers(state.oneMoves), Array(3).fill('system-derived'));
  });

  test('child-scoped state keeps its children, subjects and scope intact', () => {
    const { state } = decode('real-child-scoped.json');
    assert.equal(state.children.length, 2);
    const form = state.tasks.find((t) => t.title === 'Sign the field trip form');
    assert.deepEqual([form.scope, form.subjectMemberId, form.provenance.producer], ['child', 'child-1', 'user-action']);
    assert.equal(state.events.find((e) => e.title === "Ben's dentist").subjectMemberId, 'child-2');
  });

  test('the action ledger is untouched: it already stores its own durable provenance', () => {
    const env = envelope('real-with-actions.json');
    const { state } = decode('real-with-actions.json');
    assert.equal(state.actions.length, 1);
    assert.deepEqual(state.actions, env.data.actions);
    assert.deepEqual([state.actions[0].actor, state.actions[0].source], ['user', 'her_keys_recommendation']);
    assert.ok(!('provenance' in state.actions[0]), 'a ledger row is not stamped: it is immutable and already records who decided');
  });

  test('OR-002 migration evidence is carried verbatim, and lineage does not merge into it', () => {
    const env = envelope('legacy-catalog-remediated.json');
    const { state } = decode('legacy-catalog-remediated.json');
    assert.equal(env.data.migrationEvidence.length, 2);
    assert.deepEqual(state.migrationEvidence, env.data.migrationEvidence);
    assert.equal(state.migrationLineage.length, 1, 'lineage is its own record');
    assert.equal(state.oneMoves.length, 0);
  });

  test('identity-bearing fixtures keep their sync state: queue, cursor, mappings, evidence and device id all survive', () => {
    for (const name of ['claimed', 'sync-active', 'pending-queue', 'unresolved-conflict']) {
      const env = envelope(`${name}.json`);
      const { identity } = decode(`${name}.json`);
      assert.deepEqual(identity.sync, env.identity.sync, `${name}: namespace`);
      assert.deepEqual(identity.binding, env.identity.binding, `${name}: binding`);
    }
    assert.equal(decode('pending-queue.json').identity.sync.queue.length, 3);
    const conflicted = decode('unresolved-conflict.json').identity.sync;
    assert.equal(conflicted.evidence.filter((e) => !e.resolved).length, 2, 'unresolved intent is never discarded');
    assert.equal(decode('sync-active.json').identity.sync.cursor, '48213');

    const degraded = decode('auth-degraded.json').identity;
    assert.equal(degraded.binding, null);
    assert.equal(degraded.quarantine.accountId, '22222222-2222-4222-8222-222222222222');
    assert.equal(degraded.receipt.rejectedReason, 'superseded_by_cloud');
    assert.equal(degraded.sync, null);
  });
});

describe('the classification rules', () => {
  test('a demo household dominates every rule', () => {
    for (const collection of ['categories', 'events', 'tasks', 'needsMe', 'oneMoves', 'discovery', 'onboarding', 'systems', 'meals']) {
      assert.equal(classifyV3Row(collection, {}, 'demo').producer, 'demo-seed', collection);
    }
  });

  test('no rule attributes a row to the user without a durable proof, and none ever answers "migration"', () => {
    const attributed = [];
    for (const collection of ['categories', 'events', 'tasks', 'needsMe', 'oneMoves', 'discovery', 'onboarding', 'systems', 'meals']) {
      const rows = [{}, { createdAt: null, systemRole: null, source: 'user' }, { createdAt: '2026-09-16T10:00:00.000Z', systemRole: null, source: 'user' }, { systemRole: 'kids', source: 'demo', createdAt: null }];
      for (const row of rows) {
        const result = classifyV3Row(collection, row, 'empty');
        assert.ok(!/migrat/i.test(result.producer));
        assert.match(result.rule, /^[a-z][a-z0-9-]*$/, 'every answer carries the rule that justified it');
        if (result.producer === 'user-action') attributed.push(`${collection}:${result.rule}`);
      }
    }
    // Every user attribution is tied to a named proof: a stored field, or a single write path.
    assert.deepEqual([...new Set(attributed)].sort(), [
      'categories:role-less-category-added-by-user',
      'events:stored-user-flag',
      'needsMe:written-only-by-needs-me-capture',
      'tasks:created-at-stamped-by-capture',
    ]);
  });
});
