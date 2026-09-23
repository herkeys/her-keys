import type { AppState } from '../state';
import { isKeptLocal, keptMoveIds, syncToday } from './keptLocal';
import { UnresolvedReferenceError, tableFor, toCloudRow, type ProjectionContext } from './projection';
import { deferItem, moveToEvidence, scheduled, settle } from './queue';
import { rowOf } from './syncKinds';
import { isRetriable, type SyncTransport } from './transport';
import { IDENTITY_COLUMN, mappingKey, updatablePatch, type Mapping, type QueueItem, type SyncNamespace } from './syncTypes';

/**
 * THE PUSH ENGINE.
 *
 * Sends the queue, in dependency order, against the approved contracts. Its two
 * promises: nothing is treated as sent without an authoritative server
 * acknowledgement, and nothing she did is ever discarded to make a push succeed.
 */

export interface PushContext {
  state: AppState;
  householdId: string;
  profileId: string;
  deviceId: string;
  transport: SyncTransport;
  now: () => number;
}

export interface PushOutcome {
  namespace: SyncNamespace;
  pushed: number;
  conflicted: number;
  deferred: number;
  /** One Moves of a day already past that the cloud never saw, and the facts about them: kept on this device (HK13-D28). */
  keptLocal: number;
  /** Set when the session failed. The cycle stops rather than burning attempts. */
  paused: boolean;
}

export async function pushPending(namespace: SyncNamespace, ctx: PushContext): Promise<PushOutcome> {
  let current = namespace;
  let pushed = 0;
  let conflicted = 0;
  let deferred = 0;
  let keptLocal = 0;
  // Earlier days' One Moves the cloud never saw. None can gain a mapping during the pass: none is ever sent.
  const kept = keptMoveIds(ctx.state, namespace, syncToday(ctx.state, ctx.now()));

  for (const item of scheduled(namespace)) {
    // The queue is rebuilt as we go, so an item settled or moved to evidence by
    // an earlier step is not attempted again in the same pass.
    if (!current.queue.some((q) => q.id === item.id)) continue;

    const result = await pushOne(current, item, ctx, kept);
    current = result.namespace;
    if (result.outcome === 'pushed') pushed += 1;
    if (result.outcome === 'conflicted') conflicted += 1;
    if (result.outcome === 'deferred') deferred += 1;
    if (result.outcome === 'keptLocal') keptLocal += 1;
    if (result.outcome === 'paused') {
      return { namespace: current, pushed, conflicted, deferred, keptLocal, paused: true };
    }
  }

  return { namespace: current, pushed, conflicted, deferred, keptLocal, paused: false };
}

type OneOutcome = 'pushed' | 'conflicted' | 'deferred' | 'keptLocal' | 'paused';

