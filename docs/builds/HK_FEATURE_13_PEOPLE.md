# HK-FEATURE-13 — People OS (Wave 4 prebuild) — build ledger

Branch `feature/13-people-os`, worktree `C:\Users\jsmit\Her-Keys-F13`, built from **WAVE3_BASE `363e473fdf053547a21a41a67b7f62bd9aa2bcdf`**
(`integration/wave2-f01-f08`). This is a PREBUILD: it must stay valid against WAVE3_BASE alone. It imports nothing from F09–F12, and it is
not merged. The management addendum controls where it conflicts with the original F13 prompt.

Updated at every milestone, in order. Nothing below is reconstructed at the end.

Scenario status vocabulary: PASS · SAFE-UNAVAILABLE · NOT-APPLICABLE · DEFERRED-IN-RUN · FAIL. Anything not executed is not PASS.

---

## Entry gate (2026-09-22)

| Check | Result |
|---|---|
| `git fetch origin` in `C:\Users\jsmit\Her-Keys-W2I` | done |
| W2I `git status --short` | clean |
| W2I branch | `integration/wave2-f01-f08` |
| W2I `git rev-parse HEAD` | `363e473fdf053547a21a41a67b7f62bd9aa2bcdf` |
| `git ls-remote origin refs/heads/integration/wave2-f01-f08` | `363e473fdf053547a21a41a67b7f62bd9aa2bcdf` |
| Local = remote = WAVE3_BASE | **YES** |
| Remote | `git@github-herkeys:herkeys/her-keys.git` |
| Worktrees at entry | `Her Keys` (F01 branch), F09 (`77e6dd0`, dirty — sibling work in progress), F10/F11/F12 (at `363e473`, F10/F12 dirty), W2I |

Worktree created: `git worktree add -b feature/13-people-os C:\Users\jsmit\Her-Keys-F13 363e473f…` — no other branch touched.

**Dependency diagnosis (STOP-AND-DIAGNOSE rule).** The main checkout's `C:\Users\jsmit\Her Keys\node_modules` is an EMPTY directory (0
entries), and F11's `node_modules` is a junction to it — noted, not touched (sibling worktree). W2I holds a real install (352 entries)
and `package.json`/`package-lock.json` are byte-identical between W2I and WAVE3_BASE, so F13's `node_modules` is a junction to
`C:\Users\jsmit\Her-Keys-W2I\node_modules` (created with PowerShell `New-Item -ItemType Junction`). Nothing was installed, deleted or
re-linked anywhere else.

**Concurrency at entry.** Sibling sessions were running a full app suite (`--test-concurrency=1`), `supabase/tests/run.mjs` and `tsc`
on the same machine; free commit memory ~26 GB, free physical ~0.5 GB. Per addendum AO, full-suite validation is serialized and deferred
until those finish (see Test accounting). F13's backend work uses PRIVATE databases named `f13_*` (runner `supabase/tests/run-f13.mjs`),
never the fixed `b4_env_*` names and never the shared default `postgres` database.

---

## F13-M0 — Phase A: foundation identity + privacy spike

### M0A — canonical person identity audit (evidence, not naming)

| Identity class | Where it lives | Stable id | Visibility | Lifecycle | Evidence |
|---|---|---|---|---|---|
| Account holder (the current user) | `household_members` (member_type `adult`, `profile_id` NOT NULL, scope `personal`); locally `AppState.user` | uuid / local id | household members (SELECT `is_household_member`) | none (no archive) | `20260919231500_build4_cloud_schema.sql` §5, `household_members_check` |
| Other adult of the household | `household_members` adult row | uuid | household members | none | cloud only: **local state has no collection for other adults** (`AppStateSchema` holds `user` + `children`) |
| Child | `household_members` (member_type `child`, no profile, scope `child`); locally `AppState.children` (`ChildSchema {id, displayName, birthDate, scope:'child'}`) | uuid / local id | household members | **none** (no status column, no archive, no rename path) | §5; `ChildSchema` `src/domain/state.ts:103`; F05 `push_household_child` (create only) |
| Non-account person (incl. the F07 co-parent counterparty, grandparent, caregiver, neighbor, contractor, friend, other) | `household_people` (foundation table); locally `AppState.people` (`HouseholdPersonSchema`) | uuid / local id | **OWNER-PRIVATE** (`profile_id` NOT NULL, `scope = 'personal'` CHECK, RLS `auth.uid() = profile_id AND is_household_member`) | `status` active/archived; `addPerson`/`archivePerson` | `src/domain/foundation/responsibility.ts` (header: "A PERSON is somebody in her life who is not an account … deliberately NOT household members"); `foundationSpecs.ts` `person` spec; F07 ledger §7 |

