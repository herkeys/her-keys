import { z } from 'zod';
import { ConfidenceLevelSchema, Id, type CONFIDENCE_LEVELS } from '../schemaPrimitives';

/**
 * STORED PROVENANCE — B4-FE01-001 / -005.
 *
 * Where a durable fact came from is a fact about the ROW, and it is stored on the
 * row. Until v4 it was worked out from the kind of entity, which is only true
 * while every entity has exactly one producer — and `isUserStated()` reads it and
 * feeds `promoteConfidence()`, so a wrong answer silently lowered the
 * corroboration threshold from 3 to 1.
 *
 * Vocabulary (ADR-001). The literals are the ones the reasoning layer already
 * used, plus `automation` and `legacy-unknown`:
 *
 *   USER DIRECT ACTION   user-action        TALK IT OUT       talk-it-out
 *   EXTERNAL OBSERVATION import-sync        HER KEYS INFERENCE ai-inference
 *   HER KEYS AUTOMATION  automation         SYSTEM / BOOTSTRAP system-derived
 *   DEMO SEED            demo-seed          LEGACY / UNKNOWN   legacy-unknown
 *   (onboarding: the intake flow — user-stated)
 *
 * Semantic source and MIGRATION LINEAGE are different facts (ADR-004). A Build 3
 * task proven to have been created by the user stays `user-action` even though it
 * was migrated v3 -> v4; the migration is recorded elsewhere and never becomes
 * the producer.
 */
export const PROVENANCE_SOURCES = [
  'onboarding',
  'user-action',
  'talk-it-out',
  'system-derived',
  'import-sync',
  'ai-inference',
  'demo-seed',
  'automation',
  'legacy-unknown',
] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** Things she actually told us. Everything else — including `legacy-unknown` — is not user-stated. */
const USER_STATED: ReadonlySet<ProvenanceSource> = new Set(['onboarding', 'user-action', 'talk-it-out']);

/**
 * Producers whose output is a CLAIM that may be wrong, and so carries a
 * confidence. A user-stated fact has no confidence by definition; a starter
 * category is structure, not a claim; `legacy-unknown` is refused a level rather
 * than handed a made-up one.
 */
const CONFIDENCE_BEARING: ReadonlySet<ProvenanceSource> = new Set(['ai-inference', 'import-sync']);

/** Producers that can never name a source artifact: there is nothing they were derived from. */
const NEVER_HAS_ARTIFACT: ReadonlySet<ProvenanceSource> = new Set(['demo-seed', 'legacy-unknown', 'onboarding']);

/**
 * Whether a provenance may be treated as something she actually told us.
 * Anything worked out on her behalf is excluded, which is the rule that stops
 * an inference being read back later as a stated fact.
 */
export function isUserStated(source: ProvenanceSource): boolean {
  return USER_STATED.has(source);
}

/** Demo fixtures must never reach an account-bound path (B4-P0-010). */
export function isSyncable(source: ProvenanceSource): boolean {
  return source !== 'demo-seed';
}

export function carriesConfidence(source: ProvenanceSource): boolean {
  return CONFIDENCE_BEARING.has(source);
}

export const ProvenanceSchema = z
  .strictObject({
    producer: z.enum(PROVENANCE_SOURCES),
    /** The source artifact this row was produced from. Immutable lineage anchor; null when there is none. */
    artifactId: Id.nullable(),
    /** Non-null exactly for producers whose output is a claim. Raised only by `promoteProvenance`. */
    confidence: ConfidenceLevelSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (carriesConfidence(value.producer) !== (value.confidence !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['confidence'],
        message: 'confidence is set exactly for inference-bearing producers',
      });
    }
    if (value.artifactId !== null && NEVER_HAS_ARTIFACT.has(value.producer)) {
      ctx.addIssue({ code: 'custom', path: ['artifactId'], message: `${value.producer} rows have no source artifact` });
    }
  });

export type Provenance = z.infer<typeof ProvenanceSchema>;

// ------------------------------------------------------------- constructors --
// One per producer, so a call site names the truth it is asserting rather than
// building an object literal that could quietly be the wrong one.

export const userProvenance = (artifactId: string | null = null): Provenance => ({ producer: 'user-action', artifactId, confidence: null });
export const onboardingProvenance = (): Provenance => ({ producer: 'onboarding', artifactId: null, confidence: null });
export const talkItOutProvenance = (artifactId: string | null = null): Provenance => ({ producer: 'talk-it-out', artifactId, confidence: null });
export const systemProvenance = (artifactId: string | null = null): Provenance => ({ producer: 'system-derived', artifactId, confidence: null });
export const demoProvenance = (): Provenance => ({ producer: 'demo-seed', artifactId: null, confidence: null });
export const legacyProvenance = (): Provenance => ({ producer: 'legacy-unknown', artifactId: null, confidence: null });
export const automationProvenance = (artifactId: string | null = null): Provenance => ({ producer: 'automation', artifactId, confidence: null });
export const inferenceProvenance = (confidence: ConfidenceLevel = 'possible', artifactId: string | null = null): Provenance => ({
  producer: 'ai-inference',
  artifactId,
  confidence,
});
export const externalProvenance = (confidence: ConfidenceLevel = 'possible', artifactId: string | null = null): Provenance => ({
  producer: 'import-sync',
  artifactId,
  confidence,
});

/**
 * In a demo household everything is part of the rehearsal, whoever typed it, and
 * nothing in it may be mistaken for a real household's data (B4-P0-010). A creator
 * states the truth it would assert for a real household and this decides whether
 * the household lets it stand.
 */
export function provenanceFor(origin: 'demo' | 'empty', truth: Provenance): Provenance {
  return origin === 'demo' ? demoProvenance() : truth;
}

/** The producer only — what most callers want. */
export function producerOf(row: { provenance: Provenance }): ProvenanceSource {
  return row.provenance.producer;
}
