import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Import BEFORE the provider modules. Redirects the three native modules the identity adapters reach to scriptable stand-ins,
 * so the REAL `googleProvider.ts` / `appleProvider.ts` run under node. Registered last, so these win over register-jsx's
 * react-native redirection.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const STUBS = {
  'expo-web-browser': pathToFileURL(join(HERE, 'expo-web-browser.mjs')).href,
  'react-native': pathToFileURL(join(HERE, 'react-native.mjs')).href,
  'expo-apple-authentication': pathToFileURL(join(HERE, 'expo-apple-authentication.mjs')).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in STUBS) return nextResolve(STUBS[specifier], context);
    return nextResolve(specifier, context);
  },
});
