import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Import BEFORE `src/features/account/WelcomeAuthFlow.tsx` (and load that with a dynamic `import()`, so this runs first).
 *
 * The welcome flow reaches the account runtime through two store modules, and both pull the whole device composition root
 * with them (Expo constants and crypto, the keychain, Supabase, RevenueCat). For that ONE importer they are redirected to
 * stand-ins that expose the same surface over a runtime the test builds — a real `createAccountRuntime`, so every
 * authentication decision under test is the production one. Nothing else in the tree is redirected.
 *
 * The stand-in `useAccount` mirrors `src/store/AccountProvider.tsx`; `tests/welcomeAuthFlow.test.mjs` pins the production
 * provider's own wiring by source so the two cannot quietly drift.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const STUBS = {
  AccountProvider: pathToFileURL(join(HERE, 'AccountProvider.tsx')).href,
  accountRuntimeInstance: pathToFileURL(join(HERE, 'accountRuntimeInstance.mjs')).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const store = /(?:^|\/)store\/(AccountProvider|accountRuntimeInstance)$/.exec(specifier);
    if (store && /\/src\/features\/account\/WelcomeAuthFlow\.tsx$/.test(context.parentURL ?? '')) {
      return nextResolve(STUBS[store[1]], context);
    }
    return nextResolve(specifier, context);
  },
});
