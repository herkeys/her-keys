import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailOtpPort, EmailOtpRequestResult, EmailOtpVerifyResult } from '../domain/account/emailOtp';
import { toAccountId } from '../domain/account/identity';
import { sessionFromSupabase } from './sessionMapping';

/**
 * Passwordless email through Supabase Auth: `signInWithOtp` asks for a code,
 * `verifyOtp` (type `email`) trades it for a session.
 *
 * It runs on the PROVIDER client, the same isolated client Apple and Google
 * use, so a verified session is checked against the bound Her Keys actor by
 * AccountRuntime before it can ever be installed on the client that reaches
 * data. Nothing is persisted here: that client keeps no storage
 * (`persistSession: false`), the code is passed straight through and dropped,
 * and the session is handed back for the one durable credential store to keep.
 *
 * No redirect is requested. The email carries a numeric code she types in; a
 * link, if the project's template also includes one, is never how this app
 * signs in.
 *
 * The address goes to Supabase exactly as typed. Supabase owns identity
 * linkage; the account is the user id that comes back, never the address.
 */
export function createSupabaseEmailOtp(client: SupabaseClient): EmailOtpPort {
  return {
    isAvailable: () => true,

    async request(email): Promise<EmailOtpRequestResult> {
      try {
        const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (!error) return { kind: 'sent' };
        const detail = codeOf(error);
        if (isRateLimited(error)) return { kind: 'rateLimited', detail };
        if (isUnreachable(error)) return { kind: 'unreachable', detail };
        return { kind: 'rejected', detail };
      } catch {
        return { kind: 'unreachable', detail: 'request_threw' };
      }
    },

    async verify(email, code): Promise<EmailOtpVerifyResult> {
      let session;
      try {
        const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
        if (error) {
          const detail = codeOf(error);
          if (isCodeRejection(error)) return { kind: 'codeRejected', detail };
          if (isRateLimited(error)) return { kind: 'rateLimited', detail };
          if (isUnreachable(error)) return { kind: 'unreachable', detail };
          return { kind: 'failed', detail };
        }
        session = data.session;
      } catch {
        return { kind: 'unreachable', detail: 'verify_threw' };
      }

      if (!session) return { kind: 'failed', detail: 'no_session' };
      const accountId = toAccountId(session.user?.id);
      if (accountId === null) return { kind: 'failed', detail: 'account_id_not_uuid' };

      return {
        kind: 'success',
        // Provenance only. The address is not recorded as a subject: it is not
        // the account, and the credential store has no need to hold it.
        session: sessionFromSupabase(session, accountId, { provider: 'email', subject: null, suggestedDisplayName: null }),
      };
    },
  };
}

/** What an auth-js error is known to carry. Read structurally, so no error class is imported. */
interface AuthFailure {
  status?: number;
  code?: string;
}

/**
 * A stable machine code for a failure — Supabase's own `error_code` when it
 * sent one, the HTTP status otherwise. NEVER the message: Supabase's messages
 * can quote the address back ("Email address "…" is invalid"), and this value
 * is what reaches a diagnostic.
 */
function codeOf(error: AuthFailure): string {
  if (typeof error.code === 'string' && /^[a-z0-9_]{1,64}$/.test(error.code)) return error.code;
  return typeof error.status === 'number' ? `status_${error.status}` : 'unknown';
}

function isRateLimited(error: AuthFailure): boolean {
  return error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit';
}

/**
 * The service never gave a considered answer: no response, a timeout, or a 5xx. auth-js reports a request that never got a
 * response as status 0, and a gateway failure with its 502/503/504, so the status alone says it.
 */
function isUnreachable(error: AuthFailure): boolean {
  return (
    error.code === 'request_timeout' ||
    error.status === 0 ||
    (typeof error.status === 'number' && error.status >= 500)
  );
}

/**
 * Supabase reports a wrong code and an expired one with the SAME answer
 * (`otp_expired`, "Token has expired or is invalid"), so that is all this can
 * say. An older auth service sends the same refusal as a bare 401/403.
 */
function isCodeRejection(error: AuthFailure): boolean {
  if (error.code === 'otp_expired') return true;
  return error.code === undefined && (error.status === 401 || error.status === 403);
}

/** Recovery token validation lives beside email OTP verification: this is the one
 * auth-token boundary. Password changes remain in the separate ephemeral recovery client. */
export async function verifyRecoveryOtp(client: SupabaseClient, email: string, code: string) {
  return client.auth.verifyOtp({ email, token: code, type: 'recovery' });
}
