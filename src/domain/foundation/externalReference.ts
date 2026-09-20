import { z } from 'zod';
import { Id, InstantSchema, OpenCode, Sha256Hex } from '../schemaPrimitives';
import { ProvenanceSchema } from './provenance';
import { ContentRefSchema } from './typedRef';

/**
 * EXTERNAL REFERENCE IDENTITY — B4-FE01-004 (ADR-013).
 *
 * The one tuple every integration needs, whatever the provider: which system,
 * which account within it, which object, at which version, seen when, who made it,
 * and which Her Keys object it is. Seven future consumers (calendar, email,
 * school feed, payments, delegation delivery, grocery, external tasks) would
 * otherwise each invent it.
 *
 * FEEDBACK-LOOP PREVENTION. Her Keys writes an external object, and later the
 * provider hands the same object back. Because identity is
 * (provider, external account, external object id) and is UNIQUE, the second sighting
 * resolves to the reference that already exists — recognised as ours, with `origin
 * = 'her-keys'`, linked to the domain object it already is — and no duplicate
 * domain object is required.
 *
 * WHAT THIS MUST NEVER HOLD: a credential. No access token, no refresh token, no
 * secret, in this shape or any other. `externalAccount` is an opaque label for
 * WHICH account (a provider-side id or hash), not a way into it. A source scan in
 * the test suite fails if a token-shaped field appears anywhere in stored state or
 * in the cloud schema. A server-side connector that needs credentials needs its own
 * encrypted server-side store, which is a separate boundary and not built here.
 *
 * Rows a server-side connector originates have no device to have minted a
 * `local_id`, so they use `ext:<provider>:<hash>` — which fits the id pattern and
 * is decided now, before any row carries one.
 */

export const EXTERNAL_ORIGINS = ['external', 'her-keys'] as const;
export const EXTERNAL_DIRECTIONS = ['inbound', 'outbound', 'bidirectional'] as const;
export const EXTERNAL_AUTHORITIES = ['external', 'her-keys'] as const;
export const EXTERNAL_STATUSES = ['active', 'unlinked', 'gone'] as const;

export const ExternalReferenceSchema = z
  .strictObject({
    id: Id,
    provider: OpenCode,
    /** Which account in the provider. Opaque: never a credential. */
    externalAccount: z.string().min(1).max(128),
    externalObjectId: z.string().min(1).max(256),
    /** The etag or version last seen, where the provider has one. */
    externalVersion: z.string().max(128).nullable(),
    /** Who created the external object. */
    origin: z.enum(EXTERNAL_ORIGINS),
    direction: z.enum(EXTERNAL_DIRECTIONS),
    /** Which side wins when they disagree. */
    authority: z.enum(EXTERNAL_AUTHORITIES),
    lastObservedAt: InstantSchema.nullable(),
    /** A digest of the identity metadata last observed — never the content. */
    lastObservedDigest: Sha256Hex.nullable(),
    /** The Her Keys object this is. Null until it is linked. */
    linked: ContentRefSchema.nullable(),
    /** For a Her Keys-originated write: the execution that made the external object. */
    writeExecutionId: Id.nullable(),
    writtenAt: InstantSchema.nullable(),
    status: z.enum(EXTERNAL_STATUSES),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((ref, ctx) => {
    if (ref.origin === 'her-keys' && ref.writtenAt === null) {
      ctx.addIssue({ code: 'custom', path: ['writtenAt'], message: 'a Her Keys-originated external object records when it was written' });
    }
    if (ref.origin === 'external' && (ref.writeExecutionId !== null || ref.writtenAt !== null)) {
      ctx.addIssue({ code: 'custom', path: ['origin'], message: 'an externally created object was not written by Her Keys' });
    }
    if (ref.status === 'active' && ref.linked === null && ref.origin === 'her-keys') {
      ctx.addIssue({ code: 'custom', path: ['linked'], message: 'a Her Keys-originated reference is linked to the object that produced it' });
    }
  });

export type ExternalReference = z.infer<typeof ExternalReferenceSchema>;

/** The identity two references must not share: this is what makes a returning object recognisable. */
export function externalIdentityKey(ref: Pick<ExternalReference, 'provider' | 'externalAccount' | 'externalObjectId'>): string {
  return `${ref.provider}|${ref.externalAccount}|${ref.externalObjectId}`;
}

export type ObservedExternalObject = Pick<ExternalReference, 'provider' | 'externalAccount' | 'externalObjectId'> & {
  externalVersion: string | null;
  observedAt: string;
  observedDigest: string | null;
};

export type ObservationResolution =
  /** Already known. The reference is updated; no new domain object is needed. */
  | { kind: 'known'; reference: ExternalReference; selfWritten: boolean }
  /** Never seen: a new external object that does need a domain object. */
  | { kind: 'new' };

/**
 * A provider hands an object back. Is it one we already know — including one Her
 * Keys wrote itself? Recognition is by identity, never by title or time, so a
 * renamed event is still the same event and an identical-looking one is not.
 */
export function resolveObservation(
  references: readonly ExternalReference[],
  observed: ObservedExternalObject
): ObservationResolution {
  const key = externalIdentityKey(observed);
  const match = references.find((ref) => externalIdentityKey(ref) === key);
  if (!match) return { kind: 'new' };
  return {
    kind: 'known',
    selfWritten: match.origin === 'her-keys',
    reference: {
      ...match,
      externalVersion: observed.externalVersion ?? match.externalVersion,
      lastObservedAt: observed.observedAt,
      lastObservedDigest: observed.observedDigest ?? match.lastObservedDigest,
      updatedAt: observed.observedAt,
    },
  };
}

/** The `local_id` a server-side connector gives a row it originates (no device minted it). */
export function serverOriginLocalId(provider: string, externalObjectId: string, hash: string): string {
  const id = `ext:${provider}:${hash.slice(0, 32)}`;
  return id.length <= 128 ? id : id.slice(0, 128);
}
