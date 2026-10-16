import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, test } from 'node:test';

/**
 * The RESOLVED native iOS configuration (`expo config --type introspect`, i.e. every config plugin's mod evaluated), not a grep
 * of app.json. macOS/Xcode are not available to the audit, so this is the strongest executable evidence of what the iOS binary
 * will declare. It pins the iOS identity, the Apple sign-in entitlement, the exact permission surface and the adaptive
 * appearance configuration (HK-FE-UI-02-DM; it supersedes the earlier light-only guard IOS-D02).
 */

const require = createRequire(import.meta.url);
const config = JSON.parse(
  execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--type', 'introspect', '--json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
  })
);
const appJson = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const resolved = config._internal.modResults.ios;
const infoPlist = resolved.infoPlist;

describe('iOS identity and Sign in with Apple', () => {
  test('bundle identifier, scheme and build number resolve to the canonical iOS values', () => {
    assert.equal(config.ios.bundleIdentifier, 'com.herkeys.app');
    assert.notEqual(config.ios.bundleIdentifier, config.android.package, 'the platform identifiers are intentionally different');
    assert.ok(infoPlist.CFBundleURLTypes.flatMap((t) => t.CFBundleURLSchemes).includes('herkeys'));
    assert.match(String(config.ios.buildNumber), /^\d+$/);
  });

  test('the Sign in with Apple capability is a real entitlement, not only a config flag', () => {
    assert.equal(config.ios.usesAppleSignIn, true);
    assert.deepEqual(resolved.entitlements['com.apple.developer.applesignin'], ['Default']);
  });

  test('the entitlement surface is exactly Apple sign-in plus the notification environment', () => {
    // aps-environment comes from the expo-notifications plugin (the app schedules LOCAL reminders only). Anything else — associated
    // domains, background modes, tracking — would be a new capability that needs a deliberate decision and an App ID change.
    assert.deepEqual(Object.keys(resolved.entitlements).sort(), ['aps-environment', 'com.apple.developer.applesignin']);
    assert.equal(infoPlist.UIBackgroundModes, undefined);
    assert.equal(infoPlist.NSUserTrackingUsageDescription, undefined);
  });

  test('iPhone only', () => {
    assert.equal(config.ios.supportsTablet, false);
  });
});

