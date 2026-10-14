import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { deriveEntitlementState, isEntitled } from '../../supabase/functions/_shared/premium/entitlementState.ts';
import { parseWebhookBody } from '../../supabase/functions/_shared/premium/events.ts';
import { applyEvent } from '../../supabase/functions/_shared/premium/projection.ts';
import { DAY, NOW, bytes, rcBody } from '../support/premium/harness.mjs';

/** One normalised event, via the real parser (so these tests also prove the parser feeds the fold correctly). */
const ev = (type, tOffsetMs, extra = {}) => {
  const parsed = parseWebhookBody(bytes(rcBody({ type, event_timestamp_ms: NOW + tOffsetMs, ...extra })));
  assert.equal(parsed.ok, true);
  return parsed.event;
};

/** Folds events in the order given; returns the projection and whether any step asked for a reconcile. */
function fold(events, start = null) {
  let projection = start;
  let reconcile = false;
  const dispositions = [];
  for (const event of events) {
    const result = applyEvent(projection, event);
    dispositions.push(result.disposition);
    if (result.projection !== null) projection = result.projection;
    if (result.reconcile) reconcile = true;
  }
  return { projection, reconcile, dispositions };
}

const state = (projection, atMs = NOW) => deriveEntitlementState(projection, atMs, false);
const purchase = (t = 0, expiresInDays = 30, extra = {}) => ev('INITIAL_PURCHASE', t, { expiration_at_ms: NOW + t + expiresInDays * DAY, ...extra });

describe('the entitlement state derivation', () => {
  const row = (over = {}) => ({
    source: 'webhook', environment: 'SANDBOX', product_id: 'p', store: 's', has_entitlement: true,
    expires_at: new Date(NOW + DAY).toISOString(), grace_expires_at: null, canceled_at: null, billing_issue_at: null,
    revoked_at: null, expiration_confirmed_at: null, clocks: {}, last_event_ms: null, last_reconciled_at: null, needs_reconcile: false, ...over,
  });

  test('every canonical state is reachable and the precedence is revoked > free > term > grace > confirmed expiry > unknown', () => {
    assert.equal(state(null), 'unknown');
    assert.equal(state(row({ has_entitlement: false, expires_at: null })), 'free');
    assert.equal(state(row()), 'premium_active');
    assert.equal(state(row({ expires_at: null })), 'premium_active');
    assert.equal(state(row({ canceled_at: new Date(NOW).toISOString() })), 'premium_canceled_active');
    assert.equal(state(row({ expires_at: new Date(NOW - DAY).toISOString(), grace_expires_at: new Date(NOW + DAY).toISOString() })), 'premium_billing_grace');
    assert.equal(state(row({ expires_at: new Date(NOW - DAY).toISOString(), expiration_confirmed_at: new Date(NOW).toISOString() })), 'premium_expired');
    assert.equal(state(row({ expires_at: new Date(NOW - DAY).toISOString() })), 'unknown');
    assert.equal(state(row({ revoked_at: new Date(NOW - 1000).toISOString() })), 'premium_revoked');
  });

  test('which states authorize NEW computation: active, canceled-while-paid and provider grace only', () => {
    const entitled = ['premium_active', 'premium_canceled_active', 'premium_billing_grace'];
    for (const s of ['unknown', 'free', 'premium_expired', 'premium_revoked', 'deletion_pending']) assert.equal(isEntitled(s), false, s);
    for (const s of entitled) assert.equal(isEntitled(s), true, s);
  });

  test('a fixture row is ignored unless fixtures are explicitly allowed', () => {
    const fixture = row({ source: 'test_fixture' });
    assert.equal(deriveEntitlementState(fixture, NOW, false), 'unknown');
    assert.equal(deriveEntitlementState(fixture, NOW, true), 'premium_active');
  });

  test('the boundary instants are inclusive: access lasts through expires_at and through the provider grace expiry', () => {
    assert.equal(state(row({ expires_at: new Date(NOW).toISOString() })), 'premium_active');
    assert.equal(state(row({ expires_at: new Date(NOW - 1).toISOString() })), 'unknown');
    assert.equal(state(row({ expires_at: new Date(NOW - DAY).toISOString(), grace_expires_at: new Date(NOW).toISOString() })), 'premium_billing_grace');
  });
});

