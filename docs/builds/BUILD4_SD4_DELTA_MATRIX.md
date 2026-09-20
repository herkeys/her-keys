# Build 4 — SD4 baseline delta matrix

Object-by-object difference between the **repo-owned Phase 1 baseline** and the **SD4 proposed cloud model**.

| | |
|---|---|
| Baseline | `supabase/migrations/20260919230054_build4_baseline.sql`, gating digest `c55d9b80d604211a5841260709b27f47` over 961 catalog facts |
| Proposal | `docs/builds/drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql` — **DESIGN ONLY, NOT AUTHORIZED FOR EXECUTION** |
| Rationale | [BUILD4_SD4_CLOUD_SCHEMA.md](BUILD4_SD4_CLOUD_SCHEMA.md) |
| Status | **PENDING-OWNER.** HR-01..HR-04 are owner-resolved (2026-09-19); the remaining 30 PROPOSED and 2 DEFERRED decisions are **not approved**. Nothing here is applied |

**The baseline is not altered.** This matrix describes a *future* migration that would sit on top of it. `supabase/migrations/` still contains exactly one `.sql` file.

Change classes: **TYPE** (physical type change) · **ADD** · **DROP** · **NARROW** (constraint tightened) · **WIDEN** · **REPLACE** · **UNCHANGED**.

---

## 1. Relations

| Object | Baseline | Proposed | Class | Decision |
|---|---|---|---|---|
| `public.profiles` | present, `id uuid` | present, unchanged shape | UNCHANGED | SD4-002 |
| `public.households` | present, `id text` | `id uuid`, `+local_id`, `+origin_device_id` | TYPE + ADD | SD4-001, SD4-004 |
| `public.household_members` | present, `id text` | `id uuid`, `+local_id`, `+origin_device_id`, FK behavior changed | TYPE + ADD | SD4-001, SD4-029 |
| `public.household_categories` | present, `id text` | `id uuid`, `+local_id`, `+origin_device_id`, `+owner_profile_id`, `+origin_created_at`, `+origin_updated_at` | TYPE + ADD | SD4-001, 004, 009, 011 |
| `public.events` | present, `id text` | as above, plus `source` narrowed | TYPE + ADD + NARROW | SD4-001, 009, 011, 019 |
| `public.tasks` | present, `id text` | as `household_categories` | TYPE + ADD | SD4-001, 009, 011 |
| `public.household_systems` | present, `id text` | as `household_categories` | TYPE + ADD | SD4-001, 009, 011 |
| `public.meal_plan_entries` | present, `id text` | as `household_categories` | TYPE + ADD | SD4-001, 009, 011 |
| `public.onboarding_state` | present, PK `(household_id, profile_id)` | `household_id uuid`; `+` list-cardinality CHECK | TYPE + ADD | SD4-001 |
| `public.one_move_records` | present, `id text`, `for_date date` | `id uuid`, `+local_id`, `+origin_device_id`, `for_date` → **`logical_day`**, `+timezone_at_decision`, `+cleared_at`, typed targets replace `target_id text` | TYPE + ADD + RENAME + REPLACE | SD4-001, 016, **017 (HR-03)**, 018 |
| `public.needs_me_items` | present, `id text` | `id uuid`, `+local_id`, `+origin_device_id`, `+origin_created_at NOT NULL` | TYPE + ADD | SD4-001, 004, 011 |
| `public.discovery_records` | present, `id text` | `id uuid`, `+local_id`, `+origin_device_id`, `+deleted_at` | TYPE + ADD | SD4-001, 004, 014 |
| `public.discovery_answers` | present | `discovery_id uuid` | TYPE | SD4-001 |
| `public.action_records` | present, `id text` | `id uuid`, `+local_id`, `+origin_device_id`, `+payload_version`, `+origin_created_at NOT NULL`, `target_id` becomes `uuid` | TYPE + ADD | SD4-001, 007, 011, 025 |
| **`public.change_log`** | — | **NEW** | ADD | SD4-012 |
| **`public.account_claims`** | — | **NEW** | ADD | SD4-022 |

