import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseWebhookBody } from '../../supabase/functions/_shared/premium/events.ts';
import { applyEvent } from '../../supabase/functions/_shared/premium/projection.ts';
import { parseSubscriberResponse, mergeReconciled } from '../../supabase/functions/_shared/premium/reconcile.ts';
import { deriveEntitlementState } from '../../supabase/functions/_shared/premium/entitlementState.ts';
import { createPremiumServerClient } from '../../src/monetization/premiumServerClient.ts';
import { derivePremiumHomeState } from '../../src/monetization/premiumHomeState.ts';
import { premiumHomeCopyFor } from '../../src/monetization/premiumHomeCopy.ts';
import { bytes, rcBody, subscriberRecord, NOW, DAY } from '../support/premium/harness.mjs';

const event = (type, at, extra = {}) => {
  const parsed = parseWebhookBody(bytes(rcBody({ type, event_timestamp_ms: at, ...extra })));
  assert.equal(parsed.ok, true); return parsed.event;
};
const trial = (end, start = NOW) => event('INITIAL_PURCHASE', start, { period_type: 'TRIAL', purchased_at_ms: start, expiration_at_ms: end });
const fold = (p, e) => applyEvent(p, e).projection ?? p;

test('trial end is the exact provider instant across month lengths, leap years and DST, never start plus 30 days', () => {
  for (const [start, end] of [
    ['2027-01-31T15:00:00Z', '2027-02-28T15:00:00Z'],
    ['2028-01-31T15:00:00Z', '2028-02-29T15:00:00Z'],
    ['2026-10-21T14:00:00Z', '2026-11-21T15:00:00Z'],
  ]) {
    const p = fold(null, trial(Date.parse(end), Date.parse(start)));
    assert.equal(p.period_type, 'TRIAL'); assert.equal(p.trial_ends_at, new Date(end).toISOString());
    assert.equal(p.period_started_at, new Date(start).toISOString());
  }
});

test('canceled trial retains its verified end and access; expiry and revocation still control access', () => {
  const p = fold(null, trial(NOW + 28 * DAY));
  const canceled = fold(p, event('CANCELLATION', NOW + DAY, { cancel_reason: 'UNSUBSCRIBE' }));
  assert.equal(canceled.period_type, 'TRIAL'); assert.equal(canceled.trial_ends_at, p.trial_ends_at);
  assert.equal(deriveEntitlementState(canceled, NOW + 2 * DAY, false), 'premium_canceled_active');
  const expired = fold(canceled, event('EXPIRATION', NOW + 28 * DAY));
  assert.equal(deriveEntitlementState(expired, NOW + 29 * DAY, false), 'premium_expired');
  const revoked = fold(p, event('CANCELLATION', NOW + DAY, { cancel_reason: 'CUSTOMER_SUPPORT' }));
  assert.equal(deriveEntitlementState(revoked, NOW + 2 * DAY, false), 'premium_revoked');
});

test('paid renewal clears trial facts and late trial events cannot put them back', () => {
  const p = fold(null, trial(NOW + 28 * DAY));
  const paid = fold(p, event('RENEWAL', NOW + 28 * DAY, { period_type: 'NORMAL', expiration_at_ms: NOW + 59 * DAY, purchased_at_ms: NOW + 28 * DAY }));
  assert.equal(paid.period_type, 'NORMAL'); assert.equal(paid.trial_ends_at, null);
  const late = fold(paid, trial(NOW + 28 * DAY));
  assert.equal(late.period_type, 'NORMAL'); assert.equal(late.trial_ends_at, null);
});

test('extension uses only the provider end; uncancellation does not reclassify a trial as paid', () => {
  const p = fold(null, trial(NOW + 28 * DAY));
  const extended = fold(p, event('SUBSCRIPTION_EXTENDED', NOW + DAY, { expiration_at_ms: NOW + 29 * DAY }));
  assert.equal(extended.trial_ends_at, new Date(NOW + 29 * DAY).toISOString());
  assert.equal(fold(extended, event('UNCANCELLATION', NOW + 2 * DAY)).period_type, 'TRIAL');
});

test('reconciliation reads lowercase period_type, keeps a newer webhook, and never infers missing trial metadata', () => {
  for (const [raw, expected] of [['trial', 'TRIAL'], ['intro', 'INTRO'], ['normal', 'NORMAL'], ['unsupported', null], [undefined, null]]) {
    const record = subscriberRecord();
    Object.values(record.subscriber.subscriptions)[0].period_type = raw;
    const result = parseSubscriberResponse(record, NOW, 'staging');
    assert.equal(result.ok, true); assert.equal(result.projection.period_type, expected);
    assert.equal(result.projection.trial_ends_at, expected === 'TRIAL' ? result.projection.expires_at : null);
    const newer = fold(null, trial(NOW + 29 * DAY, NOW + 1000));
    assert.equal(mergeReconciled(newer, result.projection).period_type, 'TRIAL');
  }
});

test('server trial facts cross the transport to Home and Account copy without granting a free or pending account access', async () => {
  const end = '2026-11-21T15:00:00Z';
  let data = { state: 'premium_active', periodType: 'TRIAL', periodStartedAt: '2026-10-21T14:00:00Z', trialEndsAt: end };
  const client = createPremiumServerClient({ rpc: async () => ({ data, error: null }) });
  const value = await client.entitlement(); assert.equal(value.kind, 'ok');
  const snapshot = { accountId: 'A', load: 'ready', server: value.value, manifest: null, verification: 'idle', lastVerify: null };
  const home = derivePremiumHomeState({ accountBound: true, snapshot, storeStatus: 'free' });
  const copy = premiumHomeCopyFor(home, instant => new Date(instant).toLocaleDateString('en-US', { timeZone: 'America/New_York' }));
  assert.match(copy.title, /Free trial/); assert.match(copy.body, /11\/21\/2026/);
  assert.match(copy.body, /renews automatically unless canceled/); assert.doesNotMatch(copy.body, /\$|30.day/);
  assert.match(premiumHomeCopyFor({ ...home, kind: 'canceled_active' }).body, /won’t renew/);
  assert.match(premiumHomeCopyFor({ ...home, trialEndsOn: null }).body, /not confirmed/);
  for (const state of ['free', 'unknown', 'premium_expired', 'premium_revoked']) {
    const h = derivePremiumHomeState({ accountBound: true, snapshot: { ...snapshot, server: { ...value.value, state } }, storeStatus: 'free' });
    assert.notEqual(h.kind, 'active'); assert.doesNotMatch(premiumHomeCopyFor(h).title, /Free trial/);
  }
  data = { ...data, trialEndsAt: 'invented-date' };
  assert.deepEqual(await client.entitlement(), { kind: 'unavailable' });
});
