import type { EntitlementStatus } from './RevenueCatProvider';
import type { PremiumSnapshot } from './premiumController';
import { isEntitledState, type GateDecision } from './premiumTypes';

/**
 * ONE unified answer to "what can she do with this Premium feature right now?", for every Premium pillar.
 *
 * It is a pure function of: whether an account is bound, what the SERVER last said (entitlement, display manifest, the latest
 * authorization decision for THIS feature), and what the store SDK hints. The SDK is only ever a hint that makes the app verify; it
 * can never produce `entitled` by itself. `entitled` here means the server's projection says so — and even then a protected
 * operation is authorized by the server again when it actually runs.
 */
export type PremiumFeatureState =
  | { kind: 'signed_out' }
  | { kind: 'loading' }
  | { kind: 'entitled'; subscription: 'active' | 'canceled' | 'grace'; endsOn: string | null }
  | { kind: 'free_allowance' }
  | { kind: 'upgrade_required' }
  | { kind: 'verification_pending'; cause: 'checking' | 'delayed' | 'account_mismatch' | 'outage'; canRetry: boolean }
  | { kind: 'subscription_expired'; revoked: boolean }
  | { kind: 'feature_unavailable'; cause: 'disabled' | 'service' | 'update_app' | 'ownership' | 'busy' }
  | { kind: 'consent_required' }
  | { kind: 'usage_limit_reached'; resetsOn: string | null; canUpgrade: boolean }
  | { kind: 'account_deactivated' };

export interface FeatureStateInput {
  accountBound: boolean;
  featureKey: string;
  snapshot: PremiumSnapshot;
  /** The store SDK's hint (RevenueCat `CustomerInfo`). Never authority. */
  storeStatus: EntitlementStatus;
  /** The most recent server decision for THIS feature and THIS account, if one has been made since the last server-state change. */
  decision: GateDecision | null;
}

/** Decision reasons that are about the SUBSCRIPTION: they go stale the moment the server's own state says entitled. */
const SUBSCRIPTION_REASONS = new Set(['requires_premium', 'entitlement_unknown', 'entitlement_expired']);

export function deriveFeatureState(input: FeatureStateInput): PremiumFeatureState {
  const { accountBound, featureKey, snapshot, storeStatus, decision } = input;
  if (!accountBound || snapshot.accountId === null) return { kind: 'signed_out' };

  const server = snapshot.server;
  if (server?.state === 'deletion_pending') return { kind: 'account_deactivated' };

  const entitled = server !== null && isEntitledState(server.state);

  // A decision the server actually MADE about this operation outranks any inference, except subscription reasons that the
  // server's newer state has already overtaken.
  if (decision !== null && decision.outcome === 'denied' && !(entitled && SUBSCRIPTION_REASONS.has(decision.reason))) {
    switch (decision.reason) {
      case 'requires_ai_consent':
        return { kind: 'consent_required' };
      case 'quota_exhausted':
        return { kind: 'usage_limit_reached', resetsOn: decision.quota?.periodEnd ?? null, canUpgrade: decision.nextAction === 'open_paywall' };
      case 'feature_disabled':
        return { kind: 'feature_unavailable', cause: decision.nextAction === 'update_app' ? 'update_app' : 'disabled' };
      case 'service_unavailable':
        return { kind: 'feature_unavailable', cause: 'service' };
      case 'rate_limited':
        return { kind: 'feature_unavailable', cause: 'busy' };
      case 'ownership_denied':
        return { kind: 'feature_unavailable', cause: 'ownership' };
      case 'account_deactivated':
        return { kind: 'account_deactivated' };
      case 'invalid_request':
        return { kind: 'feature_unavailable', cause: 'service' };
      default:
        break; // the subscription reasons: fall through to the server-state reading below
    }
  }

  const entry = snapshot.manifest?.find((item) => item.featureKey === featureKey);
  if (entry !== undefined && !entry.available) return { kind: 'feature_unavailable', cause: 'disabled' };

  if (server !== null && entitled) {
    if (decision !== null && decision.outcome === 'allowed' && decision.via === 'free_allowance') return { kind: 'free_allowance' };
    return {
      kind: 'entitled',
      subscription: server.state === 'premium_billing_grace' ? 'grace' : server.state === 'premium_canceled_active' ? 'canceled' : 'active',
      endsOn: server.state === 'premium_billing_grace' ? server.graceExpiresAt : server.expiresAt,
    };
  }
  if (decision !== null && decision.outcome === 'allowed' && decision.via === 'free_allowance') return { kind: 'free_allowance' };

  if (server === null) {
    if (snapshot.load === 'idle' || snapshot.load === 'loading') return { kind: 'loading' };
    // The server could not be reached. If the store says she paid, she is waiting on verification; otherwise the feature is simply
    // unavailable for now. Free features are never routed through here.
    return storeStatus === 'plus'
      ? { kind: 'verification_pending', cause: 'outage', canRetry: snapshot.verification !== 'checking' }
      : { kind: 'feature_unavailable', cause: 'service' };
  }

  // The server answered and says she is not entitled.
  if (snapshot.verification === 'checking') return { kind: 'verification_pending', cause: 'checking', canRetry: false };

  if (storeStatus === 'plus') {
    // The store says paid; the server disagrees. That is verification in progress, delayed, an outage, or a purchase on a different account.
    if (snapshot.lastVerify === 'provider_unavailable' || snapshot.lastVerify === 'unreachable') return { kind: 'verification_pending', cause: 'outage', canRetry: true };
    if (snapshot.lastVerify === 'reconciled' && (server.state === 'free' || server.state === 'unknown')) {
      return { kind: 'verification_pending', cause: 'account_mismatch', canRetry: true };
    }
    return { kind: 'verification_pending', cause: snapshot.verification === 'idle' ? 'checking' : 'delayed', canRetry: snapshot.verification !== 'idle' };
  }

  if (server.state === 'premium_expired') return { kind: 'subscription_expired', revoked: false };
  if (server.state === 'premium_revoked') return { kind: 'subscription_expired', revoked: true };
  if (storeStatus === 'loading') return { kind: 'loading' };
  if (storeStatus === 'unknown') return { kind: 'feature_unavailable', cause: 'service' };
  return { kind: 'upgrade_required' };
}

export function isUsable(state: PremiumFeatureState): boolean {
  return state.kind === 'entitled' || state.kind === 'free_allowance';
}
