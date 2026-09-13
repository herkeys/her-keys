import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../tokens';
import { AppText } from './AppText';

export interface StatusItem {
  key: string;
  label: string;
  value: string;
  /** Marks the row as wanting the user, with a small dot — never a red badge. */
  needsAttention?: boolean;
  onPress?: () => void;
}

/**
 * One grouped surface of label/value rows. Used for both the Today life-status
 * summary and the Life hub so the two read as the same system rather than two
 * different screens.
 */
export function StatusList({ items }: { items: StatusItem[] }) {
  return (
    <View style={styles.surface}>
      {items.map((item, index) => (
        <Row key={item.key} item={item} isLast={index === items.length - 1} />
      ))}
    </View>
  );
}

function Row({ item, isLast }: { item: StatusItem; isLast: boolean }) {
  const content = (
    <View style={[styles.row, isLast ? null : styles.rowDivider]}>
      <AppText variant="bodyStrong" style={styles.label}>
        {item.label}
      </AppText>
      <View style={styles.valueWrap}>
        {item.needsAttention && <View style={styles.dot} />}
        <AppText
          variant="bodySm"
          color={item.needsAttention ? colors.attention : colors.textSecondary}
          style={styles.value}
        >
          {item.value}
        </AppText>
        {item.onPress && (
          <AppText variant="body" color={colors.textTertiary} style={styles.chevron}>
            ›
          </AppText>
        )}
      </View>
    </View>
  );

  if (!item.onPress) return content;

  return (
    <Pressable
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.label}: ${item.value}`}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.xl,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  label: { flexShrink: 0 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  value: { textAlign: 'right', flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.attention },
  chevron: { marginLeft: spacing.xxs },
  pressed: { opacity: 0.6 },
});
