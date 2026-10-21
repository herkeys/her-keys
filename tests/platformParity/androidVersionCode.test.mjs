import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

// Read-only Play Console audit, 2026-10-20: All app bundles has versionCode 2.
// EAS uses local versions without autoIncrement, so every new Play artifact must
// exceed this floor. Update the observed floor after the next accepted upload.
const highestObservedPlayVersionCode = 2;

test('GA-01: resolved Android version code exceeds the existing Play upload', () => {
  const config = JSON.parse(execFileSync(process.execPath,
    ['node_modules/expo/bin/cli', 'config', '--type', 'public', '--json'],
    { encoding: 'utf8', env: { ...process.env, EXPO_NO_TELEMETRY: '1' } }));
  assert.equal(config.android.package, 'com.heykeys.app');
  assert.ok(Number.isSafeInteger(config.android.versionCode));
  assert.ok(config.android.versionCode > highestObservedPlayVersionCode,
    `Android versionCode ${config.android.versionCode} is already used in Play; choose a higher local version before building`);
  assert.ok(config.android.versionCode <= 2100000000, 'Play versionCode upper limit');
});
