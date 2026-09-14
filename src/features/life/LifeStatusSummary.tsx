import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useSchedule } from '../../store/ScheduleContext';
import { clearCount, deriveLifeStatus } from './lifeStatus';

/**
 * Reassurance, not a dashboard: the point is that Her Keys already looked at
 * the rest of her life so she doesn't have to go check each area herself.
 */
export function LifeStatusSummary() {
  const { events, tasks } = useSchedule();
  const statuses = deriveLifeStatus(events, tasks);
  const clear = clearCount(statuses);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Overline>Also checked</Overline>
        <AppText variant="micro" color={colors.textTertiary}>
          {clear} of {statuses.length} clear
        </AppText>
      </View>
      <StatusList
        items={statuses.map((s) => ({
          key: s.key,
          label: s.label,
          value: s.value,
          needsAttention: s.needsAttention,
          // The Life stack may not exist yet when this is tapped from Today;
          // the anchor loads the hub beneath the screen instead of stranding it.
          onPress: () => router.push(s.route, { withAnchor: true }),
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
});
