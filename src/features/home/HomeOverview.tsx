import { StyleSheet, View } from 'react-native';
import { householdSystems } from '../../data/seed/systems';
import { AppText, Card, Overline } from '../../design/components';
import { colors, spacing } from '../../design/tokens';

export function HomeOverview() {
  const homeSystems = householdSystems.filter((s) => s.domain === 'home');

  return (
    <View>
      <Overline style={styles.label}>Running in the background</Overline>
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
  list: { gap: spacing.md },
  description: { marginTop: spacing.xs },
  note: { marginTop: spacing.xl },
});
