import { z } from 'zod';
import { Id, InstantSchema, LocalDateSchema, OpenCode } from '../schemaPrimitives';
import { ProvenanceSchema } from './provenance';
import { CONTENT_REF_KINDS, ContentRefSchema, refOf } from './typedRef';

/**
 * PATTERNS AND EVIDENCE — B4-FE01-023 / -024 (ADR-022).
 *
 * A PATTERN is something Her Keys has noticed about how she lives — "laundry slips
 * on Tuesdays" — kept at a confidence and never mistaken for a fact. Its confidence
 * IS its provenance confidence: one field, written only by the promotion boundary,
 * so there is nowhere for a second, drifting copy to live. `established` is reachable
 * only when she confirms it, and a confirmed pattern says so.
 *
 * An EVIDENCE LINK ties a recommendation or a pattern to the real thing that
 * supports it: an observation, a task, a deadline. It is structured product
 * evidence — a code and a reference — never a chain of thought. The same shape
 * answers "why this pattern?", "why this One Move?" and "why did Her Keys propose
 * that?", so there is one explainability contract instead of one per module.
 *
 * Neither is an analytics warehouse. A pattern points at the specific observations
 * it stands on; it does not summarise a firehose.
 */

export const PATTERN_KINDS = ['routine', 'deferral', 'energy', 'preference', 'reliability', 'timing'] as const;
export const PATTERN_STATUSES = ['candidate', 'confirmed', 'rejected', 'retired'] as const;
export const TIME_BUCKETS = ['morning', 'afternoon', 'evening'] as const;

export const PatternSchema = z
  .strictObject({
    id: Id,
    kind: z.enum(PATTERN_KINDS),
    /** What it is about, when it is about one thing. */
    about: ContentRefSchema.nullable(),
    categoryId: Id.nullable(),
    /** 0 = Sunday … 6 = Saturday. */
    weekday: z.number().int().min(0).max(6).nullable(),
    timeBucket: z.enum(TIME_BUCKETS).nullable(),
    status: z.enum(PATTERN_STATUSES),
    firstObservedOn: LocalDateSchema,
    lastObservedOn: LocalDateSchema,
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    /** Always an inference, and so always carries the confidence. */
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (p.provenance.producer !== 'ai-inference') issue('provenance', 'a pattern is an inference');
    if (p.lastObservedOn < p.firstObservedOn) issue('lastObservedOn', 'a pattern is last seen after it is first seen');
    // Only she can make a pattern established, and doing so is what confirms it.
    if (p.status === 'confirmed' && p.provenance.confidence !== 'established') issue('status', 'a confirmed pattern is one she confirmed');
    if (p.provenance.confidence === 'established' && p.status !== 'confirmed' && p.status !== 'retired') {
      issue('provenance', 'an established pattern has been confirmed');
    }
  });
export type Pattern = z.infer<typeof PatternSchema>;

export const EVIDENCE_FOR_KINDS = ['pattern', 'oneMove', 'intent'] as const;
export const EVIDENCE_SUPPORT_KINDS = [...CONTENT_REF_KINDS, 'responsibility', 'observation'] as const;

export const EvidenceLinkSchema = z.strictObject({
  id: Id,
  /** What is being explained. */
  for: refOf(EVIDENCE_FOR_KINDS),
  /** What supports it. */
  support: refOf(EVIDENCE_SUPPORT_KINDS),
  /**
   * Why that supports it: `deadline`, `capacity_conflict`, `dependency`, `pattern`,
   * `preference`, `explicit_instruction`. An OPEN, format-checked vocabulary: a new
   * kind of reason is a new code, not a rewritten CHECK.
   */
  code: OpenCode,
  createdAt: InstantSchema,
  provenance: ProvenanceSchema,
  scope: z.literal('personal'),
});
export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;

/** The evidence codes this codebase understands. An unknown code is stored and read back intact, and not acted on. */
export const KNOWN_EVIDENCE_CODES = [
  'deadline',
  'capacity_conflict',
  'dependency',
  'pattern',
  'preference',
  'explicit_instruction',
  'repeated_deferral',
  'consequence',
  'todays_radar',
  'oldest_open',
] as const;
