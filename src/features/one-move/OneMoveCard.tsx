import { StyleSheet, View } from 'react-native';
import { oneMove } from '../../data/seed/oneMove';
import { AppText, Button, Card, Overline } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useOneMove } from '../../store/OneMoveContext';

/**
 * Sage-tinted rather than amber: this is something Her Keys is offering, not
 * something demanding a decision. The action leads and the observation sits
 * underneath it, so it reads as an invitation rather than a diagnosis.
 */
export function OneMoveCard() {
  const { completed, complete } = useOneMove();

  if (completed) {
    return (
      <Card tone="accent" style={styles.card}>
        <Overline color={colors.accent}>One move</Overline>
        <AppText variant="title" style={styles.action}>
          Done. That’s enough for today.
        </AppText>
        <AppText variant="bodySm" color={colors.textSecondary} style={styles.note}>
          Her Keys won’t ask for anything else.
        </AppText>
      </Card>
    );
  }

  return (
    <Card tone="accent" style={styles.card}>
      <View style={styles.header}>
        <Overline color={colors.accent}>One move</Overline>
        <AppText variant="micro" color={colors.textTertiary}>
          ABOUT {oneMove.estimatedMinutes} MINUTES
        </AppText>
      </View>

      <AppText variant="title" style={styles.action}>
        {oneMove.action}
      </AppText>
      <AppText variant="bodySm" color={colors.textTertiary} style={styles.note}>
        {oneMove.observation}
      </AppText>

      <Button label="I did it" variant="secondary" size="sm" onPress={complete} style={styles.button} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  action: { marginTop: spacing.md },
  note: { marginTop: spacing.sm },
  button: { marginTop: spacing.lg, alignSelf: 'flex-start', paddingHorizontal: spacing.xxl },
});
