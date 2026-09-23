#!/usr/bin/env node
// HK-FEATURE-13 — schema fingerprint of the People OS migration, measured, never assumed.
//
// Builds two PRIVATE scratch databases from the same on-disk files (auth stub + the five WAVE3_BASE migrations; then the same plus
// 20260922200000_f13_people_os.sql), captures the locked fingerprint tool's digest AND detail output from each, and prints:
//   * OLD and NEW per-dimension digests and #GATING,
//   * every dimension that changed, with the exact fact lines added and removed.
// Bare databases carry 7 fewer default-ACL facts than the Supabase default database (see the local-fingerprint memory / README), and
// line endings are whatever the checkout has; both databases are built identically, so the DIFF is exact. It never touches the
// shared default database and drops only the two databases it creates.
//
//   node scripts-dev/f13-fingerprint.mjs [--write supabase/tools/baselines/f13-local-fingerprint.json]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';
const { buildSql } = await import(pathToFileURL(join(REPO, 'supabase', 'tools', 'schema-fingerprint.mjs')).href);

const SHIPPED = [
  '20260919230054_build4_baseline.sql',
  '20260919231500_build4_cloud_schema.sql',
  '20260921120000_ir01_duration_source_and_claim_v3.sql',
  '20260921160000_f08_meal_slot_and_status.sql',
  '20260921190000_f05_add_child_after_binding.sql',
];
const F13 = '20260922200000_f13_people_os.sql';
const SEP = String.fromCharCode(31);
const ENV = { ...process.env, MSYS_NO_PATHCONV: '1' };
const docker = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', env: ENV, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const admin = (sql) => docker(['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]);
const run = (db, sql) => docker(['exec', '-i', CONTAINER, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-At', '-F', SEP, '-f', '-'], sql);

function build(db, files) {
  admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  admin(`CREATE DATABASE ${db};`);
  run(db, readFileSync(join(REPO, 'supabase', 'tests', 'helpers', '00-auth-stub.sql'), 'utf8'));
  for (const file of files) run(db, readFileSync(join(REPO, 'supabase', 'migrations', file), 'utf8'));
}

const rows = (out) => out.split('\n').filter((line) => line.includes(SEP)).map((line) => line.split(SEP));

function capture(db) {
  const digest = {};
  for (const [dimension, items, value] of rows(run(db, buildSql('digest')))) digest[dimension] = { items: Number(items), digest: value };
  const detail = new Map();
  for (const [dimension, line] of rows(run(db, buildSql('detail')))) {
    if (!detail.has(dimension)) detail.set(dimension, new Set());
    detail.get(dimension).add(line);
  }
  return { digest, detail };
}

try {
  build('f13_fp_pre', SHIPPED);
  build('f13_fp_post', [...SHIPPED, F13]);
  const pre = capture('f13_fp_pre');
  const post = capture('f13_fp_post');

  console.log('OLD (WAVE3_BASE)  #GATING', pre.digest['#GATING'].items, pre.digest['#GATING'].digest);
  console.log('NEW (+ F13)       #GATING', post.digest['#GATING'].items, post.digest['#GATING'].digest);
  const changed = [];
  for (const dimension of [...new Set([...Object.keys(pre.digest), ...Object.keys(post.digest)])].sort()) {
    if (dimension === '#GATING') continue;
    const a = pre.digest[dimension];
    const b = post.digest[dimension];
    if (a?.digest === b?.digest) continue;
    const before = pre.detail.get(dimension) ?? new Set();
    const after = post.detail.get(dimension) ?? new Set();
    const added = [...after].filter((line) => !before.has(line)).sort();
    const removed = [...before].filter((line) => !after.has(line)).sort();
    changed.push({ dimension, items: `${a?.items ?? 0} -> ${b?.items ?? 0}`, added: added.length, removed: removed.length, removedLines: removed, addedSample: added.slice(0, 4) });
  }
  console.log('\nchanged dimensions:');
  for (const c of changed) {
    console.log(`  ${c.dimension.padEnd(22)} ${c.items.padEnd(12)} +${c.added} -${c.removed}`);
    for (const line of c.removedLines) console.log(`      - ${line.slice(0, 170)}`);
  }
  const unchanged = Object.keys(pre.digest).filter((d) => d !== '#GATING' && pre.digest[d]?.digest === post.digest[d]?.digest);
  console.log('\nunchanged dimensions:', unchanged.join(', '));

  const write = process.argv.indexOf('--write');
  if (write > 0) {
    const out = {
      tool: 'herkeys-schema-fingerprint',
      toolVersion: 1,
      label: `HK-FEATURE-13 (People OS): a BARE local database (auth stub + the five WAVE3_BASE migrations + ${F13}), measured by scripts-dev/f13-fingerprint.mjs. OLD (same method, WAVE3_BASE only) #GATING ${pre.digest['#GATING'].digest} / ${pre.digest['#GATING'].items} facts. A bare database carries 7 fewer default-ACL facts than the Supabase default database.`,
      searchPath: "''",
      scope: ['public', 'private'],
      dimensions: Object.fromEntries(Object.entries(post.digest).filter(([d]) => d !== '#GATING')),
      gating: post.digest['#GATING'],
      old: { gating: pre.digest['#GATING'] },
      changed: changed.map(({ dimension, items, added, removed, removedLines }) => ({ dimension, items, added, removed, removedLines })),
    };
    writeFileSync(join(REPO, process.argv[write + 1]), `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nwrote ${process.argv[write + 1]}`);
  }
} finally {
  admin('DROP DATABASE IF EXISTS f13_fp_pre WITH (FORCE);');
  admin('DROP DATABASE IF EXISTS f13_fp_post WITH (FORCE);');
}
