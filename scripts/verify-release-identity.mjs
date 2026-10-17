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

/** Fail an EAS build before bundling if its selected environment is missing or crossed. Never include key values in failures. */
export function checkBackendTarget(env) {
  const refs = { staging: 'fhhudicklmpofuzkxeqe', production: 'npykvnxnehlsdlbumzwk' };
  const backend = env.EXPO_PUBLIC_HERKEYS_BACKEND;
  const failures = [];
  // The mandatory legal and AI-processing consent gate is compiled in by this one build-time flag. A build that reaches a Her
  // Keys backend without it would silently skip the gate, because the app has no other switch for it.
  if (env.EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE !== 'true') {
    failures.push('consent: EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE must be exactly "true" so the mandatory legal and AI consent gate is compiled in');
  }
  if (!Object.hasOwn(refs, backend ?? '')) return [...failures, 'backend: an explicit Her Keys staging or production target is required'];
  let url;
  try { url = new URL(env.EXPO_PUBLIC_SUPABASE_URL); } catch { failures.push('backend: Supabase URL is missing or invalid'); }
  if (url && (url.protocol !== 'https:' || url.hostname !== `${refs[backend]}.supabase.co` || url.port || url.username || url.password)) {
    failures.push(`backend: ${backend} build is pointed at the wrong Supabase project`);
  }
  if (!(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY)?.trim()) failures.push('backend: client publishable key is missing');
  if (env.EXPO_PUBLIC_HERKEYS_DATA_MODE !== 'empty') failures.push('backend: EAS build must explicitly use empty data mode');
  return failures;
}

export function checkReleaseBackendTarget(env) {
  const failures = checkBackendTarget(env);
  if (env.EXPO_PUBLIC_HERKEYS_BACKEND !== 'production') failures.push('release backend: a store release requires the Production backend');
  return failures;
}

export function checkProvenance({ branch, trackedChanges, head, upstreamHead, remoteHead }) {
  const failures = [];
  if (!RELEASE_BRANCHES.includes(branch)) {
    failures.push(`branch: ${JSON.stringify(branch)} is not an authorized release branch (${RELEASE_BRANCHES.join(', ')})`);
  }
  if (trackedChanges.length > 0) failures.push(`working tree: tracked changes present (${trackedChanges.join(', ')})`);
  if (!upstreamHead) failures.push('upstream: branch has no upstream, so the candidate SHA is not on the remote');
  else if (upstreamHead !== head) failures.push(`upstream: HEAD ${head} differs from upstream ${upstreamHead} (push or pull first)`);
  if (!/^[0-9a-f]{40}$/.test(head ?? '')) failures.push('source: an exact full commit SHA is required');
  if (!remoteHead) failures.push('remote: current remote HEAD could not be verified (network access and an upstream are required)');
  else if (remoteHead !== head) failures.push('remote: current remote HEAD differs from the exact local source SHA');
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

// A cached tracking ref is not proof that the remote still points to this SHA.
// Query the configured upstream's exact branch; offline/missing/local upstreams fail closed.
export function readProvenance(run = git) {
  const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
  const remote = run(['config', '--get', `branch.${branch}.remote`]);
  const merge = run(['config', '--get', `branch.${branch}.merge`]);
  const upstreamHead = run(['rev-parse', '@{u}']);
  const lines = remote && remote !== '.' && merge.startsWith('refs/heads/') && upstreamHead
    ? run(['ls-remote', '--exit-code', '--refs', remote, merge]).split('\n') : [];
  const matches = lines.map(line => line.trim().split(/\s+/)).filter(parts => parts.length === 2 && parts[1] === merge && /^[0-9a-f]{40}$/.test(parts[0]));
  return {
    branch,
    head: run(['rev-parse', 'HEAD']),
    upstreamHead,
    remoteHead: matches.length === 1 ? matches[0][0] : '',
    trackedChanges: run(['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean),
  };
}

function main() {
  const release = process.argv.includes('--release');
  const config = resolveExpoConfig();
  const failures = checkIdentity(config);
  if (process.env.EAS_BUILD === 'true') failures.push(...checkBackendTarget(process.env));
  const report = {
    ANDROID_APPLICATION_ID: config?.android?.package,
    IOS_BUNDLE_IDENTIFIER: config?.ios?.bundleIdentifier,
    EAS_PROJECT_ID: config?.extra?.eas?.projectId,
    APP_VERSION: config?.version,
    ANDROID_VERSION_CODE: config?.android?.versionCode,
    IOS_BUILD_NUMBER: config?.ios?.buildNumber,
  };
  if (release) {
    failures.push(...checkReleaseBackendTarget(process.env));
    const provenance = readProvenance();
    failures.push(...checkProvenance(provenance));
    report.BRANCH = provenance.branch;
    report.SOURCE_SHA = provenance.head;
    report.REMOTE_SOURCE_SHA = provenance.remoteHead;
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
