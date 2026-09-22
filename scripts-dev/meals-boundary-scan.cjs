#!/usr/bin/env node
/**
 * HK-FEATURE-08-MEALS — the semantic-boundary scan (the required exit gate) and the sibling-import scan.
 *
 *   node scripts-dev/meals-boundary-scan.cjs           human report, exit 1 on any finding
 *   node scripts-dev/meals-boundary-scan.cjs --json    the same as JSON
 *
 * It compares the working tree (tracked, staged and UNTRACKED files) with the certified baseline and enumerates, mechanically:
 *   A  new migrations                    expected: exactly the one F08 migration
 *   B  new durable domain types          expected: none; MealPlanEntry gains exactly `slot` and `status`
 *   C  new tables / durable collections  expected: none (no CREATE TABLE; the AppState root keys are unchanged)
 *   D  new sync kinds                    expected: none
 *   E  shared-file changes               every one mapped to a permitted reason; protected files untouched
 *   F  a second Meals durable model      expected: none (Recipe, Ingredient, PantryItem, GroceryList, MealIdea, ...)
 *   G  sibling imports                   expected: none, by import scan and by git ancestry
 * A finding is a FAILURE: it needs an owner checkpoint, not a workaround.
 */
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
// The certified baseline this scan diffs against. Originally 14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1 (the shared IR01 foundation
// every feature branch forked from), which is what Feature 08 was certified against on its own, isolated branch. Once merged into
// the Wave 2 integration line (integration/wave2-f01-f08), that same diff would also show every sibling feature's own history —
// not a boundary violation, just the wrong question. Re-pointed to the integration checkpoint immediately BEFORE F08 entered this
// line (W2I-F07, 38ab7f14d017146883a939339eb604607eff623b), so the scan asks exactly what integrating F08 changed, the same
// question it always asked, now relative to where F08 actually landed.
const BASE = '38ab7f14d017146883a939339eb604607eff623b';
const F08_MIGRATION = 'supabase/migrations/20260921160000_f08_meal_slot_and_status.sql';

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const gitOk = (...args) => {
  try {
    return { ok: true, out: git(...args) };
  } catch (error) {
    return { ok: false, out: String(error.stdout ?? '') };
  }
};
const atBase = (file) => gitOk('show', `${BASE}:${file}`).out;
const now = (file) => (fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), 'utf8') : '');

/** Feature-owned paths: new files here are the feature itself. */
const OWNED = [
  /^src\/features\/meals\//, /^tests\/meals\//, /^tests\/fixtures\/meals\//, /^docs\/builds\/HK_FEATURE_08_/, /^scripts-dev\/meals-/,
  /^supabase\/tools\/f08-fingerprint\.mjs$/, /^supabase\/tools\/baselines\/f08-local-fingerprint\.json$/, /^supabase\/tests\/private-stack\.mjs$/,
  /^supabase\/tests\/77-meals-slot-status\.sql$/,
];

