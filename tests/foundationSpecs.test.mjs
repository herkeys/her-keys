import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { AppStateSchema } from '../src/domain/state.ts';
import { KIND_CLOUD } from '../src/domain/foundation/typedRef.ts';
import {
  EXISTING_FACETS,
  FOUNDATION_KIND_NAMES,
  FOUNDATION_SPECS,
  PROVENANCE_EXISTING,
  columnsOfSpec,
} from '../src/domain/sync/foundationSpecs.ts';
import { ALLOWED_OPS, CLOUD_TABLE, DEPENDENCY_RANK, SYNC_ENTITY_KINDS, UPDATABLE_COLUMNS } from '../src/domain/sync/syncTypes.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const MIGRATION = readFileSync(join(REPO, 'supabase', 'migrations', '20260919231500_build4_cloud_schema.sql'), 'utf8').replace(/\r\n/g, '\n');

/**
 * THE FOUNDATION MANIFEST HOLDS TOGETHER.
 *
 * `foundationSpecs.ts` is the one description of the eighteen kinds' columns; the migration's generated
 * blocks, the projection and the sync engine's per-kind tables all read it. These tests hold the manifest
 * to the things it must agree with — the local schemas, the migration text, and the push order.
 */

const IMPLICIT = new Set(['id', 'provenance', 'scope', 'createdAt', 'updatedAt', 'householdId']);

describe('the manifest agrees with the local schemas', () => {
  for (const spec of FOUNDATION_SPECS) {
    test(`${spec.kind}: every stored field is described, and nothing is described that is not stored`, () => {
      let inner = AppStateSchema.shape[spec.collection];
      assert.ok(inner, `AppState has no ${spec.collection}`);
      if (inner.def?.type === 'nullable') inner = inner.def.innerType;
      if (inner.def?.type === 'array') inner = inner.def.element;
      const stored = new Set(Object.keys(inner.shape));
      const described = new Set(spec.fields.map((f) => f.local));
      assert.deepEqual([...stored].filter((k) => !described.has(k) && !IMPLICIT.has(k)), [], 'stored but undescribed');
      assert.deepEqual([...described].filter((k) => !stored.has(k)), [], 'described but not stored');
    });
  }

  test('the existing kinds\' facets are exactly the facet fields their local schemas gained', () => {
    const shape = (collection) => AppStateSchema.shape[collection].element.shape;
    const local = { task: shape('tasks'), event: shape('events'), meal: shape('meals'), system: shape('systems') };
    const facetsOnEvent = ['energyDemand', 'consequence', 'needsMePersonally', 'value'];
    for (const [kind, facets] of Object.entries(EXISTING_FACETS)) {
      for (const f of facets) assert.ok(f.local in local[kind], `${kind}.${f.local} is not a local field`);
    }
    assert.deepEqual(EXISTING_FACETS.event.map((f) => f.local), facetsOnEvent);
  });

  test('every one of the nine content kinds carries provenance locally, and states it in the cloud', () => {
    const owners = { category: 'categories', event: 'events', task: 'tasks', system: 'systems', meal: 'meals', needsMe: 'needsMe', oneMove: 'oneMoves', discovery: 'discovery', onboarding: 'onboarding' };
    for (const kind of Object.keys(PROVENANCE_EXISTING)) {
      let node = AppStateSchema.shape[owners[kind]];
      if (node.def?.type === 'nullable') node = node.def.innerType;
      if (node.def?.type === 'array') node = node.def.element;
      assert.ok('provenance' in node.shape, `${kind} has no local provenance`);
    }
  });
});

