#!/usr/bin/env node
/**
 * HK-FEATURE-12 (Life Admin / Documents) — derive the schema fingerprint of WAVE3_BASE (OLD) and of WAVE3_BASE + the F12 migration
 * (NEW), WITHOUT touching the shared local database. The method is Feature 08's (supabase/tools/f08-fingerprint.mjs), extended by one
 * step, because WAVE3_BASE's schema (IR01 + F08 + F05) has no committed baseline of its own:
 *
 *   1. Read the shared default database (`postgres`, SELECT only) and require it to equal a committed baseline (the F05 one: IR01 + F05,
 *      which is what that database holds; F08 is never applied to it). This also proves the Node digest reproduces the tool's digest.
 *   2. Build three scratch databases with the harness sequence (auth stub and helpers, then migrations):
 *        f12_fp_x    baseline, Build 4, IR01, F05          (the shared database's migration set)
 *        f12_fp_w    baseline, Build 4, IR01, F08, F05     (WAVE3_BASE)
 *        f12_fp_w12  WAVE3_BASE + F12
 *      The F08 delta is diff(x, w); the F12 delta is diff(w, w12). Each must move EXACTLY its intended dimensions.
 *   3. OLD = shared rows + F08 delta; NEW = OLD + F12 delta (removed lines are removed, added lines added). A bare CREATE DATABASE
 *      lacks seven Supabase-init privilege facts, which is why the scratch databases are only ever used for deltas.
 *
 *   node supabase/tools/f12-fingerprint.mjs derive            check everything, print the derivation, write nothing
 *   node supabase/tools/f12-fingerprint.mjs derive --write    also write supabase/tools/baselines/f12-local-fingerprint.json
 *   add --keep to leave the scratch databases for inspection
 *
 * LOCAL ONLY. It creates and drops only the three databases it names (f12_fp_*). It never contacts a remote project.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';
const SHARED_BASELINE = join(HERE, 'baselines', 'f05-local-fingerprint.json');
const OUT_JSON = join(HERE, 'baselines', 'f12-local-fingerprint.json');

const migration = (name) => join(REPO, 'supabase', 'migrations', name);
const helper = (name) => join(REPO, 'supabase', 'tests', 'helpers', name);
const HEAD = [helper('00-auth-stub.sql'), helper('01-test-helpers.sql'), migration('20260919230054_build4_baseline.sql'), migration('20260919231500_build4_cloud_schema.sql'), migration('20260921120000_ir01_duration_source_and_claim_v3.sql')];
const F08 = migration('20260921160000_f08_meal_slot_and_status.sql');
const F05 = migration('20260921190000_f05_add_child_after_binding.sql');
const F12 = migration('20260922180000_f12_life_records.sql');

/**
 * What each migration may move, measured once and pinned here: [added, removed] per dimension. Anything else moving is drift.
 * F12's removals are the two things it REPLACES: the body of public.sync_push and the definition of change_log_entity_table_check.
 */
const EXPECTED_F08 = { added: { columns: 2, constraints: 2, 'privileges.columns': 4 }, removed: {} };
const EXPECTED_F12 = JSON.parse(process.env.HERKEYS_F12_EXPECTED ?? 'null');

const { buildSql } = await import(pathToFileURL(join(HERE, 'schema-fingerprint.mjs')).href);

