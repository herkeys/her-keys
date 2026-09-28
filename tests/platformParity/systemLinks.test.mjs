import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

/**
 * PP-D01 — Android must end where iOS ends after an OAuth return.
 *
 * iOS's ASWebAuthenticationSession captures its return URL; Android's Custom Tab auth session learns of it through `Linking`, so
 * the same URL ALSO reaches Expo Router. Before this repair the Google Calendar return (`herkeys://calendar-connected`) passed
 * through to the router, which has no such screen, so Android showed Expo Router's "Unmatched Route" page (with a Sitemap link)
 * on top of Calendar after every successful connection. These tests run the real `+native-intent` hook.
 */

const { redirectSystemPath } = await import('../../app/+native-intent.tsx');
const { CALENDAR_CONNECTED_RETURN, isCalendarConnectedReturn, routerPathForIncomingLink } = await import(
  '../../src/platform/systemLinks.ts'
);

const read = (path) => readFileSync(path, 'utf8');

describe('PP-D01: OAuth returns never reach the router, on either platform', () => {
  const swallowed = [
    'herkeys://calendar-connected',
    'herkeys://calendar-connected?status=connected',
    'herkeys://calendar-connected?status=error&reason=access_denied',
    'herkeys://calendar-connected/',
    'HERKEYS://calendar-connected?status=connected',
    'herkeys://calendar-connected#x',
    '/calendar-connected?status=connected',
    'calendar-connected',
    'herkeys://auth/callback?code=abc',
    '/auth/callback?code=abc',
  ];

  for (const url of swallowed) {
    test(`the router stays where it is for ${url} (cold start and warm)`, () => {
      assert.equal(redirectSystemPath({ path: url, initial: true }), null);
      assert.equal(redirectSystemPath({ path: url, initial: false }), null);
    });
  }

  test('every other link passes through unchanged, so the route guards still decide', () => {
    for (const url of [
      'herkeys://today',
      '/today',
      'herkeys://sign-in',
      'herkeys://calendar',
      '/calendar',
      'herkeys://calendar-connectedX?status=connected',
      'herkeys://calendar-connected/extra',
      'herkeys://auth/callbackX?code=1',
      'https://evil.example/calendar-connected',
    ]) {
      assert.equal(redirectSystemPath({ path: url, initial: false }), url, url);
      assert.equal(routerPathForIncomingLink(url), url, url);
    }
  });

  test('the Calendar return is recognised exactly, not by prefix', () => {
    assert.equal(isCalendarConnectedReturn('herkeys://calendar-connected?status=connected'), true);
    assert.equal(isCalendarConnectedReturn('herkeys://calendar-connectedX'), false);
    assert.equal(isCalendarConnectedReturn('herkeys://calendar/connected'), false);
    assert.equal(isCalendarConnectedReturn('https://fhhudicklmpofuzkxeqe.supabase.co/functions/v1/calendar-oauth'), false);
  });

  test('the route the hook swallows is the route the Calendar bridge and Edge Function actually use', () => {
    assert.equal(CALENDAR_CONNECTED_RETURN, 'herkeys://calendar-connected');
    assert.match(read('src/features/calendar/useGoogleCalendarBridge.ts'), /const HER_KEYS_CALENDAR_REDIRECT_URI = 'herkeys:\/\/calendar-connected';/);
    assert.match(read('supabase/functions/calendar-oauth/index.ts'), /'herkeys:\/\/calendar-connected'/);
  });

  test('no screen exists for either OAuth return, so passing one through would be an Unmatched Route', () => {
    for (const file of ['app/calendar-connected.tsx', 'app/auth/callback.tsx', 'app/+not-found.tsx']) {
      assert.throws(() => read(file), /ENOENT/, `${file} exists; revisit PP-D01 before removing the router guard`);
    }
  });

  test('the identity module still never names the Calendar route (separation kept)', () => {
    const identity = read('src/platform/googleIdentityOAuth.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(identity, /calendar-connected/);
  });
});
