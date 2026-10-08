// Release identity guard: the resolved Expo config must carry the canonical Android application id, iOS bundle
// identifier and EAS project. A wrong android.package makes EAS sign with a different keystore
// (docs/release/ANDROID_RELEASE_IDENTITY.md).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CANONICAL_IDENTITY,
  RELEASE_BRANCHES,
  checkIdentity,
  checkBackendTarget,
  checkProvenance,
  resolveExpoConfig,
} from '../scripts/verify-release-identity.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('Release identity guard', () => {
  test('EAS targets require the exact environment URL, a client key and empty data mode', () => {
    const good = { EXPO_PUBLIC_HERKEYS_BACKEND: 'staging', EXPO_PUBLIC_SUPABASE_URL: 'https://fhhudicklmpofuzkxeqe.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-public-key', EXPO_PUBLIC_HERKEYS_DATA_MODE: 'empty' };
    assert.deepEqual(checkBackendTarget(good), []);
    for (const change of [
      { EXPO_PUBLIC_SUPABASE_URL: 'https://npykvnxnehlsdlbumzwk.supabase.co' },
      { EXPO_PUBLIC_SUPABASE_URL: 'https://fhhudicklmpofuzkxeqe.evil.example' },
      { EXPO_PUBLIC_SUPABASE_URL: 'http://fhhudicklmpofuzkxeqe.supabase.co' },
      { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' },
      { EXPO_PUBLIC_HERKEYS_BACKEND: undefined },
      { EXPO_PUBLIC_HERKEYS_DATA_MODE: 'demo' },
      { EXPO_PUBLIC_HERKEYS_DATA_MODE: undefined },
    ]) assert.ok(checkBackendTarget({ ...good, ...change }).length > 0);
  });
  const resolved = resolveExpoConfig();

  test('the resolved Expo config carries the canonical identity', () => {
    assert.deepEqual(checkIdentity(resolved), []);
    assert.equal(resolved.android.package, 'com.heykeys.app');
    assert.equal(resolved.ios.bundleIdentifier, 'com.herkeys.app');
    assert.equal(resolved.extra.eas.projectId, '7b25f8fe-d7de-49c1-ba69-1fd3a065826a');
  });

  test('the Android and iOS identifiers are intentionally different', () => {
    assert.notEqual(CANONICAL_IDENTITY.androidPackage, CANONICAL_IDENTITY.iosBundleIdentifier);
  });

  test('the obsolete Android application id is rejected', () => {
    const failures = checkIdentity({ ...resolved, android: { ...resolved.android, package: 'com.herkeys.app' } });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /androidPackage: expected com\.heykeys\.app/);
  });

  test('a changed iOS bundle identifier is rejected', () => {
    const failures = checkIdentity({ ...resolved, ios: { ...resolved.ios, bundleIdentifier: 'com.heykeys.app' } });
    assert.match(failures.join('\n'), /iosBundleIdentifier/);
  });

  test('another EAS project, owner or slug is rejected', () => {
    assert.match(checkIdentity({ ...resolved, extra: { eas: { projectId: '00000000-0000-0000-0000-000000000000' } } }).join('\n'), /easProjectId/);
    assert.match(checkIdentity({ ...resolved, extra: {} }).join('\n'), /easProjectId/);
    assert.match(checkIdentity({ ...resolved, owner: 'k-scan' }).join('\n'), /owner/);
    assert.match(checkIdentity({ ...resolved, slug: 'kscan' }).join('\n'), /slug/);
  });

  test('provenance requires an authorized branch, a clean tracked tree and a pushed HEAD', () => {
    const good = { branch: RELEASE_BRANCHES[0], trackedChanges: [], head: 'a', upstreamHead: 'a' };
    assert.deepEqual(checkProvenance(good), []);
    assert.match(checkProvenance({ ...good, branch: 'feature/01-today-chief-of-staff' }).join('\n'), /not an authorized release branch/);
    assert.match(checkProvenance({ ...good, trackedChanges: ['app.json'] }).join('\n'), /tracked changes/);
    assert.match(checkProvenance({ ...good, upstreamHead: 'b' }).join('\n'), /differs from upstream/);
    assert.match(checkProvenance({ ...good, upstreamHead: '' }).join('\n'), /no upstream/);
  });

  test('the parity registry agrees with the guard', () => {
    const registry = JSON.parse(read('docs/audits/HK_PLATFORM_PARITY_REGISTRY.json'));
    assert.equal(registry.nativeIdentity.androidPackage, CANONICAL_IDENTITY.androidPackage);
    assert.equal(registry.nativeIdentity.iosBundleIdentifier, CANONICAL_IDENTITY.iosBundleIdentifier);
  });

  test('the guard is wired into the validation gate, the EAS build and the release command', () => {
    const scripts = JSON.parse(read('package.json')).scripts;
    assert.equal(scripts['verify:release-identity'], 'node scripts/verify-release-identity.mjs');
    assert.equal(scripts['eas-build-post-install'], 'node scripts/verify-release-identity.mjs');
    assert.match(scripts['release:preflight'], /verify-release-identity\.mjs --release/);
    assert.match(read('.github/workflows/build2-validation-temporary.yml'), /npm run verify:release-identity/);
  });

  test('no build document still declares the obsolete Android application id', () => {
    for (const path of ['docs/builds/BUILD4.md', 'docs/builds/BUILD4_PHASE0_CHECKPOINT.md', 'docs/builds/HK-FE-UI-01-PERMANENT.txt']) {
      assert.doesNotMatch(read(path), /Android `com\.herkeys\.app`|android\.package = com\.herkeys\.app/, path);
    }
  });
});