describe('the lifecycle, event by event', () => {
  test('an initial purchase makes Premium active until the provider expiry', () => {
    const { projection } = fold([purchase()]);
    assert.equal(state(projection), 'premium_active');
    assert.equal(projection.expires_at, new Date(NOW + 30 * DAY).toISOString());
    assert.equal(projection.environment, 'SANDBOX');
    assert.equal(projection.source, 'webhook');
    assert.equal(state(projection, NOW + 31 * DAY), 'unknown', 'past its term and unconfirmed is unknown, not "expired"');
  });

  test('a renewal extends the term', () => {
    const { projection } = fold([purchase(), ev('RENEWAL', 20 * DAY, { expiration_at_ms: NOW + 50 * DAY })]);
    assert.equal(projection.expires_at, new Date(NOW + 50 * DAY).toISOString());
    assert.equal(state(projection, NOW + 40 * DAY), 'premium_active');
  });

  test('cancellation keeps access to the END of the paid term (never revoked early), then lapses only when EXPIRATION arrives', () => {
    const { projection } = fold([purchase(), ev('CANCELLATION', 5 * DAY, { cancel_reason: 'UNSUBSCRIBE' })]);
    assert.equal(state(projection, NOW + 6 * DAY), 'premium_canceled_active');
    assert.equal(state(projection, NOW + 29 * DAY), 'premium_canceled_active');
    assert.equal(state(projection, NOW + 31 * DAY), 'unknown');
    const { projection: expired } = fold([ev('EXPIRATION', 30 * DAY, { expiration_at_ms: NOW + 30 * DAY })], projection);
    assert.equal(state(expired, NOW + 31 * DAY), 'premium_expired');
  });

  test('uncancellation restores plain active', () => {
    const { projection } = fold([purchase(), ev('CANCELLATION', DAY, { cancel_reason: 'UNSUBSCRIBE' }), ev('UNCANCELLATION', 2 * DAY)]);
    assert.equal(state(projection, NOW + 3 * DAY), 'premium_active');
  });

  test('a billing issue grants exactly the PROVIDER grace and nothing more', () => {
    const grace = NOW + 33 * DAY;
    const { projection } = fold([purchase(), ev('BILLING_ISSUE', 30 * DAY, { grace_period_expiration_at_ms: grace })]);
    assert.equal(state(projection, NOW + 29 * DAY), 'premium_active', 'still inside the paid term');
    assert.equal(state(projection, NOW + 31 * DAY), 'premium_billing_grace');
    assert.equal(state(projection, grace), 'premium_billing_grace');
    assert.equal(state(projection, grace + 1), 'unknown', 'no grace of our own after the provider grace ends');
  });

  test('a billing issue with NO provider grace gives no extra access', () => {
    const { projection } = fold([purchase(), ev('BILLING_ISSUE', 30 * DAY, { grace_period_expiration_at_ms: null })]);
    assert.equal(projection.grace_expires_at, null);
    assert.notEqual(state(projection, NOW + 31 * DAY), 'premium_billing_grace');
  });

  test('a successful renewal clears the billing issue', () => {
    const { projection } = fold([purchase(), ev('BILLING_ISSUE', 29 * DAY, { grace_period_expiration_at_ms: NOW + 33 * DAY }), ev('RENEWAL', 30 * DAY, { expiration_at_ms: NOW + 60 * DAY })]);
    assert.equal(projection.billing_issue_at, null);
    assert.equal(projection.grace_expires_at, null);
  });

  test('EXPIRATION confirms the lapse', () => {
    const { projection } = fold([purchase(), ev('EXPIRATION', 30 * DAY)]);
    assert.equal(state(projection, NOW + 31 * DAY), 'premium_expired');
  });

  test('a refund (CANCELLATION / CUSTOMER_SUPPORT) revokes immediately — and asks RevenueCat to confirm', () => {
    const { projection, reconcile } = fold([purchase(), ev('CANCELLATION', 2 * DAY, { cancel_reason: 'CUSTOMER_SUPPORT' })]);
    assert.equal(state(projection, NOW + 3 * DAY), 'premium_revoked');
    assert.equal(reconcile, true);
    assert.equal(projection.needs_reconcile, true);
  });

  test('product change and subscription extension move the term and the product', () => {
    const changed = fold([purchase(), ev('PRODUCT_CHANGE', DAY, { new_product_id: 'herkeys_premium_annual', expiration_at_ms: NOW + 365 * DAY })]).projection;
    assert.equal(changed.product_id, 'herkeys_premium_annual');
    assert.equal(changed.expires_at, new Date(NOW + 365 * DAY).toISOString());
    const extended = fold([purchase(), ev('SUBSCRIPTION_EXTENDED', DAY, { expiration_at_ms: NOW + 45 * DAY })]).projection;
    assert.equal(extended.expires_at, new Date(NOW + 45 * DAY).toISOString());
  });

  test('a pause is recorded as ending at term end AND asks for a reconcile', () => {
    const { projection, reconcile } = fold([purchase(), ev('SUBSCRIPTION_PAUSED', DAY)]);
    assert.equal(reconcile, true);
    assert.equal(state(projection, NOW + 2 * DAY), 'premium_canceled_active');
  });
});

