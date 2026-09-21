/**
 * HK-INTEGRATION-READINESS-01 / HA-009 — a removed prerequisite is not a completed prerequisite.
 *
 * REMOVED != COMPLETED. MISSING != SATISFIED. A removal never rewrites a dependency (history is kept), and a dependent
 * that lost a prerequisite says "review", not "ready" and not "needs the thing that is gone".
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addEvent, removeEvent } from '../../src/domain/events.ts';
import { archiveTask, addTask, completeTask } from '../../src/domain/tasks.ts';
import {
  addDependency,
  addGoal,
  blockersOf,
  goalProgress,
  isBlocked,
  isDone,
  readinessOf,
  removeDependency,
  setGoalStatus,
  standingOf,
  unavailablePrerequisitesOf,
} from '../../src/domain/structure.ts';
import { decodeStoredState, encodeStoredState } from '../../src/persistence/envelope.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

const TZ = 'America/Chicago';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const ctx = () => {
  let n = 0;
  return { nowMs: NOW, today: '2026-09-21', createId: (p) => `${p}-${++n}` };
};

/** A household with a dependent task and one of each prerequisite kind. */
function world() {
  const c = ctx();
  let s = createEmptyState(TZ);
  const cat = s.categories[0].id;
  s = addTask(s, c, { title: 'File the reimbursement', categoryId: cat, scope: 'household' }); // task-1  (the dependent)
  s = addTask(s, c, { title: 'Get the receipt', categoryId: cat, scope: 'household' }); // task-2
  s = addTask(s, c, { title: 'Sign the form', categoryId: cat, scope: 'household' }); // task-3
  s = addEvent(s, c, { title: 'School meeting', categoryId: cat, startsAt: '2026-09-22T15:00:00.000Z', endsAt: '2026-09-22T16:00:00.000Z', commitment: 'fixed', scope: 'household' }); // evt-4
  return { s, c, dependent: { kind: 'task', id: 'task-1' }, receipt: { kind: 'task', id: 'task-2' }, form: { kind: 'task', id: 'task-3' }, meeting: { kind: 'event', id: 'evt-4' } };
}

const requires = (s, c, from, to) => {
  const out = addDependency(s, c, { relation: 'requires', from, to });
  assert.equal(out.refusal, null);
  return out.state;
};

describe('HA-009 — standing is derived from existing lifecycles', () => {
  test('the full kind x lifecycle matrix', () => {
    const { s, c, receipt, meeting } = world();
    assert.deepEqual(standingOf(s, receipt), { standing: 'pending' });
    assert.deepEqual(standingOf(s, meeting), { standing: 'pending' });

    assert.deepEqual(standingOf(completeTask(s, c, 'task-2'), receipt), { standing: 'satisfied' });
    assert.deepEqual(standingOf(archiveTask(s, c, 'task-2'), receipt), { standing: 'unavailable', cause: 'retired' });
    assert.deepEqual(standingOf(removeEvent(s, c, 'evt-4'), meeting), { standing: 'unavailable', cause: 'retired' });

    assert.deepEqual(standingOf(s, { kind: 'task', id: 'no-such-task' }), { standing: 'unavailable', cause: 'missing' });
    assert.deepEqual(standingOf(s, { kind: 'event', id: 'no-such-event' }), { standing: 'unavailable', cause: 'missing' });
    assert.deepEqual(standingOf(s, { kind: 'needsMe', id: 'no-such' }), { standing: 'unavailable', cause: 'missing' });
    assert.deepEqual(standingOf(s, { kind: 'goal', id: 'no-such' }), { standing: 'unavailable', cause: 'missing' });
    assert.deepEqual(standingOf(s, { kind: 'system', id: 'no-such' }), { standing: 'unavailable', cause: 'missing' });
  });

  test('a goal is satisfied only by being achieved; abandoning it is retirement, not achievement', () => {
    const c = ctx();
    let s = addGoal(createEmptyState(TZ), c, { title: 'Get organised' }); // goal-1
    const ref = { kind: 'goal', id: 'goal-1' };
    assert.deepEqual(standingOf(s, ref), { standing: 'pending' });
    assert.deepEqual(standingOf(setGoalStatus(s, c, 'goal-1', 'achieved'), ref), { standing: 'satisfied' });
    assert.deepEqual(standingOf(setGoalStatus(s, c, 'goal-1', 'abandoned'), ref), { standing: 'unavailable', cause: 'retired' });
  });
});

