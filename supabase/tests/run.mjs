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
const AUTH_STUB = join(HERE, 'helpers', '00-auth-stub.sql');
const TEST_HELPERS = join(HERE, 'helpers', '01-test-helpers.sql');
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

  check('ENV A: Build 4 migration applies on an empty surface', true);
  check('ENV A: 16 application tables', scalar('b4_env_a', "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';") === '16');
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

// ---------------------------------------------------------------- ENV C -----
function envC(only) {
  console.log('\nENV C — post-apply security environment');
  recreate('b4_env_c');
  psqlFile('b4_env_c', AUTH_STUB, { label: 'ENV C auth stub' });
  psqlFile('b4_env_c', TEST_HELPERS, { label: 'helpers' });
  psqlFile('b4_env_c', BASELINE, { label: 'ENV C baseline' });
  applyBuild4('b4_env_c', { label: 'ENV C build4 (while empty)' });
  check('ENV C: migrated while empty, before any fixture exists', true);

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

  // The protected list must name all 16 tables plus auth.users.
  const guardBlock = sql.slice(guard, sql.indexOf('$interlock$;', guard));
  const protectedTables = [
    'profiles','households','household_members','household_categories','events','tasks',
    'household_systems','meal_plan_entries','onboarding_state','one_move_records',
    'needs_me_items','discovery_records','discovery_answers','action_records',
    'change_log','account_claims',
  ];
  const missing = protectedTables.filter((t) => !guardBlock.includes(`'public.${t}'`));
  check('quality: the guard enumerates all 16 application tables', missing.length === 0, missing.join(', ') || 'none missing');
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
  check('quality: exactly ONE Build 4 shipping migration after the baseline', after.length === 1, after.join(', '));
  check('quality: its timestamp sorts strictly after the baseline', after[0]?.split('_')[0] > '20260919230054', after[0]);
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

  const base = createEmptyState('America/Chicago');
  const state = {
    ...base,
    children: [{ id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' }],
    tasks: [{
      id: 'task-1', title: 'Return the library books', categoryId: 'cat-home', subjectMemberId: 'child-1',
      durationMinutes: 15, commitment: 'flexible', dueDate: '2026-09-18', plan: { kind: 'day', date: '2026-09-18' },
      notes: null, status: 'completed', completedAt: '2026-09-18T18:00:00.000Z',
      createdAt: '2026-09-17T09:00:00.000Z', updatedAt: '2026-09-18T18:00:00.000Z', scope: 'child',
    }],
    needsMe: [{ id: 'needsme-1', title: 'Call the dentist back', status: 'open', dueDate: null, categoryId: null, createdAt: '2026-09-15T08:30:00.000Z', scope: 'personal' }],
    oneMoves: [
      { id: 'onemove-2026-09-18', forDate: '2026-09-18', targetId: 'task-1', targetType: 'task', status: 'completed', decidedAt: '2026-09-18T12:00:00.000Z', completedAt: '2026-09-18T18:00:00.000Z', scope: 'personal' },
      { id: 'onemove-2026-09-17', forDate: '2026-09-17', targetId: 'needsme-1', targetType: 'needsMe', status: 'selected', decidedAt: '2026-09-17T12:00:00.000Z', completedAt: null, scope: 'personal' },
    ],
  };

  const payload = buildClaimPayload(state);
  check('client: buildClaimPayload emits claimPayloadVersion 1', payload.claimPayloadVersion === 1);
  check('client: the closure carries exactly its two targets and the one required category',
    payload.tasks.length === 1 && payload.needsMeItems.length === 1 && payload.categories.length === 1 && payload.childMembers.length === 1,
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
}

// ------------------------------------------------------------------ main ----
const only = process.argv[2];
console.log(`Her Keys local backend harness — container ${CONTAINER} (LOCAL ONLY, no remote project is contacted)`);

// Ad-hoc databases from a manual investigation are dropped here, so a probe
// can never be mistaken later for unexplained local state. Durable evidence
// belongs in this directory, not in a leftover database.
for (const stray of ['b4_probe', 'b4_fp_pre', 'b4_fp_post']) {
  admin(`DROP DATABASE IF EXISTS ${stray} WITH (FORCE);`);
}

try {
  if (!only) {
    migrationQuality();
    envA();
    envB();
  }
  envC(only);
  if (!only) await clientPayloadIntegration();
  if (!only) {
    const { syncIntegration } = await import(`file://${join(HERE, 'sync-integration.mjs')}`);
    await syncIntegration(check, psql);
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
