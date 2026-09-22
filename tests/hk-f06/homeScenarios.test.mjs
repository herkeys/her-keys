/**
 * HK-FEATURE-06 — SCENARIO EVIDENCE: every state-based scenario is a deterministic fixture, a named semantic assertion, and a committed
 * evidence file that must regenerate byte-for-byte. `UPDATE_SCENARIOS=1 node ... --test tests/hk-f06/homeScenarios.test.mjs` rewrites the files.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildHomeView } from '../../src/features/home/model/buildHomeView.ts';
import { evidenceOfView, sectionsOf } from '../support/homeEvidence.mjs';
import { SCENARIOS } from '../support/homeScenarios.mjs';

const DIR = join(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'tests/fixtures/home/scenarios');
const UPDATE = process.env.UPDATE_SCENARIOS === '1';

const render = (scenario, view) => `${JSON.stringify({ scenario: scenario.id, tier: scenario.tier, title: scenario.title, label: view.label, context: view.context.kind, canCreate: view.canCreate, recordsConsidered: view.coverage.recordsConsidered, sections: sectionsOf(view), items: evidenceOfView(view) }, null, 2)}\n`;

describe('scenario evidence — fixture, semantic assertion, and a committed file that regenerates byte-for-byte', () => {
  if (UPDATE) mkdirSync(DIR, { recursive: true });

  for (const scenario of SCENARIOS) {
    test(`${scenario.id}. ${scenario.title}`, () => {
      const { state, nowMs } = scenario.build();
      const view = buildHomeView(state, nowMs);
      const evidence = evidenceOfView(view);
      scenario.expect(evidence, view, state);

      const text = render(scenario, view);
      const file = join(DIR, `${scenario.id}.json`);
      if (UPDATE) writeFileSync(file, text);
      assert.ok(existsSync(file), `missing committed evidence ${scenario.id}.json — regenerate with UPDATE_SCENARIOS=1`);
      assert.equal(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), text, `${scenario.id}: the semantic evidence changed — review it, then regenerate with UPDATE_SCENARIOS=1`);

      // Deterministic: building the same scenario again gives the same evidence.
      const again = scenario.build();
      assert.equal(render(scenario, buildHomeView(again.state, again.nowMs)), text, 'not deterministic');
    });
  }

  test('there is a committed evidence file for every scenario and no orphan file', () => {
    if (UPDATE) return;
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
    assert.deepEqual(files, SCENARIOS.map((s) => s.id).sort());
  });
});
