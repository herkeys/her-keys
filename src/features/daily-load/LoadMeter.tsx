import { StyleSheet, View } from 'react-native';
import { AppText, Overline, SegmentBar } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import type { LoadEstimate } from '../../types';

/**
 * A coarse, neutral read of the day's load, given by the Today view model (which took it
 * from `describeLoad`, the Daily Load tier). It is not a score and it has no percentage.
 * It renders only when the day has commitments to measure — the view model passes nothing
 * otherwise, so there is never an "Open — plenty of room" over an empty calendar.
 *
 * Capacity is informational state, not an action (owner decision 4): the segments fill with
 * neutral ink, never the clay accent. When the day is tight or full, the LABEL carries an amber
 * status signal — wording plus color, and a status color, not the action color.
 *
 * `note` is set only when the household has its own day settings that Daily Load does not yet
 * apply (TODAY-FD-001): the reading says which day it used.
 */
export function LoadMeter({ load, note }: { load: LoadEstimate; note?: string | null }) {
  const tight = load.level === 'tight' || load.level === 'full';
  const valueColor = tight ? color.status.attention : color.text.primary;

  return (
    <View style={styles.wrap}>
      <View accessible accessibilityLabel={`Estimated load: ${load.label}. ${load.caption}`}>
        <View style={styles.header}>
          <Overline>Estimated load</Overline>
          <AppText variant="bodyStrong" color={valueColor}>
            {load.label}
          </AppText>
        </View>
        <SegmentBar filled={load.filled} total={load.total} tone="neutral" />
        <AppText variant="metadata" color={color.text.muted} style={styles.caption}>
          {load.caption}
        </AppText>
      </View>
      {note ? (
        <AppText variant="metadata" color={color.text.muted} style={styles.note}>
          {note}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  caption: { marginTop: spacing.sm },
  note: { marginTop: spacing.sm },
});
