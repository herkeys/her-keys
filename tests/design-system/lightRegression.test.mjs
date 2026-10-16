/**
 * HK-FE-UI-02-DM — LIGHT MODE REGRESSION and DARK MODE LEAK guards (deterministic render-tree comparison).
 *
 * 1. LIGHT IS LOCKED. tests/design-system/fixtures/light-baseline.json holds 74 rendered trees (every shared primitive, every AI
 *    register, the badges and decoration, every Welcome/auth scene, onboarding and the consent stage views) with fully resolved
 *    styles, captured from the PRE-migration source ca9e792 (static tokens). The migrated source must render IDENTICAL trees under the
 *    Light theme — with no provider, with a Light provider, and with a manual Light choice while the device is Dark.
 * 2. DARK DOES NOT LEAK LIGHT. Under the Dark theme no rendered colour may be a Light-only surface or text colour: a component that
 *    still reads the legacy static `color`/`colors` would show here as a Light value in a Dark tree.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import { AppearanceProvider } from '../../src/design/theme/index.ts';
import { darkColor, lightTheme } from '../../src/design/theme/palettes.ts';
import { renderAllSnapshots, CASES } from '../support/lightSnapshot.tsx';
import { resetAppearance, setSystemColorScheme } from '../support/rn-stub.tsx';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/light-baseline.json', import.meta.url), 'utf8'));

afterEach(() => resetAppearance());

/** First differing path between two JSON values, or null. */
function firstDifference(a, b, path = '$') {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array/object mismatch`;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const key of keys) {
    const diff = firstDifference(a[key], b[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

const compare = (actual) => {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(baseline).sort(), 'the same set of renders');
  const failures = [];
  for (const name of Object.keys(baseline)) {
    const diff = firstDifference(actual[name], baseline[name]);
    if (diff) failures.push(`${name} ${diff}`);
  }
  assert.deepEqual(failures, []);
};

describe('Light mode is unchanged by the adaptive-appearance migration', () => {
  test('the baseline covers a broad, named set of renders', () => {
    assert.ok(Object.keys(baseline).length >= 70);
    assert.deepEqual(Object.keys(CASES).sort(), Object.keys(baseline).sort());
  });

  test('with no provider mounted (isolated renders) every tree is identical to the pre-migration baseline', async () => {
    compare(await renderAllSnapshots());
  });

  test('under an explicit Light provider every tree is identical', async () => {
    compare(await renderAllSnapshots((el) => <AppearanceProvider initialPreference="light">{el}</AppearanceProvider>));
  });

  test('a manual Light choice stays Light while the device is Dark', async () => {
    setSystemColorScheme('dark');
    compare(await renderAllSnapshots((el) => <AppearanceProvider initialPreference="light">{el}</AppearanceProvider>));
  });
});

const hexesOf = (tree) => {
  const found = new Set();
  const walk = (value) => {
    if (typeof value === 'string') {
      for (const m of value.matchAll(/#[0-9A-Fa-f]{6}\b/g)) found.add(m[0].toUpperCase());
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(tree);
  return found;
};

/** The semantic colours of a set. `brand` and `botanical` are the static brand/decoration constants shared by both schemes, so they are not 'Light-only'. */
const flatten = (obj, out = new Set()) => {
  for (const [key, v] of Object.entries(obj)) {
    if (key === 'brand' || key === 'botanical') continue;
    if (typeof v === 'string') { if (/^#[0-9A-Fa-f]{6}$/.test(v)) out.add(v.toUpperCase()); }
    else if (v && typeof v === 'object') flatten(v, out);
  }
  return out;
};

describe('Dark mode contains no Light-only colour', () => {
  test('across all 74 renders, no Light surface or text colour appears in a Dark tree', async () => {
    const dark = await renderAllSnapshots((el) => <AppearanceProvider initialPreference="dark">{el}</AppearanceProvider>);
    const lightHexes = flatten(lightTheme.color);
    const darkHexes = flatten(darkColor);
    const lightOnly = new Set([...lightHexes].filter((h) => !darkHexes.has(h)));
    // pure white is Light's card/inverse colour; the Luxury Black badge is allowed only through its own dark token
    assert.ok(lightOnly.has('#FFFFFF') && lightOnly.has('#FDF8F5') && lightOnly.has('#EADFEA') && lightOnly.has('#5A3A55'));
    const leaks = [];
    for (const [name, tree] of Object.entries(dark)) {
      for (const hex of hexesOf(tree)) if (lightOnly.has(hex)) leaks.push(`${name}: ${hex}`);
    }
    assert.deepEqual(leaks, []);
  });

  test('Dark actually differs from Light in every region that paints a surface (a no-op provider would pass the leak test vacuously)', async () => {
    const dark = await renderAllSnapshots((el) => <AppearanceProvider initialPreference="dark">{el}</AppearanceProvider>);
    const differing = Object.keys(baseline).filter((name) => firstDifference(dark[name], baseline[name]) !== null);
    // Renders that are pure geometry/icons with no theme colours may legitimately match; everything else must differ.
    assert.ok(differing.length >= 60, `only ${differing.length} of ${Object.keys(baseline).length} renders changed in Dark`);
  });
});
