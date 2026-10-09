import type { AccountSession } from './identity';

/**
 * Email/password is an additional auth method. The runtime owns every session,
 * binding and quarantine decision; this port never stores or logs passwords.
 * Signup can finish without an authenticated session while Confirm Email is on.
 */
export type EmailPasswordMode = 'signIn' | 'signUp';
export type EmailPasswordResult =
  | { kind: 'success'; session: AccountSession }
  | { kind: 'confirmationRequired' }
  | { kind: 'rejected'; detail: string }
  | { kind: 'unreachable'; detail: string }
  | { kind: 'unavailable'; detail: string };

export interface EmailPasswordPort {
  isAvailable(): boolean;
  authenticate(mode: EmailPasswordMode, email: string, password: string): Promise<EmailPasswordResult>;
}

export const UNAVAILABLE_EMAIL_PASSWORD: EmailPasswordPort = {
  isAvailable: () => false,
  authenticate: async () => ({ kind: 'unavailable', detail: 'email_password_not_configured' }),
};

/** Test-only scripted port. Does not retain submitted email/password strings. */
export function createScriptedEmailPassword(results: readonly EmailPasswordResult[]): EmailPasswordPort & { calls(): number } {
  let count = 0;
  return {
    isAvailable: () => true,
    authenticate: async () => {
      const result = results[Math.min(count, results.length - 1)];
      count += 1;
      return result ?? { kind: 'rejected', detail: 'scripted_no_result' };
    },
    calls: () => count,
  };
}
