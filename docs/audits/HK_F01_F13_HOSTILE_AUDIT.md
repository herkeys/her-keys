# HK F01–F13 — Full Product Integration Hostile Audit

Branch `integration/f01-f13-convergence` · worktree `C:\Users\jsmit\Her-Keys-F01-F13` · cut from WAVE3_BASE
`363e473fdf053547a21a41a67b7f62bd9aa2bcdf` (`integration/wave2-f01-f08`, tag `wave2-final`).
Companion documents: `HK_F01_F13_INTEGRATION_MAP.md`, `HK_F01_F13_DEFECT_LEDGER.md`, `HK_F01_F13_BACKEND_CERTIFICATION.md`.

This report is written milestone by milestone as the campaign runs; each milestone records the gate it passed.

---

## 1. Environment gate (Phase 0) — PASS

Recorded 2026-09-22 before any write.

| Check | Result |
|---|---|
| `git fetch origin` | ok |
| `git remote -v` | `origin git@github-herkeys:herkeys/her-keys.git` (fetch/push) |
| `git worktree list` | 7 worktrees: main checkout (`feature/01-today-chief-of-staff` @ `0a893ba`), `Her-Keys-F09` … `Her-Keys-F13`, `Her-Keys-W2I` (`integration/wave2-f01-f08` @ `363e473`) |
| `git status --short` (every worktree) | clean |
| `main` | local = origin = `bab9773` (untouched) |
| `integration/wave2-f01-f08` | local = origin = `363e473` = WAVE3_BASE (intact) |
| Feature refs, verified independently with `git ls-remote origin` | see §3 — every local head equals its remote head |
| Concurrent backend harness | none (`node … supabase/tests/run.mjs` / `run-f1*` / `run-coparent` / mutation checks: 0 processes) |
| Shared container `supabase_db_Her_Keys` | healthy; only the default `postgres` database had sessions; existing scratch sets `b4_env_*`, `f12h_env_*`, `ir01_*` left untouched |
| Shared default database (read-only probe) | 34 public tables, `tasks.duration_source` present, no F09–F13 object; `supabase_migrations.schema_migrations` = the two Build 4 versions only |
| Host | Windows 11; 15.6 GB RAM (0.4–1.0 GB free during the run: several other sessions active), 11.5 GB free disk |

No destructive reset, no force push, no branch deletion was performed at any point.

## 2. F10 prerequisite — PASS

`feature/10-work-career-os` resolved from origin: `8f2f7d4514d8509b126fb6d9fd3067680f8da425` (local = remote). Its ledger
`docs/builds/HK_FEATURE_10_WORK_CAREER.md` states, at line 14 and in §17.4 "Final verdict":
**F10 WORK / CAREER OS: COMPLETE — READY FOR WAVE 3 INTEGRATION** (authoritative uncontested backend harness 1049/1049). Its §16
"STOPPED — RESUMABLE" is explicitly historical ("RESOLVED, see §17"). F10 therefore entered integration.

## 3. The five feature heads integrated

| Feature | Branch | Head (local = `git ls-remote origin`) |
|---|---|---|
| F09 Money OS | `feature/09-money-os` | `17580d4b2feb8dab5a29925794eaced17aeb24a4` |
| F10 Work / Career OS | `feature/10-work-career-os` | `8f2f7d4514d8509b126fb6d9fd3067680f8da425` |
| F11 Me / Rebuild OS | `feature/11-me-rebuild-os` | `03585f99652c230c72fa1c213905be691a4daac1` |
| F12 Life Admin / Documents | `feature/12-life-admin-documents` | `54da29c0a8bef27ad51f05c805c316f29b55e974` |
| F13 People OS | `feature/13-people-os` | `3eb2ba0e6f1aa9ee8fb1122da3575caf1553b10c` |

Every branch's merge-base with WAVE3_BASE is `363e473` (each was built from it). No branch changes `package.json` or
`package-lock.json` (only `.gitattributes` LF pins), so one clean `npm ci` (583 packages, a real `node_modules`, no junction) serves
the integrated tree.

## 4. Integration order and conflicts (Phase 2)

Merged in the mandated order with `git merge --no-ff --no-commit`, conflicts resolved by reading both sides (`zdiff3`), never with
`-X ours/theirs` or `checkout --ours/--theirs`.

| Commit | Merge | Textual conflicts | Resolution in one line |
|---|---|---|---|
| `cc15e9a` INT13-00a | F09 | 0 | clean |
| `2fadc79` INT13-00b | F10 | 0 (5 auto-merged shared files checked by hand: attention, apply, projection, syncTypes, legacyShapes) | clean; F10's in-place migration edits deliberately carried to INT13-01 |
| `cbf8050` INT13-00c | F11 | 11 | unions of registrations; F11's "Build 4 kind set unchanged (18)" guard kept (it catches F10's defect) |
| `02fa959` INT13-00d | F12 | 11 | unions; F12's `HERKEYS_HARNESS_DB_PREFIX` applied to every environment; ONE redaction implementation |
| `85c585a` INT13-00e | F13 | 13 | unions; ONE additive-migration generator mechanism (F13's form); private-stack names reconciled |
| `7c5351a` INT13-01 | shared infrastructure | — | the migration chain: four integration defects (HK13-D01…D04) repaired |

After assembly every file any feature branch added or modified is present (scripted check over `git diff --name-only
--diff-filter=AM 363e473 <branch>`), and every feature's added test files are present (F09 5/5, F10 1/1, F11 6/6, F12 12/12,
F13 11/11).

### 4.1 Semantic conflict resolutions (the ones that were not simple unions)

