import { useCallback, useRef, useState } from 'react';
import { decideIntent } from '../../domain/authorization';
import { returnToSelf } from '../../domain/responsibility';
import type { Transition } from '../../state/appStore';
import { useAppStore } from '../../store/AppStateProvider';

export interface TodayActions {
  busy: boolean;
  /** Set when a change could not be saved. Nothing changed; she can try again. */
  note: string | null;
  /** She takes a delegated thing back. An existing domain mutation (`returnToSelf`); it tells no one anything. */
  takeBack: (responsibilityId: string) => Promise<boolean>;
  /** Her answer to something Her Keys proposed. An existing domain mutation (`decideIntent`); one answer per intent. */
  decide: (intentId: string, decision: 'approved' | 'declined') => Promise<boolean>;
}

/**
 * The only mutations the Today attention rows can make, and both are existing domain operations. They go
 * through `store.commit`, so a change is shown only once it has been saved, and a failure says so and leaves
 * everything as it was. Today invents no mutation of its own.
 */
export function useTodayActions(): TodayActions {
  const store = useAppStore();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // A second tap in the same frame would otherwise run an action twice before `busy` renders.
  const inFlight = useRef(false);

  const run = useCallback(
    async (transition: Transition): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      setNote(null);
      try {
        const saved = await store.commit(transition);
        if (!saved) setNote('Her Keys couldn’t save that yet. Nothing changed — try again.');
        return saved;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [store]
  );

  return {
    busy,
    note,
    takeBack: (responsibilityId) => run((state, ctx) => returnToSelf(state, ctx, responsibilityId)),
    decide: (intentId, decision) => run((state, ctx) => decideIntent(state, ctx, intentId, decision)),
  };
}
