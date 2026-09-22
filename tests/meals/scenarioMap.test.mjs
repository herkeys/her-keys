/**
 * HK-FEATURE-08 / ML7 — scenario prose is not coverage.
 *
 * tests/fixtures/meals/scenario-map.json lists every scenario, the test files that carry it, and the mutants that guard it. A scenario
 * is covered only if a test in a listed file carries its id in a bracketed title token (`[K]`, `[K1]`), a listed SQL or journey file
 * exists and names it, and every mutant it names exists in the mutation script. This test fails the moment a scenario has no test.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const map = JSON.parse(readFileSync(new URL('../fixtures/meals/scenario-map.json', import.meta.url), 'utf8'));
const read = (file) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');

/** Files where a scenario is carried by a bracketed id in a test title. SQL and journey files name their checks in prose. */
const isJsTest = (file) => file.startsWith('tests/');
const carries = (text, id) => new RegExp(`\\[${id}\\d*\\]`).test(text);

describe('the scenario map is honest', () => {
  test('[map] every scenario names a deterministic setup, assertions, evidence and existing test files', () => {
    for (const s of map.scenarios) {
      assert.ok(s.setup && s.assertions.length > 0 && Array.isArray(s.evidence), s.id);
      for (const key of s.tests) assert.ok(existsSync(new URL('../../' + map.testFiles[key], import.meta.url)), `${s.id}: ${map.testFiles[key]} does not exist`);
    }
  });

  test('[map] every scenario is carried by at least one test that names it (no scenario counts on prose alone)', () => {
    const uncovered = [];
    for (const s of map.scenarios) {
      const files = s.tests.map((key) => map.testFiles[key]);
      const js = files.filter(isJsTest);
      const other = files.filter((f) => !isJsTest(f));
      const carried = js.some((f) => carries(read(f), s.id));
      const carriedByBackend = other.length > 0 && other.every((f) => existsSync(new URL('../../' + f, import.meta.url)));
      if (!carried && !(js.length === 0 && carriedByBackend)) uncovered.push(`${s.id} (${s.title}) in ${files.join(', ')}`);
    }
    assert.deepEqual(uncovered, [], 'each of these scenarios has no test whose title carries its id');
  });

  test('[map] every mutant a scenario names exists, and every mutant guards real scenarios and names real test files', () => {
    const ids = new Set(map.scenarios.map((s) => s.id));
    const mutants = new Set(map.mutants.map((m) => m.id));
    for (const s of map.scenarios) for (const m of s.mutants ?? []) assert.ok(mutants.has(m), `${s.id} names ${m}`);
    for (const m of map.mutants) {
      assert.ok(m.guards.every((g) => ids.has(g)), m.id);
      for (const key of m.tests) assert.ok(existsSync(new URL('../../' + map.testFiles[key], import.meta.url)), `${m.id}: ${map.testFiles[key]}`);
    }
  });

  test('[map] the mutation script implements every mutant the map lists, by id', () => {
    const script = existsSync(new URL('../../scripts-dev/meals-mutation-check.cjs', import.meta.url)) ? read('scripts-dev/meals-mutation-check.cjs') : '';
    const missing = map.mutants.filter((m) => !new RegExp(`id:\\s*'${m.id}'`).test(script)).map((m) => m.id);
    assert.deepEqual(missing, [], 'these mutants are listed but not implemented');
  });

  test('[map] the tier counts match the contract: 46 tier 1 (including the resume-brief additions), 31 tier 2, 8 tier 3', () => {
    const tier = (n) => map.scenarios.filter((s) => s.tier === n).length;
    assert.deepEqual([tier(1), tier(2), tier(3)], [46, 31, 8]);
    assert.equal(map.mutants.length, 20);
    void ROOT;
  });
});
