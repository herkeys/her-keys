# HK F01–F13 — Defect Ledger (P0–P10)

Campaign: **F01–F13 Full Product Integration, Hostile Audit, Backend Certification, P0–P4 Repair**
Branch: `integration/f01-f13-convergence` (worktree `C:\Users\jsmit\Her-Keys-F01-F13`), cut from WAVE3_BASE `363e473`.
Rule: P0–P3 fixed; P4 fixed **and** documented; P5–P10 documented (repaired only when trivial, local and risk-free).

This ledger is written as findings are made, not reconstructed afterwards. Each entry records how it was found, what it would
have done, its root cause, the repair decision, the commit, and the tests that now hold it.

Severity key: P0 catastrophic · P1 product/release blocker · P2 critical correctness · P3 high · P4 medium (must repair) ·
P5 low correctness · P6 UX polish · P7 maintainability · P8 performance · P9 future improvement · P10 speculative.

## Summary

| ID | Sev | Feature(s) | Surface | Title | Status |
|---|---|---|---|---|---|
| HK13-D01 | P1 | F10 | migrations | F10 edited two already-applied migrations in place | FIXED `7c5351a` |
| HK13-D02 | P1 | F09, F11, F12 | migrations | Three migrations claimed one version `20260922180000` | FIXED `7c5351a` |
| HK13-D03 | P1 | F11, F12, F13 (+F10) | migrations / sync_push / change_log | Non-cumulative re-declarations: the last migration silently dropped its siblings' tables | FIXED `7c5351a` |
| HK13-D04 | P4 | F09 | backend harness | F09's migration was in no harness chain and the quality gate rejected it | FIXED `7c5351a` |
| HK13-D05 | P4 | F11, F13 | generator / manifest | Two incompatible "additive migration" generator mechanisms | FIXED `85c585a` |
| HK13-D06 | P4 | F12, F13 | backend harness | Private-stack override names diverged; F13's name guard rejected F12's prefixed stacks | FIXED `85c585a` |
| HK13-D07 | P5 | F11, F12 | sync transport | Two parallel "Failing row contains" redactions; F11's regex missed an unclosed row tuple | FIXED `02fa959` (trivial, local) |
| HK13-D08 | **P0** | F10 | local persistence | A household saved before F10 fails validation and is overwritten with an empty household on the first F10 launch | FIXED `d9dfa5c` |
| HK13-D09 | **P0** | F10, F11, F13 | account binding | `hasContent` ignores Work/Rebuild/People rows: after A's interrupted claim, B bootstraps and A's private rows are pushed as B's | FIXED `d9dfa5c` |
| HK13-D10 | P3 | F07, F13 | navigation / Life IA | Co-Parent (`/life/coparent`) and People (`/life/people`) have no entry point — reachable only by deep link | FIXED `b681a4c` |
| HK13-D11 | P4 | F09–F13 | exit gate (Meals boundary scan) | F09–F12 never registered their lanes: the integrated line fails the Meals exit gate, and the scan's attribution could not tell a Meals change from a later feature's | FIXED (AUD13-04) |

(Entries below are added as the audit proceeds.)

---

## HK13-D01 — F10 edited two already-applied migrations in place (P1)

- **Feature / surface:** F10 Work / Career OS · `supabase/migrations/20260919231500_build4_cloud_schema.sql` (the Build 4 shipping
  migration, verified on Staging) and `supabase/migrations/20260921190000_f05_add_child_after_binding.sql`.
- **How found:** Phase 2 pre-merge survey — `git diff --name-status 363e473 feature/10-work-career-os -- supabase/migrations/` showed
  two `M` entries and no added migration.
- **Reproduction:** on WAVE3_BASE-era database (any database that already applied `20260919231500` and `20260921190000`), apply "the
  migration chain" of F10's branch: nothing runs (both versions are already recorded as applied), so `career_opportunities` never
  exists and `dependencies` never gains its opportunity endpoints; any client push of an opportunity is refused. A fresh install, by
  contrast, gets them — fresh and upgraded databases diverge.
