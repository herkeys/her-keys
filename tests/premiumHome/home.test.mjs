/**
 * The Premium home, rendered over the REAL PremiumStateProvider and hooks, with a scripted server and a scripted store SDK.
 * Nothing here proves a native store purchase (NOT RUN): the store SDK and the platform URL opener are the boundaries that are scripted.
 */
// Dates are the device's local day (an instant is formatted where she is); pin the zone so the expectations are the same everywhere.
process.env.TZ = 'UTC';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { fixture } from '../support/premium/stubs.mjs';
import { render } from '../support/render.tsx';

const stub = new URL('../support/premium/stubs.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (/\/RevenueCatProvider$/.test(specifier)) return next(stub, context);
  return next(specifier, context);
} });
const { PremiumStateProvider } = await import('../../src/monetization/PremiumStateProvider.tsx');
const { PremiumHome, PremiumHomeView } = await import('../../src/features/premium/PremiumHome.tsx');
const { usePremiumHome, MANAGE_UNAVAILABLE_NOTICE } = await import('../../src/features/premium/usePremiumHome.ts');
const { APPLE_SUBSCRIPTIONS_URL, GOOGLE_SUBSCRIPTIONS_URL } = await import('../../src/monetization/subscriptionManagement.ts');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const bound = (id) => ({ kind: 'accountBound', householdId: 'h', session: { accountId: id, accessToken: 't', refreshToken: 'r', expiresAt: 0, provider: null } });
const settle = async (n = 10) => { for (let i = 0; i < n; i += 1) await TestRenderer.act(async () => { await new Promise((r) => setImmediate(r)); }); };
const FEATURES = ['daily_load_premium', 'smart_inbox_extract', 'momentum_report'];

function makeServer() {
  const server = { states: new Map(), who: A, unreachable: false, verified: 0, onVerify: null, extra: {} };
  server.client = {
    entitlement: async () => {
      if (server.unreachable) return { kind: 'unavailable' };
      const state = server.states.get(server.who) ?? 'free';
      return { kind: 'ok', value: { state, expiresAt: '2026-11-13T00:00:00Z', graceExpiresAt: state === 'premium_billing_grace' ? '2026-10-20T00:00:00Z' : null, canceled: state === 'premium_canceled_active', needsReconcile: false, checkedAt: '', ...server.extra } };
    },
    manifest: async () => (server.unreachable ? { kind: 'unavailable' } : { kind: 'ok', entries: FEATURES.map((featureKey) => ({ featureKey, displayName: featureKey, tier: 'premium', available: true, requiresAiConsent: false, minAppVersion: null })) }),
    verify: async () => { server.verified += 1; server.onVerify?.(); return { kind: 'ok', status: 'reconciled' }; },
    authorize: async () => ({ kind: 'unavailable' }),
    extract: async () => ({ kind: 'unavailable', reason: 'x' }),
  };
  return server;
}

let probe;
function Harness({ deps, hold = false }) {
  const home = usePremiumHome(deps);
  probe = home;
  return <PremiumHomeView home={home} hold={hold} />;
}
const tree = (server, accountId, props = {}) => <PremiumStateProvider client={server.client} accountState={bound(accountId)}><Harness {...props} /></PremiumStateProvider>;

const text = (r) => r.root.findAllByType('Text').map((node) => [node.props.children].flat().join('')).join(' | ');
const labels = (r) => r.root.findAllByType('Pressable').map((node) => node.props.accessibilityLabel);
const press = (r, label) => r.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
const store = (status) => { fixture.entitlement = { ...fixture.entitlement, status, isPlus: status === 'plus' }; };
const mounted = [];
async function mount(server, accountId, props) {
  const r = await render(tree(server, accountId, props));
  mounted.push(r);
  await settle();
  return r;
}
afterEach(async () => {
  while (mounted.length) { const r = mounted.pop(); try { await TestRenderer.act(async () => r.unmount()); } catch { /* already gone */ } }
  fixture.entitlement = { status: 'free', isPlus: false, presentPaywall: async () => ({ kind: 'cancelled' }), restore: async () => ({ kind: 'no_purchases_found' }), refresh: async () => {} };
});

