/**
 * V2UP workstream C (Premium experience): two behaviours, proven through the REAL provider and the REAL Momentum card over a scripted
 * server and a scripted store SDK. Nothing here proves a native purchase (NOT RUN); fixtures only.
 *
 *  1. A server denial about her SUBSCRIPTION re-reads the server's state, so a screen that still said "Premium is on" (the subscription
 *     ended, was refunded or revoked since the last read) stops offering what the server will not do. The refresh only moves the display
 *     toward what the server said; it never grants anything.
 *  2. The weekly-review card is visible in every state she must be able to act on from Today (waiting for the server, ended, limit,
 *     old app), and stays silent where there is nothing true to say (no account, loading, switched off, a Free account offline).
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { fixture } from './support/premium/stubs.mjs';
import { render } from './support/render.tsx';

const stub = new URL('./support/premium/stubs.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (/\/RevenueCatProvider$/.test(specifier) || specifier === 'expo-router') return next(stub, context);
  return next(specifier, context);
} });
const { PremiumStateProvider, usePremiumFeature, usePremiumState } = await import('../src/monetization/PremiumStateProvider.tsx');
const { PremiumMomentumSection, showsMomentumCard } = await import('../src/features/momentum/premium/PremiumMomentumSection.tsx');
const { AppStateProvider } = await import('../src/store/AppStateProvider.tsx');
const { STORAGE_KEYS } = await import('../src/persistence/appStateRepository.ts');
const { completeTask, updateTask } = await import('../src/domain/tasks.ts');
const { harness, launch, stored, nyMs } = await import('./support/fixtures.mjs');
const { FakeLedger } = await import('./support/premiumLedger.mjs');
const { dayPlan, makeCtx, task, wednesdayOverload } = await import('./support/premiumDomain.mjs');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-00000000000a';
const bound = (id = A) => ({ kind: 'accountBound', householdId: HOUSEHOLD, session: { accountId: id, accessToken: 't', refreshToken: 'r', expiresAt: 0, provider: null } });
const act = async (f) => TestRenderer.act(async () => { await f(); });
const settle = async (n = 12) => { for (let i = 0; i < n; i += 1) await act(async () => { await new Promise((r) => setImmediate(r)); }); };
const allText = (r) => r.root.findAllByType('Text').map((node) => [node.props.children].flat(Infinity).join('')).join(' | ');
const button = (r, label) => r.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);

const ENTITLED = ['premium_active', 'premium_canceled_active', 'premium_billing_grace'];
const entitlement = (state) => ({ kind: 'ok', value: { state, expiresAt: '2026-11-13T00:00:00Z', graceExpiresAt: null, canceled: false, needsReconcile: false, checkedAt: '' } });
const manifestEntry = (featureKey, available = true) => ({ featureKey, displayName: featureKey, tier: 'premium', available, requiresAiConsent: false, minAppVersion: null });
const denial = (reason, state, nextAction = 'open_paywall') => ({ outcome: 'denied', reason, entitlementState: state, via: null, nextAction, quota: null, decisionId: 'd', replay: false });

function makeServer({ state = 'premium_active', available = true, gate = null } = {}) {
  const server = {
    state, available, calls: { entitlement: 0, authorize: 0, extract: 0, verify: 0 }, unreachable: false,
    client: null,
  };
  server.client = {
    entitlement: async () => { server.calls.entitlement += 1; return server.unreachable ? { kind: 'unavailable' } : entitlement(server.state); },
    manifest: async () => (server.unreachable ? { kind: 'unavailable' } : { kind: 'ok', entries: [manifestEntry('momentum_report', server.available), manifestEntry('daily_load_premium', server.available)] }),
    purchaseReadiness: async () => ({ ready: true, reason: 'ready' }),
    verify: async () => { server.calls.verify += 1; return { kind: 'ok', status: 'reconciled' }; },
    authorize: async (request) => {
      server.calls.authorize += 1;
      const decision = gate ? gate(request, server) : ENTITLED.includes(server.state)
        ? { outcome: 'allowed', reason: 'allowed', entitlementState: server.state, via: 'premium', nextAction: 'none', quota: null, decisionId: 'd', replay: false }
        : denial('entitlement_expired', server.state);
      return { kind: 'decision', decision };
    },
    extract: async () => {
      server.calls.extract += 1;
      return ENTITLED.includes(server.state) ? { kind: 'unavailable', reason: 'test' } : { kind: 'denied', decision: denial('requires_premium', server.state) };
    },
  };
  return server;
}

// Every renderer a test mounts is unmounted after it, even when an assertion threw first: a provider/tree left mounted keeps timers and
// listeners alive, and a test process that never exits starves the shared host.
const mounted = [];
const track = (renderer) => { mounted.push(renderer); return renderer; };
afterEach(async () => {
  while (mounted.length > 0) {
    const renderer = mounted.pop();
    try { await TestRenderer.act(async () => renderer.unmount()); } catch { /* already unmounted */ }
  }
  fixture.navigation.length = 0;
  fixture.entitlement = { status: 'free', isPlus: false, presentPaywall: async () => ({ kind: 'cancelled' }), restore: async () => ({ kind: 'no_purchases_found' }), refresh: async () => {} };
});

