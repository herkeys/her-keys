import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addCategory } from '../src/domain/categories.ts';
import { acceptInterpretation, interpretationsOf, proposeInterpretation, recordArtifact } from '../src/domain/interpretations.ts';
import { decideIntent, executionAuthorization, grantAuthority, intentLifecycle, pendingApprovals, proposeIntent, revokeAuthority } from '../src/domain/authorization.ts';
import { permittedMode } from '../src/domain/foundation/authorization.ts';
import { ANSWERABLE_FACETS, commitmentFacetsOf } from '../src/domain/foundation/commitment.ts';
import { ExternalReferenceSchema, externalIdentityKey, resolveObservation, serverOriginLocalId } from '../src/domain/foundation/externalReference.ts';
import { addMoney, parseMoney, totalsOf } from '../src/domain/foundation/money.ts';
import { ResponsibilitySchema } from '../src/domain/foundation/responsibility.ts';
import { Id } from '../src/domain/schemaPrimitives.ts';
import { addEvent } from '../src/domain/events.ts';
import { addTask } from '../src/domain/tasks.ts';
import { appendObservation } from '../src/domain/observations.ts';
import { completeOnboarding, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { addEvidence, confirmPattern, explain, proposePattern } from '../src/domain/patterns.ts';
import { acknowledge, addPerson, decline, delegate, needsMePersonally, observeUnacknowledged, returnToSelf, unacknowledgedResponsibilities } from '../src/domain/responsibility.ts';
import { addDependency, addGoal, addRecurrence, addSystemStep, blockersOf, capacityWindowFor, goalProgress, nextOccurrence, setCapacity, stepsOf } from '../src/domain/structure.ts';
import { attentionFor, ATTENTION_REASONS } from '../src/domain/reasoning/attention.ts';
import { briefingFor } from '../src/domain/reasoning/briefing.ts';
import { promoteConfidence } from '../src/domain/reasoning/confidence.ts';
import { provenanceOfTask, isUserStated } from '../src/domain/reasoning/provenance.ts';
import { relatedTo } from '../src/domain/reasoning/related.ts';
import { AppStateSchema, validateAppState } from '../src/domain/state.ts';
import { ALLOWED_OPS } from '../src/domain/sync/syncTypes.ts';
import { toCloudRow } from '../src/domain/sync/projection.ts';
import { enqueue } from '../src/domain/sync/queue.ts';
import { emptyNamespace } from '../src/domain/sync/syncTypes.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { decodeStoredState, encodeStoredState } from '../src/persistence/envelope.ts';
import { DAY, MORNING, TZ } from './support/fixtures.mjs';
import { AUTOMATION, DIGEST, INFER, USER, at, execution, lastTask, outcome, real, ref, survives, withTask } from './support/acceptance.mjs';

/**
 * ACCEPTANCE: EVERY FOUNDATION ROW, PROVEN BY BUILDING THE FUTURE ON IT.
 *
 * "The ultimate Her Keys" (an AI household chief of staff) is not built here, and none of this is a screen. Each test
 * takes one capability the audit said the foundation could not yet carry and writes the state that capability WOULD
 * write — using only typed primitives, through the domain's own operations wherever one exists — then requires that
 * state to be valid, to survive persistence unchanged, and to answer the question the capability exists to answer.
 *
 * If a future feature needed a new table, a JSON bag or a rewritten row to do this, the row would not be ACCEPTED. None does.
 * The four cross-domain scenarios at the end use no untyped payload anywhere.
 */

// ------------------------------------------------------------------------------------------------------------------
describe('FE-01 — stored provenance: "where did this come from, and may you trust it?"', () => {
  test('a trust decision reads what the row SAYS about itself, not what kind of row it is', () => {
    let s = withTask(real(), { title: 'Something she typed' });
    const r = recordArtifact(s, at(), { kind: 'email', origin: 'user-submitted', contentDigest: DIGEST('a') });
    s = proposeInterpretation(r.state, at(), { artifactId: r.artifact.id, proposedKind: 'task', title: 'Something an email said' });
    s = acceptInterpretation(s, at(), s.interpretations[0].id, { categoryId: 'cat-home' });
    s = { ...s, tasks: [...s.tasks, { ...lastTask(s), id: 'task-legacy', title: 'A row nobody can vouch for', provenance: { producer: 'legacy-unknown', artifactId: null, confidence: null } }] };

    const [typed, inferred, legacy] = s.tasks.map((t) => provenanceOfTask(t));
    assert.deepEqual([typed, inferred, legacy], ['user-action', 'ai-inference', 'legacy-unknown']);
    assert.deepEqual([isUserStated(typed), isUserStated(inferred), isUserStated(legacy)], [true, false, false], 'only what she stated counts as stated');
    // The consequence that made this a defect: a wrong producer lowered the corroboration bar from 3 to 1.
    assert.equal(promoteConfidence('possible', { source: legacy, corroborations: 1, userConfirmed: false }), 'possible', 'an unknown producer gets NO benefit of the doubt');
    assert.equal(promoteConfidence('possible', { source: inferred, corroborations: 1, userConfirmed: false }), 'possible');
    assert.equal(promoteConfidence('possible', { source: typed, corroborations: 1, userConfirmed: false }), 'likely');
    assert.equal(relatedTo(s, ref('task', s.tasks[1].id)).artifact.kind, 'email', 'and "why do you think that?" names the email it came from');
    survives(s, 'FE-01');
  });
});

describe('FE-02 — an autonomous action the product will one day take is REPRESENTABLE — and is not possible to perform', () => {
  test('book the dentist: authority, proposal, approval, attempt, result and what happened after — all recorded, nothing executed', () => {
    let s = withTask(real(), { title: 'Book the dentist' });
    s = grantAuthority(s, at(), { category: 'external_appointment', mode: 'ask_approval', persistent: true, provider: 'dentist-portal' });
    s = proposeIntent(s, at(), { category: 'external_appointment', summaryCode: 'book_cleaning', about: ref('task', lastTask(s).id), provider: 'dentist-portal' });
    const intent = s.intents[0];
    assert.equal(intent.consequence, 'high', 'an outward-facing booking carries a consequence class of its own');
    assert.equal(intent.permittedMode, 'ask_approval', 'she has said Her Keys may ASK; not that it may just do it');
    assert.equal(pendingApprovals(s, MORNING).length, 1);
    s = decideIntent(s, at(), intent.id, 'approved');
    // The server records what it did. The device only ever pulls it.
    s = {
      ...s,
      executions: [{ id: 'exec-1', intentId: intent.id, decisionId: s.decisions[0].id, authorityId: null, attempt: 1, attemptedAt: '2026-09-16T14:05:00.000Z', provider: 'dentist-portal',
        externalActionId: 'appt-991', externalReferenceId: null, result: 'succeeded', errorClass: 'none', reversibility: 'compensable', compensationCode: 'cancel_appointment',
        compensatesExecutionId: null, createdAt: '2026-09-16T14:05:00.000Z', provenance: { producer: 'automation', artifactId: null, confidence: null }, scope: 'personal' }],
      outcomes: [
        { id: 'out-1', executionId: 'exec-1', kind: 'delivered', observedAt: '2026-09-16T14:06:00.000Z', createdAt: '2026-09-16T14:06:00.000Z', provenance: { producer: 'automation', artifactId: null, confidence: null }, scope: 'personal' },
        { id: 'out-2', executionId: 'exec-1', kind: 'accepted', observedAt: '2026-09-17T09:00:00.000Z', createdAt: '2026-09-17T09:00:00.000Z', provenance: { producer: 'automation', artifactId: null, confidence: null }, scope: 'personal' },
      ],
    };
    assert.equal(executionAuthorization(s, s.executions[0]).authorized, true);
    const life = intentLifecycle(s, intent.id);
    assert.deepEqual([life.stage, life.outcomes.map((o) => o.kind)], ['succeeded', ['delivered', 'accepted']]);
    assert.equal(s.actions.length, 0, 'the immutable ActionRecord ledger is untouched: this is a sibling, not a rewrite');
    assert.deepEqual(ALLOWED_OPS.execution, [], 'the sync engine will not carry an execution from a device');
    assert.equal(enqueue(emptyNamespace({ accountId: 'a'.repeat(8) + '-0000-4000-8000-000000000000', householdId: 'b'.repeat(8) + '-0000-4000-8000-000000000000', deviceId: 'c'.repeat(8) + '-0000-4000-8000-000000000000' }), { kind: 'execution', localId: 'exec-1', op: 'create', at: '2026-09-16T14:00:00.000Z' }).ok, false);
    survives(s, 'FE-02');
  });
});

describe('FE-03 — a commitment answers the same questions whatever it is', () => {
  test('a school form, a field trip, a meal to prepare and a weekly routine are read through ONE shape', () => {
    let s = withTask(real(), { title: 'Sign the permission form', dueDate: '2026-09-23' });
    s = { ...s, tasks: s.tasks.map((t) => ({ ...t, dueAt: '2026-09-23T20:00:00.000Z', splittable: true, minChunkMinutes: 5, energyDemand: 'low', consequence: 'high', preparationMinutes: 10, needsMePersonally: true, value: parseMoney('35', 'USD', 'outflow') })) };
    s = addEvent(s, at(), { title: 'Field trip', categoryId: 'cat-kids', startsAt: '2026-09-25T14:00:00.000Z', endsAt: '2026-09-25T18:00:00.000Z', commitment: 'fixed', scope: 'household' });
    s = { ...s, meals: [{ id: 'meal-1', date: '2026-09-21', title: 'Bake the trip snack', categoryId: 'cat-meals', prepMinutes: 30, energyDemand: 'moderate', provenance: USER, scope: 'household' }],
      systems: [{ id: 'sys-1', name: 'Sunday reset', description: '', categoryId: 'cat-home', subjectMemberId: null, automationMode: 'manual', effortMinutes: 20, energyDemand: 'low', provenance: USER, scope: 'household' }] };
    const shapes = [
      commitmentFacetsOf({ kind: 'task', row: s.tasks[0] }), commitmentFacetsOf({ kind: 'event', row: s.events[0] }),
      commitmentFacetsOf({ kind: 'meal', row: s.meals[0] }), commitmentFacetsOf({ kind: 'system', row: s.systems[0] }),
    ];
    const keys = Object.keys(shapes[0]).sort();
    for (const shape of shapes) assert.deepEqual(Object.keys(shape).sort(), keys, 'one shape for every kind');
    assert.equal(shapes[0].value.amountMinor, 3500);
    assert.equal(shapes[2].effortMinutes, 30);
    assert.ok(!ANSWERABLE_FACETS.meal.includes('splittable') && ANSWERABLE_FACETS.task.includes('splittable'), 'and each kind says which questions it can answer at all');
    survives(s, 'FE-03');
  });
});

describe('FE-04 — voice-first Talk It Out stores WHAT WAS SAID ABOUT, never her words', () => {
  test('a spoken note is an artifact with a digest and an opaque reference; the readings are structured; no transcript exists anywhere', () => {
    let s = real();
    const r = recordArtifact(s, at(), { kind: 'voice-utterance', origin: 'voice', contentDigest: DIGEST('e'), contentRef: 'blob:utterance-7' });
    s = proposeInterpretation(r.state, at(), { artifactId: r.artifact.id, proposedKind: 'needsMe', title: 'Call the school about Thursday' });
    assert.deepEqual([r.artifact.kind, r.artifact.origin], ['voice-utterance', 'voice']);
    assert.equal(r.artifact.contentRef, 'blob:utterance-7', 'the words live in a future content store; state holds only a pointer');
    const everyKey = new Set();
    const walk = (schema) => {
      const shape = schema?.shape ?? schema?.element?.shape ?? schema?.def?.innerType?.shape ?? schema?.def?.innerType?.element?.shape;
      if (!shape) return;
      for (const [key, child] of Object.entries(shape)) {
        everyKey.add(key);
        walk(child);
        walk(child?.def?.element);
      }
    };
    walk(AppStateSchema);
    assert.deepEqual([...everyKey].filter((k) => /transcript|utterance(Text)?|words|speech|audio|caption/i.test(k)), [], 'no field anywhere in stored state could hold her words');
    survives(s, 'FE-04');
  });
});

describe('FE-05 — a life inbox: many sources, one household, nothing silently merged', () => {
  test('an email, a screenshot, a school notice and a bill each arrive as an artifact; a repeat is recognised; one email yields several readings', () => {
    let s = real();
    const kinds = [['email', 'a'], ['screenshot', 'b'], ['school-notice', 'c'], ['bill', 'd']];
    for (const [kind, c] of kinds) s = recordArtifact(s, at(), { kind, origin: 'user-submitted', contentDigest: DIGEST(c) }).state;
    assert.equal(s.sourceArtifacts.length, 4);
    assert.equal(recordArtifact(s, at(), { kind: 'email', origin: 'user-submitted', contentDigest: DIGEST('a') }).duplicate, true, 'the same document forwarded twice is stored once');
    const email = s.sourceArtifacts[0];
    for (const [k, title] of [['event', 'Field trip'], ['task', 'Return the form'], ['task', 'Pay the fee']]) {
      s = proposeInterpretation(s, at(), { artifactId: email.id, proposedKind: k, title, startsAt: k === 'event' ? '2026-09-25T14:00:00.000Z' : null, endsAt: k === 'event' ? '2026-09-25T18:00:00.000Z' : null, clarification: title === 'Pay the fee' ? 'which_child' : null });
    }
    assert.equal(interpretationsOf(s, email.id).length, 3);
    assert.equal(s.interpretations.filter((i) => i.state === 'clarifying').length, 1, 'an open question is durable state, not a moment in a conversation');
    assert.equal(s.tasks.length + s.events.length, 0, 'and nothing became a fact until she said so');
    survives(s, 'FE-05');
  });
});

describe('FE-06 — a full daily briefing is one function over shared primitives', () => {
  test('what matters, what changed, what is at risk, what needs her, what was delegated, what was handled, what needs approval', () => {
    let s = withTask(real(), { title: 'Pay the electric bill', dueDate: DAY });
    s = { ...s, tasks: s.tasks.map((t) => ({ ...t, consequence: 'high' })) };
    s = addPerson(s, at(), { displayName: 'Grandma June', relationship: 'grandparent' });
    s = withTask(s, { title: 'Pick up Ben' });
    s = delegate(s, at(), { about: ref('task', lastTask(s).id), to: ref('person', s.people[0].id), ackWithinMinutes: 30 });
    s = proposeIntent(s, at(), { category: 'internal_reminder', summaryCode: 'nudge' });
    const b = briefingFor(s, MORNING + 3 * 3_600_000, MORNING - 3_600_000);
    assert.equal(b.needsApproval.length, 1);
    assert.equal(b.delegated.length, 1);
    assert.equal(b.unacknowledged.length, 1, 'the request went unanswered past its window');
    assert.ok(b.atRisk.some((i) => i.about?.kind === 'task'), 'a high-consequence bill due today, nobody handling it');
    assert.ok(b.changed.rows >= 2 && b.changed.observations >= 1);
    for (const item of [...b.atRisk, ...b.needsHer]) assert.ok(ATTENTION_REASONS.includes(item.reason));
    survives(s, 'FE-06');
  });
});

describe('FE-07 — capacity is her day, stated once, overriding only what she overrode', () => {
  test('a shorter day and a bigger buffer are read by anything that needs them, and never invented', () => {
    let s = real();
    const defaults = capacityWindowFor(s);
    s = setCapacity(s, at(), { dayEndMinutes: 17 * 60, transitionBufferMinutes: 20 });
    const w = capacityWindowFor(s);
    assert.deepEqual([w.dayEndMinutes, w.transitionBufferMinutes, w.dayStartMinutes], [1020, 20, defaults.dayStartMinutes]);
    assert.equal(s.capacity.dayStartMinutes, null, 'what she never set stays unknown');
    survives(s, 'FE-07');
  });
});

describe('FE-08 — adaptive scheduling has everything it needs as typed, queryable facts', () => {
  test('a window, chunking, energy, a preferred time, a prerequisite and her capacity are all readable without a parser', () => {
    let s = withTask(real(), { title: 'Write the report', dueDate: '2026-09-25' });
    const id = lastTask(s).id;
    s = { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, durationMinutes: 90, earliestStartAt: '2026-09-21T13:00:00.000Z', latestFinishAt: '2026-09-25T21:00:00.000Z', splittable: true, minChunkMinutes: 30, preferredTimeOfDay: 'morning', energyDemand: 'high' } : t)) };
    s = withTask(s, { title: 'Get the data' });
    ({ state: s } = addDependency(s, at(), { relation: 'requires', from: ref('task', id), to: ref('task', lastTask(s).id) }));
    s = setCapacity(s, at(), { dayEndMinutes: 18 * 60 });
    const input = {
      facets: commitmentFacetsOf({ kind: 'task', row: s.tasks.find((t) => t.id === id) }),
      blockers: blockersOf(s, ref('task', id)),
      capacity: capacityWindowFor(s),
      observedDeferrals: s.observations.filter((o) => o.about.id === id && o.outcome === 'deferred').length,
    };
    assert.deepEqual([input.facets.splittable, input.facets.minChunkMinutes, input.facets.preferredTimeOfDay, input.facets.energyDemand], [true, 30, 'morning', 'high']);
    assert.equal(input.blockers.length, 1);
    assert.equal(input.capacity.dayEndMinutes, 1080);
    assert.equal(typeof input.facets.earliestStartAt, 'string');
    survives(s, 'FE-08');
  });
});

