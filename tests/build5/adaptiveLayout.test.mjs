import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, describe, test } from 'node:test';
import React, { useEffect, useState } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform, StyleSheet, Text, TextInput } from 'react-native';
import {
  ADAPTIVE_PLATFORMS,
  BREAKPOINTS,
  READABLE_WIDTH,
  SIDEBAR_WIDTH,
  WORKSPACE_MAX_WIDTH,
  computeAdaptiveLayout,
  sizeClassFor,
  tabChromeClearance,
  textScaleDivisor,
  usableWidth,
} from '../../src/design/adaptive/sizeClass.ts';
import { AdaptiveSplit } from '../../src/design/adaptive/AdaptiveSplit.tsx';
import { Screen, AppText } from '../../src/design/components/index.ts';
import { spacing } from '../../src/design/tokens.ts';
import { render } from '../support/render.tsx';
import { safeAreaMetrics, windowMetrics } from '../support/rn-stub.tsx';

/**
 * BUILD 5 — the adaptive layout foundation (PR 1). Navigation and screen adoption: adaptiveNavigation.test.mjs (PR 2).
 *
 * WHAT THIS PROVES: the size-class geometry for real window sizes, asymmetric insets, Dynamic Type, the Android lock, that the
 * primitives never remount their content when the window changes, the tab options in both presentations, and the rendered
 * Screen/Sheet contracts — all under the project's react-native stub (no native layout engine).
 * WHAT IT DOES NOT PROVE: pixels, native safe-area values, VoiceOver, keyboard frames or anything on a simulator or device. Those are
 * listed, NOT RUN, in docs/build5/BUILD5_RESPONSIVE_TEST_MATRIX.md.
 *
 * Window sizes are in points. iPhone and iPad sizes are Apple's published logical resolutions. iPhone Duo sizes are DERIVED from
 * Apple's App Store screenshot pixel sizes (outer 1398 x 2034, inner 2007 x 2853) at an assumed @3x scale, and the Split View left
 * window (469pt) is from Expo's iPhone Duo guidance; none of them is device-verified.
 */

const WINDOWS = {
  iPhoneSE: { width: 375, height: 667 },
  iPhone17: { width: 402, height: 874 },
  iPhoneProMax: { width: 440, height: 956 },
  duoOuter: { width: 466, height: 678 },
  duoInnerPortrait: { width: 669, height: 951 },
  duoInnerLandscape: { width: 951, height: 669 },
  duoSplitLeft: { width: 469, height: 951 },
  iPadMiniPortrait: { width: 744, height: 1133 },
  iPadMiniLandscape: { width: 1133, height: 744 },
  iPad11Portrait: { width: 834, height: 1194 },
  iPad11Landscape: { width: 1194, height: 834 },
  iPad13Portrait: { width: 1032, height: 1376 },
  iPad13Landscape: { width: 1376, height: 1032 },
  iPadSplitThird: { width: 320, height: 1032 },
  iPadSplitHalf: { width: 678, height: 1032 },
  stageManagerSmall: { width: 560, height: 700 },
  androidPhone: { width: 412, height: 915 },
  androidTablet: { width: 1280, height: 800 },
  androidFoldableOpen: { width: 841, height: 701 },
};

const ios = (window, extra = {}) => computeAdaptiveLayout('ios', { ...window, ...extra });
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const flatten = (node) => StyleSheet.flatten(node.props.style) ?? {};

const original = { OS: Platform.OS, window: { ...windowMetrics }, insets: { ...safeAreaMetrics } };
function asWindow(os, window, insets = {}, fontScale = 1) {
  Platform.OS = os;
  Object.assign(windowMetrics, { fontScale }, window);
  Object.assign(safeAreaMetrics, { top: 0, bottom: 0, left: 0, right: 0 }, insets);
}
afterEach(() => asWindow(original.OS, original.window, original.insets));
after(() => asWindow(original.OS, original.window, original.insets));

