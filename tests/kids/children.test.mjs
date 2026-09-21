/**
 * HK-FEATURE-05 / F-K0-01 — adding a child: the one local transition that creates the canonical member identity.
 * No schema change: the Child written is the stored ChildSchema, and it survives persistence.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MAX_CHILDREN, addChild, checkNewChild, cleanChildName } from '../../src/domain/children.ts';
import { decodeStoredState, encodeStoredState } from '../../src/persistence/envelope.ts';
import { UNBOUND_IDENTITY } from '../../src/domain/account/binding.ts';
import { addChildToHousehold, canAddChild } from '../../src/features/kids/mutations.ts';
import { TODAY, assertValid, emptyHousehold, makeCtx, withChildren } from './support.mjs';

describe('addChild', () => {
  test('writes a canonical Child with a minted id; the state stays valid', () => {
    const c = makeCtx();
    const s = addChild(emptyHousehold(), c, { displayName: 'Sam', birthDate: '2018-03-03' });
    assert.equal(s.children.length, 1);
    assert.deepEqual(Object.keys(s.children[0]).sort(), ['birthDate', 'displayName', 'id', 'scope']);
    assert.equal(s.children[0].scope, 'child');
    assert.match(s.children[0].id, /^child-/);
    assertValid(s);
  });

  test('the name is cleaned: trimmed, inner whitespace collapsed', () => {
    assert.equal(cleanChildName('  Mary   Ann \t Lee '), 'Mary Ann Lee');
    const s = addChild(emptyHousehold(), makeCtx(), { displayName: '  Mary   Ann ', birthDate: '2019-01-01' });
    assert.equal(s.children[0].displayName, 'Mary Ann');
  });

  test('two children may share a name; identity is the id, never the name', () => {
    const c = makeCtx();
    const s = withChildren(emptyHousehold(), c, [['Sam', '2018-03-03'], ['Sam', '2020-07-07']]);
    assert.equal(s.children.length, 2);
    assert.notEqual(s.children[0].id, s.children[1].id);
    assertValid(s);
  });

  test('every refusal returns the SAME state object and names why', () => {
    const c = makeCtx();
    const s = emptyHousehold();
    const cases = [
      [{ displayName: '   ', birthDate: '2018-03-03' }, 'blank_name'],
      [{ displayName: 'x'.repeat(81), birthDate: '2018-03-03' }, 'name_too_long'],
      [{ displayName: 'Sam', birthDate: '2018-02-30' }, 'bad_birth_date'],
      [{ displayName: 'Sam', birthDate: 'March 3rd' }, 'bad_birth_date'],
      [{ displayName: 'Sam', birthDate: '2026-09-22' }, 'birth_date_in_future'],
      [{ displayName: 'Sam', birthDate: '1899-12-31' }, 'birth_date_too_early'],
    ];
    for (const [input, reason] of cases) {
      assert.equal(checkNewChild(s, input, TODAY), reason);
      assert.equal(addChild(s, c, input), s, reason);
    }
  });

  test('today is a valid birth date; the household is capped at the stored limit', () => {
    const c = makeCtx();
    assert.equal(checkNewChild(emptyHousehold(), { displayName: 'Baby', birthDate: TODAY }, TODAY), null);
    let s = emptyHousehold();
    for (let i = 0; i < MAX_CHILDREN; i += 1) s = addChild(s, c, { displayName: `Kid ${i}`, birthDate: '2015-05-05' });
    assert.equal(s.children.length, MAX_CHILDREN);
    assert.equal(checkNewChild(s, { displayName: 'One more', birthDate: '2015-05-05' }, TODAY), 'too_many_children');
    assert.equal(addChild(s, c, { displayName: 'One more', birthDate: '2015-05-05' }), s);
    assertValid(s);
  });

  test('a child survives encode -> decode: identity, name and birth date, exactly', () => {
    const s = withChildren(emptyHousehold(), makeCtx(), [['Sam', '2018-03-03'], ['Ivy', '2021-06-10']]);
    const stored = encodeStoredState(s, { appVersion: 't', savedAt: '2026-09-21T15:00:00.000Z', writeSeq: 1 });
    const decoded = decodeStoredState(stored);
    assert.equal(decoded.kind, 'valid');
    assert.deepEqual(decoded.state.children, s.children);
  });
});

describe('addChildToHousehold (the step a screen runs)', () => {
  test('reports the refusal and never half-writes', () => {
    const s = emptyHousehold();
    const out = addChildToHousehold(s, makeCtx(), { displayName: '', birthDate: '2018-03-03' });
    assert.equal(out.outcome, 'blank_name');
    assert.equal(out.state, s);
    assert.equal(out.childId, null);
  });

  test('reports the new id on success', () => {
    const out = addChildToHousehold(emptyHousehold(), makeCtx(), { displayName: 'Sam', birthDate: '2018-03-03' });
    assert.equal(out.outcome, 'added');
    assert.equal(out.childId, out.state.children[0].id);
  });
});

describe('who can add a child (OC-01, RESOLVED: a household bound to an account MUST be able to add one)', () => {
  const binding = { accountId: '11111111-1111-4111-8111-111111111111', householdId: '22222222-2222-4222-8222-222222222222', boundAt: '2026-09-21T15:00:00.000Z', kind: 'claim', idMap: {} };

  test('an unbound household may add, and so may one bound to an account (and one signed out of it)', () => {
    assert.equal(canAddChild(UNBOUND_IDENTITY), true);
    assert.equal(canAddChild({ ...UNBOUND_IDENTITY, binding }), true, 'a household bound to an account can add a child');
    assert.equal(canAddChild({ ...UNBOUND_IDENTITY, binding, receipt: null, sync: null }), true, 'and is not held back by having no sync state yet');
  });

  test('only a household that belongs to ANOTHER account cannot (it is preserved and never rendered, uploaded or merged)', () => {
    const quarantined = { ...UNBOUND_IDENTITY, binding, quarantine: { accountId: '33333333-3333-4333-8333-333333333333', detectedAt: '2026-09-21T15:00:00.000Z' } };
    assert.equal(canAddChild(quarantined), false);
  });

  test('the same transition adds the same canonical child in every case: no second child model, no identity of its own', () => {
    const c = makeCtx();
    const asUnbound = addChildToHousehold(emptyHousehold(), c, { displayName: 'Sam', birthDate: '2018-03-03' });
    const asBound = addChildToHousehold(emptyHousehold(), makeCtx(), { displayName: 'Sam', birthDate: '2018-03-03' });
    assert.deepEqual(asUnbound.state.children, asBound.state.children);
    assert.deepEqual(Object.keys(asBound.state.children[0]).sort(), ['birthDate', 'displayName', 'id', 'scope']);
    assert.notEqual(asBound.state.children[0].id, asBound.state.user.id, 'a child is never the account user');
  });
});
