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
// line (W2I-F07, 38ab7f14d017146883a939339eb604607eff623b), so the scan asks exactly what integrating F08 changed — its own
// migration, its own MealPlanEntry fields (checks A/B need THIS exact baseline to see them as "new" at all) — the same question
// it always asked, now relative to where F08 actually landed. (Advancing this further, to the certified Wave 2 checkpoint after
// F08 merged, was tried and reverted: checks A/B then saw F08's own migration as pre-existing, not new, and failed for the wrong
// reason. The Wave 2 integrated hostile audit, AUDIT-W2-*, runs after F08 is already in the tree; its changes to files outside
// Meals' own lane are accounted for in SHARED below, each with its own AUDIT-W2-* reason.)
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
  ['tests/foundationAcceptance3.test.mjs', 'test infrastructure: raw meal literal carries the new fields; AUDIT-W2-02 also added a regression test here (unrelated to Meals)'],

  // AUDIT-W2-* — the Wave 2 integrated hostile audit and repair pass, run after all of F01-F08 were already merged and
  // certified (a28bde2, the new BASE above). None of these are Meals changes; each fixes a real defect found by
  // attacking the INTEGRATED product as a whole, which is exactly the kind of cross-feature bug no single feature's
  // own isolated branch could have found. Listed here only because this scan's diff can no longer tell "F08 did this"
  // apart from "a later, unrelated commit on the same branch did this" once BASE sits after F08's own merge.
  ['src/domain/account/claim.ts', 'AUDIT-W2-05: cloudDisplayName\'s control-char regex was mis-ranged (\\x7F-\\xC2 instead of \\x7F-\\x9F) and silently stripped accented capitals like Á/Â from real names'],
  ['src/domain/oneMove.ts', 'AUDIT-W2-01: the One Move candidate pool never checked dependency blocking; a blocked task could be offered as the day\'s one recommended move'],
  ['src/features/today/model/mattersView.ts', 'AUDIT-W2-01: the same dependency-blocking gap in "What Matters Today"\'s due-today list'],
  ['src/domain/reasoning/attention.ts', 'AUDIT-W2-02: risk suppression treated ACKNOWLEDGED as ACCEPTED, contradicting the product\'s own ACKNOWLEDGED ≠ ACCEPTED boundary (already flagged by F07 as HK-INT-COPARENT-KIDS-ATTENTION-01, unresolved until this audit)'],
  ['src/features/systems/commands/responsibility.ts', 'AUDIT-W2-04: recordAnswer(\'accepted\') relied on accept()\'s stillNeedsMe default, which contradicts accept()\'s own doctrine comment ("accepting is not, by itself, proof the load left")'],
  ['src/domain/sync/applySupport.ts', 'AUDIT-W2-03: looksLikeInstant\'s regex was missing every backslash (/^d{4}-d{2}.../), so it never matched a real timestamp and sameCloudValue could miss two equal instants rendered differently'],
  ['src/domain/sync/pullEngine.ts', 'AUDIT-W2-06: a non-member row adopted as "ours coming home" left its pending create in the queue, replayed next cycle as a redundant CAS update on a row nothing had changed'],
  ['tests/claimDisplayName.test.mjs', 'AUDIT-W2-05 regression coverage'],
  ['tests/oneMove.test.mjs', 'AUDIT-W2-01 regression coverage'],
  ['tests/today/mattersBlocking.test.mjs', 'AUDIT-W2-01 regression coverage (new file)'],
  ['tests/systems/scenarios.lifecycle.test.mjs', 'AUDIT-W2-04 regression coverage'],
  ['tests/fixtures/systems/scenarios/J-responsibility.evidence.json', 'AUDIT-W2-04: regenerated via UPDATE_SYSTEMS_EVIDENCE=1 after the stillNeedsMe fix; reviewed, the diff is exactly that one field'],
  ['tests/sync/sameCloudValue.test.mjs', 'AUDIT-W2-03 regression coverage (new file)'],
  ['tests/hk-ir01/syncComposition.test.mjs', 'AUDIT-W2-06 regression coverage'],

  // STAGING-W2-* — the Wave 2 Staging certification pass, run after the integrated hostile audit. Not Meals changes;
  // listed here for the same reason the AUDIT-W2-* block above is.
  ['.env.example', 'STAGING-W2-01: documented the 5 Supabase/Google EXPO_PUBLIC_ vars src/config/supabase.ts already read but .env.example never listed, discovered while proving the app could bind to Staging'],
  ['README.md', 'STAGING-W2-03: added the Wave 2 engineering closeout Build Status section (F01-F08 integrated, audit/tests/Staging status, OAuth explicitly out of product-stage scope)'],
];

