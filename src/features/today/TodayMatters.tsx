import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card } from '../../design/components';
import { color, interaction, sizing, spacing } from '../../design/tokens';
import type { MatterItem, MattersSection } from './model';
import { SectionLabel } from './TodayDisclosure';
import { sourceLabelOf, TodaySourceLine } from './TodaySourceLine';

/**
 * What matters today: a handful of anchors, not the whole day. The full list is one
 * disclosure away ("Everything today"). Rows open the item so it can be checked or
 * corrected through the existing editor — Today changes nothing by being tapped.
 */
export function TodayMatters({ section }: { section: MattersSection }) {
  return (
    <Card tone="surface">
      <SectionLabel>What matters today</SectionLabel>
      <View style={styles.list}>
        {section.anchors.map((item, index) => (
          <MatterRow key={`${item.kind}:${item.ref.id}`} item={item} last={index === section.anchors.length - 1} />
        ))}
      </View>
      {section.moreCount > 0 ? (
        <AppText variant="metadata" color={color.text.muted} style={styles.more}>
          {`and ${section.moreCount} more`}
        </AppText>
      ) : null}
    </Card>
  );
}

function MatterRow({ item, last }: { item: MatterItem; last: boolean }) {
  const meta = item.isNext ? 'Next up' : item.dueToday ? 'Due today' : null;
  // The row is itself a button, so its label hides the badge inside it from a screen reader: an unconfirmed claim is said here too.
  const label = [item.title, item.timeLabel, item.isNext ? 'next up' : null, item.dueToday ? 'due today' : null, item.source?.uncertain ? sourceLabelOf(item.source) : null].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={() => router.push(item.route)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens it so you can check or change it"
      style={({ pressed }) => [styles.row, last ? null : styles.divider, pressed ? styles.pressed : null]}
    >
      <AppText variant="metadata" color={color.text.muted} style={styles.time}>
        {item.timeLabel ?? ''}
      </AppText>
      <View style={styles.body}>
        <AppText variant={item.isNext ? 'bodyStrong' : 'body'}>{item.title}</AppText>
        {meta ? (
          <AppText variant="metadata" color={color.text.muted}>
            {meta}
          </AppText>
        ) : null}
        {item.source ? <TodaySourceLine source={item.source} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, minHeight: sizing.minTouchTarget },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border.subtle },
  time: { width: 72, paddingTop: 2 },
  body: { flex: 1 },
  more: { marginTop: spacing.xs },
  pressed: { opacity: interaction.pressedOpacity },
});
