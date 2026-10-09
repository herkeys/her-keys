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

test('server-side AI gateway enforces the same current version before provider invocation', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('supabase/functions/herkeys-ai/index.ts', 'utf8');
  assert.match(source, /HER_KEYS_AI_REQUIRE_CONSENT/);
  assert.match(source, /\.eq\('account_id', user\.id\)/);
  assert.match(source, /\.eq\('consent_type', 'ai_processing'\)/);
  assert.match(source, /\.granted !== true/);
  assert.match(source, /adminClient\(\)/);
  assert.ok(source.includes(`policy_version !== '${V.ai_processing}'`), 'client/server AI policy version must match');
  assert.ok(source.indexOf('HER_KEYS_AI_REQUIRE_CONSENT') < source.indexOf('await providerRequest('), 'authorization precedes third-party data transfer');
});
