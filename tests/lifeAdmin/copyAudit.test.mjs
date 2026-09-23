/**
 * HK-FEATURE-12 — every word Life Admin says, audited (M4). No guilt, no admin-shaming, no legal conclusion, no claim that a record
 * was verified or that Her Keys holds the document, no invented renewal window.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KIND_LABEL, LIFE_ADMIN_COPY } from '../../src/features/lifeAdmin/lifeAdminCopy.ts';

/** Every string the copy table can produce, with sample arguments for the functions. */
function allCopy(value) {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') {
    const samples = value.length >= 2 ? [value('Passport', '22 Sep 2026')] : [value(3), value(1), value('22 Sep 2026'), value('Passport')];
    for (const sample of samples) assert.equal(String(sample).includes('undefined'), false, 'every copy function is sampled with its real arity');
    return samples.filter((s) => typeof s === 'string');
  }
  if (value && typeof value === 'object') return Object.values(value).flatMap(allCopy);
  return [];
}

const ALL = [...allCopy(LIFE_ADMIN_COPY), ...Object.values(KIND_LABEL)];

describe('F12 copy audit', () => {
  test('NO GUILT / NO ADMIN SHAMING: nothing says she forgot, failed, fell behind or should have', () => {
    const shaming = /forgot|forget|fail|behind|should have|should've|overdue|late\b|missed|neglect|lazy|finally|still haven|catch up|get organi[sz]ed|on top of|!/i;
    assert.deepEqual(ALL.filter((line) => shaming.test(line)), []);
  });

  test('DATE PASSED DOES NOT MEAN LEGALLY INVALID: no legal conclusion or consequence is ever said', () => {
    const legal = /invalid|illegal|unlawful|unusable|void|lapsed|not valid|no longer valid|expired and|can(no|')t legally|penalt|fine[sd]?\b|urgent|immediately|must renew/i;
    assert.deepEqual(ALL.filter((line) => legal.test(line)), []);
  });

  test('RECORD EXISTS DOES NOT MEAN VERIFIED, and F12 DOES NOT CLAIM TO POSSESS A FILE: the detail says exactly that', () => {
    assert.match(LIFE_ADMIN_COPY.detailFacts, /hasn.t checked it/);
    assert.match(LIFE_ADMIN_COPY.detailFacts, /not the document itself/);
    const claims = /verified|confirmed by|authentic|official copy|stored securely|your document is safe|uploaded|scanned|on file/i;
    assert.deepEqual(ALL.filter((line) => claims.test(line)), []);
  });

  test('F12 DOES NOT STORE SECRETS: the reference field says what does not belong in it', () => {
    assert.match(LIFE_ADMIN_COPY.fieldReferenceHelp, /passwords, PINs, card or account numbers, or Social Security numbers/);
  });

  test('no invented renewal window: no "30 days", "60 days", "90 days" or "renew within" anywhere', () => {
    assert.deepEqual(ALL.filter((line) => /\b(30|60|90)[ -]day|renew within|renewal window/i.test(line)), []);
  });

  test('the verdict sentences are exactly the addendum J forms', () => {
    assert.equal(LIFE_ADMIN_COPY.verdictNeedsReview(1), 'One record needs review.');
    assert.equal(LIFE_ADMIN_COPY.verdictNeedsReview(4), '4 records need review.');
    assert.equal(LIFE_ADMIN_COPY.verdictExpired(1), 'One record has passed its recorded expiration date.');
    assert.equal(LIFE_ADMIN_COPY.verdictExpired(2), '2 records have passed their recorded expiration dates.');
    assert.equal(LIFE_ADMIN_COPY.verdictNext('Lease', '25 Sep 2026'), 'Next: Lease — 25 Sep 2026.');
    assert.equal(LIFE_ADMIN_COPY.verdictNothing, 'Nothing needs review.');
  });
});
