/**
 * Deterministic worlds for the Co-Parent Logistics suites.
 *
 * Every world starts from a genuine real (non-demo) household — `createEmptyState` — and is built through the product's own domain
 * functions and the feature's own mutations, so a fixture is the shape the product actually writes. Children are added by object
 * spread because the foundation has no post-bind child creation (MP-07-01): that is a fixture setup, not a product path.
 *
 * Time: `NOW` is Wednesday 2026-09-16 10:00 America/New_York (EDT, UTC-4). The household zone is New York; tests that need a
 * different DEVICE zone pass it to the clock, never to the state.
 */
import { addPerson, archivePerson } from '../../../src/domain/responsibility.ts';
import { validateAppState } from '../../../src/domain/state.ts';
import { createEmptyState } from '../../../src/state/initialState.ts';
import {
  completeFollowUp,
  completePreparation,
  createHandoff,
  createMoneyFollowUp,
  createPreparation,
  recordAnswer,
  recordCounterpart,
  removeFollowUp,
  removePreparation,
} from '../../../src/features/coparent/mutations.ts';

export const TZ = 'America/New_York';
export const DAY = '2026-09-16';
export const nyMs = (hour, minute = 0, day = 16, month = 8, year = 2026) => Date.UTC(year, month, day, hour + 4, minute);
export const NOW = nyMs(10);

export const JOSIE = 'child-josie';
export const MILO = 'child-milo';
export const RUBY = 'child-ruby';

