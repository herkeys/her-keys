import type { AccountState } from '../account/authState';
import type { IdentityRecord } from '../account/binding';
import type { AppState } from '../state';
import { applyCloudRow, applyCloudTombstone } from './apply';
import { seedNamespace, topUpQueue } from './changeBridge';
import { namespaceFromClaim } from './claimSeam';
import { createSyncCoordinator, type SyncCoordinator, type SyncSnapshot, type SyncTrigger, type SyncTurn } from './coordinator';
import { displacedBy, dropLocal, rowMatchesLocal } from './domainRules';
import type { SyncTransport } from './transport';

/**
 * THE SYNC RUNTIME — the account-backed synchronization lifecycle, composed once.
 *
 * Binding an account is not the same as synchronizing. This owns the difference: it turns "the account became durably bound"
 * into "exactly one coordinator is operating for that account", and turns every other account state into "none is".
 *
 *   ACCOUNT BECOMES BOUND  -> a coordinator is constructed for that account and household, the namespace is reconciled
 *                             (unclaimed rows queued, the server-created onboarding row adopted), and a cycle is requested.
 *   ACCOUNT STAYS BOUND    -> nothing is constructed again. The same session applied twice, a repeated callback, a resume after a
 *                             restart: still one coordinator.
 *   ANYTHING ELSE          -> the coordinator is dropped, its timers cancelled, and any cycle still in flight can neither
 *                             commit nor keep uploading (its generation is stale and the account guard refuses).
 *
 * Canonical changes reach the queue through the store's observer, not through this file, and nothing here is feature-specific.
 */

/** What the runtime needs of the household store. Structural, so the domain does not import the store. */
export interface SyncStoreAccess {
  getSnapshot(): { state: AppState | null; identity: IdentityRecord; persistence: 'enabled' | 'disabled' };
  applySync(
    work: (current: { state: AppState; identity: IdentityRecord }) => { state: AppState; identity: IdentityRecord } | null
  ): Promise<boolean>;
}

export interface SyncRuntimeDeps {
  store: SyncStoreAccess;
  transport: SyncTransport;
  /** The account the session says is signed in and usable RIGHT NOW (null when signed out, degraded or switching). */
  activeAccountId: () => string | null;
  now: () => number;
  /** A fresh uuid for an install that has none recorded. */
  newDeviceId: () => string;
  /** Deferred work. Injected so tests own time; production passes setTimeout. Returns a canceller. */
  schedule?: (work: () => void, ms: number) => () => void;
  /** How long a burst of local edits settles before one cycle is requested. */
  debounceMs?: number;
  report?: (event: { type: string; detail?: string }) => void;
  onChange?: (snapshot: SyncSnapshot | null) => void;
}

export interface SyncRuntime {
  /** Called on EVERY account state change. Idempotent. */
  onAccountState(state: AccountState): void;
  /** Called when local canonical work was queued, so a cycle is requested after a short settle. */
  noteLocalMutation(): void;
  /** Ask for a cycle now (app foreground, manual retry). Null when nothing is running. */
  request(trigger: SyncTrigger): Promise<SyncSnapshot | null>;
  snapshot(): SyncSnapshot | null;
  running(): { accountId: string; householdId: string } | null;
  stop(): void;
  /** Resolves when no start-up or requested cycle is still running. For tests and diagnostics; nothing awaits it in the app. */
  idle(): Promise<void>;
  /** How many coordinators this runtime has ever built. More than one running at once is impossible; this proves it stayed cheap. */
  constructed(): number;
}

/** Rounds of "top up the queue, then drain it" one request may run. Each round can move a full queue's worth of rows. */
const MAX_ROUNDS = 100;

const defaultSchedule = (work: () => void, ms: number): (() => void) => {
  const handle = setTimeout(work, ms);
  return () => clearTimeout(handle);
};

interface Active {
  accountId: string;
  householdId: string;
  deviceId: string;
  generation: number;
  coordinator: SyncCoordinator;
}