**14 → 16 tables.**

## 2. Columns added to existing tables

| Column | Tables | Type / nullability | Purpose |
|---|---|---|---|
| `local_id` | `households`, `household_members`, `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries`, `one_move_records`, `needs_me_items`, `discovery_records`, `action_records` (11) | `text NOT NULL`, baseline id pattern | Origin evidence and idempotency key (SD4-004) |
| `origin_device_id` | the same 11 | `uuid NULL` | Collision diagnosis; no device registry (SD4-037) |
| `owner_profile_id` | `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries` (5) | `uuid NULL`, CHECK-bound to `scope` | Scope-aware ownership (SD4-009, B4-P0-038) |
| `origin_created_at` | `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries` (nullable); `needs_me_items`, `action_records` (**NOT NULL**) | `timestamptz` | Local domain time, kept distinct from server row time (SD4-011) |
| `origin_updated_at` | `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries` | `timestamptz NULL` | as above |
| `deleted_at` | `discovery_records` | `timestamptz NULL` | Tombstone (SD4-014) |
| `cleared_at` | `one_move_records` | `timestamptz NULL` | Paired with the new `cleared` status (SD4-014, SD4-016) |
| `timezone_at_decision` | `one_move_records` | `text NOT NULL` | Frozen historical evidence of which timezone produced `logical_day`. **Deliberately outside every unique key** (SD4-017, HR-03) |
| `payload_version` | `action_records` | `smallint NOT NULL DEFAULT 1` | JSONB versioning (SD4-025) |

## 3. Columns replaced or removed

| Column | Baseline | Proposed | Decision |
|---|---|---|---|
| `one_move_records.target_id` | `text NULL`, polymorphic, no FK | **DROPPED**, replaced by `target_task_id uuid` and `target_needs_me_id uuid`, both real FKs, exactly one set | SD4-018 |
| `one_move_records.for_date` | `date NOT NULL`, client-supplied | **RENAMED to `logical_day`**, and its authority changes: server-derived from `profiles.timezone`, frozen at write, pinned on UPDATE | SD4-017 (HR-03) |
| `action_records.target_id` | `text NULL` (local id namespace) | `uuid NULL` — a cloud reference, still a soft reference with no FK | SD4-007 |
| every `id` / `household_id` / `category_id` / `subject_member_id` / `discovery_id` | `text` | `uuid` | SD4-001 |

## 4. Constraint delta

### Narrowed (tightened)

| Constraint | Baseline | Proposed | Decision |
|---|---|---|---|
| `events_source_check` | `source IN ('user','demo')` | `source = 'user'` | SD4-019 — demo can no longer be represented |
| `one_move_records_target_type_check` | `IN ('catalog','task','needsMe')` | `IN ('task','needsMe')` | SD4-018 — the catalog is demo-only |
| `household_members_check` | constrained the child case only | constrains both: adult ⇒ `profile_id NOT NULL`, `birth_date NULL`, `scope='personal'` | SD4-029 |
| `action_records_reason_check` | `jsonb_typeof(reason)='object'` | plus required string `reason.code` and a 4 KiB size bound | SD4-025 |
| `action_records_before_state_check`, `..._after_state_check` | type check only | plus 4 KiB size bound | SD4-025 |
| `one_move_records_check` | `(status='withheld') = (target_id IS NULL)` | a CASE covering all four statuses and both typed target columns | SD4-016 |

### Added

