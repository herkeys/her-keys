import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, describe, test } from 'node:test';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Screen, Sheet, AppText } from '../../src/design/components/index.ts';
import { IPAD_READABLE_COLUMN, iPadReadableColumn, isIPad } from '../../src/design/readableColumn.ts';
import { sizing } from '../../src/design/tokens.ts';
import { render } from '../support/render.tsx';

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
const original = { OS: Platform.OS, isPad: Platform.isPad };
function asDevice(os, isPad) {
  Platform.OS = os;
  if (isPad === undefined) delete Platform.isPad;
  else Platform.isPad = isPad;
}
after(() => asDevice(original.OS, original.isPad));

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

describe('IOS-FIX-002 iPad readable column: iPad only, never iPhone or Android', () => {
  test('the predicate is true only for the iPad idiom on iOS', () => {
    assert.equal(isIPad({ OS: 'ios', isPad: true }), true);
    assert.equal(isIPad({ OS: 'ios', isPad: false }), false);
    assert.equal(isIPad({ OS: 'ios' }), false);
    assert.equal(isIPad({ OS: 'android', isPad: true }), false, 'Android never takes the iPad branch');
    assert.equal(isIPad({ OS: 'web' }), false);
  });

  test('the column is a centered cap at the existing content width, not a fixed width', () => {
    assert.deepEqual({ ...IPAD_READABLE_COLUMN }, { width: '100%', maxWidth: sizing.contentWidth, alignSelf: 'center' });
    assert.equal(sizing.contentWidth, 680, 'the shared design token is reused, not changed');
    assert.equal(iPadReadableColumn({ OS: 'ios', isPad: false }), null);
    assert.equal(iPadReadableColumn({ OS: 'android' }), null);
  });

  for (const [label, os, isPad] of [['iPhone', 'ios', false], ['Android', 'android', undefined]]) {
    test(`${label}: the non-scrolling Screen and the Sheet render exactly as before (no cap added)`, async () => {
      asDevice(os, isPad);
      const screen = await render(<Screen scroll={false}><AppText>Account</AppText></Screen>);
      const body = screen.root.findAll((n) => n.type === 'View' && 'paddingBottom' in flatten(n))[0];
      assert.ok(body, 'the Screen body view is present');
      assert.equal(flatten(body).maxWidth, undefined);
      assert.equal(Array.isArray(body.props.style) ? body.props.style.length : 0, 2, 'the style array is unchanged');
      const sheet = await render(<Sheet visible onClose={() => {}} accessibilityLabel="Panel"><AppText>Body</AppText></Sheet>);
      assert.ok(sheet.root.findAll((n) => n.type === 'View').every((n) => flatten(n).maxWidth === undefined));
    });
  }

  test('iPad: the non-scrolling Screen body (welcome, sign-in, account, deletion) is capped and centered', async () => {
    asDevice('ios', true);
    const screen = await render(<Screen scroll={false}><AppText>Account</AppText></Screen>);
    const body = screen.root.findAll((n) => n.type === 'View' && 'paddingBottom' in flatten(n))[0];
    assert.equal(flatten(body).maxWidth, 680);
    assert.equal(flatten(body).alignSelf, 'center');
    assert.equal(flatten(body).flex, 1, 'it still fills the height');
  });

  test('iPad: the bottom sheet is a centered card instead of a 1,366pt strip', async () => {
    asDevice('ios', true);
    const sheet = await render(<Sheet visible onClose={() => {}} accessibilityLabel="Panel"><AppText>Body</AppText></Sheet>);
    const capped = sheet.root.findAll((n) => n.type === 'View' && flatten(n).maxWidth === 680);
    assert.equal(capped.length, 1);
    assert.equal(flatten(capped[0]).alignSelf, 'center');
  });

  test('the Talk It Out routes (AI tab and modal) apply the iPad column to their conversation frame', () => {
    for (const path of ['app/(app)/ai.tsx', 'app/talk-it-out.tsx']) {
      const source = read(path);
      assert.match(source, /iPadReadableColumn\(\)/, path);
      assert.match(source, /style=\{column \? \[styles\.flex, column\] : styles\.flex\}/, path);
    }
  });

  test('every caller adds the column only when it is non-null (no null entries on iPhone/Android style arrays)', () => {
    for (const path of ['src/design/components/Screen.tsx', 'src/design/components/Sheet.tsx', 'app/(app)/ai.tsx', 'app/talk-it-out.tsx']) {
      const source = read(path);
      assert.match(source, /const column = iPadReadableColumn\(\);/, path);
      assert.doesNotMatch(source, /\[[^\]]*\bcolumn\b[^\]]*\]\s*:\s*null/, path);
    }
  });
});
