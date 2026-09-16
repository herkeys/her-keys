import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, Tag } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useHouseholdState } from '../../store/AppStateProvider';
import { useSchedule } from '../../store/ScheduleContext';

const CAPACITY_ACTION_TYPES = new Set(['daily_load.drop_task', 'daily_load.shorten_task', 'daily_load.keep_capacity_plan']);

/** Household has never had anything entered at all — a different moment than "today happens to be light." */
function useIsHouseholdEverEmpty(): boolean {
  const { state } = useHouseholdState();
  return state.origin === 'empty' && state.events.length === 0 && state.tasks.length === 0 && state.needsMe.length === 0;
}

export function DailyLoadCard() {
  const schedule = useSchedule();
  const { events, tasks, assessment, issues, decision, candidateIndex, appliedMove, showNextCandidate, moveRecommendedTask, keepAsPlanned, moveEvent, dropTask, shortenTask, keepCapacity, protectItem } = schedule;
  const { state, today } = useHouseholdState();
  const [busy, setBusy] = useState(false);
  const everEmpty = useIsHouseholdEverEmpty();

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    await action();
    setBusy(false);
  };

  // What she approved for the transition-buffer issue, as recorded at the time; the rest of Today recomputes from the moved task.
  if (decision === 'moved' && appliedMove) {
    return (
      <Card tone="success" style={styles.card}>
        <Tag label="Adjusted" tone="success" />
        <AppText variant="headline" style={styles.headline}>
          “{appliedMove.taskTitle}” moved to tomorrow.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
          That window now has {appliedMove.projectedBufferMinutes} minutes instead of {appliedMove.currentBufferMinutes} —{' '}
          {appliedMove.resolvesShortfall
            ? `enough room before ${appliedMove.windowAfterTitle}.`
            : `better, but still short of the ${appliedMove.requiredBufferMinutes} before ${appliedMove.windowAfterTitle}.`}
        </AppText>
      </Card>
    );
  }

  if (decision === 'kept') {
    return (
      <Card tone="subtle" style={styles.card}>
        <Tag label="Kept as planned" />
        <AppText variant="headline" style={styles.headline}>
          Today stays as you had it.
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.impact}>
          Her Keys will watch how the afternoon actually goes.
        </AppText>
      </Card>
    );
  }

  if (everEmpty) {
    return (
      <Card tone="subtle" style={styles.card}>
        <AppText variant="headline">Nothing entered yet.</AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.impact}>
          Add your first event or task to see what Her Keys notices about your day.
        </AppText>
      </Card>
    );
  }

  if (events.length === 0 && tasks.length === 0) {
    return (
      <Card tone="subtle" style={styles.card}>
        <AppText variant="headline">Nothing scheduled today.</AppText>
      </Card>
    );
  }

  const primary = issues.primary;

  if (primary?.kind === 'overlap') {
    return (
      <Card tone="attention" raised style={styles.card}>
        <Tag label="Needs your attention" tone="attention" />
        <AppText variant="headline" style={styles.headline}>
          “{primary.eventATitle}” and “{primary.eventBTitle}” overlap.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
          They overlap by {primary.overlapMinutes} minutes, and both are fixed commitments — Her Keys can’t move either one automatically.
        </AppText>
      </Card>
    );
  }

  if (primary?.kind === 'capacity_pressure') {
    const latestCapacityAction = [...state.actions].reverse().find((a) => a.logicalDate === today && CAPACITY_ACTION_TYPES.has(a.type));
    if (latestCapacityAction?.type === 'daily_load.keep_capacity_plan') {
      return (
        <Card tone="subtle" style={styles.card}>
          <Tag label="Kept as planned" />
          <AppText variant="headline" style={styles.headline}>
            Today’s workload stays as you had it.
          </AppText>
        </Card>
      );
    }
    if (latestCapacityAction) {
      return (
        <Card tone="success" style={styles.card}>
          <Tag label="Adjusted" tone="success" />
          <AppText variant="headline" style={styles.headline}>
            Today’s workload was adjusted.
          </AppText>
        </Card>
      );
    }

    return (
      <Card tone="attention" raised style={styles.card}>
        <Tag label="Needs you" tone="attention" />
        <AppText variant="headline" style={styles.headline}>
          Today has more flexible work than time.
        </AppText>
        <View style={styles.reasoning}>
          <View style={styles.reasonBlock}>
            <Overline color={colors.attention}>What Her Keys noticed</Overline>
            <AppText variant="bodySm" color={colors.textSecondary}>
              Your flexible tasks need about {primary.neededMinutes} minutes today, and about {primary.availableMinutes} are left in the day.
            </AppText>
          </View>
          <View style={styles.reasonBlock}>
            <Overline color={colors.attention}>Why it matters</Overline>
            <AppText variant="bodySm" color={colors.textSecondary}>
              That’s {primary.pressureMinutes} minutes more than today realistically holds.
            </AppText>
          </View>
          <View style={styles.reasonBlock}>
            <Overline color={colors.attention}>What Her Keys recommends</Overline>
            <AppText variant="bodySm" color={colors.textSecondary}>
              Shorten or drop “{primary.largestTaskTitle}”.
            </AppText>
          </View>
        </View>

        <View style={styles.secondaryRow}>
          <Button label="Shorten it" onPress={() => run(() => shortenTask(primary.largestTaskId!))} disabled={busy} style={styles.secondaryButton} />
          <Button label="Drop it" variant="secondary" onPress={() => run(() => dropTask(primary.largestTaskId!))} disabled={busy} style={styles.secondaryButton} />
        </View>
        <View style={styles.secondaryRow}>
          <Button label="Keep as planned" variant="ghost" size="sm" onPress={() => run(keepCapacity)} disabled={busy} style={styles.secondaryButton} />
          {primary.largestTaskId && (
            <Button
              label="Protect it"
              variant="ghost"
              size="sm"
              onPress={() => run(() => protectItem({ targetType: 'task', targetId: primary.largestTaskId! }))}
              disabled={busy}
              style={styles.secondaryButton}
            />
          )}
        </View>
      </Card>
    );
  }

  if (primary?.kind === 'overdue') {
    return (
      <Card tone="subtle" style={styles.card}>
        <Tag label="Overdue" />
        <AppText variant="headline" style={styles.headline}>
          “{primary.taskTitle}” is {primary.daysOverdue} day{primary.daysOverdue === 1 ? '' : 's'} overdue.
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.impact}>
          Her Keys won’t reschedule this automatically — it’s still yours to decide.
        </AppText>
      </Card>
    );
  }

  if (!primary) {
    return (
      <Card tone="success" style={styles.card}>
        <Tag label="Nothing needs moving" tone="success" />
        <AppText variant="headline" style={styles.headline}>
          Your commitments have room between them.
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.impact}>
          Her Keys checked today’s transitions and found nothing that needs changing.
        </AppText>
      </Card>
    );
  }

  // transition_conflict or tight_window: the tightest gap, from computeDailyLoad's own candidates, plus a flexible boundary event if no task candidate exists.
  const candidate = assessment.candidates[candidateIndex];
  const flexibleBoundaryEvent =
    !candidate && assessment.gap
      ? [
          events.find((e) => e.id === assessment.gap!.beforeEventId),
          events.find((e) => e.id === assessment.gap!.afterEventId),
        ].find((e) => e?.commitment === 'flexible')
      : undefined;

  if (!candidate && !flexibleBoundaryEvent) {
    return (
      <Card tone="attention" raised style={styles.card}>
        <Tag label={primary.kind === 'tight_window' ? 'Tight window' : 'Tight day ahead'} tone="attention" />
        <AppText variant="headline" style={styles.headline}>
          Leave a few minutes early this afternoon.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
          Only {primary.bufferMinutes} minutes sit between {primary.beforeTitle} and {primary.afterTitle}, and nothing flexible is scheduled there to move.
        </AppText>
        <View style={styles.secondaryRow}>
          <Button label="Got it" variant="ghost" size="sm" onPress={keepAsPlanned} style={styles.secondaryButton} />
        </View>
      </Card>
    );
  }

  if (!candidate && flexibleBoundaryEvent) {
    return (
      <Card tone="attention" raised style={styles.card}>
        <Tag label="Needs you" tone="attention" />
        <AppText variant="headline" style={styles.headline}>
          Move “{flexibleBoundaryEvent.title}” to tomorrow.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
          Only {primary.bufferMinutes} minutes sit between {primary.beforeTitle} and {primary.afterTitle}.
        </AppText>
        <Button label="Move it to tomorrow" onPress={() => run(() => moveEvent(flexibleBoundaryEvent.id))} disabled={busy} />
        <View style={styles.secondaryRow}>
          <Button label="Keep today as planned" variant="ghost" size="sm" onPress={keepAsPlanned} style={styles.secondaryButton} />
          <Button
            label="Protect it"
            variant="ghost"
            size="sm"
            onPress={() => run(() => protectItem({ targetType: 'event', targetId: flexibleBoundaryEvent.id }))}
            disabled={busy}
            style={styles.secondaryButton}
          />
        </View>
      </Card>
    );
  }

  return (
    <Card tone="attention" raised style={styles.card}>
      <Tag label="Needs you" tone="attention" />

      <AppText variant="headline" style={styles.headline}>
        Move “{candidate.task.title}” to tomorrow.
      </AppText>
      <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
        That turns your tightest {candidate.currentBufferMinutes} minutes into {candidate.projectedBufferMinutes}.
      </AppText>

      <View style={styles.reasoning}>
        <View style={styles.reasonBlock}>
          <Overline color={colors.attention}>What Her Keys noticed</Overline>
          <AppText variant="bodySm" color={colors.textSecondary}>
            {candidate.observation}
          </AppText>
        </View>
        <View style={styles.reasonBlock}>
          <Overline color={colors.attention}>Why it matters</Overline>
          <AppText variant="bodySm" color={colors.textSecondary}>
            {candidate.reason}
          </AppText>
        </View>
      </View>

      <Button
        label="Move it to tomorrow"
        onPress={moveRecommendedTask}
        accessibilityHint={`Moves ${candidate.task.title} to tomorrow and frees ${candidate.task.durationMinutes} minutes today`}
      />
      <View style={styles.secondaryRow}>
        {assessment.candidates.length > 1 && (
          <Button label="Show another option" variant="ghost" size="sm" onPress={showNextCandidate} style={styles.secondaryButton} />
        )}
        <Button label="Keep today as planned" variant="ghost" size="sm" onPress={keepAsPlanned} style={styles.secondaryButton} />
        <Button
          label="Protect it"
          variant="ghost"
          size="sm"
          onPress={() => run(() => protectItem({ targetType: 'task', targetId: candidate.task.id }))}
          disabled={busy}
          style={styles.secondaryButton}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xxl },
  headline: { marginTop: spacing.md },
  impact: { marginTop: spacing.sm },
  reasoning: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.attentionBorder,
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  reasonBlock: { gap: spacing.xs },
  secondaryRow: { flexDirection: 'row', marginTop: spacing.xs, gap: spacing.sm },
  secondaryButton: { flex: 1 },
});
