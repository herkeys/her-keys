import { useEffect, useRef, type ReactNode } from 'react';
import type { PaywallOutcome, PremiumChoice } from './entitlement';

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
 * never blocks the app: the children render at all times, and RevenueCat's own paywall presents over them.
 *
 * `present` and `onSettled` are supplied by the app (`app/_layout.tsx`), which keeps this component free of the RevenueCat SDK
 * and testable without a store.
 */
export function PremiumCheckoutAfterConsent({
  accountBound,
  choice,
  present,
  onSettled,
  children,
}: {
  accountBound: boolean;
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

  useEffect(() => {
    if (choice === null) {
      running.current = false;
      return;
    }
    if (!accountBound || running.current) return;
    running.current = true;
    void (async () => {
      try {
        if (choice === 'premium') await presentRef.current();
      } catch {
        // A checkout problem is never allowed to get in her way; she can still choose Premium later from the app.
      } finally {
        settledRef.current();
      }
    })();
  }, [accountBound, choice]);

  return <>{children}</>;
}
