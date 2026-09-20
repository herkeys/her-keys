import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { checkFeatureAccess, FEATURE_ACCESS } from '../src/monetization/featureAccess.ts';
import {
  canResolveOnboardingPlus,
  deriveEntitlementState,
  HER_KEYS_PLUS_ENTITLEMENT,
  PAYWALL_PLACEMENTS,
  PAYWALL_POLICY,
  resolveEntitlementState,
} from '../src/monetization/entitlement.ts';
import { hasConfiguredApiKey, revenueCatApiKeys } from '../src/monetization/config.ts';
import { completeOnboarding, onboardingResumeStep, recordOnboardingStep, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { canOpenScreen, ROOT_SCREEN_GUARDS } from '../src/domain/routeAccess.ts';
import { ONBOARDING_STEPS } from '../src/domain/state.ts';
import { ctx, demoState, harness, launch } from './support/fixtures.mjs';
import { accessFor } from './support/store.mjs';

/** Recursively reads every file's text under a directory, keyed by path — the same source-scan technique `categories.test.mjs` uses for its "no logic depends on names" check. */
function readSourceFiles(dir) {
  const files = {};
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) Object.assign(files, readSourceFiles(path));
    else if (/\.tsx?$/.test(entry)) files[path] = readFileSync(path, 'utf8');
  }
  return files;
}

const monetizationSource = readSourceFiles('src/monetization');
const appSource = readSourceFiles('app');
const domainStateSource = readFileSync('src/domain/state.ts', 'utf8');

describe('Entitlement state', () => {
  test('her_keys_plus active resolves to plus', () => {
    assert.equal(deriveEntitlementState([HER_KEYS_PLUS_ENTITLEMENT]), 'plus');
    assert.equal(deriveEntitlementState(['her_keys_plus', 'some_other_entitlement']), 'plus');
  });

  test('a fake or unrelated entitlement never resolves to plus (M1)', () => {
    assert.equal(deriveEntitlementState([]), 'free');
    assert.equal(deriveEntitlementState(['not_her_keys_plus']), 'free');
  });

  test('an unresolvable check (RevenueCat unavailable, offline, unconfigured) is unknown, never a false free/plus claim', () => {
    assert.equal(resolveEntitlementState(null), 'unknown');
    assert.equal(resolveEntitlementState([]), 'free');
    assert.equal(resolveEntitlementState([HER_KEYS_PLUS_ENTITLEMENT]), 'plus');
  });
});

describe('Feature access', () => {
  test('a free feature is allowed independent of entitlement, including when entitlement is unknown (M6)', () => {
    assert.deepEqual(checkFeatureAccess('daily_load_core', 'unknown'), { allowed: true, reason: 'granted_free' });
    assert.deepEqual(checkFeatureAccess('daily_load_core', 'free'), { allowed: true, reason: 'granted_free' });
    assert.deepEqual(checkFeatureAccess('daily_load_core', 'plus'), { allowed: true, reason: 'granted_free' });
  });

  test('a plus feature requires plus specifically; unknown reports why rather than claiming unsubscribed', () => {
    assert.deepEqual(checkFeatureAccess('momentum_insights', 'plus'), { allowed: true, reason: 'granted_plus' });
    assert.deepEqual(checkFeatureAccess('momentum_insights', 'free'), { allowed: false, reason: 'requires_plus' });
    assert.deepEqual(checkFeatureAccess('momentum_insights', 'unknown'), { allowed: false, reason: 'entitlement_unknown' });
  });

  test('Build 2.5 does not lock the whole Her Keys+ package sight unseen — only a small, explicit manifest', () => {
    assert.equal(Object.keys(FEATURE_ACCESS).length <= 5, true);
  });

  test('the feature-access layer does not import RevenueCat directly', () => {
    const source = monetizationSource[join('src/monetization', 'featureAccess.ts')];
    assert.match(source, /checkFeatureAccess/, 'sanity: reading the right file');
    assert.doesNotMatch(source, /react-native-purchases/);
  });
});

