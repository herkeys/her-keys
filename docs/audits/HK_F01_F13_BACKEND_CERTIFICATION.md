# HK F01–F13 — Backend Certification (LOCAL)

Branch `integration/f01-f13-convergence`, worktree `C:\Users\jsmit\Her-Keys-F01-F13`, cut from WAVE3_BASE `363e473`.

**Scope.** Local certification only. Her Keys Staging and Production: **zero writes, zero reads of data**; no migration or function was
deployed; no live auth was exercised; K Scan was not touched. Every database this audit built is a disposable one in the audit namespace
(`f1313audit_*`); the shared default database (`postgres`) was only ever **read** (the fingerprint) and never migrated.

---

## 1. Migration certification (Phase 7)

### 1.1 The chain

One ordered list (`supabase/tests/migration-chain.mjs`) builds every harness database; `run.mjs` refuses a migrations directory holding
a file the list does not name, and the migration gate pins the SHA-256 of every file that existed at WAVE3_BASE (LF-normalized).

| # | Migration | Owner | At WAVE3_BASE | What it does |
|---|---|---|---|---|
| — | `20260919230054_build4_baseline.sql` | Build 4 | yes (pinned) | reviewed baseline |
| — | `20260919231500_build4_cloud_schema.sql` | Build 4 | yes (pinned) | shipping migration (on Staging) |
| 1 | `20260921120000_ir01_duration_source_and_claim_v3.sql` | IR01 | yes (pinned) | `tasks.duration_source`, claim v3 |
| 2 | `20260921160000_f08_meal_slot_and_status.sql` | F08 | yes (pinned) | `meal_plan_entries.meal_slot`, `status` |
| 3 | `20260921190000_f05_add_child_after_binding.sql` | F05 | yes (pinned) | a child after binding (functions only) |
| 4 | `20260922180000_f09_task_payment_mechanism.sql` | F09 | — | `tasks.payment_mechanism` |
| 5 | `20260922181000_f10_career_opportunities.sql` | F10 | — | `career_opportunities`; dependencies gain opportunity endpoints |
| 6 | `20260922182000_f11_rebuild_focus.sql` | F11 | — | `rebuild_focuses`, `rebuild_focus_links` |
| 7 | `20260922183000_f12_life_records.sql` | F12 | — | `life_records`, `life_record_task_links` |
| 8 | `20260922200000_f13_people_os.sql` | F13 | — | `person_contexts`, `person_task_links` |
| 9 | `20260922210000_int13_per_owner_uniqueness.sql` | INT13 | — | four owner-private uniqueness rules become per owner (HK13-D24) |

### 1.2 The ledger of every schema fact, by migration

`supabase/tools/int13-fingerprint.mjs derive` applies the chain **one migration at a time** to a scratch database and snapshots the full
schema detail after each step, so every changed fact is attributed to exactly one migration. The complete per-migration fact lines are
committed in `supabase/tools/baselines/int13-migration-ledger.json`; each migration's per-dimension counts are **pinned** in the tool, and
any other movement fails it as drift.

| Migration | Tables | Columns | CHECK | FK | UNIQUE/PK | Indexes | Triggers | Functions | Policies | Grant facts | Re-issued (removed then re-added) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F08 | — | 2 | 2 | — | — | — | — | — | — | 4 | — |
| F09 | — | 1 | 1 | — | — | — | — | — | — | 2 | — |
| F10 | `career_opportunities` | 29 | 20 | 5 | 3 | 8 | 3 | `sync_push` | 3 | 65 | change-log CHECK; `dependencies_{from_ref,to_ref,not_self}_check`; `dependencies_live_edge_uq` (widened with the opportunity endpoint) |
| F11 | `rebuild_focuses`, `rebuild_focus_links` | 39 | 20 | 11 | 6 | 16 | 7 | `sync_push`, `private.rebuild_focus_link_target_visible()` | 6 | 90 | change-log CHECK |
| F12 | `life_records`, `life_record_task_links` | 45 | 25 | 9 | 6 | 13 | 7 | `sync_push`, `private.guard_life_record_task_link()` | 5 | 103 | change-log CHECK |
| F13 | `person_contexts`, `person_task_links` | 36 | 23 | 10 | 6 | 17 | 8 | `sync_push`, `public.guard_follow_up_task()` | 5 | 87 | change-log CHECK |
| INT13 | — | — | — | — | 1 | 4 | — | — | — | — | the four rules it re-issues per owner |

The change-log CHECK may only **grow** (the tool fails if a re-declaration drops a table): F10 adds `career_opportunities`, F11
`rebuild_focuses`, `rebuild_focus_links`, F12 `life_records`, `life_record_task_links`, F13 `person_contexts`, `person_task_links`.
`sync_push` is replaced four times; after the whole chain it still names every feature table (run.mjs `chainRegistrations`, ENV A/D/F).

**Explained, not drift.** F13's trigger function sits in `public` with `service_role` EXECUTE (one more effective-privilege fact than F11
and F12, whose trigger functions sit in `private`). It is the shipping migration's own convention for trigger functions
(`guard_withdrawal`, `log_row_change`, `forbid_dependency_cycle`, … all `REVOKE ALL … FROM PUBLIC, anon, authenticated`); no app role
can execute it, and a trigger function cannot be called as an RPC. Two conventions, both closed — recorded, not a defect.

