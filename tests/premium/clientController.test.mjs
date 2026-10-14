import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PremiumController, VERIFY_DELAYS_MS } from '../../src/monetization/premiumController.ts';

const ACCOUNT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCOUNT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const entitlement = (state, extra = {}) => ({ state, expiresAt: null, graceExpiresAt: null, canceled: false, needsReconcile: false, checkedAt: '2026-10-13T15:00:00Z', ...extra });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const settle = async (n = 8) => { for (let i = 0; i < n; i += 1) await tick(); };

/** A scheduler the test drives by hand: nothing fires until `advance`. */
function manualScheduler() {
  const timers = [];
  return {
    timers,
    scheduler: {
      setTimeout: (callback, ms) => { const handle = { callback, ms, cleared: false }; timers.push(handle); return handle; },
      clearTimeout: (handle) => { handle.cleared = true; },
    },
    async fireNext() {
      const next = timers.find((t) => !t.cleared && !t.fired);
      if (!next) return false;
      next.fired = true;
      next.callback();
      await settle();
      return true;
    },
  };
}

/** A scripted server. `states` is consumed per account on each entitlement() call; `verifyCalls` records every verify. */
function scriptedServer(script) {
  const calls = { entitlement: [], manifest: 0, verify: 0, authorize: 0 };
  let currentAccount = null;
  const server = {
    calls,
    bindTo: (id) => { currentAccount = id; },
    client: {
      entitlement: async () => {
        calls.entitlement.push(currentAccount);
        const owner = currentAccount;
        const step = script.entitlement(owner, calls.entitlement.length);
        if (step.delay) await step.delay;
        return step.result;
      },
      manifest: async () => { calls.manifest += 1; return { kind: 'ok', entries: [{ featureKey: 'daily_load_premium', displayName: 'Daily Load', tier: 'premium', available: true, requiresAiConsent: false, minAppVersion: null }] }; },
      verify: async () => { calls.verify += 1; return script.verify ? script.verify(calls.verify) : { kind: 'ok', status: 'reconciled' }; },
      authorize: async () => { calls.authorize += 1; return { kind: 'unavailable' }; },
    },
  };
  return server;
}

const ok = (state, extra) => ({ result: { kind: 'ok', value: entitlement(state, extra) } });
const unavailable = { result: { kind: 'unavailable' } };

