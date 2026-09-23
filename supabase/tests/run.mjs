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
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADDITIVE_CHAIN, BASELINE as BASELINE_FILE, SHIPPING, WAVE3_BASE_SHA256, additive, migrationPath } from './migration-chain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';
// Harness database names. They are fixed per container, so two sessions running this harness at once drop each other's
// databases mid-run. HERKEYS_HARNESS_DB_PREFIX (default b4: the names are unchanged) gives a parallel session names of its own;
// with a non-default prefix the journeys' private API stack takes its own names too (HK-FEATURE-12).
const DB_PREFIX = process.env.HERKEYS_HARNESS_DB_PREFIX ?? 'b4';
if (!/^[a-z][a-z0-9]{0,11}$/.test(DB_PREFIX)) throw new Error(`HERKEYS_HARNESS_DB_PREFIX must be a short lowercase name, got ${DB_PREFIX}`);
const dbName = (name) => `${DB_PREFIX}_${name}`;
if (DB_PREFIX !== 'b4') {
  process.env.HERKEYS_PRIVATE_DB = process.env.HERKEYS_PRIVATE_DB ?? `${DB_PREFIX}_stack`;
  process.env.HERKEYS_PRIVATE_REST_NAME = process.env.HERKEYS_PRIVATE_REST_NAME ?? `${DB_PREFIX}_postgrest`;
}

// Every migration file comes from ONE ordered chain (migration-chain.mjs), shared with the private stack and the feature runners.
const BASELINE = migrationPath(BASELINE_FILE);
const BUILD4 = migrationPath(SHIPPING);
// HK-INTEGRATION-READINESS-01: additive, follows the shipping migration and never edits it.
const IR01 = migrationPath(additive('IR01').file);
// HK-FEATURE-08-MEALS: additive, follows IR01 and never edits it. meal_plan_entries gains meal_slot and status.
const F08 = migrationPath(additive('F08').file);
// HK-FEATURE-05 closeout repair (OC-01): additive, follows F08 and never edits it.
const F05 = migrationPath(additive('F05').file);
// HK-FEATURE-09 (Money): additive, follows F05. tasks gains payment_mechanism. (Never registered here before the F01-F13 integration.)
const F09 = migrationPath(additive('F09').file);
// HK-FEATURE-10 (Work / Career): additive, follows F09. career_opportunities, and dependencies gains opportunity endpoints.
const F10 = migrationPath(additive('F10').file);
// HK-FEATURE-11 (Me / Rebuild): additive, follows F10. rebuild_focuses and rebuild_focus_links.
const F11 = migrationPath(additive('F11').file);
// HK-FEATURE-12 (Life Admin / Documents): additive, follows F11. Two owner-private tables.
const F12 = migrationPath(additive('F12').file);
// HK-FEATURE-13 (People OS): additive, follows F12. Two owner-private tables.
const F13 = migrationPath(additive('F13').file);
/** The seven tables Features 10-13 add. After the WHOLE chain, every one must still be pushable and loggable. */
const FEATURE_TABLES = ['career_opportunities', 'rebuild_focuses', 'rebuild_focus_links', 'life_records', 'life_record_task_links', 'person_contexts', 'person_task_links'];
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
const applyF08 = (db, opts = {}) => psqlFile(db, F08, opts);
const applyF05 = (db, opts = {}) => psqlFile(db, F05, opts);
const applyF09 = (db, opts = {}) => psqlFile(db, F09, opts);
const applyF10 = (db, opts = {}) => psqlFile(db, F10, opts);
const applyF11 = (db, opts = {}) => psqlFile(db, F11, opts);
const applyF12 = (db, opts = {}) => psqlFile(db, F12, opts);
const applyF13 = (db, opts = {}) => psqlFile(db, F13, opts);
/** Every additive migration after the shipping one, in chain order: what a FRESH install applies after Build 4. */
const applyAdditiveChain = (db, env) => {
  for (const m of ADDITIVE_CHAIN) psqlFile(db, migrationPath(m.file), { label: `${env} ${m.label}` });
};

/**
 * After the WHOLE chain: the LATEST sync_push still names every feature table and the LATEST change-log check still accepts every one.
 * Each additive migration re-declares both; before the F01-F13 integration each re-declaration held only its own tables, so the
 * migration applied last silently dropped every sibling's (INT13-01). Read from the live catalog, not from the files.
 */
