import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const prod = 'npykvnxnehlsdlbumzwk';

test('shipping and internal Production smoke builds cannot silently bypass legal and AI consent', () => {
  for (const name of ['production', 'smoke-production-android']) {
    const profile = eas.build[name];
    assert.equal(profile.environment, 'production', name);
    assert.equal(profile.env.EXPO_PUBLIC_HERKEYS_BACKEND, 'production', name);
    assert.equal(profile.env.EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE, 'true', name);
  }
  assert.equal(eas.build['smoke-production-android'].distribution, 'internal');
  assert.equal(eas.build['smoke-production-android'].android.buildType, 'apk');
  for (const profile of Object.values(eas.build)) {
    for (const k of Object.keys(profile.env ?? {})) {
      assert.ok(!k.includes('RESEND_API_KEY') && !k.includes('SERVICE_ROLE') && !k.includes('SECRET_KEY'),
        `Server secret must never appear in EAS public config: ${k}`);
    }
  }
});

test('consent gate is tied to bound accounts and server ledger, not an untrusted screen-only flag', () => {
  const layout = readFileSync('app/_layout.tsx', 'utf8');
  const view = readFileSync('src/features/consent/ConsentFlow.tsx', 'utf8');
  const backend = readFileSync('src/platform/consentBackend.ts', 'utf8');
  const ai = readFileSync('supabase/functions/herkeys-ai/index.ts', 'utf8');
  assert.match(layout, /HERKEYS_V2_CONSENT_GATE/);
  assert.match(layout, /account\.state\.kind === 'accountBound'/);
  assert.match(view, /createConsentLedger/);
  assert.match(view, /'age18'/);
  assert.match(view, /'ai_processing'/);
  assert.match(backend, /\.from\('account_consents'\)/);
  assert.match(ai, /HER_KEYS_AI_REQUIRE_CONSENT/);
  assert.match(ai, /\.eq\('account_id', user\.id\)/);
});
