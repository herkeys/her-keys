import { StyleSheet, View } from 'react-native';
import { AppText, Overline, SegmentBar } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useSchedule } from '../../store/ScheduleContext';
import { describeLoad } from './describeLoad';

export function LoadMeter() {
  const { events, tasks, assessment, issues } = useSchedule();
  const load = describeLoad(events, tasks, assessment, issues);
  const tone = load.level === 'tight' || load.level === 'full' ? 'attention' : 'accent';
  const valueColor = tone === 'attention' ? colors.attention : colors.accent;

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
      <SegmentBar filled={load.filled} total={load.total} tone={tone} />
      <AppText variant="caption" color={colors.textTertiary} style={styles.caption}>
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
