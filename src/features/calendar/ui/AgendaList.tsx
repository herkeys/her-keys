import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button } from '../../../design/components';
import { colors, interaction, sizing, spacing } from '../../../design/tokens';
import { COPY, detailLines, itemAccessibilityLabel, itemLine, responsibilityLine, type CopyContext } from '../copy';
import type { DayItem, ItemRef } from '../model/types';
import { DetailLines, ToggleLink } from './Disclosure';

export interface AgendaListProps {
  items: DayItem[];
  ctx: CopyContext;
  /** Pressing a row opens that item’s own editor (the inherited behaviour, preserved). */
  onOpenItem: (ref: ItemRef) => void;
  /** Items the action map says can be protected right now. Absent means the list is read-only. */
  protectable?: ReadonlySet<string>;
  onProtect?: (ref: ItemRef) => void;
}

/**
 * The day, in order. Fixed and flexible are told apart in WORDS on every row (“Fixed” / “Flexible”),
 * so nothing here depends on color. First glance is the time, the title and one quiet line; subject,
 * place, what she entered for getting there and dependencies are one “Details” press away.
 */
export function AgendaList({ items, ctx, onOpenItem, protectable, onProtect }: AgendaListProps) {
  return (
    <View accessibilityRole="list" accessibilityLabel={COPY.agendaHeading}>
      {items.map((item, index) => (
        <AgendaRow
          key={`${item.ref.kind}:${item.ref.id}`}
          item={item}
          ctx={ctx}
          last={index === items.length - 1}
          onOpen={() => onOpenItem(item.ref)}
          onProtect={onProtect !== undefined && protectable?.has(`${item.ref.kind}:${item.ref.id}`) ? () => onProtect(item.ref) : undefined}
        />
      ))}
    </View>
  );
}

export function AgendaRow({ item, ctx, last, onOpen, onProtect }: { item: DayItem; ctx: CopyContext; last: boolean; onOpen: () => void; onProtect?: () => void }) {
  const [open, setOpen] = useState(false);
  const details = detailLines(item);
  const responsibility = item.responsibility === null ? null : responsibilityLine(item.responsibility);
  const elapsed = item.progress === 'elapsed';
  const time = item.timing.kind === 'timed' ? ctx.clock(item.timing.startMinute) : '';

  return (
    <View style={[styles.row, last ? null : styles.divider]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={itemAccessibilityLabel(item, ctx)}
        accessibilityHint="Opens this item to edit it"
        style={({ pressed }) => [styles.main, pressed ? styles.pressed : null]}
      >
        <AppText variant="metadata" color={elapsed ? colors.textTertiary : colors.textSecondary} style={styles.time}>
          {time}
        </AppText>
        <View style={styles.body}>
          <AppText variant={item.flexibility === 'fixed' ? 'bodyStrong' : 'body'} color={elapsed ? colors.textSecondary : colors.textPrimary}>
            {item.title}
          </AppText>
          <AppText variant="metadata" color={colors.textSecondary} style={styles.line}>
            {itemLine(item, ctx)}
          </AppText>
          {responsibility !== null ? (
            <AppText variant="metadata" color={item.responsibility?.covered ? colors.textSecondary : colors.waiting} style={styles.line}>
              {responsibility}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      {details.length > 0 || onProtect !== undefined ? (
        <View style={styles.detailsWrap}>
          <ToggleLink
            label={COPY.details}
            expandedLabel={COPY.hideDetails}
            expanded={open}
            onPress={() => setOpen((value) => !value)}
            accessibilityLabel={`${open ? COPY.hideDetails : COPY.details}: ${item.title}`}
          />
          {open ? (
            <DetailLines lines={details}>
              {onProtect !== undefined ? (
                <Button label={COPY.protect} variant="secondary" size="sm" onPress={onProtect} style={styles.protect} accessibilityHint="Shows what this does before anything changes" />
              ) : null}
            </DetailLines>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingTop: spacing.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  main: { flexDirection: 'row', gap: spacing.md, minHeight: sizing.minTouchTarget, paddingVertical: spacing.sm },
  pressed: { opacity: interaction.pressedOpacity },
  time: { width: 76, paddingTop: 2 },
  body: { flex: 1 },
  line: { marginTop: spacing.xxs },
  detailsWrap: { paddingLeft: 76 + spacing.md },
  protect: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
