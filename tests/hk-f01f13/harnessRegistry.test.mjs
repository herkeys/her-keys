/**
 * HK13-D43 (P4) — every feature's real-database journey runs in the integrated backend harness (HK-F01-F13 integration audit).
 *
 * Feature 07's journey (supabase/tests/journey-coparent.mjs) ran only through its own runner against the shared default database,
 * which carries no migration after F05, so the integrated chain never met it and the full harness never said so. These hold the
 * harness to every journey file in supabase/tests: each one runs in the full run (`node supabase/tests/run.mjs`, the "journeys"
 * block), on the private stack that carries the whole chain.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const TESTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'tests');
const runner = readFileSync(join(TESTS, 'run.mjs'), 'utf8');

/** The body of the full run's journey block: from `if (only === 'journeys' || !only) {` to its closing brace. */
function journeyBlock() {
  const start = runner.indexOf("if (only === 'journeys' || !only) {");
  assert.ok(start >= 0, 'run.mjs has a journeys block');
  let depth = 0;
  for (let i = runner.indexOf('{', start); i < runner.length; i++) {
    if (runner[i] === '{') depth += 1;
    else if (runner[i] === '}' && --depth === 0) return runner.slice(start, i + 1);
  }
  throw new Error('unterminated journeys block');
}

describe('HK13-D43 — the integrated harness runs every journey', () => {
  test('every supabase/tests/journey-*.mjs is imported by the full run, on the private stack', () => {
    const journeys = readdirSync(TESTS).filter((name) => /^journey-.*\.mjs$/.test(name)).sort();
    assert.ok(journeys.length >= 7, `found ${journeys.length} journey files`);
    const block = journeyBlock();
    assert.match(block, /await startJourneyStack\(\);/, 'the journeys run on the private stack (the whole chain)');
    const missing = journeys.filter((name) => !block.includes(`'${name}'`));
    assert.deepEqual(missing, [], 'a journey the full run never executes proves nothing about the integrated chain');
  });

  test('a journey reads the stack database it is given, never a hard-coded shared one', () => {
    for (const name of readdirSync(TESTS).filter((n) => /^journey-.*\.mjs$/.test(n))) {
      const text = readFileSync(join(TESTS, name), 'utf8');
      assert.equal(/psql\(\s*'postgres'/.test(text), false, `${name} queries the shared default database directly`);
    }
  });
});
