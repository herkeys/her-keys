/**
 * HK-FEATURE-12 — demo safety (addendum V). The demo household's Life Admin records are few, unmistakably fictional, carry no
 * realistic identifier, and cannot reach an account: demo provenance is refused by the cloud and a demo household never binds.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { demoLifeRecords } from '../../src/data/seed/demoLifeRecords.ts';
import { decideBinding, describeLocalHousehold } from '../../src/domain/account/claim.ts';
import { CLOUD_PRODUCERS } from '../../src/domain/sync/foundationSpecs.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { buildLifeAdminView } from '../../src/features/lifeAdmin/lifeAdminView.ts';
import { DAY, demoState } from '../support/fixtures.mjs';

/** Patterns a realistic sensitive value would match. The demo must match none of them. */
const FORBIDDEN = [
  ['SSN-shaped', /\b\d{3}-\d{2}-\d{4}\b/],
  ['long digit run (card, account, licence or policy number)', /\d{6,}/],
  ['card-shaped groups', /\b\d{4}[ -]\d{4}[ -]\d{4}\b/],
  ['email address', /[^\s@]+@[^\s@]+\.[a-z]{2,}/i],
  ['street address', /\b\d+\s+\w+\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd)\b/i],
  ['phone number', /\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/],
  ['case-number shape', /\b\d{2}-[A-Z]{2}-\d{3,}/],
];

describe('F12 demo fixtures', () => {
  test('at most five records, every title unmistakably fictional, references only DEMO-000N', () => {
    const records = demoLifeRecords(DAY, '2026-09-16T13:00:00.000Z');
    assert.ok(records.length <= 5);
    for (const record of records) {
      assert.match(record.title, /^(Sample|Demo|Example) /, record.title);
      if (record.referenceNumber !== null) assert.match(record.referenceNumber, /^DEMO-\d{4}$/);
      assert.equal(record.provenance.producer, 'demo-seed');
      assert.equal(record.scope, 'personal');
    }
  });

  test('no demo value matches a realistic sensitive pattern (and the test itself catches one that would)', () => {
    const text = JSON.stringify(demoLifeRecords(DAY, '2026-09-16T13:00:00.000Z'));
    for (const [what, pattern] of FORBIDDEN) assert.equal(pattern.test(text), false, what);
    // Test-the-test: each pattern really does catch the thing it names.
    for (const [what, pattern, sample] of [
      ['SSN-shaped', FORBIDDEN[0][1], '123-45-6789'],
      ['long digit run', FORBIDDEN[1][1], 'POL 99887766'],
      ['email', FORBIDDEN[3][1], 'someone@example.com'],
      ['street', FORBIDDEN[4][1], '12 Main Street'],
    ]) assert.equal(pattern.test(sample), true, what);
  });

  test('the demo household is valid, shows the feature (one to review, one coming up), and can never reach an account', () => {
    const state = demoState();
    assert.equal(validateAppState(state).ok, true);
    const view = buildLifeAdminView(state, DAY);
    assert.equal(view.needsReview.length, 1);
    assert.equal(view.comingUp.length, 1);
    assert.equal(CLOUD_PRODUCERS.includes('demo-seed'), false, 'the cloud refuses demo provenance on every synced table');
    const decision = decideBinding(describeLocalHousehold(state), { binding: null, receipt: null }, '11111111-1111-4111-8111-111111111111');
    assert.equal(decision.mode, 'refuseDemo', 'a demo household never binds, so its records never claim or sync');
  });
});
