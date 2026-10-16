/**
 * Owner amendment 2026-10-16: sage linework "must never appear on interactive components, buttons, cards, headers, or navigation
 * chrome. It belongs only to the decorative botanical layer." This is the enforcement: the sage tokens may be read by exactly one
 * component file, and they are not part of the brand palette, text, surface, action or status groups.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { botanicalPalette, brandPalette, color } from '../../src/design/tokens.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(tsx?|js)$/.test(e.name) ? [join(dir, e.name)] : []));
const SAGE = /botanicalPalette|color\.botanical|sageOutline|sageTip|sageWhisper|botanicalOpacity|botanicalStroke/;

test('only tokens.ts and Botanical.tsx name the sage tokens in app or src', () => {
  const users = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))]
    .filter((f) => SAGE.test(readFileSync(f, 'utf8')))
    .map((f) => relative(ROOT, f).split(sep).join('/'))
    .sort();
  assert.deepEqual(users, ['src/design/components/Botanical.tsx', 'src/design/tokens.ts']);
});

test('sage is not a brand colour and is not reachable through any functional token group', () => {
  assert.equal(Object.values(brandPalette).filter((v) => Object.values(botanicalPalette).includes(v)).length, 0);
  const sage = new Set(Object.values(botanicalPalette).map((v) => v.toLowerCase()));
  const functional = ['text', 'action', 'surface', 'border', 'status', 'ai', 'neutral', 'luxury'];
  const offenders = [];
  const walkTokens = (node, path) => {
    if (typeof node === 'string') { if (sage.has(node.toLowerCase())) offenders.push(path); }
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walkTokens(v, `${path}.${k}`);
  };
  for (const group of functional) walkTokens(color[group], `color.${group}`);
  walkTokens(color.background, 'color.background');
  walkTokens(color.track, 'color.track');
  assert.deepEqual(offenders, []);
});

test('the three sage tokens are the owner-confirmed values (2026-10-16), muted greens, not blue and not a saturated hue', () => {
  assert.deepEqual({ ...botanicalPalette }, { sageOutline: '#7E9C86', sageTip: '#5F8A6B', sageWhisper: '#A8C3AE' });
  for (const hex of Object.values(botanicalPalette)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    assert.ok(g > r && g > b, `${hex} is green-dominant`);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 0.25, `${hex} is muted`);
  }
});