// ------------------------------------------------------------------------------------------------ 1. stale entitlement, provider level

let probe;
function Probe() {
  probe = { feature: usePremiumFeature('daily_load_premium', 'Daily Load'), ctx: usePremiumState() };
  return null;
}
const mountProbe = async (server) => {
  const r = track(await render(<PremiumStateProvider client={server.client} accountState={bound()}><Probe /></PremiumStateProvider>));
  await settle();
  return r;
};
const ask = async (key = 'k-0000001') => {
  await act(async () => { await probe.feature.authorize({ householdId: HOUSEHOLD, idempotencyKey: key }); });
  await settle();
};

describe('a server denial about her subscription refreshes a stale "Premium is on"', () => {
  test('entitled on screen, ended on the server: the denial makes the screen say so', async () => {
    const server = makeServer({ state: 'premium_active' });
    const r = await mountProbe(server);
    assert.equal(probe.feature.state.kind, 'entitled');
    assert.equal(probe.feature.usable, true);
    server.state = 'premium_expired'; // it ended while the app stayed open; no foreground event fired
    const readsBefore = server.calls.entitlement;
    await ask();
    assert.ok(server.calls.entitlement > readsBefore, 'the server state was re-read');
    assert.equal(probe.feature.state.kind, 'subscription_expired');
    assert.equal(probe.feature.usable, false);
    assert.equal(probe.feature.copy.action, 'upgrade');
    await act(() => r.unmount());
  });

  test('a refund (revoked) and a lapse to Free are told apart', async () => {
    for (const [next, kind, revoked] of [['premium_revoked', 'subscription_expired', true], ['free', 'upgrade_required', undefined]]) {
      const server = makeServer({ state: 'premium_active' });
      const r = await mountProbe(server);
      server.state = next;
      await ask();
      assert.equal(probe.feature.state.kind, kind, next);
      if (revoked !== undefined) assert.equal(probe.feature.state.revoked, revoked);
      await act(() => r.unmount());
    }
  });

  test('the refresh grants nothing: a denial never makes an unentitled account usable, and the server is asked again for every operation', async () => {
    const server = makeServer({ state: 'free' });
    const r = await mountProbe(server);
    await ask('k-0000002');
    assert.equal(probe.feature.usable, false);
    assert.equal(server.calls.authorize, 1);
    await act(() => r.unmount());
  });

  test('entitled and still entitled: a subscription denial causes ONE re-read and no loop; she can ask again', async () => {
    const server = makeServer({ state: 'premium_active', gate: () => denial('requires_premium', 'premium_active') });
    const r = await mountProbe(server);
    const before = server.calls.entitlement;
    await ask('k-0000003');
    assert.equal(server.calls.entitlement, before + 1, 'exactly one re-read');
    await settle();
    assert.equal(server.calls.entitlement, before + 1, 'no loop');
    assert.equal(probe.feature.usable, true, 'the server still says entitled, so the control is not taken away');
    await ask('k-0000004');
    assert.equal(server.calls.authorize, 2);
    await act(() => r.unmount());
  });

  test('a denial that is NOT about her subscription (limit, outage) does not re-read the entitlement', async () => {
    for (const reason of ['quota_exhausted', 'service_unavailable', 'rate_limited', 'feature_disabled']) {
      const server = makeServer({ state: 'premium_active', gate: () => denial(reason, 'premium_active', 'none') });
      const r = await mountProbe(server);
      const before = server.calls.entitlement;
      await ask('k-0000005');
      assert.equal(server.calls.entitlement, before, reason);
      await act(() => r.unmount());
    }
  });

  test('an allowed decision never re-reads either', async () => {
    const server = makeServer({ state: 'premium_active' });
    const r = await mountProbe(server);
    const before = server.calls.entitlement;
    await ask('k-0000006');
    assert.equal(server.calls.entitlement, before);
    await act(() => r.unmount());
  });

  test('Smart Inbox: a subscription denial of an extraction refreshes the same way', async () => {
    const server = makeServer({ state: 'premium_active' });
    const r = await mountProbe(server);
    assert.equal(probe.feature.state.kind, 'entitled');
    server.state = 'premium_expired';
    let result;
    await act(async () => { result = await probe.ctx.extract({ householdId: HOUSEHOLD, idempotencyKey: 'smart-inbox-x', text: 'Dentist Friday', context: { timeZone: 'America/New_York', today: '2026-09-16', children: [], people: [], areas: [] } }); });
    await settle();
    assert.equal(result.kind, 'denied');
    assert.equal(probe.feature.state.kind, 'subscription_expired');
    await act(() => r.unmount());
  });

  test('an unreachable server on the re-read keeps the display but authorizes nothing (offline is not a grant)', async () => {
    const server = makeServer({ state: 'premium_active' });
    const r = await mountProbe(server);
    server.state = 'premium_expired';
    server.unreachable = true;
    await ask('k-0000007');
    assert.equal(probe.ctx.snapshot.load, 'unavailable');
    assert.equal(server.calls.authorize, 1);
    await act(() => r.unmount());
  });
});