describe('each state, rendered from the server', () => {
  const cases = [
    { name: 'Free', server: 'free', store: 'free', title: /You’re on the Free plan/, buttons: ['See Her Keys Premium'] },
    { name: 'Premium Active', server: 'premium_active', store: 'plus', title: /Her Keys Premium is on/, buttons: ['Manage subscription'], also: /runs through November 13, 2026/ },
    { name: 'Canceled but Active', server: 'premium_canceled_active', store: 'plus', title: /is on, and won’t renew/, buttons: ['Manage subscription'], also: /through November 13, 2026/ },
    { name: 'Billing Grace', server: 'premium_billing_grace', store: 'plus', title: /there’s a payment problem/, buttons: ['Update payment method'], also: /until October 20, 2026/ },
    { name: 'Expired', server: 'premium_expired', store: 'free', title: /has ended/, buttons: ['Get Her Keys Premium again'] },
    { name: 'Revoked', server: 'premium_revoked', store: 'free', title: /purchase was refunded/, buttons: ['Get Her Keys Premium again'] },
    { name: 'Verification Pending', server: 'free', store: 'plus', title: /Confirming your purchase/, buttons: ['Manage subscription'] },
    { name: 'Account closing', server: 'deletion_pending', store: 'free', title: /This account is being closed/, buttons: [] },
  ];
  for (const c of cases) {
    test(`${c.name}`, async () => {
      const server = makeServer(); server.states.set(A, c.server); store(c.store);
      const r = await mount(server, A);
      assert.match(text(r), c.title);
      if (c.also) assert.match(text(r), c.also);
      assert.deepEqual(labels(r), c.buttons);
      assert.ok(!labels(r).some((label) => /restore/i.test(label)), 'the home renders no Restore Purchases control');
      for (const name of ['Daily Load review', 'Smart Inbox', 'Weekly review']) assert.match(text(r), new RegExp(name), `${c.name} lists ${name}`);
      assert.doesNotMatch(text(r), /[$€£]|\d+\.\d{2}|her_keys_plus/i, 'no price, no technical id');
    });
  }
  test('Service Unavailable: the server cannot be reached', async () => {
    const server = makeServer(); server.unreachable = true; store('free');
    const r = await mount(server, A);
    assert.match(text(r), /Can’t reach Her Keys Premium right now/);
    assert.deepEqual(labels(r), ['Try again']);
    assert.match(text(r), /Nothing has changed on your account/);
    server.unreachable = false; server.states.set(A, 'premium_active'); store('plus');
    await TestRenderer.act(async () => { await press(r, 'Try again').props.onPress(); }); await settle();
    assert.match(text(r), /Her Keys Premium is on/, 'a retry re-reads the server');
  });
  test('the three tools read "Ready" for a paying account and "Part of Her Keys Premium" for Free, from the same server state', async () => {
    const paid = makeServer(); paid.states.set(A, 'premium_active'); store('plus');
    const rp = await mount(paid, A);
    assert.equal((text(rp).match(/READY/g) ?? []).length, 3);
    const free = makeServer(); store('free');
    const rf = await mount(free, A);
    assert.equal((text(rf).match(/PART OF HER KEYS PREMIUM/g) ?? []).length, 3, 'free PART OF');
    assert.doesNotMatch(text(rf), /\bREADY\b/);
  });
});

describe('the server is the authority, not the store', () => {
  test('the store says paid but the server says Free: it says "confirming", never "is on"', async () => {
    const server = makeServer(); store('plus');
    const r = await mount(server, A);
    assert.doesNotMatch(text(r), /Her Keys Premium is on/);
    assert.match(text(r), /Confirming your purchase/);
    assert.doesNotMatch(text(r), /\bReady\b/);
  });
  test('the server says active while the store SDK says free: it is on', async () => {
    const server = makeServer(); server.states.set(A, 'premium_active'); store('free');
    const r = await mount(server, A);
    assert.match(text(r), /Her Keys Premium is on/);
  });
});