/**
 * LATER FEATURES ON THIS LINE. Wave 3 and Wave 4 features branch from the certified Wave 2 closeout (INTEGRATION_CHECKPOINTS), so
 * this scan — which diffs against a fixed pre-F08 base — sees THEIR migration, tables, collections and files as well. None of that is
 * a Meals change, and "a finding needs an owner checkpoint" was never meant to demand one for another feature's own lane. So a later
 * feature REGISTERS its lane here, exactly as the AUDIT-W2 block above registers the audit's files: the paths it owns, the durable
 * additions it is authorized to make, and each shared file it changes with its reason. The scan subtracts a registered lane and still
 * asks every Meals question of everything else. (Wave 3/4 integration: each feature adds its own entry; take the union.)
 */
const INTEGRATION_CHECKPOINTS = ['363e473fdf053547a21a41a67b7f62bd9aa2bcdf'];
const LATER_FEATURES = [
  {
    id: 'HK-FEATURE-13 (People OS)',
    owned: [
      /^src\/features\/people\//, /^src\/domain\/people\.ts$/, /^src\/domain\/foundation\/personContext\.ts$/, /^src\/data\/seed\/demoPeople\.ts$/,
      /^app\/\(app\)\/life\/(people|person|person-add|person-follow-up)\.tsx$/, /^tests\/people\//, /^docs\/builds\/HK_FEATURE_13_/,
      /^supabase\/tests\/79-f13-/, /^supabase\/tests\/run-f13\.mjs$/, /^supabase\/migrations\/20260922200000_f13_people_os\.sql$/, /^scripts-dev\/f13-/,
      /^supabase\/tests\/journey-people\.mjs$/, /^supabase\/tools\/baselines\/f13-local-fingerprint\.json$/,
    ],
    migrations: ['supabase/migrations/20260922200000_f13_people_os.sql'],
    schemas: ['PersonContextSchema', 'PersonTaskLinkSchema'],
    rootCollections: ['personContexts', 'personTaskLinks'],
    shared: [
      ['src/domain/sync/foundationSpecs.ts', 'HK-FEATURE-13: two People kinds in the one foundation manifest, generated into their own additive migration'],
      ['supabase/tools/gen-foundation-sql.mjs', 'HK-FEATURE-13: the generator emits an additive migration\'s kinds there, never into the shipping migration'],
      ['src/state/initialState.ts', 'HK-FEATURE-13: the two People collections start empty'],
      ['tests/foundationSpecs.test.mjs', 'HK-FEATURE-13: manifest counts 18 -> 20, each kind checked in its own migration'],
      ['tests/hk-ir01/changeBridge.test.mjs', 'HK-FEATURE-13: the sync kind inventory gains the two People kinds'],
      ['supabase/tests/run.mjs', 'HK-FEATURE-13: the harness applies the additive People migration'],
      ['supabase/tests/sync-integration.mjs', 'HK-FEATURE-13: the multi-device journeys carry the People kinds'],
      ['supabase/tests/journey-composition.mjs', 'HK-FEATURE-13: the composition journey stack carries the People migration'],
      ['supabase/tests/00-interlock.sql', 'HK-FEATURE-13: the application table count is 36 once the two People tables exist'],
    ],
  },
];

/**
 * Files Feature 08 (Meals) itself must never change — no Meals reason ever touches these.
 * `src/domain/account/claim.ts` was moved out of this list to SHARED below: the Wave 2 integrated hostile audit
 * fixed a real, unrelated bug there (a mis-ranged control-character regex), which is exactly the kind of change
 * this list exists to catch if MEALS made it, but this one wasn't Meals — see the SHARED entry for the evidence.
 */
