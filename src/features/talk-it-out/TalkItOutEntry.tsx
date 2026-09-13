import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { AppText, Overline } from '../../design/components';
import { colors, radius, spacing } from '../../design/tokens';

/**
 * Inline entry point rather than a floating button: an overlay pill covered
 * card text at rest, and Her Keys AI already sits permanently in the tab bar.
 * This keeps a contextual way in without adding chrome on top of content.
 */
export function TalkItOutEntry() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Talk it out with Her Keys"
      accessibilityHint="Start a conversation without knowing what is wrong"
      onPress={() => router.push('/talk-it-out')}
      style={({ pressed }) => [styles.surface, pressed ? styles.pressed : null]}
    >
      <Overline color={colors.accent}>Talk it out</Overline>
      <AppText variant="body" color={colors.textSecondary} style={styles.copy}>
        Something feel off that isn’t on this list? Tell Her Keys what’s going on.
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    marginTop: spacing.xxl,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    minHeight: 44,
  },
  copy: { marginTop: spacing.sm },
  pressed: { opacity: 0.75 },
});
