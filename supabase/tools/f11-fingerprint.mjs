#!/usr/bin/env node
/**
 * HK-FEATURE-11 (Me / Rebuild) — derive the schema fingerprint BEFORE and AFTER the additive F11 migration, WITHOUT touching the
 * shared local database. Same method as supabase/tools/f08-fingerprint.mjs, extended for a migration that REPLACES two objects.
 *
 * Why derived: the shared default database (`postgres` in supabase_db_Her_Keys) is read by every parallel Her Keys session and holds
 * IR01 + F05 (the committed f05-local-fingerprint.json). It never received F08 (Feature 08 derived its fingerprint) and must not receive
 * F11. A scratch database cannot stand in for it directly (it lacks the Supabase-init privilege facts only the default database has).
 *
 *   1. Scratch A = the harness sequence WITHOUT F08 (baseline, Build 4, IR01, F05) — what the shared database was built from.
 *      Scratch B = the FULL Wave 3 base sequence (…IR01, F08, F05).  Scratch C = B + the F11 migration.
 *   2. The shared database, read-only: recompute every digest in Node and require the committed F05 baseline (proves the Node digest
 *      is the tool's digest, and that no other session has moved the shared database).
 *   3. OLD  = shared rows + (B − A)        the fingerprint a default-equivalent database holds at WAVE3_BASE (with F08).
 *   4. NEW  = OLD − (B − C) + (C − B)      the same database after F11. Every removed fact must exist in OLD, and EVERY added or
 *                                          removed fact must name an F11 object — anything else moving is drift and aborts.
 *
 *   node supabase/tools/f11-fingerprint.mjs derive            check everything, print the derivation, write nothing
 *   node supabase/tools/f11-fingerprint.mjs derive --write    also write baselines/wave3-base-local-fingerprint.json and
 *                                                              baselines/f11-local-fingerprint.json
 *
 * LOCAL ONLY. It creates and drops only the three databases it names (f11_fp_a, f11_fp_b, f11_fp_c). No remote project is contacted.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';
const DBS = { a: 'f11_fp_a', b: 'f11_fp_b', c: 'f11_fp_c' };
const BASELINE_JSON = join(HERE, 'baselines', 'f05-local-fingerprint.json');
const OLD_JSON = join(HERE, 'baselines', 'wave3-base-local-fingerprint.json');
const NEW_JSON = join(HERE, 'baselines', 'f11-local-fingerprint.json');

const migration = (name) => join(REPO, 'supabase', 'migrations', name);
const helper = (name) => join(REPO, 'supabase', 'tests', 'helpers', name);
const HEAD = [helper('00-auth-stub.sql'), helper('01-test-helpers.sql'), migration('20260919230054_build4_baseline.sql'), migration('20260919231500_build4_cloud_schema.sql'), migration('20260921120000_ir01_duration_source_and_claim_v3.sql')];
const F08 = migration('20260921160000_f08_meal_slot_and_status.sql');
const F05 = migration('20260921190000_f05_add_child_after_binding.sql');
// Renumbered to 20260922182000 by the F01-F13 integration (INT13-01). This tool derives the Feature 11 BRANCH-era fingerprint (WAVE3_BASE +
// F11 alone); the integrated tree's fingerprint is derived by supabase/tools/int13-fingerprint.mjs.
const F11 = migration('20260922182000_f11_rebuild_focus.sql');

/** A changed fact is explainable only if it names one of F11's own objects, or one of the two existing objects F11 replaces. */
const F11_OBJECT = /rebuild_focus|change_log_entity_table_check|sync_push/;

const { buildSql } = await import(pathToFileURL(join(HERE, 'schema-fingerprint.mjs')).href);