1. **Generator mechanism** (F11 vs F13) — see ledger HK13-D05. F13's filename form kept; F11 re-expressed; comment-only
   regeneration of F11's region.
2. **Row-value redaction** (F11 `redactRowValues` vs F12 `withoutRowValues`) — HK13-D07. One implementation.
3. **Private stack names** (F12 `HERKEYS_PRIVATE_DB` vs F13 `HERKEYS_PRIVATE_STACK_DB` + `^f\d\d_` guard) — HK13-D06.
4. **Manifest tests**: F11 checked the LATEST `sync_push`/change-log definition; F13 checked each kind in its creating migration.
   Both kept as separate tests; F11's is the one that detects the "last migration wins" defect (HK13-D03).
5. **`run.mjs`**: F12 renamed every database through `dbName()`; F10/F11/F13 checks re-expressed in that form; F13's ENV D helper
   renamed (`pushPeople`) because F11's block in the same function already declared `pushAs`.
6. **Life hub**: both F11's `me-rebuild` row and F12's `life-admin` row kept at merge; the IA decision is Phase 4 (§6).

### 4.2 Shared generator reconciliation

One manifest (`src/domain/sync/foundationSpecs.ts`) and one generator (`supabase/tools/gen-foundation-sql.mjs`) now cover: the
shipping migration (18 Build 4 kinds, emitted **as created**), and three additive migrations — F10 (`opportunity` + the
`dependencies` widening as a `RefExtension`), F11 (2 kinds), F13 (2 kinds). `--check` is clean for all four files.

### 4.3 `sync_push` and change-log reconciliation

Every additive migration that re-declares `public.sync_push` or `change_log_entity_table_check` now carries every earlier
migration's registrations (F10 → F11 → F12 → F13, cumulative). Final `sync_push` owner-private allow-list = the Build 4/F05 list +
`career_opportunities`, `rebuild_focuses`, `rebuild_focus_links`, `life_records`, `life_record_task_links`, `person_contexts`,
`person_task_links`; final no-revision list adds `person_task_links`; the final change-log list is the Build 4 list + the same seven.

### 4.4 Harness reconciliation

`supabase/tests/migration-chain.mjs` is the one ordered chain: baseline → shipping → IR01 → F08 → F05 → F09 → F10 → F11 → F12 →
F13, versions `20260919230054 < 20260919231500 < 20260921120000 < 20260921160000 < 20260921190000 < 20260922180000 <
20260922181000 < 20260922182000 < 20260922183000 < 20260922200000`. `run.mjs`, `private-stack.mjs`, `run-f12.mjs` and
`run-f13.mjs` read it. Application table count after the chain: 34 + 1 + 2 + 2 + 2 = **41**.

## 5. ENTRY counts (Phase 15) — after integration, before any audit repair

Measured at `7c5351a` (INT13-01).

