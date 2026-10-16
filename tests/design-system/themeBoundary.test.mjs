/**
 * HK-FE-UI-02-DM — the theme boundary.
 *
 * 1. NO STATIC COLOUR in a screen or component: nothing under app/ or src/ (other than the theme module and tokens.ts) imports the
 *    Light-only `color` / `colors` / `elevation` / `interaction` VALUES, and nothing hard-codes a hex or rgb(a) literal. A component
 *    that did would stay Light in Dark mode; this test is what keeps a future edit from reintroducing that.
 * 2. THE THEME STAYS PRESENTATIONAL: no domain, state, persistence, monetization, sync, notification or config module imports the
 *    theme, so appearance can never alter account, household, consent or purchase behaviour.
 * 3. THE NATIVE-LEVEL READERS ARE FEW: only the provider and the system-chrome module touch Appearance / StatusBar / expo-system-ui.
 * 4. THE PREFERENCE IS DEVICE-LOCAL: its storage module touches no backend and its key is not part of any account/household payload.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sep } from 'node:path';
import { test } from 'node:test';

const BACKSLASH = String.fromCharCode(92);
const sources = ['app', 'src']
  .flatMap((dir) => readdirSync(dir, { recursive: true }).map((f) => `${dir}/${String(f).split(sep).join('/').split(BACKSLASH).join('/')}`))
  .filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f) => readFileSync(f, 'utf8');
const isThemeInfra = (f) => f.startsWith('src/design/theme/') || f === 'src/design/tokens.ts';

test('the source tree was walked', () => {
  assert.ok(sources.length > 300, `${sources.length} source files`);
});

test('no screen or component imports the Light-only colour, colors, elevation or interaction values', () => {
  const offenders = [];
  for (const f of sources.filter((x) => !isThemeInfra(x))) {
    for (const m of read(f).matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*'([^']*tokens)'/g)) {
      if (m[1]) continue; // `import type` carries no value
      const valueNames = m[2].split(',').map((x) => x.trim()).filter((x) => x && !x.startsWith('type ')).map((x) => x.split(/\s+as\s+/)[0]);
      const hit = valueNames.filter((n) => ['color', 'colors', 'elevation', 'interaction'].includes(n));
      if (hit.length) offenders.push(`${f}: ${hit.join(', ')}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('no hex or rgb(a) colour literal exists outside tokens.ts and the theme palettes', () => {
  const offenders = [];
  for (const f of sources.filter((x) => !isThemeInfra(x))) {
    read(f).split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![0-9A-Fa-f])|rgba?\(/.test(line)) offenders.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('no non-visual domain, state, persistence, monetization, sync, notification, config or data module imports the theme', () => {
  // .ts only: the .tsx files in src/monetization are presentational screens (e.g. the checkout surface) and are themed like any other.
  const logic = /^src\/(domain|state|store|persistence|monetization|external|data|notifications|config|types|platform)\/.*\.ts$/;
  const offenders = sources.filter((f) => logic.test(f) && f !== 'src/platform/appearanceStorage.ts' && /design\/(theme|tokens)/.test(read(f)));
  assert.deepEqual(offenders, [], 'appearance is presentation only');
});

test('non-visual (.ts) feature modules never import the theme either', () => {
  const offenders = sources.filter((f) => f.startsWith('src/features/') && f.endsWith('.ts') && /design\/theme/.test(read(f)));
  assert.deepEqual(offenders, []);
});

test('only the provider and the system-chrome module read the device scheme, mount the StatusBar or set the system background', () => {
  const readers = sources
    .filter((f) => /useColorScheme|Appearance\.|from 'expo-status-bar'|expo-system-ui/.test(read(f)))
    .sort();
  assert.deepEqual(readers, ['src/design/theme/SystemChrome.tsx', 'src/design/theme/ThemeProvider.tsx']);
});

test('the preference store is device-local: AsyncStorage only, its own key, no Supabase / fetch / account / household / purchase reference', () => {
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = stripComments(read('src/platform/appearanceStorage.ts'));
  assert.match(src, /@react-native-async-storage\/async-storage/);
  assert.doesNotMatch(src, /supabase|fetch\(|purchases|revenuecat|household|accountId|userId|session/i);
  const pure = stripComments(read('src/design/theme/appearance.ts'));
  assert.match(pure, /herkeys\.appearance\.preference\.v1/);
  assert.doesNotMatch(pure, /supabase|fetch\(|purchases|revenuecat/i);
});

test('the persisted household state envelope does not mention appearance (no cross-account leakage, no sync payload)', () => {
  const offenders = sources.filter((f) => /^src\/(store|persistence|state|data)\//.test(f) && /appearance/i.test(read(f)));
  assert.deepEqual(offenders, []);
});

test('sign-out, account switch and reset cannot erase the preference: no blanket AsyncStorage wipe exists, and only two modules name its key', () => {
  const wipes = sources.filter((f) => /AsyncStorage\s*\.\s*(clear|multiRemove|getAllKeys)\b/.test(read(f)));
  assert.deepEqual(wipes, [], 'a blanket wipe would erase the device-local preference on sign-out');
  const keyUsers = sources.filter((f) => /herkeys\.appearance|APPEARANCE_STORAGE_KEY/.test(read(f))).sort();
  assert.deepEqual(keyUsers, ['src/design/theme/appearance.ts', 'src/platform/appearanceStorage.ts']);
});
