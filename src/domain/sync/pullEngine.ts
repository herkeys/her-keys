import { validateAppState, type AppState } from '../state';
import { CLOUD_TABLE, DEPENDENCY_RANK, IDENTITY_COLUMN, PULL_BATCH_SIZE, mappingKey, type Mapping, type SyncEntityKind, type SyncNamespace } from './syncTypes';
import { rememberMapping } from './pushEngine';
import { recordEvidence } from './queue';
import { isFailure, type ChangeRow, type SyncTransport } from './transport';

/**
 * THE PULL ENGINE.
 *
 * The cursor is `change_log.committed_xid` against the snapshot barrier, and
 * nothing else. Not `updated_at`, not a row revision, not a client clock — a
 * cursor on any of those silently loses rows written by a transaction that
 * started earlier and committed later (SD4-012).
 *
 * A batch is all-or-nothing. Local state, mappings, revisions and the cursor
 * become durable together, so a crash either loses the whole batch (and replays
 * it, harmlessly) or keeps the whole batch. The cursor never moves ahead of data
 * that is not yet on disk.
 */

const TABLE_TO_KIND: Record<string, SyncEntityKind> = Object.fromEntries(
  Object.entries(CLOUD_TABLE).map(([kind, table]) => [table, kind as SyncEntityKind])
) as Record<string, SyncEntityKind>;

export interface PullContext {
  transport: SyncTransport;
  now: () => number;
  /** How the cloud row becomes a local row. Injected so the engine stays shape-free. */
  /**
   * How the cloud row becomes a local row. `resolve` is supplied by the engine
   * from the IN-FLIGHT namespace, not the durable one: a batch that brings a
   * category and a task that references it must resolve the reference within
   * the same batch, or the integrity gate correctly rejects its own output.
   */
  applyRow: (
    state: AppState,
    kind: SyncEntityKind,
    localId: string,
    row: Record<string, unknown>,
    resolve: (cloudId: string | null | undefined) => string | null
  ) => AppState;
  /** How a tombstone is applied locally. Only `discovery` ever produces one. */
  applyTombstone: (state: AppState, kind: SyncEntityKind, localId: string) => AppState;
  /**
   * Whether the server row is what this device was trying to send.
   *
   * This is how an acknowledgement that was lost in transit is told apart from
   * somebody else's edit. Revision alone cannot do it: both look like "the
   * server moved past my base".
   */
  matchesLocal?: (kind: SyncEntityKind, localId: string, row: Record<string, unknown>) => boolean;
  /**
   * The local row this incoming row displaces, if any.
   *
   * A domain uniqueness rule can mean two devices legitimately decided
   * different things for the same slot -- One Move's
   * (household, profile, logical day) is the one that matters. The engine does
   * not know those rules; the caller does, and says so here so the displaced
   * intent becomes evidence rather than vanishing.
   */
  displacedBy?: (
    state: AppState,
    kind: SyncEntityKind,
    localId: string,
    row: Record<string, unknown>,
    resolve: (cloudId: string | null | undefined) => string | null
  ) => string | null;
  /** Mint a local id that is free in this namespace (SD4-006 pull side). */
  mintLocalId: (kind: SyncEntityKind, wanted: string) => string;
  batchSize?: number;
}

export type PullOutcome =
  /** Nothing new. The cursor may still have advanced past an empty range. */
  | { kind: 'upToDate'; state: AppState; namespace: SyncNamespace }
  /** A batch was applied and is ready to be made durable, cursor and all. */
  | { kind: 'applied'; state: AppState; namespace: SyncNamespace; changed: number; more: boolean }
  /** The session failed. Nothing was applied and the cursor did not move. */
  | { kind: 'paused'; detail: string }
  | { kind: 'failed'; detail: string; retriable: boolean }
  /**
   * The batch would have produced local state the app itself rejects. The
   * cursor does NOT advance and the previous durable state stands: a server
   * that returns valid SQL has not thereby earned the right to corrupt her
   * household.
   */
  | { kind: 'integrityRefused'; detail: string; namespace: SyncNamespace };