- **Expected:** an applied migration is never edited; a feature's schema arrives in its own additive migration.
- **Actual:** F10 added `career_opportunities` to the manifest with no `migration` key, so `gen-foundation-sql --write` spliced its
  DDL (and the widened `dependencies` endpoints, checks, index and grants) into the shipping migration's generated region; F10 also
  hand-added `career_opportunities` to the `sync_push` allow-list inside the F05 migration. The shipping file's hash moved off the
  Staging-verified `1e9169de…`.
- **Root cause:** in F10's branch the generator only knew one target (the shipping migration). F11 and F13 each invented an
  additive-migration mechanism in parallel; F10 had none.
- **Privacy impact:** none directly. **Data-loss impact:** populated upgrade silently lacks F10 (every opportunity push refused and held
  as evidence on device) — release blocker.
- **Repair (INT13-01, `7c5351a`):** both files restored byte-for-byte to WAVE3_BASE; F10's schema moved to the new additive
  `20260922181000_f10_career_opportunities.sql`, generated from F10's own manifest entry (`migration: F10_CAREER_MIGRATION`). The
  widening of the EXISTING `dependencies` table is modelled explicitly (`REF_EXTENSIONS` + `specAsCreated` in
  `src/domain/sync/foundationSpecs.ts`); the generator emits every table as its creating migration created it and emits the widening
  as ALTERs (Phase 4) in the widening migration. The dependency rules are computed from the endpoint kinds, so rule text and columns
  cannot disagree.
