import { durationKnowledgeOf, type DurationKnowledge, type DurationSource } from '../../../domain/foundation/duration';
import type { DurationBasis, EstimatedBasis } from './types';

/**
 * DURATION KNOWLEDGE, AS CALENDAR CARRIES IT (HA-010).
 *
 * The foundation says how far a task's number of minutes may be trusted (`durationKnowledgeOf`). Calendar keeps that
 * answer on the item it projects, in the `durationBasis` vocabulary it already had, so every claim built on the number
 * can say whether it rests on something she gave or on an estimate. There is one mapping, here, and it never looks at
 * the number itself: a 15 is a 15 whichever way it got there.
 */
const BASIS_OF_KNOWLEDGE: Record<DurationKnowledge, Exclude<DurationBasis, 'event_span' | 'none'>> = {
  'user-provided': 'task_recorded',
  'default-estimate': 'task_default',
  'inferred-estimate': 'task_inferred',
  unrecorded: 'task_unrecorded',
};

/**
 * The basis of a task's duration. A stored 0 is "no usable duration": the number is not used at all, so no source can
 * make it a fact and it has none.
 */
export function durationBasisOfTask(task: { durationMinutes: number; durationSource?: DurationSource | null }): DurationBasis {
  return task.durationMinutes > 0 ? BASIS_OF_KNOWLEDGE[durationKnowledgeOf(task)] : 'none';
}

/** True for a number Calendar may compute with but must not speak as a fact: assumed, estimated, or of unknown origin. */
export const isEstimatedBasis = (basis: DurationBasis): basis is EstimatedBasis =>
  basis === 'task_default' || basis === 'task_inferred' || basis === 'task_unrecorded';