describe('BUILD 5 size classes come from the usable window width, never from the device model', () => {
  test('breakpoints are on usable content width: compact < 600 <= medium < 840 <= expanded', () => {
    assert.deepEqual({ ...BREAKPOINTS }, { medium: 600, expanded: 840 });
    assert.equal(sizeClassFor({ width: 599, height: 900 }), 'compact');
    assert.equal(sizeClassFor({ width: 600, height: 900 }), 'medium');
    assert.equal(sizeClassFor({ width: 839, height: 900 }), 'medium');
    assert.equal(sizeClassFor({ width: 840, height: 900 }), 'expanded');
  });

  const expected = {
    iPhoneSE: 'compact', iPhone17: 'compact', iPhoneProMax: 'compact',
    duoOuter: 'compact', duoSplitLeft: 'compact', duoInnerPortrait: 'medium', duoInnerLandscape: 'expanded',
    iPadMiniPortrait: 'medium', iPadMiniLandscape: 'expanded', iPad11Portrait: 'medium', iPad11Landscape: 'expanded',
    iPad13Portrait: 'expanded', iPad13Landscape: 'expanded', iPadSplitThird: 'compact', iPadSplitHalf: 'medium', stageManagerSmall: 'compact',
  };
  for (const [name, sizeClass] of Object.entries(expected)) {
    test(`${name} (${WINDOWS[name].width} x ${WINDOWS[name].height}) is ${sizeClass} on iOS`, () => {
      assert.equal(ios(WINDOWS[name]).sizeClass, sizeClass);
    });
  }

  test('an iPhone Duo fold or unfold is a different window, not a different device: outer compact, inner medium/expanded', () => {
    const folded = ios(WINDOWS.duoOuter);
    const unfolded = ios(WINDOWS.duoInnerPortrait);
    assert.equal(folded.navigation, 'tabBar');
    assert.equal(unfolded.navigation, 'tabBar', 'a portrait inner display is not treated as an iPad: no sidebar');
    assert.equal(ios(WINDOWS.duoInnerLandscape).navigation, 'sidebar');
  });
});

describe('BUILD 5 asymmetric safe areas are never assumed symmetric', () => {
  test('usable width subtracts the left and right insets separately', () => {
    assert.equal(usableWidth({ width: 951, height: 669, insets: { left: 84, right: 0 } }), 867);
    assert.equal(usableWidth({ width: 951, height: 669, insets: { left: 0, right: 84 } }), 867);
    assert.equal(usableWidth({ width: 951, height: 669, insets: { left: 59, right: 21 } }), 871);
  });

  test('an 84pt vertical rail can move a window across a breakpoint (and only the window decides)', () => {
    assert.equal(ios({ width: 900, height: 600 }).sizeClass, 'expanded');
    assert.equal(ios({ width: 900, height: 600, insets: { left: 84 } }).sizeClass, 'medium');
    assert.equal(ios({ width: 900, height: 600, insets: { right: 84 } }).sizeClass, 'medium', 'rail on the trailing edge: same answer');
  });

  test('the sidebar absorbs the leading inset; the trailing inset still comes off the content', () => {
    const layout = ios(WINDOWS.iPad13Landscape, { insets: { left: 24, right: 40 } });
    assert.equal(layout.sidebarWidth, SIDEBAR_WIDTH + 24);
    assert.equal(layout.contentWidth, Math.min(WORKSPACE_MAX_WIDTH, 1376 - (SIDEBAR_WIDTH + 24) - 40 - 2 * 20));
  });

  test('Screen pads horizontally with the native SafeAreaView on BOTH edges independently, and adds only the real bottom inset', async () => {
    asWindow('ios', WINDOWS.duoInnerLandscape, { left: 84, right: 0, bottom: 21 });
    const r = await render(<Screen><AppText>Body</AppText></Screen>);
    const safe = r.root.findAll((n) => n.type === 'SafeAreaView')[0];
    assert.deepEqual(safe.props.edges, ['top', 'left', 'right']);
    const scroll = r.root.findAll((n) => n.type === 'ScrollView')[0];
    assert.equal(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom, spacing.xxxl + 0 + 21, 'sidebar layout: no tab-bar chrome');
  });
});

describe('BUILD 5 Dynamic Type makes the layout more conservative, never denser', () => {
  test('larger text divides the width layout decisions see; smaller text never widens it; the divisor stops at 2x', () => {
    assert.equal(textScaleDivisor(0.82), 1);
    assert.equal(textScaleDivisor(1.35), 1.35);
    assert.equal(textScaleDivisor(3.12), 2);
    assert.equal(textScaleDivisor(undefined), 1);
  });

  test('a full-screen 13-inch iPad keeps two panes at xxxL (1.35) and drops to one column at accessibility sizes', () => {
    assert.equal(ios(WINDOWS.iPad13Landscape, { fontScale: 1 }).twoPane, true);
    assert.equal(ios(WINDOWS.iPad13Landscape, { fontScale: 1.35 }).twoPane, true);
    assert.equal(ios(WINDOWS.iPad13Landscape, { fontScale: 1.6 }).twoPane, false);
    assert.equal(ios(WINDOWS.iPad13Landscape, { fontScale: 2 }).sizeClass, 'medium', 'and at 2x the sidebar becomes the bottom bar again');
  });

});

