import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

  test('app config does not add APNs or exact-alarm configuration for a local-only reminder', () => {
    const app = JSON.parse(readFileSync('app.json', 'utf8'));
    assert.equal(app.expo.plugins.includes('expo-notifications'), false);
    assert.doesNotMatch(JSON.stringify(app), /SCHEDULE_EXACT_ALARM|aps-environment/);
  });

  test('the native module is nevertheless a locked application dependency', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    assert.equal(pkg.dependencies['expo-notifications'], '~57.0.20');
    assert.equal(lock.packages[''].dependencies['expo-notifications'], '~57.0.20');
    assert.equal(lock.packages['node_modules/expo-notifications'].version, '57.0.20');
  });
});
