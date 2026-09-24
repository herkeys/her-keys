import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Import (dynamically, before any component) to let a screen that composes the DORMANT external-intelligence adapters mount under
 * node. `CalendarScreen` -> `GoogleCalendarPanel` -> `useGoogleCalendarBridge` reaches two modules node cannot load: `expo-web-browser`
 * (an `expo-modules-core` package that ships raw `.ts`) and `store/accountRuntimeInstance` (the production composition root — Supabase,
 * secure storage, RevenueCat; see tests/hk-ir01/productionWiring.test.mjs, which reads it as source for the same reason).
 *
 * Nothing here fakes a provider being available. The composition-root stand-in exports the REAL `UNCONFIGURED_EXTERNAL_INTELLIGENCE`
 * — exactly what production exports when no Supabase project is configured — so every provider call answers `unavailable` and the
 * panel renders its honest dormant state, with no AccountProvider mounted. `tests/externalIntelligenceArchitecture.test.mjs` governs the
 * real adapter files.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_BROWSER_STUB = pathToFileURL(join(HERE, 'expo-web-browser-stub.mjs')).href;
const RUNTIME_STUB = pathToFileURL(join(HERE, 'account-runtime-instance-stub.mjs')).href;
const RN_STUB = pathToFileURL(join(HERE, 'rn-with-alert.mjs')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Builds on Today's AppState variant, so import this AFTER tests/today/support/stub-appstate.mjs (the later hook wins).
    if (specifier === 'react-native') return nextResolve(RN_STUB, context);
    if (specifier === 'expo-web-browser') return nextResolve(WEB_BROWSER_STUB, context);
    // `../../store/accountRuntimeInstance` from the adapters, `./accountRuntimeInstance` from the real AccountProvider.
    if (/(^|\/)accountRuntimeInstance$/.test(specifier)) return nextResolve(RUNTIME_STUB, context);
    return nextResolve(specifier, context);
  },
});
