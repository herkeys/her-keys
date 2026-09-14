import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { approveDailyLoadMove } from '../src/domain/dailyLoadDecisions.ts';
import { validateAppState } from '../src/domain/state.ts';
import { decodeStoredState } from '../src/persistence/envelope.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { TZ, ctx, demoState, onboardedState } from './support/fixtures.mjs';

/** Validates a demo state after one change, returning the failure reason or 'ok'. */
const verdict = (change) => {
  const state = structuredClone(onboardedState());
  change(state);
  const result = validateAppState(state);
  return result.ok ? 'ok' : result.reason;
};

describe('Schema v1 validation', () => {
  test('the demo household and a real empty household are both valid', () => {
    assert.equal(validateAppState(demoState()).ok, true);
    assert.equal(validateAppState(onboardedState()).ok, true);
    assert.equal(validateAppState(createEmptyState(TZ)).ok, true);
  });

  test('shape problems are rejected', () => {
    const cases = {
      'unknown top-level field': (s) => (s.extra = true),
      'partial snapshot — tasks missing': (s) => delete s.tasks,
      'collection of the wrong type': (s) => (s.events = 'not a list'),
      'unknown timezone': (s) => (s.user.timezone = 'Mars/Olympus_Mons'),
      'impossible instant': (s) => (s.events[0].startsAt = '2026-02-30T10:00:00.000Z'),
      'instant with an offset instead of UTC': (s) => (s.events[0].startsAt = '2026-09-16T09:00:00-04:00'),
      'impossible calendar date': (s) => (s.tasks[0].dueDate = '2026-02-30'),
      'event ending before it starts': (s) => (s.events[0].endsAt = s.events[0].startsAt),
      'negative duration': (s) => (s.tasks[0].durationMinutes = -5),
      'fractional duration': (s) => (s.tasks[0].durationMinutes = 10.5),
      'id that could shadow an object prototype key': (s) => (s.tasks[0].id = '__proto__'),
      'unknown plan kind': (s) => (s.tasks[0].plan = { kind: 'someday' }),
      'withheld One Move that names a move': (s) => (s.oneMoves[0] = { ...s.oneMoves[0], status: 'withheld' }),
      'completed One Move without a completion time': (s) => (s.oneMoves[0] = { ...s.oneMoves[0], status: 'completed' }),
      'presentation field sneaking into a category': (s) => (s.categories[0].color = '#F2E8D4'),
    };
    for (const [name, change] of Object.entries(cases)) assert.equal(verdict(change), 'invalid_state', name);
  });

  test('relationship problems are rejected', () => {
    const cases = {
      'duplicate task id': (s) => (s.tasks[1].id = s.tasks[0].id),
      'child-scoped task without a child': (s) => (s.tasks[2].subjectMemberId = null),
      'subject that is not a household member': (s) => (s.events[2].subjectMemberId = 'child-9'),
      'two One Move decisions for one day': (s) => s.oneMoves.push({ ...s.oneMoves[0], id: 'onemove-duplicate' }),
      'duplicate onboarding answer': (s) => s.onboarding.goalIds.push(s.onboarding.goalIds[0]),
    };
    for (const [name, change] of Object.entries(cases)) assert.equal(verdict(change), 'integrity_violation', name);
  });

  test('an action record must point at facts that exist', () => {
    const moved = approveDailyLoadMove(onboardedState(), ctx(), 'task-2');
    const broken = { ...moved, actions: moved.actions.map((a) => ({ ...a, targetId: 'task-999' })) };
    const result = validateAppState(broken);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'integrity_violation');
  });

  test('a stored __proto__ key is rejected and never reaches Object.prototype', () => {
    const state = demoState();
    const raw = `{"schemaVersion":1,"appVersion":"t","savedAt":"2026-09-16T12:00:00.000Z","writeSeq":1,"data":{"__proto__":{"polluted":true},${JSON.stringify(state).slice(1)}}`;
    const decoded = decodeStoredState(raw);

    assert.equal(decoded.kind, 'invalid');
    assert.equal(decoded.reason, 'invalid_state');
    assert.equal({}.polluted, undefined);
  });

  test('validation issues name paths and ids, never stored values', () => {
    const state = structuredClone(demoState());
    state.user.displayName = 12345;
    state.tasks[0].title = { secret: 'Private note about the custody hearing' };
    const result = validateAppState(state);

    assert.equal(result.ok, false);
    assert.doesNotMatch(result.issues.join('\n'), /custody|Private note/);
  });
});
