import type { AppState } from '../state';
import { FOUNDATION_SPECS, type FoundationSpec } from './foundationSpecs';
import { ALLOWED_OPS, DEPENDENCY_RANK, SYNC_ENTITY_KINDS, type SyncEntityKind, type SyncNamespace } from './syncTypes';

/**
 * THE SYNC-CAPABLE CANONICAL KINDS, AS THEY LIVE IN LOCAL STATE.
 *
 * One place answers "which local collection holds this kind, and what is a row's local id?". The change bridge, the initial
 * seed and the push-result merge all ask here, so a kind cannot be seen by one of them and missed by another.
 *
 * Classification (the full table, with the reason for each, is in HK_INTEGRATION_READINESS_01_BACKEND.md):
 *   PUSHED         a kind with at least one allowed operation: created and updated (or tombstoned) through the ordinary queue.
 *                  `member` is pushed for CREATE only, and only ever holds a child (`AppState.children`): the household's owner adds a
 *                  child through the same queue and `sync_push` as every other kind (HK-FEATURE-05, OC-01). The account holder's own
 *                  member row is not in `children`, so it is never owed and never pushed.
 *   PULL-ONLY      a server-written kind (`execution`, `outcome`): a device cannot forge one, so nothing is ever queued for it.
 *   MAPPING-ONLY   `household`: claim creates it and claim alone; it is not a kind in this file.
 *   LOCAL-ONLY     migration evidence and lineage, session-only source text, presentation state: not in AppState's sync kinds at all.
 */

const CORE_COLLECTION: Partial<Record<SyncEntityKind, keyof AppState>> = {
  member: 'children',
  category: 'categories',
  event: 'events',
  task: 'tasks',
  system: 'systems',
  meal: 'meals',
  needsMe: 'needsMe',
  oneMove: 'oneMoves',
  action: 'actions',
};

const FOUNDATION_BY_KIND = new Map<string, FoundationSpec>(FOUNDATION_SPECS.map((spec) => [spec.kind, spec]));

/** Kinds this device may ever queue work for, cheapest-to-send first (dependencies before what references them). */
export const PUSHABLE_KINDS: readonly SyncEntityKind[] = [...SYNC_ENTITY_KINDS]
  .filter((kind) => ALLOWED_OPS[kind].length > 0)
  .sort((a, b) => DEPENDENCY_RANK[a] - DEPENDENCY_RANK[b]);

/**
 * The onboarding row has no `local_id` in the cloud: its identity is (household, profile). Whatever local id the namespace
 * already maps it under is authoritative (a pulled row arrives under its cloud id); otherwise it is the account user's id.
 */
export function onboardingLocalId(state: AppState, namespace: SyncNamespace | null): string {
  const mapped = namespace === null ? undefined : Object.values(namespace.mappings).find((mapping) => mapping.kind === 'onboarding');
  return mapped?.localId ?? state.user.id;
}

/**
 * A reference that changes when — and only when — this kind's rows change. State updates are immutable and share structure,
 * so an untouched collection is the same array; comparing this is O(1) and is what keeps observation off the hot path.
 */
export function collectionRef(state: AppState, kind: SyncEntityKind): unknown {
  if (kind === 'discovery') return state.discovery;
  if (kind === 'onboarding') return state.onboarding;
  const core = CORE_COLLECTION[kind];
  if (core !== undefined) return state[core];
  const spec = FOUNDATION_BY_KIND.get(kind);
  return spec === undefined ? undefined : (state as unknown as Record<string, unknown>)[spec.collection];
}

export interface LocalRow {
  /** The local id the mapping is keyed by. */
  id: string;
  /** The row object itself, by reference: unchanged rows are the same object across transitions. */
  row: unknown;
}

export function rowsOf(state: AppState, kind: SyncEntityKind, namespace: SyncNamespace | null): LocalRow[] {
  if (kind === 'discovery') return state.discovery === null ? [] : [{ id: state.discovery.id, row: state.discovery }];
  if (kind === 'onboarding') return [{ id: onboardingLocalId(state, namespace), row: state.onboarding }];

  const held = collectionRef(state, kind);
  if (held === null || held === undefined) return [];
  const spec = FOUNDATION_BY_KIND.get(kind);
  if (spec?.singleton) return [{ id: 'capacity', row: held }];
  return Array.isArray(held) ? (held as Array<{ id: string }>).map((row) => ({ id: row.id, row })) : [];
}

/** One row by reference, or undefined when it is no longer in state. */
export function rowOf(state: AppState, kind: SyncEntityKind, localId: string, namespace: SyncNamespace | null): unknown {
  return rowsOf(state, kind, namespace).find((entry) => entry.id === localId)?.row;
}