describe('the Premium controller: account safety', () => {
  test('state exists only for the bound account and is DISCARDED the instant the account changes', async () => {
    const server = scriptedServer({ entitlement: (owner) => ok(owner === ACCOUNT_A ? 'premium_active' : 'free') });
    const controller = new PremiumController(server.client, manualScheduler().scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    assert.equal(controller.getSnapshot().server?.state, 'premium_active');

    server.bindTo(ACCOUNT_B);
    controller.setAccount(ACCOUNT_B);
    // Synchronously after the switch, A's Premium is already gone — B never sees it, not even for a frame.
    assert.equal(controller.getSnapshot().server, null);
    assert.equal(controller.getSnapshot().accountId, ACCOUNT_B);
    await settle();
    assert.equal(controller.getSnapshot().server?.state, 'free');
  });

  test('a LATE answer for the previous account can never be applied to the new one', async () => {
    let releaseA;
    const gateA = new Promise((resolve) => { releaseA = resolve; });
    const server = scriptedServer({ entitlement: (owner) => (owner === ACCOUNT_A ? { delay: gateA, ...ok('premium_active') } : ok('free')) });
    const controller = new PremiumController(server.client, manualScheduler().scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle(2);
    server.bindTo(ACCOUNT_B);
    controller.setAccount(ACCOUNT_B);
    await settle();
    releaseA();
    await settle();
    assert.equal(controller.getSnapshot().accountId, ACCOUNT_B);
    assert.equal(controller.getSnapshot().server?.state, 'free', 'A\'s Premium arrived after the switch and was dropped');
  });

  test('signing out clears everything and stops any verification in flight', async () => {
    const server = scriptedServer({ entitlement: () => ok('free'), verify: () => ({ kind: 'ok', status: 'reconciled' }) });
    const { scheduler, timers } = manualScheduler();
    const controller = new PremiumController(server.client, scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    void controller.startVerification();
    await settle();
    controller.setAccount(null);
    await settle();
    assert.deepEqual(controller.getSnapshot(), { accountId: null, load: 'idle', server: null, manifest: null, verification: 'idle', lastVerify: null });
    assert.ok(timers.every((t) => t.cleared || t.fired), 'no timer survives sign-out');
  });

  test('a verification started under A that outlives the switch cannot mark B entitled or touch B\'s state', async () => {
    const server = scriptedServer({ entitlement: (owner) => ok(owner === ACCOUNT_A ? 'premium_active' : 'free') });
    const manual = manualScheduler();
    const controller = new PremiumController(server.client, manual.scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    // A's server state is entitled, so verification would finish at once: start it with A NOT entitled instead
    const serverB = scriptedServer({ entitlement: () => ok('free') });
    const c2 = new PremiumController(serverB.client, manual.scheduler);
    serverB.bindTo(ACCOUNT_A);
    c2.setAccount(ACCOUNT_A);
    await settle();
    void c2.startVerification();
    await settle();
    serverB.bindTo(ACCOUNT_B);
    c2.setAccount(ACCOUNT_B);
    await settle();
    await manual.fireNext();
    await manual.fireNext();
    assert.equal(c2.getSnapshot().accountId, ACCOUNT_B);
    assert.equal(c2.getSnapshot().verification, 'idle', 'B has no verification the previous account\'s purchase could have started');
    assert.equal(serverB.calls.verify, 1, 'only the first (immediate) attempt ran, under A; nothing ran for B');
  });

  test('a repeated setAccount with the same id is a no-op (no refetch storm)', async () => {
    const server = scriptedServer({ entitlement: () => ok('free') });
    const controller = new PremiumController(server.client, manualScheduler().scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    assert.equal(server.calls.entitlement.length, 1);
  });
});

describe('the Premium controller: refresh', () => {
  test('refresh is single-flight', async () => {
    const server = scriptedServer({ entitlement: () => ok('free') });
    const controller = new PremiumController(server.client, manualScheduler().scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await Promise.all([controller.refresh(), controller.refresh(), controller.refresh()]);
    assert.equal(server.calls.entitlement.length, 1);
  });

  test('an unreachable server is reported as such; the last KNOWN state is kept for display but is never authority', async () => {
    let call = 0;
    const server = scriptedServer({ entitlement: () => (++call === 1 ? ok('premium_active') : unavailable) });
    const controller = new PremiumController(server.client, manualScheduler().scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    assert.equal(controller.getSnapshot().load, 'ready');
    await controller.refresh();
    assert.equal(controller.getSnapshot().load, 'unavailable');
    assert.equal(controller.getSnapshot().server?.state, 'premium_active');
  });

  test('the display manifest rides along and survives a transient failure', async () => {
    const server = scriptedServer({ entitlement: () => ok('free') });
    const controller = new PremiumController(server.client, manualScheduler().scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    assert.equal(controller.getSnapshot().manifest?.[0].featureKey, 'daily_load_premium');
  });
});

describe('the Premium controller: verification after a purchase', () => {
  test('verifies immediately and stops the moment the SERVER says entitled', async () => {
    let call = 0;
    const server = scriptedServer({ entitlement: () => (++call < 3 ? ok('free') : ok('premium_active')) });
    const manual = manualScheduler();
    const controller = new PremiumController(server.client, manual.scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    const done = controller.startVerification();
    await settle();
    assert.equal(controller.getSnapshot().verification, 'pending');
    assert.equal(server.calls.verify, 1, 'the first attempt is immediate');
    await manual.fireNext();
    await done;
    assert.equal(controller.getSnapshot().server?.state, 'premium_active');
    assert.equal(controller.getSnapshot().verification, 'idle');
    assert.equal(server.calls.verify, 2);
  });

  test('backs off on the documented schedule and then GIVES UP, recoverably (it never loops forever)', async () => {
    const server = scriptedServer({ entitlement: () => ok('free') });
    const manual = manualScheduler();
    const controller = new PremiumController(server.client, manual.scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    const done = controller.startVerification();
    await settle();
    while (await manual.fireNext());
    await done;
    assert.equal(server.calls.verify, VERIFY_DELAYS_MS.length);
    assert.deepEqual(manual.timers.map((t) => t.ms), VERIFY_DELAYS_MS.filter((d) => d > 0));
    assert.equal(controller.getSnapshot().verification, 'gave_up');
    // "Check again" restarts it.
    const again = controller.startVerification();
    await settle();
    assert.equal(controller.getSnapshot().verification, 'pending');
    while (await manual.fireNext());
    await again;
    assert.equal(server.calls.verify, VERIFY_DELAYS_MS.length * 2);
  });

  test('is single-flight: a second call while one runs joins it', async () => {
    const server = scriptedServer({ entitlement: () => ok('free') });
    const manual = manualScheduler();
    const controller = new PremiumController(server.client, manual.scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    const a = controller.startVerification();
    const b = controller.startVerification();
    assert.equal(a, b);
    await settle();
    while (await manual.fireNext());
    await a;
    assert.equal(server.calls.verify, VERIFY_DELAYS_MS.length);
  });

  test('records what the server said about each attempt, including that it could not be asked', async () => {
    const server = scriptedServer({ entitlement: () => ok('free'), verify: () => ({ kind: 'unavailable' }) });
    const manual = manualScheduler();
    const controller = new PremiumController(server.client, manual.scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    void controller.startVerification();
    await settle();
    assert.equal(controller.getSnapshot().lastVerify, 'unreachable');
  });

  test('a store hint (SDK says Premium) triggers ONE automatic verification per account session; it never repeats on its own', async () => {
    const server = scriptedServer({ entitlement: () => ok('free') });
    const manual = manualScheduler();
    const controller = new PremiumController(server.client, manual.scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    await settle();
    controller.noteStoreEntitled();
    await settle();
    while (await manual.fireNext());
    const after = server.calls.verify;
    assert.equal(after, VERIFY_DELAYS_MS.length);
    controller.noteStoreEntitled();
    controller.noteStoreEntitled();
    await settle();
    assert.equal(server.calls.verify, after, 'no automatic re-verification (no restore/sync storm)');
    // a different account session gets its own automatic attempt
    server.bindTo(ACCOUNT_B);
    controller.setAccount(ACCOUNT_B);
    await settle();
    controller.noteStoreEntitled();
    await settle();
    assert.ok(server.calls.verify > after);
  });

  test('the store hint is ignored when the server already says entitled, and before the first server answer', async () => {
    const server = scriptedServer({ entitlement: () => ok('premium_active') });
    const controller = new PremiumController(server.client, manualScheduler().scheduler);
    server.bindTo(ACCOUNT_A);
    controller.setAccount(ACCOUNT_A);
    controller.noteStoreEntitled(); // load is still 'loading'
    await settle();
    controller.noteStoreEntitled(); // now entitled
    await settle();
    assert.equal(server.calls.verify, 0);
  });

  test('the controller persists nothing: no storage module is imported', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../../src/monetization/premiumController.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /AsyncStorage|SecureStore|localStorage|expo-secure-store/);
  });
});
