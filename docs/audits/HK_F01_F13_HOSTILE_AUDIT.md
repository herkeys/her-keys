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
