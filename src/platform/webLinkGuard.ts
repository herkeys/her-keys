import { isUnparseableLink } from './incomingLinkSafety';

interface BrowserLinkSurface {
  location: { pathname: string; search: string; hash: string; replace(url: string): void };
  history: { replaceState(data: unknown, unused: string, url: string): void };
  addEventListener(type: string, handler: (event: { stopImmediatePropagation(): void }) => void, capture: boolean): void;
}

/**
 * Expo's native-intent hook is not called for web cold starts. Run this BEFORE
 * loading Router, so a malformed browser query never reaches query-string.
 * Native and server export environments have no document and remain untouched.
 */
export function installWebLinkGuard(browser: BrowserLinkSurface | null =
  typeof window !== 'undefined' && typeof document !== 'undefined' ? window : null,
): boolean {
  if (browser === null) return true;
  const unsafe = () => isUnparseableLink(browser.location.pathname + browser.location.search + browser.location.hash);
  try {
    if (unsafe()) browser.history.replaceState(null, '', '/');
    // If sanitizing failed, do not load Router while navigation is pending.
    if (unsafe()) { browser.location.replace('/'); return false; }
  } catch {
    try { browser.location.replace('/'); } catch { /* Router stays unloaded. */ }
    return false;
  }
  const guard = (event: { stopImmediatePropagation(): void }) => {
    if (!unsafe()) return;
    // A previously stored hostile URL can return through browser history or a
    // fragment change. Stop Router's listeners and recover with a clean reload.
    event.stopImmediatePropagation();
    try { browser.location.replace('/'); } catch { /* Rejected before parsing. */ }
  };
  browser.addEventListener('popstate', guard, true);
  browser.addEventListener('hashchange', guard, true);
  return true;
}
