#!/usr/bin/env node
// Her Keys — local backend security harness.
//
// Runs entirely against a disposable LOCAL database. It never contacts a
// remote project: every psql invocation names an explicit local container and
// database, and the CLI is never asked to resolve a linked project.
//
// Three logically separate environments, because the zero-data interlock and
// the post-migration security tests must not share a lifecycle:
//
//   ENV A   empty apply           baseline + Build 4 on an empty surface
//   ENV B1  interlock attack      a protected application table holds a row
//   ENV B2  interlock attack      auth.users holds a row
//   ENV C   post-apply security   migrate while empty, THEN add fixtures
//
// ENV C is never re-migrated after it is populated. A harness that tried to
// would be a harness defect, not a reason to weaken the interlock.
//
//   node supabase/tests/run.mjs            run everything
//   node supabase/tests/run.mjs 60         run one numbered ENV C file

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';

const BASELINE = join(REPO, 'supabase', 'migrations', '20260919230054_build4_baseline.sql');
const BUILD4 = join(REPO, 'supabase', 'migrations', '20260919231500_build4_cloud_schema.sql');
// HK-INTEGRATION-READINESS-01: additive, follows the shipping migration and never edits it.
const IR01 = join(REPO, 'supabase', 'migrations', '20260921120000_ir01_duration_source_and_claim_v3.sql');
const AUTH_STUB = join(HERE, 'helpers', '00-auth-stub.sql');
const TEST_HELPERS = join(HERE, 'helpers', '01-test-helpers.sql');
const TEST_DEFAULTS = join(HERE, 'helpers', '05-test-defaults.sql');
const FIXTURES = join(HERE, 'helpers', '10-fixtures.sql');

let failures = 0;
const results = [];

function psql(db, sql, { expectFailure = false, label = '', tx = false } = {}) {
  try {
    const args = ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1'];
    if (tx) args.push('--single-transaction');
    args.push('-U', 'postgres', '-d', db, '-f', '-');
    const out = execFileSync(
      'docker',
      args,
      { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }
    );
    if (expectFailure) throw new Error(`${label}: expected failure, but the statement succeeded`);
    return { ok: true, out };
  } catch (err) {
    const text = `${err.stdout ?? ''}${err.stderr ?? ''}` || String(err.message);
    if (expectFailure) return { ok: false, out: text };
    throw new Error(`${label || db} failed:\n${text}`);
  }
}

const psqlFile = (db, file, opts) => psql(db, readFileSync(file, 'utf8'), opts);

// The migration opens its OWN transaction (BEGIN first, COMMIT last), because
// the Supabase CLI does not wrap migration files. Nothing here adds one.
const applyBuild4 = (db, opts = {}) => psqlFile(db, BUILD4, opts);
const applyIr01 = (db, opts = {}) => psqlFile(db, IR01, opts);

function admin(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atc', sql],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
}

function recreate(db) {
  admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  admin(`CREATE DATABASE ${db};`);
}