describe('RevenueCat API key configuration', () => {
  test('an unset key is reported as not configured, never guessed or defaulted', () => {
    const original = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    try {
      assert.equal(hasConfiguredApiKey('ios'), false);
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
      else process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = original;
    }
  });

  test('keys are read from EXPO_PUBLIC_ env vars only, never a literal default', () => {
    assert.equal(revenueCatApiKeys.ios, process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY);
    assert.equal(revenueCatApiKeys.android, process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY);
  });
});

describe('Paywall placements', () => {
  test('placement ids are a fixed, typed set', () => {
    assert.deepEqual(PAYWALL_PLACEMENTS, ['onboarding_complete', 'systems_upgrade', 'premium_feature', 'manual_upgrade']);
  });
});

describe('Onboarding resolution policy', () => {
  test('Build 2.5 default is soft', () => {
    assert.equal(PAYWALL_POLICY, 'soft');
  });

  test('already entitled resolves regardless of policy — never a forced routing loop', () => {
    assert.equal(canResolveOnboardingPlus('already_entitled', 'soft'), true);
    assert.equal(canResolveOnboardingPlus('already_entitled', 'enforced'), true);
  });

  test('a real purchase or restore always resolves onboarding', () => {
    assert.equal(canResolveOnboardingPlus('purchased', PAYWALL_POLICY), true);
    assert.equal(canResolveOnboardingPlus('restored', PAYWALL_POLICY), true);
  });

  test('continuing without Plus, or falling back with no Offering, resolves only under the soft policy (M2)', () => {
    assert.equal(canResolveOnboardingPlus('continued_without_plus', PAYWALL_POLICY), true);
    assert.equal(canResolveOnboardingPlus('no_offering_fallback', PAYWALL_POLICY), true);
    assert.equal(canResolveOnboardingPlus('continued_without_plus', 'enforced'), false);
    assert.equal(canResolveOnboardingPlus('no_offering_fallback', 'enforced'), false);
  });
});

