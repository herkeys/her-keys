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
| HK13-D11 | P4 | F09–F13 | exit gate (Meals boundary scan) | F09–F12 never registered their lanes: the integrated line fails the Meals exit gate, and the scan's attribution could not tell a Meals change from a later feature's | FIXED `bb53aeb` |
| HK13-D12 | P4 | F01 × F03 (× F11, F12, F13) | One Move | The planning default duration makes any task "small": offered on an overloaded day as load-reducing, and quoted back as "It should take about 15 minutes" | FIXED `79900c7` |
| HK13-D13 | **P1** | F13 (sync engine) | multi-device sync | Two devices of one account open a context for the same person offline: the second device's pull is refused by the integrity gate on EVERY cycle — its sync stops for good, for every feature | FIXED `9d0073d` |
| HK13-D14 | **P2** | F01, F02, F03 × F07, F10, F11, F13 | generic editors / Talk It Out | A new task or event from the generic editors, a Needs Me promotion or an accepted Talk It Out capture is ALWAYS household-visible, whatever private category (Work, Wellbeing, Relationships, Co-parenting) she files it under | FIXED `9d0073d` |
| HK13-D15 | P3 | F10 | Opportunity form | Moving an opportunity's stage away from Closed is silently not saved: the stale closed reason makes the domain refuse, and the form closes as if saved | FIXED `9d0073d` |
| HK13-D16 | P3 | F10 | Work screen | A closed opportunity vanishes from the app exactly as an archived one does; "Restore from archive" is unreachable | FIXED `df89506` |
| HK13-D17 | P3 | F09 | Money Home | Open Money tasks listed nowhere on Money Home: due after two weeks, past the first-glance bound, an autopay bill due today, an amount with no date | FIXED `df89506` |
| HK13-D19 | P4 | F01 × F09 (× F03 editor) | One Move / task editor | One Move offers expected income ("I did it" records RECEIVED) and pre-due autopay bills; the generic editor completes a Money item with "Mark done" | FIXED `df89506` |
| HK13-D22 | P4 | F08 exit gate | Meals boundary scan | Check D reads only CORE_SYNC_KINDS: a sync kind registered through the foundation manifest is invisible to the gate | FIXED `df89506` |
| HK13-D23 | P5 | F01 hub × F09, F11 | Life hub copy | The Money row says "Nothing due this week" reading only today; Me / Rebuild says "Nothing named yet" while Focuses are paused | FIXED `df89506` (trivial) |
| HK13-D24 | **P2** | F04–F07, F10 (foundation) | RLS / uniqueness | Four household-wide uniqueness rules on owner-private relationship tables tell a member that another member's private handoff, sequence, schedule or step exists | FIXED `45b5710` |
| HK13-D25 | P9 | foundation | FK keys | A composite (task, household) key accepts a real private Task uuid from another member's own row: an oracle only for someone who already holds that uuid | DOCUMENTED |
| HK13-D26 | P9 | foundation | local ids | A guessed local id of a private Task collides; production ids are not practically guessable | DOCUMENTED |
| HK13-D27 | P4 | harness | populated upgrade | ENV D's "whole chain" skipped F08, so its final database was not the real chain's | FIXED `51ec5c8` |
| HK13-D28 | **P2** | F01 × sync | One Move / push | A One Move decided offline lands in the cloud as the NEXT day's: every other device's Today shows the wrong move as done, and today's real decision is refused | FIXED `51ec5c8`; OD-HK13-01 open |
| HK13-D29 | P7 | foundation × sync | categories / pull | Two category uniqueness rules are competing decisions on push but have no pull-side reconciliation; unreachable today (no user surface creates or reorders a category) | DOCUMENTED |
| HK13-D30 | P4 | IR01 test-the-test | mutation suite | Two IR01 mutants no longer applied on the integrated line, so two HA guarantees were unguarded by test-the-test | FIXED `4199baa` |
| HK13-D31 | P6 | F13 | People UI | Save failures and refusals are shown in plum, the colour the owner reserved for what Her Keys noticed | FIXED `4199baa` (trivial) |
| HK13-D32 | P6 | design system (F03-F13) | InlineNotice | The notice's DEFAULT tone is plum, so archived and informational notices across features are plum — recurring chrome, against owner decision 2 | DOCUMENTED |
| HK13-D33 | P6 | F10, F11, F12, F13 | destination styling | Structural inconsistencies between the Wave 3/4 destinations (duplicated titles, a hand-built list, heading rhythm, verdict size, empty states, add prominence) | DOCUMENTED |
| HK13-D18 | P5 | F01, F03-F07, F10, F11, F13, Life hub | cloud hydration | Only Meals, Money and Life Admin gate their empty states on a fresh device's first cloud download; every other surface could say "nothing" mid-download — unreachable today (see D34) | DOCUMENTED |
| HK13-D34 | P9 | platform (Build 4 R7/R10) | second device | Adopting an existing cloud household on a second device is a recorded, unimplemented contract: the server refuses it (`superseded_by_cloud`); every multi-device proof binds device B with a test stand-in | DOCUMENTED (pre-existing) |
| HK13-D35 | P3 | F05 Kids, F03 Calendar, F01 Today × F07 | handoff editing | Kids' item editor and the Calendar's event form moved a co-parenting handoff without its recorded repeat: Co-Parent then showed "Repeats every week on Tuesday" beside a Wednesday handoff | FIXED `4199baa` |
| HK13-D36 | P9 | platform (Build 4 identity) | navigation | The sign-in screen has no entry point in any build since it was added: no user can bind an account, so every cloud capability is reachable only in tests | DOCUMENTED (pre-existing); OD-HK13-02 |
| HK13-D37 | P5 | F03 Calendar, F05 Kids × F07 | responsibility copy | One recorded responsibility, two voices: Calendar and Kids state what she recorded as a third party's act ("Alex accepted"); Co-Parent says "You recorded that Alex accepted this" | DOCUMENTED |
| HK13-D38 | P6 | F10 | Opportunity form | The next action and interview fields took any length; past 200 characters the save was refused with "Try again", which could never work | FIXED `eb09888` (trivial) |
| HK13-D39 | P4 | F05 test-the-test × F10–F13 | mutation suite | Two F05 SQL mutants changed F05's copy of `sync_push`, which four later migrations replace: they SURVIVED on the integrated line, so two child-path guarantees were unguarded | FIXED `eb09888` |
| HK13-D40 | P4 | F09 × F01 | Money Home / Today copy | A past-due AUTOPAY bill was called "overdue" ("Overdue since …", "is 3 days overdue"): a claim that it is unpaid, which F09's doctrine forbids ("only 'confirm cleared'") | FIXED `143f923` |
| HK13-D20 | P6 | F08, F07 × Life hub | task lists | Meals and Co-parenting tasks are listed twice: on their own screen and under the hub's "Other open tasks" | DOCUMENTED |
| HK13-D21 | P5 | F12 | Life Admin edit sheet | Editing a record shows its reference number in full, without the Reveal the detail requires | DOCUMENTED |
| HK13-D41 | P9 | F04 (Build 4 foundation) | Systems | A System is household-shared but its steps are owner-private: another adult would see the System without its steps | DOCUMENTED (pre-existing, latent) |
| HK13-D42 | P9 | F05 | Kids | "Add child" is offered to any member; the server lets only the household owner add one (42501), so a non-owner's child would stay on the device | DOCUMENTED (pre-existing, latent) |

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
- **Status:** FIXED `bb53aeb`.

## HK13-D12 — The planning default makes any task "small" to One Move (P4)

- **Features / surface:** F01 One Move (`src/domain/oneMove.ts` `taskAsOneMoveItem`) × F03 duration provenance (HA-010,
  `src/domain/foundation/duration.ts`); exposure widened by F11, F12 and F13, whose follow-up / next-step / record Tasks are all saved
  without a duration.
