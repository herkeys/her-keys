import { StyleSheet } from 'react-native';
import { AppText, Button, Card, Overline, Screen } from '../../../src/design/components';
import { color, spacing } from '../../../src/design/tokens';
import { SystemsHub } from '../../../src/features/systems/ui/SystemsHub';
import { useEntitlement } from '../../../src/monetization/RevenueCatProvider';

/**
 * The Systems tab: the hub of the household's reusable Systems. The Her Keys+ entry below it is the
 * existing monetization card, unchanged in behavior and wording.
 */
export default function SystemsScreen() {
  const { isPlus, presentPaywall } = useEntitlement();

  return (
    <Screen>
      <SystemsHub />

      {!isPlus && (
        <Card tone="subtle" style={styles.upgrade}>
          <Overline>Her Keys+</Overline>
          <AppText variant="supporting" color={color.text.secondary} style={styles.upgradeCopy}>
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
  upgrade: { marginTop: spacing.xxl },
  upgradeCopy: { marginTop: spacing.xs, marginBottom: spacing.md },
  upgradeButton: { alignSelf: 'flex-start' },
});
