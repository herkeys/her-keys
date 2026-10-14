#!/usr/bin/env node
// Her Keys Premium Stage 1 — the Premium backend suites in a PRIVATE scratch database.
//
// Owns databases named `p1_*` and nothing else, so it never collides with run.mjs (b4_env_*) or any sibling session's runner. It
// builds one with the ENV C sequence (auth stub, test helpers, the WHOLE migration chain while empty, test defaults, identity
// fixtures), then runs the numbered suites whose name contains "premium" (or the prefix given), and drops the database.
//
//   node supabase/tests/run-premium.mjs              every numbered suite whose name contains "premium"
//   node supabase/tests/run-premium.mjs 82           suites whose name starts with 82
//   node supabase/tests/run-premium.mjs --concurrency  real multi-connection quota/idempotency races (parallel psql sessions)
//   HERKEYS_P1_KEEP=1 ...                            keep the database for inspection
//   HERKEYS_P1_MUTANT_SQL=...                        test-the-test only: applied after the fixtures, before the suites
//
// Suites print `PASS | ...` / `FAIL | ...` (counted) and `NOTE | ...` (echoed, never counted).
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FULL_CHAIN, migrationPath } from './migration-chain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';
const DB = process.env.HERKEYS_P1_DB ?? 'p1_premium';
if (!/^p1_[a-z0-9_]+$/.test(DB)) throw new Error(`refusing to use database "${DB}": this runner only owns databases named p1_*`);

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

/** One psql session run asynchronously, so several can genuinely overlap (each is its own backend connection). */
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const child = execFile(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB, '-At', '-f', '-'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: ENV },
      (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr }),
    );
    child.stdin.end(sql);
  });
}

const arg = process.argv[2];
let passes = 0;
let failures = 0;
let notes = 0;
const check = (name, ok, detail = '') => {
  if (ok) passes += 1;
  else failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};

admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE);`);
admin(`CREATE DATABASE ${DB};`);
psql(readFileSync(join(HERE, 'helpers', '00-auth-stub.sql'), 'utf8'), 'auth stub');
psql(readFileSync(join(HERE, 'helpers', '01-test-helpers.sql'), 'utf8'), 'test helpers');
for (const file of FULL_CHAIN) psql(readFileSync(migrationPath(file), 'utf8'), file);
console.log(`${DB}: migrated while empty (the whole chain: ${FULL_CHAIN.length} migrations, ending ${FULL_CHAIN.at(-1)})`);
psql(readFileSync(join(HERE, 'helpers', '05-test-defaults.sql'), 'utf8'), 'test defaults');
psql(`BEGIN;\n${readFileSync(join(HERE, 'helpers', '10-fixtures.sql'), 'utf8')}\nCOMMIT;`, 'fixtures');
psql(readFileSync(join(HERE, 'helpers', '30-premium-fixtures.sql'), 'utf8'), 'premium fixtures');
if (process.env.HERKEYS_P1_MUTANT_SQL) psql(process.env.HERKEYS_P1_MUTANT_SQL, 'P1 mutant');

try {
  if (arg === '--concurrency') {
    const { premiumConcurrency } = await import(`file://${join(HERE, 'premium-concurrency.mjs')}`);
    await premiumConcurrency({ check, psql, scalar, psqlAsync });
  } else {
    const matches = (f) => (arg ? f.startsWith(arg) : f.includes('premium'));
    const files = readdirSync(HERE).filter((f) => /^\d\d-.*\.sql$/.test(f)).filter(matches).sort();
    if (files.length === 0) throw new Error(`no numbered suite matches ${arg ?? '"premium"'}`);
    for (const file of files) {
      console.log(`\n  ${file}`);
      const out = psql(readFileSync(join(HERE, file), 'utf8'), file);
      for (const line of out.split('\n')) {
        const result = line.match(/^\s*(PASS|FAIL)\s*\|\s*(.+?)\s*$/);
        if (result) {
          check(result[2], result[1] === 'PASS');
          continue;
        }
        const note = line.match(/^\s*NOTE\s*\|\s*(.+?)\s*$/);
        if (note) {
          notes += 1;
          console.log(`  note  ${note[1]}`);
        }
      }
    }
  }
} finally {
  if (process.env.HERKEYS_P1_KEEP !== '1') admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE);`);
}
console.log(`\nPremium backend: ${passes} passed, ${failures} failed (${passes + failures} checks, ${notes} notes)`);
process.exit(failures === 0 ? 0 : 1);
