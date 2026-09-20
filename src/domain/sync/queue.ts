import {
  ALLOWED_OPS,
  DEPENDENCY_RANK,
  MAX_QUEUE_ITEMS,
  MAX_UNRESOLVED_EVIDENCE,
  mappingKey,
  type EvidenceKind,
  type QueueItem,
  type SyncEntityKind,
  type SyncEvidence,
  type SyncNamespace,
  type SyncOp,
} from './syncTypes';

/**
 * THE OUTBOUND QUEUE.
 *
 * It is a WORK structure, not a history. A terminal outcome leaves the queue and
 * becomes durable evidence, so one permanently bad row can never fill the queue
 * and block every future change she makes.
 *
 * Every function here is pure: namespace in, namespace out. The caller decides
 * when that becomes durable, which is what lets the domain write and the sync
 * intent land in one persistence operation instead of two.
 */

export interface EnqueueInput {
  kind: SyncEntityKind;
  localId: string;
  op: SyncOp;
  /** The clock, injected. */
  at: string;
}

export type EnqueueResult =
  | { ok: true; namespace: SyncNamespace; item: QueueItem; coalesced: boolean }
  /**
   * The intent could not be represented durably. The caller must NOT report the
   * change as cloud-safe, and must not silently drop it either.
   */
  | { ok: false; namespace: SyncNamespace; reason: 'backlog' | 'immutable' };

/**
 * Record an intent to send one row.
 *
 * Coalescing is by (account, kind, localId) — at most one active work item per
 * logical row. A later edit before a successful push keeps the ORIGINAL base
 * revision and the ORIGINAL order, and changes nothing else, because the row
 * itself is read from canonical local state at push time. Three offline edits
 * therefore produce one CAS attempt against the revision the first edit saw,
 * not three sequential stale ones.
 */
export function enqueue(namespace: SyncNamespace, input: EnqueueInput): EnqueueResult {
  if (!ALLOWED_OPS[input.kind].includes(input.op)) {
    // An immutable entity does not become mutable because something tried. The
    // caller turns this into evidence rather than a silent no-op.
    return { ok: false, namespace, reason: 'immutable' };
  }

  const key = mappingKey(input.kind, input.localId);
  const existing = namespace.queue.find((item) => mappingKey(item.kind, item.localId) === key);

  if (existing) {
    const op = collapseOps(existing.op, input.op);
    const item: QueueItem = {
      ...existing,
      op,
      // A failed attempt is forgiven when she edits again: this is new intent,
      // not a continuation of the thing that failed.
      attempts: 0,
      lastError: null,
    };
    return {
      ok: true,
      coalesced: true,
      item,
      namespace: { ...namespace, queue: namespace.queue.map((q) => (q === existing ? item : q)) },
    };
  }

  if (namespace.queue.length >= MAX_QUEUE_ITEMS) {
    // Never evict. Existing queued intent and local state both stay exactly as
    // they are; the namespace enters backlog and says so.
    return { ok: false, namespace: { ...namespace, backlog: true }, reason: 'backlog' };
  }

  const item: QueueItem = {
    id: `${key}#${namespace.queue.length}#${input.at}`,
    kind: input.kind,
    localId: input.localId,
    op: input.op,
    baseRevision: namespace.mappings[key]?.revision ?? null,
    order: nextOrder(namespace),
    enqueuedAt: input.at,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };

  return { ok: true, coalesced: false, item, namespace: { ...namespace, queue: [...namespace.queue, item] } };
}

/**
 * How two operations on the same row combine before either has been sent.
 *
 * | pending  | incoming  | result    | why |
 * |----------|-----------|-----------|-----|
 * | create   | update    | create    | the cloud has never seen it; one create carrying the latest state |
 * | create   | tombstone | tombstone | a row created and removed offline still needs its removal recorded once it exists |
 * | update   | update    | update    | the latest local intent, against the original base revision |
 * | update   | tombstone | tombstone | the removal supersedes the edit, keeping the original base revision |
 * | tombstone| anything  | tombstone | nothing is resurrected by a later edit racing a removal |
 */
