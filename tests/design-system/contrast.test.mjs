/**
 * HK-FE-UI-02 — WCAG AA contrast matrix and palette contract.
 *
 * Every text token is measured against every surface it is intended to appear on ("looks readable" is not evidence — this is).
 * Normal text needs 4.5:1, with NO large-text exemption in this matrix. Control-identifying boundaries need 3:1.
 * Owner facts from the HK-FE-UI-02 brief (Berry on off-white ≈5.10, Dusty Mauve ≈2.08, Deep Plum Gray ≈9.18, Berry on Soft
 * Lilac ≈4.16) are pinned below so a future palette edit cannot silently invalidate the design rules built on them.
 *
 * docs/design-system/contrast-matrix.md is generated from the same pair list (tests/design-system/contrastPairs.mjs).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { brandPalette, color, decorationBudget, opacity, radius, spacing } from '../../src/design/tokens.ts';
import { BOUNDARIES, BOUNDARY_FLOOR, INTENT, NORMAL_TEXT_FLOOR, SURFACES, TEXT, ratio } from './contrastPairs.mjs';

export { ratio };

describe('WCAG AA contrast matrix (canonical pairings, 4.5:1 normal-text floor)', () => {
  for (const [fgName, bgList] of Object.entries(INTENT)) {
    for (const bgName of bgList) {
      const r = ratio(TEXT[fgName], SURFACES[bgName]);
      test(`${fgName} on ${bgName} = ${r.toFixed(2)}:1`, () => {
        assert.ok(r >= NORMAL_TEXT_FLOOR, `${fgName} on ${bgName} is ${r.toFixed(2)}:1, below ${NORMAL_TEXT_FLOOR}:1`);
      });
    }
  }

  test('matrix covers every canonical text token', () => {
    for (const name of Object.keys(TEXT)) assert.ok(INTENT[name], `${name} has no intended surface`);
  });
});

describe('Owner-approved brand palette (exact hexes, six colours, no seventh hue)', () => {
  test('the six brand colours are exactly the approved values', () => {
    assert.deepEqual({ ...brandPalette }, {
      berryPlum: '#A24E7A',
      dustyMauve: '#C7A6BB',
      softLilac: '#EADFEA',
      warmOffWhite: '#FDF8F5',
      deepPlumGray: '#5A3A55',
      luxuryBlack: '#1E1B1D',
    });
  });

  test('canonical roles resolve to the right brand colour', () => {
    assert.equal(color.background, brandPalette.warmOffWhite);
    assert.equal(color.action.primary, brandPalette.berryPlum);
    assert.equal(color.text.primary, brandPalette.deepPlumGray);
    assert.equal(color.surface.tint, brandPalette.softLilac);
    assert.equal(color.luxury.black, brandPalette.luxuryBlack);
    assert.equal(color.action.primaryBorder, brandPalette.dustyMauve);
  });

  test('pinned owner measurements', () => {
    const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.06, `${actual} vs ${expected}`);
    near(ratio(brandPalette.berryPlum, brandPalette.warmOffWhite), 5.1);
    near(ratio(brandPalette.dustyMauve, brandPalette.warmOffWhite), 2.08);
    near(ratio(brandPalette.deepPlumGray, brandPalette.warmOffWhite), 9.18);
    near(ratio(brandPalette.berryPlum, brandPalette.softLilac), 4.16);
  });

  test('Dusty Mauve is never an ordinary-text token (it fails 4.5 on every light surface)', () => {
    for (const surface of ['background', 'surface.primary', 'surface.secondary', 'surface.tint']) {
      assert.ok(ratio(brandPalette.dustyMauve, SURFACES[surface]) < NORMAL_TEXT_FLOOR, `mauve on ${surface}`);
    }
    // luxury.glyph is Dusty Mauve ON Luxury Black (7.81:1) — an icon on a black badge, not text on a light ground.
    for (const [name, value] of Object.entries(TEXT)) if (name !== 'luxury.glyph') assert.notEqual(value.toLowerCase(), brandPalette.dustyMauve.toLowerCase());
  });

  test('Berry Plum is NOT an allowed small-text colour on Soft Lilac; onSoft is, and it is legal there', () => {
    assert.ok(ratio(color.action.primary, color.action.primarySoft) < NORMAL_TEXT_FLOOR, 'the owner palette makes berry-on-lilac illegal');
    assert.ok(!INTENT['action.primary'].includes('action.primarySoft'));
    assert.ok(!INTENT['action.primary'].includes('surface.tint'));
    assert.ok(ratio(color.action.onSoft, color.action.primarySoft) >= NORMAL_TEXT_FLOOR);
    assert.ok(ratio(color.text.primary, color.surface.tint) >= NORMAL_TEXT_FLOOR);
  });

  test('no blue / teal anywhere in the palette (hue 165°–265° at any visible saturation)', () => {
    const flat = [];
    const walk = (node, path) => {
      if (typeof node === 'string' && /^#[0-9a-f]{6}$/i.test(node)) flat.push([path, node]);
      else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    };
    walk(color, 'color');
    assert.ok(flat.length > 40, 'walked the palette');
    for (const [path, hex] of flat) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      if (chroma < 0.04) continue; // neutrals
      let h;
      if (max === r) h = ((g - b) / chroma) % 6;
      else if (max === g) h = (b - r) / chroma + 2;
      else h = (r - g) / chroma + 4;
      h = (h * 60 + 360) % 360;
      assert.ok(!(h >= 165 && h <= 265), `${path} ${hex} has blue/teal hue ${h.toFixed(0)}°`);
    }
  });

  test('Luxury Black stays a micro-detail: it is not a surface or background role', () => {
    for (const role of ['primary', 'secondary', 'elevated', 'tint']) {
      assert.notEqual(color.surface[role].toLowerCase(), brandPalette.luxuryBlack.toLowerCase());
    }
    assert.notEqual(color.background.toLowerCase(), brandPalette.luxuryBlack.toLowerCase());
    assert.notEqual(color.action.primary.toLowerCase(), brandPalette.luxuryBlack.toLowerCase());
  });
});

describe('Functional (non-brand) semantic colours', () => {
  test('error / success / warning keep their accessible families on the new light surfaces', () => {
    assert.equal(color.status.risk, '#8A3B2C');
    assert.equal(color.status.success, '#33523F');
    assert.equal(color.status.attention, '#6E4C0E');
    for (const [fg, soft] of [['risk', 'riskSoft'], ['success', 'successSoft'], ['attention', 'attentionSoft'], ['waiting', 'waitingSoft']]) {
      assert.ok(ratio(color.status[fg], color.status[soft]) >= NORMAL_TEXT_FLOOR, `${fg} on ${soft}`);
      assert.ok(ratio(color.status[fg], color.background) >= NORMAL_TEXT_FLOOR, `${fg} on background`);
    }
  });

  test('information is Deep Plum Gray (paired with an icon in InlineNotice)', () => {
    assert.equal(color.status.info, brandPalette.deepPlumGray);
  });

  test('disabled is a distinct, readable pair — not decorative pastel and not lowered opacity', () => {
    assert.ok(ratio(color.action.disabledText, color.action.disabled) >= NORMAL_TEXT_FLOOR);
    assert.notEqual(color.action.disabled.toLowerCase(), color.action.primary.toLowerCase());
  });
});

describe('Component-identifying boundaries (WCAG 1.4.11, 3:1)', () => {
  for (const [name, { value, against }] of Object.entries(BOUNDARIES)) {
    for (const surface of against) {
      test(`${name} against ${surface}`, () => {
        assert.ok(ratio(value, SURFACES[surface]) >= BOUNDARY_FLOOR, `${name} on ${surface}`);
      });
    }
  }
});

describe('Primary button recipe (spec §7)', () => {
  test('white text is readable at the brightest (resting) and darkest (pressed) fill', () => {
    assert.ok(ratio(color.text.inverse, color.action.primary) >= NORMAL_TEXT_FLOOR);
    assert.ok(ratio(color.text.inverse, color.action.primaryPressed) >= NORMAL_TEXT_FLOOR);
  });

  test('highlight and lower edge are opaque (reduced-transparency safe) and stay close to Berry', () => {
    assert.match(color.action.primaryHighlight, /^#[0-9A-F]{6}$/i);
    assert.match(color.action.primaryPressed, /^#[0-9A-F]{6}$/i);
    // the button still reads predominantly Berry: neither edge colour strays far in luminance
    assert.ok(ratio(color.action.primaryHighlight, color.action.primary) < 1.6, 'highlight stays Berry-family');
    assert.ok(ratio(color.action.primaryPressed, color.action.primary) < 1.6, 'lower edge stays Berry-family');
  });
});

describe('Shape and decoration discipline', () => {
  test('card-scale radii stay at or below lg; only pills are infinite', () => {
    assert.ok(radius.lg <= 20, 'largest finite radius stays restrained');
    assert.equal(radius.pill, 999);
  });

  test('the airy spacing scale is the preserved one', () => {
    assert.deepEqual(Object.values(spacing), [2, 4, 8, 12, 16, 20, 24, 32, 40]);
  });

  test('decoration is faint and yields to function on compact screens / large text', () => {
    assert.ok(opacity.decoration <= 0.5, 'botanicals stay secondary');
    assert.equal(decorationBudget.minWidth, 360);
    assert.ok(decorationBudget.maxFontScale <= 1.3);
  });
});
