import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, sizing, spacing } from '../tokens';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Extra clearance at the bottom when no tab bar is present (e.g. modals). */
  bottomClearance?: number;
}

/**
 * The application screen shell: safe areas, app background, margins, scroll
 * convention. The tab bar owns 68pt + system inset; scrollable screens pad
 * past it so the last row is never trapped underneath.
 */
export function Screen({ children, scroll = true, bottomClearance }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottom = bottomClearance ?? spacing.xxxl + 68 + insets.bottom;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, { paddingBottom: bottom }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.background },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: sizing.screenMargin,
    paddingTop: spacing.xl,
    flexGrow: 1,
  },
});
