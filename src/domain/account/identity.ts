/**
 * Account identity.
 *
 * The Supabase Auth user UUID is THE application account identity (B4-P0-012,
 * SD4-002). Nothing else is: not an email, not an Apple or Google subject, not
 * a local household id, not a device id. Provider identity is authentication
 * provenance — how she proved who she is — and is deliberately kept separate
 * from who the account IS.
 *
 * Everything account-bound in the app keys off `AccountId`.
 */

/** A Supabase Auth user UUID. */
export type AccountId = string & { readonly __brand: 'AccountId' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAccountId(value: unknown): value is AccountId {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * Narrow an untrusted value to an account id, or null. Used at every boundary
 * where a value arrives from storage, a provider or the network, so a
 * malformed identity can never become an account namespace.
 */
export function toAccountId(value: unknown): AccountId | null {
  return isAccountId(value) ? (value as AccountId) : null;
}

/**
 * The authentication providers the product offers. This is provenance, not
 * identity: two providers that authenticate the same person resolve to the
 * same `AccountId`, and household semantics never differ by provider
 * (B4-P0-012, B4-P0-016).
 */
export type AuthProvider = 'apple' | 'google';

export interface ProviderIdentity {
  provider: AuthProvider;
  /** The provider's own subject. Recorded for support and audit only. */
  subject: string | null;
  /**
   * A display name a provider may hand back exactly once (Apple returns the
   * full name only on first authorization, B4-P0-016). Saved best-effort; a
   * failure to save it never invalidates the login.
   */
  suggestedDisplayName: string | null;
}

/** A resolved session. The account id is the only field anything may key on. */
export interface AccountSession {
  accountId: AccountId;
  /** Opaque to the app. Never written into household state (see secureSession). */
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  provider: ProviderIdentity | null;
}

/**
 * Semantic provider results (B4-P0-016). A provider adapter returns one of
 * these rather than throwing, so the state machine can distinguish a person
 * changing her mind from a misconfigured build.
 */
export type ProviderResult =
  | { kind: 'success'; session: AccountSession }
  | { kind: 'cancelled' }
  | { kind: 'unavailable'; detail: string }
  | { kind: 'configurationError'; detail: string }
  | { kind: 'providerError'; detail: string };

export function isSessionExpired(session: AccountSession, nowMs: number): boolean {
  return session.expiresAt <= nowMs;
}

/**
 * Whether two sessions belong to the same account. The comparison is on the
 * account id alone — a second sign-in through a different provider for the
 * same person is the same account, and must not be treated as a switch.
 */
export function isSameAccount(a: AccountId | null, b: AccountId | null): boolean {
  return a !== null && b !== null && a === b;
}
