#!/usr/bin/env node
/**
 * HK-F01-F13 integration (Phase 7) — the PRE-INTEGRATION (WAVE3_BASE) and the FULL F01-F13 schema fingerprints, and the ledger of
 * every schema fact each migration adds or removes, derived WITHOUT touching the shared local database. The method is Feature 12's
 * (supabase/tools/f12-fingerprint.mjs), extended from one migration to the whole chain:
 *
 *   1. Read the shared default database (`postgres`, SELECT only) and require it to equal the committed F05 baseline (IR01 + F05, which is
 *      what that database holds). This proves the Node digest reproduces the tool's own, and anchors OLD to a real database.
 *   2. Scratch databases in the audit namespace (never the shared one):
 *        f1313audit_fp_x      baseline, Build 4, IR01, F05                            (the shared database's migration set)
 *        f1313audit_fp_steps  WAVE3_BASE (IR01, F08, F05), then EVERY later migration in chain order, a snapshot after each
 *        f1313audit_fp_fresh  the WHOLE chain in one go                                (a fresh install)
 *   3. Deltas: F08 = diff(x, WAVE3_BASE); each later migration = diff(the snapshot before it, the snapshot after it). So every changed fact
 *      is attributed to exactly one migration, by construction. The step database after the last migration must equal the fresh install
 *      fact for fact: the upgrade path and a fresh install build the same schema, or the difference is unexplained drift (P1).
 *   4. OLD (WAVE3_BASE) = shared rows + F08 delta; NEW (F01-F13) = OLD + every later delta. (A bare CREATE DATABASE lacks a few
 *      Supabase-init privilege facts, which is why scratch databases are only ever used for deltas and comparisons with each other.)
 *
 *   node supabase/tools/int13-fingerprint.mjs derive            check everything, print the derivation, write nothing
 *   node supabase/tools/int13-fingerprint.mjs derive --write    also write baselines/int13-local-fingerprint.json and int13-migration-ledger.json
 *   add --keep to leave the scratch databases for inspection
 *
 * LOCAL ONLY. It creates and drops only the three databases it names (f1313audit_fp_*). It never contacts a remote project.
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
const OUT_JSON = join(HERE, 'baselines', 'int13-local-fingerprint.json');
const OUT_LEDGER = join(HERE, 'baselines', 'int13-migration-ledger.json');

const { BASELINE, SHIPPING, ADDITIVE_CHAIN, WAVE3_BASE_CHAIN, WAVE3_TO_F13_CHAIN, migrationPath } = await import(
  pathToFileURL(join(REPO, 'supabase', 'tests', 'migration-chain.mjs')).href
);
const { buildSql } = await import(pathToFileURL(join(HERE, 'schema-fingerprint.mjs')).href);

const helper = (name) => join(REPO, 'supabase', 'tests', 'helpers', name);
const HEAD = [helper('00-auth-stub.sql'), helper('01-test-helpers.sql'), migrationPath(BASELINE), migrationPath(SHIPPING)];
const IR01 = migrationPath(ADDITIVE_CHAIN.find((m) => m.owner === 'IR01').file);
const F08 = migrationPath(ADDITIVE_CHAIN.find((m) => m.owner === 'F08').file);
const F05 = migrationPath(ADDITIVE_CHAIN.find((m) => m.owner === 'F05').file);

/**
 * What each migration may move: [added, removed] per dimension, measured once and pinned here. Anything else moving is drift (P1).
 * A REMOVED fact is always something the migration re-issues (a replaced function body, a re-declared CHECK, a re-created index).
 */
