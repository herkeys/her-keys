/**
 * SC-03 — every Premium control ends in words, and the app says only what its source supports about Premium.
 *
 * The surfaces and hooks are the real ones; only the entitlement provider (the RevenueCat boundary), the onboarding store and the
 * Systems hub are scripted. Nothing here proves a native store paywall, purchase or restore (NOT RUN): it proves what Her Keys
 * itself shows for each outcome the boundary can report.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform, Text } from 'react-native';
import { fixture } from './support/premium/stubs.mjs';
import { render } from './support/render.tsx';
import { paywallNoticeFor } from '../src/monetization/paywallFeedback.ts';
import { PremiumCheckoutAfterConsent } from '../src/monetization/PremiumCheckoutAfterConsent.tsx';
import { PremiumIntentProvider, usePremiumIntent } from '../src/store/PremiumIntentContext.tsx';

const stub = new URL('./support/premium/stubs.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (/\/(RevenueCatProvider|OnboardingContext|SystemsHub|PremiumStateProvider)$/.test(specifier) || specifier === 'expo-router') return next(stub, context);
  return next(specifier, context);
} });
const { default: SystemsScreen } = await import('../app/(app)/systems/index.tsx');
const { default: PlusStep } = await import('../app/onboarding/plus.tsx');

const OUTCOMES = [
  { kind: 'purchased' }, { kind: 'restored' }, { kind: 'already_entitled' }, { kind: 'cancelled' },
  { kind: 'no_offering' }, { kind: 'unavailable' }, { kind: 'error', message: 'StoreKit SKErrorDomain 2 private detail' },
];
const text = (r) => r.root.findAllByType('Text').map((node) => [node.props.children].flat(Infinity).join('')).join(' | ');
const button = (r, label) => r.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
const act = async (f) => TestRenderer.act(async () => { await f(); });
const settle = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const reset = () => {
  fixture.entitlement = { status: 'free', isPlus: false, presentPaywall: async () => ({ kind: 'cancelled' }), restore: async () => ({ kind: 'no_purchases_found' }), refresh: async () => {} };
  fixture.onboarding = { completeCalls: 0, complete: async () => true };
  fixture.manifest = ['daily_load_premium', 'smart_inbox_extract', 'momentum_report'].map((featureKey) => ({ featureKey, tier: 'premium', available: true }));
};
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('SC-03: every paywall outcome has words in the right tone, and none leak the SDK’s own message', () => {
  const tones = Object.fromEntries(OUTCOMES.map((o) => [o.kind, paywallNoticeFor(o)?.tone]));
  assert.deepEqual(tones, { purchased: 'success', restored: 'success', already_entitled: 'success', cancelled: 'info', no_offering: 'attention', unavailable: 'attention', error: 'attention' });
  for (const outcome of OUTCOMES) assert.doesNotMatch(paywallNoticeFor(outcome).message, /StoreKit|SKErrorDomain|private detail/);
  assert.equal(paywallNoticeFor({ kind: 'continued_without_plus' }), null, 'a path the SDK never reports says nothing');
  for (const kind of ['no_offering', 'unavailable', 'error']) assert.match(paywallNoticeFor({ kind, message: 'x' }).message, /try again/i);
  assert.match(paywallNoticeFor({ kind: 'error', message: 'x' }).message, /Restore purchases/, 'a failed paywall points to restore');
  assert.match(paywallNoticeFor({ kind: 'unavailable' }).message, /everything in Her Keys still works/, 'free features are never implied to be affected');
});

test('V2 integration: onboarding routes to Account for restore rather than mounting a second transaction control', async () => {
  reset(); fixture.navigation.length = 0;
  const r = await render(<PremiumIntentProvider><PlusStep /></PremiumIntentProvider>);
  try {
    assert.equal(button(r, 'Restore purchases'), undefined);
    await act(() => button(r, 'Your Account & purchases').props.onPress());
    assert.deepEqual(fixture.navigation, ['/sign-in']);
  } finally { await act(() => r.unmount()); }
});

for (const platform of ['android', 'ios']) {
  test(`SC-03 ${platform}: the Systems Premium card tells her how every paywall ended`, async () => {
    const previous = Platform.OS;
    Platform.OS = platform;
    try {
      for (const outcome of OUTCOMES) {
        reset();
        fixture.entitlement.presentPaywall = async () => outcome;
        const r = await render(<SystemsScreen />);
        await act(() => button(r, 'Learn about Her Keys Premium').props.onPress());
        await settle();
        assert.ok(text(r).includes(paywallNoticeFor(outcome).message), `${outcome.kind}: ${text(r)}`);
        assert.equal(button(r, 'Learn about Her Keys Premium').props.disabled, false, 'she can try again');
        await act(() => r.unmount());
      }
    } finally { Platform.OS = previous; }
  });
}

test('SC-03: the Systems card is single-flight, a throwing paywall is a failed paywall, and entitled users see no upsell', async () => {
  reset();
  const pending = deferred();
  let calls = 0;
  fixture.entitlement.presentPaywall = () => { calls += 1; return pending.promise; };
  const r = await render(<SystemsScreen />);
  const press = button(r, 'Learn about Her Keys Premium').props.onPress;
  await act(() => { press(); press(); });
  assert.equal(calls, 1);
  assert.equal(button(r, 'Learn about Her Keys Premium').props.disabled, true, 'disabled while the paywall is open');
  await act(async () => pending.resolve({ kind: 'cancelled' }));
  await settle();
  assert.match(text(r), /No purchase was made/);
  await act(() => r.unmount());

  reset();
  fixture.entitlement.presentPaywall = async () => { throw new Error('native module missing'); };
  const failing = await render(<SystemsScreen />);
  await act(() => button(failing, 'Learn about Her Keys Premium').props.onPress());
  await settle();
  assert.match(text(failing), /couldn’t open right now/);
  assert.doesNotMatch(text(failing), /native module missing/);
  await act(() => failing.unmount());

  reset();
  fixture.entitlement.isPlus = true;
  const entitled = await render(<SystemsScreen />);
  assert.equal(button(entitled, 'Learn about Her Keys Premium'), undefined, 'an entitled user is never upsold');
  await act(() => entitled.unmount());
});

test('SC-03: the unmounted Systems card ignores a paywall that ends late', async () => {
  reset();
  const pending = deferred();
  fixture.entitlement.presentPaywall = () => pending.promise;
  const r = await render(<SystemsScreen />);
  await act(() => button(r, 'Learn about Her Keys Premium').props.onPress());
  await act(() => r.unmount());
  await act(async () => pending.resolve({ kind: 'unavailable' }));
});

test('SC-03: the onboarding step words an unavailable offering, a failure and a cancel — and never traps her', async () => {
  for (const outcome of OUTCOMES.filter((o) => ['cancelled', 'no_offering', 'unavailable', 'error'].includes(o.kind))) {
    reset();
    fixture.entitlement.presentPaywall = async () => outcome;
    const r = await render(<PremiumIntentProvider><PlusStep /></PremiumIntentProvider>);
    await act(() => button(r, 'Explore Her Keys Premium').props.onPress());
    await settle();
    assert.ok(text(r).includes(paywallNoticeFor(outcome).message), outcome.kind);
    assert.equal(fixture.onboarding.completeCalls, 0, 'a paywall that did not buy never completes onboarding by itself');
    assert.ok(button(r, 'Explore Her Keys Premium'), 'the control stays so she can try again (it used to vanish without a word)');
    assert.equal(button(r, 'Continue to Her Keys').props.disabled, false, 'free continuation is never blocked');
    await act(() => r.unmount());
  }
});

test('SC-03: the onboarding step completes on purchase or restore, once, and on free continuation', async () => {
  for (const kind of ['purchased', 'restored']) {
    reset();
    fixture.entitlement.presentPaywall = async () => ({ kind });
    const r = await render(<PremiumIntentProvider><PlusStep /></PremiumIntentProvider>);
    await act(() => button(r, 'Explore Her Keys Premium').props.onPress());
    await settle();
    assert.equal(fixture.onboarding.completeCalls, 1, kind);
    await act(() => r.unmount());
  }
  reset();
  const free = await render(<PremiumIntentProvider><PlusStep /></PremiumIntentProvider>);
  await act(() => button(free, 'Continue to Her Keys').props.onPress());
  await settle();
  assert.equal(fixture.onboarding.completeCalls, 1);
  await act(() => free.unmount());
});

test('SC-03: final onboarding lists exactly the Stage 1 tools and no unshipped promises', async () => {
  reset();
  const r = await render(<PremiumIntentProvider><PlusStep /></PremiumIntentProvider>);
  const shown = text(r);
  assert.match(shown, /Daily Load review/);
  assert.match(shown, /Smart Inbox/);
  assert.match(shown, /Weekly review/);
  assert.doesNotMatch(shown, /Co-Parent Plus|The Village|household intelligence|unlimited|automation for repeatable work/i);
  assert.match(shown, /continue Free/i);
  await act(() => r.unmount());
});

test('SC-03: onboarding refuses a commercial purchase while the server has unreleased Premium features', async () => {
  for (const manifest of [null, [{ featureKey: 'daily_load_premium', tier: 'premium', available: true }]]) {
    reset();
    fixture.manifest = manifest;
    let purchased = 0;
    fixture.entitlement.presentPaywall = async () => { purchased += 1; return { kind: 'purchased' }; };
    const r = await render(<PremiumIntentProvider><PlusStep /></PremiumIntentProvider>);
    await act(() => button(r, 'Explore Her Keys Premium').props.onPress());
    await settle();
    assert.equal(purchased, 0, 'no native checkout before all three feature flags are released');
    assert.equal(button(r, 'Continue to Her Keys').props.disabled, false);
    await act(() => r.unmount());
  }
});

test('SC-03: pre-auth Premium intent waits for server manifest and opens one paywall, never before', async () => {
  reset();
  fixture.manifest = null;
  let choice, purchases = 0;
  function Choose() { choice = usePremiumIntent(); return null; }
  fixture.entitlement.presentPaywall = async () => { purchases += 1; return { kind: 'cancelled' }; };
  const screen = () => <PremiumIntentProvider><Choose /><PlusStep /></PremiumIntentProvider>;
  const r = await render(screen());
  try {
    await act(() => choice.setChoice('premium'));
    await settle();
    assert.equal(purchases, 0, 'no paid sheet while server feature manifest is unknown');
    fixture.manifest = ['daily_load_premium', 'smart_inbox_extract', 'momentum_report']
      .map((featureKey) => ({ featureKey, tier: 'premium', available: true }));
    await act(() => r.update(screen()));
    await settle();
    assert.equal(purchases, 1, 'exactly one store sheet after all three server flags are ready');
    await act(() => r.update(screen()));
    await settle();
    assert.equal(purchases, 1, 'rerender does not duplicate purchase');
  } finally { await act(() => r.unmount()); }
});

test('SC-03: Continue Free clears a pending Premium intent even if the manifest never loads', async () => {
  reset();
  fixture.manifest = null;
  let choice, purchases = 0;
  function Choose() { choice = usePremiumIntent(); return null; }
  fixture.entitlement.presentPaywall = async () => { purchases += 1; return { kind: 'purchased' }; };
  const screen = () => <PremiumIntentProvider><Choose /><PlusStep /></PremiumIntentProvider>;
  const r = await render(screen());
  try {
    await act(() => choice.setChoice('premium'));
    await act(() => button(r, 'Continue to Her Keys').props.onPress());
    fixture.manifest = ['daily_load_premium', 'smart_inbox_extract', 'momentum_report']
      .map((featureKey) => ({ featureKey, tier: 'premium', available: true }));
    await act(() => r.update(screen()));
    await settle();
    assert.equal(choice.choice, null, 'Free continuation consumes the earlier Premium intent');
    assert.equal(purchases, 0, 'no late store sheet after Free continuation');
    assert.equal(fixture.onboarding.completeCalls, 1);
  } finally { await act(() => r.unmount()); }
});

async function checkout(outcome, choice = 'premium') {
  const calls = { settled: 0 };
  const present = typeof outcome === 'function' ? outcome : async () => outcome;
  const r = await render(
    <PremiumCheckoutAfterConsent accountBound choice={choice} present={present} onSettled={() => { calls.settled += 1; }}>
      <Text>THE-APP</Text>
    </PremiumCheckoutAfterConsent>,
  );
  await settle();
  return { r, calls };
}

test('SC-03: after consent, a Premium choice that cannot be fulfilled is told to her — and the app stays open', async () => {
  for (const outcome of OUTCOMES) {
    const { r, calls } = await checkout(outcome);
    assert.match(text(r), /THE-APP/, 'the app is visible throughout');
    assert.ok(text(r).includes(paywallNoticeFor(outcome).message), outcome.kind);
    assert.equal(calls.settled, 1, 'the intent is consumed exactly once');
    await act(() => r.unmount());
  }
});

test('SC-03: a checkout that throws is worded, never blocks the app, and the notice can be dismissed', async () => {
  const { r, calls } = await checkout(async () => { throw new Error('offerings fetch failed'); });
  assert.match(text(r), /THE-APP/);
  assert.match(text(r), /couldn’t open right now/);
  assert.doesNotMatch(text(r), /offerings fetch failed/);
  assert.equal(calls.settled, 1);
  await act(() => button(r, 'Dismiss').props.onPress());
  assert.doesNotMatch(text(r), /couldn’t open right now/);
  assert.match(text(r), /THE-APP/);
  await act(() => r.unmount());
});

test('SC-03: a free choice shows nothing and offers no checkout', async () => {
  let presented = 0;
  const { r } = await checkout(async () => { presented += 1; return { kind: 'purchased' }; }, 'free');
  assert.equal(presented, 0);
  assert.equal(button(r, 'Dismiss'), undefined);
  assert.match(text(r), /THE-APP/);
  await act(() => r.unmount());
});

// ------------------------------------------------------------------------------- the benefit audit, pinned as source

const sources = ['app', 'src']
  .flatMap((dir) => readdirSync(dir, { recursive: true }).map((f) => `${dir}/${String(f).replaceAll('\\', '/')}`))
  .filter((f) => /\.(ts|tsx)$/.test(f));
const read = (file) => readFileSync(file, 'utf8');

test('PBP-1: no feature is gated on her_keys_plus — outside src/monetization the only entitlement read is the Systems upsell card', () => {
  const readers = sources
    .filter((f) => !f.startsWith('src/monetization/'))
    .filter((f) => /\b(isPlus|usePremiumGate|checkFeatureAccess|FEATURE_ACCESS)\b/.test(read(f)))
    .sort();
  // If this fails because a feature is NOW gated: good — update the Premium benefit map (docs/audits/HK_BUILD2_SHARED_CONSUMER_REPAIR_LEDGER.md)
  // with the real feature, its entitlement check and its test, then update this list.
  assert.deepEqual(readers, ['app/(app)/systems/index.tsx']);
  const gates = sources.filter((f) => f !== 'src/monetization/usePremiumGate.ts' && f !== 'src/monetization/featureAccess.ts').filter((f) => /\b(usePremiumGate|checkFeatureAccess)\b/.test(read(f)));
  assert.deepEqual(gates, [], 'usePremiumGate / checkFeatureAccess have no consumer: advanced_daily_load_patterns and momentum_insights gate nothing');
});

test('PBP-1b (Premium Stage 1): the ONLY server-authoritative consumers of Premium state outside src/monetization are the Premium features themselves', () => {
  // Stage 1 contract (docs/premium/PREMIUM_STAGE1_A0_ARCHITECTURE.md section 3): a protected operation asks `usePremiumFeature`, whose answer is
  // the SERVER's, and the server decides again when the operation runs. Add a feature here only with its server gate and its tests.
  const consumers = sources
    .filter((f) => !f.startsWith('src/monetization/'))
    .filter((f) => /\busePremiumFeature\b|\busePremiumUpgrade\b/.test(read(f)))
    .sort();
  // Daily Load review (gate `daily_load_premium`) and the Momentum weekly review (gate `momentum_report`). Smart Inbox reaches the server through the
  // capture seam (`src/features/smart-inbox/PremiumReaderBridge.tsx`, which publishes only the server-confirmed entitlement), not through this hook.
  // The Premium home (Your Account) is a PURCHASE surface, not a protected operation: it opens the store's purchase interface through `usePremiumUpgrade`
  // and gates nothing. It must never use `usePremiumFeature` (pinned in tests/premiumHome/structure.test.mjs).
  assert.deepEqual(consumers, ['src/features/daily-load/premium/usePremiumDailyLoad.ts', 'src/features/momentum/premium/usePremiumMomentum.ts', 'src/features/premium/usePremiumHome.ts']);
});

test('PBP-2 (evolved in Premium Stage 1): the backend enforces Premium ONLY inside the Premium namespace — no Free function, calendar, weather, AI, welcome-email or sync path reads the entitlement', () => {
  const backend = readdirSync('supabase', { recursive: true }).map((f) => `supabase/${String(f).replaceAll('\\', '/')}`).filter((f) => /\.(ts|sql|toml|example)$/.test(f));
  assert.ok(backend.length > 10, 'the scan is not vacuous');
  const mentions = backend.filter((f) => /her_keys_plus|revenuecat|premium_(entitlements|authorize|usage|derive_state|my_entitlement)/i.test(read(f)));
  // Deletion removes the external provider customer; its name is not an entitlement read. Keep these exact cleanup/fixture
  // paths classified separately and prohibit ANY projection/authorization reference inside them. Never exempt a Free consumer.
  const deletionProviderOnly = new Set(['supabase/blueprints/staging-deletion-fixture.ts', 'supabase/functions/_shared/deletionProviders.ts', 'supabase/functions/_shared/deletionWorker.ts', 'supabase/functions/_shared/deletionCore.ts']);
  for (const file of deletionProviderOnly) {
    assert.doesNotMatch(read(file), /her_keys_plus|premium_(entitlements|authorize|usage|derive_state|my_entitlement)/i, `${file} must not read or enforce Premium`);
  }
  const PREMIUM_BACKEND = /^supabase\/(migrations\/\d{14}_premium_[a-z_]+\.sql|functions\/(_shared\/premium\/|premium-[a-z]+\/|revenuecat-webhook\/|smart-inbox-[a-z-]+\/|\.env\.example$|_shared\/supabaseAdmin\.ts$)|config\.toml$|tests\/)/;
  // Reviewed deletion migration counts/removes owned Premium records. It must
  // never use entitlement state to decide eligibility for account deletion.
  const deletionResourceMigration='supabase/migrations/20261019144729_account_deletion_v2_resource_certification.sql';
  assert.doesNotMatch(read(deletionResourceMigration),/her_keys_plus|premium_(authorize|derive_state|my_entitlement)\s*\(|has_entitlement\s*(=|IS|THEN)/i);
  assert.match(read(deletionResourceMigration),/deletion_verify_resources/);
  const deletionTestFixtures=new Set(['supabase/blueprints/staging-deletion-v2-certification.sql','supabase/blueprints/staging-deletion-v2-certification.ts']);
  for(const file of deletionTestFixtures){
    assert.match(read(file),/fhhudicklmpofuzkxeqe/,'fixture must pin Her Keys Staging');
    assert.match(read(file),/deletion_certification_fixture/,'fixture must require owned synthetic identities');
  }
  assert.deepEqual(mentions.filter((f) => !PREMIUM_BACKEND.test(f) && !deletionProviderOnly.has(f) && f!==deletionResourceMigration && !deletionTestFixtures.has(f)), [], 'a function or migration outside the Premium namespace reads or enforces the entitlement');
  assert.ok(mentions.some((f) => f.startsWith('supabase/functions/premium-gate/') || f.startsWith('supabase/functions/_shared/premium/')), 'and the Premium namespace really does carry the enforcement');
  // The Free functions are named, so a future edit that quietly gates one fails here by name.
  for (const free of ['herkeys-ai', 'calendar-data', 'calendar-oauth', 'weather-context', 'herkeys-welcome-email']) {
    assert.doesNotMatch(readdirSync(`supabase/functions/${free}`).map((n) => read(`supabase/functions/${free}/${n}`)).join('\n'), /her_keys_plus|revenuecat|premium_/i, `${free} must stay Free`);
  }
});

test('PBP-3: outside the Welcome Tree, no source copy claims Premium benefits the app does not deliver', () => {
  const claims = /Deeper household intelligence|More proactive planning|Enhanced Talk It Out|Future automation for repeatable|Life OS intelligence|pattern recognition/i;
  const offenders = sources.filter((f) => !f.startsWith('src/features/welcome/') && f !== 'src/data/catalog/oneMoves.ts').filter((f) => claims.test(read(f)));
  assert.deepEqual(offenders, [], 'Welcome Tree copy is the Welcome owner’s; see the ledger for the proposed correction');
});