`household_people` columns: `display_name` (1..80), `relationship` (closed enum: co-parent, partner, grandparent, caregiver, neighbor,
contractor, friend, other — REQUIRED), `channel` (unspecified/sms/email/whatsapp/in-app — a preference, "never an address"), `status`,
provenance (`producer`, `source_artifact_id`, `confidence`), revision/CAS, change-log registered, sync kind `person` (pushable, mutable;
`display_name`, `relationship`, `channel`, `status` are client-updatable). **It holds no contact details** (no phone, no email, no
address) by design.

Co-Parent identity (F07): the counterpart of a co-parenting record is "whoever the record's own responsibility names"
(`responsibilities.responsible_person_id` → `household_people`), created only through `addPerson`. The co-parent is a
`household_people` row whose recorded `relationship` is `co-parent` (F07 `relationshipLabelOf`, F07 ledger §7/BN). F07's ledger hands
person management to People OS: *"Archive or edit a person from this feature — Not built — People OS owns management; Feature 07 only
handles an archived counterpart"* and integration row HK-INT-COPARENT-PEOPLE-01.

`subjectMemberId` semantics: every scoped content row (task/event/category) may name a CHILD of the same household through the composite
key `(subject_member_id, household_id, subject_member_type='child')` → `household_members(id, household_id, member_type)` (NHR-01): the
reference is structural, cannot name an adult, cannot cross households, and blocks re-typing/moving the member.

Existing typed relationship primitives: `dependencies` (from/to ∈ task, event, needsMe, system, meal, goal), `evidence_links`
(for ∈ pattern/oneMove/intent; support ∈ content + responsibility + observation), `responsibilities` (about content → holder
self/person/child). **None can express "a person-context is linked to a task"**: no existing relation has a person or a context on
either end except `responsibilities`, whose semantics (who is DOING the thing, with a delegation lifecycle) are not "follow up with".

**Classification (addendum F criteria): MIXED / INSUFFICIENT.**
* Not GENERAL: no single table represents household AND non-household humans (`household_members` cannot hold a non-account adult —
  an adult there IS an account by CHECK; `household_people` cannot hold members).
* Not HOUSEHOLD-SPECIFIC ONLY: `household_people` represents arbitrary external people without household membership (its
  `household_id` is the owner's tenancy, not the person's membership).
* Each class has a stable, display-name-independent uuid and is FK-safe (`household_members(id, household_id[, member_type])`,
  `household_people(id, household_id, profile_id)`).

**Addendum AD test:** every identity kind has stable ids; typed FKs can reference them; owner-private overlay is proven below; F13 needs
to rewrite nobody's identity storage → **proceed, not stop.**

**External-person decision: REUSE `household_people`; NO `LifePerson`.** The original prompt says "If the existing household/person
primitive safely supports non-household people: REUSE IT", and addendum F's GENERAL criteria are met *for the non-household class*:
owner-private scope, stable id, no core schema change, sync/RLS already support it (proven at runtime in M0B). A People-created external
person is a `household_people` row with `relationship = 'other'` (the enum's documented "nothing more recorded" value — F07 renders
`other` as no label) and `channel = 'unspecified'`. F13 never writes `relationship` from free text and never asks the user to pick from
the enum (no mandatory taxonomy). Consequence recorded for integration: `organizationLabel` (which a LifePerson would have carried) lives
in the owner-private PersonContext instead; there is no second copy of any identity field.

**Canonical set for MUTANT 3 (addendum AE):** `household_members` rows of member_type `child` (local `AppState.children`) and
`household_people` rows (local `AppState.people`). Adult household members other than the user: cloud-only, **SAFE-UNAVAILABLE** on the
device (no local collection; recorded as a missing primitive).

### M0B / M0C / M0D — runtime probes (code inspection is not PASS)

