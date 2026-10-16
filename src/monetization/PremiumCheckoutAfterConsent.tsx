import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../design/components';
import { spacing } from '../design/tokens';
import type { PaywallOutcome, PremiumChoice } from './entitlement';
import { PaywallNoticeView } from './PaywallNoticeView';
import { paywallNoticeFor, type PaywallNotice } from './paywallFeedback';

/**
 * Acts on the Premium decision made on the welcome tree — at the one moment it is safe to.
 *
 * Checkout is offered only when ALL of these hold, and this component is the only place it can happen:
 *   1. the account is bound (`accountBound`): ownership of this household is established, and RevenueCat has already been
 *      logged in to that account's UUID (the runtime identifies before it publishes a bound account), so a purchase can only
 *      ever belong to the account that makes it. There is no anonymous purchase and nothing to transfer;
 *   2. the mandatory consent is complete: the app mounts this component INSIDE the consent gate, so it does not exist until
 *      the Terms, Privacy, age and AI decisions are saved and the optional permissions step is done;
 *   3. a "premium" intent was recorded. A "free" intent, or none, offers nothing.
 *
 * The intent is consumed exactly once. Whatever the checkout does — purchase, dismissal, an unavailable offering, an error — it
 * never blocks the app: the children render at all times, and RevenueCat's own paywall presents over them. She chose Premium, so
 * however the checkout ends she is told in words (a dismissible banner over the app): an unavailable offering or a failed paywall
 * used to end in silence.
 *
 * `present` and `onSettled` are supplied by the app (`app/_layout.tsx`), which keeps this component free of the RevenueCat SDK
 * and testable without a store.
 */
export function PremiumCheckoutAfterConsent({
  accountBound,
  deferred = false,
  choice,
  present,
  onSettled,
  children,
}: {
  accountBound: boolean;
  /** True while the new user is still inside the Life Systems Audit: the intent is kept and the final onboarding step presents instead. */
  deferred?: boolean;
  choice: PremiumChoice | null;
  present: () => Promise<PaywallOutcome>;
  onSettled: () => void;
  children: ReactNode;
}) {
  const presentRef = useRef(present);
  presentRef.current = present;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const running = useRef(false);
  const [notice, setNotice] = useState<PaywallNotice | null>(null);
  const insets = useSafeAreaInsets();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (choice === null) {
      running.current = false;
      return;
    }
    if (!accountBound || deferred || running.current) return;
    running.current = true;
    void (async () => {
      try {
        if (choice === 'premium') {
          const outcome = await presentRef.current();
          if (mounted.current) setNotice(paywallNoticeFor(outcome));
        }
      } catch {
        // A checkout problem is never allowed to get in her way; she can still choose Premium later from the app.
        if (mounted.current) setNotice(paywallNoticeFor({ kind: 'error', message: 'checkout_threw' }));
      } finally {
        settledRef.current();
      }
    })();
  }, [accountBound, deferred, choice]);

  return (
    <>
      {children}
      {notice !== null ? (
        // Under the status bar, over the header: never over the tab bar or an onboarding screen's Continue button.
        <View style={[styles.banner, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
          <PaywallNoticeView notice={notice} />
          <Button label="Dismiss" variant="ghost" size="sm" onPress={() => setNotice(null)} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', left: spacing.lg, right: spacing.lg, gap: spacing.sm },
});
