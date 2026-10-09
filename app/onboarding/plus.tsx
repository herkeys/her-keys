import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, Screen } from '../../src/design/components';
import { colors, spacing } from '../../src/design/tokens';
import { canResolveOnboardingPlus, HER_KEYS_PREMIUM_DISPLAY_NAME, PAYWALL_POLICY } from '../../src/monetization/entitlement';
import { useEntitlement } from '../../src/monetization/RevenueCatProvider';
import { useOnboarding } from '../../src/store/OnboardingContext';

const BENEFITS = [
  'Deeper household intelligence and pattern recognition',
  'More proactive planning and recommendations',
  'Enhanced Talk It Out and Life OS intelligence',
  'Future automation for repeatable work',
];

/**
 * The final onboarding step. Her Keys owns navigation, placement and
 * fallback state here; RevenueCat owns the purchase/restore transaction
 * itself. Onboarding only becomes complete once this step resolves — see
 * `canResolveOnboardingPlus` for the one rule governing which resolutions
 * are allowed to.
 */
export default function HerKeysPlus() {
  const { status, presentPaywall, restore } = useEntitlement();
  const { complete } = useOnboarding();
  const [busy, setBusy] = useState<'purchase' | 'restore' | 'continue' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [paywallUnavailable, setPaywallUnavailable] = useState(false);
  const resolving = useRef(false);

  const resolve = async (action: () => Promise<boolean>) => {
    if (resolving.current) return;
    resolving.current = true;
    if (!(await action())) {
      setNote('Her Keys couldn’t save that yet. Your setup is still here — try again.');
      resolving.current = false;
    }
  };

  // An already-entitled customer completes this final step without a second upsell.
  useEffect(() => {
    if (status === 'plus' && canResolveOnboardingPlus('already_entitled', PAYWALL_POLICY)) {
      void resolve(complete);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === 'plus') return null;

  const onSeePlus = async () => {
    setBusy('purchase');
    setNote(null);
    const outcome = await presentPaywall('onboarding_complete');
    if (outcome.kind === 'purchased' || outcome.kind === 'restored') {
      await resolve(complete);
    } else if (outcome.kind === 'no_offering' || outcome.kind === 'unavailable') {
      setPaywallUnavailable(true);
    } else if (outcome.kind === 'error') {
      setNote(`${HER_KEYS_PREMIUM_DISPLAY_NAME} couldn’t open right now. You can continue without it for now.`);
    }
    setBusy(null);
  };

  const onRestore = async () => {
    setBusy('restore');
    setNote(null);
    const outcome = await restore();
    if (outcome.kind === 'restored') {
      await resolve(complete);
    } else if (outcome.kind === 'no_purchases_found') {
      setNote(`No previous ${HER_KEYS_PREMIUM_DISPLAY_NAME} purchase was found on this device.`);
    } else {
      setNote('Her Keys couldn’t check for previous purchases right now.');
    }
    setBusy(null);
  };

  const onContinueWithoutPlus = async () => {
    if (!canResolveOnboardingPlus('continued_without_plus', PAYWALL_POLICY)) return;
    setBusy('continue');
    setNote(null);
    await resolve(complete);
    setBusy(null);
  };

  return (
    <Screen>
      <Overline>{HER_KEYS_PREMIUM_DISPLAY_NAME}</Overline>
      <AppText variant="hero" style={styles.title}>
        You’re ready to begin.
      </AppText>
      <AppText variant="title" color={colors.textSecondary} style={styles.lede}>
        Your Life Systems Audit is complete. You can start using Her Keys now.
      </AppText>

      <Card tone="subtle" style={styles.benefits}>
        <Overline>Your journey continues</Overline>
        {BENEFITS.map((benefit) => (
          <AppText key={benefit} variant="body" style={styles.benefit}>
            {benefit}
          </AppText>
        ))}
      </Card>

      <AppText variant="bodySm" color={colors.textTertiary} style={styles.reassurance}>
        Premium remains optional. You can explore plans again whenever you’re ready.
      </AppText>

      {note && (
        <AppText variant="bodySm" color={colors.textSecondary} style={styles.note} accessibilityRole="alert">
          {note}
        </AppText>
      )}

      <View style={styles.actions}>
        <Button
          label="Continue to Her Keys"
          onPress={onContinueWithoutPlus}
          disabled={busy !== null}
        />
        {!paywallUnavailable && (
          <Button label={`Explore ${HER_KEYS_PREMIUM_DISPLAY_NAME}`} onPress={onSeePlus} variant="secondary" disabled={busy !== null} />
        )}
        <Button
          label="Restore purchases"
          variant="ghost"
          onPress={onRestore}
          disabled={busy !== null}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.md, marginBottom: spacing.xxl },
  benefits: { gap: spacing.sm },
  benefit: { marginTop: spacing.sm },
  reassurance: { marginTop: spacing.lg, marginBottom: spacing.xl },
  note: { marginBottom: spacing.md },
  actions: { gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.xxl },
});
