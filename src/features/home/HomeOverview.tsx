import { StyleSheet, View } from 'react-native';
import { AppText, Card, Overline } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { CategoryTaskList } from '../life/CategoryTaskList';
import { useHousehold } from '../../store/useHousehold';

export function HomeOverview() {
  const { systems, categoryIdForRole } = useHousehold();
  const homeCategoryId = categoryIdForRole('home');
  const homeSystems = systems.filter((s) => s.categoryId === homeCategoryId);

  return (
    <View>
      <Overline style={styles.label}>On your list</Overline>
      <CategoryTaskList categoryId={homeCategoryId} emptyLabel="Nothing home-related on your list." />

      <Overline style={styles.labelSpaced}>Running in the background</Overline>
      <View style={styles.list}>
        {homeSystems.map((system) => (
          <Card key={system.id} tone="surface">
            <AppText variant="title">{system.name}</AppText>
            <AppText variant="bodySm" color={colors.textSecondary} style={styles.description}>
              {system.description}
            </AppText>
          </Card>
        ))}
      </View>
      <AppText variant="caption" color={colors.textTertiary} style={styles.note}>
        Her Keys preserves what already works instead of replacing it.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.md },
  labelSpaced: { marginTop: spacing.xxl, marginBottom: spacing.md },
  list: { gap: spacing.md },
  description: { marginTop: spacing.xs },
  note: { marginTop: spacing.xl },
});
