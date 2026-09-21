#!/usr/bin/env node
/**
 * HK-FEATURE-08-MEALS — derive the schema fingerprint the additive migration produces, WITHOUT touching the shared local database.
 *
 * Why derived: the shared default database (`postgres` in container supabase_db_Her_Keys) is read by every parallel Her Keys session
 * against the IR01 baseline. Applying Feature 08's migration there would flip their fingerprint check to MISMATCH. A scratch database
 * built with the harness sequence cannot stand in directly either, because a bare CREATE DATABASE lacks the seven Supabase-init
 * privilege facts that only the default database carries (see local-fingerprint notes: 3606 facts, not 3617).
 *
 * So the derivation is checked at every step instead of assumed:
 *   1. Build two scratch databases with the harness sequence: PRE (through IR01) and POST (PRE plus the F08 migration).
 *   2. Diff their `detail` lines. The migration must add EXACTLY the intended facts: 2 columns, 2 constraints, 4 column privileges,
 *      and nothing else, removing nothing.
 *   3. Read the default database's `detail` lines (SELECT only). Recompute every dimension digest in Node and require it to equal the
 *      committed IR01 baseline — proving the Node digest is the tool's digest.
 *   4. Apply the verified delta to the default database's lines and recompute: that is the fingerprint a default-equivalent database
 *      holds once the migration is applied.
 *
 *   node supabase/tools/f08-fingerprint.mjs derive            check everything, print the derivation, write nothing
 *   node supabase/tools/f08-fingerprint.mjs derive --write    also write supabase/tools/baselines/f08-local-fingerprint.json
 *   add --keep to leave the scratch databases (f08_fp_pre, f08_fp_post) for inspection
 *
 * LOCAL ONLY. It creates and drops only the two databases it names. It never contacts a remote project.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';
const PRE = 'f08_fp_pre';
const POST = 'f08_fp_post';
const BASELINE_JSON = join(HERE, 'baselines', 'ir01-local-fingerprint.json');
const OUT_JSON = join(HERE, 'baselines', 'f08-local-fingerprint.json');

const migration = (name) => join(REPO, 'supabase', 'migrations', name);
const helper = (name) => join(REPO, 'supabase', 'tests', 'helpers', name);
const SEQUENCE = [
  helper('00-auth-stub.sql'),
  helper('01-test-helpers.sql'),
  migration('20260919230054_build4_baseline.sql'),
  migration('20260919231500_build4_cloud_schema.sql'),
  migration('20260921120000_ir01_duration_source_and_claim_v3.sql'),
];
const F08 = migration('20260921160000_f08_meal_slot_and_status.sql');

/** The dimensions the migration is expected to move, and by how much. Anything else moving is drift. */
const EXPECTED_ADDED = { columns: 2, constraints: 2, 'privileges.columns': 4 };

const { buildSql } = await import(pathToFileURL(join(HERE, 'schema-fingerprint.mjs')).href);

