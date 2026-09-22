import { validateAppState, type AppState } from '../state';
import { CLOUD_TABLE, DEPENDENCY_RANK, IDENTITY_COLUMN, PULL_FETCH_CHUNK, mappingKey, type Mapping, type SyncEntityKind, type SyncNamespace } from './syncTypes';
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
    resolve: (cloudId: string | null | undefined) => string | null,
    isPending: (kind: SyncEntityKind, localId: string) => boolean
  ) => { displace: string } | { adopt: string } | null;
  /** Remove the local row `displacedBy` named. The engine has already kept her intent as conflict evidence. */
  dropLocal?: (state: AppState, kind: SyncEntityKind, localId: string) => AppState;
  /** Mint a local id that is free in this namespace (SD4-006 pull side). */
  mintLocalId: (kind: SyncEntityKind, wanted: string) => string;
  /** Ids per row-fetch request. Defaults to PULL_FETCH_CHUNK. It bounds a request, never the batch. */
  fetchChunk?: number;
}

export type PullOutcome =
  /** Nothing new. The cursor may still have advanced past an empty range. */
  | { kind: 'upToDate'; state: AppState; namespace: SyncNamespace }
  /** A batch was applied and is ready to be made durable, cursor and all. */
  | { kind: 'applied'; state: AppState; namespace: SyncNamespace; changed: number }
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

/**
 * One pull round trip, in two halves.
 *
 * FETCH is the network: it needs only the cursor and never touches state. APPLY is pure: it needs the state and namespace it is
 * applied to. They are separate so that a caller who can be edited while the network is busy applies the fetched batch to the
 * state and namespace as they are AFTER the wait, not as they were before it (see the sync runtime). `pullOnce` is their
 * composition and behaves exactly as it always did.
 */

/** One table's worth of a fetched batch. `kind` is null for a table this client does not sync. */
export interface FetchedTable {
  table: string;
  kind: SyncEntityKind | null;
  ids: string[];
  rows: Array<Record<string, unknown>>;
}

export interface FetchedBatch {
  /** The cursor to adopt once this batch is durable: the server's barrier. The batch is everything settled before it. */
  nextCursor: string;
  tables: FetchedTable[];
}

export type FetchOutcome =
  | { kind: 'fetched'; batch: FetchedBatch }
  | { kind: 'paused'; detail: string }
  | { kind: 'failed'; detail: string; retriable: boolean };

export async function fetchPullBatch(namespace: SyncNamespace, ctx: PullContext): Promise<FetchOutcome> {
  const chunk = Math.max(1, ctx.fetchChunk ?? PULL_FETCH_CHUNK);
  const result = await ctx.transport.pull(namespace.cursor, namespace.householdId);

  if (isFailure(result)) {
    if (result.failure === 'unauthorized') return { kind: 'paused', detail: result.detail };
    return { kind: 'failed', detail: result.detail, retriable: result.failure !== 'forbidden' };
  }

  // Everything before the barrier is settled and ALL of it is here; the barrier itself is the next safe cursor. `rows` may be
  // empty and the cursor may still move, which is how a quiet period is absorbed without re-reading it forever.
  //
  // The response is never cut short and the cursor never held back. The cursor is a transaction id and a claim writes a household
  // in ONE transaction, so there is no cursor value between two of its rows to stop at: a device that kept the first N rows and
  // stayed put would re-read those N forever and never hydrate a household larger than N. What is bounded is each REQUEST for
  // row bodies, below. A failure part-way through discards everything read so far (nothing was applied and the cursor did not
  // move), and the next cycle simply reads it again.
  const tables: FetchedTable[] = [];
  for (const [table, ids] of groupByTable(result.rows)) {
    const kind: FetchedTable['kind'] = TABLE_TO_KIND[table] ?? null;
    // A table this client does not sync is not an error. change_log carries
    // everything; the matrix decides what this device is interested in.
    if (kind === null) continue;

    const wanted = [...ids];
    const rows: Array<Record<string, unknown>> = [];
    for (let at = 0; at < wanted.length; at += chunk) {
      const fetched = await ctx.transport.fetchRows(table, wanted.slice(at, at + chunk), IDENTITY_COLUMN[kind]);
      if (isFailure(fetched)) {
        if (fetched.failure === 'unauthorized') return { kind: 'paused', detail: fetched.detail };
        return { kind: 'failed', detail: fetched.detail, retriable: fetched.failure !== 'forbidden' };
      }
      rows.push(...fetched.rows);
    }
    tables.push({ table, kind, ids: wanted, rows });
  }

  return { kind: 'fetched', batch: { nextCursor: result.nextCursor, tables } };
}

