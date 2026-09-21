import { StyleSheet, View } from 'react-native';
import { AppText, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { CategoryTaskList } from '../life/CategoryTaskList';
import { useSchedule } from '../../store/ScheduleContext';
import { useHousehold } from '../../store/useHousehold';
import { childDayRows } from './childDay';

export function KidsOverview() {
  const { events, tasks } = useSchedule();
  const { children, categoryIdForRole } = useHousehold();
  const kidsCategoryId = categoryIdForRole('kids');
  const rows = childDayRows(children, events, tasks);

  return (
    <View>
      <Overline style={styles.label}>Today</Overline>
      {rows.length > 0 ? (
        <StatusList items={rows} />
      ) : (
        <AppText variant="body" color={colors.textSecondary}>
          No children saved yet.
        </AppText>
      )}

      <Overline style={styles.labelSpaced}>On your list</Overline>
      <CategoryTaskList categoryId={kidsCategoryId} emptyLabel="Nothing kids-related on your list." />

      <AppText variant="caption" color={colors.textTertiary} style={styles.note}>
        Kids feeds the same picture Her Keys uses on Today.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.md },
  labelSpaced: { marginTop: spacing.xxl, marginBottom: spacing.md },
  note: { marginTop: spacing.xl },
});
