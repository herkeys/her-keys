#!/usr/bin/env node
// HK-FEATURE-13 (People OS) — the F13 backend suites in a PRIVATE scratch database.
//
// Why a private database: `run.mjs` recreates fixed-name databases (b4_env_*) in the one local container every Her Keys worktree
// shares, so two sessions running it at once destroy each other's run. This runner owns databases named `f13_*` and nothing else. It
// builds one with the ENV C sequence (auth stub, test helpers, baseline, Build 4, IR01, F08, F05, then every F13 migration — files
// named *_f13_*.sql — in timestamp order, migrated while EMPTY), then test defaults and the identity fixtures, and runs the numbered
// suites asked for. It never touches the default `postgres` database and never drops a database it did not create.
//
//   node supabase/tests/run-f13.mjs              every numbered suite whose name contains "f13"
//   node supabase/tests/run-f13.mjs 79           suites whose name starts with 79
//   node supabase/tests/run-f13.mjs --all        every numbered suite (the whole ENV C set) in the private database
//   HERKEYS_F13_NO_MIGRATION=1 ...               the WAVE3_BASE schema only (the Phase A probes run against the base, before F13 exists)
//
// Suites print `PASS | ...` / `FAIL | ...` (checks) and `NOTE | ...` (characterisation evidence, echoed, never counted as a pass).
// HERKEYS_F13_MUTANT_SQL (test-the-test only) is applied after the fixtures and before the suites.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';
const DB = process.env.HERKEYS_F13_DB ?? 'f13_env';
const MIGRATIONS = join(REPO, 'supabase', 'migrations');

if (!/^f13_[a-z0-9_]+$/.test(DB)) throw new Error(`refusing to use database "${DB}": this runner only owns databases named f13_*`);

const ENV = { ...process.env, MSYS_NO_PATHCONV: '1' };
const docker = (args, input) =>
  execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024, env: ENV });
const admin = (sql) => docker(['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]);
function psql(sql, label) {
  try {
    return docker(['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB, '-f', '-'], sql);
  } catch (err) {
    throw new Error(`${label} failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  }
}
const scalar = (sql) => docker(['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB, '-Atc', sql]).trim();

/** The shipped WAVE3_BASE sequence, in the order run.mjs applies it. */
export const SHIPPED = [
  '20260919230054_build4_baseline.sql',
  '20260919231500_build4_cloud_schema.sql',
  '20260921120000_ir01_duration_source_and_claim_v3.sql',
  '20260921160000_f08_meal_slot_and_status.sql',
  '20260921190000_f05_add_child_after_binding.sql',
];
export const F13_MIGRATIONS = readdirSync(MIGRATIONS).filter((f) => /_f13_.*\.sql$/.test(f)).sort();

const arg = process.argv[2];
const matches = (f) => (arg === '--all' ? true : arg ? f.startsWith(arg) : f.includes('f13'));
const withF13 = process.env.HERKEYS_F13_NO_MIGRATION !== '1';

let failures = 0;
let passes = 0;
let notes = 0;

admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE);`);
admin(`CREATE DATABASE ${DB};`);
psql(readFileSync(join(HERE, 'helpers', '00-auth-stub.sql'), 'utf8'), 'auth stub');
psql(readFileSync(join(HERE, 'helpers', '01-test-helpers.sql'), 'utf8'), 'test helpers');
const sequence = [...SHIPPED, ...(withF13 ? F13_MIGRATIONS : [])];
for (const file of sequence) psql(readFileSync(join(MIGRATIONS, file), 'utf8'), file);
console.log(`${DB}: migrated while empty (${SHIPPED.length} shipped + ${withF13 ? F13_MIGRATIONS.length : 0} F13${withF13 && F13_MIGRATIONS.length ? `: ${F13_MIGRATIONS.join(', ')}` : ''})`);
psql(readFileSync(join(HERE, 'helpers', '05-test-defaults.sql'), 'utf8'), 'test defaults');
psql(`BEGIN;\n${readFileSync(join(HERE, 'helpers', '10-fixtures.sql'), 'utf8')}\nCOMMIT;`, 'fixtures');
if (scalar('select count(*) from public.households;') !== '2') throw new Error('identity fixtures did not create two households');
if (process.env.HERKEYS_F13_MUTANT_SQL) psql(process.env.HERKEYS_F13_MUTANT_SQL, 'F13 mutant');

const files = readdirSync(HERE).filter((f) => /^\d\d-.*\.sql$/.test(f)).filter(matches).sort();
if (files.length === 0) throw new Error(`no numbered suite matches ${arg ?? '"f13"'}`);
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
    if (note) {
      notes += 1;
      console.log(`  note  ${note[1]}`);
    }
  }
}

if (process.env.HERKEYS_F13_KEEP !== '1') admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE);`);
console.log(`\nF13 backend: ${passes} passed, ${failures} failed (${passes + failures} checks, ${notes} notes, ${files.length} suite${files.length === 1 ? '' : 's'})`);
process.exit(failures === 0 ? 0 : 1);
