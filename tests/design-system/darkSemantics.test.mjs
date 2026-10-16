/**
 * HK-FE-UI-02-DM — Dark is the SAME product, re-coloured: structure, copy, accessibility and AI-truth semantics are identical.
 *
 * Every named render (74: primitives, every AI register, badges, Welcome/auth, onboarding, consent) is serialised under Light and under
 * Dark. After normalising ONLY colour values (and the shadow strength, which Dark deliberately raises), the two trees must be equal:
 * same elements, same text, same accessibility roles/labels/states, same border STYLES (dashed = unconfirmed reading, solid rail =
 * recommendation), same icons and glyphs. A theme may never change what a thing says or what kind of thing it is.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import { AppearanceProvider } from '../../src/design/theme/index.ts';
import { renderAllSnapshots } from '../support/lightSnapshot.tsx';
import { resetAppearance } from '../support/rn-stub.tsx';

afterEach(() => resetAppearance());

const HEX = /#[0-9A-Fa-f]{6}\b/g;
const SHADOW_KEYS = new Set(['shadowOpacity', 'shadowRadius', 'shadowOffset', 'elevation']);

/** Replace every colour with a placeholder; drop shadow strength and offset. Everything else is preserved verbatim. */
function normalise(value, key = '') {
  if (typeof value === 'string') return value.replace(HEX, '#');
  if (Array.isArray(value)) return value.map((v) => normalise(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!SHADOW_KEYS.has(k)) out[k] = normalise(v, k);
    return out;
  }
  return value;
}

let light;
let dark;
const both = async () => {
  if (!light) {
    light = await renderAllSnapshots((el) => <AppearanceProvider initialPreference="light">{el}</AppearanceProvider>);
    dark = await renderAllSnapshots((el) => <AppearanceProvider initialPreference="dark">{el}</AppearanceProvider>);
  }
  return { light, dark };
};

const firstDifference = (a, b, path = '$') => {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDifference(a[key], b[key], `${path}.${key}`);
    if (d) return d;
  }
  return null;
};

describe('Dark differs from Light in COLOUR only', () => {
  test('across every named render, structure, copy, accessibility props and border styles are identical', async () => {
    const { light: l, dark: d } = await both();
    assert.deepEqual(Object.keys(d).sort(), Object.keys(l).sort());
    const failures = [];
    for (const name of Object.keys(l)) {
      const diff = firstDifference(normalise(l[name]), normalise(d[name]));
      if (diff) failures.push(`${name} ${diff}`);
    }
    assert.deepEqual(failures, []);
  });
});

const collect = (tree, pick, out = []) => {
  if (!tree || typeof tree === 'string') return out;
  if (Array.isArray(tree)) { tree.forEach((t) => collect(t, pick, out)); return out; }
  pick(tree, out);
  (tree.children ?? []).forEach((c) => collect(c, pick, out));
  return out;
};

describe('AI truth language is carried by shape, not just colour — in both schemes', () => {
  for (const scheme of ['light', 'dark']) {
    test(`${scheme}: an unconfirmed reading is dashed, a recommendation has a solid rail, confirmation has its own mark`, async () => {
      const trees = (await both())[scheme];
      const styles = (name) => collect(trees[name], (n, out) => out.push(n.props.style ?? {}));
      assert.ok(styles('ai/insight').some((s) => s.borderStyle === 'dashed'), 'insight is dashed');
      assert.ok(!styles('ai/recommendation').some((s) => s.borderStyle === 'dashed'), 'a recommendation is not a dashed reading');
      assert.ok(styles('ai/recommendation').some((s) => (s.borderLeftWidth ?? 0) >= 3 || (s.borderStartWidth ?? 0) >= 3), 'recommendation keeps its solid rail');
      const marks = (name) => collect(trees[name], (n, out) => { if (n.props.testID) out.push(n.props.testID); });
      assert.ok(marks('ai/marks').includes('ai-mark-confirmed') && marks('ai/marks').includes('ai-mark-noticed'));
      assert.ok(!marks('ai/insight').includes('ai-mark-confirmed'), 'an insight never implies confirmation');
    });
  }

  test('the approval-needed recommendation still says so in words in Dark', async () => {
    const { dark: d } = await both();
    const text = collect(d['ai/recommendation-approval'], (n, out) => { if (typeof n.children?.[0] === 'string') out.push(n.children.join('')); }).join(' ');
    assert.match(text, /NEEDS YOUR YES/);
  });
});