const CHILDREN = {
  [JOSIE]: { id: JOSIE, displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' },
  [MILO]: { id: MILO, displayName: 'Milo', birthDate: '2019-11-20', scope: 'child' },
  [RUBY]: { id: RUBY, displayName: 'Ruby', birthDate: '2021-07-08', scope: 'child' },
};

/** A household with the given children (by id) and nothing else. */
export function bareState({ children = [JOSIE], timeZone = TZ } = {}) {
  return { ...createEmptyState(timeZone), children: children.map((id) => CHILDREN[id]) };
}

/** A mutable world: `w.state` is always the latest valid state; `w.run(fn)` applies a mutation and insists it was accepted. */
export function world({ children = [JOSIE], timeZone = TZ, nowMs = NOW } = {}) {
  let counter = 0;
  const w = {
    state: bareState({ children, timeZone }),
    nowMs,
    at(ms = w.nowMs) {
      return { nowMs: ms, today: DAY, createId: (prefix) => `${prefix}-${++counter}` };
    },
    /** Apply a feature mutation; throw unless it was accepted, and unless the resulting state is valid product state. */
    run(fn, { expect = 'saved', ms } = {}) {
      const result = fn(w.state, w.at(ms));
      if (result.outcome !== expect) throw new Error(`expected outcome "${expect}", got "${result.outcome}"`);
      const verdict = validateAppState(result.state);
      if (!verdict.ok) throw new Error(`mutation produced invalid state: ${verdict.reason}: ${verdict.issues.join('; ')}`);
      w.state = result.state;
      return result;
    },
    /** Apply a raw domain transition (people, archiving, ...) — the kind of thing another feature or another device does. */
    apply(fn, ms) {
      const next = fn(w.state, w.at(ms));
      const verdict = validateAppState(next);
      if (!verdict.ok) throw new Error(`transition produced invalid state: ${verdict.reason}: ${verdict.issues.join('; ')}`);
      w.state = next;
      return next;
    },
    /** Add a person through the canonical path and return the id. */
    person(displayName, relationship = 'co-parent') {
      const before = new Set(w.state.people.map((p) => p.id));
      w.apply((s, ctx) => addPerson(s, ctx, { displayName, relationship }));
      return w.state.people.find((p) => !before.has(p.id)).id;
    },
  };
  return w;
}

export const HANDOFF = {
  title: 'Pickup Josie',
  date: '2026-09-18',
  startTime: '17:00',
  endTime: '17:30',
  location: '',
  notes: '',
  commitment: 'fixed',
  needsMe: null,
  repeat: 'none',
};

/** Create a handoff for a child; returns its event id. */
export function handoff(w, { child = JOSIE, counterpart = { kind: 'none' }, ...fields } = {}) {
  const result = w.run((s, ctx) => createHandoff(s, ctx, { ...HANDOFF, childId: child, ...fields }, counterpart));
  return result.id;
}

export function prep(w, { child = JOSIE, title = 'Pack the school laptop', dueDate = '', notes = '', linkEventId = null } = {}) {
  return w.run((s, ctx) => createPreparation(s, ctx, { childId: child, title, dueDate, notes, linkEventId })).id;
}

export const FOLLOW_UP = {
  title: 'Soccer registration',
  childId: JOSIE,
  amountText: '80',
  currency: 'USD',
  direction: 'inflow',
  followUpDate: '2026-09-25',
  notes: '',
};

export function followUp(w, { counterpart = { kind: 'none' }, ...fields } = {}) {
  return w.run((s, ctx) => createMoneyFollowUp(s, ctx, { ...FOLLOW_UP, ...fields }, counterpart)).id;
}

export const request = (w, about, personId) => w.run((s, ctx) => recordCounterpart(s, ctx, about, { kind: 'person', personId }));
export const answer = (w, responsibilityId, choice, opts) => w.run((s, ctx) => recordAnswer(s, ctx, responsibilityId, choice), opts);
export const finishPrep = (w, taskId) => w.run((s, ctx) => completePreparation(s, ctx, taskId));
export const finishFollowUp = (w, taskId) => w.run((s, ctx) => completeFollowUp(s, ctx, taskId));

export const respOf = (state, kind, id) => state.responsibilities.filter((r) => r.about.kind === kind && r.about.id === id);

/**
 * A household that shows EVERY state Feature 07 can present — used by the copy-truth audit, the accessibility checks and the
 * scenario fixtures, so they all look at the same, complete picture. Dates are relative to NOW (Wed 2026-09-16 10:00 NY).
 * Returns `{ w, ids }` where `ids` names each handoff / task / person / responsibility by role.
 */
export function showcaseWorld() {
  const w = world({ children: [JOSIE, MILO, RUBY] });
  const alex = w.person('Alex', 'co-parent');
  const alex2 = w.person('Alex', 'co-parent');
  const jordan = w.person('Jordan', 'caregiver');
  const june = w.person('Grandma June', 'grandparent');
  const pat = w.person('Pat', 'other');
  const p = (personId) => ({ kind: 'person', personId });
  const ids = { people: { alex, alex2, jordan, june, pat } };

  ids.requested = handoff(w, { child: JOSIE, title: 'Pickup Josie', date: '2026-09-18', location: "Dad's place, 12 Elm St", repeat: 'weekly', counterpart: p(alex) });
  ids.prepDone = prep(w, { child: JOSIE, title: 'Pack the school laptop', dueDate: '2026-09-17', linkEventId: ids.requested });
  ids.prepOpen = prep(w, { child: JOSIE, title: 'Bring the medication bag', dueDate: '2026-09-18', linkEventId: ids.requested });
  finishPrep(w, ids.prepDone);

  ids.acknowledged = handoff(w, { child: MILO, title: 'Drop off Milo', date: '2026-09-19', counterpart: p(jordan) });
  answer(w, respOf(w.state, 'event', ids.acknowledged)[0].id, 'acknowledged');

  ids.acceptedNeeds = handoff(w, { child: RUBY, title: 'Sunday handoff', date: '2026-09-20', counterpart: p(june) });
  answer(w, respOf(w.state, 'event', ids.acceptedNeeds)[0].id, 'accepted_needs_me');

  ids.covered = handoff(w, { child: JOSIE, title: 'Monday pickup', date: '2026-09-21', repeat: 'every_2_weeks', counterpart: p(alex2) });
  answer(w, respOf(w.state, 'event', ids.covered)[0].id, 'accepted_covered');

  ids.declined = handoff(w, { child: MILO, title: 'Tuesday drop-off', date: '2026-09-22', counterpart: p(jordan) });
  answer(w, respOf(w.state, 'event', ids.declined)[0].id, 'declined');

  ids.markedNeeds = handoff(w, { child: RUBY, title: 'Wednesday pickup', date: '2026-09-23', needsMe: true });
  ids.plain = handoff(w, { child: JOSIE, title: 'Thursday handoff', date: '2026-09-24' });

  ids.archived = handoff(w, { child: MILO, title: 'Friday exchange', date: '2026-09-25', counterpart: p(pat) });
  answer(w, respOf(w.state, 'event', ids.archived)[0].id, 'accepted_covered');
  w.apply((s, c) => archivePerson(s, c, pat));

  ids.removedPrep = handoff(w, { child: RUBY, title: 'Saturday handoff', date: '2026-09-26' });
  const keep = prep(w, { child: RUBY, title: 'Pack the swim bag', linkEventId: ids.removedPrep });
  const drop = prep(w, { child: RUBY, title: 'Bring the library book', linkEventId: ids.removedPrep });
  finishPrep(w, keep);
  w.run((s, c) => removePreparation(s, c, drop));

  ids.noChild = handoff(w, { child: JOSIE, title: 'Handoff with no child', date: '2026-09-27' });
  w.state = { ...w.state, events: w.state.events.map((e) => (e.id === ids.noChild ? { ...e, subjectMemberId: null } : e)) };

  ids.loosePrep = prep(w, { child: MILO, title: 'Return the soccer jersey', dueDate: '2026-09-19' });

  ids.followOpen = followUp(w, { title: 'Soccer registration', childId: JOSIE, amountText: '80', followUpDate: '2026-09-25', counterpart: p(alex) });
  ids.followNoCounterpart = followUp(w, { title: 'Field trip fee', childId: MILO, amountText: '12.50', followUpDate: '' });
  ids.followDone = followUp(w, { title: 'Dentist copay', childId: RUBY, amountText: '25', followUpDate: '2026-09-15' });
  w.run((s, c) => completeFollowUp(s, c, ids.followDone), { ms: NOW - 86_400_000 });
  ids.followRemoved = followUp(w, { title: 'Cancelled camp fee', childId: MILO, amountText: '300' });
  w.run((s, c) => removeFollowUp(s, c, ids.followRemoved));

  // A responsibility recorded complete, recently.
  ids.completedResp = handoff(w, { child: JOSIE, title: 'Earlier handoff', date: '2026-09-28', counterpart: p(alex) });
  answer(w, respOf(w.state, 'event', ids.completedResp)[0].id, 'completed', { ms: NOW - 2 * 86_400_000 });

  return { w, ids };
}
