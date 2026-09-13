import { createContext, useContext, useState, type ReactNode } from 'react';

interface OneMoveContextValue {
  completed: boolean;
  complete: () => void;
}

const OneMoveContext = createContext<OneMoveContextValue | null>(null);

export function OneMoveProvider({ children }: { children: ReactNode }) {
  const [completed, setCompleted] = useState(false);
  return <OneMoveContext.Provider value={{ completed, complete: () => setCompleted(true) }}>{children}</OneMoveContext.Provider>;
}

export function useOneMove(): OneMoveContextValue {
  const ctx = useContext(OneMoveContext);
  if (!ctx) throw new Error('useOneMove must be used within OneMoveProvider');
  return ctx;
}
