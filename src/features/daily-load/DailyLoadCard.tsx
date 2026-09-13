import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, Tag } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useSchedule } from '../../store/ScheduleContext';

export function DailyLoadCard() {
  const { assessment, decision, candidateIndex, appliedRecommendation, showNextCandidate, moveRecommendedTask, keepAsPlanned } =
    useSchedule();

  if (decision === 'moved' && appliedRecommendation) {
    return (
      <Card tone="success" style={styles.card}>
        <Tag label="Adjusted" tone="success" />
        <AppText variant="headline" style={styles.headline}>
          “{appliedRecommendation.task.title}” moved to tomorrow.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
          That window now has {appliedRecommendation.projectedBufferMinutes} minutes instead of{' '}
          {appliedRecommendation.currentBufferMinutes} — enough room before {appliedRecommendation.windowAfterTitle}.
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

  if (assessment.status === 'balanced') {
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

  const candidate = assessment.candidates[candidateIndex];

  if (!candidate) {
    return (
      <Card tone="attention" raised style={styles.card}>
        <Tag label="Tight day ahead" tone="attention" />
        <AppText variant="headline" style={styles.headline}>
          Leave a few minutes early this afternoon.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.impact}>
          Only {assessment.bufferMinutes} minutes sit between {assessment.gap?.beforeTitle} and{' '}
          {assessment.gap?.afterTitle}, and nothing flexible is scheduled there to move.
        </AppText>
        <View style={styles.secondaryRow}>
          <Button label="Got it" variant="ghost" size="sm" onPress={keepAsPlanned} style={styles.secondaryButton} />
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
  secondaryRow: { flexDirection: 'row', marginTop: spacing.xs },
  secondaryButton: { flex: 1 },
});
