import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountSessionClient,
  SessionActivation,
  SessionClientEvent,
} from '../domain/account/sessionClient';
import { toAccountId, type AccountId, type ProviderIdentity } from '../domain/account/identity';
import { sessionFromSupabase } from './sessionMapping';

/**
 * Bridges the one durable Her Keys credential store to Supabase's in-memory
 * auth session. Supabase persistence remains disabled.
 */
export function createSupabaseSessionClient(client: SupabaseClient): AccountSessionClient {
  const listeners = new Set<(event: SessionClientEvent) => void>();
  let installed: { accountId: AccountId; provider: ProviderIdentity | null } | null = null;

  const emit = (event: SessionClientEvent) => {
    for (const listener of listeners) listener(event);
  };

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' && session !== null && installed !== null) {
      const accountId = toAccountId(session.user?.id);
      if (accountId === null || accountId !== installed.accountId) return;
      emit({ type: 'refreshed', session: map(session, accountId, installed.provider) });
      return;
    }

    if (event === 'SIGNED_OUT') {
      installed = null;
      emit({ type: 'signedOut' });
    }
  });

  return {
    async activate(session): Promise<SessionActivation> {
      installed = { accountId: session.accountId, provider: session.provider };
      try {
        // Supabase documents that setSession refreshes an expired session when
        // the refresh token is still valid.
        const { data, error } = await client.auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });

        if (error) {
          installed = null;
          return authFailure(error);
        }
        if (!data.session) {
          installed = null;
          return { kind: 'invalid', detail: 'Supabase accepted no active session' };
        }

        const accountId = toAccountId(data.session.user?.id);
        if (accountId === null || accountId !== session.accountId) {
          await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
          installed = null;
          return { kind: 'invalid', detail: 'restored session did not belong to the active Her Keys account' };
        }

        return { kind: 'active', session: map(data.session, accountId, session.provider) };
      } catch (error) {
        installed = null;
        return { kind: 'unreachable', detail: describe(error) };
      }
    },

    async signOut() {
      // A quarantined provider session is never installed in this transport
      // client, so there may be nothing here to end.
      if (installed === null) return { kind: 'ok' as const };
      try {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) return { kind: 'error' as const, detail: error.message };
        installed = null;
        return { kind: 'ok' as const };
      } catch (error) {
        return { kind: 'error' as const, detail: describe(error) };
      }
    },

    startAutoRefresh() {
      client.auth.startAutoRefresh();
    },

    stopAutoRefresh() {
      client.auth.stopAutoRefresh();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function map(session: Session, accountId: AccountId, provider: ProviderIdentity | null) {
  return sessionFromSupabase(session, accountId, provider);
}

function authFailure(error: { message: string; status?: number }): SessionActivation {
  const text = error.message.toLowerCase();
  if ((error.status ?? 0) >= 500 || text.includes('network') || text.includes('fetch')) {
    return { kind: 'unreachable', detail: error.message };
  }
  return { kind: 'invalid', detail: error.message };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
