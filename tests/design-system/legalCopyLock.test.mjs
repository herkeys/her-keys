/**
 * HK-FE-UI-02 §14.5 — "Do not rewrite legal or consent language without separate owner/legal approval."
 *
 * The fixture was extracted from the pinned baseline (ccdcffc) before any redesign edit. This test fails if a single
 * consent, permission, AI-processing or recovery sentence is removed or reworded by a presentation change. Adding
 * presentation structure (cards, icons, spacing) never touches these strings; changing them needs the owner/legal decision
 * AND an explicit edit to the fixture in the same commit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../../', import.meta.url);
const lock = JSON.parse(readFileSync(new URL('tests/design-system/fixtures/legal-copy-lock.json', ROOT), 'utf8'));

for (const [path, strings] of Object.entries(lock)) {
  test(`${path}: every locked legal/consent/permission string is still present, byte for byte`, () => {
    const source = (readFileSync(new URL(path, ROOT), 'utf8') + (path.endsWith('ConsentFlow.tsx') ? readFileSync(new URL('src/features/consent/ConsentViews.tsx', ROOT), 'utf8') : '')).replace(/\s+/g, ' ');
    assert.ok(strings.length > 30);
    const missing = strings.filter((s) => !source.includes(s.replace(/\s+/g, ' ')));
    assert.deepEqual(missing, []);
  });
}

test('the consent receipts written on Agree and Continue are exactly the baseline set', () => {
  const source = (readFileSync(new URL('src/features/consent/ConsentFlow.tsx', ROOT), 'utf8') + readFileSync(new URL('src/features/consent/ConsentViews.tsx', ROOT), 'utf8')).replace(/\s+/g, ' ');
  for (const receipt of [
    "{ consent_type: 'terms', granted: true }",
    "{ consent_type: 'privacy', granted: true }",
    "{ consent_type: 'age18', granted: true }",
    "{ consent_type: 'ai_processing', granted: ai }",
  ]) assert.ok(source.includes(receipt), receipt);
  assert.ok(source.includes('!terms || !privacy || !adult || ai === null'), 'the commit gate is unchanged');
});
