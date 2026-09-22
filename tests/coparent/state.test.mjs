import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { materializeDemoState } from '../../src/data/seed/demoHousehold.ts';
import { INITIAL_ACCOUNT_STATE } from '../../src/domain/account/authState.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { availabilityOf } from '../../src/features/coparent/availability.ts';
import { createHandoff } from '../../src/features/coparent/mutations.ts';
import { hubTextManifest, presentHub, UPCOMING_COLLAPSED } from '../../src/features/coparent/present.ts';
import { buildCoParentLogisticsView } from '../../src/features/coparent/projection.ts';
import { DAY, HANDOFF, JOSIE, MILO, NOW, RUBY, TZ, answer, finishPrep, followUp, handoff, nyMs, prep, request, world } from '../fixtures/coparent/world.mjs';

const view = (w, ms = w.nowMs, householdId = w.state.household.id) => buildCoParentLogisticsView(w.state, householdId, { nowMs: ms });
const ctx = { today: DAY, zone: TZ };

describe('Empty, loading, recovery and isolation: never a reassuring silence', () => {
  test('A/AG: with nothing recorded the empty state says only that Her Keys has nothing represented — no all-clear', () => {
    const w = world();
    const hub = presentHub(view(w), ctx);
    assert.deepEqual(hub.empty, {
      title: 'Nothing coming up is recorded here',
      body: "Add a handoff, something to prepare, or a follow-up. This only shows what you've recorded in Her Keys.",
    });
    const all = hubTextManifest(hub).join('\n');
    assert.doesNotMatch(all, /all caught up|caught up|everything is|no (co-?parent )?issues|all clear|problem-free|nothing to worry|coordinated|you're set|smooth/i);
  });

  test('a household with a child but ONLY a past handoff is not "empty-and-fine": the view says nothing is upcoming, and no reassurance', () => {
    const w = world();
    handoff(w, { date: '2026-09-10' });
    const v = view(w);
    assert.equal(v.transitions.length, 0);
    assert.equal(v.isEmpty, true, 'nothing is upcoming; the copy still only speaks about what is recorded');
    assert.doesNotMatch(hubTextManifest(presentHub(v, ctx)).join('\n'), /caught up|all clear|fine|no problems/i);
  });

  test('AZ: LOADING is not EMPTY — until the household has loaded the screen must not be allowed to say anything', () => {
    const settled = { status: 'ready', state: {}, recovery: null };
    for (const status of ['unhydrated', 'hydrating']) {
      assert.deepEqual(availabilityOf({ status, state: null, recovery: null }, INITIAL_ACCOUNT_STATE), { kind: 'loading' });
    }
    assert.deepEqual(availabilityOf({ status: 'ready', state: null, recovery: null }, INITIAL_ACCOUNT_STATE), { kind: 'loading' }, 'no state yet is loading even if the status says ready');
    assert.deepEqual(availabilityOf(settled, INITIAL_ACCOUNT_STATE), { kind: 'ready' });
    assert.deepEqual(availabilityOf(settled, { kind: 'authenticating' }), { kind: 'loading' }, 'a provider flow in flight is not a settled account');
  });

  test('AZ: LOADING is decided by the STATUS, not only by whether a state object exists — an unhydrated/hydrating store is loading even with a state in hand', () => {
    // A store may already hold a (default or partial) state object while it is still hydrating. Rendering the projection of THAT would
    // present "nothing recorded" for a household that simply has not finished loading.
    for (const status of ['unhydrated', 'hydrating']) {
      assert.deepEqual(availabilityOf({ status, state: {}, recovery: null }, INITIAL_ACCOUNT_STATE), { kind: 'loading' }, status);
      assert.deepEqual(availabilityOf({ status, state: {}, recovery: { reason: 'invalid_json', quarantined: true } }, INITIAL_ACCOUNT_STATE), { kind: 'loading' }, `${status} + recovery`);
    }
    assert.deepEqual(availabilityOf({ status: 'ready', state: {}, recovery: null }, INITIAL_ACCOUNT_STATE), { kind: 'ready' });
  });

  test('BA: an unrecovered household (damaged, newer, unreadable, other mode) is NOT empty — it is its own state, whatever the fresh state contains', () => {
    for (const reason of ['invalid_json', 'future_version', 'read_failed', 'mode_mismatch']) {
      const a = availabilityOf({ status: 'recovery', state: {}, recovery: { reason, quarantined: reason === 'invalid_json' } }, INITIAL_ACCOUNT_STATE);
      assert.equal(a.kind, 'unrecovered', reason);
      assert.equal(a.reason, reason);
    }
  });

  test("a device holding ANOTHER account's household is never rendered", () => {
    const boundOther = { kind: 'boundOther', session: { accountId: 'a-2' }, quarantinedAccountId: 'a-1' };
    assert.deepEqual(availabilityOf({ status: 'ready', state: {}, recovery: null }, boundOther), { kind: 'other_account' });
  });

  test('AM: Account A → sign out → Account B — B\'s view holds none of A\'s child, title, place, person or amount', () => {
    const a = world({ children: [JOSIE] });
    const alexA = a.person('Alex Aardvark');
    handoff(a, { title: 'Pickup Josie', location: 'Aardvark Lane 12', counterpart: { kind: 'person', personId: alexA } });
    followUp(a, { title: 'Aardvark registration', amountText: '77.77' });

    const b = world({ children: [MILO] });
    handoff(b, { child: MILO, title: 'Drop off Milo', location: 'Badger Road 9' });
    const viewB = view(b);
    const json = JSON.stringify([viewB, presentHub(viewB, ctx)]);
    for (const leak of ['Josie', 'Aardvark', '77.77', 'Alex']) assert.ok(!json.includes(leak), `B must not contain "${leak}"`);
    assert.ok(json.includes('Milo'));
    assert.ok(!json.includes('Badger'), 'and B\'s own location is not on the hub either');
  });

  test('a view built for the WRONG household is refused and never reads as empty', () => {
    const w = world();
    handoff(w);
    const v = buildCoParentLogisticsView(w.state, 'household-of-someone-else', { nowMs: NOW });
    assert.equal(v.status, 'household_mismatch');
    assert.equal(v.isEmpty, false);
    assert.equal(v.transitions.length, 0);
    assert.equal(v.capability.canCreate, false);
  });

  test('AN: the demo household is its own world — a handoff made there is demo-seed provenance and never becomes a real row', () => {
    const demo = materializeDemoState({ anchorDate: DAY, timeZone: TZ });
    assert.equal(demo.origin, 'demo');
    assert.ok(demo.children.length > 0);
    const child = demo.children[0];
    const result = createHandoff(demo, { nowMs: NOW, today: DAY, createId: (p) => `${p}-t1` }, { ...HANDOFF, childId: child.id }, { kind: 'none' });
    assert.equal(result.outcome, 'saved');
    assert.equal(result.state.origin, 'demo');
    const made = result.state.events.find((e) => e.id === result.id);
    assert.equal(made.provenance.producer, 'demo-seed', 'a rehearsal never reaches the cloud (B4-P0-010)');
    assert.equal(validateAppState(result.state).ok, true);
    const v = buildCoParentLogisticsView(result.state, result.state.household.id, { nowMs: NOW });
    assert.ok(v.transitions.some((t) => t.id === result.id));
  });

  test('AV: using the feature writes only synced canonical kinds — no local-only evidence, lineage or artifacts', () => {
    const w = world();
    const before = w.state;
    const alex = w.person('Alex');
    const id = handoff(w, { repeat: 'weekly', counterpart: { kind: 'person', personId: alex } });
    prep(w, { linkEventId: id });
    followUp(w);
    answer; finishPrep; request;
    const changed = Object.keys(w.state).filter((key) => w.state[key] !== before[key]);
    const allowed = new Set(['events', 'tasks', 'people', 'responsibilities', 'dependencies', 'recurrences', 'observations']);
    assert.deepEqual(changed.filter((key) => !allowed.has(key)), []);
    assert.deepEqual([w.state.migrationEvidence, w.state.migrationLineage, w.state.sourceArtifacts, w.state.interpretations], [[], [], [], []]);
  });
});

describe('Density, order and single truth', () => {
  function dense() {
    const w = world({ children: [JOSIE, MILO, RUBY] });
    const alex = w.person('Alex', 'co-parent');
    const jordan = w.person('Jordan', 'caregiver');
    const june = w.person('Grandma June', 'grandparent');
    const people = [alex, jordan, june];
    const kids = [JOSIE, MILO, RUBY];
    for (let i = 0; i < 9; i += 1) {
      const id = handoff(w, {
        child: kids[i % 3],
        title: `Handoff ${i + 1}`,
        date: `2026-09-${String(17 + i).padStart(2, '0')}`,
        startTime: `${String(8 + (i % 9)).padStart(2, '0')}:00`,
        endTime: `${String(8 + (i % 9)).padStart(2, '0')}:30`,
        repeat: i % 3 === 0 ? 'weekly' : 'none',
        needsMe: i % 4 === 0 ? true : null,
        counterpart: i % 2 === 0 ? { kind: 'person', personId: people[i % 3] } : { kind: 'none' },
      });
      if (i % 2 === 0) prep(w, { child: kids[i % 3], title: `Pack for ${i + 1}`, linkEventId: id });
      if (i % 3 === 1) prep(w, { child: kids[i % 3], title: `Loose item ${i + 1}` });
    }
    for (let i = 0; i < 4; i += 1) followUp(w, { title: `Cost ${i + 1}`, amountText: `${10 + i}`, childId: kids[i % 3], followUpDate: `2026-10-0${i + 1}` });
    return w;
  }

  test('AH: a dense household (3 children, 3 adults, repeats, prep, money) — every handoff appears in exactly ONE place on the hub', () => {
    const w = dense();
    const v = view(w);
    assert.equal(v.transitions.length, 9);
    const hub = presentHub(v, ctx);
    const placed = [hub.next, ...hub.needsYou, ...hub.waiting, ...hub.needsReview, ...hub.upcoming].filter(Boolean).map((r) => r.id);
    assert.equal(new Set(placed).size, placed.length, 'no handoff is listed twice');
    const hidden = hub.upcomingHidden;
    assert.equal(placed.length + hidden, v.transitions.length, 'and none is lost: what is not shown is counted');
    assert.ok(hub.upcoming.length <= UPCOMING_COLLAPSED);
    assert.equal(hub.preparation.every((g) => g.heading.length > 0), true);
    assert.equal(hub.money.length, 4);
  });

  test('BC: the same handoff in different sections is ONE canonical truth — sections hold ids, and rows are built from one object', () => {
    const w = dense();
    const v = view(w);
    const ids = new Set(v.transitions.map((t) => t.id));
    for (const list of [v.needsMeIds, v.waitingIds, v.needsReviewIds]) for (const id of list) assert.ok(ids.has(id));
    const sections = [v.needsMeIds, v.waitingIds, v.needsReviewIds];
    const flat = sections.flat();
    assert.equal(new Set(flat).size, flat.length, 'a handoff belongs to at most one attention section');
    for (const t of v.transitions) {
      const inLists = sections.filter((l) => l.includes(t.id)).length;
      assert.equal(inLists, t.section === 'none' ? 0 : 1);
    }
  });

  test('AW: order is deterministic and independent of array order (reversing the stored arrays changes nothing)', () => {
    const w = dense();
    const forward = view(w);
    const s = w.state;
    const reversed = { ...s, events: [...s.events].reverse(), tasks: [...s.tasks].reverse(), people: [...s.people].reverse(), dependencies: [...s.dependencies].reverse(), children: [...s.children].reverse() };
    const backward = buildCoParentLogisticsView(reversed, reversed.household.id, { nowMs: w.nowMs });
    assert.deepEqual(backward, forward);
    assert.deepEqual(view(w), forward, 'and repeating the build gives the identical answer');
    assert.deepEqual(forward.transitions.map((t) => t.startsAtMs), [...forward.transitions.map((t) => t.startsAtMs)].sort((a, b) => a - b));
  });

  test('AI: 100+ logistics records — bounded, deterministic, and fast (median of 25 builds, Node algorithmic evidence)', () => {
    const w = world({ children: [JOSIE, MILO, RUBY] });
    const alex = w.person('Alex');
    const kids = [JOSIE, MILO, RUBY];
    for (let i = 0; i < 60; i += 1) {
      const id = handoff(w, { child: kids[i % 3], title: `Handoff ${i}`, date: `2026-${String(9 + Math.floor(i / 28)).padStart(2, '0')}-${String(18 + (i % 28) > 28 ? 1 + (i % 10) : 18 + (i % 10)).padStart(2, '0')}`, startTime: '17:00', endTime: '17:30', repeat: i % 5 === 0 ? 'weekly' : 'none', counterpart: i % 3 === 0 ? { kind: 'person', personId: alex } : { kind: 'none' } });
      prep(w, { child: kids[i % 3], title: `Prep A ${i}`, linkEventId: id });
      if (i % 2 === 0) prep(w, { child: kids[i % 3], title: `Prep B ${i}`, linkEventId: id });
    }
    for (let i = 0; i < 25; i += 1) followUp(w, { title: `Cost ${i}`, amountText: `${5 + i}`, childId: kids[i % 3] });
    const records = w.state.events.length + w.state.tasks.length;
    assert.ok(records >= 100, `fixture has ${records} records`);
    const samples = [];
    let last;
    for (let i = 0; i < 25; i += 1) {
      const t0 = performance.now();
      last = view(w, NOW);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    console.log(`  [perf] records=${records} median=${median.toFixed(2)}ms p95=${p95.toFixed(2)}ms node=${process.version} mode=test cold=${samples[0] === Math.min(...samples) ? 'n/a' : 'n/a'}`);
    assert.ok(median < 100, `median ${median.toFixed(1)}ms must be under the 100 ms soft target`);
    assert.deepEqual(view(w, NOW), last);
    const hub = presentHub(last, ctx);
    assert.ok(hub.upcoming.length <= UPCOMING_COLLAPSED, 'a big household is collapsed, not a wall of equal cards');
  });

  test('the projection holds no module-level mutable state that could carry one account\'s data to the next', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../../src/features/coparent/', import.meta.url);
    for (const name of readdirSync(dir).filter((n) => /\.(ts|tsx)$/.test(n))) {
      const text = readFileSync(new URL(name, dir), 'utf8');
      assert.doesNotMatch(text, /^(let|var) /m, `${name}: a module-level let/var could hold state across accounts`);
      assert.doesNotMatch(text, /^(const|export const) \w+ = new (Map|Set|WeakMap)\(/m, `${name}: a module-level cache could hold state across accounts`);
    }
  });

  test('AW: handoffs at the SAME moment are ordered by id, never by array position (reversing the stored arrays changes nothing)', () => {
    const w = world({ children: [JOSIE, MILO, RUBY] });
    const a = handoff(w, { child: JOSIE, title: 'Pickup A', date: '2026-09-18' });
    const b = handoff(w, { child: MILO, title: 'Pickup B', date: '2026-09-18' });
    const c = handoff(w, { child: RUBY, title: 'Pickup C', date: '2026-09-18' });
    const forward = view(w).transitions.map((t) => t.id);
    assert.deepEqual(forward, [a, b, c].sort(), 'ties are broken by id');
    const s = w.state;
    for (const events of [[...s.events].reverse(), [s.events[1], s.events[2], s.events[0]]]) {
      const shuffled = { ...s, events };
      assert.deepEqual(buildCoParentLogisticsView(shuffled, shuffled.household.id, { nowMs: w.nowMs }).transitions.map((t) => t.id), forward);
    }
  });

  test('preparing for handoffs on the same day for two children stays two records (identity, not merging)', () => {
    const w = world({ children: [JOSIE, MILO] });
    const a = handoff(w, { child: JOSIE, title: 'Pickup', date: '2026-09-18' });
    const b = handoff(w, { child: MILO, title: 'Pickup', date: '2026-09-18' });
    const v = view(w);
    assert.equal(v.transitions.length, 2);
    assert.deepEqual(v.transitions.map((t) => t.id).sort(), [a, b].sort());
    assert.ok(nyMs(0) > 0);
  });
});
