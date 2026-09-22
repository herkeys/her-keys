/**
 * THE SCENARIO REGISTRY — "scenario prose is not coverage".
 *
 * Every scenario the Feature 07 contract requires has ONE entry here:
 *   - `fixture`   deterministic setup, built through the product's own mutations (null when the scenario is a whole-suite property);
 *   - `expect`    the hand-written semantic evidence, asserted independently of the golden file;
 *   - `tests`     the named tests that assert it, as [file, title-fragment] — `scenarioMap.test.mjs` verifies each one EXISTS;
 *   - `status`    PASS | SAFE-UNAVAILABLE | NOT-APPLICABLE | DEFERRED-IN-RUN | FAIL, with `note` for anything that is not a plain PASS.
 *
 * The full semantic output of every fixture is pinned in `golden/<id>.json` (regenerate with UPDATE_GOLDEN=1 and READ the diff).
 * Semantic outputs, never JSX snapshots, are the evidence.
 */
import { availableResponsibilityActions } from '../../../../src/features/coparent/present.ts';
import { buildCoParentLogisticsView } from '../../../../src/features/coparent/projection.ts';
import { archivePerson } from '../../../../src/domain/responsibility.ts';
import { removeHandoff, removePreparation } from '../../../../src/features/coparent/mutations.ts';
import { JOSIE, MILO, NOW, RUBY, answer, finishFollowUp, finishPrep, followUp, handoff, nyMs, prep, request, respOf, world } from '../world.mjs';

const person = (personId) => ({ kind: 'person', personId });
const viewOf = (w, nowMs = NOW, extra = {}) => buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs, ...extra });

/** The mission's semantic-output vocabulary for ONE handoff. */
export function semanticOfTransition(t) {
  return {
    transitionId: t.id,
    childId: t.child.status === 'known' ? t.child.childId : t.child.status,
    counterpartPersonId: t.responsibility.counterpart?.personId ?? null,
    counterpartLabel: t.responsibility.counterpart?.label ?? null,
    transitionState: `${t.lifecycle}/${t.timeStatus}/${t.occurrence}`,
    responsibilityState: t.responsibility.stage,
    coverageState: t.responsibility.coverage,
    preparationItems: t.preparation.items.map((i) => `${i.title}:${i.standing}`),
    dependencyStanding: t.preparation.readiness,
    recurrenceState: t.repeat ? `${t.repeat.status}/${t.repeat.frequency}/${t.repeat.interval}` : 'none',
    amount: null,
    moneyFollowUpState: null,
    sharingState: t.ownerOnly ? 'owner_only' : 'unstated',
    section: t.section,
    needsMe: t.needsMe,
    unknownFacts: t.unknowns,
    availableActions: availableResponsibilityActions(t.responsibility),
  };
}

export function semanticOfFollowUp(f) {
  return {
    taskId: f.taskId,
    childId: f.child.status === 'known' ? f.child.childId : f.child.status,
    counterpartPersonId: f.responsibility.counterpart?.personId ?? null,
    responsibilityState: f.responsibility.stage,
    coverageState: f.responsibility.coverage,
    amount: `${f.amount.decimal} ${f.amount.currency}`,
    moneyFollowUpState: f.standing,
    paymentEvidence: f.paymentEvidence,
    followUpDate: f.followUpDate,
    review: f.review,
    availableActions: availableResponsibilityActions(f.responsibility),
  };
}

const one = (w, id, nowMs = NOW, extra) => semanticOfTransition(viewOf(w, nowMs, extra).transitions.find((t) => t.id === id));
const oneFollow = (w, id) => semanticOfFollowUp(viewOf(w).moneyFollowUps.find((f) => f.taskId === id));

