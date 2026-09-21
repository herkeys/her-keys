/**
 * THE HOME SCENARIO CATALOG. Every state-based Tier 1 / Tier 2 scenario of the contract, as: a deterministic fixture (`build`), the
 * semantic evidence it must produce (`expect`), and — via tests/hk-f06/homeScenarios.test.mjs — a committed evidence file under
 * tests/fixtures/home/scenarios/ that a regenerate/compare test keeps honest.
 *
 * Scenario prose is not coverage: each entry below IS the fixture and the assertion. Scenarios that are about the store, the network
 * or the screen (loading, restart, sync, second device, account switch, copy, accessibility) live in the other hk-f06 test files and
 * are mapped to them in the ledger's scenario assertion map.
 *
 * Ids come from a per-scenario counter, so the evidence never depends on test order.
 */
import assert from 'node:assert/strict';
import { archiveCategory, renameCategory } from '../../src/domain/categories.ts';
import { addCategory } from '../../src/domain/categories.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { updateTask } from '../../src/domain/tasks.ts';
import { ANA, HOME, NOW, SAM, TODAY, accept, acknowledge, addDependency, archiveTask, atLocal, completeTask, delegate, decline, homeTask, homeVisit, household, lastTask, makeCtx, repeating } from './homeFixtures.mjs';

const ctxFor = (id) => makeCtx(NOW, TODAY, `${id.toLowerCase()}-`);
const one = (ev) => { assert.equal(ev.length, 1, 'exactly one item'); return ev[0]; };
const by = (ev, title, state) => ev.find((e) => (state.tasks.find((t) => `task:${t.id}` === e.homeItemId) ?? state.events.find((x) => `event:${x.id}` === e.homeItemId) ?? {}).title === title);

const withHandoff = (id, steps) => {
  const ctx = ctxFor(id);
  let s = homeTask(household({ ctx }), ctx, 'Have the gutters cleaned');
  const taskId = lastTask(s).id;
  s = delegate(s, ctx, { about: { kind: 'task', id: taskId }, to: { kind: 'person', id: SAM(s) }, ackWithinMinutes: 120 });
  return { state: steps(s, ctx, s.responsibilities[s.responsibilities.length - 1].id), nowMs: NOW };
};

const withPrereq = (id, arrange) => {
  const ctx = ctxFor(id);
  let s = household({ ctx });
  s = homeTask(s, ctx, 'Prerequisite');
  const pre = lastTask(s).id;
  s = homeTask(s, ctx, 'Main work');
  s = addDependency(s, ctx, { relation: 'requires', from: { kind: 'task', id: lastTask(s).id }, to: { kind: 'task', id: pre } }).state;
  return { state: arrange(s, ctx, pre), nowMs: NOW };
};