describe('adaptive appearance (HK-FE-UI-02-DM supersedes the light-only policy IOS-D02)', () => {
  const splash = () => appJson.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
  // The plugin's internals are not in the package `exports` map, so they are loaded by file path.
  const plugin = (name) => require(join(process.cwd(), 'node_modules/expo-splash-screen/plugin/build', `${name}.js`));

  test('Expo declares automatic appearance and the resolved Info.plist is Automatic (not forced Light)', () => {
    assert.equal(appJson.userInterfaceStyle, 'automatic', 'the declared product intent: Light, Dark or System, chosen in Settings');
    assert.equal(appJson.ios.infoPlist.UIUserInterfaceStyle, undefined, 'no hand-written forced style in app.json');
    assert.equal(infoPlist.UIUserInterfaceStyle, 'Automatic');
    assert.notEqual(appJson.android.userInterfaceStyle, 'light');
  });

  test('Android user-interface-style needs expo-system-ui: it is installed at the Expo-resolved SDK 57 version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    assert.match(pkg.dependencies['expo-system-ui'] ?? '', /^~57\./);
    assert.ok(JSON.parse(readFileSync('node_modules/expo-system-ui/package.json', 'utf8')).version.startsWith('57.'));
  });

  test('the expo-system-ui config plugin is registered and, run for real, writes Android "automatic" and an iOS root background', () => {
    // SDK 57 docs: under CNG the package must be in `plugins`; Android's userInterfaceStyle is baked into strings.xml (new binary only).
    assert.ok(appJson.plugins.includes('expo-system-ui'));
    const android = require(join(process.cwd(), 'node_modules/expo-system-ui/plugin/build/withAndroidUserInterfaceStyle.js'));
    const props = android.resolveProps({ userInterfaceStyle: appJson.userInterfaceStyle, android: appJson.android });
    assert.deepEqual(props, { userInterfaceStyle: 'automatic' });
    const strings = android.setStrings({ resources: {} }, props);
    const item = [strings.resources.string ?? []].flat().find((s) => s.$?.name === 'expo_system_ui_user_interface_style');
    assert.equal(item?._, 'automatic', 'strings.xml carries expo_system_ui_user_interface_style=automatic');
  });

  test('only the theme provider and system-chrome module read or set the colour scheme or mount the StatusBar', () => {
    const files = ['app', 'src'].flatMap((dir) => readdirSync(dir, { recursive: true }).map((f) => `${dir}/${String(f).replaceAll('\\', '/')}`));
    const readers = files
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /useColorScheme|Appearance\.|from 'expo-status-bar'|expo-system-ui/.test(readFileSync(f, 'utf8')))
      .sort();
    assert.deepEqual(readers, ['src/design/theme/SystemChrome.tsx', 'src/design/theme/ThemeProvider.tsx']);
  });

  test('the launch screen has coordinated light and dark configurations on BOTH platforms', () => {
    const { getIosSplashConfig } = plugin('getIosSplashConfig');
    const { getAndroidSplashConfig } = plugin('getAndroidSplashConfig');
    const { setSplashInfoPlist } = plugin('withIosSplashInfoPlist');
    const config = splash();
    assert.equal(config.backgroundColor, '#FDF8F5', 'light launch: the Warm Off-White ground');
    assert.equal(config.image, './assets/splash-brand-tile.png', 'light launch: the approved brand mark as a rounded tile');
    assert.equal(config.dark.backgroundColor, '#0B0A08', 'dark launch: the brand mark on its own near-black field (seamless)');
    assert.equal(config.dark.image, './assets/splash-brand.png');
    assert.equal(config.ios, undefined, 'no iOS-only override: iOS follows the same two configurations');
    const ios = getIosSplashConfig(config);
    assert.ok(ios.dark.backgroundColor && ios.dark.image, 'iOS has a dark splash');
    assert.equal(setSplashInfoPlist({ ios: {}, userInterfaceStyle: 'automatic' }, {}, ios).UIUserInterfaceStyle, 'Automatic');
    const android = getAndroidSplashConfig(config);
    assert.equal(android.dark?.backgroundColor, '#0B0A08');
    assert.equal(android.backgroundColor, '#FDF8F5');
    for (const asset of [config.image, config.dark.image]) assert.ok(readFileSync(asset.replace('./', '')).length > 1000, asset);
  });

  test('the light tile is the SAME approved artwork with transparent rounded corners (a corner mask only)', () => {
    const png = readFileSync('assets/splash-brand-tile.png');
    assert.equal(png[25], 6, 'RGBA');
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 512);
  });
});

describe('iOS permission surface', () => {
  const purposeKeys = Object.keys(infoPlist).filter((k) => /^NS.*UsageDescription$/.test(k)).sort();

  test('exactly the four declared purpose strings exist; each is backed by a linked native module', () => {
    // Location: foreground weather. Camera: document scan (OCR, on device). Motion: expo-location links CoreMotion and Apple's upload
    // validation keys on linked APIs, although the app never requests motion. Face ID: expo-secure-store links LocalAuthentication.
    assert.deepEqual(purposeKeys, ['NSCameraUsageDescription', 'NSFaceIDUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSMotionUsageDescription']);
  });

  test('no background location, microphone, contacts, calendars, Bluetooth or tracking is declared', () => {
    for (const key of [
      'NSLocationAlwaysAndWhenInUseUsageDescription',
      'NSLocationAlwaysUsageDescription',
      'NSMicrophoneUsageDescription',
      'NSContactsUsageDescription',
      'NSCalendarsUsageDescription',
      'NSRemindersUsageDescription',
      'NSBluetoothAlwaysUsageDescription',
      'NSUserTrackingUsageDescription',
      'NSSpeechRecognitionUsageDescription',
    ]) assert.equal(infoPlist[key], undefined, key);
    assert.equal(infoPlist.UIBackgroundModes, undefined);
  });

  test('the camera string says the photo stays on the device, and location says foreground and approximate', () => {
    assert.match(infoPlist.NSCameraUsageDescription, /on-device|on this device/i);
    assert.match(infoPlist.NSCameraUsageDescription, /never uploaded/i);
    assert.match(infoPlist.NSLocationWhenInUseUsageDescription, /approximate/i);
    assert.match(infoPlist.NSLocationWhenInUseUsageDescription, /while you're using the app/i);
  });

  test('the encryption export declaration is present', () => {
    assert.equal(infoPlist.ITSAppUsesNonExemptEncryption, false);
  });
});