// ------------------------------------------------------------------------------------------------ 2. Momentum card visibility

describe('who sees the weekly-review card (pure)', () => {
  const none = 0;
  test('silent where there is nothing true to say', () => {
    assert.equal(showsMomentumCard({ kind: 'signed_out' }, none), false);
    assert.equal(showsMomentumCard({ kind: 'loading' }, none), false);
    assert.equal(showsMomentumCard({ kind: 'feature_unavailable', cause: 'disabled' }, none), false);
    assert.equal(showsMomentumCard({ kind: 'feature_unavailable', cause: 'service' }, none), false);
    assert.equal(showsMomentumCard({ kind: 'feature_unavailable', cause: 'ownership' }, none), false);
    assert.equal(showsMomentumCard({ kind: 'account_deactivated' }, none), false);
  });
  test('visible in every state she must be able to act on', () => {
    for (const state of [
      { kind: 'upgrade_required' },
      { kind: 'subscription_expired', revoked: false },
      { kind: 'subscription_expired', revoked: true },
      { kind: 'verification_pending', cause: 'checking', canRetry: false },
      { kind: 'verification_pending', cause: 'delayed', canRetry: true },
      { kind: 'verification_pending', cause: 'account_mismatch', canRetry: true },
      { kind: 'verification_pending', cause: 'outage', canRetry: true },
      { kind: 'usage_limit_reached', resetsOn: null, canUpgrade: false },
      { kind: 'feature_unavailable', cause: 'update_app' },
      { kind: 'feature_unavailable', cause: 'busy' },
      { kind: 'entitled', subscription: 'active', endsOn: null },
      { kind: 'free_allowance' },
    ]) assert.equal(showsMomentumCard(state, none), true, JSON.stringify(state));
  });
  test('her saved reviews keep the card, whatever the subscription says', () => {
    for (const state of [{ kind: 'feature_unavailable', cause: 'disabled' }, { kind: 'feature_unavailable', cause: 'service' }, { kind: 'account_deactivated' }]) {
      assert.equal(showsMomentumCard(state, 1), true, JSON.stringify(state));
    }
    assert.equal(showsMomentumCard({ kind: 'signed_out' }, 3), false, 'signed out never shows another account\'s anything');
    assert.equal(showsMomentumCard({ kind: 'loading' }, 3), false);
  });
});

const at = (day, hour = 10) => makeCtx({ today: `2026-09-${String(day).padStart(2, '0')}`, nowMs: nyMs(hour, 0, day) });
/** Today is Wednesday 2026-09-16: a week with enough recorded evidence that opening the review reaches the server's gate. */
const weekWithEvidence = () => wednesdayOverload((start) => {
  let s = start;
  for (const id of ['d1', 'd2', 'd3', 'd4', 'd5']) s = task(s, { id, title: `Done ${id}`, minutes: 10, plan: dayPlan('2026-09-10') });
  [11, 12, 13, 14, 15].forEach((day, i) => { s = completeTask(s, at(day), `d${i + 1}`); });
  s = task(s, { id: 'slip', title: 'Call the insurance company', minutes: 15, plan: dayPlan('2026-09-11') });
  s = updateTask(s, at(11), 'slip', { plan: dayPlan('2026-09-12') });
  return s;
});

