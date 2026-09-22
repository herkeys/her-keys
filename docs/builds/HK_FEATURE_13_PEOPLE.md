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

Git at M0 close: see the M0 commit below.
