import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, test } from 'node:test';
import '../support/googleAuth/register.mjs';

/**
 * IOS-D01: native Sign in with Apple is nonce-bound.
 *
 * The contract, read from the INSTALLED sources (expo-apple-authentication 57.0.2, @supabase/auth-js 2.116.0):
 *   - `signInAsync({ nonce })` sets `ASAuthorizationAppleIDRequest.nonce` verbatim (ios/AppleAuthenticationRequest.swift), and Apple
 *     copies that exact string into the identity token's `nonce` claim. So the request must carry the SHA-256 HEX DIGEST.
 *   - `signInWithIdToken({ nonce })` takes the RAW nonce: the server hashes it and compares it with the token's `nonce` claim.
 * A token minted for one attempt therefore cannot be replayed into another, and a token with no nonce is no longer what is sent.
 *
 * These run the REAL `appleProvider.ts`; only the native modules are stubbed (tests/support/googleAuth).
 */

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://fhhudicklmpofuzkxeqe.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_only';
process.env.EXPO_PUBLIC_HERKEYS_BACKEND = 'staging';

const { createAppleProvider } = await import('../../src/platform/appleProvider.ts');

const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const sha256Hex = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

const session = () => ({
  access_token: 'access-apple',
  refresh_token: 'refresh-apple',
  expires_at: 2_000_000_000,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: ACCOUNT, user_metadata: {} },
});

/** A Supabase client double that records every `signInWithIdToken` call. */
function fakeSupabase(over = {}) {
  const idTokenCalls = [];
  const client = {
    auth: {
      async signInWithIdToken(args) {
        idTokenCalls.push(args);
        if (over.signInWithIdToken) return over.signInWithIdToken(args);
        const s = session();
        return { data: { session: s, user: s.user }, error: null };
      },
    },
  };
  return { client, idTokenCalls };
}

const credential = (over = {}) => ({ identityToken: 'apple-identity-token', user: 'apple-sub', fullName: null, ...over });

beforeEach(() => {
  globalThis.__hkPlatformOS = 'ios';
  globalThis.__hkApple = { credential: credential(), requests: [] };
  globalThis.__hkCrypto = {};
});

describe('IOS-D01 the Apple request and the Supabase exchange share one nonce', () => {
  test('Apple is sent the SHA-256 hex digest; Supabase is sent the raw nonce that digests to it', async () => {
    const { client, idTokenCalls } = fakeSupabase();
    const result = await createAppleProvider(client).signIn();

    assert.equal(result.kind, 'success');
    assert.equal(globalThis.__hkApple.requests.length, 1);
    const hashed = globalThis.__hkApple.requests[0].nonce;
    assert.match(hashed, /^[0-9a-f]{64}$/, 'the request nonce is a SHA-256 hex digest');

    assert.equal(idTokenCalls.length, 1);
    const raw = idTokenCalls[0].nonce;
    assert.equal(typeof raw, 'string');
    assert.notEqual(raw, hashed, 'the raw nonce never goes to Apple');
    assert.equal(sha256Hex(raw), hashed, 'Supabase can hash the raw nonce to the value Apple embedded in the token');
    assert.equal(idTokenCalls[0].provider, 'apple');
    assert.equal(idTokenCalls[0].token, 'apple-identity-token');
  });

  test('the raw nonce has at least 128 bits of entropy (32 random bytes)', async () => {
    const { client, idTokenCalls } = fakeSupabase();
    await createAppleProvider(client).signIn();
    assert.ok(idTokenCalls[0].nonce.length >= 64, `raw nonce is ${idTokenCalls[0].nonce.length} characters`);
    assert.equal(globalThis.__hkCrypto.randomCalls, 1, 'drawn from the secure random source exactly once per attempt');
  });

  test('every attempt gets a fresh nonce', async () => {
    const { client, idTokenCalls } = fakeSupabase();
    const provider = createAppleProvider(client);
    await provider.signIn();
    await provider.signIn();
    assert.notEqual(idTokenCalls[0].nonce, idTokenCalls[1].nonce);
    assert.notEqual(globalThis.__hkApple.requests[0].nonce, globalThis.__hkApple.requests[1].nonce);
  });

  test('the existing scopes are unchanged (name and email are still requested)', async () => {
    const { client } = fakeSupabase();
    await createAppleProvider(client).signIn();
    assert.deepEqual(globalThis.__hkApple.requests[0].requestedScopes, [0, 1]);
  });
});

