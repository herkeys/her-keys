import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Import (dynamically, before any component) to send `expo-router` to the recording stub for the rest of this test process. */
const STUB = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'expo-router-stub.mjs')).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'expo-router' ? nextResolve(STUB, context) : nextResolve(specifier, context);
  },
});
