import type * as ExpoCrypto from 'expo-crypto';

/**
 * The two WebCrypto calls supabase-js needs for PKCE, backed by expo-crypto's native implementation
 * (installed once, at the root of the app, by `installWebCrypto.ts`).
 *
 * Hermes has no `crypto` global. Without it, supabase-js builds the PKCE code verifier from `Math.random` and sends the
 * challenge with method `plain` (it warns "WebCrypto API is not supported"), so Google sign-in ran on the weakest form of
 * PKCE on both platforms (AE2E-D02). RFC 7636 requires S256 from any client able to compute it.
 *
 * Fill-only: an implementation the runtime already provides is never replaced. Pure: the native module is passed in.
 */
interface CryptoShimTarget {
  crypto?: {
    getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
    subtle?: { digest?: (algorithm: string, data: BufferSource) => Promise<ArrayBuffer> };
  };
}

export type CryptoBackend = Pick<typeof ExpoCrypto, 'getRandomValues' | 'digest'>;

/** WebCrypto names -> expo-crypto's CryptoDigestAlgorithm values (which are the same strings). */
const DIGESTS = new Set(['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);

export function installWebCryptoShim(target: CryptoShimTarget, backend: CryptoBackend): void {
  const crypto = target.crypto ?? (target.crypto = {});
  if (typeof crypto.getRandomValues !== 'function') {
    crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      backend.getRandomValues(array as unknown as Uint8Array);
      return array;
    };
  }
  const subtle = crypto.subtle ?? (crypto.subtle = {});
  if (typeof subtle.digest !== 'function') {
    subtle.digest = (algorithm: string, data: BufferSource) => {
      const name = algorithm.toUpperCase();
      // Never fall back to a weaker hash: an algorithm this shim does not know is an error, exactly as WebCrypto reports it.
      if (!DIGESTS.has(name)) return Promise.reject(new Error(`NotSupportedError: ${algorithm}`));
      return backend.digest(name as Parameters<CryptoBackend['digest']>[0], data);
    };
  }
}
