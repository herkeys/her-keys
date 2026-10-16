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

test('EVERY EAS profile targets a Her Keys backend explicitly, compiles the consent gate and uses empty data mode', () => {
  // Build 2A: development and preview (the Staging testing profiles) previously omitted the gate, so a testing build silently
  // skipped mandatory legal/AI consent. A profile added later without these values fails here rather than shipping.
  const expectedBackend = { development: 'staging', preview: 'staging', production: 'production' };
  const profiles = Object.entries(eas.build);
  assert.ok(profiles.length >= 4, 'the four known profiles must still exist');
  for (const [name, profile] of profiles) {
    const backend = profile.env?.EXPO_PUBLIC_HERKEYS_BACKEND;
    assert.ok(backend === 'staging' || backend === 'production', `${name} must name its backend explicitly`);
    assert.equal(profile.env.EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE, 'true', `${name} must compile the consent gate`);
    assert.equal(profile.env.EXPO_PUBLIC_HERKEYS_DATA_MODE, 'empty', `${name} must not run demo data against a backend`);
    assert.equal(backend, expectedBackend[profile.environment], `${name}: the EAS environment ${profile.environment} must match backend ${backend}`);
  }
});

test('consent gate is tied to bound accounts and server ledger, not an untrusted screen-only flag', () => {
  const layout = readFileSync('app/_layout.tsx', 'utf8');
  const view = readFileSync('src/features/consent/ConsentFlow.tsx', 'utf8');
  const backend = readFileSync('src/platform/consentBackend.ts', 'utf8');
  const ai = readFileSync('supabase/functions/herkeys-ai/index.ts', 'utf8');
  assert.match(layout, /if \(account\.state\.kind === 'accountBound'\)\s*\{\s*return <ConsentGate session=\{account\.state\.session\}>\{afterConsent\}<\/ConsentGate>/);
  assert.doesNotMatch(layout, /if\s*\([^)]*(?:process\.env|HERKEYS_V2_CONSENT_GATE)[^)]*\)/, 'mandatory consent cannot be skipped by an environment flag');
  assert.match(layout, /account\.state\.kind === 'accountBound'/);
  assert.match(view, /createConsentLedger/);
  assert.match(view, /'age18'/);
  assert.match(view, /'ai_processing'/);
  assert.match(backend, /\.from\('account_consents'\)/);
  assert.doesNotMatch(ai, /HER_KEYS_AI_REQUIRE_CONSENT/, 'server-side consent must never depend on an optional deployment flag');
  assert.match(ai, /\.eq\('account_id', user\.id\)/);
});

test('the Edge Function and the client agree on the current AI Data Processing policy version', async () => {
  // The function compares the newest receipt with a literal. If the client constant is ever bumped without redeploying the
  // function, every account's valid receipt is refused (or, the other way round, a stale one accepted). Pin them together.
  const { HER_KEYS_CONSENT_VERSIONS } = await import('../src/domain/consent.ts');
  const ai = readFileSync('supabase/functions/herkeys-ai/index.ts', 'utf8');
  const literal = ai.match(/decisions\[0\]\.policy_version !== '([^']+)'/);
  assert.ok(literal, 'the server consent guard must compare the receipt with an explicit policy version');
  assert.equal(literal[1], HER_KEYS_CONSENT_VERSIONS.ai_processing);
  // The server guard must also require an affirmative decision, not merely a recorded one.
  assert.match(ai, /decisions\[0\]\.granted !== true/);
  // And it must fail closed: an unreadable ledger or a missing receipt both refuse.
  assert.match(ai, /consentError \|\| decisions\?\.length !== 1/);
});

test('Talk It Out always checks affirmative AI consent before contacting Gemini', () => {
  const ai = readFileSync('supabase/functions/herkeys-ai/index.ts', 'utf8');
  const authenticate = ai.indexOf('const user = await requireUser(req);');
  const ledger = ai.indexOf(".from('account_consents')", authenticate);
  const denied = ai.indexOf("reason: 'ai_processing_consent_required'", ledger);
  const provider = ai.indexOf('const outcome = await providerRequest(', denied);
  assert.ok(authenticate >= 0 && ledger > authenticate && denied > ledger && provider > denied,
    'auth must precede an unconditional consent read and denial before the Gemini request');
  const gate = ai.slice(authenticate, provider);
  assert.doesNotMatch(gate, /if\s*\(\s*Deno\.env\.get\(/,
    'no deployment secret flag may disable the server-side AI consent gate');
  assert.match(gate, /decisions\[0\]\.granted !== true/,
    'missing, expired or declined affirmative consent must fail closed');
});