// ------------------------------------------------------------------------------------------------------------ fixtures
const fx = {
  A: () => { const w = world(); return { semantic: { isEmpty: viewOf(w).isEmpty, canCreate: viewOf(w).capability.canCreate, next: viewOf(w).nextTransitionId } }; },
  B: () => { const w = world(); const id = handoff(w); return { semantic: one(w, id) }; },
  C: () => {
    const w = world({ children: [JOSIE, MILO] });
    const a = handoff(w, { child: MILO, title: 'Drop off Milo', date: '2026-09-19' });
    const b = handoff(w, { child: JOSIE });
    return { semantic: viewOf(w).transitions.map((t) => [t.id, t.child.childId, t.localDate]), ids: { a, b } };
  },
  D: () => {
    const w = world({ children: [JOSIE, MILO] });
    const alex = w.person('Alex', 'co-parent'); const jordan = w.person('Jordan', 'caregiver');
    handoff(w, { child: JOSIE, counterpart: person(alex) });
    handoff(w, { child: MILO, date: '2026-09-19', title: 'Drop off Milo', counterpart: person(jordan) });
    return { semantic: viewOf(w).transitions.map((t) => [t.child.childId, t.responsibility.counterpart.label, t.responsibility.counterpart.relationshipLabel]) };
  },
  E: () => {
    const w = world({ children: [JOSIE, MILO] });
    const a1 = w.person('Alex', 'co-parent'); const a2 = w.person('Alex', 'co-parent');
    handoff(w, { child: JOSIE, counterpart: person(a1) });
    handoff(w, { child: MILO, date: '2026-09-19', title: 'Drop off Milo', counterpart: person(a2) });
    const v = viewOf(w);
    return { semantic: { labels: v.transitions.map((t) => t.responsibility.counterpart.label), distinctPeople: new Set(v.transitions.map((t) => t.responsibility.counterpart.personId)).size } };
  },
  F: () => { const w = world(); const id = handoff(w, { date: '2026-09-18', startTime: '17:00', endTime: '17:30' }); const t = viewOf(w).transitions[0]; return { semantic: { id, localDate: t.localDate, minutesOfDay: t.minutesOfDay, startsAt: w.state.events[0].startsAt } }; },
  G: () => { const w = world(); const id = handoff(w, { location: '' }); const t = viewOf(w).transitions[0]; return { semantic: { id, hasLocation: t.hasLocation, unknown: t.unknowns.includes('location_not_recorded'), stored: w.state.events[0].location } }; },
  N: () => { const w = world(); const alex = w.person('Alex'); const id = handoff(w, { counterpart: person(alex) }); return { semantic: one(w, id) }; },
  O: () => { const w = world(); const alex = w.person('Alex'); const id = handoff(w, { counterpart: person(alex) }); answer(w, w.state.responsibilities[0].id, 'accepted_needs_me'); return { semantic: one(w, id) }; },
  P: () => { const w = world(); const alex = w.person('Alex'); const id = handoff(w, { counterpart: person(alex) }); answer(w, w.state.responsibilities[0].id, 'accepted_covered'); return { semantic: one(w, id) }; },
  Q: () => { const w = world(); const id = handoff(w, { needsMe: true }); return { semantic: one(w, id) }; },
  R: () => { const w = world(); const alex = w.person('Alex'); const id = handoff(w, { needsMe: true, counterpart: person(alex) }); return { semantic: one(w, id) }; },
  S: () => { const w = world(); const id = handoff(w); prep(w, { title: 'Pack the school laptop', linkEventId: id }); prep(w, { title: 'Return library book', linkEventId: id }); return { semantic: one(w, id) }; },
  T: () => { const w = world(); const id = handoff(w); const p = prep(w, { title: 'Pack the school laptop', linkEventId: id }); finishPrep(w, p); return { semantic: one(w, id) }; },
  U: () => { const w = world(); const id = handoff(w); const a = prep(w, { title: 'Pack the school laptop', linkEventId: id }); const b = prep(w, { title: 'Bring the uniform', linkEventId: id }); finishPrep(w, a); w.run((s, c) => removePreparation(s, c, b)); return { semantic: one(w, id) }; },
  V: () => { const w = world(); const id = handoff(w, { repeat: 'every_2_weeks' }); return { semantic: { now: one(w, id), afterFirst: one(w, id, nyMs(20, 0, 19)) } }; },
  X: () => { const w = world(); const id = handoff(w); const alex = w.person('Alex'); request(w, { kind: 'event', id }, alex); return { semantic: one(w, id) }; },
  Y: () => { const w = world(); const alex = w.person('Alex'); const id = handoff(w, { counterpart: person(alex) }); answer(w, w.state.responsibilities[0].id, 'completed'); return { semantic: one(w, id) }; },
  Z: () => { const w = world(); const alex = w.person('Alex'); const id = handoff(w, { counterpart: person(alex) }); answer(w, w.state.responsibilities[0].id, 'accepted_covered'); w.apply((s, c) => archivePerson(s, c, alex)); return { semantic: one(w, id), responsibilitiesUntouched: w.state.responsibilities.length === 1 && w.state.responsibilities[0].responsibleKind === 'person' }; },
  AB: () => { const w = world(); const alex = w.person('Alex'); const id = followUp(w, { counterpart: person(alex) }); return { semantic: oneFollow(w, id) }; },
  AC: () => { const w = world(); const id = followUp(w); finishFollowUp(w, id); const v = buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: NOW }); return { semantic: { openFollowUps: v.moneyFollowUps.length, recentlyCompleted: v.recentlyCompleted.map((e) => [e.kind, e.followUp]), stored: w.state.tasks[0].status } }; },
  AD: () => { const w = world(); const id = followUp(w, { amountText: '80' }); return { semantic: { ...oneFollow(w, id), stored: w.state.tasks.find((t) => t.id === id).value } }; },
  AE: () => { const w = world(); const alex = w.person('Alex'); const id = handoff(w, { counterpart: person(alex) }); return { semantic: { personChannel: w.state.people[0].channel, sentEvidence: one(w, id) && viewOf(w).transitions[0].responsibility.evidence, intents: w.state.intents.length } }; },
  AF: () => { const w = world(); const id = handoff(w); return { semantic: { sharingState: one(w, id).sharingState, eventScope: w.state.events[0].scope } }; },
  AG: () => { const w = world(); return { semantic: { isEmpty: viewOf(w).isEmpty } }; },
  AH1: () => { const w = world(); const id = handoff(w, { title: "Drop off Josie at Dad's", needsMe: true }); return { semantic: one(w, id) }; },
  AH2: () => { const w = world(); const alex = w.person('Alex'); const id = handoff(w, { title: 'Pick up Josie from Dad', counterpart: person(alex) }); answer(w, w.state.responsibilities[0].id, 'accepted_covered'); return { semantic: one(w, id) }; },
  AH3: () => { const w = world(); const id = handoff(w, { location: 'Union Station, Chicago' }); const home = one(w, id, NOW, { deviceTimeZone: TZ_HOME }); const la = one(w, id, NOW, { deviceTimeZone: 'America/Los_Angeles' }); return { semantic: { identical: JSON.stringify(home) === JSON.stringify(la), minutesOfDay: viewOf(w).transitions[0].minutesOfDay, zoneDiffers: viewOf(w, NOW, { deviceTimeZone: 'America/Los_Angeles' }).zone.differs } }; },
  AH4: () => {
    const w = world({ children: [JOSIE, MILO] });
    const id = handoff(w, { child: JOSIE }); const p = prep(w, { child: JOSIE, linkEventId: id });
    const broken = { ...w.state, children: w.state.children.filter((c) => c.id !== JOSIE) };
    const v = buildCoParentLogisticsView(broken, broken.household.id, { nowMs: NOW });
    return { semantic: { handoff: semanticOfTransition(v.transitions[0]), prepReview: v.needsReviewTasks.find((t) => t.taskId === p)?.reasons } };
  },
  AH5: () => { const w = world(); const id = handoff(w, { location: "Dad's place, 12 Elm St" }); return { semantic: { hubHasLocationText: JSON.stringify(viewOf(w)).includes('Elm St'), hasLocationFlag: viewOf(w).transitions[0].hasLocation, id } }; },
  AH6: () => { const w = world(); const id = handoff(w); const a = prep(w, { title: 'Done', linkEventId: id }); const b = prep(w, { title: 'Removed', linkEventId: id }); finishPrep(w, a); w.run((s, c) => removePreparation(s, c, b)); return { semantic: viewOf(w).recentlyCompleted.map((e) => e.title) }; },
  AQ: () => { const w = world(); const id = handoff(w); w.run((s, c) => removeHandoff(s, c, id)); return { semantic: { upcoming: viewOf(w).transitions.length, storedStatus: w.state.events[0].status } }; },
};
const TZ_HOME = 'America/New_York';

