import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Read-only Play Console audit, 2026-10-20: All app bundles has versionCode 2.
// The release name "V2" is independent of Android artifact numbering. EAS owns
// the next increment; a local base equal to this floor is valid with that enabled.
// Update the observed floor after the next accepted upload.
const highestObservedPlayVersionCode = 2;

test('GA-01: EAS increments the Android artifact beyond the existing Play upload', () => {
  const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
  assert.equal(eas.cli.appVersionSource, 'local');
  const increment = eas.build.production.android?.autoIncrement;
  assert.ok(increment === true || increment === 'versionCode',
    'production Android must opt into EAS artifact versionCode incrementing');
  const config = JSON.parse(execFileSync(process.execPath,
    ['node_modules/expo/bin/cli', 'config', '--type', 'public', '--json'],
    { encoding: 'utf8', env: { ...process.env, EXPO_NO_TELEMETRY: '1' } }));
  assert.equal(config.android.package, 'com.heykeys.app');
  assert.ok(Number.isSafeInteger(config.android.versionCode));
  const nextArtifactCode = config.android.versionCode + 1;
  assert.ok(nextArtifactCode > highestObservedPlayVersionCode,
    'the next EAS Android artifact must exceed the observed Play versionCode');
  assert.ok(nextArtifactCode <= 2100000000, 'Play versionCode upper limit');
});
