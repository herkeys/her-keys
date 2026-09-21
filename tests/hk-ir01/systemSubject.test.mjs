/**
 * HK-INTEGRATION-READINESS-01 / HA-011 — a child-scoped System cannot lose its child.
 *
 * The cloud already models `household_systems.subject_member_id` (composite FK to a child of the same household).
 * The local System now carries the same subject, in the same member identity space as a Task or Event subject.
 * null means a household-level routine. Nothing is guessed, defaulted to the first child, or identified by name.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateAppState } from '../../src/domain/state.ts';
import { applyCloudRow } from '../../src/domain/sync/apply.ts';
import { rowMatchesLocal } from '../../src/domain/sync/domainRules.ts';
import { pullOnce } from '../../src/domain/sync/pullEngine.ts';
import { UnresolvedReferenceError, toCloudRow } from '../../src/domain/sync/projection.ts';
import { UPDATABLE_COLUMNS, emptyNamespace, updatablePatch } from '../../src/domain/sync/syncTypes.ts';
import { decodeStoredState, encodeStoredState } from '../../src/persistence/envelope.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

const TZ = 'America/Chicago';
const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const DEVICE = '22222222-2222-4222-8222-222222222222';
const uuid = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const CAT = 'cat-home';
const provenance = { producer: 'user-action', artifactId: null, confidence: null };

const system = (over = {}) => ({
  id: 'sys-1',
  name: 'Homework wind-down',
  description: 'Twenty minutes, then screens off.',
  categoryId: CAT,
  subjectMemberId: null,
  provenance,
  scope: 'household',
  ...over,
});
const withChildren = (over = {}) => ({
  ...createEmptyState(TZ),
  children: [
    { id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' },
    { id: 'child-2', displayName: 'Theo', birthDate: '2019-01-15', scope: 'child' },
  ],
  ...over,
});
const namespace = () => ({
  ...emptyNamespace({ accountId: ACCOUNT, householdId: HOUSEHOLD, deviceId: DEVICE }),
  mappings: {
    [`category:${CAT}`]: { kind: 'category', localId: CAT, cloudId: uuid(3), revision: 1 },
    'member:child-1': { kind: 'member', localId: 'child-1', cloudId: uuid(5), revision: 1 },
    'member:child-2': { kind: 'member', localId: 'child-2', cloudId: uuid(6), revision: 1 },
  },
});
const project = (state, id = 'sys-1', ns = namespace()) => toCloudRow(state, { householdId: HOUSEHOLD, profileId: ACCOUNT, namespace: ns }, 'system', id);
const resolver = (id) => ({ [uuid(3)]: CAT, [uuid(5)]: 'child-1', [uuid(6)]: 'child-2' })[id] ?? null;

describe('HA-011 — local canonical parity with the cloud', () => {
  test('a household-level System and a child-scoped System are both representable, and different', () => {
    const household = withChildren({ systems: [system()] });
    const childScoped = withChildren({ systems: [system({ scope: 'child', subjectMemberId: 'child-1' })] });
    assert.equal(validateAppState(household).ok, true);
    assert.equal(validateAppState(childScoped).ok, true);
    assert.notEqual(household.systems[0].subjectMemberId, childScoped.systems[0].subjectMemberId);
  });

  test('a household-scope routine may still be ABOUT a child (the cloud allows it), and the subject is kept', () => {
    const s = withChildren({ systems: [system({ scope: 'household', subjectMemberId: 'child-2' })] });
    assert.equal(validateAppState(s).ok, true);
    assert.equal(project(s).subject_member_id, uuid(6));
  });
});

describe('HA-011 — validation: no guessing, no phantom people, no confusion with the account user', () => {
  const issues = (s) => validateAppState(s).issues?.join(' | ') ?? '';

  test('child scope without a subject is refused, never turned into "the first child"', () => {
    const s = withChildren({ systems: [system({ scope: 'child', subjectMemberId: null })] });
    assert.equal(validateAppState(s).ok, false);
    assert.match(issues(s), /child-scoped but does not name a child/);
  });

  test('a subject that is not a child of this household is refused (missing / other household)', () => {
    const s = withChildren({ systems: [system({ scope: 'child', subjectMemberId: 'child-of-another-household' })] });
    assert.equal(validateAppState(s).ok, false);
    assert.match(issues(s), /references missing child/);
  });

  test('the account user is not a child subject (the cloud composite FK admits children only)', () => {
    const base = withChildren();
    const s = { ...base, systems: [system({ subjectMemberId: base.user.id })] };
    assert.equal(validateAppState(s).ok, false);
    assert.match(issues(s), /references missing child/);
  });

  test('a display name is not an identity: a name with spaces is not a legal id at all', () => {
    const s = withChildren({ systems: [system({ subjectMemberId: 'Mia Smith' })] });
    assert.equal(validateAppState(s).ok, false);
  });

  test('a malformed id is refused', () => {
    const s = withChildren({ systems: [system({ subjectMemberId: '' })] });
    assert.equal(validateAppState(s).ok, false);
  });

  test('a subject left dangling by a later household change is a validation failure, not a silent erase', () => {
    const ok = withChildren({ systems: [system({ scope: 'child', subjectMemberId: 'child-1' })] });
    assert.equal(validateAppState(ok).ok, true);
    const stale = { ...ok, children: ok.children.filter((c) => c.id !== 'child-1') };
    assert.equal(validateAppState(stale).ok, false, 'the mutation that removed the child must be refused, not accepted with the subject erased');
  });
});

describe('HA-011 — the round trip preserves subject identity', () => {
  test('LOCAL -> CLOUD ROW -> LOCAL: a child-scoped subject, a household subject and a household-level null', () => {
    const state = withChildren({
      systems: [
        system({ id: 'sys-1', scope: 'child', subjectMemberId: 'child-1' }),
        system({ id: 'sys-2', scope: 'household', subjectMemberId: 'child-2' }),
        system({ id: 'sys-3', scope: 'household', subjectMemberId: null }),
      ],
    });
    const rows = state.systems.map((s) => project(state, s.id));
    assert.deepEqual(rows.map((r) => r.subject_member_id), [uuid(5), uuid(6), null]);
    assert.ok(!rows.some((r) => 'subject_member_type' in r), 'the server derives the type; the client never sends it');

    let back = createEmptyState(TZ);
    rows.forEach((row, i) => {
      back = applyCloudRow(back, 'system', `sys-${i + 1}`, { ...row, id: uuid(i + 1), revision: 1 }, resolver);
    });
    assert.deepEqual(back.systems.map((s) => [s.id, s.scope, s.subjectMemberId]), [
      ['sys-1', 'child', 'child-1'],
      ['sys-2', 'household', 'child-2'],
      ['sys-3', 'household', null],
    ]);
  });

  test('a subject whose child has no mapping refuses to leave the device rather than sending a household routine', () => {
    const s = withChildren({ systems: [system({ scope: 'child', subjectMemberId: 'child-1' })] });
    const noChild = { ...namespace(), mappings: { [`category:${CAT}`]: namespace().mappings[`category:${CAT}`] } };
    assert.throws(() => project(s, 'sys-1', noChild), (e) => e instanceof UnresolvedReferenceError && /child member child-1/.test(e.message));
  });

  test('the subject is a column a client may UPDATE and an update patch carries it; a null subject is sent as null', () => {
    assert.ok(UPDATABLE_COLUMNS.system.includes('subject_member_id'));
    const s = withChildren({ systems: [system({ scope: 'child', subjectMemberId: 'child-1' }), system({ id: 'sys-2' })] });
    assert.equal(updatablePatch('system', project(s, 'sys-1')).subject_member_id, uuid(5));
    assert.equal(updatablePatch('system', project(s, 'sys-2')).subject_member_id, null);
  });

  test('a lost acknowledgement is recognised only when the subject matches too', () => {
    const s = withChildren({ systems: [system({ scope: 'child', subjectMemberId: 'child-1' })] });
    const ctxp = { householdId: HOUSEHOLD, profileId: ACCOUNT, namespace: namespace() };
    const row = { ...project(s), id: 'x', revision: 2 };
    assert.equal(rowMatchesLocal(s, ctxp, 'system', 'sys-1', row), true);
    assert.equal(rowMatchesLocal(s, ctxp, 'system', 'sys-1', { ...row, subject_member_id: uuid(6) }), false, 'a different child is a different routine');
  });

  test('THROUGH THE REAL PULL ENGINE: a cloud child-scoped System arrives with its child', async () => {
    const row = { ...project(withChildren({ systems: [system({ scope: 'child', subjectMemberId: 'child-1' })] })), id: uuid(9), revision: 1, created_at: '2026-09-21T00:00:00Z' };
    const transport = {
      pull: async () => ({ kind: 'pulled', rows: [{ entityTable: 'household_systems', entityId: uuid(9), op: 'upsert', rowRevision: 1 }], nextCursor: '9' }),
      fetchRows: async () => ({ kind: 'rows', rows: [row] }),
    };
    const ctx = { transport, now: () => Date.UTC(2026, 8, 21), applyRow: applyCloudRow, applyTombstone: (s) => s, mintLocalId: (k, w) => w };
    const out = await pullOnce(withChildren(), namespace(), ctx);
    assert.equal(out.kind, 'applied');
    assert.deepEqual([out.state.systems[0].scope, out.state.systems[0].subjectMemberId], ['child', 'child-1']);
  });

  test('THROUGH THE REAL PULL ENGINE: an unknown child is NOT dropped to a household routine - the batch is refused', async () => {
    const row = { ...project(withChildren({ systems: [system({ scope: 'child', subjectMemberId: 'child-1' })] })), subject_member_id: uuid(8), id: uuid(9), revision: 1 };
    const transport = {
      pull: async () => ({ kind: 'pulled', rows: [{ entityTable: 'household_systems', entityId: uuid(9), op: 'upsert', rowRevision: 1 }], nextCursor: '9' }),
      fetchRows: async () => ({ kind: 'rows', rows: [row] }),
    };
    const ctx = { transport, now: () => Date.UTC(2026, 8, 21), applyRow: applyCloudRow, applyTombstone: (s) => s, mintLocalId: (k, w) => w };
    const out = await pullOnce(withChildren(), namespace(), ctx);
    assert.equal(out.kind, 'integrityRefused');
    assert.match(out.detail, /references missing child/);
  });
});

describe('HA-011 — persistence and restart', () => {
  const encode = (state) => encodeStoredState(state, { appVersion: 'test', savedAt: '2026-09-21T15:00:00.000Z', writeSeq: 1 });

  test('the subject survives encode -> restart -> decode', () => {
    const s = withChildren({ systems: [system({ scope: 'child', subjectMemberId: 'child-1' }), system({ id: 'sys-2' })] });
    const back = decodeStoredState(encode(s)).state;
    assert.deepEqual(back.systems.map((x) => x.subjectMemberId), ['child-1', null]);
  });

  test('a System saved before this contract (no key) reads as a household-level routine and is still valid', () => {
    const s = withChildren({ systems: [system()] });
    const envelope = JSON.parse(encode(s));
    delete envelope.data.systems[0].subjectMemberId;
    const decoded = decodeStoredState(JSON.stringify(envelope));
    assert.equal(decoded.kind, 'valid');
    assert.equal(decoded.state.systems[0].subjectMemberId, null);
  });
});
