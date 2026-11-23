import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, describe, test } from 'node:test';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Screen, Sheet, AppText } from '../../src/design/components/index.ts';
import { READABLE_COLUMN, readableColumnFor } from '../../src/design/readableColumn.ts';
import { computeAdaptiveLayout } from '../../src/design/adaptive/sizeClass.ts';
import { sizing } from '../../src/design/tokens.ts';
import { render } from '../support/render.tsx';
import { safeAreaMetrics, windowMetrics } from '../support/rn-stub.tsx';

/**
 * iPad support (Addendum A: IOS-FIX-001 universal device family, IOS-FIX-002 iPad readable column).
 *
 * SOURCE and CONFIGURATION guards only. No macOS/Xcode host or iPad was available to the audit, so nothing here is a rendered or
 * device result: the iPad acceptance runs stay in the deferred device plan of docs/audits/HK_IOS_IPAD_V2_EAS_READINESS_AUDIT_20261113.md.
 */

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const appJson = JSON.parse(read('app.json'));
const flatten = (node) => StyleSheet.flatten(node.props.style) ?? {};
const original = { OS: Platform.OS, isPad: Platform.isPad, window: { ...windowMetrics }, insets: { ...safeAreaMetrics } };
/** A device is a platform, an idiom flag (which Build 5 must IGNORE) and the window the app was actually given. */
function asDevice(os, isPad, window = { width: 390, height: 844 }) {
  Platform.OS = os;
  if (isPad === undefined) delete Platform.isPad;
  else Platform.isPad = isPad;
  Object.assign(windowMetrics, { fontScale: 1 }, window);
}
after(() => {
  asDevice(original.OS, original.isPad, original.window);
  Object.assign(safeAreaMetrics, original.insets);
});

describe('IOS-FIX-001 the iOS build is universal (iPhone + iPad) and keeps the iPhone contract', () => {
  const { getDeviceFamilies } = require('@expo/config-plugins/build/ios/DeviceFamily');
  const { setRequiresFullScreen } = require('@expo/config-plugins/build/ios/RequiresFullScreen');
  const { setOrientation } = require('@expo/config-plugins/build/ios/Orientation');
  const config = appJson.expo;
  const plist = setOrientation(config, setRequiresFullScreen(config, {}));

  test('app.json declares iPad support without tablet-only or a full-screen opt-out', () => {
    assert.equal(config.ios.supportsTablet, true);
    assert.notEqual(config.ios.isTabletOnly, true, 'a universal release must not be tablet-only');
    assert.notEqual(config.ios.requireFullScreen, true, 'UIRequiresFullScreen is deprecated (TN3192) and ignored with the iOS 27 SDK');
  });

  test('the Xcode target is built for both device families (TARGETED_DEVICE_FAMILY "1,2")', () => {
    assert.deepEqual(getDeviceFamilies(config), [1, 2]);
  });

  test('iPad declares every orientation (multitasking/resizing requirement, ITMS-90474) and does not require full screen', () => {
    assert.deepEqual([...plist['UISupportedInterfaceOrientations~ipad']].sort(), [
      'UIInterfaceOrientationLandscapeLeft',
      'UIInterfaceOrientationLandscapeRight',
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationPortraitUpsideDown',
    ]);
    assert.equal(plist.UIRequiresFullScreen, false);
  });

  test('iPhone stays portrait-only, exactly as before', () => {
    assert.equal(config.orientation, 'portrait');
    assert.deepEqual(plist.UISupportedInterfaceOrientations, ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown']);
  });

  test('identity is untouched by the device-family change', () => {
    assert.equal(config.ios.bundleIdentifier, 'com.herkeys.app');
    assert.equal(config.ios.usesAppleSignIn, true);
    assert.equal(config.android.package, 'com.heykeys.app');
  });

  test('no runtime orientation lock exists that could fight the iPad declaration', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.dependencies['expo-screen-orientation'], undefined);
  });
});

/**
 * IOS-FIX-002, superseded by Build 5: the readable column follows the WINDOW, not `Platform.isPad`. A full-screen iPad and an
 * iPhone Duo inner display are capped; an iPad in a narrow Split View window is not (it is compact); Android never is.
 */
const IPAD_13_LANDSCAPE = { width: 1366, height: 1024 };
const IPAD_MINI_PORTRAIT = { width: 744, height: 1133 };
const IPAD_SPLIT_THIRD = { width: 320, height: 1024 };

