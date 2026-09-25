import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig, isSupabaseConfigured } from '../config/supabase';
import type { BootstrapInput, ClaimInput, CloudAccountClient, CloudCall } from '../domain/account/cloudClient';
import type { AccountSession } from '../domain/account/identity';

/**
 * The Supabase transport.
 *
 * `persistSession` is off on purpose. The session credential has exactly one
 * home — the secure-session boundary — and letting the Supabase client keep its
 * own copy in AsyncStorage would quietly create a second one, in the very place
 * B4-P0-013 says a token may not be (`herkeys.appState` sits in the same
 * store). The app hands the client a session when it has one instead.
 *
 * `flowType: 'pkce'` is for Google identity OAuth (googleIdentityOAuth.ts): the
 * redirect carries a single-use code, never a token, and the code verifier sits
 * in this client's in-memory storage — `persistSession: false` means supabase-js
 * never touches AsyncStorage or localStorage for it. Apple's id-token sign-in
 * and `setSession` are unaffected by the flow type.
 */
export function createSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return createClient(supabaseConfig.url as string, supabaseConfig.anonKey as string, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

/** Give the client the credential for this call. Nothing is written to disk here. */
export async function applySession(client: SupabaseClient, session: AccountSession): Promise<void> {
  await client.auth.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken });
}

export function createSupabaseAccountClient(client: SupabaseClient): CloudAccountClient {
  const call = async (fn: string, args: Record<string, unknown>): Promise<CloudCall> => {
    try {
      const { data, error } = await client.rpc(fn, args);
      if (error) {
        // A PostgREST error carries the RPC's own RAISE message and its
        // structured DETAIL, which is where the claim puts its evidence about
        // an unresolved target. Both are kept.
        const detail = [error.message, error.details].filter(Boolean).join(' | ');
        return isTransport(error) ? { kind: 'unreachable', detail } : { kind: 'rejected', detail };
      }
      return { kind: 'ok', body: data };
    } catch (thrown) {
      // Anything that escapes the client is a transport failure by elimination:
      // the server never got to answer, so the request may or may not have
      // committed and the same claim key must be replayed.
      return { kind: 'unreachable', detail: thrown instanceof Error ? thrown.message : String(thrown) };
    }
  };

  return {
    bootstrapAccount: (input: BootstrapInput) =>
      call('bootstrap_account', {
        p_claim_key: input.claimKey,
        p_timezone: input.timezone,
        p_device_id: input.deviceId,
      }),

    claimLocalHousehold: (input: ClaimInput) =>
      call('claim_local_household', {
        p_claim_key: input.claimKey,
        p_timezone: input.timezone,
        p_payload: input.payload,
        p_device_id: input.deviceId,
      }),
  };
}

/**
 * Whether the server ever answered.
 *
 * A PostgREST error with no SQL state never reached Postgres, so the request
 * may still be in flight or may never have arrived — exactly the case a retry
 * with the same claim key exists for. An error carrying a SQL state is the
 * database's considered refusal, and retrying it would only be refused again.
 */
function isTransport(error: { code?: string | null }): boolean {
  return !error.code;
}
