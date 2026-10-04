// Release identity guard. Fails unless the RESOLVED Expo config (not a grep of app.json) carries the canonical Her Keys
// identity. EAS stores one Android keystore per application id, so a build with the wrong android.package is silently
// signed with a different upload key and Google Play rejects it (docs/release/ANDROID_RELEASE_IDENTITY.md).
//
//   node scripts/verify-release-identity.mjs             identity only (CI gate, EAS build hook)
//   node scripts/verify-release-identity.mjs --release   identity + branch / clean tree / pushed HEAD (before `eas build`)
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The Android and iOS identifiers are intentionally different. Do not "normalize" them.
export const CANONICAL_IDENTITY = Object.freeze({
  androidPackage: 'com.heykeys.app',
  iosBundleIdentifier: 'com.herkeys.app',
  slug: 'her-keys',
  owner: 'ams2dad',
  easProjectId: '7b25f8fe-d7de-49c1-ba69-1fd3a065826a',
});

// Branches a production store build may be cut from. Changing this list is an owner decision.
export const RELEASE_BRANCHES = Object.freeze(['build/02-gemini-integration']);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function checkIdentity(config) {
  const actual = {
    androidPackage: config?.android?.package,
    iosBundleIdentifier: config?.ios?.bundleIdentifier,
    slug: config?.slug,
    owner: config?.owner,
    easProjectId: config?.extra?.eas?.projectId,
  };
  const failures = [];
  for (const [key, expected] of Object.entries(CANONICAL_IDENTITY)) {
    if (actual[key] !== expected) failures.push(`${key}: expected ${expected}, resolved ${JSON.stringify(actual[key])}`);
  }
  return failures;
}

export function checkProvenance({ branch, trackedChanges, head, upstreamHead }) {
  const failures = [];
  if (!RELEASE_BRANCHES.includes(branch)) {
    failures.push(`branch: ${JSON.stringify(branch)} is not an authorized release branch (${RELEASE_BRANCHES.join(', ')})`);
  }
  if (trackedChanges.length > 0) failures.push(`working tree: tracked changes present (${trackedChanges.join(', ')})`);
  if (!upstreamHead) failures.push('upstream: branch has no upstream, so the candidate SHA is not on the remote');
  else if (upstreamHead !== head) failures.push(`upstream: HEAD ${head} differs from upstream ${upstreamHead} (push or pull first)`);
  return failures;
}

export function resolveExpoConfig(root = ROOT) {
  const cli = join(root, 'node_modules', 'expo', 'bin', 'cli');
  const result = spawnSync(process.execPath, [cli, 'config', '--type', 'public', '--json'], { cwd: root, encoding: 'utf8' });
  const start = result.stdout ? result.stdout.indexOf('{') : -1;
  if (result.status !== 0 || start < 0) {
    throw new Error(`expo config did not resolve (exit ${result.status}): ${(result.stderr || result.stdout || '').trim().slice(0, 500)}`);
  }
  return JSON.parse(result.stdout.slice(start));
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function main() {
  const release = process.argv.includes('--release');
  const config = resolveExpoConfig();
  const failures = checkIdentity(config);
  const report = {
    ANDROID_APPLICATION_ID: config?.android?.package,
    IOS_BUNDLE_IDENTIFIER: config?.ios?.bundleIdentifier,
    EAS_PROJECT_ID: config?.extra?.eas?.projectId,
    APP_VERSION: config?.version,
    ANDROID_VERSION_CODE: config?.android?.versionCode,
    IOS_BUILD_NUMBER: config?.ios?.buildNumber,
  };
  if (release) {
    const provenance = {
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
      head: git(['rev-parse', 'HEAD']),
      upstreamHead: git(['rev-parse', '@{u}']),
      trackedChanges: git(['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean),
    };
    failures.push(...checkProvenance(provenance));
    report.BRANCH = provenance.branch;
    report.SOURCE_SHA = provenance.head;
  }
  for (const [key, value] of Object.entries(report)) console.log(`${key}=${value}`);
  if (failures.length > 0) {
    console.error(`\nRELEASE_IDENTITY=FAIL\n${failures.map((failure) => `  - ${failure}`).join('\n')}`);
    console.error('\nDo not build. See docs/release/ANDROID_RELEASE_IDENTITY.md.');
    process.exit(1);
  }
  console.log('RELEASE_IDENTITY=PASS');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
