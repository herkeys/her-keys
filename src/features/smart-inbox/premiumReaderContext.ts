import { createContext, useContext } from 'react';
import type { SmartInboxEnv } from './smartInboxEnhancer';

/**
 * The ONE thing Talk It Out may know about Premium: a small, read-only view of "may a Premium reading be attempted for this account".
 *
 * It lives in its own light module on purpose. Free Talk It Out must not import the Premium provider (and through it the store SDK):
 * a Free build, a test, or a screen with no Premium mounted all simply see `null` here and read locally.
 */
export type PremiumReaderView = NonNullable<ReturnType<SmartInboxEnv['premium']>>;

export const PremiumReaderContext = createContext<PremiumReaderView | null>(null);

export const usePremiumReaderView = (): PremiumReaderView | null => useContext(PremiumReaderContext);