| Constraint | Table(s) | Purpose |
|---|---|---|
| `*_local_id_check` | 11 tables | id pattern on `local_id` |
| `*_household_id_local_id_key` | `household_members`, `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries` | Idempotency boundary (household-scoped) |
| `one_move_records_household_id_profile_id_local_id_key`, `needs_me_items_household_id_profile_id_local_id_key`, `action_records_household_id_actor_local_id_key` | 3 tables | Idempotency boundary (owner-private) |
| `*_owner_scope_check` | the 5 content tables | `(scope IN personal/professional/coparent-shared) = (owner_profile_id IS NOT NULL)` |
| `*_owner_profile_id_fkey` | the 5 content tables | `REFERENCES profiles(id) ON DELETE CASCADE` |
| `one_move_records_target_task_id_fkey`, `..._target_needs_me_id_fkey` | `one_move_records` | Real referential integrity for One Move targets, `ON DELETE CASCADE` |
| `one_move_records_cleared_at_check` | `one_move_records` | `(status='cleared') = (cleared_at IS NOT NULL)` |
| `one_move_records_household_profile_logical_day_key` | `one_move_records` | **REPLACES** `one_move_records_household_id_profile_id_for_date_key`. `UNIQUE (household_id, profile_id, logical_day)` — `timezone_at_decision` deliberately excluded (HR-03) |
| `one_move_records_timezone_at_decision_check` | `one_move_records` | length 1..64, matching `profiles.timezone` |
| `onboarding_state_list_bounds_check` | `onboarding_state` | Mirrors the local 50-entry cap per list |
| `action_records_type_agreement_check` | `action_records` | `action_type` ↔ `approval` ↔ `reason.code`, the 7 legal combinations |
| `action_records_target_presence_check` | `action_records` | Only `keep_capacity_plan` has a null target |
| `action_records_reason_refs_check` | `action_records` | The 4 reference paths must be uuid-shaped |
| `action_records_payload_version_check` | `action_records` | `payload_version = 1` |
| `change_log_*`, `account_claims_*` | new tables | See the SQL draft |

### Changed behavior

| Constraint | Baseline | Proposed | Decision |
|---|---|---|---|
| `household_members_profile_id_fkey` | `ON DELETE SET NULL` | `ON DELETE CASCADE` | SD4-029 — removes the profile-less adult member orphan |

### Deliberately unchanged

| Constraint | Why |
|---|---|
| `household_categories_household_id_sort_order_key` — **stays NON-DEFERRABLE** | B4-P0-057. Category reorder is out of Build 4 scope; the 8 starter categories are inserted in one multi-row statement, which never transiently collides |
| `events_category_id_household_id_fkey`, `tasks_*`, `household_systems_*`, `meal_plan_entries_*`, `needs_me_items_*` — **stay `ON DELETE RESTRICT`** | A genuine guarantee that a category or member cannot vanish from under content. The price is the mandatory purge order (SD4-030) |
| `action_records_actor_profile_id_fkey` — **stays `ON DELETE RESTRICT`** | A profile must not vanish from under the ledger |
| `profiles_id_fkey` — `REFERENCES auth.users(id) ON DELETE CASCADE` | Supabase Auth is the identity authority (SD4-002) |
| All `char_length`, range and format CHECKs on domain columns | They mirror the local Zod limits and are correct |

## 5. Index delta

| Index | Class | Note |
|---|---|---|
| All 51 baseline indexes | UNCHANGED in intent | Re-created over `uuid` columns |
| `household_members_one_household_per_owner_uq` | ADD | Partial, `WHERE role='owner' AND profile_id IS NOT NULL` — one household per account (SD4-023) |
| `household_members_one_owner_per_household_uq` | ADD | Partial, `WHERE role='owner'` — one owner per household |
| `*_owner_idx` on the 5 content tables | ADD | `(household_id, owner_profile_id) WHERE owner_profile_id IS NOT NULL` — serves the scope-aware policies |
| `one_move_records_target_task_idx`, `..._target_needs_me_idx` | ADD | FK maintenance for the new typed targets |
| `one_move_records_profile_day_idx` | REPLACE | Widened from `(profile_id, for_date DESC)` to `(household_id, profile_id, **logical_day** DESC)` |
| `needs_me_items_household_status_idx` | REPLACE | Widened to `(household_id, profile_id, status, origin_created_at DESC)` — sorts on the domain timestamp the list actually orders by |
| `action_records_household_date_idx` | REPLACE | Widened with `actor_profile_id`; supports the recency-bounded pull (SD4-021) |
| `action_records_target_idx` | ADD | Partial, `WHERE target_id IS NOT NULL` |
| `change_log_household_cursor_idx` | ADD | `(household_id, committed_xid, seq)` — the household pull |
| `change_log_owner_cursor_idx` | ADD | Partial — the owner pull |
| `change_log_logged_at_idx` | ADD | Retention pruning |
| `account_claims_one_complete_per_profile_uq` | ADD | Partial, `WHERE status='complete'` — exactly-once |
| `account_claims_profile_idx` | ADD | |

