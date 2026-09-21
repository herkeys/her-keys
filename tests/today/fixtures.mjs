/**
 * Scenario builders for the Today feature tests.
 *
 * Every household here is built through the domain's OWN operations (addEvent, addTask,
 * delegate, proposeIntent, ...) wherever one exists, so it is the shape the product would
 * really write and not a literal that merely satisfies a schema. Server-written rows —
 * executions and outcomes — have no client write path by design; they are added as literals,
 * exactly the way `tests/support/richHousehold.mjs` (`withServerRows`) does for the foundation
 * acceptance suites, which is the existing trusted test boundary for that evidence. Every state
 * built here is validated with `validateAppState`, so a fixture cannot drift into something the
 * store would refuse to hold.
 */
import { addEvent } from '../../src/domain/events.ts';
import { decideIntent, proposeIntent } from '../../src/domain/authorization.ts';
import { captureNeedsMeItem } from '../../src/domain/needsMe.ts';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { resolveOneMoveForToday } from '../../src/domain/oneMove.ts';
import { addPerson, delegate } from '../../src/domain/responsibility.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { buildTodayView } from '../../src/features/today/model/index.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, NEXT_DAY, TZ, nyInstant, nyMs } from '../support/fixtures.mjs';

export { DAY, NEXT_DAY, TZ, nyInstant, nyMs };

let seq = 0;
export const nextId = (prefix) => `${prefix}-t${++seq}`;
export const mkCtx = (nowMs = nyMs(7), today = DAY) => ({ nowMs, today, createId: nextId });

export const READY = Object.freeze({ status: 'ready', recovery: null, persistence: 'enabled' });

/** A real, onboarded, empty household with a name — the ground every scenario stands on. */
export function household({ name = 'Maren Lee', at = nyMs(7) } = {}) {
  let s = createEmptyState(TZ);
  s = { ...s, user: { ...s.user, displayName: name } };
  s = toggleOnboardingOption(toggleOnboardingOption(toggleOnboardingOption(s, 'goals', 'calmer-household'), 'strengths', 'cooking'), 'struggles', 'overcommitting');
  return completeOnboarding(s, mkCtx(at));
}

export const at = (h, m = 0, day = 16) => nyInstant(h, m, day);

/** Adds an event on the given New York clock times. */
export function ev(state, { title, from, to, commitment = 'fixed', category = 'cat-kids', day = 16, ...rest }) {
  return addEvent(state, mkCtx(), {
    title,
    categoryId: category,
    startsAt: at(from[0], from[1] ?? 0, day),
    endsAt: at(to[0], to[1] ?? 0, day),
    commitment,
    scope: 'household',
    ...rest,
  });
}

/** Adds a task. `plan` defaults to "planned for today" so it is on the day's list without a due date. */
export function tk(state, { title, minutes = 15, due = null, plan = { kind: 'day', date: DAY }, commitment = 'flexible', category = 'cat-home', ...rest }) {
  return addTask(state, mkCtx(), { title, categoryId: category, durationMinutes: minutes, dueDate: due, plan, commitment, scope: 'household', ...rest });
}

export const taskNamed = (state, title) => state.tasks.find((t) => t.title === title);
export const eventNamed = (state, title) => state.events.find((e) => e.title === title);

/** Sets stored facets (consequence, dueAt, ...) on a task the way a row that answers them would hold them. */
export function facet(state, title, patch) {
  return { ...state, tasks: state.tasks.map((t) => (t.title === title ? { ...t, ...patch } : t)) };
}

/** Decides today's One Move exactly as the store does after a capture. */
export function withMove(state, nowMs = nyMs(7), today = DAY) {
  return resolveOneMoveForToday(state, mkCtx(nowMs, today));
}

/** The projection at an instant, with the runtime settled. */
export function view(state, nowMs = nyMs(8), runtime = READY, extra = {}) {
  return buildTodayView({ state, nowMs, runtime, ...extra });
}

