import { StyleSheet } from 'react-native';
import { AppText, Card, Overline } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { tomorrowPreview as computeTomorrowPreview } from '../../domain/tomorrowPreview';
import { useHouseholdState } from '../../store/AppStateProvider';

/** A compact, read-only look at tomorrow. Never a second Today screen — one factual line. */
export function TomorrowPreview() {
  const { state, today } = useHouseholdState();
  // Read-only: `tomorrowPreview` never touches `nowMs`/`createId`, only `today`.
  const preview = computeTomorrowPreview(state, { nowMs: Date.now(), today, createId: () => '' });

  return (
    <Card tone="subtle" style={styles.card}>
      <Overline>Tomorrow</Overline>
      <AppText variant="body" color={colors.textSecondary} style={styles.headline}>
        {preview.headline}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xxl },
  headline: { marginTop: spacing.sm },
});