describe('nothing is granted from events that cannot safely grant', () => {
  test('TEST, other-entitlement, unknown-type and untimed events leave no projection', () => {
    assert.equal(applyEvent(null, ev('TEST', 0)).disposition, 'ignored_test');
    assert.equal(applyEvent(null, ev('RENEWAL', 0, { entitlement_ids: ['other_thing'] })).disposition, 'ignored_entitlement');
    assert.equal(applyEvent(null, ev('INVOICE_ISSUANCE', 0)).disposition, 'ignored_unknown');
    assert.equal(applyEvent(null, ev('FUTURE_TYPE', 0)).disposition, 'ignored_unknown');
    const untimed = applyEvent(null, ev('INITIAL_PURCHASE', 0, { event_timestamp_ms: undefined }));
    assert.equal(untimed.disposition, 'reconcile_only');
    assert.equal(untimed.projection, null);
  });

  test('a purchase with no expiry is NOT treated as lifetime: it requests a reconcile and grants nothing', () => {
    const result = applyEvent(null, ev('INITIAL_PURCHASE', 0, { expiration_at_ms: undefined }));
    assert.equal(result.disposition, 'reconcile_only');
    assert.equal(result.projection, null);
  });

  test('transfer, alias, redeem, temporary grant, non-renewing and refund-reversal are reconcile-only, never a direct grant', () => {
    for (const type of ['TRANSFER', 'SUBSCRIBER_ALIAS', 'PURCHASE_REDEEMED', 'TEMPORARY_ENTITLEMENT_GRANT', 'NON_RENEWING_PURCHASE', 'REFUND_REVERSED']) {
      const result = applyEvent(null, ev(type, 0));
      assert.equal(result.disposition, 'reconcile_only', type);
      assert.equal(result.projection, null, type);
      assert.equal(result.reconcile, true, type);
    }
  });

  test('a cancellation, billing issue or expiration with no entitlement basis cannot invent one', () => {
    for (const type of ['CANCELLATION', 'BILLING_ISSUE', 'EXPIRATION']) {
      const result = applyEvent(null, ev(type, 0));
      assert.equal(result.disposition, 'reconcile_only', type);
      assert.equal(result.projection, null, type);
    }
  });

  test('an event naming no entitlement applies but forces a reconcile', () => {
    const result = applyEvent(null, ev('INITIAL_PURCHASE', 0, { entitlement_ids: null }));
    assert.equal(result.disposition, 'applied');
    assert.equal(result.reconcile, true);
    assert.equal(result.projection.needs_reconcile, true);
  });
});