async function momentumWorld(options) {
  const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(weekWithEvidence()) }, mode: 'empty' });
  const store = await launch(h);
  const ledger = new FakeLedger();
  const server = makeServer(options);
  return { store, ledger, server };
}
const mountMomentum = async (w, accountState = bound()) => {
  const r = track(await render(
    <AppStateProvider store={w.store}>
      <PremiumStateProvider client={w.server.client} accountState={accountState} ledger={w.ledger} appVersion="1.0.0">
        <PremiumMomentumSection />
      </PremiumStateProvider>
    </AppStateProvider>,
  ));
  await settle();
  return r;
};

describe('the weekly-review card, rendered', () => {
  test('subscription ended: she is told, her data is safe, and she can get it again or restore from where she is', async () => {
    const w = await momentumWorld({ state: 'premium_expired' });
    const r = await mountMomentum(w);
    const text = allText(r);
    assert.match(text, /Your Her Keys Premium has ended/);
    assert.match(text, /Everything you saved is still yours/);
    assert.ok(button(r, 'Get Her Keys Premium again'));
    assert.ok(!button(r, 'Open your weekly review'));
    await act(() => button(r, 'Restore in Your Account').props.onPress());
    await settle();
    assert.deepEqual(fixture.navigation, ['/sign-in'], 'restore routes to the one Restore control in Your Account; it restores nothing in place');
    assert.equal(w.server.calls.authorize, 0, 'looking at the card consumes nothing');
    await act(() => r.unmount());
  });

  test('refunded says so, and a purchase waiting on the server says "confirming", never "Premium is on"', async () => {
    const revoked = await mountMomentum(await momentumWorld({ state: 'premium_revoked' }));
    assert.match(allText(revoked), /purchase was refunded/);
    await act(() => revoked.unmount());

    fixture.entitlement = { ...fixture.entitlement, status: 'plus', isPlus: true };
    const waiting = await mountMomentum(await momentumWorld({ state: 'free' }));
    const text = allText(waiting);
    assert.match(text, /Confirming your purchase|isn’t confirmed yet/);
    assert.doesNotMatch(text, /Premium is on/);
    assert.ok(!button(waiting, 'Open your weekly review'));
    await act(() => waiting.unmount());
  });

  test('a Free account with the server unreachable sees nothing (no "unavailable" noise), and a switched-off tool shows nothing', async () => {
    const offline = await momentumWorld({ state: 'free' });
    offline.server.unreachable = true;
    const r1 = await mountMomentum(offline);
    assert.equal(r1.toJSON(), null);
    await act(() => r1.unmount());

    const off = await mountMomentum(await momentumWorld({ state: 'free', available: false }));
    assert.equal(off.toJSON(), null);
    await act(() => off.unmount());
  });

  test('stale "on", ended on the server: opening asks the server, and the card then shows the ended state instead of a button that does nothing', async () => {
    const w = await momentumWorld({ state: 'premium_active' });
    const r = await mountMomentum(w);
    assert.ok(button(r, 'Open your weekly review'));
    w.server.state = 'premium_expired';
    await act(() => button(r, 'Open your weekly review').props.onPress());
    await settle();
    assert.equal(w.server.calls.authorize, 1, 'the server, not the screen, decided');
    assert.match(allText(r), /Your Her Keys Premium has ended/);
    assert.ok(!button(r, 'Open your weekly review'));
    assert.ok(button(r, 'Get Her Keys Premium again'));
    await act(() => r.unmount());
  });

  test('entitled but at a limit: the card stays and says why, instead of vanishing', async () => {
    const w = await momentumWorld({
      state: 'premium_active',
      gate: () => ({ outcome: 'denied', reason: 'quota_exhausted', entitlementState: 'premium_active', via: null, nextAction: 'wait_for_reset', quota: null, decisionId: 'd', replay: false }),
    });
    const r = await mountMomentum(w);
    await act(() => button(r, 'Open your weekly review').props.onPress());
    await settle();
    assert.match(allText(r), /You’ve reached this period’s limit/);
    assert.match(allText(r), /Everything free in Her Keys still works/);
    await act(() => r.unmount());
  });

  test('account switch: a different account never inherits the previous account\'s ended state', async () => {
    const w = await momentumWorld({ state: 'premium_expired' });
    const r = await mountMomentum(w, bound(A));
    assert.match(allText(r), /has ended/);
    w.server.state = 'premium_active';
    const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await act(async () => {
      r.update(
        <AppStateProvider store={w.store}>
          <PremiumStateProvider client={w.server.client} accountState={bound(B)} ledger={w.ledger} appVersion="1.0.0">
            <PremiumMomentumSection />
          </PremiumStateProvider>
        </AppStateProvider>,
      );
    });
    await settle();
    assert.doesNotMatch(allText(r), /has ended/);
    assert.ok(button(r, 'Open your weekly review'));
    await act(() => r.unmount());
  });
});
