/**
 * HK-OCR-ASSIST — every word the scan/review surface says, audited the same way `copyAudit.test.mjs` audits the rest of Life
 * Admin, plus the OCR-specific rules: no confidence language, no percentage, no claim that a candidate is correct or hers before
 * she has said so.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { OCR_COPY } from '../../src/features/lifeAdmin/ocrCopy.ts';

function allCopy(value) {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') {
    const samples = [value('2027-03-15')];
    for (const sample of samples) assert.equal(String(sample).includes('undefined'), false, 'every copy function is sampled with its real arity');
    return samples.filter((s) => typeof s === 'string');
  }
  return [];
}

const ALL = Object.values(OCR_COPY).flatMap(allCopy);

describe('OCR copy audit', () => {
  test('NO GUILT / NO ADMIN SHAMING', () => {
    const shaming = /forgot|forget|fail|behind|should have|should've|overdue|late\b|missed|neglect|lazy|finally|still haven|catch up|get organi[sz]ed|on top of|!/i;
    assert.deepEqual(ALL.filter((line) => shaming.test(line)), []);
  });

  test('NO LEGAL CONCLUSION OR CONSEQUENCE', () => {
    const legal = /invalid|illegal|unlawful|unusable|void|lapsed|not valid|no longer valid|can(no|')t legally|penalt|fine[sd]?\b|urgent|immediately|must renew/i;
    assert.deepEqual(ALL.filter((line) => legal.test(line)), []);
  });

  test('NO CLAIM OF VERIFICATION OR CORRECTNESS: a candidate is read, never confirmed, verified or "correct" by Her Keys', () => {
    const claims = /verified|this is correct|is correct\b|authentic|official copy|we found|we detected|we identified|your policy number is|your expiration date is/i;
    assert.deepEqual(ALL.filter((line) => claims.test(line)), []);
  });

  test('NO PRODUCT-CONFIDENCE OR ENGINE-CONFIDENCE LANGUAGE: no percentage, no high/medium/low confidence, no likely/possible/established', () => {
    const confidence = /%|percent|confidence|\bhigh\b|\bmedium\b|\blow confidence\b|\blikely\b|\bpossible\b|\bestablished\b|most likely|probably/i;
    assert.deepEqual(ALL.filter((line) => confidence.test(line)), []);
  });

  test('the entry point and review screen use "Read by Her Keys" language, never "found" or "detected"', () => {
    assert.match(OCR_COPY.readByHerKeys, /Read by Her Keys/);
    assert.equal(/found|detected|extracted/i.test(OCR_COPY.reviewIntro), false);
  });

  test('nothing here claims to be saved before she acts: "nothing saved" / "review before saving" language is present verbatim', () => {
    assert.match(OCR_COPY.nothingSavedYet, /[Nn]othing is saved/);
    assert.match(OCR_COPY.reviewTitle, /Review before saving/);
  });
});
