/**
 * Paywall sequencing. A new user's Premium choice on the Welcome tree is an intent. It must produce exactly ONE paywall, at the
 * end of onboarding (after the Life Systems Audit and the operating profile), and never one before authentication, binding and
 * consent, and never a second one after she has decided.
 *
 * What this does not prove: the native sheet, real store products, or a device. The component contracts are exercised for real;
 * the wiring between `app/_layout.tsx` and `app/onboarding/plus.tsx` is pinned by source.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import './support/welcomeFlow/register.mjs';

import { PremiumCheckoutAfterConsent } from '../src/monetization/PremiumCheckoutAfterConsent.tsx';
import { PremiumIntentProvider, usePremiumIntent } from '../src/store/PremiumIntentContext.tsx';

const { render } = await import('./support/render.tsx');
const { Text } = await import('react-native');
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mounted = [];
afterEach(async () => {
  while (mounted.length) await TestRenderer.act(async () => mounted.pop().unmount());
});

let intent;
function Bridge({ bound, deferred, present }) {
  intent = usePremiumIntent();
  return (
    <PremiumCheckoutAfterConsent accountBound={bound} deferred={deferred} choice={intent.choice} present={present} onSettled={intent.clear}>
      <Text>THE APP</Text>
    </PremiumCheckoutAfterConsent>
  );
}
const tree = (props) => (
  <PremiumIntentProvider>
    <Bridge {...props} />
  </PremiumIntentProvider>
);
async function open(props) {
  const r = await render(tree(props));
  mounted.push(r);
  await TestRenderer.act(async () => intent.setChoice('premium'));
  return r;
}
const settle = () => TestRenderer.act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });

describe('Welcome Premium intent', () => {
  test('is kept, not acted on, while the Life Systems Audit is still ahead', async () => {
    const calls = [];
    await open({ bound: true, deferred: true, present: async () => { calls.push('present'); return { kind: 'cancelled' }; } });
    await settle();
    assert.deepEqual(calls, [], 'no paywall between consent and the audit');
    assert.equal(intent.choice, 'premium', 'the intent survives for the final onboarding step');
  });

  test('an already-onboarded account acts on it once, as before', async () => {
    const calls = [];
    await open({ bound: true, deferred: false, present: async () => { calls.push('present'); return { kind: 'cancelled' }; } });
    await settle();
    assert.deepEqual(calls, ['present']);
    assert.equal(intent.choice, null, 'spent');
  });

  test('an unbound account never presents, deferred or not', async () => {
    const calls = [];
    await open({ bound: false, deferred: false, present: async () => { calls.push('present'); return { kind: 'purchased' }; } });
    await settle();
    assert.deepEqual(calls, []);
  });
});

describe('wiring', () => {
  test('the app defers the welcome checkout until onboarding completes', () => {
    const layout = read('app/_layout.tsx');
    assert.match(layout, /deferred=\{!isOnboardingComplete\(snapshot\.state\.onboarding\)\}/);
  });

  test('the final onboarding step is the single place a new user\'s intent is spent', () => {
    const plus = read('app/onboarding/plus.tsx');
    assert.match(plus, /usePremiumIntent\(\)/);
    assert.match(plus, /intent\.clear\(\)/);
    assert.match(plus, /wantsPremium && status !== 'plus'/);
    assert.match(plus, /intentHandled\.current/);
  });

  test('Continue Free is always available on the final step, whatever the paywall did', () => {
    const plus = read('app/onboarding/plus.tsx');
    assert.match(plus, /label="Continue to Her Keys"/);
    assert.match(plus, /canResolveOnboardingPlus\('continued_without_plus', PAYWALL_POLICY\)/);
    assert.doesNotMatch(plus, /disabled=\{(?:!ready|!offering|paywall\.notice)/);
  });
});
