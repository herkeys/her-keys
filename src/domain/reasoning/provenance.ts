import type { ActionRecord } from '../state';
import {
  carriesConfidence,
  isSyncable,
  isUserStated,
  type Provenance,
  type ProvenanceSource,
} from '../foundation/provenance';

/**
 * Where a durable fact came from — read from the ROW, never guessed.
 *
 * Until v4 this file DERIVED provenance from the kind of entity: `provenanceOfTask`
 * returned `'user-action'` for every task in a real household. That was only true
 * while each entity had exactly one producer, and it fed `isUserStated()` — which
 * lowers the confidence-promotion threshold from 3 corroborations to 1. The moment a
 * second producer existed (an inference, an email, an automation) the answer would
 * have been silently wrong, and there would have been no way to tell afterwards.
 *
 * Provenance is now stored on every content row (B4-FE01-001) and this module only
 * reads it. There is deliberately no fallback: a row without provenance is not a
 * valid row, and `legacy-unknown` is a stored, explicit value rather than a default.
 *
 * Entity type is never provenance. The only record class read differently is the
 * action ledger, and only because it already stores its own `actor` and `source`.
 */
export { carriesConfidence, isSyncable, isUserStated };
export type { Provenance, ProvenanceSource };

/** The producer any content row stores. */
export function provenanceOf(row: { provenance: Provenance }): ProvenanceSource {
  return row.provenance.producer;
}

export const provenanceOfEvent = provenanceOf;
export const provenanceOfTask = provenanceOf;
export const provenanceOfNeedsMeItem = provenanceOf;
export const provenanceOfCategory = provenanceOf;
export const provenanceOfOneMove = provenanceOf;
export const provenanceOfDiscovery = provenanceOf;
export const provenanceOfOnboarding = provenanceOf;
export const provenanceOfSystem = provenanceOf;
export const provenanceOfMeal = provenanceOf;

/**
 * An action record is a decision she approved or declined on a Her Keys
 * proposal. The proposal was Her Keys'; the decision is hers, and that is what
 * the ledger stores — in its own `actor` and `source` fields, which is why this
 * reads them rather than assuming.
 */
export function provenanceOfAction(action: Pick<ActionRecord, 'actor' | 'source'>): ProvenanceSource {
  return action.actor === 'user' ? 'user-action' : 'automation';
}
