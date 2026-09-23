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

---

## 2. Privacy / RLS attack (Phase 8)

`supabase/tests/81-int13-privacy.sql` (ENV C, **56/56**) attacks the integrated database with synthetic identities: A (owner), B (a second
adult of A's household), C (an unrelated household), anon and service. A holds sixteen private rows across twelve tables of every
feature (opportunity, Focus and link, record and link, person, contexts and follow-up link, handoff, sequence, schedule, step).

- **Catalog:** all seven Wave 3/4 tables have RLS; anon holds nothing on any of them; no client can hard-delete one; every owner-read
  table that feeds the change log logs its owner; every uniqueness rule on an owner-private relationship table is per owner.
- **Reads and writes:** B, C and anon read none of A's rows by table, by id, by `sync_pull` or through the change log (not the table,
  not the id); none can write as A through a table or `sync_push`; service reads everything (the trusted boundary).
- **Non-inference:** B's own rows naming A's private rows are refused exactly as naming a random uuid (masked-uuid equality).
- **Finding:** HK13-D24 (P2) — four household-wide uniqueness rules answered for A's private row about a shared item; fixed by the
  INT13 migration (per owner), proven on real pre-existing data by ENV F.
- **Known shared items, re-audited under the rubric:** redaction, change-log visibility and relationship transport verified; the FK
  existence residual (HK13-D25) and local-id guessability (HK13-D26) documented as P9 — see the ledger's re-audit table.

## 3. Sync / local-first certification (Phase 9)

**Every new F09–F13 canonical type, one lifecycle** (`tests/hk-f01f13/syncLifecycle.test.mjs`, **34/34**) through the real device
composition: the F09 payment mechanism (a Money task), the F10 CareerOpportunity, the F11 RebuildFocus and RebuildFocusLink, the F12
LifeRecord and LifeRecordLink, the F13 PersonContext and PersonTaskLink.

| Proof | How |
|---|---|
| create / edit / archive offline, visible at once | the row is in state immediately; ONE queue item per row, however many offline edits |
| relaunch | a new app over the same storage shows exactly what she left and still owes it to the cloud |
| reconnect → push | exactly one cloud row, holding the latest truth; queue empty; nothing needs attention |
| fresh device → reconstruction | a second install of the account rebuilds the row under the same id; relaunched and pulled again, unchanged (no resurrection) |
| retry | every acknowledgement lost, then retried: still exactly one row |
| stale edit (pull side) | B's newer edit stands; A's different edit is kept as a CAS conflict; A converges |
| stale edit (push race) | another device writes WHILE this one's update is on the wire: the newer row stands, hers is evidence, the device converges |
| refused row | kept on the device and as evidence; tried once, not every cycle; an unrelated row still reaches the cloud |

**Sync registry reconciliation** (`tests/hk-f01f13/syncRegistry.test.mjs`, **8/8**): the integrated kind inventory is exactly Build 4 +
IR01 + F05 + F09–F13; every kind is in every per-kind table; every kind a device creates is on the server's `sync_push` allow-list and
the allow-list names nothing unknown (read from the LAST migration that declares it); every kind's table is in the change-log CHECK
the chain leaves behind; every reference points down the dependency ranks; every pushable kind counts as claim content; only
Discovery is tombstoned; every DOMAIN_INVARIANT is a real unique rule, a competing decision to the transport, and reconciled by the
pull — except the two category rules (HK13-D29, P7, unreachable today, documented).

**Test-the-test:** lifecycle mutants P9-M1..M4 — a stale update treated as sent, no coalescing, a refusal retried forever, an edit never
queued — **4/4 caught**. P9-M1 first **survived**: a cycle pulls before it pushes, so a stale edit was always caught on the pull side and
the push engine's own stale branch was never exercised. The matrix gained the push-race test, and P9-M1 is now caught five times.
Registry mutants REG-M1..M6 — a dropped kind, a dropped `sync_push` table, a dropped invariant, an inverted rank, a dropped claim
collection, a dropped change-log table — **6/6 caught**.

**Phase 9 finding:** HK13-D28 (P2, fixed, see §1.5) is the one-day-late One Move; HK13-D29 (P7) is documented.

## 4. Account / household isolation (Phase 10)

`tests/hk-f01f13/accountSwitch.test.mjs` runs the real device composition: the store, account runtime, sync runtime and binding. Account
A holds private rows of every Wave 3/4 feature at once: a Focus and its next step, a record with a reference number and its renewal
Task, a person context and its follow-up Task, an opportunity, and a bill with a payment mechanism. Some rows are already synced and
some are still pending. A signs out, and B signs in on the SAME device.

