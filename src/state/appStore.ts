import type { DataMode } from '../config/dataMode';
import { repairCatalogReferences } from '../domain/catalogReferences';
import type { TransitionContext } from '../domain/context';
import { deviceTimeZone, logicalDateAt, type LocalDate } from '../domain/logicalDay';
import { resolveOneMoveForToday } from '../domain/oneMove';
import type { HydrationStatus } from '../domain/routeAccess';
import type { AppState } from '../domain/state';
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
  /** Apply a change now and save it in the background. */
  dispatch(transition: Transition): void;
  /** Save a change before showing it — for moments like finishing onboarding. Never waits past one retry. */
  commit(transition: Transition): Promise<void>;
  /** Pick up a new logical day if midnight has passed. */
  refreshDay(): void;
  /** Resolves false when a reset isn't allowed (this session holds a newer app's data). */
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
  let committing: Promise<void> | null = null;

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

  function persist(state: AppState) {
    if (snapshot.persistence === 'enabled') queue.enqueue(state);
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
        if (outcome.state.origin === 'demo' && options.mode === 'empty') {
          // A build for real users never shows the fictional household, even if a demo build ran before it.
          state = freshState();
          status = 'recovery';
          recovery = { reason: 'mode_mismatch', quarantined: false };
          changed = true;
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
      const { state, today } = snapshot;
      if (!state || !today || committing) return;
      const next = transition(state, contextFor(today));
      if (next === state) return;
      publish({ state: next });
      persist(next);
    },

    commit(transition) {
      if (committing) return committing;
      const { state, today } = snapshot;
      if (!state || !today) return Promise.resolve();
      const next = transition(state, contextFor(today));
      if (next === state) return Promise.resolve();

      committing = (async () => {
        persist(next);
        await queue.flush();
        publish({ state: next });
      })().finally(() => {
        committing = null;
      });
      return committing;
    },

    refreshDay() {
      const { state, today } = snapshot;
      if (!state || !today || committing) return;
      const current = todayFor(state);
      if (current === today) return;

      const next = resolveOneMoveForToday(state, contextFor(current));
      publish({ today: current, state: next });
      if (next !== state) persist(next);
    },

    async reset() {
      // A session holding a newer app's data must not overwrite it, even on request.
      if (snapshot.recovery?.reason === 'future_version') return false;

      await queue.flush();
      await options.repository.resetAppState();
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
