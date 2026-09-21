/**
 * HK-FEATURE-06 / HM3 — PERFORMANCE METHODOLOGY (AI: a dense household stays understandable and fast).
 *
 * This is ALGORITHMIC evidence measured on desktop Node — it is NOT device rendering evidence. It records the environment, the
 * runtime, the mode, the fixture, cold/warm status, the sample count, the median and the p95, and prints them so the ledger can
 * quote them. Soft targets: projection < 100 ms median; bounded detail < 50 ms median. No cache is used to reach them.
 */
import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, test } from 'node:test';
import { buildHomeView, homeItemOf } from '../../src/features/home/model/buildHomeView.ts';
import { describeItem } from '../../src/features/home/copy.ts';
import { NOW, TODAY, TZ, denseHousehold } from '../support/homeFixtures.mjs';

const SAMPLES = 40;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)];
const time = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };
const round = (n) => Math.round(n * 100) / 100;

describe('AI — dense Home fixture (240 Home tasks, 30 visits, 12 Systems, 20 repeating, responsibilities, dependencies, 3000 unrelated tasks)', () => {
  const state = denseHousehold({ homeTasks: 240, otherTasks: 3000 });

  test('the fixture is what it says it is', () => {
    const homeRecords = state.tasks.filter((t) => t.categoryId === 'cat-home').length + state.events.filter((e) => e.categoryId === 'cat-home').length + state.systems.length;
    assert.ok(homeRecords >= 282, `Home-associated records: ${homeRecords}`);
    assert.ok(state.tasks.length >= 3240);
    assert.ok(state.recurrences.length >= 20 && state.responsibilities.length >= 10 && state.dependencies.length >= 20 && state.observations.length > 10);
    const knowledge = new Set(state.tasks.filter((t) => t.categoryId === 'cat-home').map((t) => t.durationSource));
    assert.deepEqual([...knowledge].sort(), [...new Set([null, 'default', 'user'])].sort(), 'unknown, default and explicit durations are all present');
  });

  test('projection median < 100 ms and detail median < 50 ms; methodology recorded', () => {
    // COLD: the very first call in this process (module code is already loaded, no JIT warm-up yet).
    const cold = time(() => buildHomeView(state, NOW));
    // WARM: repeated calls on the same state, after 5 discarded warm-up runs.
    for (let i = 0; i < 5; i += 1) buildHomeView(state, NOW);
    const warm = Array.from({ length: SAMPLES }, () => time(() => buildHomeView(state, NOW)));
    const view = buildHomeView(state, NOW);
    const detail = Array.from({ length: SAMPLES }, (_, i) => {
      const item = view.items[i % view.items.length];
      return time(() => { const found = homeItemOf(view, item.homeItemId); describeItem(found, { today: TODAY, timeZone: TZ }); });
    });

    const record = {
      environment: { node: process.version, platform: `${process.platform}/${process.arch}`, cpu: os.cpus()[0]?.model?.trim(), cores: os.cpus().length, totalMemGB: round(os.totalmem() / 2 ** 30) },
      mode: 'node --test (test mode, desktop JS runtime; NOT Hermes, NOT a device)',
      fixture: { homeRecords: view.coverage.recordsConsidered, itemsListed: view.items.length, totalTasks: state.tasks.length, observations: state.observations.length },
      cold_ms: round(cold),
      projection: { samples: SAMPLES, median_ms: round(median(warm)), p95_ms: round(p95(warm)) },
      detail: { samples: SAMPLES, median_ms: round(median(detail)), p95_ms: round(p95(detail)) },
    };
    console.log(`PERF ${JSON.stringify(record)}`);

    assert.ok(view.items.length >= 200, 'a dense household is actually being projected');
    assert.ok(median(warm) < 100, `projection median ${round(median(warm))} ms must be < 100 ms`);
    assert.ok(median(detail) < 50, `detail median ${round(median(detail))} ms must be < 50 ms`);
  });

  test('cost grows with Home records, not with everything else she owns: 6x the unrelated tasks does not 6x the projection', () => {
    const small = denseHousehold({ homeTasks: 240, otherTasks: 500 });
    const large = denseHousehold({ homeTasks: 240, otherTasks: 3000 });
    for (let i = 0; i < 3; i += 1) { buildHomeView(small, NOW); buildHomeView(large, NOW); }
    const a = median(Array.from({ length: 15 }, () => time(() => buildHomeView(small, NOW))));
    const b = median(Array.from({ length: 15 }, () => time(() => buildHomeView(large, NOW))));
    console.log(`PERF scaling ${JSON.stringify({ unrelated500_ms: round(a), unrelated3000_ms: round(b) })}`);
    assert.ok(b < a * 4 + 5, `projection over 3000 unrelated tasks (${round(b)} ms) stays close to 500 (${round(a)} ms)`);
  });

  test('every open Home task is reachable from a work section (progressive disclosure may collapse a list, never drop a task)', () => {
    const view = buildHomeView(state, NOW);
    const open = state.tasks.filter((t) => t.categoryId === 'cat-home' && t.status === 'open').map((t) => `task:${t.id}`);
    const listed = new Set(['attention', 'waiting', 'comingUp', 'unresolved'].flatMap((k) => view.sections.find((s) => s.key === k).itemIds));
    assert.deepEqual(open.filter((id) => !listed.has(id)), []);
  });
});
