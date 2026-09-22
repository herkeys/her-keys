/**
 * The scenario corpus: one named, real household + instant for every situation the Today feature must handle.
 * The guarantee suites (tone, privacy, purity, accessibility, performance) run over ALL of it, so a rule such as
 * "no exclamation marks" or "no first-glance detail beyond titles" is proved over the whole range of days rather than
 * over one favourite fixture. Households are built through the domain's own operations.
 */
import { addEvent } from '../../src/domain/events.ts';
import { captureNeedsMeItem } from '../../src/domain/needsMe.ts';
import { completeOneMove } from '../../src/domain/oneMove.ts';
import { accept, acknowledge, addPerson, decline, delegate, returnToSelf } from '../../src/domain/responsibility.ts';
import { setCapacity, addDependency } from '../../src/domain/structure.ts';
import { demoState, onboardedState } from '../support/fixtures.mjs';
import { richHousehold } from '../support/richHousehold.mjs';
import { DAY, NEXT_DAY, at, dense, ev, eventNamed, facet, household, mkCtx, nyMs, taskNamed, tk, valid, withAction, withMove } from './fixtures.mjs';

const ordinary = () => {
  let s = household();
  s = ev(s, { title: 'School drop-off', from: [8, 15], to: [8, 45] });
  s = ev(s, { title: 'Work meeting', from: [11], to: [12], category: 'cat-work' });
  s = ev(s, { title: 'Pickup', from: [15, 15], to: [15, 45] });
  s = tk(s, { title: 'Return library books', minutes: 15 });
  s = tk(s, { title: 'Order new sneakers', minutes: 20 });
  return withMove(valid(s));
};

const overloaded = () => {
  let s = household();
  s = ev(s, { title: 'Work call', from: [15], to: [16, 30], category: 'cat-work' });
  s = ev(s, { title: 'Soccer practice', from: [17], to: [18, 30] });
  s = tk(s, { title: 'Prep dinner', minutes: 20, plan: { kind: 'timed', startsAt: at(16, 30) }, category: 'cat-meals' });
  s = tk(s, { title: 'Pay school lunch account', minutes: 30, due: '2026-09-14', plan: { kind: 'unplanned' }, category: 'cat-money' });
  return withMove(valid(s));
};

/** Pickup handed to Grandma June, plus a fixed appointment across it. `step` moves the handoff along. */
const delegated = (step) => {
  let s = household();
  s = ev(s, { title: 'School pickup', from: [15, 30], to: [16] });
  s = ev(s, { title: 'Dentist', from: [15, 45], to: [16, 45], category: 'cat-wellbeing' });
  s = addPerson(s, mkCtx(nyMs(9)), { displayName: 'Grandma June', relationship: 'grandparent' });
  s = delegate(s, mkCtx(nyMs(12)), { about: { kind: 'event', id: eventNamed(s, 'School pickup').id }, to: { kind: 'person', id: s.people[0].id }, ackWithinMinutes: 30 });
  const id = s.responsibilities[0].id;
  if (step === 'acknowledged') s = acknowledge(s, mkCtx(nyMs(13)), id);
  if (step === 'accepted') s = accept(acknowledge(s, mkCtx(nyMs(13)), id), mkCtx(nyMs(13, 30)), id);
  if (step === 'declined') s = decline(s, mkCtx(nyMs(13)), id);
  if (step === 'returned') s = returnToSelf(s, mkCtx(nyMs(13)), id);
  return valid(s);
};

const inferred = (confidence) => ({ producer: 'ai-inference', artifactId: null, confidence });

const action = (opts) => {
  const s = tk(household(), { title: 'Sign the permission form', minutes: 10, due: DAY, plan: { kind: 'unplanned' } });
  return withAction(s, { about: { kind: 'task', id: taskNamed(s, 'Sign the permission form').id }, ...opts });
};

const canWait = () => {
  let s = household();
  s = tk(s, { title: 'Tidy the entryway', minutes: 5 });
  s = tk(s, { title: 'Water the plants', minutes: 20 });
  s = tk(s, { title: 'Book the plumber', minutes: 25 });
  s = facet(s, 'Book the plumber', { consequence: 'high' });
  s = tk(s, { title: 'Print the permit', minutes: 15 });
  s = ev(s, { title: 'City hall appointment', from: [9], to: [10], day: 17 });
  ({ state: s } = addDependency(s, mkCtx(), { relation: 'requires', from: { kind: 'event', id: eventNamed(s, 'City hall appointment').id }, to: { kind: 'task', id: taskNamed(s, 'Print the permit').id } }));
  return withMove(valid(s));
};

const upcomingDependency = () => {
  let s = ev(household(), { title: 'Field trip', from: [9], to: [12], day: 17 });
  s = tk(s, { title: 'Sign the permission form', minutes: 5, plan: { kind: 'unplanned' } });
  ({ state: s } = addDependency(s, mkCtx(), { relation: 'requires', from: { kind: 'event', id: eventNamed(s, 'Field trip').id }, to: { kind: 'task', id: taskNamed(s, 'Sign the permission form').id } }));
  return valid(s);
};

