import { starterCategories } from '../categories';
import type { LocalDate } from '../logicalDay';
import type { AppState } from '../state';
import { isKeptLocal, keptMoveIds, syncToday } from './keptLocal';
import { enqueue } from './queue';
import { PUSHABLE_KINDS, collectionRef, onboardingLocalId, rowOf, rowsOf } from './syncKinds';
import {
  ALLOWED_OPS,
  MAX_QUEUE_ITEMS,
  mappingKey,
  type SyncEntityKind,
  type SyncNamespace,
  type SyncOp,
} from './syncTypes';

/**
 * THE CHANGE BRIDGE.
 *
 * Canonical mutations stay canonical mutations: no feature knows a queue exists. This module turns the DIFFERENCE between two
 * canonical states into queue intent, and turns "rows that exist but the cloud has never been told about" into queue intent,
 * using the existing queue (`enqueue`) unchanged. It is pure: state and namespace in, namespace out. Making the result durable
 * in the same write as the state is the store's job (see `appStore` `observe`), which is what stops a crash from keeping the
 * change and losing the intent.
 */

/** A row that needs to be told to the cloud. `upsert` becomes a create or an update depending on whether the cloud knows it. */
export interface RowIntent {
  kind: SyncEntityKind;
  localId: string;
  op: 'upsert' | 'tombstone';
}

/**
 * Queue slots the initial seed leaves free for changes she makes while it drains. The queue is bounded, and a household with
 * thousands of pre-existing rows must not be able to fill it and leave no room for her next edit.
 */
export const SEED_QUEUE_HEADROOM = 100;
export const SEED_QUEUE_CEILING = MAX_QUEUE_ITEMS - SEED_QUEUE_HEADROOM;

/**
 * Which rows changed between two states. Only collections whose reference changed are walked, so the cost is proportional to
 * what a mutation touched — not to the size of the household.
 */
export function changedRows(previous: AppState, next: AppState, namespace: SyncNamespace | null): RowIntent[] {
  const out: RowIntent[] = [];
  for (const kind of PUSHABLE_KINDS) {
    if (collectionRef(previous, kind) === collectionRef(next, kind)) continue;

    const before = new Map(rowsOf(previous, kind, namespace).map((entry) => [entry.id, entry.row]));
    const after = rowsOf(next, kind, namespace);
    for (const entry of after) {
      if (before.get(entry.id) !== entry.row) out.push({ kind, localId: entry.id, op: 'upsert' });
    }

    // Only Discovery has a removal transport (a soft tombstone). Every other kind is retired by a status change, never deleted.
    if (kind === 'discovery' && ALLOWED_OPS.discovery.includes('tombstone')) {
      const stillThere = new Set(after.map((entry) => entry.id));
      for (const id of before.keys()) if (!stillThere.has(id)) out.push({ kind, localId: id, op: 'tombstone' });
    }
  }
  return out;
}

/**
 * Rows that exist locally and that neither the mapping nor the queue accounts for — the cloud has never been told about them.
 *
 * A row whose CREATE already ended as evidence (the server refused its content, RLS said no, a dependency can never resolve) is
 * not owed: it left the queue on purpose and is waiting for a decision, and deriving it as "owed" again would send the same
 * refused row on every trigger, forever, with a new piece of evidence each time.
 *
 * Nor is an earlier day's One Move the cloud never saw, or a fact about one (HK13-D28, keptLocal.ts): the live path cannot carry a
 * past day, so it stays on this device. `today` says which day that is; without it nothing is kept back.
 */