describe('buying', () => {
  test('See Her Keys Premium opens the store purchase interface once, then waits for the SERVER before claiming anything', async () => {
    const server = makeServer(); store('free');
    const placements = [];
    let finish;
    fixture.entitlement = { ...fixture.entitlement, presentPaywall: (placement) => { placements.push(placement); return new Promise((resolve) => { finish = resolve; }); } };
    const r = await mount(server, A);
    await TestRenderer.act(async () => { const press1 = press(r, 'See Her Keys Premium').props.onPress; press1(); press1(); });
    assert.deepEqual(placements, ['manual_upgrade'], 'single flight, with its own placement');
    assert.ok(press(r, 'Opening…').props.disabled);
    server.onVerify = () => server.states.set(A, 'premium_active');
    store('plus');
    await TestRenderer.act(async () => finish({ kind: 'purchased' })); await settle();
    assert.ok(server.verified >= 1, 'verification is handed to the server');
    assert.match(text(r), /Her Keys Premium is on/);
    assert.deepEqual(labels(r), ['Manage subscription']);
  });
  test('cancelling the purchase changes nothing and says so', async () => {
    const server = makeServer(); store('free');
    fixture.entitlement = { ...fixture.entitlement, presentPaywall: async () => ({ kind: 'cancelled' }) };
    const r = await mount(server, A);
    await TestRenderer.act(async () => { await press(r, 'See Her Keys Premium').props.onPress(); }); await settle();
    assert.match(text(r), /No purchase was made/);
    assert.match(text(r), /You’re on the Free plan/);
    assert.equal(server.verified, 0);
  });
  test('no offering and an SDK error are calm and recoverable', async () => {
    for (const [outcome, message] of [[{ kind: 'no_offering' }, /isn’t available to purchase right now/], [{ kind: 'error', message: 'private SDK detail' }, /couldn’t open right now/]]) {
      const server = makeServer(); store('free');
      fixture.entitlement = { ...fixture.entitlement, presentPaywall: async () => outcome };
      const r = await mount(server, A);
      await TestRenderer.act(async () => { await press(r, 'See Her Keys Premium').props.onPress(); }); await settle();
      assert.match(text(r), message);
      assert.doesNotMatch(text(r), /private SDK detail/);
      assert.equal(press(r, 'See Her Keys Premium').props.disabled, false, 'she can try again');
    }
  });
  test('an account that is closing cannot open the purchase interface', async () => {
    const server = makeServer(); server.states.set(A, 'deletion_pending'); store('free');
    let opened = 0;
    fixture.entitlement = { ...fixture.entitlement, presentPaywall: async () => { opened += 1; return { kind: 'purchased' }; } };
    const r = await mount(server, A);
    assert.equal((await probe.upgrade.start()).kind, 'unavailable');
    assert.equal(opened, 0);
    assert.deepEqual(labels(r), []);
  });
});

describe('managing the subscription', () => {
  test('Manage subscription opens the platform store screen, once', async () => {
    for (const [os, url] of [['ios', APPLE_SUBSCRIPTIONS_URL], ['android', GOOGLE_SUBSCRIPTIONS_URL]]) {
      const server = makeServer(); server.states.set(A, 'premium_active'); store('plus');
      const opened = [];
      let release;
      const deps = { os, openURL: (u) => { opened.push(u); return new Promise((resolve) => { release = resolve; }); } };
      const r = await mount(server, A, { deps });
      await TestRenderer.act(async () => { const go = press(r, 'Manage subscription').props.onPress; go(); go(); });
      assert.deepEqual(opened, [url], os);
      assert.equal(press(r, 'Manage subscription').props.disabled, true, 'held while it opens');
      await TestRenderer.act(async () => release()); await settle();
      assert.equal(press(r, 'Manage subscription').props.disabled, false);
      assert.doesNotMatch(text(r), new RegExp(MANAGE_UNAVAILABLE_NOTICE.slice(0, 20)));
    }
  });
  test('when the store screen cannot be opened she is told where to find it, and nothing changes', async () => {
    const server = makeServer(); server.states.set(A, 'premium_billing_grace'); store('plus');
    const r = await mount(server, A, { deps: { os: 'ios', openURL: async () => { throw new Error('no handler'); } } });
    await TestRenderer.act(async () => { await press(r, 'Update payment method').props.onPress(); }); await settle();
    assert.match(text(r), /open your store app and look for Subscriptions/i);
    assert.match(text(r), /payment problem/, 'the state is unchanged');
  });
});

describe('holding actions', () => {
  test('while the host is busy (a restore or a sign-in/out is pending) no purchase, check or manage control is enabled', async () => {
    for (const [serverState, storeStatus, label] of [['free', 'free', 'See Her Keys Premium'], ['premium_active', 'plus', 'Manage subscription'], ['premium_expired', 'free', 'Get Her Keys Premium again']]) {
      const server = makeServer(); server.states.set(A, serverState); store(storeStatus);
      const r = await mount(server, A, { hold: true });
      assert.equal(press(r, label).props.disabled, true, `${serverState}: ${label}`);
    }
  });
});

describe('account safety', () => {
  test('a different account never sees the previous account’s state', async () => {
    const server = makeServer(); server.states.set(A, 'premium_active'); store('plus');
    const r = await mount(server, A);
    assert.match(text(r), /Her Keys Premium is on/);
    server.who = B; store('free');
    await TestRenderer.act(async () => r.update(tree(server, B))); await settle();
    assert.doesNotMatch(text(r), /Her Keys Premium is on/);
    assert.match(text(r), /You’re on the Free plan/);
  });
  test('signed out, the container renders nothing, and where no provider is mounted it renders nothing', async () => {
    const r = await render(<PremiumHome hold={false} />);
    mounted.push(r);
    assert.equal(r.toJSON(), null);
  });
});