describe('IOS-D01 failure handling', () => {
  test('without a secure random source it fails CLOSED: no Apple sheet, no Supabase call, no unbound fallback', async () => {
    globalThis.__hkCrypto = { failRandom: true };
    const { client, idTokenCalls } = fakeSupabase();
    const result = await createAppleProvider(client).signIn();

    assert.equal(result.kind, 'providerError');
    assert.equal(globalThis.__hkApple.requests.length, 0, 'Apple was never asked');
    assert.equal(idTokenCalls.length, 0, 'Supabase was never called');
  });

  test('cancelling the Apple sheet is a cancellation, not an error, and nothing reaches Supabase', async () => {
    globalThis.__hkApple.error = Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' });
    const { client, idTokenCalls } = fakeSupabase();
    const result = await createAppleProvider(client).signIn();
    assert.deepEqual(result, { kind: 'cancelled' });
    assert.equal(idTokenCalls.length, 0);
  });

  test('a provider failure from Apple is a providerError', async () => {
    globalThis.__hkApple.error = Object.assign(new Error('boom'), { code: 'ERR_REQUEST_FAILED' });
    const { client, idTokenCalls } = fakeSupabase();
    const result = await createAppleProvider(client).signIn();
    assert.equal(result.kind, 'providerError');
    assert.equal(idTokenCalls.length, 0);
  });

  test('a nonce mismatch rejected by Supabase is a providerError that carries neither nonce nor token', async () => {
    const { client, idTokenCalls } = fakeSupabase({
      signInWithIdToken: async () => ({ data: { session: null, user: null }, error: { message: 'Nonces mismatch' } }),
    });
    const result = await createAppleProvider(client).signIn();
    assert.equal(result.kind, 'providerError');
    const serialised = JSON.stringify(result);
    assert.ok(!serialised.includes(idTokenCalls[0].nonce), 'raw nonce is not echoed');
    assert.ok(!serialised.includes(globalThis.__hkApple.requests[0].nonce), 'hashed nonce is not echoed');
    assert.ok(!serialised.includes('apple-identity-token'), 'identity token is not echoed');
  });

  test('a success result carries no nonce anywhere', async () => {
    const { client, idTokenCalls } = fakeSupabase();
    const result = await createAppleProvider(client).signIn();
    const serialised = JSON.stringify(result);
    assert.ok(!serialised.includes(idTokenCalls[0].nonce));
    assert.ok(!serialised.includes(globalThis.__hkApple.requests[0].nonce));
  });

  test('a missing identity token is still refused before Supabase', async () => {
    globalThis.__hkApple.credential = credential({ identityToken: null });
    const { client, idTokenCalls } = fakeSupabase();
    const result = await createAppleProvider(client).signIn();
    assert.equal(result.kind, 'providerError');
    assert.equal(idTokenCalls.length, 0);
  });
});

describe('IOS-D01 source guard', () => {
  const source = readFileSync('src/platform/appleProvider.ts', 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  test('the nonce comes from expo-crypto, never from Math.random or Date', () => {
    assert.match(code, /from 'expo-crypto'/);
    assert.doesNotMatch(code, /Math\.random|Date\.now|new Date/);
  });

  test('the provider never logs (a nonce or token must not reach any console)', () => {
    assert.doesNotMatch(code, /console\./);
  });

  test('both halves of the contract are in the one file', () => {
    assert.match(code, /nonce:\s*\w+\.hashed/);
    assert.match(code, /signInWithIdToken\(\{[\s\S]*nonce:\s*\w+\.raw/);
  });
});
