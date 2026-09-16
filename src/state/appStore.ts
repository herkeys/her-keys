import type { DataMode } from '../config/dataMode';
import { repairCatalogReferences } from '../domain/catalogReferences';
import type { TransitionContext } from '../domain/context';
import { deviceTimeZone, logicalDateAt, type LocalDate } from '../domain/logicalDay';
import { resolveOneMoveForToday } from '../domain/oneMove';
import type { HydrationStatus } from '../domain/routeAccess';
import { validateAppState, type AppState } from '../domain/state';
import type { AppStateRepository, LoadOutcome } from '../persistence/appStateRepository';
import type { InvalidReason } from '../persistence/envelope';
import { createWriteQueue } from '../persistence/writeQueue';
import { initialStateFor } from './initialState';

/**
 * The single authority for household state in a running app.
 *
 * Lifecycle: unhydrated → hydrating → ready, or recovery when stored state
 * couldn't be used. Recovery runs the same derive-and-render path as a normal
 * launch; it only differs in where the state came from.
 *
 * In-memory state is authoritative for the session. Every accepted change is
 * handed to the write queue at the moment it happens — nothing waits for the
 * app to go to the background, which a phone may never announce. Hydration
 * writes only when it had to create or repair state (a first launch, a
 * recovery, a catalog repair, or today's One Move decision); loading valid
 * state as-is writes nothing.
 *
 * Framework-free, so the whole lifecycle is testable without React.
 */

export type RecoveryReason = InvalidReason | 'future_version' | 'read_failed' | 'mode_mismatch';

export interface StoreSnapshot {
  status: HydrationStatus;
  state: AppState | null;
  today: LocalDate | null;
  recovery: { reason: RecoveryReason; quarantined: boolean } | null;
  /** Disabled for a session that must not touch stored state: newer-version data, or storage that couldn't be read. */
  persistence: 'enabled' | 'disabled';
  /** Recent changes may not be on disk. Session-only; never stored. */
  persistenceDegraded: boolean;
  diagnostics: { hydrationMs: number | null; loadOutcome: LoadOutcome['kind'] | null; repairs: string[] };
}

export type Transition = (state: AppState, ctx: TransitionContext) => AppState;

export type StoreDiagnostic =
  | { type: 'hydrated'; outcome: LoadOutcome['kind']; ms: number }
  | { type: 'saved'; seq: number; ms: number }
  | { type: 'recovered'; reason: RecoveryReason; quarantined: boolean }
  | { type: 'repaired'; repairs: string[] }
  | { type: 'persistence_degraded' };

export interface AppStore {
  getSnapshot(): StoreSnapshot;
  subscribe(listener: () => void): () => void;
  /** Loads once; calling again returns the same promise. */
  hydrate(): Promise<void>;
  /** Apply a change now and save it in the background. While a commit is saving, the change waits its turn instead of being dropped. */
  dispatch(transition: Transition): void;
  /**
   * Save a change before showing it. Commits run one after another, each
   * against the state the previous one left, and each resolves with its own
   * outcome. False means the change was not shown: both write attempts
   * failed, or the change would produce a state Her Keys refuses to store.
   */
  commit(transition: Transition): Promise<boolean>;
  /** Pick up a new logical day if midnight has passed. */
  refreshDay(): void;
  /** Resolves false when reset could destroy state this session deliberately preserved. */
  reset(): Promise<boolean>;
  flush(): Promise<void>;
  /** Stop writing for the rest of the session (used after simulating stored-state damage). */
  suspendPersistence(): void;
}

export interface AppStoreOptions {
  repository: AppStateRepository;
  mode: DataMode;
  now?: () => number;
  timeZone?: () => string;
  createId?: (prefix: string) => string;
  report?: (event: StoreDiagnostic) => void;
}

