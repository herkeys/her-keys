/**
 * Deterministic Home fixtures. Every household here is built with the domain's OWN transitions (addTask, addEvent, delegate,
 * addDependency, addRecurrence, completeTask, ...), never hand-written state, so a scenario cannot describe something the app
 * cannot produce.
 */
import { addEvent } from '../../src/domain/events.ts';
import { zonedTimeToEpochMs } from '../../src/domain/logicalDay.ts';
import { accept, acknowledge, addPerson, decline, delegate } from '../../src/domain/responsibility.ts';
import { addDependency, addRecurrence, removeDependency } from '../../src/domain/structure.ts';
import { addTask, archiveTask, completeTask } from '../../src/domain/tasks.ts';
import { removeEvent } from '../../src/domain/events.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

export const TZ = 'America/Chicago';
export const TODAY = '2026-09-21';
/** 10:00 in Chicago (CDT, UTC-5) on TODAY. */
export const NOW = zonedTimeToEpochMs(TODAY, 10 * 60, TZ);
export const HOME = 'cat-home';
export const atLocal = (date, hour, minute = 0) => zonedTimeToEpochMs(date, hour * 60 + minute, TZ);
export const iso = (ms) => new Date(ms).toISOString();

export function makeCtx(nowMs = NOW, today = TODAY, prefix = '') {
  let n = 0;
  return { nowMs, today, createId: (kind) => `${prefix}${kind}-${++n}` };
}

/** A real household with one child and two people (a contractor and a neighbour). */
export function household({ ctx = makeCtx(NOW, TODAY, 'seed-') } = {}) {
  let state = createEmptyState(TZ);
  state = { ...state, children: [{ id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' }] };
  state = addPerson(state, ctx, { displayName: 'Sam', relationship: 'contractor' });
  state = addPerson(state, ctx, { displayName: 'Ana', relationship: 'neighbor' });
  return state;
}

export const SAM = (state) => state.people.find((p) => p.displayName === 'Sam').id;
export const ANA = (state) => state.people.find((p) => p.displayName === 'Ana').id;

const uniq = (() => { let n = 0; return (p) => `${p}-${++n}`; })();
export const fresh = (nowMs = NOW, today = TODAY) => ({ nowMs, today, createId: (kind) => uniq(kind) });

/** A Home task. Duration is hers (`user`) unless `durationSource` is overridden. */
export function homeTask(state, ctx, title, extra = {}) {
  return addTask(state, ctx, { title, categoryId: HOME, scope: 'household', durationMinutes: 20, durationSource: 'user', ...extra });
}
export const lastTask = (state) => state.tasks[state.tasks.length - 1];
export const lastEvent = (state) => state.events[state.events.length - 1];

export function homeVisit(state, ctx, title, { date = TODAY, from = [14, 0], to = [15, 0], ...extra } = {}) {
  return addEvent(state, ctx, { title, categoryId: HOME, startsAt: iso(atLocal(date, from[0], from[1])), endsAt: iso(atLocal(date, to[0], to[1])), commitment: 'fixed', scope: 'household', ...extra });
}

export const task = (state, id) => state.tasks.find((t) => t.id === id);

export { addDependency, addRecurrence, accept, acknowledge, archiveTask, completeTask, decline, delegate, removeDependency, removeEvent };

/** A weekly/monthly schedule rule about a task. */
export function repeating(state, ctx, taskId, { frequency = 'monthly', interval = 3, anchorDate = '2026-06-12' } = {}) {
  return addRecurrence(state, ctx, { kind: 'task', id: taskId }, { trigger: 'schedule', frequency, interval, anchorDate });
}

/**
 * A DENSE Home household: 240 Home tasks in mixed states, 30 visits, 12 Systems, repeating tasks with completion history,
 * responsibilities in every stage, prerequisites (met, pending, removed, missing), unknown / default / explicit durations — plus
 * a large amount of NON-Home data the projection must not be slowed by or leak.
 */
export function denseHousehold({ homeTasks = 240, otherTasks = 3000 } = {}) {
  const ctx = makeCtx(NOW, TODAY, 'd-');
  let state = household({ ctx });
  state = { ...state, categories: state.categories };
  const holders = [SAM(state), ANA(state)];

  for (let i = 0; i < homeTasks; i += 1) {
    const dueOffset = i % 9 === 0 ? -3 : i % 9 === 1 ? 0 : i % 9 === 2 ? 1 : i % 9 === 3 ? 5 : i % 9 === 4 ? 40 : null;
    const due = dueOffset === null ? null : new Date(Date.parse(`${TODAY}T00:00:00Z`) + dueOffset * 86_400_000).toISOString().slice(0, 10);
    const source = i % 3 === 0 ? 'default' : i % 3 === 1 ? 'user' : null;
    state = addTask(state, ctx, { title: `Home task ${String(i).padStart(3, '0')}`, categoryId: HOME, scope: 'household', dueDate: due, durationMinutes: 15 + (i % 4) * 5, durationSource: source });
  }
  const homeTaskIds = state.tasks.map((t) => t.id);

  for (let i = 0; i < 30; i += 1) {
    const day = new Date(Date.parse(`${TODAY}T00:00:00Z`) + ((i % 12) - 2) * 86_400_000).toISOString().slice(0, 10);
    state = homeVisit(state, ctx, `Visit ${String(i).padStart(2, '0')}`, { date: day, from: [8 + (i % 8), 0], to: [9 + (i % 8), 0] });
  }
  for (let i = 0; i < 12; i += 1) {
    state = { ...state, systems: [...state.systems, { id: `sys-${i}`, name: `Routine ${i}`, description: '', categoryId: HOME, subjectMemberId: null, automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'household' }] };
  }
  // repeating tasks with completion history
  for (let i = 0; i < 20; i += 1) {
    const id = homeTaskIds[i * 5];
    state = repeating(state, ctx, id, { frequency: i % 2 === 0 ? 'monthly' : 'weekly', interval: 1 + (i % 3) });
    if (i % 2 === 0) state = completeTask(state, makeCtx(NOW - (i + 1) * 86_400_000, TODAY, `c${i}-`), id);
  }
  // responsibilities in every stage
  for (let i = 0; i < 24; i += 1) {
    const id = homeTaskIds[i * 7 + 1];
    if (state.tasks.find((t) => t.id === id)?.status !== 'open') continue;
    state = delegate(state, ctx, { about: { kind: 'task', id }, to: { kind: 'person', id: holders[i % 2] }, ackWithinMinutes: 60 });
    const live = state.responsibilities[state.responsibilities.length - 1];
    if (i % 4 === 1) state = acknowledge(state, ctx, live.id);
    if (i % 4 === 2) state = accept(state, ctx, live.id, i % 8 === 2);
    if (i % 4 === 3) state = decline(state, ctx, live.id);
  }
  // prerequisites
  for (let i = 0; i < 30; i += 1) {
    const from = homeTaskIds[i * 6 + 2];
    const to = homeTaskIds[i * 6 + 3];
    const added = addDependency(state, ctx, { relation: 'requires', from: { kind: 'task', id: from }, to: { kind: 'task', id: to } });
    state = added.state;
    if (i % 5 === 0) state = completeTask(state, ctx, to);
    if (i % 5 === 1) state = archiveTask(state, ctx, to);
  }
  // Non-Home data the projection must ignore.
  for (let i = 0; i < otherTasks; i += 1) {
    state = addTask(state, ctx, { title: `Other ${i}`, categoryId: i % 2 === 0 ? 'cat-kids' : 'cat-money', scope: 'household', dueDate: TODAY });
  }
  return state;
}
