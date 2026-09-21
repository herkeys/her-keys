/**
 * B4-BE02-OR-001 — the claim payload emits the dependency closure and nothing
 * else.
 *
 * These are the inverse tests: they would FAIL under an upload-everything
 * implementation. Counts are asserted exactly, and a household deliberately
 * holds far more than the closure needs.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CLAIM_PAYLOAD_VERSION,
  ClaimInvariantError,
  buildClaimPayload,
  decideBinding,
  describeLocalHousehold,
  normalizeOnboardingIds,
  onboardingResume,
  parseClaimOutcome,
} from '../src/domain/account/claim.ts';
import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import { validateAppState } from '../src/domain/state.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { TZ } from './support/fixtures.mjs';
import { SYSTEM, USER } from './support/provenance.mjs';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';

const task = (id, over = {}) => ({
  id,
  title: `Task ${id}`,
  categoryId: 'cat-home',
  subjectMemberId: null,
  durationMinutes: 10,
  commitment: 'flexible',
  dueDate: null,
  plan: { kind: 'unplanned' },
  notes: null,
  status: 'open',
  completedAt: null,
  createdAt: null,
  updatedAt: null,
  provenance: USER,
  scope: 'household',
  ...over,
});

const item = (id, over = {}) => ({
  id,
  title: `Item ${id}`,
  status: 'open',
  dueDate: null,
  categoryId: null,
  createdAt: '2026-09-15T08:30:00.000Z',
  provenance: USER,
  scope: 'personal',
  ...over,
});

const move = (id, forDate, targetType, targetId, over = {}) => ({
  id,
  forDate,
  targetId,
  targetType,
  status: 'completed',
  decidedAt: `${forDate}T12:00:00.000Z`,
  completedAt: `${forDate}T18:00:00.000Z`,
  provenance: SYSTEM,
  scope: 'personal',
  ...over,
});

/** A real household far larger than its One Move history: 10 tasks, 6 Needs Me items. */
function crowdedHousehold() {
  const base = createEmptyState(TZ);
  const state = {
    ...base,
    children: [
      { id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' },
      { id: 'child-2', displayName: 'Ben', birthDate: '2014-11-20', scope: 'child' },
    ],
    categories: [
      ...base.categories,
      { id: 'cat-custom-1', householdId: 'household-1', name: 'Garden', systemRole: null, status: 'active', sortOrder: 8, provenance: USER, scope: 'personal' },
      { id: 'cat-custom-2', householdId: 'household-1', name: 'Unrelated', systemRole: null, status: 'active', sortOrder: 9, provenance: USER, scope: 'household' },
    ],
    tasks: [
      task('task-1', { scope: 'child', subjectMemberId: 'child-1', status: 'completed', completedAt: '2026-09-18T18:00:00.000Z', createdAt: '2026-09-17T09:00:00.000Z', updatedAt: '2026-09-18T18:00:00.000Z', plan: { kind: 'day', date: '2026-09-18' }, dueDate: '2026-09-18' }),
      task('task-2', { categoryId: 'cat-custom-1', scope: 'personal' }),
      ...Array.from({ length: 8 }, (_, i) => task(`task-spare-${i + 1}`)),
    ],
    needsMe: [
      item('needsme-1', { categoryId: 'cat-custom-1' }),
      ...Array.from({ length: 5 }, (_, i) => item(`needsme-spare-${i + 1}`)),
    ],
    oneMoves: [
      move('onemove-2026-09-18', '2026-09-18', 'task', 'task-1'),
      move('onemove-2026-09-17', '2026-09-17', 'task', 'task-2', { status: 'selected', completedAt: null }),
      move('onemove-2026-09-16', '2026-09-16', 'needsMe', 'needsme-1', { status: 'selected', completedAt: null }),
      move('onemove-2026-09-15', '2026-09-15', 'task', null, { status: 'withheld', completedAt: null }),
    ],
  };
  // The fixture must be state the app would actually accept, or the test proves
  // nothing about real data.
  assert.equal(validateAppState(state).ok, true, 'fixture is not valid app state');
  return state;
}

describe('B4-BE02-OR-001 — claim payload closure', () => {
  test('the payload carries its explicit version and the true origin', () => {
    const payload = buildClaimPayload(crowdedHousehold());
    assert.equal(payload.claimPayloadVersion, CLAIM_PAYLOAD_VERSION);
    assert.equal(payload.claimPayloadVersion, 3, 'version 3 claims every child and states the source of each duration; version 2 keeps closure-only children; version 1 is refused');
    assert.equal(payload.origin, 'empty');
  });

  test('only the tasks a One Move targets are carried, out of ten', () => {
    const state = crowdedHousehold();
    assert.equal(state.tasks.length, 10, 'the fixture must actually be crowded');
    const payload = buildClaimPayload(state);
    assert.deepEqual(payload.tasks.map((t) => t.localId).sort(), ['task-1', 'task-2']);
  });

  test('only the Needs Me items a One Move targets are carried, out of six', () => {
    const state = crowdedHousehold();
    assert.equal(state.needsMe.length, 6);
    const payload = buildClaimPayload(state);
    assert.deepEqual(payload.needsMeItems.map((i) => i.localId), ['needsme-1']);
  });

  test('only categories a carried target requires are sent — not all ten', () => {
    const state = crowdedHousehold();
    assert.equal(state.categories.length, 10);
    const payload = buildClaimPayload(state);
    assert.deepEqual(payload.categories.map((c) => c.localId).sort(), ['cat-custom-1', 'cat-home']);
    assert.ok(!payload.categories.some((c) => c.localId === 'cat-custom-2'), 'an unrelated custom category leaked');
    assert.ok(!payload.categories.some((c) => c.localId === 'cat-kids'), 'an unrequired starter category leaked');
  });

  test('EVERY child is sent (version 3): a child outside the closure can only ever get its cloud identity here', () => {
    const state = crowdedHousehold();
    assert.equal(state.children.length, 2);
    const payload = buildClaimPayload(state);
    assert.deepEqual(payload.childMembers.map((c) => c.localId).sort(), ['child-1', 'child-2']);
  });

  test('a withheld One Move carries no target and pulls nothing into the closure', () => {
    const base = createEmptyState(TZ);
    const state = { ...base, oneMoves: [move('onemove-1', '2026-09-15', 'task', null, { status: 'withheld', completedAt: null })] };
    const payload = buildClaimPayload(state);
    assert.equal(payload.oneMoves.length, 1);
    assert.equal(payload.oneMoves[0].targetLocalId, null);
    assert.deepEqual(payload.tasks, []);
    assert.deepEqual(payload.categories, []);
    assert.deepEqual(payload.childMembers, [], 'this household has no children to claim');
  });

  test('a Needs Me item with no category pulls no category in', () => {
    const base = createEmptyState(TZ);
    const state = {
      ...base,
      needsMe: [item('needsme-1')],
      oneMoves: [move('onemove-1', '2026-09-16', 'needsMe', 'needsme-1', { status: 'selected', completedAt: null })],
    };
    const payload = buildClaimPayload(state);
    assert.equal(payload.needsMeItems[0].categoryLocalId, null);
    assert.deepEqual(payload.categories, []);
  });

  test('canonical task state is preserved, including completion and plan', () => {
    const payload = buildClaimPayload(crowdedHousehold());
    const carried = payload.tasks.find((t) => t.localId === 'task-1');
    assert.equal(carried.status, 'completed');
    assert.equal(carried.completedAt, '2026-09-18T18:00:00.000Z');
    assert.equal(carried.originCreatedAt, '2026-09-17T09:00:00.000Z');
    assert.equal(carried.originUpdatedAt, '2026-09-18T18:00:00.000Z');
    assert.equal(carried.planKind, 'day');
    assert.equal(carried.plannedDate, '2026-09-18');
    assert.equal(carried.plannedStartsAt, null);
    assert.equal(carried.scope, 'child');
    assert.equal(carried.subjectMemberLocalId, 'child-1');
  });

  test('a timed plan lands in plannedStartsAt and leaves plannedDate null', () => {
    const base = createEmptyState(TZ);
    const state = {
      ...base,
      tasks: [task('task-1', { plan: { kind: 'timed', startsAt: '2026-09-18T14:00:00.000Z' } })],
      oneMoves: [move('onemove-1', '2026-09-18', 'task', 'task-1', { status: 'selected', completedAt: null })],
    };
    const [carried] = buildClaimPayload(state).tasks;
    assert.equal(carried.planKind, 'timed');
    assert.equal(carried.plannedStartsAt, '2026-09-18T14:00:00.000Z');
    assert.equal(carried.plannedDate, null);
  });

  test('no server-owned field is ever emitted', () => {
    const payload = buildClaimPayload(crowdedHousehold());
    const forbidden = ['id', 'revision', 'createdAt', 'updatedAt', 'householdId', 'subjectMemberType', 'logicalDay'];
    for (const row of [...payload.tasks, ...payload.needsMeItems, ...payload.categories, ...payload.childMembers]) {
      for (const key of forbidden) {
        assert.ok(!(key in row), `${key} must not be sent: the server owns it`);
      }
    }
  });

  test('a One Move naming a target that is not in local state is refused, not skipped', () => {
    const base = createEmptyState(TZ);
    const state = { ...base, oneMoves: [move('onemove-1', '2026-09-16', 'task', 'task-gone', { status: 'selected', completedAt: null })] };
    assert.throws(() => buildClaimPayload(state), ClaimInvariantError);
  });

  test('a completed One Move with no target is refused rather than downgraded', () => {
    const base = createEmptyState(TZ);
    const state = { ...base, oneMoves: [move('onemove-1', '2026-09-16', 'task', null)] };
    assert.throws(() => buildClaimPayload(state), /names no target/);
  });
});

describe('claim decision boundary', () => {
  const real = () => describeLocalHousehold({ ...createEmptyState(TZ), tasks: [task('task-1')] });
  const bare = () => describeLocalHousehold(createEmptyState(TZ));

  test('an empty real household bootstraps; one with content claims', () => {
    assert.deepEqual(decideBinding(bare(), UNBOUND_IDENTITY, ACCOUNT_A), { mode: 'bootstrap' });
    assert.deepEqual(decideBinding(real(), UNBOUND_IDENTITY, ACCOUNT_A), { mode: 'claim', onboardingComplete: false });
  });

  test('content outside the historical claim closure still prevents an empty bootstrap', () => {
    const base = createEmptyState(TZ);
    const systemOnly = {
      ...base,
      systems: [{
        id: 'system-1',
        name: 'School morning',
        description: null,
        categoryId: 'cat-home',
        scope: 'household',
        provenance: USER,
        createdAt: '2026-09-20T12:00:00.000Z',
        updatedAt: '2026-09-20T12:00:00.000Z',
      }],
    };
    const sourceOnly = {
      ...base,
      sourceArtifacts: [{
        id: 'artifact-1',
        kind: 'voice-utterance',
        origin: 'voice',
        provider: null,
        receivedAt: '2026-09-20T12:00:00.000Z',
        contentDigest: null,
        contentRef: null,
        retractedAt: null,
        createdAt: '2026-09-20T12:00:00.000Z',
        scope: 'personal',
      }],
    };

    assert.equal(describeLocalHousehold(systemOnly).hasContent, true, 'a System is durable household content');
    assert.equal(describeLocalHousehold(sourceOnly).hasContent, true, 'capture provenance is durable household content');
    assert.equal(describeLocalHousehold({ ...base, user: { ...base.user, displayName: 'Ari' } }).hasContent, true);
    assert.equal(describeLocalHousehold({ ...base, categories: [...base.categories, { ...base.categories[0], id: 'cat-custom', systemRole: null, name: 'Garden', sortOrder: 8 }] }).hasContent, true);
  });

  test('a demo household is refused as a whole, whatever it contains', () => {
    const demo = describeLocalHousehold({ ...createEmptyState(TZ), origin: 'demo', tasks: [task('task-1')] });
    assert.deepEqual(decideBinding(demo, UNBOUND_IDENTITY, ACCOUNT_A), { mode: 'refuseDemo' });
  });

  test('the same account resumes; a different account is quarantined, never merged', () => {
    const identity = {
      binding: { accountId: ACCOUNT_A, householdId: '33333333-3333-4333-8333-333333333333', boundAt: '2026-09-18T12:00:00.000Z', kind: 'claim', idMap: {} },
      receipt: null,
      quarantine: null,
    };
    assert.deepEqual(decideBinding(real(), identity, ACCOUNT_A), { mode: 'resume', householdId: '33333333-3333-4333-8333-333333333333' });
    assert.deepEqual(decideBinding(real(), identity, ACCOUNT_B), { mode: 'quarantine', otherAccountId: ACCOUNT_A });
  });

  test('a claim interrupted by another account quarantines on the receipt alone', () => {
    const identity = {
      binding: null,
      receipt: { claimKey: '44444444-4444-4444-8444-444444444444', accountId: ACCOUNT_A, kind: 'claim', startedAt: '2026-09-18T12:00:00.000Z', attempts: 1, lastAttemptAt: null, rejectedReason: null },
      quarantine: null,
    };
    assert.deepEqual(decideBinding(real(), identity, ACCOUNT_B), { mode: 'quarantine', otherAccountId: ACCOUNT_A });
    // With nothing local to protect there is nothing to quarantine.
    assert.deepEqual(decideBinding(bare(), identity, ACCOUNT_B), { mode: 'bootstrap' });
  });
});

describe('onboarding across a claim', () => {
  test('completed onboarding is not asked again; an incomplete one resumes where she left it', () => {
    const base = createEmptyState(TZ);
    assert.deepEqual(onboardingResume(base), { kind: 'start' });
    assert.deepEqual(
      onboardingResume({ ...base, onboarding: { ...base.onboarding, lastStep: 'struggles' } }),
      { kind: 'resume', step: 'struggles' }
    );
    assert.deepEqual(
      onboardingResume({ ...base, onboarding: { ...base.onboarding, completedAt: '2026-09-18T12:00:00.000Z' } }),
      { kind: 'complete' }
    );
  });

  test('AMD-01: a stored label normalizes to its stable id before binding, and an unknown value is reported', () => {
    const base = createEmptyState(TZ);
    const state = {
      ...base,
      onboarding: { ...base.onboarding, goalIds: ['A calmer household'], strengthIds: ['cooking'], struggleIds: ['who knows'] },
    };
    const normalized = normalizeOnboardingIds(state);
    assert.deepEqual(normalized.goalIds, ['calmer-household']);
    assert.deepEqual(normalized.rewritten, ['goals:A calmer household']);
    assert.deepEqual(normalized.strengthIds, ['cooking'], 'an id that is already canonical is left alone');
    assert.deepEqual(normalized.struggleIds, []);
    assert.deepEqual(normalized.unresolved, ['struggles:who knows'], 'an unknown value is reported, never silently kept or dropped');
  });
});

describe('claim result parsing', () => {
  test('a rejected result is read as rejected even though it carries a household id', () => {
    const outcome = parseClaimOutcome({
      status: 'rejected',
      rejected_reason: 'superseded_by_cloud',
      household_id: '33333333-3333-4333-8333-333333333333',
      claim_id: null,
      id_map: {},
    });
    assert.equal(outcome.kind, 'rejected');
    assert.equal(outcome.reason, 'superseded_by_cloud');
    assert.equal(outcome.householdId, '33333333-3333-4333-8333-333333333333');
  });

  test('a complete result yields the whole id map', () => {
    const outcome = parseClaimOutcome({
      status: 'complete',
      rejected_reason: null,
      claim_id: '55555555-5555-4555-8555-555555555555',
      household_id: '33333333-3333-4333-8333-333333333333',
      id_map: { 'household-1': '33333333-3333-4333-8333-333333333333', 'task-1': '66666666-6666-4666-8666-666666666666' },
      conflict_evidence: [],
    });
    assert.equal(outcome.kind, 'complete');
    assert.equal(Object.keys(outcome.idMap).length, 2);
    assert.deepEqual(outcome.conflicts, []);
  });

  test('anything else is unreadable rather than optimistically accepted', () => {
    assert.equal(parseClaimOutcome(null).kind, 'unreadable');
    assert.equal(parseClaimOutcome('complete').kind, 'unreadable');
    assert.equal(parseClaimOutcome({ status: 'complete' }).kind, 'unreadable');
    assert.equal(parseClaimOutcome({ status: 'rejected', rejected_reason: 'because' }).kind, 'unreadable');
    assert.equal(parseClaimOutcome({ status: 'whatever' }).kind, 'unreadable');
  });
});
