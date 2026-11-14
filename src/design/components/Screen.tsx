import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { sizing, spacing } from '../tokens';
import { createThemedStyles } from '../theme';
import { iPadReadableColumn } from '../readableColumn';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /**
   * Clearance below the content when no tab bar is present (onboarding, consent, sign-in, modals). The system bottom inset (gesture
   * bar or three-button bar) is always added, so the last control never sits under system chrome.
   */
  bottomClearance?: number;
}

/**
 * The application screen shell: safe areas, app background, margins, scroll
 * convention. The tab bar owns 68pt + system inset; scrollable screens pad
 * past it so the last row is never trapped underneath.
 */
export function Screen({ children, scroll = true, bottomClearance }: ScreenProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const bottom = (bottomClearance ?? spacing.xxxl + 68) + insets.bottom;
  // iPad only (IOS-FIX-002): the non-scrolling body gets the same readable-width cap the scroll content already has. `null` on
  // iPhone and Android, where nothing is added to the style array.
  const column = iPadReadableColumn();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottom }]}
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
