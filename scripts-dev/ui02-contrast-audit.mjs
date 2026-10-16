/**
 * HK-FE-UI-02 — runs the whole app suite with the rendered-contrast preload and prints every text/icon whose colour fails WCAG
 * against the background actually behind it in some test render (final state of each renderer).
 *
 *   node scripts-dev/ui02-contrast-audit.mjs [--scheme light|dark] [--json out.json]
 *
 * --scheme dark (HK-FE-UI-02-DM) makes every render that has no explicit provider draw the Dark theme (HK_UI_DEFAULT_SCHEME=dark), so
 * the same ~1,200 real renders are measured under Midnight Plum. Default is light (the approved, locked scheme).
 *
 * Exit code 1 when there is any finding, so it can gate a phase. Reads no secrets and writes only a temp directory.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const schemeIdx = process.argv.indexOf('--scheme');
const scheme = schemeIdx > -1 ? process.argv[schemeIdx + 1] : 'light';
if (!['light', 'dark'].includes(scheme)) throw new Error('--scheme must be light or dark');
const timeoutIdx = process.argv.indexOf('--timeout-minutes');
const TIMEOUT_MS = (timeoutIdx > -1 ? Number(process.argv[timeoutIdx + 1]) : 30) * 60_000;
const dir = mkdtempSync(join(tmpdir(), 'hk-ui-contrast-'));
const run = spawnSync(
  process.execPath,
  ['--import', './tests/support/register-ts.mjs', '--import', './tests/support/register-jsx.mjs', '--import', './tests/support/contrast-preload.mjs', '--test', '--test-concurrency=1', '--test-force-exit', '--test-timeout=120000', 'tests/**/*.test.mjs'],
  { timeout: TIMEOUT_MS, killSignal: 'SIGKILL', env: { ...process.env, HK_UI_CONTRAST_AUDIT: dir, ...(scheme === 'dark' ? { HK_UI_DEFAULT_SCHEME: 'dark' } : {}) }, stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 1 << 28 },
);

// A stalled or killed run is NOT a pass: say so and fail, whatever partial findings exist.
const incomplete = Boolean(run.error) || run.signal !== null;
if (incomplete) console.log(`AUDIT INCOMPLETE: ${run.error ? run.error.message : `terminated by ${run.signal}`} (bound ${TIMEOUT_MS / 60000} min)`);
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
console.log(`scheme: ${scheme}`);
console.log(`test processes with renders: ${files.length}; renders audited: ${renders}; text/icon samples measured: ${measured}; failing: ${list.length}`);
for (const r of list) {
  console.log(`${r.ratio.toFixed(2)}:1 < ${r.floor}  ${r.kind} ${r.fg} on ${r.bg}  "${r.sample}"  [${[...r.tests].slice(0, 2).join(', ')}]`);
}
const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > -1) writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(list.map((r) => ({ ...r, tests: [...r.tests] })), null, 2));
console.log(`suite exit code (informational): ${run.status}`);
console.log(incomplete ? 'RESULT: INCOMPLETE (not a pass)' : list.length ? 'RESULT: FINDINGS' : 'RESULT: PASS (completed, 0 findings)');
process.exit(incomplete || list.length ? 1 : 0);
