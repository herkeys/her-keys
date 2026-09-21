import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, InsightBlock, Overline, RecommendationBlock, WhyThis } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import type { OneMoveCompletion, OneMoveSection } from '../today/model';
import { TodayDisclosure } from '../today/TodayDisclosure';
import { TodaySourceLine } from '../today/TodaySourceLine';

/**
 * What "I did it" will actually change, said plainly. A kind with no completion effect of its own is
 * never presented as finishing a row: it records that she did it, and nothing else changes.
 */
const COMPLETION_TEXT: Record<OneMoveCompletion, string> = {
  completes_task: 'Marking it done also completes the task on your list.',
  resolves_needs_me: 'Marking it done also resolves that item.',
  records_only: 'Marking it done records that you did it. Nothing else changes.',
};

/**
 * The One Move surface, rendered entirely in the permanent intelligence language (K3): a
 * recommendation is a RECOMMENDATION until she acts — the completed One Move is her DECISION (the
 * ActionRecord), never the move itself (semantics.ts). Withholding is Her Keys noticing the day is
 * full, so it gets the selective insight treatment rather than an action color.
 *
 * The view model decides which of the lifecycle's presentations this is (`selected`, `completed`,
 * `withheld`; "no decision" renders nothing at all, and yesterday's decision is never today's).
 * First glance is the recommendation and the button. "See why" opens the reasons — each re-checked
 * against the row, from the stored evidence links, never a transcript — and, one level deeper, the
 * structured evidence, where it came from, and a way to open the item and correct it.
 *
 * There is deliberately no "not today" and no "show another": no domain mutation exists for either
 * (MP-02), so no affordance implies one.
 */
export function OneMoveCard({ section, onComplete }: { section: OneMoveSection; onComplete: () => void }) {
  if (section.status === 'completed') {
    return (
      <Card tone="success">
        <Overline color={color.status.success}>One move</Overline>
        <AppText variant="sectionTitle" style={styles.action}>
          Done. That’s enough for today.
        </AppText>
        <AppText variant="supporting" color={color.text.secondary} style={styles.note}>
          Her Keys won’t ask for anything else.
        </AppText>
      </Card>
    );
  }

  // Not adding another obligation can be the right move (HER_KEYS_PRODUCT.md section 7).
  if (section.status === 'withheld') {
    return <InsightBlock>Today is already full, so Her Keys isn’t adding anything.</InsightBlock>;
  }

  const { action, estimatedMinutes, why, source, open, completion } = section;
  if (action === null) return null;

  return (
    <View>
      <RecommendationBlock
        body={action}
        approvalRequired={false}
        actionLabel="I did it"
        meta={estimatedMinutes != null ? `ABOUT ${estimatedMinutes} MINUTES` : undefined}
        onApprove={onComplete}
      />
      {source?.uncertain ? <TodaySourceLine source={source} /> : null}
      {why ? (
        <View style={styles.why}>
          <TodayDisclosure title="See why">
            <WhyThis reasons={why.reasons} />
            {completion ? (
              <AppText variant="supporting" color={color.text.secondary} style={styles.completion}>
                {COMPLETION_TEXT[completion]}
              </AppText>
            ) : null}
            {why.evidence.length > 0 || source || open ? (
              <View style={styles.deeper}>
                <TodayDisclosure title="Evidence and source">
                  {why.evidence.map((row) => (
                    <AppText key={`${row.code}:${row.aboutTitle ?? ''}`} variant="supporting" color={color.text.secondary} style={styles.evidenceRow}>
                      {row.aboutTitle ? `${row.label} — ${row.aboutTitle}` : row.label}
                    </AppText>
                  ))}
                  {source ? <TodaySourceLine source={source} always /> : null}
                  {open ? (
                    <Button label="Open it" variant="ghost" size="sm" onPress={() => router.push(open)} accessibilityHint="Opens it so you can check or change it" style={styles.open} />
                  ) : null}
                </TodayDisclosure>
              </View>
            ) : null}
          </TodayDisclosure>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: spacing.md },
  note: { marginTop: spacing.sm },
  why: { marginTop: spacing.xs },
  completion: { marginTop: spacing.md },
  deeper: { marginTop: spacing.sm },
  evidenceRow: { marginTop: spacing.xs },
  open: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
