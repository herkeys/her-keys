import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from '../../design/components';
import { colors, interaction, radius, spacing } from '../../design/tokens';
import { useHouseholdState } from '../../store/AppStateProvider';

/**
 * A bounded pointer to the Needs Me inbox — a count and the oldest open item,
 * never a growing list on Today. Deliberately labeled "On your mind" rather
 * than "Needs Me," so it doesn't read as another "Needs you" card.
 */
export function NeedsMeChip() {
  const { state } = useHouseholdState();
  const open = state.needsMe.filter((item) => item.status === 'open').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (open.length === 0) return null;

  return (
    <Pressable
      onPress={() => router.push('/life/needs-me')}
      accessibilityRole="button"
      accessibilityLabel={`On your mind: ${open.length} captured, starting with ${open[0].title}`}
      style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
    >
      <AppText variant="bodySm" color={colors.textSecondary}>
        On your mind: {open[0].title}
        {open.length > 1 ? ` (+${open.length - 1} more)` : ''}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: spacing.xxl,
  },
  pressed: { opacity: interaction.pressedOpacity },
});
