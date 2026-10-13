import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// B2B-A01: SecureStore's backup exclusions do not cover the household's AsyncStorage database.
// Exercise the resolved native manifest, not just the config spelling. No APK or backup is executed.
test('B2B-A01: Android native config disables automatic backup of household data', () => {
  const result = spawnSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--type', 'introspect', '--json'], {
    encoding: 'utf8', env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  const manifest = config._internal.modResults.android.manifest.manifest;
  assert.equal(config.android.allowBackup, false);
  assert.equal(manifest.application[0].$['android:allowBackup'], 'false');
  assert.equal(manifest.$.package, 'com.heykeys.app');
  // Keep credential exclusions in place, including on OEMs with their own transfer behavior.
  assert.equal(manifest.application[0].$['android:fullBackupContent'], '@xml/secure_store_backup_rules');
  assert.equal(manifest.application[0].$['android:dataExtractionRules'], '@xml/secure_store_data_extraction_rules');
});

test('B2B-A01: backup repair preserves the candidate iOS configuration', () => {
  const { expo } = JSON.parse(readFileSync('app.json', 'utf8'));
  assert.deepEqual(expo.ios, {
    supportsTablet: false, usesAppleSignIn: true, bundleIdentifier: 'com.herkeys.app', buildNumber: '2',
    icon: './assets/her-keys-4-house.png', infoPlist: { ITSAppUsesNonExemptEncryption: false },
  });
  assert.equal(expo.scheme, 'herkeys');
});
