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

/** What Expo Router should open for an incoming system link; `null` keeps the current screen. */
export function routerPathForIncomingLink(path: string): string | null {
  if (routerPathForSystemLink(path) === null) return null;
  if (isCalendarConnectedReturn(path)) return null;
  return path;
}
