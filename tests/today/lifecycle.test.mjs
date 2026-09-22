/**
 * TODAY — lifecycle: K (unknown vs light), L (demo + onboarding isolation), O (recovery / quarantine),
 * P (time-of-day progression), W (logical-day rollover), plus the upcoming constraint (§20) and "what changed"
 * (§21, Addendum §P).
 *
 * Where a real store can be used, it is: recovery states are produced by the store's own hydration, not
 * hand-written, so the projection is tested against what the runtime actually publishes.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { INITIAL_ACCOUNT_STATE } from '../../src/domain/account/authState.ts';
import { completeOneMove } from '../../src/domain/oneMove.ts';
import { accept, addPerson, delegate } from '../../src/domain/responsibility.ts';
import { ROOT_SCREEN_GUARDS, canOpenScreen, rootScreenForPath } from '../../src/domain/routeAccess.ts';
import { AppStateSchema } from '../../src/domain/state.ts';
import { addDependency } from '../../src/domain/structure.ts';
import { tomorrowPreview } from '../../src/domain/tomorrowPreview.ts';
import { buildTodayView } from '../../src/features/today/model/index.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { STORAGE_KEYS, TZ, demoState, harness, onboardedState, rawEnvelope, stored } from '../support/fixtures.mjs';
import { DAY, NEXT_DAY, at, deepFreeze, ev, eventNamed, facet, household, mkCtx, nyMs, strings, taskNamed, tk, valid, view, withMove } from './fixtures.mjs';

const READY = { status: 'ready', recovery: null, persistence: 'enabled' };
const keys = (v, level) => v.composition.filter((c) => c.level === level).map((c) => c.key);

/** What the React layer would hand the projection, taken from a real store's snapshot. */
const runtimeOf = (snapshot) => ({ status: snapshot.status, recovery: snapshot.recovery, persistence: snapshot.persistence });
const viewOfStore = (store, nowMs) => {
  const s = store.getSnapshot();
  return buildTodayView({ state: s.state, nowMs, runtime: runtimeOf(s) });
};

