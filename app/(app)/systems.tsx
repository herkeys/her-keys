import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, Screen } from '../../src/design/components';
import { colors, spacing } from '../../src/design/tokens';
import { SystemsList } from '../../src/features/systems/SystemsList';
import { useEntitlement } from '../../src/monetization/RevenueCatProvider';

export default function SystemsScreen() {
  const { isPlus, presentPaywall } = useEntitlement();

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="hero">Systems</AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.subtitle}>
          The routines already holding your household together. Her Keys protects these rather than replacing them.
        </AppText>
      </View>
      <SystemsList />

      {!isPlus && (
        <Card tone="subtle" style={styles.upgrade}>
          <Overline>Her Keys+</Overline>
          <AppText variant="bodySm" color={colors.textSecondary} style={styles.upgradeCopy}>
            More of Her Keys' intelligence is on the way.
          </AppText>
          <Button
            label="Learn about Her Keys+"
            variant="secondary"
            size="sm"
            style={styles.upgradeButton}
            onPress={() => void presentPaywall('systems_upgrade')}
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  subtitle: { marginTop: spacing.sm },
  upgrade: { marginTop: spacing.xxl },
  upgradeCopy: { marginTop: spacing.xs, marginBottom: spacing.md },
  upgradeButton: { alignSelf: 'flex-start' },
});
