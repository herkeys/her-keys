import type { PremiumSnapshot } from './premiumController';
import { deriveFeatureState } from './premiumFeatureState';
import type { EntitlementStatus } from './RevenueCatProvider';

/**
 * What the Premium home says about her subscription, as ONE state.
 *
 * It is derived by the same pure function every Premium feature uses (`deriveFeatureState`), with a key that is not a feature, so the
 * home and the features can never disagree about what the server said. The store SDK is only a hint that makes the app verify; it can
 * never produce an entitled state here. Nothing in this module grants anything.
 */
type PeriodDisplay = { periodType?: 'TRIAL' | 'INTRO' | 'NORMAL' | null; trialEndsOn?: string | null };
export type PremiumHomeState =
  | { kind: 'signed_out' }
  | { kind: 'loading' }
  | { kind: 'free' }
  | ({ kind: 'active'; endsOn: string | null } & PeriodDisplay)
  | ({ kind: 'canceled_active'; endsOn: string | null } & PeriodDisplay)
  | { kind: 'billing_grace'; endsOn: string | null }
  | { kind: 'verification_pending'; cause: 'checking' | 'delayed' | 'account_mismatch' | 'outage'; canRetry: boolean }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'unavailable' }
  | { kind: 'account_closing' };

export interface PremiumHomeInput {
  accountBound: boolean;
  snapshot: PremiumSnapshot;
  /** The store SDK's hint. Never authority. */
  storeStatus: EntitlementStatus;
}

/** A key no feature uses: the manifest has no entry for it, so a switched-off feature can never colour the home. */
const HOME_KEY = 'premium_home';

export function derivePremiumHomeState({ accountBound, snapshot, storeStatus }: PremiumHomeInput): PremiumHomeState {
  const state = deriveFeatureState({ accountBound, featureKey: HOME_KEY, snapshot, storeStatus, decision: null });
  switch (state.kind) {
    case 'signed_out':
      return { kind: 'signed_out' };
    case 'loading':
      return { kind: 'loading' };
    case 'account_deactivated':
      return { kind: 'account_closing' };
    case 'entitled':
      if (state.subscription === 'grace') return { kind: 'billing_grace', endsOn: state.endsOn };
      const period = snapshot.server?.periodType ? { periodType: snapshot.server.periodType, trialEndsOn: snapshot.server.trialEndsAt ?? null } : {};
      if (state.subscription === 'canceled') return { kind: 'canceled_active', endsOn: state.endsOn, ...period };
      return { kind: 'active', endsOn: state.endsOn, ...period };
    case 'verification_pending':
      return { kind: 'verification_pending', cause: state.cause, canRetry: state.canRetry };
    case 'subscription_expired':
      return state.revoked ? { kind: 'revoked' } : { kind: 'expired' };
    case 'upgrade_required':
      return { kind: 'free' };
    // `feature_unavailable` (the server or the store could not be reached) and the per-decision states, which a null decision never
    // produces: all read as "Premium can't be checked right now".
    default:
      return { kind: 'unavailable' };
  }
}

/** The server confirms she is entitled to NEW Premium work (active, canceled-but-paid, or in the provider's grace). */
export function isHomeEntitled(state: PremiumHomeState): boolean {
  return state.kind === 'active' || state.kind === 'canceled_active' || state.kind === 'billing_grace';
}
