import type { ActionIntent } from '../foundation/authorization';
import type { BehaviorObservation } from '../foundation/observation';
import type { EvidenceLink } from '../foundation/pattern';
import type { ExternalReference } from '../foundation/externalReference';
import type { Interpretation } from '../foundation/interpretation';
import type { Responsibility } from '../foundation/responsibility';
import type { Dependency, RecurrenceRule } from '../foundation/structure';
import type { SourceArtifact } from '../foundation/sourceArtifact';
import { refKey, type TypedRef } from '../foundation/typedRef';
import type { AppState } from '../state';

/**
 * CROSS-DOMAIN RELATED SET — B4-FE01-031.
 *
 * Everything the household knows about one thing, gathered across domains through the
 * typed relations and nothing else: no ad-hoc joins between modules, and no reading a
 * JSON payload to find a fact. A school event, the fee it comes with, the form it needs,
 * the child it concerns and the meeting it collides with are separate typed rows; this is
 * how a reasoning step sees them as one situation.
 *
 * Every row it returns carries its own provenance, so provenance is preserved per fact
 * and per relationship — a relation is a row, and it says who made it.
 */
export interface RelatedSet {
  /** The relationships it takes part in, as either end. */
  dependencies: Dependency[];
  /** What it is waiting on, and what waits on it. */
  requires: TypedRef[];
  requiredBy: TypedRef[];
  parts: TypedRef[];
  partOf: TypedRef[];
  alternatives: TypedRef[];
  responsibilities: Responsibility[];
  observations: BehaviorObservation[];
  externalReferences: ExternalReference[];
  recurrences: RecurrenceRule[];
  intents: ActionIntent[];
  evidence: EvidenceLink[];
  /** The source artifact its provenance names, and every other row that names the same one. */
  artifact: SourceArtifact | null;
  siblings: TypedRef[];
  interpretations: Interpretation[];
}

const rowOf = (state: AppState, ref: TypedRef): { provenance: { artifactId: string | null } } | undefined => {
  const lists: Record<string, ReadonlyArray<{ id: string; provenance: { artifactId: string | null } }>> = {
    task: state.tasks, event: state.events, needsMe: state.needsMe, system: state.systems, meal: state.meals, goal: state.goals,
    responsibility: state.responsibilities, person: state.people, intent: state.intents,
  };
  return lists[ref.kind]?.find((r) => r.id === ref.id);
};

export function relatedTo(state: AppState, ref: TypedRef): RelatedSet {
  const key = refKey(ref);
  const dependencies = state.dependencies.filter((d) => d.status === 'active' && (refKey(d.from) === key || refKey(d.to) === key));
  const outgoing = (relation: Dependency['relation']) => dependencies.filter((d) => d.relation === relation && refKey(d.from) === key).map((d) => d.to);
  const incoming = (relation: Dependency['relation']) => dependencies.filter((d) => d.relation === relation && refKey(d.to) === key).map((d) => d.from);

  const artifactId = rowOf(state, ref)?.provenance.artifactId ?? null;
  const siblings: TypedRef[] = [];
  if (artifactId !== null) {
    const collections: Array<[TypedRef['kind'], ReadonlyArray<{ id: string; provenance: { artifactId: string | null } }>]> = [
      ['task', state.tasks], ['event', state.events], ['needsMe', state.needsMe], ['system', state.systems], ['meal', state.meals],
      ['goal', state.goals], ['responsibility', state.responsibilities],
    ];
    for (const [kind, rows] of collections) {
      for (const row of rows) if (row.provenance.artifactId === artifactId && !(kind === ref.kind && row.id === ref.id)) siblings.push({ kind, id: row.id });
    }
  }

  return {
    dependencies,
    requires: outgoing('requires'),
    requiredBy: incoming('requires'),
    parts: incoming('part_of'),
    partOf: outgoing('part_of'),
    alternatives: [...incoming('alternative_to'), ...outgoing('alternative_to')],
    responsibilities: state.responsibilities.filter((r) => refKey(r.about) === key),
    observations: state.observations.filter((o) => refKey(o.about) === key),
    externalReferences: state.externalReferences.filter((e) => e.linked !== null && refKey(e.linked) === key),
    recurrences: state.recurrences.filter((r) => refKey(r.about) === key),
    intents: state.intents.filter((i) => i.about !== null && refKey(i.about) === key),
    evidence: state.evidenceLinks.filter((l) => refKey(l.support) === key || refKey(l.for) === key),
    artifact: artifactId === null ? null : (state.sourceArtifacts.find((a) => a.id === artifactId) ?? null),
    siblings,
    interpretations: state.interpretations.filter((i) => i.acceptedRef !== null && refKey(i.acceptedRef) === key),
  };
}
