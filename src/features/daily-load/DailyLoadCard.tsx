import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, Tag } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { CAPACITY_DAY_END_MINUTES, CAPACITY_DAY_START_MINUTES } from '../../domain/dailyLoadIssues';
import { canShortenTask } from '../../domain/recommendationActions';
import { useHouseholdState } from '../../store/AppStateProvider';
import { useSchedule } from '../../store/ScheduleContext';
import { formatTime } from './computeDailyLoad';

const CAPACITY_ACTION_TYPES = new Set(['daily_load.drop_task', 'daily_load.shorten_task', 'daily_load.keep_capacity_plan']);
const DAY_WINDOW = `${formatTime(CAPACITY_DAY_START_MINUTES)} and ${formatTime(CAPACITY_DAY_END_MINUTES)}`;

/** Household has never had anything entered at all — a different moment than "today happens to be light." */
function useIsHouseholdEverEmpty(): boolean {
  const { state } = useHouseholdState();
  return state.origin === 'empty' && state.events.length === 0 && state.tasks.length === 0 && state.needsMe.length === 0;
}

export function DailyLoadCard() {
  const schedule = useSchedule();
  const { events, tasks, issues, decision, candidates, candidateIndex, appliedMove, showNextCandidate, moveRecommendedTask, keepAsPlanned, moveEvent, dropTask, shortenTask, keepCapacity, protectItem } = schedule;
  const { state, today } = useHouseholdState();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // A second tap in the same frame would otherwise run an action twice before `busy` renders.
  const inFlight = useRef(false);
  const everEmpty = useIsHouseholdEverEmpty();

  const run = async (action: () => Promise<boolean>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNote(null);
    try {
      if (!(await action())) setNote('Her Keys couldn’t save that yet. Nothing changed — try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const failureNote = note && (
    <AppText variant="bodySm" color={colors.attention} style={styles.note} accessibilityRole="alert">
      {note}
    </AppText>
  );

  // What she approved for the timing verdict, as recorded at the time; the rest of Today recomputes from the moved item.
  if (decision === 'moved' && appliedMove) {
    if ('eventTitle' in appliedMove) {
      return (
        <Card tone="success" style={styles.card}>
          <Tag label="Adjusted" tone="success" />
          <AppText variant="headline" style={styles.headline}>
            “{appliedMove.eventTitle}” moved to tomorrow.
          </AppText>
          <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
            {appliedMove.overlapped
              ? `It no longer runs into “${appliedMove.otherTitle}” today.`
              : `It no longer sits in the tight spot next to “${appliedMove.otherTitle}” today.`}
          </AppText>
        </Card>
      );
    }
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
    const movable = primary.movableEventId === null ? null : events.find((event) => event.id === primary.movableEventId) ?? null;
    if (movable) {
      return (
        <Card tone="attention" raised style={styles.card}>
          <Tag label="Needs you" tone="attention" />
          <AppText variant="headline" style={styles.headline}>
            “{primary.eventATitle}” and “{primary.eventBTitle}” overlap.
          </AppText>
          <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
            They overlap by {primary.overlapMinutes} minutes. “{movable.title}” is flexible, so Her Keys can move it to tomorrow.
          </AppText>
          {failureNote}
          <Button label="Move it to tomorrow" onPress={() => run(() => moveEvent(movable.id))} disabled={busy} style={styles.primaryButton} />
          <View style={styles.secondaryRow}>
            <Button label="Keep today as planned" variant="ghost" size="sm" onPress={keepAsPlanned} disabled={busy} style={styles.secondaryButton} />
            <Button
              label="Protect it"
              variant="ghost"
              size="sm"
              onPress={() => run(() => protectItem({ targetType: 'event', targetId: movable.id }))}
              disabled={busy}
              style={styles.secondaryButton}
            />
          </View>
        </Card>
      );
    }
    const bothFixed = primary.eventACommitment === 'fixed' && primary.eventBCommitment === 'fixed';
    return (
      <Card tone="attention" raised style={styles.card}>
        <Tag label="Needs your attention" tone="attention" />
        <AppText variant="headline" style={styles.headline}>
          “{primary.eventATitle}” and “{primary.eventBTitle}” overlap.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
          {bothFixed
            ? `They overlap by ${primary.overlapMinutes} minutes, and both are fixed commitments — Her Keys can’t move either one automatically.`
            : `They overlap by ${primary.overlapMinutes} minutes. Both are flexible, so either one could change — Her Keys won’t pick between them for you.`}
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
          <AppText variant="body" color={colors.textSecondary} style={styles.impact}>
            It still asks about {primary.pressureMinutes} minutes more than the day holds.
          </AppText>
        </Card>
      );
    }

    const target = primary.largestTaskId;
    return (
      <Card tone="attention" raised style={styles.card}>
        <Tag label={target ? 'Needs you' : 'Needs your attention'} tone="attention" />
        <AppText variant="headline" style={styles.headline}>
          Today has more work than time.
        </AppText>
        <View style={styles.reasoning}>
          <View style={styles.reasonBlock}>
            <Overline color={colors.attention}>What Her Keys noticed</Overline>
            <AppText variant="bodySm" color={colors.textSecondary}>
              Today’s tasks need about {primary.neededMinutes} minutes, and your calendar leaves about {primary.availableMinutes} between {DAY_WINDOW}.
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
              {target
                ? canShortenTask(primary.largestTaskMinutes ?? 0)
                  ? `Shorten or drop “${primary.largestTaskTitle}”.`
                  : `Drop “${primary.largestTaskTitle}” for today.`
                : 'Everything left on today’s list is due today or fixed, so Her Keys won’t drop or shorten any of it. Consider what else could give.'}
            </AppText>
          </View>
        </View>

        {failureNote}
        {target && (
          <>
            <View style={styles.secondaryRow}>
              {canShortenTask(primary.largestTaskMinutes ?? 0) && (
                <Button label="Shorten it" onPress={() => run(() => shortenTask(target))} disabled={busy} style={styles.secondaryButton} />
              )}
              <Button label="Drop it" variant="secondary" onPress={() => run(() => dropTask(target))} disabled={busy} style={styles.secondaryButton} />
            </View>
            <View style={styles.secondaryRow}>
              <Button label="Keep as planned" variant="ghost" size="sm" onPress={() => run(keepCapacity)} disabled={busy} style={styles.secondaryButton} />
              <Button
                label="Protect it"
                variant="ghost"
                size="sm"
                onPress={() => run(() => protectItem({ targetType: 'task', targetId: target }))}
                disabled={busy}
                style={styles.secondaryButton}
              />
            </View>
          </>
        )}
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

  const focus = issues.focus;
  if (!primary || !focus) {
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

  // transition_conflict or tight_window: always the window the verdict names.
  const verdict = focus.issue;
  const travel = verdict.kind === 'transition_conflict' && verdict.source === 'travel_aware' ? verdict.travelMinutesUsed : 0;
  const squeeze =
    travel > 0
      ? `Counting the ${travel} minutes of travel and preparation you entered, only ${verdict.bufferMinutes} minutes sit between ${verdict.beforeTitle} and ${verdict.afterTitle}`
      : `Only ${verdict.bufferMinutes} minutes sit between ${verdict.beforeTitle} and ${verdict.afterTitle}`;
  const candidate = candidates[candidateIndex] ?? null;
  const flexibleEvent = candidate ? null : (events.find((event) => focus.movableEventIds.includes(event.id)) ?? null);

  if (!candidate && !flexibleEvent) {
    return (
      <Card tone="attention" raised style={styles.card}>
        <Tag label={verdict.kind === 'tight_window' ? 'Tight window' : 'Tight day ahead'} tone="attention" />
        <AppText variant="headline" style={styles.headline}>
          Leave a few minutes early this afternoon.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
          {squeeze}, and nothing flexible is scheduled there to move.
        </AppText>
        <View style={styles.secondaryRow}>
          <Button label="Got it" variant="ghost" size="sm" onPress={keepAsPlanned} style={styles.secondaryButton} />
        </View>
      </Card>
    );
  }

  if (!candidate && flexibleEvent) {
    return (
      <Card tone="attention" raised style={styles.card}>
        <Tag label="Needs you" tone="attention" />
        <AppText variant="headline" style={styles.headline}>
          Move “{flexibleEvent.title}” to tomorrow.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
          {squeeze}.
        </AppText>
        {failureNote}
        <Button label="Move it to tomorrow" onPress={() => run(() => moveEvent(flexibleEvent.id))} disabled={busy} />
        <View style={styles.secondaryRow}>
          <Button label="Keep today as planned" variant="ghost" size="sm" onPress={keepAsPlanned} disabled={busy} style={styles.secondaryButton} />
          <Button
            label="Protect it"
            variant="ghost"
            size="sm"
            onPress={() => run(() => protectItem({ targetType: 'event', targetId: flexibleEvent.id }))}
            disabled={busy}
            style={styles.secondaryButton}
          />
        </View>
      </Card>
    );
  }

  if (!candidate) return null;

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

      {failureNote}
      <Button
        label="Move it to tomorrow"
        onPress={moveRecommendedTask}
        disabled={busy}
        accessibilityHint={`Moves ${candidate.task.title} to tomorrow and frees ${candidate.task.durationMinutes} minutes today`}
      />
      <View style={styles.secondaryRow}>
        {candidates.length > 1 && (
          <Button label="Show another option" variant="ghost" size="sm" onPress={showNextCandidate} style={styles.secondaryButton} />
        )}
        <Button label="Keep today as planned" variant="ghost" size="sm" onPress={keepAsPlanned} disabled={busy} style={styles.secondaryButton} />
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
  note: { marginTop: spacing.md },
  primaryButton: { marginTop: spacing.lg },
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
