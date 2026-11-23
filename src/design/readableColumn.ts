import type { ViewStyle } from 'react-native';
import { sizing } from './tokens';
import type { AdaptiveLayout } from './adaptive/sizeClass';

/**
 * Readable column for surfaces that are NOT inside the scrolling `Screen` cap (the AI chat, Talk It Out, the non-scrolling
 * `Screen` body, `Sheet`). A wide window — a full-screen iPad, an iPhone Duo inner display — would otherwise stretch their text,
 * bubbles and buttons edge to edge.
 *
 * Build 5 replaces the IOS-FIX-002 `Platform.isPad` predicate with the window itself: the cap applies whenever the adaptive layout
 * says the window is wider than compact (`bodyColumnMaxWidth`), on any iOS device, and never on a compact window or on Android —
 * exactly the surfaces that rendered unchanged before. It is a cap, not a width: a narrow Split View, Slide Over or Stage Manager
 * window still uses its full width.
 */
export const READABLE_COLUMN: Readonly<ViewStyle> = Object.freeze({
  width: '100%',
  maxWidth: sizing.contentWidth,
  alignSelf: 'center',
});

/** The column style for this layout, or `null` (callers add nothing to their style arrays). */
export function readableColumnFor(layout: Pick<AdaptiveLayout, 'bodyColumnMaxWidth'>): Readonly<ViewStyle> | null {
  if (layout.bodyColumnMaxWidth === null) return null;
  return layout.bodyColumnMaxWidth === sizing.contentWidth ? READABLE_COLUMN : { ...READABLE_COLUMN, maxWidth: layout.bodyColumnMaxWidth };
}