const EXPECTED = {
  F08: { added: { columns: 2, constraints: 2, 'privileges.columns': 4 }, removed: {} },
  F09: { added: { columns: 1, constraints: 1, 'privileges.columns': 2 }, removed: {} },
  // F10 also widens the dependency endpoints (three CHECKs and the live-edge index re-issued with the opportunity column).
  F10: {
    added: { columns: 29, constraints: 28, functions: 1, indexes: 8, policies: 3, 'privileges.columns': 40, 'privileges.effective': 8, 'privileges.relations': 17, relations: 1, triggers: 3 },
    removed: { constraints: 4, functions: 1, indexes: 1 },
  },
  F11: {
    added: { columns: 39, constraints: 37, functions: 2, indexes: 16, policies: 6, 'privileges.columns': 39, 'privileges.effective': 16, 'privileges.functions': 1, 'privileges.relations': 34, relations: 2, triggers: 7 },
    removed: { constraints: 1, functions: 1 },
  },
  F12: {
    added: { columns: 45, constraints: 40, functions: 2, indexes: 13, policies: 5, 'privileges.columns': 52, 'privileges.effective': 16, 'privileges.functions': 1, 'privileges.relations': 34, relations: 2, triggers: 7 },
    removed: { constraints: 1, functions: 1 },
  },
  F13: {
    added: { columns: 36, constraints: 39, functions: 2, indexes: 17, policies: 5, 'privileges.columns': 34, 'privileges.effective': 17, 'privileges.functions': 2, 'privileges.relations': 34, relations: 2, triggers: 8 },
    removed: { constraints: 1, functions: 1 },
  },
  // The integration's repair re-issues four uniqueness rules under their own names: each removed fact comes back with the owner.
  INT13: { added: { constraints: 1, indexes: 4 }, removed: { constraints: 1, indexes: 4 } },
};

const docker = (args, input) =>
  execFileSync('docker', ['exec', '-i', CONTAINER, ...args], { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const admin = (sql) => docker(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]);
const applyFile = (db, file) => docker(['psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-f', '-'], readFileSync(file, 'utf8'));

const SCRATCH = /^f1313audit_fp_(x|steps|fresh)$/;
function scratch(db, files) {
  if (!SCRATCH.test(db)) throw new Error(`refusing to touch database ${db}`);
  admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  admin(`CREATE DATABASE ${db};`);
  for (const file of files) applyFile(db, file);
}

/** [dimension, line] pairs, NUL-separated records (a fact may span lines). The reader the F08 and F12 tools use. */
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
  return { dimensions, gating: { items: gated.reduce((sum, [, v]) => sum + v.items, 0), digest: md5(gated.map(([name, v]) => `${name}=${v.digest}`).join('\n')) } };
}

const SEP = String.fromCharCode(0);
const key = ([d, l]) => d + SEP + l;
function diffRows(before, after) {
  const b = new Set(before.map(key));
  const a = new Set(after.map(key));
  return { added: after.filter((r) => !b.has(key(r))), removed: before.filter((r) => !a.has(key(r))) };
}
const tally = (rows) => Object.fromEntries(Object.entries(rows.reduce((acc, [d]) => ({ ...acc, [d]: (acc[d] ?? 0) + 1 }), {})).sort(([x], [y]) => byBytes(x, y)));
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
function applyDelta(rows, { added, removed }) {
  const gone = new Set(removed.map(key));
  return [...rows.filter((r) => !gone.has(key(r))), ...added];
}

/** The ledger's reading of one delta: what the brief asks a migration ledger to name, from the raw facts. */
function ledgerOf(delta) {
  const tableOf = (line) => line.split('|')[0];
  const lines = (rows, dimension, test = () => true) => rows.filter(([d, l]) => d === dimension && test(l)).map(([, l]) => l);
  const constraintType = (type) => (l) => l.includes(`|type=${type}|`);
  const summarize = (rows) => ({
    tables: lines(rows, 'relations', (l) => l.includes('|kind=r|')).map(tableOf),
    columns: lines(rows, 'columns').map((l) => { const [t, , name] = l.split('|'); return `${t}.${name}`; }),
    indexes: lines(rows, 'indexes').map((l) => l.split('|')[1]),
    checks: lines(rows, 'constraints', constraintType('c')).map((l) => l.split('|')[1]),
    foreignKeys: lines(rows, 'constraints', constraintType('f')).map((l) => l.split('|')[1]),
    uniqueAndPrimary: lines(rows, 'constraints', (l) => constraintType('u')(l) || constraintType('p')(l)).map((l) => l.split('|')[1]),
    triggers: lines(rows, 'triggers').map((l) => l.split('|')[1]),
    functions: lines(rows, 'functions').map((l) => l.split('|')[0]),
    policies: lines(rows, 'policies').map((l) => `${l.split('|')[0]}:${l.split('|')[1]}`),
    grants: rows.filter(([d]) => d.startsWith('privileges.')).length,
  });
  const logCheck = (rows) => lines(rows, 'constraints', (l) => l.includes('change_log_entity_table_check'))
    .map((l) => [...l.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]))[0] ?? null;
  const before = logCheck(delta.removed);
  const after = logCheck(delta.added);
  const byDimension = (rows) => rows.reduce((acc, [d, l]) => ({ ...acc, [d]: [...(acc[d] ?? []), l].sort(byBytes) }), {});
  return {
    added: summarize(delta.added),
    removed: summarize(delta.removed),
    changeLogTablesAdded: before && after ? after.filter((t) => !before.includes(t)) : after ?? [],
    changeLogTablesDropped: before && after ? before.filter((t) => !after.includes(t)) : [],
    syncPushReplaced: delta.added.some(([d, l]) => d === 'functions' && l.startsWith('public.sync_push(')),
    facts: { added: byDimension(delta.added), removed: byDimension(delta.removed) },
  };
}