async function pushOne(
  namespace: SyncNamespace,
  item: QueueItem,
  ctx: PushContext,
  kept: ReadonlySet<string>
): Promise<{ namespace: SyncNamespace; outcome: OneOutcome }> {
  const at = new Date(ctx.now()).toISOString();
  const projection: ProjectionContext = {
    householdId: ctx.householdId,
    profileId: ctx.profileId,
    namespace,
  };

  // An earlier day's One Move the cloud never saw, and every fact about it, stay on this device: sent now, the move would land as
  // TODAY's (the server owns the day, HR-03). History, not a failure: it leaves the queue without evidence (keptLocal.ts).
  if (isKeptLocal(item.kind, item.localId, rowOf(ctx.state, item.kind, item.localId, namespace), kept)) {
    return { namespace: settle(namespace, item), outcome: 'keptLocal' };
  }

  let row: Record<string, unknown>;
  try {
    // Read from canonical local state NOW, which is what makes coalescing work:
    // the latest intent goes out, against the base revision the first edit saw.
    row = toCloudRow(ctx.state, projection, item.kind, item.localId);
  } catch (error) {
    if (error instanceof UnresolvedReferenceError) {
      const dependency = namespace.queue.find((q) => q.id !== item.id && error.missing.includes(q.localId));
      if (dependency) {
        // The dependency is queued and ranks ahead of this. Wait for it rather
        // than sending a row whose reference cannot resolve.
        return { namespace: deferItem(namespace, item, error.message, at), outcome: 'deferred' };
      }
      // Nothing will ever resolve it. The intent becomes evidence instead of
      // spinning, and the reference is never stripped or rewritten to a local id.
      return {
        namespace: moveToEvidence(namespace, {
          item,
          evidence: 'unresolvable-dependency',
          cloudId: null,
          serverRevision: null,
          detail: error.message,
          at,
        }),
        outcome: 'conflicted',
      };
    }
    throw error;
  }

  const table = tableFor(item.kind);
  const key = mappingKey(item.kind, item.localId);
  const mapping = namespace.mappings[key] ?? null;

  // A create with a mapping already in hand is a replay of a push that landed.
  const isCreate = item.op === 'create' && mapping === null;

  if (isCreate) {
    const result = await ctx.transport.create(table, ctx.deviceId, row);

    if (result.kind === 'failure') return classify(namespace, item, result, at, null);

    // `created` and `alreadyExists` settle identically, and that is the point:
    // a lost acknowledgement must not become a second row.
    const next = rememberMapping(namespace, {
      kind: item.kind,
      localId: item.localId,
      cloudId: result.cloudId,
      revision: result.revision,
    });

    if (result.kind === 'localIdCollision') {
      // Two distinct entities that happened to mint the same device-relative id.
      // Her row has its own cloud identity now; the collision is recorded
      // because a second device's row is about to arrive wearing that local id.
      return {
        namespace: moveToEvidence(next, {
          item,
          evidence: 'identity-collision',
          cloudId: result.cloudId,
          serverRevision: result.revision,
          detail: `another install already used local id ${item.localId}; the server minted ${result.localId}`,
          at,
        }),
        outcome: 'pushed',
      };
    }

    return { namespace: settle(next, item), outcome: 'pushed' };
  }

  if (mapping === null) {
    // An update for a row the cloud has never seen. Send it as a create: the
    // server's own identity check decides whether this is new or a replay.
    const result = await ctx.transport.create(table, ctx.deviceId, row);
    if (result.kind === 'failure') return classify(namespace, item, result, at, null);
    const next = rememberMapping(namespace, {
      kind: item.kind,
      localId: item.localId,
      cloudId: result.cloudId,
      revision: result.revision,
    });
    return { namespace: settle(next, item), outcome: 'pushed' };
  }

  const base = item.baseRevision ?? mapping.revision;
  const result = await ctx.transport.update(table, mapping.cloudId, base, updatablePatch(item.kind, row), IDENTITY_COLUMN[item.kind]);

  if (result.kind === 'failure') return classify(namespace, item, result, at, mapping.cloudId);

  if (result.kind === 'stale') {
    // The server moved past our base. Her intent is preserved exactly as she
    // left it, unapplied; the authoritative row arrives on the next pull. It is
    // never re-sent against the new revision, never field-merged, never
    // resolved by timestamp.
    return {
      namespace: moveToEvidence(namespace, {
        item,
        evidence: 'cas-conflict',
        cloudId: mapping.cloudId,
        serverRevision: null,
        detail: `the cloud row moved past revision ${base}`,
        at,
      }),
      outcome: 'conflicted',
    };
  }

  if (result.kind === 'missing') {
    return {
      namespace: moveToEvidence(namespace, {
        item,
        evidence: 'tombstone-conflict',
        cloudId: mapping.cloudId,
        serverRevision: null,
        detail: 'the cloud row is gone, and this change was never applied to it',
        at,
      }),
      outcome: 'conflicted',
    };
  }

  const next = rememberMapping(namespace, { ...mapping, revision: result.revision });
  return { namespace: settle(next, item), outcome: 'pushed' };
}

function classify(
  namespace: SyncNamespace,
  item: QueueItem,
  failure: { failure: Parameters<typeof isRetriable>[0]; detail: string },
  at: string,
  cloudId: string | null
): { namespace: SyncNamespace; outcome: OneOutcome } {
  if (failure.failure === 'unauthorized') {
    // Not the work's fault. The cycle pauses; the queue is untouched so the
    // same intent resumes under the same account when the session returns.
    return { namespace, outcome: 'paused' };
  }

  if (isRetriable(failure.failure)) {
    return { namespace: deferItem(namespace, item, failure.detail, at), outcome: 'deferred' };
  }

  // Permanent. It leaves the queue so one bad row cannot block everything else,
  // and it becomes evidence so nothing she did is forgotten.
  const evidence =
    failure.failure === 'forbidden' ? 'forbidden' : failure.failure === 'domainConflict' ? 'domain-conflict' : 'validation-failure';

  return {
    namespace: moveToEvidence(namespace, {
      item,
      evidence,
      cloudId,
      serverRevision: null,
      detail: failure.detail,
      at,
    }),
    outcome: 'conflicted',
  };
}

export function rememberMapping(namespace: SyncNamespace, mapping: Mapping): SyncNamespace {
  return {
    ...namespace,
    mappings: { ...namespace.mappings, [mappingKey(mapping.kind, mapping.localId)]: mapping },
  };
}
