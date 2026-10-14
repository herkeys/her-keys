import { ENTITLEMENT_KEY, type DeploymentEnvironment, type PremiumEnvironment, type Projection } from './types.ts';

/**
 * Parses RevenueCat's authenticated subscriber record (`GET /v1/subscribers/{app_user_id}`) into a projection.
 * This is the AUTHORITY for any ambiguity (late webhooks, transfers, aliases, restores, repair): it is read with the server-side
 * secret key for the exact App User ID, so it cannot be steered by anything the client or a webhook sender supplies.
 *
 * Every clock is set to the instant RevenueCat served the record: a webhook event generated before that instant is already
 * reflected in what we read (and is correctly treated as stale); one generated after it still applies.
 */
export type ParsedSubscriber = { ok: true; projection: Projection } | { ok: false; reason: 'invalid_response' };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const instant = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};
const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

/** The environment a deployment's projections default to when RevenueCat reports no subscription to take it from. */
export function defaultEnvironment(deployment: DeploymentEnvironment): PremiumEnvironment {
  return deployment === 'production' ? 'PRODUCTION' : 'SANDBOX';
}

export function parseSubscriberResponse(body: unknown, nowMs: number, deployment: DeploymentEnvironment): ParsedSubscriber {
  if (!isObject(body) || !isObject(body.subscriber)) return { ok: false, reason: 'invalid_response' };
  const subscriber = body.subscriber;
  const entitlements = isObject(subscriber.entitlements) ? subscriber.entitlements : {};
  const subscriptions = isObject(subscriber.subscriptions) ? subscriber.subscriptions : {};

  const requestMs = typeof body.request_date_ms === 'number' && Number.isFinite(body.request_date_ms) ? body.request_date_ms : nowMs;
  // RevenueCat's clock is the one that matters for "has it expired", but never trust a wildly different server clock over ours.
  const readMs = Math.abs(requestMs - nowMs) <= 10 * 60 * 1000 ? requestMs : nowMs;

  const base: Projection = {
    source: 'reconcile',
    environment: defaultEnvironment(deployment),
    product_id: null,
    store: null,
    has_entitlement: false,
    expires_at: null,
    grace_expires_at: null,
    canceled_at: null,
    billing_issue_at: null,
    revoked_at: null,
    expiration_confirmed_at: null,
    clocks: { expiry: readMs, cancel: readMs, billing: readMs, revoke: readMs, expired: readMs },
    last_event_ms: null,
    last_reconciled_at: new Date(readMs).toISOString(),
    needs_reconcile: false,
  };

  const entitlement = entitlements[ENTITLEMENT_KEY];
  if (!isObject(entitlement)) return { ok: true, projection: base };

  const productId = typeof entitlement.product_identifier === 'string' ? entitlement.product_identifier : null;
  const subscription = productId !== null && isObject(subscriptions[productId]) ? (subscriptions[productId] as Record<string, unknown>) : null;

  const expiresMs = instant(entitlement.expires_date); // null === a non-expiring entitlement
  const graceMs = instant(entitlement.grace_period_expires_date) ?? (subscription ? instant(subscription.grace_period_expires_date) : null);
  const purchaseMs = instant(entitlement.purchase_date);
  const refundedMs = subscription ? instant(subscription.refunded_at) : null;
  const inGrace = graceMs !== null && readMs <= graceMs;
  const lapsed = expiresMs !== null && readMs > expiresMs && !inGrace;

  return {
    ok: true,
    projection: {
      ...base,
      environment: subscription ? (subscription.is_sandbox === true ? 'SANDBOX' : 'PRODUCTION') : base.environment,
      product_id: productId,
      store: subscription && typeof subscription.store === 'string' ? subscription.store : null,
      has_entitlement: true,
      expires_at: iso(expiresMs),
      grace_expires_at: iso(graceMs),
      canceled_at: iso(subscription ? instant(subscription.unsubscribe_detected_at) : null),
      billing_issue_at: iso(subscription ? instant(subscription.billing_issues_detected_at) : null),
      // A refund counts only against the CURRENT purchase, not an earlier transaction of the same product.
      revoked_at: refundedMs !== null && (purchaseMs === null || refundedMs >= purchaseMs) ? iso(refundedMs) : null,
      expiration_confirmed_at: lapsed ? new Date(readMs).toISOString() : null,
    },
  };
}

/**
 * A reconcile result replaces the facts, but never rewinds the webhook high-water mark and never shortens a clock that a newer
 * event already advanced past the read instant.
 */
export function mergeReconciled(current: Projection | null, fresh: Projection): Projection {
  if (current === null) return fresh;
  const clocks = { ...fresh.clocks };
  for (const key of Object.keys(current.clocks) as Array<keyof typeof current.clocks>) {
    // An event NEWER than the read already folded in is kept as the clock: its field values are in `current`, not in the stale read.
    if ((current.clocks[key] ?? 0) > (clocks[key] ?? 0)) return { ...current, needs_reconcile: true, last_reconciled_at: fresh.last_reconciled_at };
  }
  return { ...fresh, clocks, last_event_ms: current.last_event_ms };
}
