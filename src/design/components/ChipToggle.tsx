import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../tokens';
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
      <AppText variant="body" color={selected ? colors.textInverse : colors.textPrimary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { opacity: 0.75 },
});
