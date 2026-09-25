import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, test } from 'node:test';

describe('local notification architecture boundary', () => {
  test('the refinement has no push-token or global-cancellation path', () => {
    const source = readFileSync('src/platform/localNotifications.ts', 'utf8');
    assert.doesNotMatch(source, /getDevicePushTokenAsync|getExpoPushTokenAsync|setAutoServerRegistrationEnabledAsync/);
    assert.doesNotMatch(source, /cancelAllScheduledNotificationsAsync/);
  });

  test('the OS permission request exists only behind the explicit enable action', () => {
    const source = readFileSync('src/store/LocalNotificationProvider.tsx', 'utf8');
    const enableAt = source.indexOf('const enable = useCallback');
    const requestAt = source.indexOf('requestLocalNotificationPermission();');
    assert.ok(enableAt >= 0);
    assert.ok(requestAt > enableAt, 'permission request must remain inside the explicit enable action');
    assert.equal(source.indexOf('requestLocalNotificationPermission();', requestAt + 1), -1);
  });

  test('the expo-notifications plugin is registered plain, and adds no remote-push behavior or exact alarm to a local-only reminder', () => {
    const app = JSON.parse(readFileSync('app.json', 'utf8'));
    // Registered as the bare string: no options, so no background remote-notification mode, custom sound or icon is configured.
    assert.ok(app.expo.plugins.includes('expo-notifications'), 'the plugin resolves the native notification module');
    assert.doesNotMatch(JSON.stringify(app), /SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM|enableBackgroundRemoteNotifications|remote-notification/);

    // What Expo really generates (real config plugins, not just app.json).
    const resolved = JSON.parse(
      execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--type', 'introspect', '--json'], {
        encoding: 'utf8',
        env: { ...process.env, EXPO_NO_TELEMETRY: '1', CI: '1' },
      }),
    );
    assert.ok(!(resolved.ios.infoPlist.UIBackgroundModes ?? []).includes('remote-notification'), 'no background remote-notification mode');
    // The plugin always declares the APNs capability entitlement (development value). It is a capability, not a behavior: nothing in
    // the app registers a push token or receives a remote push (asserted below), so delivery stays device-local.
    assert.equal(resolved.ios.entitlements['aps-environment'], 'development');
    assert.doesNotMatch(JSON.stringify(resolved.android), /SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM/);
  });

  test('no application source registers for or handles remote push', () => {
    const walk = (dir) => readdirSync(dir).flatMap((name) => {
      const path = `${dir}/${name}`;
      return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
    for (const file of [...walk('src'), ...walk('app')]) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        /getDevicePushTokenAsync|getExpoPushTokenAsync|setAutoServerRegistrationEnabledAsync|registerTaskAsync|addPushTokenListener/,
        `${file} touches remote push`,
      );
    }
  });

  test('the native module is nevertheless a locked application dependency', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    // The SDK-57 line, kept in step with what `expo install --check` expects; the lock must agree with package.json.
    assert.match(pkg.dependencies['expo-notifications'], /^~57\.0\.\d+$/);
    assert.equal(lock.packages[''].dependencies['expo-notifications'], pkg.dependencies['expo-notifications']);
    assert.match(lock.packages['node_modules/expo-notifications'].version, /^57\.0\.\d+$/);
  });

  test('there is no remote push backend, dependency or scheduling path: reminders are device-local DATE triggers only', () => {
    // No push function exists in the backend, and none of the push/FCM/APNs SDKs or endpoints appear in app, backend or dependencies.
    const functions = readdirSync('supabase/functions').filter((name) => statSync(`supabase/functions/${name}`).isDirectory());
    assert.deepEqual(functions.sort(), ['_shared', 'calendar-data', 'calendar-oauth', 'weather-context']);
    const walk = (dir) => readdirSync(dir).flatMap((name) => {
      const path = `${dir}/${name}`;
      return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
    for (const file of [...walk('src'), ...walk('app'), ...walk('supabase/functions')]) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        /exp\.host|expo-server-sdk|fcm\.googleapis|firebase-admin|apns|PushNotificationTrigger|addPushTokenListener|registerForPushNotificationsAsync/i,
        `${file} references a remote push path`,
      );
    }
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      assert.doesNotMatch(name, /^(expo-server-sdk|firebase(-admin)?|@react-native-firebase\/.*|react-native-push-notification|@notifee\/.*|onesignal.*|react-native-onesignal)$/, `${name} is a push dependency`);
    }
    // The one scheduler uses a local DATE trigger — never a push or a location/geofence trigger.
    const scheduler = readFileSync('src/platform/localNotifications.ts', 'utf8');
    assert.equal((scheduler.match(/scheduleNotificationAsync\(/g) ?? []).length, 1);
    assert.match(scheduler, /SchedulableTriggerInputTypes\.DATE/);
    assert.doesNotMatch(scheduler, /SchedulableTriggerInputTypes\.(TIME_INTERVAL|CALENDAR|DAILY|WEEKLY|YEARLY)|PushNotificationTrigger|LocationNotificationTrigger/);
  });
});