**Expected advisor consequence:** the Phase 1 `unused_index` INFO count of 29 will rise. On an empty database every index is unused. This is expected, not drift (HR-10).

## 6. Policy delta

| Policy | Class | Note |
|---|---|---|
| `profiles_insert_own` | **DROP** | A client can no longer create its own profile (SD4-003) |
| `profiles_select_own`, `profiles_update_own` | UNCHANGED | `UPDATE` additionally narrowed by column privilege |
| `households_select_member`, `household_members_select_member` | UNCHANGED | SELECT-only remains the membership guarantee (B4-P0-019) |
| `categories_*`, `events_*`, `tasks_*`, `systems_*`, `meals_*` (15 policies) | **REPLACE** | Membership-only → scope-aware via `private.can_access_scoped_row` (B4-P0-038) |
| `onboarding_*`, `one_move_*`, `needs_me_*`, `discovery_*` (12) | UNCHANGED in intent | Re-expressed over `uuid` |
| `discovery_answers_select/insert/update_own` | UNCHANGED in intent | Re-expressed over `uuid` |
| `discovery_answers_delete_own` | **ADD** | The one legitimate client delete path — answers replaced wholesale on topic change or clear |
| `actions_select_own`, `actions_insert_own` | UNCHANGED | No UPDATE or DELETE policy: the absence is the append-only guarantee |
| `change_log_select_scoped` | **ADD** | Household member, and owner-scoped rows only for that owner |
| `account_claims_select_own` | **ADD** | Read-only; writes are RPC-only |

**37 → 39 policies.**

## 7. Trigger delta

| Trigger | Class | Note |
|---|---|---|
| 12 × `*_set_updated_at` | UNCHANGED | Same function, same behavior |
| `account_claims_set_updated_at` | ADD | Brings revision/updated_at triggers to 13; `change_log` needs none (immutable) |
| 12 × `*_log_change` | ADD | AFTER INSERT/UPDATE/DELETE → `log_row_change` on every syncable table |
| 9 × `*_force_id` | ADD | BEFORE INSERT/UPDATE → `force_server_owned_id` on client-writable tables |
| `action_records_immutable` | ADD | BEFORE UPDATE OR DELETE → raises (SD4-020) |
| `one_move_records_set_logical_day` | **ADD (HR-03)** | BEFORE INSERT OR UPDATE → `set_one_move_logical_day`. Derives `logical_day` from `profiles.timezone` on the live path, keeps a claim-supplied historical day, pins both fields on UPDATE |
| `ensure_rls` event trigger | UNCHANGED | Platform machinery, scored in the non-gating `info.event_triggers` dimension |

`discovery_answers` and `action_records` still correctly have **no** `set_row_updated_at` trigger — matching the Phase 1 finding that revision triggers exist on 12 of 14 tables and were not "corrected" to 14.

## 8. Function delta

