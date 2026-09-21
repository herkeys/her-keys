/**
 * Feature 03 scenario fixtures (contract section 66). Every household here is built through the
 * SAME domain mutations the app uses (`addEvent`, `addTask`, `delegate`, `addDependency`, ...), so a
 * fixture cannot describe a state the app could not produce. A scenario is data: a state, the day
 * being looked at, the logical today and the clock. Nothing renders here.
 *
 * Times are written as 'HH:MM' on a date in the household's zone (New York unless stated).
 */
import { addEvent } from '../../src/domain/events.ts';
import { toInstant, zonedTimeToEpochMs } from '../../src/domain/logicalDay.ts';
import { accept, addPerson, delegate } from '../../src/domain/responsibility.ts';
import { addDependency, addRecurrence } from '../../src/domain/structure.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

export const TZ = 'America/New_York';
export const DAY = '2026-09-16';
export const NEXT = '2026-09-17';

export const JOSIE = { id: 'child-1', displayName: 'Josie', birthDate: '2017-05-02', scope: 'child' };
export const THEO = { id: 'child-2', displayName: 'Theo', birthDate: '2020-03-14', scope: 'child' };

const minutesOf = (hhmm) => {
  const [hour, minute] = hhmm.split(':').map(Number);
  return hour * 60 + minute;
};

export const msAt = (hhmm, date = DAY, tz = TZ) => zonedTimeToEpochMs(date, minutesOf(hhmm), tz);
export const instantAt = (hhmm, date = DAY, tz = TZ) => toInstant(msAt(hhmm, date, tz));

/** A household under construction. Every method returns the builder so a day reads top to bottom. */
export function household({ tz = TZ, children = [] } = {}) {
  let counter = 0;
  let state = { ...createEmptyState(tz), children };
  const ctx = (nowMs = msAt('07:00')) => ({ nowMs, today: DAY, createId: (prefix) => `${prefix}-${++counter}` });

  /** Adds through a domain mutation, then gives the new row a readable id. */
  const named = (collection, id, mutate) => {
    const before = state[collection].length;
    state = mutate(state);
    const rows = state[collection];
    if (rows.length !== before + 1) throw new Error(`${collection}: expected one new row`);
    state = { ...state, [collection]: rows.map((row, index) => (index === rows.length - 1 ? { ...row, id } : row)) };
  };

  const builder = {
    get state() {
      return state;
    },
    ctx,
    tz,

    event(id, { title = id, start, end, date = DAY, endDate = date, commitment = 'fixed', ...rest }) {
      named('events', id, (s) =>
        addEvent(s, ctx(), {
          title,
          categoryId: 'cat-home',
          scope: rest.subjectMemberId ? 'child' : 'household',
          commitment,
          startsAt: instantAt(start, date, tz),
          endsAt: instantAt(end, endDate, tz),
          ...rest,
        })
      );
      return builder;
    },

    /** minutes: 0 records "no usable duration". due: LocalDate. at: schedules the task at a time (a timed plan). */
    task(id, { title = id, minutes = 15, commitment = 'flexible', due = null, plan = null, at = null, date = DAY, dueAt = null, earliest = null, latest = null, splittable = null, ...rest }) {
      named('tasks', id, (s) =>
        addTask(s, ctx(), {
          title,
          categoryId: 'cat-home',
          scope: rest.subjectMemberId ? 'child' : 'household',
          durationMinutes: minutes,
          commitment,
          dueDate: due,
          plan: at !== null ? { kind: 'timed', startsAt: instantAt(at, date, tz) } : (plan ?? { kind: 'unplanned' }),
          ...rest,
        })
      );
      const facet = (field, hhmm, facetDate) => {
        if (hhmm === null) return;
        state = { ...state, tasks: state.tasks.map((t) => (t.id === id ? { ...t, [field]: instantAt(hhmm, facetDate ?? date, tz) } : t)) };
      };
      facet('dueAt', dueAt);
      facet('earliestStartAt', earliest);
      facet('latestFinishAt', latest);
      if (splittable !== null) state = { ...state, tasks: state.tasks.map((t) => (t.id === id ? { ...t, splittable } : t)) };
      return builder;
    },

    person(id, displayName, relationship = 'co-parent') {
      state = addPerson(state, ctx(), { displayName, relationship });
      state = { ...state, people: state.people.map((p, index) => (index === state.people.length - 1 ? { ...p, id } : p)) };
      return builder;
    },

    /** Hands an item to a person. `accepted` moves it to the accepted state. */
    delegate(about, personId, { accepted = false, ackWithinMinutes = null } = {}) {
      state = delegate(state, ctx(), { about, to: { kind: 'person', id: personId }, ackWithinMinutes });
      const created = state.responsibilities[state.responsibilities.length - 1];
      if (accepted) state = accept(state, ctx(), created.id);
      return builder;
    },

    requires(fromRef, toRef) {
      const result = addDependency(state, ctx(), { relation: 'requires', from: fromRef, to: toRef });
      if (result.refusal !== null) throw new Error(`dependency refused: ${result.refusal}`);
      state = result.state;
      return builder;
    },

    repeats(ref, rule) {
      state = addRecurrence(state, ctx(), ref, { anchorDate: DAY, ...rule });
      return builder;
    },

    with(update) {
      state = update(state);
      return builder;
    },
  };
  return builder;
}

