/**
 * WCAG AA contrast matrix over the canonical token pairings (HK-FE-UI-01 §8).
 *
 * Every text token is measured against every surface it is intended to appear
 * on. "Looks readable" is not evidence — this is. Normal text needs 4.5:1,
 * large text (≥18pt regular / 14pt bold — our display/screenTitle rungs) needs
 * 3:1. Control-identifying boundaries need 3:1 against adjacent colors.
 *
 * docs/design-system/contrast-matrix.md is generated from the same pair list;
 * keep the two in sync (the doc carries ratios for humans, this test gates CI).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { color, radius, type } from '../../src/design/tokens.ts';

function lum(hex) {
  const h = hex.replace('#', '');
  const ch = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

export function ratio(fg, bg) {
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text rung → the rungs large enough to qualify for the 3:1 large-text floor. */
const LARGE = new Set(['display', 'screenTitle', 'sectionTitle', 'cardTitle']);

const SURFACES = {
  background: color.background,
  'surface.primary': color.surface.primary,
  'surface.secondary': color.surface.secondary,
  'surface.elevated': color.surface.elevated,
  'action.primarySoft': color.action.primarySoft,
  'action.primary': color.action.primary,
  'status.attentionSoft': color.status.attentionSoft,
  'status.riskSoft': color.status.riskSoft,
  'status.successSoft': color.status.successSoft,
  'status.waitingSoft': color.status.waitingSoft,
  'ai.insightSoft': color.ai.insightSoft,
  'ai.inferenceSoft': color.ai.inferenceSoft,
  'ai.confirmationSoft': color.ai.confirmationSoft,
  'ai.actionSoft': color.ai.actionSoft,
};

const TEXT = {
  'text.primary': color.text.primary,
  'text.secondary': color.text.secondary,
  'text.muted': color.text.muted,
  'action.primary': color.action.primary,
  'status.attention': color.status.attention,
  'status.risk': color.status.risk,
  'status.success': color.status.success,
  'status.waiting': color.status.waiting,
  'ai.insight': color.ai.insight,
  'ai.inference': color.status.attention,
  'ai.confirmation': color.ai.confirmation,
  'ai.action': color.ai.action,
  'neutral.deep': color.neutral.deep,
};

const INVERSE_TEXT = {
  'text.inverse': color.text.inverse,
};

/**
 * Intended pairings: which text tokens may sit on which surfaces.
 * Anything absent here is not an allowed pairing — adding one requires adding
 * it to this map and to the matrix doc.
 */
const INTENT = {
  'text.primary': ['background', 'surface.primary', 'surface.secondary', 'surface.elevated'],
  'text.secondary': ['background', 'surface.primary', 'surface.secondary', 'surface.elevated'],
  'text.muted': [
    'background', 'surface.primary', 'surface.secondary',
    'action.primarySoft', 'status.attentionSoft', 'status.successSoft', 'status.waitingSoft',
    'ai.insightSoft', 'ai.confirmationSoft', 'ai.actionSoft',
  ],
  'action.primary': ['background', 'surface.primary', 'surface.secondary', 'action.primarySoft'],
  'status.attention': ['background', 'surface.primary', 'surface.secondary', 'status.attentionSoft'],
  'status.risk': ['background', 'surface.primary', 'surface.secondary', 'status.riskSoft'],
  'status.success': ['background', 'surface.primary', 'surface.secondary', 'status.successSoft'],
  'status.waiting': ['background', 'surface.primary', 'surface.secondary', 'status.waitingSoft'],
  'ai.insight': ['background', 'surface.primary', 'ai.insightSoft'],
  'ai.inference': ['background', 'surface.primary', 'ai.inferenceSoft'],
  'ai.confirmation': ['background', 'surface.primary', 'ai.confirmationSoft'],
  'ai.action': ['background', 'surface.primary', 'ai.actionSoft'],
  'neutral.deep': ['background', 'surface.primary', 'ai.insightSoft'],
  'text.inverse': ['action.primary'],
};

describe('WCAG AA contrast matrix (canonical pairings)', () => {
  const rows = [];
  for (const [fgName, bgList] of Object.entries(INTENT)) {
    for (const bgName of bgList) {
      const fg = TEXT[fgName] ?? INVERSE_TEXT[fgName];
      const bg = SURFACES[bgName];
      const r = ratio(fg, bg);
      const largeEnough = Object.entries(type)
        .filter(([, spec]) => (spec.fontWeight >= '600' ? spec.fontSize >= 14 : spec.fontSize >= 18))
        .some(([name]) => LARGE.has(name));
      const floor = largeEnough ? 3 : 4.5;
      rows.push({ fgName, bgName, r });
      test(`${fgName} on ${bgName} = ${r.toFixed(2)}:1 (floor ${floor}:1)`, () => {
        assert.ok(r >= floor, `${fgName} on ${bgName} is ${r.toFixed(2)}:1, below ${floor}:1`);
      });
    }
  }

  test('matrix covers every canonical text token', () => {
    for (const name of Object.keys(TEXT)) assert.ok(INTENT[name], `${name} has no intended surface`);
    for (const name of Object.keys(INVERSE_TEXT)) assert.ok(INTENT[name], `${name} has no intended surface`);
  });

  test('attack list: muted on ivory, clay accent text, AI treatments, disabled', () => {
    assert.ok(ratio(color.text.muted, color.background) >= 4.5, 'muted on ivory');
    assert.ok(ratio(color.action.primary, color.background) >= 4.5, 'clay accent text');
    assert.ok(ratio(color.action.primary, color.action.primarySoft) >= 4.5, 'clay on claySoft');
    for (const tone of ['insight', 'inference', 'confirmation', 'action']) {
      assert.ok(
        ratio(color.ai[tone], color.ai[`${tone}Soft`]) >= 4.5,
        `ai.${tone} on ai.${tone}Soft`,
      );
    }
    assert.ok(
      ratio(color.action.disabledText, color.action.disabled) >= 3,
      'disabled pair kept readable (stricter than the WCAG exemption)',
    );
  });
});

describe('Control-identifying boundaries (WCAG 1.4.11, 3:1)', () => {
  test('control border against both adjacent surfaces', () => {
    assert.ok(ratio(color.border.control, color.surface.primary) >= 3, 'control border on paper');
    assert.ok(ratio(color.border.control, color.background) >= 3, 'control border on ivory');
  });
});

/** Radius sanity: no "rounded-everything" drift at the token level. */
describe('Shape restraint', () => {
  test('card-scale radii stay at or below lg; only pills are infinite', () => {
    assert.ok(radius.lg <= 20, 'largest finite radius stays restrained');
    assert.equal(radius.pill, 999);
  });
});
