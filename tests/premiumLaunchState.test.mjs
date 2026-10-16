import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { premiumLaunchState } from '../src/monetization/premiumLaunchState.ts';
import { PREMIUM_CAPABILITY_KEYS } from '../src/monetization/premiumHomeCopy.ts';

const entries = PREMIUM_CAPABILITY_KEYS.map((featureKey) => ({
  featureKey, displayName: featureKey, tier: 'premium', available: true,
  requiresAiConsent: featureKey === 'smart_inbox_extract', minAppVersion: null,
}));

describe('Stage 1 paid launch: server authority', () => {
  test('unknown manifest cannot authorize a commercial checkout', () => {
    assert.deepEqual(premiumLaunchState(null), { kind: 'checking', ready: false, available: [] });
  });

  test('one disabled or missing pillar blocks the paywall; other pillars are still listed honestly', () => {
    const off = entries.map((entry) => entry.featureKey === 'smart_inbox_extract' ? { ...entry, available: false } : entry);
    assert.deepEqual(premiumLaunchState(off), {
      kind: 'not_released', ready: false, available: ['daily_load_premium', 'momentum_report'],
    });
    assert.equal(premiumLaunchState(entries.slice(0, 2)).ready, false);
  });

  test('all three server-released Premium pillars permit a store offering lookup', () => {
    assert.deepEqual(premiumLaunchState(entries), {
      kind: 'ready', ready: true, available: [...PREMIUM_CAPABILITY_KEYS],
    });
  });

  test('a Free-tier imposter entry never counts toward Premium readiness', () => {
    const forged = entries.map((entry) => entry.featureKey === 'momentum_report' ? { ...entry, tier: 'free' } : entry);
    assert.equal(premiumLaunchState(forged).ready, false);
  });

  test('deferred Village/Co-Parent flags never count toward the three Stage 1 paid pillars', () => {
    const deferred = [
      { featureKey: 'village_delegation', tier: 'premium', available: true },
      { featureKey: 'coparent_plus', tier: 'premium', available: true },
    ];
    assert.equal(premiumLaunchState(deferred).ready, false);
    assert.deepEqual(premiumLaunchState([...entries, ...deferred]).available, [...PREMIUM_CAPABILITY_KEYS]);
  });
});