const docker = (args, input) =>
  execFileSync('docker', ['exec', '-i', CONTAINER, ...args], { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const admin = (sql) => docker(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]);
const applyFile = (db, file) => docker(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-f', '-'], readFileSync(file, 'utf8'));

function scratch(db, files) {
  if (!/^f08_fp_(pre|post)$/.test(db)) throw new Error(`refusing to touch database ${db}`);
  admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  admin(`CREATE DATABASE ${db};`);
  for (const file of files) applyFile(db, file);
}

/**
 * [dimension, line] pairs. Records are NUL-separated (psql -0) because some facts (a policy or function definition) span several
 * lines, and the tool's digest hashes the whole multi-line value; the first pipe splits dimension from line, which may itself hold one.
 * `-q` drops the BEGIN/SET/ROLLBACK command tags, and a record that does not open with a dimension name is not a fact.
 */
function detailRows(db) {
  const out = docker(['psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-At', '-0', '-F', '|', '-f', '-'], buildSql('detail'));
  return out
    .split(String.fromCharCode(0))
    .filter((record) => /^[a-z_.]+[|]/.test(record))
    .map((record) => {
      const at = record.indexOf('|');
      return [record.slice(0, at), record.slice(at + 1)];
    });
}

const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const md5 = (text) => createHash('md5').update(text, 'utf8').digest('hex');

/** The tool's digest: md5 of the lines of one dimension, ordered by COLLATE "C" (byte order), joined by a newline. */
function digestsOf(rows) {
  const dims = new Map();
  for (const [dimension, line] of rows) {
    if (!dims.has(dimension)) dims.set(dimension, []);
    dims.get(dimension).push(line);
  }
  const dimensions = {};
  for (const [dimension, lines] of [...dims].sort((a, b) => byBytes(a[0], b[0]))) {
    dimensions[dimension] = { items: lines.length, digest: md5([...lines].sort(byBytes).join('\n')) };
  }
  const gated = Object.entries(dimensions).filter(([name]) => !name.startsWith('info.'));
  const gating = { items: gated.reduce((sum, [, v]) => sum + v.items, 0), digest: md5(gated.map(([name, v]) => `${name}=${v.digest}`).join('\n')) };
  return { dimensions, gating };
}

const count = (rows, dimension) => rows.filter(([d]) => d === dimension).length;
const SEP = String.fromCharCode(0);
const key = ([d, l]) => d + SEP + l;

function diffRows(before, after) {
  const b = new Set(before.map(key));
  const a = new Set(after.map(key));
  return { added: after.filter((r) => !b.has(key(r))), removed: before.filter((r) => !a.has(key(r))) };
}

function derive({ write, keep }) {
  console.log('1. building scratch databases with the harness sequence (local container, two databases named f08_fp_*)');
  scratch(PRE, SEQUENCE);
  scratch(POST, [...SEQUENCE, F08]);

  console.log('2. what the migration adds, measured on the scratch pair');
  const pre = detailRows(PRE);
  const post = detailRows(POST);
  const { added, removed } = diffRows(pre, post);
  const addedBy = {};
  for (const [d] of added) addedBy[d] = (addedBy[d] ?? 0) + 1;
  console.log('   added by dimension :', JSON.stringify(addedBy));
  console.log('   removed            :', removed.length);
  for (const [d, l] of added) console.log(`     + ${d}: ${l.length > 150 ? l.slice(0, 150) + '…' : l}`);
  if (removed.length !== 0) throw new Error('the migration removed facts; it must be purely additive');
  if (JSON.stringify(Object.entries(addedBy).sort()) !== JSON.stringify(Object.entries(EXPECTED_ADDED).sort())) {
    throw new Error(`the migration moved dimensions other than intended: ${JSON.stringify(addedBy)} (expected ${JSON.stringify(EXPECTED_ADDED)})`);
  }
  console.log('   RESULT: exactly the intended dimensions moved, and nothing was removed.');

  console.log('3. the default database, read-only: recompute the digests in Node and require the committed IR01 baseline');
  const live = detailRows('postgres');
  const liveDigests = digestsOf(live);
  const baseline = JSON.parse(readFileSync(BASELINE_JSON, 'utf8'));
  const mismatches = Object.keys({ ...baseline.dimensions, ...liveDigests.dimensions }).filter(
    (d) => JSON.stringify(baseline.dimensions[d]) !== JSON.stringify(liveDigests.dimensions[d]),
  );
  console.log(`   gating: ${liveDigests.gating.items} facts, digest ${liveDigests.gating.digest}`);
  if (mismatches.length > 0 || liveDigests.gating.digest !== baseline.gating.digest) {
    throw new Error(`the shared database no longer matches the IR01 baseline (${mismatches.join(', ') || 'gating digest'}): another session changed it, or the Node digest is wrong`);
  }
  console.log('   RESULT: MATCH — the Node digest reproduces the tool\'s digest and the shared database is still at the IR01 baseline.');

  console.log('4. the fingerprint a default-equivalent database holds after the migration');
  const derived = digestsOf([...live, ...added]);
  const changed = Object.keys(derived.dimensions).filter((d) => JSON.stringify(derived.dimensions[d]) !== JSON.stringify(liveDigests.dimensions[d]));
  for (const d of changed) console.log(`   ${d}: ${liveDigests.dimensions[d].items} -> ${derived.dimensions[d].items}   ${liveDigests.dimensions[d].digest} -> ${derived.dimensions[d].digest}`);
  console.log(`   #GATING: ${liveDigests.gating.items} -> ${derived.gating.items}   ${liveDigests.gating.digest} -> ${derived.gating.digest}`);
  console.log(`   dimensions unchanged: ${Object.keys(derived.dimensions).length - changed.length} of ${Object.keys(derived.dimensions).length}`);

  if (write) {
    const artifact = {
      tool: 'herkeys-schema-fingerprint',
      toolVersion: baseline.toolVersion,
      label:
        'HK-FEATURE-08-MEALS: local database after the additive migration 20260921160000_f08_meal_slot_and_status.sql (meal_plan_entries.meal_slot and .status). ' +
        'DERIVED, not measured on the shared database: the delta was measured on a scratch pair and applied to the shared database\'s own rows after the Node digest ' +
        'reproduced the IR01 baseline (supabase/tools/f08-fingerprint.mjs). Supersedes ir01-local-fingerprint.json (43e7c8a4..., 3617 facts) for a Feature 08 stack.',
      searchPath: baseline.searchPath,
      scope: baseline.scope,
      dimensions: derived.dimensions,
      gating: derived.gating,
    };
    writeFileSync(OUT_JSON, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`   wrote ${OUT_JSON}`);
  }
  if (!keep) {
    admin(`DROP DATABASE IF EXISTS ${PRE} WITH (FORCE);`);
    admin(`DROP DATABASE IF EXISTS ${POST} WITH (FORCE);`);
    console.log('5. scratch databases dropped');
  }
}

const args = process.argv.slice(2);
if (args[0] !== 'derive') {
  console.error('usage: node supabase/tools/f08-fingerprint.mjs derive [--write] [--keep]');
  process.exit(2);
}
try {
  derive({ write: args.includes('--write'), keep: args.includes('--keep') });
} catch (error) {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
}
