import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  ANDROID_PACKAGE, APPLE_SUBSCRIPTIONS_URL, GOOGLE_SUBSCRIPTIONS_URL, openSubscriptionManagement, subscriptionManagementUrl,
} from '../../src/monetization/subscriptionManagement.ts';

describe('the platform subscription-management destination', () => {
  test('iOS opens the App Store subscriptions screen; Android opens Google Play subscriptions for THIS app', () => {
    assert.equal(subscriptionManagementUrl('ios'), 'https://apps.apple.com/account/subscriptions');
    assert.equal(subscriptionManagementUrl('android'), `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`);
    assert.equal(subscriptionManagementUrl('android'), GOOGLE_SUBSCRIPTIONS_URL);
    assert.equal(subscriptionManagementUrl('ios'), APPLE_SUBSCRIPTIONS_URL);
  });
  test('the Android package is the shipping application id in app.json, so a release-identity change cannot strand it', () => {
    const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
    assert.equal(appJson.expo.android.package, ANDROID_PACKAGE);
  });
  test('only the two store platforms have a destination; both are https store pages with no account data in the URL', () => {
    assert.equal(subscriptionManagementUrl('web'), null);
    assert.equal(subscriptionManagementUrl('windows'), null);
    for (const url of [APPLE_SUBSCRIPTIONS_URL, GOOGLE_SUBSCRIPTIONS_URL]) {
      assert.match(url, /^https:\/\/(apps\.apple\.com|play\.google\.com)\//);
      assert.doesNotMatch(url, /[0-9a-f]{8}-[0-9a-f]{4}|@|token|email|user/i);
    }
  });
});

describe('opening it', () => {
  test('opens exactly the platform URL once and reports it', async () => {
    const opened = [];
    for (const os of ['ios', 'android']) {
      assert.equal(await openSubscriptionManagement({ os, openURL: async (url) => { opened.push(url); } }), 'opened');
    }
    assert.deepEqual(opened, [APPLE_SUBSCRIPTIONS_URL, GOOGLE_SUBSCRIPTIONS_URL]);
  });
  test('a failure to open is a calm "unavailable", never a throw', async () => {
    assert.equal(await openSubscriptionManagement({ os: 'ios', openURL: async () => { throw new Error('no handler'); } }), 'unavailable');
  });
  test('where there is no store it opens nothing', async () => {
    let called = 0;
    assert.equal(await openSubscriptionManagement({ os: 'web', openURL: async () => { called += 1; } }), 'unavailable');
    assert.equal(called, 0);
  });
});
