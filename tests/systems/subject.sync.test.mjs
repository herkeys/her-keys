/**
 * SC-01 — the association a consumer chooses in the System editor survives the sync path in both directions.
 *
 * B2B-N01 made the existing `subjectChoices` / `setSubject` contract reachable from the editor. This pins, at the app's own
 * sync boundary (projection out, apply in), that what she chose is what a second device receives, that household scope stays
 * household, and that an association this device cannot resolve is never quietly turned into a household routine.
 * The cloud side of the same contract is proven against real Postgres by supabase/tests (30-child-subject, journey-composition).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyCloudRow } from '../../src/domain/sync/apply.ts';
import { toCloudRow } from '../../src/domain/sync/projection.ts';
import { UnresolvedReferenceError } from '../../src/domain/sync/projectionSupport.ts';
import { emptyNamespace } from '../../src/domain/sync/syncTypes.ts';
import { CHILDREN, childSystemRow, realHousehold, systemRow, withRows } from './support/canon.mjs';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
const cloud = (n) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`;

const namespaceWithChildren = () => ({
  ...emptyNamespace({ accountId: ACCOUNT, householdId: HOUSEHOLD, deviceId: '44444444-4444-4444-8444-444444444444' }),
  mappings: {
    'category:cat-home': { kind: 'category', localId: 'cat-home', cloudId: cloud(3), revision: 1 },
    'member:child-1': { kind: 'member', localId: 'child-1', cloudId: cloud(5), revision: 1 },
    'member:child-2': { kind: 'member', localId: 'child-2', cloudId: cloud(6), revision: 1 },
  },
});
const ctx = () => ({ householdId: HOUSEHOLD, profileId: ACCOUNT, namespace: namespaceWithChildren() });
const resolve = (id) => ({ [cloud(3)]: 'cat-home', [cloud(5)]: 'child-1', [cloud(6)]: 'child-2' })[id] ?? null;

describe('SC-01 a System’s child association round-trips through sync', () => {
  test('outbound: a child System carries the child’s cloud id, child scope and no owner profile', () => {
    const state = withRows(realHousehold({ children: CHILDREN }), { systems: [childSystemRow('child-2', { id: 'sys-child' })] });
    const row = toCloudRow(state, ctx(), 'system', 'sys-child');
    assert.equal(row.scope, 'child');
    assert.equal(row.subject_member_id, cloud(6), 'the cloud uuid of the chosen child, never the local id');
    assert.equal(row.owner_profile_id, null, 'a child-scoped row carries no owner profile');
  });

  test('inbound on a second device: the association comes home as that device’s own child id', () => {
    const state = withRows(realHousehold({ children: CHILDREN }), { systems: [childSystemRow('child-1', { id: 'sys-child' })] });
    const row = { ...toCloudRow(state, ctx(), 'system', 'sys-child'), id: cloud(9), revision: 1 };
    const second = applyCloudRow(realHousehold({ children: CHILDREN }), 'system', 'sys-child', row, resolve);
    assert.equal(second.systems[0].subjectMemberId, 'child-1');
    assert.equal(second.systems[0].scope, 'child');
  });

  test('a household System stays household in both directions: no child is invented', () => {
    const state = withRows(realHousehold({ children: CHILDREN }), { systems: [systemRow({ id: 'sys-home' })] });
    const row = toCloudRow(state, ctx(), 'system', 'sys-home');
    assert.equal(row.subject_member_id, null);
    assert.equal(row.scope, 'household');
    const second = applyCloudRow(realHousehold({ children: CHILDREN }), 'system', 'sys-home', { ...row, id: cloud(8), revision: 1 }, resolve);
    assert.equal(second.systems[0].subjectMemberId, null);
    assert.equal(second.systems[0].scope, 'household');
  });

  test('clearing the association (child -> household) is what the next outbound row says', () => {
    const before = withRows(realHousehold({ children: CHILDREN }), { systems: [childSystemRow('child-1', { id: 'sys-1' })] });
    assert.equal(toCloudRow(before, ctx(), 'system', 'sys-1').subject_member_id, cloud(5));
    const after = withRows(realHousehold({ children: CHILDREN }), { systems: [systemRow({ id: 'sys-1', scope: 'household', subjectMemberId: null })] });
    const row = toCloudRow(after, ctx(), 'system', 'sys-1');
    assert.equal(row.subject_member_id, null);
    assert.equal(row.scope, 'household');
  });

  test('an association this device cannot resolve is refused outbound and kept raw inbound, never dropped to household', () => {
    const state = withRows(realHousehold({ children: CHILDREN }), { systems: [childSystemRow('child-1', { id: 'sys-1' })] });
    const unmapped = { householdId: HOUSEHOLD, profileId: ACCOUNT, namespace: { ...namespaceWithChildren(), mappings: { 'category:cat-home': { kind: 'category', localId: 'cat-home', cloudId: cloud(3), revision: 1 } } } };
    assert.throws(() => toCloudRow(state, unmapped, 'system', 'sys-1'), UnresolvedReferenceError);

    const row = { ...toCloudRow(state, ctx(), 'system', 'sys-1'), id: cloud(9), revision: 1 };
    const received = applyCloudRow(realHousehold({ children: CHILDREN }), 'system', 'sys-1', row, (id) => (id === cloud(3) ? 'cat-home' : null));
    assert.equal(received.systems[0].subjectMemberId, cloud(5), 'the raw uuid is kept so the integrity gate names it');
    assert.notEqual(received.systems[0].subjectMemberId, null, 'a child’s routine is never silently re-scoped to the household');
  });
});