function chainRegistrations(db, env) {
  const push = scalar(db, "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_push';");
  const log = scalar(db, "select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname='change_log_entity_table_check';");
  const missingPush = FEATURE_TABLES.filter((t) => !push.includes(`'${t}'`));
  const missingLog = FEATURE_TABLES.filter((t) => !log.includes(`'${t}'`));
  check(`${env}: after the whole chain, sync_push still names EVERY feature table (no later migration dropped an earlier one's)`, missingPush.length === 0, missingPush.join(', ') || 'all seven');
  check(`${env}: ...and the change-log check still accepts every one`, missingLog.length === 0, missingLog.join(', ') || 'all seven');
}

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
  recreate(dbName('env_a'));
  psqlFile(dbName('env_a'), AUTH_STUB, { label: 'ENV A auth stub' });
  psqlFile(dbName('env_a'), TEST_HELPERS, { label: 'helpers' });
  psqlFile(dbName('env_a'), BASELINE, { label: 'ENV A baseline' });
  applyBuild4(dbName('env_a'), { label: 'ENV A build4' });
  applyAdditiveChain(dbName('env_a'), 'ENV A');

  check('ENV A: Build 4 migration applies on an empty surface', true);
  check(`ENV A: every additive migration of the chain applies in order on top of it (fresh install: ${ADDITIVE_CHAIN.map((m) => m.owner).join(' -> ')})`, true);
  chainRegistrations(dbName('env_a'), 'ENV A');
  check('ENV A: tasks.payment_mechanism (F09) is nullable text with no default, and its CHECK admits only manual/autopay',
        scalar(dbName('env_a'), "select data_type || '/' || is_nullable || '/' || coalesce(column_default, 'none') from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='payment_mechanism';") === 'text/YES/none'
        && /manual.*autopay/.test(scalar(dbName('env_a'), "select pg_get_constraintdef(oid) from pg_constraint where conname='tasks_payment_mechanism_check';")));
  check('ENV A: career_opportunities (F10) is owner-private: RLS on, owner-only SELECT/INSERT/UPDATE policies, no DELETE, anon/PUBLIC hold nothing',
        scalar(dbName('env_a'), "select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname='public' and tablename='career_opportunities';") === 'INSERT,SELECT,UPDATE'
        && scalar(dbName('env_a'), "select count(*) from pg_policies where schemaname='public' and tablename='career_opportunities' and coalesce(qual, with_check) not like '%profile_id%';") === '0'
        && scalar(dbName('env_a'), "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='career_opportunities' and ((privilege_type = 'DELETE' and grantee = 'authenticated') or grantee in ('anon','PUBLIC'));") === '0');
  check('ENV A: dependencies (F10) gained exactly the two opportunity endpoints, each with a same-owner foreign key to career_opportunities',
        scalar(dbName('env_a'), "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='dependencies' and column_name like '%opportunity%';") === 'from_opportunity_id,to_opportunity_id'
        && scalar(dbName('env_a'), "select count(*) from pg_constraint where conrelid='public.dependencies'::regclass and contype='f' and confrelid='public.career_opportunities'::regclass and array_length(conkey, 1) = 3;") === '2');
  check('ENV A: the additive F12 migration (Life Admin records) applies on top of all of them (fresh install)', true);
  check('ENV A: the F12 tables are owner-private: RLS on, no delete policy, anon holds nothing, scope pinned to personal',
        scalar(dbName('env_a'), "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('life_records','life_record_task_links') and c.relrowsecurity;") === '2'
        && scalar(dbName('env_a'), "select count(*) from pg_policies where schemaname='public' and tablename in ('life_records','life_record_task_links') and cmd='DELETE';") === '0'
        && scalar(dbName('env_a'), "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in ('life_records','life_record_task_links') and grantee in ('anon','PUBLIC');") === '0'
        && scalar(dbName('env_a'), "select count(*) from pg_constraint where conname in ('life_records_scope_check','life_record_task_links_scope_check');") === '2');
  check('ENV A: the F12 link guard runs as the CALLER (SECURITY INVOKER), pinned to an empty search_path, not executable by anon',
        scalar(dbName('env_a'), "select (not p.prosecdef)::text || '/' || coalesce(array_to_string(p.proconfig, ','), 'none') || '/' || has_function_privilege('anon', p.oid, 'EXECUTE')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='guard_life_record_task_link';") === 'true/search_path=""/false');
  check('ENV A: the additive F13 migration (People OS) applies on top of all of them (fresh install)', true);
  check('ENV A: F13 left sync_push SECURITY INVOKER, and its follow-up guard is an invoker trigger function nobody may EXECUTE',
        scalar(dbName('env_a'), "select string_agg(p.proname || '=' || (not p.prosecdef)::text || '/' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('sync_push','guard_follow_up_task');")
          === 'guard_follow_up_task=true/false,sync_push=true/true');
  check('ENV A: F13 gave the client NO table-level INSERT, UPDATE or DELETE on its tables (named columns only; links never updatable)',
        scalar(dbName('env_a'), "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in ('person_contexts','person_task_links') and grantee in ('authenticated','anon','PUBLIC') and privilege_type <> 'SELECT';") === '0'
        && scalar(dbName('env_a'), "select count(*) from information_schema.column_privileges where table_schema='public' and table_name='person_task_links' and grantee='authenticated' and privilege_type='UPDATE';") === '0');
  check('ENV A: the additive IR01 migration applies on top of it (fresh install)', true);
  check('ENV A: the additive F08 migration applies on top of IR01 (fresh install)', true);
  check('ENV A: meal_plan_entries.meal_slot and .status are text NOT NULL defaulting to unspecified and active (a legacy row is a live plan with no stated slot)',
        scalar(dbName('env_a'), "select string_agg(column_name || '=' || data_type || '/' || is_nullable || '/' || column_default, ';' order by column_name) from information_schema.columns where table_schema='public' and table_name='meal_plan_entries' and column_name in ('meal_slot','status');") === "meal_slot=text/NO/'unspecified'::text;status=text/NO/'active'::text");
  check('ENV A: the additive F05 migration (a child after binding) applies on top of both (fresh install)', true);
  check('ENV A: private.push_household_child is SECURITY DEFINER, pinned to an empty search_path, and NOT executable by anon or PUBLIC',
        scalar(dbName('env_a'), "select p.prosecdef::text || '/' || coalesce(array_to_string(p.proconfig, ','), 'none') || '/' || has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='push_household_child';") === 'true/search_path=""/false/true');
  check('ENV A: public.sync_push is STILL SECURITY INVOKER after the F05 replacement (every other table is still written as the caller)',
        scalar(dbName('env_a'), "select (not prosecdef)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_push';") === 'true');
  check('ENV A: household_members gained NO client write grant (a child is written only through the function)',
        scalar(dbName('env_a'), "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='household_members' and grantee='authenticated' and privilege_type <> 'SELECT';") === '0'
        && scalar(dbName('env_a'), "select count(*) from information_schema.column_privileges where table_schema='public' and table_name='household_members' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE');") === '0');
  check('ENV A: household_members gained NO write policy (still exactly one policy, the SELECT one)',
        scalar(dbName('env_a'), "select count(*) || '/' || string_agg(cmd, ',') from pg_policies where schemaname='public' and tablename='household_members';") === '1/SELECT');
  check('ENV A: tasks.duration_source is nullable text with no default (an unstated source is unknown)',
        scalar(dbName('env_a'), "select data_type || '/' || is_nullable || '/' || coalesce(column_default, 'none') from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='duration_source';") === 'text/YES/none');
  // 34 through F05, plus HK-FEATURE-10's career_opportunities, HK-FEATURE-11's two (rebuild_focuses, rebuild_focus_links) and
  // HK-FEATURE-12's two (life_records, life_record_task_links) and HK-FEATURE-13's two (person_contexts, person_task_links).
  check('ENV A: 41 application tables (34 + 1 HK-FEATURE-10 + 2 HK-FEATURE-11 + 2 HK-FEATURE-12 + 2 HK-FEATURE-13)', scalar(dbName('env_a'), "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';") === '41');
  check('ENV A: the additive F11 migration (Me / Rebuild) applies on top of all of them (fresh install)', true);
  check('ENV A: the two F11 tables are owner-private: RLS on, owner-only SELECT/INSERT/UPDATE policies, NO DELETE policy',
        scalar(dbName('env_a'), "select string_agg(tablename || ':' || cmd, ',' order by tablename, cmd) from pg_policies where schemaname='public' and tablename in ('rebuild_focuses','rebuild_focus_links');")
          === 'rebuild_focus_links:INSERT,rebuild_focus_links:SELECT,rebuild_focus_links:UPDATE,rebuild_focuses:INSERT,rebuild_focuses:SELECT,rebuild_focuses:UPDATE'
        && scalar(dbName('env_a'), "select count(*) from pg_policies where schemaname='public' and tablename in ('rebuild_focuses','rebuild_focus_links') and coalesce(qual, with_check) not like '%profile_id%';") === '0');
  check('ENV A: no client role holds DELETE on either F11 table, and anon/PUBLIC hold nothing',
        scalar(dbName('env_a'), "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in ('rebuild_focuses','rebuild_focus_links') and ((privilege_type = 'DELETE' and grantee = 'authenticated') or grantee in ('anon','PUBLIC'));") === '0');
  check('ENV A: public.sync_push is STILL SECURITY INVOKER after the F11 replacement',
        scalar(dbName('env_a'), "select (not prosecdef)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_push';") === 'true');
  check('ENV A: the F11 link-visibility trigger runs as the CALLER (not a definer) and no client role can call it directly',
        scalar(dbName('env_a'), "select p.prosecdef::text || '/' || has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='rebuild_focus_link_target_visible';") === 'false/false/false');
  check('ENV A: no F11 column was added to any existing table (nothing named *focus* or *rebuild* outside the two new tables)',
        scalar(dbName('env_a'), "select count(*) from information_schema.columns where table_schema='public' and table_name not in ('rebuild_focuses','rebuild_focus_links') and (column_name like '%focus%' or column_name like '%rebuild%');") === '0');
  // The test-only producer default (helpers/05) must never be in the shipped schema: a writer that does not say where a row came from is refused.
  check('ENV A: the shipped schema gives `producer` NO default on any of the nine synced content tables',
        scalar(dbName('env_a'), "select count(*) from information_schema.columns where table_schema='public' and column_name='producer' and column_default is not null;") === '0');
  check('ENV A: all nine synced content tables carry `producer`, NOT NULL',
        scalar(dbName('env_a'), "select count(*) from information_schema.columns where table_schema='public' and column_name='producer' and is_nullable='NO' and table_name in ('household_categories','events','tasks','household_systems','meal_plan_entries','needs_me_items','one_move_records','discovery_records','onboarding_state');") === '9');
  check('ENV A: RLS enabled on every public table', scalar(dbName('env_a'), "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;") === '0');
  check('ENV A: fail-closed assertion passes', psql(dbName('env_a'), 'SELECT private.assert_app_schema_secured();').ok);

  // HR-04 atomicity, proven rather than assumed: inject a failure after the
  // restructuring and require a complete rollback. The migration supplies its
  // own BEGIN/COMMIT, so this exercises the real guarantee.
  recreate(dbName('env_a_tx'));
  psqlFile(dbName('env_a_tx'), AUTH_STUB, { label: 'ENV A(tx) auth stub' });
  psqlFile(dbName('env_a_tx'), TEST_HELPERS, { label: 'helpers' });
  psqlFile(dbName('env_a_tx'), BASELINE, { label: 'ENV A(tx) baseline' });

  // One line, no newline escapes: the migration contains exactly one COMMIT.
  const poisoned = readFileSync(BUILD4, 'utf8').replace('COMMIT;', 'SELECT 1/0; COMMIT;');
  const failed = psql(dbName('env_a_tx'), poisoned, { expectFailure: true, label: 'ENV A(tx) poisoned build4' });
  check('ENV A: a failure late in the migration aborts it', !failed.ok && /division by zero/.test(failed.out));
  check('ENV A: the failed migration rolled back COMPLETELY — 14 baseline tables intact',
        scalar(dbName('env_a_tx'), "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';") === '14');
  check('ENV A: the failed migration left no partial uuid re-keying',
        scalar(dbName('env_a_tx'), "select data_type from information_schema.columns where table_schema='public' and table_name='households' and column_name='id';") === 'text');
}

// ---------------------------------------------------------------- ENV B -----
function envB() {
  console.log('\nENV B — zero-data interlock attack');

  // B1: a protected application table holds a row.
  recreate(dbName('env_b1'));
  psqlFile(dbName('env_b1'), AUTH_STUB, { label: 'ENV B1 auth stub' });
  psqlFile(dbName('env_b1'), TEST_HELPERS, { label: 'helpers' });
  psqlFile(dbName('env_b1'), BASELINE, { label: 'ENV B1 baseline' });
  psql(dbName('env_b1'), "INSERT INTO public.households (id) VALUES ('household-1');", { label: 'ENV B1 seed' });

  const b1 = applyBuild4(dbName('env_b1'), { expectFailure: true, label: 'ENV B1 build4' });
  check('ENV B1: migration ABORTS when a protected table holds a row', !b1.ok);
  check('ENV B1: abort names the offending relation', /public\.households=1/.test(b1.out), (b1.out.match(/public\.\w+=\d+/) ?? [''])[0]);
  check('ENV B1: no partial destructive state — the seeded row survives', scalar(dbName('env_b1'), 'select count(*) from public.households;') === '1');
  check('ENV B1: no partial destructive state — id is still text', scalar(dbName('env_b1'), "select data_type from information_schema.columns where table_schema='public' and table_name='households' and column_name='id';") === 'text');

  // B2: auth.users holds a row.
  recreate(dbName('env_b2'));
  psqlFile(dbName('env_b2'), AUTH_STUB, { label: 'ENV B2 auth stub' });
  psqlFile(dbName('env_b2'), TEST_HELPERS, { label: 'helpers' });
  psqlFile(dbName('env_b2'), BASELINE, { label: 'ENV B2 baseline' });
  psql(dbName('env_b2'), "INSERT INTO auth.users (id) VALUES ('99999999-9999-4999-8999-999999999999');", { label: 'ENV B2 seed' });

  const b2 = applyBuild4(dbName('env_b2'), { expectFailure: true, label: 'ENV B2 build4' });
  check('ENV B2: migration ABORTS when auth.users holds a row', !b2.ok);
  check('ENV B2: abort names auth.users', /auth\.users=1/.test(b2.out), (b2.out.match(/auth\.users=\d+/) ?? [''])[0]);
  check('ENV B2: no partial destructive state — 14 baseline tables intact', scalar(dbName('env_b2'), "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';") === '14');
}

