/**
 * HK-F01-F13 integration, Phase 9 — SYNC REGISTRY RECONCILIATION.
 *
 * Five feature branches each registered their kinds in the same lists; a merge resolution that kept one side's list would drop a
 * sibling's registration silently (that is exactly what HK13-D03 found in the migrations). This file compares every integrated list
 * with every other, and with what the SERVER registers — read from the LAST migration in the chain that declares it, not from any
 * feature's own copy: foundation kinds, pushable kinds, pullable kinds, change-log tables, dependency ranks, claim/adoption, clash
 * handling, tombstones and DOMAIN_INVARIANTS.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { CONTENT_COLLECTIONS } from '../../src/domain/account/claim.ts';
import { FOUNDATION_KIND_NAMES, FOUNDATION_SPECS } from '../../src/domain/sync/foundationSpecs.ts';
import { PUSHABLE_KINDS } from '../../src/domain/sync/syncKinds.ts';
import {
  ALLOWED_OPS, CLOUD_TABLE, CORE_SYNC_KINDS, DEPENDENCY_RANK, IDENTITY_COLUMN, SYNC_ENTITY_KINDS, UPDATABLE_COLUMNS,
} from '../../src/domain/sync/syncTypes.ts';
import { failureFrom } from '../../src/platform/supabaseSyncTransport.ts';
import { FULL_CHAIN, migrationPath } from '../../supabase/tests/migration-chain.mjs';

const sorted = (xs) => [...xs].sort();
const sql = FULL_CHAIN.map((file) => ({ file, text: readFileSync(migrationPath(file), 'utf8').replace(/\r\n/g, '\n') }));
/** The text of the LAST migration in chain order that contains `marker`: what a database built from the chain actually holds. */
const lastDeclaring = (marker) => [...sql].reverse().find((m) => m.text.includes(marker));
const quoted = (text) => [...text.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

describe('[P9-REG] sync registry reconciliation', () => {
  test('the integrated kind inventory is exactly Build 4 + IR01 + F05 + F09-F13: no feature registration disappeared in a merge', () => {
    assert.deepEqual(sorted(CORE_SYNC_KINDS), sorted([
      'member', 'category', 'event', 'task', 'system', 'meal', 'needsMe', 'oneMove', 'discovery', 'onboarding', 'action',
      'lifeRecord', 'lifeRecordLink', // F12
    ]));
    assert.deepEqual(sorted(FOUNDATION_KIND_NAMES), sorted([
      'sourceArtifact', 'interpretation', 'externalReference', 'observation', 'authority', 'intent', 'decision', 'execution', 'outcome',
      'person', 'responsibility', 'dependency', 'recurrence', 'goal', 'systemStep', 'capacity', 'pattern', 'evidenceLink', // Build 4
      'opportunity', // F10
      'rebuildFocus', 'rebuildFocusLink', // F11
      'personContext', 'personTaskLink', // F13
    ]));
    assert.deepEqual(sorted(FOUNDATION_SPECS.map((s) => s.kind)), sorted(FOUNDATION_KIND_NAMES), 'every foundation kind has exactly one manifest entry');
    assert.deepEqual(sorted(SYNC_ENTITY_KINDS), sorted([...CORE_SYNC_KINDS, ...FOUNDATION_KIND_NAMES]));
  });

  test('every kind is registered in EVERY per-kind table: cloud table, identity column, operations, dependency rank', () => {
    for (const kind of SYNC_ENTITY_KINDS) {
      assert.equal(typeof CLOUD_TABLE[kind], 'string', `${kind}: cloud table`);
      assert.equal(typeof IDENTITY_COLUMN[kind], 'string', `${kind}: identity column`);
      assert.ok(Array.isArray(ALLOWED_OPS[kind]), `${kind}: operations`);
      assert.equal(typeof DEPENDENCY_RANK[kind], 'number', `${kind}: dependency rank`);
      if (ALLOWED_OPS[kind].includes('update')) assert.ok(UPDATABLE_COLUMNS[kind]?.length > 0, `${kind}: an updatable kind names what may change`);
    }
    const tables = SYNC_ENTITY_KINDS.map((kind) => CLOUD_TABLE[kind]);
    assert.equal(new Set(tables).size, tables.length, 'one table per kind: a pulled row maps back to exactly one kind');
  });

  test('PUSHABLE: every kind a device creates is on the server\'s sync_push allow-list, and the allow-list names nothing the client does not know', () => {
    const push = lastDeclaring('FUNCTION public.sync_push');
    assert.equal(push.file, '20260922200000_f13_people_os.sql', 'the chain\'s last sync_push is F13\'s');
    const region = push.text.slice(push.text.indexOf('v_owner_col := CASE'), push.text.indexOf('is not a pushable entity table'));
    const columns = new Set(['actor_profile_id', 'profile_id']);
    const allowed = new Set(quoted(region).filter((name) => !columns.has(name)));
    const created = PUSHABLE_KINDS.filter((kind) => ALLOWED_OPS[kind].includes('create') && kind !== 'onboarding').map((kind) => CLOUD_TABLE[kind]);
    assert.deepEqual(created.filter((table) => !allowed.has(table)), [], 'a kind the device creates that the server would refuse as "not a pushable entity table"');
    const known = new Set(Object.values(CLOUD_TABLE));
    assert.deepEqual([...allowed].filter((table) => !known.has(table)), [], 'the server accepts a table no client kind writes');
    const serverOnly = SYNC_ENTITY_KINDS.filter((kind) => ALLOWED_OPS[kind].length === 0);
    assert.deepEqual(sorted(serverOnly), ['execution', 'outcome'], 'only the server-written kinds are never pushed');
    assert.deepEqual(serverOnly.filter((kind) => allowed.has(CLOUD_TABLE[kind])), [], '...and the server refuses them too');
  });

  test('PULLABLE: every kind\'s table is in the change-log CHECK the whole chain leaves behind, so every row a device holds can reach it', () => {
    const log = lastDeclaring('change_log_entity_table_check');
    assert.equal(log.file, '20260922200000_f13_people_os.sql');
    const at = log.text.lastIndexOf('ADD CONSTRAINT change_log_entity_table_check');
    const start = log.text.indexOf('ARRAY[', at);
    // To the end of the ARRAY (its comments hold parentheses), never past it.
    const tables = new Set(quoted(log.text.slice(start, log.text.indexOf(']', start))));
    assert.ok(tables.has('households') && tables.has('person_task_links'), 'the whole list was read');
    const missing = SYNC_ENTITY_KINDS.map((kind) => CLOUD_TABLE[kind]).filter((table) => !tables.has(table));
    assert.deepEqual(missing, [], 'a kind whose rows never reach another device');
  });

  test('DEPENDENCY RANKS: every reference points DOWN the ranks, so a row is never sent before what it names', () => {
    const kindOf = (target) => (target === 'member' ? 'member' : target);
    const problems = [];
    for (const spec of FOUNDATION_SPECS) {
      for (const field of spec.fields) {
        const targets = field.type === 'ref' ? field.kinds : field.type === 'link' ? [field.to] : [];
        for (const target of targets.map(kindOf).filter((k) => SYNC_ENTITY_KINDS.includes(k) && k !== spec.kind)) {
          if (!(DEPENDENCY_RANK[spec.kind] > DEPENDENCY_RANK[target])) problems.push(`${spec.kind} (${DEPENDENCY_RANK[spec.kind]}) -> ${target} (${DEPENDENCY_RANK[target]})`);
        }
      }
    }
    // Core kinds that name other rows: tasks/events/systems/meals name a category and a child; a One Move names its target; a Life
    // Admin link names a record and a Task.
    const core = [['task', 'category'], ['task', 'member'], ['event', 'category'], ['system', 'category'], ['meal', 'category'],
      ['oneMove', 'task'], ['oneMove', 'needsMe'], ['oneMove', 'event'], ['oneMove', 'system'], ['oneMove', 'responsibility'],
      ['lifeRecordLink', 'lifeRecord'], ['lifeRecordLink', 'task'], ['action', 'task'], ['action', 'event']];
    for (const [kind, target] of core) {
      if (!(DEPENDENCY_RANK[kind] > DEPENDENCY_RANK[target])) problems.push(`${kind} (${DEPENDENCY_RANK[kind]}) -> ${target} (${DEPENDENCY_RANK[target]})`);
    }
    assert.deepEqual(problems, []);
  });

  test('CLAIM / ADOPTION: every pushable kind\'s rows count as content, so an interrupted claim is never bootstrapped over (HK13-D09)', () => {
    const collectionOf = (kind) => FOUNDATION_SPECS.find((s) => s.kind === kind)?.collection
      ?? { member: 'children', category: 'categories', event: 'events', task: 'tasks', system: 'systems', meal: 'meals', needsMe: 'needsMe',
        oneMove: 'oneMoves', action: 'actions', lifeRecord: 'lifeRecords', lifeRecordLink: 'lifeRecordLinks' }[kind];
    // Categories are compared against the starters separately; discovery, onboarding and the capacity singleton are tested by field.
    const counted = new Set(CONTENT_COLLECTIONS);
    const special = new Set(['category', 'discovery', 'onboarding', 'capacity']);
    const uncounted = PUSHABLE_KINDS.filter((kind) => !special.has(kind) && !counted.has(collectionOf(kind)));
    assert.deepEqual(uncounted, []);
  });

  test('TOMBSTONES: only Discovery is ever removed, and its table keeps a soft tombstone; every other kind is retired by a status', () => {
    const tombstoned = SYNC_ENTITY_KINDS.filter((kind) => ALLOWED_OPS[kind].includes('tombstone'));
    assert.deepEqual(tombstoned, ['discovery']);
    assert.ok(/CREATE TABLE public\.discovery_records[\s\S]*?deleted_at\s+timestamptz/.test(sql.map((m) => m.text).join('\n')), 'discovery_records carries deleted_at');
  });

  test('DOMAIN_INVARIANTS: each is a real unique rule in the chain, the transport treats it as a competing decision, and the pull reconciles it', () => {
    const invariants = {
      one_move_records_household_profile_logical_day_key: 'oneMove',
      household_categories_household_id_sort_order_key: 'category',
      household_categories_system_role_uq: 'category',
      intent_decisions_one_answer_uq: 'decision',
      intent_decisions_one_withdrawal_uq: 'decision',
      responsibilities_one_live_owner_uq: 'responsibility',
      recurrence_rules_one_active_rule_uq: 'recurrence',
      dependencies_live_edge_uq: 'dependency',
      capacity_profiles_owner_key: 'capacity',
      external_references_identity_key: 'externalReference',
      source_artifacts_digest_uq: 'sourceArtifact',
      system_steps_system_position_key: 'systemStep',
      rebuild_focus_links_live_link_uq: 'rebuildFocusLink',
      person_contexts_one_per_child_uq: 'personContext',
      person_contexts_one_per_person_uq: 'personContext',
    };
    const all = sql.map((m) => m.text).join('\n');
    const clash = readFileSync(new URL('../../src/domain/sync/clash.ts', import.meta.url), 'utf8');
    for (const [name, kind] of Object.entries(invariants)) {
      assert.ok(all.includes(name), `${name} exists in the migration chain`);
      const failure = failureFrom({ code: '23505', message: `duplicate key value violates unique constraint "${name}"`, details: null });
      assert.equal(failure.failure, 'domainConflict', `${name} is a competing decision, not malformed data`);
      // HK13-D29 (P7, documented): the two category rules have no pull-side reconciliation. Unreachable today — no user surface
      // creates or reorders a category (dev tools only) — and recorded for whoever adds one.
      if (kind === 'category') continue;
      assert.ok(clash.includes(`case '${kind}'`), `${name}: the pull reconciles a competing ${kind} (clash.ts)`);
    }
    const other = failureFrom({ code: '23505', message: 'duplicate key value violates unique constraint "some_other_key"', details: null });
    assert.equal(other.failure, 'validation', 'any other uniqueness refusal is a validation failure, not a competing decision');
  });
});
