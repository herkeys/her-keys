import { z } from 'zod';
import { Id, InstantSchema, LocalDateSchema } from '../schemaPrimitives';
import { ProvenanceSchema } from './provenance';
import { refOf } from './typedRef';

/**
 * BEHAVIOR OBSERVATION — B4-FE01-006 (ADR-026).
 *
 * What she actually does, recorded as it happens, because behavior that was never
 * recorded cannot be reconstructed. Pattern Intelligence, capacity learning,
 * confidence promotion, One Move effectiveness and delegation reliability all need
 * this and have no other source: `task.completedAt` is a mutable field, so
 * completing, reopening and re-completing a task used to leave one timestamp.
 *
 * It is NOT a clickstream. Each row is one meaningful typed outcome of one domain
 * row — completed, deferred, skipped, missed, cancelled, delegated, withheld — and the
 * vocabulary is closed and checked against what is legal for the kind of thing it
 * is about. Append-only: a correction is a new observation, never an edit.
 *
 * It references domain rows by typed reference and holds none of their content.
 */

export const OBSERVATION_OUTCOMES = [
  'completed',
  'reopened',
  'deferred',
  'skipped',
  'missed',
  'cancelled',
  'rescheduled',
  'selected',
  'withheld',
  'cleared',
  'delegated',
  'acknowledged',
  'accepted',
  'declined',
  'returned',
  'reassigned',
  'unacknowledged',
] as const;
export type ObservationOutcome = (typeof OBSERVATION_OUTCOMES)[number];

export const OBSERVATION_SUBJECT_KINDS = ['task', 'event', 'needsMe', 'system', 'meal', 'goal', 'responsibility', 'oneMove', 'interpretation'] as const;
export type ObservationSubjectKind = (typeof OBSERVATION_SUBJECT_KINDS)[number];

/** Which outcomes are meaningful for which kind of thing. A task is never "delegated"; a One Move is never "missed". */
export const VALID_OUTCOMES: Readonly<Record<ObservationSubjectKind, readonly ObservationOutcome[]>> = {
  task: ['completed', 'reopened', 'deferred', 'skipped', 'cancelled', 'missed'],
  event: ['cancelled', 'rescheduled'],
  needsMe: ['completed', 'reopened'],
  system: ['completed', 'skipped', 'missed'],
  meal: ['completed', 'skipped'],
  goal: ['completed', 'cancelled'],
  responsibility: ['delegated', 'acknowledged', 'accepted', 'declined', 'completed', 'returned', 'reassigned', 'unacknowledged'],
  oneMove: ['selected', 'completed', 'withheld', 'cleared'],
  interpretation: ['accepted', 'declined'],
};

export function isValidOutcome(kind: ObservationSubjectKind, outcome: ObservationOutcome): boolean {
  return VALID_OUTCOMES[kind].includes(outcome);
}

export const BehaviorObservationSchema = z
  .strictObject({
    id: Id,
    about: refOf(OBSERVATION_SUBJECT_KINDS),
    outcome: z.enum(OBSERVATION_OUTCOMES),
    occurredAt: InstantSchema,
    /** The logical day it happened on, in the household's timezone. */
    logicalDate: LocalDateSchema,
    /** The day it was planned for when this happened — what makes a deferral or a miss measurable. */
    plannedDate: LocalDateSchema.nullable(),
    /** Where a deferral or reschedule moved it to. */
    toDate: LocalDateSchema.nullable(),
    createdAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((o, ctx) => {
    if (!isValidOutcome(o.about.kind as ObservationSubjectKind, o.outcome)) {
      ctx.addIssue({ code: 'custom', path: ['outcome'], message: `${o.outcome} is not a meaningful outcome for a ${o.about.kind}` });
    }
    if (o.toDate !== null && o.outcome !== 'deferred' && o.outcome !== 'rescheduled') {
      ctx.addIssue({ code: 'custom', path: ['toDate'], message: 'only a deferral or a reschedule moves something to a date' });
    }
  });

export type BehaviorObservation = z.infer<typeof BehaviorObservationSchema>;

/** Local cap. Trimming is cache eviction and must never emit a cloud delete (SD4-021). */
export const MAX_LOCAL_OBSERVATIONS = 20_000;
