import { StyleSheet, View } from 'react-native';
import { Overline, StatusList } from '../../design/components';
import { spacing } from '../../design/tokens';
import { CategoryTaskList } from '../life/CategoryTaskList';
import { useHousehold } from '../../store/useHousehold';

export function MoneyOverview() {
  const { systems, categoryIdForRole } = useHousehold();
  const moneyCategoryId = categoryIdForRole('money');
  const moneySystems = systems.filter((s) => s.categoryId === moneyCategoryId);

  return (
    <View>
      <Overline style={styles.label}>Needs a decision</Overline>
      <CategoryTaskList categoryId={moneyCategoryId} emptyLabel="Nothing financial needs attention today." />

      <Overline style={styles.labelSpaced}>Running without you</Overline>
      <StatusList items={moneySystems.map((s) => ({ key: s.id, label: s.name, value: 'Working' }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.md },
  labelSpaced: { marginTop: spacing.xxl, marginBottom: spacing.md },
});
