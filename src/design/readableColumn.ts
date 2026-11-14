import { Platform, type ViewStyle } from 'react-native';
import { sizing } from './tokens';

/**
 * iPad readable column (IOS-FIX-002). On an iPad the app's window can be 1,366pt wide (13-inch, landscape), so a surface that is not
 * already inside the scrolling `Screen` cap stretches its text, bubbles and buttons edge to edge. This caps those surfaces at the
 * existing `sizing.contentWidth` (the same 680pt book-width the scrolling `Screen` already uses on every platform) and centers them.
 *
 * Scope is deliberately iPad-only: `Platform.isPad` exists only on iOS and is true only for the iPad idiom. iPhone (always narrower
 * than 680pt) and Android return `null`, so callers add NOTHING to their style arrays there and their rendering is unchanged. It is
 * a cap, not a fixed width: a narrow Split View, Slide Over or Stage Manager window still gets the full window width.
 */
export const IPAD_READABLE_COLUMN: Readonly<ViewStyle> = Object.freeze({
  width: '100%',
  maxWidth: sizing.contentWidth,
  alignSelf: 'center',
});

type PlatformLike = { OS: string; isPad?: boolean };

export function isIPad(platform: PlatformLike = Platform as PlatformLike): boolean {
  return platform.OS === 'ios' && platform.isPad === true;
}

/** The column style on an iPad; `null` everywhere else. */
export function iPadReadableColumn(platform: PlatformLike = Platform as PlatformLike): Readonly<ViewStyle> | null {
  return isIPad(platform) ? IPAD_READABLE_COLUMN : null;
}