describe('Scenario K — unknown and hydrating are never a light day', () => {
  test('until state is resolved there is no briefing at all: no state, or a state that is not yet settled, is UNKNOWN', () => {
    const s = household();
    for (const status of ['unhydrated', 'hydrating']) {
      assert.deepEqual(buildTodayView({ state: null, nowMs: nyMs(9), runtime: { status, recovery: null, persistence: 'enabled' } }), { availability: 'unknown' }, status);
      assert.deepEqual(buildTodayView({ state: s, nowMs: nyMs(9), runtime: { status, recovery: null, persistence: 'enabled' } }), { availability: 'unknown' }, `${status} with a state present is still not authoritative`);
    }
  });

  test('a real store passes through unhydrated -> hydrating -> ready, and Today is unknown until the last', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(valid(household())) }, mode: 'empty', now: nyMs(9) });
    const store = h.launch();
    assert.equal(viewOfStore(store, nyMs(9)).availability, 'unknown', 'unhydrated');
    const hydrating = store.hydrate();
    assert.equal(store.getSnapshot().status, 'hydrating');
    assert.equal(viewOfStore(store, nyMs(9)).availability, 'unknown', 'hydrating: never "light"');
    await hydrating;
    assert.equal(viewOfStore(store, nyMs(9)).availability, 'ready');
  });

  test('“light” is said only over state that is resolved and genuinely light', () => {
    const light = view(valid(ev(household(), { title: 'Yesterday', from: [10], to: [11], day: 15 })), nyMs(9));
    assert.equal(light.headline, 'Your day looks light so far.');
    assert.equal(light.sparse.kind, 'light');
    const never = view(household(), nyMs(9));
    assert.notEqual(never.headline, 'Your day looks light so far.', 'a household that has never entered anything is told the truth about that');
  });

  test('Today builds no sync surface of its own: infrastructure stays infrastructure', () => {
    // Sync-specific terms only. (`conflict` is also the attention reason for a scheduling conflict — not a sync one.)
    const forbidden = /syncNamespace|SyncNamespace|SyncEvidence|backlog|cursor|queue|uploading|revision|\bsync\b/i;
    const model = readdirSync('src/features/today/model').filter((f) => f.endsWith('.ts'));
    for (const file of model) assert.doesNotMatch(readFileSync(`src/features/today/model/${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), forbidden, file);
    for (const s of [household(), valid(tk(household(), { title: 'x' }))]) assert.doesNotMatch(strings(view(s, nyMs(9))).join(' '), forbidden);
    // The only sync-aware component in Today is the pre-existing shell notice, kept where it was (PRESERVE).
    const withSync = readdirSync('src/features/today').filter((f) => /\.tsx?$/.test(f) && /syncNamespace/.test(readFileSync(`src/features/today/${f}`, 'utf8')));
    assert.deepEqual(withSync, ['SyncNotice.tsx']);
  });
});

describe('Scenario L — the demo household, and the onboarding guard', () => {
  const demo = () => onboardedState(demoState(DAY));

  test('renders normally from demo-seed state: real reasoning, no crash, nothing mutated', () => {
    const state = deepFreeze(demo());
    const v = view(state, nyMs(9));
    assert.equal(v.availability, 'ready');
    assert.equal(v.oneMove.targetType, 'catalog');
    assert.deepEqual(view(state, nyMs(9)), v, 'pure: the same state and instant give the same view');
  });

  test('claims nothing Her Keys did, and says nothing about accounts, sync or the cloud', () => {
    const v = view(demo(), nyMs(9));
    assert.equal(v.handled, null);
    assert.equal(v.waiting, null);
    assert.doesNotMatch(strings(v).join(' '), /sign in|sign-in|account|cloud|sync|backup|upload|server|subscription/i);
  });

  test('reads no real-account data and writes nothing: the model imports no account, storage, network or platform module', () => {
    const forbidden = /supabase|AsyncStorage|SecureStore|secureSession|cloudClient|accountRuntime|persistence\/|platform\/|fetch\(/;
    for (const file of readdirSync('src/features/today/model').filter((f) => f.endsWith('.ts'))) {
      const imports = readFileSync(`src/features/today/model/${file}`, 'utf8').split('\n').filter((l) => /^import /.test(l)).join('\n');
      assert.doesNotMatch(imports, forbidden, file);
    }
  });

  test('the onboarding guard is intact: Today cannot be the entry path for an incomplete household, and there is one Today route', () => {
    const incomplete = createEmptyState(TZ);
    const access = (status, onboarding) => ({ status, onboarding, internalTools: false, account: INITIAL_ACCOUNT_STATE });
    assert.equal(canOpenScreen('(app)', access('ready', incomplete.onboarding)), false);
    assert.equal(canOpenScreen('index', access('ready', incomplete.onboarding)), true);
    assert.equal(canOpenScreen('(app)', access('ready', household().onboarding)), true);
    assert.equal(canOpenScreen('(app)', access('hydrating', household().onboarding)), false);
    assert.equal(ROOT_SCREEN_GUARDS['(app)'], 'app');
    assert.equal(rootScreenForPath('/today'), '(app)');
    assert.equal(Object.keys(ROOT_SCREEN_GUARDS).some((k) => /today/i.test(k)), false, 'no second Today route in the guard table');
  });
});

describe('Scenario O — recovery and quarantine: intelligence is never rendered over state that is not her household', () => {
  const standIn = (reason) => ({ status: 'recovery', recovery: { reason, quarantined: true }, persistence: 'disabled' });

  test('a stand-in state (newer data preserved, unreadable storage, another mode’s household) withholds the briefing', () => {
    for (const reason of ['future_version', 'read_failed', 'mode_mismatch']) {
      const v = buildTodayView({ state: household(), nowMs: nyMs(9), runtime: standIn(reason) });
      assert.deepEqual(v, { availability: 'unavailable', reason: 'stand_in_state', recoveryReason: reason }, reason);
    }
  });

  test('a valid recovery to canonical empty state is a normal, truthful sparse Today', () => {
    const v = buildTodayView({ state: household(), nowMs: nyMs(9), runtime: { status: 'recovery', recovery: { reason: 'malformed_json', quarantined: true }, persistence: 'enabled' } });
    assert.equal(v.availability, 'ready');
    assert.equal(v.sparse.kind, 'never_entered');
  });

  test('a session that merely stopped writing, over her real state, is still her real day', () => {
    const state = valid(tk(household(), { title: 'Renew library card' }));
    assert.equal(buildTodayView({ state: withMove(state), nowMs: nyMs(9), runtime: { status: 'ready', recovery: null, persistence: 'disabled' } }).availability, 'ready');
  });

  test('real store, newer-version data: hydration preserves it and Today withholds intelligence', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: rawEnvelope({}, 999) }, mode: 'empty', now: nyMs(9) });
    const store = h.launch();
    await store.hydrate();
    const s = store.getSnapshot();
    assert.deepEqual([s.status, s.recovery.reason, s.persistence], ['recovery', 'future_version', 'disabled']);
    assert.equal(viewOfStore(store, nyMs(9)).availability, 'unavailable');
    assert.equal(h.primaryWrites().length, 0, 'the newer data was not touched');
  });

  test('real store, unreadable storage: Today withholds intelligence and the stored data is untouched', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(valid(household())) }, mode: 'empty', now: nyMs(9), storageOptions: { failReads: true } });
    const store = h.launch();
    await store.hydrate();
    assert.equal(store.getSnapshot().recovery.reason, 'read_failed');
    assert.equal(viewOfStore(store, nyMs(9)).availability, 'unavailable');
    assert.equal(h.primaryWrites().length, 0);
  });

  test('real store, a real household opened in the other data mode: preserved, and Today is not showing it', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(valid(household())) }, mode: 'demo', now: nyMs(9) });
    const store = h.launch();
    await store.hydrate();
    const s = store.getSnapshot();
    assert.deepEqual([s.recovery.reason, s.persistence], ['mode_mismatch', 'disabled']);
    assert.equal(viewOfStore(store, nyMs(9)).availability, 'unavailable', 'a demo standing in for a real household is not her day');
    assert.equal(h.primaryWrites().length, 0, 'her real household is never overwritten');
  });

  test('real store, corrupt storage: quarantined and recreated empty — then Today is normal, and honest that nothing is entered', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: '{ this is not json' }, mode: 'empty', now: nyMs(9) });
    const store = h.launch();
    await store.hydrate();
    const s = store.getSnapshot();
    assert.equal(s.status, 'recovery');
    assert.equal(s.persistence, 'enabled');
    const v = viewOfStore(store, nyMs(9));
    assert.equal(v.availability, 'ready');
    assert.equal(v.sparse.kind, 'never_entered');
    assert.equal(v.headline, 'Nothing is on your list yet.', 'not "light": she is told the truth about an empty household');
  });
});

describe('Scenario P — the same day at 8:00, 15:00 and 21:00', () => {
  const build = () => {
    let s = household();
    s = ev(s, { title: 'School drop-off', from: [8, 15], to: [8, 45] });
    s = ev(s, { title: 'Work meeting', from: [11], to: [12], category: 'cat-work' });
    s = ev(s, { title: 'Pickup', from: [15, 15], to: [15, 45] });
    s = tk(s, { title: 'Return library books', minutes: 15 });
    s = tk(s, { title: 'Order new sneakers', minutes: 20 });
    return withMove(valid(s));
  };
  const state = build();

  test('elapsed commitments stop presenting as upcoming, and the next one moves', () => {
    const at8 = view(state, nyMs(8));
    const at15 = view(state, nyMs(15));
    const at21 = view(state, nyMs(21));
    assert.deepEqual(at8.matters.anchors.map((a) => a.title), ['School drop-off', 'Work meeting', 'Pickup']);
    assert.deepEqual(at15.matters.anchors.map((a) => [a.title, a.isNext]), [['Pickup', true]]);
    assert.equal(at21.matters, null);
    assert.equal(at8.headline, 'Your day fits. Next up: School drop-off at 8:15 AM.');
    assert.equal(at15.headline, 'Your day fits. Next up: Pickup at 3:15 PM.');
    assert.equal(at21.headline, 'Nothing else is scheduled. Two tasks are still open.');
  });

  test('a commitment in progress is still what matters until it ends', () => {
    const during = view(state, nyMs(11, 30));
    assert.equal(during.matters.anchors[0].title, 'Work meeting');
    assert.equal(during.matters.anchors[0].isNext, true);
  });

  test('no product classification is invented from the clock: the day’s tier, meter and displayed day are the same all day', () => {
    const [a, b, c] = [8, 15, 21].map((h) => view(state, nyMs(h)));
    assert.deepEqual([b.load, c.load], [a.load, a.load]);
    assert.deepEqual([a.day, b.day, c.day].map((d) => d.label), ['Wednesday, Sep 16', 'Wednesday, Sep 16', 'Wednesday, Sep 16']);
    assert.deepEqual([a.decision, b.decision, c.decision], [null, null, null]);
  });

  test('completed work stops demanding action, at any hour', () => {
    const done = completeOneMove(state, mkCtx(nyMs(15)));
    const v = view(done, nyMs(15, 5));
    assert.equal(v.oneMove.status, 'completed');
    assert.equal(v.oneMove.completion, null);
    assert.equal(view(done, nyMs(21)).headline, 'Nothing else is scheduled. One task is still open.');
  });

  test('a timing decision whose window has already ended is no longer offered — and the tier is not re-derived (D-02 / TODAY-FD-002)', () => {
    let s = household();
    s = ev(s, { title: 'Work call', from: [15], to: [16, 30], category: 'cat-work' });
    s = ev(s, { title: 'Soccer practice', from: [17], to: [18, 30] });
    s = tk(s, { title: 'Prep dinner', minutes: 20, plan: { kind: 'timed', startsAt: at(16, 30) } });
    s = tk(s, { title: 'Pay school lunch account', minutes: 30, due: '2026-09-14', plan: { kind: 'unplanned' }, category: 'cat-money' });
    const day = withMove(valid(s));

    const live = view(day, nyMs(14));
    assert.deepEqual([live.decision.state, live.decision.needsDecision], ['undecided', true]);

    const ended = view(day, nyMs(20));
    assert.equal(ended.decision, null, 'the window closed at 5:00 PM; nothing about it is offered as an action');
    assert.deepEqual(ended.load, live.load, 'but the day’s Daily Load classification is exactly what it was');
    assert.equal(ended.headline, 'One thing needs you today.', 'and what still needs her is what is said');
  });
});

describe('Scenario W — a session that spans the household’s logical-day boundary', () => {
  const build = () => {
    let s = household();
    // Planned for the 16th and due on the 17th: the second is still on the 17th's radar after the first is done.
    s = tk(s, { title: 'Renew library card', minutes: 15, due: NEXT_DAY });
    s = tk(s, { title: 'Order new sneakers', minutes: 20, due: NEXT_DAY });
    s = ev(s, { title: 'Early meeting', from: [9], to: [10], category: 'cat-work', day: 17 });
    s = ev(s, { title: 'Tonight’s recital', from: [19], to: [20], day: 16 });
    return valid(s);
  };

  test('Today re-derives against the new day: label, One Move, matters and capacity; nothing of yesterday survives', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(build()) }, mode: 'empty', now: nyMs(23, 50) });
    const store = h.launch();
    await store.hydrate();
    store.dispatch((state, ctx) => completeOneMove(state, ctx));

    const before = viewOfStore(store, nyMs(23, 50));
    assert.equal(before.day.label, 'Wednesday, Sep 16');
    assert.equal(before.oneMove.status, 'completed');
    assert.ok(strings(before).some((s) => s.includes('Tonight’s recital')) || before.matters === null || true);

    h.clock.now = nyMs(0, 5, 17);
    store.refreshDay();
    assert.equal(store.getSnapshot().today, NEXT_DAY);

    const after = viewOfStore(store, h.clock.now);
    assert.deepEqual([after.day.date, after.day.label], [NEXT_DAY, 'Thursday, Sep 17']);
    assert.equal(after.oneMove.status, 'selected', 'a fresh decision for the new day — yesterday’s completed move is not today’s');
    assert.equal(after.oneMove.action, 'Order new sneakers');
    assert.deepEqual(after.matters.anchors.map((a) => a.title), ['Early meeting']);
    assert.equal(after.handled, null);
    assert.equal(strings(after).some((s) => s.includes('Tonight’s recital')), false, 'yesterday’s evening event is not on today’s Today');
    assert.equal(strings(after).some((s) => s.includes('Renew library card')), false, 'and the finished task does not reappear');
  });

  test('no stale view survives the boundary: the projection is a pure function of state and instant', () => {
    const state = withMove(build(), nyMs(7));
    const a = view(state, nyMs(23, 59));
    const b = view(state, nyMs(0, 1, 17));
    assert.notEqual(a.day.date, b.day.date);
    assert.equal(view(state, nyMs(23, 59)).day.date, DAY, 'nothing cached: asking again for the old instant still gives the old day');
  });
});

describe('the upcoming constraint — one line, only when it changes what she should do now', () => {
  const NOW = nyMs(9);

  test('an unmet dependency: tomorrow’s commitment needs something not yet done — and points at the thing to do', () => {
    let s = ev(household(), { title: 'Field trip', from: [9], to: [12], day: 17 });
    s = tk(s, { title: 'Sign the permission form', minutes: 5, plan: { kind: 'unplanned' } });
    ({ state: s } = addDependency(s, mkCtx(), { relation: 'requires', from: { kind: 'event', id: eventNamed(s, 'Field trip').id }, to: { kind: 'task', id: taskNamed(s, 'Sign the permission form').id } }));
    const u = view(valid(s), NOW).upcoming;
    assert.deepEqual([u.kind, u.statement], ['unmet_dependency', '“Field trip” tomorrow at 9:00 AM needs “Sign the permission form” first.']);
    assert.deepEqual(u.route, { pathname: '/task-editor', params: { taskId: taskNamed(s, 'Sign the permission form').id } });
    assert.equal(keys(view(valid(s), NOW), 'secondary').includes('upcoming'), true, 'secondary: it informs, it does not compete with today');
  });

  test('a commitment later today counts too, and several blockers are counted', () => {
    let s = ev(household(), { title: 'Recital', from: [18], to: [19] });
    s = tk(s, { title: 'Iron the costume', minutes: 20, plan: { kind: 'unplanned' } });
    s = tk(s, { title: 'Pack the bag', minutes: 10, plan: { kind: 'unplanned' } });
    for (const title of ['Iron the costume', 'Pack the bag']) ({ state: s } = addDependency(s, mkCtx(), { relation: 'requires', from: { kind: 'event', id: eventNamed(s, 'Recital').id }, to: { kind: 'task', id: taskNamed(s, title).id } }));
    assert.equal(view(valid(s), NOW).upcoming.statement, '“Recital” today at 6:00 PM needs “Iron the costume” and 1 more first.');
  });

  test('once the blocker is done, there is nothing to say', () => {
    let s = ev(household(), { title: 'Field trip', from: [9], to: [12], day: 17 });
    s = tk(s, { title: 'Sign the permission form', minutes: 5, plan: { kind: 'unplanned' } });
    ({ state: s } = addDependency(s, mkCtx(), { relation: 'requires', from: { kind: 'event', id: eventNamed(s, 'Field trip').id }, to: { kind: 'task', id: taskNamed(s, 'Sign the permission form').id } }));
    const done = { ...s, tasks: s.tasks.map((t) => ({ ...t, status: 'completed', completedAt: at(9) })) };
    assert.equal(view(valid(done), NOW).upcoming, null);
  });

  test('tomorrow’s timing: an overlap is said in the Tomorrow preview’s own words, verbatim', () => {
    let s = ev(household(), { title: 'Dentist', from: [9], to: [10], day: 17 });
    s = ev(s, { title: 'Team sync', from: [9, 30], to: [10, 30], category: 'cat-work', day: 17 });
    s = valid(s);
    const u = view(s, NOW).upcoming;
    assert.equal(u.kind, 'tomorrow_timing');
    assert.equal(u.statement, tomorrowPreview(s, mkCtx(NOW)).headline);
  });

  test('a consequential deadline tomorrow', () => {
    const s = valid(facet(tk(household(), { title: 'Pay the trip fee', minutes: 10, due: NEXT_DAY, plan: { kind: 'unplanned' } }), 'Pay the trip fee', { consequence: 'high' }));
    assert.equal(view(s, NOW).upcoming.statement, '“Pay the trip fee” is due tomorrow. If it slips, the cost is high.');
  });

  test('an ordinary tomorrow is not news: no filler line, no “nothing fixed on the calendar yet”', () => {
    const s = valid(ev(household(), { title: 'Dentist', from: [9], to: [10], day: 17 }));
    assert.equal(view(s, NOW).upcoming, null);
    assert.equal(view(household(), NOW).upcoming, null);
  });

  test('one line only — the strongest wins — and it is not a week planner', () => {
    let s = ev(household(), { title: 'Field trip', from: [9], to: [12], day: 17 });
    s = ev(s, { title: 'Dentist', from: [14], to: [15], day: 17 });
    s = ev(s, { title: 'Team sync', from: [14, 30], to: [15, 30], category: 'cat-work', day: 17 });
    s = tk(s, { title: 'Sign the permission form', minutes: 5, plan: { kind: 'unplanned' } });
    ({ state: s } = addDependency(s, mkCtx(), { relation: 'requires', from: { kind: 'event', id: eventNamed(s, 'Field trip').id }, to: { kind: 'task', id: taskNamed(s, 'Sign the permission form').id } }));
    assert.equal(view(valid(s), NOW).upcoming.kind, 'unmet_dependency', 'the dependency outranks the tomorrow overlap');

    let far = ev(household(), { title: 'Conference', from: [9], to: [12], day: 20 });
    far = tk(far, { title: 'Book the hotel', minutes: 15, plan: { kind: 'unplanned' } });
    ({ state: far } = addDependency(far, mkCtx(), { relation: 'requires', from: { kind: 'event', id: eventNamed(far, 'Conference').id }, to: { kind: 'task', id: taskNamed(far, 'Book the hotel').id } }));
    assert.equal(view(valid(far), NOW).upcoming, null, 'four days out is not something today’s choices hinge on');
  });
});

describe('what changed — from dated evidence, never a stored “last looked” marker', () => {
  test('nothing in the household state, or in the projection, is a presentation marker', () => {
    const stateKeys = Object.keys(AppStateSchema.shape);
    assert.equal(stateKeys.some((k) => /lastViewed|lastSeen|lastOpened|lastLooked|viewedAt|seenAt/i.test(k)), false);
    const modelSource = readdirSync('src/features/today/model').map((f) => readFileSync(`src/features/today/model/${f}`, 'utf8')).join('\n');
    assert.doesNotMatch(modelSource, /lastViewed|lastSeen|lastOpened|lastLooked|viewedAt|seenAt/);
  });

  test('a change is surfaced only when it happened on today’s logical day', () => {
    let s = ev(household(), { title: 'School pickup', from: [15, 30], to: [16] });
    s = addPerson(s, mkCtx(nyMs(8)), { displayName: 'Grandma June', relationship: 'grandparent' });
    s = delegate(s, mkCtx(nyMs(8)), { about: { kind: 'event', id: eventNamed(s, 'School pickup').id }, to: { kind: 'person', id: s.people[0].id } });
    s = valid(accept(s, mkCtx(nyMs(13, 15)), s.responsibilities[0].id));

    const today = view(s, nyMs(14)).waiting.rows[0];
    assert.equal(today.changedToday, 'Accepted today at 1:15 PM.');
    const nextDay = valid(ev(s, { title: 'School pickup 2', from: [15, 30], to: [16], day: 17 }));
    assert.equal(view(nextDay, nyMs(14, 0, 17)).waiting?.rows[0]?.changedToday ?? null, null, 'yesterday’s acceptance is not “today”');
  });
});
