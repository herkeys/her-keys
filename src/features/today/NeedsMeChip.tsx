import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from '../../design/components';
import { color, interaction, radius, sizing, spacing } from '../../design/tokens';
import type { OnYourMind } from './model';

/**
 * A bounded pointer to the Needs Me inbox — a count and the oldest open item, never a
 * growing list on Today. Deliberately labeled "On your mind" rather than "Needs Me," so it
 * doesn't read as another "Needs you" card.
 *
 * The Today view model decides whether it appears and what it says (captured items that are
 * due today are rows in the attention block instead), so the chip only presents.
 */
export function NeedsMeChip({ onYourMind }: { onYourMind: OnYourMind }) {
  const { count, oldestTitle } = onYourMind;
  return (
    <Pressable
      onPress={() => router.push('/life/needs-me')}
      accessibilityRole="button"
      accessibilityLabel={`On your mind: ${count} captured, starting with ${oldestTitle}`}
      accessibilityHint="Opens the list of things you’ve captured"
      style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
    >
      <AppText variant="supporting" color={color.text.secondary}>
        On your mind: {oldestTitle}
        {count > 1 ? ` (+${count - 1} more)` : ''}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: color.surface.secondary,
    minHeight: sizing.minTouchTarget,
    justifyContent: 'center',
  },
  pressed: { opacity: interaction.pressedOpacity },
});