describe('BUILD 5 two panes appear only when both panes fit', () => {
  test('full-screen iPads in landscape split; iPad 13 portrait and the Duo inner landscape show the sidebar but keep one column', () => {
    for (const name of ['iPadMiniLandscape', 'iPad11Landscape', 'iPad13Landscape']) assert.equal(ios(WINDOWS[name]).twoPane, true, name);
    for (const name of ['iPad13Portrait', 'duoInnerLandscape']) {
      const layout = ios(WINDOWS[name]);
      assert.equal(layout.navigation, 'sidebar', name);
      assert.equal(layout.twoPane, false, `${name}: the primary pane would be under 480pt`);
      assert.equal(layout.contentMaxWidth, READABLE_WIDTH, name);
    }
  });

  test('the secondary pane is restrained (320-400pt) and the workspace never exceeds its cap', () => {
    for (const name of ['iPadMiniLandscape', 'iPad11Landscape', 'iPad13Landscape']) {
      const layout = ios(WINDOWS[name]);
      assert.ok(layout.secondaryPaneWidth >= 320 && layout.secondaryPaneWidth <= 400, `${name}: ${layout.secondaryPaneWidth}`);
      assert.ok(layout.contentWidth <= WORKSPACE_MAX_WIDTH);
      assert.equal(layout.contentMaxWidth, WORKSPACE_MAX_WIDTH);
    }
    assert.equal(ios(WINDOWS.iPhone17).secondaryPaneWidth, 0);
  });

  test('medium windows never split and never show the sidebar (no unnecessary multi-column complexity)', () => {
    for (const name of ['duoInnerPortrait', 'iPadMiniPortrait', 'iPad11Portrait', 'iPadSplitHalf']) {
      const layout = ios(WINDOWS[name]);
      assert.equal(layout.sizeClass, 'medium', name);
      assert.equal(layout.twoPane, false, name);
      assert.equal(layout.navigation, 'tabBar', name);
      assert.equal(layout.bodyColumnMaxWidth, READABLE_WIDTH, name);
      assert.equal(layout.sheetPresentation, 'bottom', name);
    }
  });
});

describe('BUILD 5 Android regression lock: Android presents exactly what it did before, at every size', () => {
  test('only iOS is adaptive in Build 5', () => {
    assert.deepEqual([...ADAPTIVE_PLATFORMS], ['ios']);
  });

  for (const name of ['androidPhone', 'androidTablet', 'androidFoldableOpen', 'iPad13Landscape']) {
    test(`android ${name}: compact, bottom tab bar, one pane, no column, bottom sheet`, () => {
      const layout = computeAdaptiveLayout('android', WINDOWS[name]);
      assert.equal(layout.sizeClass, 'compact');
      assert.equal(layout.navigation, 'tabBar');
      assert.equal(layout.twoPane, false);
      assert.equal(layout.bodyColumnMaxWidth, null);
      assert.equal(layout.sheetPresentation, 'bottom');
      assert.equal(layout.contentMaxWidth, READABLE_WIDTH);
    });
  }

  test('the geometry is still reported honestly for diagnostics (windowClass), but never presented', () => {
    assert.equal(computeAdaptiveLayout('android', WINDOWS.androidTablet).windowClass, 'expanded');
  });

  test('Screen bottom clearance with a tab bar is still spacing.xxxl + 68 + inset', async () => {
    asWindow('android', WINDOWS.androidTablet, { bottom: 24 });
    const r = await render(<Screen><AppText>Body</AppText></Screen>);
    const scroll = r.root.findAll((n) => n.type === 'ScrollView')[0];
    const style = StyleSheet.flatten(scroll.props.contentContainerStyle);
    assert.equal(style.paddingBottom, spacing.xxxl + 68 + 24);
    assert.equal(style.maxWidth, READABLE_WIDTH);
    assert.equal(tabChromeClearance('tabBar'), 68);
    assert.equal(tabChromeClearance('sidebar'), 0);
  });
});

/** A stateful child that records how many times it mounted and keeps a draft, like a composer or a quick-add field. */
const mounts = { count: 0 };
function Draft({ id }) {
  const [text, setText] = useState('');
  useEffect(() => {
    mounts.count += 1;
  }, []);
  return (
    <>
      <TextInput testID={`draft-${id}`} value={text} onChangeText={setText} />
      <Text>{`${id}:${text}`}</Text>
    </>
  );
}

async function rerender(renderer, element) {
  await TestRenderer.act(async () => renderer.update(element));
}