- **Tests:** `tests/migrationChain.test.mjs` (WAVE3_BASE byte pins for baseline/shipping/IR01/F08/F05); `run.mjs` migration gate pins
  the same five hashes; `tests/foundationSpecs.test.mjs` "the Build 4 set is unchanged (18)" (F11's guard, which F10 violated) and
  "a widening … is emitted into its own additive migration"; ENV B3 back to 34 tables; ENV D upgrades a populated database through
  F10 with a pre-existing dependency edge that must survive byte-for-byte.
- **Status:** FIXED.

## HK13-D02 — Three migrations claimed one version `20260922180000` (P1)

- **Features:** F09 (`…_f09_task_payment_mechanism.sql`), F11 (`…_f11_rebuild_focus.sql`), F12 (`…_f12_life_records.sql`).
- **How found:** Phase 2 pre-merge survey of each branch's added migrations.
- **Reproduction:** `supabase db push` / `db reset` records migrations by version in `supabase_migrations.schema_migrations`
  (primary key on version); three files with one version cannot all be recorded, and their relative order is decided by filename.
- **Expected:** unique, strictly increasing versions in the order features integrate.
- **Root cause:** three sibling branches each picked "now" from the same afternoon.
- **Privacy / data-loss impact:** fresh install or deploy of the chain fails or skips migrations (release blocker).
- **Repair (INT13-01, `7c5351a`):** F11 → `20260922182000`, F12 → `20260922183000` (`git mv`, `.gitattributes` LF pins moved with
  them); F09 keeps `180000`, the new F10 file is `181000`, F13 keeps `200000`. No F09–F13 migration had ever been applied anywhere
  (checked read-only on the shared database: 34 tables, no F09–F13 object; `schema_migrations` holds only the two Build 4 versions).
- **Tests:** `tests/migrationChain.test.mjs` "every migration version is unique and strictly increasing" and "the migrations directory
  holds exactly the registered chain"; `run.mjs` migration gate (same, against the chain in `supabase/tests/migration-chain.mjs`).
- **Status:** FIXED.

## HK13-D03 — Non-cumulative `sync_push` / change-log re-declarations (P1)

- **Features:** F11, F12, F13 (and F10 once it had its own migration).
- **How found:** Phase 2 — extracting each branch's `sync_push` and diffing against F05's showed each was "F05 body + my two tables";
  each also re-created `change_log_entity_table_check` as "Build 4 list + my two tables".
- **Reproduction:** apply the chain in order (… F11, F12, F13). After F13, `sync_push`'s owner-private allow-list and the change-log
  CHECK name only the Build 4 tables plus F13's; pushing a `rebuild_focuses` / `life_records` / `career_opportunities` row raises
  `sync_push: … is not a pushable entity table`, and any server-side write to those tables fails the change-log CHECK in its
  `log_row_change` trigger.
- **Expected:** a later migration may add registrations, never remove them.
- **Actual:** "last one wins" — F11/F12 (and F10) features fully broken after F13's migration; no single branch could see it.
- **Root cause:** every branch re-declared from the same WAVE3_BASE text.
- **Privacy impact:** none. **Data-loss impact:** every F10–F12 row stays unsyncable (held as refused evidence on device) — P1.
- **Repair (INT13-01, `7c5351a`):** F11/F12/F13 re-declarations are cumulative (each carries every earlier additive migration's
  tables), with an INTEGRATION NOTE in each header; no other statement changed.
- **Tests:** `tests/migrationChain.test.mjs` — each re-declaration of the change-log list, the owner-private allow-list and the
  no-revision list must be a superset of the previous one; the last must name every feature table; each migration registers the tables
  it creates. Test-the-test: the pre-fix F13 file fails three of these with
  "…dropped career_opportunities, rebuild_focuses, … that 20260922183000_f12_life_records.sql declared". `run.mjs`:
  `chainRegistrations()` reads the LIVE catalog after the whole chain (ENV A, ENV D), and ENV D pushes an opportunity, a Focus and a
  Life Admin record after F13 has been applied. `tests/foundationSpecs.test.mjs`: F11's "LATEST definition" test now also covers F12's
  hand-registered tables.
- **Status:** FIXED.

## HK13-D04 — F09's migration was in no harness chain (P4)

- **Why P4:** an integration-specific test-infrastructure defect (the product migration itself was correct and the Supabase CLI
  would apply it); the harness could not certify it.
- **Actual:** F09 validated only in ad-hoc scratch databases and never registered its migration in `run.mjs` (ENV A/C/D), the private
  API stack or the migration-quality gate, which pinned "exactly four migrations". In the integrated tree the gate fails, and every
  journey pushing a task (`payment_mechanism` is projected on every task) to a private stack without the column would fail with 42703.
- **Repair (INT13-01, `7c5351a`):** one ordered chain `supabase/tests/migration-chain.mjs`, read by `run.mjs`, `private-stack.mjs`,
  `run-f12.mjs` and `run-f13.mjs`; F09 quality checks and an F09 populated-upgrade step (ENV D) added.
- **Tests:** `run.mjs` migration gate (exact directory = chain; F09 additive-only, LF, BEGIN/COMMIT/assert); ENV D F09 upgrade
  (no row lost or rewritten; every pre-existing task reads `payment_mechanism` NULL).
- **Status:** FIXED.

## HK13-D05 — Two incompatible additive-migration generator mechanisms (P4)

- **Why P4:** maintainability defect that blocked the merge (the two could not coexist line-by-line) and would have let a feature's
  generated region drift unchecked.
- **Actual:** F11 keyed later migrations through `LATER_MIGRATIONS` (`migration: 'f11'`, regions `f11-tables/f11-grants`); F13 named
  the file directly (`migrationOf`, `SHIPPING_MIGRATION`, regions `additive-tables/additive-grants`).
- **Repair (INT13-00e, `85c585a`):** F13's form kept for every additive kind; F11's specs use `F11_REBUILD_MIGRATION`; F11's markers
  renamed to `additive-*`; regeneration changed comment lines only (four phase headings, the markers). Both manifest tests kept.
- **Tests:** `gen-foundation-sql --check` (run by `tests/foundationSpecs.test.mjs`) covers every additive file's regions; "both
  generated regions exist exactly once" now covers F11's file too.
- **Status:** FIXED.

## HK13-D06 — Private-stack override names diverged (P4)

- **Why P4:** integration-specific test-infrastructure defect.
- **Actual:** F12 named the override `HERKEYS_PRIVATE_DB` (set by `run.mjs` from `HERKEYS_HARNESS_DB_PREFIX`), F13 named it
  `HERKEYS_PRIVATE_STACK_DB` and added a guard `^f\d\d_` that rejected every prefixed name F12's harness produces
  (e.g. `f1313audit_stack`) — a prefixed full-harness run could not start its journeys.
- **Repair (INT13-00e, `85c585a`):** both names honoured; the guard (which exists because the stack DROPs its database) is kept and
  widened to `fNN_*` or `<prefix>_stack` / `<prefix>_postgrest`.
- **Status:** FIXED.

## HK13-D07 — Two parallel "Failing row contains" redactions (P5)

- **Why P5:** both redacted PostgreSQL's CHECK/NOT NULL row dump from durable sync evidence; they differed only on an edge (F11's
  regex required a closing parenthesis, so an unclosed tuple would pass through unredacted).
