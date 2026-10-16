/**
 * The REAL PremiumStateProvider and hooks, rendered, over a scripted server and a scripted store SDK. Proves the consumer journey
 * the A3 brief names: discover -> upgrade -> verified -> unlocked, restore, account switch, retry, and Free untouched throughout.
 * Nothing here proves a native store purchase (NOT RUN): the store SDK is the boundary that is scripted.
 */
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
const { PremiumStateProvider, usePremiumState, usePremiumFeature, usePremiumUpgrade } = await import('../../src/monetization/PremiumStateProvider.tsx');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const bound = (id) => ({ kind: 'accountBound', householdId: 'h', session: { accountId: id, accessToken: 't', refreshToken: 'r', expiresAt: 0, provider: null } });
const unauthenticated = { kind: 'unauthenticated' };
const settle = async (n = 10) => { for (let i = 0; i < n; i += 1) await TestRenderer.act(async () => { await new Promise((r) => setImmediate(r)); }); };

const entitlement = (state) => ({ kind: 'ok', value: { state, expiresAt: '2026-11-13T00:00:00Z', graceExpiresAt: null, canceled: false, needsReconcile: false, checkedAt: '' } });
function makeServer() {
  const server = {
    states: new Map(), // account -> state the server will report
    verified: [], decisions: [], calls: { entitlement: 0, verify: 0, authorize: 0 }, who: null,
    client: null,
  };
  server.client = {
    entitlement: async () => { server.calls.entitlement += 1; return entitlement(server.states.get(server.who) ?? 'free'); },
    purchaseReadiness: async () => ({ ready: true, reason: 'ready' }),
    manifest: async () => ({ kind: 'ok', entries: [
      { featureKey: 'daily_load_premium', displayName: 'Daily Load', tier: 'premium', available: true, requiresAiConsent: false, minAppVersion: null },
      { featureKey: 'smart_inbox_extract', displayName: 'Smart Inbox', tier: 'premium', available: true, requiresAiConsent: true, minAppVersion: null },
      { featureKey: 'momentum_report', displayName: 'Momentum', tier: 'premium', available: true, requiresAiConsent: false, minAppVersion: null },
    ] }),
    verify: async () => { server.calls.verify += 1; server.verified.push(server.who); return { kind: 'ok', status: 'reconciled' }; },
    authorize: async (request) => {
      server.calls.authorize += 1;
      const state = server.states.get(server.who) ?? 'free';
      const entitled = ['premium_active', 'premium_canceled_active', 'premium_billing_grace'].includes(state);
      return { kind: 'decision', decision: { outcome: entitled ? 'allowed' : 'denied', reason: entitled ? 'allowed' : 'requires_premium', entitlementState: state, via: entitled ? 'premium' : null, nextAction: entitled ? 'none' : 'open_paywall', quota: null, decisionId: `d-${server.calls.authorize}`, replay: false } };
    },
  };
  return server;
}

let probe;
function Probe() {
  const feature = usePremiumFeature('daily_load_premium', 'Daily Load');
  const upgrade = usePremiumUpgrade('premium_feature');
  probe = { feature, upgrade };
  return null;
}

afterEach(() => {
  fixture.entitlement = { status: 'free', isPlus: false, presentPaywall: async () => ({ kind: 'cancelled' }), restore: async () => ({ kind: 'no_purchases_found' }), refresh: async () => {} };
});

const mount = (server, accountState) => render(<PremiumStateProvider client={server.client} accountState={accountState}><Probe /></PremiumStateProvider>);
const remount = (renderer, server, accountState) => TestRenderer.act(async () => {
  renderer.update(<PremiumStateProvider client={server.client} accountState={accountState}><Probe /></PremiumStateProvider>);
});

