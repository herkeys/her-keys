import { StyleSheet } from 'react-native';
import { AppText, Button, Card, Overline, Screen } from '../../../src/design/components';
import { color, spacing } from '../../../src/design/tokens';
import { SystemsHub } from '../../../src/features/systems/ui/SystemsHub';
import { useEntitlement } from '../../../src/monetization/RevenueCatProvider';
import { HER_KEYS_PREMIUM_DISPLAY_NAME } from '../../../src/monetization/entitlement';
import { PaywallNoticeView } from '../../../src/monetization/PaywallNoticeView';
import { usePaywallAction } from '../../../src/monetization/usePaywallAction';

/**
 * The Systems tab: the hub of the household's reusable Systems. The Her Keys Premium entry below it is the existing
 * monetization card; every way its paywall can end now has words (unavailable, failed, cancelled), where it used to be silent.
 */
export default function SystemsScreen() {
  const { isPlus } = useEntitlement();
  const paywall = usePaywallAction('systems_upgrade');

  return (
    <Screen>
      <SystemsHub />

      {!isPlus && (
        <Card tone="subtle" style={styles.upgrade}>
          <Overline>{HER_KEYS_PREMIUM_DISPLAY_NAME}</Overline>
          <AppText variant="supporting" color={color.text.secondary} style={styles.upgradeCopy}>
            More of Her Keys' intelligence is on the way.
          </AppText>
          <Button
            label={`Learn about ${HER_KEYS_PREMIUM_DISPLAY_NAME}`}
            variant="secondary"
            size="sm"
            style={styles.upgradeButton}
            disabled={paywall.presenting}
            onPress={() => void paywall.present()}
          />
          <PaywallNoticeView notice={paywall.notice} style={styles.upgradeNotice} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  upgrade: { marginTop: spacing.xxl },
  upgradeCopy: { marginTop: spacing.xs, marginBottom: spacing.md },
  upgradeButton: { alignSelf: 'flex-start' },
  upgradeNotice: { marginTop: spacing.md },
});
