#!/usr/bin/env node
// HK-FEATURE-12 (Life Admin / Documents) — the F12 backend suites in a PRIVATE scratch database.
//
// Why a private database: `run.mjs` recreates fixed-name databases (b4_env_*) in the one local container every Her Keys worktree
// shares, so two sessions running it at once destroy each other's run. This runner builds `f12_env` with the SAME sequence as ENV C
// (auth stub, helpers, baseline, Build 4, IR01, F08, F05, then any F12 migration, then test defaults and the identity fixtures,
// migrated while empty) and runs only the numbered suites it is asked for. It never touches the default `postgres` database and
// never drops a database it did not create.
//
//   node supabase/tests/run-f12.mjs            every numbered suite whose name contains "f12"
//   node supabase/tests/run-f12.mjs 78         suites whose name starts with 78
//   node supabase/tests/run-f12.mjs --all      every numbered suite (the whole ENV C set) in the private database
//
// Lines a suite prints as `PASS | ...` / `FAIL | ...` are checks; `NOTE | ...` lines are characterisation evidence and are echoed.
// HERKEYS_F12_MUTANT_SQL (test-the-test only) is applied after the fixtures, exactly like run.mjs's HERKEYS_MUTANT_SQL.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';
const DB = process.env.HERKEYS_F12_DB ?? 'f12_env';
const MIGRATIONS = join(REPO, 'supabase', 'migrations');

if (!/^f12_[a-z0-9_]+$/.test(DB)) throw new Error(`refusing to use database "${DB}": the F12 runner only owns databases named f12_*`);

const docker = (args, input) =>
  execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const admin = (sql) => docker(['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]);
function psql(sql, label) {
  try {
    return docker(['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB, '-f', '-'], sql);
  } catch (err) {
    throw new Error(`${label} failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  }
}
const scalar = (sql) => docker(['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB, '-Atc', sql]).trim();

// The shipped sequence, in order, then any F12 migration (named *_f12_*.sql) in timestamp order.
const SHIPPED = [
  '20260919230054_build4_baseline.sql',
  '20260919231500_build4_cloud_schema.sql',
  '20260921120000_ir01_duration_source_and_claim_v3.sql',
  '20260921160000_f08_meal_slot_and_status.sql',
  '20260921190000_f05_add_child_after_binding.sql',
];
const F12_MIGRATIONS = readdirSync(MIGRATIONS).filter((f) => /_f12_.*\.sql$/.test(f)).sort();

const arg = process.argv[2];
const matches = (f) => (arg === '--all' ? true : arg ? f.startsWith(arg) : f.includes('f12'));

let failures = 0;
let passes = 0;

// `journey`: the Life Admin journey over REAL HTTP, against a private stack with F12-only names (its own scratch database and its
// own PostgREST container on its own ports), so it can never drop or migrate another session's database, stack or the shared one.
if (arg === 'journey') {
  process.env.HERKEYS_PRIVATE_DB = 'f12_stack';
  process.env.HERKEYS_PRIVATE_REST_NAME = 'f12_postgrest';
  process.env.HERKEYS_PRIVATE_REST_PORT = process.env.HERKEYS_PRIVATE_REST_PORT ?? '54397';
  process.env.HERKEYS_PRIVATE_API_PORT = process.env.HERKEYS_PRIVATE_API_PORT ?? '54398';
  const { startPrivateStack } = await import('./private-stack.mjs');
  const stack = await startPrivateStack();
  process.env.HERKEYS_LOCAL_API_URL = stack.apiUrl;
  process.env.HERKEYS_LOCAL_STACK_DB = stack.database;
  const check = (name, condition, detail = '') => {
    if (condition) passes += 1;
    else failures += 1;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'}  ${name}${!condition && detail ? `  — ${detail}` : ''}`);
  };
  const psqlIn = (db, sql, { expectFailure = false, label = '' } = {}) => {
    try {
      const out = docker(['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-f', '-'], sql);
      if (expectFailure) return { ok: false, out: `${label}: expected failure, but the statement succeeded` };
      return { ok: true, out };
    } catch (err) {
      const text = `${err.stdout ?? ''}${err.stderr ?? ''}`;
      if (expectFailure) return { ok: false, out: text };
      throw new Error(`${label || db} failed:\n${text}`);
    }
  };
  try {
    const { lifeAdminJourneys } = await import('./journey-life-admin.mjs');
    await lifeAdminJourneys(check, psqlIn);
  } finally {
    await stack.stop();
  }
  console.log(`\nF12 journey: ${passes} passed, ${failures} failed (${passes + failures} checks)`);
  process.exit(failures === 0 ? 0 : 1);
}

admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE);`);
admin(`CREATE DATABASE ${DB};`);
psql(readFileSync(join(HERE, 'helpers', '00-auth-stub.sql'), 'utf8'), 'auth stub');
psql(readFileSync(join(HERE, 'helpers', '01-test-helpers.sql'), 'utf8'), 'test helpers');
for (const file of [...SHIPPED, ...F12_MIGRATIONS]) psql(readFileSync(join(MIGRATIONS, file), 'utf8'), file);
console.log(`${DB}: migrated while empty (${SHIPPED.length} shipped + ${F12_MIGRATIONS.length} F12: ${F12_MIGRATIONS.join(', ') || 'none'})`);
psql(readFileSync(join(HERE, 'helpers', '05-test-defaults.sql'), 'utf8'), 'test defaults');
psql(`BEGIN;\n${readFileSync(join(HERE, 'helpers', '10-fixtures.sql'), 'utf8')}\nCOMMIT;`, 'fixtures');
if (scalar('select count(*) from public.households;') !== '2') throw new Error('identity fixtures did not create two households');
if (process.env.HERKEYS_F12_MUTANT_SQL) psql(process.env.HERKEYS_F12_MUTANT_SQL, 'F12 mutant');

const files = readdirSync(HERE).filter((f) => /^\d\d-.*\.sql$/.test(f)).filter(matches).sort();
if (files.length === 0) throw new Error(`no numbered suite matches ${arg ?? '"f12"'}`);
for (const file of files) {
  console.log(`\n  ${file}`);
  const out = psql(readFileSync(join(HERE, file), 'utf8'), file);
  for (const line of out.split('\n')) {
    const check = line.match(/^\s*(PASS|FAIL)\s*\|\s*(.+?)\s*$/);
    if (check) {
      if (check[1] === 'PASS') passes += 1;
      else failures += 1;
      console.log(`  ${check[1] === 'PASS' ? 'ok  ' : 'FAIL'}  ${check[2]}`);
      continue;
    }
    const note = line.match(/^\s*NOTE\s*\|\s*(.+?)\s*$/);
    if (note) console.log(`  note  ${note[1]}`);
  }
}

if (process.env.HERKEYS_F12_KEEP !== '1') admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE);`);
console.log(`\nF12 backend: ${passes} passed, ${failures} failed (${passes + failures} checks, ${files.length} suite${files.length === 1 ? '' : 's'})`);
process.exit(failures === 0 ? 0 : 1);
