import { StyleSheet, View } from 'react-native';
import { AppText, Card, Overline } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useHousehold } from '../../store/useHousehold';

export function SystemsList() {
  const { systems, categoryName } = useHousehold();

  return (
    <View style={styles.list}>
      {systems.map((system) => (
        <Card key={system.id} tone="surface">
          <View style={styles.header}>
            <Overline>{categoryName(system.categoryId)}</Overline>
            <AppText variant="micro" color={colors.accent}>
              WORKING
            </AppText>
          </View>
          <AppText variant="title" style={styles.name}>
            {system.name}
          </AppText>
          <AppText variant="bodySm" color={colors.textSecondary} style={styles.description}>
            {system.description}
          </AppText>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { marginTop: spacing.md },
  description: { marginTop: spacing.xs },
});