- **How found:** Phase 6 — the new cross-seam test "Person → private follow-up Task → Today → One Move" (`tests/hk-f01f13/crossSeams
  .test.mjs`) got `effect: 'reduces_load', estimatedMinutes: 15` for a follow-up she gave no duration; the F01–F03 trace had flagged the
  same line.
- **Reproduction:** on a day Daily Load judges overloaded, add one task due today without a duration (every F11/F12/F13 flow, Talk It
  Out acceptances, a quick capture). `resolveOneMoveForToday` offers it, because the planning default (15) passes `<= 15 → reduces_load`,
  and "Why this?" says "It should take about 15 minutes."
- **Expected:** HA-010: "DEFAULT != USER-PROVIDED … Anything else is an estimate or an unknown and must be worded as one"; an unknown
  size is not evidence that a task is small (One Move already treats a Needs Me item of unknown size as `adds_work`).
- **Actual:** One Move read `durationMinutes` and ignored `durationSource`: a default, or a number of unrecorded origin, made a task
  "small" and was quoted back as her estimate.
- **Root cause:** One Move predates HA-010; the IR01 repair moved Kids and Home onto `durationKnowledgeOf` but not One Move.
- **Privacy impact:** none. **Data-loss impact:** none. Wrong recommendation on overloaded days and an unsupported claim in her words.
- **Severity reasoning:** P4 — a medium correctness/doctrine defect on the product's central recommendation ("Understanding ≠
  certainty"), reachable from every feature that creates Tasks without a duration; not P3 because the day's decision is still a real
  Task of hers and nothing is lost.
- **Repair (AUD13-04b):** a task's duration counts only when it is `user` or `inferred` (she gave it, or approved Her Keys' reading of
  it): then `<= 15` may be `reduces_load` and the number is quoted. A default or unrecorded duration is `adds_work` with no estimate, the
  same conservative treatment as a Needs Me item. Ordering (smallest first) is unchanged.
