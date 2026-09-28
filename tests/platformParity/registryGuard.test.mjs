import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, test } from 'node:test';
import '../support/googleAuth/register.mjs';

/**
 * PLATFORM PARITY GUARD — consumes docs/audits/HK_PLATFORM_PARITY_REGISTRY.json.
 *
 * The registry is the ONE list of approved iOS/Android differences. These tests fail when a platform conditional or a
 * platform-specific file appears that the registry does not name, when a registered one disappears, when native identifiers or
 * the permission doctrine drift, or when the two OAuth return routes stop being isolated. The negative tests at the end run the
 * same checks against injected violations to prove the guard can fail.
 */

const REGISTRY_PATH = 'docs/audits/HK_PLATFORM_PARITY_REGISTRY.json';
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const read = (path) => readFileSync(path, 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name).split(sep).join('/');
    if (statSync(path).isDirectory()) return filesUnder(path);
    return registry.scan.extensions.some((ext) => path.endsWith(ext)) ? [path] : [];
  });
}

/** Every platform conditional in the given sources: { file: count }. */
export function scanConditionals(sources) {
  const pattern = new RegExp(registry.scan.conditionalPattern, 'g');
  const found = {};
  for (const [file, source] of Object.entries(sources)) {
    const hits = stripComments(source).match(pattern);
    if (hits) found[file] = hits.length;
  }
  return found;
}

/** The difference between what the code has and what the registry approves. Empty means parity-safe. */
export function registryViolations(found, platformFiles) {
  const approved = Object.fromEntries(registry.conditionals.map((entry) => [entry.file, entry.count]));
  const problems = [];
  for (const [file, count] of Object.entries(found)) {
    if (!(file in approved)) problems.push(`unregistered platform conditional in ${file} (${count})`);
    else if (approved[file] !== count) problems.push(`${file} has ${count} platform conditionals; the registry approves ${approved[file]}`);
  }
  for (const file of Object.keys(approved)) if (!(file in found)) problems.push(`registered conditional no longer present: ${file}`);
  const approvedFiles = new Set(registry.platformFiles.map((entry) => entry.file));
  for (const file of platformFiles) if (!approvedFiles.has(file)) problems.push(`unregistered platform-specific file ${file}`);
  for (const file of approvedFiles) if (!platformFiles.includes(file)) problems.push(`registered platform file missing: ${file}`);
  return problems;
}

function currentSources() {
  const files = registry.scan.roots.flatMap(filesUnder);
  return Object.fromEntries(files.map((file) => [file, read(file)]));
}

function currentPlatformFiles() {
  const pattern = new RegExp(registry.scan.platformFilePattern);
  const all = registry.scan.roots.flatMap((root) =>
    (function walk(dir) {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name).split(sep).join('/');
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    })(root)
  );
  return all.filter((file) => pattern.test(file));
}

