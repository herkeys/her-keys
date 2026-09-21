import { Pressable, StyleSheet } from 'react-native';
import { color, interaction, radius, sizing, spacing } from '../tokens';
import { AppText } from './AppText';

interface ChipToggleProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function ChipToggle({ label, selected, onPress }: ChipToggleProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.chip, selected ? styles.chipSelected : null, pressed ? styles.pressed : null]}
    >
      <AppText variant="body" color={selected ? color.text.inverse : color.text.primary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: sizing.control.height,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.default,
    backgroundColor: color.surface.primary,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipSelected: { backgroundColor: color.action.primary, borderColor: color.action.primary },
  pressed: { opacity: interaction.pressedOpacity },
});
