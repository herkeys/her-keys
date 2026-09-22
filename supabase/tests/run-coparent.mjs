#!/usr/bin/env node
// Her Keys — Feature 07 (Co-Parent Logistics) real-database journey runner.
//
// LOCAL ONLY. It talks to the local Supabase stack (real HTTP / PostgREST / RLS) and the container's default `postgres` database.
// Additive: it creates fresh random users and households, and it never drops or recreates a database, never resets the stack and
// never contacts a remote project. It exists beside `run.mjs` (which is a shared file this feature does not edit); it is NOT a
// replacement for it, and it must not be run at the same moment as `run.mjs` in another session (both use the shared container).
//
//   node supabase/tests/run-coparent.mjs

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';

let failures = 0;
const results = [];

function psql(db, sql, { expectFailure = false, label = '' } = {}) {
  try {
    const out = execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-f', '-'], {
      input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    });
    if (expectFailure) throw new Error(`${label}: expected failure, but the statement succeeded`);
    return { ok: true, out };
  } catch (err) {
    const text = `${err.stdout ?? ''}${err.stderr ?? ''}` || String(err.message);
    if (expectFailure) return { ok: false, out: text };
    throw new Error(`${label || db} failed:\n${text}`);
  }
}

function scalar(db, sql) {
  return execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-Atc', sql], { encoding: 'utf8' }).trim();
}

function check(name, condition, detail = '') {
  if (!condition) failures += 1;
  results.push({ name, ok: Boolean(condition) });
  console.log(`  ${condition ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

console.log(`Her Keys Feature 07 journey — container ${CONTAINER} (LOCAL ONLY, no remote project is contacted)`);

// The stack must already carry the additive IR01 migration (this runner never applies anything).
const probe = "select count(*) from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='duration_source';";
check('local stack: the database carries the additive IR01 migration (this runner applies nothing)', scalar('postgres', probe) === '1');

try {
  const { coparentJourneys } = await import(`file://${join(HERE, 'journey-coparent.mjs')}`);
  await coparentJourneys(check, psql);
} catch (err) {
  console.error(`\nHARNESS ERROR: ${err.stack ?? err.message}`);
  process.exit(1);
}

console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