export async function pullOnce(state: AppState, namespace: SyncNamespace, ctx: PullContext): Promise<PullOutcome> {
  const limit = ctx.batchSize ?? PULL_BATCH_SIZE;
  const result = await ctx.transport.pull(namespace.cursor, limit, namespace.householdId);

  if (isFailure(result)) {
    if (result.failure === 'unauthorized') return { kind: 'paused', detail: result.detail };
    return { kind: 'failed', detail: result.detail, retriable: result.failure !== 'forbidden' };
  }

  // Everything before the barrier is settled; the barrier itself is the next
  // safe cursor. `rows` may be empty and the cursor may still move, which is
  // how a quiet period is absorbed without re-reading it forever.
  const rows = result.rows.slice(0, limit);
  const more = result.rows.length > limit;
  const nextCursor = more ? namespace.cursor : result.nextCursor;

  if (rows.length === 0) {
    return { kind: 'upToDate', state, namespace: { ...namespace, cursor: nextCursor } };
  }

  const wanted = groupByTable(rows);
  let nextState = state;
  let nextNamespace = namespace;
  let changed = 0;

  for (const [table, ids] of wanted) {
    const kind = TABLE_TO_KIND[table];
    // A table this client does not sync is not an error. change_log carries
    // everything; the matrix decides what this device is interested in.
    if (!kind) continue;

    const fetched = await ctx.transport.fetchRows(table, [...ids], IDENTITY_COLUMN[kind]);
    if (isFailure(fetched)) {
      if (fetched.failure === 'unauthorized') return { kind: 'paused', detail: fetched.detail };
      return { kind: 'failed', detail: fetched.detail, retriable: fetched.failure !== 'forbidden' };
    }

    // Oldest first. A row can point at an EARLIER row of its own kind (a correction names what it
    // supersedes, a handoff names the one before it, an undo names what it undoes), and a reference
    // only resolves once its target has been applied.
    const ordered = [...fetched.rows].sort(
      (a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.id ?? '').localeCompare(String(b.id ?? ''))
    );
    for (const row of ordered) {
      const applied = applyOne(nextState, nextNamespace, kind, row, ctx);
      nextState = applied.state;
      nextNamespace = applied.namespace;
      if (applied.changed) changed += 1;
    }

    // Rows named by change_log that did not come back are rows RLS refuses to
    // show this caller, or rows deleted outright. Either way the local side has
    // nothing to apply, and inventing something would be worse than nothing.
    const returned = new Set(fetched.rows.map((row) => cloudIdOf(kind, row)));
    for (const id of ids) {
      if (returned.has(id)) continue;
      const tombstoned = tombstoneFor(nextState, nextNamespace, kind, id, ctx);
      nextState = tombstoned.state;
      nextNamespace = tombstoned.namespace;
      if (tombstoned.changed) changed += 1;
    }
  }

  // THE INTEGRITY GATE. The candidate state has to be something the app would
  // accept from disk before the cursor is allowed past it.
  const validated = validateAppState(nextState);
  if (!validated.ok) {
    return {
      kind: 'integrityRefused',
      detail: `${validated.reason}: ${validated.issues.slice(0, 3).join('; ')}`,
      namespace,
    };
  }

  return {
    kind: 'applied',
    state: validated.state,
    namespace: { ...nextNamespace, cursor: nextCursor, lastSyncedAt: new Date(ctx.now()).toISOString() },
    changed,
    more,
  };
}

/**
 * Cloud uuid -> this device's local id, over the namespace as it stands RIGHT
 * NOW inside the batch. Built per call rather than captured, because mappings
 * grow as the batch is applied.
 */
function resolverFor(namespace: SyncNamespace): (cloudId: string | null | undefined) => string | null {
  return (cloudId) => {
    if (!cloudId) return null;
    for (const mapping of Object.values(namespace.mappings)) {
      if (mapping.cloudId === cloudId) return mapping.localId;
    }
    return null;
  };
}

/** A row's cloud identity, from whichever column carries it for that kind. */
function cloudIdOf(kind: SyncEntityKind, row: Record<string, unknown>): string {
  return String(row[IDENTITY_COLUMN[kind]] ?? '');
}

/**
 * Tables in DEPENDENCY order, not change_log order.
 *
 * A batch can carry a category and a task that points at it. Applying the task
 * first would leave its reference unresolvable inside its own batch, and the
 * integrity gate would then reject state the server had every right to send.
 */