### 1.3 Fingerprints (pre- and post-integration)

| | Facts (gating) | Digest | How |
|---|---|---|---|
| Shared default database (IR01 + F05), read-only | 3621 | `8bf3c7c6…` | measured; **matches** the committed F05 baseline |
| **WAVE3_BASE** (pre-integration, OLD) | **3629** | `96f93f3d46dcf5735e7a0b50996944bf` | shared rows + the F08 delta; equals the WAVE3_BASE fingerprint F08, F11 and F12 each recorded |
| **F01–F13** (post-integration, NEW) | **4371** | `17dccce9aa525b7c8b7b0f41d6f61185` | OLD + each later migration's delta; `baselines/int13-local-fingerprint.json` |
| The step-by-step upgrade vs a fresh install of the whole chain | — | — | **0 differing facts** |

Dimension movement OLD → NEW: relations 35 → 42, columns 716 → 866, constraints 681 → 819, indexes 284 → 337, triggers 104 → 129,
functions 28 → 31, policies 85 → 104, column grants 725 → 892, relation grants 587 → 706, function grants 55 → 59, effective privileges
310 → 367. Cross-check against the features' own records: F11's net delta (+197) is its branch's 3629 → 3826, F12's (+215) its branch's
3629 → 3844 — the integrated chain reproduces each feature's schema exactly.

### 1.4 Populated upgrades

| Env | Starts from | Population | Applies | Proves after EACH migration |
|---|---|---|---|---|
| ENV D | Build 4 (pre-IR01) | one household (claim v2), a child, tasks, a One Move, an edge | IR01, **F08** (HK13-D27), F05, F09, F10, F11, F12, F13, INT13 | row counts and digests of the touched tables; per-step semantics (NULL for unknown, claims replay, new kinds pushable) |
| ENV E | IR01 | one household's meal plans | F08 | nothing lost or rewritten; no guessed slot |
| **ENV F** (new) | **exactly WAVE3_BASE** | what Features 01–08 write (`helpers/20-wave3-population.sql`): 3 adults in 2 households, a child; 15 tasks of every scope, duration provenance, plan kind and status (money in and out); 7 events; 2 Systems with private steps; handoffs (to a person, to the child), a sequence, a goal link, a schedule; meals with slots; Needs Me; One Moves (live and historical); an observation, a pattern and its evidence; capacity; a Talk It Out artifact and interpretation; a daily-load action record; edited rows at revision > 1 — written as their authors, through RLS | F09, F10, F11, F12, F13, INT13, **one at a time** | every pre-existing row byte-identical over the columns it had (so no owner, scope, status, revision or timestamp moved); every added column NULL on every old row; what A, B and C each see unchanged row by row; each one's pull from cursor zero unchanged; the change log untouched; no dangling and no unvalidated foreign key; every new table empty; the fail-closed assertion |

ENV F then proves the later features on the OLD rows (an F09 payment mechanism on an old bill, an F10 opportunity whose next step is an
old professional task, an F11 Focus and an F12 record over an old private task, F13 contexts about an old person and the old child and a
follow-up on an old task), that none of it reaches B or C, and that INT13 turns B's ordinary handoff of a task A privately handed off
**before** the upgrade from refused (`23505`, the HK13-D24 oracle, on real data) to accepted.

ENV F alone: **71/71**. ENV D + E + F: see the final gate (§ final gate).

**Test-the-test (migration mutants, each restored byte-for-byte, never committed):**

| Mutant | What it breaks | Caught by |
|---|---|---|
| ENVF-M1 | F09 reopens every resolved Needs Me item | byte-identical rows, visibility, pull, change log (24 fail) |
| ENVF-M2 | F09 gives `payment_mechanism` a default (a guessed value) | "every added column NULL" (ENV D and ENV F, 7 fail) |
| ENVF-M3 | F11 widens `goals` to household-readable | per-user visibility (4 fail) |
| ENVF-M4 | F13 re-creates a step FK `NOT VALID` | "every foreign key is validated" |
| ENVF-M5 | F13 invents a context for every existing child | ENV D "People tables arrive empty" |
| ENVF-M5b | the same, ENV F alone | ENV F "every table it created starts empty" |
| ENVF-M6 | INT13 re-creates the handoff rule household-wide | ENV F handoff probe, ENV D per-owner check |
| ENVF-M7b | F12 orphans a step (FK re-created `NOT VALID` around a re-point) | "no foreign key dangles" (`system_steps_system_id_fkey=1`) and the rest |

8/8 caught. A first ENVF-M7 (disabling FK triggers) could not be applied at all — the local `postgres` role may not touch system
triggers — so it is recorded and **not** counted. The dangling-key probe also checks itself on every run (a rolled-back orphan must be
seen, and an absent reference ignored).

### 1.5 Phase 7 findings

- **HK13-D27 (P4)** — ENV D's "whole chain" skipped F08. Fixed.
- **HK13-D28 (P2)** — found while seeding ENV F: a One Move decided offline lands in the cloud as the next day's. Fixed on the client,
  inside HR-03 (see the ledger); **OD-HK13-01** records the server-side option for the owner.