describe('the manifest agrees with the sync engine', () => {
  test('every foundation kind is a sync kind with a table, an identity and its operations', () => {
    assert.equal(FOUNDATION_SPECS.length, 18);
    assert.deepEqual([...FOUNDATION_SPECS.map((s) => s.kind)].sort(), [...FOUNDATION_KIND_NAMES].sort());
    assert.equal(new Set(FOUNDATION_SPECS.map((s) => s.table)).size, 18, 'no two kinds share a table');
    for (const spec of FOUNDATION_SPECS) {
      assert.ok(SYNC_ENTITY_KINDS.includes(spec.kind));
      assert.equal(CLOUD_TABLE[spec.kind], spec.table);
      const expected = spec.serverWritten ? [] : spec.mutable ? ['create', 'update'] : ['create'];
      assert.deepEqual([...ALLOWED_OPS[spec.kind]], expected, `${spec.kind}: operations follow mutability`);
    }
  });

  test('a client can UPDATE only what the manifest says, and never provenance\'s producer or artifact', () => {
    for (const spec of FOUNDATION_SPECS) {
      const updatable = UPDATABLE_COLUMNS[spec.kind];
      assert.ok(!updatable.includes('producer') && !updatable.includes('source_artifact_id'), `${spec.kind}: producer and artifact are fixed at insert`);
      assert.ok(!updatable.includes('id') && !updatable.includes('revision') && !updatable.includes('household_id') && !updatable.includes('profile_id'));
      if (!spec.mutable || spec.serverWritten) assert.deepEqual(updatable, [], `${spec.kind}: an evidence kind has nothing to update`);
    }
  });

  test('the nine content kinds may move only their confidence out of provenance', () => {
    for (const kind of ['category', 'event', 'task', 'system', 'meal', 'needsMe', 'oneMove', 'discovery', 'onboarding']) {
      assert.ok(UPDATABLE_COLUMNS[kind].includes('confidence'), kind);
      assert.ok(!UPDATABLE_COLUMNS[kind].includes('producer') && !UPDATABLE_COLUMNS[kind].includes('source_artifact_id'), kind);
    }
  });

  test('the migration\'s change log can carry every foundation table, and push can reach every client-written one', () => {
    const changeLog = MIGRATION.slice(MIGRATION.indexOf('change_log_entity_table_check'), MIGRATION.indexOf('change_log_household_id_fkey'));
    const push = MIGRATION.slice(MIGRATION.indexOf('CREATE FUNCTION public.sync_push('), MIGRATION.indexOf('REVOKE ALL ON FUNCTION public.sync_push'));
    for (const spec of FOUNDATION_SPECS) {
      assert.ok(changeLog.includes(`'${spec.table}'`), `${spec.table} is missing from change_log_entity_table_check`);
      if (spec.serverWritten) assert.ok(!push.includes(`'${spec.table}'`), `${spec.table} is server-written and must not be pushable`);
      else assert.ok(push.includes(`'${spec.table}'`), `${spec.table} is missing from the sync_push allow-list`);
    }
  });

  test('typed references agree with the registry: one cloud column per kind, on the table that holds it', () => {
    for (const spec of FOUNDATION_SPECS) {
      const columns = new Set(columnsOfSpec(spec).map((c) => c.name));
      for (const field of spec.fields.filter((f) => f.type === 'ref')) {
        assert.ok(columns.has(`${field.prefix}_type`));
        for (const kind of field.kinds) assert.ok(columns.has(`${field.prefix}_${KIND_CLOUD[kind].column}`), `${spec.kind}.${field.local}: ${kind}`);
      }
    }
  });
});

