import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthProviderAdapter } from '../domain/account/provider';
import { toAccountId, type ProviderResult } from '../domain/account/identity';
import { sessionFromSupabase } from './sessionMapping';

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
      let credential: AppleAuthentication.AppleAuthenticationCredential;
      try {
        credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
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
      });
      if (error) return { kind: 'providerError', detail: error.message };
      if (!data.session) return { kind: 'providerError', detail: 'Apple sign-in produced no session' };

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
