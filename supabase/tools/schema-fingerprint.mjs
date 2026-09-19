#!/usr/bin/env node
/**
 * Her Keys schema fingerprint runner.
 *
 * The one method for every Staging / Production / local parity claim. It wraps
 * schema-lines.sql (the catalog inspection), pins search_path so deparsed text is
 * identical everywhere, hashes each dimension with COLLATE "C", and compares
 * against a committed artifact. Plain Node, no dependencies.
 *
 *   node supabase/tools/schema-fingerprint.mjs print-sql [--mode digest|detail]
 *   node supabase/tools/schema-fingerprint.mjs run     --source <src> [--mode digest|detail]
 *   node supabase/tools/schema-fingerprint.mjs verify  --source <src> --against <artifact.json>
 *   node supabase/tools/schema-fingerprint.mjs write   --source <src> --out <artifact.json> --label <text>
 *
 * <src> is one of:
 *   local          the local Supabase database   (supabase db query --local)
 *   linked         the linked project's database (supabase db query --linked; needs the CLI credential)
 *   json:<file>    rows already captured elsewhere, e.g. from the Supabase MCP
 *
 * Exit codes: 0 = ok / match, 1 = mismatch, 2 = could not run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BODY = readFileSync(join(HERE, 'schema-lines.sql'), 'utf8').trim().replace(/;\s*$/, '');
export const TOOL_VERSION = 1;

/** The exact SQL to run. Pinning search_path makes every deparsed object schema-qualified. */
export function buildSql(mode = 'digest') {
  if (mode === 'detail') {
    return `begin;
set local search_path = '';
select dimension, line from (
${BODY}
) l
order by dimension collate "C", line collate "C";
rollback;
`;
  }
  return `begin;
set local search_path = '';
with d as (
  select dimension, count(*)::int as items,
         md5(string_agg(line, E'\\n' order by line collate "C")) as digest
  from (
${BODY}
  ) l
  group by dimension
)
select dimension, items, digest from (
  select dimension, items, digest from d
  union all
  select '#GATING', coalesce(sum(items), 0)::int,
         md5(coalesce(string_agg(dimension || '=' || digest, E'\\n' order by dimension collate "C"), ''))
  from d
  where dimension not like 'info.%'
) r
order by dimension collate "C";
rollback;
`;
}

/** Pull the row array out of whatever JSON shape the transport produced. */
export function extractRows(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end < start) return null;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const found = [];
  const walk = (value) => {
    if (Array.isArray(value)) {
      if (value.length > 0 && value.every((row) => row && typeof row === 'object' && 'dimension' in row)) found.push(value);
      else value.forEach(walk);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk);
    }
  };
  walk(parsed);
  return found.length > 0 ? found[found.length - 1] : null;
}

function runCli(kind, sql) {
  const dir = mkdtempSync(join(tmpdir(), 'herkeys-fp-'));
  const file = join(dir, 'fingerprint.sql');
  try {
    writeFileSync(file, sql);
    const result = spawnSync('supabase', ['db', 'query', `--${kind}`, '--output-format', 'json', '--file', file], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error(`supabase db query --${kind} failed (exit ${result.status}): ${(result.stderr || result.stdout || '').trim().slice(0, 600)}`);
    }
    const rows = extractRows(result.stdout);
    if (!rows) throw new Error(`could not find fingerprint rows in CLI output: ${result.stdout.slice(0, 300)}`);
    return rows;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function loadRows(source, mode) {
  if (source === 'local' || source === 'linked') return runCli(source, buildSql(mode));
  if (source.startsWith('json:')) {
    const rows = extractRows(readFileSync(source.slice(5), 'utf8'));
    if (!rows) throw new Error(`no fingerprint rows found in ${source.slice(5)}`);
    return rows;
  }
  throw new Error(`unknown --source "${source}" (use local | linked | json:<file>)`);
}

function digestMap(rows) {
  const dimensions = {};
  let gating = null;
  for (const row of rows) {
    if (row.dimension === '#GATING') gating = { items: Number(row.items), digest: row.digest };
    else dimensions[row.dimension] = { items: Number(row.items), digest: row.digest };
  }
  if (!gating) throw new Error('rows are missing the #GATING summary (was digest mode used?)');
  return { dimensions, gating };
}

function compare(actual, expected) {
  const mismatches = [];
  for (const name of new Set([...Object.keys(actual.dimensions), ...Object.keys(expected.dimensions)])) {
    const a = actual.dimensions[name];
    const e = expected.dimensions[name];
    if (!a) mismatches.push(`${name}: missing from actual (expected ${e.items} items)`);
    else if (!e) mismatches.push(`${name}: not in expected (actual ${a.items} items)`);
    else if (a.digest !== e.digest || a.items !== e.items) mismatches.push(`${name}: expected ${e.items} items ${e.digest}, actual ${a.items} items ${a.digest}`);
  }
  const gatingOnly = mismatches.filter((line) => !line.startsWith('info.'));
  return { mismatches, gatingOk: gatingOnly.length === 0 && actual.gating.digest === expected.gating.digest };
}

function args(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  return { flags, command: positional[0] };
}

function printTable(map) {
  const names = Object.keys(map.dimensions).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  for (const name of names) {
    const { items, digest } = map.dimensions[name];
    console.log(`${name.padEnd(24)} ${String(items).padStart(5)}  ${digest}`);
  }
  console.log(`${'#GATING (all non-info)'.padEnd(24)} ${String(map.gating.items).padStart(5)}  ${map.gating.digest}`);
}

function main() {
  const { flags, command } = args(process.argv.slice(2));
  const mode = flags.mode ?? 'digest';
  try {
    if (command === 'print-sql') {
      process.stdout.write(buildSql(mode));
      return 0;
    }
    if (command === 'run') {
      const rows = loadRows(flags.source ?? '', mode);
      if (mode === 'detail') for (const row of rows) console.log(`${row.dimension} | ${row.line}`);
      else printTable(digestMap(rows));
      return 0;
    }
    if (command === 'verify') {
      const actual = digestMap(loadRows(flags.source ?? '', 'digest'));
      const expected = JSON.parse(readFileSync(flags.against, 'utf8'));
      const { mismatches, gatingOk } = compare(actual, expected);
      printTable(actual);
      if (mismatches.length > 0) console.log(`\ndifferences vs ${flags.against}:\n  ${mismatches.join('\n  ')}`);
      console.log(gatingOk ? '\nRESULT: MATCH (gating digest equal)' : '\nRESULT: MISMATCH');
      return gatingOk ? 0 : 1;
    }
    if (command === 'write') {
      if (!flags.out || !flags.label) throw new Error('write needs --out <file> and --label <text>');
      const actual = digestMap(loadRows(flags.source ?? '', 'digest'));
      const artifact = {
        tool: 'herkeys-schema-fingerprint',
        toolVersion: TOOL_VERSION,
        label: flags.label,
        searchPath: "''",
        scope: ['public', 'private'],
        dimensions: actual.dimensions,
        gating: actual.gating,
      };
      writeFileSync(flags.out, `${JSON.stringify(artifact, null, 2)}\n`);
      console.log(`wrote ${flags.out}`);
      printTable(actual);
      return 0;
    }
    console.error('usage: schema-fingerprint.mjs print-sql | run | verify | write   (see the header of this file)');
    return 2;
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 2;
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('schema-fingerprint.mjs')) {
  process.exitCode = main();
}
