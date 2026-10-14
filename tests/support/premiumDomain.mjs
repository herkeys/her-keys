// Scenario builders for the Premium Daily Load domain tests. Everything is built through the domain's OWN operations (addEvent,
// addTask, updateTask), so the household under test is the shape the product really writes — never a hand-made literal.
import { addEvent } from '../../src/domain/events.ts';
import { addTask, updateTask } from '../../src/domain/tasks.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, NEXT_DAY, TZ, nyInstant, nyMs } from './fixtures.mjs';

export { DAY, NEXT_DAY, TZ, nyInstant, nyMs };
export const WEDNESDAY = DAY; // 2026-09-16 is a Wednesday
export const THURSDAY = NEXT_DAY;
export const FRIDAY = '2026-09-18';
export const SATURDAY = '2026-09-19';

let counter = 0;
export const makeCtx = (over = {}) => ({ nowMs: nyMs(7), today: WEDNESDAY, createId: (prefix) => `${prefix}-${++counter}`, ...over });

/** A household with the starter categories, on a fixed New York day. */
export const emptyHousehold = () => createEmptyState(TZ);

export function event(state, { id, title = id, start, end, day = 16, commitment = 'fixed', ...rest }) {
  const next = addEvent(state, makeCtx(), {
    title, categoryId: 'cat-home', startsAt: nyInstant(start[0], start[1] ?? 0, day), endsAt: nyInstant(end[0], end[1] ?? 0, day), commitment, scope: 'household', ...rest,
  });
  return renameLast(next, 'events', id);
}

export function task(state, { id, title = id, minutes, plan, commitment = 'flexible', categoryId = 'cat-home', durationSource = 'user', patch = {}, ...rest }) {
  const next = addTask(state, makeCtx(), { title, categoryId, durationMinutes: minutes, durationSource, commitment, scope: 'household', ...rest });
  const renamed = renameLast(next, 'tasks', id);
  return plan === undefined ? applyPatch(renamed, id, patch) : applyPatch(setPlan(renamed, id, plan), id, patch);
}

const renameLast = (state, key, id) => {
  const rows = [...state[key]];
  rows[rows.length - 1] = { ...rows[rows.length - 1], id };
  return { ...state, [key]: rows };
};
const setPlan = (state, id, plan) => ({ ...state, tasks: state.tasks.map((t) => (t.id === id ? { ...t, plan } : t)) });
const applyPatch = (state, id, patch) => ({ ...state, tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

export const dayPlan = (date) => ({ kind: 'day', date });
export const timedPlan = (hour, minute = 0, day = 16) => ({ kind: 'timed', startsAt: nyInstant(hour, minute, day) });

/**
 * WEDNESDAY: a fixed 2:00 pickup, a fixed 3:15 dentist appointment, and a flexible 20-minute errand she planned at 2:50 — in
 * the 30-minute gap between them. The gap is 30 − 20 = 10 minutes, which is OVERLOADED; without the errand it is 30 (tight).
 * Thursday and Friday are empty.
 */
export function wednesdayOverload(extra = (s) => s) {
  let s = emptyHousehold();
  s = event(s, { id: 'evt-pickup', title: 'School pickup', start: [14, 0], end: [14, 45] });
  s = event(s, { id: 'evt-dentist', title: 'Dentist', start: [15, 15], end: [16, 15] });
  s = task(s, { id: 'task-library', title: 'Return library books', minutes: 20, plan: timedPlan(14, 50) });
  return validated(extra(s));
}

export function validated(state) {
  const result = validateAppState(state);
  if (!result.ok) throw new Error(`scenario is not a valid household: ${JSON.stringify(result.issues ?? result).slice(0, 400)}`);
  return state;
}

/** Fill a day so it is genuinely overloaded: two overlapping fixed commitments. */
export function overloadDay(state, day) {
  let s = event(state, { id: `evt-clash-a-${day}`, start: [9, 0], end: [10, 0], day });
  s = event(s, { id: `evt-clash-b-${day}`, start: [9, 30], end: [10, 30], day });
  return s;
}

export { updateTask };
