/**
 * HK-F01-F13 integration — the Paper-and-Ink guard, where it can be held by a test (HK13-D31).
 *
 * Plum is reserved (docs/design-system/owner-decisions.md, decision 2): it marks what Her Keys noticed and never becomes chrome.
 * `InlineNotice`'s `info` tone IS plum (color.ai.insight), and it is the component's default. So in the Wave 3/4 features a notice
 * that carries a save failure or a refusal must name a tone, and never the AI one — Money and Life Admin use the umber `waiting`.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = new URL('../../', import.meta.url);
const FEATURES = ['money', 'work', 'rebuild', 'lifeAdmin', 'people'];
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.tsx') ? [join(dir, entry.name)] : []);

test('[HK13-D31] no Wave 3/4 save failure or refusal is shown in plum, the colour reserved for what Her Keys noticed', () => {
  const offenders = [];
  let checked = 0;
  for (const feature of FEATURES) {
    for (const file of walk(new URL(`src/features/${feature}/`, ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        const notice = line.match(/<InlineNotice\b([^>]*)/);
        if (!notice) return;
        const attrs = notice[1];
        // A notice whose words are a save or refusal outcome held in a variable, or a refusal copy key.
        if (!/title=\{(message|notice|error|refusal|[a-zA-Z.]*refusal[a-zA-Z._]*)\}/.test(attrs)) return;
        checked += 1;
        const tone = attrs.match(/tone="([a-z]+)"/)?.[1] ?? 'info (the default)';
        if (tone.startsWith('info')) offenders.push(`${file.split(/[\\/]src[\\/]/)[1]}:${index + 1} tone=${tone}`);
      });
    }
  }
  assert.ok(checked >= 6, `the guard saw the features' outcome notices (${checked})`);
  assert.deepEqual(offenders, []);
});