// ---------------------------------------------------------------------------------------------- the registry
const T = 'tests/coparent/';
const core = `${T}core.test.mjs`, ident = `${T}identity.test.mjs`, resp = `${T}responsibility.test.mjs`, prepT = `${T}preparation.test.mjs`, sched = `${T}schedule.test.mjs`;
const money = `${T}money.test.mjs`, share = `${T}sharing.test.mjs`, state = `${T}state.test.mjs`, edit = `${T}editing.test.mjs`, sync = `${T}syncComposition.test.mjs`;
const copy = `${T}copyTruth.test.mjs`, dir = `${T}direction.test.mjs`;
const REAL_DB = ['supabase/tests/run-coparent.mjs', 'real PostgreSQL journey'];

const S = (id, tier, title, status, tests, extra = {}) => ({ id, tier, title, status, tests, ...extra });

export const SCENARIOS = [
  // ---------------------------------------------------------------- TIER 1
  S('A', 1, 'No co-parent logistics records', 'PASS', [[core, 'A: no records'], [state, 'A/AG']], { fixture: fx.A, expect: { isEmpty: true, canCreate: true, next: null } }),
  S('B', 1, 'One child / one upcoming handoff', 'PASS', [[core, 'B/F/G']], { fixture: fx.B, expect: { childId: 'child-josie', responsibilityState: 'none_recorded', coverageState: 'unknown', dependencyStanding: 'no_prep_recorded', sharingState: 'owner_only' } }),
  S('C', 1, 'Multiple children', 'PASS', [[core, 'C: multiple children']], { fixture: fx.C }),
  S('D', 1, 'Different children, different counterpart adults', 'PASS', [[ident, 'D: different children keep different counterpart adults']], { fixture: fx.D, expect: [['child-josie', 'Alex', 'Co-parent'], ['child-milo', 'Jordan', 'Caregiver']] }),
  S('E', 1, 'Two counterpart adults with the same display name', 'PASS', [[ident, 'E: two people with the SAME display name']], { fixture: fx.E, expect: { distinctPeople: 2 } }),
  S('F', 1, 'Handoff with known date/time', 'PASS', [[core, 'B/F/G'], [sched, 'AJ: an evening handoff']], { fixture: fx.F, expect: { localDate: '2026-09-18', minutesOfDay: 1020, startsAt: '2026-09-18T21:00:00.000Z' } }),
  S('G', 1, 'Handoff with unknown location', 'PASS', [[core, 'B/F/G']], { fixture: fx.G, expect: { hasLocation: false, unknown: true, stored: null } }),
  S('H', 1, 'Create handoff', 'PASS', [[edit, 'H: creating with a NEW counterpart'], [edit, 'create is ALL-OR-NOTHING'], [core, 'B/F/G']]),
  S('I', 1, 'Edit handoff', 'PASS', [[edit, 'I: an edit keeps scope'], [core, 'I: editing keeps child identity']]),
  S('J', 1, 'Restart after create/edit', 'PASS', [[edit, 'J: create + edit are durable']]),
  S('K', 1, 'Offline create → reconnect', 'PASS', [[sync, 'K: create + edit OFFLINE']]),
  S('L', 1, 'Second device receives correct child identity', 'PASS', [[sync, 'a representative journey'], REAL_DB]),
  S('M', 1, 'Second device receives correct counterpart identity', 'PASS', [[sync, 'a representative journey'], REAL_DB]),
  S('N', 1, 'Assigned responsibility, unaccepted', 'PASS', [[resp, 'N: a recorded request']], { fixture: fx.N, expect: { responsibilityState: 'requested', coverageState: 'not_covered', section: 'waiting' } }),
  S('O', 1, 'Accepted responsibility not automatically covered', 'PASS', [[resp, 'O: accepted is not covered']], { fixture: fx.O, expect: { responsibilityState: 'accepted', coverageState: 'not_covered', section: 'needs_me' } }),
  S('P', 1, 'Covered only when common semantics support it', 'PASS', [[resp, 'P: covered only']], { fixture: fx.P, expect: { responsibilityState: 'accepted', coverageState: 'covered', section: 'none' } }),
  S('Q', 1, 'User is responsible', 'PASS', [[resp, 'Q: "you are responsible"']], { fixture: fx.Q, expect: { responsibilityState: 'none_recorded', coverageState: 'unknown', needsMe: true, section: 'needs_me' } }),
  S('R', 1, 'Other adult assigned but item remains unresolved', 'PASS', [[resp, 'R: another adult']], { fixture: fx.R, expect: { section: 'waiting', coverageState: 'not_covered', needsMe: true } }),
  S('S', 1, 'Preparation/packing task', 'PASS', [[prepT, 'S: preparation is an ordinary canonical task']], { fixture: fx.S, expect: { dependencyStanding: 'waiting_on_prep' } }),
  S('T', 1, 'Completed packing task does not claim other household received', 'PASS', [[prepT, 'T: a completed preparation task']], { fixture: fx.T, expect: { preparationItems: ['Pack the school laptop:done'], dependencyStanding: 'all_marked_done' } }),
  S('U', 1, 'Removed preparation prerequisite is unavailable, not completed', 'PASS', [[prepT, 'U: a REMOVED prerequisite']], { fixture: fx.U, expect: { dependencyStanding: 'needs_review', section: 'needs_review' } }),
  S('V', 1, 'Recurring transition using existing recurrence', 'PASS', [[sched, 'V: weekly'], [sched, 'every 2 weeks keeps its phase']], { fixture: fx.V }),
  S('W', 1, 'Recurring transition not described as a legal custody schedule', 'PASS', [[sched, 'W: the wording never calls'], [copy, 'no COPY string carries an unsupported claim']]),
  S('X', 1, 'User-recorded planned handoff not described as agreed', 'PASS', [[resp, 'N: a recorded request'], [copy, 'zero unsupported claims in anything']], { fixture: fx.X, expect: { responsibilityState: 'requested' } }),
  S('Y', 1, 'Recorded-complete not described as legal compliance', 'PASS', [[resp, 'a recorded-complete responsibility']], { fixture: fx.Y, expect: { responsibilityState: 'completed', coverageState: 'completed', availableActions: [] }, note: 'A HANDOFF cannot be recorded complete (no event outcome exists — MP-07-02 / OC-1, capability stopped); the responsibility completion is what is recorded, and it is worded "You recorded …".' }),
  S('Z', 1, 'Counterpart later archived / removed', 'PASS', [[resp, 'Z/AA: an accepted, covered counterpart'], [ident, 'AP: a responsibility naming a person']], { fixture: fx.Z, expect: { coverageState: 'needs_review', section: 'needs_review', needsMe: true, availableActions: ['reassign', 'returned'] } }),
  S('AA', 1, 'No automatic reassignment after counterpart invalidation', 'PASS', [[resp, 'Z/AA: an accepted, covered counterpart'], [ident, 'archiving a person changes nothing']], { fixture: fx.Z, expect: { coverageState: 'needs_review' } }),
  S('AB', 1, 'Child-related amount / follow-up task', 'PASS', [[money, 'AB: a child-related follow-up']], { fixture: fx.AB, expect: { amount: '80.00 USD', moneyFollowUpState: 'open', paymentEvidence: 'none', followUpDate: '2026-09-25' } }),
  S('AC', 1, 'Follow-up task completion does not become payment received', 'PASS', [[money, 'AC: completing the follow-up']], { fixture: fx.AC, expect: { openFollowUps: 0, stored: 'completed' } }),
  S('AD', 1, 'Amount entered does not become agreed debt', 'PASS', [[money, 'AD: an amount she entered']], { fixture: fx.AD, expect: { amount: '80.00 USD', paymentEvidence: 'none' } }),
  S('AE', 1, 'Feature remains useful without the other adult\'s account', 'PASS', [[share, 'the counterpart needs no account']], { fixture: fx.AE, expect: { personChannel: 'unspecified', intents: 0 } }),
  S('AF', 1, 'No data-sharing claim without actual access evidence', 'PASS', [[share, 'CP1 capability fact'], [share, 'no presentation, for any state']], { fixture: fx.AF, expect: { sharingState: 'owner_only', eventScope: 'coparent-shared' } }),
  S('AG', 1, 'Empty state does not imply relationship/logistics are problem-free', 'PASS', [[state, 'A/AG']], { fixture: fx.AG, expect: { isEmpty: true } }),
  // ---- addendum Tier 1
  S('AH1', 1, 'User is sending / dropping off', 'PASS', [[dir, 'AH1: the user-sending handoff']], { fixture: fx.AH1, expect: { responsibilityState: 'none_recorded', needsMe: true, section: 'needs_me' } }),
  S('AH2', 1, 'User is receiving / picking up', 'PASS', [[dir, 'AH2: the user-receiving handoff']], { fixture: fx.AH2, expect: { coverageState: 'covered' } }),
  S('AH3', 1, 'Cross-timezone canonical-time stability', 'PASS', [[sched, 'AH3: created in one zone']], { fixture: fx.AH3, expect: { identical: true, minutesOfDay: 1020, zoneDiffers: true } }),
  S('AH4', 1, 'Child later archived / invalidated', 'PASS', [[ident, 'AO/K: a handoff whose child is not in the household']], { fixture: fx.AH4, note: 'The foundation has no child lifecycle (MP-07-04), so an "archived" child cannot be stored; the projection is proven on hand-built (unvalidated) state where the child is no longer in the household: NEEDS REVIEW, never re-attached, never matched by name.' }),
  S('AH5', 1, 'Exact handoff location is not exposed on broad hub surfaces', 'PASS', [[core, 'the hub view never carries the location text'], [copy, 'the exact location is never on the hub']], { fixture: fx.AH5, expect: { hubHasLocationText: false, hasLocationFlag: true } }),
  S('AH6', 1, 'Recently Completed requires actual completion evidence', 'PASS', [[prepT, 'AH6: recently completed requires']], { fixture: fx.AH6, expect: ['Done'] }),
  S('AH7', 1, 'No canonical amount facet → truthful follow-up without amount', 'NOT-APPLICABLE', [[money, 'AB: a child-related follow-up']], { note: 'NOT-APPLICABLE — FOUNDATION CAPABILITY PRESENT: the `value` money facet exists on tasks and events (foundation/money.ts, commitment.ts), so AB / AC / AD apply as written. No amountless variant is manufactured.' }),
  // ---------------------------------------------------------------- TIER 2
  S('AH', 2, 'Dense fixture with 3–5 children', 'PASS', [[state, 'AH: a dense household']]),
  S('AI', 2, '100+ logistics-related records', 'PASS', [[state, 'AI: 100+ logistics records']]),
  S('AJ', 2, 'Midnight / logical-day rollover', 'PASS', [[sched, 'AJ: logical-day rollover']]),
  S('AK', 2, 'Spring-forward', 'PASS', [[sched, 'AK: spring-forward'], [sched, 'AK: a weekly 9:00 AM pattern']]),
  S('AL', 2, 'Fall-back / repeated hour', 'PASS', [[sched, 'AL: fall-back']]),
  S('AM', 2, 'Account A → sign out → Account B', 'PASS', [[state, 'AM: Account A'], REAL_DB]),
  S('AN', 2, 'Demo / account isolation', 'PASS', [[state, 'AN: the demo household']]),
  S('AO', 2, 'Malformed child reference', 'PASS', [[ident, 'AO: the adult account user is not a child'], [ident, 'a handoff filed with no child']]),
  S('AP', 2, 'Malformed counterpart reference', 'PASS', [[ident, 'AP: a responsibility naming a person']]),
  S('AQ', 2, 'Stale handoff editor', 'PASS', [[edit, 'AQ: a stale editor is refused']], { fixture: fx.AQ, expect: { upcoming: 0, storedStatus: 'removed' } }),
  S('AR', 2, 'Double-save', 'PASS', [[edit, 'AR: a double-tap on Save'], [edit, 'a single concurrent double-submit']]),
  S('AS', 2, 'Sync retry', 'PASS', [[sync, 'AS: a lost acknowledgement']]),
  S('AT', 2, 'Permanent server refusal', 'PASS', [[sync, 'AT: a permanent server refusal']]),
  S('AU', 2, 'Large household above historical queue / pull thresholds', 'PASS', [[sync, 'AU: a household above the queue']]),
  S('AV', 2, 'Local-only state excluded from cloud', 'PASS', [[state, 'AV: using the feature writes only synced'], [sync, 'only synced canonical kinds are written']]),
  S('AW', 2, 'Stable deterministic ordering', 'PASS', [[state, 'AW: order is deterministic']]),
  S('AX', 2, 'Screen-reader responsibility state', 'PASS', [[copy, 'every screen-reader label states']]),
  S('AY', 2, 'Screen-reader unknown state', 'PASS', [[copy, 'every screen-reader label states']]),
  S('AZ', 2, 'Loading ≠ empty', 'PASS', [[state, 'AZ: LOADING is not EMPTY']]),
  S('BA', 2, 'Quarantined / unrecovered ≠ empty', 'PASS', [[state, 'BA: an unrecovered household']]),
  S('BB', 2, 'Common factual attention semantics do not contradict Calendar', 'PASS', [[prepT, 'property: for every combination'], [resp, 'answer overdue is the shared clock-derived fact']], { note: 'Feature 07 derives every timing/readiness fact from the shared primitives (isUnacknowledged, standingOf, readinessOf) and does not import attentionFor (MP-07-13). The shared Calendar itself is F03 and is integrated later (HK-INT-COPARENT-CALENDAR-01).' }),
  S('BC', 2, 'Same transition projected in several sections remains one canonical truth', 'PASS', [[state, 'BC: the same handoff']]),
  S('BD', 2, 'Scope label does not create sharing behavior', 'PASS', [[share, 'every row Feature 07 creates'], [share, 'the view says only']]),
  S('BE', 2, 'No sibling Wave 2 imports', 'PASS', [[copy, 'BE: no sibling-feature import']]),
  S('BF', 2, 'Raw Talk It Out source excluded', 'PASS', [[`${T}privacy.test.mjs`, 'BF:']]),
  S('BG', 2, 'Privacy / secret scan', 'PASS', [[`${T}privacy.test.mjs`, 'BG:']]),
  S('BH', 2, 'RLS attacks where materially applicable', 'PASS', [REAL_DB], { note: 'Materially applicable: Feature 07 files its rows as owner-only `coparent-shared`. Attacked against the real rows by owner / same-household member / stranger / anon (34 checks in run-coparent.mjs); no new backend representation exists, so the inherited certified common posture is otherwise unchanged.' }),
  // ---------------------------------------------------------------- TIER 3 (conditional — never manufactured)
  S('BI', 3, 'Existing canonical request / execution lifecycle', 'PASS', [[resp, 'request evidence']], { note: 'READ-ONLY: the intent → execution → outcome model exists; no provider exists, so Feature 07 only renders "sent"/"delivered" from rows that exist (tested with pulled fixture rows). It creates none.' }),
  S('BJ', 3, 'Existing explicit acceptance lifecycle', 'PASS', [[resp, 'O: accepted is not covered']]),
  S('BK', 3, 'Existing explicit reimbursement-payment outcome', 'PASS', [[money, 'payment is shown ONLY from a real `paid` outcome']], { note: 'READ-ONLY: a `paid` outcome under a succeeded `financial_action` execution about the task is the only payment evidence shown; none can be produced by a device on this baseline.' }),
  S('BL', 3, 'Existing canonical task → handoff relationship', 'PASS', [[prepT, 'S: preparation is an ordinary canonical task']], { note: 'EXISTS: Dependency{requires, event → task}. No new relationship was created.' }),
  S('BM', 3, 'Existing shared collaboration semantics', 'NOT-APPLICABLE', [[share, 'CP1 capability fact']], { note: '`coparent-shared` is an owner-only label (SD4-033); no collaboration semantic exists to consume.' }),
  S('BN', 3, 'Existing relationship-role semantic', 'PASS', [[ident, 'a person recorded as something other than co-parent']], { note: 'EXISTS: HouseholdPerson.relationship (PERSON_RELATIONSHIPS). Used only as recorded; no global child → co-parent relation was invented.' }),
  S('BO', 3, 'Existing recurring Systems relationship', 'NOT-APPLICABLE', [], { note: 'No relationship between a System and a handoff exists, and Feature 07 creates no System (HK-INT-COPARENT-SYSTEMS-01).' }),
  S('BP', 3, 'Existing document / admin relationship', 'NOT-APPLICABLE', [], { note: 'No document primitive exists on this baseline; Life Admin is a later domain (HK-INT-COPARENT-LIFEADMIN-01).' }),
];

export const REQUIRED_IDS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG',
  'AH1', 'AH2', 'AH3', 'AH4', 'AH5', 'AH6', 'AH7',
  'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AO', 'AP', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AV', 'AW', 'AX', 'AY', 'AZ', 'BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'BG', 'BH',
  'BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP',
];
export const VALID_STATUS = ['PASS', 'SAFE-UNAVAILABLE', 'NOT-APPLICABLE', 'DEFERRED-IN-RUN', 'FAIL'];
void RUBY; void respOf;