export type ApplyOutcome = Exclude<PullOutcome, { kind: 'paused' } | { kind: 'failed' }>;

/**
 * A durable batch completes hydration. A device that has never heard from the cloud is `unhydrated` until its first batch lands,
 * and until then it must neither render an empty household as hers nor send anything (it would create rows the cloud already
 * holds). A batch is everything the server has settled, so there is no half-hydrated state to persist; a crash mid-fetch leaves
 * the device `unhydrated` and the next launch reads it again. (`hydrating` stays a legal stored value for a server that some day
 * pages; nothing writes it today.)
 */
export function applyPullBatch(state: AppState, namespace: SyncNamespace, batch: FetchedBatch, ctx: PullContext): ApplyOutcome {
  if (batch.tables.length === 0) {
    return { kind: 'upToDate', state, namespace: { ...namespace, cursor: batch.nextCursor, hydration: 'ready' } };
  }

  let nextState = state;
  let nextNamespace = namespace;
  let changed = 0;

  for (const { table, kind, ids, rows } of batch.tables) {
    if (kind === 'member') {
      const members = applyMembers(nextState, nextNamespace, rows, ctx);
      nextState = members.state;
      nextNamespace = members.namespace;
      changed += members.changed;
      continue;
    }
    if (kind === null) continue;

    // Oldest first. A row can point at an EARLIER row of its own kind (a correction names what it
    // supersedes, a handoff names the one before it, an undo names what it undoes), and a reference
    // only resolves once its target has been applied.
    const ordered = [...rows].sort(
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
    const returned = new Set(rows.map((row) => cloudIdOf(kind, row)));
    for (const id of ids) {
      if (returned.has(id)) continue;
      const tombstoned = tombstoneFor(nextState, nextNamespace, kind, id, ctx);
      nextState = tombstoned.state;
      nextNamespace = tombstoned.namespace;
      if (tombstoned.changed) changed += 1;
    }
    void table;
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
    namespace: {
      ...nextNamespace,
      cursor: batch.nextCursor,
      hydration: 'ready',
      lastSyncedAt: new Date(ctx.now()).toISOString(),
    },
    changed,
  };
}

export async function pullOnce(state: AppState, namespace: SyncNamespace, ctx: PullContext): Promise<PullOutcome> {
  const fetched = await fetchPullBatch(namespace, ctx);
  if (fetched.kind !== 'fetched') return fetched;
  return applyPullBatch(state, namespace, fetched.batch, ctx);
}

/**
 * Children.
 *
 * A child reaches the cloud through the claim, or later through the household owner's own `create` (HK-FEATURE-05, OC-01); a device
 * never edits or removes one. A second device has to learn that a child exists, or every task, event and routine that names that
 * child arrives with a subject it cannot resolve.
 *
 * IDENTITY IS THE CLOUD ID, NEVER A NAME. A child is matched to what this device already holds by its mapping (cloud id -> local id)
 * and by nothing else, so two children who share a name are two children, and a child whose name the cloud changed is the same child.
 *
 * A child arrives under the local id it was created with when that is free here. A local id that already means something else keeps
 * its own row and the pulled child gets a fresh one: two entities are never merged because they happen to share a device-relative
 * id (SD4-006). The one exception is a row THIS device created whose acknowledgement was lost: it is ours coming home, so it is
 * ADOPTED — mapped to the local child it came from, its pending create settled — and never minted again as a second child (the
 * same rule `applyOne` applies to every other kind). Adult members are accounts, not children, and are not applied.
 */
function applyMembers(
  state: AppState,
  namespace: SyncNamespace,
  rows: Array<Record<string, unknown>>,
  ctx: PullContext
): { state: AppState; namespace: SyncNamespace; changed: number } {
  let nextState = state;
  let nextNamespace = namespace;
  let changed = 0;

  const ordered = [...rows].sort(
    (a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.id ?? '').localeCompare(String(b.id ?? ''))
  );
  for (const row of ordered) {
    if (row.member_type !== 'child') continue;
    const cloudId = String(row.id ?? '');
    const existing = byCloudId(nextNamespace, 'member', cloudId);

    const wanted = String(row.local_id ?? cloudId);
    const heldLocally = nextState.children.some((child) => child.id === wanted);
    const ownRow = row.origin_device_id !== undefined && row.origin_device_id !== null && String(row.origin_device_id) === nextNamespace.deviceId;
    // Ours coming home: this device created it, it holds that very local child, and nothing else has claimed the mapping.
    const adopts = existing === null && ownRow && heldLocally && nextNamespace.mappings[mappingKey('member', wanted)] === undefined;
    const taken =
      nextNamespace.mappings[mappingKey('member', wanted)] !== undefined ||
      nextState.user.id === wanted ||
      (heldLocally && !adopts);
    const localId = existing?.localId ?? (taken ? ctx.mintLocalId('member', wanted) : wanted);

    const child = { id: localId, displayName: String(row.display_name ?? ''), birthDate: String(row.birth_date ?? ''), scope: 'child' as const };
    const known = nextState.children.find((candidate) => candidate.id === localId);
    if (known === undefined || known.displayName !== child.displayName || known.birthDate !== child.birthDate) {
      nextState = {
        ...nextState,
        children: known === undefined ? [...nextState.children, child] : nextState.children.map((candidate) => (candidate.id === localId ? child : candidate)),
      };
      changed += 1;
    }
    // The server already holds the child, so a create still waiting for it is settled. Left in the queue it would be replayed as an
    // update, and a child has no update.
    const settled = adopts ? { ...nextNamespace, queue: nextNamespace.queue.filter((q) => !(q.kind === 'member' && q.localId === localId)) } : nextNamespace;
    nextNamespace = rememberMapping(settled, { kind: 'member', localId, cloudId, revision: typeof row.revision === 'number' ? row.revision : 1 });
  }
  return { state: nextState, namespace: nextNamespace, changed };
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
  const isPending = (k: SyncEntityKind, id: string) => namespace.queue.some((q) => q.kind === k && q.localId === id);
  // A row THIS device created, coming home after a lost acknowledgement, competes with nothing.
  const ownRow = row.origin_device_id !== undefined && row.origin_device_id !== null && String(row.origin_device_id) === namespace.deviceId;
  const encounter = ownRow ? null : (ctx.displacedBy?.(state, kind, '', row, resolverFor(namespace), isPending) ?? null);

  // The local row IS the same thing the cloud holds (the same document, the same external object, the same
  // relationship). Nothing competes: it becomes the cloud's, keeps its local id, and whatever names it keeps
  // naming it. What it was waiting to create has just been created.
  if (encounter !== null && 'adopt' in encounter) {
    const local = encounter.adopt;
    const settled = { ...namespace, queue: namespace.queue.filter((q) => !(q.kind === kind && q.localId === local && q.op === 'create')) };
    return {
      state: ctx.applyRow(state, kind, local, row, resolverFor(settled)),
      namespace: rememberMapping(settled, { kind, localId: local, cloudId, revision: serverRevision }),
      changed: true,
    };
  }

  const displaced = encounter === null ? null : encounter.displace;
  let carried = namespace;
  if (displaced !== null) {
    state = ctx.dropLocal?.(state, kind, displaced) ?? state;
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

  // Ours coming home (audit W2-06): the server already holds what THIS device tried to create, so the matching
  // pending create is settled right here — the same thing the explicit `adopt` branch above does — instead of
  // being left in the queue to be replayed next cycle as a redundant CAS update on a row nothing actually changed.
  const settled = ownRow
    ? { ...carried, queue: carried.queue.filter((q) => !(q.kind === kind && q.localId === localId && q.op === 'create')) }
    : carried;

  return {
    state: ctx.applyRow(state, kind, localId, row, resolverFor(settled)),
    namespace: rememberMapping(settled, { kind, localId, cloudId, revision: serverRevision }),
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