describe('ordering, staleness and revocation', () => {
  test('a stale event (older than what is already known) changes nothing', () => {
    const { projection } = fold([purchase(), ev('RENEWAL', 20 * DAY, { expiration_at_ms: NOW + 50 * DAY })]);
    const stale = applyEvent(projection, ev('RENEWAL', 10 * DAY, { expiration_at_ms: NOW + 40 * DAY }));
    assert.equal(stale.disposition, 'stale');
    assert.equal(stale.projection, null);
  });

  test('redelivering the SAME event is stale (idempotent), not applied twice', () => {
    const renewal = ev('RENEWAL', 20 * DAY, { expiration_at_ms: NOW + 50 * DAY });
    const once = fold([purchase(), renewal]).projection;
    const twice = applyEvent(once, renewal);
    assert.equal(twice.disposition, 'stale');
  });

  test('an OLDER renewal arriving after a refund can NOT resurrect revoked access', () => {
    const refund = ev('CANCELLATION', 10 * DAY, { cancel_reason: 'CUSTOMER_SUPPORT' });
    const lateRenewal = ev('RENEWAL', 5 * DAY, { expiration_at_ms: NOW + 60 * DAY });
    const { projection } = fold([purchase(), refund, lateRenewal]);
    assert.equal(state(projection, NOW + 11 * DAY), 'premium_revoked');
  });

  test('a NEWER purchase after a refund legitimately restores access', () => {
    const refund = ev('CANCELLATION', 10 * DAY, { cancel_reason: 'CUSTOMER_SUPPORT' });
    const repurchase = ev('INITIAL_PURCHASE', 20 * DAY, { expiration_at_ms: NOW + 50 * DAY });
    const { projection } = fold([purchase(), refund, repurchase]);
    assert.equal(state(projection, NOW + 21 * DAY), 'premium_active');
  });

  test('a LATE expiration cannot undo a newer renewal', () => {
    const renewal = ev('RENEWAL', 30 * DAY, { expiration_at_ms: NOW + 60 * DAY });
    const lateExpiration = ev('EXPIRATION', 29 * DAY);
    const { projection } = fold([purchase(), renewal, lateExpiration]);
    assert.equal(state(projection, NOW + 45 * DAY), 'premium_active');
  });

  test('a renewal clears an earlier expiration observation', () => {
    const { projection } = fold([purchase(), ev('EXPIRATION', 30 * DAY), ev('RENEWAL', 31 * DAY, { expiration_at_ms: NOW + 61 * DAY })]);
    assert.equal(state(projection, NOW + 40 * DAY), 'premium_active');
  });

  test('ORDER INDEPENDENCE: every permutation of a full lifecycle ends in the canonical projection, or asks for a reconcile', () => {
    const lifecycle = [
      purchase(0),
      ev('RENEWAL', 30 * DAY, { expiration_at_ms: NOW + 60 * DAY }),
      ev('CANCELLATION', 35 * DAY, { cancel_reason: 'UNSUBSCRIBE' }),
      ev('UNCANCELLATION', 36 * DAY),
      ev('BILLING_ISSUE', 58 * DAY, { grace_period_expiration_at_ms: NOW + 63 * DAY }),
      ev('RENEWAL', 60 * DAY, { expiration_at_ms: NOW + 90 * DAY }),
    ];
    const canonical = fold(lifecycle);
    const permutations = (items) => (items.length <= 1 ? [items] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])));
    let exact = 0;
    let viaReconcile = 0;
    for (const order of permutations(lifecycle)) {
      const result = fold(order);
      const same = JSON.stringify(result.projection) === JSON.stringify(canonical.projection);
      if (same) exact += 1;
      else {
        viaReconcile += 1;
        assert.equal(result.reconcile, true, `a divergent fold must have asked for a reconcile: ${order.map((e) => e.event_type).join(',')}`);
      }
    }
    assert.equal(exact + viaReconcile, 720);
    assert.ok(exact > 0);
    // Every ordering in which a purchase-class event is applied FIRST is exact: only events with no basis to attach to get dropped.
    for (const order of permutations(lifecycle)) {
      if (['INITIAL_PURCHASE', 'RENEWAL'].includes(order[0].event_type)) {
        const result = fold(order);
        assert.equal(result.reconcile && JSON.stringify(result.projection) !== JSON.stringify(canonical.projection), false);
      }
    }
  });

  test('ORDER INDEPENDENCE with a refund: no permutation of {purchase, renewal, refund} ends with active access when the refund is newest', () => {
    const events = [purchase(0), ev('RENEWAL', 30 * DAY, { expiration_at_ms: NOW + 60 * DAY }), ev('CANCELLATION', 40 * DAY, { cancel_reason: 'CUSTOMER_SUPPORT' })];
    const permutations = (items) => (items.length <= 1 ? [items] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])));
    for (const order of permutations(events)) {
      const result = fold(order);
      if (result.projection === null) continue;
      const refundSeen = order.findIndex((e) => e.event_type === 'CANCELLATION') > order.findIndex((e) => e.event_type === 'INITIAL_PURCHASE' || e.event_type === 'RENEWAL');
      if (refundSeen) assert.equal(state(result.projection, NOW + 41 * DAY), 'premium_revoked', order.map((e) => e.event_type).join(','));
    }
  });

  test('events on the SAME instant that disagree cannot be ordered: the first stays, and the account is sent to RevenueCat to decide', () => {
    const a = ev('CANCELLATION', 5 * DAY, { cancel_reason: 'UNSUBSCRIBE' });
    const b = ev('UNCANCELLATION', 5 * DAY);
    const after = fold([purchase(), a]);
    const second = applyEvent(after.projection, b);
    assert.equal(second.reconcile, true);
    assert.notEqual(second.projection?.canceled_at ?? after.projection.canceled_at, null, 'the cancellation is not silently flipped');
    // ...whereas a tie that would change nothing is just a replay, and costs no reconcile.
    assert.equal(applyEvent(after.projection, a).reconcile, false);
  });
});