// B3: the interlock over a FOUNDATION table. The eighteen new tables cannot hold a row on a first run, but a
// re-run of the migration over a household that already uses them must still refuse: a row in one of them is
// real data, exactly like a row in `tasks`.
function envB3() {
  console.log('\nENV B3 — interlock re-run over a populated foundation table');
  recreate(dbName('env_b3'));
  psqlFile(dbName('env_b3'), AUTH_STUB, { label: 'ENV B3 auth stub' });
  psqlFile(dbName('env_b3'), TEST_HELPERS, { label: 'helpers' });
  psqlFile(dbName('env_b3'), BASELINE, { label: 'ENV B3 baseline' });
  applyBuild4(dbName('env_b3'), { label: 'ENV B3 build4 (while empty)' });
  const uid = 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3';
  psql(dbName('env_b3'), `
    BEGIN;
    INSERT INTO auth.users (id, email) VALUES ('${uid}', 'b3@local.test');
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${uid}"}';
    SELECT public.bootstrap_account('b3b3b3b3-0000-4000-8000-00000000b3b3'::uuid, 'America/Chicago', NULL);
    RESET ROLE;
    SELECT herkeys_test.ins('goals', jsonb_build_object('household_id', (SELECT household_id FROM public.household_members WHERE profile_id = '${uid}'),
      'profile_id', '${uid}', 'local_id', 'g-b3', 'title', 'A real goal', 'status', 'active'));
    COMMIT;`, { label: 'ENV B3 seed' });
  const again = applyBuild4(dbName('env_b3'), { expectFailure: true, label: 'ENV B3 re-apply' });
  check('ENV B3: re-running the migration ABORTS when a foundation table holds a row', !again.ok);
  check('ENV B3: the abort names the foundation table', /public\.goals=1/.test(again.out), (again.out.match(/public\.goals=\d+/) ?? [''])[0]);
  check('ENV B3: no partial destructive state — the row survives', scalar(dbName('env_b3'), 'select count(*) from public.goals;') === '1');
  // Build 4 alone: its 34 tables. (Feature 10 had generated career_opportunities INTO the shipping migration; the F01-F13 integration
  // moved it to its own additive migration, so the shipping migration is again exactly what Staging verified.)
  check('ENV B3: ...and every one of the 34 tables is still there',
        scalar(dbName('env_b3'), "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';") === '34');
}