describe('the consumer journey through the real provider', () => {
  test('V2 integration: stale same-household ledger callbacks cannot run after A -> B -> A', async () => {
    const server = makeServer();
    server.who = A;
    const calls = [];
    const ledger = {
      record: async () => { calls.push('record'); return { kind: 'unavailable' }; },
      transition: async () => { calls.push('transition'); return { kind: 'unavailable' }; },
      list: async () => { calls.push('list'); return { kind: 'ok', value: [] }; },
    };
    let context;
    function ContextProbe() { context = usePremiumState(); return null; }
    const tree = (id) => <PremiumStateProvider client={server.client} accountState={bound(id)} ledger={ledger}><ContextProbe /></PremiumStateProvider>;
    const r = await render(tree(A));
    await settle();
    const old = context;
    server.who = B;
    await TestRenderer.act(async () => r.update(tree(B)));
    server.who = A;
    await TestRenderer.act(async () => r.update(tree(A)));
    assert.equal(old.isCurrent(), false);
    assert.equal((await old.ledger.record({ householdId: 'h' })).kind, 'unavailable');
    assert.equal((await old.ledger.transition('receipt', 'applied')).kind, 'unavailable');
    assert.equal((await old.ledger.list('momentum_report', 'h', 20)).kind, 'unavailable');
    assert.deepEqual(calls, []);
    assert.equal((await context.ledger.list('momentum_report', 'h', 20)).kind, 'ok', 'saved reads remain available to a Free account');
    await TestRenderer.act(async () => r.unmount());
  });

  test('V2 integration: lifecycle restriction blocks computation, purchase and ledger writes before rerender', async () => {
    const server = makeServer(); server.who = A; server.states.set(A, 'premium_active');
    let allowed = true, extracts = 0, purchases = 0, writes = 0, context;
    server.client.extract = async () => { extracts++; return { kind: 'unavailable' }; };
    fixture.entitlement = { ...fixture.entitlement, presentPaywall: async () => { purchases++; return { kind: 'purchased' }; } };
    function ContextProbe() { context = usePremiumState(); return <Probe />; }
    const r = await render(<PremiumStateProvider client={server.client} accountState={bound(A)} isAccountCurrent={() => allowed}
      ledger={{ record: async () => { writes++; return { kind: 'unavailable' }; }, transition: async () => ({ kind: 'unavailable' }), list: async () => ({ kind: 'ok', value: [] }) }}><ContextProbe /></PremiumStateProvider>);
    await settle();
    allowed = false;
    assert.equal((await context.authorize({ feature: 'daily_load_premium', householdId: 'h', idempotencyKey: 'blocked-operation' })).kind, 'unavailable');
    assert.equal((await context.extract({ householdId: 'h' })).kind, 'unavailable');
    assert.equal((await context.ledger.record({ householdId: 'h' })).kind, 'unavailable');
    assert.equal((await probe.upgrade.start()).kind, 'unavailable');
    assert.equal(server.calls.authorize + extracts + purchases + writes, 0);
    await TestRenderer.act(async () => r.unmount());
  });

  test('V2 integration: a restored account with an SDK paid hint stays locked while fresh server verification is unavailable', async () => {
    const server = makeServer(); server.who = A; server.states.set(A, 'premium_active');
    const r = await mount(server, bound(A)); await settle();
    await remount(r, server, unauthenticated);
    server.client.entitlement = async () => entitlement('unknown');
    fixture.entitlement = { ...fixture.entitlement, status: 'plus', isPlus: true };
    await remount(r, server, bound(A)); await settle();
    assert.equal(probe.feature.usable, false);
    assert.notEqual(probe.feature.state.kind, 'entitled');
    server.client.entitlement = async () => entitlement('premium_active');
    await TestRenderer.act(async () => probe.feature.verify()); await settle();
    assert.equal(probe.feature.usable, true, 'only a fresh server reply unlocks');
    await TestRenderer.act(async () => r.unmount());
  });

  test('V2 integration: a purchase finishing after a switch cannot verify or notify the next account', async () => {
    const server = makeServer(); server.who = A;
    let finish;
    fixture.entitlement = { ...fixture.entitlement, presentPaywall: () => new Promise((resolve) => { finish = resolve; }) };
    const r = await mount(server, bound(A)); await settle();
    let pending;
    await TestRenderer.act(async () => { pending = probe.upgrade.start(); });
    server.who = B; await remount(r, server, bound(B));
    let outcome;
    await TestRenderer.act(async () => { finish({ kind: 'purchased' }); outcome = await pending; });
    assert.equal(outcome.kind, 'unavailable');
    assert.equal(server.calls.verify, 0);
    assert.equal(probe.upgrade.notice, null);
    await TestRenderer.act(async () => r.unmount());
  });

  test('V2 integration: every render after an account switch discards the previous server snapshot and open child state', async () => {
    const server = makeServer();
    server.states.set(A, 'premium_active');
    server.who = A;
    const renders = [];
    let open;
    function ScopedScreen() {
      const premium = usePremiumState();
      const [opened, setOpened] = React.useState(false);
      open = () => setOpened(true);
      renders.push({ accountId: premium.snapshot.accountId, server: premium.snapshot.server, opened });
      return null;
    }
    const r = await render(<PremiumStateProvider client={server.client} accountState={bound(A)}><ScopedScreen /></PremiumStateProvider>);
    await settle();
    await TestRenderer.act(async () => open());
    renders.length = 0;
    server.who = B;
    await TestRenderer.act(async () => r.update(<PremiumStateProvider client={server.client} accountState={bound(B)}><ScopedScreen /></PremiumStateProvider>));
    assert.ok(renders.every((row) => row.accountId !== A && row.server?.state !== 'premium_active' && !row.opened), 'no first-frame A state on B, including a shared household');
    await TestRenderer.act(async () => r.unmount());
  });
  test('free account: the feature offers Premium, names Her Keys Premium, and keeps Free untouched', async () => {
    const server = makeServer();
    server.who = A;
    const r = await mount(server, bound(A));
    await settle();
    assert.equal(probe.feature.state.kind, 'upgrade_required');
    assert.equal(probe.feature.usable, false);
    assert.match(probe.feature.copy.title, /Her Keys Premium/);
    assert.match(probe.feature.copy.body, /Everything free in Her Keys still works/);
    assert.equal(probe.feature.copy.action, 'upgrade');
    await TestRenderer.act(async () => r.unmount());
  });

  test('purchase: the paywall completes, the SERVER is asked to verify, and ONLY the server\'s answer unlocks the feature', async () => {
    const server = makeServer();
    server.who = A;
    const r = await mount(server, bound(A));
    await settle();
    // The store SDK reports a purchase immediately, but the server has not caught up yet.
    fixture.entitlement = { ...fixture.entitlement, status: 'plus', isPlus: true, presentPaywall: async () => ({ kind: 'purchased' }) };
    await remount(r, server, bound(A));
    await settle();
    assert.notEqual(probe.feature.state.kind, 'entitled', 'the SDK alone must not unlock Premium');
    assert.equal(probe.feature.state.kind, 'verification_pending');
    assert.equal(probe.feature.usable, false);
    // The webhook lands: the next server check says entitled.
    server.states.set(A, 'premium_active');
    await TestRenderer.act(async () => { await probe.feature.verify(); });
    await settle();
    assert.equal(probe.feature.state.kind, 'entitled');
    assert.equal(probe.feature.usable, true);
    assert.ok(server.verified.every((who) => who === A), 'every verification was for the account that bought');
    await TestRenderer.act(async () => r.unmount());
  });

  test('the upgrade flow presents the paywall for its placement, then hands verification to the server (not the store)', async () => {
    const server = makeServer();
    server.who = A;
    const placements = [];
    fixture.entitlement = { ...fixture.entitlement, presentPaywall: async (placement) => { placements.push(placement); return { kind: 'purchased' }; } };
    const r = await mount(server, bound(A));
    await settle();
    let outcome;
    await TestRenderer.act(async () => { outcome = await probe.upgrade.start(); });
    await settle();
    assert.deepEqual(placements, ['premium_feature']);
    assert.equal(outcome.kind, 'purchased');
    assert.ok(server.calls.verify >= 1, 'the SERVER was asked to verify');
    assert.match(probe.upgrade.notice.message, /confirming/i);
    assert.doesNotMatch(probe.upgrade.notice.message, /is on|is active/i);
    await TestRenderer.act(async () => r.unmount());
  });

  test('a cancelled paywall changes nothing, says so kindly, and she can try again', async () => {
    const server = makeServer();
    server.who = A;
    const r = await mount(server, bound(A));
    await settle();
    await TestRenderer.act(async () => { await probe.upgrade.start(); });
    assert.equal(server.calls.verify, 0);
    assert.match(probe.upgrade.notice.message, /No purchase was made/);
    assert.equal(probe.upgrade.presenting, false);
    assert.equal(probe.feature.state.kind, 'upgrade_required');
    await TestRenderer.act(async () => r.unmount());
  });

  test('single-flight: pressing the upgrade control twice opens ONE paywall', async () => {
    const server = makeServer();
    server.who = A;
    let opened = 0;
    let finish;
    fixture.entitlement = { ...fixture.entitlement, presentPaywall: () => { opened += 1; return new Promise((resolve) => { finish = resolve; }); } };
    const r = await mount(server, bound(A));
    await settle();
    await TestRenderer.act(async () => { void probe.upgrade.start(); void probe.upgrade.start(); });
    assert.equal(opened, 1);
    await TestRenderer.act(async () => { finish({ kind: 'cancelled' }); });
    await TestRenderer.act(async () => r.unmount());
  });

  test('switching accounts: B never inherits A\'s Premium, A\'s decisions are gone, and the account is re-read', async () => {
    const server = makeServer();
    server.states.set(A, 'premium_active');
    server.who = A;
    const r = await mount(server, bound(A));
    await settle();
    assert.equal(probe.feature.state.kind, 'entitled');
    await TestRenderer.act(async () => { await probe.feature.authorize({ householdId: 'h', idempotencyKey: 'k-0000001' }); });
    assert.equal(probe.feature.decision?.outcome, 'allowed');

    server.who = B; // B has no Premium
    await remount(r, server, bound(B));
    // synchronously after the switch: nothing of A remains
    assert.notEqual(probe.feature.state.kind, 'entitled');
    assert.equal(probe.feature.decision, null);
    await settle();
    assert.equal(probe.feature.state.kind, 'upgrade_required');
    await TestRenderer.act(async () => r.unmount());
  });

  test('signing out leaves a signed-out state with no Premium at all, and signing back in re-reads the server', async () => {
    const server = makeServer();
    server.states.set(A, 'premium_active');
    server.who = A;
    const r = await mount(server, bound(A));
    await settle();
    await remount(r, server, unauthenticated);
    await settle();
    assert.equal(probe.feature.state.kind, 'signed_out');
    assert.equal(probe.feature.usable, false);
    const before = server.calls.entitlement;
    await remount(r, server, bound(A));
    await settle();
    assert.ok(server.calls.entitlement > before);
    assert.equal(probe.feature.state.kind, 'entitled');
    await TestRenderer.act(async () => r.unmount());
  });

  test('a non-bound account state (degraded, claiming) holds NO Premium', async () => {
    const server = makeServer();
    server.states.set(A, 'premium_active');
    server.who = A;
    const r = await mount(server, { kind: 'authDegraded', accountId: A, householdId: 'h', reason: 'x' });
    await settle();
    assert.equal(probe.feature.state.kind, 'signed_out');
    assert.equal(server.calls.entitlement, 0, 'nothing is even requested for an account that is not bound');
    await TestRenderer.act(async () => r.unmount());
  });

  test('the server decision is shown as it was: a denial that the SERVER made (consent) surfaces, with its own words', async () => {
    const server = makeServer();
    server.states.set(A, 'premium_active');
    server.who = A;
    server.client.authorize = async () => ({ kind: 'decision', decision: { outcome: 'denied', reason: 'requires_ai_consent', entitlementState: 'premium_active', via: null, nextAction: 'grant_ai_consent', quota: null, decisionId: 'd', replay: false } });
    const r = await mount(server, bound(A));
    await settle();
    await TestRenderer.act(async () => { await probe.feature.authorize({ householdId: 'h', idempotencyKey: 'k-0000002' }); });
    assert.equal(probe.feature.state.kind, 'consent_required');
    assert.equal(probe.feature.copy.action, 'manage_consent');
    await TestRenderer.act(async () => r.unmount());
  });

  test('a subscription denial clears itself when the server\'s state changes (she bought it since)', async () => {
    const server = makeServer();
    server.who = A;
    const r = await mount(server, bound(A));
    await settle();
    await TestRenderer.act(async () => { await probe.feature.authorize({ householdId: 'h', idempotencyKey: 'k-0000003' }); });
    assert.equal(probe.feature.decision?.reason, 'requires_premium');
    server.states.set(A, 'premium_active');
    await TestRenderer.act(async () => { await probe.feature.refresh(); });
    await settle();
    assert.equal(probe.feature.decision, null, 'the stale denial was dropped');
    assert.equal(probe.feature.state.kind, 'entitled');
    await TestRenderer.act(async () => r.unmount());
  });

  test('a late authorization answer after an account switch is dropped, not shown to the new account', async () => {
    const server = makeServer();
    server.states.set(A, 'premium_active');
    server.who = A;
    let release;
    server.client.authorize = () => new Promise((resolve) => { release = () => resolve({ kind: 'decision', decision: { outcome: 'allowed', reason: 'allowed', entitlementState: 'premium_active', via: 'premium', nextAction: 'none', quota: null, decisionId: 'late', replay: false } }); });
    const r = await mount(server, bound(A));
    await settle();
    let pending;
    await TestRenderer.act(async () => { pending = probe.feature.authorize({ householdId: 'h', idempotencyKey: 'k-0000004' }); });
    server.who = B;
    await remount(r, server, bound(B));
    await settle();
    let result;
    await TestRenderer.act(async () => { release(); result = await pending; });
    assert.equal(result.kind, 'unavailable', 'the answer belonged to the previous account');
    assert.equal(probe.feature.decision, null);
    await TestRenderer.act(async () => r.unmount());
  });

  test('Free is never routed through Premium state: an unreachable server only affects Premium features', async () => {
    const server = makeServer();
    server.who = A;
    server.client.entitlement = async () => ({ kind: 'unavailable' });
    const r = await mount(server, bound(A));
    await settle();
    assert.equal(probe.feature.state.kind, 'feature_unavailable');
    assert.match(probe.feature.copy.body, /Everything free in Her Keys still works/);
    await TestRenderer.act(async () => r.unmount());
  });
});