describe('Onboarding: Her Keys+ is the final step', () => {
  test('the step order ends with plus, right after profile', () => {
    assert.deepEqual(ONBOARDING_STEPS.slice(-2), ['profile', 'plus']);
  });

  test('reaching the plus step does not, by itself, open the app — only completion does', () => {
    let state = demoState();
    state = toggleOnboardingOption(state, 'goals', 'calmer-household');
    state = toggleOnboardingOption(recordOnboardingStep(state, 'strengths'), 'strengths', 'cooking');
    state = toggleOnboardingOption(state, 'struggles', 'overcommitting');
    state = recordOnboardingStep(state, 'plus');

    assert.equal(state.onboarding.completedAt, null);
    assert.equal(canOpenScreen('onboarding/plus', accessFor({ getSnapshot: () => ({ status: 'ready', state }) })), true);
    assert.equal(canOpenScreen('(app)', accessFor({ getSnapshot: () => ({ status: 'ready', state }) })), false);
  });

  test('completion only succeeds once the plus step is reachable, and records lastStep as plus', () => {
    const incomplete = demoState();
    assert.equal(completeOnboarding(incomplete, ctx()), incomplete, 'no choices made yet');

    let state = incomplete;
    state = toggleOnboardingOption(state, 'goals', 'calmer-household');
    state = toggleOnboardingOption(state, 'strengths', 'cooking');
    state = toggleOnboardingOption(state, 'struggles', 'overcommitting');
    const completed = completeOnboarding(state, ctx());
    assert.notEqual(completed.onboarding.completedAt, null);
    assert.equal(completed.onboarding.lastStep, 'plus');
  });

  test('force-stop and resume at the plus step returns to it, with earlier choices intact (M5)', async () => {
    const h = harness();
    let store = await launch(h);
    store.dispatch((state) => toggleOnboardingOption(state, 'goals', 'calmer-household'));
    store.dispatch((state) => recordOnboardingStep(state, 'strengths'));
    store.dispatch((state) => toggleOnboardingOption(state, 'strengths', 'cooking'));
    store.dispatch((state) => recordOnboardingStep(state, 'struggles'));
    store.dispatch((state) => toggleOnboardingOption(state, 'struggles', 'overcommitting'));
    store.dispatch((state) => recordOnboardingStep(state, 'talk-it-out'));
    store.dispatch((state) => recordOnboardingStep(state, 'profile'));
    store.dispatch((state) => recordOnboardingStep(state, 'plus'));
    await store.flush();

    store = await launch(h);
    const { onboarding } = store.getSnapshot().state;
    assert.equal(onboardingResumeStep(onboarding), 'plus');
    assert.equal(canOpenScreen('onboarding/plus', accessFor(store)), true);
    assert.equal(canOpenScreen('(app)', accessFor(store)), false);
  });

  test('no paywall loop after completion: the plus step and every other onboarding screen close once for good', async () => {
    const h = harness();
    let store = await launch(h);
    store.dispatch((state) => toggleOnboardingOption(state, 'goals', 'calmer-household'));
    store.dispatch((state) => toggleOnboardingOption(state, 'strengths', 'cooking'));
    store.dispatch((state) => toggleOnboardingOption(state, 'struggles', 'overcommitting'));
    await store.commit((state, c) => completeOnboarding(state, c));
    await store.flush();

    store = await launch(h);
    assert.equal(onboardingResumeStep(store.getSnapshot().state.onboarding), null);
    for (const screen of Object.keys(ROOT_SCREEN_GUARDS)) {
      if (screen === '(app)' || screen === 'talk-it-out' || screen === 'event-editor' || screen === 'task-editor') continue;
      if (screen === 'dev-tools') continue;
      // Signing in is offered, not demanded, so it stays reachable after
      // onboarding. It is not an onboarding step and cannot loop her back into
      // one -- it is a modal she can close.
      if (screen === 'sign-in') continue;
      assert.equal(canOpenScreen(screen, accessFor(store)), false, `${screen} must stay closed after completion`);
    }
    assert.equal(canOpenScreen('(app)', accessFor(store)), true);
  });
});

describe('Hostile / negative controls', () => {
  test('M3: subscription truth is not persisted into AppStateV1', () => {
    const forbidden = ['isPlus', 'subscriptionStatus', 'expirationDate', 'productPrice', 'revenueCatUserId', 'her_keys_plus'];
    for (const token of forbidden) assert.doesNotMatch(domainStateSource, new RegExp(token), `${token} must not appear in src/domain/state.ts`);
  });

  test('M4: no production price is hard-coded anywhere under app/ or src/monetization', () => {
    const priceLike = /\$\s?\d+(\.\d{2})?/;
    for (const [path, source] of Object.entries({ ...monetizationSource, ...appSource })) {
      assert.doesNotMatch(source, priceLike, `${path} must not contain a hard-coded price`);
    }
  });

  test('M6: RevenueCat being unavailable cannot lock existing free Today', () => {
    const todaySource = appSource[join('app', '(app)', 'today.tsx')];
    assert.ok(todaySource, 'sanity: found the Today screen');
    assert.doesNotMatch(todaySource, /monetization|RevenueCat/i);
    assert.deepEqual(checkFeatureAccess('daily_load_core', 'unknown'), { allowed: true, reason: 'granted_free' });
  });

  test('M7: no RevenueCat secret key pattern (sk_...) appears in client source', () => {
    for (const [path, source] of Object.entries({ ...monetizationSource, ...appSource })) {
      assert.doesNotMatch(source, /\bsk_[A-Za-z0-9]/, `${path} must not contain a RevenueCat secret key`);
    }
    assert.doesNotMatch(readFileSync('.env.example', 'utf8'), /\bsk_[A-Za-z0-9]/);
  });
});
