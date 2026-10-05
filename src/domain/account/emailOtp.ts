import type { AccountSession } from './identity';

/**
 * THE PASSWORDLESS EMAIL BOUNDARY.
 *
 * Email sign-in is two phases — ask for a code, then prove you hold it — so it
 * does not fit `AuthProviderAdapter`'s one-step `signIn()`, and it is not made
 * to. This port is the whole capability; the account runtime owns it, and what
 * a verified code produces is an ordinary `AccountSession` keyed on the
 * Supabase user id, which then takes exactly the path an Apple or Google
 * session takes (wrong-actor check, quarantine, activation, binding).
 *
 * Like a provider adapter, the port RETURNS its outcome instead of throwing.
 *
 * Two things never cross this boundary in a result: the address she typed and
 * the code she entered. `detail` is a stable machine code (the auth service's
 * own error code, or a status), never the service's message — which can quote
 * the address back — so a diagnostic built from a result cannot carry either.
 */

export type EmailOtpRequestResult =
  /** The auth service accepted the request. Whether mail arrives is the mail system's business. */
  | { kind: 'sent' }
  /** The auth service refused because of ITS rate limit. Authoritative; never retried automatically. */
  | { kind: 'rateLimited'; detail: string }
  /** The auth service considered the request and said no (address refused, sign-ups closed, email sign-in off). */
  | { kind: 'rejected'; detail: string }
  /** The auth service never answered. */
  | { kind: 'unreachable'; detail: string }
  /** This build, or this account state, cannot ask for a code at all. */
  | { kind: 'unavailable'; detail: string };

export type EmailOtpVerifyResult =
  | { kind: 'success'; session: AccountSession }
  /**
   * The code was not accepted. The auth service answers a mistyped code and an
   * expired one identically, so this boundary does not pretend to know which.
   */
  | { kind: 'codeRejected'; detail: string }
  | { kind: 'rateLimited'; detail: string }
  | { kind: 'unreachable'; detail: string }
  /** The code may have been right, but no usable session came back. */
  | { kind: 'failed'; detail: string }
  | { kind: 'unavailable'; detail: string };

export interface EmailOtpPort {
  /** Whether this device can offer email sign-in at all. */
  isAvailable(): boolean;
  /** Phase one. Calling it again IS a resend; there is no separate operation. */
  request(email: string): Promise<EmailOtpRequestResult>;
  /** Phase two. The code is used once, here, and is not kept. */
  verify(email: string, code: string): Promise<EmailOtpVerifyResult>;
}

/** A build with no account backend: every call is an honest refusal. */
export const UNAVAILABLE_EMAIL_OTP: EmailOtpPort = {
  isAvailable: () => false,
  async request() {
    return { kind: 'unavailable', detail: 'email_otp_not_configured' };
  },
  async verify() {
    return { kind: 'unavailable', detail: 'email_otp_not_configured' };
  },
};

/**
 * A scripted port for tests, mirroring `createScriptedProvider`. It records how
 * often each phase ran — and nothing about what was passed — so a test can
 * prove a resend really asked again without the port becoming a place a code
 * could be read back from.
 */
export function createScriptedEmailOtp(script: {
  available?: boolean;
  requests?: readonly EmailOtpRequestResult[];
  verifications?: readonly EmailOtpVerifyResult[];
}): EmailOtpPort & { calls(): { request: number; verify: number } } {
  let requested = 0;
  let verified = 0;
  const at = <T,>(list: readonly T[] | undefined, index: number): T | undefined =>
    list === undefined || list.length === 0 ? undefined : list[Math.min(index, list.length - 1)];

  return {
    isAvailable: () => script.available ?? true,
    async request() {
      const result = at(script.requests, requested);
      requested += 1;
      return result ?? { kind: 'sent' };
    },
    async verify() {
      const result = at(script.verifications, verified);
      verified += 1;
      return result ?? { kind: 'failed', detail: 'scripted email port ran out of verifications' };
    },
    calls: () => ({ request: requested, verify: verified }),
  };
}
