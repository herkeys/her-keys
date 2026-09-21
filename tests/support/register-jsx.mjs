/**
 * JSX transform + react-native redirection hook for component tests.
 *
 * Two jobs:
 * 1. Transform app `.tsx` files with esbuild (Node strips types from `.ts`
 *    but cannot parse JSX).
 * 2. Redirect `react-native` / `react-native-safe-area-context` imports from
 *    test files to `tests/support/rn-stub.tsx` — real RN sources need Metro's
 *    pipeline (Flow `import typeof`, platform resolution, native modules);
 *    see the stub file for the honest scope of what these tests prove.
 *
 * Dev-only dependencies (esbuild, react-test-renderer): justified in
 * migration-ledger.md §F — node --test cannot mount component trees otherwise
 * and the shared-component test floor (HK-FE-UI-01 §12) is mandatory.
 */
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { transformSync } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const RN_STUB = pathToFileURL(join(HERE, 'rn-stub.tsx')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react-native' || specifier === 'react-native-safe-area-context') {
      return nextResolve(RN_STUB, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:')) return nextLoad(url, context);
    const path = fileURLToPath(url);
    // App components (.tsx) and test files (.test.mjs, JSX allowed by project convention).
    const transformable = /\.tsx$/.test(path) || /\.test\.mjs$/.test(path);
    if (!transformable) return nextLoad(url, context);
    const source = readFileSync(path, 'utf8');
    const { code } = transformSync(source, {
      loader: path.endsWith('.tsx') ? 'tsx' : 'jsx',
      jsx: 'automatic',
      format: 'esm',
      target: 'esnext',
      sourcefile: path,
    });
    return { format: 'module', source: code, shortCircuit: true };
  },
});
