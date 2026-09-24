/**
 * Stands in for `src/store/accountRuntimeInstance.ts` (the production composition root) for screen tests that render WITHOUT an
 * AccountProvider mounted. The real `AccountProvider.tsx` and `useOptionalAccount` are still what runs — with no provider in the tree
 * `useOptionalAccount()` is the real `null` — this only replaces the module those files import at load time.
 *
 * Nothing here fakes a capability: the external-intelligence export is the REAL unconfigured client (no Supabase project, no provider
 * secrets, no deployed Edge Function), and the account runtime is absent. Mounting an AccountProvider against this stand-in fails loudly
 * on the missing runtime, which is the intent: such a test needs the real composition, not this one.
 */
export { UNCONFIGURED_EXTERNAL_INTELLIGENCE as externalIntelligenceClient } from '../../../src/platform/externalIntelligenceClient.ts';
export const accountRuntime = null;
export const syncRuntime = null;
export const accountsAvailable = false;