- **Repair (INT13-00d, `02fa959`, trivial and local):** one implementation — F11's exported, null-safe `redactRowValues` with F12's
  cut-to-the-end rule — used by the exported `failureFrom`. F11's expected wording in `tests/rebuild/sync.test.mjs` and the R15/LA12c
  mutant anchors in both mutation scripts point at it.
- **Status:** FIXED.

## HK13-D08 — A household saved before F10 is erased on the first F10 launch (P0)

- **Feature / surface:** F10 · `src/domain/state.ts` (`AppStateSchema.careerOpportunities`) · `src/state/appStore.ts` hydration.
- **How found:** Phase 2, resolving the F11 merge conflict in `state.ts`: F11/F12/F13's new roots carry `.default([])` ("absent from a
  household saved before Feature 11 … hence the default"), F10's `careerOpportunities: z.array(CareerOpportunitySchema).max(1000)` does
  not. F10 only backfilled it in `migrateV3ToV4`, which a household already stored as v4 never passes through.
- **Reproduction (scratch script, read-only against the tree at `7c5351a`):** a WAVE3_BASE-era v4 envelope (no F10–F13 roots) →
  `decodeStoredState` → `invalid invalid_state: careerOpportunities: Invalid input: expected array, received undefined`. Removing only
  `rebuildFocuses` / `lifeRecords` / `personContexts` validates `ok`; removing only `careerOpportunities` fails.
- **What the app then does:** `runHydration` (`src/state/appStore.ts`) handles `invalid` with `state = freshState(); status =
  'recovery'; changed = true;` and **persistence stays enabled**, so `if (changed) persist(state)` writes an EMPTY household over the
  stored one. In production `quarantineCorruptState` is `diagnosticsEnabled(__DEV__, …)` — off — so no copy of the old household is kept.
- **Expected:** a field added to the v4 shape later reads as "none yet" for a household that predates it (the F08/F11/F12/F13
  convention); no schema-version bump is needed.
- **Privacy impact:** none. **Data-loss impact:** every device holding a household saved by a pre-F10 build loses its entire local
  household on upgrade (an unbound, local-only household is gone for good; a bound one loses its unsynced work and its binding).
- **Severity:** P0 (data loss).
- **Repair decision:** add `.default([])` to `careerOpportunities`, exactly the convention the other additions follow; add a test that
  a v4 envelope from before EVERY later root still decodes `valid`, derived from the schema so a future root cannot repeat this.
- **Repair (AUD13-01, `d9dfa5c`):** `careerOpportunities: z.array(...).max(1000).default([])`.
- **Tests:** `tests/hk-f01f13/laterRoots.test.mjs` (4): every root added after WAVE3_BASE is a ZodDefault (derived from the
  schema); a WAVE3_BASE-era household validates and decodes `valid`; the REAL store (production: quarantine off) hydrates it `ready`
  with her tasks still on disk. Test-the-test: without the default, 4/4 fail.
- **Status:** FIXED.

## HK13-D09 — Account binding ignores Work, Rebuild and People rows (P0)

- **Features:** F10 (`careerOpportunities`), F11 (`rebuildFocuses`, `rebuildFocusLinks`), F13 (`personContexts`, `personTaskLinks`) ·
  `src/domain/account/claim.ts` `describeLocalHousehold().hasContent`.
- **How found:** Phase 2, reviewing F12's auto-merged change to `claim.ts` (F12 added `lifeRecords`/`lifeRecordLinks` with the comment
  "a household holding only her private records is not empty, so another account's sign-in on this device quarantines it"); F10, F11
  and F13 never added theirs.
- **Reproduction (scratch script at `7c5351a`):** a local household holding only a Focus, or only an opportunity →
  `hasContent=false`; `decideBinding` for account B on an unbound device carrying account A's interrupted-claim receipt returns
  `{"mode":"bootstrap"}` instead of `{"mode":"quarantine"}`.
- **Consequence:** bootstrap keeps the local household, binds it to B and seeds every unsynced local row into B's push queue
  (`namespaceFromClaim` from `options.localState()`), so A's private Focus / opportunity / person context is uploaded as B's row
  (profile_id = B). Without a receipt, an unbound device holding only such rows is also mis-described as empty (bootstrap instead of
  claim).