const docker = (args, input) =>
  execFileSync('docker', ['exec', '-i', CONTAINER, ...args], { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const admin = (sql) => docker(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]);
const applyFile = (db, file) => docker(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-f', '-'], readFileSync(file, 'utf8'));

function scratch(db, files) {
  if (!/^f12_fp_(x|w|w12)$/.test(db)) throw new Error(`refusing to touch database ${db}`);
  admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  admin(`CREATE DATABASE ${db};`);
  for (const file of files) applyFile(db, file);
}

/** [dimension, line] pairs, NUL-separated records (a fact may span lines). The same reader Feature 08's tool uses. */
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

const SEP = String.fromCharCode(0);
const key = ([d, l]) => d + SEP + l;
function diffRows(before, after) {
  const b = new Set(before.map(key));
  const a = new Set(after.map(key));
  return { added: after.filter((r) => !b.has(key(r))), removed: before.filter((r) => !a.has(key(r))) };
}
const tally = (rows) => rows.reduce((acc, [d]) => ({ ...acc, [d]: (acc[d] ?? 0) + 1 }), {});
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
function applyDelta(rows, { added, removed }) {
  const gone = new Set(removed.map(key));
  return [...rows.filter((r) => !gone.has(key(r))), ...added];
}

function derive({ write, keep }) {
  console.log('1. the shared default database, read-only, against the committed F05 baseline (IR01 + F05)');
  const live = detailRows('postgres');
  const liveDigests = digestsOf(live);
  const baseline = JSON.parse(readFileSync(SHARED_BASELINE, 'utf8'));
  const mismatches = Object.keys({ ...baseline.dimensions, ...liveDigests.dimensions }).filter((d) => JSON.stringify(baseline.dimensions[d]) !== JSON.stringify(liveDigests.dimensions[d]));
  console.log(`   shared gating: ${liveDigests.gating.items} facts, digest ${liveDigests.gating.digest}`);
  if (mismatches.length > 0 || liveDigests.gating.digest !== baseline.gating.digest) {
    throw new Error(`the shared database does not match the F05 baseline (${mismatches.join(', ') || 'gating digest'}): another session changed it; derive nothing from it`);
  }
  console.log('   RESULT: MATCH.');

  console.log('2. scratch databases (f12_fp_x, f12_fp_w, f12_fp_w12) and the two deltas');
  scratch('f12_fp_x', [...HEAD, F05]);
  scratch('f12_fp_w', [...HEAD, F08, F05]);
  scratch('f12_fp_w12', [...HEAD, F08, F05, F12]);
  const x = detailRows('f12_fp_x');
  const w = detailRows('f12_fp_w');
  const w12 = detailRows('f12_fp_w12');
  const f08 = diffRows(x, w);
  const f12 = diffRows(w, w12);
  console.log('   F08 delta  added', JSON.stringify(tally(f08.added)), ' removed', JSON.stringify(tally(f08.removed)));
  if (!same(tally(f08.added), EXPECTED_F08.added) || !same(tally(f08.removed), EXPECTED_F08.removed)) throw new Error('the F08 delta is not what Feature 08 certified');
  console.log('   F12 delta  added', JSON.stringify(tally(f12.added)), ' removed', JSON.stringify(tally(f12.removed)));
  for (const [d, l] of f12.removed) console.log(`     - ${d}: ${l.length > 160 ? `${l.slice(0, 160)}…` : l}`);
  if (EXPECTED_F12 === null) {
    console.log('   (no pinned F12 expectation supplied: measurement only)');
  } else if (!same(tally(f12.added), EXPECTED_F12.added) || !same(tally(f12.removed), EXPECTED_F12.removed)) {
    throw new Error(`the F12 delta moved dimensions other than intended (expected ${JSON.stringify(EXPECTED_F12)})`);
  } else {
    console.log('   RESULT: exactly the intended dimensions moved.');
  }

  console.log('3. OLD (WAVE3_BASE) = shared + F08 delta; NEW (F12) = OLD + F12 delta');
  const oldRows = applyDelta(live, f08);
  const newRows = applyDelta(oldRows, f12);
  const oldD = digestsOf(oldRows);
  const newD = digestsOf(newRows);
  console.log(`   OLD  #GATING ${oldD.gating.items} facts  ${oldD.gating.digest}`);
  console.log(`   NEW  #GATING ${newD.gating.items} facts  ${newD.gating.digest}`);
  for (const d of Object.keys({ ...oldD.dimensions, ...newD.dimensions }).sort()) {
    const o = oldD.dimensions[d];
    const n = newD.dimensions[d];
    if (JSON.stringify(o) !== JSON.stringify(n)) console.log(`   ${d}: ${o?.items ?? 0} -> ${n?.items ?? 0}   ${o?.digest ?? '-'} -> ${n?.digest ?? '-'}`);
  }

  if (write) {
    const artifact = {
      tool: 'herkeys-schema-fingerprint',
      toolVersion: baseline.toolVersion,
      label:
        'HK-FEATURE-12 (Life Admin / Documents): local database after WAVE3_BASE (IR01 + F08 + F05) and the additive migration 20260922180000_f12_life_records.sql. ' +
        `DERIVED, not measured on the shared database: OLD (WAVE3_BASE) = ${oldD.gating.digest} / ${oldD.gating.items} facts; the F08 and F12 deltas were measured on scratch ` +
        'databases and applied to the shared database\'s own rows after it matched the F05 baseline (supabase/tools/f12-fingerprint.mjs).',
      searchPath: baseline.searchPath,
      scope: baseline.scope,
      wave3Base: oldD.gating,
      dimensions: newD.dimensions,
      gating: newD.gating,
    };
    writeFileSync(OUT_JSON, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`   wrote ${OUT_JSON}`);
  }
  if (!keep) {
    for (const db of ['f12_fp_x', 'f12_fp_w', 'f12_fp_w12']) admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
    console.log('4. scratch databases dropped');
  }
}

const args = process.argv.slice(2);
if (args[0] !== 'derive') {
  console.error('usage: node supabase/tools/f12-fingerprint.mjs derive [--write] [--keep]');
  process.exit(2);
}
try {
  derive({ write: args.includes('--write'), keep: args.includes('--keep') });
} catch (error) {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
}