function collapseOps(pending: SyncOp, incoming: SyncOp): SyncOp {
  if (pending === 'tombstone' || incoming === 'tombstone') return 'tombstone';
  if (pending === 'create') return 'create';
  return incoming;
}

function nextOrder(namespace: SyncNamespace): number {
  return namespace.queue.reduce((max, item) => Math.max(max, item.order), -1) + 1;
}

/**
 * Work in the order it is safe to send: dependencies first, then by enqueue
 * order. Deterministic, so a replay after a crash sends the same thing in the
 * same sequence.
 */
export function scheduled(namespace: SyncNamespace): QueueItem[] {
  return [...namespace.queue].sort(
    (a, b) => DEPENDENCY_RANK[a.kind] - DEPENDENCY_RANK[b.kind] || a.order - b.order || a.id.localeCompare(b.id)
  );
}

export function findItem(namespace: SyncNamespace, kind: SyncEntityKind, localId: string): QueueItem | null {
  const key = mappingKey(kind, localId);
  return namespace.queue.find((item) => mappingKey(item.kind, item.localId) === key) ?? null;
}

/** A push landed. The work is done and leaves the queue. */
export function settle(namespace: SyncNamespace, item: QueueItem): SyncNamespace {
  return { ...namespace, queue: namespace.queue.filter((q) => q.id !== item.id) };
}

/** A retriable failure. The work stays, with the attempt counted and the reason kept. */
export function deferItem(namespace: SyncNamespace, item: QueueItem, detail: string, at: string): SyncNamespace {
  return {
    ...namespace,
    queue: namespace.queue.map((q) =>
      q.id === item.id
        ? { ...q, attempts: Math.min(q.attempts + 1, 10_000), lastAttemptAt: at, lastError: detail.slice(0, 400) }
        : q
    ),
  };
}

export interface TerminalInput {
  item: QueueItem;
  evidence: EvidenceKind;
  cloudId: string | null;
  serverRevision: number | null;
  detail: string;
  at: string;
}

/**
 * A terminal outcome. The work item leaves the queue and its story is kept as
 * evidence — so the queue stays a queue, and nothing she did is forgotten.
 *
 * At the evidence bound the namespace goes into backlog and the record is still
 * written: refusing to record an unresolved conflict would be the one failure
 * this whole structure exists to prevent.
 */
export function moveToEvidence(namespace: SyncNamespace, input: TerminalInput): SyncNamespace {
  const entry: SyncEvidence = {
    id: `${input.item.id}#${input.evidence}#${input.at}`,
    evidence: input.evidence,
    kind: input.item.kind,
    localId: input.item.localId,
    cloudId: input.cloudId,
    attemptedOp: input.item.op,
    baseRevision: input.item.baseRevision,
    serverRevision: input.serverRevision,
    detail: input.detail.slice(0, 400),
    recordedAt: input.at,
    resolved: false,
  };

  const evidence = [...namespace.evidence, entry];
  const unresolved = evidence.filter((e) => !e.resolved).length;

  return {
    ...namespace,
    queue: namespace.queue.filter((q) => q.id !== input.item.id),
    evidence,
    backlog: namespace.backlog || unresolved >= MAX_UNRESOLVED_EVIDENCE,
  };
}

/** Evidence recorded outside a queue attempt — a pull-side conflict, for instance. */
export function recordEvidence(namespace: SyncNamespace, entry: SyncEvidence): SyncNamespace {
  const evidence = [...namespace.evidence, entry];
  const unresolved = evidence.filter((e) => !e.resolved).length;
  return { ...namespace, evidence, backlog: namespace.backlog || unresolved >= MAX_UNRESOLVED_EVIDENCE };
}

/**
 * Whether new sync work may run at all.
 *
 * At the evidence bound it may not: processing more work could produce a
 * conflict that cannot be recorded durably, and an unrecordable conflict is
 * indistinguishable from a lost one.
 */
export function canAcceptWork(namespace: SyncNamespace): boolean {
  return namespace.evidence.filter((e) => !e.resolved).length < MAX_UNRESOLVED_EVIDENCE;
}
