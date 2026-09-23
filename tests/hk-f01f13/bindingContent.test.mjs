/**
 * HK13-D09 (P0) — what counts as "her content" when an account signs in on this device (HK-F01-F13 integration audit).
 *
 * `describeLocalHousehold().hasContent` decides between quarantine (another account's household is on this device), claim (her own
 * household comes with her) and bootstrap (nothing worth keeping). It was a hand-edited chain of `||`, and Features 10, 11 and 13 never
 * added their collections: a household holding only a career opportunity, a Focus or a person context read as EMPTY. After an
 * interrupted claim by account A, account B then BOOTSTRAPPED on the device and the seed pushed A's private rows as B's.
 * These tests classify every AppState root, so the next collection cannot be forgotten.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createAccountRuntime } from '../../src/domain/account/accountRuntime.ts';
import { canRenderAccountData, canWriteToCloud } from '../../src/domain/account/authState.ts';
import { UNBOUND_IDENTITY, startReceipt } from '../../src/domain/account/binding.ts';
import { CONTENT_COLLECTIONS, decideBinding, describeLocalHousehold } from '../../src/domain/account/claim.ts';
import { createProviderRegistry, createScriptedProvider } from '../../src/domain/account/provider.ts';
import { createMemorySecureStorage, createSecureSessionStore } from '../../src/domain/account/secureSession.ts';
import { addOpportunity } from '../../src/domain/opportunities.ts';
import { addRebuildFocus, linkToFocus } from '../../src/domain/rebuild/commands.ts';
import { AppStateSchema } from '../../src/domain/state.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

const TZ = 'America/Chicago';
const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const NOW = Date.UTC(2026, 8, 22, 15, 0, 0);

/** Roots that are deliberately NOT content collections, each with the reason. Everything else must be in CONTENT_COLLECTIONS. */
const NOT_A_CONTENT_COLLECTION = {
  origin: 'which data mode wrote the household; demo is refused separately (refuseDemo)',
  household: 'identity; its displayName is checked on its own',
  user: 'identity; its displayName is checked on its own',
  categories: 'the eight starter categories are not content; a CHANGED set is (categoriesChanged)',
  onboarding: 'its selections are checked on their own (goal, strength and struggle ids)',
  discovery: 'a single record, checked on its own',
  capacity: 'a single profile, checked on its own',
  migrationLineage: 'a record of the migrations run on this stored blob, not something she entered',
};

let n = 0;
const ctx = () => ({ nowMs: NOW, today: '2026-09-22', createId: (prefix) => `${prefix}-bc-${++n}` });
const onlyAFocus = () => addRebuildFocus(createEmptyState(TZ), ctx(), { title: 'Make space for myself again' });
const onlyAnOpportunity = () => addOpportunity(createEmptyState(TZ), ctx(), { title: 'Senior analyst role', opportunityType: 'job' });
const receiptOf = (accountId) => startReceipt({ claimKey: '99999999-9999-4999-8999-999999999999', accountId, kind: 'claim', startedAt: '2026-09-22T14:00:00.000Z' });
const interruptedClaimBy = (accountId) => ({ ...UNBOUND_IDENTITY, receipt: receiptOf(accountId) });

describe('HK13-D09 — every AppState root is classified', () => {
  test('each root is EITHER a content collection OR explicitly not one (with a reason): a new collection must be classified', () => {
    for (const root of Object.keys(AppStateSchema.shape)) {
      const isContent = CONTENT_COLLECTIONS.includes(root);
      const isNot = root in NOT_A_CONTENT_COLLECTION;
      assert.ok(isContent !== isNot, `${root} must be in exactly one of CONTENT_COLLECTIONS and NOT_A_CONTENT_COLLECTION`);
    }
    for (const root of CONTENT_COLLECTIONS) assert.ok(root in AppStateSchema.shape, `${root} is not an AppState root`);
  });

  test('a household holding a single row of ANY content collection has content', () => {
    for (const root of CONTENT_COLLECTIONS) {
      const state = { ...createEmptyState(TZ), [root]: [{ id: `${root}-1` }] };
      assert.equal(describeLocalHousehold(state).hasContent, true, `${root} alone reads as empty`);
    }
    assert.equal(describeLocalHousehold(createEmptyState(TZ)).hasContent, false, 'a bare new household is still empty');
  });
});

