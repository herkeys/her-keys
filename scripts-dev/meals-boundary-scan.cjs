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
    ],
    // HK13-D24: the integration's own repair re-issues four existing uniqueness rules per owner; it creates no table, column or kind.
    migrations: ['supabase/migrations/20260922210000_int13_per_owner_uniqueness.sql'],
    schemas: [],
    rootCollections: [],
    syncKinds: [],
    shared: [
      ['supabase/tests/run.mjs', 'INT13-01: one migration chain for every mode, the migration gate, fresh install and the populated upgrade through F13 (HK13-D01..D04); AUD13-03: ENV D applies F08 in chain order (HK13-D27) and ENV F upgrades a populated WAVE3_BASE-era database'],
      ['src/domain/sync/pushEngine.ts', 'AUD13-03: an earlier day\'s One Move the cloud never saw, and the facts about it, stay on the device — sent, it would land as today\'s (HK13-D28)'],
      ['src/domain/sync/changeBridge.ts', 'AUD13-03: the queue top-up does not owe the cloud an earlier day\'s unsent One Move or a fact about one (HK13-D28)'],
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
      ['src/features/calendar/EventForm.tsx', 'AUD13-02a: a new event takes its category\'s visibility (HK13-D14)'],
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
  facts.unverifiedLanes = [];
  const overclaims = [];
  const present = LATER_FEATURES.filter((feature) => feature.branch && gitOk('rev-parse', '--verify', '--quiet', `${feature.branch}^{commit}`).ok);
  for (const feature of LATER_FEATURES) {
    if (feature.branch === null) continue;
    if (!present.includes(feature)) {
      facts.unverifiedLanes.push(feature.id);
      continue;
    }
    const onBranch = new Set(git('diff', '--name-only', CHECKPOINT, feature.branch).split('\n').filter(Boolean));
    for (const [file] of feature.shared) if (!onBranch.has(file)) overclaims.push(`${feature.id} claims ${file}, which ${feature.branch} never changed`);
  }
  const integrationFiles = LATER_FEATURES.filter((feature) => feature.branch === null).flatMap((feature) => feature.shared.map(([file]) => file));
  if (integrationFiles.length > 0) {
    const versions = (rev) => new Map(git('ls-tree', '-r', rev, '--', ...integrationFiles).split('\n').filter(Boolean).map((line) => [line.split('\t')[1], line.split(/\s+/)[2]]));
    const held = [CHECKPOINT, ...present.map((feature) => feature.branch)].map((rev) => [rev, versions(rev)]);
    const here = git('hash-object', '--', ...integrationFiles).split('\n').filter(Boolean);
    integrationFiles.forEach((file, i) => {
      const holder = held.find(([, map]) => map.get(file) === here[i]);
      if (holder) overclaims.push(`the integration claims ${file}, but ${holder[0]} already holds this exact version`);
    });
  }
  facts.laneOverclaims = overclaims;
  if (overclaims.length > 0) findings.push(`H: a lane explains a change it did not make: ${overclaims.join('; ')}`);

  return { ok: findings.length === 0, base: BASE, findings, facts };
}

// Required (not run) by tests/meals/boundary.test.mjs, which holds account() to its rules on files the real tree does not exercise.
module.exports = { account, LATER_FEATURES, MEALS_LINE };
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
