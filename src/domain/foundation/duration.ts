import { z } from 'zod';

/**
 * DURATION KNOWLEDGE (HA-010).
 *
 * A number of minutes is not, by itself, evidence that anyone said it. `Task.durationMinutes` stays a plain
 * number because capacity arithmetic needs one — that is a COMPUTATIONAL FALLBACK — and `Task.durationSource` says
 * how much that number may be trusted as a fact. DEFAULT != USER-PROVIDED.
 *
 *   user      she entered or confirmed the number herself, in a duration field.
 *   default   nobody supplied one, so the planning default stands in. An assumption, never a statement.
 *   inferred  Her Keys read or derived it (from her words in a reading she approved, or by an approved recommendation
 *             such as shortening a task). She approved it; she did not state it.
 *   null      provenance was never recorded: every task saved before this contract existed, and any row that arrived
 *             without a source. It is NOT user-provided and it is NOT a known default — it is unknown, and stays unknown.
 *
 * Nothing infers a source from the value: a 15 is a 15 whether she typed it or the default supplied it.
 */
export const DURATION_SOURCES = ['user', 'default', 'inferred'] as const;
export type DurationSource = (typeof DURATION_SOURCES)[number];
export const DurationSourceSchema = z.enum(DURATION_SOURCES);

/** The planning default a task carries when no duration was supplied. For computation only — see `durationSource`. */
export const DEFAULT_TASK_DURATION_MINUTES = 15;

/** What may honestly be said about a task's duration. The one place anything asks. */
export type DurationKnowledge = 'user-provided' | 'default-estimate' | 'inferred-estimate' | 'unrecorded';

export function durationKnowledgeOf(task: { durationSource?: DurationSource | null }): DurationKnowledge {
  switch (task.durationSource ?? null) {
    case 'user':
      return 'user-provided';
    case 'default':
      return 'default-estimate';
    case 'inferred':
      return 'inferred-estimate';
    default:
      return 'unrecorded';
  }
}

/**
 * The source a duration carries when it is saved from a form that PREFILLS the planning default.
 *
 * The prefilled number is what she was shown, not what she said: only touching the field makes it hers. Untouched on a NEW task it
 * is the default she was shown; untouched on an EDIT it is whatever it already was (including unknown, which stays unknown).
 */
export function durationSourceForSave(input: { touched: boolean; existing: { durationSource?: DurationSource | null } | null }): DurationSource | null {
  if (input.touched) return 'user';
  return input.existing === null ? 'default' : (input.existing.durationSource ?? null);
}

/** True only when she gave the number. Anything else is an estimate or an unknown and must be worded as one. */
export const isUserProvidedDuration = (task: { durationSource?: DurationSource | null }): boolean =>
  durationKnowledgeOf(task) === 'user-provided';
