import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Import this module (dynamically, before importing any component) to redirect `expo-router` to the
 * recording stub for the rest of the process. `node --test` runs each test file in its own process, so
 * the redirect cannot leak into another suite.
 */
const STUB = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'expo-router-stub.mjs')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-router') return nextResolve(STUB, context);
    return nextResolve(specifier, context);
  },
});
