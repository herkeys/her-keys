import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { TransitionContext } from '../../../domain/context';
import type { AppState as HouseholdState } from '../../../domain/state';
import { useAppStore } from '../../../store/AppStateProvider';
import { createSaveGuard } from '../guard';
import { commitMutation, type MutationResult } from '../mutations';
import { outcomeMessage } from './actions';
import type { AreaError } from './parts';

/**
 * "Now", re-read every `intervalMs` and whenever the app comes back to the foreground, so "Today", "Tomorrow" and "Happening now" are
 * never left describing a moment that has passed.
 */
export function useNowMs(intervalMs: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setNowMs(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [intervalMs]);
  return nowMs;
}

export type Transition<O extends string> = (state: HouseholdState, ctx: TransitionContext) => MutationResult<O>;

export interface RunResult<O extends string> {
  /** `saved`, a named refusal from the mutation, or `not_saved` when the store itself could not write. */
  outcome: O | 'saved' | 'not_saved';
  id: string | null;
}

/**
 * Runs one mutation through the store and reports its NAMED outcome; only `saved` is a success. A second tap while one is in flight
 * is ignored and returns null: the save guard is a closure over one flag, so it holds in the same frame, before `busy` has rendered.
 * A store failure is reported as `not_saved` — never as a success, and never as a crash that leaves the screen stuck busy.
 */
export function useMutationRunner() {
  const store = useAppStore();
  const [guard] = useState(createSaveGuard);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <O extends string>(transition: Transition<O>): Promise<RunResult<O> | null> => {
      const attempt = await guard.run(async (): Promise<RunResult<O>> => {
        setBusy(true);
        try {
          return await commitMutation<O | 'saved'>(store, transition, ['saved']);
        } catch {
          return { outcome: 'not_saved', id: null };
        } finally {
          setBusy(false);
        }
      });
      return attempt.ran ? attempt.value : null;
    },
    [guard, store]
  );

  return { run, busy };
}

/**
 * For the buttons on a detail screen: runs one mutation and, when it is refused, keeps the sentence for it against the part of the
 * screen the tap came from. `onSaved` runs only after a real success.
 */
export function useAreaAttempt() {
  const { run, busy } = useMutationRunner();
  const [error, setError] = useState<AreaError | null>(null);

  const attempt = useCallback(
    async (area: AreaError['area'], transition: Transition<string>, onSaved?: () => void) => {
      setError(null);
      const result = await run(transition);
      if (result === null) return;
      if (result.outcome === 'saved') onSaved?.();
      else setError({ area, text: outcomeMessage(result.outcome) });
    },
    [run]
  );

  return { attempt, busy, error };
}
