// Renders the Feature 07 scenario assertion map (ledger section 26) from the executable registry.
//   node --import ./tests/support/register-ts.mjs scripts-dev/f07-scenario-map.mjs > map.md
// Every row is generated from `tests/fixtures/coparent/scenarios/index.mjs`; nothing here is prose that could drift from the tests.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SCENARIOS } from '../tests/fixtures/coparent/scenarios/index.mjs';

const tier = (n) => ({ 1: 'TIER 1', 2: 'TIER 2', 3: 'TIER 3 (conditional)' })[n];
const short = (file) => file.replace(/^tests\/coparent\//, '').replace(/\.test\.mjs$/, '').replace(/^supabase\/tests\/run-coparent\.mjs$/, 'run-coparent (real PostgreSQL)');
const golden = (id) => (existsSync(join('tests', 'fixtures', 'coparent', 'scenarios', 'golden', `${id}.json`)) ? `\`golden/${id}.json\`` : '—');

let current = null;
const lines = ['| ID | Scenario | Status | Fixture (semantic output) | Named assertions (test file › title) |', '|---|---|---|---|---|'];
for (const s of SCENARIOS) {
  if (s.tier !== current) {
    current = s.tier;
    lines.push(`| | **${tier(s.tier)}** | | | |`);
  }
  const tests = s.tests.length ? s.tests.map(([f, t]) => `${short(f)} › ${/\.test\.mjs$/.test(f) ? t : 'journey'}`).join('<br>') : '—';
  const status = s.status + (s.note ? ` ¹` : '');
  lines.push(`| ${s.id} | ${s.title} | ${status} | ${s.fixture ? golden(s.id) : 'suite property'} | ${tests} |`);
}
lines.push('', '**Notes (¹)**', '');
for (const s of SCENARIOS.filter((x) => x.note)) lines.push(`* **${s.id}** — ${s.note}`);
console.log(lines.join('\n'));
