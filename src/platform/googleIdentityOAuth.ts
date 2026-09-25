import type { SupabaseClient } from '@supabase/supabase-js';
import { toAccountId, type ProviderResult } from '../domain/account/identity';
import { sessionFromSupabase } from './sessionMapping';

/**
 * Google identity sign-in through Supabase Auth OAuth — the ONE mobile path.
 *
 * iOS and Android run exactly this code. There is no platform client id, no
 * platform redirect and no `Platform.OS` anywhere in it: Google only ever talks
 * to Supabase (the Web identity client, redirecting to
 * `https://<project>.supabase.co/auth/v1/callback`), and Supabase only ever
 * returns to `herkeys://auth/callback`.
 *
 * The flow is PKCE. The Supabase client is created with `flowType: 'pkce'` and
 * `persistSession: false`, so the code verifier lives in that client's memory
 * and the callback carries a single-use code, never a token. A code captured by
 * anything else registered for the `herkeys` scheme is useless without the
 * verifier this process holds.
 *
 * Google Calendar is a different consent, a different OAuth client and a
 * different route (`herkeys://calendar-connected`). Nothing here may touch it.
 */

/** The only identity return route. Calendar uses its own; they never cross. */
export const GOOGLE_IDENTITY_REDIRECT = 'herkeys://auth/callback';

/** The in-app browser seam. `expo-web-browser`'s `openAuthSessionAsync` in the app. */
export type OpenAuthSession = (
  url: string,
  redirectUrl: string
) => Promise<{ type: 'success'; url: string } | { type: string }>;

export interface OAuthCallback {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  /** True when the callback carried tokens in the URL (implicit flow). Refused. */
  carriesTokens: boolean;
}

/**
 * Whether a URL is the identity callback route: scheme `herkeys`, host `auth`,
 * path `/callback`, and nothing else. A prefix match would also accept
 * `herkeys://auth/callbackX`; this does not.
 *
 * Parsed by hand on purpose — React Native's `URL` is not a full WHATWG
 * implementation, and this must behave identically on both platforms.
 */
export function isGoogleIdentityCallback(url: string): boolean {
  const end = url.search(/[?#]/);
  const base = end === -1 ? url : url.slice(0, end);
  return base.toLowerCase() === GOOGLE_IDENTITY_REDIRECT || base.toLowerCase() === `${GOOGLE_IDENTITY_REDIRECT}/`;
}

/**
 * Expo Router's view of an incoming system link (app/+native-intent.tsx).
 *
 * On Android the auth session learns of the return through `Linking`, so the
 * same `herkeys://auth/callback?code=…` URL is ALSO delivered to the router,
 * which has no such screen. The identity callback belongs to the auth session
 * alone: the router is told to stay where it is (`null`). Every other link —
 * Calendar's `herkeys://calendar-connected` included — passes through untouched.
 * iOS's ASWebAuthenticationSession never hands the URL to the router, so this
 * makes the two platforms behave the same.
 */
export function routerPathForSystemLink(path: string): string | null {
  if (isGoogleIdentityCallback(path)) return null;
  const end = path.search(/[?#]/);
  const base = (end === -1 ? path : path.slice(0, end)).toLowerCase();
  if (base === '/auth/callback' || base === 'auth/callback' || base === '/auth/callback/') return null;
  return path;
}

/** Read the Supabase OAuth callback. Parameters may arrive in the query or the fragment. */
export function parseOAuthCallback(url: string): OAuthCallback {
  const params = new Map<string, string>();
  const hash = url.indexOf('#');
  const beforeHash = hash === -1 ? url : url.slice(0, hash);
  const query = beforeHash.indexOf('?');
  const parts = [query === -1 ? '' : beforeHash.slice(query + 1), hash === -1 ? '' : url.slice(hash + 1)];

  for (const part of parts) {
    for (const pair of part.split('&')) {
      if (pair.length === 0) continue;
      const eq = pair.indexOf('=');
      const key = decode(eq === -1 ? pair : pair.slice(0, eq));
      const value = decode(eq === -1 ? '' : pair.slice(eq + 1));
      // The first occurrence wins: a later duplicate cannot override it.
      if (key !== null && value !== null && !params.has(key)) params.set(key, value);
    }
  }

  const nonEmpty = (key: string) => {
    const value = params.get(key);
    return value === undefined || value.length === 0 ? null : value;
  };

  return {
    code: nonEmpty('code'),
    error: nonEmpty('error_code') ?? nonEmpty('error'),
    errorDescription: nonEmpty('error_description'),
    carriesTokens: params.has('access_token') || params.has('refresh_token') || params.has('provider_token'),
  };
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

export async function signInWithGoogleOAuth(
  client: SupabaseClient,
  openAuthSession: OpenAuthSession
): Promise<ProviderResult> {
  let authorizeUrl: string;
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: GOOGLE_IDENTITY_REDIRECT,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { kind: 'providerError', detail: error.message };
    if (!data?.url) return { kind: 'providerError', detail: 'Supabase returned no Google authorization URL' };
    authorizeUrl = data.url;
  } catch (error) {
    return { kind: 'providerError', detail: describe(error) };
  }

  let result: Awaited<ReturnType<OpenAuthSession>>;
  try {
    result = await openAuthSession(authorizeUrl, GOOGLE_IDENTITY_REDIRECT);
  } catch (error) {
    return { kind: 'providerError', detail: describe(error) };
  }

  // Closing the sheet, or declining the system prompt, is her changing her mind.
  if (result.type === 'cancel' || result.type === 'dismiss') return { kind: 'cancelled' };
  if (result.type !== 'success' || !('url' in result) || typeof result.url !== 'string') {
    return { kind: 'providerError', detail: `Google sign-in ended as ${result.type}` };
  }

  if (!isGoogleIdentityCallback(result.url)) {
    return { kind: 'providerError', detail: 'Google sign-in returned to an unexpected route' };
  }

  const callback = parseOAuthCallback(result.url);
  if (callback.carriesTokens) {
    // PKCE never puts a token in the URL. One that does is not ours to trust.
    return { kind: 'providerError', detail: 'Google sign-in callback carried tokens in the URL' };
  }
  if (callback.error !== null) {
    return {
      kind: 'providerError',
      detail: callback.errorDescription === null ? callback.error : `${callback.error}: ${callback.errorDescription}`,
    };
  }
  if (callback.code === null) return { kind: 'providerError', detail: 'Google sign-in callback carried no code' };

  let session;
  try {
    const { data, error } = await client.auth.exchangeCodeForSession(callback.code);
    if (error) return { kind: 'providerError', detail: error.message };
    session = data.session;
  } catch (error) {
    return { kind: 'providerError', detail: describe(error) };
  }
  if (!session) return { kind: 'providerError', detail: 'Google sign-in produced no session' };

  const accountId = toAccountId(session.user?.id);
  if (accountId === null) return { kind: 'providerError', detail: 'the account id was not a usable uuid' };

  const metadata = session.user?.user_metadata;
  const name = textOrNull(metadata?.full_name) ?? textOrNull(metadata?.name);

  return {
    kind: 'success',
    session: sessionFromSupabase(session, accountId, {
      provider: 'google',
      // Google's own subject when Supabase passes it through; provenance only.
      subject: textOrNull(metadata?.sub) ?? session.user?.id ?? null,
      suggestedDisplayName: name,
    }),
  };
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