function check(name, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  results.push({ name, status, detail });
  console.log(`  ${condition ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function scalar(db, sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-Atc', sql],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  ).trim();
}

// ---------------------------------------------------------------- ENV A -----
function envA() {
  console.log('\nENV A — empty apply');
  recreate('b4_env_a');
  psqlFile('b4_env_a', AUTH_STUB, { label: 'ENV A auth stub' });
  psqlFile('b4_env_a', TEST_HELPERS, { label: 'helpers' });
  psqlFile('b4_env_a', BASELINE, { label: 'ENV A baseline' });
  applyBuild4('b4_env_a', { label: 'ENV A build4' });
  applyIr01('b4_env_a', { label: 'ENV A ir01' });

  check('ENV A: Build 4 migration applies on an empty surface', true);
  check('ENV A: the additive IR01 migration applies on top of it (fresh install)', true);
  check('ENV A: tasks.duration_source is nullable text with no default (an unstated source is unknown)',
        scalar('b4_env_a', "select data_type || '/' || is_nullable || '/' || coalesce(column_default, 'none') from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='duration_source';") === 'text/YES/none');
  check('ENV A: 34 application tables', scalar('b4_env_a', "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';") === '34');
  // The test-only producer default (helpers/05) must never be in the shipped schema: a writer that does not say where a row came from is refused.
  check('ENV A: the shipped schema gives `producer` NO default on any of the nine synced content tables',
        scalar('b4_env_a', "select count(*) from information_schema.columns where table_schema='public' and column_name='producer' and column_default is not null;") === '0');
  check('ENV A: all nine synced content tables carry `producer`, NOT NULL',
        scalar('b4_env_a', "select count(*) from information_schema.columns where table_schema='public' and column_name='producer' and is_nullable='NO' and table_name in ('household_categories','events','tasks','household_systems','meal_plan_entries','needs_me_items','one_move_records','discovery_records','onboarding_state');") === '9');
  check('ENV A: RLS enabled on every public table', scalar('b4_env_a', "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;") === '0');
  check('ENV A: fail-closed assertion passes', psql('b4_env_a', 'SELECT private.assert_app_schema_secured();').ok);

  // HR-04 atomicity, proven rather than assumed: inject a failure after the
  // restructuring and require a complete rollback. The migration supplies its
  // own BEGIN/COMMIT, so this exercises the real guarantee.
  recreate('b4_env_a_tx');
  psqlFile('b4_env_a_tx', AUTH_STUB, { label: 'ENV A(tx) auth stub' });
  psqlFile('b4_env_a_tx', TEST_HELPERS, { label: 'helpers' });
  psqlFile('b4_env_a_tx', BASELINE, { label: 'ENV A(tx) baseline' });

  // One line, no newline escapes: the migration contains exactly one COMMIT.
  const poisoned = readFileSync(BUILD4, 'utf8').replace('COMMIT;', 'SELECT 1/0; COMMIT;');
  const failed = psql('b4_env_a_tx', poisoned, { expectFailure: true, label: 'ENV A(tx) poisoned build4' });
  check('ENV A: a failure late in the migration aborts it', !failed.ok && /division by zero/.test(failed.out));
  check('ENV A: the failed migration rolled back COMPLETELY — 14 baseline tables intact',
        scalar('b4_env_a_tx', "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';") === '14');
  check('ENV A: the failed migration left no partial uuid re-keying',
        scalar('b4_env_a_tx', "select data_type from information_schema.columns where table_schema='public' and table_name='households' and column_name='id';") === 'text');
}

// ---------------------------------------------------------------- ENV B -----
function envB() {
  console.log('\nENV B — zero-data interlock attack');

  // B1: a protected application table holds a row.
  recreate('b4_env_b1');
  psqlFile('b4_env_b1', AUTH_STUB, { label: 'ENV B1 auth stub' });
  psqlFile('b4_env_b1', TEST_HELPERS, { label: 'helpers' });
  psqlFile('b4_env_b1', BASELINE, { label: 'ENV B1 baseline' });
  psql('b4_env_b1', "INSERT INTO public.households (id) VALUES ('household-1');", { label: 'ENV B1 seed' });

  const b1 = applyBuild4('b4_env_b1', { expectFailure: true, label: 'ENV B1 build4' });
  check('ENV B1: migration ABORTS when a protected table holds a row', !b1.ok);
  check('ENV B1: abort names the offending relation', /public\.households=1/.test(b1.out), (b1.out.match(/public\.\w+=\d+/) ?? [''])[0]);
  check('ENV B1: no partial destructive state — the seeded row survives', scalar('b4_env_b1', 'select count(*) from public.households;') === '1');
  check('ENV B1: no partial destructive state — id is still text', scalar('b4_env_b1', "select data_type from information_schema.columns where table_schema='public' and table_name='households' and column_name='id';") === 'text');

  // B2: auth.users holds a row.
  recreate('b4_env_b2');
  psqlFile('b4_env_b2', AUTH_STUB, { label: 'ENV B2 auth stub' });
  psqlFile('b4_env_b2', TEST_HELPERS, { label: 'helpers' });
  psqlFile('b4_env_b2', BASELINE, { label: 'ENV B2 baseline' });
  psql('b4_env_b2', "INSERT INTO auth.users (id) VALUES ('99999999-9999-4999-8999-999999999999');", { label: 'ENV B2 seed' });

  const b2 = applyBuild4('b4_env_b2', { expectFailure: true, label: 'ENV B2 build4' });
  check('ENV B2: migration ABORTS when auth.users holds a row', !b2.ok);
  check('ENV B2: abort names auth.users', /auth\.users=1/.test(b2.out), (b2.out.match(/auth\.users=\d+/) ?? [''])[0]);
  check('ENV B2: no partial destructive state — 14 baseline tables intact', scalar('b4_env_b2', "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';") === '14');
}

// B3: the interlock over a FOUNDATION table. The eighteen new tables cannot hold a row on a first run, but a
// re-run of the migration over a household that already uses them must still refuse: a row in one of them is
// real data, exactly like a row in `tasks`.
function envB3() {
  console.log('\nENV B3 — interlock re-run over a populated foundation table');
  recreate('b4_env_b3');
  psqlFile('b4_env_b3', AUTH_STUB, { label: 'ENV B3 auth stub' });
  psqlFile('b4_env_b3', TEST_HELPERS, { label: 'helpers' });
  psqlFile('b4_env_b3', BASELINE, { label: 'ENV B3 baseline' });
  applyBuild4('b4_env_b3', { label: 'ENV B3 build4 (while empty)' });
  const uid = 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3';
  psql('b4_env_b3', `
    BEGIN;
    INSERT INTO auth.users (id, email) VALUES ('${uid}', 'b3@local.test');
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${uid}"}';
    SELECT public.bootstrap_account('b3b3b3b3-0000-4000-8000-00000000b3b3'::uuid, 'America/Chicago', NULL);
    RESET ROLE;
    SELECT herkeys_test.ins('goals', jsonb_build_object('household_id', (SELECT household_id FROM public.household_members WHERE profile_id = '${uid}'),
      'profile_id', '${uid}', 'local_id', 'g-b3', 'title', 'A real goal', 'status', 'active'));
    COMMIT;`, { label: 'ENV B3 seed' });
  const again = applyBuild4('b4_env_b3', { expectFailure: true, label: 'ENV B3 re-apply' });
  check('ENV B3: re-running the migration ABORTS when a foundation table holds a row', !again.ok);
  check('ENV B3: the abort names the foundation table', /public\.goals=1/.test(again.out), (again.out.match(/public\.goals=\d+/) ?? [''])[0]);
  check('ENV B3: no partial destructive state — the row survives', scalar('b4_env_b3', 'select count(*) from public.goals;') === '1');
  check('ENV B3: ...and every one of the 34 tables is still there',
        scalar('b4_env_b3', "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';") === '34');
}

// ---------------------------------------------------------------- ENV C -----
function envC(only) {
  console.log('\nENV C — post-apply security environment');
  recreate('b4_env_c');
  psqlFile('b4_env_c', AUTH_STUB, { label: 'ENV C auth stub' });
  psqlFile('b4_env_c', TEST_HELPERS, { label: 'helpers' });
  psqlFile('b4_env_c', BASELINE, { label: 'ENV C baseline' });
  applyBuild4('b4_env_c', { label: 'ENV C build4 (while empty)' });
  applyIr01('b4_env_c', { label: 'ENV C ir01 (while empty)' });
  check('ENV C: migrated while empty, before any fixture exists', true);
  // Test-environment convenience ONLY: see the header of helpers/05-test-defaults.sql.
  psqlFile('b4_env_c', TEST_DEFAULTS, { label: 'ENV C test defaults' });

  psql('b4_env_c', `BEGIN;\n${readFileSync(FIXTURES, 'utf8')}\nCOMMIT;`, { label: 'ENV C fixtures' });
  check('ENV C: identity fixtures created', scalar('b4_env_c', 'select count(*) from public.households;') === '2');

  const files = readdirSync(HERE)
    .filter((f) => /^\d\d-.*\.sql$/.test(f))
    .filter((f) => !only || f.startsWith(only))
    .sort();

  cursorBarrier();

  for (const file of files) {
    console.log(`\n  ${file}`);
    const out = psqlFile('b4_env_c', join(HERE, file), { label: file }).out;
    for (const line of out.split('\n')) {
      const m = line.match(/^\s*(PASS|FAIL)\s*\|\s*(.+?)\s*$/);
      if (m) check(m[2], m[1] === 'PASS');
    }
  }
}

// The snapshot barrier needs two genuinely concurrent sessions: one holding an
// uncommitted write open, the other reading pg_snapshot_xmin. A single psql
// script cannot do that, and this stack runs with max_prepared_transactions = 0,
// so the in-doubt shortcut is unavailable too.
function cursorBarrier() {
  console.log('');
  console.log('  cursor snapshot barrier (two concurrent sessions)');
  const hh = scalar('b4_env_c', "select household_id from public.household_members where role='owner' and profile_id='11111111-1111-4111-8111-111111111111'");
  const cat = scalar('b4_env_c', `select id from public.household_categories where household_id='${hh}' and local_id='cat-kids'`);

  // A real second session opens a transaction, writes, holds it open for a few
  // seconds, then commits by itself. It is self-contained on purpose: this
  // runner is synchronous, so it can never yield to Node's event loop to flush
  // a write into a child's stdin.
  const sql = `BEGIN;
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES ('${hh}','task-inflight','In flight','${cat}',10,'flexible','unplanned','open','household');
SELECT pg_sleep(8);
COMMIT;
`;
  const holder = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'b4_env_c', '-Atq', '-f', '-'],
                       { stdio: ['pipe', 'ignore', 'ignore'] });
  holder.stdin.end(sql);

  const xidOf = () => scalar('b4_env_c',
    "select coalesce(max(backend_xid::text),'') from pg_stat_activity where datname='b4_env_c' and backend_xid is not null and pid <> pg_backend_pid()");

  let inflightXid = '';
  const started = Date.now();
  while (!inflightXid && Date.now() - started < 30000) inflightXid = xidOf();
  check('cursor: a concurrent session holds an uncommitted write open', Boolean(inflightXid), `xid=${inflightXid}`);

  const visibleWhileOpen = scalar('b4_env_c', "select count(*) from public.change_log cl join public.tasks t on t.id=cl.entity_id where t.local_id='task-inflight'");
  check('cursor: an uncommitted write is NOT visible to a pull', visibleWhileOpen === '0');

  const barrier = scalar('b4_env_c', 'select pg_snapshot_xmin(pg_current_snapshot())::text');
  check('cursor: the barrier does NOT advance past the in-flight transaction',
        BigInt(barrier) <= BigInt(inflightXid), `barrier=${barrier} <= inflight=${inflightXid}`);

  // Wait for the holder to settle on its own.
  const waited = Date.now();
  while (xidOf() && Date.now() - waited < 30000) { /* poll */ }

  const visibleAfter = scalar('b4_env_c', "select count(*) from public.change_log cl join public.tasks t on t.id=cl.entity_id where t.local_id='task-inflight'");
  check('cursor: once committed, the previously in-flight write IS delivered - nothing was skipped', visibleAfter === '1');

  const barrierAfter = scalar('b4_env_c', 'select pg_snapshot_xmin(pg_current_snapshot())::text');
  check('cursor: the barrier advances only after the transaction settles',
        BigInt(barrierAfter) > BigInt(inflightXid), `barrier=${barrierAfter} > inflight=${inflightXid}`);
}

// Migration-quality inspection. Reads the shipping migration as text and pins
// the properties that cannot be observed from the applied schema: statement
// ORDER, and the absence of debris.
function migrationQuality() {
  console.log('');
  console.log('  migration quality (static inspection of the shipping file)');
  const sql = readFileSync(BUILD4, 'utf8');
  const at = (needle) => sql.indexOf(needle);

  const guard = at('DO $interlock$');
  const layer1 = at('ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON ROUTINES FROM PUBLIC;');
  // Anchored to the statement, not the word: the header comment mentions it too.
  const lock = sql.search(/^LOCK TABLE$/m);
  const firstDrop = at('DROP TABLE IF EXISTS');
  const firstFn = at('CREATE FUNCTION');
  const assertCall = sql.lastIndexOf('SELECT private.assert_app_schema_secured();');

  check('quality: the zero-data guard is the first executable statement', guard >= 0 && guard < firstDrop && guard < layer1);
  check('quality: LOCK TABLE atomicity guard precedes all destructive DDL', lock > guard && lock < firstDrop);
  check('quality: the global default-privilege revoke runs BEFORE any function is created', layer1 > 0 && layer1 < firstFn);
  const CALL = 'SELECT private.assert_app_schema_secured();';
  check('quality: the migration opens its own transaction (BEGIN first)', /^\s*BEGIN;\s*$/m.test(sql.slice(0, guard)));
  check('quality: the migration closes its own transaction (COMMIT last)', /COMMIT;\s*$/.test(sql));
  check('quality: the fail-closed assertion is the LAST statement before COMMIT',
        assertCall > 0 && sql.slice(assertCall + CALL.length).trim() === 'COMMIT;');

  // The protected list must name all 34 tables plus auth.users.
  const guardBlock = sql.slice(guard, sql.indexOf('$interlock$;', guard));
  const protectedTables = [
    'profiles','households','household_members','household_categories','events','tasks',
    'household_systems','meal_plan_entries','onboarding_state','one_move_records',
    'needs_me_items','discovery_records','discovery_answers','action_records',
    'change_log','account_claims',
    'source_artifacts','interpretations','external_references','behavior_observations','automation_authorities','action_intents','intent_decisions','action_executions','action_outcomes','household_people','responsibilities','dependencies','recurrence_rules','goals','system_steps','capacity_profiles','patterns','evidence_links',
  ];
  const missing = protectedTables.filter((t) => !guardBlock.includes(`'public.${t}'`));
  check('quality: the guard enumerates all 34 application tables', missing.length === 0, missing.join(', ') || 'none missing');
  check('quality: the guard enumerates auth.users', guardBlock.includes("'auth.users'"));

  // Debris.
  const debris = [
    ['TRUNCATE', /\bTRUNCATE\s+(TABLE\s+)?public\./i],
    ['a DELETE of application rows', /^\s*DELETE\s+FROM\s+public\./im],
    ['a synthetic auth user', /INSERT\s+INTO\s+auth\.users/i],
    ['a credential literal', /(password|secret|service_role_key)\s*=\s*'/i],
    ['a design-only header', /NOT AUTHORIZED FOR EXECUTION/],
    ['a zz_ debug object', /\bzz_/],
    // NON-DEFERRABLE contains DEFERRABLE and a hyphen is a word boundary, so a
    // naive \bDEFERRABLE\b matches the very comment stating it is NOT deferrable.
    ['a deferrable constraint', /(?<![-\w])DEFERRABLE\b/i],
  ];
  for (const [label, re] of debris) {
    const hit = re.test(sql);
    check(`quality: the migration contains no ${label}`, !hit);
  }

  // Exactly one Build 4 shipping migration in the tree.
  const migs = readdirSync(join(REPO, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'));
  const after = migs.filter((f) => f.split('_')[0] > '20260919230054');
  check('quality: exactly ONE Build 4 shipping migration plus the ONE additive IR01 repair migration after the baseline',
        after.length === 2 && after[0] === '20260919231500_build4_cloud_schema.sql' && after[1] === '20260921120000_ir01_duration_source_and_claim_v3.sql', after.join(', '));
  check('quality: their timestamps sort strictly after the baseline, in order', after.every((f) => f.split('_')[0] > '20260919230054') && after[0] < after[1], after.join(' < '));
  const ir01Sql = readFileSync(IR01, 'utf8');
  check('quality: the IR01 migration is additive - it drops no table, column or data and rewrites no row',
        !/(^|\n)\s*(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE public\.)/i.test(ir01Sql.replace(/\$fn\$[\s\S]*?\$fn\$/g, '').replace(/--.*$/gm, '')));
  check('quality: the IR01 migration is pinned to LF, so its function digest is the same on every checkout', !ir01Sql.includes(String.fromCharCode(13)));
}

// ------------------------------------------ CLIENT PAYLOAD INTEGRATION ----
/**
 * The other half of the contract.
 *
 * Every other check here hand-writes its payload, which proves the RPC does
 * what it says but not that the APP sends what the RPC expects. This builds a
 * payload with the real `buildClaimPayload` from a real AppState and feeds it
 * to the real RPC, so a drift between the two sides fails here rather than on
 * a device.
 */
async function clientPayloadIntegration() {
  console.log('\n  client payload -> real RPC');

  // The same loader the app's own tests use, so this imports the real modules
  // rather than a copy that could drift from them.
  await import(`file://${join(REPO, 'tests', 'support', 'register-ts.mjs')}`);
  const { buildClaimPayload } = await import(`file://${join(REPO, 'src', 'domain', 'account', 'claim.ts')}`);
  const { createEmptyState } = await import(`file://${join(REPO, 'src', 'state', 'initialState.ts')}`);
  const { emptyTaskFacets } = await import(`file://${join(REPO, 'src', 'domain', 'foundation', 'commitment.ts')}`);
  const userProvenance = { producer: 'user-action', artifactId: null, confidence: null };

  const base = createEmptyState('America/Chicago');
  const state = {
    ...base,
    // child-2 is named by nothing: version 3 must still claim it, or its cloud identity could never exist.
    children: [
      { id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' },
      { id: 'child-2', displayName: 'Theo', birthDate: '2019-01-15', scope: 'child' },
    ],
    tasks: [{
      id: 'task-1', title: 'Return the library books', categoryId: 'cat-home', subjectMemberId: 'child-1',
      durationMinutes: 15, durationSource: 'default', commitment: 'flexible', dueDate: '2026-09-18', plan: { kind: 'day', date: '2026-09-18' },
      notes: null, status: 'completed', completedAt: '2026-09-18T18:00:00.000Z',
      createdAt: '2026-09-17T09:00:00.000Z', updatedAt: '2026-09-18T18:00:00.000Z', ...emptyTaskFacets(), provenance: userProvenance, scope: 'child',
    }],
    needsMe: [{ id: 'needsme-1', title: 'Call the dentist back', status: 'open', dueDate: null, categoryId: null, createdAt: '2026-09-15T08:30:00.000Z', provenance: userProvenance, scope: 'personal' }],
    oneMoves: [
      { id: 'onemove-2026-09-18', forDate: '2026-09-18', targetId: 'task-1', targetType: 'task', status: 'completed', decidedAt: '2026-09-18T12:00:00.000Z', completedAt: '2026-09-18T18:00:00.000Z', provenance: userProvenance, scope: 'personal' },
      { id: 'onemove-2026-09-17', forDate: '2026-09-17', targetId: 'needsme-1', targetType: 'needsMe', status: 'selected', decidedAt: '2026-09-17T12:00:00.000Z', completedAt: null, provenance: userProvenance, scope: 'personal' },
    ],
  };

  const payload = buildClaimPayload(state);
  check('client: buildClaimPayload emits claimPayloadVersion 3', payload.claimPayloadVersion === 3);
  check('client: the closure carries exactly its two targets and the one required category, and EVERY child',
    payload.tasks.length === 1 && payload.needsMeItems.length === 1 && payload.categories.length === 1 && payload.childMembers.length === 2,
    `tasks=${payload.tasks.length} needsMe=${payload.needsMeItems.length} categories=${payload.categories.length} children=${payload.childMembers.length}`);

  const uid = '5c000000-0000-4000-8000-00000000000c';
  psql('b4_env_c', `INSERT INTO auth.users (id, email) VALUES ('${uid}','client@local.test') ON CONFLICT (id) DO NOTHING;`,
    { label: 'client fixture user' });

  const literal = JSON.stringify(payload).replace(/'/g, "''");
  const status = scalar('b4_env_c', `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${uid}"}';
    SELECT public.claim_local_household('5c000000-0000-4000-8000-0000000000c1'::uuid,'America/Chicago','${literal}'::jsonb, NULL) ->> 'status';
    COMMIT;`).split('\n').map((line) => line.trim()).find((line) => line === 'complete' || line === 'rejected');
  check('client: the real RPC accepts the payload the real client builds', status === 'complete', `status=${status}`);

  const shape = scalar('b4_env_c', `
    SELECT (SELECT count(*) FROM public.tasks t JOIN public.household_members m ON m.household_id=t.household_id AND m.profile_id='${uid}' AND m.role='owner')
        || '/' || (SELECT count(*) FROM public.needs_me_items WHERE profile_id='${uid}')
        || '/' || (SELECT count(*) FROM public.one_move_records WHERE profile_id='${uid}')
        || '/' || (SELECT count(*) FROM public.one_move_records WHERE profile_id='${uid}' AND target_task_id IS NOT NULL)
        || '/' || (SELECT count(*) FROM public.one_move_records WHERE profile_id='${uid}' AND target_needs_me_id IS NOT NULL);`);
  check('client: both historical targets resolved to cloud uuids', shape === '1/1/2/1/1', `tasks/needsMe/moves/taskTargets/needsMeTargets = ${shape}`);

  const preserved = scalar('b4_env_c', `
    SELECT t.status || '|' || t.subject_member_type || '|' || (t.completed_at = '2026-09-18T18:00:00Z'::timestamptz)::text
    FROM public.tasks t JOIN public.household_members m ON m.household_id=t.household_id AND m.profile_id='${uid}' AND m.role='owner';`);
  check('client: the completed child-scoped target arrives completed, typed by the server', preserved === 'completed|child|true', preserved);

  const kids = scalar('b4_env_c', `
    SELECT count(*) || '/' || count(*) FILTER (WHERE m.local_id = 'child-2')
    FROM public.household_members m JOIN public.household_members o ON o.household_id = m.household_id AND o.profile_id = '${uid}' AND o.role = 'owner'
    WHERE m.member_type = 'child';`);
  check('client: the child NO closure names was claimed too (version 3)', kids === '2/1', kids);

  const source = scalar('b4_env_c', `
    SELECT t.duration_source || '|' || t.duration_minutes FROM public.tasks t JOIN public.household_members m ON m.household_id=t.household_id AND m.profile_id='${uid}' AND m.role='owner';`);
  check('client: a default duration arrives as a DEFAULT, not as something she said', source === 'default|15', source);
}

// ---------------------------------------------------------------- ENV D -----
/**
 * The upgrade of a POPULATED database.
 *
 * ENV A and C only prove a fresh install. This is the case the audit said the harness never covered: a database that
 * already holds a household, its claim and its tasks, upgraded in place by the additive migration. Nothing may be lost,
 * nothing rewritten, and no existing duration may be promoted to something it never was.
 */
function envD() {
  console.log('\nENV D — additive upgrade of a POPULATED pre-IR01 database');
  const db = 'b4_env_d';
  recreate(db);
  psqlFile(db, AUTH_STUB, { label: 'ENV D auth stub' });
  psqlFile(db, TEST_HELPERS, { label: 'helpers' });
  psqlFile(db, BASELINE, { label: 'ENV D baseline' });
  applyBuild4(db, { label: 'ENV D build4 (while empty)' });

  const uid = 'd1000000-0000-4000-8000-00000000000d';
  const other = 'd2000000-0000-4000-8000-00000000000e';
  psql(db, `INSERT INTO auth.users (id, email) VALUES ('${uid}','d1@local.test'), ('${other}','d2@local.test') ON CONFLICT (id) DO NOTHING;`, { label: 'ENV D users' });

  // A real version 2 claim: the shape a pre-IR01 app sent.
  const v2 = {
    claimPayloadVersion: 2, origin: 'empty',
    childMembers: [{ localId: 'child-1', displayName: 'Mia', birthDate: '2016-04-02' }],
    categories: [{ localId: 'cat-home', producer: 'system-derived', sourceArtifactLocalId: null, confidence: null, name: 'Home', systemRole: 'home', status: 'active', sortOrder: 1, scope: 'household' }],
    tasks: [{
      localId: 'task-1', producer: 'user-action', sourceArtifactLocalId: null, confidence: null, title: 'Return the books', categoryLocalId: 'cat-home',
      subjectMemberLocalId: 'child-1', durationMinutes: 15, commitment: 'flexible', dueDate: null, planKind: 'unplanned', plannedDate: null, plannedStartsAt: null,
      notes: null, status: 'open', completedAt: null, originCreatedAt: '2026-09-17T09:00:00Z', originUpdatedAt: '2026-09-17T09:00:00Z', scope: 'child',
      dueAt: null, earliestStartAt: null, latestFinishAt: null, splittable: null, minChunkMinutes: null, preferredTimeOfDay: null, energyDemand: null, consequence: null,
      needsMePersonally: null, travelMinutesBefore: null, travelMinutesAfter: null, preparationMinutes: null, value: null,
    }],
    needsMeItems: [],
    oneMoves: [{ localId: 'onemove-2026-09-18', producer: 'user-action', sourceArtifactLocalId: null, confidence: null, logicalDay: '2026-09-18', targetType: 'task', targetLocalId: 'task-1', status: 'selected', decidedAt: '2026-09-18T12:00:00Z', completedAt: null }],
    sourceArtifacts: [],
  };
  const claimKey = 'd1000000-0000-4000-8000-0000000000c1';
  const claim = (sub, key, payload) => scalar(db, `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${sub}"}';
    SELECT public.claim_local_household('${key}'::uuid,'America/Chicago','${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb, NULL) ->> 'status';
    COMMIT;`).split('\n').map((line) => line.trim()).find((line) => line === 'complete' || line === 'rejected');
  check('ENV D: a version 2 claim populates the pre-upgrade database', claim(uid, claimKey, v2) === 'complete');

  // More real data the app would have written through ordinary sync: durations of 15 and 30 with NO recorded source.
  psql(db, `
    INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
    SELECT hm.household_id, v.local_id, v.title, c.id, v.minutes, 'flexible', 'unplanned', 'open', 'household', 'user-action'
    FROM public.household_members hm
    JOIN public.household_categories c ON c.household_id = hm.household_id AND c.local_id = 'cat-home'
    CROSS JOIN (VALUES ('task-15','A fifteen',15), ('task-30','A thirty',30)) AS v(local_id, title, minutes)
    WHERE hm.profile_id = '${uid}' AND hm.role = 'owner';`, { label: 'ENV D more tasks' });

  const census = () => scalar(db, `SELECT (SELECT count(*) FROM public.households) || '/' || (SELECT count(*) FROM public.household_members) || '/' || (SELECT count(*) FROM public.tasks) || '/' || (SELECT count(*) FROM public.one_move_records) || '/' || (SELECT count(*) FROM public.account_claims) || '/' || (SELECT count(*) FROM public.household_categories);`);
  const digest = () => scalar(db, "SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)) FROM public.tasks t;");
  const before = { census: census(), tasks: digest() };
  check('ENV D: the database is genuinely populated before the upgrade', /^1\/2\/3\/1\/1\/8$/.test(before.census), before.census);

  // Rollback assumption, proven: dropping the column is possible and loses only the column.
  const probe = scalar(db, "BEGIN; ALTER TABLE public.tasks ADD COLUMN duration_source text; ALTER TABLE public.tasks DROP COLUMN duration_source; SELECT count(*) FROM public.tasks; ROLLBACK;").split('\n').map((l) => l.trim()).find((l) => /^\d+$/.test(l));
  check('ENV D: rollback assumption - adding then dropping the column keeps every row (and is undone by the ROLLBACK here)', probe === '3', probe);

  applyIr01(db, { label: 'ENV D ir01 upgrade' });
  check('ENV D: the additive migration applies to a populated database (no interlock, no abort)', true);

  const after = { census: census() };
  check('ENV D: nothing was lost - every table keeps its row count', after.census === before.census, `${before.census} -> ${after.census}`);
  check('ENV D: no existing row was rewritten (each task is byte-identical apart from the new column)',
        scalar(db, "SELECT md5(string_agg((to_jsonb(t) - 'duration_source')::text, '|' ORDER BY t.id)) FROM public.tasks t;") === before.tasks);
  check('ENV D: EVERY pre-existing task keeps its uncertainty - duration_source is NULL, so the stored 15s are neither "user" nor "default"',
        scalar(db, "SELECT count(*) FILTER (WHERE duration_source IS NULL) || '/' || count(*) FROM public.tasks;") === '3/3');
  check('ENV D: the stored durations themselves are untouched',
        scalar(db, "SELECT string_agg(duration_minutes::text, ',' ORDER BY local_id) FROM public.tasks;") === '15,15,30');
  check('ENV D: the pre-upgrade version 2 claim replays to the same completed answer after the upgrade (idempotent)', claim(uid, claimKey, v2) === 'complete');
  check('ENV D: ...and did not create a second household', scalar(db, 'select count(*) from public.households;') === '1');

  const v3 = JSON.parse(JSON.stringify(v2));
  v3.claimPayloadVersion = 3;
  v3.childMembers.push({ localId: 'child-2', displayName: 'Theo', birthDate: '2019-01-15' });
  v3.tasks[0].durationSource = 'user';
  check('ENV D: a NEW account claims with version 3 on the upgraded database', claim(other, 'd2000000-0000-4000-8000-0000000000c2', v3) === 'complete');
  check('ENV D: ...its unrelated child and its stated duration source landed',
        scalar(db, `SELECT (SELECT count(*) FROM public.household_members m JOIN public.household_members o ON o.household_id=m.household_id AND o.profile_id='${other}' AND o.role='owner' WHERE m.member_type='child')
                       || '/' || (SELECT t.duration_source FROM public.tasks t JOIN public.household_members o ON o.household_id=t.household_id AND o.profile_id='${other}' AND o.role='owner' WHERE t.local_id='task-1');`) === '2/user');
  check('ENV D: RLS is enabled on every public table after the upgrade', scalar(db, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;") === '0');
  check('ENV D: the fail-closed assertion passes on the upgraded database', psql(db, 'SELECT private.assert_app_schema_secured();').ok);
  check('ENV D: no client role gained a privilege it should not have (anon has nothing on the new column)',
        scalar(db, "select count(*) from information_schema.column_privileges where table_schema='public' and table_name='tasks' and column_name='duration_source' and grantee in ('anon','PUBLIC');") === '0');
}

// ------------------------------------------- LOCAL STACK SCHEMA CURRENCY ----
/**
 * The sync journeys talk to the REAL local Supabase stack (real HTTP, real PostgREST), which serves the container's default
 * database, not one of the disposable b4_* ones. That database must carry every migration in supabase/migrations, or the
 * journeys would silently test a stale schema. `supabase db reset` would replay them all, but it is destructive to a database
 * other worktrees share, so the additive IR01 migration is applied directly when it is missing. It only ADDS a nullable column
 * and replaces one function body; it removes and rewrites nothing.
 */
function ensureLocalStackCurrent() {
  const probe = "select count(*) from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='duration_source';";
  if (scalar('postgres', probe) !== '1') {
    console.log('  local stack database predates the IR01 migration: applying the additive migration to it');
    applyIr01('postgres', { label: 'local stack IR01' });
  }
  check('local stack: the database the sync journeys run against carries the additive IR01 migration', scalar('postgres', probe) === '1');
}

// ------------------------------------------------------------------ main ----
const only = process.argv[2];
console.log(`Her Keys local backend harness — container ${CONTAINER} (LOCAL ONLY, no remote project is contacted)`);

// Ad-hoc databases from a manual investigation are dropped here, so a probe
// can never be mistaken later for unexplained local state. Durable evidence
// belongs in this directory, not in a leftover database.
for (const stray of ['b4_probe', 'b4_fp_pre', 'b4_fp_post', 'b4_env_b3']) {
  admin(`DROP DATABASE IF EXISTS ${stray} WITH (FORCE);`);
}

try {
  if (!only) {
    migrationQuality();
    envA();
    envB();
    envB3();
    envD();
  }
  // The Kids journey runs against the local stack's default database, exactly as the composition journey does; it needs no ENV C.
  if (only !== 'kids') envC(only);
  if (!only || only === 'parity') {
    const { authorizationParity } = await import(`file://${join(HERE, 'authorization-parity.mjs')}`);
    await authorizationParity(check, psql);
  }
  if (!only) await clientPayloadIntegration();
  if (only === 'composition') {
    ensureLocalStackCurrent();
    const { productionCompositionJourneys } = await import(`file://${join(HERE, 'journey-composition.mjs')}`);
    await productionCompositionJourneys(check, psql);
  }
  if (only === 'kids') {
    ensureLocalStackCurrent();
    const { kidsJourneys } = await import(`file://${join(HERE, 'journey-kids.mjs')}`);
    await kidsJourneys(check, psql);
  }
  if (!only) {
    ensureLocalStackCurrent();
    const { syncIntegration } = await import(`file://${join(HERE, 'sync-integration.mjs')}`);
    await syncIntegration(check, psql);
    const { productionCompositionJourneys } = await import(`file://${join(HERE, 'journey-composition.mjs')}`);
    await productionCompositionJourneys(check, psql);
    const { kidsJourneys } = await import(`file://${join(HERE, 'journey-kids.mjs')}`);
    await kidsJourneys(check, psql);
  }
} catch (err) {
  console.error(`\nHARNESS ERROR: ${err.message}`);
  process.exit(1);
}

console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
