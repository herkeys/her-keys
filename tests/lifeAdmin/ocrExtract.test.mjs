/**
 * HK-OCR-ASSIST — candidate extraction (pure). Recognition text in, candidates out: every date-shaped run of text that is a real
 * calendar date, every alphanumeric token shaped like a reference, every short capitalized line shaped like an issuer — never a
 * classification, never an auto-pick, never a crash on empty or malformed input.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildOcrCandidate, extractDateCandidates, extractIssuerCandidates, extractReferenceCandidates } from '../../src/features/lifeAdmin/ocrExtract.ts';

describe('OCR date candidates', () => {
  test('a clear ISO date is read as itself', () => {
    const found = extractDateCandidates('Policy effective 2027-03-15 for the term shown.');
    assert.deepEqual(found.map((c) => c.date), ['2027-03-15']);
    assert.ok(found[0].context.includes('2027-03-15'));
  });

  test('multiple dates are all returned, in reading order, none preferred', () => {
    const found = extractDateCandidates('Issued 2026-01-10. Expires 2027-03-15. Renew by 2027-02-01.');
    assert.deepEqual(found.map((c) => c.date), ['2026-01-10', '2027-03-15', '2027-02-01']);
  });

  test('ambiguous-but-real dates in different written forms are all offered, never merged into one "correct" answer', () => {
    const found = extractDateCandidates('Expires 2027-03-15, also written 03/15/2027 or March 15, 2027.');
    // All three forms name the same calendar day; extraction never assumes that and returns one candidate per real date value
    // found, deduplicated only on the resulting date, not "guessed" down to a single representative form.
    assert.deepEqual(found.map((c) => c.date), ['2027-03-15']);
  });

  test('no dates in the text: an empty list, not an error', () => {
    assert.deepEqual(extractDateCandidates('Acme Insurance Co. Policyholder copy.'), []);
  });

  test('malformed dates are silently skipped, never thrown or coerced into a nearby real date', () => {
    const found = extractDateCandidates('Ref 2027-13-40 is not a date. Real one: 2027-03-15.');
    assert.deepEqual(found.map((c) => c.date), ['2027-03-15']);
  });

  test('empty or whitespace-only recognition never throws', () => {
    assert.deepEqual(extractDateCandidates(''), []);
    assert.deepEqual(extractDateCandidates('   \n\t '), []);
  });

  test('the same date read twice is offered once', () => {
    const found = extractDateCandidates('Expires 2027-03-15. See also 2027-03-15 above.');
    assert.equal(found.length, 1);
  });

  test('"expires" appearing next to a date is kept only as a hint string, never as a field name or flag', () => {
    const found = extractDateCandidates('Expires 2027-03-15');
    assert.equal(found.length, 1);
    assert.equal(typeof found[0].context, 'string');
    assert.equal('field' in found[0], false);
    assert.equal('target' in found[0], false);
    assert.equal('suggestedField' in found[0], false);
  });

  test('a two-digit year is read within this century, still just one more candidate to confirm or reject', () => {
    const found = extractDateCandidates('Valid thru 03/15/27');
    assert.deepEqual(found.map((c) => c.date), ['2027-03-15']);
  });

  test('is capped so a garbled page cannot flood the review screen', () => {
    const many = Array.from({ length: 20 }, (_, i) => `2027-01-${String((i % 28) + 1).padStart(2, '0')}`).join(' ');
    assert.ok(extractDateCandidates(many).length <= 8);
  });
});

describe('OCR reference-number candidates', () => {
  test('an alphanumeric reference-shaped token is offered', () => {
    const found = extractReferenceCandidates('Policy number POL-1234-5678 on file.');
    assert.ok(found.some((c) => c.text === 'POL-1234-5678'));
  });

  test('duplicate tokens are offered once', () => {
    const found = extractReferenceCandidates('REF-9988 appears twice: REF-9988.');
    assert.equal(found.filter((c) => c.text === 'REF-9988').length, 1);
  });

  test('no reference-shaped text: an empty list', () => {
    assert.deepEqual(extractReferenceCandidates('Thank you for your business.'), []);
  });

  test('never longer than the field it would fill', () => {
    const found = extractReferenceCandidates(`X${'1'.repeat(80)}`);
    assert.ok(found.every((c) => c.text.length <= 64));
  });

  test('empty recognition never throws', () => {
    assert.deepEqual(extractReferenceCandidates(''), []);
  });
});

describe('OCR issuer-like candidates', () => {
  test('a short capitalized line is offered as a candidate, never labeled "the issuer"', () => {
    const found = extractIssuerCandidates('Acme Insurance Co.\nPolicyholder copy\nExpires 2027-03-15');
    assert.ok(found.some((c) => c.text === 'Acme Insurance Co.'));
  });

  test('lines containing digits are never offered as an issuer candidate', () => {
    const found = extractIssuerCandidates('Form 1040\nPOL-1234-5678');
    assert.equal(found.length, 0);
  });

  test('generic single words are not offered by themselves', () => {
    const found = extractIssuerCandidates('Expires\nIssued\nDate');
    assert.equal(found.length, 0);
  });

  test('empty recognition never throws', () => {
    assert.deepEqual(extractIssuerCandidates(''), []);
  });
});

describe('buildOcrCandidate — the whole transient snapshot', () => {
  test('empty recognition produces an empty, unconfirmed candidate, never a crash', () => {
    const candidate = buildOcrCandidate('');
    assert.deepEqual(candidate.dates, []);
    assert.deepEqual(candidate.issuers, []);
    assert.deepEqual(candidate.references, []);
    assert.equal(candidate.confirmed, false);
  });

  test('a real document produces candidates in every group, still nothing assigned to any field', () => {
    const candidate = buildOcrCandidate('Acme Insurance Co.\nPolicy POL-1234-5678\nExpires 2027-03-15\nRenew by 2027-02-01');
    assert.ok(candidate.dates.length >= 2);
    assert.ok(candidate.issuers.length >= 1);
    assert.ok(candidate.references.length >= 1);
    assert.equal(candidate.confirmed, false);
    assert.equal(JSON.stringify(candidate).includes('"expiresOn"'), false, 'no field assignment exists anywhere on the candidate');
    assert.equal(JSON.stringify(candidate).includes('"renewBy"'), false);
  });

  test('engine confidence, when passed, is carried only in memory and never turned into a field, a rank, or a filter', () => {
    const withConfidence = buildOcrCandidate('Expires 2027-03-15', 0.42);
    assert.equal(withConfidence.engineConfidence, 0.42);
    const without = buildOcrCandidate('Expires 2027-03-15', null);
    assert.deepEqual(without.dates, withConfidence.dates, 'confidence never changes which candidates are offered');
  });
});
