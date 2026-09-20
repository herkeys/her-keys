import { toAccountId, type AccountSession, type AuthProvider } from './identity';

/**
 * THE SESSION CREDENTIAL BOUNDARY.
 *
 * Access and refresh tokens live here and nowhere else. They are never written
 * into `herkeys.appState`, never into any household record, and never into a
 * diagnostic (B4-P0-013). Only this module reads or writes them, so "where do
 * the tokens live?" has exactly one answer.
 *
 * The device implementation is injected, the way the rest of persistence works,
 * so the rules below are testable without a keychain.
 */

/** The narrow capability a session store needs from a device's secure storage. */
export interface SecureStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

/**
 * Deliberately NOT under the `herkeys.appState` prefix. A key that looks like
 * household state invites someone to reach for it with the household
 * repository, and the whole point is that nothing else can.
 */
export const SECURE_SESSION_KEY = 'herkeys.secure.session';

export type SessionLoad =
  | { kind: 'none' }
  /** A usable session. Expiry is the caller's business; this only reports it. */
  | { kind: 'session'; session: AccountSession; expired: boolean }
  /**
   * Something was stored but cannot be read as a session. The credential is
   * discarded — a token we cannot parse is a token we cannot use — but nothing
   * outside this boundary is touched, so her household is unaffected.
   */
  | { kind: 'unreadable'; detail: string }
  /** The secure store itself failed. Nothing is discarded on a read failure. */
  | { kind: 'unavailable'; detail: string };

export interface SecureSessionStore {
  read(nowMs: number): Promise<SessionLoad>;
  write(session: AccountSession): Promise<void>;
  clear(): Promise<void>;
}

const PROVIDERS: ReadonlySet<string> = new Set<AuthProvider>(['apple', 'google']);

/**
 * Narrow untrusted stored text into a session.
 *
 * Everything is checked, including the account id shape: a malformed identity
 * must never become an account namespace, and a keychain entry is as untrusted
 * as any other input once it has been on disk.
 */
export function parseStoredSession(raw: string): AccountSession | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const row = parsed as Record<string, unknown>;
  const accountId = toAccountId(row.accountId);
  if (accountId === null) return null;
  if (typeof row.accessToken !== 'string' || row.accessToken.length === 0) return null;
  if (typeof row.refreshToken !== 'string' || row.refreshToken.length === 0) return null;
  if (typeof row.expiresAt !== 'number' || !Number.isFinite(row.expiresAt)) return null;

  let provider: AccountSession['provider'] = null;
  const rawProvider = row.provider;
  if (rawProvider !== null && rawProvider !== undefined) {
    if (typeof rawProvider !== 'object' || Array.isArray(rawProvider)) return null;
    const p = rawProvider as Record<string, unknown>;
    if (typeof p.provider !== 'string' || !PROVIDERS.has(p.provider)) return null;
    provider = {
      provider: p.provider as AuthProvider,
      subject: typeof p.subject === 'string' ? p.subject : null,
      suggestedDisplayName: typeof p.suggestedDisplayName === 'string' ? p.suggestedDisplayName : null,
    };
  }

  return { accountId, accessToken: row.accessToken, refreshToken: row.refreshToken, expiresAt: row.expiresAt, provider };
}

export function createSecureSessionStore(storage: SecureStorageAdapter): SecureSessionStore {
  return {
    async read(nowMs) {
      let raw: string | null;
      try {
        raw = await storage.getItem(SECURE_SESSION_KEY);
      } catch (error) {
        // A read failure is not evidence that the credential is bad, so nothing
        // is deleted. She lands in a degraded session, not a signed-out one.
        return { kind: 'unavailable', detail: describe(error) };
      }
      if (raw === null) return { kind: 'none' };

      const session = parseStoredSession(raw);
      if (session === null) {
        try {
          await storage.deleteItem(SECURE_SESSION_KEY);
        } catch {
          // Best effort. An unreadable credential we also cannot delete is
          // still unreadable, and reporting that is what matters.
        }
        return { kind: 'unreadable', detail: 'stored session did not parse as a session' };
      }
      return { kind: 'session', session, expired: session.expiresAt <= nowMs };
    },

    async write(session) {
      await storage.setItem(SECURE_SESSION_KEY, JSON.stringify(session));
    },

    async clear() {
      await storage.deleteItem(SECURE_SESSION_KEY);
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** In-memory secure storage for tests. Never used in a build. */
export function createMemorySecureStorage(
  initial: Record<string, string> = {},
  options: { failReads?: boolean; failWrites?: boolean } = {}
): SecureStorageAdapter & { contents(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    async getItem(key) {
      if (options.failReads) throw new Error('Simulated secure-store read failure');
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      if (options.failWrites) throw new Error('Simulated secure-store write failure');
      data.set(key, value);
    },
    async deleteItem(key) {
      data.delete(key);
    },
    contents: () => Object.fromEntries(data),
  };
}
