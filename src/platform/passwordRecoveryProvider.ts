import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from './supabaseCloud';
import { isRateLimited, verifyRecoveryOtp } from './emailOtpProvider';

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
  let pending = false;
  if (!client) {
    return {
      request: async () => 'unavailable',
      verify: async () => 'unavailable',
      updatePassword: async () => 'unavailable',
      dispose: async () => undefined,
    };
  }
  const resultFor = (error: { status?: number; code?: string } | null): RecoveryResult =>
    !error ? 'ok' : isRateLimited(error) ? 'rateLimited' : 'failed';
  const clearSession = async () => {
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* No persisted storage to clean. */ }
  };
  const close = async () => {
    if (disposed) return;
    disposed = true;
    verified = false;
    // End only this temporary recovery session. The app's account runtime is separate.
    await clearSession();
  };
  return {
    async request(email) {
      if (disposed) return 'unavailable';
      if (pending) return 'failed';
      pending = true;
      verified = false;
      try {
        const { error } = await client.auth.resetPasswordForEmail(email);
        if (disposed) return 'unavailable';
        // A recovery-request response cannot be used to determine whether an
        // address exists. Even an account-not-found refusal gets the same UI.
        if (error && isRateLimited(error)) return 'rateLimited';
        if (error && (error.status === 0 || error.code === 'request_timeout' || (typeof error.status === 'number' && error.status >= 500))) return 'failed';
        return 'ok';
      } catch {
        return disposed ? 'unavailable' : 'failed';
      } finally {
        pending = false;
      }
    },
    async verify(email, code) {
      if (disposed) return 'unavailable';
      if (pending) return 'failed';
      pending = true;
      verified = false;
      try {
        const { data, error } = await verifyRecoveryOtp(client, email, code);
        if (disposed) {
          // Cancellation may have signed out before the SDK installed this late
          // response. Clear that temporary credential too, without binding it.
          await clearSession();
          return 'unavailable';
        }
        if (error || !data.session || !data.user || data.user.id !== data.session.user.id) return resultFor(error ?? { status: 400 });
        verified = true;
        return 'ok';
      } catch {
        return disposed ? 'unavailable' : 'failed';
      } finally {
        pending = false;
      }
    },
    async updatePassword(password) {
      // Never let a password be updated before this flow has proved control
      // of the email address via a one-time recovery token.
      if (disposed || pending || !verified) return 'failed';
      if (password.length < 8) return 'failed';
      pending = true;
      try {
        const { error } = await client.auth.updateUser({ password });
        if (disposed) return 'unavailable';
        const result = resultFor(error);
        if (result === 'ok') await close();
        return result;
      } catch {
        return disposed ? 'unavailable' : 'failed';
      } finally {
        pending = false;
      }
    },
    dispose: close,
  };
}
