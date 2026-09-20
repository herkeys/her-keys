import { z } from 'zod';
import { Id, InstantSchema, LocalDateSchema, NonBlank, OpenCode, SYSTEM_ROLES } from '../schemaPrimitives';
import { MoneySchema } from './money';
import { ProvenanceSchema } from './provenance';
import { ContentRefSchema } from './typedRef';

/**
 * STRUCTURED CANDIDATE (an INTERPRETATION of a source) — B4-FE01-003 (ADR-012).
 *
 * Named `Interpretation` in state because Daily Load already has DERIVED recommendation
 * "candidates" that must never be persisted, and a guard test forbids that word in stored state.
 *
 * The stage between "she said it" / "it arrived" and "it is in her household". A
 * candidate is Her Keys' TYPED reading of a source artifact: a proposed task, event
 * or Needs Me item, held OUTSIDE canonical state until she accepts it.
 *
 * That separation is the point. Canonical rows demand things capture cannot supply
 * — every task, event, system and meal needs a category — so a half-understood
 * sentence cannot be a task yet. But it must not vanish, and it must not be
 * silently promoted either. A candidate keeps it, with a confidence, a pending
 * question if one is needed, room for her correction, and a chain back to what
 * produced it, so one messy utterance or one school email can yield several
 * candidates that all name their source.
 *
 * A candidate is a draft, so its content is typed columns rather than a bag: it can
 * hold exactly the fields a capture can plausibly fill in, and nothing else.
 *
 * Accepting one creates the real row with the candidate's producer and
 * `confidence = established` — a person confirmed it — never `user-action`, because
 * she did not state it; she approved Her Keys' reading of it.
 */

export const INTERPRETATION_KINDS = ['task', 'event', 'needsMe'] as const;
export type InterpretationKind = (typeof INTERPRETATION_KINDS)[number];

export const INTERPRETATION_STATES = ['pending', 'clarifying', 'accepted', 'rejected', 'superseded'] as const;
export type InterpretationState = (typeof INTERPRETATION_STATES)[number];

export const InterpretationSchema = z
  .strictObject({
    id: Id,
    /** What this was read from. Every candidate has a source; that is what makes it a candidate. */
    artifactId: Id,
    proposedKind: z.enum(INTERPRETATION_KINDS),
    title: NonBlank(200),
    dueDate: LocalDateSchema.nullable(),
    startsAt: InstantSchema.nullable(),
    endsAt: InstantSchema.nullable(),
    durationMinutes: z.number().int().min(0).max(1440).nullable(),
    /** "$35 for the field trip" is a typed amount here, not a string inside the title. */
    value: MoneySchema.nullable(),
    /** A child it concerns, by member id. */
    subjectMemberId: Id.nullable(),
    /** Which system-role category it most likely belongs to. A hint only: she classifies at acceptance. */
    categoryHint: z.enum(SYSTEM_ROLES).nullable(),
    state: z.enum(INTERPRETATION_STATES),
    /** What Her Keys is waiting to be told, while `clarifying`. An open code (`which_child`, `which_day`). */
    clarification: OpenCode.nullable(),
    /** The row this became, once accepted. */
    acceptedRef: ContentRefSchema.nullable(),
    /** Reprocessing: the earlier candidate this replaces. */
    supersedesId: Id.nullable(),
    /** Which reading of the artifact this is, so a better interpreter can supersede an older one. */
    interpretationVersion: z.number().int().min(1).max(1000),
    createdAt: InstantSchema,
    decidedAt: InstantSchema.nullable(),
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((c, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    if ((c.state === 'clarifying') !== (c.clarification !== null)) issue('clarification', 'a clarification exists exactly while the candidate is clarifying');
    if ((c.state === 'accepted') !== (c.acceptedRef !== null)) issue('acceptedRef', 'an accepted candidate names the row it became, and only an accepted one does');
    if (c.acceptedRef !== null && c.acceptedRef.kind !== c.proposedKind) issue('acceptedRef', 'a candidate becomes the kind of row it proposed');
    const decided = c.state === 'accepted' || c.state === 'rejected' || c.state === 'superseded';
    if (decided !== (c.decidedAt !== null)) issue('decidedAt', 'decidedAt is set exactly when the candidate has been decided');

    if (c.proposedKind === 'event') {
      if (c.startsAt === null || c.endsAt === null) issue('startsAt', 'an event candidate needs a start and an end');
      else if (Date.parse(c.endsAt) <= Date.parse(c.startsAt)) issue('endsAt', 'an event must end after it starts');
    } else if (c.startsAt !== null || c.endsAt !== null) {
      issue('startsAt', 'only an event candidate has a start and an end');
    }

    // A candidate IS an interpretation: it is Her Keys' inference, or an external system's observation
    // that Her Keys read. It is never something she stated, and it always names its own source.
    if (c.provenance.producer !== 'ai-inference' && c.provenance.producer !== 'import-sync') {
      issue('provenance', 'a candidate is an inference or an external observation');
    }
    if (c.provenance.artifactId !== c.artifactId) issue('provenance', 'a candidate\'s provenance names the artifact it was read from');
  });

export type Interpretation = z.infer<typeof InterpretationSchema>;