| Measure | ENTRY |
|---|---|
| TypeScript (`tsc --noEmit`) | clean (0 errors) |
| App suite (`node --test --test-concurrency=1 "tests/**/*.test.mjs"`) | **3177 tests, 710 suites: 3174 pass, 3 fail** (195.8 s) |
| App failures | all three are the Meals boundary scan (`tests/meals/boundary.test.mjs`: [BV] the scan, [BM] sibling imports, [BL] "routing untouched" — tripped by F10's `routeAccess.ts`/`app/_layout.tsx`) — the P4 the brief predicts |
| Backend harness | see §5.1 |

### 5.1 Backend ENTRY

Uncontested full harness at `7c5351a`, audit namespace: `HERKEYS_HARNESS_DB_PREFIX=f1313audit` (databases `f1313audit_env_*`,
private stack `f1313audit_stack` / `f1313audit_postgrest` on 54593/54594), gated by a wrapper that waited for two quiet polls with no
other `run.mjs` / `run-f1*` / `run-coparent` / mutation-check process and logged any that appeared during the run (none did).

| Measure | ENTRY |
|---|---|
| Backend harness `node supabase/tests/run.mjs` | **1431 / 1431 checks passed** (00:54:41 → 01:00:09, contention events 0, stderr: NOTICEs only) |
| Sections that ran | ENV A, B1/B2, B3, D (IR01 → F05 → F09 → F10 → F11 → F12 → F13), E, C (29 SQL suites: 00 … 99, incl. 57/58 with F10's endpoints, 78-f11, 78-f12, 79-f12, 79-f13 ×2), authorization parity, client payload → RPC, journeys (sync-integration, composition, kids, home, rebuild, life-admin, people) on the private stack |
| Arithmetic check | WAVE3_BASE harness 1028 + F10 21 + F11 96 + F12 135 + F13 119 = 1399, + INT13-01's chain checks (migration gate, F09/F10 quality, ENV A/D chain registrations, ENV D F09/F10 upgrade steps) = 1431 |

ENTRY failures to carry into the audit: the three Meals boundary-scan tests (P4, predicted). Two P0 and one P3 defects were
reproduced before the ENTRY run finished (HK13-D08, D09, D10 in the ledger); none of the ENTRY tests caught them — that is itself a
finding about the feature branches' test coverage.

## 6. Integration map (Phase 3)

`HK_F01_F13_INTEGRATION_MAP.md` was committed with `df89506` and traced from the code, not inferred. For every feature it records:
branch and source, canonical entities, routes, screens, commands, projections, backend tables, migrations, RLS model, sync kinds,
the Today, One Move, Calendar and Life integrations, cross-feature imports, and deferred seams. It also lists every import between
feature folders and the canonical owner of each record type. §17 below restates the owners as the brief's cross-system matrix.

## 7. Life hub reconciliation (Phase 4) — INT13-02 `b681a4c`

**Before:** Co-Parent (`/life/coparent`) and People (`/life/people`) had no entry point anywhere. They were reachable only by a link
(HK13-D10, P3). F07 had left "register the route in the Life hub" to integration, and F13 had left its ready-made tile unwired. The
hub subtitle ("Five areas, one picture. Everything here is what Her Keys reads when it looks at your day.") was false on both counts.

| Decision | What was chosen, and why |
|---|---|
| Registration mechanism | No new plugin system. Household areas stay what they were: one row per active category whose role has a Life screen (`LIFE_SCREEN_ROUTES`), in the household's own order and names. `coparenting: '/life/coparent'` joins the map because F07 identifies a co-parenting record by exactly that category. The row is the generic "due / on today" count and disappears with the category. |
| Ordering | Kids, Home, Money, Meals, Work, Co-parenting, in the household's own category order; then the catch-alls: Other open tasks, the Life Inbox and Needs Me. |
| Grouping | Two sections. "Where things stand" holds the household areas. "Just for you" holds the three owner-private areas: Me / Rebuild, Life Admin / Documents and People (F13's count-only tile). None of them reaches her day by itself; only a Task made from one does. So they are grouped, not ranked alongside the household areas. |
| Primary vs nested | No new tab: the shell is exactly Today, Life, Calendar, Systems and Her Keys AI (`lifeHub.test.mjs`). Every Wave 3/4 screen is nested under Life, and each detail, add and follow-up screen under its area. |
| Copy | "Where each part of your life stands, in one place." Under the private section: "Private to you. Only the tasks you make here reach your day." |
| Truthful rows | Every row shows a count or a date, never a name, title, note, number or place. HK13-D23 corrected two rows that denied what exists. |

**Proof:** `tests/hk-f01f13/lifeHub.test.mjs` (7 tests: every Life route is navigated to from code other than its own file; the hub
reaches all 12 areas; the shell has exactly five tabs; the copy is true). The pre-fix hub fails 4 of the 7.

## 8. Feature-by-feature hostile audit (Phase 5)

Every item on the brief's per-feature checklist was traced to the test that holds it, reading the committed tree with `git grep` and
`git show` only: 97 items for F08–F13, and every item for F01–F07. The items that were true in the code but held by no test are now
held by `tests/hk-f01f13/doctrineClosures.test.mjs` (9 tests) and `namesAtTheLimit.test.mjs` (6). Every closure was proven by a mutant
(DC-M1..M8, D38-M1..M2: 10/10 caught). Defects found are in the ledger; the table names the main evidence.

| Feature | Verified (main evidence) | Found and repaired | Documented |
|---|---|---|---|
| **F01 Today** | What Matters, attention ordering, Daily Load, One Move selection and withholding, stored-decision truth (`today/*`, `oneMove`, `dailyLoad*`). Only a Task or a Needs Me item can be the One Move (`crossSeams`; I10 and I11 caught). No Person, Record or Focus reaches Today; an opportunity reaches it only through a date she recorded, as one factual row that is never the One Move and never load (`doctrineClosures`, DC-M1). Completed, archived and tombstoned targets are handled (`crossSeams`). The `cleared` One Move outcome is intentional (a selected move whose target disappeared). | D12 (duration default), D19 (money doctrine), D28 (offline One Move day), D40 (autopay wording) | OD-HK13-01 |
| **F02 Talk It Out** | Capture, and LISTEN → HYPOTHESIS → CLARIFY (`talkItOut*`). An inference is never promoted to fact (`ingestionReasoning`). Ambiguity asks and never guesses (`talkItOutCapture.reader` B, U1). The interpreter is unchanged since WAVE3_BASE except the accepted row's scope (D14). The Wave 3/4 seams stay pending: `INTERPRETATION_KINDS` is exactly task, event and needsMe (`doctrineClosures`, DC-M2). | D14 (scope of accepted rows) | — |
| **F03 Calendar** | Canonical Events; due-date projection; capacity equals Today's tier (equivalence oracle); the household zone governs; duration provenance; local-midnight boundaries (`calendar*`, `hostileAudit`). Money creates no Event (`crossSeams`), and neither do Life Admin or People (`lifeAdmin/commands`, `people/doctrine`, `doctrineClosures`). An opportunity's dates are not Events; only an interview is (`doctrineClosures`, DC-M3). | D14, D35 (handoff editing) | D37 (voice) |
| **F04 Systems** | Canonical System; lifecycle; steps are a blueprint, not a checklist (`systems/*`). Focus links never mutate a System (`rebuild/focus.relationships`). People and Life Admin create no System, step, recurrence or Event (`doctrineClosures`, DC-M8). | D24 (per-owner step slot) | D41 (steps owner-private, latent) |
| **F05 Kids** | Child identity is the id, never the name. Add child (`kids/children`, suite 77). A cloud rename keeps identity (`syncComposition`). Subject rules (suite 30). RLS (77, journey-kids). Kids stays the only child model (`kids/boundaries`). F12 and F13 read the child by id (`crossSeams`, `lifeAdmin/commands`, 79-f13). No dangling projection (`kids/projection` AL). | D35, D39 (mutants on dead `sync_push` code) | D42 (Add child for non-owners, latent) |
| **F06 Home** | Home tasks each appear once; visits and the "marked done / condition not verified" truth (`hk-f06/*`). Local-first through restart and offline (`homeMutations` L, M). Home keeps its workflow. People and Life Admin grow none (`doctrineClosures`). | — | — |
| **F07 Co-Parent** | Assigned ≠ acknowledged ≠ accepted ≠ covered; request; decline and return; handoffs (`coparent/*`). Done ≠ paid (`coparent/money`, `crossSeams`). People cannot edit the co-parent (`people/domain`, `crossSeams`). Money only projects F07's truth (`money/reimbursements`). A holder archived from People reads "holder unavailable" (a deliberate state, guarded by K-M10). | D10 (entry point), D24, D35 | D37 |
| **F08 Meals** | Planning, status and slot, and "nothing defaults to dinner" (`meals/*`, suite 77-meals). Meals leaves every other collection untouched (`lifeIntegration` AO1). The boundary gate registers every later lane and attributes each change to its lane (D11, D22; `boundary.test.mjs` 10/10). | D11, D22 | D20 (duplicate listing) |
| **F09 Money** | Integer minor units, USD only, explicit direction, payment mechanism (`money/*`, suite 58). Expected ≠ received; done ≠ paid; no pre-due autopay nudge (`money/projection`, `moneyDoctrine`). Money Home lists every open Money task exactly once (`moneyReachability`). F07 mapping. Today, One Move and Calendar integration (`crossSeams`). Recurring only by her explicit copy, never on "paid". One amount, never split. An edit or a copy never widens visibility. No bank, provider or network call (`doctrineClosures`, DC-M4, DC-M5). V1 scope is `household` by the documented F09 decision. | D17, D19, D23, D40 | — |
| **F10 Work** | Stage vocabulary; stages move only by explicit action; closed reason; closed ≠ archived (`work/opportunity`, `careerLists`, `opportunityForm`). Next action is a Task and an interview is an Event, through the generic typed Dependency (`crossSeams`; I2 caught). No money field (`work/opportunity`). No automatic advancement (I12 caught). Stored fields pinned: no ATS, CRM, amount, time or duration (`doctrineClosures`). No capacity effect from the opportunity itself (`doctrineClosures`). | D01, D08, D09, D15, D16, D38 | — |
| **F11 Rebuild** | Active, paused and archived; Focus ≠ Goal; no score, streak or guilt timer; no missing-step alert (`rebuild/*`; I13 caught). Next step is a private Task; typed links. Today and One Move are unchanged by a Focus (`crossSeams`, `rebuild/focus.relationships`). Private note; account switch; demo isolation (`rebuild/sync`, `accountSwitch`). | D08, D09, D23 | — |
| **F12 Life Admin** | Title + kind is a complete record; duplicate titles; identity is the id; dates; expires today ≠ passed (I15 caught); 14-day window; review cap 3; masked reference; ephemeral reveal; restricted location and note (`lifeAdmin/*`; I4 and I4b caught). Private Task creation; archive; clearing sensitive fields. Stored fields pinned: no file, URL, scan or supersession. No delete command or control, no search field or picker (`doctrineClosures`, DC-M6, DC-M7). | D08, D09 | D21 (edit sheet reference) |
| **F13 People** | Reuses `household_people`; one context per owner and person; no automatic merge (I16 caught); same names stay separate (`people/*`, `crossSeams`, `namesAtTheLimit`). Relationship and organization labels; private note; home and follow-up cap. The follow-up is a private Task with relation `follow_up` only (79-f13). A Person is never Today or the One Move (I10 caught). The co-parent is read-only; the current user is absent; the demo has duplicate names; no contacts, communication log, guilt timer or social inference (`people/doctrine`, `people/ui`). | D09, D10, D13, D31 | — |

## 9. Cross-feature truth (Phase 6)

Each system has one canonical truth and one owner (§17). `crossSeams.test.mjs` (21 tests) builds ONE household holding every
feature's rows, each made by its own feature's command, and attacks the seams between them. No feature copies another feature's state
for display: every consumer reads the owner's rows by id (People reads the child from Kids and the co-parent from Co-Parent; Life
Admin reads the child by id and shows the current name; Money reads F07's reimbursement states), and the tests prove that nothing a
consumer does mutates the owner's row.

| Mandatory cross-seam test (brief) | Test |
|---|---|
| Person → private follow-up Task → Today → One Move | `crossSeams` "Person -> private follow-up Task -> Today -> One Move" |
| LifeRecord → private Task → Today | `crossSeams` "LifeRecord -> private Task -> Today" |
| RebuildFocus → private Task → Today / One Move | `crossSeams` "RebuildFocus -> private Task -> Today / One Move" |
| CareerOpportunity → Task; CareerOpportunity → Event | `crossSeams` "CareerOpportunity -> Task and CareerOpportunity -> Event" |
| Money Task → Today; Money Task → Calendar | `crossSeams` "Money Task -> Today and -> Calendar" |
| F07 reimbursement → Money projection | `crossSeams` "F07 reimbursement -> Money projection" |
| Child rename / current display → F12 relation | `crossSeams` "a record about the child follows the child's CURRENT name…" |
| Child identity → F13 projection | `crossSeams` "People shows the child from Kids' identity (no second person)…" |
| Co-parent → F13 projection without F07 mutation | `crossSeams` "People shows the co-parent, refuses to rename or archive them…" |
| Archive linked Task → parent feature remains valid | `crossSeams` "archiving a linked Task leaves its parent valid" |
| Delete / tombstone linked Task → no crash | `crossSeams` "a deleted or tombstoned linked Task" (3 tests) |
| Account switch with several private feature rows | `accountSwitch` "[P10] A -> B -> A on one device…" |
| Offline edits across several features before reconnect | `integratedJourney` (steps 14–17), `integratedDevices`, `syncLifecycle` |
| Same display names across People | `crossSeams` "two people named "Jordan Lee"…"; `namesAtTheLimit` (80 characters, twice) |
| Same titles across LifeRecords | `crossSeams` "two records titled "Passport"…"; `namesAtTheLimit` (200 characters, twice) |
| Same titles across RebuildFocus | `crossSeams` (same test); `namesAtTheLimit` |

Phase 6 found HK13-D12, and HK13-D14 through D17 and D19 came out of the same attack.

## 10. Backend: migrations, RLS, sync, isolation and the journey (Phases 7–11)

See `HK_F01_F13_BACKEND_CERTIFICATION.md`.
- **Chain and ledger:** eleven migrations in one ordered chain; every schema fact is attributed to exactly one migration, and each
  migration's counts are pinned.
- **Fingerprint:** WAVE3_BASE 3629 / `96f93f3d…` → F01–F13 4371 / `17dccce9…`. A step-by-step upgrade equals a fresh install fact
  for fact.
- **Populated upgrades:** ENV D, ENV E, and ENV F from exactly WAVE3_BASE with every Wave 2 feature's rows.
- **Privacy attack:** suite 81, 56 checks. It found HK13-D24 (P2), fixed with a per-owner uniqueness migration.
- **Sync:** the lifecycle matrix for every new type (34 tests) and registry reconciliation (8). It found HK13-D28 (P2) and HK13-D13
  (P1).
- **Account isolation and the 21-step journey:** see §4 and §5 of that document.

## 11. Navigation / UI surface (Phase 12)

- **Routes:** `scratchpad/route-inventory.cjs` covers every route file and every navigation in `app/` and `src/`. Every feature route
  is reachable, except `/sign-in` (HK13-D36, P9, OD-HK13-02) and `/dev-tools` (internal by design). The design gallery renders only
  in development builds. No product screen has a dead button, and no screen writes to the store when a form opens (every write runs
  from Save or an explicit action).
- **Reachability repairs:** Co-Parent and People gained entry points (D10). Closed and archived opportunities are reachable, with
  restore (D16). Money Home lists every open Money task (D17). A co-parenting handoff opens in Co-Parent from Today, the Calendar and
  Kids, and the two generic editors hand it over instead of editing it (D35).
- **States:** loading and recovery are held by each Wave 3/4 gate (`money/ui`, `lifeAdmin/screen`, `rebuild/sync`: a device holding
  another account renders the "other account" state). Empty, populated and archived states are held by each feature's view and
  screen tests. Local hydration is sound, because the root layout renders nothing until the store settles. Cloud hydration of a
  freshly bound device is gated on only three surfaces (HK13-D18, P5, latent: unreachable while HK13-D34 stands).
- **Account switch:** `boundOther` opens only `account-conflict` (§4 of the certification document).
- **Long names, duplicate names and long but valid text:** `namesAtTheLimit.test.mjs` fills Money, Career Next, Rebuild, Life Admin
  and People with names and titles exactly at their domain limits (200, 120, 80 and 60 characters), twice over. Every screen renders,
  both rows are listed and each opens its own record, and the whole text reaches the screen. A scan of all 110 text fields found two
  unbounded Work fields (HK13-D38, P6, fixed). Talk It Out's capture cards clip a corrected title to 90 characters by design and say
  so.
- **Keyboard and form behaviour:** each feature's own component tests cover it (for example "opening the step form creates NO Task",
  "opening and cancelling Add record writes nothing", "opening Add Follow-up creates no Task" (People M9), "Save is disabled until a
  title and a positive amount").

**Paper and Ink guard.** A token-level sweep of every Wave 3/4 destination found no raw colour, radius or type outside the theme. It
found no sage or spa, pastel-dashboard or fintech drift (Money has no charts, KPI numbers or coloured deltas), no rounded-everything,
and no accent used as a fill. HK13-D31 (P6, fixed): People showed save failures in plum, the colour reserved for "Her Keys noticed";
`designGuard.test.mjs` now holds outcome notices away from the AI tone. HK13-D32 (the `InlineNotice` default tone is plum) and
HK13-D33 (structural differences between destinations) are documented P6 items for the design system. The brief forbids a redesign.

## 12. Copy / doctrine (Phase 13)

Every user-facing string in `src/features`, `src/design` and `app/` was scanned for the brief's banned claims, and each feature's copy
module was read.
- **"You should…":** no directive. The hits are the doc comments that list banned phrases, format hints ("Date should look like
  YYYY-MM-DD"), One Move's estimate (a stated estimate only, since D12), and the welcome line "…you shouldn't have to keep in your head".
- **"You've neglected…" and "relationship health":** none.
- **"verified":** only the outcome label, shown for a succeeded execution with a recorded outcome. Life Admin says it has checked
  nothing with an issuer.
- **"invalid":** none visible to her; 142 code identifiers.
- **"paid" when only done / "received" when only expected:** repaired in D19, and I14 re-tests it.
- **Autopay "overdue" when nothing is known:** repaired in D40.
- **"completed" when requested / "accepted" when acknowledged:** each word maps to exactly its recorded state (Kids pins this in
  `copyTruth`). The Calendar and Kids voice differs from Co-Parent's "You recorded that…" (D37, P5, documented).
- **"synced":** never used. The sync notice says "One change needs your attention." / "N changes need your attention."

The doctrine ladder holds: understanding ≠ certainty, through synced ≠ real-world success. Examples are Talk It Out's "says what it
does not know", "A request is not the same as someone having it covered", and Today's "Handled" only for a success outcome.

## 13. Test-the-test (Phase 14)

Every mutant was applied to the working tree, judged by the tests meant to catch it, and restored byte-for-byte (sha256). None was
committed.

**Feature mutation suites, on the integrated line, serially, uncontested, audit namespace:**

| Suite | Result | Note |
|---|---|---|
| Today (F01) | 24/24 | |
| F05 Kids | 36/38 → **38/38** | S-N4b and S-N8 SURVIVED: they changed F05's copy of `sync_push`, which F10–F13 each replace (HK13-D39, P4, fixed). Re-targeted to the live declaration, both are caught |
| F06 Home | 47/47 | |
| F07 Co-Parent | 42/42 | |
| Meals (F08) | 20/20 | |
| Money (F09) | 6/6 | |
| F10 Work | 6/6 | F10's RLS proof is at the SQL layer (57-foundation-rls, and suite 81 here) |
| Rebuild (F11) | 17/17 | |
| Life Admin (F12) | 20/20 | the first run reported LA6, LA7 and LA7b BROKEN: the audit gave the F12 runner a database name it refuses (it owns only `f12_*`). Re-run as `f12_f1313audit`: 3/3 caught |
| People (F13) | 22/22 | the same naming mistake made its five SQL mutants ERROR. Re-run as `f13_f1313audit`: 22/22 |
| IR01 | 35/35 | two mutants re-anchored earlier (HK13-D30) |

F02, F03 and F04 ship no mutation suite of their own. Their guarantees are covered here by DC-M2, DC-M3, DC-M8 and D35-M1..M6.

**Integration mutants (the brief's I1–I17, plus three variants):**

| Mutant | Breaks | Caught by |
|---|---|---|
| I1 | F09's sync registration (the payment mechanism never travels) | `syncLifecycle`, `integratedJourney` |
| I2 | F10's opportunity relation (the runtime endpoint list) | `integratedJourney`, `syncLifecycle`, `crossSeams` (22 fail). A first I2 targeted the generator manifest and SURVIVED those tests; it is I2b |
| I2b | the generator manifest's dependency widening | `gen-foundation-sql --check`, `foundationSpecs` |
| I3 | F11 Focus readable by the household | suite 81 (real PostgreSQL) |
| I4 | F12 reference number in the generic record row | `lifeAdmin/privacy` |
| I4b | F12 reference unmasked on the detail before Reveal | `lifeAdmin/privacy`, `lifeAdmin/view` |
| I5 | F13 PersonContext existence readable by same-household B | suite 81 |
| I6 | F11's migration removed from the fresh-install chain | `migrationChain` |
| I7 | a change-log table dropped | `syncRegistry` |
| I8 | a `sync_push` case dropped | `syncRegistry` |
| I9 | the quarantine lets the next account open the app screens | `accountSwitch` |
| I9b | the next account resumes the other account's household | `accountSwitch` |
| I10 | a Person becomes a One Move candidate | `crossSeams` |
| I11 | a LifeRecord becomes a One Move candidate | `crossSeams`, `lifeAdmin/today` |
| I12 | an opportunity auto-advances when its interview is scheduled | `crossSeams`, `work/opportunity` |
| I13 | a Focus with no next step generates attention | `crossSeams`, `rebuild/focus.relationships` |
| I14 | a reimbursement marked done reads as paid | `crossSeams`, `money/reimbursements` |
| I15 | expires today counts as expired | `lifeAdmin/view` |
| I16 | same-name People merge | `crossSeams` |
| I17 | raw "Failing row contains (…)" evidence restored | `rebuild/sync`, `lifeAdmin/sync` |

**20/20 caught.** Each repair in this campaign was also proven by mutants that remove it, or by running its test against the pre-fix
code:
- **Proven against pre-fix code:** D08 (4/4 fail without the default), D09 (dropping `rebuildFocuses` from the content set fails 5/8,
  end to end included), D10 (the pre-fix hub fails 4/7).
- **Mutant sets, all caught:**
  - Migration and harness: ENVF 8/8.
  - Repairs by number: D11 9/9 (the Meals gate), D12 3/3, D13, D14 5/5, D16, D17, D19, D22 and D23 (14/14 in `df89506`), D24 2/2,
    D28 4/4, D35 6/6, D38 2/2, D39 2/2, D40 2/2.
  - Sync: P9 4/4, REG 6/6.
  - Doctrine closures: DC 8/8.
  - D30: the two IR01 mutants were re-anchored and are caught.
- **One survivor, documented:** D15-M1 is caught. D15-M2 SURVIVES: it reports a refused stage change as saved, but no input the form
  can produce reaches that refusal any more, so the retained guard is defence in depth on an unreachable path (see the ledger).

## 14. Test accounting (Phase 15)

| Measure | ENTRY (`7c5351a`, after integration, before any repair) | EXIT (final gate, §20) |
|---|---|---|
| TypeScript | clean | see §20 |
| Application suite | 3177 tests, 710 suites: 3174 pass, 3 fail (the Meals boundary gate, predicted) | see §20 |
| Backend harness | 1431/1431 | see §20 |

**Nothing silently disappeared.** Every test name at ENTRY was compared with the final head, reading git objects only
(`scratchpad/test-names-diff.cjs`). No test file was removed. Test files went from 176 to 195: +19, all in `tests/hk-f01f13/`.
Exactly two ENTRY test names no longer exist; both were deliberately replaced, and they are the brief's "old/new names and reason":
1. `tests/meals/boundary.test.mjs`
   - **OLD:** "[BL1] [BL2] the routing, route access, root layout and Life layout are untouched, and the Meals route is the existing
     direct route"
   - **NEW:** "[BL1] [BL2] Meals never changed the routing, route access, root layout or Life layout; any later change to one is a
     registered later lane's; the Meals route is the existing direct route"
   - **Why:** HK13-D11, `bb53aeb`. The gate now attributes a later lane's change instead of calling it a Meals regression.
2. `tests/people/ui.test.mjs`
   - **OLD:** "the Life hub, its layout and the Today/One Move code are untouched by F13 (registration is deferred to integration)"
   - **NEW:** "the Life hub reaches People only through the count-only tile; the Life layout and the Today/One Move code are untouched
     by People"
   - **Why:** HK13-D10, `b681a4c`. Registration was the integration's job, and it is done.

One test this campaign added was renamed after it was committed, so it is not an ENTRY test. A `crossSeams` title said "no …
Opportunity becomes a Today item" while allowing a dated opportunity; it now says "…nor an undated Opportunity", and it asserts that.

## 15. Performance / resource sanity (Phase 16)

No test or harness process ran during the measurement. The host was contended by sibling sessions (0.6 GB of 15.6 GB free, CPU
59–63%); none was stopped. Each established budget test ran alone:
- `today/guarantees` (dense derivation): 25/25.
- `talkItOutCapture.reader` (400 ms budget): 167/167.
- `calendarPerformance`: 6/6.
- `systems/audits`: 12/12.
- `kids/dense`: 9/9.
- `hk-f06/homePerformance`: 4/4.
- `coparent/state` (dense AH): 17/17.
- `meals/mealsView`: 29/29.
- `scripts-dev/f05-perf.mjs`: hub median 3.10 ms against a 100 ms target, detail 0.62 ms against 50 ms.

Nothing failed, so nothing needed a re-run alone, and no threshold was touched. F09–F13 declare no performance budget, and none was
invented.

An informational measurement was also taken (not committed). It used the demo household plus 100 people, 103 contexts, 50
follow-ups, 200 records, 50 renewals, 30 Focuses and their steps, 50 opportunities, 25 actions and 60 bills. Today's full derivation
(day, attention, What Matters, One Move) went from a 0.30 ms median to 0.86 ms (p95 2.11). Medians for the Wave 3/4 homes: People
1.26 ms, Life Admin 2.71, Rebuild 1.09, Money 0.07, Career lists 0.01. There is no regression and no speculative optimization.

## 16. Feature matrix

"Route" is the entry route (every detail, add and editor route is under it). "Local" means the feature's commands work on the local
store. "Persist" means relaunch shows exactly what she left. "Sync" lists the kinds that carry it. "RLS" is where its tables are
attacked. "Today" and "Calendar" say how it reaches them. "Cross-feature" is what it may read and never write.

| Feature | Present | Route | Local | Persist | Sync | RLS | Today | Calendar | Cross-feature | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| F01 Today | ✓ | `/(app)/today` (tab) | ✓ | ✓ decisions, capacity plan | oneMove, observation, action (day stamped by the server; D28) | Build 4 suites, 92-one-move | owner | same day projection (equivalence oracle) | only Task and Needs Me become the One Move; opportunity only by a recorded date | **PASS** |
| F02 Talk It Out | ✓ | `/talk-it-out`, `/life/inbox` | ✓ | ✓ durable, unconfirmed readings | sourceArtifact, interpretation | Build 4 foundation suites | only accepted Task, Event or Needs Me | only an accepted Event | accepted rows take their category's scope (D14); Wave 3/4 kinds pending | **PASS** |
| F03 Calendar | ✓ | `/(app)/calendar` (tab), `/event-editor` | ✓ | ✓ | event, task | Build 4 suites | same day | owner | a handoff opens in Co-Parent (D35); no Money, Life Admin, People or opportunity Event | **PASS** |
| F04 Systems | ✓ | `/(app)/systems` (tab) | ✓ | ✓ | system, systemStep, recurrence | Build 4; step slot per owner (D24) | through its tasks | through its tasks | never mutated by Focus links; no parallel engine | **PASS** (D41 latent) |
| F05 Kids | ✓ | `/life/kids` | ✓ | ✓ | member (child path), task, event | 77-f05, 30, journey-kids | subset of Today's attention | child events | canonical child, read by id everywhere | **PASS** (D42 latent) |
| F06 Home | ✓ | `/life/home` | ✓ | ✓ restart and offline | task, event | Build 4 suites | ✓ | visits | keeps its workflow | **PASS** |
| F07 Co-Parent | ✓ | `/life/coparent` (D10) | ✓ | ✓ | task, event, responsibility, recurrence, person | journey-coparent, D24 | handoffs open in Co-Parent | handoff events | Money projects it read-only; People reads the co-parent | **PASS** |
| F08 Meals | ✓ | `/life/meals` | ✓ | ✓ | meal (slot, status) | 77-meals | — (touches nothing else) | — | boundary gate attributes every lane | **PASS** |
| F09 Money | ✓ | `/life/money` | ✓ | ✓ | task + value + paymentMechanism | tasks RLS; `household` V1 scope | manual due, past-due autopay confirm | its Task, once | F07 reimbursements read-only | **PASS** |
| F10 Work | ✓ | `/life/work`, `/opportunity-editor` | ✓ | ✓ (D08) | opportunity, dependency endpoint | 57/58, 81 | next action as a Task; recorded dates as fact | interview Event only | typed `part_of`; no auto-advance | **PASS** |
| F11 Rebuild | ✓ | `/life/rebuild` | ✓ | ✓ | rebuildFocus, rebuildFocusLink | 78-f11, 81 | only via its step Task | — | never mutates Goal, System or Event | **PASS** |
| F12 Life Admin | ✓ | `/life/admin` | ✓ | ✓ | lifeRecord, lifeRecordLink | 79-f12, 81 | only via its Task | — | child by id; reference masked | **PASS** (D21 P5) |
| F13 People | ✓ | `/life/people` | ✓ | ✓ | person, personContext, personTaskLink | 79-f13, 81 | only via its follow-up Task | — | reuses `household_people`; child and co-parent read-only | **PASS** |

## 17. Cross-system matrix — canonical owner and allowed consumers

| System | Canonical owner (where its truth lives) | Allowed consumers | Allowed writers |
|---|---|---|---|
| **Task** | foundation `src/domain/tasks.ts` → `tasks` | Today (attention, What Matters, One Move), Calendar (due, planned, timed), Kids, Home, Money, Work, Co-Parent, the Life hub lists, links from F10–F13 | any feature, through `addTask`, `updateTask`, `completeTask` and `archiveTask` only; a Money item's completion says "paid" or "received" (D19) |
| **Event** | foundation `src/domain/events.ts` → `events` | Calendar, Today, Kids, Co-Parent, Work (interviews) | the Calendar and Kids editors (not for a handoff, D35), Home visits, Co-Parent handoffs, `scheduleOpportunityInterview` |
| **Goal** | Build 4 structure → `goals` | Rebuild links (read-only) | its own commands; a Focus link never mutates a Goal |
| **System** | F04 → `household_systems`, `system_steps`, `recurrence_rules` | Today and Calendar through its tasks; Rebuild links (read-only) | F04's editor only; People and Life Admin create none |
| **Child** | F05 → `household_members` (`member_type = child`) | Kids, Calendar, Co-Parent (`childId`), Life Admin (`subjectMemberId`, by id), People (a context about a child, by id) | F05's add child (owner only on the server); cloud rename keeps identity |
| **Co-Parent** | F07 → the co-parenting category's events, responsibilities and recurrences, and the co-parent person | Money (reimbursement states, read-only), People (the co-parent, read-only), Calendar, Kids and Today (which open handoffs in Co-Parent) | F07's own editor and commands only |
| **Money** | F09 → the Money category's tasks, `value` facet and `paymentMechanism` | Today and One Move (the doctrine: no pre-due autopay, expected income never the move), Calendar (its Task), the Life hub | F09's commands; the generic editor completes with "Mark paid" or "Mark received" |
| **CareerOpportunity** | F10 → `career_opportunities` (owner-private) | Work; Today (only a date she recorded, as fact); `dependencies` (`part_of` from its Task and Event) | F10's form and commands; the stage moves only by her explicit action |
| **RebuildFocus** | F11 → `rebuild_focuses`, `rebuild_focus_links` (owner-private) | Rebuild; the Life hub (a count); Today only through a linked Task | F11's commands |
| **LifeRecord** | F12 → `life_records`, `life_record_task_links` (owner-private) | Life Admin; the Life hub (a count); Today only through a linked Task | F12's commands; archive, never delete |
| **PersonContext** | F13 → `person_contexts`, `person_task_links` (owner-private) over `household_people` | People; the Life hub (a count tile); Today only through a follow-up Task | F13's commands; never the child's or the co-parent's identity |

## 18. Defect ledger summary (Phase 17)

`HK_F01_F13_DEFECT_LEDGER.md` holds 42 items, HK13-D01 to D42, each with how it was found, expected, actual, root cause, privacy and
data-loss impact, severity reasoning, the repair decision, the commit and the tests.

| Severity | Items | Status |
|---|---|---|
| P0 | D08, D09 | 2 FIXED |
| P1 | D01, D02, D03, D13 | 4 FIXED |
| P2 | D14, D24, D28 | 3 FIXED |
| P3 | D10, D15, D16, D17, D35 | 5 FIXED |
| P4 | D04, D05, D06, D11, D12, D19, D22, D27, D30, D39, D40 | 11 FIXED |
| P5 | D07, D23 fixed; D18, D21, D37 documented | 2 FIXED, 3 DOCUMENTED |
| P6 | D31, D38 fixed; D20, D32, D33 documented | 2 FIXED, 3 DOCUMENTED |
| P7 | D29 | DOCUMENTED |
| P9 | D25, D26, D34, D36, D41, D42 | DOCUMENTED |

**Every P0–P4 item is FIXED and VERIFIED.** Each has a test or harness check that fails without its repair, shown by a mutant or by
running it against the pre-fix code; each ledger entry names which.

## 19. Open owner decisions

- **OD-HK13-01:** a server-side option for an offline One Move's day. The client repair (HK13-D28) is complete; the server option is
  the owner's.
- **OD-HK13-02:** where and when the sign-in entry point ships, as part of auth verification (HK13-D36).
- **Owner copy and design items:** D37 (one voice for recorded responsibilities), D32 (a neutral notice tone), D33 (destination
  structure), D20 (Meals' list and the hub), and D21 (Reveal in the Life Admin edit sheet).
- **Pre-existing feature debt, carried and recorded in each feature's own ledger:**
  - F01 TODAY-FD-001 and F03 F03-FG-02: the capacity profile has no screen, and Daily Load does not read it.
  - F04's missing primitives: System producer, step retire, reorder, and runs.
  - F06's 13 and F08's 16 missing primitives.
  - F09 MP-09-01: recurring money is an explicit copy only.
  - F12 MP-12-03 (search) and MP-12-18 (supersession).
  - F13's missing primitives.
  - F02 OD-1 (raw-text retention) and OD-2 (high-stakes policy).
  - F03 OD-01 (defaulted duration), resolved as provenance by IR01 and D12.
