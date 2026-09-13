import { StyleSheet, View } from 'react-native';
import { todaysTasks } from '../../data/seed/schedule';
import { householdSystems } from '../../data/seed/systems';
import { AppText, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';

export function MoneyOverview() {
  const moneyTasks = todaysTasks.filter((t) => t.domain === 'money');
  const moneySystems = householdSystems.filter((s) => s.domain === 'money');

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
