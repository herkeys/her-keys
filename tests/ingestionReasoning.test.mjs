import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createEmptyState } from '../src/state/initialState.ts';
import { decodeStoredState } from '../src/persistence/envelope.ts';
import { applyDiscoveryConversation } from '../src/domain/discovery.ts';
import { advance, createInitialState } from '../src/features/talk-it-out/engine.ts';
import { buildOperatingProfile } from '../src/features/onboarding/buildOperatingProfile.ts';
import { addCategory } from '../src/domain/categories.ts';
import { captureNeedsMeItem } from '../src/domain/needsMe.ts';
import { completeOnboarding, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { resolveOneMoveForToday } from '../src/domain/oneMove.ts';
import { validateAppState } from '../src/domain/state.ts';
import { addTask } from '../src/domain/tasks.ts';
import { classifyConversationOutcome, mutatesDurableState } from '../src/domain/reasoning/conversationBoundary.ts';
import {
  CONFIDENCE_ORDER,
  confidenceAfterPersistence,
  isAtLeast,
  promoteConfidence,
} from '../src/domain/reasoning/confidence.ts';
import {
  isSyncable,
  isUserStated,
  provenanceOfAction,
  provenanceOfCategory,
  provenanceOfDiscovery,
  provenanceOfEvent,
  provenanceOfNeedsMeItem,
  provenanceOfOnboarding,
  provenanceOfOneMove,
  provenanceOfTask,
} from '../src/domain/reasoning/provenance.ts';
import { mayMutateDurableState, requiresApproval, semanticOf } from '../src/domain/reasoning/semantics.ts';
import { DAY, TZ, ctx, demoState, stored } from './support/fixtures.mjs';

const real = () => createEmptyState(TZ);

describe('B4-INGESTION-LOCK — reasoning primitives', () => {
  // 1. onboarding answer -> intended structured state
  test('an onboarding selection lands in the structured field the profile reads', () => {
    const state = toggleOnboardingOption(real(), 'goals', 'calmer-household');
    assert.deepEqual(state.onboarding.goalIds, ['calmer-household']);
    assert.equal(state.onboarding.scope, 'personal');
    assert.equal(state.onboarding.completedAt, null, 'selecting an answer must not complete onboarding');

    // An id outside the catalog is refused rather than stored, so a malformed
    // answer cannot reach the operating profile as if she had chosen it.
    assert.deepEqual(toggleOnboardingOption(real(), 'goals', 'not-a-real-option').onboarding.goalIds, []);
  });

  // 2 + 3. provenance and confidence survive a persistence round trip
  test('provenance survives a persistence round trip', () => {
    const state = demoState();
    const before = state.events.map((e) => provenanceOfEvent(e));

    const decoded = decodeStoredState(stored(state));
    assert.equal(decoded.kind, 'valid');
    const after = decoded.state.events.map((e) => provenanceOfEvent(e));

    assert.deepEqual(after, before);
    assert.ok(before.every((p) => p === 'demo-seed'), 'a demo household must read back as demo-seed');
    // v4: it is the WHOLE stored provenance that survives, not only the producer.
    assert.deepEqual(decoded.state.events.map((e) => e.provenance), state.events.map((e) => e.provenance));
  });

  test('confidence survives a persistence round trip unchanged', () => {
    for (const level of CONFIDENCE_ORDER) {
      assert.equal(confidenceAfterPersistence(level), level);
    }

    const profile = buildOperatingProfile({ goals: ['A'], strengths: ['B'], struggles: ['C'] });
    const levels = profile.insights.map((i) => i.confidence);
    assert.deepEqual(levels, ['possible', 'possible', 'possible']);
  });

  // 4. persisted inference does NOT auto-promote
  test('persistence never promotes an inference to established', () => {
    const inference = { source: 'ai-inference', corroborations: 99, userConfirmed: false };
    assert.equal(promoteConfidence('possible', inference), 'likely');
    assert.notEqual(promoteConfidence('possible', inference), 'established');

    // Only an explicit confirmation reaches the top level.
    assert.equal(
      promoteConfidence('possible', { source: 'ai-inference', corroborations: 0, userConfirmed: true }),
      'established'
    );
  });

  test('a user-stated claim promotes sooner than an inference, and neither falls', () => {
    const one = { corroborations: 1, userConfirmed: false };
    assert.equal(promoteConfidence('possible', { ...one, source: 'onboarding' }), 'likely');
    assert.equal(promoteConfidence('possible', { ...one, source: 'ai-inference' }), 'possible');

    assert.equal(
      promoteConfidence('established', { source: 'ai-inference', corroborations: 0, userConfirmed: false }),
      'established',
      'promotion must never lower a level'
    );
  });

  test('confidence ordering is the product vocabulary and nothing else', () => {
    assert.deepEqual([...CONFIDENCE_ORDER], ['possible', 'likely', 'established']);
    assert.ok(isAtLeast('established', 'likely'));
    assert.ok(!isAtLeast('possible', 'likely'));
  });

  // 12. user-confirmed and inferred information remain distinguishable
  test('stated and inferred provenance stay distinguishable', () => {
    assert.ok(isUserStated('onboarding'));
    assert.ok(isUserStated('talk-it-out'));
    assert.ok(isUserStated('user-action'));
    assert.ok(!isUserStated('ai-inference'));
    assert.ok(!isUserStated('system-derived'));
    assert.ok(!isUserStated('demo-seed'));
  });

  // B4-FE01-001. REPLACES the v3 test "every producer in the product has a derivable provenance".
  // Old expectation: provenanceOfTask(realState, undefined) === 'user-action' — an answer given for a
  // task that did not exist, derived from the KIND of entity. That was the fabrication the audit named
  // (FE-01). New expectation: each creator stores the truth about its own row, and nothing is derived.
  test('every producer in the product stores its own provenance', () => {
    let r = toggleOnboardingOption(toggleOnboardingOption(toggleOnboardingOption(real(), 'goals', 'calmer-household'), 'strengths', 'cooking'), 'struggles', 'overcommitting');
    r = completeOnboarding(r, ctx());
    r = addTask(r, ctx(), { title: 'Return the books', categoryId: 'cat-home', dueDate: DAY, scope: 'household' });
    r = captureNeedsMeItem(r, ctx(), { title: 'Call the dentist back' });
    r = addCategory(r, ctx(), { name: 'Pets', scope: 'household' });
    r = resolveOneMoveForToday(r, ctx());

    assert.equal(provenanceOfTask(r.tasks[0]), 'user-action');
    assert.equal(provenanceOfNeedsMeItem(r.needsMe[0]), 'user-action');
    assert.equal(provenanceOfCategory(r.categories.find((c) => c.name === 'Pets')), 'user-action', 'a category she added is hers');
    assert.equal(provenanceOfCategory(r.categories[0]), 'system-derived', 'a starter category is not her own');
    assert.equal(provenanceOfOnboarding(r.onboarding), 'onboarding');
    assert.equal(provenanceOfOneMove(r.oneMoves[0]), 'system-derived', 'the engine chose it; she did not capture it');
    assert.equal(provenanceOfAction({ actor: 'user', source: 'her_keys_recommendation' }), 'user-action');
    assert.equal(validateAppState(r).ok, true);

    const turn = advance(advance(createInitialState(), 'Honestly I feel like I am always behind on everything').state, 'it usually falls apart after I pick the kids up from school');
    assert.equal(provenanceOfDiscovery(applyDiscoveryConversation(real(), ctx(), turn.state).discovery), 'talk-it-out');

    const d = demoState();
    assert.equal(provenanceOfOneMove({ provenance: d.categories[0].provenance }), 'demo-seed');
    assert.ok(d.tasks.every((t) => provenanceOfTask(t) === 'demo-seed'), 'demo origin dominates every row in a demo household');
    assert.equal(provenanceOfTask(addTask(d, ctx(), { title: 'Typed during a demo', categoryId: 'cat-home', scope: 'household' }).tasks.at(-1)), 'demo-seed');
  });

  test('there is no fallback: a row that stores no provenance is not valid state, so nothing can be silently attributed', () => {
    const r = real();
    const { provenance: _dropped, ...unstamped } = addTask(r, ctx(), { title: 'x', categoryId: 'cat-home', scope: 'household' }).tasks[0];
    const result = validateAppState({ ...r, tasks: [unstamped] });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_state');
  });

  test('an explicit legacy-unknown is stored, reported as unknown, and is never treated as something she told us', () => {
    const r = real();
    const task = { ...addTask(r, ctx(), { title: 'x', categoryId: 'cat-home', scope: 'household' }).tasks[0], provenance: { producer: 'legacy-unknown', artifactId: null, confidence: null } };
    assert.equal(validateAppState({ ...r, tasks: [task] }).ok, true);
    assert.equal(provenanceOfTask(task), 'legacy-unknown');
    assert.equal(isUserStated(provenanceOfTask(task)), false, 'unknown is conservative: it lowers no promotion threshold');
    assert.equal(promoteConfidence('possible', { source: provenanceOfTask(task), corroborations: 2, userConfirmed: false }), 'possible');
  });

  // 11. demo-origin data remains separated from real/account-bound state
  test('demo-origin data is never syncable and real data is', () => {
    const d = demoState();
    const r = real();
    assert.ok(!isSyncable(provenanceOfCategory(d.categories[0])));
    assert.ok(!isSyncable(provenanceOfEvent(d.events[0])));
    assert.ok(isSyncable(provenanceOfOnboarding(r.onboarding)));
  });

  // 14. malformed reasoning metadata fails safely
  test('an unknown confidence level does not silently rank as established', () => {
    assert.equal(promoteConfidence('possible', { source: 'nonsense', corroborations: 0, userConfirmed: false }), 'possible');
    assert.equal(
      promoteConfidence('possible', { source: 'nonsense', corroborations: 5, userConfirmed: false }),
      'likely',
      'an unrecognised source is treated as not-user-stated, the stricter branch'
    );
  });
});

describe('B4-INGESTION-LOCK — information semantics', () => {
  test('inference and pattern may never mutate durable state on their own', () => {
    assert.ok(!mayMutateDurableState('inference'));
    assert.ok(!mayMutateDurableState('pattern'));
    assert.ok(!mayMutateDurableState('conversation-only'));
    assert.ok(mayMutateDurableState('commitment'));
    assert.ok(mayMutateDurableState('decision'));
  });

  test('recommendations and inferences require approval; decisions do not', () => {
    assert.ok(requiresApproval('recommendation'));
    assert.ok(requiresApproval('inference'));
    assert.ok(!requiresApproval('decision'));
  });

  test('the operating profile is an inference and the action ledger is a decision', () => {
    assert.equal(semanticOf('operatingProfileInsight'), 'inference');
    assert.equal(semanticOf('actionRecord'), 'decision');
    assert.equal(semanticOf('oneMove'), 'recommendation');
    assert.equal(semanticOf('talkItOutMessage'), 'conversation-only');
  });
});

describe('B4-INGESTION-LOCK — conversation / state-mutation boundary', () => {
  // 7. conversation-only path creates no durable mutation
  test('an unmatched turn with nothing stored is conversation-only and writes nothing', () => {
    const conversation = createInitialState();
    const outcome = classifyConversationOutcome(conversation, null);

    assert.equal(outcome.kind, 'conversation-only');
    assert.equal(outcome.reason, 'no-topic');
    assert.ok(!mutatesDurableState(outcome));

    const before = real();
    const after = applyDiscoveryConversation(before, ctx(), conversation);
    assert.equal(after, before, 'the state object itself must be returned unchanged');
    assert.equal(after.discovery, null);
  });

  // 8. actionable path creates the correct state transition
  test('a matched investigation is structured-discovery and stores only the structure', () => {
    let turn = advance(createInitialState(), 'Honestly I feel like I am always behind on everything');
    turn = advance(turn.state, 'it usually falls apart after I pick the kids up from school');

    const outcome = classifyConversationOutcome(turn.state, null);
    assert.equal(outcome.kind, 'structured-discovery');
    assert.ok(mutatesDurableState(outcome));
    assert.equal(outcome.topicId, 'overload');
    assert.deepEqual(outcome.answers, [{ questionId: 'overload-when', optionId: 'pickup' }]);

    const state = applyDiscoveryConversation(demoState(), ctx(), turn.state);
    assert.equal(state.discovery.topicId, 'overload');
    assert.equal(state.discovery.scope, 'personal');
  });

  test('re-submitting the same answers is conversation-only, not a rewrite', () => {
    let turn = advance(createInitialState(), 'Honestly I feel like I am always behind on everything');
    turn = advance(turn.state, 'it usually falls apart after I pick the kids up from school');

    const first = applyDiscoveryConversation(demoState(), ctx(), turn.state);
    const outcome = classifyConversationOutcome(turn.state, first.discovery);

    assert.equal(outcome.kind, 'conversation-only');
    assert.equal(outcome.reason, 'unchanged');

    const second = applyDiscoveryConversation(first, ctx(), turn.state);
    assert.equal(second, first, 'an unchanged turn must not produce a new state object');
  });

  test('leaving the topic clears the stored record rather than reading as idle talk', () => {
    let turn = advance(createInitialState(), 'Honestly I feel like I am always behind on everything');
    turn = advance(turn.state, 'it usually falls apart after I pick the kids up from school');
    const withRecord = applyDiscoveryConversation(demoState(), ctx(), turn.state);

    const outcome = classifyConversationOutcome(createInitialState(), withRecord.discovery);
    assert.equal(outcome.kind, 'clear-discovery');
    assert.ok(mutatesDurableState(outcome));
  });
});

describe('B4-INGESTION-LOCK — scope and subject', () => {
  // 5 + 6. child-scoped object requires a subject, and it survives serialization
  test('a child-scoped event names a child, and the subject survives a round trip', () => {
    const state = demoState();
    const childScoped = state.events.filter((e) => e.scope === 'child');
    assert.ok(childScoped.length > 0, 'the demo household must exercise child scope');

    const childIds = new Set(state.children.map((c) => c.id));
    for (const event of childScoped) {
      assert.ok(event.subjectMemberId !== null, `${event.id} is child-scoped and must name a child`);
      assert.ok(childIds.has(event.subjectMemberId), `${event.id} must name a real child`);
    }

    const decoded = decodeStoredState(stored(state));
    assert.equal(decoded.kind, 'valid');
    const after = decoded.state.events.filter((e) => e.scope === 'child');
    assert.deepEqual(
      after.map((e) => [e.id, e.subjectMemberId]),
      childScoped.map((e) => [e.id, e.subjectMemberId])
    );
  });

  test('a child-scoped record naming nobody is rejected by local integrity', () => {
    const state = demoState();
    const broken = {
      ...state,
      events: state.events.map((e) => (e.scope === 'child' ? { ...e, subjectMemberId: null } : e)),
    };
    assert.throws(() => stored(broken), /child-scoped/i);
  });
});
