import type { TransitionContext } from './context';
import { userProvenance, provenanceFor, type Provenance } from './foundation/provenance';
import {
  MAX_LOCAL_OBSERVATIONS,
  isValidOutcome,
  type BehaviorObservation,
  type ObservationOutcome,
  type ObservationSubjectKind,
} from './foundation/observation';
import type { TypedRef } from './foundation/typedRef';
import { epochMsOf, logicalDateAt, toInstant, type LocalDate } from './logicalDay';
import type { AppState, Task } from './state';

/**
 * Recording meaningful behavior (B4-FE01-006).
 *
 * `appendObservation` is the only way an observation enters state, and it is called
 * from the same transition that changes the domain row — so a completion and the
 * record that it happened land in one durable write, never one without the other.
 *
 * It refuses an outcome that is not meaningful for the kind of thing it is about,
 * because a vocabulary that accepts anything is a clickstream.
 */

export interface ObservationInput {
  about: TypedRef<ObservationSubjectKind>;
  outcome: ObservationOutcome;
  plannedDate?: LocalDate | null;
  toDate?: LocalDate | null;
  /** Who saw it happen. Defaults to her: most of what is recorded here is something she did. */
  provenance?: Provenance;
}

export function appendObservation(state: AppState, ctx: TransitionContext, input: ObservationInput): AppState {
  if (!isValidOutcome(input.about.kind, input.outcome)) {
    throw new RangeError(`${input.outcome} is not a meaningful outcome for a ${input.about.kind}`);
  }
  const at = toInstant(ctx.nowMs);
  const observation: BehaviorObservation = {
    id: ctx.createId('obs'),
    about: input.about,
    outcome: input.outcome,
    occurredAt: at,
    logicalDate: ctx.today,
    plannedDate: input.plannedDate ?? null,
    toDate: input.toDate ?? null,
    createdAt: at,
    provenance: provenanceFor(state.origin, input.provenance ?? userProvenance()),
    scope: 'personal',
  };
  return { ...state, observations: trimObservations(state, [...state.observations, observation]) };
}

/**
 * Local eviction at the cap. It is a CACHE policy: it never emits a cloud delete
 * (SD4-021), the cloud keeps the full history, and an observation that an evidence
 * link still points at is never the one dropped.
 */
function trimObservations(state: AppState, observations: BehaviorObservation[]): BehaviorObservation[] {
  const excess = observations.length - MAX_LOCAL_OBSERVATIONS;
  if (excess <= 0) return observations;
  const pinned = new Set(
    state.evidenceLinks.flatMap((link) => (link.support.kind === 'observation' ? [link.support.id] : []))
  );
  let toDrop = excess;
  return observations.filter((observation) => {
    if (toDrop > 0 && !pinned.has(observation.id)) {
      toDrop -= 1;
      return false;
    }
    return true;
  });
}

export function observationsAbout(state: Pick<AppState, 'observations'>, ref: TypedRef): BehaviorObservation[] {
  return state.observations.filter((o) => o.about.kind === ref.kind && o.about.id === ref.id);
}

/** The day a task was expected: its plan's day, or its due date when it was never planned. */
export function plannedDateOf(task: Pick<Task, 'plan' | 'dueDate'>, timezone: string): LocalDate | null {
  if (task.plan.kind === 'day') return task.plan.date;
  if (task.plan.kind === 'timed') return logicalDateAt(epochMsOf(task.plan.startsAt), timezone);
  return task.dueDate;
}
