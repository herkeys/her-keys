import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import type { SupabaseClient } from '@supabase/supabase-js';
import { googleAuthConfig } from '../config/supabase';
import { toAccountId, type ProviderResult } from '../domain/account/identity';
import type { AuthProviderAdapter } from '../domain/account/provider';
import { sessionFromSupabase } from './sessionMapping';

/**
 * Sign in with Google.
 *
 * expo-auth-session ships no Google-specific helper in SDK 57, so the request
 * is built against Google's published OIDC discovery document directly. The
 * flow asks for an `id_token`, which is what Supabase's `signInWithIdToken`
 * wants — there is no server round trip of our own, and no client secret in
 * app source.
 */
const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

function clientIdForPlatform(): string | undefined {
  if (Platform.OS === 'ios') return googleAuthConfig.iosClientId;
  if (Platform.OS === 'android') return googleAuthConfig.androidClientId;
  return googleAuthConfig.webClientId;
}

export function createGoogleProvider(client: SupabaseClient): AuthProviderAdapter {
  return {
    provider: 'google',

    async isAvailable() {
      // A build with no client id for this platform cannot offer Google, and
      // saying so up front is better than a button that always fails.
      return Boolean(clientIdForPlatform());
    },

    async signIn(): Promise<ProviderResult> {
      const clientId = clientIdForPlatform();
      if (!clientId) {
        return { kind: 'configurationError', detail: `No Google client id is configured for ${Platform.OS}` };
      }

      // Required on Android so the browser result comes back to the app.
      WebBrowser.maybeCompleteAuthSession();

      // Google requires a nonce on the implicit id_token flow, and it is what
      // makes a captured token useless when replayed.
      const nonce = Crypto.randomUUID();

      const request = new AuthSession.AuthRequest({
        clientId,
        redirectUri: AuthSession.makeRedirectUri({ scheme: 'herkeys' }),
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.IdToken,
        extraParams: { nonce },
      });

      let result: AuthSession.AuthSessionResult;
      try {
        result = await request.promptAsync(DISCOVERY);
      } catch (error) {
        return { kind: 'providerError', detail: error instanceof Error ? error.message : String(error) };
      }

      if (result.type === 'cancel' || result.type === 'dismiss') return { kind: 'cancelled' };
      if (result.type !== 'success') {
        return { kind: 'providerError', detail: `Google sign-in ended as ${result.type}` };
      }

      const idToken = result.params?.id_token;
      if (!idToken) return { kind: 'providerError', detail: 'Google returned no id_token' };

      const { data, error } = await client.auth.signInWithIdToken({ provider: 'google', token: idToken });
      if (error) return { kind: 'providerError', detail: error.message };
      if (!data.session) return { kind: 'providerError', detail: 'Google sign-in produced no session' };

      const accountId = toAccountId(data.session.user?.id);
      if (accountId === null) return { kind: 'providerError', detail: 'the account id was not a usable uuid' };

      return {
        kind: 'success',
        session: sessionFromSupabase(data.session, accountId, {
          provider: 'google',
          subject: data.session.user?.id ?? null,
          suggestedDisplayName:
            typeof data.session.user?.user_metadata?.full_name === 'string'
              ? data.session.user.user_metadata.full_name
              : null,
        }),
      };
    },
  };
}