Suite `supabase/tests/79-f13-phase-a-probe.sql`, run by `supabase/tests/run-f13.mjs` in the private database `f13_env` built from the
five shipped migrations only (`HERKEYS_F13_NO_MIGRATION=1` — i.e. the unmodified WAVE3_BASE schema), with the harness identity fixtures
(USER A owner of household A; USER B second adult of household A; USER C owner of an unrelated household; CHILD A).

`M0B` uses `household_people` (the table F13 reuses); `M0C` a `tasks` row with scope `personal`; `M0D` the chain
private person → private task → private typed relationship, with `responsibilities` as the stand-in typed relation.

Raw result (run twice, identical): **`F13 backend: 38 passed, 0 failed (38 checks, 3 notes, 1 suite)`**.

| Probe | Owner A | Same household B | Foreign C | anon |
|---|---|---|---|---|
| M0B private person: read / update | ALLOWED | DENIED (0 rows by household and by exact id; UPDATE matches 0; no DELETE privilege; cannot create one owned by A) | DENIED (0 by id; cannot insert into A's household) | DENIED (42501) |
| M0C private task: read / update | ALLOWED | DENIED (0 by id; task count unchanged; UPDATE matches 0; cannot create one owned by A) | DENIED | DENIED |
| M0C re-scope a private task to household | refused even for the owner — `scope`/`owner_profile_id` are not client-updatable columns (42501) | refused (42501) | — | — |
| M0D private relationship: read / count | ALLOWED | DENIED (count 0, exact id 0; UPDATE 0; cannot write one as A; cannot point her own at A's private person: 23503 owner-proving key) | DENIED (cannot name A's task from her household: 23503 household-proving key) | DENIED |
| change log | sees all 3 | sees NO entry for them, not even the table names; household-visible entry COUNT unchanged | sees no entry of household A | DENIED |
| sync_pull | delivers all 3 (or defers behind the cluster-wide snapshot barrier; never lost) | carries no id, table or revision of them | naming household A refused (42501) | DENIED |
| sync_push | — | pushing in A's name refused (42501); reusing A's owner-private local id creates HER OWN row (`created`, no collision oracle) | refused (42501) | — |

**Characterisation (NOTE lines, pre-existing foundation properties — not F13 regressions, not transport leaks):**
1. *Known-uuid FK probe.* Keys are checked without RLS: B, IF she already holds the uuid of A's private task, can reference it from her
   own row and see it accepted (a random uuid gets 23503). Worse on `responsibilities`: its `one_live_owner_uq` is HOUSEHOLD-wide, so the
   reference returns 23505 — revealing that ANOTHER owner holds a live responsibility on that task. No read path gives B the uuid.
   → recorded as **MP-13-05** (shared foundation). F13's design response: every F13 uniqueness boundary is PER OWNER, and F13's link table
   refuses a task the caller does not own BEFORE any key is consulted (proved in M5).
2. *Scoped-table local-id probe.* `tasks` is unique on `(household_id, local_id)` across owners and `sync_push`'s probe runs under RLS, so
   B pushing a task that reuses A's private task LOCAL id gets 23505 (a fresh one is accepted). Local ids are
   `prefix-<epoch-ms base36>-<counter><4 base36>`. → F13 mints every follow-up Task local id with a high-entropy suffix.
3. `change_log.seq` is one global identity and `sync_pull` returns no seq: a gap cannot be attributed to a household, owner or table.

**Sibling evidence (addendum B, read-only).** F12's untracked `supabase/tests/78-f12-m0-privacy-preflight.sql` (same WAVE3_BASE; goals +
personal task + dependencies) independently reports the same two residuals (known-id FK probe, scoped-table local-id probe) and 36/36.
Cross-checked, consistent; nothing copied. F09/F10/F11 have no M0 privacy evidence yet.

### PHASE A VERDICT

**F13 PHASE A: PASS — CONTINUING AUTONOMOUSLY**

* Owner-private rows exist and are enforceable (M0B). Owner-private canonical Tasks exist (`scope 'personal'`) and cannot be re-scoped by
  any client (M0C). Private relationship transport is inference-safe through reads, counts, change log, pull, push, same- and
  foreign-household attacks (M0D).
