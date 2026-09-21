import { StyleSheet, View } from 'react-native';
import { AppText, Overline, SegmentBar } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import { useSchedule } from '../../store/ScheduleContext';
import { describeLoad } from './describeLoad';

export function LoadMeter() {
  const { events, tasks, assessment, issues } = useSchedule();
  const load = describeLoad(events, tasks, assessment, issues);
  // Capacity is informational state, not an action (owner decision 4): the
  // segments fill with neutral ink, never the clay accent. When the day is
  // tight or full, the LABEL carries an amber status signal — wording plus
  // color, and a status color, not the action color.
  const tight = load.level === 'tight' || load.level === 'full';
  const valueColor = tight ? color.status.attention : color.text.primary;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`Estimated load: ${load.label}. ${load.caption}`}
    >
      <View style={styles.header}>
        <Overline>Estimated load</Overline>
        <AppText variant="bodyStrong" color={valueColor}>
          {load.label}
        </AppText>
      </View>
      <SegmentBar filled={load.filled} total={load.total} tone="neutral" />
      <AppText variant="caption" color={color.text.muted} style={styles.caption}>
        {load.caption}
      </AppText>
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
});
