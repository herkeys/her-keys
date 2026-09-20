import type { AppState } from '../state';
import { findDependencyCycle } from '../foundation/structure';
import { KIND_CLOUD, refKey } from '../foundation/typedRef';
import { strOrNull, type LocalIdResolver } from './applySupport';
import type { SyncEntityKind } from './syncTypes';

/**
 * DOMAIN UNIQUENESS: where two devices can legitimately decide the same thing.
 *
 * The cloud keeps ONE row for each of these, by a uniqueness rule that is really a product
 * rule — one answer per intent, one live owner per thing, one active recurrence per thing, one
 * One Move per day. When a device pulls the authoritative row for a slot its own local state
 * already holds a different row for, the local one is DISPLACED: it cannot stay, because state
 * that holds both is state the app rejects, and it cannot vanish, because it is something she
 * did. The pull engine records the displaced intent as durable conflict evidence before applying
 * the incoming row; this says which local row it is.
 *
 * Pure, and the single statement of the rules: the pull engine's displacement hook and the
 * inbound projection both read it, so what is recorded as displaced is exactly what is replaced.
 */

type Row = Record<string, unknown>;

const liveResponsibility = new Set(['owned', 'requested', 'acknowledged', 'accepted']);

/** A typed reference out of a pulled row, with its cloud uuid turned back into this device's local id. */
function refOut(row: Row, prefix: string, kinds: readonly string[], resolve: LocalIdResolver): { kind: string; id: string } | null {
  const type = strOrNull(row[`${prefix}_type`]);
  if (type === null || !kinds.includes(type)) return null;
  const column = `${prefix}_${KIND_CLOUD[type as keyof typeof KIND_CLOUD].column}`;
  const local = resolve(strOrNull(row[column]));
  return local === null ? null : { kind: type, id: local };
}

const sameRef = (a: { kind: string; id: string } | null, b: { kind: string; id: string } | null): boolean =>
  a !== null && b !== null && a.kind === b.kind && a.id === b.id;

const CONTENT = ['task', 'event', 'needsMe', 'system', 'meal', 'goal'] as const;

/** Whether this device still holds unsent intent for a local row. Only unsent work can ever be displaced. */
export type IsPending = (kind: SyncEntityKind, localId: string) => boolean;

/**
 * What an incoming authoritative row means for the local state that does not know it yet.
 *
 *   DISPLACE  a different local row holds the slot the cloud keeps ONE of. Two devices decided the
 *             same thing; the cloud's stands, and the local one is kept as conflict evidence.
 *   ADOPT     the local row IS the same thing — the same document by digest, the same external object by
 *             identity, the same relationship by its endpoints. Nothing competes; the two are one entity,
 *             so the local row simply becomes the cloud's. Rows that name it keep naming it.
 */
export type Encounter = { displace: string } | { adopt: string };

const displace = (id: string | undefined | null): Encounter | null => (id ? { displace: id } : null);
const adopt = (id: string | undefined | null): Encounter | null => (id ? { adopt: id } : null);

/**
 * How a pulled row meets local state, or null when it meets nothing. `row` is the cloud row;
 * `resolve` turns its references into local ids; `isPending` says which local rows are unsent,
 * because a row the cloud already holds can never be the one that loses.
 */