describe('FE-09 — One Move can name more than a task or a Needs Me item', () => {
  test('an event, a routine and a delegated responsibility are storable targets, each checked against its own collection', () => {
    let s = withTask(real(), { title: 'Pick up Ben' });
    s = addEvent(s, at(), { title: 'Dentist', categoryId: 'cat-wellbeing', startsAt: '2026-09-16T19:00:00.000Z', endsAt: '2026-09-16T20:00:00.000Z', commitment: 'fixed', scope: 'personal' });
    s = { ...s, systems: [{ id: 'sys-1', name: 'Sunday reset', description: '', categoryId: 'cat-home', subjectMemberId: null, automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: USER, scope: 'household' }] };
    s = addPerson(s, at(), { displayName: 'Grandma June', relationship: 'grandparent' });
    s = delegate(s, at(), { about: ref('task', lastTask(s).id), to: ref('person', s.people[0].id) });
    const rec = (i, targetType, targetId, day) => ({ id: `om-${i}`, forDate: day, targetId, targetType, status: 'selected', decidedAt: '2026-09-16T14:00:00.000Z', completedAt: null, provenance: { producer: 'system-derived', artifactId: null, confidence: null }, scope: 'personal' });
    const withMoves = { ...s, oneMoves: [rec(1, 'event', s.events[0].id, '2026-09-14'), rec(2, 'system', 'sys-1', '2026-09-15'), rec(3, 'responsibility', s.responsibilities[0].id, '2026-09-16')] };
    survives(withMoves, 'FE-09');
    assert.equal(validateAppState({ ...s, oneMoves: [rec(4, 'event', 'no-such-event', '2026-09-14')] }).ok, false, 'a One Move that names a row that is not there is not valid state');
    // In the cloud each target kind has its OWN typed column, so the reference is a real, enforced foreign key.
    const cloud = '00000000-0000-4000-8000-0000000000e1';
    const ns = { ...emptyNamespace({ accountId: '00000000-0000-4000-8000-0000000000a1', householdId: '00000000-0000-4000-8000-0000000000b1', deviceId: '00000000-0000-4000-8000-0000000000d1' }),
      mappings: { [`event:${s.events[0].id}`]: { kind: 'event', localId: s.events[0].id, cloudId: cloud, revision: 1 } } };
    const row = toCloudRow(withMoves, { householdId: ns.householdId, profileId: ns.accountId, namespace: ns }, 'oneMove', 'om-1');
    assert.deepEqual([row.target_type, row.target_event_id, row.target_task_id, row.target_system_id], ['event', cloud, null, null]);
  });
});