/** Shared files Feature 08 may change, each with the permitted reason it changes (MealPlanEntry / canonical task integration / tests / repair). */
const SHARED = [
  ['src/domain/state.ts', 'MealPlanEntry: the two authorized fields and the collection cap'],
  ['src/domain/meals.ts', 'MealPlanEntry: canonical actions, beside tasks.ts and events.ts (meal tasks wrap the canonical addTask)'],
  ['src/domain/sync/syncTypes.ts', 'MealPlanEntry: two column names registered for an existing kind'],
  ['src/domain/sync/projection.ts', 'MealPlanEntry: the projection sends the two columns'],
  ['src/domain/sync/apply.ts', 'MealPlanEntry: apply reads the two columns'],
  ['src/data/seed/demoHousehold.ts', 'MealPlanEntry: the typed demo literal supplies the new fields'],
  ['src/store/useHousehold.ts', 'MealPlanEntry lifecycle: archived entries no longer read as planned'],
  ['src/features/life/lifeStatus.ts', 'MealPlanEntry truth: the Life hub Meals row says only what the data supports'],
  ['app/gallery.tsx', 'MealPlanEntry truth: the internal gallery sample matches the Life row copy'],
  ['app/(app)/life/meals.tsx', 'the existing direct route: a thin file that passes navigation into the Meals component'],
  [F08_MIGRATION, 'MealPlanEntry: the one additive migration'],
  ['.gitattributes', 'MealPlanEntry: LF pin for the migration'],
  ['supabase/tests/run.mjs', 'test infrastructure: migration gate, fresh install, populated upgrade, f08 mode, private stack'],
  ['supabase/tests/journey-composition.mjs', 'test infrastructure: the meals journey and the served-database name'],
  ['supabase/tests/sync-integration.mjs', 'test infrastructure: the served-database name'],
  ['supabase/tests/journey-kids.mjs', 'W2I follow-up: the combined journeys path now runs Kids through the F08 private stack too, so its verification queries read STACK_DB instead of a hardcoded postgres'],
  ['supabase/tests/journey-home.mjs', 'W2I follow-up: same private-stack fix as journey-kids.mjs, for the same reason'],
  ['tests/support/legacyShapes.mjs', 'test infrastructure: typed literals and the v3 to v4 shape helper'],
  ['tests/support/richHousehold.mjs', 'test infrastructure: the meal literal carries the new fields'],
  ['tests/foundationAcceptance.test.mjs', 'test infrastructure: raw meal literal carries the new fields'],
  ['tests/foundationAcceptance3.test.mjs', 'test infrastructure: raw meal literal carries the new fields'],
];

/** Files Feature 08 must NOT change. */
const PROTECTED = [
  /^src\/domain\/taskLists\.ts$/, /^tests\/build3Audit\.capture\.test\.mjs$/, /^src\/domain\/routeAccess\.ts$/, /^app\/_layout\.tsx$/, /^app\/\(app\)\/life\/_layout\.tsx$/,
  /^src\/domain\/account\/claim\.ts$/, /^supabase\/migrations\/20260919/, /^supabase\/migrations\/20260921120000/, /^tests\/fixtures\/v3\//, /^app\.json$/,
  /^package(-lock)?\.json$/, /^src\/domain\/responsibility\.ts$/, /^src\/domain\/structure\.ts$/, /^src\/domain\/foundation\//, /^src\/domain\/tasks\.ts$/,
  /^src\/domain\/projectDay\.ts$/, /^src\/domain\/observations\.ts$/, /^src\/persistence\//,
];

const FORBIDDEN_MODEL = /^(Recipe|Ingredient|PantryItem|Pantry|GroceryList|GroceryCatalogItem|GroceryItem|MealIdea|MealPreference|DietProfile|DietaryProfile|FavoriteMeal|FoodInventory|Inventory|ShoppingTrip|ShoppingOrder|ShoppingList|MealHistory|MealExecution|MealConsumption|MealTemplate|NutritionProfile|Nutrition|MealLog|EatenMeal)/i;

function changedFiles() {
  const files = new Map();
  for (const line of git('diff', '--name-status', BASE).split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    files.set(parts[parts.length - 1], parts[0][0]);
  }
  for (const file of git('ls-files', '--others', '--exclude-standard').split('\n')) if (file.trim()) files.set(file.trim(), 'A');
  return files;
}

const schemaNames = (text) => new Set([...text.matchAll(/export const (\w+Schema)\s*=/g)].map((m) => m[1]));
const declaredNames = (text) => [...text.matchAll(/export\s+(?:interface|type|class|const|function)\s+(\w+)/g)].map((m) => m[1]);

function blockKeys(text, header) {
  const start = text.indexOf(header);
  if (start < 0) return null;
  const rest = text.slice(start + header.length);
  const end = rest.search(/\n\}\)/);
  const body = end < 0 ? rest : rest.slice(0, end);
  return new Set([...body.matchAll(/^ {2}(?:\.\.\.)?(\w+)/gm)].map((m) => m[1]));
}

