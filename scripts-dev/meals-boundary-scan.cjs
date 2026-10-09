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
 *   E  shared-file changes               every one mapped to a permitted reason by who could have made it; protected files untouched
 *   F  a second Meals durable model      expected: none (Recipe, Ingredient, PantryItem, GroceryList, MealIdea, ...)
 *   G  sibling imports                   expected: none, by import scan and by git ancestry
 *   H  the later-lane register is true   expected: no lane explains a change its own history did not make
 * A-D subtract what a registered later lane (LATER_FEATURES) is authorized to add; E-H hold every lane to its own changes.
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
/**
 * The F01-F13 integration (HK13-D11 in docs/audits/HK_F01_F13_DEFECT_LEDGER.md) found this register holding only F13: F09-F12 never
 * registered, so the integrated line failed the scan on other features' lanes. It registered them, and its own lane, and made the
 * accounting exact rather than trusting (see check E and check H below):
 *   - A change made on the Wave 2 line (BASE .. the checkpoint) is Meals-era: only a Meals-line reason (OWNED / SHARED) explains it,
 *     and a PROTECTED file must not have changed there at all. A change made AFTER the checkpoint was made by a later lane or the
 *     integration: only a later lane's reason explains it, so a Meals reason can no longer be misread as covering another feature's
 *     change, and PROTECTED ("no Meals reason ever touches these") no longer fails a file only a later feature changed.
 *   - A lane explains only what its own history changed: each `shared` entry is checked against the lane's branch (check H).
 *   - A lane may add sync kinds (F12 registers two by hand in CORE_SYNC_KINDS), and a registered lane's branch, once merged, is the
 *     integration line itself, not a sibling reaching HEAD.
 * Each lane's lists are taken from `git diff <checkpoint> <branch>`; the integration lane lists the files it holds in a version no
 * branch holds (a merge union, a reconciliation, or a repair). A later repair that touches another file must add it here.
 */
