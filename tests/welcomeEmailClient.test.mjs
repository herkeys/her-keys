import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isProductionWelcomeEnabled, requestProductionWelcomeEmail } from '../src/platform/welcomeEmailClient.ts';

const PROD = { backend: 'production', url: 'https://npykvnxnehlsdlbumzwk.supabase.co', anonKey: 'publishable' };
const STAGING = { backend: 'staging', url: 'https://fhhudicklmpofuzkxeqe.supabase.co', anonKey: 'publishable' };

test('production-only welcome requests cannot invoke from Staging, K Scan, or spoofed projects', async () => {
  assert.equal(isProductionWelcomeEnabled(PROD), true);
  for (const config of [STAGING, { ...PROD, url: 'https://wyyuqfdxucjksghsmhry.supabase.co' },
    { ...PROD, backend: 'staging' },
    { ...PROD, url: 'https://npykvnxnehlsdlbumzwk.supabase.co.evil.test' }]) {
    assert.equal(isProductionWelcomeEnabled(config), false);
  }
  const calls = [];
  const client = { functions: { invoke: async (name, args) => { calls.push([name, args]); return { data: {}, error: null }; } } };
  await requestProductionWelcomeEmail(client, STAGING);
  await requestProductionWelcomeEmail(client, { ...PROD, url: 'http://npykvnxnehlsdlbumzwk.supabase.co' });
  assert.deepEqual(calls, []);
  await requestProductionWelcomeEmail(client, PROD);
  assert.deepEqual(calls, [['herkeys-welcome-email', { body: {} }]], 'no user email or household data supplied');
});

test('welcome delivery failure never interrupts authentication', async () => {
  const broken = { functions: { invoke: async () => { throw new Error('temporary outage'); } } };
  await requestProductionWelcomeEmail(broken, PROD);
  await requestProductionWelcomeEmail(null, PROD);
});

test('the server authenticates the caller and owns delivery idempotency, never trusts email from mobile input', () => {
  const fn = readFileSync('supabase/functions/herkeys-welcome-email/index.ts', 'utf8');
  assert.match(fn, /await requireUser\(req\)/);
  assert.match(fn, /user\.email_confirmed_at/);
  assert.match(fn, /HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED/);
  assert.match(fn, /RESEND_API_KEY/);
  assert.match(fn, /template: \{ id: TEMPLATE_ALIAS \}/);
  assert.match(fn, /Idempotency-Key/);
  assert.match(fn, /herkeys_claim_welcome_email/);
  assert.ok(fn.indexOf('await requireUser(req)') < fn.indexOf('fetch(\'https://api.resend.com/emails\''), 'user must be validated before provider request');
  assert.ok(!fn.includes('req.json()'), 'recipient may not be supplied by client');
  const sql = readFileSync('supabase/migrations/20261009020000_herkeys_welcome_email_receipts.sql', 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE .* FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /PRIMARY KEY REFERENCES auth\.users\(id\)/);
  assert.match(sql, /herkeys_claim_welcome_email/);
  assert.match(sql, /interval '23 hours'/);
});