const PROTECTED = [
  /^src\/domain\/taskLists\.ts$/, /^tests\/build3Audit\.capture\.test\.mjs$/, /^src\/domain\/routeAccess\.ts$/, /^app\/_layout\.tsx$/, /^app\/\(app\)\/life\/_layout\.tsx$/,
  /^supabase\/migrations\/20260919/, /^supabase\/migrations\/20260921120000/, /^tests\/fixtures\/v3\//, /^app\.json$/,
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
  const laterOwned = (file) => LATER_FEATURES.some((feature) => feature.owned.some((re) => re.test(file)));
  const owned = (file) => OWNED.some((re) => re.test(file)) || laterOwned(file);
  const laterMigrations = new Set(LATER_FEATURES.flatMap((feature) => feature.migrations));
  const laterSchemas = new Set(LATER_FEATURES.flatMap((feature) => feature.schemas));
  const laterRoots = new Set(LATER_FEATURES.flatMap((feature) => feature.rootCollections));
  facts.laterFeatures = LATER_FEATURES.map((feature) => feature.id);

  // A. new migrations (a registered later feature's own migration is its lane, not Meals')
  const newMigrations = [...changed].filter(([f, s]) => s === 'A' && /^supabase\/migrations\/.+\.sql$/.test(f) && !laterMigrations.has(f)).map(([f]) => f);
  facts.newMigrations = newMigrations;
  if (newMigrations.length !== 1 || newMigrations[0] !== F08_MIGRATION) findings.push(`A: new migrations must be exactly ${F08_MIGRATION}, found [${newMigrations.join(', ')}]`);

  // B. new durable domain types
  const baseDomain = gitOk('ls-tree', '-r', '--name-only', BASE, 'src/domain').out.split('\n').filter((f) => /\.ts$/.test(f));
  const nowDomain = [...new Set([...baseDomain, ...[...changed].filter(([f]) => /^src\/domain\/.*\.ts$/.test(f)).map(([f]) => f)])];
  const baseSchemas = new Set(baseDomain.flatMap((f) => [...schemaNames(atBase(f))]));
  const nowSchemas = new Set(nowDomain.flatMap((f) => [...schemaNames(now(f))]));
  const rawSchemaDiff = diff(baseSchemas, nowSchemas);
  const schemaDiff = { added: rawSchemaDiff.added.filter((name) => !laterSchemas.has(name)), removed: rawSchemaDiff.removed };
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
  const rawRootDiff = diff(blockKeys(atBase('src/domain/state.ts'), rootHeader) ?? new Set(), blockKeys(now('src/domain/state.ts'), rootHeader) ?? new Set());
  const rootDiff = { added: rawRootDiff.added.filter((key) => !laterRoots.has(key)), removed: rawRootDiff.removed };
  facts.newRootCollections = rootDiff.added;
  if (rootDiff.added.length > 0 || rootDiff.removed.length > 0) findings.push(`C: AppState root keys changed: +[${rootDiff.added}] -[${rootDiff.removed}]`);

  // D. new sync kinds
  const kindDiff = diff(arrayItems(atBase('src/domain/sync/syncTypes.ts'), 'CORE_SYNC_KINDS') ?? new Set(), arrayItems(now('src/domain/sync/syncTypes.ts'), 'CORE_SYNC_KINDS') ?? new Set());
  facts.newSyncKinds = kindDiff.added;
  if (kindDiff.added.length > 0 || kindDiff.removed.length > 0) findings.push(`D: sync kinds changed: +[${kindDiff.added}] -[${kindDiff.removed}]`);

  // E. shared-file changes and protected files
  const shared = new Map([...LATER_FEATURES.flatMap((feature) => feature.shared), ...SHARED]);
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
    // History shared only up to a certified integration checkpoint is the integration line itself (every Wave 3/4 feature branches
    // from it), not a sibling reaching HEAD. Anything shared ABOVE the checkpoint still is.
    const integrationHistory = mergeBase && INTEGRATION_CHECKPOINTS.some((checkpoint) => gitOk('merge-base', '--is-ancestor', mergeBase, checkpoint).ok);
    if (mergeBase && !integrationHistory && !gitOk('merge-base', '--is-ancestor', mergeBase, BASE).ok) ancestry.push(`${branch}: shares history with HEAD above the baseline (${mergeBase.slice(0, 7)})`);
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