| Proven | How |
|---|---|
| A's rows are not visible to B | the binding decision is `quarantine`, so the state is `boundOther`; B can open no app or onboarding screen, only `account-conflict` |
| A's cached projections are not visible | no route renders account data for `boundOther` (`canRenderAccountData` is false), so no cached screen of A's is reachable |
| A's rows are not uploaded as B | not one request is made on B's behalf (the fake cloud's call count is unchanged), and no sync runs for B |
| A's change pointers are not consumed as B | A's queue and cursor are byte-for-byte what they were |
| B's data does not overwrite A | nothing of B's lands on the device; the quarantine keeps every one of A's rows, and nothing was deleted to make room |
| A comes back and truth reconstructs | A is `accountBound` again; every row of every feature, including the pending edit, is there, reaches the cloud once, in A's household, as A's own row |

The real `sync_pull` answers for one household and RLS hides every other household's rows, so the test narrows the in-memory cloud's
pull in the same way. Same-household privacy against real PostgreSQL is suite 81's job (§2). Test-the-test: I9 lets `boundOther` open
every screen, and I9b makes the binding decision resume the other account's household instead of quarantining it. **Both are caught.**
The binding decision also counts every Wave 3/4 collection as content (HK13-D09, `bindingContent.test.mjs`), so a household holding
only Wave 3/4 rows can never be claimed by the next account.

## 5. Multi-device integrated journey (Phase 11)

`tests/hk-f01f13/integratedJourney.test.mjs` runs the brief's 21 steps through the production composition, each through its feature's
own command:
- **Create:** a child and a context about the child, a task, an event, a System, a Home item, a co-parent handoff, a meal, a bill, an
  opportunity and its next action, a Focus, a record, a person context and a follow-up.
- **Offline:** go offline, edit several records, and archive six feature-owned records.
- **Reconnect:** a fresh device of the same account must hold every synced collection row for row. That is 17 collections: children,
  tasks, events, systems, systemSteps, recurrences, responsibilities, people, meals, careerOpportunities, dependencies,
  rebuildFocuses, rebuildFocusLinks, lifeRecords, lifeRecordLinks, personContexts and personTaskLinks.
- **Unrelated account C:** C is quarantined on the device, and sees nothing on its own device.

Every feature's real-database journey runs over real HTTP, PostgREST and RLS on the private stack with the whole chain in the full
harness: composition, sync-integration, kids, home, rebuild, life-admin, people and co-parent. F07's journey joined them in AUD13-12;
before that, it only ever ran against the shared database, which lacks every later migration (HK13-D43).
`integratedDevices.test.mjs` covers the same person opened as a context on two devices of one account while offline (HK13-D13):
one context survives on both devices, the other is kept as evidence, and sync keeps flowing. A child gets the same race.
`syncLifecycle.test.mjs` covers each new type's offline, relaunch, reconnect, fresh-device, retry, stale-edit and refusal paths (§3).

## 6. Inventory after the whole chain

| Object | After WAVE3_BASE | After F01–F13 | Where it comes from |
|---|---|---|---|
| Application tables (`public`) | 34 | **41** | + `career_opportunities` (F10), `rebuild_focuses`, `rebuild_focus_links` (F11), `life_records`, `life_record_task_links` (F12), `person_contexts`, `person_task_links` (F13) |
| Relations (tables and views, `public`+`private`) | 35 | 42 | the seven tables above |
| Columns | 716 | 866 | F09 1, F10 29, F11 39, F12 45, F13 36 (§1.2; F08's 2 are already in WAVE3_BASE) |
| Constraints (CHECK, FK, UNIQUE, PK) | 681 | 819 | per migration in §1.2; INT13 re-issues four uniqueness rules per owner |
| Indexes | 284 | 337 | |
| Triggers | 104 | 129 | the new tables' own: F10 3, F11 7, F12 7, F13 8 |
| Functions | 28 | 31 | `private.rebuild_focus_link_target_visible()` (F11), `private.guard_life_record_task_link()` (F12), `public.guard_follow_up_task()` (F13); `sync_push` is replaced, not added |
| RLS policies | 85 | 104 | F10 3, F11 6, F12 5, F13 5 |
| Column grants | 725 | 892 | |
| Relation grants | 587 | 706 | |
| Function grants | 55 | 59 | |
| Effective privileges | 310 | 367 | |
| **Gating fingerprint** | 3629 / `96f93f3d…` | **4371 / `17dccce9…`** | `supabase/tools/int13-fingerprint.mjs`, re-derived at the final gate (§12) |

Every new table has RLS enabled, is owner-read (`profile_id = auth.uid()` and household membership), and gives anon nothing. No
client can hard-delete from any of them (suite 81's catalog check): archiving is the only retirement. Every one feeds the change log with its owner, and every one is
in the `assert_app_schema_secured` sweep (ENV F runs it after every migration).

## 7. Sync surface

| Surface | After F01–F13 | Proof |
|---|---|---|
| Sync kinds | **36**. Core: member, category, event, task, system, meal, needsMe, oneMove, discovery, onboarding, action, and F12's lifeRecord and lifeRecordLink. Build 4 foundation: sourceArtifact, interpretation, externalReference, observation, authority, intent, decision, execution, outcome, person, responsibility, dependency, recurrence, goal, systemStep, capacity, pattern, evidenceLink. F10: opportunity. F11: rebuildFocus, rebuildFocusLink. F13: personContext, personTaskLink | `syncRegistry.test.mjs` pins the inventory and checks every per-kind table |
| Change-log tables | the Build 4 list plus `career_opportunities`, `rebuild_focuses`, `rebuild_focus_links`, `life_records`, `life_record_task_links`, `person_contexts`, `person_task_links` | the CHECK the chain leaves behind is parsed by `syncRegistry`; `int13-fingerprint` fails if a re-declaration drops a table (the CHECK may only grow); I7 is caught |
| `sync_push` | replaced by F10, F11, F12 and F13, each cumulatively; the last (F13's) names every pushable table | `chainRegistrations` (ENV A, D, F); `syncRegistry` reads the allow-list from the last declaring migration; I8 is caught; F05's child path is guarded on the live declaration (HK13-D39) |
| `sync_pull` | one household per call; the change log carries each private row to its owner only | suite 81: no change-log entry and no `sync_pull` id of A's private rows reaches B; ENV F: each user's pull from cursor zero is unchanged by every migration |
| Server-stamped One Move day (HR-03) | `logical_day` from `now()`; an offline decision from an earlier day stays on the device (HK13-D28) | `oneMoveDay.test.mjs`; OD-HK13-01 records the server-side option for the owner |

## 8. Attack matrix

Actors: A (owner), B (a second adult of A's household), C (an unrelated household), anon, service. Every cell is a check in
`supabase/tests/81-int13-privacy.sql` (56 checks) unless noted.

| Attack | B | C | anon | service |
|---|---|---|---|---|
| Read A's private rows by table (sixteen rows in twelve tables) | DENY (0 rows) | DENY | DENY | sees all (trusted boundary) |
| Read by id / count | DENY (reads none) | DENY | DENY | — |
| Change-log entry of A's private rows | none, not even the table or the id | none at all | — | — |
| `sync_pull` | carries no id of A's | — | — | — |
| UPDATE A's rows | DENY | — | no grant (catalog) | — |
| INSERT a row owned by A (table or `sync_push`) | DENY | DENY (even as herself, into A's household) | DENY | — |
| Hard DELETE | no client grant on any Wave 3/4 table (catalog) | same | same | — |
| Relationship probe: B's own row names A's private Focus, record, person, context or task | refused exactly like a random uuid (F10, F11, F12, F13 ×2 probes) | — | — | — |
| Uniqueness oracle on a shared item | per owner since INT13; four rules probed, and each still holds for one owner | — | — | — |
| Crafted local id equal to A's | makes B's own row, reveals nothing | — | — | — |
| Content leak through a readable row (Task title, pull) | none carries A's secrets | — | — | — |
| Refused-row evidence | client-side redaction of `Failing row contains (…)` (`supabaseSyncTransport.ts`); I17 restores the raw text and is caught | | | |
| Owner-private uniqueness, per-owner migration on real pre-existing data | ENV F handoff probe: 23505 before INT13, accepted after | | | |

The feature suites attack their own tables too: 78-f11 (F11), 79-f12 (F12), 79-f13 (F13), 57/58 (F10's endpoints), 77-f05 (the child
path), 77-meals (F08). Suite 81 is the one that holds every Wave 3/4 table in ONE database at once.

## 9. Backend test-the-test

Every mutant was restored byte-for-byte (sha256) and never committed. The Phase 7 migration mutants (§1.4) and the Phase 9 registry
and lifecycle mutants (§3) are listed above.

| Set | What it breaks | Result |
|---|---|---|
| ENVF-M1..M7b | populated-upgrade guarantees | 8/8 caught |
| D24-M2/M3 | per-owner uniqueness | 2/2 caught |
| REG-M1..M6 | the sync registry and allow-lists | 6/6 caught |
| P9-M1..M4 | the sync lifecycle | 4/4 caught |
| I3, I5 | F11 Focus and F13 context read policies widened to the household | caught by suite 81 ("same-household B: DENY — reads zero of A's private rows in all twelve private tables") |
| I6, I7, I8 | a feature migration dropped from the chain; a change-log table dropped; a `sync_push` case dropped | caught (`migrationChain`, `syncRegistry`) |
| I2b | the generator manifest loses F10's dependency widening | caught (`gen-foundation-sql --check`, `foundationSpecs`) |
| D43-M1, D43-M2 | the full run drops the Co-Parent journey; the journey queries the shared database again | caught (`harnessRegistry`) |
| F05 S-N4b, S-N8 (SQL) | membership check and child collision probe in the LIVE `sync_push` | caught after HK13-D39 |
| F05 S-N9, S-N10; Rebuild R16 and its SQL mutants; Life Admin LA6, LA7, LA7b; People M6, M7, M7b, S1, S2; Meals SQL mutants | each feature's own database guarantees, applied after the whole chain | all caught |

## 10. Test counts

ENTRY, measured at `7c5351a` after integration and before any audit repair: backend harness **1431/1431**. After AUD13-03 (`61e24a6`):
**1559/1559**. EXIT, the final gate's uncontested full harness at `43ab329`, is **1592/1592** (§12). Every check added by this campaign is additive: ENV F
(71), suite 81 (56), the migration gate and chain registrations, and the ENV D steps for F08/F09–F13/INT13. No backend check was
removed or weakened.

## 11. Known P5–P10 backend debt

| ID | Sev | Debt | Why it is not repaired here |
|---|---|---|---|
| HK13-D25 | P9 | A composite `(task, household)` key accepts a real private Task uuid from B's own row | usable only by someone who already holds a server-generated UUIDv4 that no read path gives B |
| HK13-D26 | P9 | A guessed local id of a private Task collides | production ids are not practically guessable |
| HK13-D29 | P7 | Two category uniqueness rules have no pull-side reconciliation | unreachable today: no surface creates or reorders a category |
| HK13-D34 | P9 | A second device cannot adopt an existing cloud household (`superseded_by_cloud`) | a recorded Build 4 contract, not built; every multi-device proof binds device B with a test stand-in |
| HK13-D36 | P9 | The sign-in screen has no entry point | live auth is sequenced after this certification (OD-HK13-02) |
| OD-HK13-01 | — | A server-side option for an offline One Move's day | the client repair (HK13-D28) is complete; the server option is the owner's decision |

## Full backend harness (uncontested, audit namespace)

After AUD13-03 (`61e24a6`): **1559/1559** checks — ENV A 36, ENV B 11 (+B3), ENV C (every suite incl. 81), ENV D 66, ENV E 11, ENV F 71,
authorization parity, client-payload integration and every journey over real HTTP on the private stack. No sibling harness ran
during it (the gate logged zero contention events). The final gate's run is §12.

## 12. Final gate: the backend items

Run uncontested at **`43ab329`** on 2026-09-23 (the full gate is `HK_F01_F13_HOSTILE_AUDIT.md` §20).

| Item | Result |
|---|---|
| Complete backend harness (`run.mjs`, audit namespace, gate wrapper) | **1592 / 1592** checks (17:22:20 → 17:28:14), 0 FAIL lines, **0 contention events**. Sections: ENV A, B, B3, D, E, F, C (every numbered suite, including 81), authorization parity, client payload → RPC, and every journey on the private stack, including Co-Parent (HK13-D43). |
| EXIT vs ENTRY | 1431 / 1431 → **1592 / 1592** (net **+161**). Compared by check name against ENTRY's log (`scratchpad/harness-delta.cjs`), 163 checks are new: ENV F 71, ENV C 50 (suite 81 and the per-feature additions), the Co-Parent journey 33, ENV D 5, ENV A 1 and the harness preamble 3. Two ENTRY names changed without the check changing: ENV A's chain list gained "→ INT13", and the One Move check's label carries the run date. **No check was removed or weakened.** |
| Fresh install | ENV A, B and B3; the migration gate; the upgrade path vs a fresh install: **0 differing facts** |
| Populated upgrade | ENV D, E and F: pass |
| RLS / privacy | suite 81 and every feature suite: pass |
| Schema fingerprint | `int13-fingerprint derive`: shared default DB MATCH (3621 / `8bf3c7c6…`, read-only); no drift; **NEW 4371 / `17dccce9…`** = the committed baseline |
| Backend mutants | F05's and every other suite's SQL mutants, I3, I5, I6, I7, I8, I2b, D43-M1..M2: all caught (311 / 311 mutants in total at the gate) |
| Staging / Production | **zero writes, zero reads**; nothing deployed; no live auth |