export function classify(state: AppState, kind: SyncEntityKind, row: Row, resolve: LocalIdResolver, isPending: IsPending = () => true): Encounter | null {
  switch (kind) {
    case 'oneMove': {
      const day = String(row.logical_day);
      return displace(state.oneMoves.find((o) => o.forDate === day)?.id);
    }

    case 'decision': {
      const intent = resolve(strOrNull(row.intent_id));
      if (intent === null) return null;
      const withdrawing = String(row.decision) === 'withdrawn';
      return displace(state.decisions.find((d) => d.intentId === intent && (d.decision === 'withdrawn') === withdrawing)?.id);
    }

    case 'responsibility': {
      if (!liveResponsibility.has(String(row.state))) return null;
      const about = refOut(row, 'about', CONTENT, resolve);
      if (about === null) return null;
      return displace(state.responsibilities.find((r) => liveResponsibility.has(r.state) && sameRef(r.about, about))?.id);
    }

    case 'recurrence': {
      if (String(row.status) !== 'active') return null;
      const about = refOut(row, 'about', ['task', 'event', 'system', 'meal'], resolve);
      if (about === null) return null;
      return displace(state.recurrences.find((r) => r.status === 'active' && sameRef(r.about, about))?.id);
    }

    case 'dependency': {
      if (String(row.status) !== 'active') return null;
      const from = refOut(row, 'from', CONTENT, resolve);
      const to = refOut(row, 'to', CONTENT, resolve);
      if (from === null || to === null) return null;
      const same = state.dependencies.find((d) => d.status === 'active' && d.relation === row.relation && sameRef(d.from, from) && sameRef(d.to, to));
      if (same) return adopt(same.id);
      // Two devices each added half of a cycle. Each edge was valid on its own device; together they close a
      // loop nothing can satisfy. The unsent local edge on that loop yields — the cloud's is already settled.
      if (row.relation === 'alternative_to') return null;
      const incoming = { relation: String(row.relation), status: 'active', from, to };
      const active = state.dependencies.filter((d) => d.status === 'active');
      const cycle = findDependencyCycle([...active, incoming] as never);
      if (cycle === null) return null;
      const onCycle = new Set<string>();
      for (let i = 0; i + 1 < cycle.length; i += 1) onCycle.add(`${refKey(cycle[i])}>${refKey(cycle[i + 1])}`);
      return displace(active.find((d) => d.relation !== 'alternative_to' && onCycle.has(`${refKey(d.from)}>${refKey(d.to)}`) && isPending('dependency', d.id))?.id);
    }

    case 'externalReference':
      return adopt(
        state.externalReferences.find(
          (r) => r.provider === row.provider && r.externalAccount === row.external_account && r.externalObjectId === row.external_object_id
        )?.id
      );

    case 'sourceArtifact': {
      const digest = strOrNull(row.content_digest);
      return digest === null ? null : adopt(state.sourceArtifacts.find((a) => a.contentDigest === digest)?.id);
    }

    case 'systemStep': {
      const system = resolve(strOrNull(row.system_id));
      if (system === null) return null;
      return displace(state.systemSteps.find((s) => s.systemId === system && s.position === Number(row.position))?.id);
    }

    // One capacity profile per person. A device holding an unsynced one meets the authoritative one here.
    case 'capacity':
      return state.capacity === null ? null : displace('capacity');

    default:
      return null;
  }
}

/**
 * Remove the local row a pulled row displaces, so state never holds both. What was recorded ABOUT the
 * displaced row goes with it: a handoff that never happened has no acknowledgement, and evidence that
 * a thing was delegated cannot outlive the delegation. Those were unsent too — they hung from a row
 * the cloud never had — and the conflict evidence already names what she did.
 */
export function withoutClash(state: AppState, kind: SyncEntityKind, clashId: string): AppState {
  const drop = <T extends { id: string }>(rows: readonly T[]) => rows.filter((row) => row.id !== clashId);
  switch (kind) {
    case 'oneMove': return { ...state, oneMoves: drop(state.oneMoves) };
    case 'decision': return { ...state, decisions: drop(state.decisions) };
    case 'responsibility': {
      const hangsFromIt = (ref: { kind: string; id: string }) => ref.kind === 'responsibility' && ref.id === clashId;
      return {
        ...state,
        responsibilities: drop(state.responsibilities),
        observations: state.observations.filter((o) => !hangsFromIt(o.about)),
        evidenceLinks: state.evidenceLinks.filter((l) => !hangsFromIt(l.for) && !hangsFromIt(l.support)),
      };
    }
    case 'recurrence': return { ...state, recurrences: drop(state.recurrences) };
    case 'dependency': return { ...state, dependencies: drop(state.dependencies) };
    case 'externalReference': return { ...state, externalReferences: drop(state.externalReferences) };
    case 'sourceArtifact': return { ...state, sourceArtifacts: drop(state.sourceArtifacts) };
    case 'systemStep': return { ...state, systemSteps: drop(state.systemSteps) };
    case 'capacity': return { ...state, capacity: null };
    default: return state;
  }
}
