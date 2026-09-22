import { z } from 'zod';
import { Id, InstantSchema, LocalDateSchema, NonBlank } from '../schemaPrimitives';
import { ProvenanceSchema } from './provenance';

/**
 * CAREER OPPORTUNITY — F10 Work/Career OS.
 *
 * A professional possibility she is tracking, not a fact about the world. It never
 * means the organization is interested, has responded, or will make an offer — it
 * means she chose to keep an eye on this. The record holds only what she has
 * actually recorded: no score, no verified compensation, no employer database.
 *
 * The next action is a canonical Task, and an interview is a canonical Event,
 * both reached through the same `Dependency` primitive every other feature's
 * decomposition uses (`relation: 'part_of'`, `to: {kind:'opportunity', id}`) —
 * see `foundation/structure.ts`. This entity carries no `nextActionText` and no
 * interview sub-record: an Opportunity is never itself actionable truth.
 *
 * STAGE is user-controlled truth, changed only by explicit action — never by time
 * passing, an Event's time passing, or a linked Task's completion. `closed`
 * requires a reason, because "no response" is not "rejected" unless she says so.
 *
 * Owner-private by construction (`scope: 'personal'`, like every other foundation
 * kind): a spouse or co-parent does not see this merely by sharing a household.
 */

export const OPPORTUNITY_TYPES = ['job', 'freelance', 'contract', 'education_program', 'other'] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

/** The smallest truthful lifecycle. No state is skipped automatically, and none is skipped for her — but she may record any order. */
export const OPPORTUNITY_STAGES = ['exploring', 'interested', 'applied', 'interviewing', 'offer', 'accepted', 'closed'] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

/**
 * Why a closed opportunity closed. "No further response" is its own reason,
 * distinct from "declined" — silence is never upgraded to a rejection she never
 * received.
 */
export const OPPORTUNITY_CLOSED_REASONS = ['withdrawn', 'declined_by_organization', 'offer_rescinded', 'no_further_response', 'other'] as const;
export type OpportunityClosedReason = (typeof OPPORTUNITY_CLOSED_REASONS)[number];

const OrgLabel = z.string().max(120).nullable();
const FreeNote = z.string().max(300).nullable();

export const CareerOpportunitySchema = z
  .strictObject({
    id: Id,
    title: NonBlank(200),
    organizationName: OrgLabel,
    opportunityType: z.enum(OPPORTUNITY_TYPES),
    stage: z.enum(OPPORTUNITY_STAGES),
    /** Set exactly when `stage` is `closed`; cleared whenever it is corrected away from `closed`. */
    closedReason: z.enum(OPPORTUNITY_CLOSED_REASONS).nullable(),
    /** Unstructured: where this came from, in her words. Not a canonical external identity (PENDING — PEOPLE OS INTEGRATION territory). */
    sourceNote: FreeNote,
    /** A date she recorded as the application/opportunity deadline. Contributes no Capacity minutes on its own. */
    applicationDeadline: LocalDateSchema.nullable(),
    /** Only ever set explicitly by her. No arbitrary inactivity timer ever sets or implies this. */
    followUpDate: LocalDateSchema.nullable(),
    /** Free text. No identity, no dedup, no canonical Person — that is F13's. */
    contactName: OrgLabel,
    /** User-entered context, never verified compensation and never Money truth. No structured amount exists on this entity. */
    compensationNote: FreeNote,
    notes: z.string().max(1000).nullable(),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    /** When `stage` last changed — distinct from `updatedAt`, which also moves for a plain field edit. */
    stageChangedAt: InstantSchema,
    /** Visibility/retention, independent of `stage`: archiving never rewrites the recorded outcome. */
    archivedAt: InstantSchema.nullable(),
    provenance: ProvenanceSchema,
    /** Owner-private, like every foundation kind (ADR-005/-023) — never household-visible by default. */
    scope: z.literal('personal'),
  })
  .superRefine((o, ctx) => {
    if ((o.stage === 'closed') !== (o.closedReason !== null)) {
      ctx.addIssue({ code: 'custom', path: ['closedReason'], message: 'a reason is recorded exactly when the opportunity is closed' });
    }
  });
export type CareerOpportunity = z.infer<typeof CareerOpportunitySchema>;

export function isOpportunityOpen(o: Pick<CareerOpportunity, 'stage'>): boolean {
  return o.stage !== 'closed';
}
