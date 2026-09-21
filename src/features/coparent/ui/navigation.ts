import { router } from 'expo-router';

/**
 * The one route this feature lives at. Every view is this pathname with different params, so a push always adds a new stack entry
 * and Back returns to the view she came from. (Typed routes are not enabled; the pathname is a plain string.)
 */
const PATHNAME = '/life/coparent';

export function openView(params: Record<string, string>): void {
  router.push({ pathname: PATHNAME, params });
}

/** Back to where she came from; with nothing to go back to (a link opened this view directly), to the hub. */
export function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace({ pathname: PATHNAME });
}