| Function | Class | Note |
|---|---|---|
| `private.is_household_member(text)` | **DROP** | Superseded by the `uuid` signature |
| `private.is_household_member(uuid)` | ADD | STABLE, SECURITY DEFINER, `search_path=''` |
| `private.is_household_owner(uuid)` | ADD | For owner-only future policies |
| `private.can_access_scoped_row(uuid, text, uuid)` | ADD | The scope-aware predicate (B4-P0-038) |
| `private.current_household_id()` | ADD | Used by the pull path |
| `public.set_row_updated_at()` | UNCHANGED | Body, security mode and `search_path` identical to the baseline |
| `public.rls_auto_enable()` | UNCHANGED | Platform machinery; not touched |
| `public.force_server_owned_id()` | ADD | Makes server-generated identity structural (SD4-001) |
| `public.forbid_ledger_mutation()` | ADD | Ledger immutability, binding `service_role` too (SD4-020) |
| `public.log_row_change()` | ADD | SECURITY DEFINER, so the client can neither forge nor suppress a change entry |
| `public.set_one_move_logical_day()` | **ADD (HR-03)** | SECURITY DEFINER, `search_path=''`. The server, not the device, decides what "today" is |
| `public.bootstrap_account`, `claim_local_household`, `sync_push`, `sync_pull`; `private.purge_account`, `prune_change_log` | **SIGNATURES ONLY** | Bodies are **not** designed and **not** authorized by SD4 |

**3 → 10 functions** (9 created or recreated, plus the retained `rls_auto_enable`), plus 6 recorded signatures.

## 9. Privilege delta

