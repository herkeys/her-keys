import { routerPathForSystemLink } from './googleIdentityOAuth';

/**
 * Incoming system links, before Expo Router sees them (app/+native-intent.tsx).
 *
 * Two OAuth returns belong to an in-app auth session, never to a screen:
 * - Google identity: `herkeys://auth/callback` (googleIdentityOAuth.ts)
 * - Google Calendar: `herkeys://calendar-connected` (useGoogleCalendarBridge.ts)
 *
 * On iOS, ASWebAuthenticationSession captures its return URL and the router never sees it. On Android the auth session is a
 * Custom Tab and learns of the return through `Linking`, so the SAME URL also reaches the router — which has no screen for
 * either route and would show Expo Router's "Unmatched Route" page on top of the app. Telling the router to stay where it is
 * (`null`) makes Android end where iOS ends. The auth session's own `Linking` listener still receives the URL, so the connection
 * result is unaffected. Every other link passes through unchanged and is still checked by the route guards.
 */

/** The Calendar return route. The Calendar OAuth Edge Function sends the app here; it is not a screen. */
export const CALENDAR_CONNECTED_RETURN = 'herkeys://calendar-connected';

/**
 * Exact match on scheme `herkeys`, host `calendar-connected`, no path — or the router's own path form (`/calendar-connected`).
 * Parsed by hand, like the identity callback, so both platforms behave identically.
 */
export function isCalendarConnectedReturn(url: string): boolean {
  const end = url.search(/[?#]/);
  const base = (end === -1 ? url : url.slice(0, end)).toLowerCase();
  return (
    base === CALENDAR_CONNECTED_RETURN ||
    base === `${CALENDAR_CONNECTED_RETURN}/` ||
    base === '/calendar-connected' ||
    base === 'calendar-connected' ||
    base === '/calendar-connected/'
  );
}

/**
 * V2UP-SEC-01 (dependency advisory, mitigated in source). Expo Router parses an incoming link's query with `query-string`, which uses
 * `decode-uri-component@0.2.2` — advisory GHSA-vcc3-ghjq-m6fr: CPU denial of service from malformed percent-encoding. The fix is a major
 * Expo Router upgrade, which this pass does not make. This is the ONE place every external link passes before the router parses it, so
 * it refuses what exploits that: a link whose percent-encoding is not valid (a lone '%', or escapes that are not well-formed UTF-8 such
 * as a run of '%E0'), and an absurdly long link. Measured against the installed version: 1,025 characters of '%E0' took the parser
 * 7.1 s and 2,048 took 28.7 s, while the native `decodeURIComponent` rejects the same input in well under a millisecond (linear time) and
 * every valid link parses in under a millisecond. No link Her Keys sends or expects looks like either shape (OAuth returns and route paths
 * are short and well-formed), so refusing is safe: the router stays where it is.
 */
export const MAX_INCOMING_LINK_LENGTH = 2048;

export function isUnparseableLink(url: string): boolean {
  // Length first, so nothing is ever run over an attacker-sized string.
  if (url.length > MAX_INCOMING_LINK_LENGTH) return true;
  try {
    decodeURIComponent(url);
    return false;
  } catch {
    return true;
  }
}

/** What Expo Router should open for an incoming system link; `null` keeps the current screen. */
export function routerPathForIncomingLink(path: string): string | null {
  if (isUnparseableLink(path)) return null;
  if (routerPathForSystemLink(path) === null) return null;
  if (isCalendarConnectedReturn(path)) return null;
  return path;
}
