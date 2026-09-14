import { StyleSheet, View } from 'react-native';
import { AppText, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useSchedule } from '../../store/ScheduleContext';
import { useHousehold } from '../../store/useHousehold';

export function MoneyOverview() {
  const { tasks } = useSchedule();
  const { systems, categoryIdForRole } = useHousehold();
  const moneyCategoryId = categoryIdForRole('money');
  const moneyTasks = tasks.filter((t) => t.categoryId === moneyCategoryId);
  const moneySystems = systems.filter((s) => s.categoryId === moneyCategoryId);

  return (
    <View>
      <Overline style={styles.label}>Needs a decision</Overline>
      {moneyTasks.length > 0 ? (
        <StatusList
          items={moneyTasks.map((task) => ({
            key: task.id,
            label: task.title,
            value: task.dueToday ? 'Due today' : 'Flexible',
            needsAttention: task.dueToday,
          }))}
        />
      ) : (
        <AppText variant="body" color={colors.textSecondary}>
          Nothing financial needs attention today.
        </AppText>
      )}

      <Overline style={styles.labelSpaced}>Running without you</Overline>
      <StatusList items={moneySystems.map((s) => ({ key: s.id, label: s.name, value: 'Working' }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.md },
  labelSpaced: { marginTop: spacing.xxl, marginBottom: spacing.md },
});