describe('IOS-FIX-002 / Build 5 readable column: wider-than-compact iOS windows only, never compact windows or Android', () => {
  test('the decision ignores the idiom flag and reads the window', () => {
    const column = (os, window) => readableColumnFor(computeAdaptiveLayout(os, window));
    assert.equal(column('ios', IPAD_13_LANDSCAPE), READABLE_COLUMN);
    assert.equal(column('ios', IPAD_MINI_PORTRAIT), READABLE_COLUMN);
    assert.equal(column('ios', IPAD_SPLIT_THIRD), null, 'a narrow iPad window is compact: full width, as before');
    assert.equal(column('ios', { width: 390, height: 844 }), null, 'iPhone: unchanged');
    assert.equal(column('android', IPAD_13_LANDSCAPE), null, 'Android never takes the adaptive branch, at any size');
  });

  test('the column is a centered cap at the existing content width, not a fixed width', () => {
    assert.deepEqual({ ...READABLE_COLUMN }, { width: '100%', maxWidth: sizing.contentWidth, alignSelf: 'center' });
    assert.equal(sizing.contentWidth, 680, 'the shared design token is reused, not changed');
    assert.equal(readableColumnFor({ bodyColumnMaxWidth: null }), null);
  });

  for (const [label, os, isPad, window] of [
    ['iPhone', 'ios', false, { width: 390, height: 844 }],
    ['Android phone', 'android', undefined, { width: 412, height: 915 }],
    ['Android tablet', 'android', undefined, { width: 1280, height: 800 }],
    ['iPad in a narrow Split View window', 'ios', true, IPAD_SPLIT_THIRD],
  ]) {
    test(`${label}: the non-scrolling Screen and the Sheet render exactly as before (no cap added)`, async () => {
      asDevice(os, isPad, window);
      const screen = await render(<Screen scroll={false}><AppText>Account</AppText></Screen>);
      const body = screen.root.findAll((n) => n.type === 'View' && 'paddingBottom' in flatten(n))[0];
      assert.ok(body, 'the Screen body view is present');
      assert.equal(flatten(body).maxWidth, undefined);
      assert.equal(Array.isArray(body.props.style) ? body.props.style.length : 0, 2, 'the style array is unchanged');
      const sheet = await render(<Sheet visible onClose={() => {}} accessibilityLabel="Panel"><AppText>Body</AppText></Sheet>);
      assert.ok(sheet.root.findAll((n) => n.type === 'View').every((n) => flatten(n).maxWidth === undefined));
    });
  }

  for (const [label, window] of [['full-screen 13-inch iPad', IPAD_13_LANDSCAPE], ['iPad mini portrait', IPAD_MINI_PORTRAIT]]) {
    test(`${label}: the non-scrolling Screen body (welcome, sign-in, account, deletion) is capped and centered`, async () => {
      asDevice('ios', true, window);
      const screen = await render(<Screen scroll={false}><AppText>Account</AppText></Screen>);
      const body = screen.root.findAll((n) => n.type === 'View' && 'paddingBottom' in flatten(n))[0];
      assert.equal(flatten(body).maxWidth, 680);
      assert.equal(flatten(body).alignSelf, 'center');
      assert.equal(flatten(body).flex, 1, 'it still fills the height');
    });
  }

  test('the idiom flag alone changes nothing: an iOS window that is wide gets the column even when isPad is false (iPhone Duo inner)', async () => {
    asDevice('ios', false, { width: 669, height: 951 });
    const screen = await render(<Screen scroll={false}><AppText>Account</AppText></Screen>);
    const body = screen.root.findAll((n) => n.type === 'View' && 'paddingBottom' in flatten(n))[0];
    assert.equal(flatten(body).maxWidth, 680);
  });

  test('medium iPad window: the bottom sheet is a centered readable card instead of a full-width strip', async () => {
    asDevice('ios', true, IPAD_MINI_PORTRAIT);
    const sheet = await render(<Sheet visible onClose={() => {}} accessibilityLabel="Panel"><AppText>Body</AppText></Sheet>);
    const capped = sheet.root.findAll((n) => n.type === 'View' && flatten(n).maxWidth === 680);
    assert.equal(capped.length, 1);
    assert.equal(flatten(capped[0]).alignSelf, 'center');
  });

  test('expanded iPad window: the sheet is a centered dialog card (every corner rounded, no drag handle), not a 1,366pt strip', async () => {
    asDevice('ios', true, IPAD_13_LANDSCAPE);
    const sheet = await render(<Sheet visible onClose={() => {}} accessibilityLabel="Panel"><AppText>Body</AppText></Sheet>);
    const card = sheet.root.findAll((n) => n.type === 'View' && flatten(n).maxWidth === 560);
    assert.equal(card.length, 1, 'one dialog card');
    assert.equal(flatten(card[0]).alignSelf, 'center');
    assert.ok(flatten(card[0]).borderRadius > 0, 'every corner rounded');
    const backdrop = sheet.root.findAll((n) => n.type === 'View' && flatten(n).justifyContent === 'center');
    assert.equal(backdrop.length, 1, 'the card is centered vertically');
    assert.equal(sheet.root.findAll((n) => n.type === 'View' && flatten(n).width === 36).length, 0, 'no bottom-sheet handle');
    // The scrim still dismisses, so the dialog never traps her.
    assert.equal(sheet.root.findAll((n) => n.props.accessibilityLabel === 'Dismiss').length > 0, true);
  });

  test('the Talk It Out routes (AI tab and modal) apply the readable column to their conversation frame', () => {
    for (const path of ['app/(app)/ai.tsx', 'app/talk-it-out.tsx']) {
      const source = read(path);
      assert.match(source, /readableColumnFor\(useAdaptiveLayout\(\)\)/, path);
      assert.match(source, /style=\{column \? \[styles\.flex, column\] : styles\.flex\}/, path);
    }
  });

  test('every caller adds the column only when it is non-null (no null entries on compact or Android style arrays)', () => {
    for (const path of ['src/design/components/Screen.tsx', 'src/design/components/Sheet.tsx', 'app/(app)/ai.tsx', 'app/talk-it-out.tsx']) {
      const source = read(path);
      assert.match(source, /const column = readableColumnFor\((layout|useAdaptiveLayout\(\))\);/, path);
      assert.doesNotMatch(source, /\[[^\]]*\bcolumn\b[^\]]*\]\s*:\s*null/, path);
    }
  });

  test('no layout decision reads the device idiom any more', () => {
    for (const path of ['src/design/readableColumn.ts', 'src/design/components/Screen.tsx', 'src/design/components/Sheet.tsx', 'src/design/adaptive/sizeClass.ts', 'src/design/adaptive/useAdaptiveLayout.ts']) {
      assert.doesNotMatch(read(path).replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), /isPad/, path);
    }
  });
});
