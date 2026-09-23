#!/usr/bin/env node
// HK-FEATURE-13 (People OS) — the F13 backend suites in a PRIVATE scratch database.
//
// Why a private database: `run.mjs` recreates fixed-name databases (b4_env_*) in the one local container every Her Keys worktree
// shares, so two sessions running it at once destroy each other's run. This runner owns databases named `f13_*` and nothing else. It
// builds one with the ENV C sequence (auth stub, test helpers, then the WHOLE migration chain from migration-chain.mjs, migrated while
// EMPTY), then test defaults and the identity fixtures, and runs the numbered suites asked for. It never touches the default `postgres`
// database and never drops a database it did not create. (Before the F01-F13 integration it applied WAVE3_BASE plus F13 only.)
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
import { BASELINE, FULL_CHAIN, SHIPPING, WAVE3_BASE_CHAIN, migrationPath } from './migration-chain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';
const DB = process.env.HERKEYS_F13_DB ?? 'f13_env';

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

/** The WAVE3_BASE sequence (what HERKEYS_F13_NO_MIGRATION=1 builds, for the Phase A probes against the base). */
const WAVE3_BASE_SEQUENCE = [BASELINE, SHIPPING, ...WAVE3_BASE_CHAIN.map((m) => m.file)];

const arg = process.argv[2];
const matches = (f) => (arg === '--all' ? true : arg ? f.startsWith(arg) : f.includes('f13'));
const withF13 = process.env.HERKEYS_F13_NO_MIGRATION !== '1';

let failures = 0;
let passes = 0;
let notes = 0;

// --journeys: the People journeys over real HTTP on a PRIVATE stack (database f13_stack, container f13_postgrest, private ports), so
// they never touch the fixed b4_env_* databases or the shared default database another session may be using.
if (arg === '--journeys') {
  process.env.HERKEYS_PRIVATE_STACK_DB ??= 'f13_stack';
  process.env.HERKEYS_PRIVATE_REST_NAME ??= 'f13_postgrest';
  process.env.HERKEYS_PRIVATE_REST_PORT ??= '54491';
  process.env.HERKEYS_PRIVATE_API_PORT ??= '54492';
  const { startPrivateStack } = await import(`file://${join(HERE, 'private-stack.mjs')}`);
  const stack = await startPrivateStack();
  process.env.HERKEYS_LOCAL_API_URL = stack.apiUrl;
  process.env.HERKEYS_LOCAL_STACK_DB = stack.database;
  const check = (name, ok, detail = '') => {
    if (ok) passes += 1;
    else failures += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  };
  const stackPsql = (db, sql, { label = '' } = {}) => {
    try {
      return { ok: true, out: docker(['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-f', '-'], sql) };
    } catch (err) {
      throw new Error(`${label} failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
    }
  };
  try {
    const { peopleJourneys } = await import(`file://${join(HERE, 'journey-people.mjs')}`);
    await peopleJourneys(check, stackPsql);
  } finally {
    await stack.stop();
  }
  console.log(`\nF13 journeys: ${passes} passed, ${failures} failed (${passes + failures} checks)`);
  process.exit(failures === 0 ? 0 : 1);
}

admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE);`);
admin(`CREATE DATABASE ${DB};`);
psql(readFileSync(join(HERE, 'helpers', '00-auth-stub.sql'), 'utf8'), 'auth stub');
psql(readFileSync(join(HERE, 'helpers', '01-test-helpers.sql'), 'utf8'), 'test helpers');
const sequence = withF13 ? FULL_CHAIN : WAVE3_BASE_SEQUENCE;
for (const file of sequence) psql(readFileSync(migrationPath(file), 'utf8'), file);
console.log(`${DB}: migrated while empty (${withF13 ? 'the whole chain' : 'WAVE3_BASE only'}: ${sequence.length} migrations, ending ${sequence.at(-1)})`);
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
