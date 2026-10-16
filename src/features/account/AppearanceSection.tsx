import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Overline } from '../../design/components';
import { radius, sizing, spacing } from '../../design/tokens';
import { createThemedStyles, useAppearance, useTheme, type AppearancePreference } from '../../design/theme';

/**
 * Appearance — Light, Dark or System, in Your Account.
 *
 * A radio group: exactly one option is selected, the choice applies the instant it is pressed and is saved on this device only (no
 * account, household, Supabase or purchase state is touched, and no account or subscription is needed — it is offered to Free and
 * Premium alike). The selected row is shown by a filled check and a stronger outline, never by colour alone.
 */

const OPTIONS: ReadonlyArray<{ value: AppearancePreference; label: string; description: string; icon: 'sunny-outline' | 'moon-outline' | 'phone-portrait-outline' }> = [
  { value: 'light', label: 'Light', description: 'Always use the bright, airy Her Keys look.', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', description: 'Always use the calm evening look.', icon: 'moon-outline' },
  { value: 'system', label: 'System', description: 'Match your phone’s appearance setting, and follow it when it changes.', icon: 'phone-portrait-outline' },
];

export function AppearanceSection() {
  const { color } = useTheme();
  const styles = useStyles();
  const { preference, scheme, setPreference } = useAppearance();

  return (
    <View style={styles.section}>
      <Overline>Appearance</Overline>
      <AppText variant="supporting" color={color.text.secondary} style={styles.lede}>
        Choose how Her Keys looks on this phone. This applies to this device only.
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={styles.group}>
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setPreference(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={option.description}
              accessibilityState={{ checked: selected, selected }}
              style={({ pressed }) => [styles.row, selected ? styles.rowSelected : null, pressed ? styles.rowPressed : null]}
            >
              <View style={styles.iconWell} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Ionicons name={option.icon} size={sizing.icon.md} color={color.text.primary} />
              </View>
              <View style={styles.text}>
                <AppText variant="bodyStrong">{option.label}</AppText>
                <AppText variant="supporting" color={color.text.secondary}>
                  {option.description}
                </AppText>
              </View>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={sizing.icon.lg} color={selected ? color.action.primary : color.border.control} />
              </View>
            </Pressable>
          );
        })}
      </View>
      {preference === 'system' ? (
        <AppText variant="metadata" color={color.text.muted} style={styles.status} accessibilityLiveRegion="polite">
          {`Your phone is currently using ${scheme === 'dark' ? 'Dark' : 'Light'}.`}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ color }) =>
  StyleSheet.create({
    section: { gap: spacing.sm },
    lede: { marginBottom: spacing.xs },
    group: { gap: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: sizing.minTouchTarget + spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: color.surface.primary,
      borderWidth: 1,
      borderColor: color.border.default,
    },
    rowSelected: { backgroundColor: color.surface.tint, borderColor: color.action.primary, borderWidth: 2, padding: spacing.md - 1 },
    rowPressed: { opacity: 0.85 },
    iconWell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface.tint },
    text: { flex: 1, gap: spacing.xxs },
    status: { marginTop: spacing.xs },
  }),
);
