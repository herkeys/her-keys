import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, PremiumBadge, Screen } from '../../src/design/components';
import { spacing } from '../../src/design/tokens';
import { useTheme } from '../../src/design/theme';
import { canResolveOnboardingPlus, HER_KEYS_PREMIUM_DISPLAY_NAME, PAYWALL_POLICY } from '../../src/monetization/entitlement';
import { PaywallNoticeView } from '../../src/monetization/PaywallNoticeView';
import { useEntitlement } from '../../src/monetization/RevenueCatProvider';
import { CAPABILITY_TEXT, PREMIUM_CAPABILITY_KEYS } from '../../src/monetization/premiumHomeCopy';
import { premiumLaunchState } from '../../src/monetization/premiumLaunchState';
import { usePremiumStateIfMounted } from '../../src/monetization/PremiumStateProvider';
import { usePaywallAction } from '../../src/monetization/usePaywallAction';
import { useOnboarding } from '../../src/store/OnboardingContext';
import { usePremiumIntent } from '../../src/store/PremiumIntentContext';

/**
 * The three implemented Stage 1 pillars come from the same descriptions as Your Account.
 * Availability is a separate SERVER decision: never advertise an unshipped feature as ready.
 * No subscription price or trial is embedded in this screen.
 */
/**
 * The final onboarding step. Her Keys owns navigation, placement and
 * fallback state here; RevenueCat owns the purchase/restore transaction
 * itself. Onboarding only becomes complete once this step resolves — see
 * `canResolveOnboardingPlus` for the one rule governing which resolutions
 * are allowed to.
 */
export default function HerKeysPlus() {
  const { colors } = useTheme();
  const { status } = useEntitlement();
  const paywall = usePaywallAction('onboarding_complete');
  const { complete } = useOnboarding();
  const intent = usePremiumIntent();
  const premium = usePremiumStateIfMounted();
  const release = premiumLaunchState(premium?.snapshot.manifest ?? null);
  const [busy, setBusy] = useState<'purchase' | 'continue' | null>(null);
  const [note, setNote] = useState<string | null>(null);
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

  // Premium chosen on the Welcome tree was only an intent. This is the one decision point it is acted on for a new user: after the
  // audit and profile, once, and the intent is spent either way so no second presentation can follow (see `deferred` in
  // PremiumCheckoutAfterConsent). Dismissing it leaves her on this screen with Continue, never blocked.
  const intentHandled = useRef(false);
  useEffect(() => {
    if (intent.choice === null || intentHandled.current) return;
    // A Premium choice made before account setup is not a purchase. Wait until the
    // server feature manifest settles before spending that intent, otherwise a
    // transient first-render "checking" result silently drops the only paywall.
    if (intent.choice === 'premium' && release.kind === 'checking') return;
    intentHandled.current = true;
    const wantsPremium = intent.choice === 'premium';
    intent.clear();
    if (wantsPremium && status !== 'plus') void onSeePlus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent.choice, release.kind]);

  if (status === 'plus') return null;

  const onSeePlus = async () => {
    if (!release.ready) {
      setNote(release.kind === 'checking'
        ? 'Checking whether Her Keys Premium is ready. You can continue Free while we check.'
        : 'Her Keys Premium is not yet available to purchase in this app. Your Free tools are ready to use.');
      return;
    }
    setBusy('purchase');
    setNote(null);
    // Every way the paywall can end (unavailable offering, failure, cancel) is worded by the hook's notice below.
    const outcome = await paywall.present();
    if (outcome?.kind === 'purchased' || outcome?.kind === 'restored') {
      await resolve(complete);
    }
    setBusy(null);
  };

  const onContinueWithoutPlus = async () => {
    if (!canResolveOnboardingPlus('continued_without_plus', PAYWALL_POLICY)) return;
    // Continuing Free also consumes a deferred Premium intent while the server
    // manifest is still loading; it may not open a delayed upsell in the main app.
    intentHandled.current = true;
    intent.clear();
    setBusy('continue');
    setNote(null);
    await resolve(complete);
    setBusy(null);
  };

  return (
    <Screen bottomClearance={spacing.xxl}>
      <PremiumBadge style={styles.badge} />
      <Overline>{HER_KEYS_PREMIUM_DISPLAY_NAME}</Overline>
      <AppText variant="hero" style={styles.title}>
        You’re ready to begin.
      </AppText>
      <AppText variant="title" color={colors.textSecondary} style={styles.lede}>
        Your Life Systems Audit is complete. You can start using Her Keys now.
      </AppText>

      <Card tone="subtle" style={styles.benefits}>
        <Overline>What Her Keys Premium adds</Overline>
        {PREMIUM_CAPABILITY_KEYS.map((key) => (
          <View key={key} style={styles.benefit}>
            <AppText variant="bodyStrong">{CAPABILITY_TEXT[key].name}</AppText>
            <AppText variant="bodySm" color={colors.textSecondary}>{CAPABILITY_TEXT[key].summary}</AppText>
          </View>
        ))}
      </Card>

      <AppText variant="bodySm" color={colors.textTertiary} style={styles.reassurance}>
        {release.kind === 'ready'
          ? 'These tools are now available for eligible Premium accounts. Premium is optional, and you can continue Free.'
          : release.kind === 'checking'
            ? 'Checking which Premium tools are available here. You can continue Free at any time.'
            : 'The Premium tools are being prepared for release. Nothing is purchased here, and you can continue Free.'}
      </AppText>

      <PaywallNoticeView notice={paywall.notice} style={styles.paywallNotice} />

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
        <Button label={`Explore ${HER_KEYS_PREMIUM_DISPLAY_NAME}`} onPress={onSeePlus} variant="secondary" disabled={busy !== null} />
        <Button
          label="Your Account & purchases"
          variant="ghost"
          onPress={() => router.push('/sign-in')}
          disabled={busy !== null}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { marginBottom: spacing.lg },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.md, marginBottom: spacing.xxl },
  benefits: { gap: spacing.sm },
  benefit: { gap: spacing.xs, marginTop: spacing.sm },
  reassurance: { marginTop: spacing.lg, marginBottom: spacing.xl },
  paywallNotice: { marginBottom: spacing.md },
  note: { marginBottom: spacing.md },
  actions: { gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.xxl },
});
