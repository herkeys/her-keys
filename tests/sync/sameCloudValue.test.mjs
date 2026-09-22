import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sameCloudValue } from '../../src/domain/sync/applySupport.ts';

/**
 * AUDIT W2-03 — `looksLikeInstant`'s regex was written `/^d{4}-d{2}-d{2}[ T]d/` (the backslashes before
 * every `d` were missing), so it matched nothing a real timestamp ever looks like. Every instant-valued
 * column fell through to a bare string comparison, so two valid, semantically-identical renderings of the
 * same instant (this device's `.toISOString()` vs Postgres' own rendering) would read as DIFFERENT — able
 * to make `rowMatchesLocal` (domainRules.ts) miss a genuine lost-acknowledgement match and raise a false
 * conflict. Existing tests never happened to compare two differently-formatted equal instants, so the dead
 * regex went unnoticed.
 */
describe('sameCloudValue treats two renderings of the same instant as equal (audit W2-03)', () => {
  test('a trailing-Z ISO string and a Postgres-style numeric-offset string for the same instant are the same value', () => {
    assert.equal(sameCloudValue('2026-09-22T10:00:00.000Z', '2026-09-22T10:00:00+00:00'), true);
  });

  test('a space-separated Postgres timestamp and a T-separated ISO string for the same instant are the same value', () => {
    assert.equal(sameCloudValue('2026-09-22 10:00:00+00', '2026-09-22T10:00:00.000Z'), true);
  });

  test('genuinely different instants are still different', () => {
    assert.equal(sameCloudValue('2026-09-22T10:00:00.000Z', '2026-09-22T10:00:01.000Z'), false);
  });

  test('a non-timestamp string is compared literally, unaffected by the instant path', () => {
    assert.equal(sameCloudValue('user', 'default'), false);
    assert.equal(sameCloudValue('user', 'user'), true);
  });

  test('null/undefined normalize the same way regardless of the instant path', () => {
    assert.equal(sameCloudValue(null, undefined), true);
    assert.equal(sameCloudValue(null, '2026-09-22T10:00:00.000Z'), false);
  });
});