export function createSyncRuntime(deps: SyncRuntimeDeps): SyncRuntime {
  const schedule = deps.schedule ?? defaultSchedule;
  const debounceMs = deps.debounceMs ?? 400;
  const report = (type: string, detail?: string) => deps.report?.({ type, detail });

  let active: Active | null = null;
  let generation = 0;
  let built = 0;
  let cancelRetry: (() => void) | null = null;
  let cancelMutation: (() => void) | null = null;
  const pending = new Set<Promise<unknown>>();
  const track = <T>(work: Promise<T>): Promise<T> => {
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => undefined);
    return work;
  };
  const iso = () => new Date(deps.now()).toISOString();

  const clearTimers = () => {
    cancelRetry?.();
    cancelMutation?.();
    cancelRetry = null;
    cancelMutation = null;
  };

  /** Whether `a` is still the runtime's live coordinator for the account the identity is bound to. */
  const owns = (a: Active, identity: IdentityRecord): boolean =>
    active === a &&
    a.generation === generation &&
    identity.binding !== null &&
    identity.binding.accountId === a.accountId &&
    identity.sync !== null &&
    identity.sync.accountId === a.accountId;

  function build(a: Omit<Active, 'coordinator'>): SyncCoordinator {
    const turn: SyncTurn = {
      current: () => {
        const snapshot = deps.store.getSnapshot();
        const namespace = snapshot.identity.sync;
        return snapshot.state === null || namespace === null ? null : { state: snapshot.state, namespace };
      },
      apply: (work) =>
        deps.store.applySync(({ state, identity }) => {
          // A coordinator that has been replaced or stopped must not write: its view of the account is over.
          if (active === null || active.generation !== a.generation || !owns(active, identity)) return null;
          const next = work({ state, namespace: identity.sync as NonNullable<typeof identity.sync> });
          return next === null ? null : { state: next.state, identity: { ...identity, sync: next.namespace } };
        }),
    };

    return createSyncCoordinator({
      accountId: a.accountId,
      activeAccountId: () => deps.activeAccountId(),
      namespace: () => deps.store.getSnapshot().identity.sync,
      state: () => deps.store.getSnapshot().state,
      // Never used: every write goes through `turn`, against the state as it is when the write happens.
      commit: async () => {
        throw new Error('sync writes go through the store turn');
      },
      turn,
      householdId: a.householdId,
      profileId: a.accountId,
      now: deps.now,
      push: { householdId: a.householdId, profileId: a.accountId, deviceId: a.deviceId, transport: deps.transport, now: deps.now },
      pull: {
        transport: deps.transport,
        now: deps.now,
        applyRow: applyCloudRow,
        applyTombstone: applyCloudTombstone,
        // Read in the turn, so it compares against exactly the state the batch is being applied to.
        matchesLocal: (kind, localId, row) => {
          const snapshot = deps.store.getSnapshot();
          const namespace = snapshot.identity.sync;
          if (snapshot.state === null || namespace === null) return false;
          return rowMatchesLocal(snapshot.state, { householdId: a.householdId, profileId: a.accountId, namespace }, kind, localId, row);
        },
        displacedBy: (state, kind, localId, row, resolve, isPending) => displacedBy(state, kind, localId, row, resolve, isPending),
        dropLocal: (state, kind, localId) => dropLocal(state, kind, localId),
        // A minted local id must itself be a legal local id: letters, digits and `._:-` only.
        mintLocalId: (_kind, wanted) => `${wanted}-x${a.deviceId.replace(/-/g, '').slice(0, 6)}`,
      },
      report: (event) => deps.report?.(event),
      onChange: (snapshot) => deps.onChange?.(snapshot),
    });
  }

  /**
   * The namespace this account's coordinator will work from. A household bound by a build that predates this runtime has a
   * binding (and its id map) but may have no queue seed and no onboarding adoption; that is reconciled here, once, durably,
   * so the first cycle can neither strand her content nor overwrite it.
   */
  async function reconcile(a: Active): Promise<void> {
    await deps.store.applySync(({ state, identity }) => {
      if (!owns(a, identity) && !(active === a && identity.binding !== null && identity.binding.accountId === a.accountId)) return null;
      const binding = identity.binding as NonNullable<typeof identity.binding>;

      let namespace = identity.sync;
      // A device that has not yet heard from the cloud is hydrated by its first pull. Seeding it now would queue creates for rows
      // the cloud already holds (its own starter categories, for one), so nothing is reconciled until hydration is done.
      if (namespace !== null && namespace.hydration !== 'ready') return null;
      if (namespace === null) {
        // Bound, but the namespace was never written: rebuild it from the claim's own id map, exactly as claim would have.
        namespace = namespaceFromClaim({
          state,
          accountId: a.accountId,
          householdId: a.householdId,
          deviceId: a.deviceId,
          idMap: binding.idMap,
          seed: { at: iso(), carried: new Set(Object.keys(binding.idMap)) },
        });
        return { state, identity: { ...identity, sync: namespace } };
      }
      if (!Object.values(namespace.mappings).some((mapping) => mapping.kind === 'onboarding')) {
        const seeded = seedNamespace({ state, namespace, accountId: a.accountId, at: iso(), carried: new Set(Object.keys(binding.idMap)) });
        return seeded === namespace ? null : { state, identity: { ...identity, sync: seeded } };
      }
      return null;
    });
  }

  /** Queue whatever exists locally and the cloud has never been told about. Returns how many rows it added. */
  async function topUp(a: Active): Promise<number> {
    let added = 0;
    await deps.store.applySync(({ state, identity }) => {
      if (!owns(a, identity)) return null;
      const namespace = identity.sync as NonNullable<typeof identity.sync>;
      if (namespace.hydration !== 'ready') return null;
      const result = topUpQueue(state, namespace, iso());
      added = result.queued;
      return result.namespace === namespace ? null : { state, identity: { ...identity, sync: result.namespace } };
    });
    return added;
  }

  function scheduleRetry(a: Active, snapshot: SyncSnapshot | null) {
    cancelRetry?.();
    cancelRetry = null;
    if (active !== a || snapshot === null || snapshot.phase !== 'offline') return;
    const delay = a.coordinator.nextDelayMs();
    if (delay === null) return;
    cancelRetry = schedule(() => {
      cancelRetry = null;
      if (active === a) void track(runtime.request('networkRestored'));
    }, Math.max(delay, 1_000));
  }

  function start(accountId: string, householdId: string) {
    // Exactly once: the same account and household already have a live coordinator.
    if (active !== null && active.accountId === accountId && active.householdId === householdId) return;
    stop();

    const snapshot = deps.store.getSnapshot();
    const identity = snapshot.identity;
    if (snapshot.state === null) return;
    if (snapshot.persistence !== 'enabled') {
      // A memory-only session cannot make queue intent durable, so it must not pretend to sync.
      report('sync.not_started', 'this session cannot write to storage');
      return;
    }
    if (identity.binding === null || identity.binding.accountId !== accountId || identity.binding.householdId !== householdId) {
      report('sync.not_started', 'the household is not bound to this account');
      return;
    }
    if (snapshot.state.origin !== 'empty') {
      report('sync.not_started', 'a demo household never syncs');
      return;
    }

    generation += 1;
    built += 1;
    const deviceId = identity.sync?.deviceId ?? deps.newDeviceId();
    const partial = { accountId, householdId, deviceId, generation };
    const a: Active = { ...partial, coordinator: build(partial) };
    active = a;
    report('sync.started', accountId);

    void track(
      (async () => {
        try {
          await reconcile(a);
          if (active === a) await runtime.request('authRestored');
        } catch (error) {
          report('sync.start_failed', error instanceof Error ? error.message : String(error));
        }
      })()
    );
  }

  function stop() {
    clearTimers();
    if (active !== null) report('sync.stopped', active.accountId);
    active = null;
    // Invalidates any cycle still in flight: it can no longer write, and the account guard stops its next network step.
    generation += 1;
    deps.onChange?.(null);
  }

  const runtime: SyncRuntime = {
    onAccountState(state) {
      if (state.kind === 'accountBound') start(state.session.accountId, state.householdId);
      else if (active !== null) stop();
    },

    noteLocalMutation() {
      const a = active;
      if (a === null) return;
      cancelMutation?.();
      cancelMutation = schedule(() => {
        cancelMutation = null;
        if (active === a) void track(runtime.request('localMutation'));
      }, debounceMs);
    },

    async request(trigger) {
      const a = active;
      if (a === null) return null;

      let snapshot: SyncSnapshot | null = null;
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        if (active !== a) return snapshot;
        await topUp(a);
        if (active !== a) return snapshot;
        snapshot = await a.coordinator.request(round === 0 ? trigger : 'localMutation');
        if (snapshot.phase !== 'idle' || active !== a) break;
        // The cycle drained the queue, which makes room for rows the queue ceiling held back, and a first pull that has just
        // finished makes local rows queueable at all. Look again AFTER the cycle: stopping here would leave a household bigger
        // than the ceiling half-sent until some later trigger happened to come along.
        if ((await topUp(a)) === 0) break;
      }
      scheduleRetry(a, snapshot);
      return snapshot;
    },

    snapshot: () => active?.coordinator.snapshot() ?? null,
    running: () => (active === null ? null : { accountId: active.accountId, householdId: active.householdId }),
    stop,
    async idle() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    constructed: () => built,
  };

  return runtime;
}
