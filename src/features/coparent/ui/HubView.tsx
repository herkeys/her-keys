import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Divider, EmptyState, InlineNotice } from '../../../design/components';
import { colors, interaction, sizing, spacing } from '../../../design/tokens';
import { COPY } from '../copy';
import type { HubPresentation } from '../present';
import { Caption, ErrorLine, Lines, Section } from './parts';
import { TransitionList, TransitionRow } from './TransitionRow';

export interface HubViewProps {
  presentation: HubPresentation;
  /** Whether a new record can be made at all. When it cannot, the notices above the buttons say why. */
  canCreate: boolean;
  busy: boolean;
  /** The sentence for a refused action (for example marking a preparation item done), or null. */
  error?: string | null;
  onOpenHandoff: (id: string) => void;
  onOpenFollowUp: (taskId: string) => void;
  onAddHandoff: () => void;
  onAddPrep: () => void;
  onAddFollowUp: () => void;
  onCompletePrep: (taskId: string) => void;
  onShowMoreUpcoming: () => void;
}

/**
 * THE HUB. Organised by child and by need — never by the other adult. It renders exactly what the presentation holds: no location,
 * no sentence of its own, nothing about anyone being told anything.
 */
export function HubView({
  presentation: p,
  canCreate,
  busy,
  error = null,
  onOpenHandoff,
  onOpenFollowUp,
  onAddHandoff,
  onAddPrep,
  onAddFollowUp,
  onCompletePrep,
  onShowMoreUpcoming,
}: HubViewProps) {
  const addDisabled = busy || !canCreate || p.blocked.length > 0;
  const followUpIds = new Set(p.money.map((entry) => entry.taskId));
  const hasReview = p.needsReview.length > 0 || p.needsReviewTasks.length > 0;

  return (
    <View>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          {p.title}
        </AppText>
        <AppText variant="supporting" color={colors.textSecondary} style={styles.subtitle}>
          {p.subtitle}
        </AppText>
        {p.zoneNote !== null ? (
          <View style={styles.zone}>
            <Caption>{p.zoneNote}</Caption>
          </View>
        ) : null}
      </View>

      {p.blocked.length > 0 ? (
        <View style={styles.notices}>
          {p.blocked.map((notice) => (
            <InlineNotice key={notice.code} title={notice.title} body={notice.body} />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label={COPY.actions.addHandoff} size="sm" onPress={onAddHandoff} disabled={addDisabled} accessibilityHint={p.blocked[0]?.title} />
        <Button label={COPY.actions.addPrep} size="sm" variant="secondary" onPress={onAddPrep} disabled={addDisabled} accessibilityHint={p.blocked[0]?.title} />
        <Button label={COPY.actions.addFollowUp} size="sm" variant="secondary" onPress={onAddFollowUp} disabled={addDisabled} accessibilityHint={p.blocked[0]?.title} />
      </View>
      <ErrorLine text={error} />

      {p.empty !== null ? <EmptyState title={p.empty.title} body={p.empty.body} /> : null}

      {p.next !== null ? (
        <Section title={COPY.sections.next}>
          <Card raised>
            <TransitionRow row={p.next} onPress={onOpenHandoff} large />
          </Card>
        </Section>
      ) : null}

      {p.needsYou.length > 0 ? (
        <Section title={COPY.sections.needsYou}>
          <TransitionList rows={p.needsYou} onPress={onOpenHandoff} />
        </Section>
      ) : null}

      {p.waiting.length > 0 ? (
        <Section title={COPY.sections.waiting}>
          <TransitionList rows={p.waiting} onPress={onOpenHandoff} />
        </Section>
      ) : null}

      {hasReview ? (
        <Section title={COPY.sections.needsReview}>
          {p.needsReview.length > 0 ? <TransitionList rows={p.needsReview} onPress={onOpenHandoff} /> : null}
          {p.needsReviewTasks.length > 0 ? (
            <Card style={p.needsReview.length > 0 ? styles.followingCard : undefined}>
              {p.needsReviewTasks.map((task, index) => {
                // A follow-up opens its own detail; a preparation item has none (it is handled where it is listed).
                const opens = followUpIds.has(task.taskId);
                const body = (
                  <>
                    <AppText variant="metadata" color={colors.textTertiary}>
                      {task.childLine}
                    </AppText>
                    <AppText variant="cardTitle">{task.title}</AppText>
                    <Lines lines={task.lines} />
                  </>
                );
                return (
                  <View key={task.taskId}>
                    {index > 0 ? <Divider tight /> : null}
                    {opens ? (
                      <Pressable
                        onPress={() => onOpenFollowUp(task.taskId)}
                        accessibilityRole="button"
                        accessibilityLabel={task.accessibilityLabel}
                        style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
                      >
                        {body}
                      </Pressable>
                    ) : (
                      <View accessible accessibilityLabel={task.accessibilityLabel} style={styles.row}>
                        {body}
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          ) : null}
        </Section>
      ) : null}

      {p.upcoming.length > 0 ? (
        <Section title={COPY.sections.upcoming}>
          <TransitionList rows={p.upcoming} onPress={onOpenHandoff} />
          {p.upcomingHidden > 0 ? (
            <Button label={COPY.actions.showMore(p.upcomingHidden)} variant="ghost" size="sm" onPress={onShowMoreUpcoming} style={styles.more} />
          ) : null}
        </Section>
      ) : null}

      {p.preparation.length > 0 ? (
        <Section title={COPY.sections.preparation}>
          {p.preparation.map((group, groupIndex) => (
            <View key={`${groupIndex}:${group.heading}`} style={groupIndex > 0 ? styles.group : undefined}>
              <AppText variant="bodyStrong" accessibilityRole="header" style={styles.groupHeading}>
                {group.heading}
              </AppText>
              <Card>
                {group.items.map((item, index) => (
                  <View key={item.taskId}>
                    {index > 0 ? <Divider tight /> : null}
                    <View style={styles.item}>
                      <AppText variant="cardTitle">{item.title}</AppText>
                      <Caption>{item.standingLabel}</Caption>
                      <Lines lines={item.lines} />
                      {item.standing === 'open' ? (
                        // Several items share this label, so the item's own title is the hint that says which one.
                        <Button label={COPY.actions.markDone} variant="secondary" size="sm" onPress={() => onCompletePrep(item.taskId)} disabled={busy} accessibilityHint={item.title} style={styles.itemAction} />
                      ) : null}
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </Section>
      ) : null}

      {p.money.length > 0 ? (
        <Section title={COPY.sections.money}>
          <Card>
            {p.money.map((entry, index) => (
              <View key={entry.taskId}>
                {index > 0 ? <Divider tight /> : null}
                <Pressable
                  onPress={() => onOpenFollowUp(entry.taskId)}
                  accessibilityRole="button"
                  accessibilityLabel={entry.accessibilityLabel}
                  style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
                >
                  <AppText variant="metadata" color={colors.textTertiary}>
                    {entry.childLine}
                  </AppText>
                  <AppText variant="cardTitle">{entry.title}</AppText>
                  <AppText variant="bodyStrong">{entry.amountLine}</AppText>
                  <Caption>{entry.amountNote}</Caption>
                  <AppText variant="supporting" color={colors.textSecondary}>
                    {entry.dateLine}
                  </AppText>
                  <AppText variant="supporting" color={colors.textSecondary}>
                    {entry.statusLine}
                  </AppText>
                  <Lines lines={entry.lines} />
                </Pressable>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {p.recentlyCompleted.length > 0 ? (
        <Section title={COPY.sections.recentlyCompleted}>
          <View style={styles.completed}>
            {p.recentlyCompleted.map((entry) => (
              <View key={entry.key} accessible accessibilityLabel={entry.accessibilityLabel}>
                <AppText variant="body">{entry.title}</AppText>
                <Caption>{entry.childLine}</Caption>
                <Caption>{entry.line}</Caption>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <View style={styles.footer}>
        <Caption>{p.footnote}</Caption>
        <Caption>{p.hubHint}</Caption>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xl },
  subtitle: { marginTop: spacing.sm },
  zone: { marginTop: spacing.sm },
  notices: { gap: spacing.md, marginBottom: spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { minHeight: sizing.minTouchTarget, paddingVertical: spacing.xs },
  pressed: { opacity: interaction.pressedOpacity },
  followingCard: { marginTop: spacing.md },
  more: { alignSelf: 'flex-start', marginTop: spacing.sm },
  group: { marginTop: spacing.lg },
  groupHeading: { marginBottom: spacing.sm },
  item: { paddingVertical: spacing.xs },
  itemAction: { alignSelf: 'flex-start', marginTop: spacing.sm },
  completed: { gap: spacing.md },
  footer: { marginTop: spacing.xxxl, gap: spacing.xs },
});