function groupByTable(rows: readonly ChangeRow[]): Array<[string, Set<string>]> {
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    const ids = grouped.get(row.entityTable) ?? new Set<string>();
    ids.add(row.entityId);
    grouped.set(row.entityTable, ids);
  }
  return [...grouped.entries()].sort(([a], [b]) => rankOf(a) - rankOf(b) || a.localeCompare(b));
}

function rankOf(table: string): number {
  const kind = TABLE_TO_KIND[table];
  return kind ? DEPENDENCY_RANK[kind] : -1;
}

function applyOne(
  state: AppState,
  namespace: SyncNamespace,
  kind: SyncEntityKind,
  row: Record<string, unknown>,
  ctx: PullContext
): { state: AppState; namespace: SyncNamespace; changed: boolean } {
  const cloudId = cloudIdOf(kind, row);
  const serverRevision = typeof row.revision === 'number' ? row.revision : 0;
  const existing = byCloudId(namespace, kind, cloudId);

  // A soft tombstone. Only `discovery_records` has one; everything else has no
  // delete path at all, by construction.
  if (row.deleted_at !== null && row.deleted_at !== undefined) {
    if (existing === null) return { state, namespace, changed: false };
    return applyTombstoneWithGuard(state, namespace, kind, existing, serverRevision, ctx);
  }

  if (existing !== null) {
    const pending = namespace.queue.find((q) => q.kind === kind && q.localId === existing.localId);
    if (pending) {
      const base = pending.baseRevision ?? existing.revision;

      if (serverRevision <= base) {
        // The server has NOT seen this change yet. Applying the row now would
        // overwrite her unsent edit with the version it is an edit OF, which is
        // the one thing a pull must never do to pending local intent.
        return { state, namespace, changed: false };
      }

      if (ctx.matchesLocal?.(kind, existing.localId, row) === true) {
        // The server row IS what this device was sending: the push landed and
        // only the acknowledgement was lost. Settle it. A conflict here would be
        // a false one, invented against herself.
        return {
          state: ctx.applyRow(state, kind, existing.localId, row, resolverFor(namespace)),
          namespace: rememberMapping(
            { ...namespace, queue: namespace.queue.filter((q) => q.id !== pending.id) },
            { ...existing, revision: serverRevision }
          ),
          changed: true,
        };
      }

      // The server moved past her base with something else. Her intent stays
      // exactly as she left it, unapplied; the authoritative row is adopted so
      // she is looking at the truth; the disagreement is recorded. No field
      // merge, no timestamp winner.
      const at = new Date(ctx.now()).toISOString();
      const evidenced = recordEvidence(namespace, {
        id: `${pending.id}#pull-conflict#${at}`,
        evidence: 'cas-conflict',
        kind,
        localId: existing.localId,
        cloudId,
        attemptedOp: pending.op,
        baseRevision: pending.baseRevision,
        serverRevision,
        detail: `the cloud row reached revision ${serverRevision} while this change was still waiting`,
        recordedAt: at,
        resolved: false,
      });
      return {
        state: ctx.applyRow(state, kind, existing.localId, row, resolverFor(namespace)),
        namespace: rememberMapping(
          { ...evidenced, queue: evidenced.queue.filter((q) => q.id !== pending.id) },
          { ...existing, revision: serverRevision }
        ),
        changed: true,
      };
    }

    if (existing.revision === serverRevision) {
      // Already applied. A duplicate delivery is idempotent by construction.
      return { state, namespace, changed: false };
    }

    return {
      state: ctx.applyRow(state, kind, existing.localId, row, resolverFor(namespace)),
      namespace: rememberMapping(namespace, { ...existing, revision: serverRevision }),
      changed: true,
    };
  }

  // Something of hers may be displaced by this row under a domain uniqueness
  // rule. Record it BEFORE applying, so a decision that loses a race is kept as
  // evidence rather than simply disappearing from her household.
  const displaced = ctx.displacedBy?.(state, kind, '', row, resolverFor(namespace)) ?? null;
  let carried = namespace;
  if (displaced !== null) {
    const at = new Date(ctx.now()).toISOString();
    const pending = namespace.queue.find((q) => q.kind === kind && q.localId === displaced);
    carried = recordEvidence(namespace, {
      id: `displaced:${kind}:${displaced}#${at}`,
      evidence: 'domain-conflict',
      kind,
      localId: displaced,
      cloudId,
      attemptedOp: pending?.op ?? 'create',
      baseRevision: pending?.baseRevision ?? null,
      serverRevision,
      detail: 'another device already decided this, and the cloud keeps one decision',
      recordedAt: at,
      resolved: false,
    });
    if (pending) carried = { ...carried, queue: carried.queue.filter((q) => q.id !== pending.id) };
  }

  // Brand new here. SD4-006 pull side: adopt the origin local id when it is
  // free, mint a fresh one when it is not. A local id already in use for a
  // DIFFERENT cloud row is never overwritten -- that would silently replace one
  // of her rows with somebody else's.
  const wanted = String(row.local_id ?? cloudId);
  // Taken when a row of this kind already has that local id — mapped, OR waiting to be created by THIS
  // device while the incoming row came from ANOTHER: a pending create is a different entity that happened
  // to mint the same device-relative id (SD4-006). A row this device itself created and whose
  // acknowledgement was lost is not a collision; it is ours coming home.
  const fromAnotherDevice = row.origin_device_id !== undefined && row.origin_device_id !== null && String(row.origin_device_id) !== namespace.deviceId;
  const taken =
    carried.mappings[mappingKey(kind, wanted)] !== undefined ||
    (fromAnotherDevice && carried.queue.some((q) => q.kind === kind && q.localId === wanted && q.op === 'create'));
  const localId = taken ? ctx.mintLocalId(kind, wanted) : wanted;

  return {
    state: ctx.applyRow(state, kind, localId, row, resolverFor(carried)),
    namespace: rememberMapping(carried, { kind, localId, cloudId, revision: serverRevision }),
    changed: true,
  };
}

