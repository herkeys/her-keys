/**
 * `expo-crypto` stand-in backed by node:crypto, so the REAL identity adapters get real randomness and a real SHA-256 under
 * `node --test`. The random source can be sabotaged (`globalThis.__hkCrypto.failRandom`) to prove a provider fails closed.
 */
import { createHash, randomBytes } from 'node:crypto';

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };
export const CryptoEncoding = { HEX: 'hex', BASE64: 'base64' };

export function getRandomBytes(byteCount) {
  if (globalThis.__hkCrypto?.failRandom) throw new Error('secure random unavailable');
  globalThis.__hkCrypto = { ...globalThis.__hkCrypto, randomCalls: (globalThis.__hkCrypto?.randomCalls ?? 0) + 1 };
  return new Uint8Array(randomBytes(byteCount));
}

export async function digestStringAsync(algorithm, data, options = {}) {
  if (algorithm !== CryptoDigestAlgorithm.SHA256) throw new Error(`unexpected digest ${algorithm}`);
  return createHash('sha256').update(data, 'utf8').digest(options.encoding === CryptoEncoding.BASE64 ? 'base64' : 'hex');
}
