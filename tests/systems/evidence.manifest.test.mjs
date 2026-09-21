import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { evidenceFiles } from './support/canon.mjs';
import { EVIDENCE_MANIFEST } from './support/manifest.mjs';

describe('structural evidence — committed artifacts and scenarios stay in step', () => {
  test('every committed evidence file is owned by a scenario, and every scenario has its file', () => {
    assert.deepEqual(evidenceFiles(), EVIDENCE_MANIFEST);
  });
});
