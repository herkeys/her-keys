/**
 * HK-FEATURE-05 — child identity and how two children are told apart (scenario C: colliding names).
 * The identity of a child is its id. A name is only what is shown, and where two look alike the label carries EXISTING context
 * (age, birth date) - never an internal id.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { bornText, collisionKey, compareChildren, labelChildren, orderedChildren } from '../../src/features/kids/identity.ts';
import { TODAY, emptyHousehold, makeCtx, withChildren } from './support.mjs';

const kids = (list) => withChildren(emptyHousehold(), makeCtx(), list).children;

describe('collisionKey: names a reader could mistake for one another', () => {
  test('case, spacing, accents, punctuation and look-alike letters are ignored', () => {
    const same = ['Sam', 'sam', 'SAM', ' Sam ', 'S a m', 'S.am', 'Sám', "S'am", 'Sаm' /* Cyrillic a */];
    const keys = new Set(same.map(collisionKey));
    assert.equal(keys.size, 1, [...keys].join(','));
  });

  test('genuinely different names do not collide', () => {
    assert.notEqual(collisionKey('Sam'), collisionKey('Sami'));
    assert.notEqual(collisionKey('Ivy'), collisionKey('Ava'));
  });
});

describe('labels', () => {
  test('a unique name is "Name, age" and shows no birth date', () => {
    const labels = labelChildren(kids([['Sam', '2018-03-03'], ['Ivy', '2021-06-10']]), TODAY);
    assert.deepEqual(labels.map((l) => l.full), ['Sam, 8', 'Ivy, 5']);
    assert.ok(labels.every((l) => l.nameCollides === false && l.ordinal === null));
  });

  test('two children with the same first name are told apart by age and birth date', () => {
    const labels = labelChildren(kids([['Sam', '2018-03-03'], ['Sam', '2020-07-07']]), TODAY);
    assert.deepEqual(labels.map((l) => l.full), ['Sam, 8 · born Mar 3, 2018', 'Sam, 6 · born Jul 7, 2020']);
    assert.ok(labels.every((l) => l.nameCollides && l.ordinal === null));
  });

  test('look-alike names ("Sam" and "sam ") also carry context', () => {
    const labels = labelChildren(kids([['Sam', '2018-03-03'], ['sam ', '2020-07-07']]), TODAY);
    assert.ok(labels.every((l) => l.nameCollides));
    assert.notEqual(labels[0].full, labels[1].full);
  });

  test('twins with the same name AND birth date get a stable ordinal, and only then', () => {
    const list = kids([['Sam', '2018-03-03'], ['Sam', '2018-03-03'], ['Ivy', '2018-03-03']]);
    const labels = labelChildren(list, TODAY);
    const sams = labels.filter((l) => l.displayName === 'Sam');
    assert.deepEqual(sams.map((l) => l.ordinal), [{ position: 1, of: 2 }, { position: 2, of: 2 }]);
    assert.equal(new Set(sams.map((l) => l.full)).size, 2, 'the two are distinguishable');
    assert.equal(labels.find((l) => l.displayName === 'Ivy').ordinal, null);
  });

  test('no label, ever, contains an internal id', () => {
    const list = kids([['Sam', '2018-03-03'], ['Sam', '2018-03-03']]);
    for (const l of labelChildren(list, TODAY)) {
      for (const child of list) assert.equal(l.full.includes(child.id), false);
    }
  });

  test('a baby reads "under 1" and a future-dated birth never yields a negative age', () => {
    const [baby] = labelChildren(kids([['Baby', '2026-06-01']]), TODAY);
    assert.equal(baby.ageText, 'under 1');
    assert.equal(baby.short, 'Baby, under 1');
  });
});

describe('ordering is stable and never depends on array position', () => {
  test('the same children in any array order give the same order and the same labels', () => {
    const list = kids([['Sam', '2018-03-03'], ['Ivy', '2021-06-10'], ['Max', '2015-01-01'], ['Sam', '2018-03-03']]);
    const forward = orderedChildren(list).map((c) => c.id);
    const reversed = orderedChildren([...list].reverse()).map((c) => c.id);
    const rotated = orderedChildren([...list.slice(2), ...list.slice(0, 2)]).map((c) => c.id);
    assert.deepEqual(reversed, forward);
    assert.deepEqual(rotated, forward);
    assert.deepEqual(labelChildren([...list].reverse(), TODAY).map((l) => [l.childId, l.full]), labelChildren(list, TODAY).map((l) => [l.childId, l.full]));
  });

  test('oldest first, then name, then id', () => {
    const a = { id: 'b', displayName: 'Ann', birthDate: '2018-01-01' };
    const b = { id: 'a', displayName: 'Ann', birthDate: '2018-01-01' };
    const c = { id: 'c', displayName: 'Zed', birthDate: '2017-01-01' };
    assert.deepEqual([a, b, c].sort(compareChildren).map((x) => x.id), ['c', 'a', 'b']);
  });

  test('bornText is hand-formatted (no locale data)', () => {
    assert.equal(bornText('2018-03-03'), 'Mar 3, 2018');
    assert.equal(bornText('2020-12-25'), 'Dec 25, 2020');
  });
});
