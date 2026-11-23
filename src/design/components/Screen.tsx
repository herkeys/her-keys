import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { sizing, spacing } from '../tokens';
import { createThemedStyles } from '../theme';
import { readableColumnFor } from '../readableColumn';
import { tabChromeClearance, useAdaptiveLayout } from '../adaptive';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /**
   * Clearance below the content when no tab bar is present (onboarding, consent, sign-in, modals). The system bottom inset (gesture
   * bar or three-button bar) is always added, so the last control never sits under system chrome.
   */
  bottomClearance?: number;
  /**
   * Build 5: the screen lays out a two-pane workspace (`AdaptiveSplit`). When the window can hold two panes the scroll content may
   * grow to the workspace width; otherwise it keeps the readable measure. No effect on compact or medium windows.
   */
  workspace?: boolean;
}

/**
 * The application screen shell: safe areas, app background, margins, scroll
 * convention. A bottom tab bar owns 68pt + system inset; scrollable screens pad
 * past it so the last row is never trapped underneath. With sidebar navigation
 * (Build 5, expanded iOS windows) nothing owns the bottom edge but the system inset.
 *
 * Horizontal safe areas come from the native `SafeAreaView` (left and right edges, measured for THIS view), so an
 * asymmetric inset (an iPhone Duo navigation rail, a landscape sensor housing, a Split View edge) pads only its own side.
 */
export function Screen({ children, scroll = true, bottomClearance, workspace = false }: ScreenProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const layout = useAdaptiveLayout();
  const bottom = (bottomClearance ?? spacing.xxxl + tabChromeClearance(layout.navigation)) + insets.bottom;
  // Wider than compact (iOS): the non-scrolling body gets the same readable-width cap the scroll content already has. `null` on
  // compact windows and on Android, where nothing is added to the style array.
  const column = readableColumnFor(layout);
  const wide = workspace && layout.twoPane;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={
            wide ? [styles.scrollContent, { paddingBottom: bottom, maxWidth: layout.contentMaxWidth }] : [styles.scrollContent, { paddingBottom: bottom }]
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // iOS draws the keyboard over the app instead of resizing it (Android's adjustResize does). This iOS-only prop (not in
          // Android's native view config) adds the overlap as a bottom inset and scrolls the focused field into view.
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
      ) : (
        <View style={column ? [styles.flex, column, { paddingBottom: bottom }] : [styles.flex, { paddingBottom: bottom }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles(({ color }) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.background },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: sizing.screenMargin,
    paddingTop: spacing.xl,
    flexGrow: 1,
    // Readability cap: on tablets and foldables the measure stays book-width
    // and centered instead of stretching edge to edge.
    maxWidth: sizing.contentWidth,
    width: '100%',
    alignSelf: 'center',
  },
}));
