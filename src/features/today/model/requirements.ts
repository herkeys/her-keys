import type { Provenance } from '../../../domain/foundation/provenance';
import { refKey, type TypedRef } from '../../../domain/foundation/typedRef';
import { relatedTo } from '../../../domain/reasoning/related';
import type { AppState } from '../../../domain/state';
import { blockersOf } from '../../../domain/structure';
import { describeRef, sourceOf } from './refs';
import type { SourceLine, TodayRoute } from './types';

/**
 * WHAT A THING WAITS ON, AND WHAT WAITS ON IT — read from the typed `requires` relation.
 *
 * "What is it still waiting on" is the foundation's own answer (`blockersOf`); this does not re-decide it. What this
 * adds is the relationship's provenance. A `requires` edge is a row, and it says who made it: an edge Her Keys inferred
 * and she has not confirmed is a possibility, and Today must not say "needs" about a possibility. (The edges come from
 * `relatedTo` — the sanctioned cross-domain read — rather than a join written here.)
 */
export interface Requirement {
  ref: TypedRef;
  title: string;
  route: TodayRoute | null;
  /** The provenance of the RELATIONSHIP itself, not of the row it points at. */
  source: SourceLine | null;
}

const isUnconfirmed = (r: Requirement): boolean => r.source?.uncertain === true;

function named(state: AppState, ref: TypedRef, edge: { provenance: Provenance } | undefined): Requirement[] {
  const info = describeRef(state, ref);
  return info.title === null ? [] : [{ ref, title: info.title, route: info.route, source: edge ? sourceOf(edge) : null }];
}

/** What `ref` still waits on: the things it requires that are not done. */
export function requirementsOf(state: AppState, ref: TypedRef): Requirement[] {
  const unmet = blockersOf(state, ref);
  if (unmet.length === 0) return [];
  const edges = relatedTo(state, ref).dependencies;
  return unmet.flatMap((to) => named(state, to, edges.find((d) => d.relation === 'requires' && refKey(d.from) === refKey(ref) && refKey(d.to) === refKey(to))));
}

/**
 * The commitments that are themselves still live and require `ref`. Only rows Today already presents — a task, an event,
 * something she captured — are named: a dropped task or a removed event is not waiting on anything.
 */
export function dependentsOf(state: AppState, ref: TypedRef): Requirement[] {
  const related = relatedTo(state, ref);
  return related.requiredBy
    .filter((from) => isLive(state, from))
    .flatMap((from) => named(state, from, related.dependencies.find((d) => d.relation === 'requires' && refKey(d.from) === refKey(from) && refKey(d.to) === refKey(ref))));
}

function isLive(state: AppState, ref: TypedRef): boolean {
  switch (ref.kind) {
    case 'task': return state.tasks.find((t) => t.id === ref.id)?.status === 'open';
    case 'event': return state.events.find((e) => e.id === ref.id)?.status === 'active';
    case 'needsMe': return state.needsMe.find((n) => n.id === ref.id)?.status === 'open';
    default: return false;
  }
}

export interface SpeakableRequirements {
  items: Requirement[];
  /** True when every item is Her Keys' unconfirmed claim — the wording must then say "may". */
  unconfirmed: boolean;
}

/**
 * Which requirements one sentence may speak of. The ones she stated (or confirmed) come first; Her Keys' unconfirmed ones
 * are spoken of only when there are no others, and never in the same sentence — "needs A and one more" must not fold a
 * possibility into a fact's count.
 */
export function speakable(requirements: Requirement[]): SpeakableRequirements | null {
  if (requirements.length === 0) return null;
  const stated = requirements.filter((r) => !isUnconfirmed(r));
  return stated.length > 0 ? { items: stated, unconfirmed: false } : { items: requirements, unconfirmed: true };
}
