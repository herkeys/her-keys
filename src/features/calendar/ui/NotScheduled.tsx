import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card, Overline, Tag } from '../../../design/components';
import { colors, interaction, sizing, spacing } from '../../../design/tokens';
import { COPY, itemLine, unplacedCopy, type CopyContext } from '../copy';
import type { DayItem, ItemRef, UnplacedItem } from '../model/types';
import { WhyDisclosure } from './Disclosure';

/**
 * Work that has a day but no time. It is listed with an honest conclusion about whether it fits — an
 * opening if a certain one exists, “needs a place” only when nothing can hold it, “not confirmed” when
 * the answer depends on facts that were not entered. Nothing here schedules anything, and a deadline
 * is never shown as a scheduled time.
 */
export function NotScheduledSection({
  view,
  ctx,
  onOpenItem,
}: {
  view: { dayItems: DayItem[]; unplacedItems: UnplacedItem[] };
  ctx: CopyContext;
  onOpenItem: (ref: ItemRef) => void;
}) {
  const rows = view.dayItems
    .filter((item) => item.timing.kind === 'date_only')
    .map((item) => ({ item, unplaced: view.unplacedItems.find((u) => u.itemRef.kind === item.ref.kind && u.itemRef.id === item.ref.id) }))
    .filter((row): row is { item: DayItem; unplaced: UnplacedItem } => row.unplaced !== undefined);
  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      <Overline style={styles.heading}>{COPY.notScheduledHeading}</Overline>
      {rows.map(({ item, unplaced }) => (
        <UnplacedRow key={`${item.ref.kind}:${item.ref.id}`} item={item} unplaced={unplaced} ctx={ctx} onOpen={() => onOpenItem(item.ref)} />
      ))}
    </View>
  );
}

export function UnplacedRow({ item, unplaced, ctx, onOpen }: { item: DayItem; unplaced: UnplacedItem; ctx: CopyContext; onOpen: () => void }) {
  const copy = unplacedCopy(unplaced, ctx);
  const needsPlace = unplaced.state === 'needs_a_place';
  return (
    <Card tone="surface" style={styles.card}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${itemLine(item, ctx)}. ${copy.label ? `${copy.label}. ` : ''}${copy.sentence}`}
        accessibilityHint={COPY.hintOpenItem}
        style={({ pressed }) => [styles.main, pressed ? styles.pressed : null]}
      >
        <AppText variant={item.flexibility === 'fixed' ? 'bodyStrong' : 'body'}>{item.title}</AppText>
        <AppText variant="metadata" color={colors.textSecondary} style={styles.line}>
          {itemLine(item, ctx)}
        </AppText>
      </Pressable>
      {copy.label !== null ? (
        <View style={styles.tag}>
          <Tag label={copy.label} tone={needsPlace ? 'attention' : 'neutral'} />
        </View>
      ) : null}
      <AppText variant="supporting" color={colors.textSecondary} style={styles.sentence}>
        {copy.sentence}
      </AppText>
      <WhyDisclosure reasons={copy.why} subject={item.title} />
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl, gap: spacing.md },
  heading: { marginBottom: spacing.xs },
  card: { gap: spacing.xs },
  main: { minHeight: sizing.minTouchTarget, justifyContent: 'center' },
  pressed: { opacity: interaction.pressedOpacity },
  line: { marginTop: spacing.xxs },
  tag: { marginTop: spacing.sm },
  sentence: { marginTop: spacing.xs },
});