export function createAppStore(options: AppStoreOptions): AppStore {
  const now = options.now ?? Date.now;
  const timeZone = options.timeZone ?? deviceTimeZone;
  const createId = options.createId ?? sequentialIds(now);
  const report = options.report ?? (() => {});

  let snapshot: StoreSnapshot = {
    status: 'unhydrated',
    state: null,
    today: null,
    recovery: null,
    persistence: 'enabled',
    persistenceDegraded: false,
    diagnostics: { hydrationMs: null, loadOutcome: null, repairs: [] },
  };
  const listeners = new Set<() => void>();
  let hydration: Promise<void> | null = null;
  // Commits (and anything that must not interleave with one) run in order on
  // this chain. `serialized` counts work that is queued or running on it.
  let chain: Promise<unknown> = Promise.resolve();
  let serialized = 0;

  function inTurn<T>(work: () => T | Promise<T>): Promise<T> {
    serialized += 1;
    const run = chain.then(work);
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run.finally(() => {
      serialized -= 1;
    });
  }

  const queue = createWriteQueue<AppState>({
    write: async (state, seq) => {
      const started = preciseNow();
      await options.repository.saveAppState(state, seq);
      report({ type: 'saved', seq, ms: round(preciseNow() - started) });
    },
    onStatusChange: (status) => {
      if (status.degraded === snapshot.persistenceDegraded) return;
      publish({ persistenceDegraded: status.degraded });
      if (status.degraded) report({ type: 'persistence_degraded' });
    },
  });

  function publish(patch: Partial<StoreSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of [...listeners]) listener();
  }

  const contextFor = (today: LocalDate): TransitionContext => ({ nowMs: now(), today, createId });
  const todayFor = (state: AppState) => logicalDateAt(now(), state.user.timezone);
  const freshState = () => initialStateFor(options.mode, { nowMs: now(), timeZone: timeZone() });

  function persist(state: AppState): number | null {
    return snapshot.persistence === 'enabled' ? queue.enqueue(state) : null;
  }

  /**
   * Today's One Move is decided the moment there is something to decide from,
   * not only at launch or midnight — so a real household's first capture gets
   * its move without a restart. An existing decision is never touched here.
   */
  function withTodaysOneMove(next: AppState, ctx: TransitionContext): AppState {
    return next.oneMoves.some((record) => record.forDate === ctx.today) ? next : resolveOneMoveForToday(next, ctx);
  }

  function applyNow(transition: Transition): void {
    const { state, today } = snapshot;
    if (!state || !today) return;
    const ctx = contextFor(today);
    const changed = transition(state, ctx);
    if (changed === state) return;
    const next = withTodaysOneMove(changed, ctx);
    publish({ state: next });
    persist(next);
  }

  async function commitNow(transition: Transition): Promise<boolean> {
    const { state, today } = snapshot;
    if (!state || !today) return false;
    const ctx = contextFor(today);
    const changed = transition(state, ctx);
    if (changed === state) return true;
    const next = withTodaysOneMove(changed, ctx);
    // A change the store would refuse to write is refused here, before it is
    // queued — it is not a storage failure and must not look like one.
    if (!validateAppState(next).ok) return false;

    const seq = persist(next);
    // A future-version/read-failed recovery session is deliberately memory-only,
    // but must remain usable. There is no storage claim to wait for in that case.
    if (seq === null) {
      publish({ state: next });
      return true;
    }
    await queue.flush();
    if (queue.status().committedSeq !== seq) return false;
    publish({ state: next });
    return true;
  }

  async function runHydration() {
    const started = preciseNow();
    publish({ status: 'hydrating' });

    let outcome: LoadOutcome;
    try {
      outcome = await options.repository.loadAppState();
    } catch {
      outcome = { kind: 'read_failed' };
    }

    let state: AppState;
    let status: HydrationStatus = 'ready';
    let recovery: StoreSnapshot['recovery'] = null;
    let persistence: StoreSnapshot['persistence'] = 'enabled';
    let repairs: string[] = [];
    let changed = false;

    switch (outcome.kind) {
      case 'empty':
        state = freshState();
        changed = true;
        break;
      case 'loaded':
        queue.startAfter(outcome.writeSeq);
        if (outcome.state.origin !== options.mode) {
          // A build never adopts state from the other data mode. This prevents both
          // fictional data entering a real-user session and real data entering a demo session.
          state = freshState();
          status = 'recovery';
          recovery = { reason: 'mode_mismatch', quarantined: false };
          changed = true;
          if (outcome.state.origin === 'empty') {
            // Demo tooling may run on a device that holds real-user state. Show a
            // fresh demo in memory, but never replace or reset the real household.
            persistence = 'disabled';
          }
        } else {
          ({ state, repairs } = repairCatalogReferences(outcome.state));
          changed = repairs.length > 0;
        }
        break;
      case 'invalid':
        state = freshState();
        status = 'recovery';
        recovery = { reason: outcome.reason, quarantined: outcome.quarantined };
        changed = true;
        break;
      case 'future_version':
        // Newer data stays exactly where it is; this session runs in memory and writes nothing.
        state = freshState();
        status = 'recovery';
        recovery = { reason: 'future_version', quarantined: outcome.preserved };
        persistence = 'disabled';
        break;
      case 'read_failed':
        state = freshState();
        status = 'recovery';
        recovery = { reason: 'read_failed', quarantined: false };
        persistence = 'disabled';
        break;
    }

    if (persistence === 'disabled') queue.disable();

    const today = todayFor(state);
    const resolved = resolveOneMoveForToday(state, contextFor(today));
    changed ||= resolved !== state;
    state = resolved;

    const hydrationMs = round(preciseNow() - started);
    publish({
      status,
      state,
      today,
      recovery,
      persistence,
      persistenceDegraded: persistence === 'disabled',
      diagnostics: { hydrationMs, loadOutcome: outcome.kind, repairs },
    });
    if (changed) persist(state);

    report({ type: 'hydrated', outcome: outcome.kind, ms: hydrationMs });
    if (recovery) report({ type: 'recovered', ...recovery });
    if (repairs.length > 0) report({ type: 'repaired', repairs });
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    hydrate() {
      hydration ??= runHydration();
      return hydration;
    },

    dispatch(transition) {
      // While a commit is saving, its change isn't shown yet. Applying this one
      // now would be overwritten when the commit publishes, so it waits its turn.
      if (serialized > 0) {
        void inTurn(() => applyNow(transition));
        return;
      }
      applyNow(transition);
    },

    commit(transition) {
      return inTurn(() => commitNow(transition));
    },

    refreshDay() {
      const { state, today } = snapshot;
      if (!state || !today || serialized > 0) return;
      const current = todayFor(state);
      if (current === today) return;

      const next = resolveOneMoveForToday(state, contextFor(current));
      publish({ today: current, state: next });
      if (next !== state) persist(next);
    },

    reset() {
      return inTurn(async () => {
        // A memory-only recovery session must not overwrite state it is preserving.
        if (snapshot.persistence === 'disabled') return false;

        await queue.flush();
        try {
          await options.repository.resetAppState();
        } catch {
          return false;
        }
        queue.enable();

        const state = freshState();
        publish({
          status: 'ready',
          state,
          today: todayFor(state),
          recovery: null,
          persistence: 'enabled',
          persistenceDegraded: false,
          diagnostics: { ...snapshot.diagnostics, repairs: [] },
        });
        persist(state);
        await queue.flush();
        return true;
      });
    },

    flush: () => queue.flush(),

    suspendPersistence() {
      queue.disable();
      publish({ persistence: 'disabled', persistenceDegraded: true });
    },
  };
}

/** Durations use the high-resolution clock; the injected `now` stays the source of recorded timestamps. */
const preciseNow = () => globalThis.performance?.now() ?? Date.now();
const round = (ms: number) => Math.round(ms * 10) / 10;

function sequentialIds(now: () => number): (prefix: string) => string {
  let counter = 0;
  return (prefix) => {
    counter += 1;
    return `${prefix}-${now().toString(36)}-${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  };
}