export function unsyncedRows(state: AppState, namespace: SyncNamespace, limit: number, today?: LocalDate): RowIntent[] {
  const queued = new Set(namespace.queue.map((item) => mappingKey(item.kind, item.localId)));
  const decided = new Set(namespace.evidence.filter((e) => e.attemptedOp === 'create').map((e) => mappingKey(e.kind, e.localId)));
  const kept = today === undefined ? new Set<string>() : keptMoveIds(state, namespace, today);
  const out: RowIntent[] = [];
  for (const kind of PUSHABLE_KINDS) {
    // Onboarding is created by the server for every account; it is adopted (mapped), never created.
    if (kind === 'onboarding') continue;
    for (const entry of rowsOf(state, kind, namespace)) {
      const key = mappingKey(kind, entry.id);
      if (namespace.mappings[key] === undefined && !queued.has(key) && !decided.has(key) && !isKeptLocal(kind, entry.id, entry.row, kept)) {
        out.push({ kind, localId: entry.id, op: 'upsert' });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

export interface QueueResult {
  namespace: SyncNamespace;
  queued: number;
  /** Intents the bounded queue could not take. The namespace is marked `backlog`; nothing was evicted. */
  overflow: RowIntent[];
}

/** Turn intents into queue work with the existing `enqueue`, deciding create vs update from what the cloud already knows. */
export function queueIntents(namespace: SyncNamespace, intents: readonly RowIntent[], at: string): QueueResult {
  let current = namespace;
  let queued = 0;
  const overflow: RowIntent[] = [];

  for (const intent of intents) {
    const mapped = current.mappings[mappingKey(intent.kind, intent.localId)] !== undefined;
    const op: SyncOp = intent.op === 'tombstone' ? 'tombstone' : mapped ? 'update' : 'create';
    // Adoption, not creation: the server already made this row. Nothing is queued until it is mapped.
    if (intent.kind === 'onboarding' && !mapped) continue;
    // An append-only or server-written kind has no such operation. That is not an error to surface; it is the design.
    if (!ALLOWED_OPS[intent.kind].includes(op)) continue;

    const result = enqueue(current, { kind: intent.kind, localId: intent.localId, op, at });
    if (result.ok) {
      current = result.namespace;
      queued += 1;
    } else if (result.reason === 'backlog') {
      current = result.namespace;
      overflow.push(intent);
    }
  }
  return { namespace: current, queued, overflow };
}

/** Whether onboarding still says nothing she chose, i.e. equals what the server created for a new account. */
export const isPristineOnboarding = (onboarding: AppState['onboarding']): boolean =>
  onboarding.goalIds.length === 0 &&
  onboarding.strengthIds.length === 0 &&
  onboarding.struggleIds.length === 0 &&
  onboarding.lastStep === null &&
  onboarding.completedAt === null;

/**
 * The reconciliation that never depends on having seen a mutation: queue a create for every unmapped row, up to the seed
 * ceiling. Stateless — it is derived from (state, mappings, queue) — so a crash at any point loses nothing: the next call finds
 * the same rows still unaccounted for. Larger backlogs simply take several rounds as the queue drains.
 */
export function topUpQueue(state: AppState, namespace: SyncNamespace, at: string): QueueResult {
  const room = SEED_QUEUE_CEILING - namespace.queue.length;
  if (room <= 0) return { namespace, queued: 0, overflow: [] };
  return queueIntents(namespace, unsyncedRows(state, namespace, room, syncToday(state, Date.parse(at))), at);
}

export interface SeedInput {
  state: AppState;
  namespace: SyncNamespace;
  accountId: string;
  at: string;
  /** The state the claim payload was built from. A row she edited during the network call differs from what the server holds. */
  claimedState?: AppState;
  /** Local ids the claim payload carried. Every other id in the claim's map was ADOPTED: the server made it, we did not send it. */
  carried?: ReadonlySet<string>;
}

/**
 * The namespace a freshly bound account starts from, beyond the claim's own id map:
 *
 *  1. ADOPT the onboarding row the server created for every account (a pull would otherwise overwrite her local onboarding
 *     with the server default), and queue her real onboarding over it.
 *  2. Queue an update for every starter category the server adopted but she had changed locally.
 *  3. Queue an update for every carried row she edited while the claim was in flight.
 *  4. Queue a create for every other row the claim did not carry (bounded, dependency-ordered, never dropped).
 */
export function seedNamespace(input: SeedInput): SyncNamespace {
  const { state, accountId, at } = input;
  let namespace = input.namespace;
  const carried = input.carried ?? new Set<string>();
  const intents: RowIntent[] = [];

  // 1. onboarding
  const onboardingId = onboardingLocalId(state, namespace);
  const onboardingKey = mappingKey('onboarding', onboardingId);
  if (!Object.values(namespace.mappings).some((mapping) => mapping.kind === 'onboarding')) {
    // `revision: 1` is what the server wrote on insert, exactly as for every claimed row (see namespaceFromClaim).
    namespace = { ...namespace, mappings: { ...namespace.mappings, [onboardingKey]: { kind: 'onboarding', localId: onboardingId, cloudId: accountId, revision: 1 } } };
    if (!isPristineOnboarding(state.onboarding)) intents.push({ kind: 'onboarding', localId: onboardingId, op: 'upsert' });
  }

  // 2. starter categories the server adopted but she had changed
  const starters = starterCategories(state.household.id);
  for (const category of state.categories) {
    if (namespace.mappings[mappingKey('category', category.id)] === undefined || carried.has(category.id)) continue;
    const starter = starters.find((candidate) => candidate.id === category.id);
    if (starter !== undefined && JSON.stringify(category) !== JSON.stringify(starter)) {
      intents.push({ kind: 'category', localId: category.id, op: 'upsert' });
    }
  }

  // 3. carried rows edited during the claim
  if (input.claimedState !== undefined) {
    for (const mapping of Object.values(namespace.mappings)) {
      if (!carried.has(mapping.localId) || mapping.kind === 'household' || mapping.kind === 'member') continue;
      const kind = mapping.kind as SyncEntityKind;
      if (!PUSHABLE_KINDS.includes(kind)) continue;
      const then = rowOf(input.claimedState, kind, mapping.localId, namespace);
      const now = rowOf(state, kind, mapping.localId, namespace);
      if (now !== undefined && then !== now) intents.push({ kind, localId: mapping.localId, op: 'upsert' });
    }
  }

  namespace = queueIntents(namespace, intents, at).namespace;

  // 4. everything else she already had
  return topUpQueue(state, namespace, at).namespace;
}
