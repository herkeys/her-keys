import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useAppStore, useStoreSnapshot } from '../../../store/AppStateProvider';
import { createCaptureCoordinator, type CaptureCoordinator } from './coordinator';
import { localInterpreter } from './port';
import { createMemoryCaptureTextStore, pruneOrphans, type CaptureTextStore } from './textStore';
import { buildCaptureVM, buildLifeInbox, type CaptureVM, type LifeInboxVM } from './viewModel';

/**
 * Wires the capture coordinator to the running app. Mounted INSIDE the existing Talk It Out provider, so
 * no root layout, shell or navigation file changes for it to exist.
 *
 * The held words live in this provider's memory and nowhere else (ledger OD-1).
 */

interface CaptureContextValue {
  coordinator: CaptureCoordinator;
  text: CaptureTextStore;
  /** The one clock this feature reads. The app passes nothing (wall clock); a test can pass its own. */
  now: () => number;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children, now = Date.now }: { children: ReactNode; now?: () => number }) {
  const store = useAppStore();
  const value = useMemo<CaptureContextValue>(() => {
    const text = createMemoryCaptureTextStore();
    return { text, now, coordinator: createCaptureCoordinator({ store, interpreter: localInterpreter, text, now }) };
  }, [store, now]);

  // Words are reachable only through a source; if the household was reset, forget what nothing refers to.
  useEffect(
    () =>
      store.subscribe(() => {
        const state = store.getSnapshot().state;
        if (!state) return;
        pruneOrphans(value.text, new Set(state.sourceArtifacts.flatMap((a) => (a.contentRef === null ? [] : [a.contentRef]))));
      }),
    [store, value]
  );

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture(): CaptureContextValue {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error('useCapture must be used within CaptureProvider');
  return ctx;
}

/** The review of one capture, kept current as the household changes. Null when the source no longer exists. */
export function useCaptureVM(captureId: string, extra: { areaChoice?: Readonly<Record<string, string>>; failures?: Readonly<Record<string, number>> } = {}): CaptureVM | null {
  const { coordinator, now } = useCapture();
  const { state } = useStoreSnapshot();
  if (!state) return null;
  return buildCaptureVM({
    state,
    captureId,
    nowMs: now(),
    text: coordinator.textOf(captureId),
    session: coordinator.sessionOf(captureId),
    areaChoice: extra.areaChoice,
    failures: extra.failures,
  });
}

/** The Life Inbox. Loading, recovery and empty are three different answers and are never confused. */
export function useLifeInbox(): LifeInboxVM {
  const { coordinator, now } = useCapture();
  const snapshot = useStoreSnapshot();
  return buildLifeInbox({
    status: snapshot.status,
    recovery: snapshot.recovery,
    state: snapshot.state,
    nowMs: now(),
    textAvailable: (id) => coordinator.textOf(id) !== null,
    sessionOf: (id) => coordinator.sessionOf(id),
  });
}
