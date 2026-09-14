import { createContext, useContext, type ReactNode } from 'react';
import { completeOneMove, oneMoveForDay, type OneMoveView } from '../domain/oneMove';
import type { OneMoveItem } from '../types';
import { useAppStore, useHouseholdState } from './AppStateProvider';

interface OneMoveContextValue {
  status: OneMoveView['status'];
  move: OneMoveItem | null;
  completed: boolean;
  complete: () => void;
}

const OneMoveContext = createContext<OneMoveContextValue | null>(null);

/** Today's stored One Move decision — the same move before and after a relaunch. */
export function OneMoveProvider({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const { state, today } = useHouseholdState();
  const view = oneMoveForDay(state, today);

  const value: OneMoveContextValue = {
    status: view.status,
    move: 'move' in view ? view.move : null,
    completed: view.status === 'completed',
    complete: () => store.dispatch((current, ctx) => completeOneMove(current, ctx)),
  };

  return <OneMoveContext.Provider value={value}>{children}</OneMoveContext.Provider>;
}

export function useOneMove(): OneMoveContextValue {
  const ctx = useContext(OneMoveContext);
  if (!ctx) throw new Error('useOneMove must be used within OneMoveProvider');
  return ctx;
}