function applyTombstoneWithGuard(
  state: AppState,
  namespace: SyncNamespace,
  kind: SyncEntityKind,
  mapping: Mapping,
  serverRevision: number,
  ctx: PullContext
): { state: AppState; namespace: SyncNamespace; changed: boolean } {
  const pending = namespace.queue.find((q) => q.kind === kind && q.localId === mapping.localId);
  if (!pending) {
    return {
      state: ctx.applyTombstone(state, kind, mapping.localId),
      namespace: rememberMapping(namespace, { ...mapping, revision: serverRevision }),
      changed: true,
    };
  }

  // She changed a row that has since been removed elsewhere. Neither side wins
  // silently: the removal is authoritative, and her unsent change is kept as
  // evidence rather than deleted along with the row.
  const at = new Date(ctx.now()).toISOString();
  const evidenced = recordEvidence(namespace, {
    id: `${pending.id}#tombstone#${at}`,
    evidence: 'tombstone-conflict',
    kind,
    localId: mapping.localId,
    cloudId: mapping.cloudId,
    attemptedOp: pending.op,
    baseRevision: pending.baseRevision,
    serverRevision,
    detail: 'the cloud row was removed while this change was still waiting',
    recordedAt: at,
    resolved: false,
  });

  return {
    state: ctx.applyTombstone(state, kind, mapping.localId),
    namespace: rememberMapping(
      { ...evidenced, queue: evidenced.queue.filter((q) => q.id !== pending.id) },
      { ...mapping, revision: serverRevision }
    ),
    changed: true,
  };
}

function tombstoneFor(
  state: AppState,
  namespace: SyncNamespace,
  kind: SyncEntityKind,
  cloudId: string,
  ctx: PullContext
): { state: AppState; namespace: SyncNamespace; changed: boolean } {
  const mapping = byCloudId(namespace, kind, cloudId);
  if (mapping === null) return { state, namespace, changed: false };
  return applyTombstoneWithGuard(state, namespace, kind, mapping, mapping.revision, ctx);
}

export function byCloudId(namespace: SyncNamespace, kind: SyncEntityKind, cloudId: string): Mapping | null {
  for (const mapping of Object.values(namespace.mappings)) {
    if (mapping.kind === kind && mapping.cloudId === cloudId) return mapping;
  }
  return null;
}
