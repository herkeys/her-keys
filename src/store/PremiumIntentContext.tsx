import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PremiumChoice } from '../monetization/entitlement';

/**
 * The Premium decision a new user made on the welcome tree, held IN MEMORY so it can outlive the welcome screens (which unmount
 * the moment an account holds the household) and reach the checkout that runs after consent.
 *
 * It is deliberately not persisted anywhere. The welcome tree keeps no memory across a killed process (a restarted tree starts
 * again at Welcome, where the offer is shown again), and a persisted "she wanted Premium" could outlive its owner on a shared
 * device and prompt a different account. It holds an INTENT only: nothing here, and nothing in the welcome tree, can start a
 * purchase. See `PremiumCheckoutAfterConsent` for the one place the intent is acted on.
 */
export interface PremiumIntentValue {
  /** `null` means no decision (or one already acted on). */
  choice: PremiumChoice | null;
  setChoice: (choice: PremiumChoice | null) => void;
  /** Called once the intent has been acted on (or found to need nothing). */
  clear: () => void;
}

const PremiumIntentContext = createContext<PremiumIntentValue | null>(null);

export function PremiumIntentProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<PremiumChoice | null>(null);
  const setChoice = useCallback((next: PremiumChoice | null) => setChoiceState(next), []);
  const clear = useCallback(() => setChoiceState(null), []);
  const value = useMemo<PremiumIntentValue>(() => ({ choice, setChoice, clear }), [choice, setChoice, clear]);
  return <PremiumIntentContext.Provider value={value}>{children}</PremiumIntentContext.Provider>;
}

export function usePremiumIntent(): PremiumIntentValue {
  const value = useContext(PremiumIntentContext);
  if (!value) throw new Error('usePremiumIntent must be used within PremiumIntentProvider');
  return value;
}
