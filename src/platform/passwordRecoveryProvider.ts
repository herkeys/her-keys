import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from './supabaseCloud';

/**
 * Account recovery is deliberately ISOLATED from AccountRuntime's session.
 * Verifying a recovery code creates a temporary auth session on this
 * dedicated, non-persisted Supabase client. It NEVER binds a household.
 * The only authorized use of this session is to update that user's password.
 */
export type RecoveryResult = 'ok' | 'failed' | 'rateLimited' | 'unavailable';

export interface PasswordRecoveryPort {
  request(email: string): Promise<RecoveryResult>;
  verify(email: string, code: string): Promise<RecoveryResult>;
  updatePassword(password: string): Promise<RecoveryResult>;
  dispose(): Promise<void>;
}

export function createPasswordRecoveryPort(client: SupabaseClient | null = createSupabaseClient()): PasswordRecoveryPort {
  let verified = false;
  let disposed = false;
  if (!client) {
    return {
      request: async () => 'unavailable',
      verify: async () => 'unavailable',
      updatePassword: async () => 'unavailable',
      dispose: async () => undefined,
    };
  }
  const resultFor = (error: { status?: number } | null): RecoveryResult =>
    !error ? 'ok' : error.status === 429 ? 'rateLimited' : 'failed';
  return {
    async request(email) {
      if (disposed) return 'unavailable';
      try {
        const { error } = await client.auth.resetPasswordForEmail(email);
        return resultFor(error);
      } catch {
        return 'failed';
      }
    },
    async verify(email, code) {
      if (disposed) return 'unavailable';
      try {
        const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'recovery' });
        if (error || !data.session || !data.user || data.user.id !== data.session.user.id) return resultFor(error ?? { status: 400 });
        verified = true;
        return 'ok';
      } catch {
        return 'failed';
      }
    },
    async updatePassword(password) {
      // Never let a password be updated before this flow has proved control
      // of the email address via a one-time recovery token.
      if (disposed || !verified) return 'failed';
      if (password.length < 8) return 'failed';
      try {
        const { error } = await client.auth.updateUser({ password });
        const result = resultFor(error);
        if (result === 'ok') await this.dispose();
        return result;
      } catch {
        return 'failed';
      }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      verified = false;
      // Local sign-out only. Do not revoke sessions on any other device.
      try { await client.auth.signOut({ scope: 'local' }); } catch { /* Ephemeral client has no persisted storage. */ }
    },
  };
}