const evt = (id) => ({ kind: 'event', id });
const tsk = (id) => ({ kind: 'task', id });

const scenario = (id, tier, title, build, extra = {}) => ({ id, tier, title, build, date: DAY, today: DAY, now: '07:00', ...extra });

/**
 * The scenario catalogue. `build()` returns a household builder; `date`/`today`/`now` say how to look at it.
 * Tier 1 = thesis critical, 2 = strong coverage, 3 = hardening (contract section 66).
 */
export const SCENARIOS = [
  scenario('A', 1, 'Ordinary feasible day', () =>
    household({ children: [JOSIE] })
      .event('evt-team', { title: 'Team meeting', start: '09:00', end: '12:00', location: 'Office', travelMinutesAfter: 15 })
      .event('evt-soccer', { title: "Josie's soccer practice", start: '15:30', end: '16:30', location: 'Field 3', travelMinutesBefore: 20, subjectMemberId: 'child-1' })
      .task('tsk-books', { title: 'Return library books', minutes: 30, due: DAY })),

  scenario('B', 1, 'Fixed overlap', () =>
    household()
      .event('evt-dentist', { title: 'Dentist', start: '10:00', end: '11:00' })
      .event('evt-call', { title: 'Parent-teacher call', start: '10:30', end: '11:30' })),

  scenario('C', 2, 'Tight but feasible transition', () =>
    household()
      .event('evt-school', { title: 'School drop-off', start: '10:00', end: '11:00', location: 'School', travelMinutesAfter: 10 })
      .event('evt-clinic', { title: 'Clinic visit', start: '11:30', end: '12:30', location: 'Clinic', travelMinutesBefore: 5 })),

  scenario('D', 1, 'Impossible transition', () =>
    household()
      .event('evt-school', { title: 'School pickup', start: '10:00', end: '11:00', location: 'School', travelMinutesAfter: 30 })
      .event('evt-clinic', { title: 'Clinic visit', start: '11:20', end: '12:00', location: 'Clinic', travelMinutesBefore: 20 })),

  scenario('E', 2, 'Flexible item fits', () =>
    household()
      .event('evt-standup', { title: 'Standup', start: '09:00', end: '09:30' })
      .event('evt-lunch', { title: 'Lunch', start: '12:00', end: '13:00' })
      .task('tsk-call', { title: 'Call the pharmacy', minutes: 45, due: DAY })),

  scenario('F', 1, 'Flexible item cannot fit', () =>
    household()
      .event('evt-a', { title: 'Vendor call', start: '12:30', end: '14:00' })
      .event('evt-b', { title: 'Budget review', start: '14:30', end: '16:00' })
      .event('evt-c', { title: 'Site visit', start: '16:15', end: '17:30' })
      .task('tsk-report', { title: 'Write the quarterly report', minutes: 90, due: DAY, dueAt: '17:00' }), { now: '13:00' }),

  scenario('G', 1, 'Unknown duration', () =>
    household()
      .event('evt-a', { title: 'Morning appointment', start: '10:00', end: '11:00' })
      .event('evt-b', { title: 'Afternoon appointment', start: '14:00', end: '15:00' })
      .task('tsk-registration', { title: 'Renew car registration', minutes: 0, due: DAY })),

  scenario('H', 2, 'Unknown travel', () =>
    household()
      .event('evt-school', { title: 'School conference', start: '10:00', end: '11:00', location: 'Lincoln Elementary' })
      .event('evt-clinic', { title: 'Clinic visit', start: '11:45', end: '12:30', location: 'Downtown Clinic' })
      .task('tsk-form', { title: 'Sign the permission form', minutes: 30, due: DAY })),

  scenario('I', 1, 'Delegated but unresolved', () =>
    household({ children: [JOSIE] })
      .person('person-marcus', 'Marcus')
      .event('evt-pickup', { title: 'Pick up Josie from school', start: '15:30', end: '16:00', subjectMemberId: 'child-1' })
      .delegate(evt('evt-pickup'), 'person-marcus')),

  scenario('J', 3, 'Accepted responsibility', () =>
    household({ children: [JOSIE] })
      .person('person-marcus', 'Marcus')
      .event('evt-pickup', { title: 'Pick up Josie from school', start: '15:30', end: '16:00', subjectMemberId: 'child-1' })
      .delegate(evt('evt-pickup'), 'person-marcus', { accepted: true })),

  scenario('K', 2, 'Dependency order', () =>
    household()
      .event('evt-notary', { title: 'Notary appointment', start: '11:00', end: '12:00' })
      .event('evt-later', { title: 'Team sync', start: '13:00', end: '13:30' })
      .task('tsk-permit', { title: 'Submit the permit form', minutes: 20, due: DAY })
      .requires(tsk('tsk-permit'), evt('evt-notary'))),

  scenario('L', 1, 'Date-only', () =>
    household()
      .event('evt-a', { title: 'Morning appointment', start: '10:00', end: '11:00' })
      .task('tsk-invoice', { title: 'Pay orthodontist invoice', minutes: 10, commitment: 'fixed', due: DAY })
      .task('tsk-email', { title: 'Reply to the landlord', minutes: 15, due: DAY })),

  scenario('M', 2, 'Child-scoped commitments', () =>
    household({ children: [JOSIE, THEO] })
      .event('evt-soccer', { title: 'Soccer practice', start: '16:00', end: '17:00', subjectMemberId: 'child-1' })
      .event('evt-piano', { title: 'Piano lesson', start: '17:30', end: '18:00', subjectMemberId: 'child-2' })
      .event('evt-plumber', { title: 'Plumber visit', start: '13:00', end: '14:00' })
      .task('tsk-form', { title: 'Field trip form', minutes: 10, due: DAY, subjectMemberId: 'child-1' })),

  scenario('N', 2, 'Move preview — a move the foundation offers', () =>
    household()
      .event('evt-a', { title: 'Client call', start: '10:00', end: '11:00' })
      .event('evt-b', { title: 'Errand', start: '11:10', end: '11:50', commitment: 'flexible' })
      .event('evt-c', { title: 'Board meeting', start: '12:00', end: '13:00' })),

  scenario('O', 3, 'Capacity pressure — drop / shorten / protect', () =>
    household()
      .event('evt-long', { title: 'Conference', start: '09:00', end: '21:00' })
      .task('tsk-due', { title: 'File the tax form', minutes: 100, commitment: 'fixed', due: DAY })
      .task('tsk-garage', { title: 'Deep clean the garage', minutes: 200 })
      .with((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === 'tsk-garage' ? { ...t, plan: { kind: 'day', date: DAY } } : t)) }))),

  scenario('P', 1, 'Sparse day', () => household().event('evt-dentist', { title: 'Dentist', start: '14:00', end: '15:00' })),

  // Twelve back-to-back short commitments with real gaps, a child's, a located one with travel entered, and flexible ones.
  scenario('Q', 2, 'Dense day', () => {
    const b = household({ children: [JOSIE] });
    for (let hour = 7; hour < 19; hour++) {
      const hh = String(hour).padStart(2, '0');
      b.event(`evt-${hh}`, {
        title: `Meeting ${hour}`,
        start: `${hh}:00`,
        end: `${hh}:20`,
        commitment: hour % 3 === 0 ? 'flexible' : 'fixed',
        ...(hour === 10 ? { location: 'Office', travelMinutesBefore: 10, travelMinutesAfter: 10 } : {}),
        ...(hour === 15 ? { subjectMemberId: 'child-1' } : {}),
      });
    }
    return b.task('tsk-email', { title: 'Reply to the landlord', minutes: 15, due: DAY });
  }, { now: '06:00' }),

  // Week of Sun 13 - Sat 19 September, today = Sunday. Looked at on Wednesday the 16th (the insufficient-information day).
  scenario('R', 2, 'Week overview — room, tight, conflict and insufficient-information days', () =>
    household()
      .event('evt-sun', { title: 'Family lunch', start: '14:00', end: '15:00', date: '2026-09-13' })
      .event('evt-mon-1', { title: 'Standup', start: '10:00', end: '11:00', date: '2026-09-14' })
      .event('evt-mon-2', { title: 'Design review', start: '11:30', end: '12:30', date: '2026-09-14' })
      .event('evt-tue-1', { title: 'Dentist', start: '10:00', end: '11:00', date: '2026-09-15' })
      .event('evt-tue-2', { title: 'Parent-teacher call', start: '10:30', end: '11:30', date: '2026-09-15' })
      .event('evt-wed-1', { title: 'School conference', start: '10:00', end: '11:00', date: '2026-09-16', location: 'Lincoln Elementary' })
      .event('evt-wed-2', { title: 'Clinic visit', start: '11:45', end: '12:30', date: '2026-09-16', location: 'Downtown Clinic' })
      .event('evt-fri-1', { title: 'Workshop', start: '06:00', end: '12:00', date: '2026-09-18' })
      .event('evt-fri-2', { title: 'Client day', start: '12:30', end: '18:00', date: '2026-09-18' })
      .event('evt-fri-3', { title: 'Evening class', start: '18:30', end: '22:00', date: '2026-09-18' })
      .task('tsk-report', { title: 'Write the quarterly report', minutes: 90, due: '2026-09-18' }), { date: '2026-09-16', today: '2026-09-13' }),

  scenario('AC', 3, 'Recurrence foundation input', () =>
    household()
      .event('evt-standup', { title: 'Weekly standup', start: '09:00', end: '09:30' })
      .repeats(evt('evt-standup'), { frequency: 'weekly', byWeekday: [3] })),

  scenario('AD', 3, 'Multi-day event', () =>
    household().event('evt-trip', { title: 'Grandma visit', start: '20:00', date: '2026-09-15', end: '10:00', endDate: '2026-09-17' })),

  scenario('AF', 1, 'Insufficient information — feasible only if unknown were zero', () =>
    household()
      .event('evt-school', { title: 'School conference', start: '10:00', end: '11:00', location: 'Lincoln Elementary' })
      .event('evt-clinic', { title: 'Clinic visit', start: '11:50', end: '12:30', location: 'Downtown Clinic' })
      .task('tsk-renewal', { title: 'Renew car registration', minutes: 0, due: DAY })
      .task('tsk-form', { title: 'Sign the permission form', minutes: 30, due: DAY })),
];

export const scenarioById = (id) => {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`no scenario ${id}`);
  return found;
};

/** The inputs `projectCalendarDay` takes, for a scenario. */
export function inputsFor(s, overrides = {}) {
  const built = s.build();
  return { state: built.state, date: s.date, today: s.today, nowMs: msAt(s.now, s.today, built.tz), ...overrides };
}
