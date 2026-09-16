import { StyleSheet, View } from 'react-native';
import { AppText, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { CategoryTaskList } from '../life/CategoryTaskList';
import { useSchedule } from '../../store/ScheduleContext';
import { useHousehold } from '../../store/useHousehold';
import { formatTime } from '../daily-load/computeDailyLoad';

export function WorkOverview() {
  const { events } = useSchedule();
  const { categoryIdForRole } = useHousehold();
  const workCategoryId = categoryIdForRole('work');
  const workEvents = events.filter((e) => e.categoryId === workCategoryId);

  return (
    <View>
      <Overline style={styles.label}>Today</Overline>
      {workEvents.length > 0 ? (
        <StatusList
          items={workEvents.map((e) => ({
            key: e.id,
            label: e.title,
            value: `${formatTime(e.startMinutes)}–${formatTime(e.endMinutes)}`,
          }))}
        />
      ) : (
        <AppText variant="body" color={colors.textSecondary}>
          Nothing on the work calendar today.
        </AppText>
      )}

      <Overline style={styles.labelSpaced}>On your list</Overline>
      <CategoryTaskList categoryId={workCategoryId} emptyLabel="Nothing work-related on your list today." />

      <AppText variant="caption" color={colors.textTertiary} style={styles.note}>
        Work hours shape how much room the rest of the day has.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.md },
  labelSpaced: { marginTop: spacing.xxl, marginBottom: spacing.md },
  note: { marginTop: spacing.xl },
});
