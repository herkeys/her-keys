import type { AppState } from '../state';
import { pullOnce, type PullContext } from './pullEngine';
import { pushPending, type PushContext } from './pushEngine';
import { canAcceptWork } from './queue';
import {
  needsSyncAttention,
  needsSyncAttentionCount,
  type SyncNamespace,
  type SyncPhase,
} from './syncTypes';

/**
 * THE SYNC COORDINATOR.
 *
 * One named boundary decides may-I-pull, may-I-push, which account, which
 * namespace, which cursor, and what happens next. Lifecycle is a phase, not a
 * scatter of booleans, and there is exactly ONE active cycle per account
 * namespace.
 */

export interface SyncSnapshot {
  phase: SyncPhase;
  hydration: SyncNamespace['hydration'];
  lastSyncedAt: string | null;
  queued: number;
  unresolved: number;
  needsAttention: boolean;
  /** Why the last cycle stopped, when it stopped for a reason worth showing. */
  detail: string | null;
}

export type SyncTrigger = 'foreground' | 'networkRestored' | 'authRestored' | 'localMutation' | 'manual';

export interface CoordinatorOptions {
  /** The account this coordinator serves. A cycle never runs for any other. */
  accountId: string;
  /** The account the session says is active RIGHT NOW. Checked at every network boundary. */
  activeAccountId: () => string | null;
  namespace: () => SyncNamespace | null;
  state: () => AppState | null;
  /** Make the applied batch and its cursor durable, together, or not at all. */
  commit: (state: AppState, namespace: SyncNamespace) => Promise<void>;
  push: Omit<PushContext, 'state'>;
  pull: PullContext;
  householdId: string;
  profileId: string;
  now: () => number;
  onChange?: (snapshot: SyncSnapshot) => void;
  report?: (event: { type: string; detail?: string }) => void;
}

export interface SyncCoordinator {
  snapshot(): SyncSnapshot;
  /** Ask for a cycle. Concurrent asks join the one in flight; they never start a second. */
  request(trigger: SyncTrigger): Promise<SyncSnapshot>;
  /** How long to wait before the next automatic attempt, or null when there is nothing to wait for. */
  nextDelayMs(): number | null;
}

/** Bounded backoff while the app is active. No OS scheduler, no spin. */
const BACKOFF_MS = [0, 2_000, 10_000, 30_000, 120_000, 300_000] as const;

export function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

export function createSyncCoordinator(options: CoordinatorOptions): SyncCoordinator {
  let phase: SyncPhase = 'idle';
  let detail: string | null = null;
  let inFlight: Promise<SyncSnapshot> | null = null;
  /** Set when a trigger arrives mid-cycle, so the work it brought is not stranded. */
  let again = false;

  const snapshot = (): SyncSnapshot => {
    const namespace = options.namespace();
    return {
      phase,
      hydration: namespace?.hydration ?? 'unhydrated',
      lastSyncedAt: namespace?.lastSyncedAt ?? null,
      queued: namespace?.queue.length ?? 0,
      unresolved: needsSyncAttentionCount(namespace),
      needsAttention: needsSyncAttention(namespace),
      detail,
    };
  };

  const publish = (next: SyncPhase, why: string | null = null) => {
    phase = next;
    detail = why;
    options.onChange?.(snapshot());
  };

  /**
   * THE ACCOUNT GUARD. Checked before the cycle and again before each network
   * phase, because a session can change between them — and a queue item
   * executing under the wrong credentials is the one failure that cannot be
   * walked back.
   */
  const accountMatches = (): boolean => options.activeAccountId() === options.accountId;

  async function runCycle(): Promise<SyncSnapshot> {
    const namespace = options.namespace();
    const state = options.state();

    if (namespace === null || state === null) {
      publish('idle');
      return snapshot();
    }
    if (namespace.accountId !== options.accountId) {
      publish('error', 'this namespace belongs to a different account');
      return snapshot();
    }
    if (!accountMatches()) {
      publish('idle', 'the signed-in account changed');
      options.report?.({ type: 'sync.account_mismatch' });
      return snapshot();
    }
    if (!canAcceptWork(namespace)) {
      // Doing more work could produce a conflict that cannot be recorded, and an
      // unrecordable conflict is indistinguishable from a lost one.
      publish('backlog', 'there are changes waiting for you');
      return snapshot();
    }

    // --- PULL first. Reconciling before pushing means her queue is measured
    // --- against what the cloud actually holds, not what it held last time.
    publish('pulling');
    let current = namespace;
    let currentState = state;

    for (let batch = 0; batch < 50; batch += 1) {
      if (!accountMatches()) {
        publish('idle', 'the signed-in account changed');
        options.report?.({ type: 'sync.account_mismatch' });
        return snapshot();
      }

      const pulled = await pullOnce(currentState, current, options.pull);

      if (pulled.kind === 'paused') {
        publish('offline', pulled.detail);
        return snapshot();
      }
      if (pulled.kind === 'failed') {
        publish(pulled.retriable ? 'offline' : 'error', pulled.detail);
        return snapshot();
      }
      if (pulled.kind === 'integrityRefused') {
        // The cursor stays exactly where it was. Replaying a bad batch forever
        // is better than persisting a household that does not add up.
        publish('error', 'some cloud changes could not be applied safely');
        options.report?.({ type: 'sync.integrity_refused', detail: pulled.detail });
        return snapshot();
      }
      if (pulled.kind === 'upToDate') {
        if (pulled.namespace.cursor !== current.cursor) {
          await options.commit(pulled.state, pulled.namespace);
        }
        current = pulled.namespace;
        currentState = pulled.state;
        break;
      }

      // Durable BEFORE the loop continues: state, mappings, revisions and cursor
      // in one operation. A crash before this replays the batch; a crash after
      // it never reapplies it.
      await options.commit(pulled.state, pulled.namespace);
      current = pulled.namespace;
      currentState = pulled.state;
      if (!pulled.more) break;
    }

    // --- PUSH what is left and not conflicted.
    if (current.queue.length > 0) {
      if (!accountMatches()) {
        publish('idle', 'the signed-in account changed');
        options.report?.({ type: 'sync.account_mismatch' });
        return snapshot();
      }

      publish('pushing');
      const result = await pushPending(current, { ...options.push, state: currentState });
      current = result.namespace;
      await options.commit(currentState, current);

      if (result.paused) {
        publish('offline', 'signed out while syncing');
        return snapshot();
      }
    }

    if (needsSyncAttention(current)) {
      publish('conflicted', 'some changes need your attention');
    } else if (current.queue.length > 0) {
      publish('offline', 'not everything has reached the cloud yet');
    } else {
      publish('idle');
    }
    return snapshot();
  }

  return {
    snapshot,

    request(trigger) {
      options.report?.({ type: 'sync.trigger', detail: trigger });
      if (inFlight) {
        // Join, never start a second. The flag makes sure work that arrived
        // during this cycle gets its own pass rather than being dropped.
        again = true;
        return inFlight;
      }

      const run = (async () => {
        try {
          let result = await runCycle();
          while (again) {
            again = false;
            result = await runCycle();
          }
          return result;
        } finally {
          inFlight = null;
          again = false;
        }
      })();

      inFlight = run;
      return run;
    },

    nextDelayMs() {
      const namespace = options.namespace();
      if (namespace === null || namespace.queue.length === 0) return null;
      const attempts = namespace.queue.reduce((max, item) => Math.max(max, item.attempts), 0);
      return backoffFor(attempts);
    },
  };
}