describe('BUILD 5 AdaptiveSplit: a window change never remounts content or loses a draft', () => {
  const tree = (order) => (
    <AdaptiveSplit stackedOrder={order} lead={<Draft id="lead" />} primary={<Draft id="primary" />} secondary={<Draft id="secondary" />} />
  );
  const type = async (r, id, value) => {
    const input = r.root.findAll((n) => n.props.testID === `draft-${id}`)[0];
    await TestRenderer.act(async () => input.props.onChangeText(value));
  };
  const texts = (r) => r.root.findAll((n) => n.type === 'Text').map((n) => n.props.children);

  for (const order of ['primaryFirst', 'secondaryFirst']) {
    test(`${order}: compact -> expanded -> compact (fold, unfold, rotate) keeps every pane mounted with its draft`, async () => {
      asWindow('ios', WINDOWS.duoOuter);
      mounts.count = 0;
      const r = await render(tree(order));
      assert.equal(mounts.count, 3);
      await type(r, 'lead', 'milk');
      await type(r, 'primary', 'call school');
      await type(r, 'secondary', 'dentist');

      for (const window of [WINDOWS.iPad13Landscape, WINDOWS.duoInnerPortrait, WINDOWS.duoInnerLandscape, WINDOWS.iPadSplitThird, WINDOWS.duoOuter]) {
        asWindow('ios', window);
        await rerender(r, tree(order));
        assert.equal(mounts.count, 3, `no remount at ${window.width}x${window.height}`);
        assert.deepEqual(texts(r).sort(), ['lead:milk', 'primary:call school', 'secondary:dentist']);
      }
    });
  }

  test('stacked order is the order the screen already had; two panes put the schedule (primary) first', async () => {
    asWindow('ios', WINDOWS.iPhone17);
    const stacked = await render(tree('secondaryFirst'));
    assert.deepEqual(texts(stacked), ['lead:', 'secondary:', 'primary:']);
    asWindow('ios', WINDOWS.iPad13Landscape);
    const split = await render(tree('secondaryFirst'));
    assert.deepEqual(texts(split), ['lead:', 'primary:', 'secondary:'], 'reading order follows the visual order: main pane, then supporting');
    const row = split.root.findAll((n) => n.props.testID === 'adaptive-split-panes-row')[0];
    assert.equal(flatten(row).flexDirection, 'row');
    const secondary = split.root.findAll((n) => n.props.testID === 'adaptive-split-secondary' && n.type === 'View')[0];
    assert.equal(flatten(secondary).width, computeAdaptiveLayout('ios', WINDOWS.iPad13Landscape).secondaryPaneWidth);
  });

  test('compact windows add no styles at all to the panes (the single column renders as before)', async () => {
    asWindow('ios', WINDOWS.iPhone17);
    const r = await render(tree('primaryFirst'));
    for (const id of ['adaptive-split-primary', 'adaptive-split-secondary']) {
      const pane = r.root.findAll((n) => n.props.testID === id && n.type === 'View')[0];
      assert.equal(pane.props.style, null, id);
    }
    assert.equal(r.root.findAll((n) => n.props.testID === 'adaptive-split-panes-stacked').length > 0, true);
  });

  test('no secondary content means one pane even on the widest window (no empty column)', async () => {
    asWindow('ios', WINDOWS.iPad13Landscape);
    const r = await render(<AdaptiveSplit primary={<Text>only</Text>} secondary={false} />);
    assert.equal(r.root.findAll((n) => n.props.testID === 'adaptive-split-panes-row').length, 0);
    assert.equal(r.root.findAll((n) => n.props.testID === 'adaptive-split-secondary').length, 0);
  });
});

describe('BUILD 5 Screen workspace width', () => {
  test('a workspace screen grows to the workspace cap only when two panes show; every other screen keeps 680pt', async () => {
    asWindow('ios', WINDOWS.iPad13Landscape);
    const wide = await render(<Screen workspace><AppText>Body</AppText></Screen>);
    const plain = await render(<Screen><AppText>Body</AppText></Screen>);
    const max = (r) => StyleSheet.flatten(r.root.findAll((n) => n.type === 'ScrollView')[0].props.contentContainerStyle).maxWidth;
    assert.equal(max(wide), WORKSPACE_MAX_WIDTH);
    assert.equal(max(plain), READABLE_WIDTH);
    asWindow('ios', WINDOWS.iPad13Portrait);
    assert.equal(max(await render(<Screen workspace><AppText>Body</AppText></Screen>)), READABLE_WIDTH, 'sidebar but one pane: readable');
  });
});

describe('BUILD 5 surfaces outside Screen take the readable column themselves', () => {
  test('the consent stages (legal, permissions, error, loading) add the column to their inset only when it is non-null', () => {
    const flow = read('src/features/consent/ConsentFlow.tsx');
    assert.match(flow, /const column = readableColumnFor\(useAdaptiveLayout\(\)\);/);
    assert.match(flow, /const inset = column\s*\? \{ \.\.\.column, paddingTop: insets\.top \+ spacing\.xxl, paddingBottom: insets\.bottom \+ spacing\.xxl \}\s*: \{ paddingTop: insets\.top \+ spacing\.xxl, paddingBottom: insets\.bottom \+ spacing\.xxl \};/);
  });

  test('the account and deletion panels sit inside the non-scrolling Screen, which is capped on wide windows', () => {
    const signIn = read('app/sign-in.tsx');
    assert.match(signIn, /<Screen scroll=\{false\}><DeleteAccountPanel/);
  });
});
