import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../../design/components';
import { radius, spacing } from '../../../design/tokens';
import { createThemedStyles, themed, useTheme } from '../../../design/theme';
import type { FactTone, RowCopy } from '../copy';

const toneColorFor = themed<Record<FactTone, string>>(({ colors }) => ({
  plain: colors.textSecondary,
  attention: colors.attention,
  muted: colors.textTertiary,
}));

/**
 * One Home item: its title and every fact Home states about it, as words. State is never carried by color alone — an attention
 * fact is styled differently AND says what it is — and the spoken label is built from the same facts the screen shows.
 */
export function HomeItemRow({ copy, onPress, isLast }: { copy: RowCopy; onPress: () => void; isLast: boolean }) {
  const styles = useStyles();
  const toneColor = toneColorFor(useTheme());
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={copy.accessibilityLabel}
      accessibilityHint="Opens the details"
      style={({ pressed }) => [styles.row, isLast ? null : styles.divider, pressed ? styles.pressed : null]}
    >
      <AppText variant="bodyStrong">{copy.title}</AppText>
      {copy.facts.length > 0 && (
        <View style={styles.facts}>
          {copy.facts.map((fact, index) => (
            <AppText key={`${fact.code}-${index}`} variant="supporting" color={toneColor[fact.tone]}>
              {fact.text}
            </AppText>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const useStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  row: { paddingVertical: spacing.md, minHeight: 56, justifyContent: 'center' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  pressed: { opacity: 0.6 },
  facts: { marginTop: spacing.xxs, gap: 2 },
}));

/** The shared card surface of a Home section (theme-derived: call the hook inside a component). */
export const useHomeRowSurface = createThemedStyles(({ colors }) => StyleSheet.create({
  surface: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.xl,
  },
}).surface);
