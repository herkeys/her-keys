import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline } from '../../../design/components';
import { color, interaction, sizing, spacing } from '../../../design/tokens';
import type { LocalDate } from '../../../domain/logicalDay';
import { refKey } from '../../../domain/foundation/typedRef';
import { DETAIL, attentionLine } from '../copy';
import type { AttentionEntry, ChildDetail, ItemFact, KidsRef } from '../types';
import { Disclosure } from './Disclosure';
import { FallbackPlanSection } from './FallbackPlanSection';
import { ItemRow } from './ItemRow';

const UPCOMING_SHOWN = 5;

/** One canonical item can be reached from several sections; this is how a reason finds the row it is about. */
function itemsByRef(detail: ChildDetail): Map<string, ItemFact> {
  const map = new Map<string, ItemFact>();
  for (const item of [...detail.upcoming, ...Object.values(detail.openWork).flat(), ...detail.plans.map((row) => row.item)]) map.set(refKey(item.ref), item);
  return map;
}

function groupEntries(entries: AttentionEntry[]): Array<{ ref: KidsRef; entries: AttentionEntry[] }> {
  const groups = new Map<string, { ref: KidsRef; entries: AttentionEntry[] }>();
  for (const entry of entries) {
    const key = refKey(entry.ref);
    const group = groups.get(key);
    if (group) group.entries.push(entry);
    else groups.set(key, { ref: entry.ref, entries: [entry] });
  }
  return [...groups.values()];
}

export interface ChildDetailViewProps {
  detail: ChildDetail;
  today: LocalDate;
  onOpenItem: (ref: KidsRef) => void;
  onAddTask: () => void;
  onAddEvent: () => void;
  onAddPlanStep: (parent: KidsRef) => void;
}

/**
 * One child: what is next, what needs attention, what is coming, what is open and who has it, and what is arranged if the plan
 * changes. Sections appear only when they have something real to say; nothing here is a placeholder.
 */
export function ChildDetailView({ detail, today, onOpenItem, onAddTask, onAddEvent, onAddPlanStep }: ChildDetailViewProps) {
  const name = detail.label.displayName;
  const byRef = itemsByRef(detail);
  const open = (item: ItemFact) => onOpenItem(item.ref);
  const [next, ...later] = detail.upcoming;
  const shownLater = later.slice(0, UPCOMING_SHOWN - 1);
  const hiddenLater = later.slice(UPCOMING_SHOWN - 1);
  const w = detail.openWork;
  const workGroups: Array<[string, ItemFact[]]> = [
    [DETAIL.needsYou, w.needsYou],
    [DETAIL.withSomeoneElse, w.withSomeoneElse],
    [DETAIL.waiting, w.waiting],
    [DETAIL.nobodyRecorded, w.nobodyRecorded],
  ];
  const hasWork = workGroups.some(([, items]) => items.length > 0);
  const hasAnything = next !== undefined || hasWork || detail.plans.length > 0 || detail.needsAttention.length > 0;
  const attentionGroups = groupEntries(detail.needsAttention);

  return (
    <View style={styles.stack}>
      {detail.label.context ? (
        <AppText variant="metadata" color={color.text.secondary}>
          {detail.label.context}
        </AppText>
      ) : null}

      <View style={styles.addRow}>
        <Button label={DETAIL.addTask} variant="secondary" size="sm" onPress={onAddTask} accessibilityHint={`Adds a task for ${name}`} />
        <Button label={DETAIL.addEvent} variant="secondary" size="sm" onPress={onAddEvent} accessibilityHint={`Adds an event for ${name}`} />
      </View>

      {!hasAnything ? (
        <AppText variant="body" color={color.text.secondary}>
          {DETAIL.emptyChild}
        </AppText>
      ) : null}

      {next ? (
        <View style={styles.section}>
          <Overline>{DETAIL.next}</Overline>
          <Card raised>
            <ItemRow item={next} childName={name} today={today} onOpen={open} showUnknowns />
          </Card>
        </View>
      ) : hasAnything ? (
        <View style={styles.section}>
          <Overline>{DETAIL.next}</Overline>
          <AppText variant="body" color={color.text.secondary}>
            {DETAIL.nothingNext}
          </AppText>
        </View>
      ) : null}

      {attentionGroups.length > 0 ? (
        <View style={styles.section}>
          <Overline>{DETAIL.needsAttention}</Overline>
          <Card tone="attention">
            {attentionGroups.map((group) => {
              const item = byRef.get(refKey(group.ref));
              const lines = group.entries.map((entry) => attentionLine(entry, today));
              if (!item) return null;
              return (
                <Pressable
                  key={refKey(group.ref)}
                  onPress={() => onOpenItem(group.ref)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} for ${name}. ${lines.join(' ')}`}
                  accessibilityHint="Opens this item"
                  style={({ pressed }) => [styles.attention, pressed ? { opacity: interaction.pressedOpacity } : null]}
                >
                  <AppText variant="bodyStrong">{item.title}</AppText>
                  {lines.map((line) => (
                    <AppText key={line} variant="supporting" color={color.text.secondary}>
                      {line}
                    </AppText>
                  ))}
                </Pressable>
              );
            })}
          </Card>
        </View>
      ) : null}

      {later.length > 0 ? (
        <View style={styles.section}>
          <Overline>{DETAIL.upcoming}</Overline>
          {shownLater.map((item) => (
            <ItemRow key={refKey(item.ref)} item={item} childName={name} today={today} onOpen={open} showUnknowns />
          ))}
          {hiddenLater.length > 0 ? (
            <Disclosure collapsedLabel={DETAIL.showMore(hiddenLater.length)} expandedLabel={DETAIL.showLess}>
              {hiddenLater.map((item) => (
                <ItemRow key={refKey(item.ref)} item={item} childName={name} today={today} onOpen={open} showUnknowns />
              ))}
            </Disclosure>
          ) : null}
        </View>
      ) : null}

      {hasWork ? (
        <View style={styles.section}>
          <Overline>{DETAIL.openWork}</Overline>
          {workGroups
            .filter(([, items]) => items.length > 0)
            .map(([label, items]) => (
              <View key={label} style={styles.group}>
                <AppText variant="sectionTitle">{label}</AppText>
                {items.map((item) => (
                  <ItemRow key={refKey(item.ref)} item={item} childName={name} today={today} onOpen={open} />
                ))}
              </View>
            ))}
        </View>
      ) : null}

      <FallbackPlanSection
        plans={detail.plans}
        today={today}
        onOpenItem={onOpenItem}
        onOpenStep={(id) => onOpenItem({ kind: 'task', id })}
        onAddStep={onAddPlanStep}
      />

      {detail.routines.length > 0 ? (
        <View style={styles.section}>
          <Overline>{DETAIL.routines}</Overline>
          <AppText variant="supporting" color={color.text.secondary}>
            {detail.routines.map((routine) => routine.name).join(', ')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xxl },
  section: { gap: spacing.md },
  group: { gap: spacing.xs },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  attention: { minHeight: sizing.minTouchTarget, paddingVertical: spacing.sm, gap: spacing.xxs },
});
