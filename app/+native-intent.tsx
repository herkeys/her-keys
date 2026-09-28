import { routerPathForIncomingLink } from '../src/platform/systemLinks';

/**
 * System links, before Expo Router sees them. Only the two OAuth returns are
 * intercepted — the Google identity callback (`herkeys://auth/callback`) and the
 * Google Calendar return (`herkeys://calendar-connected`). Each belongs to its
 * auth session, not to a screen. See `routerPathForIncomingLink`.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    return routerPathForIncomingLink(path);
  } catch {
    return path;
  }
}
