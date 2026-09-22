#!/usr/bin/env node
/**
 * Feature 08 (Meals OS) scenario map -> markdown.
 *
 *   node scripts-dev/meals-scenario-report.cjs            validate the map and write docs/builds/HK_FEATURE_08_SCENARIO_MAP.md
 *   node scripts-dev/meals-scenario-report.cjs --check    validate only; exit 1 on any structural problem
 *
 * tests/fixtures/meals/scenario-map.json is the source of truth. This script never invents a result: the
 * Result column is the recorded `status` (PLANNED until the ML8 run replaces it).
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MAP = path.join(ROOT, 'tests', 'fixtures', 'meals', 'scenario-map.json');
const OUT = path.join(ROOT, 'docs', 'builds', 'HK_FEATURE_08_SCENARIO_MAP.md');

const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const problems = [];

const ids = new Set();
for (const s of map.scenarios) {
  if (ids.has(s.id)) problems.push(`duplicate scenario id ${s.id}`);
  ids.add(s.id);
  if (!map.statusVocabulary.includes(s.expected) && s.expected !== 'PASS') problems.push(`${s.id}: expected "${s.expected}" is not in the status vocabulary`);
  if (!Array.isArray(s.assertions) || s.assertions.length === 0) problems.push(`${s.id}: no named assertions`);
  if (!Array.isArray(s.tests) || s.tests.length === 0) problems.push(`${s.id}: no test location`);
  for (const key of s.tests ?? []) if (!(key in map.testFiles)) problems.push(`${s.id}: unknown test file key ${key}`);
  for (const m of s.mutants ?? []) if (!map.mutants.some((x) => x.id === m)) problems.push(`${s.id}: unknown mutant ${m}`);
  if (!s.setup) problems.push(`${s.id}: no deterministic setup`);
  if (!Array.isArray(s.evidence)) problems.push(`${s.id}: no evidence list`);
}
for (const m of map.mutants) {
  for (const g of m.guards) if (!ids.has(g)) problems.push(`mutant ${m.id} guards unknown scenario ${g}`);
  for (const key of m.tests) if (!(key in map.testFiles)) problems.push(`mutant ${m.id}: unknown test file key ${key}`);
}
const tier = (n) => map.scenarios.filter((s) => s.tier === n).length;

if (process.argv.includes('--check')) {
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`scenario map OK: ${map.scenarios.length} scenarios (tier 1: ${tier(1)}, tier 2: ${tier(2)}, tier 3: ${tier(3)}), ${map.mutants.length} mutants`);
  process.exit(0);
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const cell = (text) => String(text).replace(/\|/g, '\\|');
const files = (keys) => keys.map((k) => '`' + map.testFiles[k] + '`').join('<br>');
const lines = [];
lines.push('# HK-FEATURE-08 — Scenario assertion map');
lines.push('');
lines.push('Generated from `tests/fixtures/meals/scenario-map.json` by `node scripts-dev/meals-scenario-report.cjs`. Do not edit by hand.');
lines.push('');
lines.push(map.convention);
lines.push('');
lines.push(`${map.scenarios.length} scenarios (tier 1: ${tier(1)}, tier 2: ${tier(2)}, tier 3: ${tier(3)}), ${map.mutants.length} mutants. Result vocabulary: ${map.statusVocabulary.join(', ')}.`);
lines.push('');
for (const n of [1, 2, 3]) {
  lines.push(`## Tier ${n}`);
  lines.push('');
  lines.push('| ID | Scenario | Expected | Deterministic setup | Named assertions | Evidence facts | Test location | Mutants | Result |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of map.scenarios.filter((x) => x.tier === n)) {
    lines.push(
      `| ${s.id} | ${cell(s.title)} | ${s.expected} | ${cell(s.setup)} | ${s.assertions.map(cell).join('<br>')} | ${s.evidence.map((e) => '`' + e + '`').join(', ')} | ${files(s.tests)} | ${(s.mutants ?? []).join(', ') || '—'} | ${s.status ?? 'PLANNED'} |`,
    );
  }
  lines.push('');
}
lines.push('## Mutants (test-the-test)');
lines.push('');
lines.push('| ID | What is broken | Guards | Tests that must fail |');
lines.push('| --- | --- | --- | --- |');
for (const m of map.mutants) lines.push(`| ${m.id} | ${cell(m.what)}${m.kind === 'sql' ? ' (database mutant)' : ''} | ${m.guards.join(', ')} | ${files(m.tests)} |`);
lines.push('');
fs.writeFileSync(OUT, lines.join('\n'));
console.log(`wrote ${path.relative(ROOT, OUT)} (${map.scenarios.length} scenarios, ${map.mutants.length} mutants)`);
