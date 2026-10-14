import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthProviderAdapter } from '../domain/account/provider';
import { toAccountId, type ProviderResult } from '../domain/account/identity';
import { sessionFromSupabase } from './sessionMapping';

/**
 * One sign-in attempt's replay protection.
 *
 * Apple copies `request.nonce` verbatim into the identity token's `nonce` claim (expo-apple-authentication
 * ios/AppleAuthenticationRequest.swift), and Supabase hashes the RAW nonce it is given and compares it with that claim
 * (@supabase/auth-js `signInWithIdToken`). So Apple must be sent the SHA-256 hex digest and Supabase the raw value. The
 * raw value exists only inside one `signIn()` call: it is never stored, returned or logged.
 */
export interface AppleNonce {
  raw: string;
  hashed: string;
}

/** 32 bytes (256 bits) from the platform's secure random source, hex encoded, and the SHA-256 hex digest of that string. */
export async function createAppleNonce(): Promise<AppleNonce> {
  const bytes = Crypto.getRandomBytes(32);
  const raw = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

/**
 * Sign in with Apple.
 *
 * Apple hands back the person's full name exactly once, on the very first
 * authorization, and never again (B4-P0-016). It is captured here as a
 * SUGGESTION and nothing more: the account is the Supabase user id, the name is
 * provenance, and failing to keep the name must never fail the sign-in.
 */
export function createAppleProvider(client: SupabaseClient): AuthProviderAdapter {
  return {
    provider: 'apple',

    async isAvailable() {
      if (Platform.OS !== 'ios') return false;
      return AppleAuthentication.isAvailableAsync();
    },

    async signIn(): Promise<ProviderResult> {
      // No nonce, no sign-in: a missing secure random source must never fall back to an unbound token.
      let nonce: AppleNonce;
      try {
        nonce = await createAppleNonce();
      } catch {
        return { kind: 'providerError', detail: 'Apple sign-in could not start securely' };
      }

      let credential: AppleAuthentication.AppleAuthenticationCredential;
      try {
        credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: nonce.hashed,
        });
      } catch (error) {
        // Changing her mind is not an error to show her.
        if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { kind: 'cancelled' };
        return { kind: 'providerError', detail: error instanceof Error ? error.message : String(error) };
      }

      if (!credential.identityToken) {
        return { kind: 'providerError', detail: 'Apple returned no identity token' };
      }

      const { data, error } = await client.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: nonce.raw,
      });
      if (error) return { kind: 'providerError', detail: error.message };
      if (!data.session) return { kind: 'providerError', detail: 'Apple sign-in produced no session' };
      // Code exchange is server-only. The authorization code is never persisted on the device.
      // A legacy/unconfigured revocation service cannot break the nonce-bound sign-in contract.
      if (credential.authorizationCode && client.functions?.invoke) {
        await client.functions.invoke('capture-apple-credential', { body: { code: credential.authorizationCode } }).catch(() => undefined);
      }

      const accountId = toAccountId(data.session.user?.id);
      if (accountId === null) return { kind: 'providerError', detail: 'the account id was not a usable uuid' };

      return {
        kind: 'success',
        session: sessionFromSupabase(data.session, accountId, {
          provider: 'apple',
          subject: credential.user ?? null,
          suggestedDisplayName: joinName(credential.fullName),
        }),
      };
    },
  };
}

function joinName(fullName: AppleAuthentication.AppleAuthenticationFullName | null): string | null {
  if (!fullName) return null;
  const joined = [fullName.givenName, fullName.familyName].filter(Boolean).join(' ').trim();
  return joined.length > 0 ? joined : null;
}
