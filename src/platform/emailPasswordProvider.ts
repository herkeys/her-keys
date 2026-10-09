import type { SupabaseClient } from '@supabase/supabase-js';
import { toAccountId } from '../domain/account/identity';
import type { EmailPasswordPort, EmailPasswordResult } from '../domain/account/emailPassword';
import { sessionFromSupabase } from './sessionMapping';

/**
 * Passwords go directly to Supabase Auth on the isolated provider client.
 * They never enter AppState, SecureStore, sync, diagnostic messages, or an
 * application-managed password hash. Auth sessions are installed only by
 * AccountRuntime after account/household ownership checks.
 */
export function createSupabaseEmailPassword(client: SupabaseClient): EmailPasswordPort {
  return {
    isAvailable: () => true,
    async authenticate(mode, email, password): Promise<EmailPasswordResult> {
      try {
        const response = mode === 'signUp'
          ? await client.auth.signUp({ email, password })
          : await client.auth.signInWithPassword({ email, password });

        if (response.error) {
          const status = response.error.status;
          const code = response.error.code;
          const detail = typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code)
            ? code : typeof status === 'number' ? `status_${status}` : 'unknown';
          if (status === 0 || (typeof status === 'number' && status >= 500)) {
            return { kind: 'unreachable', detail };
          }
          // Never expose Supabase's message: it may contain an address.
          return { kind: 'rejected', detail };
        }

        // Confirm Email ON: signUp produces a user but no session. Do not
        // create a local household binding or suggest authentication succeeded.
        if (mode === 'signUp' && response.data.user && !response.data.session) {
          return { kind: 'confirmationRequired' };
        }
        const session = response.data.session;
        if (!session) return { kind: 'rejected', detail: 'no_session' };
        const accountId = toAccountId(session.user?.id);
        if (accountId === null) return { kind: 'rejected', detail: 'account_id_not_uuid' };
        return {
          kind: 'success',
          session: sessionFromSupabase(session, accountId, {
            provider: 'email', subject: null, suggestedDisplayName: null,
          }),
        };
      } catch {
        return { kind: 'unreachable', detail: 'auth_request_threw' };
      }
    },
  };
}