/** Native identity + permission doctrine against an introspected Expo config. */
export function nativeViolations(config) {
  const want = registry.nativeIdentity;
  const problems = [];
  if (config.ios?.bundleIdentifier !== want.iosBundleIdentifier) problems.push('iOS bundle identifier');
  if (config.android?.package !== want.androidPackage) problems.push('Android package');
  const schemes = [config.scheme].flat();
  if (!schemes.includes(want.scheme)) problems.push('scheme');
  const urlSchemes = (config.ios?.infoPlist?.CFBundleURLTypes ?? []).flatMap((type) => type.CFBundleURLSchemes ?? []);
  if (!urlSchemes.includes(want.scheme)) problems.push('iOS CFBundleURLSchemes lacks herkeys');
  for (const blocked of want.androidBlockedPermissions) {
    if (!(config.android?.blockedPermissions ?? []).includes(blocked)) problems.push(`Android does not block ${blocked}`);
  }
  for (const key of want.iosForbiddenInfoPlistKeys) if (key in (config.ios?.infoPlist ?? {})) problems.push(`iOS Info.plist has ${key}`);
  for (const permission of want.androidForbiddenPermissions) {
    if ((config.android?.permissions ?? []).includes(permission)) problems.push(`Android declares ${permission}`);
  }
  const plugins = (config.plugins ?? []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
  for (const plugin of want.requiredPlugins) if (!plugins.includes(plugin)) problems.push(`plugin ${plugin} missing`);
  return problems;
}

/** Android deep-link delivery: the resolved manifest must route herkeys:// VIEW/BROWSABLE intents to the singleTask activity. */
export function androidDeepLinkViolations(manifest) {
  const problems = [];
  const activities = manifest?.manifest?.application?.[0]?.activity ?? [];
  const main = activities.find((activity) => activity.$['android:name'] === '.MainActivity');
  if (!main) return ['MainActivity missing'];
  if (main.$['android:launchMode'] !== 'singleTask') problems.push('MainActivity is not singleTask (an auth return would start a second instance)');
  const view = (main['intent-filter'] ?? []).find(
    (filter) =>
      (filter.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.VIEW') &&
      (filter.category ?? []).some((c) => c.$['android:name'] === 'android.intent.category.BROWSABLE') &&
      (filter.data ?? []).some((d) => d.$['android:scheme'] === registry.nativeIdentity.scheme)
  );
  if (!view) problems.push('no VIEW/BROWSABLE intent filter for herkeys://');
  return problems;
}

const introspected = JSON.parse(
  execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--type', 'introspect', '--json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
  })
);

describe('platform registry — the code matches the approved list exactly', () => {
  test('every Platform conditional in app/ and src/ is registered, with its exact count, and every registered one exists', () => {
    assert.deepEqual(registryViolations(scanConditionals(currentSources()), currentPlatformFiles()), []);
  });

  test('every registry entry is classified and every C (parity defect) entry names an open defect', () => {
    for (const entry of registry.conditionals) {
      assert.ok(Object.keys(registry.scan.classes).includes(entry.class), entry.id);
      if (entry.class === 'C') assert.ok(entry.defect, `${entry.id} is a parity defect without a defect id`);
      if (entry.class === 'B') assert.ok(registry.exceptions.some((ex) => ex.id === entry.exception), `${entry.id} names no exception`);
      if (entry.class === 'E') assert.ok(entry.runtime, `${entry.id} has no runtime handoff id`);
    }
  });

  test('the prose report references the registry and states a binary verdict (one source of truth)', () => {
    const report = read('docs/audits/HK_IOS_ANDROID_PLATFORM_PARITY.md');
    assert.match(report, /HK_PLATFORM_PARITY_REGISTRY\.json/);
    assert.match(report, /^PART1_RESULT=(PASS|FAIL)$/m);
    for (const entry of registry.conditionals) assert.match(report, new RegExp(`\\b${entry.id}\\b`), `${entry.id} missing from the report`);
  });
});

describe('native identity and permission doctrine (resolved through the real config plugins)', () => {
  test('identifiers, scheme, blocked/forbidden permissions and required plugins hold', () => {
    assert.deepEqual(nativeViolations(introspected), []);
  });

  test('Android delivers herkeys:// links to the singleTask main activity', () => {
    assert.deepEqual(androidDeepLinkViolations(introspected._internal?.modResults?.android?.manifest), []);
  });
});

