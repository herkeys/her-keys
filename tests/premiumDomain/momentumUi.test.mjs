/**
 * The Momentum weekly review as she meets it: the real component and hook, the real household store, the real Premium provider, a ledger
 * faithful to the database, and a scripted server gate. Nothing here proves a native purchase (NOT RUN). Household records are built
 * through the domain's OWN writers (completeTask, updateTask), so every observation is the shape the product really writes.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
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
const { PremiumMomentumSection } = await import('../../src/features/momentum/premium/PremiumMomentumSection.tsx');
const { AppStateProvider } = await import('../../src/store/AppStateProvider.tsx');
const { STORAGE_KEYS } = await import('../../src/persistence/appStateRepository.ts');
const { completeTask } = await import('../../src/domain/tasks.ts');
const { updateTask } = await import('../../src/domain/tasks.ts');
const { harness, launch, stored, nyMs } = await import('../support/fixtures.mjs');
const { FakeLedger } = await import('../support/premiumLedger.mjs');
const { dayPlan, makeCtx, task, wednesdayOverload } = await import('../support/premiumDomain.mjs');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER_HOUSEHOLD = 'bbbbbbbb-0000-4000-8000-00000000000b';
const bound = (id, householdId = HOUSEHOLD) => ({ kind: 'accountBound', householdId, session: { accountId: id, accessToken: 't', refreshToken: 'r', expiresAt: 0, provider: null } });
const act = async (f) => TestRenderer.act(async () => { await f(); });
const settle = async (n = 12) => { for (let i = 0; i < n; i += 1) await act(async () => { await new Promise((r) => setImmediate(r)); }); };

const allText = (r) => r.root.findAllByType('Text').map((node) => [node.props.children].flat(Infinity).join('')).join(' | ');
const button = (r, label) => r.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
const modal = (r, label) => r.root.findAllByType('Modal').find((node) => node.props.accessibilityLabel === label);
const sheetText = (r) => {
  const m = modal(r, 'Weekly review');
  return m && m.props.visible ? m.findAllByType('Text').map((node) => [node.props.children].flat(Infinity).join('')).join(' | ') : null;
};

const at = (day, hour = 10) => makeCtx({ today: `2026-09-${String(day).padStart(2, '0')}`, nowMs: nyMs(hour, 0, day) });

/** Today is Wednesday 2026-09-16. The review covers Sep 10 to Sep 16. */
function weekWithEvidence() {
  return wednesdayOverload((start) => {
    let s = start;
    for (const id of ['d1', 'd2', 'd3', 'd4', 'd5']) s = task(s, { id, title: `Done ${id}`, minutes: 10, plan: dayPlan('2026-09-10') });
    s = task(s, { id: 'slip', title: 'Call the insurance company', minutes: 15, plan: dayPlan('2026-09-11') });
    [11, 12, 13, 14, 15].forEach((day, i) => { s = completeTask(s, at(day), `d${i + 1}`); });
    // She moves the same task later on three different days: a real, repeated postponement.
    s = updateTask(s, at(11), 'slip', { plan: dayPlan('2026-09-12') });
    s = updateTask(s, at(13), 'slip', { plan: dayPlan('2026-09-14') });
    s = updateTask(s, at(15), 'slip', { plan: dayPlan('2026-09-16') });
    return s;
  });
}

function thinWeek() {
  return wednesdayOverload((start) => {
    let s = task(start, { id: 'only', title: 'Only thing', minutes: 10, plan: dayPlan('2026-09-15') });
    s = completeTask(s, at(15), 'only');
    return s;
  });
}

