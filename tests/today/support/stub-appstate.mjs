import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Import this module (dynamically, before importing the provider or the hook) to point `react-native` at the
 * stub that also exports `AppState`. Registered later than the shared redirect, so it wins. Per-process.
 */
const STUB = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'rn-with-appstate.mjs')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react-native') return nextResolve(STUB, context);
    return nextResolve(specifier, context);
  },
});
