import { z } from 'zod';
import { Id, InstantSchema, OpenCode, Sha256Hex } from '../schemaPrimitives';

/**
 * SOURCE ARTIFACT — B4-FE01-002 (ADR-011).
 *
 * Evidence that something ARRIVED: a spoken utterance, a forwarded email, a
 * calendar item, a receipt. One artifact can produce many structured facts, and
 * each of them names it through `provenance.artifactId`, so a single school email
 * can yield an event, a form task, a child obligation, a $35 fee and a deadline
 * while every one of them still points at the email.
 *
 * What it does NOT hold is the content. There is no `body`, no `transcript`, no
 * `text` — only enough to recognise the artifact again (a SHA-256 digest) and an
 * opaque `contentRef` for a future content store. Her words stay out of the
 * canonical household record, which is the rule the conversation boundary already
 * enforces, and a forwarded document does not become an enormous JSON blob inside
 * `AppState`.
 *
 * An artifact records arrival, not a claim, so it carries an `origin` of its own
 * rather than a provenance with a confidence. The claims made about it live on the
 * candidates and rows derived from it.
 */

export const SOURCE_ARTIFACT_KINDS = [
  'voice-utterance',
  'email',
  'calendar-item',
  'document',
  'screenshot',
  'school-notice',
  'receipt',
  'bill',
  'message',
  'connected-object',
] as const;
export type SourceArtifactKind = (typeof SOURCE_ARTIFACT_KINDS)[number];

/** Who delivered it: she did (typed or forwarded), she spoke it, or a connector observed it. */
export const SOURCE_ARTIFACT_ORIGINS = ['user-submitted', 'voice', 'connector'] as const;
export type SourceArtifactOrigin = (typeof SOURCE_ARTIFACT_ORIGINS)[number];

/** An opaque pointer into a content store that does not exist yet. A token, never content. */
const ContentRef = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/, { message: 'Expected an opaque content reference' });

export const SourceArtifactSchema = z
  .strictObject({
    id: Id,
    kind: z.enum(SOURCE_ARTIFACT_KINDS),
    origin: z.enum(SOURCE_ARTIFACT_ORIGINS),
    /** The connector or channel, when there is one. An open, format-checked token (`gmail`, `school-portal`). */
    provider: OpenCode.nullable(),
    receivedAt: InstantSchema,
    /** Duplicate detection: the same digest for the same account is the same artifact. */
    contentDigest: Sha256Hex.nullable(),
    contentRef: ContentRef.nullable(),
    /** The identity of the same object in an external system, once one is known. */
    externalReferenceId: Id.nullable(),
    /** Set once when the source is withdrawn. The artifact itself is never edited or deleted. */
    retractedAt: InstantSchema.nullable(),
    createdAt: InstantSchema,
    scope: z.literal('personal'),
  })
  .superRefine((artifact, ctx) => {
    if (artifact.origin === 'voice' && artifact.kind !== 'voice-utterance') {
      ctx.addIssue({ code: 'custom', path: ['kind'], message: 'a voice artifact is a voice utterance' });
    }
    if (artifact.kind === 'voice-utterance' && artifact.origin !== 'voice') {
      ctx.addIssue({ code: 'custom', path: ['origin'], message: 'a voice utterance was spoken' });
    }
    if (artifact.origin === 'connector' && artifact.provider === null) {
      ctx.addIssue({ code: 'custom', path: ['provider'], message: 'a connector-delivered artifact names its provider' });
    }
  });

export type SourceArtifact = z.infer<typeof SourceArtifactSchema>;

/** A retraction is the only edit an artifact ever takes, and it can be made once. */
export function retractArtifact(artifact: SourceArtifact, at: string): SourceArtifact {
  return artifact.retractedAt === null ? { ...artifact, retractedAt: at } : artifact;
}

/** The artifact this digest already names, so the same forwarded document is never stored twice. */
export function findDuplicateArtifact(artifacts: readonly SourceArtifact[], digest: string | null): SourceArtifact | null {
  if (digest === null) return null;
  return artifacts.find((artifact) => artifact.contentDigest === digest) ?? null;
}
