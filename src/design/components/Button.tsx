import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { color, elevation, interaction, radius, sizing, spacing } from '../tokens';
import { AppText } from './AppText';

/**
 * The one button system. Variants:
 * - primary   — the one action a surface wants her to take
 * - secondary — a real alternative, visually quiet but present
 * - ghost     — a low-commitment action ("Start over", "Show another option")
 *
 * HK-FE-UI-02 primary recipe (spec §7): a predominantly Berry Plum pill with
 *   - a 1px OPAQUE top-edge highlight (Berry blended toward white), drawn as an inset line so the pill rounding stays
 *     clean on both platforms;
 *   - a 1px darker-plum lower edge (the border colour), full pill rounding;
 *   - a small Berry-tinted lift (`elevation.button`);
 *   - white text (5.37:1 on Berry, 7.17:1 when pressed);
 *   - a pressed state that darkens the FILL rather than only dimming it.
 * There is no gradient and no translucent layer, so the static non-gradient fallback and the reduced-transparency rendering
 * are the same thing. Luxury Black is deliberately absent from buttons.
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
        size === 'sm' && Platform.OS === 'android' ? styles.androidSmallTarget : null,
        variantStyles[variant],
        disabled ? (variant === 'ghost' ? styles.disabledGhost : styles.disabled) : null,
        pressed && !disabled ? (variant === 'primary' ? styles.pressedPrimary : styles.pressed) : null,
        style,
      ]}
    >
      {variant === 'primary' && !disabled ? <View pointerEvents="none" style={styles.highlight} /> : null}
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
  if (variant === 'secondary') return color.action.primary; // Berry on white = 5.37:1
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
  // Android's minimum touch target is 48dp; keep compact iOS/web sizing intact.
  androidSmallTarget: { minHeight: sizing.control.height },
  pressed: { opacity: interaction.pressedOpacity },
  pressedPrimary: { backgroundColor: color.action.primaryPressed },
  disabled: {
    backgroundColor: color.action.disabled,
    borderColor: color.action.disabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  disabledGhost: { backgroundColor: 'transparent' },
  /** Inset so the 1px line follows the pill's flat top and never touches the rounded ends. */
  highlight: {
    position: 'absolute',
    top: 0,
    left: spacing.lg,
    right: spacing.lg,
    height: 1,
    backgroundColor: color.action.primaryHighlight,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: color.action.primary,
    borderWidth: 1,
    borderColor: color.action.primaryPressed,
    ...elevation.button,
  },
  secondary: {
    backgroundColor: color.surface.primary,
    borderWidth: 1,
    borderColor: color.action.primaryBorder,
  },
  ghost: { backgroundColor: 'transparent' },
});
