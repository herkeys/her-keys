import { z } from 'zod';
import { SyncNamespaceSchema } from '../sync/syncTypes';
import type { AccountId } from './identity';

/**
 * What this device durably remembers about WHO its household belongs to.
 *
 * This is identity bookkeeping, not a credential. Access and refresh tokens
 * never appear here and never reach ordinary household storage — they live
 * behind the secure-session boundary (B4-P0-013). Everything in this file is
 * safe to sit in the same file as the household, which is what lets a single
 * atomic write keep binding and content consistent with each other.
 */

const Uuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  { message: 'Expected a UUID' }
);

const Instant = z.iso.datetime();

/** How a household came to belong to an account. */
export const CLAIM_KINDS = ['bootstrap', 'claim'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/**
 * Why the server refused. These are the server's own words, from
 * `private.claim_result(...).rejected_reason` — not re-coined here, so a
 * refusal cannot quietly change meaning between the two sides.
 */
export const REJECTED_REASONS = ['superseded_by_cloud', 'refused_demo'] as const;
export type RejectedReason = (typeof REJECTED_REASONS)[number];

export const AccountBindingSchema = z.strictObject({
  accountId: Uuid,
  /** The cloud household uuid. */
  householdId: Uuid,
  boundAt: Instant,
  kind: z.enum(CLAIM_KINDS),
  /**
   * `local_id` -> cloud uuid, as returned by the claim. The device needs it to
   * rebuild its mapping after a crash (SD4-022); the sync engine will consume
   * it, and this wave only records it faithfully.
   */
  idMap: z.record(z.string().max(128), Uuid),
});

/**
 * A claim in flight.
 *
 * The receipt is written BEFORE the first network attempt and keeps the same
 * `claimKey` for every retry. That is the whole point: if the server succeeds
 * and the device dies before hearing so, the retry carries the same key, the
 * server recognizes the replay and resumes instead of creating a second
 * household (B4-P0-032).
 */
export const ClaimReceiptSchema = z.strictObject({
  claimKey: Uuid,
  accountId: Uuid,
  kind: z.enum(CLAIM_KINDS),
  startedAt: Instant,
  attempts: z.number().int().min(0).max(1000),
  lastAttemptAt: Instant.nullable(),
  /** Set only when the server refused; never invented locally. */
  rejectedReason: z.enum(REJECTED_REASONS).nullable(),
});

/**
 * A household on this device that belongs to a DIFFERENT account than the one
 * signed in. It is recorded, preserved and never rendered, uploaded or merged
 * (B4-P0-035). Recording it is what turns "unexplained foreign data" into a
 * state the app can reason about instead of a hazard.
 */
export const QuarantineSchema = z.strictObject({
  accountId: Uuid,
  detectedAt: Instant,
});

export const IdentityRecordSchema = z.strictObject({
  binding: AccountBindingSchema.nullable(),
  receipt: ClaimReceiptSchema.nullable(),
  quarantine: QuarantineSchema.nullable(),
  /**
   * The sync namespace for the bound account. It lives beside the binding
   * because both describe the same relationship: who this household belongs to,
   * and how far that relationship has got. It holds no credential.
   *
   * Null on an unbound device, and null for the OTHER account when one is
   * quarantined -- a namespace is never shared, so there is nothing for a second
   * account to inherit.
   */
  sync: SyncNamespaceSchema.nullable().default(null),
});

export type AccountBinding = z.infer<typeof AccountBindingSchema>;
export type ClaimReceipt = z.infer<typeof ClaimReceiptSchema>;
export type Quarantine = z.infer<typeof QuarantineSchema>;
export type IdentityRecord = z.infer<typeof IdentityRecordSchema>;

/** What a never-bound device carries. Also what a v2 household becomes on upgrade. */
export const UNBOUND_IDENTITY: IdentityRecord = { binding: null, receipt: null, quarantine: null, sync: null };

export function isUnbound(identity: IdentityRecord): boolean {
  return identity.binding === null;
}

export function boundAccountId(identity: IdentityRecord): AccountId | null {
  return (identity.binding?.accountId ?? null) as AccountId | null;
}

/** Open a claim. Pure: the caller supplies the key and the clock. */
export function startReceipt(input: {
  claimKey: string;
  accountId: AccountId;
  kind: ClaimKind;
  startedAt: string;
}): ClaimReceipt {
  return {
    claimKey: input.claimKey,
    accountId: input.accountId,
    kind: input.kind,
    startedAt: input.startedAt,
    attempts: 0,
    lastAttemptAt: null,
    rejectedReason: null,
  };
}

/**
 * Count an attempt. Called before the request leaves, not after it returns —
 * an attempt whose answer never arrives is exactly the case the count exists
 * to survive.
 */
export function recordAttempt(receipt: ClaimReceipt, atInstant: string): ClaimReceipt {
  return { ...receipt, attempts: Math.min(receipt.attempts + 1, 1000), lastAttemptAt: atInstant };
}

/**
 * Whether a receipt may be retried with the same key.
 *
 * A refusal is not retried: the server already gave its answer, and repeating
 * the same request would only get it again. A refusal is a product situation
 * to show her, not a transport failure to paper over.
 */
export function isRetryable(receipt: ClaimReceipt): boolean {
  return receipt.rejectedReason === null;
}
