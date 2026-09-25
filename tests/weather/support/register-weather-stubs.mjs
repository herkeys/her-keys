import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Import (dynamically, before the seam or the card) to point the native/composition-root imports at this folder's test-only stand-ins.
 * Production files are untouched: `tests/weather/architecture.test.mjs` reads the real sources to prove the real imports are intact.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const url = (name) => pathToFileURL(join(HERE, name)).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-location') return nextResolve(url('expo-location-stub.mjs'), context);
    if (specifier === 'react-native') return nextResolve(url('rn-weather-stub.mjs'), context);
    if (/(^|\/)(AccountProvider|AppStateProvider|accountRuntimeInstance)$/.test(specifier)) {
      return nextResolve(url('weather-store-stub.mjs'), context);
    }
    return nextResolve(specifier, context);
  },
});
