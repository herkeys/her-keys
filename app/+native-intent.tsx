import { routerPathForSystemLink } from '../src/platform/googleIdentityOAuth';

/**
 * System links, before Expo Router sees them. Only the Google identity OAuth
 * return (`herkeys://auth/callback`) is intercepted — it belongs to the auth
 * session, not to a screen. See `routerPathForSystemLink`.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    return routerPathForSystemLink(path);
  } catch {
    return path;
  }
}