- **Tests:** `tests/oneMove.test.mjs` +2 ("a task saved without a duration never claims one", "on an overloaded day, a task whose size
  is only the planning default is withheld"), and the overloaded-day "small real task" test now runs for `user` and `inferred`;
  `tests/today/scenarios2.test.mjs` "Why this?" quotes her 30 minutes and nothing for the default; `tests/hk-f01f13/crossSeams.test.mjs`.
  Three existing fixtures passed a bare number as "her" duration; they now say `durationSource: 'user'` (the task form records exactly
  that when she touches the field) — the assertions are unchanged. Test-the-test: D12-M1 (raw duration decides "small") CAUGHT 3 fail;
  D12-M2 (default quoted) CAUGHT 3 fail; D12-M3 (`inferred` no longer known) CAUGHT 1 fail. All restored byte-for-byte.
- **Status:** FIXED `79900c7`.

## HK13-D13 — One person, two devices: the second device's sync stops for good (P1)

- **Features / surface:** F13 People OS (`person_contexts`, one per owner and child/person) × the shared sync engine
  (`src/domain/sync/clash.ts`, `pullEngine.ts`, `src/platform/supabaseSyncTransport.ts`).
- **How found:** the F11–F13 trace noticed `clash.ts` had F11's one-live-link rule but no rule for F13's one-context-per-person
  indexes, and `DOMAIN_INVARIANTS` did not name them. Reproduced in `tests/hk-f01f13/integratedDevices.test.mjs` through the production
  composition (two devices of one account over the shared in-memory cloud, the real unique index modelled with the real transport's
  own classifier).
- **Reproduction:** device A and device B (same account) both hold person P. Offline, each opens a context for P (A: "Met at the school
  fair", B: "Prefers texts"). Online: A's context reaches the cloud; B's pull brings it, finds no rule for it, mints it BESIDE B's own —
  and the integrity gate refuses the batch: `sync.integrity_refused: person:… has more than one person context`. The cursor never
  moves, so every later cycle re-reads the same batch and is refused again; B's own queue never pushes. Observed: B never received A's
  later edit, and nothing else either.
- **Expected:** one context per person on every device; the cloud's stands; her other words are kept as evidence, never silently
  replaced; sync keeps flowing.
- **Root cause:** a domain uniqueness rule (the F13 unique indexes, mirrored by the local integrity check) with no pull-side clash rule —
  exactly the case `clash.ts` exists for, missed when F13 was built alone (F11 added its equivalent; F13 did not).
- **Privacy impact:** none. **Data-loss impact:** high — B's later edits in EVERY feature stay unsent for as long as the device lives,
  and B never sees the household's changes again: silent, permanent divergence. P1: a release blocker reachable from an ordinary
  offline edit on two devices.
- **Repair (AUD13-01b):** `classify('personContext')` ADOPTS the local context for the same child/person: it becomes the cloud's (keeps
  its local id, so every follow-up that names it keeps naming it); if its own words differed (compared generically over the
  manifest's text fields — never copied or logged), the pull records `domain-conflict` evidence. The pull engine never adopts a local
  row the cloud already knows under another id. Both indexes join `DOMAIN_INVARIANTS`, so a refused push is classified as a domain
  conflict rather than a malformed row.
- **Tests:** `tests/hk-f01f13/integratedDevices.test.mjs` (3): different words → one context on both devices, the cloud's words,
  B's recorded as unresolved evidence, and a LATER edit on A still reaches B; identical words + a follow-up B saved against its own
  context offline → the follow-up reaches the cloud attached to the one context, nothing recorded, A sees it; the same race over a
  child's context. Pre-fix: the first test fails ("the cloud's context is what stands": B still held its own; B's events show
  `sync.integrity_refused`). F13's own privacy guard ("nothing outside People OS reads a context note") passes: the clash rule names no
  People field. Test-the-test: D13-M1 (no clash rule) CAUGHT 3/3 fail; D13-M2 (differing words replaced without evidence) CAUGHT 2
  fail; D13-M3 (a child's context matched by person only) CAUGHT 1 fail; D13-M4 (identical words recorded as a conflict) CAUGHT 1
  fail. All restored byte-for-byte.
- **Status:** FIXED `9d0073d`.

## HK13-D15 — A stage correction away from Closed is silently not saved (P3)

- **Feature / surface:** F10 Work / Career OS · `src/features/work/OpportunityForm.tsx` over `setOpportunityStage`.
- **How found:** the F08–F10 trace; reproduced by rendering the real form under the real provider.
- **Reproduction:** open a Closed opportunity (reason "No further response"), tap Applied, Save. The form keeps the old closed reason in
  its own state and passes it with stage Applied; `setOpportunityStage` refuses (`unexpected_closed_reason`), the form ignores the
  refusal and goes back. The opportunity is still Closed. Same for a NEW opportunity marked Closed + reason, then moved to Interviewing:
  created at Exploring.
- **Expected:** "stage moves only by explicit user action" — and an explicit action is never silently dropped. The domain's own doc says
  the closed reason "is cleared the moment the stage is corrected away from closed".
- **Root cause:** the form passed `closedReason` whatever the stage, and discarded the command's refusal.
- **Privacy impact:** none. **Data-loss impact:** her stage correction is lost while the UI reports success (P3: a user action silently
  not applied).
- **Repair (AUD13-03a):** the form sends a closed reason only with Closed; a refused stage change writes nothing, keeps the form open
  and says so ("Her Keys couldn't save that stage. Check it and try again.").
- **Tests:** `tests/hk-f01f13/opportunityForm.test.mjs` (3): Closed → Applied is saved with no reason; new Closed+reason → Interviewing is
  created at Interviewing; Applied → Closed again requires and keeps a reason. Test-the-test: D15-M1 (stale reason passed again)
  CAUGHT 2 fail. D15-M2 (a refusal reported as saved) SURVIVED — documented: once the reason is cleared, no input the form can
  produce reaches a refusal (it pre-validates Closed-without-reason, and opportunities have no delete path), so the retained
  refusal guard is defence in depth on an unreachable path. (The first D15-M1 run hung: a failing form test skipped its unmount and
  the provider's minute timer kept the process alive; the tests now always unmount, and the rerun failed cleanly.)
- **Status:** FIXED `9d0073d`.

## HK13-D14 — New rows from the generic editors ignore their category's visibility (P2)

- **Features / surface:** the generic Task editor (`src/features/tasks/TaskForm.tsx`: Today "Add a task", the Work screen's list,
  Needs Me promotion), the Calendar event editor (`src/features/calendar/EventForm.tsx`), Talk It Out acceptance
  (`src/domain/interpretations.ts` `acceptInterpretation`) — against the categories F07, F10, F11 and F13 file their private rows in.
- **How found:** the F04–F07 trace (MP-07-14 "generic editors create rows as household — still true", integration candidate
  HK-INT-COPARENT-EVENTSCOPE-01) and the F01–F03 trace (accepted captures are `child` or `household`); confirmed in code:
  `scope: 'household' as const` (TaskForm), `scope: 'household'` (EventForm), `subjectMemberId ? 'child' : 'household'` (acceptance).
- **Reproduction:** in Calendar, add "Therapy intake" in Wellbeing (declared `personal`); or from the Work screen add a task (Work is
  declared `professional`); or accept a Talk It Out capture into Co-parenting. The row is stored `household`, pushed with no owner, and
  `private.can_access_scoped_row` shows it to every member of the household — while a follow-up she makes in People, a next step in
  Rebuild, an opportunity's next action or an F07 handoff in the same categories are hers alone.
- **Expected:** "Same-household B must not learn … private Task exists … unless foundation semantics explicitly make the underlying
  canonical object shared." A category carries the scope the household gave it, and every feature flow honours it.
- **Root cause:** the generic editors predate the per-category scopes the later features rely on; F07 recorded the gap and left it to
  integration.
- **Privacy impact:** YES — exposure to same-household members of what she filed as private (title, times, notes, location of a
  Wellbeing/Relationships/Co-parenting/Work item). Not cross-household. **Data-loss impact:** none.
- **Severity reasoning:** P2 — a privacy exposure contrary to declared semantics, reachable from the most ordinary flows (Calendar
  "Add event", Today "Add a task"); not P1 because it never crosses households and nothing is lost.
- **Repair (AUD13-02a):** one rule, `scopeForNewRow(state, categoryId, subjectMemberId)` in `src/domain/categories.ts`: a private
  category (`personal`, `professional`, `coparent-shared`) gives a new row that scope; a household category gives `household`, or
  `child` about a child. Used by the task editor (new tasks and Needs Me promotions), the event editor and Talk It Out acceptance.
  Scope stays fixed at creation — an edit never widens (or narrows) a row. Feature flows that choose their own scope are unchanged.
- **Tests:** `tests/hk-f01f13/newRowScope.test.mjs` (8): the rule for all eight starter categories and for a child subject; an accepted
  capture into each category; the REAL task and event editors (rendered under the real provider) save each category's scope; a Needs
  Me promotion into Relationships is personal; moving a private task into Home keeps it private. Test-the-test: D14-M1 (task
  editor writes household) CAUGHT 2 fail; D14-M2 (event editor) CAUGHT 1; D14-M3 (Talk It Out acceptance) CAUGHT 1; D14-M4 (a private
  category no longer keeps a row private) CAUGHT 6; D14-M5 (a child row no longer child-scoped) CAUGHT 2. Full app suite after the
  repair: 3233/3234, the one failure being the boundary scan before these files were registered (then 0).
- **Status:** FIXED `9d0073d`.

## HK13-D16 — Closed reads as gone: closed and archived opportunities are unreachable (P3)

- **Feature / surface:** F10 Work / Career OS · `src/features/work/WorkOverview.tsx` (Career Next).
- **How found:** the F08–F10 trace ("closed or archived opportunities can't be reached in the UI").
- **Reproduction:** close an opportunity (reason "No further response") and leave the form: it is on no screen. Archive one: gone
  too — and "Restore from archive", a button on the opportunity itself, can never be reached again.
- **Expected:** "closed ≠ archived" (ADDENDUM J): closed is her recorded outcome and stays in view until SHE archives it; archived is
  out of view but never gone.
- **Root cause:** Career Next filtered `isOpportunityOpen(o) && o.archivedAt === null` and nothing listed the rest.
- **Privacy impact:** none. **Data-loss impact:** effective — her records become unreachable (nothing is deleted). P3: feature records
  unreachable.
- **Repair (AUD13-03b):** `careerListsOf` (pure) puts every opportunity in exactly one list — open, closed (with her reason), archived —
  and `CareerNext` renders them: Closed listed under its own heading, archived one tap away ("Show archived (N)"), every row opening
  its opportunity (where Restore works). With nothing in play it says "Nothing in play right now." — never "No career opportunities
  recorded yet." The stage and reason labels now live in one place (`careerLists.ts`) for the list and the form.
- **Tests:** `tests/hk-f01f13/careerLists.test.mjs` (4): the partition; the rendered section (closed with reason, archived revealed,
  every row opens the right opportunity); the "nothing in play" wording; Restore through the REAL form brings it back to Career Next
  with its stage untouched. Test-the-test: D16-M1 (closed drops out) CAUGHT 2 fail; D16-M2 (no "Show archived") CAUGHT 1 fail.
- **Status:** FIXED `df89506`.

## HK13-D17 — Money Home misses open Money tasks (P3)

- **Feature / surface:** F09 Money OS · `src/features/money/projection.ts` (`buildMoneyHomeView`), `MoneyBody.tsx`.
- **How found:** the F08–F10 trace ("a money task with an amount but no due date is listed nowhere"); widened by reading every
  section's filter against the category's open tasks.
- **Reproduction:** Money is a `TASK_LIST_ROLES` category, so the Life hub's "Other open tasks" deliberately skips its tasks and trusts
  Money Home to list them. Money Home listed: due now (capped at 3), the next 14 days, and tasks with no amount. Listed NOWHERE on it:
  (a) a bill or expected income due after 14 days; (b) the 4th+ item due now; (c) an autopay bill due TODAY (kept out of attention by
  the pre-due rule, and out of "Coming up" by `due > today`); (d) a task carrying an amount but no date (a Talk It Out capture, or a date
  cleared in the generic editor) — reachable from no screen at all.
- **Expected:** `taskLists.ts`: "A category whose role has its own Life screen lists all of its open tasks there."
- **Root cause:** windowed sections with no remainder; the build3 audit checks this screen only statically (it contains
  `openTasksInCategory(`).
- **Privacy impact:** none. **Data-loss impact:** effective for (d) — an open task she can never reach. P3.
- **Repair (AUD13-03b):** every open Money item lands in exactly one section — Needs attention (first glance bounded, the rest behind
  "Show N more"), Coming up / Expected in (everything else due by the horizon, including an autopay bill due today: due, not a
  problem), and a new "Later" section; "Other open tasks" is every open task in the category that is not a dated Money item. Also
  (P6, same place): "Needs attention" no longer draws an empty header when the only outstanding reimbursement is merely requested.
- **Tests:** `tests/hk-f01f13/moneyReachability.test.mjs` (4): the sections partition the category's open tasks exactly (nothing
  twice, nothing nowhere) over a household with every case; each item's section; rendered "Show N more" and "Later"; no empty header.
  Test-the-test: D17-M1 (no Later) CAUGHT 3; D17-M2 (rest dropped past the cap) CAUGHT 3; D17-M3 (autopay due today falls out) CAUGHT
  2; D17-M4 (amount without a date nowhere) CAUGHT 2; D17-M5 (empty header) CAUGHT 1.
- **Status:** FIXED `df89506`.

## HK13-D19 — "Paid" and "received" said when only "done" was (P4)

- **Features / surface:** F01 One Move (`src/domain/oneMove.ts` candidate pool) × F09 Money semantics; the generic task editor
  (`src/features/tasks/TaskForm.tsx`).
- **How found:** the F08–F10 trace ("One Move can pay a bill": it can choose autopay bills and expected income, and "I did it" marks them
  Paid or Received).
- **Reproduction:** expected income due today ("Tax refund") is offered as the day's One Move; "I did it" completes the Task, and Money
  Home shows it RECEIVED. An autopay bill due today is offered — the very pre-due nudge F09 rules out. Completing a bill from Today's
  generic editor says "Mark done"; Money then shows it PAID.
- **Expected (doctrine):** reject "paid" when only done is known, and "received" when only expected is known.
- **Root cause:** One Move's pool and the generic editor predate F09's meanings for a completed Money item.
- **Privacy impact:** none. **Data-loss impact:** none; a false financial state recorded from an ambiguous action. P4.
- **Repair (AUD13-04c):** One Move never offers expected income, nor an autopay bill that is not yet past due (the same
  `autopayPreDueSuppressed` rule attention and Money Home use; past due, it may be — "confirm it cleared"). Manual bills and F07
  follow-ups (where done is explicitly NOT paid) are unchanged. The generic editor's completion button says "Mark paid" for a bill and
  "Mark received" for expected income — the words now say what completing records; any other task still says "Mark done".
- **Tests:** `tests/hk-f01f13/moneyDoctrine.test.mjs` (4): expected income is never the One Move; autopay due today is not, past due is;
  a manual bill and an F07 follow-up still can be; the rendered editor's button for a bill, expected income, a plain Money-category task
  and an F07 follow-up. Test-the-test: D19-M1 (income offered) CAUGHT; D19-M2 (pre-due autopay offered) CAUGHT; D19-M3 ("Mark done"
  for a Money item) CAUGHT — 1 fail each.
- **Status:** FIXED `df89506`.

## HK13-D22 — The Meals gate cannot see a foundation-manifest sync kind (P4)

- **Surface:** `scripts-dev/meals-boundary-scan.cjs` check D (a remainder of HK13-D11).
- **How found:** the F08–F10 trace ("check D compares only CORE_SYNC_KINDS … 'D: none' does not mean no new sync kinds were added").
- **Reproduction:** add a sync kind through `FOUNDATION_KIND_NAMES` (as F10, F11 and F13 did): check D reports "none".
- **Root cause:** check D predates the foundation manifest as a second registration path.
- **Severity reasoning:** P4 — the exit gate's promise ("no new sync kind") was false for the path three features used.
- **Repair (AUD13-04c):** check D diffs the union of `CORE_SYNC_KINDS` and `FOUNDATION_KIND_NAMES`; F10, F11 and F13 register their
  manifest kinds in their lanes; a new `laterSyncKinds` fact shows every lane kind the scan saw before subtracting it.
- **Tests:** `[BV1]` asserts `laterSyncKinds` is exactly the seven F10–F13 kinds. Test-the-test: D22-M1 (check D core-only again)
  CAUGHT; D22-M2 (F10 stops registering `opportunity`) CAUGHT.
- **Status:** FIXED `df89506`.

## HK13-D23 — Two Life hub rows deny what exists (P5, trivial)

- **Surface:** `src/features/life/lifeStatus.ts` (Money row); `src/features/rebuild/copy.ts` + `app/(app)/life/index.tsx` (Me / Rebuild).
- **Found:** the F08–F10 trace ("'Nothing due this week' is inaccurate"); the F11–F13 trace ("'Nothing named yet' when all Focuses are
  paused").
- **Actual → repair (AUD13-05a):** the Money row reads only TODAY's slice yet said "Nothing due this week" beside a bill due tomorrow
  → "Nothing due today". The Rebuild row counted only active Focuses and said "Nothing named yet" while paused ones exist → "N paused".
- **Severity reasoning:** P5 (a false statement in a count row; nothing lost); repaired because each is one line, local and risk-free.
- **Tests:** `tests/hk-f01f13/lifeHub.test.mjs` "HK13-D23: a row never denies what exists". Test-the-test: D23-M1 ("this week" again)
  CAUGHT; D23-M2 (paused denied again) CAUGHT.
- **Status:** FIXED `df89506`.

## HK13-D24 — Household-wide uniqueness on owner-private relationship tables: a relationship inference leak (P2)

- **Features / surface:** the Build 4 foundation tables every feature's private relationships use — `responsibilities` (F05, F06, F07,
  F04 handoffs), `dependencies` (F04, F05, F07, F10), `recurrence_rules` (F04, F06, F07), `system_steps` (F04) — re-audited as the
  brief's "responsibility uniqueness oracle" (documented by F13's phase-A probe as pre-existing and accepted; NOT accepted here).
- **How found:** Phase 8, the integrated privacy attack (`supabase/tests/81-int13-privacy.sql`): a catalog sweep of every unique rule
  on an owner-private relationship table, then a behavioural probe for each rule it named.
- **Reproduction (pre-fix run, 51/56):** A privately hands off household Task T1, privately sequences T1 → T2, privately schedules T3,
  and privately adds a first step to the household System S. B — who can see T1..T4 and S, and so holds their ids — then records her
  OWN handoff of T1, her own "T1 requires T2", her own schedule for T3 and her own first step on S. Each is refused with `23505`
  exactly when A holds the private row (the same actions on untouched items are accepted): B learns A's private handoff / sequence /
  schedule / step exists, and cannot record her own.
- **Expected:** "Same-household B must not learn: private row exists, private relationship exists…" (Phase 8, non-inference).
- **Root cause:** four uniqueness rules (`responsibilities_one_live_owner_uq`, `dependencies_live_edge_uq`,
  `recurrence_rules_one_active_rule_uq`, `system_steps_system_position_key`) span the household on tables whose rows are read and
  written per owner. The index is checked without RLS, so it answers for rows the caller cannot see.
- **Privacy impact:** existence of another member's private relationship about a shared item (no content). **Data-loss impact:** B's own
  legitimate row is refused and held as evidence on her device. Severity: **P2** — the brief's definition names "relationship inference
  leak" as P2.
- **Repair (AUD13-02b):** a hand-written additive migration, `supabase/migrations/20260922210000_int13_per_owner_uniqueness.sql`, drops and
  re-creates each rule under its SAME name (DOMAIN_INVARIANTS and the pull's clash rules key on the names) with `profile_id` after the
  household. The product rule still holds per owner (she cannot hold two live handoffs of one item, etc.), which is also each device's
  whole view. Loosening only: no existing row can violate it, and no row is touched (ENV D applies it to a populated database and
  proves every handoff, edge, schedule and step byte-identical). The manifest keeps each rule as the earlier migrations wrote it (so
  the generated shipping and F10 regions do not move) and records today's rule in `PER_OWNER_UNIQUENESS`. Registered in the chain,
  the LF pins, the migration gate (a quality check that it re-issues exactly these four, each with the owner, and touches nothing
  else) and the Meals gate (the integration's lane).
- **Product-decision note:** whether a household's shared item should have ONE household-visible holder (MP-K-13, an open owner
  decision) is untouched: today handoffs are owner-private, and per-owner uniqueness is the rule consistent with that. If the owner
  later makes handoffs household-visible, a household-wide rule can return WITH shared visibility (then it is not an oracle).
- **Tests:** `81-int13-privacy.sql` (56/56 after; 51/56 before, the five failures being exactly these); `tests/migrationChain.test.mjs`
  "HK13-D24: … each owner-private uniqueness rule is PER OWNER"; run.mjs quality + ENV D step. Test-the-test: D24-M2 (the handoff rule
  household-wide again) CAUGHT 2 fail; D24-M3 (the step slot without the owner) CAUGHT 2 fail. (A first mutant that dropped the migration
  from the chain was "caught" only because run.mjs could not load — recorded as such, not counted.)
- **Status:** FIXED `45b5710`.

## HK13-D27 — ENV D's "whole chain" skipped F08 (P4)

- **Feature / surface:** the backend harness's populated-upgrade proof (`supabase/tests/run.mjs` ENV D).
- **How found:** Phase 7, building the WAVE3_BASE-era populated upgrade (ENV F) beside it.
- **Reproduction:** ENV D applies IR01, then F05, F09, F10, F11, F12, F13, INT13 — never F08 — yet ends with "after the WHOLE chain"
  checks. Its final database was not the real chain's (no `meal_slot`/`status`).
- **Root cause:** Feature 08 proved its migration in a separate ENV E and never added its step to ENV D; each later feature appended
  its own step after F05. The integration unified the chain list (INT13-01) but not ENV D's hand-written step order.
- **Impact:** a test-infrastructure defect, integration-specific: "populated upgrade through the whole chain" was claimed but not
  proven for the chain's real order. No product impact found (ENV F now proves the real order over a much wider population).
  Severity: **P4** (the brief's "integration-specific test infrastructure defect").
- **Repair (AUD13-03):** ENV D applies F08 in chain order, with a check that it loses and rewrites nothing. ENV F (new) starts from
  exactly `WAVE3_BASE_CHAIN` and applies `WAVE3_TO_F13_CHAIN` one migration at a time, so its order comes from the chain itself.
- **Status:** FIXED `51ec5c8`.

## HK13-D28 — A One Move decided offline lands in the cloud as the NEXT day's (P2)

- **Features / surface:** F01 Today / One Move over the Build 4 sync engine (push engine, queue top-up); every other device.
- **How found:** Phase 7. Seeding the WAVE3_BASE-era population, three One Moves with decisions on three different days collided on
  one logical day: the live path ignores `decided_at` for the day (HR-03, the shipping migration's `set_one_move_logical_day`
  stamps `now()` in the account timezone; "historical days can only ever enter through claim"). The shared fake cloud never modelled
  this, so no app test had ever pushed a One Move after its day.
- **Reproduction (`tests/hk-f01f13/oneMoveDay.test.mjs`, fake cloud given the server's two real rules):** Monday, offline, she is
  given her One Move and does it. Tuesday morning the device decides Tuesday's move, then reaches the cloud. Before the repair:
  - the cloud holds Monday's completed move as **Tuesday's** One Move — every other device's Today says Tuesday's move is done, with
    Monday's task;
  - Tuesday's real decision is refused as a competing one (`domain-conflict`), and its observation and evidence become
    `unresolvable-dependency`: three "needs your attention" entries from one ordinary offline day, and the sync status says so;
  - this device and the cloud disagree about Tuesday for good.
- **Root cause:** the push engine sent a NEW One Move row for a day that had passed. The server owns the day and stamps its today on
  every new row, so the row could not land on its own day; nothing on the client knew that a past day cannot travel the live path.
- **Impact:** "Today/One Move acting on the wrong object" and "incorrect date semantics that materially change action" (both P2 in
  the brief): the wrong decision, on the wrong day, on every other device; her real decision for the day never reaches the cloud
  (it is not destroyed: it stays on the device and in evidence, which is why this is not P1). Severity: **P2**.
- **Repair (AUD13-03), inside HR-03 — no server change:** an earlier day's One Move that the cloud has never acknowledged is history
  that stays on this device, and so is every fact about it (its observations, the evidence for it) — `src/domain/sync/keptLocal.ts`.
  The push engine settles such an item without sending it and without evidence (`keptLocal`); the queue top-up
  (`changeBridge.unsyncedRows`, given today by `topUpQueue`) no longer derives it as owed. A move the cloud already holds is never
  kept back: an update cannot move its day (the server pins it), so a late completion still reaches its own day.
- **What this does not do (owner decision, not taken):** carry an offline day's One Move to the cloud under its own day. The live path
  cannot (HR-03 derives the day from the server clock, deliberately, so a device clock cannot write a wrong day); only a server
  change — e.g. deriving a bounded past day from `decided_at` in the account timezone — could, and that alters an owner-approved
  rule. Recorded as **OD-HK13-01** for the owner. Today the other devices do not see an offline day's One Move history; the task she
  did still syncs as done.
- **Tests:** `oneMoveDay.test.mjs` (4): the offline-overnight case end to end (cloud truth, Today on the device, no evidence, empty
  queue, sync status idle, every cloud fact about a move points at a move the cloud holds); the top-up rule in isolation; a synced
  move's late completion after midnight still lands on its own day. Test-the-test: D28-M1 (the push engine sends it again), D28-M2
  (the top-up owes it again), D28-M3 (facts about it are not kept with it), D28-M4 (a synced move is kept back too) — **4/4 caught**.
- **Status:** FIXED `51ec5c8`; OD-HK13-01 open for the owner.

## HK13-D29 — Two category uniqueness rules have no pull-side reconciliation (P7, documented)

- **Feature / surface:** Build 4 categories (every feature files rows under one, and since HK13-D14 a category decides a new row's
  visibility) · `src/platform/supabaseSyncTransport.ts` DOMAIN_INVARIANTS · `src/domain/sync/clash.ts`.
- **How found:** Phase 9, the sync registry reconciliation (`tests/hk-f01f13/syncRegistry.test.mjs`): every DOMAIN_INVARIANT was
  matched with the pull-side case that reconciles it. Two have none: `household_categories_household_id_sort_order_key` and
  `household_categories_system_role_uq`.
- **What it would do:** local state requires a unique category `sortOrder` and `systemRole`, and a new category takes `max + 1`. Two
  installs each adding a category offline would both take the same order; the second push is refused as a competing decision (kept
  as evidence), and the pull then brings the first one into a state that already holds that order — an invalid batch, which the
  integrity gate refuses on every cycle (the HK13-D13 pattern: that install's sync would stop for good). `reorderCategories`
  rewrites several orders at once, which per-row pushes cannot apply against a (household, order) unique key either.
- **Reachability:** none in a user build. `addCategory` and `reorderCategories` are called only from `app/dev-tools.tsx`, whose route
  is `internal`; starter categories are adopted, never created per device; a claim carries categories on the trusted path.
- **Severity:** **P7** (architectural debt, latent). Not repaired: no user can reach it, and a repair means designing category
  reconciliation — a product change, not a local fix.
- **For whoever ships a category surface:** add a `category` clash case (a competing custom category is re-ordered, never
  stacked) and a reorder the server applies atomically, before the surface ships. The registry test names this as the only
  DOMAIN_INVARIANT without a clash case, so the gap cannot silently widen.
- **Status:** DOCUMENTED.

## HK13-D30 — Two IR01 mutants no longer applied on the integrated line (P4)

- **Surface:** `scripts-dev/ir01-mutation-check.cjs` (the HK-INTEGRATION-READINESS-01 test-the-test suite).
- **How found:** Phase 14, running every feature's own mutation suite on the integrated branch. A dry run reported "2 mutation(s) did
  not apply" (the script collects, but never printed, which).
- **What:** M14 (HA-001 / IR-D12: a refused create must never be re-derived as owed) anchored on the `unsyncedRows` condition, which
  this audit's own HK13-D28 repair extended — 0 matches. M27 (HA-011: a pulled System keeps its child subject) anchored on a
  `subjectMemberId` mapping line that F12's LifeRecord apply duplicated — 2 matches. Neither guarantee was exercised by its mutant.
- **Severity:** **P4** — the brief's "integration-specific test infrastructure defect": the guards stayed green because their mutants
  silently did not run.
- **Repair (AUD13-06):** both re-anchored to their exact guarantee (M14 removes only the evidence check; M27 is named by the
  System case's own comment). Dry run: every IR01 mutation applies exactly once; M14 **caught** (4 failing), M27 **caught** (9 failing).
- **Status:** FIXED `4199baa`.

## HK13-D31, D32, D33 — the Paper-and-Ink guard (Phase 12)

A token-level sweep of every Wave 3/4 feature and the Life hub found **no** raw colour, radius, font size or weight outside the
theme (`src/design/tokens.ts`), no sage/spa, pastel-dashboard or fintech drift (Money has no charts, KPI numbers or coloured deltas;
amounts are unsigned and uncoloured), no rounded-everything, and no accent used as a large fill. What it found is semantic and
structural, verified in code:

- **HK13-D31 (P6, FIXED as trivial):** People shows save failures and refusals ("That could not be saved on this device…", "This
  person is no longer in Her Keys.") in `InlineNotice tone="info"` — plum, the owner's reserved "Her Keys noticed" colour
  (`docs/design-system/owner-decisions.md` decision 2). Money and Life Admin use the umber `waiting` tone for the same role. The four
  notices now use `waiting` (`PersonDetailView`, `AddPersonView`, `FollowUpFormView`, `containers`). `tests/hk-f01f13/designGuard.test.mjs`
  holds it for Money, Work, Rebuild, Life Admin and People: an outcome notice must name a tone, never the AI one (proven to fail on
  a reverted notice).
- **HK13-D32 (P6, DOCUMENTED):** the root cause is systemic — `InlineNotice`'s default tone is `info` (plum), so "archived" and other
  informational notices are plum across Kids, Meals, Systems, Calendar, Co-Parent, Life Admin and People. That makes plum recurring
  chrome, which decision 2 rules out. The fix is a neutral notice tone in the design system — a design-system change, not an
  integration repair; recorded for the owner / design system.
- **HK13-D33 (P6, DOCUMENTED):** structural inconsistencies between destinations, none a token violation: People repeats its native
  title in a 31pt display heading (Co-Parent's hub and the Life Inbox set that precedent in Wave 2); People's "Everyone" rows are
  hand-built (accessible buttons, but no hairline and no pressed feedback) where the same screen's other lists use `StatusList`;
  Work's two layers ("Work now", "Career next") use the same eyebrow as their sub-sections; the verdict line is `sectionTitle` in
  Money, Life Admin and People but `screenTitle` in Rebuild and `bodyStrong` in Work; the first-run empty states of Rebuild, Life
  Admin and People differ (`EmptyState` supports one link-style action); the "add" action's prominence differs by feature (possibly
  deliberate for People and Rebuild); a Rebuild Focus card is tappable only on its title; Life Admin's detail sheet can stack six
  pill buttons; Work uses legacy type aliases (`caption`, `bodySm`) that render identically. The brief forbids a redesign, so these
  are recorded, not changed.

## HK13-D18 — Cloud-hydration gating exists on three surfaces of fourteen (P5, latent)

- **How found:** Phase 12 ("No screen claims 'No data' before hydration finishes"), a survey of every screen's empty states and their
  gates, verified in code.
- **Local hydration: sound.** `app/_layout.tsx` renders nothing until the store is settled, and every route guard refuses before it
  (`routeAccess.ts`). No screen can speak before the device's own saved household has loaded.
- **Cloud hydration of a freshly bound device:** only the Meals, Money and Life Admin screens gate their words on the sync namespace's
  `hydration` (`mealsGate`, `moneyGate`, `lifeAdminGate` — "Getting … ready…"). Today, Calendar, Systems, Kids, Home, Co-Parent, Work,
  Me/Rebuild, People, Needs Me, Other tasks, the Life Inbox and ALL eleven Life hub rows (Meals, Money and Life Admin's rows too) would
  say "nothing …" while such a device was still pulling its household. The three gated screens also have no end state if sync never
  starts, and no surface says that data is still arriving.
- **Reachability: none in a user build.** A device only ever binds through a claim or a new-account bootstrap, both of which mark the
  namespace `ready` (`claimSeam.namespaceFromClaim`); `namespaceForNewDevice` (the only producer of `unhydrated`) has no production
  caller; a second device of an existing household is refused by the server (`superseded_by_cloud`) — HK13-D34. Recovery mode is
  unreachable here too: a recovered household is a fresh one, onboarding is incomplete, and no app screen opens.
- **Severity:** **P5** (latent correctness). **Before R7/R10 ships**, one gate should hold every app surface until the namespace is
  hydrated (as the root layout already does for the local store), with a visible "still arriving" state and an end state.
- **Status:** DOCUMENTED.

## HK13-D34 — A second device cannot adopt an existing household: a recorded, unimplemented contract (P9, pre-existing)

- **What:** Build 4's R7/R10 ("hydrate from cloud, then Today" on a second device) is recorded as **not implemented**
  (`docs/builds/HK_INTEGRATION_READINESS_01_BACKEND.md` §4). `bootstrap_account` answers an account that already owns a household with
  `superseded_by_cloud`, which the app records as an honest refusal. A second ADULT of a household likewise has no client path
  (`household_members` is privileged infrastructure, B4-P0-019).
- **Consequence for this certification:** every "fresh device" and "second device" proof — the Phase 9 lifecycle, Phase 11 journey,
  the real-HTTP journeys, and HK13-D13/D28 — binds device B with a stand-in (`tests/support/accountDevice.mjs` `bindAsNewDevice`, the
  Meals harness's `secondDevice`) that builds the identity exactly as that step will leave it. What they prove (sync, reconstruction,
  isolation) holds for that step; the step itself is not in the product yet. Same-household member privacy is proven at the server
  (RLS, suite 81) as defence in depth for a capability that ships later.
- **Not an F01–F13 defect:** it predates the campaign and no F01–F13 feature claims it. Recorded so no one reads the multi-device
  evidence as covering a shipped capability.
- **Status:** DOCUMENTED (pre-existing, owner roadmap).

## HK13-D35 — Two generic editors moved a co-parenting handoff and left its repeat behind (P3)

- **Features / surface:** F07 Co-Parent handoffs (canonical `CalendarEvent`s in the co-parenting category, each weekly or monthly one
  carrying one schedule `RecurrenceRule`) × F05 Kids' item editor × F03 Calendar's generic event form (reached from the Calendar and
  from Today).
- **How found:** Phase 12, following the candidate "Kids edits an F07 handoff without re-anchoring its recurrence" to its end in code.
- **Reproduction (`tests/hk-f01f13/handoffOwnership.test.mjs`, first test):** a weekly handoff on Thursday 15:00, moved to Friday 16:00.
  In Co-Parent (`editHandoff`) the rule moves with it (weekday, anchor date, time of day). In Kids (`editChildEvent`) — and in the
  Calendar's form (`updateEvent`) — only the event moves: the rule still says Thursday. Co-Parent's detail then reads "Repeats every week
  on Thursday. This is the pattern you recorded." beside a handoff recorded on Friday, and the Calendar's repeat line says the same.
- **Root cause:** a handoff is F07's row, and F07 decided that moving the handoff moves the pattern. Two other editors could edit the
  same row with no knowledge of that decision. F07's own integration contract said so (HK-INT-COPARENT-KIDS-01: "Kids must not rebuild
  the transition layer; it may link into `life/coparent`"); nothing enforced it.
- **Severity:** **P3** — the brief's "incorrect cross-feature projection": the same move gives two different truths depending on the
  screen, and afterwards two features state a pattern the handoff no longer follows. No data is lost; she can correct it in Co-Parent.
- **Repair (AUD13-07), ownership rather than a second copy of F07's rules:** one read-only predicate, `isCoparentingHandoff`
  (`src/domain/handoffs.ts`, F07's own test: the co-parenting category). The Calendar tap, Today's event routes (`eventRouteFor`) and
  Kids' child view open a handoff in Co-Parent (`/life/coparent?mode=handoff`). The two generic editors, reached any other way (a deep
  link, an older route), render `HandoffKeptHere` (Life, `src/features/life/HandoffKeptHere.tsx`) instead of a form: "This handoff is
  kept in Co-parent logistics — Change its time or repeat there, so the pattern you recorded moves with it", and hand over to
  Co-Parent's editor with `router.replace`. Placement respects each feature's boundary test: Kids may import only Life (F05), Calendar's
  own files import nothing that mutates beyond their pinned set (F03) — hence the separate read-only module.
- **Not changed:** F07's own editor and every rule it writes; any non-handoff event (the Calendar and Kids editors are unchanged for
  them, proven).
- **Tests:** `handoffOwnership.test.mjs` (7): the rule the guard protects; which events are handoffs; Today's routes; the Calendar form
  and the Kids editor render no field for a handoff and hand over to Co-Parent (and render their forms for any other event); the
  Calendar tap and the Kids tap open a handoff in Co-Parent and any other event in its editor. Test-the-test D35-M1..M6 (each guard, each
  entry point, the predicate) — **6/6 caught**.
- **Status:** FIXED `4199baa`.

## HK13-D36 — The sign-in screen has never had an entry point (P9, pre-existing; owner decision OD-HK13-02)

- **How found:** Phase 12 route inventory (`scratchpad/route-inventory.cjs` over every route file and every navigation in `app/` and
  `src/`). Every feature route is reachable — the five tabs, the Life hub's category rows (Kids, Home, Money, Meals, Work, Co-parent)
  and private rows (Me/Rebuild, Life Admin, People), and every editor from its area — except `/sign-in` (and `/dev-tools`, internal by
  design). No dead button in any product screen (the no-op buttons are the internal design gallery's), and no screen writes to the store
  when a form opens (no effect writes; every create/update runs from a Save or an explicit action).
- **What:** `app/sign-in.tsx` ("Signing in is offered, never demanded") arrived with Build 4's identity work (`4fca961`) and is guarded
  `signedOut`, but no commit has ever linked to it. With no way to sign in, no user can bind an account on this build: sync, a second
  device, account switching and everything the backend certification proves are reachable only in tests.
- **Why not repaired here:** adding the entry point exposes Apple and Google sign-in, which the brief sequences AFTER this certification
  ("Do not … start auth verification", "Do not test live auth"). Where it goes and when it ships is the owner's.
- **OD-HK13-02 (owner):** add the sign-in entry point (e.g. an account row on the Life hub or a quiet line under Today's status) as part
  of auth verification. Until then the product is a single-device, local-first app, which is also what its copy says.
- **Status:** DOCUMENTED (pre-existing).

## HK13-D37 — One recorded responsibility, two voices (P5)

- **How found:** Phase 13 copy audit, which read each responsibility state's wording in every feature that shows one.
- **What:** the same foundation responsibility state is described in two voices. The Calendar's `responsibilityLine`
  (`src/features/calendar/copy.ts`) says "`${name}` accepted", "`${name}` completed it" and "`${name}` has seen it and hasn't accepted
  yet". Kids' `coverageTag` (`src/features/kids/copy.ts`) says "Seen · not accepted" and "Said no". Co-Parent (`src/features/coparent/copy.ts`)
  says "You recorded that `${name}` accepted this." A co-parenting handoff with a responsibility can therefore read "Alex accepted" on the
  Calendar and "You recorded that Alex accepted this" in Co-Parent.
- **Why it is not the brief's overclaim:** every state is the one she recorded. Nobody else acts in the app, and each surface ties each
  word to exactly that state: acknowledged is never shown as accepted, and requested is never shown as completed.
  `tests/kids/copyTruth.test.mjs` pins Kids' words to those states. `tests/calendarProjection.test.mjs` pins the state the Calendar's
  line reads from, but not the words; the Phase 13 read found none wrong. The inconsistency is one of voice. F07 chose the stricter one
  because a co-parent is outside the household and the record may matter later.
- **Severity:** P5. This is low-grade correctness: the wording is inconsistent across features, but no state is misstated.
- **Why not repaired:** aligning the wording changes copy in two features, and one of them pins its words in a copy-truth test. It also
  changes F03's and F05's voice. That is not a trivial, local change, so it is left for the owner's copy pass.
- **Status:** DOCUMENTED.

## HK13-D38 — Two Work form fields took more than their record may hold (P6)

- **How found:** Phase 12's "long but valid text" check. A scan of every `<TextField>` in `src/` and `app/` found 110 fields. Nine
  declared no `maxLength`: two are in the development gallery, and five are Talk It Out's capture cards, which clip a corrected title
  to 90 characters by design and say so (`revise.ts`). The remaining two are F10's "Next action" and "Interview" fields in
  `src/features/work/OpportunityForm.tsx`.
- **Reproduction:** open an opportunity, choose "Add a next action", type 201 characters, and press Add.
- **Expected:** the field stops at 200 characters, the limit on the Task it creates, as every other title field in the app does.
- **Actual:** the field accepted any length. `addTask` builds the Task, the store's validation refuses the state, and the form says
  "Her Keys couldn't save that yet. Try again." Retrying can never succeed. Her text stays in the field, so nothing is lost silently.
  The interview field behaves the same way, because it creates an Event, which is also limited to 200 characters.
- **Root cause:** the two inline mini-forms were added without the `maxLength` the opportunity's own fields carry.
- **Privacy / data-loss impact:** none. The save is refused and says so, though the message is wrong.
- **Severity and why:** P6, UX polish. It needs an unusual 200+ character title to reach, and it misreports a permanent refusal as
  a transient one.
- **Repair (AUD13-09 `eb09888`, trivial, local, negligible risk):** both fields now pass `maxLength={FIELD_LIMITS.titleLength}`. Nothing else
  changes.
- **Tests:** `tests/hk-f01f13/namesAtTheLimit.test.mjs`, "every field of the opportunity form, the next action and the interview
  included, is bounded by the domain limit", which also asserts that no field of the form is unbounded. It fails without the repair.
  Mutants D38-M1 and D38-M2 each remove one bound, and **2/2 are caught**.
- **Status:** FIXED.

## HK13-D39 — Two F05 SQL mutants changed a function the chain had already replaced (P4)

- **How found:** Phase 14 ran every feature mutation suite on the integrated line. `f05-mutation-check.cjs` reported **36 caught,
  2 SURVIVED**. The survivors were S-N4b (`sync_push` no longer checks household membership before a child is written) and S-N8 (the
  child collision probe also matches the account holder's own member row).
- **Root cause:** both mutants edit `supabase/migrations/20260921190000_f05_add_child_after_binding.sql`. At WAVE3_BASE that was the
  last migration to declare `public.sync_push`. On the integrated line, F10, F11, F12 and F13 each re-declare it, carrying F05's child
  path cumulatively (HK13-D03), so the live function is F13's. A mutant on F05's copy changes a function the chain has already
  replaced. The guards held, but no mutant tested them. This is the same class of defect as HK13-D30.
- **Not affected:** S-N9 and S-N10 edit `private.push_household_child`, which only F05 declares, so they were live and caught. The
  other suites apply their SQL mutants after the chain (`HERKEYS_*_MUTANT_SQL`), so they always hit the live definition.
- **Severity and why:** P4, an integration-specific test-infrastructure defect. Two privacy and correctness guarantees on the child
  path went unguarded by test-the-test. The product code was right: once re-targeted, both mutants are caught.
- **Repair (AUD13-09 `eb09888`):** `LIVE_SYNC_PUSH` finds the last migration that declares `public.sync_push`; migration file names start with
  their version, so they sort in chain order. S-N4b and S-N8 now target that file, and a future re-declaration moves them with it.
- **Tests:** S-N4b is **caught** (2 failing) and S-N8 is **caught** (1 failing), both by `run.mjs 77`. The F05 suite is 38/38 at the
  final gate.
- **Status:** FIXED.

## HK13-D40 — A past-due autopay bill was called "overdue" (P4)

- **How found:** closing the Phase 5 candidates. `MONEY_COPY.autopayConfirmCleared` ("Her Keys has no record showing whether this
  cleared.") was defined but used by nothing. The comment on `autopayPreDueSuppressed` (`src/domain/reasoning/attention.ts`) promises
  that a past-due autopay bill is "worded by the consumer as 'confirm cleared', never 'autopay failed'". Neither consumer did so.
- **Reproduction:** an autopay bill due yesterday that she has not marked paid. Money Home lists it as "$50.00 · Overdue since
  2026-09-15 · Autopay", and Today says "“Phone plan” is 1 day overdue."
- **Expected (F09's owner doctrine, `moneyCopy.ts`):** "an autopay obligation is never told 'failed' or 'cleared' — only 'confirm
  cleared', since Her Keys has no evidence either way". A past-due autopay bill still surfaces, because it may need her, but
  "overdue" claims it is unpaid.
- **Actual:** "overdue" on both surfaces, every month, for every autopay bill she had not marked paid by its due date.
- **Root cause:** F09 built the suppression rule (no pre-due nudge) and the copy, but its line formatter used the generic obligation
  status for every mechanism. Today's attention view, where the comment placed the wording, words every past-due task the same way.
- **Privacy / data-loss impact:** none. **Severity and why:** P4, copy that misstates system truth, the same class as the Life hub
  subtitle (HK13-D10). It asserts a payment state Her Keys cannot know, against an explicit owner rule, on two surfaces.
- **Repair (AUD13-10 `143f923`):**
  - Money Home: a past-due autopay line reads "$50.00 · Due 2026-09-15 · Autopay · confirm it cleared" (`statusAutopayPastDue`).
  - Today: "“Phone plan” was due Sep 15 on autopay — Her Keys has no record showing whether it cleared."
  - A manual bill is unchanged: it is still overdue, because nothing pays it without her.
  - Nothing else is changed: the suppression rule, the One Move rule (HK13-D19) and the verdict line ("N money items need attention").
- **Tests:** `tests/hk-f01f13/moneyDoctrine.test.mjs`, "HK13-D40 — a past-due autopay bill is never called overdue", covers Today's
  statement (and that a manual bill is still overdue) and Money Home's rendered line. Mutants D40-M1 (Money Home) and D40-M2 (Today)
  are **2/2 caught**. The Today and Money suites pass (309/309).
- **Status:** FIXED.

## HK13-D20 — Meals and Co-parenting tasks are listed twice (P6)

- **How found:** Phase 5, from the Life hub's reachability model (`src/domain/taskLists.ts`).
- **What:** `TASK_LIST_ROLES` is Kids, Home, Money and Work: those screens list every open task in their category, so the hub's
  "Other open tasks" leaves those tasks out. Meals (`mealsView.ts`) and Co-Parent (`coparent/projection.ts`) also list their
  category's tasks, but they are not task-list roles, so the same tasks appear again under "Other open tasks".
- **Why not repaired:** the Meals list is capped at `TASK_LIMIT = 30` with no "show more". Adding Meals to `TASK_LIST_ROLES` would make
  the 31st open meal task reachable from nowhere, which is the defect class HK13-D17 repaired for Money. Listing a task twice is
  harmless: every task stays reachable, and completing it from either place is the same canonical Task. The right repair (a reveal on
  Meals' list, then the role) is a Meals and hub design change for the owner.
- **Severity and why:** P6. It is a duplicate listing and UX polish; nothing is wrong or unreachable.
- **Status:** DOCUMENTED.

## HK13-D21 — Editing a record shows its reference number in full (P5)

- **How found:** Phase 5, F12's "masked references / reveal ephemeral" check.
- **What:** F12's design makes the record detail the one surface with the reference number, masked until she presses Reveal, with
  Reveal kept in component state only. The edit sheet (`RecordSheet`, opened from the detail) pre-fills every field, the reference
  included, in plain text (`LifeAdminContainer.tsx` `valuesOf`). Pressing Edit to fix a title therefore shows the full reference
  without her asking.
- **Why it is P5 and not a privacy boundary:** it is her own record, on her own device, on the record's own edit sheet. Nothing
  crosses an account, the home, the hub, Today, a log or durable evidence (`privacy.test.mjs`), and it is not stored anywhere new. It
  is a display-doctrine inconsistency, a shoulder-surfing nuance.
- **Why not repaired:** masking an editable field properly needs a Reveal control inside the sheet. A blind `secureTextEntry` field
  would stop her seeing what she types into a reference number, so the fix is not trivial. It is F12 UI design for the owner.
- **Status:** DOCUMENTED.

## HK13-D41 — A shared System's steps are owner-private (P9, pre-existing, latent)

- **What:** `household_systems` is household-visible, but `system_steps` is read only by the member who wrote the step
  (`system_steps_select_own`, the Build 4 foundation rule that every foundation kind is owner-private, ADR-005/-023). In a household
  with a second adult, that adult would see the System (for example "Sunday reset") and none of its steps.
- **Reachability: none in a user build.** No build has a path for a second member: no invitation flow, HK13-D34 and HK13-D36.
  F04's own build notes do not mention this, so it is recorded here.
- **Severity and why:** P9. It is a future product decision (shared steps, or steps scoped with their System) that belongs to the
  multi-member work. It is not an integration defect, and the integration changed nothing about it.
- **Status:** DOCUMENTED.

## HK13-D42 — "Add child" is offered to a member who cannot add one (P9, pre-existing, latent)

- **What:** `canAddChild` (`src/features/kids/mutations.ts`) checks only that the device is not quarantined. The server lets only
  the household's owner add a child after binding (`private.push_household_child`; suite 77: "a second MEMBER of the household (not
  the owner) is refused with 42501"). A non-owner adult would add a child locally and see the push refused. The child would stay on
  her device and appear as sync attention.
- **Reachability: none in a user build**, for the same reason as HK13-D41.
- **Severity and why:** P9. It is latent, and the server is the authority. The fix is to gate the button on the household role once
  a second member can exist.
- **Status:** DOCUMENTED.

## Known shared privacy items — re-audited under the P0–P10 rubric (Phase 8)

The brief: "These are NOT automatically accepted debt merely because F12/F13 documented them. Apply the P0–P10 rubric NOW."

| Item | Re-audit (integrated DB, `81-int13-privacy.sql` + F13 phase-A probe) | Classification |
|---|---|---|
| Responsibility uniqueness oracle | REAL, and wider than recorded: four owner-private rules answered for another member's private row about a SHARED item | **P2 → FIXED (HK13-D24)** |
| FK existence oracle | B's own row naming A's private Task, person, opportunity or Focus is refused EXACTLY like naming a random uuid (five integrated probes: F10, F11, F12, F13 ×2). The one residual (F13 phase-A NOTE): a composite `(task, household)` key accepts a real private Task uuid from B's own handoff — usable only by someone who already holds that server-generated UUIDv4, which no read path, change-log entry or pull ever gives B (all proven) | HK13-D25 **P9** — documented; infeasible without a leaked uuid |
| Task local-id guessability | A guessed local id of A's private Task collides (scoped tables key local ids per household). Production ids are `task-<ms>-<counter><4 random base-36>` (≈1.7M × every candidate millisecond); F13 follow-ups use 24–48 random characters. Owner-private tables key local ids per OWNER: B reusing A's context's local id makes her own row (proven) | HK13-D26 **P9** — documented; not practically guessable |
| Refused-row evidence redaction | One redaction for every refused row's DETAIL (HK13-D07); PostgreSQL still returns the row values, so the client-side redaction is load-bearing and tested (`tests/rebuild/sync.test.mjs`, `tests/lifeAdmin/sync.test.mjs`, transport tests) | Verified — no defect |
| Private change-log visibility | Every owner-read table that feeds the change log logs its owner (catalog sweep, all tables); B sees no entry — not the table, not the id — of any of A's sixteen private rows; `sync_pull` carries none | Verified — no defect |
| Owner-private relationship transport | Every link table refuses a foreign parent or target before any key is consulted and answers like "nothing"; B cannot write as A through a table or through `sync_push`; C and anon read and write nothing | Verified — no defect |
