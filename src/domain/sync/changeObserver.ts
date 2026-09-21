import type { IdentityRecord } from '../account/binding';
import type { AppState } from '../state';
import { changedRows, queueIntents } from './changeBridge';

/**
 * THE OBSERVER THE STORE CALLS ON EVERY CANONICAL STATE CHANGE.
 *
 * Features mutate canonical state and know nothing about synchronization. This is the one place that notices a change and records
 * the intent to transport it: it turns the difference between the previous and the next state into queue work and returns the
 * identity block that carries it. The store persists that identity with the state in ONE envelope write, so a change and the
 * intent to send it are durable together or not at all.
 *
 * What it will NOT do, on purpose:
 *   - a demo household never syncs (the fictional data must not become an account's data);
 *   - an unbound household has no queue to write to;
 *   - it never touches the network, a timer other than the nudge below, or the state itself.
 *
 * It must be pure and cheap: only collections whose reference changed are walked (see `changedRows`).
 */

export interface ChangeObserver {
  /** Structurally a `StateObserver`: hand this to `createAppStore({ observe })`. */
  observe(change: { previous: AppState; next: AppState; identity: IdentityRecord }): IdentityRecord;
  /** Called after intent was queued, so the runtime can nudge a cycle. Only the latest listener is kept. */
  onQueued(listener: (() => void) | null): void;
  /** Rows the bounded queue could not take since the last read (a diagnostic; the namespace is already flagged `backlog`). */
  overflowed(): number;
}

export function createChangeObserver(deps: { now: () => number }): ChangeObserver {
  let listener: (() => void) | null = null;
  let overflow = 0;

  return {
    observe({ previous, next, identity }) {
      if (previous === next) return identity;
      // Fiction never syncs.
      if (next.origin !== 'empty') return identity;
      const namespace = identity.sync;
      if (identity.binding === null || namespace === null || namespace.accountId !== identity.binding.accountId) return identity;

      const intents = changedRows(previous, next, namespace);
      if (intents.length === 0) return identity;

      const queued = queueIntents(namespace, intents, new Date(deps.now()).toISOString());
      overflow += queued.overflow.length;
      if (queued.namespace === namespace) return identity;

      if (queued.queued > 0) listener?.();
      return { ...identity, sync: queued.namespace };
    },

    onQueued(next) {
      listener = next;
    },

    overflowed() {
      const seen = overflow;
      overflow = 0;
      return seen;
    },
  };
}
