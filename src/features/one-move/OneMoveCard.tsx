import { StyleSheet, View } from 'react-native';
import { AppText, Card, InsightBlock, Overline, RecommendationBlock, WhyThis } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import { useOneMove } from '../../store/OneMoveContext';

/**
 * The One Move surface, rendered entirely in the permanent intelligence
 * language (K3): a recommendation is a RECOMMENDATION until she acts — the
 * completed One Move is her DECISION (the ActionRecord), never the move
 * itself (semantics.ts). Withholding is Her Keys noticing the day is full,
 * so it gets the selective insight treatment rather than an action color.
 */
export function OneMoveCard() {
  const { status, move, complete } = useOneMove();

  if (status === 'completed') {
    return (
      <Card tone="success" style={styles.card}>
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
  if (status === 'withheld') {
    return (
      <View style={styles.card}>
        <InsightBlock>Today is already full, so Her Keys isn’t adding anything.</InsightBlock>
      </View>
    );
  }

  if (status !== 'selected' || !move) {
    return (
      <Card tone="subtle" style={styles.card}>
        <Overline>No one move today</Overline>
      </Card>
    );
  }

  return (
    <View style={styles.card}>
      <RecommendationBlock
        body={move.action}
        approvalRequired={false}
        actionLabel="I did it"
        meta={move.estimatedMinutes != null ? `ABOUT ${move.estimatedMinutes} MINUTES` : undefined}
        onApprove={complete}
      />
      <WhyThis reasons={[move.observation]} style={styles.evidence} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xxl },
  action: { marginTop: spacing.md },
  note: { marginTop: spacing.sm },
  evidence: { marginTop: spacing.md },
});
