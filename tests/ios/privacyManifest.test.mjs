import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, test } from 'node:test';

/**
 * PRIV-01 (iOS IPA audit 2026-11-17, EAS build 19da0220): the shipped IPA declared no DiskSpace required-reason API.
 *
 * `Frameworks/ExpoFileSystem.framework` references NSFileSystemFreeSize, NSFileSystemSize,
 * NSURLVolumeAvailableCapacityForImportantUsageKey and NSURLVolumeTotalCapacityKey. expo-file-system declares them in its own
 * `ios/PrivacyInfo.xcprivacy`, but Expo's precompiled-framework path shipped `ExpoFileSystem_privacy.bundle` WITHOUT that file, and
 * React Native's pod-install aggregation (which only reads pod resource bundles) never saw it. So no manifest anywhere in the IPA
 * declared NSPrivacyAccessedAPICategoryDiskSpace, which Apple's upload validation reports as ITMS-91053.
 *
 * The repair restores the vendor's own declaration at app level through `expo.ios.privacyManifests` (iOS-only; Android ignores it).
 * Two real build stages carry it into the binary, and both are exercised or pinned here:
 *   1. prebuild: Expo's `withPrivacyInfo` writes `ios/<Project>/PrivacyInfo.xcprivacy` with `mergePrivacyInfo`;
 *   2. pod install: React Native's `PrivacyManifestUtils` APPENDS the pods' reasons to that existing file (a union, never a reset).
 * macOS/Xcode are not available here, so the final check is the rebuilt IPA's own PrivacyInfo.xcprivacy (see the audit report).
 */

const require = createRequire(import.meta.url);
const plist = require('@expo/plist').default;
const appJson = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const declared = appJson.ios.privacyManifests;
// Plugin internals are not in the package `exports` map, so they are loaded by file path (as tests/ios/nativeConfig.test.mjs does).
const { mergePrivacyInfo } = require(join(process.cwd(), 'node_modules/@expo/config-plugins/build/ios/PrivacyInfo.js'));

const DISK_SPACE = 'NSPrivacyAccessedAPICategoryDiskSpace';
const FILE_TIMESTAMP = 'NSPrivacyAccessedAPICategoryFileTimestamp';

const reasonsByType = (manifest) =>
  Object.fromEntries((manifest.NSPrivacyAccessedAPITypes ?? []).map((t) => [t.NSPrivacyAccessedAPIType, [...t.NSPrivacyAccessedAPITypeReasons].sort()]));

/** The aggregated app manifest exactly as EAS build 19da0220 shipped it (read from the IPA during the audit). */
const SHIPPED_19DA0220 = {
  NSPrivacyAccessedAPITypes: [
    { NSPrivacyAccessedAPIType: FILE_TIMESTAMP, NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
    { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
    { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
  ],
  NSPrivacyCollectedDataTypes: [],
  NSPrivacyTracking: false,
};

describe('iOS privacy manifest (PRIV-01)', () => {
  test('the app declares DiskSpace and the expo-file-system FileTimestamp reasons', () => {
    const reasons = reasonsByType(declared);
    assert.deepEqual(reasons[DISK_SPACE], ['85F4.1', 'E174.1']);
    assert.deepEqual(reasons[FILE_TIMESTAMP], ['0A2A.1', '3B52.1']);
  });

  test('every reason expo-file-system declares for itself is declared by the app (the precompiled bundle drops it)', () => {
    const vendor = plist.parse(readFileSync('node_modules/expo-file-system/ios/PrivacyInfo.xcprivacy', 'utf8'));
    const app = reasonsByType(declared);
    const vendorTypes = reasonsByType(vendor);
    assert.ok(vendorTypes[DISK_SPACE], 'expo-file-system still uses DiskSpace; if this fails, re-check the IPA before removing the declaration');
    for (const [type, reasons] of Object.entries(vendorTypes)) {
      for (const reason of reasons) assert.ok(app[type]?.includes(reason), `${type} ${reason} missing from app.json ios.privacyManifests`);
    }
  });

  test('only required-reason API declarations change: no tracking, tracking domains or collected-data claims are introduced', () => {
    assert.deepEqual(Object.keys(declared), ['NSPrivacyAccessedAPITypes']);
    for (const entry of declared.NSPrivacyAccessedAPITypes) {
      assert.match(entry.NSPrivacyAccessedAPIType, /^NSPrivacyAccessedAPICategory[A-Za-z]+$/);
      for (const reason of entry.NSPrivacyAccessedAPITypeReasons) assert.match(reason, /^[0-9A-F]{4}\.\d$/);
    }
  });

  test('prebuild (Expo mergePrivacyInfo) writes the declaration into a fresh app manifest without tracking', () => {
    const written = mergePrivacyInfo({}, declared);
    assert.equal(written.NSPrivacyTracking, false);
    assert.deepEqual(written.NSPrivacyTrackingDomains, []);
    assert.deepEqual(reasonsByType(written), { [DISK_SPACE]: ['85F4.1', 'E174.1'], [FILE_TIMESTAMP]: ['0A2A.1', '3B52.1'] });
  });

  test('merged with what build 19da0220 shipped, every earlier reason survives and DiskSpace is added', () => {
    const merged = reasonsByType(mergePrivacyInfo(structuredClone(SHIPPED_19DA0220), declared));
    assert.deepEqual(merged, {
      [FILE_TIMESTAMP]: ['0A2A.1', '3B52.1', 'C617.1'],
      NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
      NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
      [DISK_SPACE]: ['85F4.1', 'E174.1'],
    });
  });

  test('React Native pod-install aggregation appends pod reasons to the existing app manifest instead of replacing it', () => {
    // Stage 2 runs in Ruby on the macOS builder. This pins the behavior the repair depends on, so an upgrade that changes it fails here.
    const utils = readFileSync('node_modules/react-native/scripts/cocoapods/privacy_manifest_utils.rb', 'utf8');
    assert.match(utils, /privacy_info = read_privacyinfo_file\(file_path\)/);
    assert.match(utils, /\(privacy_info\["NSPrivacyAccessedAPITypes"\] \|\| \[\]\)\.each do \|accessed_api\|/);
    assert.match(utils, /required_reason_apis\[api_type\] \+= reasons/);
    assert.match(utils, /"NSPrivacyAccessedAPITypeReasons" => reasons\.uniq/);
  });

  test('the declaration is iOS-only: Android configuration is untouched', () => {
    assert.equal(appJson.android.privacyManifests, undefined);
    assert.equal(appJson.privacyManifests, undefined);
  });
});
