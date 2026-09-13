import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../tokens';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  accessibilityHint,
  style,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sizeSm : styles.sizeMd,
        variantStyles[variant],
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      <AppText variant={size === 'sm' ? 'caption' : 'bodyStrong'} color={textColor(variant)}>
        {label}
      </AppText>
    </Pressable>
  );
}

function textColor(variant: Variant): string {
  if (variant === 'primary') return colors.textInverse;
  if (variant === 'secondary') return colors.accent;
  return colors.textSecondary;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeMd: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl, minHeight: 50 },
  // Still meets the 44px touch-target guideline at the smaller size.
  sizeSm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 44 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.35 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentBorder },
  ghost: { backgroundColor: 'transparent' },
});