async function world({ state = weekWithEvidence(), serverState = 'premium_active', gate = null, ledgerRows = [] } = {}) {
  const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(state) }, mode: 'empty' });
  const store = await launch(h);
  const ledger = new FakeLedger();
  ledger.rows.push(...ledgerRows);
  const server = {
    state: serverState, gateCalls: [],
    client: {
      entitlement: async () => ({ kind: 'ok', value: { state: server.state, expiresAt: '2026-11-13T00:00:00Z', graceExpiresAt: null, canceled: false, needsReconcile: false, checkedAt: '' } }),
      manifest: async () => ({ kind: 'ok', entries: [{ featureKey: 'momentum_report', displayName: 'Weekly review', tier: 'premium', available: true, requiresAiConsent: false, minAppVersion: null }] }),
      verify: async () => ({ kind: 'ok', status: 'reconciled' }),
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
  return { h, store, ledger, server };
}

const tree = (w, accountState = bound(A)) => (
  <AppStateProvider store={w.store}>
    <PremiumStateProvider client={w.server.client} accountState={accountState} ledger={w.ledger} appVersion="1.0.0">
      <PremiumMomentumSection />
    </PremiumStateProvider>
  </AppStateProvider>
);

afterEach(() => {
  fixture.entitlement = { status: 'free', isPlus: false, presentPaywall: async () => ({ kind: 'cancelled' }), restore: async () => ({ kind: 'no_purchases_found' }), refresh: async () => {} };
  windowMetrics.width = 390;
});

const mount = async (w, accountState) => {
  const r = await render(tree(w, accountState));
  await settle();
  return r;
};

const savedRow = (over = {}) => ({
  id: 'saved-1', householdId: HOUSEHOLD, featureKey: 'momentum_report', kind: 'momentum.weekly_review', status: 'applied', idempotencyKey: 'momentum-week-2026-09-09', proposalRef: { kind: 'period', id: 'x' }, proposalDigest: 'x',
  afterSnapshot: {
    v: 'momentum-v1', period: { start: '2026-09-03', end: '2026-09-09', days: 7 },
    counts: { tasksCompleted: 4, itemsCompleted: 0, oneMovesCompleted: 0, routinesDone: 0, routinesSkipped: 0, routinesMissed: 0, postponements: 0, postponedTasks: 0, finishedAfterPostponing: 0, suggestionsApplied: 0, suggestionsReverted: 0, suggestionsDeclined: 0, delegationsAccepted: 0, delegationsCompleted: 0, totalEvents: 5, activeDays: 3 },
    deltas: null, patterns: [], nextStep: null, evidence: { observations: 5, decisions: 0, truncated: false }, generatedAtMs: 1,
  },
  proposedAt: '2026-09-09T20:00:00.000Z', appliedAt: '2026-09-09T20:00:01.000Z', revertedAt: null, updatedAt: '2026-09-09T20:00:01.000Z', ...over,
});

describe('who sees the card', () => {
  test('a Free account with no saved review sees nothing — there is no standing upsell here', async () => {
    const w = await world({ serverState: 'free' });
    const r = await mount(w);
    assert.equal(r.toJSON(), null);
    await act(() => r.unmount());
  });

  test('a signed-out device sees nothing', async () => {
    const w = await world();
    const r = await mount(w, { kind: 'unauthenticated' });
    assert.equal(r.toJSON(), null);
    await act(() => r.unmount());
  });

  test('a Free account that HAS a saved review still reads it (what she has stays hers), and nothing is asked of the server', async () => {
    const w = await world({ serverState: 'free', ledgerRows: [savedRow()] });
    const r = await mount(w);
    assert.match(allText(r), /Earlier reviews/);
    assert.ok(button(r, 'Open Sep 3 to Sep 9'));
    assert.ok(!button(r, 'Open your weekly review'), 'a NEW review is not offered without Premium');
    await act(() => button(r, 'Open Sep 3 to Sep 9').props.onPress());
    const sheet = sheetText(r);
    assert.match(sheet, /Saved copy/);
    assert.match(sheet, /Sep 3 to Sep 9/);
    assert.match(sheet, /You finished 4 tasks\./);
    assert.equal(w.server.gateCalls.length, 0);
    await act(() => r.unmount());
  });
});

describe('the weekly review', () => {
  test('opening it asks the server for THIS household, then shows the real period, real counts, the pattern with its tier, and what it is based on', async () => {
    const w = await world();
    const r = await mount(w);
    assert.ok(button(r, 'Open your weekly review'));
    assert.equal(sheetText(r), null, 'closed until she opens it');
    await act(() => button(r, 'Open your weekly review').props.onPress());
    await settle();

    assert.equal(w.server.gateCalls.length, 1);
    assert.equal(w.server.gateCalls[0].feature, 'momentum_report');
    assert.equal(w.server.gateCalls[0].householdId, HOUSEHOLD);
    assert.deepEqual(Object.keys(w.server.gateCalls[0]).sort(), ['appVersion', 'feature', 'householdId', 'idempotencyKey']);

    const sheet = sheetText(r);
    assert.ok(sheet, 'the review is open');
    assert.match(sheet, /Sep 10 to Sep 16/, 'the ACTUAL period is shown');
    assert.match(sheet, /You finished 5 tasks\./);
    assert.match(sheet, /You moved 1 task to a later day, 3 times in all\./);
    assert.match(sheet, /likely/i);
    assert.match(sheet, /“Call the insurance company” has been moved to a later day 3 times, on different days\./);
    assert.match(sheet, /Seen 3 times on different days\./);
    assert.match(sheet, /No comparison|There’s no comparison with the week before/);
    assert.match(sheet, /A copy of this review is saved\./);
    assert.match(sheet, /Based on \d+ recorded things/);
    assert.match(sheet, /outside calendar/);
    await act(() => r.unmount());
  });

  test('no number is invented: no time saved, no score, no percentage, no praise, no streak', async () => {
    const w = await world();
    const r = await mount(w);
    await act(() => button(r, 'Open your weekly review').props.onPress());
    await settle();
    const sheet = sheetText(r);
    assert.doesNotMatch(sheet, /hours?|minutes? (saved|back)|saved you|recover|prevent|score|%|streak|great|amazing|well done|productiv|improv|\bbetter\b/i);
    await act(() => r.unmount());
  });

  test('the review is saved as a receipt that holds numbers and references only', async () => {
    const w = await world();
    const r = await mount(w);
    await act(() => button(r, 'Open your weekly review').props.onPress());
    await settle();
    const [row] = w.ledger.rows.filter((x) => x.kind === 'momentum.weekly_review');
    assert.equal(row.status, 'applied');
    const text = JSON.stringify(row);
    assert.ok(!text.includes('Call the insurance company'), 'no title is stored');
    assert.ok(!text.includes('Done d1'));
    await act(() => r.unmount());
  });

  test('approving the suggested next step records her choice and changes NOTHING in the household', async () => {
    const w = await world();
    const r = await mount(w);
    await act(() => button(r, 'Open your weekly review').props.onPress());
    await settle();
    assert.match(sheetText(r), /Look at “Call the insurance company”/);
    assert.match(sheetText(r), /records that you decided to look\. Nothing is moved, changed or finished for you\./);
    const before = JSON.stringify(w.store.getSnapshot().state);
    await act(() => button(r, 'I’ll look at it').props.onPress());
    await settle();
    assert.match(sheetText(r), /You chose to look at this\./);
    assert.ok(!button(r, 'I’ll look at it'));
    assert.equal(JSON.stringify(w.store.getSnapshot().state), before, 'the household is byte-for-byte unchanged');
    const [next] = w.ledger.rows.filter((x) => x.kind === 'momentum.next_step');
    assert.equal(next.status, 'approved');
    await act(() => r.unmount());
  });

  test('a thin week says so honestly, shows what exists, and costs nothing (no authorization)', async () => {
    const w = await world({ state: thinWeek() });
    const r = await mount(w);
    await act(() => button(r, 'Open your weekly review').props.onPress());
    await settle();
    const sheet = sheetText(r);
    assert.match(sheet, /Not enough recorded yet/);
    assert.match(sheet, /So far there is 1 thing recorded across 1 day\./);
    assert.match(sheet, /needs at least 5 things across at least 3 different days/);
    assert.doesNotMatch(sheet, /You finished/);
    assert.equal(w.server.gateCalls.length, 0);
    assert.equal(w.ledger.rows.length, 0);
    await act(() => r.unmount());
  });

  test('a server refusal shows no review and no sheet', async () => {
    const w = await world({ gate: () => ({ outcome: 'denied', reason: 'quota_exhausted', entitlementState: 'premium_active', via: null, nextAction: 'wait_for_reset', quota: null, decisionId: 'd', replay: false }) });
    const r = await mount(w);
    await act(() => button(r, 'Open your weekly review').props.onPress());
    await settle();
    assert.equal(sheetText(r), null);
    assert.equal(w.ledger.rows.length, 0);
    await act(() => r.unmount());
  });

  test('if her receipts cannot be read the review is not built, and it says why in plain words', async () => {
    const w = await world();
    w.ledger.fail = { list: 1 };
    const r = await mount(w);
    // The mount already asked for saved reviews; make the NEXT list (inside the flow) fail.
    w.ledger.fail = { list: 1 };
    await act(() => button(r, 'Open your weekly review').props.onPress());
    await settle();
    assert.match(sheetText(r), /couldn’t check which changes you’ve approved lately/);
    assert.equal(w.server.gateCalls.length, 0);
    await act(() => r.unmount());
  });
});

describe('account isolation', () => {
  test('switching to another account drops the open review and the saved list; the other household’s receipts never appear', async () => {
    const w = await world({ ledgerRows: [savedRow(), savedRow({ id: 'other', householdId: OTHER_HOUSEHOLD, idempotencyKey: 'k-other' })] });
    const r = await mount(w);
    assert.ok(button(r, 'Open Sep 3 to Sep 9'));
    await act(() => button(r, 'Open Sep 3 to Sep 9').props.onPress());
    assert.ok(sheetText(r));

    await act(() => r.update(tree(w, bound(B, OTHER_HOUSEHOLD))));
    await settle();
    assert.equal(sheetText(r), null, 'the open review is gone');
    assert.equal(w.ledger.rows.filter((x) => x.householdId === HOUSEHOLD).length, 1);
    await act(() => r.unmount());
  });
});
