/**
 * HK-FE-UI-02 — runs the whole app suite with the rendered-contrast preload and prints every text/icon whose colour fails WCAG
 * against the background actually behind it in some test render (final state of each renderer).
 *
 *   node scripts-dev/ui02-contrast-audit.mjs [--json out.json]
 *
 * Exit code 1 when there is any finding, so it can gate a phase. Reads no secrets and writes only a temp directory.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'hk-ui-contrast-'));
const run = spawnSync(
  process.execPath,
  ['--import', './tests/support/register-ts.mjs', '--import', './tests/support/register-jsx.mjs', '--import', './tests/support/contrast-preload.mjs', '--test', '--test-concurrency=1', 'tests/**/*.test.mjs'],
  { env: { ...process.env, HK_UI_CONTRAST_AUDIT: dir }, stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 1 << 28 },
);

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const rows = new Map();
let renders = 0;
let measured = 0;
for (const f of files) {
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  renders += j.renders;
  measured += j.measured;
  for (const finding of j.findings) {
    const key = `${finding.kind}|${finding.fg}|${finding.bg}|${finding.sample}`;
    const row = rows.get(key) ?? { ...finding, tests: new Set() };
    if (/contrastAudit.test.mjs$/.test(j.file)) continue; // the audit's own synthetic negative case
    row.tests.add(j.file.replace(/^.*[\/]tests[\/]/, 'tests/'));
    rows.set(key, row);
  }
}
const list = [...rows.values()].sort((a, b) => a.ratio - b.ratio);
console.log(`test processes with renders: ${files.length}; renders audited: ${renders}; text/icon samples measured: ${measured}; failing: ${list.length}`);
for (const r of list) {
  console.log(`${r.ratio.toFixed(2)}:1 < ${r.floor}  ${r.kind} ${r.fg} on ${r.bg}  "${r.sample}"  [${[...r.tests].slice(0, 2).join(', ')}]`);
}
const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > -1) writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(list.map((r) => ({ ...r, tests: [...r.tests] })), null, 2));
console.log(`suite exit code (informational): ${run.status}`);
process.exit(list.length ? 1 : 0);
