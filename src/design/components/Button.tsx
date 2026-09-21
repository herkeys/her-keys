import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { color, interaction, radius, sizing, spacing } from '../tokens';
import { AppText } from './AppText';

/**
 * The one button system. Variants:
 * - primary   — the one action a surface wants her to take
 * - secondary — a real alternative, visually quiet but present
 * - ghost     — a low-commitment action ("Start over", "Show another option")
 *
 * Disabled is a real color pair (action.disabled), not lowered opacity:
 * an unreadable disabled button still frustrates, and the WCAG exemption for
 * inactive components is a floor, not a target.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
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
        disabled ? (variant === 'ghost' ? styles.disabledGhost : styles.disabled) : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      <AppText
        variant={size === 'sm' ? 'metadata' : 'actionLabel'}
        color={disabled ? color.action.disabledText : textColor(variant)}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function textColor(variant: ButtonVariant): string {
  if (variant === 'primary') return color.text.inverse;
  if (variant === 'secondary') return color.action.primary;
  return color.text.secondary;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeMd: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: sizing.control.height,
  },
  // Still meets the 44px touch-target guideline at the smaller size.
  sizeSm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: sizing.control.heightSmall,
  },
  pressed: { opacity: interaction.pressedOpacity },
  disabled: { backgroundColor: color.action.disabled },
  disabledGhost: { backgroundColor: 'transparent' },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: color.action.primary },
  secondary: {
    backgroundColor: color.surface.primary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.action.primaryBorder,
  },
  ghost: { backgroundColor: 'transparent' },
});
