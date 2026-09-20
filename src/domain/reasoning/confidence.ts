import type { ConfidenceLevel } from '../../types/onboarding';
import type { Provenance } from '../foundation/provenance';
import { isUserStated, type ProvenanceSource } from './provenance';

export type { ConfidenceLevel };

/**
 * The three levels are the product's vocabulary (HER_KEYS_PRODUCT.md section
 * 15) and are not re-invented here. This module exists to answer one question
 * the codebase previously left implicit: *what is allowed to raise one?*
 */
export const CONFIDENCE_ORDER: readonly ConfidenceLevel[] = ['possible', 'likely', 'established'] as const;

export function confidenceRank(level: ConfidenceLevel): number {
  return CONFIDENCE_ORDER.indexOf(level);
}

export function isAtLeast(level: ConfidenceLevel, floor: ConfidenceLevel): boolean {
  return confidenceRank(level) >= confidenceRank(floor);
}

/**
 * What a promotion is allowed to be based on. Corroboration counts only when
 * it is independent of the claim: a thing does not become more true because it
 * was saved, re-read, or re-rendered.
 */
export interface ConfidenceEvidence {
  /** Where the underlying claim came from. */
  source: ProvenanceSource;
  /** Independent observations that agree with the claim. */
  corroborations: number;
  /** She was asked and said yes. The only route to 'established'. */
  userConfirmed: boolean;
}

/**
 * THE CONFIDENCE PROMOTION BOUNDARY.
 *
 * This is the only function in Her Keys permitted to return a level higher
 * than the one it was given. Everything else — persistence, hydration, sync,
 * rendering, recomputation — must pass confidence through unchanged.
 *
 * The rules:
 *
 *   - Persistence never promotes. There is deliberately no storage parameter
 *     here, so a round trip has nothing to promote with.
 *   - Only an explicit user confirmation reaches 'established'. A model, however
 *     corroborated, cannot promote its own inference into a stated fact.
 *   - A user-stated claim may reach 'likely' on corroboration; an inference
 *     needs more of it, and still stops short of 'established'.
 *   - Confidence never falls here. Retraction is a separate act, not a
 *     side effect of weak evidence.
 */
export function promoteConfidence(current: ConfidenceLevel, evidence: ConfidenceEvidence): ConfidenceLevel {
  if (evidence.userConfirmed) return 'established';

  const threshold = isUserStated(evidence.source) ? 1 : 3;
  const earned: ConfidenceLevel = evidence.corroborations >= threshold ? 'likely' : 'possible';

  return confidenceRank(earned) > confidenceRank(current) ? earned : current;
}

/**
 * THE ROW-LEVEL WRITER (B4-FE01-005).
 *
 * Since v4 a confidence can be stored on a row (`provenance.confidence`), so the
 * promotion boundary needs a form that takes a row's provenance. It is a thin
 * wrapper: the rules live in `promoteConfidence` and are not restated. A row whose
 * provenance carries no confidence — a user-stated fact, a starter category, an
 * unknown legacy row — has nothing to promote and comes back unchanged. That is what
 * stops `legacy-unknown` (or anything else) from acquiring a level it never earned.
 *
 * This and `promoteConfidence` are the ONLY places a stored level may rise.
 */
export function promoteProvenance(
  provenance: Provenance,
  evidence: { corroborations: number; userConfirmed: boolean }
): Provenance {
  if (provenance.confidence === null) return provenance;
  const confidence = promoteConfidence(provenance.confidence, { source: provenance.producer, ...evidence });
  return confidence === provenance.confidence ? provenance : { ...provenance, confidence };
}

/** One piece of evidence for a claim, reduced to what independence depends on. */
export interface EvidenceSighting {
  producer: ProvenanceSource;
  /** The source artifact it came from, when it came from one. */
  artifactId: string | null;
  /** The logical day it was observed on. */
  logicalDate: string;
}

/**
 * How many INDEPENDENT observations agree. Corroboration counts only when it is
 * independent of the claim: three rows produced from one email are one sighting, not
 * three, and a producer repeating itself on the same day is one sighting too. Two
 * different days from the same producer are two.
 */
export function independentCorroborations(sightings: readonly EvidenceSighting[]): number {
  const groups = new Set(
    sightings.map((s) => (s.artifactId !== null ? `artifact:${s.artifactId}` : `${s.producer}:${s.logicalDate}`))
  );
  return groups.size;
}

/**
 * The explicit statement of the rule a persistence layer must obey. Kept as a
 * function so a test can assert it rather than trusting a comment.
 */
export function confidenceAfterPersistence(stored: ConfidenceLevel): ConfidenceLevel {
  return stored;
}
