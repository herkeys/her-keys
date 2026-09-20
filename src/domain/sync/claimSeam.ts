import type { AppState } from '../state';
import { foundationLocalRow } from './foundationProjection';
import { FOUNDATION_SPECS } from './foundationSpecs';
import { emptyNamespace, mappingKey, type MappedKind, type Mapping, type SyncNamespace } from './syncTypes';

/**
 * THE CLAIM -> SYNC SEAM.
 *
 * Claim returns `local_id -> cloud uuid` for everything it created or adopted.
 * Sync adopts that map wholesale rather than rediscovering the cloud by
 * guessing, which is what stops the first sync from re-creating the very rows
 * the claim just made.
 *
 * The map is flat — claim does not say which kind each local id belongs to —
 * so the kind is resolved from local state. That is deterministic and honest:
 * it asks the household what each id actually is, rather than parsing a prefix
 * and hoping.
 */

/** Which collection holds this local id. Null when nothing does. */
export function kindOfLocalId(state: AppState, localId: string): MappedKind | null {
  if (state.household.id === localId) return 'household';
  if (state.user.id === localId) return 'member';
  if (state.children.some((child) => child.id === localId)) return 'member';
  if (state.categories.some((row) => row.id === localId)) return 'category';
  if (state.tasks.some((row) => row.id === localId)) return 'task';
  if (state.events.some((row) => row.id === localId)) return 'event';
  if (state.systems.some((row) => row.id === localId)) return 'system';
  if (state.meals.some((row) => row.id === localId)) return 'meal';
  if (state.needsMe.some((row) => row.id === localId)) return 'needsMe';
  if (state.oneMoves.some((row) => row.id === localId)) return 'oneMove';
  if (state.discovery?.id === localId) return 'discovery';
  if (state.actions.some((row) => row.id === localId)) return 'action';
  // The foundation kinds (a claim carries the source artifacts its rows were derived from).
  for (const spec of FOUNDATION_SPECS) {
    if (foundationLocalRow(state, spec.kind, localId) !== undefined) return spec.kind;
  }
  return null;
}

/**
 * The namespace a freshly bound account starts from.
 *
 * Revision 1 for every claimed row, because that is what the server writes on
 * insert: `revision bigint NOT NULL DEFAULT 1`. Starting from 1 rather than 0
 * means the first ordinary edit to a claimed row carries the right CAS base and
 * does not manufacture a stale conflict against itself.
 *
 * The cursor starts at `'0'`, so the first pull sees the claim's OWN change_log
 * rows. That is deliberate: those rows resolve straight onto the mappings below,
 * which is exactly how the pull-side seam proves it creates nothing twice.
 */
export function namespaceFromClaim(input: {
  state: AppState;
  accountId: string;
  householdId: string;
  deviceId: string;
  idMap: Record<string, string>;
}): SyncNamespace {
  const namespace = emptyNamespace(input);
  const mappings: Record<string, Mapping> = {};

  for (const [localId, cloudId] of Object.entries(input.idMap)) {
    const kind = kindOfLocalId(input.state, localId);
    // A local id the household no longer holds is not an error to raise here.
    // Claim may have adopted a row that has since been removed locally, and an
    // unmappable id simply has nothing to map.
    if (kind === null) continue;
    mappings[mappingKey(kind, localId)] = { kind, localId, cloudId, revision: 1 };
  }

  return { ...namespace, mappings, hydration: 'ready' };
}

/**
 * The namespace an empty device starts from before its first hydration.
 *
 * `unhydrated` is load-bearing: until the first cloud batch is durable this
 * device must not render an empty household as though it were hers.
 */
export function namespaceForNewDevice(input: {
  accountId: string;
  householdId: string;
  deviceId: string;
}): SyncNamespace {
  return emptyNamespace(input);
}
