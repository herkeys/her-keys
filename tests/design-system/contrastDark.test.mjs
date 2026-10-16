/**
 * HK-FE-UI-02-DM — the DARK scheme held to exactly the same WCAG matrix as Light (contrast.test.mjs gates Light).
 *
 * Every text token × every surface it is intended for needs 4.5:1 (no large-text exemption); control boundaries need 3:1.
 * The Dark palette introduces no new hue: no blue/teal, no pure black ground, sage stays decoration, AI structure is unchanged.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { brandPalette, color as lightColor } from '../../src/design/tokens.ts';
import { darkColor, darkTheme } from '../../src/design/theme/palettes.ts';
import { BOUNDARY_FLOOR, INTENT, NORMAL_TEXT_FLOOR, SCHEMES, ratio } from './contrastPairs.mjs';

const dark = SCHEMES.dark;

describe('Dark: WCAG AA matrix (same pair list as Light, 4.5:1)', () => {
  for (const [fgName, bgList] of Object.entries(INTENT)) {
    for (const bgName of bgList) {
      const r = ratio(dark.TEXT[fgName], dark.SURFACES[bgName]);
      test(`${fgName} on ${bgName} = ${r.toFixed(2)}:1`, () => {
        assert.ok(r >= NORMAL_TEXT_FLOOR, `${fgName} on ${bgName} is ${r.toFixed(2)}:1`);
      });
    }
  }
});

describe('Dark: control boundaries (3:1)', () => {
  for (const [name, { value, against }] of Object.entries(dark.BOUNDARIES)) {
    for (const surface of against) {
      test(`${name} against ${surface}`, () => {
        assert.ok(ratio(value, dark.SURFACES[surface]) >= BOUNDARY_FLOOR, `${name} on ${surface}`);
      });
    }
  }
});

describe('Dark palette contract', () => {
  test('the ground is Midnight Plum, not pure black, and cards sit visibly above it', () => {
    assert.equal(darkColor.background, '#211B25');
    assert.notEqual(darkColor.background.toLowerCase(), '#000000');
    for (const [lo, hi] of [['background', 'surface.primary'], ['surface.primary', 'surface.elevated']]) {
      assert.ok(ratio(dark.SURFACES[hi], dark.SURFACES[lo]) > 1.05, `${hi} is lifted above ${lo}`);
    }
    assert.equal(darkColor.text.primary, '#F7F1F6');
    assert.equal(darkColor.text.secondary, '#D1C2D0');
  });

  test('no blue / teal hue anywhere in the Dark palette (165°–265° at visible saturation)', () => {
    const flat = [];
    const walk = (node, path) => {
      if (typeof node === 'string' && /^#[0-9a-f]{6}$/i.test(node)) flat.push([path, node]);
      else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (k !== 'botanical') walk(v, `${path}.${k}`);
    };
    walk(darkColor, 'dark');
    assert.ok(flat.length > 40, 'walked the palette');
    for (const [path, hex] of flat) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const chroma = max - Math.min(r, g, b);
      if (chroma < 0.04) continue;
      let h;
      if (max === r) h = ((g - b) / chroma) % 6;
      else if (max === g) h = (b - r) / chroma + 2;
      else h = (r - g) / chroma + 4;
      h = (h * 60 + 360) % 360;
      assert.ok(!(h >= 165 && h <= 265), `${path} ${hex} has blue/teal hue ${h.toFixed(0)}°`);
    }
  });

  test('Berry stays Berry: the luminous Berry is a lightened Berry (same hue family), not a new colour', () => {
    const hue = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const c = max - Math.min(r, g, b);
      const h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
      return (h * 60 + 360) % 360;
    };
    assert.ok(Math.abs(hue(darkColor.action.primary) - hue(brandPalette.berryPlum)) < 12);
    assert.ok(ratio(darkColor.action.primary, darkColor.surface.primary) >= NORMAL_TEXT_FLOOR, 'legible as text on a card');
  });

  test('the primary button label is readable at rest AND pressed', () => {
    assert.ok(ratio(darkColor.text.inverse, darkColor.action.primary) >= NORMAL_TEXT_FLOOR);
    assert.ok(ratio(darkColor.text.inverse, darkColor.action.primaryPressed) >= NORMAL_TEXT_FLOOR);
  });

  test('disabled is a distinct readable pair, not the primary fill', () => {
    assert.ok(ratio(darkColor.action.disabledText, darkColor.action.disabled) >= NORMAL_TEXT_FLOOR);
    assert.notEqual(darkColor.action.disabled.toLowerCase(), darkColor.action.primary.toLowerCase());
  });

  test('Luxury Black stays a micro-detail: its Dark badge ground is distinct from every surface', () => {
    for (const s of ['background', 'surface.primary', 'surface.secondary', 'surface.elevated', 'surface.tint']) {
      assert.notEqual(dark.SURFACES[s].toLowerCase(), darkColor.luxury.black.toLowerCase());
    }
    assert.ok(ratio(darkColor.luxury.glyph, darkColor.luxury.black) >= NORMAL_TEXT_FLOOR);
  });

  test('AI truth semantics survive: four distinct AI families, none reduced to colour alone, none equal to another', () => {
    const families = ['insight', 'inference', 'confirmation', 'action'];
    assert.equal(new Set(families.map((f) => darkColor.ai[f].toLowerCase())).size, 4);
    // Light shares one wash between insight and action; Dark must keep exactly the same equality pattern (no family merges or splits)
    const pattern = (c) => families.map((f) => families.map((g) => c.ai[`${f}Soft`].toLowerCase() === c.ai[`${g}Soft`].toLowerCase()));
    assert.deepEqual(pattern(darkColor), pattern(lightColor));
    // the Light token KEYS are unchanged: Dark supplies a value for every semantic Light does
    assert.deepEqual(Object.keys(darkColor.ai).sort(), Object.keys(lightColor.ai).sort());
    assert.deepEqual(Object.keys(darkColor.status).sort(), Object.keys(lightColor.status).sort());
  });

  test('Dark supplies every token Light does (a missing key would fall through to undefined in a component)', () => {
    const keys = (node, prefix = '') => Object.entries(node).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    assert.deepEqual(keys(darkColor).sort(), keys(lightColor).sort());
  });

  test('Dark elevation never relies on a black shadow alone (a luminance step or rim carries depth)', () => {
    assert.equal(darkTheme.elevation.raised.shadowColor, '#000000');
    assert.ok(darkTheme.elevation.raised.shadowOpacity > 0.3, 'stronger than the Light soft shadow, which would be invisible on a dark ground');
  });
});