export const SCENARIOS = [
  { id: 'A', tier: 1, title: 'No Home records', build: () => ({ state: household({ ctx: ctxFor('A') }), nowMs: NOW }),
    expect: (ev, view) => { assert.deepEqual(ev, []); assert.equal(view.canCreate, true); assert.equal(view.coverage.recordsConsidered, 0); } },

  { id: 'D', tier: 1, title: 'One unresolved Home task', build: () => { const c = ctxFor('D'); return { state: homeTask(household({ ctx: c }), c, 'Change the furnace filter'), nowMs: NOW }; },
    expect: (ev) => { const e = one(ev); assert.deepEqual([e.canonicalKind, e.resolutionState, e.homeContextId, e.homeSystemRole, e.coverageState, e.scheduledState], ['task', 'unresolved', HOME, 'home', 'not_delegated', 'not_scheduled']); } },

  { id: 'E', tier: 1, title: 'Multiple Home tasks', build: () => { const c = ctxFor('E'); let s = household({ ctx: c }); for (const t of ['Bleed the radiators', 'Test the smoke detectors', 'Clean the gutters']) s = homeTask(s, c, t); return { state: s, nowMs: NOW }; },
    expect: (ev, view) => { assert.equal(ev.length, 3); assert.equal(new Set(ev.map((e) => e.homeItemId)).size, 3); assert.equal(view.sections.find((s) => s.key === 'unresolved').itemIds.length, 3); } },

  { id: 'F', tier: 1, title: 'One upcoming Home service visit', build: () => { const c = ctxFor('F'); return { state: homeVisit(household({ ctx: c }), c, 'Plumber visit', { date: TODAY, from: [14, 0], to: [15, 0] }), nowMs: NOW }; },
    expect: (ev) => { const e = one(ev); assert.deepEqual([e.canonicalKind, e.scheduledState, e.resolutionState, e.lastDoneApplicable, e.lastDone], ['event', 'scheduled_visit', 'scheduled', false, null]); } },

  { id: 'G', tier: 1, title: 'Unknown duration', build: () => { const c = ctxFor('G'); return { state: homeTask(household({ ctx: c }), c, 'Unknown', { durationMinutes: 15, durationSource: null }), nowMs: NOW }; },
    expect: (ev) => { const e = one(ev); assert.equal(e.durationSource, null); assert.ok(e.unknownFacts.includes('duration_unrecorded')); } },
  { id: 'H', tier: 1, title: 'Default duration', build: () => { const c = ctxFor('H'); return { state: homeTask(household({ ctx: c }), c, 'Default', { durationMinutes: 15, durationSource: 'default' }), nowMs: NOW }; },
    expect: (ev) => { const e = one(ev); assert.equal(e.durationSource, 'default'); assert.ok(e.unknownFacts.includes('duration_default_estimate')); } },
  { id: 'I', tier: 1, title: 'Explicit user duration', build: () => { const c = ctxFor('I'); return { state: homeTask(household({ ctx: c }), c, 'Explicit', { durationMinutes: 15, durationSource: 'user' }), nowMs: NOW }; },
    expect: (ev) => { const e = one(ev); assert.equal(e.durationSource, 'user'); assert.deepEqual(e.unknownFacts.filter((f) => f.startsWith('duration')), []); } },

  { id: 'O', tier: 1, title: 'Renaming the Home label leaves the association (evidence identical)', build: () => { const c = ctxFor('O'); return { state: renameCategory(homeTask(household({ ctx: c }), c, 'Bleed the radiators'), HOME, 'House stuff'), nowMs: NOW }; },
    expect: (ev, view) => { assert.equal(view.label, 'House stuff'); assert.equal(one(ev).homeContextId, HOME); assert.equal(one(ev).homeSystemRole, 'home'); } },

  { id: 'P1', tier: 1, title: 'Home context archived: records still listed, creation withheld', build: () => { const c = ctxFor('P1'); return { state: archiveCategory(homeTask(household({ ctx: c }), c, 'Winterize the hose bib'), HOME), nowMs: NOW }; },
    expect: (ev, view) => { assert.equal(view.context.kind, 'archived'); assert.equal(view.canCreate, false); assert.equal(ev.length, 1); } },
  { id: 'P2', tier: 1, title: 'Home context missing: nothing listed, nothing creatable, not "empty"', build: () => { const s = household({ ctx: ctxFor('P2') }); return { state: { ...s, categories: s.categories.filter((c) => c.id !== HOME) }, nowMs: NOW }; },
    expect: (ev, view) => { assert.equal(view.context.kind, 'missing'); assert.deepEqual(ev, []); assert.equal(view.canCreate, false); } },

  { id: 'Q', tier: 1, title: 'Assigned, not accepted', build: () => withHandoff('Q', (s) => s),
    expect: (ev) => { const e = one(ev); assert.deepEqual([e.responsibilityState, e.coverageState, e.resolutionState], ['requested', 'asked', 'unresolved']); } },
  { id: 'Q2', tier: 1, title: 'A request past its answer time', build: () => ({ ...withHandoff('Q2', (s) => s), nowMs: NOW + 121 * 60_000 }),
    expect: (ev) => { const e = one(ev); assert.equal(e.coverageState, 'no_answer'); assert.deepEqual(e.attentionFacts, ['unacknowledged_delegation/now']); } },
  { id: 'R', tier: 1, title: 'Accepted, still needs her: not covered', build: () => withHandoff('R', (s, c, rid) => accept(s, c, rid, true)),
    expect: (ev) => { const e = one(ev); assert.deepEqual([e.responsibilityState, e.coverageState], ['accepted', 'accepted_needs_you']); } },
  { id: 'S', tier: 1, title: 'Covered only where the shared semantics prove it', build: () => withHandoff('S', (s, c, rid) => accept(s, c, rid, false)),
    expect: (ev) => { const e = one(ev); assert.deepEqual([e.coverageState, e.resolutionState], ['covered', 'unresolved']); } },
  { id: 'T', tier: 1, title: 'Home task that requires her (nobody holds it)', build: () => { const c = ctxFor('T'); return { state: homeTask(household({ ctx: c }), c, 'Call the roofer'), nowMs: NOW }; },
    expect: (ev) => { const e = one(ev); assert.deepEqual([e.responsibilityState, e.coverageState], ['none', 'not_delegated']); } },
  { id: 'U', tier: 1, title: 'Another person owns it and it remains unresolved', build: () => withHandoff('U', (s, c, rid) => accept(s, c, rid, false)),
    expect: (ev, view) => { assert.equal(one(ev).resolutionState, 'unresolved'); assert.equal(view.sections.find((s) => s.key === 'waiting').itemIds.length, 1); } },
  { id: 'Q3', tier: 1, title: 'Seen but not accepted; declined is hers again', build: () => withHandoff('Q3', (s, c, rid) => acknowledge(s, c, rid)),
    expect: (ev) => assert.equal(one(ev).coverageState, 'seen') },

  { id: 'V', tier: 1, title: 'Completed prerequisite is satisfied', build: () => withPrereq('V', (s, c, pre) => completeTask(s, c, pre)),
    expect: (ev, view, state) => assert.equal(by(ev, 'Main work', state).dependencyStanding, 'ready') },
  { id: 'W', tier: 1, title: 'Removed prerequisite is unavailable, not completed', build: () => withPrereq('W', (s, c, pre) => archiveTask(s, c, pre)),
    expect: (ev, view, state) => assert.equal(by(ev, 'Main work', state).dependencyStanding, 'needsReview') },
  { id: 'X', tier: 1, title: 'Missing prerequisite is not satisfied', build: () => withPrereq('X', (s, c, pre) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== pre) })),
    expect: (ev, view, state) => assert.equal(by(ev, 'Main work', state).dependencyStanding, 'needsReview') },
  { id: 'V2', tier: 1, title: 'Pending prerequisite blocks', build: () => withPrereq('V2', (s) => s),
    expect: (ev, view, state) => assert.equal(by(ev, 'Main work', state).dependencyStanding, 'blocked') },

  { id: 'Y', tier: 1, title: 'Recurring Home work through the shared recurrence rule', build: () => { const c = ctxFor('Y'); let s = homeTask(household({ ctx: c }), c, 'Change the furnace filter'); s = repeating(s, c, lastTask(s).id, { frequency: 'monthly', interval: 3, anchorDate: '2026-06-12' }); return { state: s, nowMs: NOW }; },
    expect: (ev, view) => { const e = one(ev); assert.equal(e.recurrenceState, 'active'); assert.equal(e.nextExpected, '2026-09-12' > TODAY ? '2026-09-12' : '2026-12-12'); assert.ok(view.sections.find((s) => s.key === 'repeats').itemIds.length === 1); } },
  { id: 'Z', tier: 1, title: 'A recurrence definition never becomes a completion', build: () => { const c = ctxFor('Z'); let s = homeTask(household({ ctx: c }), c, 'Test the smoke detectors'); s = repeating(s, c, lastTask(s).id); return { state: s, nowMs: NOW }; },
    expect: (ev, view, state) => { const e = one(ev); assert.deepEqual([e.lastDone, e.lastDoneEvidenceType], [null, null]); assert.ok(e.unknownFacts.includes('no_completion_recorded')); assert.equal(state.observations.length, 0); } },
  { id: 'AA', tier: 1, title: 'Legitimate completion history gives Last Done', build: () => { const c = ctxFor('AA'); let s = homeTask(household({ ctx: c }), c, 'Change the furnace filter'); s = repeating(s, c, lastTask(s).id); s = completeTask(s, makeCtx(atLocal('2026-09-10', 9), '2026-09-10', 'aa-k-'), lastTask(s).id); return { state: s, nowMs: NOW }; },
    expect: (ev) => { const e = one(ev); assert.deepEqual([e.lastDone, e.lastDoneEvidenceType, e.resolutionState], ['2026-09-10', 'completion_observation', 'marked_done']); } },
  { id: 'AB', tier: 1, title: 'No completion history: "No completion recorded", not "Never"', build: () => { const c = ctxFor('AB'); let s = homeTask(household({ ctx: c }), c, 'Flush the water heater'); s = repeating(s, c, lastTask(s).id); return { state: s, nowMs: NOW }; },
    expect: (ev) => { const e = one(ev); assert.equal(e.lastDone, null); assert.equal(e.lastDoneApplicable, true); assert.ok(e.unknownFacts.includes('no_completion_recorded')); } },
  { id: 'BD', tier: 2, title: 'An edit after completion never moves Last Done', build: () => { const c = ctxFor('BD'); let s = homeTask(household({ ctx: c }), c, 'Change the furnace filter'); const id = lastTask(s).id; s = repeating(s, c, id); s = completeTask(s, makeCtx(atLocal('2026-09-10', 9), '2026-09-10', 'bd-k-'), id); s = updateTask(s, makeCtx(atLocal('2026-09-20', 8), '2026-09-20', 'bd-e-'), id, { notes: 'edited later' }); return { state: s, nowMs: NOW }; },
    expect: (ev) => assert.equal(one(ev).lastDone, '2026-09-10') },

  { id: 'AC', tier: 1, title: 'Service appointment scheduled, work still unresolved', build: () => { const c = ctxFor('AC'); let s = homeTask(household({ ctx: c }), c, 'Fix the leaking tap'); s = homeVisit(s, c, 'Plumber', { date: '2026-09-23' }); return { state: s, nowMs: NOW }; },
    expect: (ev, view, state) => { assert.equal(by(ev, 'Plumber', state).resolutionState, 'scheduled'); assert.equal(by(ev, 'Fix the leaking tap', state).resolutionState, 'unresolved'); } },
  { id: 'AC2', tier: 1, title: 'A past visit: outcome unknown, never completed', build: () => { const c = ctxFor('AC2'); return { state: homeVisit(household({ ctx: c }), c, 'Electrician', { date: '2026-09-19' }), nowMs: NOW }; },
    expect: (ev) => { const e = one(ev); assert.deepEqual([e.resolutionState, e.scheduledState, e.lastDone], ['past_visit', 'past_visit', null]); assert.ok(e.unknownFacts.includes('visit_outcome_unknown')); } },
  { id: 'AD', tier: 1, title: 'Task completion does not create a fixed/safe claim', build: () => { const c = ctxFor('AD'); let s = homeTask(household({ ctx: c }), c, 'Replace the smoke detector battery'); s = completeTask(s, c, lastTask(s).id); return { state: s, nowMs: NOW }; },
    expect: (ev) => { const e = one(ev); assert.equal(e.resolutionState, 'marked_done'); assert.ok(e.unknownFacts.includes('condition_not_verified')); assert.deepEqual(e.availableActions, ['due_again', 'edit']); } },
  { id: 'AF', tier: 1, title: 'An unrelated household record does not enter Home', build: () => { const c = ctxFor('AF'); let s = homeTask(household({ ctx: c }), c, 'A Home task'); s = addTask(s, c, { title: 'Fix the house at home', categoryId: 'cat-kids', scope: 'household' }); s = addCategory(s, c, { name: 'Home', scope: 'household' }); s = addTask(s, c, { title: 'In the impostor Home category', categoryId: s.categories.find((x) => x.name === 'Home' && x.systemRole === null).id, scope: 'household' }); return { state: s, nowMs: NOW }; },
    expect: (ev) => { assert.equal(ev.length, 1); assert.equal(ev[0].homeSystemRole, 'home'); } },
  { id: 'AG', tier: 1, title: 'One canonical item, several sections, one truth', build: () => { const c = ctxFor('AG'); let s = homeTask(household({ ctx: c }), c, 'Clean the dryer vent', { dueDate: '2026-09-25' }); s = repeating(s, c, lastTask(s).id, { frequency: 'weekly', interval: 2, anchorDate: '2026-09-25' }); return { state: s, nowMs: NOW }; },
    expect: (ev, view) => { assert.equal(ev.length, 1); assert.ok(view.sections.find((s) => s.key === 'comingUp').itemIds.includes(ev[0].homeItemId)); assert.ok(view.sections.find((s) => s.key === 'repeats').itemIds.includes(ev[0].homeItemId)); } },
  { id: 'AH', tier: 1, title: 'Everything closed: "nothing open", never "nothing needs attention"', build: () => { const c = ctxFor('AH'); let s = homeTask(household({ ctx: c }), c, 'Old thing'); s = archiveTask(s, c, lastTask(s).id); return { state: s, nowMs: NOW }; },
    expect: (ev, view) => { assert.deepEqual(ev, []); assert.equal(view.coverage.recordsConsidered, 1); } },
  { id: 'Q4', tier: 1, title: 'Declined and taken back are hers again', build: () => withHandoff('Q4', (s, c, rid) => decline(s, c, rid)),
    expect: (ev) => { const e = one(ev); assert.equal(e.coverageState, 'declined'); assert.equal(e.resolutionState, 'unresolved'); } },
];

void ANA;