function derive({ write, keep }) {
  console.log('1. the shared default database, read-only, against the committed F05 baseline (IR01 + F05)');
  const live = detailRows('postgres');
  const liveD = digestsOf(live);
  const baseline = JSON.parse(readFileSync(SHARED_BASELINE, 'utf8'));
  const mismatches = Object.keys({ ...baseline.dimensions, ...liveD.dimensions }).filter((d) => JSON.stringify(baseline.dimensions[d]) !== JSON.stringify(liveD.dimensions[d]));
  console.log(`   shared gating: ${liveD.gating.items} facts, digest ${liveD.gating.digest}`);
  if (mismatches.length > 0 || liveD.gating.digest !== baseline.gating.digest) {
    throw new Error(`the shared database does not match the F05 baseline (${mismatches.join(', ') || 'gating digest'}): another session changed it; derive nothing from it`);
  }
  console.log('   RESULT: MATCH.');

  console.log('2. scratch databases: the shared set, WAVE3_BASE then every later migration one at a time, and a fresh install');
  scratch('f1313audit_fp_x', [...HEAD, IR01, F05]);
  const x = detailRows('f1313audit_fp_x');
  scratch('f1313audit_fp_steps', [...HEAD, ...WAVE3_BASE_CHAIN.map((m) => migrationPath(m.file))]);
  const wave3 = detailRows('f1313audit_fp_steps');
  const deltas = [{ owner: 'F08', file: ADDITIVE_CHAIN.find((m) => m.owner === 'F08').file, delta: diffRows(x, wave3) }];
  let previous = wave3;
  for (const m of WAVE3_TO_F13_CHAIN) {
    applyFile('f1313audit_fp_steps', migrationPath(m.file));
    const after = detailRows('f1313audit_fp_steps');
    deltas.push({ owner: m.owner, file: m.file, delta: diffRows(previous, after) });
    previous = after;
  }
  scratch('f1313audit_fp_fresh', [...HEAD, ...ADDITIVE_CHAIN.map((m) => migrationPath(m.file))]);
  const fresh = detailRows('f1313audit_fp_fresh');
  const freshVsSteps = diffRows(previous, fresh);
  console.log(`   the upgrade path vs a fresh install: ${freshVsSteps.added.length + freshVsSteps.removed.length} differing facts`);
  for (const [d, l] of [...freshVsSteps.added.map((r) => ['+', ...r]), ...freshVsSteps.removed.map((r) => ['-', ...r])].slice(0, 10)) console.log(`     ${d} ${l}`);
  if (freshVsSteps.added.length + freshVsSteps.removed.length > 0) throw new Error('the upgrade path and a fresh install built different schemas: unexplained drift');

  console.log('3. what each migration moved (every changed fact belongs to exactly one migration)');
  let drift = 0;
  for (const { owner, file, delta } of deltas) {
    const added = tally(delta.added);
    const removed = tally(delta.removed);
    console.log(`   ${owner.padEnd(5)} ${file}`);
    console.log(`         added   ${JSON.stringify(added)}`);
    console.log(`         removed ${JSON.stringify(removed)}`);
    for (const [d, l] of delta.removed) console.log(`           - ${d}: ${l.length > 150 ? `${l.slice(0, 150)}…` : l}`);
    const expected = EXPECTED[owner];
    if (expected && (!same(added, expected.added) || !same(removed, expected.removed))) {
      console.log(`         DRIFT: expected ${JSON.stringify(expected)}`);
      drift += 1;
    }
  }
  if (drift > 0) throw new Error(`${drift} migration(s) moved dimensions other than pinned`);
  const unpinned = deltas.filter(({ owner }) => !EXPECTED[owner]).map(({ owner }) => owner);
  if (unpinned.length > 0) throw new Error(`no pinned expectation for ${unpinned.join(', ')}: measure it and pin it in EXPECTED`);
  // A re-declared change-log CHECK may only ever GROW: a table dropped from it would stop syncing without an error anywhere.
  for (const { owner, delta } of deltas) {
    const { changeLogTablesAdded, changeLogTablesDropped } = ledgerOf(delta);
    if (changeLogTablesDropped.length > 0) throw new Error(`${owner} dropped ${changeLogTablesDropped.join(', ')} from the change-log CHECK`);
    if (changeLogTablesAdded.length > 0) console.log(`   ${owner} change-log CHECK gains: ${changeLogTablesAdded.join(', ')}`);
  }

  console.log('4. OLD (WAVE3_BASE) = shared + F08 delta; NEW (F01-F13) = OLD + every later delta');
  const oldRows = applyDelta(live, deltas[0].delta);
  const newRows = deltas.slice(1).reduce((rows, { delta }) => applyDelta(rows, delta), oldRows);
  const oldD = digestsOf(oldRows);
  const newD = digestsOf(newRows);
  console.log(`   OLD  #GATING ${oldD.gating.items} facts  ${oldD.gating.digest}`);
  console.log(`   NEW  #GATING ${newD.gating.items} facts  ${newD.gating.digest}`);
  for (const d of Object.keys({ ...oldD.dimensions, ...newD.dimensions }).sort()) {
    const o = oldD.dimensions[d];
    const n = newD.dimensions[d];
    if (JSON.stringify(o) !== JSON.stringify(n)) console.log(`   ${d}: ${o?.items ?? 0} -> ${n?.items ?? 0}`);
  }

  if (write) {
    const perMigration = Object.fromEntries(deltas.map(({ owner, file, delta }) => [owner, { file, added: tally(delta.added), removed: tally(delta.removed) }]));
    writeFileSync(OUT_JSON, `${JSON.stringify({
      tool: 'herkeys-schema-fingerprint',
      toolVersion: baseline.toolVersion,
      label: 'HK-F01-F13 integration: local database after the WHOLE chain (WAVE3_BASE + F09, F10, F11, F12, F13 and the integration\'s own per-owner '
        + 'uniqueness migration). DERIVED, not measured on the shared database (supabase/tools/int13-fingerprint.mjs): each migration\'s delta was measured on '
        + 'a scratch database one step at a time and applied to the shared database\'s own rows after it matched the F05 baseline; the step database equals a '
        + 'fresh install of the whole chain fact for fact.',
      searchPath: baseline.searchPath,
      scope: baseline.scope,
      wave3Base: oldD.gating,
      perMigration,
      dimensions: newD.dimensions,
      gating: newD.gating,
    }, null, 2)}\n`);
    writeFileSync(OUT_LEDGER, `${JSON.stringify(Object.fromEntries(deltas.map(({ owner, file, delta }) => [owner, { file, ...ledgerOf(delta) }])), null, 2)}\n`);
    console.log(`   wrote ${OUT_JSON}`);
    console.log(`   wrote ${OUT_LEDGER}`);
  }
  if (!keep) {
    for (const db of ['f1313audit_fp_x', 'f1313audit_fp_steps', 'f1313audit_fp_fresh']) admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
    console.log('5. scratch databases dropped');
  }
}

const args = process.argv.slice(2);
if (args[0] !== 'derive') {
  console.error('usage: node supabase/tools/int13-fingerprint.mjs derive [--write] [--keep]');
  process.exit(2);
}
try {
  derive({ write: args.includes('--write'), keep: args.includes('--keep') });
} catch (error) {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
}
