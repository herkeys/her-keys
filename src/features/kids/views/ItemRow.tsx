import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Tag } from '../../../design/components';
import { color, interaction, radius, sizing, spacing } from '../../../design/tokens';
import type { LocalDate } from '../../../domain/logicalDay';
import {
  DETAIL,
  coverageLine,
  coverageTag,
  dependencyLine,
  durationPhrase,
  duePhrase,
  itemAccessibilityLabel,
  visibleUnknowns,
  whenPhrase,
} from '../copy';
import type { ItemFact } from '../types';

/**
 * One child-linked item, told from its facts. It is the SAME row wherever the item appears (upcoming, open work, a plan), so one
 * canonical item never becomes two different stories. It says only what the record supports; unknowns are named, never blank.
 */
export function ItemRow({
  item,
  childName,
  today,
  onOpen,
  showUnknowns = false,
}: {
  item: ItemFact;
  childName: string;
  today: LocalDate;
  onOpen: (item: ItemFact) => void;
  /** The expanded logistics view: says what is not recorded. */
  showUnknowns?: boolean;
}) {
  const when = whenPhrase(item, today);
  const tag = coverageTag(item.responsibility.coverage);
  const dependency = dependencyLine(item);
  const facts = [
    when,
    item.due ? duePhrase(item.due.date, today) : null,
    item.duration ? durationPhrase(item.duration) : null,
    item.where ? DETAIL.where(item.where) : null,
    item.repeats ? `${DETAIL.repeats} ${item.repeats.frequency ?? ''}`.trim() : null,
  ].filter((line): line is string => line !== null);
  const prep = item.preparation;

  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={itemAccessibilityLabel(item, childName, today)}
      accessibilityHint="Opens this item"
      style={({ pressed }) => [styles.row, pressed ? { opacity: interaction.pressedOpacity } : null]}
    >
      <AppText variant="bodyStrong">{item.title}</AppText>
      {facts.map((line) => (
        <AppText key={line} variant="supporting" color={color.text.secondary}>
          {line}
        </AppText>
      ))}
      {prep && showUnknowns
        ? [
            prep.preparationMinutes !== null ? DETAIL.preparation(prep.preparationMinutes) : null,
            prep.travelBefore !== null ? DETAIL.travelBefore(prep.travelBefore) : null,
            prep.travelAfter !== null ? DETAIL.travelAfter(prep.travelAfter) : null,
          ]
            .filter((line): line is string => line !== null)
            .map((line) => (
              <AppText key={line} variant="supporting" color={color.text.secondary}>
                {line}
              </AppText>
            ))
        : null}
      <AppText variant="supporting" color={color.text.secondary}>
        {coverageLine(item.responsibility)}
      </AppText>
      {tag ? (
        <View style={styles.tagRow}>
          <Tag label={tag.label} tone={tag.tone} />
        </View>
      ) : null}
      {dependency ? (
        <AppText variant="supporting" color={color.status.attention}>
          {dependency}
        </AppText>
      ) : null}
      {showUnknowns && visibleUnknowns(item).length > 0 ? (
        <AppText variant="metadata" color={color.text.muted}>
          {DETAIL.notRecorded(visibleUnknowns(item))}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: sizing.minTouchTarget,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
    borderRadius: radius.xs,
  },
  tagRow: { flexDirection: 'row', marginTop: spacing.xs },
});