* No MISSING SHARED PRIMITIVE — OWNER-PRIVATE CANONICAL TASK. No MISSING SHARED PRIMITIVE — OWNER-PRIVATE RELATIONSHIP TRANSPORT.
* Architecture chosen (addendum G, OPTION B — typed identity references): `person_contexts` with exactly one of two real FKs —
  `child_id` → a CHILD `household_members` row (existing child-proving composite key; the current user, an adult, is structurally
  unreachable) and `person_id` → the owner's own `household_people` row (co-parent or external). `person_task_links` (relation
  `follow_up` only) from a PersonContext to an owner-private Task.

Git at M0 close: branch `feature/13-people-os`, HEAD `e4ca784`, working tree clean.

---

## Test accounting — ENTRY (authoritative)

Measured in a CLEAN detached worktree at exactly WAVE3_BASE (`C:\Users\jsmit\Her-Keys-F13-entry`, `git rev-parse HEAD` =
`363e473fdf053547a21a41a67b7f62bd9aa2bcdf`, `node_modules` junction → W2I), serialized (`--test-concurrency=1`), because a first run in
the F13 worktree was TAINTED — an F13 edit to `src/domain/state.ts` landed while it was running — and was stopped and discarded.

| Gate | ENTRY raw result |
|---|---|
| TypeScript (`tsc --noEmit`, `--max-old-space-size=1600`) | exit 0 |
| Application tests | `ℹ tests 2814` · `ℹ suites 614` · `ℹ pass 2811` · `ℹ fail 3` · cancelled 0 · skipped 0 · todo 0 |
| Backend checks | DEFERRED-IN-RUN — RESOURCE CONTENTION (another session's `supabase/tests/run.mjs` was live; its fixed `b4_env_*` databases would collide). Measured before exit. |

The three ENTRY failures are ENVIRONMENTAL at the unmodified base (the W2I record of 2814/2814 predates them):
1. `tests/hk-ir01/syncComposition.test.mjs:842` — a timing budget ("one edit inside a 5,000-row collection cost 16.131 ms") under the
   machine's memory pressure.
2. `tests/meals/boundary.test.mjs:19` (BV1–5) and 3. `tests/meals/boundary.test.mjs:30` (BM1–3) — F08's boundary scan
   (`scripts-dev/meals-boundary-scan.cjs`) reports `feature/09-money-os: shares history with HEAD above the baseline (363e473)`. The
   sibling F09 committed `77e6dd0` on top of WAVE3_BASE after the W2I count was taken, and the scan's ancestry rule (fixed base
   `38ab7f1`, pre-F08) treats any branch descending from the integration line as a sibling reaching HEAD. Not caused by F13.

---

## F13-M1 — identity architecture + PersonContext / follow-up contracts

**Decisions (each within existing semantics; product-why doctrine where a choice was needed):**

| # | Decision | Why |
|---|---|---|
| D1 | No `LifePerson`. External people ARE `household_people` rows (`relationship = 'other'`, `channel = 'unspecified'`). | Addendum B/original "REUSE IT"; M0A proves it is safe. One identity table per class; nothing duplicated. |
| D2 | `person_contexts` (owner-private) with `child_id` XOR `person_id`, both REAL composite FKs generated by the existing manifest link types (`member` = child-proving, `person` = owner-proving). | Addendum G option B with the actual classes found. The current user is unreachable by construction (adult). |
| D3 | One context per owner and person: partial UNIQUE `(household_id, profile_id, child_id)` / `(household_id, profile_id, person_id)`; the command layer opens (or restores) the existing one. | Addendum H. PER-OWNER on purpose (M0 finding 1): another member making her own context on the same child can never collide with — and so learn of — this one. |
| D4 | `person_task_links`: immutable, `relation = 'follow_up'` only (CHECK), typed ref `follow_up` → task (ADR-005, so Event is additive later), `one_link_per_task_uq` per owner, and `guard_follow_up_task` (BEFORE INSERT, SECURITY INVOKER) refusing any Task that is not the caller's own `scope = 'personal'` task with ONE error for "not yours / not private / nonexistent". | Addenda R/S/T/V; M0 finding 1 (no key-based existence probe). |
| D5 | `producer = 'user-action'` CHECK on both tables. | Doctrine "AI inference ≠ relationship fact": no inferred context or link can reach the cloud. Demo rows are `demo-seed` and never sync (B4-P0-010). |
| D6 | `relationshipLabel` ≤ 60, `organizationLabel` ≤ 80, `contextNote` ≤ 500 — trimmed, counted in CODE POINTS (as PostgreSQL `char_length`), control characters refused (C0/C1/DEL/U+2028/U+2029; a note may hold line breaks and tabs); enforced in the zod model, the command layer AND a CHECK. | Addenda P/Q: model/domain validation, not UI-only. The device is at least as strict as the server so an accepted value is never refused on push. |
| D7 | `organizationLabel` lives on the context (not on the identity). | D1 consequence: `household_people` has no organization column and F13 does not modify it. |
| D8 | Follow-up Task: canonical `addTask`, `scope 'personal'`, category = the household's `relationships` category (refused with a named outcome if missing/archived), title = what she typed. Task + link are ONE pure transition (the store commits both or neither). The flow's draft key (minted in memory when it OPENS) derives both local ids, so a retry finds them and creates nothing (`already_saved`); a task-without-link is recovered by adding the link, never reported as done without it. | Addenda U/V; M0 finding 2 (high-entropy local id for a private Task). |
| D9 | Kinds registered in the ONE foundation manifest (`foundationSpecs.ts`) with a new `migration` field: their DDL is generated into the ADDITIVE F13 migration, never spliced into the shipping one; the generator checks both. | Reuses the existing sync architecture end to end (push, pull, CAS, change log, projection, claim seam) — no People-specific sync. |
| D10 | `AppState.personContexts` / `personTaskLinks` with `.default([])`; no local schema version bump. | The F08 precedent (`slot`/`status`): a household saved before F13 reads as having none. |

