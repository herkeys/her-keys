/**
 * HK-FEATURE-06 / HM2 — THE HOME PROJECTION.
 *
 * `buildHomeView(state, nowMs)` is the one place Home reasons. These tests attack it through real households built with the
 * domain's own transitions. Test titles begin with the contract scenario id (A .. BL) so the scenario assertion map is traceable.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { archiveCategory, renameCategory } from '../../src/domain/categories.ts';
import { updateTask } from '../../src/domain/tasks.ts';
import { attentionFor } from '../../src/domain/reasoning/attention.ts';
import { nextOccurrence } from '../../src/domain/structure.ts';
import { zonedTimeToEpochMs } from '../../src/domain/logicalDay.ts';
import { buildHomeView, homeItemOf } from '../../src/features/home/model/buildHomeView.ts';
import { homeScreenState } from '../../src/features/home/model/readiness.ts';
import {
  ANA, HOME, NOW, SAM, TODAY, TZ, accept, acknowledge, addDependency, archiveTask, atLocal, completeTask, delegate, denseHousehold, fresh, homeTask, homeVisit,
  household, iso, lastEvent, lastTask, makeCtx, removeDependency, removeEvent, repeating, task,
} from '../support/homeFixtures.mjs';

const view = (state, now = NOW) => buildHomeView(state, now);
const itemFor = (v, id) => homeItemOf(v, `task:${id}`);
const section = (v, key) => v.sections.find((s) => s.key === key).itemIds;
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
};
const settled = { settled: true, recovery: null, memoryOnly: false };

describe('A / B / AH — no records, loading, and an empty Home never says the house is fine', () => {
  test('A. no Home records: no items, every section empty, creation allowed, and the screen state is "empty — nothing saved"', () => {
    const v = view(household());
    assert.deepEqual(v.items, []);
    assert.ok(v.sections.every((s) => s.itemIds.length === 0));
    assert.equal(v.canCreate, true);
    assert.equal(v.coverage.recordsConsidered, 0);
    assert.deepEqual(homeScreenState(settled, v), { kind: 'empty', anySaved: false });
  });

  test('B. hydrating is LOADING, never empty — even when a projection exists and is empty', () => {
    const v = view(household());
    assert.deepEqual(homeScreenState({ settled: false, recovery: null, memoryOnly: false }, v), { kind: 'loading' });
    assert.deepEqual(homeScreenState({ settled: false, recovery: null, memoryOnly: false }, null), { kind: 'loading' });
  });

  test('AH. Home records that are all closed (removed or old) are "nothing open", NOT "nothing saved" and NOT all-clear', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Old thing');
    s = archiveTask(s, ctx, lastTask(s).id);
    const v = view(s);
    assert.equal(v.items.length, 0);
    assert.equal(v.coverage.recordsConsidered, 1);
    assert.deepEqual(homeScreenState(settled, v), { kind: 'empty', anySaved: true });
  });
});

describe('D / E / AF — what is unresolved, and what is NOT Home', () => {
  test('D. one unresolved Home task', () => {
    const ctx = fresh();
    const s = homeTask(household(), ctx, 'Change the furnace filter');
    const v = view(s);
    assert.equal(v.items.length, 1);
    const item = v.items[0];
    assert.deepEqual([item.canonicalKind, item.resolutionState, item.homeContextId, item.homeSystemRole], ['task', 'unresolved', HOME, 'home']);
    assert.deepEqual(section(v, 'unresolved'), [item.homeItemId]);
  });

  test('E. several tasks: each appears exactly once across the work sections', () => {
    const ctx = fresh();
    let s = household();
    for (const t of ['Bleed the radiators', 'Test the smoke detectors', 'Clean the gutters']) s = homeTask(s, ctx, t);
    const v = view(s);
    const work = ['attention', 'waiting', 'comingUp', 'unresolved'].flatMap((k) => section(v, k));
    assert.equal(work.length, 3);
    assert.equal(new Set(work).size, 3);
  });

  test('AF. a record filed under another area is not in Home, whatever its title says', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Home task');
    s = { ...s, tasks: [...s.tasks, { ...lastTask(s), id: 'kids-1', title: 'Fix the house at home', categoryId: 'cat-kids' }] };
    const v = view(s);
    assert.deepEqual(v.items.map((i) => i.title), ['Home task']);
  });
});

describe('F / AC — a visit is a commitment; scheduled is not completed', () => {
  test('F. an upcoming visit is Coming up, scheduled, with a window', () => {
    const s = homeVisit(household(), fresh(), 'Plumber visit', { date: TODAY, from: [14, 0], to: [15, 0] });
    const v = view(s);
    const item = v.items[0];
    assert.deepEqual([item.canonicalKind, item.resolutionState, item.scheduledState], ['event', 'scheduled', 'scheduled_visit']);
    assert.equal(item.timing[0].when, 'today');
    assert.deepEqual(section(v, 'comingUp'), [item.homeItemId]);
    assert.equal(item.lastDoneApplicable, false, 'a visit has no last-done and no never-done');
    assert.equal(item.lastDone, null);
  });

  test('AC. a visit is scheduled while the work it is for is still unresolved — two facts, not one', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Fix the leaking tap');
    s = homeVisit(s, ctx, 'Plumber', { date: '2026-09-23' });
    const v = view(s);
    assert.equal(v.items.find((i) => i.title === 'Plumber').resolutionState, 'scheduled');
    assert.equal(v.items.find((i) => i.title === 'Fix the leaking tap').resolutionState, 'unresolved');
  });

  test('a visit that has ended is a PAST visit whose outcome Home does not know — never completed', () => {
    const s = homeVisit(household(), fresh(), 'Electrician', { date: '2026-09-19', from: [9, 0], to: [10, 0] });
    const item = view(s).items[0];
    assert.equal(item.resolutionState, 'past_visit');
    assert.ok(item.unknownFacts.includes('visit_outcome_unknown'));
    assert.equal(item.lastDone, null);
    assert.deepEqual(item.availableActions, ['edit', 'remove']);
  });

  test('a removed visit is not shown', () => {
    const ctx = fresh();
    let s = homeVisit(household(), ctx, 'Cancelled visit');
    s = removeEvent(s, ctx, lastEvent(s).id);
    assert.equal(view(s).items.length, 0);
  });
});

describe('G / H / I — duration knowledge (UNKNOWN != ZERO, DEFAULT != USER-PROVIDED)', () => {
  test('G. unrecorded, H. default, I. user-provided are three distinct facts with distinct unknown-fact flags', () => {
    const ctx = fresh();
    let s = household();
    s = homeTask(s, ctx, 'unrecorded', { durationMinutes: 15, durationSource: null });
    s = homeTask(s, ctx, 'default', { durationMinutes: 15, durationSource: 'default' });
    s = homeTask(s, ctx, 'user', { durationMinutes: 15, durationSource: 'user' });
    s = homeTask(s, ctx, 'inferred', { durationMinutes: 15, durationSource: 'inferred' });
    const v = view(s);
    const by = (title) => v.items.find((i) => i.title === title);
    assert.deepEqual([by('unrecorded').duration.knowledge, by('default').duration.knowledge, by('user').duration.knowledge, by('inferred').duration.knowledge], ['unrecorded', 'default-estimate', 'user-provided', 'inferred-estimate']);
    assert.ok(by('unrecorded').unknownFacts.includes('duration_unrecorded'));
    assert.ok(by('default').unknownFacts.includes('duration_default_estimate'));
    assert.ok(by('inferred').unknownFacts.includes('duration_inferred_estimate'));
    assert.deepEqual(by('user').unknownFacts.filter((f) => f.startsWith('duration')), []);
  });
});

describe('O / P — the context: rename and lifecycle', () => {
  test('O. renaming the Home area changes the label and nothing else about what is listed', () => {
    const ctx = fresh();
    const s = homeTask(household(), ctx, 'Bleed the radiators');
    const before = view(s);
    const after = view(renameCategory(s, HOME, 'House stuff'));
    assert.equal(after.label, 'House stuff');
    assert.deepEqual(after.items, before.items, 'identical items');
    assert.deepEqual(after.sections, before.sections);
  });

  test('P. archived: records are still listed, the context says archived, and creation is withheld', () => {
    const s = archiveCategory(homeTask(household(), fresh(), 'Winterize the hose bib'), HOME);
    const v = view(s);
    assert.equal(v.context.kind, 'archived');
    assert.equal(v.items.length, 1);
    assert.equal(v.canCreate, false);
    assert.deepEqual(homeScreenState(settled, v), { kind: 'content' });
  });

  test('P. missing: no items, no creation, and it is NOT rendered as an empty Home', () => {
    const s = household();
    const v = view({ ...s, categories: s.categories.filter((c) => c.id !== HOME) });
    assert.equal(v.context.kind, 'missing');
    assert.deepEqual(v.items, []);
    assert.equal(v.canCreate, false);
    assert.deepEqual(homeScreenState(settled, v), { kind: 'missing_context' });
  });
});

describe('Q / R / S / T / U — responsibility: assigned, acknowledged, accepted and covered are different things', () => {
  const withHandoff = (steps) => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Replace the water heater anode');
    const id = lastTask(s).id;
    s = delegate(s, ctx, { about: { kind: 'task', id }, to: { kind: 'person', id: SAM(s) }, ackWithinMinutes: 120 });
    const responsibility = s.responsibilities[s.responsibilities.length - 1];
    s = steps(s, ctx, responsibility.id);
    return { s, id };
  };

  test('Q. assigned, not accepted: "asked" — not covered, and it is still waiting on someone', () => {
    const { s, id } = withHandoff((state) => state);
    const item = itemFor(view(s), id);
    assert.equal(item.responsibility.coverage, 'asked');
    assert.equal(item.responsibility.state, 'requested');
    assert.equal(item.resolutionState, 'unresolved');
    assert.deepEqual(section(view(s), 'waiting'), [item.homeItemId]);
  });

  test('Q. a request past its answer time becomes "no answer" — and only then, at the instant it passes', () => {
    const { s, id } = withHandoff((state) => state);
    assert.equal(itemFor(view(s, NOW + 119 * 60_000), id).responsibility.coverage, 'asked');
    const late = itemFor(view(s, NOW + 121 * 60_000), id);
    assert.equal(late.responsibility.coverage, 'no_answer');
    assert.ok(late.attentionFacts.some((f) => f.reason === 'unacknowledged_delegation'), 'the shared attention layer says so');
  });

  test('acknowledged is "seen" — not accepted, not covered', () => {
    const { s, id } = withHandoff((state, ctx, rid) => acknowledge(state, ctx, rid));
    assert.equal(itemFor(view(s), id).responsibility.coverage, 'seen');
  });

  test('R. accepted while it still needs her: NOT covered', () => {
    const { s, id } = withHandoff((state, ctx, rid) => accept(state, ctx, rid, true));
    const item = itemFor(view(s), id);
    assert.equal(item.responsibility.coverage, 'accepted_needs_you');
    assert.equal(item.responsibility.stillNeedsMe, true);
  });

  test('S. covered ONLY when accepted AND she has said it no longer needs her — and it is still unresolved work', () => {
    const { s, id } = withHandoff((state, ctx, rid) => accept(state, ctx, rid, false));
    const item = itemFor(view(s), id);
    assert.equal(item.responsibility.coverage, 'covered');
    assert.equal(item.resolutionState, 'unresolved', 'covering is not completing');
  });

  test('T. a task nobody holds: not delegated, and Home does not claim it "needs her" unless that is known', () => {
    const s = homeTask(household(), fresh(), 'Call the roofer');
    const item = view(s).items[0];
    assert.equal(item.responsibility.coverage, 'not_delegated');
    assert.equal(item.responsibility.stillNeedsMe, null);
  });

  test('U. another person owns it and it remains unresolved', () => {
    const { s, id } = withHandoff((state, ctx, rid) => accept(state, ctx, rid, false));
    const v = view(s);
    assert.equal(itemFor(v, id).resolutionState, 'unresolved');
    assert.ok(section(v, 'waiting').includes(`task:${id}`));
  });

  test('a contractor as holder is flagged as NOT verified — a name is not a qualification', () => {
    const { s, id } = withHandoff((state) => state);
    assert.ok(itemFor(view(s), id).unknownFacts.includes('provider_not_verified'));
  });
});

describe('V / W / X — dependency truth: only satisfied is met', () => {
  const requires = (prereq) => {
    const ctx = fresh();
    let s = household();
    s = homeTask(s, ctx, 'Prerequisite');
    const pre = lastTask(s).id;
    s = homeTask(s, ctx, 'Main work');
    const main = lastTask(s).id;
    s = addDependency(s, ctx, { relation: 'requires', from: { kind: 'task', id: main }, to: { kind: 'task', id: pre } }).state;
    return { s: prereq(s, ctx, pre), main, pre };
  };

  test('V. a completed prerequisite is satisfied: ready', () => {
    const { s, main } = requires((state, ctx, pre) => completeTask(state, ctx, pre));
    const item = itemFor(view(s), main);
    assert.equal(item.dependency.readiness, 'ready');
    assert.equal(item.dependency.prerequisites[0].standing, 'satisfied');
  });

  test('a pending prerequisite blocks', () => {
    const { s, main } = requires((state) => state);
    assert.equal(itemFor(view(s), main).dependency.readiness, 'blocked');
  });

  test('W. a REMOVED prerequisite is unavailable and needs review — never completed, never ready', () => {
    const { s, main } = requires((state, ctx, pre) => archiveTask(state, ctx, pre));
    const item = itemFor(view(s), main);
    assert.equal(item.dependency.readiness, 'needsReview');
    assert.deepEqual([item.dependency.prerequisites[0].standing, item.dependency.prerequisites[0].cause], ['unavailable', 'retired']);
  });

  test('X. a MISSING prerequisite is unavailable, never satisfied', () => {
    const { s, main, pre } = requires((state) => state);
    const gone = { ...s, tasks: s.tasks.filter((t) => t.id !== pre) };
    const item = itemFor(view(gone), main);
    assert.equal(item.dependency.readiness, 'needsReview');
    assert.deepEqual([item.dependency.prerequisites[0].standing, item.dependency.prerequisites[0].cause], ['unavailable', 'missing']);
  });

  test('a prerequisite whose dependency edge was retired no longer counts', () => {
    const { s, main } = requires((state) => state);
    const edge = s.dependencies[0];
    const item = itemFor(view({ ...removeDependency(s, fresh(), edge.id) }), main);
    assert.equal(item.dependency.readiness, 'none');
  });
});

describe('Y / Z / AA / AB / BD — recurrence and last done', () => {
  test('Y. a Home task with a shared recurrence rule is in "Repeats", with the next date derived by the shared function', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Change the furnace filter');
    const id = lastTask(s).id;
    s = repeating(s, ctx, id, { frequency: 'monthly', interval: 3, anchorDate: '2026-06-12' });
    const item = itemFor(view(s), id);
    assert.equal(item.recurrence.state, 'active');
    assert.equal(item.recurrence.nextExpected, nextOccurrence(s, s.recurrences[0], TODAY), 'the shared derivation, not a Home one');
    assert.ok(section(view(s), 'repeats').includes(`task:${id}`));
  });

  test('Z. a recurrence definition is NEVER a completion: no last done, no observation, and it says no completion is recorded', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Test the smoke detectors');
    const id = lastTask(s).id;
    const observationsBefore = s.observations.length;
    s = repeating(s, ctx, id);
    const item = itemFor(view(s), id);
    assert.equal(item.lastDone, null);
    assert.equal(s.observations.length, observationsBefore, 'adding a rule recorded nothing');
    assert.ok(item.unknownFacts.includes('no_completion_recorded'));
  });

  test('AA. completing records evidence, and Last Done comes from it', () => {
    const ctx = makeCtx(atLocal('2026-09-10', 9), '2026-09-10', 'k-');
    let s = homeTask(household(), fresh(), 'Change the furnace filter');
    const id = lastTask(s).id;
    s = repeating(s, fresh(), id);
    s = completeTask(s, ctx, id);
    const item = itemFor(view(s), id);
    assert.deepEqual([item.lastDone.date, item.lastDone.evidence], ['2026-09-10', 'completion_observation']);
    assert.equal(item.resolutionState, 'marked_done');
    assert.equal(item.lastDoneApplicable, true);
  });

  test('AA. a task completed with no observation still has evidence: its own paired completedAt', () => {
    const ctx = makeCtx(atLocal('2026-09-10', 9), '2026-09-10', 'k-');
    let s = homeTask(household(), fresh(), 'Legacy task');
    const id = lastTask(s).id;
    s = repeating(s, fresh(), id);
    s = completeTask(s, ctx, id);
    s = { ...s, observations: [] };
    const item = itemFor(view(s), id);
    assert.deepEqual([item.lastDone.date, item.lastDone.evidence], ['2026-09-10', 'task_completed_at']);
  });

  test('AB. no completion evidence: lastDone is null — Home reports absence of a record, never "never"', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Flush the water heater');
    s = repeating(s, ctx, lastTask(s).id);
    const item = view(s).items[0];
    assert.equal(item.lastDone, null);
    assert.ok(item.unknownFacts.includes('no_completion_recorded'));
  });

  test('BD. an EDIT after completion never moves Last Done: the edit timestamp is not completion evidence', () => {
    const done = makeCtx(atLocal('2026-09-10', 9), '2026-09-10', 'k-');
    let s = homeTask(household(), fresh(), 'Change the furnace filter');
    const id = lastTask(s).id;
    s = repeating(s, fresh(), id);
    s = completeTask(s, done, id);
    const before = itemFor(view(s), id).lastDone;
    s = updateTask(s, makeCtx(atLocal('2026-09-20', 8), '2026-09-20', 'e-'), id, { notes: 'edited later' });
    assert.ok(task(s, id).updatedAt > task(s, id).completedAt, 'the edit really is newer');
    assert.deepEqual(itemFor(view(s), id).lastDone, before);
  });

  test('a paused or ended rule yields no next date and no invented one', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Seasonal task');
    s = repeating(s, ctx, lastTask(s).id);
    const ended = { ...s, recurrences: s.recurrences.map((r) => ({ ...r, status: 'ended' })) };
    const item = view(ended).items[0];
    assert.equal(item.recurrence.state, 'ended');
    assert.equal(item.recurrence.nextExpected, null);
  });

  test('a rule that cannot yield a date (after completion) shows no date and says so', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Rinse the humidifier');
    s = repeating(s, ctx, lastTask(s).id);
    s = { ...s, recurrences: s.recurrences.map((r) => ({ ...r, trigger: 'after_completion' })) };
    const item = view(s).items[0];
    assert.equal(item.recurrence.nextExpected, null);
    assert.ok(item.unknownFacts.includes('next_date_not_derivable'));
  });

  test('a repeating task marked done stays in Repeats, with its Last Done, and is not in the work sections', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Change the furnace filter');
    const id = lastTask(s).id;
    s = repeating(s, ctx, id);
    s = completeTask(s, ctx, id);
    const v = view(s);
    assert.ok(section(v, 'repeats').includes(`task:${id}`));
    assert.ok(!['attention', 'waiting', 'comingUp', 'unresolved'].some((k) => section(v, k).includes(`task:${id}`)));
  });
});

describe('AD — completion never certifies the physical condition', () => {
  test('AD. a completed task is "marked done" and carries an explicit "condition not verified" unknown', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Replace the smoke detector battery');
    s = completeTask(s, ctx, lastTask(s).id);
    const item = view(s).items[0];
    assert.equal(item.resolutionState, 'marked_done');
    assert.ok(item.unknownFacts.includes('condition_not_verified'));
    assert.deepEqual(item.availableActions, ['due_again', 'edit']);
  });
});

describe('AG — one canonical truth, however many sections show it', () => {
  test('AG. an open repeating task that is due soon is in Coming up AND Repeats — the same single item, the same facts', () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Clean the dryer vent', { dueDate: '2026-09-25' });
    const id = lastTask(s).id;
    s = repeating(s, ctx, id, { frequency: 'weekly', interval: 2, anchorDate: '2026-09-25' });
    const v = view(s);
    assert.ok(section(v, 'comingUp').includes(`task:${id}`));
    assert.ok(section(v, 'repeats').includes(`task:${id}`));
    assert.equal(v.items.filter((i) => i.homeItemId === `task:${id}`).length, 1, 'one item object, referenced by id from both sections');
  });
});

describe('the projection is pure, deterministic and honest about the shared attention layer', () => {
  test('it never mutates canonical state', () => {
    const s = denseHousehold({ homeTasks: 60, otherTasks: 50 });
    const frozen = deepFreeze(structuredClone(s));
    const before = JSON.stringify(frozen);
    buildHomeView(frozen, NOW);
    assert.equal(JSON.stringify(frozen), before);
  });

  test('AY. ordering is stable: shuffling every collection does not change any section', () => {
    const s = denseHousehold({ homeTasks: 80, otherTasks: 20 });
    const shuffled = { ...s, tasks: [...s.tasks].reverse(), events: [...s.events].reverse(), systems: [...s.systems].reverse(), responsibilities: [...s.responsibilities].reverse(), dependencies: [...s.dependencies].reverse(), observations: [...s.observations].reverse(), recurrences: [...s.recurrences].reverse() };
    assert.deepEqual(view(shuffled).sections, view(s).sections);
    assert.deepEqual(view(shuffled).items, view(s).items);
  });

  test('BB. Home shows exactly the shared attention layer\'s reasons for Home records — it neither adds nor contradicts', () => {
    const s = denseHousehold({ homeTasks: 90, otherTasks: 30 });
    const v = view(s);
    const shared = attentionFor(s, NOW).filter((a) => a.about && (a.about.kind === 'task' || a.about.kind === 'responsibility'));
    for (const item of v.items.filter((i) => i.canonicalKind === 'task' && i.resolutionState === 'unresolved')) {
      const expected = shared.filter((a) => (a.about.kind === 'task' ? `task:${a.about.id}` : (() => { const r = s.responsibilities.find((x) => x.id === a.about.id); return r ? `${r.about.kind}:${r.about.id}` : null; })()) === item.homeItemId).map((a) => `${a.reason}/${a.urgency}`).sort();
      assert.deepEqual(item.attentionFacts.map((f) => `${f.reason}/${f.urgency}`).sort(), expected, item.homeItemId);
    }
  });

  test('BF. a System is only read: its one action is opening Systems — no step, run, template or completion surface', () => {
    const s = denseHousehold({ homeTasks: 10, otherTasks: 0 });
    const systems = view(s).items.filter((i) => i.canonicalKind === 'system');
    assert.equal(systems.length, 12);
    for (const item of systems) assert.deepEqual(item.availableActions, ['open_systems']);
    assert.ok(systems.every((i) => section(view(s), 'repeats').includes(i.homeItemId)));
  });
});

describe('AJ / AK / AL / AM / AN / AO — the clock: only facts that should change do', () => {
  const at = (h, m = 0, date = TODAY) => zonedTimeToEpochMs(date, h * 60 + m, TZ);

  test('AJ/AK/AL. identical state at 08:00, 15:00 and 21:00 reorders and reclassifies NOTHING — only a visit\'s own "when" changes', () => {
    const ctx = fresh();
    let s = household();
    s = homeTask(s, ctx, 'Due today', { dueDate: TODAY });
    s = homeTask(s, ctx, 'Due soon', { dueDate: '2026-09-24' });
    s = homeTask(s, ctx, 'Overdue', { dueDate: '2026-09-18' });
    s = homeTask(s, ctx, 'Undated');
    s = repeating(s, ctx, lastTask(s).id);
    s = homeVisit(s, ctx, 'Morning visit', { from: [10, 0], to: [11, 0] });
    const [a, b, c] = [view(s, at(8)), view(s, at(15)), view(s, at(21))];
    assert.deepEqual(a.sections, b.sections, '08:00 vs 15:00: same membership and order');
    assert.deepEqual(b.sections, c.sections, '15:00 vs 21:00: same membership and order');
    const strip = (v) => v.items.map((i) => ({ ...i, timing: i.timing.filter((t) => t.kind !== 'visit'), unknownFacts: i.unknownFacts.filter((f) => f !== 'visit_outcome_unknown'), resolutionState: i.canonicalKind === 'event' ? 'x' : i.resolutionState, scheduledState: i.canonicalKind === 'event' ? 'x' : i.scheduledState, availableActions: i.canonicalKind === 'event' ? [] : i.availableActions }));
    assert.deepEqual(strip(a), strip(b));
    assert.deepEqual(strip(b), strip(c));
    const visit = (v) => v.items.find((i) => i.title === 'Morning visit').timing[0].when;
    assert.deepEqual([visit(a), visit(b), visit(c)], ['today', 'earlier_today', 'earlier_today'], 'the one thing that legitimately changes');
  });

  test('AM. across local midnight the day advances: "due today" becomes overdue, and nothing else moves', () => {
    const ctx = fresh();
    const s = homeTask(household(), ctx, 'Due today', { dueDate: TODAY });
    const before = view(s, at(23, 59));
    const after = view(s, at(0, 1, '2026-09-22'));
    assert.equal(before.items[0].timing[0].when, 'today');
    assert.equal(after.items[0].timing[0].when, 'overdue');
    assert.equal(after.today, '2026-09-22');
  });

  test('AO. fall-back (Nov 1 2026, America/Chicago has a repeated 1 AM hour): both 1:30s are the same logical day, and the day turns at local midnight', () => {
    const ctx = fresh();
    const s = homeTask(household(), ctx, 'Due Nov 1', { dueDate: '2026-11-01' });
    const firstOneThirty = Date.UTC(2026, 10, 1, 6, 30); // 1:30 CDT
    const secondOneThirty = Date.UTC(2026, 10, 1, 7, 30); // 1:30 CST
    assert.equal(view(s, firstOneThirty).today, '2026-11-01');
    assert.equal(view(s, secondOneThirty).today, '2026-11-01');
    assert.equal(view(s, Date.UTC(2026, 10, 2, 5, 59)).items[0].timing[0].when, 'today', '23:59 CST on the 1st');
    assert.equal(view(s, Date.UTC(2026, 10, 2, 6, 1)).items[0].timing[0].when, 'overdue', '00:01 CST on the 2nd');
  });

  test('AN. spring-forward (Mar 14 2027, the 2 AM hour does not exist): the logical day is unaffected', () => {
    const ctx = fresh();
    const s = homeTask(household(), ctx, 'Due Mar 14', { dueDate: '2027-03-14' });
    assert.equal(view(s, Date.UTC(2027, 2, 14, 7, 59)).today, '2027-03-14', '1:59 CST');
    assert.equal(view(s, Date.UTC(2027, 2, 14, 8, 0)).today, '2027-03-14', '3:00 CDT');
    assert.equal(view(s, Date.UTC(2027, 2, 14, 8, 0)).items[0].timing[0].when, 'today');
  });
});

describe('BL / BF — feature boundary: no sibling imports, and Home never renders System run or template UI', () => {
  test('BL. no file under src/features/home, or its tests, imports a sibling Wave feature', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const files = [];
    const walk = (dir) => { for (const e of readdirSync(dir)) { const f = join(dir, e); if (statSync(f).isDirectory()) walk(f); else if (/\.(ts|tsx|mjs)$/.test(e)) files.push(f); } };
    walk(join(root, 'src/features/home'));
    walk(join(root, 'tests/hk-f06'));
    const sibling = /(from|import\()\s*['"][^'"]*(features\/(kids|coparent|co-parent|meals|money|work|today|calendar|talk-it-out|daily-load|systems|one-move)\b|feature\/0[1-8])/;
    const allowed = /features\/(calendar|systems)\//; // read-only navigation and shared design targets are checked separately below
    const hits = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const line of text.split(/\r?\n/)) if (sibling.test(line) && !/^\s*(\/\/|\*)/.test(line) && !allowed.test(line)) hits.push(`${f.replace(root, '')}: ${line.trim()}`);
    }
    assert.deepEqual(hits, []);
  });

  test('BF. nothing in Home touches System steps, runs or templates', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const files = [];
    const walk = (dir) => { for (const e of readdirSync(dir)) { const f = join(dir, e); if (statSync(f).isDirectory()) walk(f); else if (/\.(ts|tsx)$/.test(e)) files.push(f); } };
    walk(join(root, 'src/features/home'));
    const forbidden = /\b(addSystemStep|stepsInOrder|systemSteps|skipOccurrence|SystemRun|systemRun|runSystem|completeSystem|SystemTemplate|stepTemplate)\b/;
    const hits = files.filter((f) => forbidden.test(readFileSync(f, 'utf8'))).map((f) => f.replace(root, ''));
    assert.deepEqual(hits, []);
  });
});
