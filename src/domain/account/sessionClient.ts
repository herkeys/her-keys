import type { AccountSession } from './identity';

/**
 * In-memory authentication client capability.
 *
 * SecureSessionStore remains the ONLY durable credential home. The platform
 * implementation may install/refresh a session in memory, but every rotated
 * pair comes back through this boundary so AccountRuntime can persist it.
 */
export type SessionActivation =
  | { kind: 'active'; session: AccountSession }
  | { kind: 'invalid'; detail: string }
  | { kind: 'unreachable'; detail: string };

export type SessionClientEvent =
  | { type: 'refreshed'; session: AccountSession }
  | { type: 'signedOut' };

export interface AccountSessionClient {
  activate(session: AccountSession): Promise<SessionActivation>;
  signOut(): Promise<{ kind: 'ok' } | { kind: 'error'; detail: string }>;
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
  subscribe(listener: (event: SessionClientEvent) => void): () => void;
}

/** Domain-test fallback. Production supplies the real Supabase-backed client. */
export const NOOP_ACCOUNT_SESSION_CLIENT: AccountSessionClient = {
  async activate(session) {
    return { kind: 'active', session };
  },
  async signOut() {
    return { kind: 'ok' };
  },
  startAutoRefresh() {},
  stopAutoRefresh() {},
  subscribe() {
    return () => undefined;
  },
};
