/**
 * Weather device-location architecture guard. Source-level proofs of the privacy and permission invariants:
 *   - Weather is located ONLY by the device, only in the foreground, only on a user action — no fixed city, no stored coordinate,
 *     no watcher, no background, no geocoding, no telemetry.
 *   - The native permission surface is exactly foreground-coarse location, resolved through Expo's real config plugins (not just
 *     read out of app.json).
 * `deviceLocation.test.mjs` proves the same behaviors by running the seam and the card against a scripted device.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const SEAM = 'src/platform/deviceLocation.ts';
const CARD = 'src/features/today/WeatherContextCard.tsx';

/** Code without comments or string-literal-free prose, so a guard reads what runs, not what is explained. */
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(path.replace(/\\/g, '/'));
  }
  return out;
}
const appSources = () => [...walk('src'), ...walk('app')];

describe('Weather has no fixed location', () => {
  test('the build-time weather anchor is gone: no config module, no env variables, no reference', () => {
    assert.equal(existsSync('src/config/externalIntelligence.ts'), false);
    assert.doesNotMatch(read('.env.example'), /WEATHER_ANCHOR|WEATHER_.*(LATITUDE|LONGITUDE|LABEL|COUNTRY)/i);
    for (const file of appSources()) {
      assert.doesNotMatch(read(file), /weatherAnchor|WEATHER_ANCHOR|config\/externalIntelligence['"]/, `${file} still references the anchor`);
    }
  });

  test('no city, coordinate literal or default location exists in the Weather path', () => {
    for (const file of [SEAM, CARD]) {
      const source = code(file);
      assert.doesNotMatch(source, /Charlotte|New York|latitude:\s*-?\d|longitude:\s*-?\d/i, `${file} hard-codes a place`);
      // Any coordinate-shaped literal (up to three whole digits, three or more decimals) is a fixed place in disguise.
      assert.doesNotMatch(source, /-?\b\d{1,3}\.\d{3,}\b/, `${file} contains a coordinate literal`);
      assert.doesNotMatch(source, /process\.env/, `${file} reads build-time configuration`);
    }
  });
});

describe('Weather uses the device-location seam, and only it', () => {
  test('expo-location is imported by exactly one file: the seam', () => {
    const importers = appSources().filter((file) => /from\s+['"]expo-location['"]|require\(\s*['"]expo-location['"]/.test(read(file)));
    assert.deepEqual(importers, [SEAM]);
  });

  test('the card takes its coordinates from the seam and hands them only to the Weather client', () => {
    const card = code(CARD);
    assert.match(card, /from '\.\.\/\.\.\/platform\/deviceLocation'/);
    assert.match(card, /readWeatherLocation/);
    assert.match(card, /requestWeatherLocation/);
    assert.match(card, /externalIntelligenceClient\.weather\(/);
    // Each coordinate is read exactly once — as a field of that one request — and nowhere else.
    assert.equal((card.match(/location\.latitude/g) ?? []).length, 1);
    assert.equal((card.match(/location\.longitude/g) ?? []).length, 1);
    assert.doesNotMatch(card, /countryCode/, 'no reverse-geocoded country is sent');
  });

  test('the location prompt is reachable only from a button press, never from mount, refresh, foreground or the timer', () => {
    const card = code(CARD);
    const effect = card.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[bound, refresh\]\);/);
    assert.ok(effect, 'the card has one effect');
    assert.doesNotMatch(effect[0], /refresh\(true\)|requestWeatherLocation/);
    assert.match(effect[0], /refresh\(false\)/);
    // Every `refresh(true)` is an onPress handler.
    const pressed = [...card.matchAll(/refresh\(true\)/g)].length;
    const handlers = [...card.matchAll(/onPress=\{\(\) => void refresh\(true\)\}/g)].length;
    assert.ok(pressed > 0 && pressed === handlers, 'refresh(true) appears only inside onPress');
    // The seam's silent path never reaches the prompt.
    const silent = code(SEAM).match(/export async function readWeatherLocation[\s\S]*?\n\}/)[0];
    assert.doesNotMatch(silent, /requestForegroundPermissionsAsync/);
    assert.doesNotMatch(code(SEAM), /^[A-Za-z].*requestForegroundPermissionsAsync/m, 'nothing requests at module scope');
  });

  test('a signed-out or local-only user never reaches location or the provider', () => {
    const card = code(CARD);
    assert.match(card, /account\?\.state\.kind === 'accountBound'/);
    assert.match(card, /if \(!bound\) return null;/);
  });

  test('the Today briefing still mounts the card unconditionally: a Weather failure has nowhere to break Today', () => {
    const briefing = code('src/features/today/TodayBriefing.tsx');
    assert.match(briefing, /<WeatherContextCard \/>/);
    assert.doesNotMatch(code(CARD), /throw\s/);
  });
});

describe('device coordinates are ephemeral', () => {
  test('the seam and the card have no persistence, database, sync, telemetry or logging path', () => {
    for (const file of [SEAM, CARD]) {
      const source = code(file);
      assert.doesNotMatch(
        source,
        /AsyncStorage|SecureStore|secureStore|localStorage|sessionStorage|expo-file-system|FileSystem|writeFile|MMKV/,
        `${file} touches storage`,
      );
      assert.doesNotMatch(source, /supabase|\.from\s*\(|\.insert\s*\(|\.upsert\s*\(|\.rpc\s*\(|syncQueue|sync_push|syncTransport/i, `${file} touches the database or sync`);
      assert.doesNotMatch(source, /console\.|analytics|telemetry|Sentry|posthog|amplitude|logEvent|track\w*\(/i, `${file} logs or reports`);
      assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|https?:\/\//, `${file} makes its own network call`);
    }
  });

  test('the card only reads household state — it cannot write coordinates into it', () => {
    const card = code(CARD);
    assert.match(card, /const \{ state \} = useHouseholdState\(\);/);
    assert.doesNotMatch(card, /dispatch|useAppStore|setHousehold|addTask|updateTask|useAccount\(\)/);
  });

  test('coordinates are held in a local variable of one request, never in React state', () => {
    // The card's only state is the forecast it displays and the permission state — nothing that could carry a coordinate.
    const states = [...code(CARD).matchAll(/useState<([^>]*)>/g)].map((match) => match[1]);
    assert.deepEqual(states.sort(), ['LocationAccess', 'WeatherSnapshot | null']);
    assert.doesNotMatch(code(CARD), /useRef<[^>]*(number|Location)/);
  });

  test('no app state, schema, migration or sync kind gained a location field', () => {
    for (const file of ['src/domain', 'src/sync', 'src/store'].filter(existsSync).flatMap((dir) => walk(dir))) {
      assert.doesNotMatch(code(file), /deviceLocation|WeatherLocationResult|expo-location/, `${file} knows about device location`);
    }
  });
});

describe('foreground only, no tracking', () => {
  test('the seam never uses a watcher, background, geofence, heading, geocoding or the combined permission API', () => {
    const source = code(SEAM);
    assert.doesNotMatch(
      source,
      /watchPositionAsync|watchHeadingAsync|startLocationUpdatesAsync|startGeofencingAsync|requestBackgroundPermissionsAsync|getBackgroundPermissionsAsync|requestPermissionsAsync|getPermissionsAsync|reverseGeocodeAsync|geocodeAsync|TaskManager|expo-task-manager|Accuracy\.(High|Highest|BestForNavigation)/,
    );
    assert.match(source, /requestForegroundPermissionsAsync/);
    assert.match(source, /getForegroundPermissionsAsync/);
    assert.match(source, /Accuracy\.Low/);
  });

  test('no continuous-location dependency exists', () => {
    const pkg = JSON.parse(read('package.json'));
    const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    assert.ok(dependencies.includes('expo-location'));
    for (const banned of ['expo-task-manager', 'expo-background-fetch', 'expo-background-task', 'react-native-geolocation-service', '@react-native-community/geolocation', 'react-native-background-geolocation', 'react-native-maps', 'expo-maps']) {
      assert.ok(!dependencies.includes(banned), `${banned} must not be a dependency`);
    }
    assert.match(pkg.dependencies['expo-location'], /^~57\./, 'expo-location stays on the SDK 57 line');
  });

  test('no new network provider was introduced for location or weather', () => {
    for (const file of appSources()) {
      assert.doesNotMatch(code(file), /maps\.googleapis|geocode|mapbox|ipapi|ipinfo|ip-api|openweathermap|weather\.gov|open-meteo/i, `${file} names another provider`);
    }
  });
});

describe('the app.json permission intent', () => {
  const app = JSON.parse(read('app.json')).expo;
  const plugin = app.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-location');

  test('expo-location is configured for foreground use only, with the approved copy', () => {
    assert.ok(plugin, 'the expo-location plugin is registered');
    const options = plugin[1];
    assert.equal(
      options.locationWhenInUsePermission,
      "Her Keys uses your approximate location while you're using the app to show local weather and location-aware planning.",
    );
    assert.equal(options.isIosBackgroundLocationEnabled, false);
    assert.equal(options.isAndroidBackgroundLocationEnabled, false);
    assert.equal(options.isAndroidForegroundServiceEnabled, false);
    // `false` removes the plugin's default Always / Motion usage strings from Info.plist.
    assert.equal(options.locationAlwaysAndWhenInUsePermission, false);
    assert.equal(options.locationAlwaysPermission, false);
    assert.equal(options.motionUsagePermission, false);
  });

  test('Android blocks precise location; coarse is all Weather needs', () => {
    assert.deepEqual(app.android.blockedPermissions, ['android.permission.ACCESS_FINE_LOCATION']);
    for (const permission of app.android.permissions ?? []) {
      assert.doesNotMatch(permission, /BACKGROUND_LOCATION|FOREGROUND_SERVICE|ACCESS_FINE_LOCATION/);
    }
  });

  test('every earlier plugin and identifier is preserved', () => {
    assert.deepEqual(
      app.plugins.slice(0, 6).map((entry) => (Array.isArray(entry) ? entry[0] : entry)),
      ['expo-router', 'expo-status-bar', 'expo-apple-authentication', 'expo-secure-store', 'expo-web-browser', 'expo-image-picker'],
    );
    const picker = app.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-image-picker')[1];
    assert.equal(picker.photosPermission, false);
    assert.equal(picker.microphonePermission, false);
    assert.match(picker.cameraPermission, /on-device text recognition/);
    assert.equal(app.ios.bundleIdentifier, 'com.herkeys.app');
    assert.equal(app.android.package, 'com.herkeys.app');
    assert.equal(app.ios.usesAppleSignIn, true);
    assert.equal(app.scheme, 'herkeys');
  });
});

describe('the permission surface Expo actually generates', () => {
  // Resolved through Expo's real config plugins (`expo config --type introspect`), so a plugin that injected a default Always /
  // Motion string or a background mode would fail here even though app.json looks right.
  const introspected = JSON.parse(
    execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--type', 'introspect', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, EXPO_NO_TELEMETRY: '1', CI: '1' },
    }),
  );

  test('iOS: When-In-Use only — no Always, no Motion, no background mode', () => {
    const plist = introspected.ios.infoPlist;
    assert.match(plist.NSLocationWhenInUseUsageDescription, /approximate location while you're using the app/);
    assert.equal(plist.NSLocationAlwaysUsageDescription, undefined);
    assert.equal(plist.NSLocationAlwaysAndWhenInUseUsageDescription, undefined);
    assert.equal(plist.NSMotionUsageDescription, undefined);
    assert.ok(!(plist.UIBackgroundModes ?? []).includes('location'));
  });

  test('Android: coarse location only — no fine, no background, no foreground-service location', () => {
    const permissions = introspected.android.permissions;
    assert.ok(permissions.includes('android.permission.ACCESS_COARSE_LOCATION'));
    for (const banned of [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.ACTIVITY_RECOGNITION',
    ]) {
      assert.ok(!permissions.includes(banned), `${banned} must not be requested`);
    }
    assert.ok(introspected.android.blockedPermissions.includes('android.permission.ACCESS_FINE_LOCATION'));
  });
});

describe('the provider boundary is unchanged', () => {
  test('WeatherKit credentials stay server-only and weather-context stays JWT-verified', () => {
    assert.doesNotMatch(read('.env.example'), /WEATHERKIT_/);
    assert.match(read('supabase/config.toml'), /\[functions\.weather-context\][\s\S]*?verify_jwt\s*=\s*true/);
    assert.doesNotMatch(read('src/platform/externalIntelligenceClient.ts'), /WEATHERKIT|weatherkit\.apple\.com/i);
  });

  test('attribution survives the card rewrite', () => {
    const card = code(CARD);
    assert.match(card, /providerLogo/);
    assert.match(card, /attributionURL/);
    assert.match(card, /Weather sources/);
    assert.match(card, /providerName/);
    assert.match(card, /Weather · Near you/);
  });
});