/** Everything the view says in words — every string leaf, however deep. */
export function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out);
  return out;
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const AUTOMATION = { producer: 'automation', artifactId: null, confidence: null };

/**
 * A Her Keys proposal she approved, and what the SERVER wrote about it afterwards. The execution and
 * outcome rows are literals (the pull-only server-written kinds); the intent and her decision go through
 * the domain's own operations.
 */
export function withAction(state, { about, category = 'internal_reminder', decide = 'approved', execution = null, outcomes = [], now = nyMs(9) }) {
  let s = proposeIntent(state, mkCtx(now), { category, about, summaryCode: 'test_action' });
  const intent = s.intents[s.intents.length - 1];
  if (decide) s = decideIntent(s, mkCtx(now), intent.id, decide);
  const decision = s.decisions[s.decisions.length - 1];

  if (execution) {
    const id = nextId('exec');
    s = {
      ...s,
      executions: [
        ...s.executions,
        {
          id,
          intentId: intent.id,
          decisionId: decision.id,
          authorityId: null,
          attempt: 1,
          attemptedAt: execution.attemptedAt,
          provider: null,
          externalActionId: null,
          externalReferenceId: null,
          result: execution.result,
          errorClass: execution.result === 'succeeded' ? 'none' : 'transient',
          reversibility: 'reversible',
          compensationCode: null,
          compensatesExecutionId: null,
          createdAt: execution.attemptedAt,
          provenance: AUTOMATION,
          scope: 'personal',
        },
      ],
      outcomes: [
        ...s.outcomes,
        ...outcomes.map((o) => ({ id: nextId('out'), executionId: id, kind: o.kind, observedAt: o.observedAt, createdAt: o.observedAt, provenance: AUTOMATION, scope: 'personal' })),
      ],
    };
  }
  return valid(s);
}

export const inZone = (state, timezone) => ({ ...state, user: { ...state.user, timezone } });

/**
 * The DENSE reference household (Addendum §X): twenty overlapping commitments, forty tasks (ten due
 * today, five overdue), six delegations nobody answered, five captured items due today. Used for the
 * density scenario and as the one reference for the < 100 ms derivation measurement.
 */
export function dense() {
  let s = household();
  for (let i = 0; i < 20; i++) {
    const start = 6 * 60 + i * 30;
    const end = start + 45;
    s = ev(s, {
      title: `Block ${i}`,
      from: [Math.floor(start / 60), start % 60],
      to: [Math.floor(end / 60), end % 60],
      commitment: i % 2 ? 'flexible' : 'fixed',
      category: i % 3 ? 'cat-work' : 'cat-kids',
    });
  }
  for (let i = 0; i < 40; i++) {
    s = tk(s, {
      title: `Task ${i}`,
      minutes: 10 + (i % 5) * 10,
      due: i < 10 ? DAY : i < 15 ? '2026-09-14' : null,
      plan: i < 15 ? { kind: 'unplanned' } : { kind: 'day', date: DAY },
      category: i % 2 ? 'cat-home' : 'cat-money',
    });
  }
  for (let i = 0; i < 6; i++) s = addPerson(s, mkCtx(nyMs(6)), { displayName: `Helper ${i}`, relationship: 'friend' });
  for (let i = 0; i < 6; i++) {
    const task = taskNamed(s, `Task ${20 + i}`);
    s = delegate(s, mkCtx(nyMs(6)), { about: { kind: 'task', id: task.id }, to: { kind: 'person', id: s.people[i].id }, ackWithinMinutes: 1 });
  }
  for (let i = 0; i < 5; i++) s = captureNeedsMeItem(s, mkCtx(nyMs(6)), { title: `Captured ${i}`, dueDate: DAY });
  return withMove(valid(s), nyMs(6));
}

/** Fails loudly if a fixture is not state the store would hold. */
export function valid(state) {
  const verdict = validateAppState(state);
  if (!verdict.ok) throw new Error(`fixture is not valid state: ${verdict.reason}: ${verdict.issues.slice(0, 4).join('; ')}`);
  return state;
}