- **Severity:** P0 (account A data uploaded as account B; cross-account private-data disclosure). The precondition (interrupted claim,
  household holding only these kinds) is narrow; the rubric grades the outcome.
- **Repair decision:** `hasContent` covers every content collection, and a test enumerates `AppStateSchema`'s roots so any future
  collection must be classified (content or not) before the suite passes.
- **Repair (AUD13-01, `d9dfa5c`):** `hasContent` reads one exported `CONTENT_COLLECTIONS` list (all 33 content collections).
- **Tests:** `tests/hk-f01f13/bindingContent.test.mjs` (8): every AppState root is classified (content collection, or an explicit
  reasoned exception: origin, household, user, categories, onboarding, discovery, capacity, migrationLineage); each collection alone
  counts; quarantine for B after A's receipt and claim (not bootstrap) for her own sign-in, for F10 and F11 households; and the REAL
  account runtime end to end: B lands in `boundOther`, nothing renders, no bootstrap/claim call is made. Test-the-test: dropping
  `rebuildFocuses` from the list fails 5/8, including the end-to-end test.
- **Status:** FIXED.

## HK13-D10 — Co-Parent and People are reachable only by deep link (P3)

- **Features:** F07 Co-Parent Logistics (`app/(app)/life/coparent.tsx`, `/life/coparent`), F13 People OS (`/life/people`).
- **How found:** Phase 4 IA inspection (`git grep -E "/life/coparent|/life/people"` over `src` and `app`): the only callers are the two
  features' own internal navigation (`src/features/coparent/ui/navigation.ts`, `src/features/people/containers.tsx`); F13's ready-made
  `peopleLifeTile` has no caller. F07's ledger records it as deferred ("HK-INT-WAVE2-LIFE-REGISTRATION: register the route in the Life
  hub") and Wave 2 never did; F13 records MP-13-08 the same way.
- **Expected:** every legitimate destination reachable from the shell; no route reachable only by a link.
- **Severity:** P3 (feature route unreachable).
- **Repair (INT13-02):** Co-Parent joins the existing category route map (`LIFE_SCREEN_ROUTES.coparenting = '/life/coparent'`):
  F07 identifies its records by the `coparenting` category, so the category row (household's order and name, gone when archived, a
  generic count reading) is the entry. People gets the hub row F13 built for it (`peopleLifeTile`, count/date only), in a new "Just for
  you" section with Me / Rebuild and Life Admin (the three owner-private areas). See the audit report, Phase 4.
- **Tests:** `tests/hk-f01f13/lifeHub.test.mjs` (7): every Life screen is navigated to from code other than its own route file; the
  hub reaches all twelve areas; the shell is exactly its five tabs; the Co-parenting row opens `/life/coparent` under the household's
  own name, keeps category order, and disappears with the category; the hub copy claims nothing false. Test-the-test: the pre-fix hub
  fails 4/7 with `['/life/coparent', '/life/people']` unreachable. `tests/people/ui.test.mjs`: F13's "hub untouched (registration
  deferred)" test replaced by "the hub reaches People only through the count-only tile; Today/One Move/Life layout untouched".
- **Status:** FIXED `b681a4c`.

## HK13-D11 — The Meals exit gate fails on the integrated line, and could not attribute a change (P4)