describe('OAuth return isolation', () => {
  test('each registered OAuth return is swallowed by the router hook and owned by exactly one flow', async () => {
    const { redirectSystemPath } = await import('../../app/+native-intent.tsx');
    for (const { route } of registry.oauthReturnRoutes) {
      assert.equal(redirectSystemPath({ path: `${route}?x=1`, initial: true }), null, route);
      assert.equal(redirectSystemPath({ path: `${route}?x=1`, initial: false }), null, route);
    }
    const identity = stripComments(read('src/platform/googleIdentityOAuth.ts') + read('src/platform/googleProvider.ts'));
    const calendar = stripComments(read('src/features/calendar/useGoogleCalendarBridge.ts'));
    assert.doesNotMatch(identity, /calendar-connected|calendar-oauth|calendar-data/);
    assert.doesNotMatch(calendar, /auth\/callback|googleIdentityOAuth|signInWithOAuth|exchangeCodeForSession/);
  });

  test('the Google provider is registered once for both native platforms, and Apple is not offered on Android', async () => {
    const root = read('src/store/accountRuntimeInstance.ts');
    assert.match(root, /createAppleProvider\(providerClient\), \.\.\.\(secureStorageAvailable \? \[createGoogleProvider\(providerClient\)\] : \[\]\)/);
    assert.doesNotMatch(stripComments(root), /Platform\./);
  });

  test('EX-01: Apple is available on iOS and unavailable on Android, decided before the native module is asked', async () => {
    const { createAppleProvider } = await import('../../src/platform/appleProvider.ts');
    const provider = createAppleProvider({ auth: {} });
    globalThis.__hkPlatformOS = 'ios';
    assert.equal(await provider.isAvailable(), true);
    globalThis.__hkPlatformOS = 'android';
    assert.equal(await provider.isAvailable(), false);
  });

  test('the account surface offers only providers the device reports available (no broken Apple button on Android)', () => {
    const screen = stripComments(read('app/sign-in.tsx'));
    const panel = stripComments(read('src/features/account/AccountPanel.tsx'));
    assert.match(screen, /accountProviders\s*\.available\(\)/);
    assert.match(screen, /providers=\{providers\}/);
    assert.match(panel, /providers\.map\(\(provider\) =>/);
    for (const file of ['app/sign-in.tsx', 'src/features/account/AccountPanel.tsx', 'src/features/account/AccountEntry.tsx', 'src/features/account/accountModel.ts']) {
      assert.doesNotMatch(stripComments(read(file)), /Platform\.|expo-apple-authentication|['"]apple['"]\s*\]/, file);
    }
  });
});

describe('the guard can fail (negative controls)', () => {
  test('an undeclared platform branch is reported', () => {
    const sources = currentSources();
    sources['src/features/today/TodayBriefing.tsx'] += "\nconst sneaky = Platform.OS === 'android' ? 1 : 2;\n";
    assert.match(registryViolations(scanConditionals(sources), currentPlatformFiles()).join('\n'), /unregistered platform conditional in src\/features\/today\/TodayBriefing\.tsx/);
  });

  test('a second branch inside a registered file is reported', () => {
    const sources = currentSources();
    sources['src/platform/appleProvider.ts'] += "\nexport const x = Platform.select({ ios: 1, android: 2 });\n";
    assert.match(registryViolations(scanConditionals(sources), currentPlatformFiles()).join('\n'), /appleProvider\.ts has 2/);
  });

  test('an unregistered .android. file is reported', () => {
    assert.match(
      registryViolations(scanConditionals(currentSources()), [...currentPlatformFiles(), 'src/platform/deviceLocation.android.ts']).join('\n'),
      /unregistered platform-specific file/
    );
  });

  test('a commented-out Platform.OS mention is not a conditional', () => {
    assert.deepEqual(scanConditionals({ 'x.ts': "// Platform.OS === 'ios'\n/* Platform.select({}) */\nconst a = 1;" }), {});
  });

  test('removing the Android deep-link intent filter or singleTask is reported', () => {
    const manifest = structuredClone(introspected._internal.modResults.android.manifest);
    const main = manifest.manifest.application[0].activity.find((activity) => activity.$['android:name'] === '.MainActivity');
    main['intent-filter'] = main['intent-filter'].filter((filter) => !(filter.data ?? []).length);
    assert.match(androidDeepLinkViolations(manifest).join('\n'), /no VIEW\/BROWSABLE intent filter/);
    main.$['android:launchMode'] = 'standard';
    assert.match(androidDeepLinkViolations(manifest).join('\n'), /not singleTask/);
  });

  test('a changed scheme, a background-location string or fine location is reported', () => {
    const config = structuredClone(introspected);
    config.scheme = 'herkeys-dev';
    config.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription = 'x';
    config.android.blockedPermissions = [];
    const problems = nativeViolations(config).join('\n');
    assert.match(problems, /scheme/);
    assert.match(problems, /NSLocationAlwaysAndWhenInUseUsageDescription/);
    assert.match(problems, /ACCESS_FINE_LOCATION/);
  });
});
