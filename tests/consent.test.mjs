import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consentStatus, HER_KEYS_CONSENT_VERSIONS as V } from '../src/domain/consent.ts';

const at = (consent_type, granted, policy_version = V[consent_type], recorded_at = '2026-10-08T20:00:00Z') => ({ consent_type, policy_version, granted, recorded_at });
const legal = [at('terms', true), at('privacy', true), at('age18', true)];
test('all three required legal confirmations must match current document versions', () => {
  for (const item of legal) {
    assert.equal(consentStatus(legal.filter((r) => r !== item)).legalAccepted, false);
  }
  assert.equal(consentStatus([...legal, at('ai_processing', false)]).legalAccepted, true);
  assert.equal(consentStatus([...legal, at('terms', true, 'outdated-version', '2026-10-09T20:00:00Z')]).legalAccepted, false);
});
test('AI consent is never inferred from Terms, account creation or a missing checkbox', () => {
  assert.deepEqual(consentStatus(legal), { legalAccepted: true, aiDecisionRecorded: false, aiPermitted: false });
  assert.deepEqual(consentStatus([...legal, at('ai_processing', false)]), { legalAccepted: true, aiDecisionRecorded: true, aiPermitted: false });
  assert.deepEqual(consentStatus([...legal, at('ai_processing', true)]), { legalAccepted: true, aiDecisionRecorded: true, aiPermitted: true });
});
test('latest decision wins, including withdrawal; a new AI policy requires fresh consent', () => {
  const yes = at('ai_processing', true, V.ai_processing, '2026-10-08T20:00:00Z');
  const no = at('ai_processing', false, V.ai_processing, '2026-10-09T20:00:00Z');
  assert.equal(consentStatus([...legal, yes, no]).aiPermitted, false);
  assert.equal(consentStatus([...legal, no, yes]).aiPermitted, false);
  assert.equal(consentStatus([...legal, at('ai_processing', true, 'old-ai-consent')]).aiPermitted, false);
});