- **Features / surface:** F09, F10, F11, F12 (unregistered), F13 (registered, with two false claims) · `scripts-dev/meals-boundary-scan.cjs`
  (Feature 08's required exit gate) and `tests/meals/boundary.test.mjs` ([BV1], [BM1], [BL1] run it in the app suite).
- **How found:** ENTRY app suite (§5 of the audit report): `tests/meals/boundary.test.mjs` failed 3 tests. The scan reported 126
  findings: A (four extra migrations), B (seven schemas), C (five tables; five roots), D (`lifeRecord`, `lifeRecordLink`), E (120 files:
  110 unexplained, 10 PROTECTED, e.g. `app/_layout.tsx`, `src/domain/routeAccess.ts`, `src/domain/tasks.ts`), G
  (`feature/09-money-os` is an ancestor of HEAD).
- **Root cause:** the scan diffs against a fixed pre-F08 base, so every later feature's work shows up as a Meals question. Its
  `LATER_FEATURES` register exists for exactly this ("each feature adds its own entry; take the union"), but only F13 registered; F09–F12
  were built on branches where the scan was not run against their own changes, or not at all. Registering them alone would not have
  been an honest repair, because the scan had three structural blind spots once several features share the line:
  1. **Misattribution.** Reasons were a `Map` with Meals reasons winning: `src/domain/sync/apply.ts`, changed by F09, F10 and F12, was
     reported as "MealPlanEntry: apply reads the two columns". F12's change to `claim.ts` was "explained" by AUDIT-W2-05's regex fix.
  2. **PROTECTED could not distinguish who.** It fails any change to, e.g., `app/_layout.tsx` — including F10's, which is not a Meals
     change and is what the list exists to allow later features to make.
  3. **No truth check.** A lane could claim any file. F13 claimed `supabase/tests/sync-integration.mjs` and
     `journey-composition.mjs`, which its branch never changed — a claim like that hides a real change behind a false reason.
  (Also: sync kinds could not be registered, and the ancestry check listed `feature/0*` only, so an unregistered Feature 10+ branch
  reaching HEAD would never have been seen.)
- **Severity:** P4 — a required exit gate red on the integrated line, and a gate whose green would not have meant what it says.
- **Repair (AUD13-04):**
  - Five lanes registered from their branches' own diffs (`git diff 363e473 <branch>`): F09, F10, F11, F12, plus the integration's own
    lane (the files it holds in a version no branch holds — a merge union, a reconciliation or a repair — each with its reason). F13's
    lane corrected (the two false claims removed; five files it did change, previously leaning on Meals reasons, added).
  - **Exact accounting (check E, `account()`):** a change between BASE and the checkpoint is Meals-era and needs a Meals-line reason (a
    PROTECTED file must not have changed there); a change after the checkpoint needs a later lane's reason, never a Meals one. A file
    changed in both eras needs both. Each shared-file fact now lists every lane that explains it.
  - **Check H (the register is true):** every file a feature lane lists must differ between the checkpoint and that lane's branch;
    every file the integration lists must be held here in a version neither the checkpoint nor any lane branch holds. A lane whose
    branch is absent is reported as unverified, not passed.
  - Lane `syncKinds` subtracted in check D; ancestry lists `feature/*`, and skips registered lane branches.
  - `[BL1]` now asks where Meals was built: the routing files never changed on the Wave 2 line, and any later change carries a later
    lane's reason, never a Meals-line one.
- **Tests:** `tests/meals/boundary.test.mjs` 10/10 (was 6/9): [BV1] findings `[]`; new [BV6] holds `account()` to its rules on inputs the
  real tree does not exercise (a post-checkpoint change to a Meals-reason-only file fails; PROTECTED fails only for a Wave 2 change; a
  later lane's own file changed on the Wave 2 line still needs a Meals reason). Test-the-test (each mutant applied to the working
  tree, restored byte-for-byte by sha256, never committed; "test" = `tests/meals/boundary.test.mjs` run under the mutant):

  | Mutant | Change | Result |
  |---|---|---|
  | D11-M1 | drop F10's `app/_layout.tsx` entry | CAUGHT — E finding; test fails 3 |
  | D11-M2 | F09 falsely claims `src/domain/oneMove.ts` | CAUGHT — H finding |
  | D11-M3 | F12 stops registering its two sync kinds | CAUGHT — D finding |
  | D11-M4 | registered lane branches not exempt from ancestry | CAUGHT — G finding |
  | D11-M5 | a Meals-line reason accepted after the checkpoint (the old misattribution) | CAUGHT — by [BV6] only (the real tree does not exercise it) |
  | D11-M6 | planted post-checkpoint change to `src/store/useHousehold.ts` (Meals reason only) | CAUGHT — E finding; test fails 1 |
  | D11-M7 | planted change to PROTECTED `src/domain/taskLists.ts` | CAUGHT — E finding |
  | D11-M8 | the integration falsely claims `README.md` | CAUGHT — H finding |
  | D11-M9 | PROTECTED fails on any change (the old rule) | CAUGHT — 11 findings; test fails 3 |
- **Status:** FIXED (AUD13-04).
