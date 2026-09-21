import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TransitionContext } from '../../domain/context';
import type { AppState } from '../../domain/state';
import { useAppStore, useStoreSnapshot } from '../../store/AppStateProvider';
import { REFUSAL_COPY, type CopyContext } from './copy';
import { buildHomeView } from './model/buildHomeView';
import { commitHomeChange, type HomeChange } from './model/mutations';
import { homeReadiness, homeScreenState } from './model/readiness';

/**
 * The Home projection for a screen. It reads the store SNAPSHOT (not just the household), so loading and recovery are known here;
 * the projection is rebuilt when canonical state changes and once a minute (for the two facts that legitimately move with the
 * clock: a visit being under way or over, and a request passing the time an answer was due).
 */
export function useHomeView() {
  const snapshot = useStoreSnapshot();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const readiness = homeReadiness(snapshot);
  const state = snapshot.state;
  const view = useMemo(() => (readiness.settled && state !== null ? buildHomeView(state, Date.now()) : null), [state, readiness.settled, tick]);
  const screen = homeScreenState(readiness, view);
  const copyContext: CopyContext | null = view === null || state === null ? null : { today: view.today, timeZone: state.user.timezone };
  return { readiness, view, screen, copyContext, state };
}

/** Run one Home change through the production store, one at a time, reporting a refusal in words and never as "saved". */
export function useHomeCommit() {
  const store = useAppStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A second tap in the same frame would otherwise start a second save before `busy` renders.
  const inFlight = useRef(false);

  const run = useCallback(
    async (work: (state: AppState, ctx: TransitionContext) => HomeChange): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      const result = await commitHomeChange(store, work);
      inFlight.current = false;
      setBusy(false);
      if (!result.ok) {
        setError(REFUSAL_COPY[result.reason]);
        return false;
      }
      return true;
    },
    [store]
  );

  return { run, busy, error, clearError: () => setError(null) };
}
