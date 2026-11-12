/**
 * V2UP workstream C: the Free plan card on the Premium home describes what Premium IS once the server has released all three tools,
 * says where Restore purchases is (for a reinstall or a new phone), and keeps the old "being prepared" wording until then.
 * Pure copy tests plus a source guard; fixtures only, no price, no store.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { HER_KEYS_PREMIUM_DISPLAY_NAME } from '../src/monetization/entitlement.ts';
import { CAPABILITY_TEXT, PREMIUM_CAPABILITY_KEYS, premiumHomeCopyFor } from '../src/monetization/premiumHomeCopy.ts';
import { premiumLaunchState } from '../src/monetization/premiumLaunchState.ts';

const entry = (featureKey, available = true) => ({ featureKey, displayName: featureKey, tier: 'premium', available, requiresAiConsent: false, minAppVersion: null });
const all = PREMIUM_CAPABILITY_KEYS.map((k) => entry(k));
const words = (copy) => [copy.status, copy.title, copy.body, copy.primary?.label, copy.manage?.label].filter(Boolean).join('\n');

describe('Free plan card', () => {
  test('before the server releases all three tools it still says they are being prepared (unchanged)', () => {
    const copy = premiumHomeCopyFor({ kind: 'free' });
    assert.match(copy.body, /being prepared/);
    assert.deepEqual(premiumHomeCopyFor({ kind: 'free' }, undefined, false), copy);
    assert.equal(premiumLaunchState(all.slice(0, 2)).ready, false);
  });

  test('once released it names the three real tools, says nothing happens without approval, and says Free is untouched', () => {
    assert.equal(premiumLaunchState(all).ready, true);
    const copy = premiumHomeCopyFor({ kind: 'free' }, undefined, true);
    assert.doesNotMatch(copy.body, /being prepared/);
    for (const key of PREMIUM_CAPABILITY_KEYS) {
      const name = CAPABILITY_TEXT[key].name;
      assert.ok(copy.body.toLowerCase().includes(name.toLowerCase()), `names ${name}`);
    }
    assert.match(copy.body, /Nothing is saved or changed without your approval/);
    assert.match(copy.body, /Everything free in Her Keys still works/);
    assert.equal(copy.primary.action, 'upgrade');
    assert.equal(copy.primary.label, `See ${HER_KEYS_PREMIUM_DISPLAY_NAME}`);
    assert.equal(copy.manage, null);
  });

  test('it points at Restore purchases in words, and renders no second restore control; no price, trial or technical id', () => {
    const copy = premiumHomeCopyFor({ kind: 'free' }, undefined, true);
    assert.match(copy.body, /Restore purchases below/);
    assert.doesNotMatch(copy.primary.label, /restore/i);
    assert.doesNotMatch(words(copy), /[$€£¥]|\bUSD\b|\d+\.\d{2}|per (month|year)|\/(mo|yr)|\bfree trial\b|\bdiscount\b|her_keys_plus|entitlement|revenuecat/i);
  });

  test('releasing the tools changes the description of the Free state only; every other state is identical', () => {
    const states = [
      { kind: 'signed_out' }, { kind: 'loading' }, { kind: 'active', endsOn: '2026-11-13T00:00:00Z' }, { kind: 'canceled_active', endsOn: null },
      { kind: 'billing_grace', endsOn: null }, { kind: 'verification_pending', cause: 'delayed', canRetry: true }, { kind: 'expired' }, { kind: 'revoked' },
      { kind: 'unavailable' }, { kind: 'account_closing' },
    ];
    for (const state of states) assert.deepEqual(premiumHomeCopyFor(state, undefined, true), premiumHomeCopyFor(state, undefined, false), state.kind);
  });

  test('the home hook feeds the copy from the SERVER manifest, never from the store SDK', () => {
    const source = readFileSync(new URL('../src/features/premium/usePremiumHome.ts', import.meta.url), 'utf8');
    assert.match(source, /premiumLaunchState\(snapshot\.manifest\)\.ready/);
    assert.match(source, /premiumHomeCopyFor\(state, undefined, released\)/);
  });
});
