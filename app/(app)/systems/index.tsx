import { StyleSheet } from 'react-native';
import { AppText, Button, Card, Overline, Screen } from '../../../src/design/components';
import { spacing } from '../../../src/design/tokens';
import { useTheme } from '../../../src/design/theme';
import { SystemsHub } from '../../../src/features/systems/ui/SystemsHub';
import { useEntitlement } from '../../../src/monetization/RevenueCatProvider';
import { HER_KEYS_PREMIUM_DISPLAY_NAME } from '../../../src/monetization/entitlement';
import { PaywallNoticeView } from '../../../src/monetization/PaywallNoticeView';
import { usePaywallAction } from '../../../src/monetization/usePaywallAction';
import { usePremiumStateIfMounted } from '../../../src/monetization/PremiumStateProvider';
import { premiumLaunchState } from '../../../src/monetization/premiumLaunchState';

/**
 * The Systems tab: the hub of the household's reusable Systems. The Her Keys Premium entry below it is the existing
 * monetization card; every way its paywall can end now has words (unavailable, failed, cancelled), where it used to be silent.
 */
export default function SystemsScreen() {
  const { color } = useTheme();
  const { isPlus } = useEntitlement();
  const paywall = usePaywallAction('systems_upgrade');
  const premium = usePremiumStateIfMounted();
  const releaseReady = premiumLaunchState(premium?.snapshot.manifest ?? null).ready;
  // The paywall is a full-screen sheet while it is open; the control is only ever held for that one in-flight action.
  const busy = paywall.presenting;

  return (
    <Screen>
      <SystemsHub />

      {!isPlus && (
        <Card tone="subtle" style={styles.upgrade}>
          <Overline>{HER_KEYS_PREMIUM_DISPLAY_NAME}</Overline>
          <AppText variant="supporting" color={color.text.secondary} style={styles.upgradeCopy}>
            {releaseReady
              ? 'Daily Load reviews, Smart Inbox and Momentum are available with Her Keys Premium.'
              : 'Daily Load reviews, Smart Inbox and Momentum are being prepared for Premium. Free Systems remain available.'}
          </AppText>
          <Button
            label={`Learn about ${HER_KEYS_PREMIUM_DISPLAY_NAME}`}
            variant="secondary"
            size="sm"
            style={styles.upgradeButton}
            disabled={busy}
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
