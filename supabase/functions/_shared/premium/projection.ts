import { concernsPremium } from './events.ts';
import type { ClockKey, Clocks, NormalizedEvent, PremiumEnvironment, Projection } from './types.ts';

/**
 * Folds one RevenueCat event into the entitlement projection.
 *
 * Rules (docs/premium/PREMIUM_STAGE1_A0_ARCHITECTURE.md section 6):
 *  - PER-FIELD last-writer-wins by `event_timestamp_ms`. An older event never overwrites a newer fact, so arrival order is irrelevant
 *    to the result and a late RENEWAL cannot resurrect access that a newer REVOCATION removed.
 *  - Revocation clears ONLY when a purchase-class event is NEWER than the revocation.
 *  - A non-purchase event on an account with no entitlement basis is never allowed to invent one: it requests a reconcile instead.
 *  - Anything that history cannot safely resolve (transfers, pauses, refund reversals, unknown types, untimed events) is a reconcile
 *    request. Final authority for ambiguity is RevenueCat's own subscriber record, never webhook arrival order.
 */
export type Disposition =
  | 'applied'
  | 'stale'
  | 'reconcile_only'
  | 'ignored_test'
  | 'ignored_unknown'
  | 'ignored_entitlement';

export interface ApplyResult {
  disposition: Disposition;
  /** The projection to write (null when nothing is to be written). */
  projection: Projection | null;
  /** The account should be reconciled against RevenueCat's authenticated subscriber record. */
  reconcile: boolean;
}

const PURCHASE_CLASS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED', 'UNCANCELLATION']);
/** Purchase-class events that start a NEW paid period (and so may clear a billing issue or a revocation). */
const NEW_PERIOD = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE']);
const RECONCILE_ONLY = new Set([
  'TRANSFER',
  'SUBSCRIBER_ALIAS',
  'PURCHASE_REDEEMED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'NON_RENEWING_PURCHASE',
  'REFUND_REVERSED',
]);

const iso = (ms: number): string => new Date(ms).toISOString();

export function emptyProjection(environment: PremiumEnvironment): Projection {
  return {
    source: 'webhook',
    environment,
    product_id: null,
    store: null,
    has_entitlement: false,
    expires_at: null,
    grace_expires_at: null,
    canceled_at: null,
    billing_issue_at: null,
    revoked_at: null,
    expiration_confirmed_at: null,
    clocks: {},
    last_event_ms: null,
    last_reconciled_at: null,
    needs_reconcile: false,
  };
}

export function applyEvent(current: Projection | null, event: NormalizedEvent): ApplyResult {
  const type = event.event_type;
  if (type === 'TEST') return { disposition: 'ignored_test', projection: null, reconcile: false };

  const relevance = concernsPremium(event);
  if (relevance === 'no') return { disposition: 'ignored_entitlement', projection: null, reconcile: false };

  if (RECONCILE_ONLY.has(type)) return { disposition: 'reconcile_only', projection: null, reconcile: true };
  const known = PURCHASE_CLASS.has(type) || ['CANCELLATION', 'BILLING_ISSUE', 'EXPIRATION', 'SUBSCRIPTION_PAUSED'].includes(type);
  if (!known) return { disposition: 'ignored_unknown', projection: null, reconcile: false };

  const ts = event.event_timestamp_ms;
  // An event that cannot be ordered cannot be folded.
  if (ts === null) return { disposition: 'reconcile_only', projection: null, reconcile: true };

  const isPurchase = PURCHASE_CLASS.has(type);
  // A non-purchase fact with no entitlement basis to attach to: the purchase has not been seen yet (or never will be here).
  if (!isPurchase && (current === null || !current.has_entitlement)) {
    return { disposition: 'reconcile_only', projection: null, reconcile: true };
  }
  // A purchase-class event must say when the paid term ends, or it cannot grant: a missing expiry is NOT "lifetime".
  if (isPurchase && event.expiration_at_ms === null) return { disposition: 'reconcile_only', projection: null, reconcile: true };

  const next: Projection = current === null ? emptyProjection(event.environment) : { ...current, clocks: { ...current.clocks } };
  const clocks: Clocks = next.clocks;
  let changed = false;
  let reconcile = relevance === 'unspecified';
  const newer = (key: ClockKey): boolean => ts > (clocks[key] ?? 0);
  // Two events on the SAME instant that would set a field differently cannot be ordered: keep the first, and ask RevenueCat.
  const tiedAndDiffers = (key: ClockKey, differs: boolean): void => {
    if (ts === (clocks[key] ?? -1) && differs) reconcile = true;
  };
  const stamp = (key: ClockKey): void => {
    clocks[key] = ts;
    changed = true;
  };

  if (isPurchase) {
    if (newer('expiry')) {
      next.has_entitlement = true;
      next.expires_at = iso(event.expiration_at_ms as number);
      next.product_id = event.new_product_id ?? event.product_id ?? next.product_id;
      next.store = event.store ?? next.store;
      next.environment = event.environment;
      stamp('expiry');
    }
    if (type !== 'SUBSCRIPTION_EXTENDED') {
      if (newer('cancel')) {
        next.canceled_at = null;
        stamp('cancel');
      } else tiedAndDiffers('cancel', next.canceled_at !== null);
    }
    if (NEW_PERIOD.has(type)) {
      if (newer('billing')) {
        next.billing_issue_at = null;
        next.grace_expires_at = null;
        stamp('billing');
      } else tiedAndDiffers('billing', next.billing_issue_at !== null);
      // A fresh paid period supersedes an earlier "expired" observation.
      if (newer('expired')) {
        next.expiration_confirmed_at = null;
        stamp('expired');
      } else tiedAndDiffers('expired', next.expiration_confirmed_at !== null);
      // Revocation is cleared only by a NEWER purchase-class event, never by an older one arriving late.
      if (newer('revoke')) {
        next.revoked_at = null;
        stamp('revoke');
      } else tiedAndDiffers('revoke', next.revoked_at !== null);
    }
  } else if (type === 'CANCELLATION' || type === 'SUBSCRIPTION_PAUSED') {
    if (event.cancel_reason === 'CUSTOMER_SUPPORT') {
      // Documentation: cancellations also carry refunds (there is no REFUND type). Treat as revocation, then let RevenueCat confirm.
      if (newer('revoke')) {
        next.revoked_at = iso(ts);
        stamp('revoke');
      } else tiedAndDiffers('revoke', next.revoked_at === null);
      reconcile = true;
    } else if (newer('cancel')) {
      next.canceled_at = iso(ts);
      stamp('cancel');
    } else tiedAndDiffers('cancel', next.canceled_at === null);
    if (type === 'SUBSCRIPTION_PAUSED') reconcile = true;
  } else if (type === 'BILLING_ISSUE') {
    if (newer('billing')) {
      next.billing_issue_at = iso(ts);
      // Never invent a grace period: only the provider's own grace expiry counts, and null means none.
      next.grace_expires_at = event.grace_period_expiration_at_ms === null ? null : iso(event.grace_period_expiration_at_ms);
      stamp('billing');
    }
  } else if (type === 'EXPIRATION') {
    if (newer('expired')) {
      next.expiration_confirmed_at = iso(ts);
      stamp('expired');
    }
    if (event.expiration_reason === 'SUBSCRIPTION_PAUSED') reconcile = true;
  }

  if (!changed) return { disposition: 'stale', projection: null, reconcile };

  next.source = 'webhook';
  next.last_event_ms = Math.max(next.last_event_ms ?? 0, ts);
  if (reconcile) next.needs_reconcile = true;
  return { disposition: 'applied', projection: next, reconcile };
}
