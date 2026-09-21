import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../design/components';
import { color, interaction, sizing, spacing } from '../../design/tokens';
import { SectionLabel, TodayDisclosure } from './TodayDisclosure';

export interface TodayListRow {
  key: string;
  text: string;
  meta?: string | null;
  onPress?: () => void;
  hint?: string;
}

interface TodayListProps {
  title: string;
  rows: TodayListRow[];
  /** Rows beyond the first-glance bound: counted, and one disclosure away. */
  moreRows?: TodayListRow[];
}

/**
 * The quiet lower rung of the hierarchy: one-line statements that sit directly on the page
 * ground with hairline rules, never on a surface of their own. Used for "Coming up", "Can wait
 * today" and "Waiting on others" — the same composition, so they read as one system rather
 * than three cards.
 */
export function TodayList({ title, rows, moreRows = [] }: TodayListProps) {
  return (
    <View>
      <SectionLabel>{title}</SectionLabel>
      <View style={styles.list}>
        {rows.map((row, index) => (
          <Row key={row.key} row={row} last={index === rows.length - 1 && moreRows.length === 0} />
        ))}
      </View>
      {moreRows.length > 0 ? (
        <TodayDisclosure title={`${moreRows.length} more`}>
          {moreRows.map((row, index) => (
            <Row key={row.key} row={row} last={index === moreRows.length - 1} />
          ))}
        </TodayDisclosure>
      ) : null}
    </View>
  );
}

function Row({ row, last }: { row: TodayListRow; last: boolean }) {
  const content = (
    <View style={[styles.row, last ? null : styles.divider]}>
      <AppText variant="supporting" color={color.text.secondary}>
        {row.text}
      </AppText>
      {row.meta ? (
        <AppText variant="metadata" color={color.text.muted}>
          {row.meta}
        </AppText>
      ) : null}
    </View>
  );
  if (!row.onPress) return content;
  return (
    <Pressable
      onPress={row.onPress}
      accessibilityRole="button"
      accessibilityLabel={row.text}
      accessibilityHint={row.hint}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.xs },
  row: { paddingVertical: spacing.md, minHeight: sizing.minTouchTarget, justifyContent: 'center', gap: spacing.xxs },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border.subtle },
  pressed: { opacity: interaction.pressedOpacity },
});