// ---------------------------------------------------------------- ENV C -----
function envC(only) {
  console.log('\nENV C — post-apply security environment');
  recreate(dbName('env_c'));
  psqlFile(dbName('env_c'), AUTH_STUB, { label: 'ENV C auth stub' });
  psqlFile(dbName('env_c'), TEST_HELPERS, { label: 'helpers' });
  psqlFile(dbName('env_c'), BASELINE, { label: 'ENV C baseline' });
  applyBuild4(dbName('env_c'), { label: 'ENV C build4 (while empty)' });
  applyAdditiveChain(dbName('env_c'), 'ENV C (while empty)');
  check('ENV C: migrated while empty (Build 4 and the whole additive chain), before any fixture exists', true);
  // Test-environment convenience ONLY: see the header of helpers/05-test-defaults.sql.
  psqlFile(dbName('env_c'), TEST_DEFAULTS, { label: 'ENV C test defaults' });

  psql(dbName('env_c'), `BEGIN;\n${readFileSync(FIXTURES, 'utf8')}\nCOMMIT;`, { label: 'ENV C fixtures' });
  check('ENV C: identity fixtures created', scalar(dbName('env_c'), 'select count(*) from public.households;') === '2');
  // Test-the-test only: scripts-dev/meals-mutation-check.cjs breaks ONE policy here and requires the suites to notice. Never set in a real run.
  if (process.env.HERKEYS_MUTANT_SQL) psql(dbName('env_c'), process.env.HERKEYS_MUTANT_SQL, { label: 'ENV C mutant' });

  const files = readdirSync(HERE)
    .filter((f) => /^\d\d-.*\.sql$/.test(f))
    .filter((f) => !only || f.startsWith(only))
    .sort();

  cursorBarrier();

  for (const file of files) {
    console.log(`\n  ${file}`);
    const out = psqlFile(dbName('env_c'), join(HERE, file), { label: file }).out;
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
  const hh = scalar(dbName('env_c'), "select household_id from public.household_members where role='owner' and profile_id='11111111-1111-4111-8111-111111111111'");
  const cat = scalar(dbName('env_c'), `select id from public.household_categories where household_id='${hh}' and local_id='cat-kids'`);

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
  const holder = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', dbName('env_c'), '-Atq', '-f', '-'],
                       { stdio: ['pipe', 'ignore', 'ignore'] });
  holder.stdin.end(sql);

  const xidOf = () => scalar(dbName('env_c'),
    `select coalesce(max(backend_xid::text),'') from pg_stat_activity where datname='${dbName('env_c')}' and backend_xid is not null and pid <> pg_backend_pid()`);

  let inflightXid = '';
  const started = Date.now();
  while (!inflightXid && Date.now() - started < 30000) inflightXid = xidOf();
  check('cursor: a concurrent session holds an uncommitted write open', Boolean(inflightXid), `xid=${inflightXid}`);

  const visibleWhileOpen = scalar(dbName('env_c'), "select count(*) from public.change_log cl join public.tasks t on t.id=cl.entity_id where t.local_id='task-inflight'");
  check('cursor: an uncommitted write is NOT visible to a pull', visibleWhileOpen === '0');

  const barrier = scalar(dbName('env_c'), 'select pg_snapshot_xmin(pg_current_snapshot())::text');
  check('cursor: the barrier does NOT advance past the in-flight transaction',
        BigInt(barrier) <= BigInt(inflightXid), `barrier=${barrier} <= inflight=${inflightXid}`);

  // Wait for the holder to settle on its own.
  const waited = Date.now();
  while (xidOf() && Date.now() - waited < 30000) { /* poll */ }

  const visibleAfter = scalar(dbName('env_c'), "select count(*) from public.change_log cl join public.tasks t on t.id=cl.entity_id where t.local_id='task-inflight'");
  check('cursor: once committed, the previously in-flight write IS delivered - nothing was skipped', visibleAfter === '1');

  const barrierAfter = scalar(dbName('env_c'), 'select pg_snapshot_xmin(pg_current_snapshot())::text');
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

  // The protected list must name all 34 Build 4 tables plus auth.users. (The shipping migration is the Staging-verified file: tables a
  // LATER additive migration creates are not in it, and Feature 10's edit that added one was reverted by the F01-F13 integration.)
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

  // The chain (HK-F01-F13 integration): the directory holds EXACTLY the registered chain, every version is unique and strictly
  // increasing, and no migration that existed at WAVE3_BASE has changed by a single byte.
  const migs = readdirSync(join(REPO, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  const registered = [BASELINE_FILE, SHIPPING, ...ADDITIVE_CHAIN.map((m) => m.file)];
  check('quality: the migrations directory holds exactly the registered chain - baseline, shipping, then every additive migration in order - and no unregistered file',
        JSON.stringify(migs) === JSON.stringify(registered), migs.filter((f) => !registered.includes(f)).concat(registered.filter((f) => !migs.includes(f))).join(', ') || `${migs.length} files`);
  const versions = migs.map((f) => f.split('_')[0]);
  check('quality: every migration version is unique and strictly increasing (no two files claim one version)',
        new Set(versions).size === versions.length && versions.every((v, i) => i === 0 || versions[i - 1] < v), versions.join(' < '));
  const lfSha = (file) => createHash('sha256').update(readFileSync(migrationPath(file), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
  for (const [file, sha] of Object.entries(WAVE3_BASE_SHA256)) {
    check(`quality: ${file} is byte-for-byte the file that existed at WAVE3_BASE (an applied migration is never edited)`, lfSha(file) === sha, lfSha(file).slice(0, 16));
  }
  const f09Sql = readFileSync(F09, 'utf8');
  const f09Code = f09Sql.replace(/--.*$/gm, '');
  check('quality: the F09 migration is additive - one nullable column and its CHECK on tasks, two column grants; it drops, rewrites and replaces nothing',
        (f09Code.match(/ALTER TABLE public\.\w+ ADD (COLUMN|CONSTRAINT) \w+/g) ?? []).join(',') === 'ALTER TABLE public.tasks ADD COLUMN payment_mechanism,ALTER TABLE public.tasks ADD CONSTRAINT tasks_payment_mechanism_check'
        && !/\b(DROP|TRUNCATE|DELETE FROM|UPDATE public\.|INSERT INTO|CREATE (OR REPLACE )?FUNCTION|CREATE TABLE|POLICY)\b/i.test(f09Code)
        && (f09Code.match(/\bGRANT\b[^;]*;/g) ?? []).join(' ') === 'GRANT INSERT (payment_mechanism) ON public.tasks TO authenticated; GRANT UPDATE (payment_mechanism) ON public.tasks TO authenticated;');
  check('quality: the F09 migration is pinned to LF and opens, closes and asserts like every additive migration',
        !f09Sql.includes(String.fromCharCode(13)) && /^\s*BEGIN;\s*$/m.test(f09Sql) && f09Sql.trim().endsWith('SELECT private.assert_app_schema_secured();\n\nCOMMIT;'));
  const f10Sql = readFileSync(F10, 'utf8');
  const f10Code = f10Sql.replace(/\$fn\$[\s\S]*?\$fn\$/g, '').replace(/--.*$/gm, '');
  check('quality: the F10 migration creates exactly one table and touches exactly one function (the replaced sync_push)',
        (f10Code.match(/CREATE TABLE public\.\w+/g) ?? []).join(',') === 'CREATE TABLE public.career_opportunities'
        && (f10Sql.match(/^CREATE (OR REPLACE )?FUNCTION [\w.]+/gm) ?? []).map((s) => s.replace(/^CREATE (OR REPLACE )?FUNCTION /, '')).join(',') === 'public.sync_push');
  check('quality: the F10 migration alters only its own table, dependencies (the widening) and the change-log check, and drops only what it re-issues',
        (f10Code.match(/ALTER TABLE public\.(\w+)/g) ?? []).every((s) => /public\.(career_opportunities|dependencies|change_log)$/.test(s))
        && (f10Code.match(/DROP (CONSTRAINT|INDEX) [\w.]+/g) ?? []).sort().join(',')
          === ['DROP CONSTRAINT change_log_entity_table_check', 'DROP CONSTRAINT dependencies_from_ref_check', 'DROP CONSTRAINT dependencies_not_self_check',
               'DROP CONSTRAINT dependencies_to_ref_check', 'DROP INDEX public.dependencies_live_edge_uq'].join(',')
        && !/(^|\n)\s*(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE public\.|INSERT INTO)/i.test(f10Code));
  check('quality: the F10 migration grants no DELETE, creates no DELETE policy, is pinned to LF, and opens, closes and asserts',
        !/\bGRANT\b[^;]*\bDELETE\b/i.test(f10Code) && !/FOR DELETE/i.test(f10Code) && !f10Sql.includes(String.fromCharCode(13))
        && /^\s*BEGIN;\s*$/m.test(f10Sql) && f10Sql.trim().endsWith('SELECT private.assert_app_schema_secured();\n\nCOMMIT;'));
  const f11Sql = readFileSync(F11, 'utf8');
  const f11Code = f11Sql.replace(/\$fn\$[\s\S]*?\$fn\$/g, '').replace(/--.*$/gm, '');
  check('quality: the F11 migration is additive - it drops only the one change_log check it re-creates, and deletes, truncates, updates or inserts no row',
        (f11Code.match(/\bDROP\b[^;]*;/gi) ?? []).join(' ') === 'DROP CONSTRAINT change_log_entity_table_check;'
        && !/(^|\n)\s*(TRUNCATE|DELETE FROM|UPDATE public\.|INSERT INTO)/i.test(f11Code));
  check('quality: the F11 migration creates exactly two tables and touches exactly two functions (the new trigger function and the replaced sync_push)',
        (f11Code.match(/CREATE TABLE public\.\w+/g) ?? []).join(',') === 'CREATE TABLE public.rebuild_focuses,CREATE TABLE public.rebuild_focus_links'
        && (f11Sql.match(/^CREATE (OR REPLACE )?FUNCTION [\w.]+/gm) ?? []).map((s) => s.replace(/^CREATE (OR REPLACE )?FUNCTION /, '')).join(',') === 'private.rebuild_focus_link_target_visible,public.sync_push');
  check('quality: the F11 migration alters no existing table except the change_log check (no column added to tasks, goals, systems, events, members or people)',
        (f11Code.match(/ALTER TABLE public\.(\w+)/g) ?? []).every((s) => /public\.(rebuild_focuses|rebuild_focus_links|change_log)$/.test(s)));
  check('quality: the F11 migration grants no DELETE and creates no DELETE policy (removal is a status, never a delete)',
        !/\bGRANT\b[^;]*\bDELETE\b/i.test(f11Code) && !/FOR DELETE/i.test(f11Code));
  check('quality: the F11 migration is pinned to LF, so its function digest is the same on every checkout', !f11Sql.includes(String.fromCharCode(13)));
  check('quality: the F11 migration opens and closes its own transaction and ends with the fail-closed assertion',
        /^\s*BEGIN;\s*$/m.test(f11Sql) && f11Sql.trim().endsWith('SELECT private.assert_app_schema_secured();\n\nCOMMIT;'));
  const f12Sql = readFileSync(F12, 'utf8');
  const f12Code = f12Sql.replace(/\$fn\$[\s\S]*?\$fn\$/g, '').replace(/--.*$/gm, '');
  check('quality: the F12 migration is additive - it drops no table or column, deletes or rewrites no row, and truncates nothing',
        !/(^|\n)\s*(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE public\.|INSERT INTO)/i.test(f12Code));
  check('quality: the F12 migration alters only its own two tables and the change_log entity list (no shared canonical table changes)',
        (f12Code.match(/ALTER TABLE public\.(\w+)/g) ?? []).every((s) => /public\.(life_records|life_record_task_links|change_log)$/.test(s))
        && (f12Code.match(/ALTER TABLE public\.change_log DROP CONSTRAINT (\w+)/g) ?? []).join() === 'ALTER TABLE public.change_log DROP CONSTRAINT change_log_entity_table_check');
  check('quality: the F12 migration creates exactly its two tables and touches exactly two functions (its link guard and the replaced sync_push)',
        (f12Code.match(/CREATE TABLE public\.(\w+)/g) ?? []).join() === 'CREATE TABLE public.life_records,CREATE TABLE public.life_record_task_links'
        && (f12Sql.match(/^CREATE (OR REPLACE )?FUNCTION [\w.]+/gm) ?? []).map((s) => s.replace(/^CREATE (OR REPLACE )?FUNCTION /, '')).join(',') === 'private.guard_life_record_task_link,public.sync_push');
  check('quality: the F12 migration is pinned to LF, so its function digests are the same on every checkout', !f12Sql.includes(String.fromCharCode(13)));
  check('quality: the F12 migration opens and closes its own transaction and ends with the fail-closed assertion',
        /^\s*BEGIN;\s*$/m.test(f12Sql) && f12Sql.trim().endsWith('SELECT private.assert_app_schema_secured();\n\nCOMMIT;'));
  const f13Sql = readFileSync(F13, 'utf8');
  const f13Code = f13Sql.replace(/\$fn\$[\s\S]*?\$fn\$/g, '').replace(/--.*$/gm, '');
  check('quality: the F13 migration is additive - it drops no table or column, rewrites and deletes no row, and alters no existing table but the change-log CHECK it widens',
        !/(^|\n)\s*(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE public\.|INSERT INTO)/i.test(f13Code)
        && [...f13Code.matchAll(/ALTER TABLE public\.(\w+)/g)].every((m) => ['person_contexts', 'person_task_links', 'change_log'].includes(m[1]))
        && (f13Code.match(/DROP CONSTRAINT (\w+)/g) ?? []).join() === 'DROP CONSTRAINT change_log_entity_table_check');
  check('quality: the F13 migration touches exactly two functions (the new follow-up guard and the replaced sync_push)',
        (f13Sql.match(/^CREATE (OR REPLACE )?FUNCTION [\w.]+/gm) ?? []).map((s) => s.replace(/^CREATE (OR REPLACE )?FUNCTION /, '')).join(',') === 'public.guard_follow_up_task,public.sync_push');
  check('quality: the F13 migration grants no DELETE and no TRUNCATE to a client', !/\bGRANT\b[^;]*\b(DELETE|TRUNCATE)\b[^;]*\bTO (authenticated|anon)/i.test(f13Code));
  check('quality: the F13 migration is pinned to LF, so its function digest is the same on every checkout', !f13Sql.includes(String.fromCharCode(13)));
  check('quality: the F13 migration opens and closes its own transaction and ends with the fail-closed assertion',
        /^\s*BEGIN;\s*$/m.test(f13Sql) && f13Sql.trim().endsWith('SELECT private.assert_app_schema_secured();\n\nCOMMIT;'));
  const ir01Sql = readFileSync(IR01, 'utf8');
  check('quality: the IR01 migration is additive - it drops no table, column or data and rewrites no row',
        !/(^|\n)\s*(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE public\.)/i.test(ir01Sql.replace(/\$fn\$[\s\S]*?\$fn\$/g, '').replace(/--.*$/gm, '')));
  check('quality: the IR01 migration is pinned to LF, so its function digest is the same on every checkout', !ir01Sql.includes(String.fromCharCode(13)));
  const f08Sql = readFileSync(F08, 'utf8');
  const f08Code = f08Sql.replace(/--.*$/gm, ''); // the code only: its own comments say "no DELETE grant"
  check('quality: the F08 migration is additive - it drops no table, column or data, rewrites no row and replaces no function',
        !/(^|\n)\s*(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE public\.|CREATE OR REPLACE FUNCTION|CREATE FUNCTION)/i.test(f08Code));
  check('quality: the F08 migration grants no DELETE and touches no policy (removal is an archive, never a delete)',
        !/\bGRANT\b[^;]*\bDELETE\b/i.test(f08Code) && !/\b(CREATE|ALTER|DROP)\s+POLICY\b/i.test(f08Code));
  check('quality: the F08 migration is pinned to LF, so its hash is the same on every checkout', !f08Sql.includes(String.fromCharCode(13)));
  const f05Sql = readFileSync(F05, 'utf8');
  const f05Code = f05Sql.replace(/\$fn\$[\s\S]*?\$fn\$/g, '').replace(/--.*$/gm, '');
  check('quality: the F05 migration is additive - it drops nothing, rewrites no row and changes no table, column, constraint, index, policy or table grant',
        !/(^|\n)\s*(DROP |TRUNCATE|DELETE FROM|UPDATE public\.|INSERT INTO|ALTER TABLE|CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|CREATE POLICY|CREATE TRIGGER|GRANT [^;]*\bON\s+(TABLE\s+)?public\.)/i.test(f05Code));
  check('quality: the F05 migration touches exactly two functions (the new definer function and the replaced sync_push)',
        (f05Sql.match(/^CREATE (OR REPLACE )?FUNCTION [\w.]+/gm) ?? []).map((s) => s.replace(/^CREATE (OR REPLACE )?FUNCTION /, '')).join(',') === 'private.push_household_child,public.sync_push');
  check('quality: the F05 migration is pinned to LF, so its function digest is the same on every checkout', !f05Sql.includes(String.fromCharCode(13)));
  check('quality: the F05 migration opens and closes its own transaction and ends with the fail-closed assertion',
        /^\s*BEGIN;\s*$/m.test(f05Sql) && f05Sql.trim().endsWith('SELECT private.assert_app_schema_secured();\n\nCOMMIT;'));
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
  psql(dbName('env_c'), `INSERT INTO auth.users (id, email) VALUES ('${uid}','client@local.test') ON CONFLICT (id) DO NOTHING;`,
    { label: 'client fixture user' });

  const literal = JSON.stringify(payload).replace(/'/g, "''");
  const status = scalar(dbName('env_c'), `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${uid}"}';
    SELECT public.claim_local_household('5c000000-0000-4000-8000-0000000000c1'::uuid,'America/Chicago','${literal}'::jsonb, NULL) ->> 'status';
    COMMIT;`).split('\n').map((line) => line.trim()).find((line) => line === 'complete' || line === 'rejected');
  check('client: the real RPC accepts the payload the real client builds', status === 'complete', `status=${status}`);

  const shape = scalar(dbName('env_c'), `
    SELECT (SELECT count(*) FROM public.tasks t JOIN public.household_members m ON m.household_id=t.household_id AND m.profile_id='${uid}' AND m.role='owner')
        || '/' || (SELECT count(*) FROM public.needs_me_items WHERE profile_id='${uid}')
        || '/' || (SELECT count(*) FROM public.one_move_records WHERE profile_id='${uid}')
        || '/' || (SELECT count(*) FROM public.one_move_records WHERE profile_id='${uid}' AND target_task_id IS NOT NULL)
        || '/' || (SELECT count(*) FROM public.one_move_records WHERE profile_id='${uid}' AND target_needs_me_id IS NOT NULL);`);
  check('client: both historical targets resolved to cloud uuids', shape === '1/1/2/1/1', `tasks/needsMe/moves/taskTargets/needsMeTargets = ${shape}`);

  const preserved = scalar(dbName('env_c'), `
    SELECT t.status || '|' || t.subject_member_type || '|' || (t.completed_at = '2026-09-18T18:00:00Z'::timestamptz)::text
    FROM public.tasks t JOIN public.household_members m ON m.household_id=t.household_id AND m.profile_id='${uid}' AND m.role='owner';`);
  check('client: the completed child-scoped target arrives completed, typed by the server', preserved === 'completed|child|true', preserved);

  const kids = scalar(dbName('env_c'), `
    SELECT count(*) || '/' || count(*) FILTER (WHERE m.local_id = 'child-2')
    FROM public.household_members m JOIN public.household_members o ON o.household_id = m.household_id AND o.profile_id = '${uid}' AND o.role = 'owner'
    WHERE m.member_type = 'child';`);
  check('client: the child NO closure names was claimed too (version 3)', kids === '2/1', kids);

  const source = scalar(dbName('env_c'), `
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
  const db = dbName('env_d');
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

  // ---- The SECOND additive upgrade, on the same populated database: F05 (a child after binding). It adds one function and
  // replaces one; it must lose nothing, rewrite nothing, and leave every existing household exactly as it was.
  const memberDigest = () => scalar(db, "SELECT md5(string_agg(to_jsonb(m)::text, '|' ORDER BY m.id)) FROM public.household_members m;");
  const preF05 = { census: census(), members: memberDigest(), tasks: digest() };
  applyF05(db, { label: 'ENV D f05 upgrade' });
  check('ENV D: the additive F05 migration applies to the populated, already-upgraded database (no interlock, no abort)', true);
  check('ENV D: F05 lost nothing - every table keeps its row count', census() === preF05.census, `${preF05.census} -> ${census()}`);
  check('ENV D: F05 rewrote no existing row (every household member and every task is byte-identical)',
        memberDigest() === preF05.members && digest() === preF05.tasks);
  check('ENV D: the version 2 claim still replays to the same completed answer after F05, and made no additional household (still two)',
        claim(uid, claimKey, v2) === 'complete' && scalar(db, 'select count(*) from public.households;') === '2');
  const uidHouse = scalar(db, `select household_id from public.household_members where profile_id = '${uid}' and role = 'owner';`);
  const addChild = (sub, house, localId) => scalar(db, `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${sub}"}';
    SELECT public.sync_push('household_members', 'd3000000-0000-4000-8000-0000000000d1'::uuid,
      jsonb_build_object('household_id','${house}','local_id','${localId}','member_type','child','display_name','Ivy','birth_date','2020-05-01','scope','child')) ->> 'status';
    COMMIT;`).split('\n').map((line) => line.trim()).find((line) => ['created', 'already_exists', 'local_id_collision'].includes(line));
  check('ENV D: after F05 the OWNER of the populated household can add a child through sync_push', addChild(uid, uidHouse, 'child-late') === 'created');
  check('ENV D: ...a retry from the same install answers already_exists and adds no second row',
        addChild(uid, uidHouse, 'child-late') === 'already_exists'
        && scalar(db, `select count(*) from public.household_members where household_id = '${uidHouse}' and local_id = 'child-late';`) === '1');
  check('ENV D: ...and an unrelated account is refused for that household, and nothing was written',
        psql(db, `
          BEGIN;
          SET LOCAL ROLE authenticated;
          SET LOCAL request.jwt.claims = '{"sub":"${other}"}';
          SELECT public.sync_push('household_members', 'd3000000-0000-4000-8000-0000000000d2'::uuid,
            jsonb_build_object('household_id','${uidHouse}','local_id','child-evil','member_type','child','display_name','Eve','birth_date','2020-05-01','scope','child'));
          COMMIT;`, { expectFailure: true, label: 'ENV D stranger add child' }).out.includes('not a member of household')
        && scalar(db, "select count(*) from public.household_members where local_id = 'child-evil';") === '0');
  check('ENV D: the fail-closed assertion still passes after F05', psql(db, 'SELECT private.assert_app_schema_secured();').ok);

  // ---- The THIRD additive upgrade, on the same populated database: F09 (Money). tasks gains payment_mechanism, nullable, no default.
  // Every existing task keeps every byte; the new column reads NULL - "never stated", never a guessed "manual".
  const preF09 = { census: census(), members: memberDigest(), tasks: digest(), log: scalar(db, 'select count(*) from public.change_log;') };
  applyF09(db, { label: 'ENV D f09 upgrade' });
  check('ENV D: the additive F09 migration applies to the populated, already-upgraded database (no interlock, no abort)', true);
  check('ENV D: F09 lost nothing and rewrote nothing (row counts, every member, every task byte-identical apart from the new column, no change-log write)',
        census() === preF09.census && memberDigest() === preF09.members
        && scalar(db, "SELECT md5(string_agg((to_jsonb(t) - 'payment_mechanism')::text, '|' ORDER BY t.id)) FROM public.tasks t;") === preF09.tasks
        && scalar(db, 'select count(*) from public.change_log;') === preF09.log, `${preF09.census} -> ${census()}`);
  check('ENV D: EVERY pre-existing task reads payment_mechanism as NULL (never stated), not as a guessed mechanism',
        scalar(db, "SELECT count(*) FILTER (WHERE payment_mechanism IS NULL) = count(*) FROM public.tasks;") === 't');
  check('ENV D: the fail-closed assertion still passes after F09', psql(db, 'SELECT private.assert_app_schema_secured();').ok);

  // ---- The FOURTH additive upgrade: F10 (Work / Career). career_opportunities, and dependencies gains opportunity endpoints. An edge
  // that already exists must keep every byte (its new endpoint columns read NULL) and stay valid under the re-issued rules.
  psql(db, `INSERT INTO public.dependencies (household_id, local_id, profile_id, relation, from_type, from_task_id, to_type, to_task_id, status, producer, origin_created_at, origin_updated_at)
    SELECT t1.household_id, 'dep-pre-f10', '${uid}', 'requires', 'task', t1.id, 'task', t2.id, 'active', 'user-action', now(), now()
    FROM public.tasks t1 JOIN public.tasks t2 ON t2.household_id = t1.household_id AND t2.local_id = 'task-30'
    WHERE t1.local_id = 'task-15' AND t1.household_id = '${uidHouse}';`, { label: 'ENV D pre-F10 edge' });
  const edgeDigest = () => scalar(db, "SELECT md5(string_agg((to_jsonb(d) - 'from_opportunity_id' - 'to_opportunity_id')::text, '|' ORDER BY d.id)) FROM public.dependencies d;");
  const preF10 = { census: census(), members: memberDigest(), tasks: digest(), edges: edgeDigest(), edgeCount: scalar(db, 'select count(*) from public.dependencies;') };
  check('ENV D: before F10 the populated database holds a real dependency edge', preF10.edgeCount === '1', preF10.edgeCount);
  applyF10(db, { label: 'ENV D f10 upgrade' });
  check('ENV D: the additive F10 migration applies to the populated, already-upgraded database (no interlock, no abort)', true);
  check('ENV D: F10 lost nothing and rewrote nothing (row counts; every member, task and dependency edge byte-identical apart from the two new endpoint columns)',
        census() === preF10.census && memberDigest() === preF10.members && digest() === preF10.tasks && edgeDigest() === preF10.edges
        && scalar(db, 'select count(*) from public.dependencies;') === preF10.edgeCount);
  check('ENV D: the pre-existing edge names no opportunity (both new endpoints NULL) and still satisfies every re-issued rule',
        scalar(db, "select count(*) from public.dependencies where local_id = 'dep-pre-f10' and from_opportunity_id is null and to_opportunity_id is null;") === '1'
        && scalar(db, "select count(*) from pg_constraint where conrelid = 'public.dependencies'::regclass and not convalidated;") === '0');
  const pushAs = (sub, table, row, device = 'd4000000-0000-4000-8000-0000000000d1') => scalar(db, `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${sub}"}';
    SELECT public.sync_push('${table}', '${device}'::uuid, '${JSON.stringify(row).replace(/'/g, "''")}'::jsonb) ->> 'status';
    COMMIT;`).split('\n').map((line) => line.trim()).find((line) => ['created', 'already_exists', 'local_id_collision'].includes(line));
  const opportunityRow = { household_id: uidHouse, profile_id: uid, local_id: 'opp-late', title: 'Senior analyst role', organization_name: null, opportunity_type: 'job',
    stage: 'interested', closed_reason: null, stage_changed_at: '2026-09-22T12:00:00Z', archived_at: null, producer: 'user-action', scope: 'personal',
    origin_created_at: '2026-09-22T12:00:00Z', origin_updated_at: '2026-09-22T12:00:00Z' };
  check('ENV D: after F10 the owner of the populated household can push an opportunity through the ordinary sync_push', pushAs(uid, 'career_opportunities', opportunityRow) === 'created');
  check('ENV D: ...a retry from the same install answers already_exists and adds no second opportunity',
        pushAs(uid, 'career_opportunities', opportunityRow) === 'already_exists' && scalar(db, "select count(*) from public.career_opportunities where local_id = 'opp-late';") === '1');
  const oppId = scalar(db, "select id from public.career_opportunities where local_id = 'opp-late';");
  const nextActionId = scalar(db, `select id from public.tasks where household_id = '${uidHouse}' and local_id = 'task-30';`);
  check('ENV D: ...a PRE-EXISTING task can be joined to it as its next action (task part_of opportunity) through the widened dependencies',
        pushAs(uid, 'dependencies', { household_id: uidHouse, profile_id: uid, local_id: 'dep-opp-late', relation: 'part_of', from_type: 'task', from_task_id: nextActionId,
          to_type: 'opportunity', to_opportunity_id: oppId, status: 'active', producer: 'user-action', scope: 'personal',
          origin_created_at: '2026-09-22T12:00:00Z', origin_updated_at: '2026-09-22T12:00:00Z' }) === 'created');
  check('ENV D: ...and the opportunity\'s change-log entry carries the owner, so only she pulls it',
        scalar(db, `select count(*) from public.change_log where entity_table = 'career_opportunities' and owner_profile_id = '${uid}';`) === '1');
  check('ENV D: the fail-closed assertion still passes after F10', psql(db, 'SELECT private.assert_app_schema_secured();').ok);

  // ---- The FIFTH additive upgrade, on the same populated database: F11 (Me / Rebuild). Two new tables, one new trigger function,
  // the change_log check re-created with two more names, sync_push replaced. It must lose nothing and rewrite nothing.
  const preF11 = { census: census(), members: memberDigest(), tasks: digest(), log: scalar(db, 'select count(*) from public.change_log;') };
  applyF11(db, { label: 'ENV D f11 upgrade' });
  check('ENV D: the additive F11 migration applies to the populated, already-upgraded database (no interlock, no abort)', true);
  check('ENV D: F11 lost nothing - every existing table keeps its row count', census() === preF11.census, `${preF11.census} -> ${census()}`);
  check('ENV D: F11 rewrote no existing row (every member and task byte-identical) and wrote nothing to the change log',
        memberDigest() === preF11.members && digest() === preF11.tasks && scalar(db, 'select count(*) from public.change_log;') === preF11.log);
  const focusRow = { household_id: uidHouse, profile_id: uid, local_id: 'focus-late', title: 'Make space for myself again', note: null, state: 'active',
    producer: 'user-action', scope: 'personal', origin_created_at: '2026-09-22T12:00:00Z', origin_updated_at: '2026-09-22T12:00:00Z' };
  check('ENV D: after F11 the owner of the populated household can push a Focus through the ordinary sync_push', pushAs(uid, 'rebuild_focuses', focusRow) === 'created');
  check('ENV D: ...a retry from the same install answers already_exists and adds no second Focus',
        pushAs(uid, 'rebuild_focuses', focusRow) === 'already_exists' && scalar(db, "select count(*) from public.rebuild_focuses where local_id = 'focus-late';") === '1');
  check('ENV D: ...its change-log entry carries the owner, so only she pulls it',
        scalar(db, `select count(*) from public.change_log where entity_table = 'rebuild_focuses' and owner_profile_id = '${uid}';`) === '1');
  check('ENV D: the fail-closed assertion still passes after F11', psql(db, 'SELECT private.assert_app_schema_secured();').ok);

  // ---- The SIXTH additive upgrade, on the same populated database: F12 (Life Admin records). Two new owner-private tables, one
  // guard function, sync_push replaced; nothing that already exists may be lost or rewritten.
  const changeLogCount = () => scalar(db, 'select count(*) from public.change_log;');
  const preF12 = { census: census(), members: memberDigest(), tasks: digest(), log: changeLogCount() };
  applyF12(db, { label: 'ENV D f12 upgrade' });
  check('ENV D: the additive F12 migration applies to the populated, already-upgraded database (no interlock, no abort)', true);
  check('ENV D: F12 lost nothing - every table keeps its row count, and the change log keeps every pointer',
        census() === preF12.census && changeLogCount() === preF12.log, `${preF12.census} -> ${census()}; log ${preF12.log} -> ${changeLogCount()}`);
  check('ENV D: F12 rewrote no existing row (every household member and every task is byte-identical)', memberDigest() === preF12.members && digest() === preF12.tasks);
  check('ENV D: the new tables start empty', scalar(db, 'select (select count(*) from public.life_records) + (select count(*) from public.life_record_task_links);') === '0');
  const pushRecord = (sub, house, localId) => scalar(db, `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${sub}"}';
    SELECT public.sync_push('life_records', 'd4000000-0000-4000-8000-0000000000e1'::uuid,
      jsonb_build_object('household_id','${house}','local_id','${localId}','profile_id','${sub}','title','Passport','record_kind','credential','status','active',
        'scope','personal','producer','user-action','origin_created_at',now(),'origin_updated_at',now())) ->> 'status';
    COMMIT;`).split('\n').map((line) => line.trim()).find((line) => ['created', 'already_exists', 'local_id_collision'].includes(line));
  check('ENV D: after F12 the owner of the populated household keeps a private record through sync_push', pushRecord(uid, uidHouse, 'life-record-1') === 'created');
  check('ENV D: ...a retry from the same install answers already_exists and adds no second record',
        pushRecord(uid, uidHouse, 'life-record-1') === 'already_exists'
        && scalar(db, `select count(*) from public.life_records where household_id = '${uidHouse}' and local_id = 'life-record-1';`) === '1');
  check('ENV D: ...and an unrelated account can neither read it nor write into that household',
        scalar(db, `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"${other}"}'; SELECT count(*) FROM public.life_records; COMMIT;`).split('\n').map((l) => l.trim()).includes('0')
        && psql(db, `
          BEGIN;
          SET LOCAL ROLE authenticated;
          SET LOCAL request.jwt.claims = '{"sub":"${other}"}';
          SELECT public.sync_push('life_records', 'd4000000-0000-4000-8000-0000000000e2'::uuid,
            jsonb_build_object('household_id','${uidHouse}','local_id','evil','profile_id','${other}','title','X','record_kind','other','status','active',
              'scope','personal','producer','user-action','origin_created_at',now(),'origin_updated_at',now()));
          COMMIT;`, { expectFailure: true, label: 'ENV D stranger record' }).out.includes('not a member of household')
        && scalar(db, "select count(*) from public.life_records where local_id = 'evil';") === '0');
  check('ENV D: the fail-closed assertion still passes after F12', psql(db, 'SELECT private.assert_app_schema_secured();').ok);

  // ---- The SEVENTH additive upgrade, on the same populated database: F13 (People OS). Two new, empty, owner-private tables, a widened
  // change-log CHECK and a replaced sync_push. It must lose nothing, rewrite nothing, and work at once on the household's existing rows.
  const preF13 = { census: census(), members: memberDigest(), tasks: digest(), people: scalar(db, "SELECT count(*) FROM public.household_people;") };
  applyF13(db, { label: 'ENV D f13 upgrade' });
  check('ENV D: the additive F13 migration applies to the populated, already-upgraded database (no interlock, no abort)', true);
  check('ENV D: F13 lost nothing and rewrote nothing (row counts, every member and every task byte-identical)',
        census() === preF13.census && memberDigest() === preF13.members && digest() === preF13.tasks
        && scalar(db, "SELECT count(*) FROM public.household_people;") === preF13.people, `${preF13.census} -> ${census()}`);
  check('ENV D: the two People tables arrive EMPTY — no context or link is ever invented for an existing household',
        scalar(db, "SELECT (SELECT count(*) FROM public.person_contexts) || '/' || (SELECT count(*) FROM public.person_task_links);") === '0/0');
  const childOne = scalar(db, `select id from public.household_members where household_id = '${uidHouse}' and local_id = 'child-1';`);
  const pushPeople = (sub, table, row) => scalar(db, `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${sub}"}';
    SELECT public.sync_push('${table}', 'd3000000-0000-4000-8000-0000000000f1'::uuid, '${JSON.stringify(row).replace(/'/g, "''")}'::jsonb) ->> 'status';
    COMMIT;`).split('\n').map((line) => line.trim()).find((line) => ['created', 'already_exists', 'local_id_collision'].includes(line));
  const contextRow = { household_id: uidHouse, profile_id: uid, local_id: 'pctx-upgrade-1', child_id: childOne, relationship_name: 'Daughter', status: 'active', producer: 'user-action', origin_created_at: '2026-09-22T12:00:00Z', origin_updated_at: '2026-09-22T12:00:00Z' };
  check('ENV D: after F13 the owner can push a private context about the PRE-EXISTING child (the upgrade works on old identities)', pushPeople(uid, 'person_contexts', contextRow) === 'created');
  check('ENV D: ...and a retry from the same install answers already_exists with one row', pushPeople(uid, 'person_contexts', contextRow) === 'already_exists'
        && scalar(db, "select count(*) from public.person_contexts where local_id = 'pctx-upgrade-1';") === '1');
  check('ENV D: ...a follow-up link onto a PRE-EXISTING household-visible task is refused (private context never links to a shared task)',
        psql(db, `
          BEGIN;
          SET LOCAL ROLE authenticated;
          SET LOCAL request.jwt.claims = '{"sub":"${uid}"}';
          SELECT public.sync_push('person_task_links', 'd3000000-0000-4000-8000-0000000000f1'::uuid, jsonb_build_object('household_id','${uidHouse}','profile_id','${uid}','local_id','ptl-upgrade',
            'context_id',(select id from public.person_contexts where local_id='pctx-upgrade-1'),'follow_up_type','task',
            'follow_up_task_id',(select id from public.tasks where household_id='${uidHouse}' and local_id='task-15'),'relation','follow_up','producer','user-action','origin_created_at',now()));
          COMMIT;`, { expectFailure: true, label: 'ENV D f13 shared-task link' }).out.includes('a follow-up must be one of your own private tasks'));
  check('ENV D: the fail-closed assertion still passes after F13', psql(db, 'SELECT private.assert_app_schema_secured();').ok);

  // ---- After the WHOLE chain (HK-F01-F13 integration, INT13-01): the sync_push and change-log check the LAST migration left behind
  // must still carry every earlier feature's tables. Before the integration each migration re-declared both with only its own tables,
  // so after F13 these pushes were refused as "not a pushable entity table".
  chainRegistrations(db, 'ENV D');
  check('ENV D: after the whole chain the owner can still push an opportunity (F10), a Focus (F11) and a Life Admin record (F12)',
        pushAs(uid, 'career_opportunities', { ...opportunityRow, local_id: 'opp-after-chain' }) === 'created'
        && pushAs(uid, 'rebuild_focuses', { ...focusRow, local_id: 'focus-after-chain' }) === 'created'
        && pushRecord(uid, uidHouse, 'life-record-after-chain') === 'created');
}

// ---------------------------------------------------------------- ENV E -----
/**
 * HK-FEATURE-08-MEALS — the upgrade of a POPULATED pre-F08 database.
 *
 * A household that already holds meal plans is upgraded in place by the additive migration. Nothing may be lost or rewritten,
 * and every existing plan must read as what it was: a live plan with no stated slot, never a guessed one.
 */
function envE() {
  console.log('\nENV E — additive upgrade of a POPULATED pre-F08 database (meal plans)');
  const db = dbName('env_e');
  recreate(db);
  psqlFile(db, AUTH_STUB, { label: 'ENV E auth stub' });
  psqlFile(db, TEST_HELPERS, { label: 'helpers' });
  psqlFile(db, BASELINE, { label: 'ENV E baseline' });
  applyBuild4(db, { label: 'ENV E build4 (while empty)' });
  applyIr01(db, { label: 'ENV E ir01 (while empty)' });

  const uid = 'e1000000-0000-4000-8000-00000000000e';
  psql(db, `INSERT INTO auth.users (id, email) VALUES ('${uid}','e1@local.test') ON CONFLICT (id) DO NOTHING;`, { label: 'ENV E user' });
  psql(db, `BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${uid}"}';
    SELECT public.bootstrap_account('eeeeeeee-0000-4000-8000-00000000000e'::uuid, 'America/Chicago', NULL);
    COMMIT;`, { label: 'ENV E bootstrap' });

  // What a pre-F08 household could hold: household plans and one owner-only plan, none with a slot or a status.
  psql(db, `INSERT INTO public.meal_plan_entries (household_id, local_id, owner_profile_id, meal_date, title, category_id, scope, producer)
    SELECT hm.household_id, v.local_id, CASE WHEN v.scope = 'personal' THEN '${uid}'::uuid END, v.d::date, v.title, c.id, v.scope, 'user-action'
    FROM public.household_members hm
    JOIN public.household_categories c ON c.household_id = hm.household_id AND c.local_id = 'cat-meals'
    CROSS JOIN (VALUES ('meal-1','Tacos','2026-09-22','household'), ('meal-2','Soup','2026-09-23','household'), ('meal-3','Private plan','2026-09-24','personal')) AS v(local_id, title, d, scope)
    WHERE hm.profile_id = '${uid}' AND hm.role = 'owner';`, { label: 'ENV E meals' });

  const census = () => scalar(db, `SELECT (SELECT count(*) FROM public.households) || '/' || (SELECT count(*) FROM public.household_members) || '/' || (SELECT count(*) FROM public.meal_plan_entries) || '/' || (SELECT count(*) FROM public.household_categories);`);
  const rowDigest = () => scalar(db, "SELECT md5(string_agg(to_jsonb(m)::text, '|' ORDER BY m.id)) FROM public.meal_plan_entries m;");
  const before = { census: census(), meals: rowDigest() };
  check('ENV E: the database is genuinely populated before the upgrade (1 household, 3 meal plans)', /^1\/1\/3\/8$/.test(before.census), before.census);

  // Rollback assumption, proven: dropping the columns is possible and loses only the columns.
  const probe = scalar(db, "BEGIN; ALTER TABLE public.meal_plan_entries ADD COLUMN meal_slot text; ALTER TABLE public.meal_plan_entries DROP COLUMN meal_slot; SELECT count(*) FROM public.meal_plan_entries; ROLLBACK;").split('\n').map((l) => l.trim()).find((l) => /^\d+$/.test(l));
  check('ENV E: rollback assumption - adding then dropping a column keeps every meal plan (and is undone by the ROLLBACK here)', probe === '3', probe);

  applyF08(db, { label: 'ENV E f08 upgrade' });
  check('ENV E: the additive migration applies to a populated database (no interlock, no abort)', true);

  check('ENV E: nothing was lost - every table keeps its row count', census() === before.census, `${before.census} -> ${census()}`);
  check('ENV E: no existing meal plan was rewritten (each row is byte-identical apart from the two new columns)',
        scalar(db, "SELECT md5(string_agg((to_jsonb(m) - 'meal_slot' - 'status')::text, '|' ORDER BY m.id)) FROM public.meal_plan_entries m;") === before.meals);
  check('ENV E: EVERY pre-existing plan reads as a live plan with no stated slot - unspecified and active, never a guessed dinner',
        scalar(db, "SELECT count(*) FILTER (WHERE meal_slot = 'unspecified' AND status = 'active') || '/' || count(*) FROM public.meal_plan_entries;") === '3/3');
  check('ENV E: no existing plan gained a revision bump or a new updated_at from the upgrade (the upgrade fired no update)',
        scalar(db, "SELECT count(*) FILTER (WHERE revision = 1) || '/' || count(*) FROM public.meal_plan_entries;") === '3/3');

  // The upgraded database works: the owner archives a pre-existing plan and the server counts it.
  const archived = psql(db, `BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${uid}"}';
    UPDATE public.meal_plan_entries SET status = 'archived', meal_slot = 'dinner' WHERE local_id = 'meal-1';
    SELECT status || '/' || meal_slot || '/' || revision FROM public.meal_plan_entries WHERE local_id = 'meal-1';
    COMMIT;`, { label: 'ENV E archive' }).out;
  check('ENV E: the owner can archive and re-slot a pre-existing plan, and the server bumps its revision',
        archived.split('\n').some((line) => line.trim() === 'archived/dinner/2'), archived.split('\n').map((l) => l.trim()).filter(Boolean).slice(-2).join(' | '));
  check('ENV E: RLS is enabled on every public table after the upgrade', scalar(db, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;") === '0');
  check('ENV E: the fail-closed assertion passes on the upgraded database', psql(db, 'SELECT private.assert_app_schema_secured();').ok);
  check('ENV E: no client role gained a privilege it should not have (anon and PUBLIC have nothing on the new columns)',
        scalar(db, "select count(*) from information_schema.column_privileges where table_schema='public' and table_name='meal_plan_entries' and column_name in ('meal_slot','status') and grantee in ('anon','PUBLIC');") === '0');
}

// ------------------------------------------- LOCAL STACK SCHEMA CURRENCY ----
/**
 * The sync journeys talk to the REAL local Supabase stack (real HTTP, real PostgREST), which serves the container's default
 * database, not one of the disposable b4_* ones. That database must carry every migration in supabase/migrations, or the
 * journeys would silently test a stale schema. `supabase db reset` would replay them all, but it is destructive to a database
 * other worktrees share, so the additive IR01 migration is applied directly when it is missing. It only ADDS a nullable column
 * and replaces one function body; it removes and rewrites nothing.
 */
function ensureLocalStackCurrent(db = 'postgres', { requireMeals = false } = {}) {
  const has = (table, column) => scalar(db, `select count(*) from information_schema.columns where table_schema='public' and table_name='${table}' and column_name='${column}';`) === '1';
  const f05Probe = "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'push_household_child';";
  // Only the shared default database is ever "brought current", and only by the older IR01 and F05 steps. Feature 08 NEVER migrates it:
  // other sessions verify that database against the IR01 fingerprint. The journeys that need meal columns use a private stack instead.
  if (db === 'postgres' && !has('tasks', 'duration_source')) {
    console.log('  local stack database predates the IR01 migration: applying the additive migration to it');
    applyIr01('postgres', { label: 'local stack IR01' });
  }
  // F05 (a child after binding) is one new function and one replaced function: nothing in it can lose or rewrite a row, and it
  // is applied only to THIS local database, never to a remote project.
  if (db === 'postgres' && scalar('postgres', f05Probe) !== '1') {
    console.log('  local stack database predates the F05 migration: applying the additive migration to it');
    applyF05('postgres', { label: 'local stack F05' });
  }
  check(`local stack (${db}): the database the sync journeys run against carries the additive IR01 migration`, has('tasks', 'duration_source'));
  if (db === 'postgres') {
    check('local stack: the database the sync journeys run against carries the additive F05 migration', scalar('postgres', f05Probe) === '1');
  }
  if (requireMeals) {
    check(`local stack (${db}): ...and the F08 meal columns (this harness never migrates the shared default database; the journeys use the private stack unless HERKEYS_SHARED_STACK=1)`,
          has('meal_plan_entries', 'meal_slot') && has('meal_plan_entries', 'status'));
  }
}

/**
 * The API the journeys talk to. By default a PRIVATE stack (scratch database f08_stack and its own PostgREST, private-stack.mjs), so a
 * migrated schema is proven over real HTTP without touching the shared database. HERKEYS_SHARED_STACK=1 uses the shared one instead.
 */
let privateStack = null;
async function startJourneyStack() {
  if (process.env.HERKEYS_SHARED_STACK === '1') {
    ensureLocalStackCurrent(process.env.HERKEYS_LOCAL_STACK_DB ?? 'postgres', { requireMeals: true });
    return;
  }
  const { startPrivateStack } = await import(`file://${join(HERE, 'private-stack.mjs')}`);
  console.log('\n  starting the private API stack (scratch database f08_stack + its own PostgREST); the shared database is not touched');
  privateStack = await startPrivateStack();
  // Read by the journeys when they load, which is after this line.
  process.env.HERKEYS_LOCAL_API_URL = privateStack.apiUrl;
  process.env.HERKEYS_LOCAL_STACK_DB = privateStack.database;
  ensureLocalStackCurrent(privateStack.database, { requireMeals: true });
}

// ------------------------------------------------------------------ main ----
const only = process.argv[2];
console.log(`Her Keys local backend harness — container ${CONTAINER} (LOCAL ONLY, no remote project is contacted)`);

// Ad-hoc databases from a manual investigation are dropped here, so a probe
// can never be mistaken later for unexplained local state. Durable evidence
// belongs in this directory, not in a leftover database.
for (const stray of [dbName('probe'), dbName('fp_pre'), dbName('fp_post'), dbName('env_b3')]) {
  admin(`DROP DATABASE IF EXISTS ${stray} WITH (FORCE);`);
}

try {
  if (only === 'f08') {
    // Feature 08 (meals) evidence on its own: the migration gate, a fresh install, an upgrade of a populated database, and the
    // real-role RLS attacks (suite 77). It never touches the shared default database, so it needs no coordination with other sessions.
    migrationQuality();
    envA();
    envE();
    envC('77');
  }
  if (!only) {
    migrationQuality();
    envA();
    envB();
    envB3();
    envD();
    envE();
  }
  // The Kids journey runs against the local stack's default database, exactly as the composition journey does; it needs no ENV C.
  // Feature 08 (meals) already ran its own ENV C (suite 77), scoped to its own migration, above; it is not re-run here.
  if (only === 'people') {
    // HK-FEATURE-13 (People OS) evidence on its own: the migration gate, a fresh install, the populated upgrade (ENV D ends with
    // F13), the People suites (79-f13-*) in ENV C, and the People journeys over real HTTP on a private stack.
    migrationQuality();
    envA();
    envD();
    envC('79');
    await startJourneyStack();
    const { peopleJourneys } = await import(`file://${join(HERE, 'journey-people.mjs')}`);
    await peopleJourneys(check, psql);
  }
  // The Me / Rebuild journey (HK-FEATURE-11) needs no ENV C either; its RLS matrix is ENV C suite 78, run with the others.
  if (only !== 'kids' && only !== 'f08' && only !== 'rebuild' && only !== 'people') envC(only);
  if (!only || only === 'parity') {
    const { authorizationParity } = await import(`file://${join(HERE, 'authorization-parity.mjs')}`);
    await authorizationParity(check, psql, dbName('env_c'));
  }
  if (!only) await clientPayloadIntegration();
  if (only === 'composition') {
    await startJourneyStack();
    const { productionCompositionJourneys } = await import(`file://${join(HERE, 'journey-composition.mjs')}`);
    await productionCompositionJourneys(check, psql);
  }
  if (only === 'kids') {
    ensureLocalStackCurrent();
    const { kidsJourneys } = await import(`file://${join(HERE, 'journey-kids.mjs')}`);
    await kidsJourneys(check, psql);
  }
  if (only === 'home') {
    ensureLocalStackCurrent();
    const { homeJourneys } = await import(`file://${join(HERE, 'journey-home.mjs')}`);
    await homeJourneys(check, psql);
  }
  if (only === 'rebuild') {
    // Always the private stack: the journey needs the F11 migration, and the shared default database is never migrated by it.
    await startJourneyStack();
    const { rebuildJourneys } = await import(`file://${join(HERE, 'journey-rebuild.mjs')}`);
    await rebuildJourneys(check, psql);
  }
  if (only === 'journeys' || !only) {
    await startJourneyStack();
    const { syncIntegration } = await import(`file://${join(HERE, 'sync-integration.mjs')}`);
    await syncIntegration(check, psql);
    const { productionCompositionJourneys } = await import(`file://${join(HERE, 'journey-composition.mjs')}`);
    await productionCompositionJourneys(check, psql);
    const { kidsJourneys } = await import(`file://${join(HERE, 'journey-kids.mjs')}`);
    await kidsJourneys(check, psql);
    const { homeJourneys } = await import(`file://${join(HERE, 'journey-home.mjs')}`);
    await homeJourneys(check, psql);
    const { rebuildJourneys } = await import(`file://${join(HERE, 'journey-rebuild.mjs')}`);
    await rebuildJourneys(check, psql);
    // HK-FEATURE-12: Life Admin records, their Tasks and links over real HTTP, including a same-household member's hydration.
    const { lifeAdminJourneys } = await import(`file://${join(HERE, 'journey-life-admin.mjs')}`);
    await lifeAdminJourneys(check, psql);
    // HK-FEATURE-13 (People OS).
    const { peopleJourneys } = await import(`file://${join(HERE, 'journey-people.mjs')}`);
    await peopleJourneys(check, psql);
  }
  if (privateStack) await privateStack.stop();
} catch (err) {
  console.error(`\nHARNESS ERROR: ${err.message}`);
  if (privateStack) await privateStack.stop().catch(() => {});
  process.exit(1);
}

console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