| Change | Baseline | Proposed | Decision |
|---|---|---|---|
| `anon` on application tables | no ACL entry (after the Phase 1 ACL normalization) | **explicitly revoked** for every new object rather than inherited-then-corrected | SD4-026 |
| `authenticated` table verbs | `GRANT ALL` (includes `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) | `SELECT` + column-level `INSERT`/`UPDATE`; no `DELETE` except `discovery_answers`; **no `TRUNCATE`, `REFERENCES` or `TRIGGER` anywhere** | SD4-039 |
| Column-level grants | **none** (`privileges.columns` dimension is empty on both sides) | **~26 grants**, so `id`, `household_id`, `local_id`, `revision`, `created_at`, `updated_at` are client-unwritable | SD4-040 |
| Sequences in `public` | inherited defaults | revoked from `authenticated`, `anon`, `PUBLIC`; `service_role` only | SD4-026 |
| Trigger functions | `set_row_updated_at` granted to `anon`, `authenticated`, `service_role` | new trigger functions granted to **nobody** — a trigger does not need the invoker to hold EXECUTE | SD4-026 |
| `ALTER DEFAULT PRIVILEGES` — Layer 1 | nine platform-stock statements granting `anon`/`authenticated`/`service_role` on new TABLES, SEQUENCES, ROUTINES in `public`; PostgreSQL grants `PUBLIC` EXECUTE on new functions | **OWNER-APPROVED (HR-02).** Nine new statements `FOR ROLE postgres`: `anon` loses TABLES/SEQUENCES/ROUTINES in `public` and `private`; `PUBLIC` loses the built-in ROUTINES EXECUTE in both; `authenticated` loses ROUTINES. `authenticated` **keeps** the TABLES default and `service_role` keeps its defaults, deliberately | SD4-026 |
| Schema `private` | `USAGE` implied | `REVOKE ALL FROM anon, PUBLIC`; `GRANT USAGE TO authenticated` — **load-bearing, re-asserted after every blanket revoke** | SD4-027 |
| Load-bearing helper EXECUTE | `is_household_member(text)` to `authenticated` | Four `private` helpers granted to `authenticated`, re-asserted last so no ordering can strand them. Revoking any one breaks every scoped read (HR-02) | SD4-027 |

## 10. Fingerprint dimension impact

Applying this migration **will** change the gating digest. That is expected and is not drift. Projected direction per dimension:

| Dimension | Baseline items | Direction |
|---|---|---|
| `schemas` | 2 | unchanged |
| `relations` | 14 | **16** (exact) |
| `columns` | 148 | **up**, roughly +60 (estimate) |
| `constraints` | 130 | **up**, roughly +50 (estimate) |
| `indexes` | 51 | **78** (exact: 46 explicit + 16 UNIQUE + 16 PK; the baseline decomposes as 31 + 6 + 14 = 51) |
| `triggers` | 12 | **36** (exact: 13 `set_row_updated_at` + 12 `log_row_change` + 9 `force_server_owned_id` + 1 ledger guard + 1 `set_one_move_logical_day`) |
| `functions` | 3 | **10** (exact — 9 created/recreated plus the retained `rls_auto_enable`) |
| `policies` | 37 | **39** (exact) |
| `privileges.relations` | 336 | **down** — fewer verbs held by `authenticated` |
| `privileges.columns` | **0 (empty, emits no row)** | **becomes populated** (~20 grants) — a new row appears, changing the fingerprint row count from 16 to 17 |
| `privileges.functions` | 8 | up |
| `privileges.effective` | 205 | changes |
| `privileges.default_acl` | 6 | **changes** — the nine Layer 1 statements (HR-02 owner-approved). Previously expected to stay fixed |
| `info.extensions`, `info.event_triggers` | 5 / 7 | unchanged (informational, non-gating) |

**The `privileges.columns` dimension going from empty to populated is worth flagging to whoever runs the next fingerprint**: the tool emits no row for an empty dimension, so the comparison output gains a row it has never had. A reviewer expecting 16 rows will see 17.

Per B4-P0-051, applying this would be: implement locally, apply to Staging, verify, run advisors, produce the exact SQL artifact and a fresh fingerprint, present it, **stop** for explicit owner authorization, and only then consider Production through Checkpoint #2.

---

**Nothing in this matrix has been applied. No database was contacted. The Phase 1 baseline is unmodified.**

---

## 11. Migration shape and interlock (HR-04, owner-approved)

This delta is delivered as **drop-and-recreate of the 14 baseline tables**, not as in-place `ALTER`s. It is therefore **destructive**, and is valid only against a database holding zero application rows and zero auth users — the state Phase 1 section 10 verified.

| Element | Design |
|---|---|
| Guard position | A `DO $interlock$` block is the **first executable database statement** in the file, before any DDL |
| Protected relations | **All 16 application tables plus `auth.users`**, enumerated by schema-qualified name, not computed. `to_regclass` tolerates `change_log` / `account_claims` being absent on a first run without weakening the guard on a re-run |
| Failure behavior | `RAISE EXCEPTION` naming every offending relation and its row count, and instructing the operator not to truncate, delete or export-restore |
| Race closure | A top-level `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` over the 14 baseline tables, followed by a second census under the locks |
| Atomicity | PostgreSQL rejects `LOCK TABLE` outside a transaction block, so a non-transactional run **fails at the lock, before any destructive DDL**. Confirmation is implementation acceptance Test C; it is **not claimed as proven** |
| Prohibited | No `TRUNCATE`, no `DELETE`, no dropping data-bearing objects to satisfy the guard, no automatic export-and-restore |
| Production | Separately owner-gated. Repeat an explicit row and auth census first. If Production is not empty: **STOP** and return to the owner for a non-destructive design |

**If the interlock could ever fire in practice, this entire delta is void** and must be re-expressed as in-place `ALTER` statements with a data migration.

---

## 12. Verification status

**The SQL draft has never been parsed, applied or executed.** SD4 contacted no database. Syntax and runtime correctness are **UNVERIFIED**.

The next implementation phase must begin with **ephemeral local parse/apply validation** before any remote migration is considered. First-apply SQL churn is expected there. Remote-first debugging is not acceptable.

Mandatory acceptance tests, recorded in section 11 of the SQL draft: **Test A** (populated reproduction aborts), **Test B** (empty reproduction completes), **Test C** (transaction boundary), **Test D** (privilege reachability — no stranded `private` USAGE or helper EXECUTE), **Test E** (One Move logical day server-derived and frozen).
