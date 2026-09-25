import * as WebBrowser from 'expo-web-browser';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthProviderAdapter } from '../domain/account/provider';
import { signInWithGoogleOAuth } from './googleIdentityOAuth';

/**
 * Sign in with Google.
 *
 * One path for iOS and Android: Supabase Auth OAuth (PKCE) opened in the
 * system auth session, returning to `herkeys://auth/callback`. See
 * `googleIdentityOAuth.ts`. There are no per-platform Google client ids and no
 * client secret in the app — Supabase holds the Web identity client.
 *
 * Offered whenever a Supabase provider client exists; the composition root only
 * registers this adapter on platforms that have the durable secure credential
 * store (not web).
 */
export function createGoogleProvider(client: SupabaseClient): AuthProviderAdapter {
  return {
    provider: 'google',

    async isAvailable() {
      return true;
    },

    signIn() {
      return signInWithGoogleOAuth(client, (url, redirectUrl) => WebBrowser.openAuthSessionAsync(url, redirectUrl));
    },
  };
}