const docker = (args, input) =>
  execFileSync('docker', ['exec', '-i', CONTAINER, ...args], { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const admin = (sql) => docker(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]);
const applyFile = (db, file) => docker(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-f', '-'], readFileSync(file, 'utf8'));

function scratch(db, files) {
  if (!Object.values(DBS).includes(db)) throw new Error(`refusing to touch database ${db}`);
  admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  admin(`CREATE DATABASE ${db};`);
  for (const file of files) applyFile(db, file);
}

/** [dimension, line] pairs, NUL-separated because some facts span lines (exactly as f08-fingerprint.mjs reads them). */
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
const short = (line) => (line.length > 140 ? `${line.slice(0, 140)}…` : line).replace(/\s+/g, ' ');

function changedDimensions(from, to) {
  return Object.keys({ ...from.dimensions, ...to.dimensions }).filter((d) => JSON.stringify(from.dimensions[d]) !== JSON.stringify(to.dimensions[d]));
}

function derive({ write, keep }) {
  console.log('1. scratch databases (local container): f11_fp_a = through F05 without F08, f11_fp_b = the full Wave 3 base, f11_fp_c = b + F11');
  scratch(DBS.a, [...HEAD, F05]);
  scratch(DBS.b, [...HEAD, F08, F05]);
  scratch(DBS.c, [...HEAD, F08, F05, F11]);
  const a = detailRows(DBS.a);
  const b = detailRows(DBS.b);
  const c = detailRows(DBS.c);

  const f08 = diffRows(a, b);
  console.log(`   F08 delta (b - a): +${f08.added.length} / -${f08.removed.length}  ${JSON.stringify(tally(f08.added))}`);
  if (f08.removed.length !== 0) throw new Error('F08 must be purely additive relative to its neighbours');

  const f11 = diffRows(b, c);
  console.log(`   F11 delta (c - b): +${f11.added.length} / -${f11.removed.length}`);
  console.log(`     added by dimension   : ${JSON.stringify(tally(f11.added))}`);
  console.log(`     removed by dimension : ${JSON.stringify(tally(f11.removed))}`);
  for (const [d, l] of f11.removed) console.log(`     - ${d}: ${short(l)}`);
  const unexplained = [...f11.added, ...f11.removed].filter(([, l]) => !F11_OBJECT.test(l));
  for (const [d, l] of unexplained) console.log(`     ! UNEXPLAINED ${d}: ${short(l)}`);
  if (unexplained.length > 0) throw new Error(`${unexplained.length} changed fact(s) name no F11 object — drift, not F11`);
  const removedKinds = f11.removed.map(([d, l]) => `${d}:${/change_log_entity_table_check/.test(l) ? 'change_log_check' : /sync_push/.test(l) ? 'sync_push' : 'other'}`);
  if (removedKinds.some((k) => k.endsWith(':other'))) throw new Error(`F11 removed a fact that is neither the old change_log check nor the old sync_push: ${removedKinds.join(', ')}`);
  console.log('   RESULT: every added and removed fact names an F11 object; the only removals are the two definitions F11 replaces.');

  console.log('2. the shared default database, READ-ONLY: recompute every digest in Node and require the committed F05 baseline');
  const live = detailRows('postgres');
  const liveDigests = digestsOf(live);
  const baseline = JSON.parse(readFileSync(BASELINE_JSON, 'utf8'));
  const drift = changedDimensions(baseline, liveDigests);
  console.log(`   live gating: ${liveDigests.gating.items} facts, digest ${liveDigests.gating.digest}`);
  if (drift.length > 0 || liveDigests.gating.digest !== baseline.gating.digest) {
    throw new Error(`the shared database no longer matches the F05 baseline (${drift.join(', ') || 'gating digest'}): another session moved it`);
  }
  console.log('   RESULT: MATCH — the Node digest reproduces the tool, and the shared database is still exactly IR01 + F05.');

  console.log('3. OLD = the full Wave 3 base (shared rows + the F08 delta)');
  const oldRows = [...live, ...f08.added];
  const old = digestsOf(oldRows);
  console.log(`   #GATING OLD: ${old.gating.items} facts, ${old.gating.digest}`);

  console.log('4. NEW = OLD - what F11 replaces + what F11 adds');
  const oldKeys = new Set(oldRows.map(key));
  const missing = f11.removed.filter((r) => !oldKeys.has(key(r)));
  if (missing.length > 0) throw new Error(`${missing.length} fact(s) F11 replaces are not in OLD — the scratch pair and the shared database disagree`);
  const removedKeys = new Set(f11.removed.map(key));
  const next = digestsOf([...oldRows.filter((r) => !removedKeys.has(key(r))), ...f11.added]);
  for (const d of changedDimensions(old, next)) {
    const before = old.dimensions[d] ?? { items: 0, digest: '(none)' };
    const after = next.dimensions[d] ?? { items: 0, digest: '(none)' };
    console.log(`   ${d}: ${before.items} -> ${after.items}   ${before.digest} -> ${after.digest}`);
  }
  console.log(`   #GATING: ${old.gating.items} -> ${next.gating.items}   ${old.gating.digest} -> ${next.gating.digest}`);
  console.log(`   dimensions unchanged: ${Object.keys(next.dimensions).length - changedDimensions(old, next).length} of ${Object.keys(next.dimensions).length}`);

  if (write) {
    const common = { tool: 'herkeys-schema-fingerprint', toolVersion: baseline.toolVersion, searchPath: baseline.searchPath, scope: baseline.scope };
    writeFileSync(OLD_JSON, `${JSON.stringify({
      ...common,
      label:
        'WAVE3_BASE (integration/wave2-f01-f08 @ 363e473): a default-equivalent local database holding every Wave 2 migration (IR01, F08, F05). ' +
        'DERIVED by supabase/tools/f11-fingerprint.mjs: the committed f05-local-fingerprint.json was reproduced from the shared database, and the F08 delta ' +
        '(measured on a scratch pair) was added. The shared database itself never received F08.',
      dimensions: old.dimensions, gating: old.gating,
    }, null, 2)}\n`);
    writeFileSync(NEW_JSON, `${JSON.stringify({
      ...common,
      label:
        'HK-FEATURE-11 (Me / Rebuild): WAVE3_BASE after the additive migration 20260922180000_f11_rebuild_focus.sql (rebuild_focuses, rebuild_focus_links, ' +
        'private.rebuild_focus_link_target_visible, change_log_entity_table_check re-created, sync_push replaced). DERIVED, not measured on the shared database: ' +
        'the F11 delta was measured on a scratch pair, every changed fact names an F11 object, and it was applied to wave3-base-local-fingerprint.json.',
      dimensions: next.dimensions, gating: next.gating,
    }, null, 2)}\n`);
    console.log(`   wrote ${OLD_JSON}`);
    console.log(`   wrote ${NEW_JSON}`);
  }
  if (!keep) {
    for (const db of Object.values(DBS)) admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
    console.log('5. scratch databases dropped');
  }
}

const args = process.argv.slice(2);
if (args[0] !== 'derive') {
  console.error('usage: node supabase/tools/f11-fingerprint.mjs derive [--write] [--keep]');
  process.exit(2);
}
try {
  derive({ write: args.includes('--write'), keep: args.includes('--keep') });
} catch (error) {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
}
