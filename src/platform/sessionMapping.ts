import type { Session } from '@supabase/supabase-js';
import type { AccountId, AccountSession, ProviderIdentity } from '../domain/account/identity';

/**
 * Supabase's session shape, narrowed to ours.
 *
 * `expires_at` is seconds since the epoch and optional; everything else in the
 * app works in milliseconds. Converting once, here, is why nothing downstream
 * has to remember which unit it is holding. A session with no stated expiry is
 * treated as already expired rather than as eternal — that direction fails
 * toward a refresh, and the other fails toward using a dead token.
 */
export function sessionFromSupabase(
  session: Session,
  accountId: AccountId,
  provider: ProviderIdentity | null
): AccountSession {
  return {
    accountId,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: typeof session.expires_at === 'number' ? session.expires_at * 1000 : 0,
    provider,
  };
}