**Schema (migration `supabase/migrations/20260922200000_f13_people_os.sql`, LF-pinned in `.gitattributes`):** two tables (generated),
`public.guard_follow_up_task()` (hand-written), `change_log_entity_table_check` widened by exactly the two tables, `public.sync_push`
re-issued from the F05 body with exactly two marked differences. Nothing added to any existing table. Fingerprint: measured in M5.
Smoke: the private `f13_env` (5 shipped + this migration, migrated while empty) builds, the fail-closed assertion passes, and the Phase A
suite still passes on top of it (38/38).

**Shared-file edits so far (prebuild conflict ledger, addendum AL):**

| Path | Why F13 changed it | Expected Wave 4 reconciliation | Could it be F13-owned instead? |
|---|---|---|---|
| `src/domain/state.ts` | two `.default([])` collections; one call to `peopleIntegrityProblems` | textual conflict with any sibling adding a collection (F09/F10 edit this file) — trivially mergeable, order-independent | no: `AppStateSchema` is the one state shape |
| `src/domain/sync/foundationSpecs.ts` | two kind names, two specs, `migration` field, `migrationOf`, `LinkTarget` += `personContext` | F10 also edits this file (adds a kind) — adjacent-line conflicts; the `migration` field is the mechanism siblings should use too | no: the manifest is deliberately ONE registry |
| `supabase/tools/gen-foundation-sql.mjs` | shipping block filters to shipping kinds; `generateAdditive`; `--check/--write` cover additive migrations | F10 edits the generator/shipping migration — whichever lands first, the other must adopt the additive path | no |
| `supabase/migrations/…f13_people_os.sql` (new) | re-issues `sync_push` and the change-log CHECK | EVERY later migration that re-issues `sync_push` must include both F13 tables; integration must take the union | inherent: one function |
| `.gitattributes` | LF pin | append-only | — |
| `src/state/initialState.ts`, `src/data/seed/demoHousehold.ts` | two empty collections in typed literals | append-only | no (typed literals) |
| `tests/foundationSpecs.test.mjs` | counts 18→20 (18 shipped + 2), each kind checked in ITS migration, additive regions checked | siblings adding kinds hit the same counts | no |
| `tests/hk-ir01/changeBridge.test.mjs` | kind inventory 29→31, pushed 27→29 | same | no |
| `tests/support/richHousehold.mjs` | one context + one follow-up (after One Move resolution) so the lossless round trip covers both kinds | append-only | no: the round trip requires every kind |

Missing primitives and integration candidates so far: `docs/builds/HK_FEATURE_13_MISSING_PRIMITIVES.md`.

