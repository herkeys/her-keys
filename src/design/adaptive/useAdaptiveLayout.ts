import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeAdaptiveLayout, type AdaptiveLayout } from './sizeClass';

/**
 * The live adaptive layout for the window this component is rendered in.
 *
 * Presentation only: it reads the window size, the font scale and the safe-area insets, and returns geometry. It owns no state,
 * starts no effect, and never touches accounts, households, purchases or sessions, so a resize, rotation, fold or unfold can
 * only change how things are laid out, never what they are. The result is memoized on its inputs, so consumers re-render
 * only when the window actually changed.
 */
export function useAdaptiveLayout(): AdaptiveLayout {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return useMemo(
    () => computeAdaptiveLayout(Platform.OS, { width, height, fontScale, insets }),
    [width, height, fontScale, insets.top, insets.right, insets.bottom, insets.left], // eslint-disable-line react-hooks/exhaustive-deps
  );
}
