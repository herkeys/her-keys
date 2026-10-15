/**
 * The Premium home's single state, derived from the SERVER's confirmed entitlement. Every state the brief names, plus the three that
 * are not about a subscription (signed out, loading, account closing). The store SDK is a hint and can never produce an entitled state.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { derivePremiumHomeState, isHomeEntitled } from '../../src/monetization/premiumHomeState.ts';

const server = (state, over = {}) => ({ state, expiresAt: '2026-11-13T00:00:00Z', graceExpiresAt: null, canceled: false, needsReconcile: false, checkedAt: '', ...over });
const snapshot = (over = {}) => ({ accountId: 'a', load: 'ready', server: server('free'), manifest: null, verification: 'idle', lastVerify: null, ...over });
const home = (over = {}, store = 'free', accountBound = true) => derivePremiumHomeState({ accountBound, snapshot: snapshot(over), storeStatus: store });

describe('every state the Premium home must show', () => {
  test('Free', () => {
    assert.deepEqual(home(), { kind: 'free' });
    assert.deepEqual(home({ server: server('unknown') }), { kind: 'free' });
  });
  test('Premium Active carries the end of the current period', () => {
    assert.deepEqual(home({ server: server('premium_active') }), { kind: 'active', endsOn: '2026-11-13T00:00:00Z' });
  });
  test('Canceled but Active', () => {
    assert.deepEqual(home({ server: server('premium_canceled_active', { canceled: true }) }), { kind: 'canceled_active', endsOn: '2026-11-13T00:00:00Z' });
  });
  test('Billing Grace follows the PROVIDER grace date, not the expired term', () => {
    assert.deepEqual(home({ server: server('premium_billing_grace', { graceExpiresAt: '2026-10-20T00:00:00Z' }) }), { kind: 'billing_grace', endsOn: '2026-10-20T00:00:00Z' });
  });
  test('Verification Pending: the store says paid and the server has not caught up (each cause)', () => {
    assert.deepEqual(home({ verification: 'pending' }, 'plus'), { kind: 'verification_pending', cause: 'checking', canRetry: false });
    assert.deepEqual(home({ verification: 'checking' }, 'plus'), { kind: 'verification_pending', cause: 'checking', canRetry: false });
    assert.deepEqual(home({ verification: 'gave_up', lastVerify: 'provider_unavailable' }, 'plus'), { kind: 'verification_pending', cause: 'outage', canRetry: true });
    assert.deepEqual(home({ verification: 'gave_up', lastVerify: 'reconciled' }, 'plus'), { kind: 'verification_pending', cause: 'account_mismatch', canRetry: true });
    assert.deepEqual(home({ verification: 'gave_up', lastVerify: 'rate_limited' }, 'plus'), { kind: 'verification_pending', cause: 'delayed', canRetry: true });
  });
  test('Expired and Revoked are different states', () => {
    assert.deepEqual(home({ server: server('premium_expired') }), { kind: 'expired' });
    assert.deepEqual(home({ server: server('premium_revoked') }), { kind: 'revoked' });
  });
  test('Service Unavailable: the server cannot be reached, or the store cannot be read', () => {
    assert.deepEqual(home({ server: null, load: 'unavailable' }), { kind: 'unavailable' });
    assert.deepEqual(home({ server: server('free') }, 'unknown'), { kind: 'unavailable' });
  });
  test('the three states that are not about a subscription', () => {
    assert.deepEqual(home({ accountId: null, server: null }, 'free', false), { kind: 'signed_out' });
    assert.deepEqual(home({ server: null, load: 'loading' }), { kind: 'loading' });
    assert.deepEqual(home({ server: server('deletion_pending') }), { kind: 'account_closing' });
  });
});

describe('the server is the authority', () => {
  test('the store SDK saying "paid" never produces an entitled state by itself', () => {
    for (const verification of ['idle', 'checking', 'pending', 'gave_up']) {
      for (const lastVerify of [null, 'reconciled', 'provider_unavailable', 'unreachable', 'conflict']) {
        const state = home({ verification, lastVerify }, 'plus');
        assert.equal(isHomeEntitled(state), false, `${verification}/${lastVerify} -> ${state.kind}`);
      }
    }
  });
  test('the server saying "active" holds even when the store SDK says free or is unreadable', () => {
    for (const store of ['free', 'unknown', 'loading']) assert.equal(home({ server: server('premium_active') }, store).kind, 'active');
  });
  test('a switched-off feature in the manifest never colours the subscription state', () => {
    const manifest = ['daily_load_premium', 'smart_inbox_extract', 'momentum_report'].map((featureKey) => ({ featureKey, displayName: featureKey, tier: 'premium', available: false, requiresAiConsent: false, minAppVersion: null }));
    assert.equal(home({ manifest }).kind, 'free');
    assert.equal(home({ manifest, server: server('premium_active') }).kind, 'active');
  });
  test('only the three entitled states authorize new Premium work', () => {
    const entitled = ['active', 'canceled_active', 'billing_grace'];
    const kinds = [{ kind: 'free' }, { kind: 'expired' }, { kind: 'revoked' }, { kind: 'unavailable' }, { kind: 'loading' }, { kind: 'signed_out' }, { kind: 'account_closing' }, { kind: 'verification_pending', cause: 'checking', canRetry: false },
      { kind: 'active', endsOn: null }, { kind: 'canceled_active', endsOn: null }, { kind: 'billing_grace', endsOn: null }];
    for (const state of kinds) assert.equal(isHomeEntitled(state), entitled.includes(state.kind), state.kind);
  });
});