describe('the reference graph is acyclic, so a push order exists', () => {
  const SELF = new Map(FOUNDATION_SPECS.map((s) => [s.kind, s]));
  const linkKind = (to) => to; // link targets are named by sync kind; `member` (a child) is one since HK-FEATURE-05 / OC-01

  /** Every kind a row of `spec` points at: its links, its typed references, and its provenance's artifact. */
  const dependenciesOf = (spec) => {
    const deps = new Set();
    for (const f of spec.fields) {
      if (f.type === 'link') deps.add(linkKind(f.to));
      if (f.type === 'ref') for (const k of f.kinds) deps.add(k);
    }
    if (spec.provenance === 'standard') deps.add('sourceArtifact');
    deps.delete(spec.kind); // a row may point at an earlier row of its own kind; the pull applies oldest first
    return deps;
  };

  for (const spec of FOUNDATION_SPECS) {
    test(`${spec.kind} ranks after everything it references`, () => {
      for (const dep of dependenciesOf(spec)) {
        assert.ok(dep in DEPENDENCY_RANK, `${dep} has no rank`);
        assert.ok(DEPENDENCY_RANK[spec.kind] > DEPENDENCY_RANK[dep], `${spec.kind} (${DEPENDENCY_RANK[spec.kind]}) must rank after ${dep} (${DEPENDENCY_RANK[dep]})`);
      }
    });
  }

  test('the content kinds that name their source artifact rank after it too', () => {
    for (const kind of ['category', 'event', 'task', 'system', 'meal', 'needsMe', 'oneMove', 'discovery', 'onboarding']) {
      assert.ok(DEPENDENCY_RANK[kind] > DEPENDENCY_RANK.sourceArtifact, kind);
    }
    assert.ok(DEPENDENCY_RANK.oneMove > DEPENDENCY_RANK.responsibility, 'a One Move may name a responsibility');
    assert.ok(DEPENDENCY_RANK.action > DEPENDENCY_RANK.oneMove, 'the ledger keeps its place after One Move');
  });

  test('no two kinds point at each other (the two back-pointers that would have made a cycle are gone)', () => {
    for (const a of FOUNDATION_SPECS) {
      for (const dep of dependenciesOf(a)) {
        const other = SELF.get(dep);
        if (other) assert.ok(!dependenciesOf(other).has(a.kind), `${a.kind} and ${dep} point at each other`);
      }
    }
  });
});

describe('the generated SQL is the manifest, not a hand edit', () => {
  test('the migration matches what the generator emits from the manifest', () => {
    const out = execFileSync(
      process.execPath,
      ['--import', pathToFileURL(join(REPO, 'tests', 'support', 'register-ts.mjs')).href, join(REPO, 'supabase', 'tools', 'gen-foundation-sql.mjs'), '--check'],
      { cwd: REPO, encoding: 'utf8' }
    );
    assert.match(out, /up to date/);
  });

  test('both generated regions exist exactly once', () => {
    for (const name of ['foundation-tables', 'foundation-grants']) {
      assert.equal(MIGRATION.split(`-- >>> GENERATED ${name}`).length - 1, 1, name);
      assert.equal(MIGRATION.split(`-- <<< GENERATED ${name}`).length - 1, 1, name);
    }
  });

  test('every foundation table is created, secured and given a policy', () => {
    for (const spec of FOUNDATION_SPECS) {
      assert.ok(MIGRATION.includes(`CREATE TABLE public.${spec.table} (`), spec.table);
      assert.ok(MIGRATION.includes(`ALTER TABLE public.${spec.table} ENABLE ROW LEVEL SECURITY;`), spec.table);
      assert.ok(MIGRATION.includes(`CREATE POLICY ${spec.table}_select_own ON public.${spec.table}`), spec.table);
      assert.equal(MIGRATION.includes(`CREATE POLICY ${spec.table}_insert_own`), !spec.serverWritten, `${spec.table}: insert policy iff client-written`);
      assert.equal(MIGRATION.includes(`CREATE POLICY ${spec.table}_update_own`), spec.mutable && UPDATABLE_COLUMNS[spec.kind].length > 0, `${spec.table}: update policy iff editable`);
      assert.ok(!/TO (anon|public)\b/i.test(MIGRATION.slice(MIGRATION.indexOf(`CREATE POLICY ${spec.table}_select_own`), MIGRATION.indexOf(`CREATE POLICY ${spec.table}_select_own`) + 400)), `${spec.table}: no anon policy`);
    }
  });

  test('no foundation table is an untyped bag: no jsonb column, and no polymorphic id column', () => {
    for (const spec of FOUNDATION_SPECS) {
      for (const column of columnsOfSpec(spec)) {
        assert.ok(!/jsonb|json\b/i.test(column.sql), `${spec.table}.${column.name} is JSON`);
        assert.ok(!/^(target_id|object_id|entity_id|subject_id|ref_id|about_id)$/.test(column.name), `${spec.table}.${column.name} is a bare polymorphic id`);
      }
    }
  });
});
