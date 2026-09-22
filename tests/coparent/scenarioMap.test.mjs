import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { REQUIRED_IDS, SCENARIOS, VALID_STATUS } from '../fixtures/coparent/scenarios/index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOLDEN = join(ROOT, 'tests', 'fixtures', 'coparent', 'scenarios', 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

// JSON with stable key order, so a golden file is a reviewable artifact.
const stable = (value) => JSON.stringify(value, (_key, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v), 2);

describe('Scenario assertion map — scenario prose is not coverage', () => {
  test('every required scenario (Tier 1, addendum Tier 1, Tier 2, Tier 3) has exactly one entry with a valid status', () => {
    const ids = SCENARIOS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate scenario ids');
    assert.deepEqual(REQUIRED_IDS.filter((id) => !ids.includes(id)), [], 'a required scenario has no entry');
    assert.deepEqual(ids.filter((id) => !REQUIRED_IDS.includes(id)), [], 'an entry names a scenario the contract does not list');
    for (const s of SCENARIOS) assert.ok(VALID_STATUS.includes(s.status), `${s.id}: ${s.status}`);
  });

  test('Tier 1 has no DEFERRED-IN-RUN and no FAIL; anything other than PASS explains itself', () => {
    for (const s of SCENARIOS) {
      if (s.tier === 1) assert.ok(!['DEFERRED-IN-RUN', 'FAIL'].includes(s.status), `${s.id} is ${s.status}`);
      if (s.status !== 'PASS') assert.ok(s.note && s.note.length > 30, `${s.id} (${s.status}) needs an explanation`);
    }
  });

  test('every PASS scenario names at least one assertion, and each named test REALLY EXISTS in its file', () => {
    for (const s of SCENARIOS) {
      if (s.status === 'PASS') assert.ok(s.tests.length > 0, `${s.id} claims PASS with no test`);
      for (const [file, fragment] of s.tests) {
        const path = join(ROOT, file);
        assert.ok(existsSync(path), `${s.id}: ${file} does not exist`);
        const text = readFileSync(path, 'utf8');
        if (!file.endsWith('.test.mjs')) {
          assert.ok(/Feature 07/.test(text) && existsSync(join(ROOT, 'supabase', 'tests', 'journey-coparent.mjs')), `${s.id}: ${file} is not the Feature 07 journey`);
          continue;
        }
        const lines = text.split(/\r?\n/).filter((line) => /\b(test|it)\(/.test(line));
        assert.ok(lines.some((line) => line.includes(fragment)), `${s.id}: no test titled like "${fragment}" in ${file}`);
      }
    }
  });

  for (const s of SCENARIOS.filter((x) => x.fixture)) {
    test(`${s.id}: ${s.title} — the deterministic fixture produces exactly the expected semantic evidence`, () => {
      const { semantic } = s.fixture();
      const again = s.fixture().semantic;
      assert.equal(stable(again), stable(semantic), 'the fixture is deterministic');

      if (s.expect !== undefined) {
        if (Array.isArray(s.expect)) assert.deepEqual(semantic, s.expect, 'hand-written expected evidence');
        else for (const [key, value] of Object.entries(s.expect)) assert.deepEqual(semantic[key], value, `expected ${key}`);
      }

      const file = join(GOLDEN, `${s.id}.json`);
      if (UPDATE) {
        mkdirSync(GOLDEN, { recursive: true });
        writeFileSync(file, `${stable(semantic)}\n`);
      }
      assert.ok(existsSync(file), `golden ${s.id}.json is missing (run with UPDATE_GOLDEN=1 and review it)`);
      assert.equal(`${stable(semantic)}\n`, readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), `${s.id}: the semantic output changed — review the diff`);
    });
  }
});
