/**
 * Lets `node --test` import the app's pure TypeScript logic with no extra
 * dependencies. Node strips the types itself; this hook only fills in what
 * Metro normally does for us — resolving extensionless relative imports
 * (`../../types`) to their `.ts` / `index.ts` file.
 *
 * Only plain `.ts` logic is testable this way. Anything that renders
 * (`.tsx`) still needs to be checked in the running app.
 */
import { existsSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const isRelative = (specifier) => specifier.startsWith('./') || specifier.startsWith('../');
const hasExtension = (specifier) => /\.[cm]?[jt]sx?$/.test(specifier);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (isRelative(specifier) && !hasExtension(specifier) && context.parentURL) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      return nextLoad(url, { ...context, format: 'module-typescript' });
    }
    return nextLoad(url, context);
  },
});
