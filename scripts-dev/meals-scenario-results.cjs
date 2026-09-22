#!/usr/bin/env node
/**
 * HK-FEATURE-08-MEALS — turn a REAL test run into per-scenario results. Nothing here is asserted by hand.
 *
 *   node scripts-dev/meals-scenario-results.cjs --tap run.tap [--harness harness.txt] [--journeys journeys.txt] [--write]
 *
 * For every scenario in tests/fixtures/meals/scenario-map.json:
 *   - the JS tests carrying its id in a bracketed title token (`[K]`, `[K1]`) are read from the TAP output of the suite run;
 *   - scenarios that also (or only) rest on the backend need a named `ok` line in the harness or journey output;
 *   - any carrying test that failed makes it FAIL; no carrying evidence at all makes it DEFERRED-IN-RUN;
 *   - otherwise its result is the scenario's `expected` status (PASS, or the truthful SAFE-UNAVAILABLE / NOT-APPLICABLE the map recorded,
 *     which is only credited when its carrying test passed).
 * With --write the results are stored as each scenario's `status` and the markdown table is regenerated.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MAP = path.join(ROOT, 'tests', 'fixtures', 'meals', 'scenario-map.json');
const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : null;
};
const read = (file) => (file ? fs.readFileSync(file, 'utf8') : '');

const tapFile = arg('--tap');
if (!tapFile) {
  console.error('usage: meals-scenario-results.cjs --tap <file> [--harness <file>] [--journeys <file>] [--write]');
  process.exit(2);
}
const tap = read(tapFile);
const harness = read(arg('--harness'));
const journeys = read(arg('--journeys'));
const okLines = (text) => text.split('\n').filter((l) => /^\s*ok\s/.test(l));
const backend = { harness: okLines(harness), journeys: okLines(journeys) };

/** Backend evidence each backend-carried scenario needs: [source, substring of an `ok` line]. */
const BACKEND = {
  AL: [['harness', 'an unrelated account sees none of household A'], ['journeys', 'meals: RLS - an unrelated account cannot read']],
  BP: [['harness', 'ENV A: meal_plan_entries.meal_slot and .status are text NOT NULL'], ['harness', 'ENV A: the additive F08 migration applies']],
  BQ: [['harness', 'ENV E: EVERY pre-existing plan reads as a live plan']],
  BR: [['harness', 'the owner archives and re-slots in ONE update'], ['harness', 'a hard DELETE is denied to the owner']],
  BS: [['harness', 'the member CAN archive a household-scope plan']],
  BT: [['harness', 'an unrelated account cannot INSERT a plan'], ['journeys', 'meals: RLS - nor plant a plan in it']],
  O: [['journeys', 'meals: the archived plans are held on B']],
  AH: [['journeys', 'meals: CLIENT A -> queue -> PostgreSQL -> CLIENT B']],
};
const backendMet = (id) => (BACKEND[id] ?? []).every(([source, needle]) => backend[source].some((l) => l.includes(needle)));

const titles = [...tap.matchAll(/^\s*(not ok|ok) \d+ - (.*?)(?: # .*)?$/gm)].map((m) => ({ ok: m[1] === 'ok', title: m[2] }));
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const summary = { PASS: 0, 'SAFE-UNAVAILABLE': 0, 'NOT-APPLICABLE': 0, 'INHERITED-POSTURE': 0, 'DEFERRED-IN-RUN': 0, FAIL: 0 };
const rows = [];

for (const scenario of map.scenarios) {
  const token = new RegExp(`\\[${scenario.id}\\d*\\]`);
  const carrying = titles.filter((t) => token.test(t.title));
  const failed = carrying.filter((t) => !t.ok);
  const needsBackend = scenario.tests.some((k) => k === 'SQL77' || k === 'JRN');
  const onlyBackend = scenario.tests.every((k) => k === 'SQL77' || k === 'JRN');
  let status;
  let detail;
  if (failed.length > 0) {
    status = 'FAIL';
    detail = `failed: ${failed.map((t) => t.title).join(' | ')}`;
  } else if (onlyBackend) {
    status = backendMet(scenario.id) ? scenario.expected : 'DEFERRED-IN-RUN';
    detail = backendMet(scenario.id) ? 'backend evidence ok' : 'backend evidence not present in the supplied harness/journey output';
  } else if (carrying.length === 0) {
    status = 'DEFERRED-IN-RUN';
    detail = 'no test carrying this id was in the run';
  } else if (needsBackend && !backendMet(scenario.id)) {
    status = 'DEFERRED-IN-RUN';
    detail = `${carrying.length} test(s) passed but the backend evidence is missing`;
  } else {
    status = scenario.expected;
    detail = `${carrying.length} test(s) passed${needsBackend ? ' + backend evidence' : ''}`;
  }
  summary[status] = (summary[status] ?? 0) + 1;
  rows.push({ id: scenario.id, tier: scenario.tier, status, detail });
  if (process.argv.includes('--write')) scenario.status = status;
}

console.log(`scenarios: ${map.scenarios.length}  ${Object.entries(summary).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join('  ')}`);
for (const r of rows.filter((x) => x.status === 'FAIL' || x.status === 'DEFERRED-IN-RUN')) console.log(`  ${r.status}  ${r.id}: ${r.detail}`);
for (const tier of [1, 2, 3]) {
  const inTier = rows.filter((r) => r.tier === tier);
  const counts = inTier.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  console.log(`  tier ${tier}: ${inTier.length} scenarios  ${Object.entries(counts).map(([k, n]) => `${k}=${n}`).join('  ')}`);
}
if (process.argv.includes('--write')) {
  fs.writeFileSync(MAP, `${JSON.stringify(map, null, 2)}\n`);
  execFileSync(process.execPath, [path.join(__dirname, 'meals-scenario-report.cjs')], { cwd: ROOT, stdio: 'inherit' });
}
process.exit(summary.FAIL > 0 ? 1 : 0);