Git at M1 close: `ef303ef`, clean. Tests executed at M1 (targeted): `tests/foundationSpecs`, `foundationRoundtrip`,
`hk-ir01/changeBridge` — `ℹ tests 116 · pass 116 · fail 0`; also `foundationAcceptance2/3`, `tokenBoundary`, `today/attentionUi` in an
earlier targeted run (158: 157 pass + the count test fixed above). `tsc --noEmit` exit 0. Full suites: DEFERRED-IN-RUN to M6.

---

## F13-M2 — local identity / context commands + persistence

Built: `src/domain/people.ts` (commands, named outcomes), `src/features/people/commit.ts` (`commitPeople` → `store.commit`, reports the
command's own outcome; a success the store could not make durable is `not_saved`), and the read side the tests use
(`src/features/people/projection.ts`, `privateNote.ts`, `lifeTile.ts`, `copy.ts`).

Tests (new, F13-owned): `tests/people/domain.test.mjs` — **29/29**; `tests/people/store.test.mjs` — **5/5** (real store, memory storage,
relaunch = a second store on the same storage).

| Scenario | Status | Evidence |
|---|---|---|
| external person create → immediate → relaunch → same id/labels/note | PASS | store › LOCAL-FIRST 1 |
| rename without identity split; links/context/Task untouched | PASS | domain › RENAME; store › LOCAL-FIRST 2 |
| same-name distinct people; same org/label distinct | PASS | domain › SAME NAME … (2 tests) |
| one context per person; archived context restored, never duplicated | PASS | domain › PERSON CONTEXT |
| label/org/note limits in code points, control chars, clearing, schema refusal | PASS | domain › RELATIONSHIP LABEL … (5 tests) |
| co-parent read-only identity (rename/archive refused) | PASS | domain › RENAME 2 |
| child context without duplicating or touching the child | PASS | domain › PERSON CONTEXT 1 |
| Add Follow-up success (1 private Task + 1 link, typed title only, no name/label/note copied) | PASS | domain › ADD FOLLOW-UP 1 |
| cancel → 0 Task / 0 link | PASS | domain › ADD FOLLOW-UP 2 (the command is never called; UI proof in M4) |
| retry → no duplicate (domain AND through the store after a failed write) | PASS | domain › RETRY; store › all-or-nothing 1 |
| partial failure → full rollback (failed write; store-refused invalid state) OR explicit recovery (task without link → link added) | PASS | store › all-or-nothing 1–2; domain › PARTIAL STATE |
| Task complete/archive leaves context + link intact; context archive leaves Task/person/child/co-parent intact | PASS | domain › TASK COMPLETED … (3 tests) |
| integrity: duplicate context, link to household Task, dangling child; messages carry ids only | PASS | domain › integrity |

Shared-file edits at M2: none beyond M1.

Git at M2 close: `7e10bb7`, clean. `tsc --noEmit` exit 0.

---

## F13-M3 — private Add Follow-up Task / link, and its reach into Today / One Move

The flow's domain contract was built in M1/M2 (`addFollowUp`: D8). M3 proves where the follow-up goes and where it does not.

Tests: `tests/people/today.test.mjs` — **4/4** (uses the Today suite's own fixtures and the real `buildTodayView` / One Move selector).

| Scenario / doctrine | Status | Evidence |
|---|---|---|
| PERSON DOES NOT BECOME A TODAY OBJECT — people + context with no follow-up ⇒ Today and One Move deep-equal to the same household without them | PASS | today › 1 |
| NO FOLLOW-UP TASK DOES NOT MEAN RELATIONSHIP NEGLECT (nothing added to Today) | PASS | today › 1, 4 |
| Today sees the follow-up only as its canonical Task (typed title); never the person's name, label or note; no Today element carries a context or person id | PASS | today › 2 |
| PERSON DOES NOT BECOME A ONE MOVE — the concrete follow-up Task IS selected by the normal selector (asserted, non-vacuous: `targetType 'task'`, `targetId task-fu-…`), never the person or context | PASS | today › 3 |
| No child-level People queue in Today | PASS | today › 4 |
| No People-specific Today ranking, queue or duplicate card | PASS (structural) | no Today/One Move file is modified by F13 (`git diff 363e473 -- src/features/today src/domain/oneMove.ts` is empty) |

Calendar boundary: F13 creates no Event and changes no Event code. Person↔Event linkage: PENDING-INTEGRATION (MP-13-06).
