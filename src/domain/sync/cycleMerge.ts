import type { AppState } from '../state';
import { rowOf } from './syncKinds';
import { mappingKey, type QueueItem, type SyncNamespace } from './syncTypes';

/**
 * MERGING A PUSH CYCLE INTO WHAT HAPPENED WHILE IT RAN.
 *
 * A push cycle reads the queue and the rows once, then makes network calls that take as long as they take. She keeps using the
 * app the whole time: she can edit a row the cycle has already read, or add work the cycle never saw. Replacing the durable
 * namespace with the cycle's result would silently drop that new intent, and treating an item as settled when its row has since
 * changed would leave her later edit unsent.
 *
 * The pushed CONTENT is always the basis row (that is what `pushOne` read), so:
 *
 *   - work the cycle never saw (queued after it started) is kept exactly as it is;
 *   - work the cycle finished (settled or moved to evidence) leaves the queue — unless its row has changed since the
 *     content was read, in which case the newer content still has to go, as an update from the revision the cycle just
 *     acknowledged (not the stale base, which would make her conflict with her own first edit);
 *   - work the cycle left queued (deferred) keeps the cycle's attempt bookkeeping, unless she has re-edited it, which forgives
 *     the failed attempt exactly as `enqueue` does;
 *   - mappings, evidence, cursor and hydration come from the cycle: it is their only writer.
 */

export interface Current {
  state: AppState;
  namespace: SyncNamespace;
}

export interface MergeInput {
  /** What the cycle started from: the rows it read and the queue it walked. */
  basis: Current;
  /** What the cycle produced. */
  result: SyncNamespace;
  /** What is durable NOW, after whatever she did meanwhile. */
  current: Current;
}

const keyOf = (item: Pick<QueueItem, 'kind' | 'localId'>) => mappingKey(item.kind, item.localId);

export function mergePushResult(input: MergeInput): SyncNamespace {
  const { basis, result, current } = input;

  // Nothing wrote to the queue while the cycle ran: the cycle's answer IS the answer.
  if (current.namespace === basis.namespace) return result;

  const basisByKey = new Map(basis.namespace.queue.map((item) => [keyOf(item), item]));
  const resultByKey = new Map(result.queue.map((item) => [keyOf(item), item]));
  const queue: QueueItem[] = [];

  for (const item of current.namespace.queue) {
    const key = keyOf(item);
    const seen = basisByKey.get(key);

    // Queued after the cycle started: new intent the cycle knew nothing about.
    if (seen === undefined) {
      queue.push(item);
      continue;
    }

    const after = resultByKey.get(key);
    if (after !== undefined) {
      // Still waiting. `enqueue` replaces the object when she coalesces another edit into it, so an unchanged reference means
      // "nothing new", and the cycle's bookkeeping (attempts, last error) is the truth.
      queue.push(item === seen ? { ...item, attempts: after.attempts, lastAttemptAt: after.lastAttemptAt, lastError: after.lastError } : item);
      continue;
    }

    // The cycle finished this item. Was the row it sent still the row she has?
    const sent = rowOf(basis.state, item.kind, item.localId, basis.namespace);
    const now = rowOf(current.state, item.kind, item.localId, current.namespace);
    if (sent === now) continue;

    const mapping = result.mappings[key];
    queue.push({
      ...item,
      op: item.op === 'tombstone' ? 'tombstone' : mapping === undefined ? 'create' : 'update',
      baseRevision: mapping?.revision ?? null,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
    });
  }

  return {
    ...result,
    queue,
    // A queue that filled up while the cycle ran stays flagged even though the cycle's copy did not know.
    backlog: result.backlog || current.namespace.backlog,
  };
}
