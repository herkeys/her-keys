import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, test } from 'node:test';

/**
 * The RESOLVED native iOS configuration (`expo config --type introspect`, i.e. every config plugin's mod evaluated), not a grep
 * of app.json. macOS/Xcode are not available to the audit, so this is the strongest executable evidence of what the iOS binary
 * will declare. It pins the iOS identity, the Apple sign-in entitlement, the exact permission surface and the light-only
 * appearance (IOS-D02).
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

describe('IOS-D02 the iOS app is light-only, as app.json declares', () => {
  test('the resolved Info.plist forces Light (it was Automatic: the dark splash block silently overrode it)', () => {
    assert.equal(appJson.userInterfaceStyle, 'light', 'the declared product intent');
    assert.equal(infoPlist.UIUserInterfaceStyle, 'Light');
  });

  test('the app has no dark theme and mounts no StatusBar, so it must never be put in dark mode by the system', () => {
    // Under Automatic and the default status-bar style an iPhone in dark mode draws a white clock/battery on the ivory background and
    // a dark keyboard and system sheets over a light UI. If a dark theme is ever built, this guard is the one to retire.
    const files = ['app', 'src'].flatMap((dir) => readdirSync(dir, { recursive: true }).map((f) => `${dir}/${String(f).replaceAll('\\', '/')}`));
    const readers = files
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /useColorScheme|Appearance\.|from 'expo-status-bar'/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(readers, [], 'something now reads or sets the colour scheme: re-decide light-only');
  });

  test('the iOS-only splash override removes the dark variant for iOS and changes nothing for Android', () => {
    const splash = appJson.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    // The plugin's internals are not in the package `exports` map, so they are loaded by file path.
    const plugin = (name) => require(join(process.cwd(), 'node_modules/expo-splash-screen/plugin/build', `${name}.js`));
    const { getIosSplashConfig } = plugin('getIosSplashConfig');
    const { getAndroidSplashConfig } = plugin('getAndroidSplashConfig');
    const { setSplashInfoPlist } = plugin('withIosSplashInfoPlist');

    const ios = getIosSplashConfig(splash);
    assert.ok(!ios.dark.backgroundColor && !ios.dark.image, 'no iOS dark splash');
    assert.notEqual(setSplashInfoPlist({ ios: {}, userInterfaceStyle: 'light' }, {}, ios).UIUserInterfaceStyle, 'Automatic');

    const { ios: _ios, ...withoutIosKey } = splash;
    assert.deepEqual(getAndroidSplashConfig(splash), getAndroidSplashConfig(withoutIosKey), 'Android splash is byte-identical with or without the iOS override');
    const android = getAndroidSplashConfig(splash);
    assert.equal(android.dark?.backgroundColor, '#0B0A08', 'Android keeps its (identical) dark splash resources');
  });

  test('the override is scoped to iOS keys only', () => {
    const splash = appJson.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    assert.deepEqual(Object.keys(splash.ios), ['dark']);
    assert.deepEqual(appJson.ios.infoPlist.UIUserInterfaceStyle, 'Light');
    assert.equal(appJson.android.userInterfaceStyle, undefined);
  });
});

describe('iOS permission surface', () => {
  const purposeKeys = Object.keys(infoPlist).filter((k) => /^NS.*UsageDescription$/.test(k)).sort();

  test('exactly the five declared purpose strings exist; each is backed by a linked native module', () => {
    // Location: foreground weather. Camera: document scan (OCR, on device). Motion: expo-location links CoreMotion and Apple's upload
    // validation keys on linked APIs, although the app never requests motion. Face ID: expo-secure-store links LocalAuthentication.
    assert.deepEqual(purposeKeys, ['NSCameraUsageDescription', 'NSFaceIDUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSMotionUsageDescription', 'NSPhotoLibraryUsageDescription']);
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

  test('the resolved iOS Photos purpose matches the reviewed image-picker document intake', () => {
    const approved = 'Her Keys lets you select a document photo from your library for on-device text recognition. The selected photo stays on this device and is never uploaded.';
    const picker = appJson.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker')[1];
    assert.equal(picker.photosPermission, approved);
    assert.equal(infoPlist.NSPhotoLibraryUsageDescription, approved);
    assert.equal(infoPlist.NSPhotoLibraryAddUsageDescription, undefined,
      'The app only selects, not writes, document photos');
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
