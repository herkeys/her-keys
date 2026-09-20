import type { Provenance } from '../foundation/provenance';
import { EXISTING_FACETS } from './foundationSpecs';
import { mappingKey, type MappedKind, type SyncEntityKind, type SyncNamespace } from './syncTypes';

/**
 * The pieces of the outbound projection that more than one file needs: the context, the
 * "this reference has no cloud mapping yet" signal, and the two things every synced row
 * now states — where it came from, and the facets it can answer.
 */

export interface ProjectionContext {
  householdId: string;
  profileId: string;
  namespace: SyncNamespace;
}

/** Resolve a local reference to the cloud uuid the server expects (SD4-007). */
export function cloudRef(ctx: ProjectionContext, kind: MappedKind, localId: string | null): string | null {
  if (localId === null) return null;
  return ctx.namespace.mappings[mappingKey(kind, localId)]?.cloudId ?? null;
}

/** The child member's cloud uuid. Children arrive through claim, never through sync. */
export function childRef(ctx: ProjectionContext, localId: string | null): string | null {
  if (localId === null) return null;
  return ctx.namespace.mappings[mappingKey('member', localId)]?.cloudId ?? null;
}

export class UnresolvedReferenceError extends Error {
  // Written out rather than declared as parameter properties: the test runner
  // strips types without transforming, and a parameter property is a transform.
  kind: SyncEntityKind;
  localId: string;
  missing: string;

  constructor(kind: SyncEntityKind, localId: string, missing: string) {
    super(`${kind} ${localId} needs ${missing}, which has no cloud mapping yet`);
    this.name = 'UnresolvedReferenceError';
    this.kind = kind;
    this.localId = localId;
    this.missing = missing;
  }
}

export function require_<T>(value: T | undefined, kind: SyncEntityKind, localId: string): T {
  if (value === undefined) {
    throw new UnresolvedReferenceError(kind, localId, `the local ${kind} itself, which is no longer in state`);
  }
  return value;
}

/**
 * Where a row came from, as the three columns the cloud stores it in. The artifact travels as its
 * cloud uuid like every other reference (SD4-007); an artifact with no mapping yet is a scheduling
 * fact, not a failure — it is queued first and this row goes out on the next pass.
 */
export function provenanceColumns(
  ctx: ProjectionContext,
  kind: SyncEntityKind,
  localId: string,
  provenance: Provenance
): { producer: string; source_artifact_id: string | null; confidence: string | null } {
  const artifact = cloudRef(ctx, 'sourceArtifact', provenance.artifactId);
  if (provenance.artifactId !== null && artifact === null) {
    throw new UnresolvedReferenceError(kind, localId, `source artifact ${provenance.artifactId}`);
  }
  return { producer: provenance.producer, source_artifact_id: artifact, confidence: provenance.confidence };
}

type FacetKind = 'task' | 'event' | 'meal' | 'system';

/** A row's commitment facets as cloud columns. NULL stays NULL: "not known" is never turned into a value. */
export function facetColumns(kind: FacetKind, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const facet of EXISTING_FACETS[kind]) {
    const value = row[facet.local];
    if (facet.type === 'money') {
      const money = (value ?? null) as { amountMinor: number; currency: string; direction: string } | null;
      out[`${facet.prefix}_amount_minor`] = money?.amountMinor ?? null;
      out[`${facet.prefix}_currency`] = money?.currency ?? null;
      out[`${facet.prefix}_direction`] = money?.direction ?? null;
    } else {
      out[facet.col] = value ?? null;
    }
  }
  return out;
}
