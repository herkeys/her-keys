import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { AppText } from '../../design/components';
import { color, interaction, radius, sizing, spacing } from '../../design/tokens';
import { METHOD_LABELS } from './copy';
import type { WelcomeAuthMethod } from './model';

const METHOD_ICONS: Record<WelcomeAuthMethod, keyof typeof Ionicons.glyphMap> = {
  apple: 'logo-apple',
  google: 'logo-google',
  email: 'mail-outline',
};

export interface ProviderButtonProps {
  method: WelcomeAuthMethod;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * One provider choice. It reads as part of the one button system — the
 * secondary treatment (paper, control boundary, pill) with the provider's
 * mark added so the methods are told apart without leaving the design
 * language. The label always carries the full provider name, so the
 * accessible announcement never depends on the icon.
 *
 * Presentational only: no auth behavior lives in this control.
 */
export function ProviderButton({ method, onPress, disabled, style }: ProviderButtonProps) {
  const label = METHOD_LABELS[method];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
        <Ionicons
          name={METHOD_ICONS[method]}
          size={sizing.icon.md}
          color={disabled ? color.action.disabledText : color.text.primary}
        />
      </View>
      <AppText variant="actionLabel" color={disabled ? color.action.disabledText : color.text.primary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: sizing.control.height,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: color.surface.primary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.control,
  },
  icon: { width: sizing.icon.lg, alignItems: 'center' },
  pressed: { opacity: interaction.pressedOpacity },
  disabled: { backgroundColor: color.action.disabled, borderColor: 'transparent' },
});
