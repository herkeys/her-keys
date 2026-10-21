import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { installWebCryptoShim } from '../src/platform/webCryptoShim.ts';

// AE2E-D02: Hermes has no WebCrypto, so supabase-js fell back to a Math.random PKCE verifier and the `plain` challenge method.
// The shim supplies getRandomValues and SHA-256 from expo-crypto (Node's own primitives stand in for it here).

test('the root layout installs the shim before anything that can create a Supabase client', () => {
  const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
  const imports = [...layout.matchAll(/^import .*?['"]([^'"]+)['"];?$/gm)].map((m) => m[1]);
  assert.equal(imports[0], '../src/platform/installWebCrypto');
  const install = readFileSync(new URL('../src/platform/installWebCrypto.ts', import.meta.url), 'utf8');
  assert.match(install, /installWebCryptoShim\(globalThis[^,]*, Crypto\)/);
});

const nodeRandom = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
const nodeBackend = () => {
  const calls = { random: 0, digest: [] };
  return {
    calls,
    getRandomValues(array) { calls.random++; nodeRandom(array); return array; },
    async digest(algorithm, data) {
      calls.digest.push(algorithm);
      const hash = createHash(algorithm.replace('-', '').toLowerCase()).update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest();
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
    },
  };
};

test('a runtime with no crypto global gets a CSPRNG getRandomValues and a SHA-256 subtle.digest', async () => {
  const target = {};
  const backend = nodeBackend();
  installWebCryptoShim(target, backend);
  const bytes = target.crypto.getRandomValues(new Uint32Array(56));
  assert.equal(backend.calls.random, 1);
  assert.ok(bytes.some((v) => v !== 0), 'the array is filled by the native backend');

  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const digest = await target.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  // RFC 7636 Appendix B: this verifier's S256 challenge.
  assert.equal(Buffer.from(digest).toString('base64url'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.deepEqual(backend.calls.digest, ['SHA-256']);
});

test('supabase-js then sends an S256 challenge instead of plain', async () => {
  const target = {};
  installWebCryptoShim(target, nodeBackend());
  // auth-js reads the GLOBAL crypto; run its own challenge helper against the shimmed object.
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: target.crypto, configurable: true, writable: true });
  try {
    const { getCodeChallengeAndMethod } = await import('@supabase/auth-js/dist/main/lib/helpers.js');
    const memory = new Map();
    const storage = { getItem: async (k) => memory.get(k) ?? null, setItem: async (k, v) => { memory.set(k, v); }, removeItem: async (k) => { memory.delete(k); } };
    const [challenge, method] = await getCodeChallengeAndMethod(storage, 'sb-test');
    assert.equal(method, 's256');
    const [verifier] = [...memory.values()].map(String);
    assert.ok(verifier && verifier.length >= 43, 'a stored code verifier exists');
    assert.notEqual(challenge, verifier, 'the challenge is never the verifier itself');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'crypto', saved);
  }
});

test('an existing implementation is never replaced, and unknown algorithms are refused rather than downgraded', async () => {
  const own = { getRandomValues: (a) => a, subtle: { digest: async () => new ArrayBuffer(1) } };
  const target = { crypto: own };
  installWebCryptoShim(target, nodeBackend());
  assert.equal(target.crypto.getRandomValues, own.getRandomValues);
  assert.equal(target.crypto.subtle.digest, own.subtle.digest);

  const bare = {};
  installWebCryptoShim(bare, nodeBackend());
  await assert.rejects(bare.crypto.subtle.digest('MD5', new Uint8Array(1)), /NotSupportedError/);
});
