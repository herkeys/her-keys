/**
 * HK-FE-UI-02 — decorative vector assets, brand badges and the primary-button recipe.
 *
 * Properties held here: decoration is hidden from assistive technology, never intercepts touches, is faint, disappears on
 * compact windows and at large text (it yields to function), and Luxury Black appears only in the small Premium badge and
 * never in a button. The Button recipe (spec §7) is asserted from the rendered props, not from the source text.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { afterEach, describe, test } from 'node:test';
import { StyleSheet } from 'react-native';
import {
  BotanicalSprig,
  Button,
  CurvedWave,
  IconBadge,
  KeyBadge,
  PremiumBadge,
  leafGeometry,
  useDecorationVisible,
} from '../../../src/design/components/index.ts';
import { botanicalOpacity, botanicalPalette, botanicalStroke, color, decorationBudget, withAlpha } from '../../../src/design/tokens.ts';
import { windowMetrics } from '../../support/rn-stub.tsx';
import { render } from '../../support/render.tsx';

const flatten = (node) => StyleSheet.flatten(node.props.style) ?? {};
const byTestId = (r, id) => r.root.findAll((n) => n.props.testID === id && typeof n.type === 'string');

afterEach(() => {
  windowMetrics.width = 390;
  windowMetrics.fontScale = 1;
});

describe('decoration budget (spec §9)', () => {
  test('visible on a normal phone at default text size', async () => {
    const r = await render(<BotanicalSprig />);
    assert.equal(byTestId(r, 'botanical-sprig').length, 1);
  });

  test('suppressed below 360 dp', async () => {
    windowMetrics.width = decorationBudget.minWidth - 1;
    const sprig = await render(<BotanicalSprig />);
    const wave = await render(<CurvedWave />);
    assert.equal(byTestId(sprig, 'botanical-sprig').length, 0);
    assert.equal(byTestId(wave, 'curved-wave').length, 0);
  });

  test('exactly 360 dp still shows decoration (the boundary is "below")', async () => {
    windowMetrics.width = 360;
    const r = await render(<BotanicalSprig />);
    assert.equal(byTestId(r, 'botanical-sprig').length, 1);
  });

  test('disappears at large text instead of pushing content off screen', async () => {
    windowMetrics.fontScale = decorationBudget.maxFontScale + 0.1;
    const r = await render(<BotanicalSprig />);
    assert.equal(byTestId(r, 'botanical-sprig').length, 0);
  });

  test('useDecorationVisible reports the same rule', async () => {
    let seen;
    function Probe() {
      seen = useDecorationVisible();
      return null;
    }
    windowMetrics.width = 320;
    await render(<Probe />);
    assert.equal(seen, false);
    windowMetrics.width = 411;
    await render(<Probe />);
    assert.equal(seen, true);
  });
});

describe('botanical assets are decorative', () => {
  test('hidden from screen readers and touch-transparent', async () => {
    const r = await render(<BotanicalSprig corner="bottomLeft" />);
    const [sprig] = byTestId(r, 'botanical-sprig');
    assert.equal(sprig.props.accessibilityElementsHidden, true);
    assert.equal(sprig.props.importantForAccessibility, 'no-hide-descendants');
    assert.equal(sprig.props.pointerEvents, 'none');
  });

  test('every corner is a real placement; left corners mirror', async () => {
    for (const corner of ['topRight', 'topLeft', 'bottomRight', 'bottomLeft']) {
      const r = await render(<BotanicalSprig corner={corner} />);
      assert.equal(byTestId(r, 'botanical-sprig').length, 1, corner);
    }
    const left = await render(<BotanicalSprig corner="topLeft" />);
    assert.deepEqual(flatten(byTestId(left, 'botanical-sprig')[0]).transform, [{ scaleX: -1 }]);
  });

  test('the wave is hidden from assistive technology and fixed to its edge', async () => {
    const r = await render(<CurvedWave edge="bottom" />);
    const [wave] = byTestId(r, 'curved-wave');
    assert.equal(wave.props.accessibilityElementsHidden, true);
    assert.equal(wave.props.pointerEvents, 'none');
    assert.equal(flatten(wave).bottom, 0);
  });

  test('leaf geometry stays inside the sprig footprint, with the tip farther from the stem than the node', () => {
    const size = 132;
    for (const t of [-0.4, -0.26, -0.1, 0.06, 0.2, 0.34]) {
      for (const side of [-1, 1]) {
        const g = leafGeometry(size, { t, side, length: 30 });
        for (const [x, y] of [[g.node.x, g.node.y], [g.tip.x, g.tip.y]]) {
          assert.ok(x > -20 && x < size + 20 && y > -20 && y < size + 20, `point (${x.toFixed(1)}, ${y.toFixed(1)}) in range`);
        }
        const reach = Math.hypot(g.tip.x - g.node.x, g.tip.y - g.node.y);
        assert.ok(reach > 15 && reach < 40, `leaf reach ${reach.toFixed(1)}`);
      }
    }
  });

  // OWNER AMENDMENT 2026-10-16 — botanical SAGE LINEWORK: outlines only, no solid green fills.
  test('leaves are outlines: sage border at 50%, transparent fill, 1.25 pt', async () => {
    const r = await render(<BotanicalSprig />);
    const leaves = byTestId(r, 'botanical-leaf');
    assert.equal(leaves.length, 6);
    for (const leaf of leaves) {
      const st = flatten(leaf);
      assert.equal(st.backgroundColor, 'transparent', 'no solid leaf fill');
      assert.equal(st.borderColor, withAlpha(botanicalPalette.sageOutline, botanicalOpacity.outline));
      assert.equal(st.borderWidth, botanicalStroke.outline);
      assert.ok(st.borderWidth >= 1 && st.borderWidth <= 1.5);
    }
  });

  test('accents sit at leaf tips and stem nodes: Sage Tip at 60%, 1.5–2 pt class dots', async () => {
    const r = await render(<BotanicalSprig />);
    const dots = byTestId(r, 'botanical-accent');
    assert.equal(dots.length, 6 * 2 + 1, 'a node and a tip per leaf, plus the stem tip');
    for (const dot of dots) {
      const st = flatten(dot);
      assert.equal(st.backgroundColor, withAlpha(botanicalPalette.sageTip, botanicalOpacity.tip));
      assert.ok(st.width <= 4, 'small accent, never a blob');
    }
  });

  test('the only green in the sprig is sage linework: every fill/border colour is a sage token at its stated opacity (or transparent)', async () => {
    const r = await render(<BotanicalSprig />);
    const allowed = new Set([
      withAlpha(botanicalPalette.sageOutline, botanicalOpacity.outline),
      withAlpha(botanicalPalette.sageTip, botanicalOpacity.tip),
      'transparent',
    ]);
    const used = r.root.findAll((n) => typeof n.type === 'string').flatMap((n) => {
      const st = flatten(n);
      return [st.backgroundColor, st.borderColor].filter(Boolean);
    });
    assert.ok(used.length > 10);
    for (const c of used) assert.ok(allowed.has(c), `unexpected colour ${c}`);
  });

  test('Reduce Motion drops the outline to 30% (decorative, never load-bearing)', async () => {
    const { AccessibilityInfo } = await import('react-native');
    const original = AccessibilityInfo.isReduceMotionEnabled;
    AccessibilityInfo.isReduceMotionEnabled = () => Promise.resolve(true);
    try {
      const r = await render(<BotanicalSprig />);
      await new Promise((resolve) => setImmediate(resolve));
      const [leaf] = byTestId(r, 'botanical-leaf');
      assert.equal(flatten(leaf).borderColor, withAlpha(botanicalPalette.sageOutline, botanicalOpacity.reduced));
    } finally {
      AccessibilityInfo.isReduceMotionEnabled = original;
    }
  });
});

describe('badges', () => {
  test('are decorative unless given a label', async () => {
    const quiet = await render(<IconBadge icon="calendar-outline" />);
    const [badge] = byTestId(quiet, 'icon-badge');
    assert.equal(badge.props.accessibilityElementsHidden, true);
    const labelled = await render(<IconBadge icon="calendar-outline" accessibilityLabel="Calendar" />);
    const [named] = byTestId(labelled, 'icon-badge');
    assert.equal(named.props.accessibilityLabel, 'Calendar');
    assert.equal(named.props.accessibilityRole, 'image');
  });

  test('icon wells keep their glyph legible: Deep Plum Gray on Soft Lilac, white on Berry', async () => {
    const lilac = await render(<IconBadge icon="mail-outline" />);
    assert.equal(lilac.root.findByType('Ionicons').props.color, color.text.primary);
    assert.equal(flatten(byTestId(lilac, 'icon-badge')[0]).backgroundColor, color.surface.tint);
    const berry = await render(<IconBadge icon="mail-outline" tone="berry" />);
    assert.equal(berry.root.findByType('Ionicons').props.color, color.text.inverse);
  });

  test('Luxury Black appears only in the small Premium badge', async () => {
    const premium = await render(<PremiumBadge />);
    const [disc] = byTestId(premium, 'premium-badge');
    assert.equal(flatten(disc).backgroundColor, color.luxury.black);
    assert.ok(flatten(disc).width <= 56, 'a small detail, never a block');
    const key = await render(<KeyBadge />);
    const iconBadge = await render(<IconBadge icon="key-outline" />);
    for (const r of [key, iconBadge]) {
      const fills = r.root.findAll((n) => typeof n.type === 'string').map((n) => flatten(n).backgroundColor);
      assert.ok(!fills.includes(color.luxury.black));
    }
  });
});

describe('primary button recipe (spec §7)', () => {
  test('Berry body, opaque Berry-family edge, pill radius, controlled lift, white text', async () => {
    const r = await render(<Button label="Get Started" onPress={() => {}} />);
    const box = flatten(r.root.findByType('Pressable'));
    assert.equal(box.backgroundColor, color.action.primary);
    assert.equal(box.borderColor, color.action.primaryPressed);
    assert.equal(box.borderRadius, 999);
    assert.ok(box.shadowOpacity > 0 && box.shadowOpacity < 0.3, 'controlled elevation');
    assert.equal(flatten(r.root.findByType('Text')).color, color.text.inverse);
  });

  test('top-edge highlight: a 1px opaque inset line, not a gradient or translucent layer', async () => {
    const r = await render(<Button label="Go" onPress={() => {}} />);
    const line = r.root.findAll((n) => typeof n.type === 'string' && flatten(n).height === 1)[0];
    const s = flatten(line);
    assert.equal(s.backgroundColor, color.action.primaryHighlight);
    assert.match(s.backgroundColor, /^#[0-9A-F]{6}$/i, 'opaque');
    assert.equal(s.position, 'absolute');
    assert.ok(s.left > 0 && s.right > 0, 'inset from the rounded ends');
  });

  test('the highlight is absent when disabled; disabled is a readable pair with no lift', async () => {
    const r = await render(<Button label="Go" onPress={() => {}} disabled />);
    assert.equal(r.root.findAll((n) => typeof n.type === 'string' && flatten(n).height === 1).length, 0);
    const box = flatten(r.root.findByType('Pressable'));
    assert.equal(box.backgroundColor, color.action.disabled);
    assert.equal(box.shadowOpacity, 0);
    assert.equal(flatten(r.root.findByType('Text')).color, color.action.disabledText);
  });

  test('Luxury Black is never part of a button', async () => {
    for (const variant of ['primary', 'secondary', 'ghost']) {
      const r = await render(<Button label="x" variant={variant} onPress={() => {}} />);
      for (const n of r.root.findAll((x) => typeof x.type === 'string')) {
        const s = flatten(n);
        assert.notEqual(s.backgroundColor, color.luxury.black);
        assert.notEqual(s.borderColor, color.luxury.black);
      }
    }
  });

  test('touch target floor is preserved', async () => {
    const r = await render(<Button label="x" onPress={() => {}} />);
    assert.ok(flatten(r.root.findByType('Pressable')).minHeight >= 44);
  });
});