describe('HK13-D09 — the binding decision for households holding only Wave 3 / Wave 4 rows', () => {
  for (const [label, build] of [['only a Focus (F11)', onlyAFocus], ['only a career opportunity (F10)', onlyAnOpportunity]]) {
    test(`${label}: after account A's interrupted claim, account B is QUARANTINED, never bootstrapped`, () => {
      const decision = decideBinding(describeLocalHousehold(build()), interruptedClaimBy(ACCOUNT_A), ACCOUNT_B);
      assert.deepEqual(decision, { mode: 'quarantine', otherAccountId: ACCOUNT_A });
    });
    test(`${label}: on an unbound device her own sign-in CLAIMS the household (it is not "nothing worth keeping")`, () => {
      const decision = decideBinding(describeLocalHousehold(build()), UNBOUND_IDENTITY, ACCOUNT_A);
      assert.equal(decision.mode, 'claim');
    });
  }

  test('a Focus with a link to nothing else still counts (rebuildFocusLinks is content too)', () => {
    const focus = onlyAFocus();
    const withGoalLink = linkToFocus(
      { ...focus, goals: [] },
      ctx(),
      { focusId: focus.rebuildFocuses[0].id, target: { kind: 'task', id: 'task-missing' }, relation: 'supports' }
    );
    // Whatever linkToFocus decides about a missing target, the household holding the Focus is content.
    assert.equal(describeLocalHousehold(withGoalLink).hasContent, true);
  });
});

describe('HK13-D09 — end to end through the account runtime', () => {
  test('B signs in on a device holding A\'s interrupted claim and only A\'s private Focus: nothing renders for B and nothing is uploaded', async () => {
    const calls = [];
    let staged = interruptedClaimBy(ACCOUNT_A);
    const session = {
      accountId: ACCOUNT_B, accessToken: 'access-b', refreshToken: 'refresh-b', expiresAt: NOW + 3_600_000,
      provider: { provider: 'apple', subject: 'apple-b', suggestedDisplayName: null },
    };
    const runtime = createAccountRuntime({
      sessions: createSecureSessionStore(createMemorySecureStorage({}, {})),
      providers: createProviderRegistry([createScriptedProvider('apple', { results: [{ kind: 'success', session }] })]),
      cloud: {
        async bootstrapAccount(input) { calls.push({ fn: 'bootstrap', ...input }); return { kind: 'unreachable', detail: 'must not be called' }; },
        async claimLocalHousehold(input) { calls.push({ fn: 'claim', ...input }); return { kind: 'unreachable', detail: 'must not be called' }; },
      },
      identity: { current: () => staged, set: (next) => { staged = next; }, save: async () => {} },
      localState: onlyAFocus,
      timezone: () => TZ,
      now: () => NOW,
      newClaimKey: () => '88888888-8888-4888-8888-888888888888',
      deviceId: null,
      onAccountIdentified: async () => {},
    });

    const state = await runtime.signIn('apple');
    assert.equal(state.kind, 'boundOther', `expected quarantine, got ${state.kind}`);
    assert.equal(state.quarantinedAccountId, ACCOUNT_A);
    assert.equal(canRenderAccountData(state), false, "A's household must not reach B's screen");
    assert.equal(canWriteToCloud(state), false, 'nothing may be written to the cloud as B');
    assert.deepEqual(calls, [], 'no bootstrap and no claim: A\'s Focus is never uploaded as B\'s');
    assert.equal(staged.quarantine.accountId, ACCOUNT_A, 'the quarantine is recorded against A');
    assert.equal(staged.binding, null, 'and no binding to B was written');
  });
});
