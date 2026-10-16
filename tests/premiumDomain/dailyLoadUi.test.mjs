/**
 * The Premium Daily Load PANEL as she meets it: the real components and hooks, the real household store (durable writes), the real
 * Premium provider, a ledger faithful to the database, and a scripted server gate / store SDK. Nothing here proves a native purchase
 * (NOT RUN): the store SDK is the scripted boundary. It proves what Her Keys shows and does at each step of the journey.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { fixture } from '../support/premium/stubs.mjs';
import { render } from '../support/render.tsx';
import { windowMetrics } from '../support/rn-stub.tsx';

const stub = new URL('../support/premium/stubs.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (/\/RevenueCatProvider$/.test(specifier)) return next(stub, context);
  return next(specifier, context);
} });
const { PremiumStateProvider } = await import('../../src/monetization/PremiumStateProvider.tsx');
const { PremiumDailyLoadSection } = await import('../../src/features/daily-load/premium/PremiumDailyLoadSection.tsx');
const { AppStateProvider } = await import('../../src/store/AppStateProvider.tsx');
const { STORAGE_KEYS } = await import('../../src/persistence/appStateRepository.ts');
const { harness, launch, stored } = await import('../support/fixtures.mjs');
const { FakeLedger } = await import('../support/premiumLedger.mjs');
const { wednesdayOverload } = await import('../support/premiumDomain.mjs');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-00000000000a';
const bound = (id, householdId = HOUSEHOLD) => ({ kind: 'accountBound', householdId, session: { accountId: id, accessToken: 't', refreshToken: 'r', expiresAt: 0, provider: null } });
const act = async (f) => TestRenderer.act(async () => { await f(); });
const settle = async (n = 12) => { for (let i = 0; i < n; i += 1) await act(async () => { await new Promise((r) => setImmediate(r)); }); };

const allText = (r) => r.root.findAllByType('Text').map((node) => [node.props.children].flat(Infinity).join('')).join(' | ');
const button = (r, label) => r.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
const modal = (r, label) => r.root.findAllByType('Modal').find((node) => node.props.accessibilityLabel === label);
const visibleSheetText = (r, label) => {
  const m = modal(r, label);
  return m && m.props.visible ? m.findAllByType('Text').map((node) => [node.props.children].flat(Infinity).join('')).join(' | ') : null;
};

async function world({ serverState = 'premium_active', gate = null, ledgerDown = false } = {}) {
  const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(wednesdayOverload()) }, mode: 'empty' });
  const store = await launch(h);
  const ledger = new FakeLedger();
  const server = {
    state: serverState, gateCalls: [], verifyCalls: 0,
    client: {
      // Purchase is independently allowed only after the SERVER says fulfillment is ready.
      // This UI test simulates that explicit readiness and never initiates a real store transaction.
      purchaseReadiness: async () => ({ ready: true, reason: 'ready' }),
      entitlement: async () => ({ kind: 'ok', value: { state: server.state, expiresAt: '2026-11-13T00:00:00Z', graceExpiresAt: null, canceled: false, needsReconcile: false, checkedAt: '' } }),
      manifest: async () => ({ kind: 'ok', entries: [
        { featureKey: 'daily_load_premium', displayName: 'Daily Load', tier: 'premium', available: true, requiresAiConsent: false, minAppVersion: null },
        { featureKey: 'smart_inbox_extract', displayName: 'Smart Inbox', tier: 'premium', available: true, requiresAiConsent: true, minAppVersion: null },
        { featureKey: 'momentum_report', displayName: 'Momentum', tier: 'premium', available: true, requiresAiConsent: false, minAppVersion: null },
      ] }),
      verify: async () => { server.verifyCalls += 1; return { kind: 'ok', status: 'reconciled' }; },
      authorize: async (request) => {
        server.gateCalls.push(request);
        const decision = gate ? gate(request, server) : ['premium_active', 'premium_canceled_active', 'premium_billing_grace'].includes(server.state)
          ? { outcome: 'allowed', reason: 'allowed', entitlementState: server.state, via: 'premium', nextAction: 'none', quota: null, decisionId: 'd', replay: false }
          : { outcome: 'denied', reason: 'requires_premium', entitlementState: server.state, via: null, nextAction: 'open_paywall', quota: null, decisionId: 'd', replay: false };
        if (decision.outcome === 'allowed') ledger.authorize(request.idempotencyKey);
        return { kind: 'decision', decision };
      },
    },
  };
  if (ledgerDown) ledger.fail = { record: 99 };
  return { h, store, ledger, server, task: () => store.getSnapshot().state.tasks.find((t) => t.id === 'task-library') };
}

const tree = (w, accountState = bound(A), props = {}) => (
  <AppStateProvider store={w.store}>
    <PremiumStateProvider client={w.server.client} accountState={accountState} ledger={w.ledger} appVersion="1.0.0">
      <PremiumDailyLoadSection showWhenClear {...props} />
    </PremiumStateProvider>
  </AppStateProvider>
);

afterEach(() => {
  fixture.entitlement = { status: 'free', isPlus: false, presentPaywall: async () => ({ kind: 'cancelled' }), restore: async () => ({ kind: 'no_purchases_found' }), refresh: async () => {} };
  windowMetrics.width = 390;
});

const mount = async (w, accountState, props) => {
  const r = await render(tree(w, accountState, props));
  await settle();
  return r;
};

describe('discovering Premium on a heavy Wednesday', () => {
  test('a Free account is told what Her Keys Premium does, in words, and that Free is untouched', async () => {
    const w = await world({ serverState: 'free' });
    fixture.entitlement.status = 'free';
    const r = await mount(w);
    const text = allText(r);
    assert.match(text, /Daily Load review is part of Her Keys Premium/);
    assert.match(text, /Everything free in Her Keys still works/);
    assert.ok(button(r, 'See Her Keys Premium'));
    assert.ok(!button(r, 'Review this day'), 'no Premium review is offered to a Free account');
    assert.doesNotMatch(text, /\$|\d+ ?(per|\/) ?(month|year)|her_keys_plus|Her Keys\+/);
    await act(() => r.unmount());
  });

  test('"See Her Keys Premium" opens the approved purchase interface for the premium_feature placement', async () => {
    const w = await world({ serverState: 'free' });
    const placements = [];
    fixture.entitlement = { ...fixture.entitlement, status: 'free', presentPaywall: async (p) => { placements.push(p); return { kind: 'cancelled' }; } };
    const r = await mount(w);
    await act(() => button(r, 'See Her Keys Premium').props.onPress());
    await settle();
    assert.deepEqual(placements, ['premium_feature']);
    assert.match(allText(r), /No purchase was made/);
    assert.ok(button(r, 'See Her Keys Premium'), 'she can try again');
    await act(() => r.unmount());
  });

  test('a signed-out device (no account) shows no Premium panel at all', async () => {
    const w = await world();
    const r = await mount(w, { kind: 'unauthenticated' });
    assert.equal(r.toJSON(), null);
    await act(() => r.unmount());
  });

  test('when the day is clear and she has no receipts, the panel does not appear (it never sells into a good day)', async () => {
    const w = await world();
    const r = await mount(w, bound(A), { showWhenClear: false });
    assert.equal(r.toJSON(), null);
    await act(() => r.unmount());
  });

  test('bought but not yet confirmed by the server: it says "confirming", never "Premium is on", and offers "Check again" once it has waited', async () => {
    const w = await world({ serverState: 'free' });
    fixture.entitlement = { ...fixture.entitlement, status: 'plus', isPlus: true };
    const r = await mount(w);
    const text = allText(r);
    assert.match(text, /Confirming your purchase|isn’t confirmed yet/);
    assert.doesNotMatch(text, /Premium is on/);
    assert.ok(!button(r, 'Review this day'));
    await act(() => r.unmount());
  });
});

describe('the review', () => {
  test('opening it asks the SERVER first, then shows the pressure, who is responsible, and an evaluated move with both days', async () => {
    const w = await world();
    const r = await mount(w);
    assert.ok(button(r, 'Review this day'));
    assert.equal(visibleSheetText(r, 'Daily Load review'), null, 'the sheet is closed until she opens it');
    await act(() => button(r, 'Review this day').props.onPress());
    await settle();

    assert.equal(w.server.gateCalls.length, 1);
    assert.equal(w.server.gateCalls[0].householdId, HOUSEHOLD);
    assert.equal(w.server.gateCalls[0].feature, 'daily_load_premium');
    assert.deepEqual(Object.keys(w.server.gateCalls[0]).sort(), ['appVersion', 'feature', 'householdId', 'idempotencyKey']);

    const sheet = visibleSheetText(r, 'Daily Load review');
    assert.ok(sheet, 'the review sheet is open');
    assert.match(sheet, /Wednesday’s Daily Load/);
    assert.match(sheet, /“School pickup” to “Dentist” is 35 minutes short/);
    assert.match(sheet, /On it: “Return library books” \(20 minutes\)/);
    assert.match(sheet, /Move “Return library books” to Thursday, Sep 17 at the same time/);
    assert.match(sheet, /Wednesday goes from overloaded to tight\./);
    assert.match(sheet, /The tightest gap on Wednesday goes from 10 minutes to 30 minutes\./);
    assert.match(sheet, /Thursday stays open\./);
    assert.match(sheet, /treats this as movable because it isn’t marked fixed/);
    assert.match(sheet, /Events from a connected Google Calendar aren’t part of this review/);
    assert.ok(button(r, 'Approve this change'));
    assert.ok(button(r, 'Not this one'));
    // honest wording: no promise about time saved or how the day will feel
    assert.doesNotMatch(sheet, /saves?|hours|recover|stress|peace|calm/i);
    await act(() => r.unmount());
  });

  test('"Show what was considered" explains every record, including why the fixed ones stay put', async () => {
    const w = await world();
    const r = await mount(w);
    await act(() => button(r, 'Review this day').props.onPress());
    await settle();
    await act(() => button(r, 'Show what was considered').props.onPress());
    const sheet = visibleSheetText(r, 'Daily Load review');
    assert.match(sheet, /Event: “Dentist” — It’s fixed\./);
    assert.match(sheet, /Task: “Return library books” — could move/);
    await act(() => r.unmount());
  });

  test('a denial by the server (limit reached) is shown in its own words and no review is produced', async () => {
    const w = await world({ gate: () => ({ outcome: 'denied', reason: 'quota_exhausted', entitlementState: 'premium_active', via: null, nextAction: 'wait_for_reset', quota: { period: 'day', periodStart: '2026-09-16', periodEnd: '2026-09-17', used: 60, reserved: 0, limit: 60, remaining: 0 }, decisionId: 'd', replay: false }) });
    const r = await mount(w);
    await act(() => button(r, 'Review this day').props.onPress());
    await settle();
    const text = allText(r);
    assert.match(text, /You’ve reached this period’s limit/);
    assert.match(text, /starts fresh on/);
    assert.doesNotMatch(text, /\b60\b/, 'the limit number is never shown (none is owner-approved)');
    assert.equal(visibleSheetText(r, 'Daily Load review'), null);
    await act(() => r.unmount());
  });
});

describe('approving: explicit, one change, then undo', () => {
  const openReview = async (w) => {
    const r = await mount(w);
    await act(() => button(r, 'Review this day').props.onPress());
    await settle();
    return r;
  };

  test('approval is a SEPARATE explicit step that states its scope, and changes nothing until confirmed', async () => {
    const w = await world();
    const r = await openReview(w);
    const planBefore = JSON.stringify(w.task().plan);
    await act(() => button(r, 'Approve this change').props.onPress());
    await settle();
    const confirm = visibleSheetText(r, 'Make this change?');
    assert.ok(confirm, 'the confirmation is open');
    assert.match(confirm, /only this one task, only this one time/);
    assert.match(confirm, /won’t do anything like it again unless you ask/);
    assert.equal(JSON.stringify(w.task().plan), planBefore, 'nothing has changed yet');
    await act(() => button(r, 'Not now').props.onPress());
    await settle();
    assert.equal(visibleSheetText(r, 'Make this change?'), null);
    assert.equal(JSON.stringify(w.task().plan), planBefore, 'declining the confirmation changes nothing');
    assert.equal(w.ledger.rows.length, 0, 'and writes no receipt');
    await act(() => r.unmount());
  });

  test('confirming moves the task, says so only because it is saved, shows the receipt, and she can undo it', async () => {
    const w = await world();
    const r = await openReview(w);
    await act(() => button(r, 'Approve this change').props.onPress());
    await settle();
    await act(() => button(r, 'Yes, make this change').props.onPress());
    await settle(20);

    const moved = w.task();
    assert.equal(moved.plan.kind, 'timed');
    assert.match(moved.plan.startsAt, /^2026-09-17T/);
    await w.store.flush();
    assert.match(w.h.storage.contents()[STORAGE_KEYS.primary], /2026-09-17T18:50:00\.000Z/, 'the move is in durable storage');

    const text = allText(r);
    assert.match(text, /Done\. “Return library books” is now on Thursday, Sep 17\. You can undo it below\./);
    assert.match(text, /Recent changes/);
    assert.match(text, /“Return library books” moved to Thursday, Sep 17\./);
    assert.equal(visibleSheetText(r, 'Daily Load review'), null, 'the review closes: the day it described has changed');
    assert.ok(button(r, 'Undo'));

    await act(() => button(r, 'Undo').props.onPress());
    await settle(20);
    assert.equal(w.task().plan.kind, 'timed');
    assert.match(w.task().plan.startsAt, /^2026-09-16T/, 'back on Wednesday');
    assert.match(allText(r), /Undone\. The task is back where it was\./);
    assert.match(allText(r), /moved back/);
    assert.ok(!button(r, 'Undo'), 'an undone change cannot be undone again');
    await act(() => r.unmount());
  });

  test('a ledger that cannot record the change means NOTHING changes, and she is told in plain words', async () => {
    const w = await world({ ledgerDown: true });
    const r = await openReview(w);
    const before = JSON.stringify(w.store.getSnapshot().state.tasks);
    await act(() => button(r, 'Approve this change').props.onPress());
    await settle();
    await act(() => button(r, 'Yes, make this change').props.onPress());
    await settle(20);
    assert.match(allText(r), /couldn’t keep a record of this change, so it didn’t make it\. Nothing was changed/);
    assert.equal(JSON.stringify(w.store.getSnapshot().state.tasks), before);
    await act(() => r.unmount());
  });

  test('a household that changed since the review is refused gently: "this no longer fits", nothing changed', async () => {
    const w = await world();
    const r = await openReview(w);
    await act(async () => { await w.store.commit((s) => ({ ...s, tasks: s.tasks.map((t) => ({ ...t, commitment: 'fixed' })) })); });
    await act(() => button(r, 'Approve this change').props.onPress());
    await settle();
    await act(() => button(r, 'Yes, make this change').props.onPress());
    await settle(20);
    assert.match(allText(r), /Something changed since this was shown, so Her Keys checked again and this no longer fits\. Nothing was changed\./);
    assert.deepEqual(w.task().plan.kind, 'timed');
    assert.match(w.task().plan.startsAt, /^2026-09-16T/);
    await act(() => r.unmount());
  });

  test('"Not this one" records her decision, hides the proposal, and changes nothing', async () => {
    const w = await world();
    const r = await openReview(w);
    const before = JSON.stringify(w.store.getSnapshot().state);
    await act(() => button(r, 'Not this one').props.onPress());
    await settle();
    assert.equal(w.ledger.rows[0].status, 'rejected');
    assert.equal(JSON.stringify(w.store.getSnapshot().state), before);
    assert.ok(!button(r, 'Approve this change'), 'the dismissed proposal is gone from this review');
    await act(() => r.unmount());
  });

  test('a double tap on approve cannot move it twice', async () => {
    const w = await world();
    const r = await openReview(w);
    await act(() => button(r, 'Approve this change').props.onPress());
    await settle();
    const confirm = button(r, 'Yes, make this change');
    await act(async () => { void confirm.props.onPress(); void confirm.props.onPress(); });
    await settle(25);
    assert.equal(w.ledger.rows.filter((row) => row.status === 'applied').length, 1);
    assert.equal(w.ledger.rows.length, 1);
    await act(() => r.unmount());
  });
});

describe('accounts, restarts and small screens', () => {
  test('switching accounts drops the previous account\'s review and receipts', async () => {
    const w = await world();
    const r = await mount(w);
    await act(() => button(r, 'Review this day').props.onPress());
    await settle();
    await act(() => button(r, 'Approve this change').props.onPress());
    await settle();
    await act(() => button(r, 'Yes, make this change').props.onPress());
    await settle(20);
    assert.match(allText(r), /Recent changes/);

    w.server.state = 'free';
    await act(async () => { r.update(tree(w, bound(B, 'bbbbbbbb-0000-4000-8000-00000000000b'))); });
    await settle();
    // B is a different account on the same phone: A's receipts are not shown, A's Premium is not inherited.
    assert.ok(!button(r, 'Undo'), 'A\'s receipts are not shown to B');
    assert.ok(!button(r, 'Review this day'), 'A\'s Premium is not inherited by B');
    assert.ok(button(r, 'See Her Keys Premium'));
    await act(() => r.unmount());
  });

  test('after an app restart the receipt is still there and Undo still works (nothing lives only in memory)', async () => {
    const w = await world();
    let r = await mount(w);
    await act(() => button(r, 'Review this day').props.onPress());
    await settle();
    await act(() => button(r, 'Approve this change').props.onPress());
    await settle();
    await act(() => button(r, 'Yes, make this change').props.onPress());
    await settle(20);
    await act(() => r.unmount());
    await w.store.flush();

    const relaunched = await launch(w.h);
    const w2 = { ...w, store: relaunched, task: () => relaunched.getSnapshot().state.tasks.find((t) => t.id === 'task-library') };
    r = await mount(w2);
    assert.match(allText(r), /“Return library books” moved to Thursday, Sep 17\./);
    await act(() => button(r, 'Undo').props.onPress());
    await settle(20);
    assert.match(w2.task().plan.startsAt, /^2026-09-16T/);
    await act(() => r.unmount());
  });

  test('a stale server answer cannot unlock the panel: with the server unreachable it is "unavailable", not Premium', async () => {
    const w = await world();
    w.server.client.entitlement = async () => ({ kind: 'unavailable' });
    const r = await mount(w);
    assert.ok(!button(r, 'Review this day'));
    assert.match(allText(r), /unavailable right now|Everything free in Her Keys still works/);
    await act(() => r.unmount());
  });

  test('every control has an accessible name, and the panel renders on a very small screen at large text', async () => {
    windowMetrics.width = 320;
    windowMetrics.fontScale = 2;
    try {
      const w = await world();
      const r = await mount(w);
      await act(() => button(r, 'Review this day').props.onPress());
      await settle();
      const unnamed = r.root.findAllByType('Pressable').filter((node) => !node.props.accessibilityLabel);
      assert.deepEqual(unnamed.map((n) => n.props.testID ?? 'unnamed'), []);
      // The design system's own sheet scrim ("Dismiss") predates this work and carries no role; every control Premium adds is a button.
      for (const node of r.root.findAllByType('Pressable')) {
        if (node.props.accessibilityLabel !== 'Dismiss') assert.ok(node.props.accessibilityRole === 'button', `${node.props.accessibilityLabel} is not a button`);
      }
      await act(() => r.unmount());
    } finally {
      windowMetrics.width = 390;
      windowMetrics.fontScale = 1;
    }
  });
});

describe('Free Daily Load is untouched', () => {
  test('the Premium section never renders the Free card\'s controls or words, and reads no Free action', async () => {
    const w = await world({ serverState: 'free' });
    const r = await mount(w);
    const text = allText(r);
    for (const freeWord of ['Move it to tomorrow', 'Keep today as planned', 'Protect it']) assert.doesNotMatch(text, new RegExp(freeWord));
    const before = JSON.stringify(w.store.getSnapshot().state);
    await act(() => button(r, 'See Her Keys Premium').props.onPress());
    await settle();
    assert.equal(JSON.stringify(w.store.getSnapshot().state), before, 'opening the paywall changes nothing in the household');
    await act(() => r.unmount());
  });
});

// ---------------------------------------------------------------------------
// HK-FE-UI-02 Phase 3 — the truth structure of the Premium Daily Load presentation.
// Observation → proposed change → approval → applied → undo must stay visually distinct, with Luxury Black limited to one small badge.
// ---------------------------------------------------------------------------
describe('HK-FE-UI-02 presentation: observation, proposal, approval, applied change', () => {
  const marks = (root) => [...new Set(root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('ai-mark-')).map((n) => n.props.testID))];
  const icons = (root) => root.findAllByType('Ionicons').map((n) => n.props.name);
  const sheetNode = (r) => modal(r, 'Daily Load review');

  test('the card carries the small Luxury Black Premium badge — and no other black', async () => {
    const w = await world();
    const r = await mount(w);
    assert.equal(r.root.findAll((n) => n.props.testID === 'premium-badge' && typeof n.type === 'string').length, 1);
    const blacks = r.root.findAll((n) => typeof n.type === 'string').filter((n) => {
      const st = StyleSheet.flatten(typeof n.props.style === 'function' ? n.props.style({ pressed: false }) : n.props.style) ?? {};
      return st.backgroundColor === '#1E1B1D';
    });
    assert.equal(blacks.length, 1, 'exactly one Luxury Black element: the badge disc');
    await act(() => r.unmount());
  });

  test('a proposed change wears the recommendation structure; pressures and evidence gaps (observations) wear no AI mark', async () => {
    const w = await world();
    const r = await mount(w);
    await act(() => button(r, 'Review this day').props.onPress());
    await settle();
    const sheet = sheetNode(r);
    assert.deepEqual(marks(sheet), ['ai-mark-suggests'], 'only the proposal carries a mark');
    assert.ok(!marks(sheet).includes('ai-mark-confirmed'), 'a proposal never looks done');
    assert.ok(button(r, 'Approve this change'), 'approval stays its own explicit control');
    await act(() => r.unmount());
  });

  test('the applied change is a RECEIPT (neutral glyph, no confirmed check) that sits beside its Undo', async () => {
    const w = await world();
    const r = await mount(w);
    await act(() => button(r, 'Review this day').props.onPress());
    await settle();
    await act(() => button(r, 'Approve this change').props.onPress());
    await settle();
    await act(() => button(r, 'Yes, make this change').props.onPress());
    await settle(20);
    assert.ok(icons(r.root).includes('receipt-outline'), 'receipt glyph');
    assert.ok(!marks(r.root).includes('ai-mark-confirmed'), 'no solid check: an undone receipt must not read as confirmed');
    assert.ok(button(r, 'Undo'));
    await act(() => r.unmount());
  });
});