describe('HA-009 — the removed prerequisite cannot masquerade as completed', () => {
  test('a removed EVENT prerequisite is no longer "done" (the reported defect)', () => {
    const { s, c, dependent, meeting } = world();
    const linked = requires(s, c, dependent, meeting);
    assert.equal(readinessOf(linked, dependent), 'blocked', 'while the event is live it is a real blocker');

    const removed = removeEvent(linked, c, 'evt-4');
    assert.equal(isDone(removed, meeting), false, 'removal is not completion');
    assert.equal(readinessOf(removed, dependent), 'needsReview', 'and it does not unlock the dependent');
    assert.equal(isBlocked(removed, dependent), true, 'conservative: a retired prerequisite is not a satisfied one');
    assert.deepEqual(blockersOf(removed, dependent), [], 'nothing keeps asserting that a removed thing still exists');
    assert.deepEqual(unavailablePrerequisitesOf(removed, dependent), [{ ref: meeting, cause: 'retired' }]);
  });

  test('event and task retirement mean the same thing: one edge must not change meaning by target kind', () => {
    const { s, c, dependent, receipt, meeting } = world();
    const viaTask = archiveTask(requires(s, c, dependent, receipt), c, 'task-2');
    const viaEvent = removeEvent(requires(s, c, dependent, meeting), c, 'evt-4');
    assert.equal(readinessOf(viaTask, dependent), readinessOf(viaEvent, dependent));
    assert.equal(readinessOf(viaTask, dependent), 'needsReview');
    assert.equal(isDone(viaTask, receipt), isDone(viaEvent, meeting));
  });

  test('completion still satisfies: a completed task prerequisite makes the dependent ready', () => {
    const { s, c, dependent, receipt } = world();
    const done = completeTask(requires(s, c, dependent, receipt), c, 'task-2');
    assert.equal(readinessOf(done, dependent), 'ready');
    assert.equal(isBlocked(done, dependent), false);
  });

  test('several prerequisites: one completed and one removed is NOT ready', () => {
    const { s, c, dependent, receipt, meeting } = world();
    let w = requires(requires(s, c, dependent, receipt), c, dependent, meeting);
    w = completeTask(w, c, 'task-2');
    w = removeEvent(w, c, 'evt-4');
    assert.equal(readinessOf(w, dependent), 'needsReview');
  });

  test('a pending blocker outranks a retired one: the live thing is still what she waits for', () => {
    const { s, c, dependent, form, meeting } = world();
    let w = requires(requires(s, c, dependent, form), c, dependent, meeting);
    w = removeEvent(w, c, 'evt-4');
    assert.equal(readinessOf(w, dependent), 'blocked');
    assert.deepEqual(blockersOf(w, dependent), [form]);
    assert.equal(unavailablePrerequisitesOf(w, dependent).length, 1);
  });

  test('several dependents of one removed prerequisite all say "review"', () => {
    const { s, c, meeting } = world();
    let w = requires(requires(s, c, { kind: 'task', id: 'task-1' }, meeting), c, { kind: 'task', id: 'task-3' }, meeting);
    w = removeEvent(w, c, 'evt-4');
    for (const id of ['task-1', 'task-3']) assert.equal(readinessOf(w, { kind: 'task', id }), 'needsReview');
  });
});

describe('HA-009 — history is preserved and the correction path exists', () => {
  test('removing the target does not rewrite, delete or re-point any dependency row', () => {
    const { s, c, dependent, meeting } = world();
    const linked = requires(s, c, dependent, meeting);
    const before = JSON.stringify(linked.dependencies);
    const removed = removeEvent(linked, c, 'evt-4');
    assert.equal(JSON.stringify(removed.dependencies), before);
    assert.equal(removed.dependencies[0].status, 'active');
  });

  test('retiring the EDGE (existing removeDependency) is the explicit correction; it is what makes the dependent ready', () => {
    const { s, c, dependent, meeting } = world();
    let w = removeEvent(requires(s, c, dependent, meeting), c, 'evt-4');
    assert.equal(readinessOf(w, dependent), 'needsReview');
    w = removeDependency(w, c, w.dependencies[0].id);
    assert.equal(readinessOf(w, dependent), 'ready');
    assert.equal(w.dependencies.length, 1, 'the edge row is kept, retired');
    assert.equal(w.dependencies[0].status, 'removed');
  });

  test('goal progress never counts a set-aside step as done, and says how many are gone', () => {
    const { s, c, meeting } = world();
    let w = addGoal(s, c, { title: 'Sort the school year' });
    const goal = { kind: 'goal', id: 'goal-5' };
    w = addDependency(w, c, { relation: 'part_of', from: meeting, to: goal }).state;
    w = addDependency(w, c, { relation: 'part_of', from: { kind: 'task', id: 'task-2' }, to: goal }).state;
    w = completeTask(w, c, 'task-2');
    w = removeEvent(w, c, 'evt-4');
    assert.deepEqual(goalProgress(w, 'goal-5'), { total: 2, done: 1, unavailable: 1, fraction: 0.5 });
  });
});

describe('HA-009 — restart, stale device and sync', () => {
  test('the standing survives a restart: it is derived from durable lifecycle state, not stored', () => {
    const { s, c, dependent, meeting } = world();
    const removed = removeEvent(requires(s, c, dependent, meeting), c, 'evt-4');
    const raw = encodeStoredState(removed, { appVersion: 'test', savedAt: '2026-09-21T15:00:00.000Z', writeSeq: 1 });
    const decoded = decodeStoredState(raw);
    assert.equal(decoded.kind, 'valid');
    assert.equal(readinessOf(decoded.state, dependent), 'needsReview');
    assert.deepEqual(unavailablePrerequisitesOf(decoded.state, dependent), [{ ref: meeting, cause: 'retired' }]);
  });

  test('a second device still holding the live target says "blocked"; the removal arriving by sync moves it to "review"', () => {
    const { s, c, dependent, meeting } = world();
    const deviceB = requires(s, c, dependent, meeting);
    assert.equal(readinessOf(deviceB, dependent), 'blocked');
    // the pulled row is the same event, now removed — exactly what apply.ts writes for a removed event
    const pulled = { ...deviceB, events: deviceB.events.map((e) => (e.id === 'evt-4' ? { ...e, status: 'removed' } : e)) };
    assert.equal(readinessOf(pulled, dependent), 'needsReview');
  });

  test('a stale reader that sees no such target treats it as missing, never as satisfied', () => {
    const { s, c, dependent, meeting } = world();
    const linked = requires(s, c, dependent, meeting);
    const orphaned = { ...linked, events: [] }; // impossible through the mutators; the defensive read must not say "done"
    assert.equal(readinessOf(orphaned, dependent), 'needsReview');
    assert.deepEqual(unavailablePrerequisitesOf(orphaned, dependent), [{ ref: meeting, cause: 'missing' }]);
  });
});
