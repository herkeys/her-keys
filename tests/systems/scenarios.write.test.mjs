/**
 * Feature 04 scenarios that CHANGE canonical state, driven through the real app store so validation,
 * serialization and durability are the real ones: B · C · D · E · F(save) · W · X · Y · AI.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateAppState } from '../../src/domain/state.ts';
import { stepsInOrder } from '../../src/domain/structure.ts';
import { draftFromState, newDraft } from '../../src/features/systems/commands/draft.ts';
import { applySystemDraft } from '../../src/features/systems/commands/saveDraft.ts';
import { projectSystemDetail } from '../../src/features/systems/model/detail.ts';
import { evidenceOfDetail } from '../../src/features/systems/model/evidence.ts';
import { systemFingerprint } from '../../src/features/systems/model/fingerprint.ts';
import { previewOccurrences, scheduleViewFor } from '../../src/features/systems/model/schedule.ts';
import { saveSystemDraft } from '../../src/features/systems/useCases/commit.ts';
import { DAY, MORNING, assertEvidence, ctxAt, realHousehold, stepRow, systemRow, withRows } from './support/canon.mjs';
import { homeCategoryId, keyFor, stateOf, systemsHarness } from './support/store.mjs';

const CLOCK = { nowMs: MORNING, today: DAY };
const canonicalOf = (state, id) => JSON.parse(systemFingerprint(state, id));
const detail = (store, id) => projectSystemDetail(stateOf(store), id, CLOCK);
const steps = (titles, offset = 0) => titles.map((title, i) => ({ key: keyFor(i + offset), id: null, title, effortMinutes: null }));
const kidsId = (state) => state.categories.find((c) => c.systemRole === 'kids').id;

async function createSchoolNight(sh, id = 'sys-b') {
  const store = await sh.open();
  const { draft, base } = newDraft(stateOf(store), id, homeCategoryId(stateOf(store)));
  draft.name = 'School-night reset';
  draft.purpose = 'Everything ready before bed.';
  draft.steps = steps(['Pack uniform', 'Fill water bottle', 'Put bag by door']);
  const result = await saveSystemDraft(store, draft, base);
  return { store, draft, base, result };
}

describe('SCENARIO B — create a simple System', () => {
  test('one canonical System, three typed steps in order, no schedule required, and it survives a remount', async () => {
    const sh = systemsHarness();
    const { store, result } = await createSchoolNight(sh);
    assert.deepEqual(result, { kind: 'saved', systemId: 'sys-b' });

    const state = stateOf(store);
    assert.equal(state.systems.length, 1);
    const [system] = state.systems;
    assert.equal(system.name, 'School-night reset');
    assert.equal(system.scope, 'household', 'never child-scoped: a System cannot carry a child subject');
    assert.equal(system.provenance.producer, 'user-action', 'a real household: stated by her');
    assert.deepEqual([system.automationMode, system.effortMinutes, system.energyDemand], ['manual', null, null], 'facets are honestly unknown, never defaulted to a plausible value');
    assert.deepEqual(stepsInOrder(state, 'sys-b').map((s) => [s.title, s.position, s.effortMinutes]), [['Pack uniform', 0, null], ['Fill water bottle', 10, null], ['Put bag by door', 20, null]]);
    assert.equal(state.recurrences.length, 0, 'no schedule was required, so none was invented');
    assert.equal(state.dependencies.length, 0, 'order is not dependency');
    assert.equal(validateAppState(state).ok, true);

    await store.flush();
    const remounted = stateOf(await sh.open());
    assert.deepEqual(remounted.systems, state.systems);
    assert.deepEqual(remounted.systemSteps, state.systemSteps);
    assertEvidence('B-create-simple', { scenario: 'B', canonical: canonicalOf(state, 'sys-b'), view: evidenceOfDetail(projectSystemDetail(state, 'sys-b', CLOCK)) });
  });

  test('the minimum is a name and an area; blank or oversized input is refused before anything is written', async () => {
    const sh = systemsHarness();
    const store = await sh.open();
    const { draft, base } = newDraft(stateOf(store), 'sys-min', homeCategoryId(stateOf(store)));
    assert.equal((await saveSystemDraft(store, draft, base)).kind, 'invalid', 'blank name');
    draft.name = 'Grocery reset';
    assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'saved', systemId: 'sys-min' }, 'name + area is enough');
    assert.equal(stateOf(store).systemSteps.length, 0);
  });
});

describe('SCENARIO C — edit a System', () => {
  test('changes the definition once, re-derives the view, keeps scope/facets/provenance/steps, and duplicates nothing', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-c');
    const before = stateOf(store);
    sh.h.clock.now += 60_000;

    const { draft, base } = draftFromState(before, 'sys-c', keyFor);
    draft.name = 'School-night reset (weekdays)';
    draft.purpose = 'Bag, bottle, uniform.';
    draft.categoryId = kidsId(before);
    assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'saved', systemId: 'sys-c' });

    const after = stateOf(store);
    assert.equal(after.systems.length, 1, 'no duplicate System');
    assert.deepEqual(after.systems[0], { ...before.systems[0], name: 'School-night reset (weekdays)', description: 'Bag, bottle, uniform.', categoryId: kidsId(before) });
    assert.deepEqual(after.systemSteps, before.systemSteps, 'untouched steps keep their identity and their timestamps');
    const view = detail(store, 'sys-c');
    assert.equal(view.name, 'School-night reset (weekdays)');
    assert.equal(view.area.name, 'Kids');
    assertEvidence('C-edit-system', { scenario: 'C', canonical: canonicalOf(after, 'sys-c'), view: evidenceOfDetail(view) });
  });

  test('an edit that changes nothing writes nothing', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-c');
    const before = stateOf(store);
    const { draft, base } = draftFromState(before, 'sys-c', keyFor);
    assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'saved', systemId: 'sys-c' });
    assert.equal(stateOf(store), before, 'the very same state object: no row was touched');
  });
});

describe('SCENARIO D — add / edit / remove a step', () => {
  test('add and edit are real typed mutations; unrelated steps are preserved exactly', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-d');
    const before = stateOf(store);
    sh.h.clock.now += 60_000;

    const { draft, base } = draftFromState(before, 'sys-d', keyFor);
    draft.steps[1] = { ...draft.steps[1], title: 'Fill and check water bottle', effortMinutes: 5 };
    draft.steps.push({ key: 'n1', id: null, title: 'Lay out shoes', effortMinutes: 3 });
    assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'saved', systemId: 'sys-d' });

    const after = stateOf(store);
    const rows = stepsInOrder(after, 'sys-d');
    assert.deepEqual(rows.map((s) => s.title), ['Pack uniform', 'Fill and check water bottle', 'Put bag by door', 'Lay out shoes']);
    assert.deepEqual(rows.map((s) => s.effortMinutes), [null, 5, null, 3]);
    assert.deepEqual(rows[0], before.systemSteps[0], 'step 1 untouched');
    assert.deepEqual(rows[2], before.systemSteps[2], 'step 3 untouched');
    assert.notEqual(rows[1].updatedAt, before.systemSteps[1].updatedAt, 'the edited step records that it changed');
    assert.equal(rows[3].id, 'sys-d.n1', 'a new step\'s id is derived from its draft key, which is what makes a retry idempotent');
    assert.equal(after.systemSteps.length, 4);
    assertEvidence('D-steps', { scenario: 'D', canonical: canonicalOf(after, 'sys-d'), view: evidenceOfDetail(detail(store, 'sys-d')) });
  });

  test('REMOVE STEP is SAFE-UNAVAILABLE: no action, and a draft that drops an existing step is refused whole', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-d');
    const before = stateOf(store);
    assert.deepEqual(detail(store, 'sys-d').actions.find((a) => a.action === 'remove_step'), { action: 'remove_step', available: false, reason: 'no_retire_semantics' });

    const { draft, base } = draftFromState(before, 'sys-d', keyFor);
    draft.steps.splice(1, 1);
    const result = await saveSystemDraft(store, draft, base);
    assert.equal(result.kind, 'invalid');
    assert.ok(result.issues.some((i) => i.code === 'step_removal_unsupported'));
    assert.equal(stateOf(store), before, 'nothing was written');
  });
});

describe('SCENARIO E — reorder steps', () => {
  test('the new order persists; no completion state and no dependency appears; few rows move', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-e');
    const before = stateOf(store);

    const { draft, base } = draftFromState(before, 'sys-e', keyFor);
    draft.steps.reverse();
    assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'saved', systemId: 'sys-e' });

    const after = stateOf(store);
    assert.deepEqual(stepsInOrder(after, 'sys-e').map((s) => s.title), ['Put bag by door', 'Fill water bottle', 'Pack uniform']);
    const positions = stepsInOrder(after, 'sys-e').map((s) => s.position);
    assert.equal(new Set(positions).size, 3, 'unique positions');
    const heldBefore = new Set(before.systemSteps.map((s) => s.position));
    const moved = after.systemSteps.filter((row, i) => row.position !== before.systemSteps[i].position);
    assert.ok(moved.length <= 2, `at most two rows move to reverse three (moved ${moved.length})`);
    assert.ok(moved.every((row) => !heldBefore.has(row.position)), 'every moved row lands on a slot nobody held, so no push order can collide');
    assert.equal(after.dependencies.length, 0, 'order created no dependency');
    assert.equal(after.observations.length, before.observations.length, 'reordering the DEFINITION writes no history and no completion');
    assert.deepEqual(after.systemSteps.map((s) => s.id).sort(), before.systemSteps.map((s) => s.id).sort(), 'the same steps: identity never changes on a reorder');

    await store.flush();
    assert.deepEqual(stepsInOrder(stateOf(await sh.open()), 'sys-e').map((s) => s.title), ['Put bag by door', 'Fill water bottle', 'Pack uniform'], 'and it survives a remount');
    assertEvidence('E-reorder', { scenario: 'E', canonical: canonicalOf(after, 'sys-e'), view: evidenceOfDetail(detail(store, 'sys-e')) });
  });
});

describe('SCENARIO F (save) — the recurrence saves canonically and the preview told the truth', () => {
  test('a weekly schedule: one canonical rule, the previewed dates are the derived dates, nothing is materialized', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-f');
    const before = stateOf(store);

    const { draft, base } = draftFromState(before, 'sys-f', keyFor);
    draft.scheduleMode = 'calendar';
    draft.schedule = { frequency: 'weekly', interval: 1, byWeekday: [0], byMonthDay: null, timeOfDayMinutes: 1140 };
    const preview = previewOccurrences(before, { trigger: 'schedule', frequency: 'weekly', interval: 1, byWeekday: [0], byMonthDay: null, anchorDate: DAY, endsOn: null, occurrenceCount: null }, 'sys-f', DAY);
    assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'saved', systemId: 'sys-f' });

    const after = stateOf(store);
    assert.equal(after.recurrences.length, 1);
    const [rule] = after.recurrences;
    assert.deepEqual([rule.about, rule.trigger, rule.frequency, rule.byWeekday, rule.timeOfDayMinutes, rule.anchorDate, rule.status], [{ kind: 'system', id: 'sys-f' }, 'schedule', 'weekly', [0], 1140, DAY, 'active']);
    assert.equal(rule.timezone, after.user.timezone, 'the household zone, never the device');
    assert.equal(scheduleViewFor(after, 'sys-f', DAY).nextExpected, preview[0], 'the preview and the saved rule agree');
    assert.equal(after.observations.length, before.observations.length, 'no occurrence, run or history row was fabricated');
    assertEvidence('F-recurrence-saved', { scenario: 'F (save)', preview, canonical: canonicalOf(after, 'sys-f'), view: evidenceOfDetail(detail(store, 'sys-f')) });
  });

  test('changing the schedule edits the SAME rule in place: no second rule, and a recorded skip is still honored', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-f');
    let s0 = stateOf(store);
    let { draft, base } = draftFromState(s0, 'sys-f', keyFor);
    draft.scheduleMode = 'calendar';
    draft.schedule = { frequency: 'weekly', interval: 1, byWeekday: [0], byMonthDay: null, timeOfDayMinutes: null };
    await saveSystemDraft(store, draft, base);
    const ruleId = stateOf(store).recurrences[0].id;
    // she skipped this Sunday earlier — history, not an edit to the rule
    await store.commit((state, ctx) => ({ ...state, observations: [...state.observations, { id: 'obs-skip', about: { kind: 'system', id: 'sys-f' }, outcome: 'skipped', occurredAt: new Date(ctx.nowMs).toISOString(), logicalDate: ctx.today, plannedDate: '2026-09-20', toDate: null, createdAt: new Date(ctx.nowMs).toISOString(), provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'personal' }] }));

    ({ draft, base } = draftFromState(stateOf(store), 'sys-f', keyFor));
    draft.schedule = { ...draft.schedule, byWeekday: [0, 3] };
    await saveSystemDraft(store, draft, base);

    const after = stateOf(store);
    assert.equal(after.recurrences.length, 1, 'never a second rule');
    assert.equal(after.recurrences[0].id, ruleId, 'the same rule, edited in place');
    assert.deepEqual(after.recurrences[0].byWeekday, [0, 3]);
    assert.equal(after.observations.filter((o) => o.outcome === 'skipped').length, 1, 'history is untouched by the edit');
    assert.equal(scheduleViewFor(after, 'sys-f', DAY).nextExpected, DAY, 'today (a Wednesday) is itself an occurrence of [Sun, Wed]');
    assert.equal(scheduleViewFor(after, 'sys-f', '2026-09-17').nextExpected, '2026-09-23', 'from Thursday the skipped Sunday (09-20) is passed over: the next expected is Wednesday');
  });

  test('"No schedule" on a scheduled System stops it: the rule is kept as ended, never deleted', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-f');
    let { draft, base } = draftFromState(stateOf(store), 'sys-f', keyFor);
    draft.scheduleMode = 'calendar';
    draft.schedule = { frequency: 'daily', interval: 1, byWeekday: null, byMonthDay: null, timeOfDayMinutes: null };
    await saveSystemDraft(store, draft, base);
    ({ draft, base } = draftFromState(stateOf(store), 'sys-f', keyFor));
    draft.scheduleMode = 'none';
    draft.schedule = null;
    await saveSystemDraft(store, draft, base);
    const after = stateOf(store);
    assert.equal(after.recurrences.length, 1);
    assert.equal(after.recurrences[0].status, 'ended');
    assert.equal(scheduleViewFor(after, 'sys-f', DAY).state, 'ended');
  });
});

describe('SCENARIO W — draft versus save', () => {
  test('editing without saving changes nothing canonical; saving changes it exactly once', async () => {
    const sh = systemsHarness();
    const store = await sh.open();
    const before = stateOf(store);
    const writesBefore = sh.storage.writeLog.length;

    const { draft, base } = newDraft(before, 'sys-w', homeCategoryId(before));
    draft.name = 'Half-typed';
    draft.steps = steps(['one', 'two']);
    draft.steps.push({ key: 'x9', id: null, title: 'three', effortMinutes: 4 });
    assert.equal(stateOf(store), before, 'the draft is presentation state: canonical state is the same object');
    assert.equal(sh.storage.writeLog.length, writesBefore, 'and nothing was written to storage');

    await saveSystemDraft(store, draft, base);
    assert.equal(stateOf(store).systems.length, 1);
    assert.equal(stateOf(store).systemSteps.length, 3);
  });
});

describe('SCENARIO X — double save and retry never duplicate', () => {
  test('two saves of one new System in the same instant produce ONE System and ONE set of steps', async () => {
    const sh = systemsHarness();
    const store = await sh.open();
    const { draft, base } = newDraft(stateOf(store), 'sys-x', homeCategoryId(stateOf(store)));
    draft.name = 'Sunday reset';
    draft.steps = steps(['Wipe counters', 'Reset the entry']);
    const [a, b] = await Promise.all([saveSystemDraft(store, draft, base), saveSystemDraft(store, draft, base)]);
    assert.deepEqual([a.kind, b.kind].sort(), ['already_saved', 'saved']);
    assert.equal(stateOf(store).systems.length, 1);
    assert.equal(stateOf(store).systemSteps.length, 2);
  });

  test('a failed write can be retried: nothing landed the first time, so one System exists after the retry', async () => {
    let failing = false;
    const sh = systemsHarness({ storageOptions: { failWrite: () => failing } });
    const store = await sh.open();
    const { draft, base } = newDraft(stateOf(store), 'sys-x', homeCategoryId(stateOf(store)));
    draft.name = 'Sunday reset';
    draft.steps = steps(['Wipe counters']);

    failing = true;
    assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'not_saved' });
    assert.equal(stateOf(store).systems.length, 0, 'a change that did not land is not shown');
    assert.equal(stateOf(store).systemSteps.length, 0);

    failing = false;
    assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'saved', systemId: 'sys-x' });
    assert.equal(stateOf(store).systems.length, 1);
    assert.equal(stateOf(store).systemSteps.length, 1);
  });

  test('the same draft applied twice to the same starting state gives the same result (deterministic ids)', () => {
    const state = realHousehold();
    const { draft, base } = newDraft(state, 'sys-x', 'cat-home');
    draft.name = 'Sunday reset';
    draft.steps = steps(['a', 'b']);
    const first = applySystemDraft(state, ctxAt(), draft, base);
    const second = applySystemDraft(state, ctxAt(), draft, base);
    assert.deepEqual(first.state, second.state);
    assert.deepEqual(first.outcome, { kind: 'saved', systemId: 'sys-x' });
    assert.equal(applySystemDraft(first.state, ctxAt(), draft, base).outcome.kind, 'already_saved', 'and a replay onto the saved state writes nothing');
  });
});

describe('SCENARIO Y — a stale editor never overwrites newer truth', () => {
  test('canonical state changed underneath: the save is refused, the newer truth stands, a reload then saves', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-y');
    const { draft, base } = draftFromState(stateOf(store), 'sys-y', keyFor);
    draft.name = 'My edit from the old screen';

    // another legitimate mutation lands first (e.g. a background sync applied a rename)
    await store.commit((state) => ({ ...state, systems: state.systems.map((s) => (s.id === 'sys-y' ? { ...s, name: 'Renamed elsewhere' } : s)) }));
    const after = stateOf(store);
    assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'stale' });
    assert.equal(stateOf(store), after, 'nothing was written');
    assert.equal(stateOf(store).systems[0].name, 'Renamed elsewhere', 'the newer truth was not silently overwritten');

    const reloaded = draftFromState(stateOf(store), 'sys-y', keyFor);
    reloaded.draft.purpose = 'Now on top of the latest version';
    assert.equal((await saveSystemDraft(store, reloaded.draft, reloaded.base)).kind, 'saved');
    assert.equal(stateOf(store).systems[0].name, 'Renamed elsewhere');
    assertEvidence('Y-stale-editor', { scenario: 'Y', firstSave: 'stale', canonicalAfter: { name: after.systems[0].name }, reloadedSave: 'saved' });
  });

  test('a sync pull that REBUILDS identical rows is not a conflict (content-based, not reference-based)', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-y');
    const { draft, base } = draftFromState(stateOf(store), 'sys-y', keyFor);
    draft.purpose = 'edited';
    await store.commit((state) => JSON.parse(JSON.stringify(state)));
    assert.equal((await saveSystemDraft(store, draft, base)).kind, 'saved');
  });

  test('a step added underneath, or a schedule changed underneath, also makes the editor stale', async () => {
    const sh = systemsHarness();
    const { store } = await createSchoolNight(sh, 'sys-y');
    const { draft, base } = draftFromState(stateOf(store), 'sys-y', keyFor);
    await store.commit((state) => ({ ...state, systemSteps: [...state.systemSteps, stepRow({ id: 'from-sync', systemId: 'sys-y', position: 30, title: 'From another device' })] }));
    assert.equal((await saveSystemDraft(store, draft, base)).kind, 'stale');
  });
});

describe('SCENARIO AI — editing a System that already exists (demo seed, legacy, child-scoped)', () => {
  test('a legacy child-scoped System with foreign facets keeps every field the editor does not own', async () => {
    const legacy = systemRow({
      id: 'sys-legacy',
      name: 'Old bedtime routine',
      description: 'From before.',
      scope: 'child',
      automationMode: 'suggest',
      effortMinutes: 20,
      energyDemand: 'high',
      provenance: { producer: 'ai-inference', artifactId: null, confidence: 'possible' },
    });
    // Built directly, not through withRows: this fixture is deliberately legacy data that predates the
    // child-subject invariant (a child-scoped System that never recorded one) — withRows proves its
    // result would be ACCEPTED by the current app, which this row, by design, would not be.
    const start = { ...realHousehold({ children: [{ id: 'child-1', displayName: 'Josie', birthDate: '2018-03-04', scope: 'child' }] }), systems: [legacy] };

    const view = projectSystemDetail(start, 'sys-legacy', CLOCK);
    assert.deepEqual(view.subject, { kind: 'child_not_recorded' }, 'a child-scoped System that cannot name its child says exactly that — it does not guess');

    // No store: this fixture is invalid by the current write-path invariant (it could never be committed
    // for real), so the save half of this scenario exercises the pure domain command directly — exactly
    // what the store's commit wraps and validates in the ordinary path.
    const { draft, base } = draftFromState(start, 'sys-legacy', keyFor);
    draft.name = 'Bedtime routine';
    draft.steps = [...draft.steps, ...steps(['Brush teeth'])];
    const result = applySystemDraft(start, ctxAt(), draft, base);
    assert.equal(result.outcome.kind, 'saved');

    const [row] = result.state.systems;
    assert.equal(result.state.systems.length, 1, 'no duplicate');
    assert.deepEqual(row, { ...legacy, name: 'Bedtime routine' }, 'scope, automation mode, effort, energy and provenance are preserved verbatim');
    assertEvidence('AI-legacy-edit', { scenario: 'AI', canonical: canonicalOf(result.state, 'sys-legacy'), view: evidenceOfDetail(projectSystemDetail(result.state, 'sys-legacy', CLOCK)) });
  });

  test('a demo-seed System edits in place and stays demo-provenance', async () => {
    const sh = systemsHarness({ mode: 'demo' });
    const store = await sh.open();
    const before = stateOf(store);
    const { draft, base } = draftFromState(before, 'sys-2', keyFor);
    draft.purpose = 'Twenty minutes, Sundays.';
    assert.equal((await saveSystemDraft(store, draft, base)).kind, 'saved');
    const row = stateOf(store).systems.find((s) => s.id === 'sys-2');
    assert.equal(row.provenance.producer, 'demo-seed');
    assert.equal(row.name, before.systems.find((s) => s.id === 'sys-2').name);
    assert.equal(stateOf(store).systems.length, before.systems.length);
  });
});