const upcomingTiming = () => {
  let s = ev(household(), { title: 'Dentist', from: [9], to: [10], day: 17 });
  return valid(ev(s, { title: 'Team sync', from: [9, 30], to: [10, 30], category: 'cat-work', day: 17 }));
};

const withCapacityOverride = () => {
  let s = household();
  s = ev(s, { title: 'Work call', from: [9], to: [10], category: 'cat-work' });
  s = ev(s, { title: 'Pickup', from: [15], to: [15, 30] });
  return valid(setCapacity(s, mkCtx(), { dayEndMinutes: 20 * 60 }));
};

const onYourMind = () => {
  let s = captureNeedsMeItem(household(), mkCtx(), { title: 'Renew passport' });
  s = captureNeedsMeItem(s, mkCtx(), { title: 'Call the dentist back' });
  return withMove(valid(s));
};

/** Every situation, as { name, state, nowMs }. */
export function corpus() {
  const list = [
    { name: 'A ordinary 08:00', state: ordinary(), nowMs: nyMs(8) },
    { name: 'A ordinary 15:00', state: ordinary(), nowMs: nyMs(15) },
    { name: 'A ordinary 21:00', state: ordinary(), nowMs: nyMs(21) },
    { name: 'B overloaded 14:00', state: overloaded(), nowMs: nyMs(14) },
    { name: 'B overloaded 20:00', state: overloaded(), nowMs: nyMs(20) },
    { name: 'C unanswered', state: delegated('requested'), nowMs: nyMs(14) },
    { name: 'C acknowledged', state: delegated('acknowledged'), nowMs: nyMs(14) },
    { name: 'C accepted', state: delegated('accepted'), nowMs: nyMs(14) },
    { name: 'C declined', state: delegated('declined'), nowMs: nyMs(14) },
    { name: 'C returned', state: delegated('returned'), nowMs: nyMs(14) },
    { name: 'D nearly empty', state: withMove(valid(tk(household(), { title: 'Renew library card' }))), nowMs: nyMs(9) },
    {
      name: 'E possible inference',
      state: withMove(valid(tk(household(), { title: 'Send RSVP', minutes: 10, due: DAY, plan: { kind: 'unplanned' }, provenance: inferred('possible') }))),
      nowMs: nyMs(9),
    },
    {
      name: 'E likely external event',
      state: valid(ev(household(), { title: 'Dentist', from: [10], to: [11], provenance: { producer: 'import-sync', artifactId: null, confidence: 'likely' } })),
      nowMs: nyMs(8),
    },
    { name: 'F critical One Move', state: withMove(valid(facet(tk(household(), { title: 'File the claim', minutes: 30, due: DAY, plan: { kind: 'unplanned' } }), 'File the claim', { consequence: 'critical' }))), nowMs: nyMs(9) },
    { name: 'F needs-me One Move', state: withMove(valid(captureNeedsMeItem(household(), mkCtx(), { title: 'Renew passport' }))), nowMs: nyMs(9) },
    { name: 'F completed One Move', state: completeOneMove(withMove(valid(tk(tk(household(), { title: 'A', minutes: 10 }), { title: 'B', minutes: 20 }))), mkCtx(nyMs(9))), nowMs: nyMs(9, 5) },
    { name: 'G handled (foundation fixture)', state: richHousehold({ withServerRows: true }).state, nowMs: nyMs(11) },
    { name: 'G unconfirmed', state: action({ execution: { attemptedAt: at(9, 5), result: 'succeeded' } }), nowMs: nyMs(11) },
    { name: 'G approved, not run', state: action({}), nowMs: nyMs(11) },
    { name: 'G failed', state: action({ execution: { attemptedAt: at(9, 5), result: 'failed' } }), nowMs: nyMs(11) },
    { name: 'G proposal', state: action({ decide: null }), nowMs: nyMs(11) },
    { name: 'G high-stakes proposal', state: action({ decide: null, category: 'outbound_message' }), nowMs: nyMs(11) },
    { name: 'H can wait', state: canWait(), nowMs: nyMs(9) },
    { name: 'I never entered', state: household(), nowMs: nyMs(9) },
    { name: 'I light', state: valid(ev(household(), { title: 'Yesterday', from: [10], to: [11], day: 15 })), nowMs: nyMs(9) },
    { name: 'I dense 06:05', state: dense(), nowMs: nyMs(6, 5) },
    { name: 'I dense 09:00', state: dense(), nowMs: nyMs(9) },
    { name: 'U dependency', state: upcomingDependency(), nowMs: nyMs(9) },
    { name: 'U tomorrow timing', state: upcomingTiming(), nowMs: nyMs(9) },
    { name: 'capacity override', state: withCapacityOverride(), nowMs: nyMs(9) },
    { name: 'on your mind', state: onYourMind(), nowMs: nyMs(9) },
    { name: 'demo', state: onboardedState(demoState(DAY)), nowMs: nyMs(9) },
  ];
  return list;
}

void NEXT_DAY;
void addEvent;