const arrayItems = (text, name) => {
  const m = text.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`));
  return m ? new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])) : null;
};
const diff = (before, after) => ({ added: [...after].filter((x) => !before.has(x)).sort(), removed: [...before].filter((x) => !after.has(x)).sort() });

function scan() {
  const findings = [];
  const facts = {};
  const changed = changedFiles();
  const owned = (file) => OWNED.some((re) => re.test(file));

  // A. new migrations
  const newMigrations = [...changed].filter(([f, s]) => s === 'A' && /^supabase\/migrations\/.+\.sql$/.test(f)).map(([f]) => f);
  facts.newMigrations = newMigrations;
  if (newMigrations.length !== 1 || newMigrations[0] !== F08_MIGRATION) findings.push(`A: new migrations must be exactly ${F08_MIGRATION}, found [${newMigrations.join(', ')}]`);

  // B. new durable domain types
  const baseDomain = gitOk('ls-tree', '-r', '--name-only', BASE, 'src/domain').out.split('\n').filter((f) => /\.ts$/.test(f));
  const nowDomain = [...new Set([...baseDomain, ...[...changed].filter(([f]) => /^src\/domain\/.*\.ts$/.test(f)).map(([f]) => f)])];
  const baseSchemas = new Set(baseDomain.flatMap((f) => [...schemaNames(atBase(f))]));
  const nowSchemas = new Set(nowDomain.flatMap((f) => [...schemaNames(now(f))]));
  const schemaDiff = diff(baseSchemas, nowSchemas);
  facts.newDurableSchemas = schemaDiff.added;
  if (schemaDiff.added.length > 0 || schemaDiff.removed.length > 0) findings.push(`B: durable domain schemas changed: +[${schemaDiff.added}] -[${schemaDiff.removed}]`);
  const header = 'export const MealPlanEntrySchema = z.strictObject({';
  const baseFields = blockKeys(atBase('src/domain/state.ts'), header);
  const nowFields = blockKeys(now('src/domain/state.ts'), header);
  const fieldDiff = baseFields && nowFields ? diff(baseFields, nowFields) : { added: ['?'], removed: ['?'] };
  facts.mealPlanEntryFieldsAdded = fieldDiff.added;
  if (JSON.stringify(fieldDiff.added) !== JSON.stringify(['slot', 'status']) || fieldDiff.removed.length > 0) findings.push(`B: MealPlanEntry must gain exactly [slot, status]; +[${fieldDiff.added}] -[${fieldDiff.removed}]`);

  // C. new tables and durable collections
  const createTables = newMigrations.flatMap((f) => [...now(f).replace(/--.*$/gm, '').matchAll(/CREATE\s+TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)/gi)].map((m) => m[1]));
  facts.newTables = createTables;
  if (createTables.length > 0) findings.push(`C: new tables: ${createTables}`);
  const rootHeader = 'export const AppStateSchema = z.strictObject({';
  const rootDiff = diff(blockKeys(atBase('src/domain/state.ts'), rootHeader) ?? new Set(), blockKeys(now('src/domain/state.ts'), rootHeader) ?? new Set());
  facts.newRootCollections = rootDiff.added;
  if (rootDiff.added.length > 0 || rootDiff.removed.length > 0) findings.push(`C: AppState root keys changed: +[${rootDiff.added}] -[${rootDiff.removed}]`);

  // D. new sync kinds
  const kindDiff = diff(arrayItems(atBase('src/domain/sync/syncTypes.ts'), 'CORE_SYNC_KINDS') ?? new Set(), arrayItems(now('src/domain/sync/syncTypes.ts'), 'CORE_SYNC_KINDS') ?? new Set());
  facts.newSyncKinds = kindDiff.added;
  if (kindDiff.added.length > 0 || kindDiff.removed.length > 0) findings.push(`D: sync kinds changed: +[${kindDiff.added}] -[${kindDiff.removed}]`);

  // E. shared-file changes and protected files
  const shared = new Map(SHARED);
  facts.sharedFileChanges = [];
  for (const [file, status] of changed) {
    if (owned(file)) continue;
    if (PROTECTED.some((re) => re.test(file))) {
      findings.push(`E: PROTECTED file changed: ${file}`);
      continue;
    }
    const reason = shared.get(file);
    if (reason === undefined) findings.push(`E: unexplained shared-file change: ${status} ${file}`);
    else facts.sharedFileChanges.push({ file, status, reason });
  }

  // F. a second durable Meals model, by declared name and by table name, in every new or changed source file
  const sourceFiles = [...changed].filter(([f]) => /^(src\/.*\.(ts|tsx)|supabase\/migrations\/.*\.sql)$/.test(f)).map(([f]) => f);
  const second = [];
  for (const file of sourceFiles) {
    const text = now(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '').replace(/^\s*\/\/.*$/gm, '');
    for (const name of declaredNames(text)) if (FORBIDDEN_MODEL.test(name.replace(/Schema$/, ''))) second.push(`${file}: ${name}`);
    for (const m of text.matchAll(/CREATE\s+TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)/gi)) if (FORBIDDEN_MODEL.test(m[1].replace(/_/g, ''))) second.push(`${file}: table ${m[1]}`);
    if (FORBIDDEN_MODEL.test(path.basename(file).replace(/\.\w+$/, '')) && !/^src\/features\/meals\//.test(file)) second.push(`${file}: file name`);
  }
  facts.secondModels = second;
  if (second.length > 0) findings.push(`F: a second durable Meals model: ${second.join('; ')}`);

  // G. sibling imports: by import scan, and by ancestry
  const ownSources = [...changed].filter(([f]) => /^src\/features\/meals\/.*\.(ts|tsx)$/.test(f) || f === 'src/domain/meals.ts').map(([f]) => f);
  const ALLOWED_FEATURES = new Set(['meals', 'life', 'today']);
  const badImports = [];
  for (const file of ownSources) {
    for (const m of now(file).matchAll(/from\s+'(\.[^']*)'/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
      const feature = target.match(/^src\/features\/([^/]+)/);
      if (feature && !ALLOWED_FEATURES.has(feature[1])) badImports.push(`${file} -> ${m[1]}`);
    }
  }
  facts.siblingImports = badImports;
  if (badImports.length > 0) findings.push(`G: imports outside the baseline features: ${badImports.join('; ')}`);
  const ancestry = [];
  for (const branch of git('branch', '--list', 'feature/0*', 'validate/*', 'audit/hk-*').split('\n').map((b) => b.replace(/^[*+ ]+/, '').trim()).filter(Boolean)) {
    if (branch === 'feature/08-meals-os') continue;
    const tip = git('rev-parse', branch).trim();
    if (gitOk('merge-base', '--is-ancestor', tip, 'HEAD').ok) {
      // A tip at or below the baseline is the baseline's own history (IR01 forked from an audit tip); only history ABOVE it is a sibling.
      if (!gitOk('merge-base', '--is-ancestor', tip, BASE).ok) ancestry.push(`${branch} (${tip.slice(0, 7)}) is an ancestor of HEAD`);
      continue;
    }
    const mergeBase = gitOk('merge-base', 'HEAD', tip).out.trim();
    if (mergeBase && !gitOk('merge-base', '--is-ancestor', mergeBase, BASE).ok) ancestry.push(`${branch}: shares history with HEAD above the baseline (${mergeBase.slice(0, 7)})`);
  }
  facts.siblingAncestry = ancestry;
  if (ancestry.length > 0) findings.push(`G: sibling history reaches HEAD: ${ancestry.join('; ')}`);

  return { ok: findings.length === 0, base: BASE, findings, facts };
}

const result = scan();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('HK-FEATURE-08 semantic-boundary scan against', BASE.slice(0, 7));
  console.log('  A new migrations           :', result.facts.newMigrations.join(', ') || 'none');
  console.log('  B new durable schemas      :', result.facts.newDurableSchemas.join(', ') || 'none', '| MealPlanEntry fields added:', result.facts.mealPlanEntryFieldsAdded.join(', ') || 'none');
  console.log('  C new tables / collections :', [...result.facts.newTables, ...result.facts.newRootCollections].join(', ') || 'none');
  console.log('  D new sync kinds           :', result.facts.newSyncKinds.join(', ') || 'none');
  console.log(`  E shared-file changes      : ${result.facts.sharedFileChanges.length} files, each mapped to a permitted reason`);
  console.log('  F second Meals models      :', result.facts.secondModels.join(', ') || 'none');
  console.log('  G sibling imports/ancestry :', [...result.facts.siblingImports, ...result.facts.siblingAncestry].join(', ') || 'none');
  console.log(result.ok ? '\nRESULT: PASS' : `\nRESULT: FAIL\n  ${result.findings.join('\n  ')}`);
}
process.exit(result.ok ? 0 : 1);
