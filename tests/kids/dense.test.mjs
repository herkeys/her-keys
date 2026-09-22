/**
 * HK-FEATURE-05 — scenarios AE (dense household, 4-6 children, 100+ records), AQ (large household), AT (stable ordering) and the
 * single-flight guard (AN). Timing here is a coarse guard against pathological complexity only; the measured numbers, with their
 * methodology, come from scripts-dev/f05-perf.mjs.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { refKey } from '../../src/domain/foundation/typedRef.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { createSingleFlight } from '../../src/features/kids/singleFlight.ts';
import { buildChildDetail, buildKidsView } from '../../src/features/kids/projection.ts';
import { NOW } from './support.mjs';
import { denseHousehold, shuffled } from './dense.mjs';

const clock = { nowMs: NOW };
const view = (s) => buildKidsView(s, s.household.id, clock);
const detail = (s, id) => buildChildDetail(s, s.household.id, id, clock);
const everyItem = (d) => [...d.upcoming, ...Object.values(d.openWork).flat(), ...d.plans.map((p) => p.item)];

describe('AE. a dense household stays understandable and correct', () => {
  const s = denseHousehold();

  test('the fixture really is dense: 6 children, over a hundred child-linked records, every responsibility state', () => {
    assert.equal(validateAppState(s).ok, true);
    assert.equal(s.children.length, 6);
    const childLinked = [...s.tasks, ...s.events].filter((r) => r.subjectMemberId !== null && s.children.some((k) => k.id === r.subjectMemberId));
    assert.ok(childLinked.length >= 150, `${childLinked.length} child-linked records`);
    assert.ok(new Set(s.responsibilities.map((r) => r.state)).size >= 4);
    assert.ok(s.dependencies.length >= 20 && s.people.some((p) => p.status === 'archived'));
  });

  test('every open child-linked task lands in EXACTLY ONE bucket of exactly one child; nothing is duplicated or lost', () => {
    const seen = new Map();
    for (const card of view(s).children) {
      const d = detail(s, card.childId);
      for (const bucket of Object.values(d.openWork)) for (const item of bucket) {
        assert.equal(seen.has(item.ref.id), false, `${item.ref.id} in two buckets`);
        seen.set(item.ref.id, card.childId);
        assert.equal(item.childId, card.childId);
      }
    }
    const open = s.tasks.filter((t) => t.status === 'open' && s.children.some((k) => k.id === t.subjectMemberId));
    assert.equal(seen.size, open.length);
    for (const t of open) assert.equal(seen.get(t.id), t.subjectMemberId, 'each task under ITS child');
  });

  test('hub counts equal what the detail says, and the hub is a summary, not a wall', () => {
    const v = view(s);
    for (const card of v.children) {
      const d = detail(s, card.childId);
      assert.equal(card.needsYouCount, d.openWork.needsYou.length);
      assert.equal(card.planGapCount, d.plans.filter((p) => p.plan.label === 'NEEDS_A_PLAN').length);
      assert.equal(card.next?.ref.id ?? null, d.upcoming[0]?.ref.id ?? null);
      assert.ok(Object.keys(card).length <= 9, 'a card carries a handful of facts');
    }
  });

  test('AF. one canonical item shown in several sections is the same facts everywhere', () => {
    for (const card of view(s).children) {
      const byRef = new Map();
      for (const item of everyItem(detail(s, card.childId))) {
        const prior = byRef.get(refKey(item.ref));
        if (prior) assert.deepEqual(item, prior, refKey(item.ref));
        else byRef.set(refKey(item.ref), item);
      }
    }
  });

  test('archived holders read as unavailable and the removed prerequisites read as review, never done', () => {
    const facts = view(s).children.flatMap((card) => everyItem(detail(s, card.childId)));
    assert.ok(facts.some((i) => i.responsibility.coverage === 'holder_unavailable'));
    assert.ok(facts.some((i) => i.dependency?.readiness === 'needsReview'));
    assert.ok(facts.some((i) => i.dependency?.readiness === 'blocked'));
    assert.ok(facts.some((i) => i.dependency?.readiness === 'ready'), 'a completed prerequisite is satisfied');
    for (const i of facts) if (i.responsibility.coverage === 'covered') assert.equal(i.responsibility.holder?.available, true);
  });
});

describe('AT. the order never depends on how the arrays happen to be arranged', () => {
  test('shuffling every collection gives the identical projection', () => {
    const s = denseHousehold({ eventsPerChild: 6, tasksPerChild: 9 });
    const mixed = { ...s, children: shuffled(s.children, 3), tasks: shuffled(s.tasks, 5), events: shuffled(s.events, 9), responsibilities: shuffled(s.responsibilities, 11), dependencies: shuffled(s.dependencies, 13), people: shuffled(s.people, 17) };
    assert.deepEqual(view(mixed), view(s));
    for (const child of s.children) assert.deepEqual(detail(mixed, child.id), detail(s, child.id));
  });
});

describe('AQ. a large household, well above the sync queue ceiling (400) and two pull chunks (100)', () => {
  test('450 extra open child-linked tasks project correctly and within a coarse bound', () => {
    const s = denseHousehold({ eventsPerChild: 4, tasksPerChild: 6, extraTasks: 450 });
    const t0 = performance.now();
    const v = view(s);
    for (const card of v.children) detail(s, card.childId);
    const ms = performance.now() - t0;
    const bulk = s.tasks.filter((t) => t.title.startsWith('Bulk ')).length;
    assert.equal(bulk, 450);
    const shown = new Set(v.children.flatMap((card) => Object.values(detail(s, card.childId).openWork).flat().map((i) => i.ref.id)));
    assert.equal(s.tasks.filter((t) => t.title.startsWith('Bulk ')).every((t) => shown.has(t.id)), true, 'none of the 450 is missing');
    assert.ok(ms < 3000, `hub + six details took ${ms.toFixed(0)} ms (a coarse guard; the measured figures are in the ledger)`);
  });
});

describe('AN. one save at a time', () => {
  test('a second call while one is running is refused in the same tick, then a later call runs', async () => {
    const flight = createSingleFlight();
    let runs = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const first = flight.run(async () => { runs += 1; await gate; return 'a'; });
    assert.equal(flight.isBusy(), true);
    assert.equal(await flight.run(async () => { runs += 1; return 'b'; }), undefined);
    assert.equal(await flight.run(async () => { runs += 1; return 'c'; }), undefined);
    release();
    assert.equal(await first, 'a');
    assert.equal(flight.isBusy(), false);
    assert.equal(await flight.run(async () => { runs += 1; return 'd'; }), 'd');
    assert.equal(runs, 2);
  });

  test('a failed save frees the guard, so she can try again', async () => {
    const flight = createSingleFlight();
    await assert.rejects(flight.run(async () => { throw new Error('storage refused'); }));
    assert.equal(flight.isBusy(), false);
    assert.equal(await flight.run(async () => 'ok'), 'ok');
  });
});
