import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaywallOutcome, PaywallPlacement } from './entitlement';
import { paywallNoticeFor, type PaywallNotice } from './paywallFeedback';
import { useEntitlement } from './RevenueCatProvider';
import { usePremiumStateIfMounted } from './PremiumStateProvider';
import { premiumLaunchState } from './premiumLaunchState';

export interface PaywallActionApi {
  /** Opens the paywall for this placement. Resolves to how it ended, or `null` if a presentation was already in flight. */
  present: () => Promise<PaywallOutcome | null>;
  presenting: boolean;
  /** The words for how the last presentation ended; cleared when the next one starts. */
  notice: PaywallNotice | null;
}

/**
 * A Premium control's whole behaviour in one place: open the paywall through the entitlement boundary, never twice at once, and
 * always end in words (see `paywallNoticeFor`). A paywall that throws is reported as a failed paywall, never left silent and
 * never allowed to reject into an event handler. Nothing here grants anything: success is whatever the provider's canonical
 * CustomerInfo refresh says.
 */
export function usePaywallAction(placement: PaywallPlacement): PaywallActionApi {
  const { presentPaywall } = useEntitlement();
  const premium = usePremiumStateIfMounted();
  const readiness = premiumLaunchState(premium?.snapshot.manifest ?? null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [presenting, setPresenting] = useState(false);
  const [notice, setNotice] = useState<PaywallNotice | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const present = useCallback(async (): Promise<PaywallOutcome | null> => {
    if (inFlight.current) return null;
    if (!readiness.ready) {
      if (mounted.current) setNotice({
        tone: 'attention',
        message: 'Premium plans are not available for purchase here yet. Nothing has changed and your Free tools still work.',
      });
      return { kind: 'unavailable' };
    }
    inFlight.current = true;
    setPresenting(true);
    setNotice(null);
    let outcome: PaywallOutcome;
    try {
      outcome = await presentPaywall(placement);
    } catch {
      outcome = { kind: 'error', message: 'paywall_threw' };
    } finally {
      inFlight.current = false;
    }
    if (mounted.current) {
      setPresenting(false);
      setNotice(paywallNoticeFor(outcome));
    }
    return outcome;
  }, [placement, presentPaywall, readiness.ready]);

  return { present, presenting, notice };
}
