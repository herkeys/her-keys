import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card, Divider } from '../../../design/components';
import { colors, interaction, sizing, spacing } from '../../../design/tokens';
import type { TransitionRowPresentation } from '../present';
import { Lines, TagRow } from './parts';

/**
 * One handoff on the hub. It shows the child, the title, the day and time, and what she has recorded — and NEVER a location: the
 * presentation carries none, so there is nothing here to leak. The whole row opens the handoff.
 */
export function TransitionRow({ row, onPress, large = false }: { row: TransitionRowPresentation; onPress: (id: string) => void; large?: boolean }) {
  return (
    <Pressable
      onPress={() => onPress(row.id)}
      accessibilityRole="button"
      accessibilityLabel={row.accessibilityLabel}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <AppText variant="metadata" color={colors.textTertiary}>
        {row.childName}
      </AppText>
      <AppText variant={large ? 'screenTitle' : 'cardTitle'}>{row.title}</AppText>
      <AppText variant="body" color={colors.textSecondary}>
        {row.whenLine}
      </AppText>
      <TagRow tags={row.tags} />
      <Lines lines={row.lines} />
    </Pressable>
  );
}

/** A grouped list of handoff rows in one surface, divided by hairlines. */
export function TransitionList({ rows, onPress }: { rows: readonly TransitionRowPresentation[]; onPress: (id: string) => void }) {
  return (
    <Card>
      {rows.map((row, index) => (
        <View key={row.id}>
          {index > 0 ? <Divider tight /> : null}
          <TransitionRow row={row} onPress={onPress} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: sizing.minTouchTarget, paddingVertical: spacing.xs },
  pressed: { opacity: interaction.pressedOpacity },
});
