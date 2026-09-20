import type { AppState } from '../state';
import { KIND_CLOUD } from '../foundation/typedRef';
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

/**
 * The local row a pulled row displaces, or null. `row` is the cloud row; `resolve` turns its
 * references into local ids.
 */
export function findClash(state: AppState, kind: SyncEntityKind, row: Row, resolve: LocalIdResolver): string | null {
  switch (kind) {
    case 'oneMove': {
      const day = String(row.logical_day);
      return state.oneMoves.find((o) => o.forDate === day)?.id ?? null;
    }

    case 'decision': {
      const intent = resolve(strOrNull(row.intent_id));
      if (intent === null) return null;
      const withdrawing = String(row.decision) === 'withdrawn';
      return state.decisions.find((d) => d.intentId === intent && (d.decision === 'withdrawn') === withdrawing)?.id ?? null;
    }

    case 'responsibility': {
      if (!liveResponsibility.has(String(row.state))) return null;
      const about = refOut(row, 'about', CONTENT, resolve);
      if (about === null) return null;
      return state.responsibilities.find((r) => liveResponsibility.has(r.state) && sameRef(r.about, about))?.id ?? null;
    }

    case 'recurrence': {
      if (String(row.status) !== 'active') return null;
      const about = refOut(row, 'about', ['task', 'event', 'system', 'meal'], resolve);
      if (about === null) return null;
      return state.recurrences.find((r) => r.status === 'active' && sameRef(r.about, about))?.id ?? null;
    }

    case 'dependency': {
      if (String(row.status) !== 'active') return null;
      const from = refOut(row, 'from', CONTENT, resolve);
      const to = refOut(row, 'to', CONTENT, resolve);
      if (from === null || to === null) return null;
      return state.dependencies.find((d) => d.status === 'active' && d.relation === row.relation && sameRef(d.from, from) && sameRef(d.to, to))?.id ?? null;
    }

    case 'externalReference':
      return (
        state.externalReferences.find(
          (r) => r.provider === row.provider && r.externalAccount === row.external_account && r.externalObjectId === row.external_object_id
        )?.id ?? null
      );

    case 'sourceArtifact': {
      const digest = strOrNull(row.content_digest);
      return digest === null ? null : (state.sourceArtifacts.find((a) => a.contentDigest === digest)?.id ?? null);
    }

    case 'systemStep': {
      const system = resolve(strOrNull(row.system_id));
      if (system === null) return null;
      return state.systemSteps.find((s) => s.systemId === system && s.position === Number(row.position))?.id ?? null;
    }

    // One capacity profile per person. A device holding an unsynced one meets the authoritative one here.
    case 'capacity':
      return state.capacity === null ? null : 'capacity';

    default:
      return null;
  }
}

/** Remove the local row a pulled row displaces, so state never holds both. */
export function withoutClash(state: AppState, kind: SyncEntityKind, clashId: string): AppState {
  const drop = <T extends { id: string }>(rows: readonly T[]) => rows.filter((row) => row.id !== clashId);
  switch (kind) {
    case 'oneMove': return { ...state, oneMoves: drop(state.oneMoves) };
    case 'decision': return { ...state, decisions: drop(state.decisions) };
    case 'responsibility': return { ...state, responsibilities: drop(state.responsibilities) };
    case 'recurrence': return { ...state, recurrences: drop(state.recurrences) };
    case 'dependency': return { ...state, dependencies: drop(state.dependencies) };
    case 'externalReference': return { ...state, externalReferences: drop(state.externalReferences) };
    case 'sourceArtifact': return { ...state, sourceArtifacts: drop(state.sourceArtifacts) };
    case 'systemStep': return { ...state, systemSteps: drop(state.systemSteps) };
    case 'capacity': return { ...state, capacity: null };
    default: return state;
  }
}
