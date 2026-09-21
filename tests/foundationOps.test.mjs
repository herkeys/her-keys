import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { acceptInterpretation, askClarification, canAccept, correctInterpretation, interpretationsOf, proposeInterpretation, recordArtifact, rejectInterpretation, retractSourceArtifact, supersedeInterpretation } from '../src/domain/interpretations.ts';
import { approveUnderAuthority, decideIntent, executionAuthorization, grantAuthority, intentLifecycle, pendingApprovals, proposeIntent, revokeAuthority, withdrawApproval } from '../src/domain/authorization.ts';
import { ACTION_CATEGORIES, CATEGORY_PROFILE, CONSEQUENCE_LEVELS, authorityCoverage, atLeastAsSerious, permittedMode } from '../src/domain/foundation/authorization.ts';
import { ANSWERABLE_FACETS, commitmentFacetsOf } from '../src/domain/foundation/commitment.ts';
import { addMoney, formatAmount, isWithinLimit, parseMoney, totalsOf } from '../src/domain/foundation/money.ts';
import { VALID_OUTCOMES, isValidOutcome } from '../src/domain/foundation/observation.ts';
import { findDependencyCycle } from '../src/domain/foundation/structure.ts';
import { addCategory } from '../src/domain/categories.ts';
import { captureNeedsMeItem, resolveNeedsMeItem } from '../src/domain/needsMe.ts';
import { appendObservation, observationsAbout } from '../src/domain/observations.ts';
import { completeOnboarding, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { completeOneMove, resolveOneMoveForToday } from '../src/domain/oneMove.ts';
import { addPerson, archivePerson, accept, acknowledge, decline, delegate, liveResponsibilityFor, needsMePersonally, observeUnacknowledged, reassign, returnToSelf, completeResponsibility, unacknowledgedResponsibilities } from '../src/domain/responsibility.ts';
import { addDependency, addGoal, addRecurrence, addSystemStep, blockersOf, capacityWindowFor, DEFAULT_CAPACITY, goalProgress, isBlocked, nextOccurrence, occurrencesOf, setCapacity, skipOccurrence, stepsInOrder, stepsOf } from '../src/domain/structure.ts';
import { addEvent, removeEvent } from '../src/domain/events.ts';
import { addTask, archiveTask, completeTask, updateTask } from '../src/domain/tasks.ts';
import { approveDailyLoadMove } from '../src/domain/dailyLoadDecisions.ts';
import { approveDropTask, approveMoveEvent } from '../src/domain/recommendationActions.ts';
import { addEvidence, confirmPattern, explain, proposePattern, reassessPattern } from '../src/domain/patterns.ts';
import { validateAppState } from '../src/domain/state.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { decodeStoredState, encodeStoredState } from '../src/persistence/envelope.ts';
import { TZ, DAY, MORNING, ctx, demoState, nyMs, onboardedState } from './support/fixtures.mjs';

const DIGEST = 'c'.repeat(64);
let n = 0;
const at = (ms = MORNING, today = DAY) => ({ nowMs: ms, today, createId: (p) => `${p}-${++n}` });
const real = () => {
  let s = createEmptyState(TZ);
  s = toggleOnboardingOption(toggleOnboardingOption(toggleOnboardingOption(s, 'goals', 'calmer-household'), 'strengths', 'cooking'), 'struggles', 'overcommitting');
  return completeOnboarding(s, at());
};
const valid = (state) => { const r = validateAppState(state); assert.equal(r.ok, true, JSON.stringify(r.issues)); return state; };
const withTask = (s, over = {}) => addTask(s, at(), { title: 'Pay the electric bill', categoryId: 'cat-money', dueDate: DAY, scope: 'household', ...over });
const lastTask = (s) => s.tasks[s.tasks.length - 1];

describe('B4-FE01-020 — money is exact', () => {
  test('parsing works on the digits, never a float, and refuses what it would have to round', () => {
    assert.deepEqual(parseMoney('35', 'USD', 'outflow'), { amountMinor: 3500, currency: 'USD', direction: 'outflow' });
    assert.equal(parseMoney('35.5', 'USD', 'outflow').amountMinor, 3550);
    assert.equal(parseMoney('0.10', 'USD', 'inflow').amountMinor, 10);
    assert.equal(parseMoney('35.001', 'USD', 'outflow'), null, 'a third decimal place is refused, not rounded');
    assert.equal(parseMoney('1200', 'JPY', 'outflow').amountMinor, 1200, 'a zero-decimal currency has no minor unit');
    assert.equal(parseMoney('12.5', 'JPY', 'outflow'), null);
    for (const bad of ['-5', '1e3', '$35', '', 'abc', '35.', '.5']) assert.equal(parseMoney(bad, 'USD', 'outflow'), null, bad);
  });

  test('0.1 + 0.2 is exactly 0.30 — because nothing here is ever a fraction', () => {
    const sum = addMoney(parseMoney('0.10', 'USD', 'outflow'), parseMoney('0.20', 'USD', 'outflow'));
    assert.equal(sum.amountMinor, 30);
    assert.equal(formatAmount(sum), '0.30');
    assert.equal(formatAmount({ amountMinor: 5, currency: 'USD' }), '0.05');
    assert.equal(formatAmount({ amountMinor: 1200, currency: 'JPY' }), '1200');
  });

  test('currencies and directions are never mixed or coerced; limits are per currency', () => {
    const usd = parseMoney('10', 'USD', 'outflow');
    assert.throws(() => addMoney(usd, parseMoney('10', 'EUR', 'outflow')), /cannot add/);
    assert.throws(() => addMoney(usd, parseMoney('10', 'USD', 'inflow')), /outflow to an inflow/);
    assert.equal(isWithinLimit(usd, { amountMinor: 1000, currency: 'USD' }), true);
    assert.equal(isWithinLimit(usd, { amountMinor: 999, currency: 'USD' }), false);
    assert.equal(isWithinLimit(usd, { amountMinor: 99999, currency: 'EUR' }), false, 'a different currency is never within the limit');
    assert.deepEqual(totalsOf([usd, parseMoney('5', 'USD', 'outflow'), parseMoney('7', 'EUR', 'inflow'), null]), { outflow: { USD: 1500 }, inflow: { EUR: 700 } });
    assert.throws(() => addMoney({ amountMinor: Number.MAX_SAFE_INTEGER, currency: 'USD', direction: 'outflow' }, usd), /exactly representable/);
  });

  test('the stored shape has no floating-point money anywhere: a fractional or negative amount is invalid state', () => {
    const state = withTask(real(), { value: parseMoney('35', 'USD', 'outflow') });
    valid(state);
    for (const amountMinor of [35.5, -1, 1e400]) {
      const bad = { ...state, tasks: [{ ...lastTask(state), value: { amountMinor, currency: 'USD', direction: 'outflow' } }] };
      assert.equal(validateAppState(bad).ok, false, String(amountMinor));
    }
  });
});

describe('B4-FE01-006 — behavioral history is recorded as it happens', () => {
  test('completing a task appends a fact; the mutable timestamp is no longer the only evidence', () => {
    let s = withTask(real());
    const id = lastTask(s).id;
    s = completeTask(s, at(MORNING + 3_600_000), id);
    const obs = observationsAbout(s, { kind: 'task', id });
    assert.deepEqual(obs.map((o) => o.outcome), ['completed']);
    assert.equal(obs[0].plannedDate, DAY, 'the day it was expected is kept, so lateness is measurable');
    assert.equal(obs[0].provenance.producer, 'user-action');
    valid(s);
  });

  test('archive, event removal and Needs Me resolution each record the outcome they represent', () => {
    let s = withTask(real());
    s = archiveTask(s, at(), lastTask(s).id);
    s = addEvent(s, at(), { title: 'Dentist', categoryId: 'cat-home', startsAt: '2026-09-17T14:00:00.000Z', endsAt: '2026-09-17T15:00:00.000Z', commitment: 'fixed', scope: 'household' });
    s = removeEvent(s, at(), s.events[0].id);
    s = captureNeedsMeItem(s, at(), { title: 'Call back' });
    s = resolveNeedsMeItem(s, s.needsMe[0].id, at());
    assert.deepEqual(s.observations.map((o) => `${o.about.kind}:${o.outcome}`), ['task:cancelled', 'event:cancelled', 'needsMe:completed']);
    valid(s);
  });

  test('moving a task to a LATER day is a deferral; moving it earlier, or editing its title, is not', () => {
    let s = withTask(real(), { plan: { kind: 'day', date: DAY } });
    const id = lastTask(s).id;
    s = updateTask(s, at(), id, { title: 'Pay the electric bill now' });
    s = updateTask(s, at(), id, { plan: { kind: 'day', date: '2026-09-15' } });
    assert.equal(s.observations.length, 0, 'a title edit and a move earlier are not deferrals');
    s = updateTask(s, at(), id, { plan: { kind: 'day', date: '2026-09-18' } });
    const [o] = s.observations;
    assert.deepEqual([o.outcome, o.plannedDate, o.toDate], ['deferred', '2026-09-15', '2026-09-18']);
  });

  test('One Move: selected, completed and cleared are all durable, and a cleared one outlives its removed row', () => {
    let s = withTask(real(), { durationMinutes: 10 });
    s = resolveOneMoveForToday(s, at());
    const id = s.oneMoves[0].id;
    assert.deepEqual(observationsAbout(s, { kind: 'oneMove', id }).map((o) => o.outcome), ['selected']);
    assert.equal(observationsAbout(s, { kind: 'oneMove', id })[0].provenance.producer, 'system-derived', 'the engine chose it');

    const cleared = archiveTask(s, at(), s.tasks[0].id);
    const after = resolveOneMoveForToday(cleared, at());
    assert.equal(after.oneMoves.length, 0, 'Build 3 removes the local record');
    assert.ok(observationsAbout(after, { kind: 'oneMove', id }).some((o) => o.outcome === 'cleared'), 'but the fact that it happened is kept');
    valid(after);

    const done = completeOneMove(s, at());
    assert.ok(observationsAbout(done, { kind: 'oneMove', id }).some((o) => o.outcome === 'completed'));
    assert.ok(observationsAbout(done, { kind: 'task', id: s.tasks[0].id }).some((o) => o.outcome === 'completed'), 'and the task it was');
  });

  test('accepting a Daily Load move records the deferral it caused, beside the ledger row', () => {
    const before = onboardedState();
    const moved = approveDailyLoadMove(before, ctx(), 'task-2');
    assert.equal(moved.actions.length, 1, 'the DECISION is in the immutable ledger');
    assert.equal(moved.actions[0].type, 'daily_load.move_task');
    const [o] = observationsAbout(moved, { kind: 'task', id: 'task-2' });
    assert.deepEqual([o.outcome, o.toDate], ['deferred', '2026-09-17'], 'what BECAME of the task is the observation');
    assert.equal(o.provenance.producer, 'demo-seed', 'demoState is a demo household, so nothing in it is real behaviour');
    assert.equal(moved.actions.length, before.actions.length + 1, 'and exactly one ledger row, not two');
    valid(moved);
  });

  test('the vocabulary is closed and checked: an outcome that means nothing for that kind is refused', () => {
    assert.equal(isValidOutcome('task', 'completed'), true);
    assert.equal(isValidOutcome('task', 'delegated'), false, 'a task is never delegated — a responsibility is');
    assert.equal(isValidOutcome('oneMove', 'missed'), false);
    assert.equal(isValidOutcome('responsibility', 'delegated'), true);
    assert.throws(() => appendObservation(real(), at(), { about: { kind: 'task', id: 'x' }, outcome: 'delegated' }), /not a meaningful outcome/);
    assert.ok(Object.values(VALID_OUTCOMES).every((list) => list.length > 0));
  });

  test('history is append-only: recording never edits an earlier observation', () => {
    let s = withTask(real());
    const id = lastTask(s).id;
    s = completeTask(s, at(), id);
    const first = s.observations[0];
    s = appendObservation(s, at(MORNING + 60_000), { about: { kind: 'task', id }, outcome: 'reopened' });
    assert.deepEqual(s.observations[0], first);
    assert.deepEqual(s.observations.map((o) => o.outcome), ['completed', 'reopened'], 'complete, reopen and re-complete leave a truthful trail');
  });
});

describe('B4-FE01-002/-003 — from a source to a row, with lineage', () => {
  const setup = () => {
    let s = real();
    const r = recordArtifact(s, at(), { kind: 'email', origin: 'user-submitted', provider: 'forward', contentDigest: DIGEST });
    return { s: r.state, artifact: r.artifact };
  };

  test('forwarding the same document twice stores it once and says so', () => {
    const { s, artifact } = setup();
    const again = recordArtifact(s, at(), { kind: 'email', origin: 'user-submitted', contentDigest: DIGEST });
    assert.equal(again.duplicate, true);
    assert.equal(again.artifact.id, artifact.id);
    assert.equal(again.state.sourceArtifacts.length, 1);
  });

  test('one email yields several structured readings, each naming the email, held outside canonical state', () => {
    let { s, artifact } = setup();
    for (const [kind, title] of [['event', 'Field trip'], ['task', 'Return the permission form'], ['task', 'Pay the $35 trip fee']]) {
      s = proposeInterpretation(s, at(), { artifactId: artifact.id, proposedKind: kind, title, startsAt: kind === 'event' ? '2026-09-25T14:00:00.000Z' : null, endsAt: kind === 'event' ? '2026-09-25T18:00:00.000Z' : null });
    }
    assert.equal(interpretationsOf(s, artifact.id).length, 3);
    assert.equal(s.tasks.length + s.events.length, 0, 'nothing became a household fact yet');
    assert.ok(interpretationsOf(s, artifact.id).every((r) => r.provenance.artifactId === artifact.id && r.provenance.confidence === 'possible'));
    valid(s);
  });

  test('a clarification is a durable pending question; her answer is a correction, and neither promotes anything', () => {
    let { s, artifact } = setup();
    s = proposeInterpretation(s, at(), { artifactId: artifact.id, proposedKind: 'task', title: 'Pick up the kids', clarification: 'which_day' });
    const id = s.interpretations[0].id;
    assert.equal(s.interpretations[0].state, 'clarifying');
    assert.equal(canAccept(s.interpretations[0], { categoryId: 'cat-kids' }).ok, false, 'not while a question is open');
    s = correctInterpretation(s, id, { title: 'Pick up the kids Thursday', dueDate: '2026-09-17' });
    assert.deepEqual([s.interpretations[0].state, s.interpretations[0].clarification, s.interpretations[0].dueDate], ['pending', null, '2026-09-17']);
    assert.equal(s.interpretations[0].provenance.confidence, 'possible', 'her correction edits the reading, not how sure Her Keys was');
    s = askClarification(s, id, 'which_child');
    assert.equal(s.interpretations[0].state, 'clarifying');
  });

  test('ACCEPTANCE: the row keeps the inference producer at established confidence — never user-action — and names its source', () => {
    let { s, artifact } = setup();
    s = proposeInterpretation(s, at(), { artifactId: artifact.id, proposedKind: 'task', title: 'Pay the $35 trip fee', dueDate: '2026-09-24', value: parseMoney('35', 'USD', 'outflow') });
    assert.equal(canAccept(s.interpretations[0], {}).reason, 'needs_category', 'she classifies at acceptance');
    assert.equal(acceptInterpretation(s, at(), s.interpretations[0].id, {}), s, 'without a category nothing happens');

    s = acceptInterpretation(s, at(), s.interpretations[0].id, { categoryId: 'cat-money' });
    const task = lastTask(s);
    assert.deepEqual(task.provenance, { producer: 'ai-inference', artifactId: artifact.id, confidence: 'established' });
    assert.notEqual(task.provenance.producer, 'user-action', 'she approved it; she did not state it');
    assert.deepEqual(task.value, { amountMinor: 3500, currency: 'USD', direction: 'outflow' });
    assert.deepEqual(s.interpretations[0].acceptedRef, { kind: 'task', id: task.id });
    assert.equal(s.interpretations[0].state, 'accepted');
    assert.ok(observationsAbout(s, { kind: 'interpretation', id: s.interpretations[0].id }).some((o) => o.outcome === 'accepted'));
    assert.equal(acceptInterpretation(s, at(), s.interpretations[0].id, { categoryId: 'cat-money' }), s, 'it cannot be accepted twice');
    valid(s);
  });

  test('an external observation accepted keeps ITS producer too — external is not inference is not user', () => {
    let { s, artifact } = setup();
    s = proposeInterpretation(s, at(), { artifactId: artifact.id, proposedKind: 'event', title: 'Piano recital', producer: 'import-sync', confidence: 'likely', startsAt: '2026-09-26T22:00:00.000Z', endsAt: '2026-09-26T23:00:00.000Z' });
    s = acceptInterpretation(s, at(), s.interpretations[0].id, { categoryId: 'cat-kids' });
    assert.deepEqual(s.events[0].provenance, { producer: 'import-sync', artifactId: artifact.id, confidence: 'established' });
  });

  test('reject and supersede: the reading is kept, decided, and reprocessing chains back to what it replaced', () => {
    let { s, artifact } = setup();
    s = proposeInterpretation(s, at(), { artifactId: artifact.id, proposedKind: 'needsMe', title: 'Some worry' });
    const first = s.interpretations[0].id;
    s = supersedeInterpretation(s, at(), first, { proposedKind: 'task', title: 'A better reading' });
    assert.equal(s.interpretations[0].state, 'superseded');
    assert.equal(s.interpretations[1].supersedesId, first);
    assert.equal(s.interpretations[1].interpretationVersion, 2);
    s = rejectInterpretation(s, at(), s.interpretations[1].id);
    assert.equal(s.interpretations[1].state, 'rejected');
    assert.ok(observationsAbout(s, { kind: 'interpretation', id: s.interpretations[1].id }).some((o) => o.outcome === 'declined'));
    assert.equal(rejectInterpretation(s, at(), s.interpretations[1].id), s, 'a decided reading is final');
    valid(s);
  });

  test('retraction marks the source withdrawn once; the readings and the rows already derived keep their lineage', () => {
    let { s, artifact } = setup();
    s = proposeInterpretation(s, at(), { artifactId: artifact.id, proposedKind: 'needsMe', title: 'x' });
    s = acceptInterpretation(s, at(), s.interpretations[0].id);
    s = retractSourceArtifact(s, at(MORNING + 1000), artifact.id);
    assert.notEqual(s.sourceArtifacts[0].retractedAt, null);
    assert.equal(retractSourceArtifact(s, at(MORNING + 9999), artifact.id).sourceArtifacts[0].retractedAt, s.sourceArtifacts[0].retractedAt);
    assert.equal(s.needsMe[0].provenance.artifactId, artifact.id);
    valid(s);
  });

  test('a reading needs a real artifact', () => {
    assert.equal(proposeInterpretation(real(), at(), { artifactId: 'artifact-nope', proposedKind: 'task', title: 'x' }).interpretations.length, 0);
  });
});

describe('B4-FE01-007..012 — authorization, consequence, intent, decision', () => {
  test('CONSEQUENCE: the five example actions are all distinguishable, and every category has a profile', () => {
    assert.deepEqual(Object.keys(CATEGORY_PROFILE).sort(), [...ACTION_CATEGORIES].sort());
    const profile = (c) => CATEGORY_PROFILE[c];
    const [reminder, delegation, schedule, appointment, payment] = ['internal_reminder', 'delegation_request', 'schedule_change', 'external_appointment', 'financial_action'].map(profile);
    assert.equal(new Set([reminder, delegation, schedule, appointment, payment].map((p) => `${p.consequence}/${p.reversibility}`)).size >= 4, true, 'they do not collapse into one');
    assert.deepEqual([reminder.consequence, reminder.reversibility], ['low', 'reversible']);
    assert.deepEqual([payment.consequence, payment.reversibility], ['critical', 'irreversible']);
    assert.notEqual(reminder.consequence, payment.consequence, 'moving a reminder and paying a bill are never the same to a rule');
  });

  test('an intent may be MORE serious than its category, never less', () => {
    assert.equal(atLeastAsSerious('critical', 'internal_reminder'), 'critical');
    assert.equal(atLeastAsSerious('low', 'financial_action'), 'critical', 'you cannot downgrade a payment');
    assert.equal(atLeastAsSerious(undefined, 'schedule_change'), 'moderate');
  });

  test('only she can grant authority, only outside a demo, and a standing financial permission must state how much', () => {
    assert.equal(grantAuthority(demoState(), at(), { category: 'schedule_change', mode: 'execute_authorized', persistent: true }).authorities.length, 0, 'a rehearsal cannot hold a permission');
    const s = grantAuthority(real(), at(), { category: 'schedule_change', mode: 'execute_authorized', persistent: true });
    assert.equal(s.authorities[0].provenance.producer, 'user-action');
    valid(s);
    const unbounded = { ...s, authorities: [{ ...s.authorities[0], category: 'financial_action', maxConsequence: 'critical' }] };
    assert.equal(validateAppState(unbounded).ok, false, 'unattended money needs a limit');
    const forged = { ...s, authorities: [{ ...s.authorities[0], provenance: { producer: 'ai-inference', artifactId: null, confidence: 'likely' } }] };
    assert.equal(validateAppState(forged).ok, false, 'a permission an inference wrote for itself is not a permission');
  });

  const coverage = (auth, intent, ctxIn = { categoryId: null, subjectMemberId: null }, when = '2026-09-16T12:00:00.000Z', used = new Set()) => authorityCoverage(auth, intent, ctxIn, when, used);
  const auth = (over = {}) => ({ id: 'a1', category: 'schedule_change', mode: 'execute_authorized', maxConsequence: 'moderate', persistent: true, categoryId: null, subjectMemberId: null, provider: null, maxAmountMinor: null, maxAmountCurrency: null, grantedAt: '2026-09-01T00:00:00.000Z', expiresAt: null, revokedAt: null, ...over });
  const intent = (over = {}) => ({ category: 'schedule_change', consequence: 'moderate', provider: null, amount: null, ...over });

  test('COVERAGE names the first reason an authority does not reach an intent', () => {
    assert.deepEqual(coverage(auth(), intent()), { covers: true });
    const refused = (a, i, c, w, u) => coverage(a, i, c, w, u).refusal;
    assert.equal(refused(auth({ revokedAt: '2026-09-10T00:00:00.000Z' }), intent()), 'revoked');
    assert.equal(refused(auth({ expiresAt: '2026-09-10T00:00:00.000Z' }), intent()), 'expired');
    assert.equal(refused(auth({ grantedAt: '2026-10-01T00:00:00.000Z' }), intent()), 'not_yet_granted');
    assert.equal(refused(auth({ category: 'task_change' }), intent()), 'wrong_category');
    assert.equal(refused(auth({ maxConsequence: 'low' }), intent()), 'consequence_exceeds_authority');
    assert.equal(refused(auth({ categoryId: 'cat-kids' }), intent(), { categoryId: 'cat-home', subjectMemberId: null }), 'outside_category_boundary');
    assert.equal(refused(auth({ subjectMemberId: 'child-1' }), intent(), { categoryId: null, subjectMemberId: 'child-2' }), 'outside_child_boundary');
    assert.equal(refused(auth({ provider: 'gcal' }), intent({ provider: 'outlook' })), 'outside_provider_boundary');
    assert.equal(refused(auth({ persistent: false }), intent(), undefined, undefined, new Set(['a1'])), 'already_used', 'one-time authority is spent by its first use');
    assert.equal(coverage(auth({ persistent: false }), intent()).covers, true);
  });

  test('an AMOUNT LIMIT is exact and per currency', () => {
    const a = auth({ category: 'financial_action', maxConsequence: 'critical', maxAmountMinor: 5000, maxAmountCurrency: 'USD' });
    const pay = (amountMinor, currency = 'USD') => intent({ category: 'financial_action', consequence: 'critical', amount: { amountMinor, currency, direction: 'outflow' } });
    assert.equal(coverage(a, pay(5000)).covers, true, 'exactly at the limit is inside it');
    assert.equal(coverage(a, pay(5001)).refusal, 'exceeds_amount_limit');
    assert.equal(coverage(a, pay(100, 'EUR')).refusal, 'exceeds_amount_limit', 'another currency is not covered');
  });

  test('permittedMode is the most autonomy any covering authority allows, and suggest when none does', () => {
    const list = [auth({ id: 'p', mode: 'prepare' }), auth({ id: 'x', mode: 'execute_authorized', revokedAt: '2026-09-02T00:00:00.000Z' }), auth({ id: 'k', mode: 'ask_approval' })];
    assert.deepEqual(permittedMode(list, intent(), { categoryId: null, subjectMemberId: null }, '2026-09-16T12:00:00.000Z'), { mode: 'ask_approval', authorityId: 'k' }, 'the revoked execute authority does not count');
    assert.deepEqual(permittedMode([], intent(), { categoryId: null, subjectMemberId: null }, '2026-09-16T12:00:00.000Z'), { mode: 'suggest', authorityId: null });
  });

  test('a proposal records its category profile and the autonomy allowed at that moment', () => {
    let s = grantAuthority(withTask(real()), at(), { category: 'schedule_change', mode: 'execute_authorized', persistent: true });
    const about = { kind: 'task', id: lastTask(s).id };
    s = proposeIntent(s, at(), { category: 'schedule_change', about, summaryCode: 'move_task_to_tomorrow' });
    assert.deepEqual([s.intents[0].consequence, s.intents[0].reversibility, s.intents[0].permittedMode], ['moderate', 'reversible', 'execute_authorized']);
    s = proposeIntent(s, at(), { category: 'financial_action', about, summaryCode: 'pay_bill', amount: parseMoney('142.10', 'USD', 'outflow') });
    assert.deepEqual([s.intents[1].consequence, s.intents[1].permittedMode], ['critical', 'suggest'], 'no authority covers a payment');
    assert.equal(proposeIntent(s, at(), { category: 'financial_action', about, summaryCode: 'x' }) === s, false, 'validated separately below');
    assert.equal(validateAppState({ ...s, intents: [{ ...s.intents[1], amount: null }] }).ok, false, 'a financial action states its amount');
    assert.equal(proposeIntent(s, at(), { category: 'task_change', about: { kind: 'task', id: 'nope' }, summaryCode: 'x' }), s, 'about a row that does not exist');
    valid(s);
  });

  test('one answer per intent; withdrawal is new evidence, not an edit', () => {
    let s = proposeIntent(real(), at(), { category: 'internal_reminder', summaryCode: 'nudge' });
    const id = s.intents[0].id;
    assert.equal(pendingApprovals(s, MORNING).length, 1);
    s = decideIntent(s, at(), id, 'approved');
    assert.equal(decideIntent(s, at(), id, 'declined'), s, 'a second answer changes nothing');
    assert.equal(pendingApprovals(s, MORNING).length, 0);
    const approved = s.decisions[0];
    s = withdrawApproval(s, at(), id);
    assert.deepEqual(s.decisions[0], approved, 'the approval is untouched');
    assert.equal(s.decisions[1].decision, 'withdrawn');
    assert.equal(withdrawApproval(s, at(), id), s);
    assert.equal(intentLifecycle(s, id).stage, 'withdrawn');
    valid(s);
    const two = { ...s, decisions: [s.decisions[0], { ...s.decisions[0], id: 'decision-dup', decision: 'declined' }] };
    assert.equal(validateAppState(two).ok, false, 'two devices approving one intent collide');
  });

  test('a standing authority approves as Her Keys acting on her earlier grant, never as her deciding now', () => {
    let s = grantAuthority(real(), at(), { category: 'internal_reminder', mode: 'execute_authorized', persistent: true });
    s = proposeIntent(s, at(), { category: 'internal_reminder', summaryCode: 'nudge' });
    s = approveUnderAuthority(s, at(), s.intents[0].id);
    assert.deepEqual([s.decisions[0].basis, s.decisions[0].provenance.producer, s.decisions[0].authorityId], ['standing_authority', 'automation', s.authorities[0].id]);
    let none = proposeIntent(real(), at(), { category: 'internal_reminder', summaryCode: 'nudge' });
    assert.equal(approveUnderAuthority(none, at(), none.intents[0].id), none, 'nothing authorized it');
    valid(s);
  });

  test('the lifecycle is DERIVED — proposed, approved, attempted, succeeded — from append-only rows', () => {
    let s = proposeIntent(real(), at(), { category: 'internal_reminder', summaryCode: 'nudge' });
    const id = s.intents[0].id;
    assert.deepEqual([intentLifecycle(s, id).stage, intentLifecycle(s, id).needsApproval], ['proposed', true]);
    s = decideIntent(s, at(), id, 'approved');
    assert.deepEqual([intentLifecycle(s, id).stage, intentLifecycle(s, id).needsApproval], ['approved', false]);
    const exec = { id: 'exec-1', intentId: id, decisionId: s.decisions[0].id, authorityId: null, attempt: 1, attemptedAt: '2026-09-16T14:05:00.000Z', provider: null, externalActionId: null, externalReferenceId: null, result: 'succeeded', errorClass: 'none', reversibility: 'reversible', compensationCode: null, compensatesExecutionId: null, createdAt: '2026-09-16T14:05:00.000Z', provenance: { producer: 'automation', artifactId: null, confidence: null }, scope: 'personal' };
    const out = (i, kind, observedAt) => ({ id: `out-${i}`, executionId: 'exec-1', kind, observedAt, createdAt: observedAt, provenance: { producer: 'automation', artifactId: null, confidence: null }, scope: 'personal' });
    s = { ...s, executions: [exec], outcomes: [out(1, 'delivered', '2026-09-16T14:06:00.000Z'), out(2, 'acknowledged', '2026-09-17T09:00:00.000Z'), out(3, 'completed', '2026-09-18T09:00:00.000Z')] };
    valid(s);
    const lc = intentLifecycle(s, id);
    assert.equal(lc.stage, 'succeeded');
    assert.deepEqual(lc.outcomes.map((o) => o.kind), ['delivered', 'acknowledged', 'completed'], 'one execution, many later observations, none editing the one before');
    const failed = { ...s, executions: [{ ...exec, result: 'failed', errorClass: 'transient' }] };
    assert.equal(intentLifecycle(failed, id).stage, 'failed');
    assert.equal(validateAppState({ ...s, executions: [{ ...exec, errorClass: 'transient' }] }).ok, false, 'a success cannot carry an error class');
    assert.equal(validateAppState({ ...s, executions: [{ ...exec, decisionId: null }] }).ok, false, 'an execution names the authorization it relied on');
  });

  test('SAFETY: an execution is authorized only by an approval that stands, or an execute-mode authority that covers it and is unspent', () => {
    let s = grantAuthority(real(), at(), { category: 'internal_reminder', mode: 'execute_authorized', persistent: false });
    s = proposeIntent(s, at(), { category: 'internal_reminder', summaryCode: 'nudge' });
    const id = s.intents[0].id;
    const base = { id: 'e1', intentId: id, decisionId: null, authorityId: null, attempt: 1, attemptedAt: '2026-09-16T14:05:00.000Z', result: 'succeeded' };
    assert.equal(executionAuthorization(s, base).reason, 'no_authorization', 'no authorization at all');
    assert.equal(executionAuthorization(s, { ...base, decisionId: 'ghost' }).reason, 'wrong_intent');

    const viaAuthority = { ...base, authorityId: s.authorities[0].id };
    assert.equal(executionAuthorization(s, viaAuthority).authorized, true);
    const spent = { ...s, executions: [{ ...viaAuthority, id: 'earlier' }] };
    assert.equal(executionAuthorization(spent, { ...viaAuthority, id: 'later', attempt: 2 }).reason, 'already_used');
    const revoked = revokeAuthority(s, at(MORNING - 1000), s.authorities[0].id);
    assert.equal(executionAuthorization(revoked, viaAuthority).reason, 'revoked');

    const askOnly = grantAuthority(real(), at(), { category: 'internal_reminder', mode: 'ask_approval', persistent: true });
    const asked = proposeIntent(askOnly, at(), { category: 'internal_reminder', summaryCode: 'n' });
    assert.equal(executionAuthorization(asked, { ...base, intentId: asked.intents[0].id, authorityId: asked.authorities[0].id }).reason, 'not_execute_mode', 'authority to ask is not authority to act');

    const declined = decideIntent(s, at(), id, 'declined');
    assert.equal(executionAuthorization(declined, { ...base, decisionId: declined.decisions[0].id }).reason, 'not_approved');
    const approved = decideIntent(s, at(), id, 'approved');
    assert.equal(executionAuthorization(approved, { ...base, decisionId: approved.decisions[0].id }).authorized, true);
    assert.equal(executionAuthorization(withdrawApproval(approved, at(), id), { ...base, decisionId: approved.decisions[0].id }).reason, 'not_approved', 'a withdrawn approval no longer authorizes');
  });

  test('the ActionRecord ledger is untouched: no new state can be smuggled into it, and its actor is still only the user', () => {
    const s = onboardedState();
    assert.equal(s.actions.length, 0);
    const forged = { ...s, actions: [{ id: 'act-1', type: 'daily_load.protect_item', logicalDate: DAY, createdAt: '2026-09-16T14:00:00.000Z', actor: 'automation', source: 'her_keys_recommendation', approval: 'approved', targetType: 'task', targetId: 'task-1', reason: { code: 'user_requested_protection' }, before: { commitment: 'flexible' }, after: { commitment: 'fixed' }, scope: 'personal' }] };
    assert.equal(validateAppState(forged).ok, false, 'the decision ledger records HER decisions; automation lives beside it');
  });
});

describe('B4-FE01-013/-014 — people and the responsibility lifecycle', () => {
  const setup = () => {
    let s = withTask(real(), { title: 'Pick up Ben from soccer' });
    s = addPerson(s, at(), { displayName: 'Grandma June', relationship: 'grandparent', channel: 'sms' });
    return { s, about: { kind: 'task', id: lastTask(s).id }, person: { kind: 'person', id: s.people[0].id } };
  };

  test('a person is not a household member: they have a name, a relationship and a channel — no account, no contact details', () => {
    const { s } = setup();
    assert.deepEqual(Object.keys(s.people[0]).sort(), ['channel', 'createdAt', 'displayName', 'id', 'provenance', 'relationship', 'scope', 'status', 'updatedAt']);
    assert.equal(s.people[0].scope, 'personal', 'owner-private');
    assert.equal(s.children.length, 0, 'membership is untouched');
    valid(s);
  });

  test('the whole lifecycle, each step recorded: requested, acknowledged, accepted, completed', () => {
    let { s, about, person } = setup();
    s = delegate(s, at(), { about, to: person, ackWithinMinutes: 60 });
    const id = s.responsibilities[0].id;
    assert.equal(s.responsibilities[0].state, 'requested');
    s = acknowledge(s, at(MORNING + 60_000), id);
    s = accept(s, at(MORNING + 120_000), id);
    s = completeResponsibility(s, at(MORNING + 900_000), id);
    assert.deepEqual(s.responsibilities[0].state, 'completed');
    assert.deepEqual(observationsAbout(s, { kind: 'responsibility', id }).map((o) => o.outcome), ['delegated', 'acknowledged', 'accepted', 'completed']);
    valid(s);
  });

  test('DID IT TAKE THE LOAD OFF? It stops needing her only when she says so — and comes back if unanswered or refused', () => {
    let { s, about, person } = setup();
    assert.equal(needsMePersonally(s, about, MORNING), null, 'nothing states whether it needs her');
    s = delegate(s, at(), { about, to: person, ackWithinMinutes: 30 });
    const id = s.responsibilities[0].id;
    assert.equal(needsMePersonally(s, about, MORNING), true, 'a request that is only out still needs her');
    const later = MORNING + 45 * 60_000;
    assert.equal(unacknowledgedResponsibilities(s, later).length, 1);
    assert.equal(needsMePersonally(s, about, later), true, 'unanswered past its deadline: it ESCALATES');

    const accepted = accept(s, at(later), id, false);
    assert.equal(needsMePersonally(accepted, about, later), false, 'accepted, and she says the load has left');
    assert.equal(needsMePersonally(accept(s, at(later), id, true), about, later), true, 'accepted but she still needs to be there');

    const refused = decline(s, at(later), id);
    assert.equal(needsMePersonally(refused, about, later), true, 'declined: hers again');
    const back = returnToSelf(accepted, at(later), id);
    assert.equal(back.responsibilities[0].responsibleKind, 'self');
    assert.equal(needsMePersonally(back, about, later), true, 'returned: hers again');
  });

  test('a missed acknowledgement is a durable observation exactly once — never invented, never repeated', () => {
    let { s, about, person } = setup();
    s = delegate(s, at(), { about, to: person, ackWithinMinutes: 30 });
    assert.equal(observeUnacknowledged(s, at(MORNING + 10 * 60_000)), s, 'not yet due');
    const due = at(MORNING + 45 * 60_000);
    const once = observeUnacknowledged(s, due);
    assert.equal(once.observations.filter((o) => o.outcome === 'unacknowledged').length, 1);
    assert.equal(once.observations.at(-1).provenance.producer, 'system-derived', 'Her Keys saw it; she did not do it');
    assert.equal(observeUnacknowledged(once, due).observations.length, once.observations.length);
  });

  test('one item never has two owners; reassignment closes the earlier handoff and chains to it', () => {
    let { s, about, person } = setup();
    s = addPerson(s, at(), { displayName: 'Neighbor Sam', relationship: 'neighbor' });
    s = delegate(s, at(), { about, to: person });
    assert.equal(delegate(s, at(), { about, to: { kind: 'person', id: s.people[1].id } }), s, 'already handed off');
    const first = s.responsibilities[0].id;
    s = reassign(s, at(), first, { kind: 'person', id: s.people[1].id });
    assert.equal(s.responsibilities[0].state, 'returned');
    assert.equal(s.responsibilities[1].previousResponsibilityId, first);
    assert.equal(liveResponsibilityFor(s, about).id, s.responsibilities[1].id);
    assert.ok(observationsAbout(s, { kind: 'responsibility', id: first }).some((o) => o.outcome === 'reassigned'));
    valid(s);
    const two = { ...s, responsibilities: s.responsibilities.map((r) => ({ ...r, state: 'requested', responsibleKind: 'person', responsiblePersonId: s.people[0].id, responsibleChildId: null, returnedAt: null })) };
    assert.equal(validateAppState(two).ok, false, 'two live owners are refused');
  });

  test('a delegate must exist, and the thing delegated must exist', () => {
    const { s, about } = setup();
    assert.equal(delegate(s, at(), { about, to: { kind: 'person', id: 'nobody' } }), s);
    assert.equal(delegate(s, at(), { about: { kind: 'task', id: 'nothing' }, to: { kind: 'person', id: s.people[0].id } }), s);
  });

  test('invalid reassignment is atomic and an archived person cannot receive new work', () => {
    let { s, about, person } = setup();
    s = delegate(s, at(), { about, to: person });
    const assigned = s;
    const id = s.responsibilities[0].id;

    assert.equal(reassign(s, at(), id, { kind: 'person', id: 'missing' }), assigned, 'the old handoff remains live');
    assert.equal(reassign(s, at(), id, person, -1), assigned, 'an invalid deadline cannot partially close it');

    const archived = archivePerson(s, at(), person.id);
    assert.equal(reassign(archived, at(), id, person), archived, 'archived people cannot receive reassigned work');
    const returned = returnToSelf(archived, at(), id);
    assert.equal(delegate(returned, at(), { about, to: person }), returned, 'archived people cannot receive a new request');
  });

  test('an explicit zero-minute acknowledgement window is due immediately', () => {
    let { s, about, person } = setup();
    s = delegate(s, at(), { about, to: person, ackWithinMinutes: 0 });
    assert.equal(s.responsibilities[0].ackDueAt, new Date(MORNING).toISOString());
  });
});

describe('B4-FE01-017/-018/-021/-022/-016 — dependencies, recurrence, goals, steps, capacity', () => {
  test('ONE dependency convention across domains: requires, part_of, alternative_to — and a cycle is refused', () => {
    let s = withTask(real(), { title: 'Sign the form' });
    s = withTask(s, { title: 'Pay the fee' });
    s = addEvent(s, at(), { title: 'Field trip', categoryId: 'cat-kids', startsAt: '2026-09-25T14:00:00.000Z', endsAt: '2026-09-25T18:00:00.000Z', commitment: 'fixed', scope: 'household' });
    const [form, fee] = s.tasks.map((t) => ({ kind: 'task', id: t.id }));
    const trip = { kind: 'event', id: s.events[0].id };
    ({ state: s } = addDependency(s, at(), { relation: 'requires', from: trip, to: form }));
    ({ state: s } = addDependency(s, at(), { relation: 'requires', from: trip, to: fee }));
    assert.deepEqual(blockersOf(s, trip), [form, fee], 'a cross-domain dependency: an event waits on two tasks');
    s = completeTask(s, at(), form.id);
    assert.deepEqual(blockersOf(s, trip), [fee], 'finishing a prerequisite releases it');
    assert.equal(isBlocked(s, trip), true);

    assert.equal(addDependency(s, at(), { relation: 'requires', from: form, to: form }).refusal, 'self');
    assert.equal(addDependency(s, at(), { relation: 'requires', from: trip, to: fee }).refusal, 'duplicate');
    assert.equal(addDependency(s, at(), { relation: 'requires', from: trip, to: { kind: 'task', id: 'ghost' } }).refusal, 'missing_endpoint');
    assert.equal(addDependency(s, at(), { relation: 'requires', from: fee, to: trip }).refusal, 'cycle', 'A needs B needs A is a deadlock');
    valid(s);
    const cycle = findDependencyCycle([{ relation: 'requires', status: 'active', from: form, to: fee }, { relation: 'part_of', status: 'active', from: fee, to: form }]);
    assert.ok(cycle && cycle.length === 3, 'part_of edges take part in ordering too');
    assert.equal(findDependencyCycle([{ relation: 'alternative_to', status: 'active', from: form, to: fee }, { relation: 'alternative_to', status: 'active', from: fee, to: form }]), null, 'alternatives are not an ordering');
  });

  test('decomposition: a goal, its steps (part_of), and a low-energy alternative; progress is DERIVED', () => {
    let s = addGoal(real(), at(), { title: 'Get the garage cleared' });
    const goal = { kind: 'goal', id: s.goals[0].id };
    for (const title of ['Sort donations', 'Book the dump run', 'Sweep']) {
      s = withTask(s, { title, dueDate: null });
      ({ state: s } = addDependency(s, at(), { relation: 'part_of', from: { kind: 'task', id: lastTask(s).id }, to: goal, provenance: { producer: 'ai-inference', artifactId: null, confidence: 'possible' } }));
    }
    assert.equal(stepsOf(s, goal).length, 3);
    assert.deepEqual(goalProgress(s, goal.id), { total: 3, done: 0, unavailable: 0, fraction: 0 });
    s = completeTask(s, at(), stepsOf(s, goal)[0].id);
    assert.deepEqual([goalProgress(s, goal.id).done, goalProgress(s, goal.id).fraction], [1, 1 / 3]);
    assert.equal(s.dependencies[0].provenance.producer, 'ai-inference', 'a generated relationship says so');
    assert.equal(goalProgress(addGoal(real(), at(), { title: 'Empty' }), 'x').fraction, null, 'no steps: progress is unknown, not zero');
    valid(s);
  });

  test('recurrence is ONE convention: daily, weekly, monthly (clamped), yearly — and derived, never stored', () => {
    const rule = (over) => ({ trigger: 'schedule', frequency: 'weekly', interval: 1, byWeekday: null, byMonthDay: null, anchorDate: '2026-09-14', endsOn: null, occurrenceCount: null, ...over });
    assert.deepEqual(occurrencesOf(rule({ frequency: 'daily', interval: 3 }), '2026-09-14', '2026-09-24'), ['2026-09-14', '2026-09-17', '2026-09-20', '2026-09-23']);
    assert.deepEqual(occurrencesOf(rule({ byWeekday: [1, 3] }), '2026-09-14', '2026-09-24'), ['2026-09-14', '2026-09-16', '2026-09-21', '2026-09-23']);
    assert.deepEqual(occurrencesOf(rule({ frequency: 'monthly', byMonthDay: 31, anchorDate: '2026-01-31' }), '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'], 'the 31st clamps to the last day of a short month');
    assert.deepEqual(occurrencesOf(rule({ frequency: 'yearly', anchorDate: '2024-02-29' }), '2024-01-01', '2028-12-31'), ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
    assert.equal(occurrencesOf(rule({ trigger: 'manual', frequency: null }), '2026-09-14', '2026-12-31').length, 0, 'a manual rule never fires on its own');
    assert.deepEqual(occurrencesOf(rule({ frequency: 'daily', occurrenceCount: 2 }), '2026-09-14', '2026-12-31'), ['2026-09-14', '2026-09-15']);
    assert.deepEqual(occurrencesOf(rule({ frequency: 'daily', endsOn: '2026-09-15' }), '2026-09-14', '2026-12-31'), ['2026-09-14', '2026-09-15']);
    assert.deepEqual(
      occurrencesOf(rule({ frequency: 'daily', anchorDate: '2010-01-01' }), '2026-09-14', '2026-09-16'),
      ['2026-09-14', '2026-09-15', '2026-09-16'],
      'an old active rule does not silently stop at an internal iteration guard',
    );
  });

  test('a routine with a rule: its next occurrence skips a recorded exception, and the exception is history, not an edit', () => {
    let s = real();
    s = { ...s, systems: [{ id: 'sys-1', name: 'Sunday reset', description: '', categoryId: 'cat-home', subjectMemberId: null, automationMode: 'manual', effortMinutes: 20, energyDemand: null, provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'household' }] };
    const about = { kind: 'system', id: 'sys-1' };
    s = addRecurrence(s, at(), about, { frequency: 'weekly', byWeekday: [0], anchorDate: '2026-09-13' });
    assert.equal(addRecurrence(s, at(), about, { frequency: 'daily', anchorDate: '2026-09-13' }), s, 'one active rule per thing');
    const rule = s.recurrences[0];
    assert.equal(nextOccurrence(s, rule, '2026-09-14'), '2026-09-20');
    s = skipOccurrence(s, at(), about, '2026-09-20');
    assert.equal(nextOccurrence(s, rule, '2026-09-14'), '2026-09-27', 'this Sunday is an exception');
    assert.deepEqual(s.recurrences[0], rule, 'the rule itself was not edited');
    assert.equal(nextOccurrence({ ...s, recurrences: [{ ...rule, status: 'paused' }] }, { ...rule, status: 'paused' }, '2026-09-14'), null);

    const fiveYearRule = { ...rule, frequency: 'yearly', interval: 5, byWeekday: null, anchorDate: '2020-09-20' };
    assert.equal(nextOccurrence(s, fiveYearRule, '2026-09-14'), '2030-09-20', 'the next valid interval is not hidden by a fixed two-year horizon');
    valid(s);
    assert.equal(validateAppState({ ...s, recurrences: [{ ...rule, byMonthDay: 5 }] }).ok, false, 'a day of the month belongs to a monthly rule');
  });

  test('system steps keep their order, and capacity overrides fall back to the shipped defaults', () => {
    let s = { ...real(), systems: [{ id: 'sys-1', name: 'Bill envelope', description: '', categoryId: 'cat-money', subjectMemberId: null, automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'household' }] };
    for (const title of ['Gather', 'Sort', 'Pay']) s = addSystemStep(s, at(), 'sys-1', { title, effortMinutes: 5 });
    assert.deepEqual(stepsInOrder(s, 'sys-1').map((x) => x.title), ['Gather', 'Sort', 'Pay']);
    assert.equal(addSystemStep(s, at(), 'ghost', { title: 'x' }), s);
    valid(s);

    assert.deepEqual(capacityWindowFor(s), DEFAULT_CAPACITY, 'no profile: the constants Daily Load has always used');
    s = setCapacity(s, at(), { dayEndMinutes: 20 * 60 });
    assert.deepEqual(capacityWindowFor(s), { ...DEFAULT_CAPACITY, dayEndMinutes: 1200 }, 'only what she overrode changes');
    assert.equal(s.capacity.dayStartMinutes, null, 'and what she did not set stays unknown');
    valid(s);
    assert.equal(validateAppState({ ...s, capacity: { ...s.capacity, dayStartMinutes: 1300, dayEndMinutes: 600 } }).ok, false);
  });
});

describe('B4-FE01-015/-016 — one facet contract across kinds', () => {
  test('every kind answers through the same shape, and says which questions it can answer at all', () => {
    const task = { durationMinutes: 30, commitment: 'flexible', dueDate: '2026-09-20', dueAt: null, earliestStartAt: '2026-09-18T13:00:00.000Z', latestFinishAt: '2026-09-20T22:00:00.000Z', splittable: true, minChunkMinutes: 10, preferredTimeOfDay: 'evening', energyDemand: 'low', consequence: 'high', needsMePersonally: true, travelMinutesBefore: 15, travelMinutesAfter: null, preparationMinutes: 5, value: parseMoney('35', 'USD', 'outflow') };
    const event = { startsAt: '2026-09-25T14:00:00.000Z', endsAt: '2026-09-25T16:30:00.000Z', commitment: 'fixed', travelMinutesBefore: 20, travelMinutesAfter: 20, preparationMinutes: null, consequence: 'moderate', energyDemand: null, needsMePersonally: null, value: null };
    const facets = ['task', 'event', 'meal', 'system'].map((kind) => Object.keys(commitmentFacetsOf({ kind, row: kind === 'task' ? task : kind === 'event' ? event : kind === 'meal' ? { date: '2026-09-20', prepMinutes: 40 } : { effortMinutes: 20 } })));
    assert.ok(facets.every((keys) => JSON.stringify(keys) === JSON.stringify(facets[0])), 'the same shape whatever the kind');

    const t = commitmentFacetsOf({ kind: 'task', row: task });
    assert.deepEqual([t.effortMinutes, t.flexibility, t.splittable, t.consequence, t.value.amountMinor], [30, 'flexible', true, 'high', 3500]);
    assert.deepEqual(t.transition, { before: 15, after: null, preparation: 5 });
    assert.equal(commitmentFacetsOf({ kind: 'event', row: event }).effortMinutes, 150, 'an event\'s effort is its own length');
    assert.equal(commitmentFacetsOf({ kind: 'meal', row: { date: '2026-09-20', prepMinutes: 40 } }).effortMinutes, 40);
    assert.equal(commitmentFacetsOf({ kind: 'system', row: { effortMinutes: null } }).effortMinutes, null, 'unknown stays unknown');
    assert.ok(ANSWERABLE_FACETS.task.includes('value') && !ANSWERABLE_FACETS.system.includes('value'), 'null can mean "this kind never says"');
  });

  test('NULL MEANS NOT KNOWN: a freshly captured task invents no estimate, window, energy or consequence', () => {
    const f = commitmentFacetsOf({ kind: 'task', row: lastTask(withTask(real())) });
    for (const key of ['dueAt', 'earliestStartAt', 'latestFinishAt', 'splittable', 'minChunkMinutes', 'preferredTimeOfDay', 'energyDemand', 'consequence', 'needsMePersonally', 'transition', 'value']) {
      assert.equal(f[key], null, key);
    }
  });

  test('a scheduling window must open before it closes, and a chunk cannot outlast the task', () => {
    const s = withTask(real(), { durationMinutes: 30 });
    const t = lastTask(s);
    const bad = (over) => validateAppState({ ...s, tasks: [{ ...t, ...over }] }).ok;
    assert.equal(bad({ earliestStartAt: '2026-09-20T10:00:00.000Z', latestFinishAt: '2026-09-19T10:00:00.000Z' }), false);
    assert.equal(bad({ splittable: true, minChunkMinutes: 45 }), false);
    assert.equal(bad({ splittable: false, minChunkMinutes: 10 }), false, 'a chunk belongs to a task that can be split');
    assert.equal(bad({ splittable: true, minChunkMinutes: 10 }), true);
  });
});

describe('B4-FE01-023/-024 — patterns stand on observations; confidence moves only through the boundary', () => {
  const observed = () => {
    let s = real();
    const ids = [];
    for (const [i, day] of ['2026-09-08', '2026-09-15', '2026-09-22'].entries()) {
      s = withTask(s, { title: `Laundry ${i}`, dueDate: day });
      s = appendObservation(s, at(MORNING, day), { about: { kind: 'task', id: lastTask(s).id }, outcome: 'skipped', plannedDate: day });
      ids.push(s.observations.at(-1).id);
    }
    return { s, ids };
  };

  test('a pattern is an inference at "possible", standing on the observations it names, and never a stored fact', () => {
    const { s: base, ids } = observed();
    const s = proposePattern(base, at(), { kind: 'deferral', weekday: 2, timeBucket: 'evening', observationIds: ids.slice(0, 1), code: 'repeated_deferral' });
    const p = s.patterns[0];
    assert.equal(p.provenance.producer, 'ai-inference');
    assert.equal(p.provenance.confidence, 'possible', 'one sighting is not a pattern');
    assert.equal(explain(s, { kind: 'pattern', id: p.id }).length, 1);
    assert.equal(explain(s, { kind: 'pattern', id: p.id })[0].support.kind, 'observation');
    valid(s);
  });

  test('confidence rises with INDEPENDENT evidence only: three separate days reach likely; repeats of one day do not', () => {
    const { s: base, ids } = observed();
    const three = proposePattern(base, at(), { kind: 'deferral', observationIds: ids });
    assert.equal(three.patterns[0].provenance.confidence, 'likely');
    assert.notEqual(three.patterns[0].provenance.confidence, 'established', 'evidence alone never establishes');

    let sameDay = appendObservation(base, at(MORNING, '2026-09-08'), { about: { kind: 'task', id: base.tasks[0].id }, outcome: 'skipped', plannedDate: '2026-09-08' });
    sameDay = appendObservation(sameDay, at(MORNING + 1000, '2026-09-08'), { about: { kind: 'task', id: base.tasks[0].id }, outcome: 'missed', plannedDate: '2026-09-08' });
    const dup = proposePattern(sameDay, at(), { kind: 'deferral', observationIds: sameDay.observations.slice(-2).map((o) => o.id) });
    assert.equal(dup.patterns[0].provenance.confidence, 'possible', 'one producer repeating itself on one day is one sighting');
  });

  test('PERSISTENCE NEVER PROMOTES: a stored pattern reads back at exactly its level, on both sides of a round trip', () => {
    const { s: base, ids } = observed();
    const s = proposePattern(base, at(), { kind: 'deferral', observationIds: ids.slice(0, 1) });
    const before = s.patterns[0].provenance;
    const raw = encodeStoredState(s, { appVersion: 't', savedAt: '2026-09-18T12:00:00.000Z', writeSeq: 1 });
    const back = decodeStoredState(raw);
    assert.equal(back.kind, 'valid');
    assert.deepEqual(back.state.patterns[0].provenance, before);
    assert.equal(reassessPattern(back.state, at(), back.state.patterns[0].id).patterns[0].provenance.confidence, 'possible', 'recomputing from the same evidence gives the same answer on every device');
  });

  test('only she can establish it, and doing so confirms it; a confirmed pattern cannot be forged', () => {
    const { s: base, ids } = observed();
    let s = proposePattern(base, at(), { kind: 'deferral', observationIds: ids });
    s = confirmPattern(s, at(), s.patterns[0].id);
    assert.deepEqual([s.patterns[0].status, s.patterns[0].provenance.confidence], ['confirmed', 'established']);
    valid(s);
    const forged = { ...s, patterns: [{ ...s.patterns[0], status: 'candidate' }] };
    assert.equal(validateAppState(forged).ok, false, 'established but unconfirmed');
    const fake = { ...s, patterns: [{ ...s.patterns[0], provenance: { producer: 'user-action', artifactId: null, confidence: null } }] };
    assert.equal(validateAppState(fake).ok, false, 'a pattern is an inference');
  });

  test('a pattern needs real evidence: an unknown observation creates nothing', () => {
    assert.equal(proposePattern(real(), at(), { kind: 'deferral', observationIds: ['obs-ghost'] }).patterns.length, 0);
    assert.equal(addEvidence(real(), at(), { for: { kind: 'pattern', id: 'ghost' }, support: { kind: 'task', id: 'x' }, code: 'deadline' }).evidenceLinks.length, 0);
  });
});
