import type { AppState } from '../state';
import { mergePushResult, type Current } from './cycleMerge';
import { applyPullBatch, fetchPullBatch, type ApplyOutcome, type PullContext } from './pullEngine';
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

/**
 * How the coordinator touches durable state.
 *
 * A cycle spends most of its time waiting on the network, and she keeps using the app meanwhile. A coordinator that derives a
 * new state from the one it read at the start and then REPLACES the durable state with it would silently discard whatever she
 * did during the wait. So every step that changes state is expressed as work against the state and namespace as they are AT THE
 * MOMENT it runs, executed exclusively, and made durable together.
 */
export interface SyncTurn {
  /** The state and namespace as they are right now, or null before the household has loaded. */
  current(): Current | null;
  /**
   * Run `work` against the CURRENT state and namespace, exclusively, and make what it returns durable in one write.
   * `null` means nothing needs writing. Resolves false when the write could not be made durable.
   */
  apply(work: (current: Current) => Current | null): Promise<boolean>;
}

export interface CoordinatorOptions {
  /** The account this coordinator serves. A cycle never runs for any other. */
  accountId: string;
  /** The account the session says is active RIGHT NOW. Checked at every network boundary. */
  activeAccountId: () => string | null;
  namespace: () => SyncNamespace | null;
  state: () => AppState | null;
  /** Make the applied batch and its cursor durable, together, or not at all. */
  commit: (state: AppState, namespace: SyncNamespace) => Promise<void>;
  /**
   * Optional. When another writer exists (the app itself), the composition supplies this so nothing is derived from a stale
   * read. Without it, the coordinator reads `state()`/`namespace()` and writes through `commit` — correct only when nothing
   * else writes while a cycle runs.
   */
  turn?: SyncTurn;
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

  const turn: SyncTurn = options.turn ?? {
    current() {
      const state = options.state();
      const namespace = options.namespace();
      return state === null || namespace === null ? null : { state, namespace };
    },
    async apply(work) {
      const current = this.current();
      if (current === null) return false;
      const next = work(current);
      if (next !== null) await options.commit(next.state, next.namespace);
      return true;
    },
  };

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
    const start = turn.current();

    if (start === null) {
      publish('idle');
      return snapshot();
    }
    if (start.namespace.accountId !== options.accountId) {
      publish('error', 'this namespace belongs to a different account');
      return snapshot();
    }
    if (!accountMatches()) {
      publish('idle', 'the signed-in account changed');
      options.report?.({ type: 'sync.account_mismatch' });
      return snapshot();
    }
    if (!canAcceptWork(start.namespace)) {
      // Doing more work could produce a conflict that cannot be recorded, and an
      // unrecordable conflict is indistinguishable from a lost one.
      publish('backlog', 'there are changes waiting for you');
      return snapshot();
    }

    // --- PULL first. Reconciling before pushing means her queue is measured
    // --- against what the cloud actually holds, not what it held last time.
    publish('pulling');

    // ONE pull. It is complete for its range (see PullResult), so there is no "next batch" to loop for: anything that settles while
    // this cycle runs is the next cycle's, and the cursor already sits at the barrier this one read to.
    {
      if (!accountMatches()) {
        publish('idle', 'the signed-in account changed');
        options.report?.({ type: 'sync.account_mismatch' });
        return snapshot();
      }

      const before = turn.current();
      if (before === null) {
        publish('idle');
        return snapshot();
      }

      // The network half. It needs only the cursor: nothing here is derived from state that may be stale by the time it lands.
      const fetched = await fetchPullBatch(before.namespace, options.pull);

      if (fetched.kind === 'paused') {
        publish('offline', fetched.detail);
        return snapshot();
      }
      if (fetched.kind === 'failed') {
        publish(fetched.retriable ? 'offline' : 'error', fetched.detail);
        return snapshot();
      }

      // The pure half, against the state and namespace as they are NOW. Durable BEFORE the loop continues: state, mappings,
      // revisions and cursor in one operation. A crash before this replays the batch; a crash after it never reapplies it.
      let applied: ApplyOutcome | null = null as ApplyOutcome | null;
      const wrote = await turn.apply((current) => {
        applied = applyPullBatch(current.state, current.namespace, fetched.batch, options.pull);
        if (applied.kind === 'integrityRefused') return null;
        if (
          applied.kind === 'upToDate' &&
          applied.namespace.cursor === current.namespace.cursor &&
          applied.namespace.hydration === current.namespace.hydration
        ) {
          return null;
        }
        return { state: applied.state, namespace: applied.namespace };
      });

      const outcome = applied as ApplyOutcome | null;
      if (outcome === null) {
        publish('idle');
        return snapshot();
      }
      if (outcome.kind === 'integrityRefused') {
        // The cursor stays exactly where it was. Replaying a bad batch forever
        // is better than persisting a household that does not add up.
        publish('error', 'some cloud changes could not be applied safely');
        options.report?.({ type: 'sync.integrity_refused', detail: outcome.detail });
        return snapshot();
      }
      if (!wrote) {
        publish('error', 'the household could not be saved');
        return snapshot();
      }
    }

    // --- PUSH what is left and not conflicted.
    const basis = turn.current();
    if (basis === null) {
      publish('idle');
      return snapshot();
    }

    if (basis.namespace.queue.length > 0) {
      if (!accountMatches()) {
        publish('idle', 'the signed-in account changed');
        options.report?.({ type: 'sync.account_mismatch' });
        return snapshot();
      }

      publish('pushing');
      const result = await pushPending(basis.namespace, { ...options.push, state: basis.state });
      // She may have edited while the network was busy. Merge what the cycle did into what is durable now.
      await turn.apply((current) => ({ state: current.state, namespace: mergePushResult({ basis, result: result.namespace, current }) }));

      if (result.paused) {
        publish('offline', 'signed out while syncing');
        return snapshot();
      }
    }

    const finished = turn.current()?.namespace ?? basis.namespace;
    if (needsSyncAttention(finished)) {
      publish('conflicted', 'some changes need your attention');
    } else if (finished.queue.length > 0) {
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
