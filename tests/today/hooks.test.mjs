/**
 * TODAY — the hook that drives the screen: `useTodayView` under the real `AppStateProvider` and a real store.
 *
 * Scenario W's promise is about a running screen: "an app/session spanning the household logical-day boundary
 * re-derives Today against the new day; no stale view-model survives." The projection is pure (proved elsewhere);
 * this proves the screen actually ASKS it again — that the minute tick first lets the store pick up the new day
 * (and decide its One Move), then re-projects. Timers and the system clock are mocked; the store's clock is held in
 * step with them.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, mock, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { completeOneMove } from '../../src/domain/oneMove.ts';
import { render } from '../support/render.tsx';
import { STORAGE_KEYS, harness, stored } from '../support/fixtures.mjs';
import { DAY, NEXT_DAY, ev, household, nyMs, tk, valid } from './fixtures.mjs';

await import('./support/stub-appstate.mjs');
const { AppStateProvider } = await import('../../src/store/AppStateProvider.tsx');
const { useTodayView } = await import('../../src/features/today/useTodayView.ts');

const build = () => {
  let s = household();
  s = tk(s, { title: 'Renew library card', minutes: 15, due: NEXT_DAY });
  s = tk(s, { title: 'Order new sneakers', minutes: 20, due: NEXT_DAY });
  s = ev(s, { title: 'Early meeting', from: [9], to: [10], category: 'cat-work', day: 17 });
  return valid(s);
};

describe('useTodayView — a screen left open across the household’s midnight', () => {
  test('the minute tick asks the store for the new day, then re-projects: label, One Move, matters — nothing stale', async () => {
    const start = nyMs(23, 59, 16) + 30_000; // 23:59:30
    mock.timers.enable({ apis: ['setInterval', 'Date'], now: start });
    try {
      const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(build()) }, mode: 'empty', now: start });
      const store = h.launch();
      const seen = { view: null };
      const Probe = () => {
        seen.view = useTodayView();
        return null;
      };

      let renderer;
      await TestRenderer.act(async () => {
        renderer = TestRenderer.create(
          <AppStateProvider store={store}>
            <Probe />
          </AppStateProvider>
        );
        await store.hydrate();
      });

      assert.equal(seen.view.availability, 'ready');
      assert.deepEqual([seen.view.day.date, seen.view.day.label], [DAY, 'Wednesday, Sep 16']);
      assert.equal(seen.view.oneMove.action, 'Renew library card');

      await TestRenderer.act(async () => {
        store.dispatch((state, ctx) => completeOneMove(state, ctx));
      });
      assert.equal(seen.view.oneMove.status, 'completed', 'done today');

      // Time passes: the household's clock and the system clock cross midnight together.
      h.clock.now = start + 60_000;
      await TestRenderer.act(async () => {
        mock.timers.tick(60_000);
      });

      assert.deepEqual([seen.view.day.date, seen.view.day.label], [NEXT_DAY, 'Thursday, Sep 17'], 'the label and the day changed');
      assert.equal(store.getSnapshot().today, NEXT_DAY, 'the store picked up the new logical day first');
      assert.equal(seen.view.oneMove.status, 'selected', 'yesterday’s completed move is not today’s');
      assert.equal(seen.view.oneMove.action, 'Order new sneakers', 'a fresh decision for the new day');
      assert.deepEqual(seen.view.matters.anchors.map((a) => a.title), ['Early meeting'], 'today’s commitments, re-derived');
      assert.equal(JSON.stringify(seen.view).includes('Renew library card'), false, 'nothing from yesterday survives');

      await TestRenderer.act(async () => renderer.unmount());
    } finally {
      mock.timers.reset();
    }
  });

  test('a fixed instant holds the screen there (used by the gallery and tests): no timer is ever started', async () => {
    const at = nyMs(9);
    mock.timers.enable({ apis: ['setInterval', 'Date'], now: at });
    try {
      const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(build()) }, mode: 'empty', now: at });
      const store = h.launch();
      const seen = { view: null };
      const Probe = () => {
        seen.view = useTodayView(at);
        return null;
      };
      await TestRenderer.act(async () => {
        TestRenderer.create(
          <AppStateProvider store={store}>
            <Probe />
          </AppStateProvider>
        );
        await store.hydrate();
      });
      const before = seen.view;
      await TestRenderer.act(async () => {
        mock.timers.tick(10 * 60_000);
      });
      assert.equal(seen.view.day.date, before.day.date);
      assert.equal(seen.view.nowMinutes, before.nowMinutes, 'the injected instant is not advanced by ticks');
    } finally {
      mock.timers.reset();
    }
  });
});

void render;
