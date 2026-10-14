import type { EntitlementState, Projection } from './types.ts';

/**
 * The canonical state derivation. This is a LINE-FOR-LINE mirror of the SQL function `public.premium_derive_state`
 * (supabase/migrations/20261015120000_premium_entitlement_foundation.sql); `run-premium.mjs --parity` proves the two agree on
 * thousands of generated rows, so the server's decision and the client-facing description can never drift apart.
 *
 * States are derived at READ time from stored facts and `now`: expiry needs no cron and cannot be missed.
 */
export function deriveEntitlementState(row: Projection | null, nowMs: number, fixturesAllowed: boolean): EntitlementState {
  if (row === null) return 'unknown';
  if (row.source === 'test_fixture' && !fixturesAllowed) return 'unknown';
  if (row.revoked_at !== null) return 'premium_revoked';
  if (!row.has_entitlement) return 'free';

  const expires = row.expires_at === null ? null : Date.parse(row.expires_at);
  if (expires === null || nowMs <= expires) {
    return row.canceled_at !== null ? 'premium_canceled_active' : 'premium_active';
  }
  const grace = row.grace_expires_at === null ? null : Date.parse(row.grace_expires_at);
  if (grace !== null && nowMs <= grace) return 'premium_billing_grace';
  if (row.expiration_confirmed_at !== null) return 'premium_expired';
  // Past its term but nothing has confirmed the lapse yet: a renewal webhook may simply be late. Never assert "expired" on a guess.
  return 'unknown';
}

/** States that authorize NEW Premium computation. */
export function isEntitled(state: EntitlementState): boolean {
  return state === 'premium_active' || state === 'premium_canceled_active' || state === 'premium_billing_grace';
}