const LATER_FEATURES = [
  {
    id: 'HK-FEATURE-09 (Money OS)',
    branch: 'feature/09-money-os',
    owned: [
      /^src\/features\/money\//, /^tests\/money\//, /^docs\/builds\/HK_FEATURE_09_/, /^scripts-dev\/money-/,
      /^supabase\/migrations\/20260922180000_f09_task_payment_mechanism\.sql$/,
    ],
    migrations: ['supabase/migrations/20260922180000_f09_task_payment_mechanism.sql'],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['src/domain/foundation/commitment.ts', 'HK-FEATURE-09: a task gains the paymentMechanism facet (manual | autopay; null = never stated)'],
      ['src/domain/tasks.ts', 'HK-FEATURE-09: the canonical addTask carries paymentMechanism'],
      ['src/domain/reasoning/attention.ts', 'HK-FEATURE-09: an autopay obligation gets no routine pre-due nudge (never suppresses the overdue case)'],
      ['src/domain/sync/apply.ts', 'HK-FEATURE-09: payment_mechanism is read back by hand, like duration_source'],
      ['src/domain/sync/projection.ts', 'HK-FEATURE-09: payment_mechanism is sent by hand, like duration_source'],
      ['src/domain/sync/syncTypes.ts', 'HK-FEATURE-09: payment_mechanism is an updatable task column'],
      ['tests/build3Audit.capture.test.mjs', 'HK-FEATURE-09: the Money row of the reachability audit REWRITTEN for Money Home (same invariant: every open money task reachable)'],
      ['tests/support/legacyShapes.mjs', 'HK-FEATURE-09: historical task fixtures carry no paymentMechanism'],
      ['.gitattributes', 'HK-FEATURE-09: the LF pin of its migration'],
    ],
  },
  {
    id: 'HK-FEATURE-10 (Work / Career OS)',
    branch: 'feature/10-work-career-os',
    owned: [
      /^src\/features\/work\//, /^tests\/work\//, /^docs\/builds\/HK_FEATURE_10_/, /^scripts-dev\/f10-/, /^app\/opportunity-editor\.tsx$/,
      /^src\/domain\/opportunities\.ts$/, /^src\/domain\/foundation\/opportunity\.ts$/, /^src\/domain\/reasoning\/workCareer\.ts$/,
      // F10's branch wrote its table into the shipping migration; the integration moved it into this additive migration (HK13-D01).
      /^supabase\/migrations\/20260922181000_f10_career_opportunities\.sql$/,
    ],
    migrations: ['supabase/migrations/20260922181000_f10_career_opportunities.sql'],
    schemas: ['CareerOpportunitySchema', 'DependencyRefSchema'],
    rootCollections: ['careerOpportunities'],
    syncKinds: ['opportunity'],
    shared: [
      ['app/_layout.tsx', 'HK-FEATURE-10: the opportunity editor is a guarded modal route, like the task and event editors'],
      ['src/domain/routeAccess.ts', 'HK-FEATURE-10: route access for opportunity-editor'],
      ['src/domain/foundation/structure.ts', 'HK-FEATURE-10: a Dependency endpoint may be an opportunity (DependencyRefSchema)'],
      ['src/domain/foundation/typedRef.ts', 'HK-FEATURE-10: the opportunity typed-reference kind'],
      ['src/domain/structure.ts', 'HK-FEATURE-10: dependency commands accept an opportunity endpoint'],
      ['src/domain/state.ts', 'HK-FEATURE-10: the careerOpportunities root and its integrity checks'],
      ['src/state/initialState.ts', 'HK-FEATURE-10: careerOpportunities starts empty'],
      ['src/data/seed/demoHousehold.ts', 'HK-FEATURE-10: the fictional demo household carries opportunities'],
      ['src/persistence/migrateV3ToV4.ts', 'HK-FEATURE-10: a v3 save migrates with careerOpportunities empty'],
      ['src/domain/reasoning/attention.ts', 'HK-FEATURE-10: opportunity_follow_up attention, from a date she recorded'],
      ['src/domain/sync/foundationSpecs.ts', 'HK-FEATURE-10: the opportunity kind in the foundation manifest'],
      ['supabase/tools/gen-foundation-sql.mjs', 'HK-FEATURE-10: the generator emits the opportunity kind and the dependency endpoint columns'],
      ['src/domain/sync/apply.ts', 'HK-FEATURE-10: the foundation-kind count in a comment'],
      ['src/domain/sync/projection.ts', 'HK-FEATURE-10: the foundation-kind count in a comment'],
      ['src/domain/sync/syncTypes.ts', 'HK-FEATURE-10: the foundation-kind count in a comment'],
      ['src/domain/sync/foundationProjection.ts', 'HK-FEATURE-10: the foundation-kind count in a comment'],
      ['src/features/systems/model/detail.ts', 'HK-FEATURE-10: a routine\'s detail names an opportunity endpoint of a dependency'],
      ['src/features/systems/model/types.ts', 'HK-FEATURE-10: the same, typed'],
      ['src/features/today/model/attentionView.ts', 'HK-FEATURE-10: Today words opportunity_follow_up attention'],
      ['src/features/today/model/refs.ts', 'HK-FEATURE-10: Today opens the opportunity editor from that item'],
      ['src/features/today/model/types.ts', 'HK-FEATURE-10: the opportunity-editor Today route'],
      ['supabase/tests/57-foundation-rls.sql', 'HK-FEATURE-10: RLS checks for opportunity-ended dependencies'],
      ['supabase/tests/58-foundation-integrity.sql', 'HK-FEATURE-10: integrity checks for opportunity-ended dependencies'],
      ['supabase/tests/00-interlock.sql', 'HK-FEATURE-10: the application table count gains career_opportunities'],
      ['supabase/tests/run.mjs', 'HK-FEATURE-10: the harness carries the opportunity table'],
      ['tests/monetization.test.mjs', 'HK-FEATURE-10: the opportunity editor is one more never-paywalled root screen'],
      ['tests/foundationSpecs.test.mjs', 'HK-FEATURE-10: manifest counts gain the opportunity kind'],
      ['tests/hk-ir01/changeBridge.test.mjs', 'HK-FEATURE-10: the sync-kind inventory gains opportunity'],
      ['tests/support/legacyShapes.mjs', 'HK-FEATURE-10: historical fixtures carry no careerOpportunities'],
      ['tests/support/richHousehold.mjs', 'HK-FEATURE-10: one opportunity row'],
    ],
  },
  {
    id: 'HK-FEATURE-11 (Me / Rebuild OS)',
    branch: 'feature/11-me-rebuild-os',
    owned: [
      /^src\/features\/rebuild\//, /^src\/domain\/rebuild\//, /^tests\/rebuild\//, /^docs\/builds\/HK_FEATURE_11_/, /^scripts-dev\/rebuild-/,
      /^app\/\(app\)\/life\/rebuild\.tsx$/, /^supabase\/tests\/78-f11-/, /^supabase\/tests\/journey-rebuild\.mjs$/, /^supabase\/tools\/f11-fingerprint\.mjs$/,
      /^supabase\/tools\/baselines\/(f11|wave3-base)-local-fingerprint\.json$/,
      // Renamed from 20260922180000 by the integration: F09, F11 and F12 all claimed that version (HK13-D02).
      /^supabase\/migrations\/20260922182000_f11_rebuild_focus\.sql$/,
    ],
    migrations: ['supabase/migrations/20260922182000_f11_rebuild_focus.sql'],
    schemas: ['RebuildFocusSchema', 'RebuildFocusLinkSchema', 'FocusTargetSchema'],
    rootCollections: ['rebuildFocuses', 'rebuildFocusLinks'],
    syncKinds: ['rebuildFocus', 'rebuildFocusLink'],
    shared: [
      ['app/(app)/life/index.tsx', 'HK-FEATURE-11: the Me / Rebuild row on the Life hub'],
      ['src/domain/state.ts', 'HK-FEATURE-11: the rebuildFocuses and rebuildFocusLinks roots and their integrity checks'],
      ['src/state/initialState.ts', 'HK-FEATURE-11: both roots start empty'],
      ['src/data/seed/demoHousehold.ts', 'HK-FEATURE-11: the demo household\'s roots'],
      ['src/domain/sync/foundationSpecs.ts', 'HK-FEATURE-11: the rebuildFocus and rebuildFocusLink kinds in the manifest'],
      ['supabase/tools/gen-foundation-sql.mjs', 'HK-FEATURE-11: the generator emits the Rebuild kinds into their own migration'],
      ['src/domain/sync/clash.ts', 'HK-FEATURE-11: two devices connecting the same item to the same Focus made one connection'],
      ['src/platform/supabaseSyncTransport.ts', 'HK-FEATURE-11: a refused row\'s values never reach sync evidence; the live-link unique index is a domain invariant'],
      ['supabase/tests/private-stack.mjs', 'HK-FEATURE-11: the private stack applies the Rebuild migration'],
      ['supabase/tests/run.mjs', 'HK-FEATURE-11: the harness applies the Rebuild migration and runs its suite and journey'],
      ['supabase/tests/00-interlock.sql', 'HK-FEATURE-11: the application table count gains the two Rebuild tables'],
      ['tests/foundationSpecs.test.mjs', 'HK-FEATURE-11: manifest counts gain the two Rebuild kinds'],
      ['tests/hk-ir01/changeBridge.test.mjs', 'HK-FEATURE-11: the sync-kind inventory gains the two Rebuild kinds'],
      ['tests/support/legacyShapes.mjs', 'HK-FEATURE-11: historical fixtures carry no Rebuild roots'],
      ['tests/support/richHousehold.mjs', 'HK-FEATURE-11: one Focus and one Focus link'],
      ['.gitattributes', 'HK-FEATURE-11: the LF pin of its migration'],
    ],
  },
  {
    id: 'HK-FEATURE-12 (Life Admin / Documents)',
    branch: 'feature/12-life-admin-documents',
    owned: [
      /^src\/features\/lifeAdmin\//, /^tests\/lifeAdmin\//, /^docs\/builds\/HK_FEATURE_12_/, /^scripts-dev\/life-admin-/, /^app\/\(app\)\/life\/admin\.tsx$/,
      /^src\/domain\/lifeRecords\.ts$/, /^src\/data\/seed\/demoLifeRecords\.ts$/, /^supabase\/tests\/7[89]-f12-/, /^supabase\/tests\/journey-life-admin\.mjs$/,
      /^supabase\/tests\/run-f12\.mjs$/, /^supabase\/tools\/f12-fingerprint\.mjs$/, /^supabase\/tools\/baselines\/f12-local-fingerprint\.json$/,
      // Renamed from 20260922180000 by the integration (HK13-D02).
      /^supabase\/migrations\/20260922183000_f12_life_records\.sql$/,
    ],
    migrations: ['supabase/migrations/20260922183000_f12_life_records.sql'],
    schemas: ['LifeRecordSchema', 'LifeRecordTaskLinkSchema'],
    rootCollections: ['lifeRecords', 'lifeRecordLinks'],
    syncKinds: ['lifeRecord', 'lifeRecordLink'],
    shared: [
      ['app/(app)/life/index.tsx', 'HK-FEATURE-12: the Life Admin row on the Life hub (a count only)'],
      ['src/domain/state.ts', 'HK-FEATURE-12: the lifeRecords and lifeRecordLinks roots and their integrity checks'],
      ['src/state/initialState.ts', 'HK-FEATURE-12: both roots start empty'],
      ['src/data/seed/demoHousehold.ts', 'HK-FEATURE-12: the demo household\'s records'],
      ['src/domain/account/claim.ts', 'HK-FEATURE-12: a household holding only records is content, not empty'],
      ['src/domain/sync/syncTypes.ts', 'HK-FEATURE-12: lifeRecord and lifeRecordLink registered by hand as core sync kinds'],
      ['src/domain/sync/syncKinds.ts', 'HK-FEATURE-12: the two kinds\' collections'],
      ['src/domain/sync/claimSeam.ts', 'HK-FEATURE-12: the claim seam finds the two kinds\' rows'],
      ['src/domain/sync/apply.ts', 'HK-FEATURE-12: the two kinds are applied'],
      ['src/domain/sync/projection.ts', 'HK-FEATURE-12: the two kinds are projected'],
      ['src/platform/supabaseSyncTransport.ts', 'HK-FEATURE-12: a refused row\'s values never reach sync evidence'],
      ['supabase/tests/private-stack.mjs', 'HK-FEATURE-12: the private stack applies the Life Admin migration'],
      ['supabase/tests/run.mjs', 'HK-FEATURE-12: the harness applies the Life Admin migration and runs its suites and journey'],
      ['supabase/tests/00-interlock.sql', 'HK-FEATURE-12: the application table count gains the two Life Admin tables'],
      ['supabase/tools/README.md', 'HK-FEATURE-12: the prefixed harness and the F12 fingerprint tool'],
      ['tests/hk-ir01/changeBridge.test.mjs', 'HK-FEATURE-12: the sync-kind inventory gains the two Life Admin kinds'],
      ['tests/support/legacyShapes.mjs', 'HK-FEATURE-12: historical fixtures carry no Life Admin roots'],
      ['.gitattributes', 'HK-FEATURE-12: the LF pin of its migration'],
    ],
  },
  {
    id: 'HK-FEATURE-13 (People OS)',
    branch: 'feature/13-people-os',
    owned: [
      /^src\/features\/people\//, /^src\/domain\/people\.ts$/, /^src\/domain\/foundation\/personContext\.ts$/, /^src\/data\/seed\/demoPeople\.ts$/,
      /^app\/\(app\)\/life\/(people|person|person-add|person-follow-up)\.tsx$/, /^tests\/people\//, /^docs\/builds\/HK_FEATURE_13_/,
      /^supabase\/tests\/79-f13-/, /^supabase\/tests\/run-f13\.mjs$/, /^supabase\/migrations\/20260922200000_f13_people_os\.sql$/, /^scripts-dev\/f13-/,
      /^supabase\/tests\/journey-people\.mjs$/, /^supabase\/tools\/baselines\/f13-local-fingerprint\.json$/,
    ],
    migrations: ['supabase/migrations/20260922200000_f13_people_os.sql'],
    schemas: ['PersonContextSchema', 'PersonTaskLinkSchema'],
    rootCollections: ['personContexts', 'personTaskLinks'],
    syncKinds: ['personContext', 'personTaskLink'],
    // (Corrected by the integration: F13 also claimed supabase/tests/sync-integration.mjs and journey-composition.mjs, which its
    // branch never changed — check H — and relied on Meals-line reasons for the five files it did change that are listed last.)
    shared: [
      ['src/domain/sync/foundationSpecs.ts', 'HK-FEATURE-13: two People kinds in the one foundation manifest, generated into their own additive migration'],
      ['supabase/tools/gen-foundation-sql.mjs', 'HK-FEATURE-13: the generator emits an additive migration\'s kinds there, never into the shipping migration'],
      ['src/state/initialState.ts', 'HK-FEATURE-13: the two People collections start empty'],
      ['tests/foundationSpecs.test.mjs', 'HK-FEATURE-13: manifest counts 18 -> 20, each kind checked in its own migration'],
      ['tests/hk-ir01/changeBridge.test.mjs', 'HK-FEATURE-13: the sync kind inventory gains the two People kinds'],
      ['supabase/tests/run.mjs', 'HK-FEATURE-13: the harness applies the additive People migration'],
      ['supabase/tests/00-interlock.sql', 'HK-FEATURE-13: the application table count is 36 once the two People tables exist'],
      ['supabase/tests/private-stack.mjs', 'HK-FEATURE-13: the private stack applies the People migration'],
      ['scripts-dev/meals-boundary-scan.cjs', 'HK-FEATURE-13: registered its own lane in this register'],
      ['src/domain/state.ts', 'HK-FEATURE-13: the personContexts and personTaskLinks roots and their integrity checks'],
      ['src/data/seed/demoHousehold.ts', 'HK-FEATURE-13: the demo household\'s people context'],
      ['tests/support/legacyShapes.mjs', 'HK-FEATURE-13: historical fixtures carry no People roots'],
      ['tests/support/richHousehold.mjs', 'HK-FEATURE-13: one person context and one follow-up link'],
      ['.gitattributes', 'HK-FEATURE-13: the LF pin of its migration'],
    ],
  },
  {
    id: 'HK-F01-F13 integration (INT13 / AUD13)',
    branch: null,
    owned: [
      /^docs\/audits\/HK_F01_F13_/, /^tests\/hk-f01f13\//, /^tests\/migrationChain\.test\.mjs$/, /^supabase\/tests\/migration-chain\.mjs$/,
      /^src\/features\/life\/lifeHubCopy\.ts$/, /^supabase\/tools\/int13-/, /^supabase\/tools\/baselines\/int13-/, /^supabase\/tests\/\d+-int13-/, /^scripts-dev\/int13-/,
      /^supabase\/migrations\/20260922210000_int13_per_owner_uniqueness\.sql$/,
      // AUD13-03: the rule that keeps an earlier day's unsent One Move on the device (HK13-D28), and ENV F's population (HK13-D27).
      /^src\/domain\/sync\/keptLocal\.ts$/, /^supabase\/tests\/helpers\/2\d-wave3-/,
      // AUD13-07: a co-parenting handoff is recognised in one read-only place and handed to Co-Parent by Life (HK13-D35).
      /^src\/domain\/handoffs\.ts$/, /^src\/features\/life\/HandoffKeptHere\.tsx$/,
    ],
    // HK13-D24: the integration's own repair re-issues four existing uniqueness rules per owner; it creates no table, column or kind.
    migrations: ['supabase/migrations/20260922210000_int13_per_owner_uniqueness.sql'],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['supabase/tests/run.mjs', 'INT13-01: one migration chain for every mode, the migration gate, fresh install and the populated upgrade through F13 (HK13-D01..D04); AUD13-03: ENV D applies F08 in chain order (HK13-D27) and ENV F upgrades a populated WAVE3_BASE-era database; AUD13-12: the Co-Parent journey runs with every other journey on the whole chain (HK13-D43)'],
      ['supabase/tests/journey-coparent.mjs', 'AUD13-12: the Co-Parent journey reads the stack database it is given (the private stack under run.mjs), as the Kids journey does (HK13-D43)'],
      ['src/domain/sync/pushEngine.ts', 'AUD13-03: an earlier day\'s One Move the cloud never saw, and the facts about it, stay on the device — sent, it would land as today\'s (HK13-D28)'],
      ['src/domain/sync/changeBridge.ts', 'AUD13-03: the queue top-up does not owe the cloud an earlier day\'s unsent One Move or a fact about one (HK13-D28)'],
      ['scripts-dev/ir01-mutation-check.cjs', 'AUD13-06: two IR01 mutants re-anchored after the integration moved the lines they guard (HK13-D30)'],
      ['scripts-dev/f05-mutation-check.cjs', 'AUD13-09: two F05 SQL mutants target the LIVE sync_push (the last declaration), not F05\'s superseded copy (HK13-D39)'],
      ['supabase/tests/private-stack.mjs', 'INT13-01: the private stack builds the whole chain and names both stack databases (HK13-D06)'],
      ['supabase/tools/gen-foundation-sql.mjs', 'INT13-01: one additive-migration mechanism for F10, F11 and F13, and the dependencies widening (HK13-D05)'],
      ['src/domain/sync/foundationSpecs.ts', 'INT13-00/01: the union of four manifests, one migration field, REF_EXTENSIONS (HK13-D05)'],
      ['src/domain/sync/syncTypes.ts', 'INT13-00/01: the union of F09, F10 and F12; the renamed F12 migration in a comment'],
      ['src/domain/sync/apply.ts', 'INT13-00: the union of F09, F10 and F12'],
      ['src/domain/sync/projection.ts', 'INT13-00: the union of F09, F10 and F12'],
      ['src/domain/reasoning/attention.ts', 'INT13-00: the union of F09 (autopay) and F10 (opportunity follow-up)'],
      ['src/platform/supabaseSyncTransport.ts', 'INT13-00: one redaction implementation where F11 and F12 each wrote one (HK13-D07); AUD13-01b: the two person-context unique indexes are domain invariants (HK13-D13)'],
      ['src/domain/sync/clash.ts', 'AUD13-01b: two devices\' contexts for one person are ONE context — adopted, never minted beside it (HK13-D13)'],
      ['src/domain/sync/pullEngine.ts', 'AUD13-01b: an adoption whose words differed is recorded as evidence; adopt never re-points a mapped row (HK13-D13)'],
      ['src/domain/categories.ts', 'AUD13-02a: scopeForNewRow — a new row takes its category\'s visibility (HK13-D14)'],
      ['src/domain/interpretations.ts', 'AUD13-02a: an accepted Talk It Out capture takes its category\'s visibility (HK13-D14)'],
      ['src/features/tasks/TaskForm.tsx', 'AUD13-02a: a new task (and a Needs Me promotion) takes its category\'s visibility (HK13-D14); AUD13-04c: completing a Money item says "Mark paid" / "Mark received" (HK13-D19)'],
      ['src/features/calendar/EventForm.tsx', 'AUD13-02a: a new event takes its category\'s visibility (HK13-D14); AUD13-07: a co-parenting handoff is never edited here, it is handed to Co-Parent (HK13-D35)'],
      ['src/features/calendar/CalendarScreen.tsx', 'AUD13-07: tapping a co-parenting handoff opens it in Co-Parent, not the generic event form (HK13-D35)'],
      ['src/features/today/model/refs.ts', 'AUD13-07: an event opens its editor, a co-parenting handoff opens in Co-Parent (HK13-D35)'],
      ['src/features/today/model/types.ts', 'AUD13-07: Today may open Co-Parent for a handoff (HK13-D35)'],
      ['src/features/today/model/mattersView.ts', 'AUD13-07: a handoff on today\'s list opens in Co-Parent (HK13-D35)'],
      ['src/features/today/model/oneMoveView.ts', 'AUD13-07: a One Move on a handoff opens it in Co-Parent (HK13-D35)'],
      ['src/features/kids/containers.tsx', 'AUD13-07: a co-parenting handoff opens in Co-Parent; the Kids editor never edits one (HK13-D35)'],
      ['src/features/people/ui/PersonDetailView.tsx', 'AUD13-06: a save failure or refusal is not shown in plum (HK13-D31)'],
      ['src/features/people/ui/AddPersonView.tsx', 'AUD13-06: a save failure or refusal is not shown in plum (HK13-D31)'],
      ['src/features/people/ui/FollowUpFormView.tsx', 'AUD13-06: a save failure or refusal is not shown in plum (HK13-D31)'],
      ['src/features/people/containers.tsx', 'AUD13-06: a refusal is not shown in plum (HK13-D31)'],
      ['src/domain/state.ts', 'INT13-00: the union of four roots; AUD13-01: every later root defaults to [] so an older save loads (HK13-D08)'],
      ['src/domain/account/claim.ts', 'AUD13-01: one CONTENT_COLLECTIONS list, so no later root reads as an empty household (HK13-D09)'],
      ['src/state/initialState.ts', 'INT13-00: the union of four roots'],
      ['src/data/seed/demoHousehold.ts', 'INT13-00: the union of four features\' demo rows'],
      ['app/(app)/life/index.tsx', 'INT13-02: the reconciled Life hub: two sections, every area reachable, truthful copy (HK13-D10); AUD13-05a: paused Focuses are named (HK13-D23)'],
      ['src/features/life/lifeStatus.ts', 'INT13-02: the co-parenting category row opens Feature 07\'s screen (HK13-D10); AUD13-05a: the Money row says only what today\'s slice shows (HK13-D23)'],
      ['supabase/tests/00-interlock.sql', 'INT13-00: the application table count is 41 with every feature\'s tables'],
      ['tests/foundationSpecs.test.mjs', 'INT13-00/01: the union of four manifests\' counts; each kind in its own migration'],
      ['tests/hk-ir01/changeBridge.test.mjs', 'INT13-00: the union of the sync-kind inventory'],
      ['tests/support/legacyShapes.mjs', 'INT13-00: the union of the later roots stripped from historical fixtures'],
      ['tests/support/richHousehold.mjs', 'INT13-00: the union of the later rows'],
      ['.gitattributes', 'INT13-01: the LF pins follow the renamed and new additive migrations'],
      ['scripts-dev/meals-boundary-scan.cjs', 'AUD13: registered F09-F12 and the integration, and made the accounting exact (HK13-D11)'],
      ['tests/meals/boundary.test.mjs', 'AUD13: the routing guarantee asks who changed a routing file, not only whether (HK13-D11)'],
      ['src/domain/oneMove.ts', 'AUD13-04b: only a duration she gave makes a task "small" or is quoted back as an estimate (HK13-D12); AUD13-04c: expected income and a pre-due autopay bill are never the One Move (HK13-D19)'],
      ['tests/oneMove.test.mjs', 'AUD13-04b: HK13-D12 coverage; a duration a test treats as hers now says it is hers (`user`)'],
      ['tests/today/components.test.mjs', 'AUD13-04b: HK13-D12 — the card quotes her own (`user`) duration'],
      ['tests/today/scenarios2.test.mjs', 'AUD13-04b: HK13-D12 — "Why this?" quotes her own duration, and nothing for the planning default'],
    ],
  },
  {
    id: 'HK-PROTOTYPE-REFINEMENTS (FR01 / Notifications / External Intelligence)',
    branch: null,
    owned: [
      /^docs\/refinements\//,
      /^app\/\+native-intent\.tsx$/,
      /^scripts-dev\/ocr-assist-mutation-check\.cjs$/,
      /^src\/domain\/account\/sessionClient\.ts$/,
      /^src\/external\//,
      /^src\/features\/calendar\/(GoogleCalendarPanel|useGoogleCalendarBridge)\.tsx?$/,
      /^src\/features\/today\/(TomorrowReminderCard|WeatherContextCard)\.tsx$/,
      /^src\/notifications\//,
      /^src\/platform\/(deviceLocation|externalIntelligenceClient|googleIdentityOAuth|localNotifications|supabaseSessionClient)\.ts$/,
      /^src\/store\/LocalNotificationProvider\.tsx$/,
      /^supabase\/blueprints\//,
      /^supabase\/functions\//,
      /^supabase\/migrations\/(20260924183000_env_function_alignment|20260925141432_external_calendar_connections)\.sql$/,
      /^tests\/weather\//,
      /^tests\/support\/googleAuth\//,
      /^tests\/(backendEnvironment|externalIntelligenceArchitecture|localNotificationArchitecture|localNotificationOwnership|localReminderPlan|sessionContinuityTransport|supabaseSessionClient|googleAuthParity)\.test\.mjs$/,
    ],
    migrations: [
      'supabase/migrations/20260924183000_env_function_alignment.sql',
      // Google Calendar: two service-only tables (RLS on, no client grant), already applied to Staging and Production.
      'supabase/migrations/20260925141432_external_calendar_connections.sql',
    ],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['.env.example', 'Prototype refinements: document backend intent and provider IDs without secrets; Weather device-location refinement: the fixed weather anchor variables are retired (Weather is located by the device, with no build-time location); Google Auth Parity: mark the per-platform Google client id variables obsolete (no longer read)'],
      ['.gitattributes', 'Prototype refinements: pin the governed function-alignment and Google Calendar migrations to LF'],
      ['app.json', 'OCR Assist refinement: register the expo-image-picker plugin (camera only; photos and microphone permissions declined) for on-device document capture; Weather device-location refinement: register expo-location (foreground/approximate only; Always, background, Motion and foreground-service off) and block Android fine location; Calendar activation: register the expo-notifications native plugin for the device-local reminder'],
      ['app/_layout.tsx', 'Notifications refinement: mount the device-local notification controller without changing household truth'],
      ['app/sign-in.tsx', 'FR01: expose the existing sign-in route as a safe reconnect path for auth-degraded accounts; Google Auth Parity: comment no longer claims availability depends on a Google client id'],
      ['eas.json', 'FR01 environment guard: declare production backend intent for candidate profiles without embedding credentials; Calendar activation: pin development builds to the Staging backend'],
      ['package.json', 'Notifications refinement: add the SDK-57 local notifications native dependency; OCR Assist refinement: add the exact expo-ocr-kit 0.1.4 pin and the image picker, manipulator and file-system dependencies; Weather device-location refinement: add expo-location (SDK 57 line) for foreground device location'],
      ['package-lock.json', 'Notifications refinement: lock the SDK-57 local notifications dependency graph; OCR Assist refinement: lock the on-device OCR and image dependencies; Weather device-location refinement: lock expo-location'],
      ['src/config/supabase.ts', 'FR01 environment guard: fail closed when a declared Her Keys environment points at the wrong Supabase project; Google Auth Parity: retire the unused per-platform Google client id config'],
      ['src/platform/googleProvider.ts', 'Google Auth Parity: one Supabase OAuth (PKCE) identity path for iOS and Android, replacing per-platform OIDC client ids'],
      ['src/platform/supabaseCloud.ts', 'Google Auth Parity: run the in-memory Supabase client with the PKCE flow so the OAuth return carries a code, never a token'],
      ['src/domain/account/accountRuntime.ts', 'FR01: install and refresh the transport session before accountBound can start sync'],
      ['src/domain/account/authState.ts', 'FR01: same-actor session recovery rotates credentials without changing household identity'],
      ['src/domain/routeAccess.ts', 'FR01: an auth-degraded bound account may open sign-in to reconnect without losing local access'],
      ['src/domain/tomorrowPreview.ts', 'Notifications refinement: expose overlap count for privacy-safe reminder planning'],
      ['src/features/calendar/CalendarScreen.tsx', 'External Intelligence refinement: compose a dormant read-only Google Calendar projection'],
      ['src/features/today/TodayBriefing.tsx', 'External Intelligence and notifications refinements: compose dormant weather and opt-in reminder surfaces'],
      ['src/platform/supabaseSyncTransport.ts', 'FR01: classify authentication failures as paused transport state rather than domain conflict evidence'],
      ['src/store/AccountProvider.tsx', 'FR01 and external refinement: own refresh lifecycle and let dormant adapters detect absent account context'],
      ['src/store/accountRuntimeInstance.ts', 'FR01 and external refinement: share the authenticated data client with session continuity and provider adapters; Google Auth Parity: register Google only where the secure credential store exists (not web)'],
      ['supabase/.gitignore', 'External Intelligence refinement: keep local Edge Function secrets out of source control'],
      ['supabase/config.toml', 'External Intelligence refinement: declare explicit JWT boundaries for dormant Edge Functions'],
      ['supabase/tests/migration-chain.mjs', 'Environment convergence: register the governed function-alignment migration in the canonical chain; Calendar activation: register the applied Google Calendar service-only migration'],
      ['tests/migrationChain.test.mjs', 'Environment convergence: validate the post-certification function-alignment segment separately from feature migrations; Calendar activation: pin the applied Calendar migration by hash and prove it service-only'],
      ['tests/accountRuntime.test.mjs', 'FR01 regression: expired-session test now exercises an explicit failed refresh rather than pre-FR01 behavior'],
      ['tests/calendarValidation.test.mjs', 'External Intelligence refinement: preserve the historical Feature 03 scan around the new provider adapter boundary'],
      ['tests/hk-f01f13/syncRegistry.test.mjs', 'Environment convergence: registry validation reads the aligned live sync_push body'],
      ['tests/routeAccess.test.mjs', 'FR01: regression coverage for auth-degraded reconnect access; Google Auth Parity: Expo Router + special files (+native-intent) are not routes'],
      ['tests/tomorrowPreview.test.mjs', 'Notifications refinement: regression coverage for overlap count'],
      ['tsconfig.json', 'External Intelligence refinement: keep Expo app typechecking separate from Deno Edge Function source'],
      ['scripts-dev/meals-boundary-scan.cjs', 'Prototype refinement accounting: register post-certification changes so the historical Meals boundary remains exact'],
    ],
  },
  {
    id: 'HK-V1-FINALIZATION-PART-1 (iOS / Android platform parity audit)',
    branch: null,
    owned: [
      /^docs\/audits\/HK_(IOS_ANDROID_PLATFORM_PARITY\.md|PLATFORM_PARITY_(REGISTRY\.json|REMOTE_CHECKS\.md)|PRE_ARTIFACT_SERVICE_CONFIG\.md)$/,
      /^assets\/her-keys-4-house(?:-adaptive-foreground)?\.png$/,
      /^src\/platform\/systemLinks\.ts$/,
      /^src\/features\/account\//,
      /^scripts-dev\/platform-parity-mutation-check\.cjs$/,
      /^tests\/platformParity\//,
    ],
    migrations: [],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['app/+native-intent.tsx', 'Platform parity audit PP-D01: the Google Calendar OAuth return is also kept from the router, so Android no longer lands on Unmatched Route after connecting'],
      ['tests/googleAuthParity.test.mjs', 'Platform parity audit PP-D02: host-independent source scan paths; PP-D01: the router hook composes the identity guard with the Calendar return'],
      ['scripts-dev/meals-boundary-scan.cjs', 'Platform parity audit: register the audit lane'],
      ['app/sign-in.tsx', 'Platform parity repair PP-D04: the existing route becomes Your Account (sign in / reconnect / connected with Sign out) through AccountPanel; PP-D03: iOS-only cross-platform provider note'],
      ['src/domain/routeAccess.ts', 'Platform parity repair PP-D04: the account modal guard opens for every non-quarantined state; PP-D21: authenticating no longer closes every screen (the stack collapsed onto Expo Router system routes mid sign-in)'],
      ['src/features/today/TodayBriefing.tsx', 'Platform parity repair PP-D04: one quiet account entry beside the existing shell notices'],
      ['tests/routeAccess.test.mjs', 'Platform parity repair PP-D04 / PP-D21: account-guard and authenticating route coverage'],
    ],
  },
  {
    id: 'HK-FE-UI-02 (frontend UI / motion polish pass)',
    branch: null,
    owned: [
      /^assets\/splash-brand\.png$/,
      /^src\/design\/motion\.ts$/,
      /^src\/design\/components\/(animated|HubHeader|TabIcon)\.tsx$/,
      /^tests\/support\/icon-stub\.tsx$/,
      /^docs\/handoffs\/HK_FRONTEND_POLISH_HANDOFF\.md$/,
    ],
    migrations: [],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['app.json', 'HK-FE-UI-02: expo-splash-screen plugin config for the launch bridge (charcoal + derived gold brand mark); expo-font plugin registered (peer of the icon family)'],
      ['app/_layout.tsx', 'HK-FE-UI-02: the native splash fades into the warm interior (setOptions duration/fade)'],
      ['app/(app)/_layout.tsx', 'HK-FE-UI-02: one tab icon family (Ionicons outline/filled) with a restrained selected-state emphasis; the AI tab label shortens to AI; structure unchanged'],
      ['app/index.tsx', 'HK-FE-UI-02: the Welcome brand bridge (one quiet gold key mark) and a deliberate entrance; copy and flow unchanged'],
      ['package.json', 'HK-FE-UI-02: add expo-splash-screen (splash config), @expo/vector-icons (the single icon family) and expo-font (its required peer), all via expo install on the SDK 57 line'],
      ['package-lock.json', 'HK-FE-UI-02: lock the presentation dependencies'],
      ['src/design/tokens.ts', 'HK-FE-UI-02: brand bridge tokens (charcoal/gold, brand moments only); no existing token changed'],
      ['src/design/components/index.ts', 'HK-FE-UI-02: export the new animated/HubHeader/TabIcon primitives'],
      ['src/design/components/intelligence.tsx', 'HK-FE-UI-02: RecommendationBlock gains an optional raised prop (default unchanged) so the One Move can own its screen'],
      ['src/design/components/SegmentBar.tsx', 'HK-FE-UI-02: opt-in animated fill settle (animated prop, default off); counts and colors unchanged'],
      ['src/design/components/systemStates.tsx', 'HK-FE-UI-02: EmptyState gains the quiet mark and a standard entrance; props unchanged'],
      ['src/features/daily-load/LoadMeter.tsx', 'HK-FE-UI-02: the load meter opts into the animated settle; load math untouched'],
      ['src/features/one-move/OneMoveCard.tsx', 'HK-FE-UI-02: the recommendation is raised; completion settles in with a deliberate entrance and a quiet check; logic unchanged'],
      ['src/features/today/TodayBriefing.tsx', 'HK-FE-UI-02: Today sections enter with a capped stagger; composition order and logic unchanged'],
      ['src/features/work/WorkOverview.tsx', 'HK-FE-UI-02: the shared HubHeader replaces the doubled WORK NOW/TODAY overlines; content unchanged'],
      ['src/features/kids/views/KidsHubView.tsx', 'HK-FE-UI-02: the Kids hub opens with the shared HubHeader (its existing intro becomes the lede)'],
      ['src/features/money/MoneyBody.tsx', 'HK-FE-UI-02: the Money hub opens with the shared HubHeader'],
      ['src/features/meals/MealsBody.tsx', 'HK-FE-UI-02: the Meals hub opens with the shared HubHeader'],
      ['src/features/meals/mealCopy.ts', 'HK-FE-UI-02: the hub lede lives in the audited copy module'],
      ['tests/support/register-jsx.mjs', 'HK-FE-UI-02: redirect @expo/vector-icons to the icon stub in the test floor'],
      ['tests/support/rn-stub.tsx', 'HK-FE-UI-02: the stub gains the Animated/Easing/AccessibilityInfo surface the motion primitives use'],
      ['scripts-dev/meals-boundary-scan.cjs', 'HK-FE-UI-02: register the polish-pass lane'],
      ['credentials.json', 'HK-FE-UI-02: pre-existing device-local credential file; out of scope, never read, staged or committed'],
    ],
  },
  {
    id: 'HK-BUILD-02 (Gemini integration / release identity / certification)',
    branch: null,
    owned: [
      /^\.github\/(CODEOWNERS|workflows\/build2-[a-z-]+\.yml)$/,
      /^docs\/build2\//,
      /^docs\/handoffs\/HK_BUILD2_GEMINI_HANDOFF\.md$/,
      /^docs\/release\/ANDROID_RELEASE_IDENTITY\.md$/,
      /^scripts\/verify-release-identity\.mjs$/,
      /^src\/features\/talk-it-out\/providerContract\.ts$/,
      /^src\/platform\/herKeysAiClient\.ts$/,
      /^supabase\/functions\/herkeys-ai\//,
      /^tests\/(build2BackendProtection|releaseIdentity|talkItOutAi)\.test\.mjs$/,
      /^tests\/fixtures\/talkItOutAi\.behavior\.json$/,
    ],
    migrations: [],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['src/domain/discovery.ts', 'Build 2: only the exact scripted topic/question/option structure of a provider turn is durable, so replay never invents the user\'s words (bac6bb6)'],
      ['src/features/talk-it-out/TalkItOutView.tsx', 'Build 2: restrained async states and a retry for a degraded Talk It Out turn'],
      ['src/features/talk-it-out/capture/copy.ts', 'Build 2: the async status and retry copy lives in the Talk It Out copy module'],
      ['src/store/TalkItOutContext.tsx', 'Build 2: Talk It Out talks to the authenticated Her Keys AI function, with the scripted path as the fallback'],
      ['src/store/accountRuntimeInstance.ts', 'Build 2: compose the Her Keys AI client with the authenticated session'],
      ['supabase/config.toml', 'Build 2: the herkeys-ai function verifies the signed-in user (verify_jwt)'],
      ['eas.json', 'Build 2: the preview profile stays on the staging backend'],
      ['package.json', 'Build 2: release-identity guard scripts (verify, preflight, EAS post-install); in-SDK patch alignment (expo 57.0.26, expo-constants 57.0.20, expo-router 57.0.24)'],
      ['package-lock.json', 'Build 2: repair the Expo worklets lockfile entry; lock the SDK 57 patch alignment'],
      ['docs/builds/BUILD4.md', 'Build 2 release identity: the Android application id is com.heykeys.app, intentionally different from iOS'],
      ['docs/builds/BUILD4_PHASE0_CHECKPOINT.md', 'Build 2 release identity: the Android application id is com.heykeys.app'],
      ['docs/builds/HK-FE-UI-01-PERMANENT.txt', 'Build 2 release identity: the Android application id is com.heykeys.app'],
      ['docs/audits/HK_IOS_ANDROID_PLATFORM_PARITY.md', 'Build 2 release identity: the Android application id is com.heykeys.app'],
      ['tests/localNotificationArchitecture.test.mjs', 'Build 2 certification: the backend boundary is a reviewed function registry with no delivery path, so herkeys-ai is allowed and a push function is not'],
      ['tests/hk-f06/homeContext.test.mjs', 'Build 2 certification: fileURLToPath, so a checkout path with a space is not read URL-encoded'],
      ['tests/hk-f06/homeMutations.test.mjs', 'Build 2 certification: fileURLToPath, so a checkout path with a space is not read URL-encoded'],
      ['tests/hk-f06/homeScenarios.test.mjs', 'Build 2 certification: fileURLToPath, so a checkout path with a space is not read URL-encoded'],
      ['tests/hk-f06/homeUi.test.mjs', 'Build 2 certification: fileURLToPath, so a checkout path with a space is not read URL-encoded'],
      ['tests/hk-f06/homeView.test.mjs', 'Build 2 certification: fileURLToPath, so a checkout path with a space is not read URL-encoded'],
      ['tests/hk-f01f13/designGuard.test.mjs', 'Build 2 certification: fileURLToPath, so a checkout path with a space is not read URL-encoded'],
      ['tests/hk-ir01/syncComposition.test.mjs', 'Build 2 certification: the observer cost budget is asked of the fastest call, not of a wall-clock mean taken under a parallel suite'],
      ['scripts-dev/meals-boundary-scan.cjs', 'Build 2 certification: register the Build 2 lane; a registered device-local file absent from the checkout is not hashed'],
    ],
  },
  // (HK-AI-02, the Talk It Out evaluation foundation, is NOT registered on this line. The welcome frontend commit carried its
  // lane entry in from a shared checkout, but none of that lane's files — tests/ai-evals/, its package.json scripts, its
  // .gitignore line — were ever committed with it, so the entry explained changes this tree does not contain and check H
  // rightly failed a clean checkout on it. The lane registers itself in the same commit as its files, as one change.)
  {
    id: 'HK-WELCOME-TREE (welcome/auth frontend shell)',
    branch: 'feature/welcome-tree-auth-frontend',
    // Stacked: forked from the Build 2 tip of this line, not from the integration checkpoint (see check H).
    base: '0cf041a2a3c77659a91c14dadb0524da63553369',
    owned: [/^src\/features\/welcome\//, /^tests\/welcomeAuthShell\.test\.mjs$/],
    migrations: [],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['app/gallery.tsx', 'Welcome tree: the internal design gallery exercises every welcome/auth state (dev-only surface; no production route or guard touched)'],
      ['app/onboarding/plus.tsx', 'Welcome tree: future-safe Her Keys+ reassurance copy ("keep using the core experience without Her Keys+"); entitlement behavior unchanged'],
      ['src/design/components/TextField.tsx', 'Welcome tree: additive passthrough props (autoCapitalize/autoCorrect/autoComplete/textContentType/returnKeyType/onSubmitEditing, error live-region) for email and one-time-code entry; every default unchanged'],
      ['docs/audits/HK_PLATFORM_PARITY_REGISTRY.json', 'Welcome tree: register PC-07/PC-08 keyboard-avoidance conditionals (same class-E pattern as PC-06)'],
      ['docs/audits/HK_IOS_ANDROID_PLATFORM_PARITY.md', 'Welcome tree: reference PC-07/PC-08 in the parity report table'],
      ['scripts-dev/meals-boundary-scan.cjs', 'Welcome tree: register the welcome-tree lane (its check-H change, which skipped every lane branch already in HEAD\u2019s history, was replaced by the welcome auth integration with the narrower stacked-lane rule)'],
    ],
  },
  {
    id: 'HK-WELCOME-AUTH-RUNTIME (welcome tree wired to the account runtime)',
    branch: 'integration/welcome-tree-auth-runtime',
    // Stacked on the welcome frontend commit.
    base: '69af50f9339f9449e6286cd7c18d8cbc59ca43db',
    owned: [
      /^src\/domain\/account\/emailOtp\.ts$/,
      /^src\/platform\/emailOtpProvider\.ts$/,
      /^src\/features\/account\/(WelcomeAuthFlow\.tsx|welcomeFlowModel\.ts)$/,
      /^tests\/(emailOtp|emailOtpProvider|welcomeAuthFlow)\.test\.mjs$/,
      /^tests\/support\/welcomeFlow\//,
      /^docs\/integration\/WELCOME_AUTH_/,
    ],
    migrations: [],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['app/index.tsx', 'Welcome auth: the entry route renders the wired welcome tree for anyone without an account-held household and hands a held, unfinished household on to its audit step; the old Begin \u2192 onboarding/goals path for a signed-out user is gone'],
      ['app/_layout.tsx', 'Welcome auth: no navigator until the stored session is resolved (the shell\u2019s settling presentation shows instead); the access input carries accountSettled'],
      ['app/sign-in.tsx', 'Welcome auth: Your Account reconnects a degraded account through the welcome tree\u2019s reconnect presentation, so an email account can come back; it no longer opens for a signed-out device'],
      ['src/domain/routeAccess.ts', 'Welcome auth: identity is part of the first-run gate \u2014 the audit and the app open only for a household held under an account, the entry is the welcome tree otherwise, and nothing opens before the account restore settles'],
      ['src/domain/account/accountRuntime.ts', 'Welcome auth: passwordless email (request / verify) through one shared session-adoption path with Apple and Google; a numbered-attempt guard drops an authentication answer that outlived its attempt'],
      ['src/domain/account/identity.ts', 'Welcome auth: AuthMethod \u2014 email is session provenance without becoming a one-step AuthProvider'],
      ['src/domain/account/secureSession.ts', 'Welcome auth: a stored session may carry email provenance; any other unknown method is still refused'],
      ['src/store/AccountProvider.tsx', 'Welcome auth: expose settled (derived from the restore, never persisted) and the two email operations; account actions resolve to the state they ended in'],
      ['src/store/accountRuntimeInstance.ts', 'Welcome auth: compose the Supabase email port on the isolated provider client and hand it to the one account runtime'],
      ['src/features/welcome/model.ts', 'Welcome auth: two wiring additions the real backend forces \u2014 an invalid-or-expired code kind (Supabase answers both identically) and an optional attempt-failed notice'],
      ['src/features/welcome/copy.ts', 'Welcome auth: copy for those two additions, and the EX-01 Apple cross-platform disclosure reused word for word from the account feature'],
      ['src/features/welcome/WelcomeAuthShell.tsx', 'Welcome auth: pass the notice to the account choice'],
      ['src/features/welcome/views/AccountChoiceView.tsx', 'Welcome auth: one quiet line for a failed attempt, and the EX-01 disclosure where Apple is offered (never on a reconnect)'],
      ['src/features/welcome/views/OtpEntryView.tsx', 'Welcome auth: copy for the invalid-or-expired code kind'],
      ['tests/routeAccess.test.mjs', 'Welcome auth: the route table\u2019s spec, restated for identity in the first-run gate (settling, signed out, resolving, held, degraded, quarantine, deep links, no guest path, no welcome-seen flag)'],
      ['tests/platformParity/accountAccess.test.mjs', 'Welcome auth: PP-D04 / PP-D21 restated \u2014 Your Account is the surface after the first run, the entry is where a first sign-in runs and stays mounted, and signing out closes the app'],
      ['tests/support/store.mjs', 'Welcome auth: the route-access helper models a household held under an account, with the restore settled'],
      ['tests/support/rn-stub.tsx', 'Welcome auth: a BackHandler stand-in, so Android hardware Back can be pressed in a component test'],
      ['tests/today/lifecycle.test.mjs', 'Welcome auth: the onboarding guard is asked of a held household, and Today is never the entry for a signed-out device'],
      ['tests/monetization.test.mjs', 'Welcome auth: comment only \u2014 Your Account stays reachable after onboarding for status, reconnect and sign out'],
      ['tests/kids/boundaries.test.mjs', 'Welcome auth: the access input carries accountSettled'],
      ['tests/people/sync.test.mjs', 'Welcome auth: the access input carries accountSettled'],
      ['tests/hk-f01f13/accountSwitch.test.mjs', 'Welcome auth: the access input carries accountSettled'],
      ['tests/hk-f01f13/integratedJourney.test.mjs', 'Welcome auth: the access input carries accountSettled'],
      ['tests/meals/boundary.test.mjs', 'Welcome auth: check H\u2019s known-invalid cases are pinned against the extracted lane-register rule'],
      ['scripts-dev/meals-boundary-scan.cjs', 'Welcome auth: check H repaired \u2014 the welcome frontend\u2019s change exempted every lane branch in HEAD\u2019s history from the holder check; only a lane that DECLARES and proves a stacked base now inherits, and its own claims are checked against that base. The unbuilt HK-AI-02 entry is removed; this lane is registered'],
    ],
  },
  {
    id: 'V2-EMAIL-PASSWORD (2026-10-08)',
    branch: 'feature/herkeys-email-password-20261008',
    // Stacked on the reviewed repair head, so this lane cannot claim its parent's repairs.
    base: '30511749a1f06682b913ec2e0da552688584245f',
    owned: [],
    migrations: [],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['.github/workflows/v2-integration-validation.yml', 'Password auth: run the same repository gate against the stacked repair branch'],
      ['docs/builds/HK_EMAIL_PASSWORD_AUTH_20261008.md', 'Password auth: implementation, confirmation and runtime acceptance limits'],
      ['docs/audits/HK_PLATFORM_PARITY_REGISTRY.json', 'iOS Apple blocker: register PC-09 so the platform check cannot silently hide the native Apple button'],
      ['docs/audits/HK_IOS_ANDROID_PLATFORM_PARITY.md', 'iOS Apple blocker: report PC-09 and pending physical-device certification'],
      ['scripts-dev/meals-boundary-scan.cjs', 'Password auth: register only this stacked branch and its actual changed files'],
      ['src/design/components/TextField.tsx', 'Password auth: masked input and password autofill props'],
      ['src/domain/account/accountRuntime.ts', 'Password auth: use the existing session adoption and account authority'],
      ['src/domain/account/emailPassword.ts', 'Password auth: result-only provider port'],
      ['src/features/account/WelcomeAuthFlow.tsx', 'Password auth: wire the additional method without storing credentials in flow state'],
      ['src/features/account/welcomeFlowModel.ts', 'Password auth: password step and confirmation/refusal states'],
      ['src/features/welcome/WelcomeAuthGalleryPreview.tsx', 'Password auth: provide inert gallery callbacks for the new step'],
      ['src/features/welcome/WelcomeAuthShell.tsx', 'Password auth: render the additional password screen'],
      ['src/features/welcome/copy.ts', 'Password auth: separate password sign-in and signup copy'],
      ['src/features/welcome/model.ts', 'Password auth: password step, callbacks and transient result notices'],
      ['src/features/welcome/views/AccountChoiceView.tsx', 'Password auth: offer password sign-in alongside existing providers'],
      ['src/features/welcome/views/EmailEntryView.tsx', 'Password auth: export the already registered keyboard behavior for reuse'],
      ['src/features/welcome/views/EmailPasswordView.tsx', 'Password auth: mounted-screen-only password input, signup confirmation and notices'],
      ['src/platform/emailPasswordProvider.ts', 'Password auth: isolated Supabase signUp/signInWithPassword adapter'],
      ['src/store/AccountProvider.tsx', 'Password auth: expose availability and the common runtime operation'],
      ['src/store/accountRuntimeInstance.ts', 'Password auth: compose the isolated provider client'],
      ['tests/accountRuntime.test.mjs', 'Password auth: shared session path and degraded-account signup refusal'],
      ['tests/emailOtpProvider.test.mjs', 'Password auth: retain the OTP provider source boundary with the new sibling'],
      ['tests/emailPassword.test.mjs', 'Password auth: session, confirmation and diagnostic redaction regressions'],
      ['tests/support/welcomeFlow/AccountProvider.tsx', 'Password auth: component host models password operations'],
      ['tests/welcomeAuthFlow.test.mjs', 'Password auth: wiring, confirmation and no credential persistence checks'],
      ['tests/welcomeAuthShell.test.mjs', 'Password auth: password screen choices and transient field behavior'],
      ['src/platform/passwordRecoveryProvider.ts', 'Password recovery: dedicated ephemeral non-persisted Supabase client, recovery OTP verified before update, local-only session close'],
      ['tests/passwordRecovery.test.mjs', 'Password recovery: rejection of premature changes, invalid codes, temporary session disposal, non-enumerating request behavior'],
    ],
  },
  {
    id: 'V2-AUDIT-LEGAL-AND-CI (2026-10-08)',
    // This repair is committed on the integrated line; no independent feature
    // branch claims the files. Check H still proves they are new here.
    branch: null,
    owned: [],
    migrations: [],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['app/(app)/systems/index.tsx', 'V2 follow-up: deliberate Systems dashboard refinement already committed on the parent repair line; unrelated to Meals'],
      ['docs/builds/HK_V2_AI_DATA_PROCESSING_CONSENT_COPY.md', 'V2 follow-up: approved AI Data Processing disclosure copy, not an implementation of consent storage'],
      ['src/monetization/entitlement.ts', 'V2 follow-up: audited existing Her Keys Premium entitlement behavior; preserve internal her_keys_plus'],
      ['src/monetization/revenueCatClient.ts', 'V2 follow-up: audited existing RevenueCat client wiring without certifying live store products'],
      ['src/config/legal.ts', 'V2 audit: owner-published Her Keys Terms and Privacy PDF links for the account choice; public URLs only, no auth or backend mutation'],
      ['.github/workflows/v2-integration-validation.yml', 'V2 audit: the isolated pull-request gate for TypeScript, app tests, Expo and release identity; it deploys nothing'],
      ['docs/audits/HK_V2_STAGING_PRODUCTION_PARITY_GATE.md', 'V2 audit: the evidence and promotion contract; no live certification or deployment'],
      ['docs/audits/HK_V2_RUNTIME_CLOSEOUT_20261008.md', 'V2 closeout: dated live evidence, failures and owner dependencies; no environment certification'],
      ['docs/audits/v2-closeout-20261008/staging-schema.csv', 'V2 closeout: read-only canonical Staging catalog fingerprint; no user data'],
      ['docs/audits/v2-closeout-20261008/production-schema.csv', 'V2 closeout: read-only canonical Production catalog fingerprint; no user data'],
      ['docs/audits/v2-closeout-20261008/staging-migrations.csv', 'V2 closeout: complete Staging ledger versions and statement hashes'],
      ['docs/audits/v2-closeout-20261008/production-migrations.csv', 'V2 closeout: complete Production ledger versions and statement hashes'],
      ['docs/audits/v2-closeout-20261008/migration-comparison.json', 'V2 closeout: compare all repository migration names, versions and source hashes to live ledgers'],
      ['docs/audits/v2-closeout-20261008/function-hashes.json', 'V2 closeout: independently downloaded deployed function source hashes; no credentials'],
      ['docs/audits/v2-closeout-20261008/staging-anonymous-smoke.json', 'V2 closeout: public Auth control and live unauthenticated denials; no fixture or user data'],
      ['docs/audits/v2-closeout-20261008/android-build-runtime.json', 'V2 closeout: exact native build and APK identity plus observed launch and blocked authentication'],
      ['docs/audits/v2-closeout-20261008/android-launch.png', 'V2 closeout: installed Android empty-mode launch evidence without user data'],
      ['docs/audits/v2-closeout-20261008/android-account.png', 'V2 closeout: native account-choice and consent handoff evidence without user data'],
      ['docs/audits/v2-closeout-20261008/android-account.xml', 'V2 closeout: UI-tree-derived account controls for emulator QA; no authenticated user data'],
      ['package.json', 'V2 closeout: only the seven SDK 57 patch mismatches reported by the compatibility check'],
      ['package-lock.json', 'V2 closeout: lock compatible SDK 57 patches and their required dependencies'],
      ['tests/welcomeAuthFlow.test.mjs', 'V2 closeout: normalize CRLF before the existing token-storage source assertion on Windows'],
      ['src/domain/account/accountRuntime.ts', 'V2 closeout: adopt an authenticated existing household only on a pristine device; durable unhydrated namespace, no local merging'],
      ['src/store/composeAccountApp.ts', 'V2 closeout: a storage recovery fallback is not eligible for pristine-device adoption'],
      ['tests/accountRuntime.test.mjs', 'V2 closeout: adoption safety, durable failure recovery and populated-device refusal regressions'],
      ['tests/hk-ir01/syncComposition.test.mjs', 'V2 closeout: real production composition adopts, hydrates, persists and isolates a fresh device; scripted cloud evidence only'],
      ['eas.json', 'V2 closeout: explicit EAS environment selection and empty data mode on every build profile'],
      ['scripts/verify-release-identity.mjs', 'V2 closeout: EAS build hook also rejects missing or crossed backend targets before bundling'],
      ['tests/releaseIdentity.test.mjs', 'V2 closeout: negative build-target checks without credentials'],
      ['src/config/supabase.ts', 'V2 closeout: require the exact Her Keys HTTPS project host rather than accepting a host prefix'],
      ['tests/backendEnvironment.test.mjs', 'V2 closeout: reject spoofed project hosts and insecure backend URLs'],
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

const MEALS_LINE = 'HK-FEATURE-08 line (Meals, AUDIT-W2, STAGING-W2)';
const MEALS_REASONS = new Map(SHARED);
const OWN_LANE = 'its own lane';

/** Every later lane that explains a change to `file`: it owns the path, or it lists the file with its reason. */
const laterReasons = (file) =>
  LATER_FEATURES.flatMap((feature) => [
    ...(feature.owned.some((re) => re.test(file)) ? [{ lane: feature.id, reason: OWN_LANE }] : []),
    ...feature.shared.filter(([shared]) => shared === file).map(([, reason]) => ({ lane: feature.id, reason })),
  ]);

/**
 * Check E for one changed file. `early`: it changed on the Wave 2 line (BASE .. the checkpoint), which is Meals-era — only a
 * Meals-line reason (OWNED / SHARED) explains that, and a PROTECTED file must not have changed there. `late`: its status since the
 * checkpoint, or null — a change made by a later lane or the integration, which only a later lane's reason explains (a Meals reason
 * there would be a misattribution). A file can be both, and then needs both.
 */
function account(file, status, early, late) {
  const findings = [];
  const later = late ? laterReasons(file) : [];
  const summary = (reasons) => ({ lanes: reasons.map((r) => r.lane), reason: reasons.map((r) => r.reason).join(' | ') });
  if (late && later.length === 0) findings.push(`E: changed after the integration checkpoint with no later lane's reason: ${late} ${file}`);
  if (OWNED.some((re) => re.test(file))) return { findings, shared: null, mealsFile: late && later.length > 0 ? { file, ...summary(later) } : null };
  if (early && PROTECTED.some((re) => re.test(file))) return { findings: [...findings, `E: PROTECTED file changed on the Wave 2 line: ${file}`], shared: null, mealsFile: null };
  if (early && !MEALS_REASONS.has(file)) findings.push(`E: unexplained shared-file change on the Wave 2 line: ${status} ${file}`);
  if (later.length > 0 && later.every((r) => r.reason === OWN_LANE)) return { findings, shared: null, mealsFile: null }; // a later lane's own file
  const reasons = [...(early && MEALS_REASONS.has(file) ? [{ lane: MEALS_LINE, reason: MEALS_REASONS.get(file) }] : []), ...later];
  return { findings, shared: reasons.length > 0 ? { file, status, ...summary(reasons) } : null, mealsFile: null };
}

/**
 * Check H, as a rule over facts (no git here, so it can be held to cases the real tree does not contain).
 *
 *   lanes[]: { id, branch, base, shared: [file], present, baseProved, changed: Set<file>, versions: Map<file, blob>,
 *              baseVersions: Map<file, blob> | null }   — every lane that names a branch
 *   checkpointVersions: Map<file, blob>, held: [[file, blob]] — each integration-claimed file as the working tree holds it
 *
 * 1. A lane may explain only what its own history changed. Each `shared` file must be in `changed` — which is measured from the
 *    checkpoint for a parallel lane and from its base for a stacked one, so a stacked lane cannot claim what the line had already
 *    done before it forked.
 * 2. A file the integration claims must be held here in a version nobody else made. A witness that holds the exact version refutes
 *    the claim: the checkpoint, and EVERY parallel lane's branch — merged into HEAD or not. (Skipping a branch because it is
 *    already in HEAD's history would drop every merged lane, which is nearly all of them, and with them the check.)
 * 3. A stacked lane is a witness only for what it changed itself. When it is the one holding the working version, it made that
 *    version ON TOP of the line, so the integration's claim is judged where the lane started: the version at its base must in
 *    turn be one nobody else made. If the file did not exist there, or a witness already held that version, the integration never
 *    changed it and the claim is false.
 * 4. A lane whose branch is not present is reported as unverified, never as a pass; a stacked base that cannot be proved is a
 *    finding, and that lane inherits nothing.
 */
function laneRegister({ checkpoint, checkpointVersions, lanes, held }) {
  const overclaims = [];
  const unverified = [];
  // [who, the versions they answer for, where a stacked lane started (null: a parallel witness)]
  const witnesses = [[checkpoint, checkpointVersions, null]];

  for (const lane of lanes) {
    if (!lane.present) {
      unverified.push(lane.id);
      continue;
    }
    if (!lane.baseProved) {
      overclaims.push(`${lane.id} declares base ${lane.base}, which is not a commit of this line that ${lane.branch} grew from`);
      continue;
    }
    for (const file of lane.shared) if (!lane.changed.has(file)) overclaims.push(`${lane.id} claims ${file}, which ${lane.branch} never changed`);
    if (lane.baseVersions === null) {
      witnesses.push([lane.branch, lane.versions, null]);
    } else {
      const own = new Map([...lane.versions].filter(([file, blob]) => lane.baseVersions.get(file) !== blob));
      witnesses.push([lane.branch, own, lane.baseVersions]);
    }
  }

  for (const [file, blob] of held) {
    let version = blob;
    // Each step moves to an earlier point on the line; the bound only guards against a register that contradicts itself.
    for (let step = 0; step <= witnesses.length; step++) {
      const holder = witnesses.find(([, map]) => map.get(file) === version);
      if (!holder) break; // nobody else made this version: it is the integration's own
      const [who, , startedFrom] = holder;
      if (startedFrom === null) {
        overclaims.push(
          version === blob
            ? `the integration claims ${file}, but ${who} already holds this exact version`
            : `the integration claims ${file}, but only a stacked lane changed it: beneath that lane, ${who} already held the line's version`
        );
        break;
      }
      version = startedFrom.get(file);
      if (version === undefined) {
        overclaims.push(`the integration claims ${file}, but ${who} created it`);
        break;
      }
    }
  }
  return { overclaims, unverified };
}

function changedFiles(from = BASE) {
  const files = new Map();
  for (const line of git('diff', '--name-status', from).split('\n')) {
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
  const CHECKPOINT = INTEGRATION_CHECKPOINTS[INTEGRATION_CHECKPOINTS.length - 1];
  // Who could have made a change: the Wave 2 line (Meals era) between BASE and the checkpoint, a later lane after it. Both can hold.
  const onWave2Line = new Set(git('diff', '--name-only', BASE, CHECKPOINT).split('\n').filter(Boolean));
  const sinceCheckpoint = changedFiles(CHECKPOINT);
  const laterMigrations = new Set(LATER_FEATURES.flatMap((feature) => feature.migrations));
  const laterSchemas = new Set(LATER_FEATURES.flatMap((feature) => feature.schemas));
  const laterRoots = new Set(LATER_FEATURES.flatMap((feature) => feature.rootCollections));
  const laterKinds = new Set(LATER_FEATURES.flatMap((feature) => feature.syncKinds));
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

  // D. new sync kinds (a registered later lane's own kinds are its lane). A kind registered through the foundation manifest is a sync
  // kind exactly as a core one is; reading only CORE_SYNC_KINDS left every manifest kind invisible here (HK13-D22).
  const syncKindsIn = (read) => new Set([
    ...(arrayItems(read('src/domain/sync/syncTypes.ts'), 'CORE_SYNC_KINDS') ?? []),
    ...(arrayItems(read('src/domain/sync/foundationSpecs.ts'), 'FOUNDATION_KIND_NAMES') ?? []),
  ]);
  const rawKindDiff = diff(syncKindsIn(atBase), syncKindsIn(now));
  const kindDiff = { added: rawKindDiff.added.filter((kind) => !laterKinds.has(kind)), removed: rawKindDiff.removed };
  facts.newSyncKinds = kindDiff.added;
  // What the registered lanes added, as seen here: proof the scan sees every sync kind, manifest ones included.
  facts.laterSyncKinds = rawKindDiff.added.filter((kind) => laterKinds.has(kind));
  if (kindDiff.added.length > 0 || kindDiff.removed.length > 0) findings.push(`D: sync kinds changed: +[${kindDiff.added}] -[${kindDiff.removed}]`);

  // E. every change accounted for by who could have made it (see account() below).
  facts.sharedFileChanges = [];
  facts.laterChangesToMealsFiles = [];
  for (const [file, status] of changed) {
    const verdict = account(file, status, onWave2Line.has(file), sinceCheckpoint.get(file) ?? null);
    findings.push(...verdict.findings);
    if (verdict.shared) facts.sharedFileChanges.push(verdict.shared);
    if (verdict.mealsFile) facts.laterChangesToMealsFiles.push(verdict.mealsFile);
  }
  facts.mealsLine = MEALS_LINE;

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
  // `feature/*`, not `feature/0*`: a Feature 10+ branch reaching HEAD unregistered is exactly what this asks about. A registered later
  // lane's branch is merged into this line on purpose, and everything it changed is accounted for above (checks A-E) and below (H).
  const laneBranches = new Set(LATER_FEATURES.map((feature) => feature.branch).filter(Boolean));
  for (const branch of git('branch', '--list', 'feature/*', 'validate/*', 'audit/hk-*').split('\n').map((b) => b.replace(/^[*+ ]+/, '').trim()).filter(Boolean)) {
    if (branch === 'feature/08-meals-os' || laneBranches.has(branch)) continue;
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

  // H. the register is true. A lane may explain only what its own history changed, or a claim could hide another change behind it:
  // every file a feature lane lists as shared must differ between the checkpoint and that lane's branch, and every file the
  // integration lists must be held here in a version that neither the checkpoint nor any lane branch holds (the integration's own
  // union, reconciliation or repair). A lane whose branch is not present locally is reported as unverified, not as a pass.
  //
  // A lane is PARALLEL by default: forked from the checkpoint and merged back. A lane may instead be STACKED — forked from a later
  // commit of this line, which it declares as `base`. A stacked lane inherits every version the line held at its base, so its
  // branch holding a version proves nothing about who made it; only what it changed AFTER its base is its own. The declaration is
  // proved here, never trusted: the base must be a commit of this line (the checkpoint is its ancestor) that the lane's branch
  // grew from. Everything else — the facts gathered below, the rule itself — is `laneRegister`, which the tests hold to its
  // known-invalid cases on data the real tree does not exercise.
  const isCommit = (rev) => gitOk('rev-parse', '--verify', '--quiet', `${rev}^{commit}`).ok;
  const isAncestor = (older, newer) => gitOk('merge-base', '--is-ancestor', older, newer).ok;
  const integrationFiles = [...new Set(LATER_FEATURES.filter((feature) => feature.branch === null).flatMap((feature) => feature.shared.map(([file]) => file)))];
  const versions = (rev) =>
    integrationFiles.length === 0
      ? new Map()
      : new Map(git('ls-tree', '-r', rev, '--', ...integrationFiles).split('\n').filter(Boolean).map((line) => [line.split('\t')[1], line.split(/\s+/)[2]]));
  const lanes = LATER_FEATURES.filter((feature) => feature.branch !== null).map((feature) => {
    const lane = { id: feature.id, branch: feature.branch, base: feature.base ?? null, shared: feature.shared.map(([file]) => file) };
    if (!isCommit(feature.branch)) return { ...lane, present: false };
    const baseProved = !feature.base || (isCommit(feature.base) && isAncestor(CHECKPOINT, feature.base) && isAncestor(feature.base, feature.branch));
    if (!baseProved) return { ...lane, present: true, baseProved: false };
    return {
      ...lane,
      present: true,
      baseProved: true,
      // What the lane's own history changed: since the checkpoint for a parallel lane, since its base for a stacked one.
      changed: new Set(git('diff', '--name-only', feature.base ?? CHECKPOINT, feature.branch).split('\n').filter(Boolean)),
      versions: versions(feature.branch),
      baseVersions: feature.base ? versions(feature.base) : null,
    };
  });
  // Only a file in the working tree has a version to compare: a registered device-local file (never committed, absent from a
  // clean checkout or CI) cannot be held by any branch, and `git hash-object` is fatal on a path that does not exist.
  const inTree = integrationFiles.filter((file) => fs.existsSync(path.join(ROOT, file)));
  const here = inTree.length > 0 ? git('hash-object', '--', ...inTree).split('\n').filter(Boolean) : [];
  const register = laneRegister({ checkpoint: CHECKPOINT, checkpointVersions: versions(CHECKPOINT), lanes, held: inTree.map((file, i) => [file, here[i]]) });
  facts.unverifiedLanes = register.unverified;
  const overclaims = register.overclaims;
  facts.laneOverclaims = overclaims;
  if (overclaims.length > 0) findings.push(`H: a lane explains a change it did not make: ${overclaims.join('; ')}`);

  return { ok: findings.length === 0, base: BASE, findings, facts };
}

// Required (not run) by tests/meals/boundary.test.mjs, which holds account() to its rules on files the real tree does not exercise.
module.exports = { account, laneRegister, LATER_FEATURES, MEALS_LINE };
if (require.main !== module) return;

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
  console.log('  H lane register            :', result.facts.laneOverclaims.join(', ') || 'true',
    result.facts.unverifiedLanes.length > 0 ? `| unverified (branch not present): ${result.facts.unverifiedLanes.join(', ')}` : '');
  console.log(result.ok ? '\nRESULT: PASS' : `\nRESULT: FAIL\n  ${result.findings.join('\n  ')}`);
}
process.exit(result.ok ? 0 : 1);
