import assert from 'node:assert/strict';
import { addTask } from '../../src/domain/tasks.ts';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { decodeStoredState, encodeStoredState } from '../../src/persistence/envelope.ts';
import { DAY, MORNING, TZ } from './fixtures.mjs';

/** Shared by the acceptance suites: the same household, the same clock, the same two guarantees about every row. */

let n = 0;
export const at = (ms = MORNING, today = DAY) => ({ nowMs: ms, today, createId: (p) => `${p}-${++n}` });
export const USER = { producer: 'user-action', artifactId: null, confidence: null };
export const AUTOMATION = { producer: 'automation', artifactId: null, confidence: null };
export const INFER = (level = 'possible', artifactId = null) => ({ producer: 'ai-inference', artifactId, confidence: level });
export const DIGEST = (c) => c.repeat(64);
export const ref = (kind, id) => ({ kind, id });

export const real = () => {
  let s = createEmptyState(TZ);
  s = toggleOnboardingOption(toggleOnboardingOption(toggleOnboardingOption(s, 'goals', 'calmer-household'), 'strengths', 'cooking'), 'struggles', 'overcommitting');
  return completeOnboarding(s, at());
};

/** Valid, and identical after a save and a reload — the two things every future row must be. */
export const survives = (state, label = '') => {
  const verdict = validateAppState(state);
  assert.equal(verdict.ok, true, `${label} is invalid state: ${verdict.ok ? '' : verdict.issues.slice(0, 3).join('; ')}`);
  const raw = encodeStoredState(state, { appVersion: 'acceptance', savedAt: '2026-09-16T12:00:00.000Z', writeSeq: 1 });
  const back = decodeStoredState(raw);
  assert.equal(back.kind, 'valid', `${label} did not decode`);
  assert.deepEqual(back.state, state, `${label} changed across a save and a reload`);
  return state;
};

export const withTask = (s, over = {}) => addTask(s, at(), { title: 'A task', categoryId: 'cat-home', dueDate: null, scope: 'household', ...over });
export const lastTask = (s) => s.tasks[s.tasks.length - 1];

/** A server-written execution, as a device would hold it after pulling it. */
export const execution = (over = {}) => ({
  id: 'exec-1', intentId: 'intent-x', decisionId: null, authorityId: null, attempt: 1, attemptedAt: '2026-09-16T14:05:00.000Z', provider: null,
  externalActionId: null, externalReferenceId: null, result: 'succeeded', errorClass: 'none', reversibility: 'reversible', compensationCode: null,
  compensatesExecutionId: null, createdAt: '2026-09-16T14:05:00.000Z', provenance: AUTOMATION, scope: 'personal', ...over,
});
export const outcome = (i, executionId, kind, observedAt) => ({ id: `out-${i}`, executionId, kind, observedAt, createdAt: observedAt, provenance: AUTOMATION, scope: 'personal' });
