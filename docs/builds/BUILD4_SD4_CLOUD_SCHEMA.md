# Build 4 — SD4 cloud schema design gate

| | |
|---|---|
| Gate | **SD4**, the cloud schema design gate inserted by owner direction (B4-P0-063). Not "Phase 4" |
| Status | **SD4 = CLOSED** (2026-09-19). Design quality **PASS**, owner authorization **PASS**, local implementation authorization **PASS**. Register: 6 INHERITED-APPROVED, 31 OWNER-APPROVED, 5 DEFERRED, 0 PROPOSED |
| Nature | **DESIGN ONLY.** No Supabase connection, no Staging, no Production, no credentials, no CLI remote command, no migration change, no RLS, no Auth, no local v3, no sync, no RPC, no deletion, no push |
| Branch / HEAD | `build/04-cloud-identity-sync` at `d34ca5816b978a2cd2feacf856ae67b57a3ccbce`, working tree clean at entry |
| Database authority | `supabase/migrations/20260919230054_build4_baseline.sql`, gating digest `c55d9b80d604211a5841260709b27f47` over 961 catalog facts |
| Companions | [BUILD4_SD4_DELTA_MATRIX.md](BUILD4_SD4_DELTA_MATRIX.md), [drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql](drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql) |
| Contract | [BUILD4.md](BUILD4.md), [BUILD4_PHASE0_CHECKPOINT.md](BUILD4_PHASE0_CHECKPOINT.md), [BUILD4_PHASE1_COMPLETION.md](BUILD4_PHASE1_COMPLETION.md) |
| Revision | **Owner-resolution pass, 2026-09-19.** HR-01..HR-04 resolved (section 12); register accounting corrected (section 13) |

> **SD4 is CLOSED.** On 2026-09-19 the owner approved 27 decisions (7 T1 + 20 T2) against the content frozen at Commit D `95dff1f4`, deferred 3 (T3), and no decision remains `PROPOSED`. `INHERITED-APPROVED` restates Phase 0 authority; `OWNER-APPROVED` marks decisions settled during SD4. Reopening requires a P0/P1, a concrete implementation contradiction, a new owner product requirement, or explicit owner direction.

> **ATTESTATION UPDATE — B4-FOUNDATION-BUILDOUT-01.** SD4 remains **CLOSED**. The foundation buildout did not reopen it and created no SD4 decision row: what it added is governed by `B4-FE01-xxx` and ADR-001..026 in `BUILD4_FOUNDATION_BUILDOUT.md`. The statements below were true of the SD4 design and the baseline it started from. Where the implementation has since moved, the old text is **kept unchanged** in the body as history and the current value is recorded here.

| Statement in this document | PRE-B4-FOUNDATION-BUILDOUT-01 | CURRENT (as of B4-FOUNDATION-BUILDOUT-01) |
|---|---|---|
| SD4-019: `events.source` is narrowed to `'user'` | the column exists, constrained to `'user'` | the column is **retired**. Every content row states its `producer` (stored, NOT NULL, no default), and the cloud producer vocabulary excludes `demo-seed`. The intent of SD4-019, that the cloud cannot hold a demo row, now holds on every content table rather than on events alone |
| SD4-027: four private helpers, including `current_household_id()` | `LIMIT 1` with no order | **removed.** `private.resolve_household_context(uuid)` replaces it: a named household must be the caller's (else `42501`); an unnamed one resolves only when exactly one membership exists, and several raise `22023`. Three of the four helpers are unchanged |
| Section 6, `sync_pull(xid8)` | one argument | `sync_pull(p_cursor xid8, p_household_id uuid)` |
| Application tables designed and asserted | 16 (14 baseline, `change_log`, `account_claims`) | **34** (18 foundation tables added); RLS enabled on all 34; the zero-data interlock enumerates all 34 |
| Functions (`public` + `private`), the SD4 prediction | 13 | the fingerprint's `functions` dimension read 20 before the buildout and reads **27** now (8 added, `current_household_id` removed) |
| Claim payload | version 1 | version 2 |
| Local schema | v3 was not built when SD4 was written | v4 |
| Shipping migration SHA-256 | `275e9d1cd81a3d4361715a6d91a084ad95de2ccbd83c67f56e6ca0d3143e8436` | `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` |
| Local gating digest | `d2b319d0253613d6a5c1dd36ef906da6` / 1300 | `199ed4d4c1b37cd654b5853e91cbde27` / 3613 |
| Baseline digest `c55d9b80…` / 961 | the hosted and local baseline | unchanged: it is the pre-Build-4 baseline and was never meant to be restored. Staging and Production were not contacted |

`AGENTS.md` requires reading the versioned Expo SDK 57 documentation before writing code. SD4 produces no application code: three documents and one non-executable PostgreSQL draft. No Expo, React Native or TypeScript API is touched, so the directive is not engaged and no runtime code was written.

---

## 1. Entry gate

**PASS.**

| Check | Required | Observed | Result |
|---|---|---|---|
| Branch | `build/04-cloud-identity-sync` | `build/04-cloud-identity-sync` | PASS |
| HEAD | `d34ca5816b978a2cd2feacf856ae67b57a3ccbce` | `d34ca5816b978a2cd2feacf856ae67b57a3ccbce` | PASS |
| Working tree | clean | clean (`git status --porcelain` empty) | PASS |

All ten required artifacts are present and internally consistent:

| Artifact | Lines | Used for |
|---|---|---|
| `docs/builds/BUILD4.md` | 140 | Master contract, constraints, phase map |
| `docs/builds/BUILD4_PHASE0_CHECKPOINT.md` | 517 | Decision register B4-P0-001..070, domain census, hazards |
| `docs/builds/BUILD4_PHASE1_COMPLETION.md` | 267 | Baseline provenance, parity, carry-forward |
| `supabase/migrations/20260919230054_build4_baseline.sql` | 369 | **The database authority.** Read statement by statement |
| `supabase/tools/schema-lines.sql` | 254 | Fingerprint method |
| `supabase/tools/schema-fingerprint.mjs` | 219 | Fingerprint method |
| `supabase/tools/README.md` | 111 | Tool contract |
| `supabase/tools/baselines/phase1-staging-fingerprint.json` | 141 | Dimension parity evidence |
| `supabase/tools/baselines/phase1-baseline-review.md` | 149 | Normalization log, privilege review |
| `HER_KEYS_PRODUCT.md` | 827 | Product scope for the classification axes |

**Build 3 domain and persistence sources** named by the Phase 0 checkpoint (sections 2, 3, 17) and read for this gate: `src/domain/state.ts` (514 lines — the v2 schema, entity shapes and `findIntegrityProblems`), `src/persistence/envelope.ts` (`CURRENT_SCHEMA_VERSION = 2`, `EnvelopeSchema` strict, `migrationPlan`), `src/domain/oneMove.ts`, `src/domain/logicalDay.ts`, `src/domain/categories.ts`, `src/state/initialState.ts`, `src/state/appStore.ts` (`sequentialIds`).

Three checkpoint claims were re-verified directly against code rather than taken from the record, because the whole local reconciliation depends on them:

- `EnvelopeSchema` is a `z.strictObject` — confirmed, `src/persistence/envelope.ts:34`.
- `migrationPlan` transforms `data` only, never the envelope — confirmed, `migrateStoredState` passes `envelope.data.data`.
- `CURRENT_SCHEMA_VERSION = 2` — confirmed.

No inconsistency was found, so the gate did not stop. **No database connection of any kind was opened.**

### Phase 1 facts read from the artifacts, not from memory

Phase 1 COMPLETE; baseline `20260919230054`; gating digest `c55d9b80d604211a5841260709b27f47` over 961 facts; 13 app-owned dimensions at exact hosted/local parity; the only difference `info.extensions` (`pg_net`, informational, non-gating, explained); 14 public tables, 3 functions, 37 policies, 51 indexes, 130 constraints, RLS on all 14, revision triggers on 12 of 14; 0 application rows, 0 auth users; Staging history records `20260919230054` as applied; `db push --dry-run` reports zero pending.

### Carry-forward accepted as authoritative

**The ACL finding is now a design constraint, not an anecdote.** Phase 1 caught a fresh local replay of the baseline granting `anon` all eight privileges on all fourteen tables and `PUBLIC` EXECUTE on all three functions, purely from the stock `ALTER DEFAULT PRIVILEGES` the baseline carries plus PostgreSQL default function grants. The baseline was normalized to match hosted Staging. **The hazard itself was not removed**: any object created after the baseline inherits the same grants again (Phase 1 section 17, B4-P0-040). Section 10 below designs the privilege posture explicitly for every new and materially altered object, and SD4-026 asks the owner to decide whether to remove the `anon` default outright. **The historical baseline is not altered by SD4.**

**Operational note, recorded and classified as NOT a schema decision.** Supabase CLI agent auto-detection suppresses the `Update remote migration history table?` prompt and silently takes its default of *Yes*. `--agent no` restores the prompt so it can be answered `n`, which B4-P0-055 requires. This is load-bearing for any future repetition of baseline capture. It is operational process, not schema design, and it creates no SD4 decision.

---

## 2. Decision register

Status vocabulary: `INHERITED-APPROVED` (existing owner authority, restated), `PROPOSED` (new, awaiting owner review), `PENDING-OWNER` (needs an explicit owner answer before implementation), `DEFERRED`.

Relationship column: how the decision stands against prior Build 4 decisions — `CONSISTENT`, `REFINES` (resolves or narrows a PENDING item, or adds detail within an approved envelope), `CONTRADICTS` (opposes a prior position; any contradiction of an **approved** decision is P1).

| ID | Status | Relationship | Decision |
|---|---|---|---|
| **SD4-001** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-007 (PENDING) | **Cloud primary keys become native PostgreSQL `uuid`**, server-generated by `DEFAULT gen_random_uuid()`. Not server-generated TEXT. Rationale in section 4.1. |
| **SD4-002** | **OWNER-APPROVED** (2026-09-19) | CONSISTENT B4-P0-012 | **`profiles.id` stays the Supabase Auth user id** — a shared primary key with `auth.users(id) ON DELETE CASCADE`. No surrogate account id and no separate account table. |
| **SD4-003** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-029 | **The client cannot INSERT a profile.** `profiles_insert_own` is removed; a profile exists only because the bootstrap transaction created it alongside household, owner membership, starter categories and onboarding state. |
| **SD4-004** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-008 (PENDING) | **`local_id text NOT NULL`**, same id pattern as the baseline. Uniqueness boundary follows the ownership boundary: `(household_id, local_id)` on household-scoped tables, `(household_id, profile_id, local_id)` on owner-private tables. Not applicable to `onboarding_state` and `discovery_answers` (no local identity). `households.local_id` is deliberately not unique. |
| **SD4-005** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-006 | **Row-upload idempotency is the `local_id` unique constraint.** Upload is `INSERT ... ON CONFLICT (<local_id key>) DO UPDATE`, so a retry after a lost response can never create a duplicate. |
| **SD4-006** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-005 | **A local id is device-relative, not a global handle.** On pull, a device adopts the origin local id when it is free and mints a fresh local id when it is not, recording the mapping either way. Existing local ids are never rewritten. |
| **SD4-007** | **OWNER-APPROVED** (2026-09-19) | **CONTRADICTS the B4-P0-009 proposal** (B4-P0-009 is PENDING, not approved — not a P1) | **Soft references are stored in the cloud as cloud uuids, not as local ids.** The Phase 0 sketch proposed keeping `action_records.target_id`, One Move `target_id` and ids inside action payloads in the local namespace. That is unsafe the moment a second device exists (SD4-006) and is rejected by Build 3 local integrity checking. |
| **SD4-008** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-009 | **A closed reference manifest** for JSONB payloads: exactly four paths carry references (`reason.windowBeforeEventId`, `reason.windowAfterEventId`, `reason.recommendedTaskId`, `reason.consideredTaskId`), plus the `target_id` column. `before_state` and `after_state` contain none. The sync engine translates that manifest in both directions; a CHECK enforces uuid shape. |
| **SD4-009** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-038 | **`owner_profile_id` placement rule:** present and NOT NULL exactly when `scope IN ('personal','professional','coparent-shared')`; NULL for `household` and `child`; enforced by CHECK. Placed on the five content tables (`household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries`). |
| **SD4-009a** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-038 | **`owner_profile_id` is NOT placed on `household_members`.** Owner-decided rationale: for profile-backed membership rows `profile_id` already identifies the member; for child/non-profile rows (`member_type='child'`, `profile_id IS NULL`) an `owner_profile_id` would still not denote a meaningful alternate owner *of the membership itself*. There is no Build 4 product case where ownership of a membership row differs from the membership relationship the row represents, so the column would be redundant-or-nullable with no independent semantics and would license future contradictory readings. `owner_profile_id` remains **required on content rows** where row ownership or visibility scope can differ from ordinary household membership. Resolves **HR-01**. |
| **SD4-010** | **OWNER-APPROVED** (2026-09-19) | CONSISTENT B4-P0-020 | **`revision` is server-owned.** The existing `set_row_updated_at()` trigger keeps its behavior unchanged; server ownership is additionally enforced by withholding the column-level INSERT and UPDATE privilege from `authenticated`. |
| **SD4-011** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-020 | **Server row lifecycle and local domain time are separate columns.** `created_at` / `updated_at` stay server-owned. New nullable `origin_created_at` / `origin_updated_at` carry the local domain timestamps verbatim, including their nullness. Nothing defaults them. |
| **SD4-012** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-026 (PENDING) | **The global change cursor is `public.change_log` keyed on `committed_xid xid8`, read behind a `pg_snapshot_xmin` barrier.** It is a pointer log, never content. The per-row `revision` is not and never becomes the cursor. Proof in section 6.3. |
| **SD4-013** | **DEFERRED** (2026-09-19) | REFINES B4-P0-026 | **`change_log` retention is 90 days.** A cursor older than the horizon returns `cursor_expired` and the device performs a full resync rather than silently missing changes. |
| **SD4-014** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-027 (PENDING) | **Tombstone realization per entity.** Existing status values serve events, tasks, needs-me and categories. `discovery_records` gains `deleted_at`. One Move gains the status value `cleared` — not a `deleted_at` column — because its row is uniquely keyed by logical day and is revived in place. |
| **SD4-015** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-028 (PENDING) | **Conflict evidence lives locally only.** No cloud conflict table. `sync_push` returns `{ status: stale, cloud_id, current_revision, current_row }` and the device keeps the losing intent. Rationale: the evidence is unaccepted client intent, and uploading it would create a retention and child-data surface for data the server has explicitly rejected. |
| **SD4-016** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-059 (PENDING) | **One Move state machine** with four states and an explicit legal-transition set (section 8.1). |
| **SD4-017** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-059 | **`profiles.timezone` is the authoritative account timezone for logical-day behavior after bootstrap.** It is `NOT NULL`, initialized from an explicit device/user timezone at bootstrap or claim, validated as a real IANA identifier at write time. A second device adopts it; device-local timezone never independently redefines the logical day; travel never silently overwrites it. Historical logical-day identity is **frozen at write time**: `one_move_records.logical_day date NOT NULL` plus `timezone_at_decision text NOT NULL`, and an old record is never reinterpreted against a later `profiles.timezone`. The day key is **server-derived** on the live path. Resolves **HR-03**. Intentionally refines Build 3 device-local behavior. |
| **SD4-018** | **OWNER-APPROVED** (2026-09-19) | CONSISTENT B4-P0-010 | **One Move cloud targets are typed, not polymorphic**: `target_task_id` and `target_needs_me_id`, real foreign keys, exactly one set. `target_type = 'catalog'` is rejected by CHECK, because the catalog exists only in demo households. |
| **SD4-019** | **OWNER-APPROVED** (2026-09-19) | CONSISTENT B4-P0-010 | **`events.source` is narrowed to `'user'`.** The baseline still permits `'demo'`. Demo never syncs, so the cloud must be unable to hold a demo row at all — fail closed at the database, not by client filtering. |
| **SD4-020** | **OWNER-APPROVED** (2026-09-19) | CONSISTENT B4-P0-039 | **The action ledger is immutable in three layers**: no UPDATE or DELETE policy, `UPDATE`/`DELETE`/`TRUNCATE` revoked from `authenticated`, and a trigger that raises on UPDATE or DELETE — binding `service_role` and the table owner too. The only escape is the account-deletion purge, which must announce itself via a session setting. |
| **SD4-021** | **DEFERRED** (2026-09-19) | REFINES B4-P0-023 | **Cloud action retention is unbounded in Build 4; local retention is a window.** Local trimming at the 10,000 cap is cache eviction and must never emit a cloud delete. Pull for `action_records` is bounded by recency, so a trimmed device does not re-download the whole ledger. |
| **SD4-022** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-034 (PENDING) | **`account_claims` is required.** The deciding argument is crash recovery, not bookkeeping: row-level idempotency survives a retry but cannot rebuild the id map after a crash between server commit and local write. `UNIQUE (profile_id, claim_key)` plus a partial unique index on `status = 'complete'` give exactly-once. |
| **SD4-023** | **OWNER-APPROVED** (2026-09-19) | CONSISTENT B4-P0-031 | **One household per account, one owner per household**, enforced by two partial unique indexes on `household_members`. A duplicate cloud household becomes impossible rather than merely unlikely. |
| **SD4-024** | **OWNER-APPROVED** (2026-09-19) | CONSISTENT with the baseline | **TEXT + CHECK is kept; native enums are rejected.** Rationale in section 4.6. |
| **SD4-025** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-064 | **JSONB payloads are versioned and bounded**: `payload_version`, a required `reason.code`, a 4 KiB size bound per column, an `action_type`/`approval`/`reason.code` agreement CHECK, and a uuid-shape CHECK on the four reference paths. The baseline accepted any JSON object. |
| **SD4-026** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-040 | **Three-layer privilege defense.** Layer 1: secure `ALTER DEFAULT PRIVILEGES` for role `postgres` in `public` and `private`, so a new object cannot inherit `anon` or `PUBLIC` access even if its migration forgets. Layer 2: explicit per-object privileges in the same migration that creates or alters the object. Layer 3: the deterministic fingerprint as a standing drift gate over the privilege dimensions. The design must not rely on developers remembering Layer 2. Resolves **HR-02**. |
| **SD4-027** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-039 | **Four private helper functions** for later RLS: `is_household_member(uuid)`, `is_household_owner(uuid)`, `can_access_scoped_row(uuid, text, uuid)`, `current_household_id()`. All STABLE, SECURITY DEFINER, `search_path` pinned to `''`, EXECUTE revoked from PUBLIC and `anon`, granted only to `authenticated`. |
| **SD4-028** | **DEFERRED** | CONSISTENT B4-P0-069 | **Child-data minimization.** `household_members` stores a child name and exact birth date. No production create path exists, so a real Build 4 household holds zero child rows. Recorded with concrete recommendations (section 7.4) and deferred to a privacy review; a full privacy dashboard remains a non-goal. |
| **SD4-029** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-019 | **`household_members.profile_id` becomes `ON DELETE CASCADE`** and a CHECK requires an adult member to have a profile. The baseline `SET NULL` leaves a profile-less adult member row behind after account deletion, which nothing forbids and no purge step names. |
| **SD4-030** | **DEFERRED** (2026-09-19) | REFINES B4-P0-049 (PENDING) | **Mandatory purge order** for account deletion, driven by the RESTRICT edges (section 8.3). Deleting `auth.users` alone fails while ledger rows exist. |
| **SD4-031** | INHERITED-APPROVED | CONSISTENT B4-P0-057 | **`household_categories (household_id, sort_order)` stays non-deferrable.** Bootstrap and claim insert the eight starter categories in one multi-row INSERT with distinct orders, which never transiently collides. |
| **SD4-032** | INHERITED-APPROVED | CONSISTENT B4-P0-010 | **Demo households never sync**, enforced fail-closed: claim refuses a demo payload outright rather than filtering it, and SD4-018 / SD4-019 remove the schema-level ability to store demo rows. |
| **SD4-033** | INHERITED-APPROVED | CONSISTENT B4-P0-038 | **`coparent-shared` is owner-only for all of Build 4.** It is a private category for co-parenting logistics, never a grant of access to another account. |
| **SD4-034** | DEFERRED | CONSISTENT B4-P0-052 | **Production backup and PITR posture** stays deferred to Checkpoint #2. SD4 proposes no plan change. |
| **SD4-035** | INHERITED-APPROVED | CONSISTENT B4-P0-020, 021 | **No timestamp last-write-wins, no automatic field merge, no general merge engine.** Base-revision optimistic concurrency only. The device clock is never authority. |
| **SD4-036** | INHERITED-APPROVED | CONSISTENT B4-P0-063 | **The Phase 1 baseline is never altered, and SD4 SQL never enters `supabase/migrations/`** without explicit owner approval. |
| **SD4-037** | **OWNER-APPROVED** (2026-09-19) | new | **`origin_device_id uuid` on client-originated rows, with no device registry table.** It is provenance evidence for collision diagnosis, not an access-control input. |
| **SD4-038** | INHERITED-APPROVED | CONSISTENT B4-P0-019 | **Membership stays privileged infrastructure**: `household_members` and `households` are SELECT-only for clients; creation and removal live behind the server boundary. |
| **SD4-039** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-040 | **`TRUNCATE`, `REFERENCES` and `TRIGGER` are revoked from `authenticated` on every table**, and `DELETE` everywhere except `discovery_answers`. RLS does not govern TRUNCATE, so the client role should not hold a verb RLS cannot restrain. |
| **SD4-040** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-040 | **Client write privileges are column-level**, so `id`, `household_id`, `local_id`, `revision`, `created_at` and `updated_at` are unwritable by a client even if a policy were later widened by mistake. |
| **SD4-041** | **OWNER-APPROVED** (2026-09-19) | new | **Drop-and-recreate, guarded by a structural in-migration interlock.** A procedural pre-flight is insufficient: the migration itself enforces the empty-database precondition. A `DO $interlock$` block is the first executable statement, censusing all 16 application tables plus `auth.users` by schema-qualified name, and raising a descriptive exception naming every offending relation. A top-level `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` then closes the check-then-act window and makes the single-transaction requirement self-enforcing. The migration never truncates, deletes, drops data-bearing objects to satisfy the guard, or export-and-restores. If rows exist it ABORTS. Resolves **HR-04**. |

**No decision in this register contradicts an approved Build 4 decision.** The single `CONTRADICTS` entry, SD4-007, opposes a Phase 0 *proposal* recorded as PENDING (B4-P0-009), which SD4 was explicitly chartered to resolve.

---

## 3. Domain classification

Four independent axes plus authority, as required. These are **not** mutually exclusive buckets: an entity gets a value on every axis.

- **SCOPE** — `account`, `household`, `owner`, `child`, `coparent-shared`
- **LIFETIME** — `durable`, `ephemeral`, `local-only`, `demo-only`
- **MUTABILITY** — `immutable`, `mutable-with-revision`, `soft-deletable`
- **SYNC** — `yes`, `no`
- **AUTHORITY** — `server-created`, `client-originated/server-validated`, `derived`

| Entity | Scope | Lifetime | Mutability | Sync | Authority |
|---|---|---|---|---|---|
| `profiles` | account | durable | mutable-with-revision | yes | server-created (bootstrap RPC; `id` comes from Supabase Auth) |
| `households` | household | durable | mutable-with-revision | yes | server-created (bootstrap/claim RPC only) |
| `household_members` — adult | account + household | durable | mutable-with-revision | yes (read-only to the client) | server-created |
| `household_members` — child | child | durable | mutable-with-revision, soft-deletable (semantics deferred, B4-P0-066) | yes (read-only to the client) | server-created |
| `household_categories` — starter, `household` scope | household | durable | mutable-with-revision, soft-deletable (`status='archived'`) | yes | server-created at bootstrap, then client-originated/server-validated |
| `household_categories` — `personal` / `professional` scope | owner | durable | mutable-with-revision, soft-deletable | yes | server-created at bootstrap, then client-originated/server-validated |
| `household_categories` — `cat-coparenting` | coparent-shared | durable | mutable-with-revision, soft-deletable | yes | server-created at bootstrap |
| `events` | household, owner, child or coparent-shared per row `scope` | durable | mutable-with-revision, soft-deletable (`status='removed'`) | yes | client-originated/server-validated |
| `tasks` | as `events` | durable | mutable-with-revision, soft-deletable (`status='archived'`) | yes | client-originated/server-validated |
| `household_systems` | as `events` | durable | mutable-with-revision | yes | client-originated/server-validated (no production create path today) |
| `meal_plan_entries` | as `events` | durable | mutable-with-revision | yes | client-originated/server-validated (no production create path today) |
| `onboarding_state` | owner | durable | mutable-with-revision | yes | client-originated/server-validated (row created by bootstrap) |
| `one_move_records` | owner | durable | mutable-with-revision, soft-deletable (`status='cleared'`) | yes | client-originated/server-validated |
| `needs_me_items` | owner | durable | mutable-with-revision, soft-deletable (`status='resolved'`) | yes | client-originated/server-validated |
| `discovery_records` | owner | durable | mutable-with-revision, soft-deletable (`deleted_at`) | yes | client-originated/server-validated |
| `discovery_answers` | owner | durable | mutable-with-revision **via its parent** (no own revision) | yes, as part of the parent | client-originated/server-validated |
| `action_records` | owner | durable | **immutable** | yes, insert-only | client-originated/server-validated |
| `change_log` (new) | household + owner | ephemeral (90-day retention) | immutable | no — it is the sync mechanism, not synced content | server-created |
| `account_claims` (new) | account | durable | mutable-with-revision (status only, server-side) | no — read-only to the client | server-created |
| Demo household and every `origin: 'demo'` row | household | **demo-only** | mutable-with-revision locally | **no** | client-originated, never uploaded (B4-P0-010) |
| Local `local_id ↔ cloud_id` map | account | durable | mutable-with-revision | **no** — local infrastructure | derived from server responses |
| Local pending-operation queue | account | ephemeral | mutable-with-revision | **no** | client-originated |
| Local conflict evidence | owner | ephemeral (bounded) | soft-deletable | **no** (SD4-015) | client-originated, server-rejected |
| Quarantined bound-other cache | account | **local-only** | immutable once quarantined | **no** (B4-P0-035) | client-originated |
| Entitlement (`unknown/free/plus`) | account | ephemeral | mutable-with-revision | **no** | derived — RevenueCat CustomerInfo is the only authority |
| Auth session | account | ephemeral | mutable-with-revision | **no** | server-created (Supabase Auth) |
| Daily Load, load tier, life status, Tomorrow Preview, operating profile, child age, Talk It Out hypothesis | owner | ephemeral | — | **no** | **derived**, never persisted, never cloud authority (B4-P0-003) |
| Talk It Out transcript | — | **does not exist** | — | **no** | No such field exists locally and none is created in the cloud (B4-P0-030) |

Two observations that matter for the design:

**Nothing is `ephemeral` and `sync: yes` at once.** The only ephemeral cloud object is `change_log`, and it is machinery rather than content, which is why losing it to pruning degrades to a full resync instead of to data loss.

**`systems` and `meals` are syncable but have no production producer.** Build 3 has no create path for children, systems or meals, so a real household holds none. They are designed and carried, not exercised. That is stated rather than hidden, because an untested sync path is not the same as a working one.

---

## 4. Proposed cloud model

### 4.1 Decision A — physical cloud primary key type: **native `uuid`**

This is the decision B4-P0-007 left open, and the prompt is right that now is the cheapest moment: both environments hold zero application rows and zero auth users.

**Server-generated TEXT** and **native `uuid`** were both viable. `uuid` wins on four grounds:

1. **It makes B4-P0-004 structural rather than procedural.** `DEFAULT gen_random_uuid()` plus the `force_server_owned_id()` trigger means a client-supplied cloud primary key is impossible, not merely discouraged. With TEXT the column would keep accepting whatever the client sent, and server authority would rest on every write path remembering to strip it.
2. **It ends the global-text-id collision class outright.** Every pristine install starts with `household-1`, `user-1` and `cat-kids`; under global TEXT keys the first account to claim would occupy `cat-kids` for everyone. That is the exact hazard recorded in checkpoint section 8. With `uuid` keys and `local_id` demoted to origin evidence, the collision cannot arise.
3. **It matches the identity column the schema already has.** `profiles.id` is already `uuid` because it mirrors `auth.users(id)`. Keeping every other key as TEXT means the schema carries two identity types forever, and every join between them is a type boundary.
4. **Index and storage cost.** 16 bytes against 36-plus, and the composite foreign keys `(id, household_id)` are used by five tables, so the saving is on the hot paths rather than at the margin.

The cost is honest and stated: **this is a breaking change to every primary and foreign key**, which is why SD4-041 expresses it as drop-and-recreate behind a zero-row interlock. Deferred to any later point it becomes a data migration with 26 foreign keys in flight.

`profiles.id` remains separately governed by SD4-002 below; it is not made `gen_random_uuid()`, because its value must be the Auth user id.

### 4.2 Decision B — `profiles` and Supabase Auth

`profiles.id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` is kept exactly as the baseline has it. Supabase Auth is the identity authority (B4-P0-012); a surrogate account key would create precisely the account/profile identity ambiguity the hostile review asks about, and the shared primary key makes "the account" and "the profile" the same row by construction.

One change: **`profiles_insert_own` is removed** (SD4-003). The baseline lets an authenticated client create its own profile row directly, which permits a profile with no household, no membership and no categories — an orphan the bootstrap contract (B4-P0-029) exists to prevent. `UPDATE` survives but is narrowed to `display_name` and `timezone` by column privilege, which is what Apple first-authorization name capture (B4-P0-016) and SD4-017 need.

### 4.3 Decision C — `local_id` type and uniqueness boundaries

`local_id text NOT NULL` with the baseline id pattern `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. That pattern already covers both id shapes Build 3 produces: the fixed ids (`household-1`, `user-1`, `cat-kids`) and `createId` output (`<prefix>-<base36 time>-<base36 counter><4 random chars>`, `src/state/appStore.ts:356`).

| Table | Uniqueness boundary | Why |
|---|---|---|
| `household_members`, `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries` | `UNIQUE (household_id, local_id)` | Household-scoped content; the household is the namespace |
| `one_move_records`, `needs_me_items` | `UNIQUE (household_id, profile_id, local_id)` | Owner-private; the uniqueness boundary follows the ownership boundary |
| `action_records` | `UNIQUE (household_id, actor_profile_id, local_id)` | Owner-private ledger |
| `discovery_records` | `UNIQUE (household_id, profile_id)` already forces one row per owner | A second local_id constraint would be redundant |
| `households` | **none** | Every install names its household `household-1`. Uniqueness is per account and lives on `household_members` (SD4-023) |
| `onboarding_state` | **not applicable** | Identity is `(household_id, profile_id)`; local state has no onboarding id |
| `discovery_answers` | **not applicable** | Identity is `(discovery_id, answer_order)`; answers have no local id |
| `profiles` | **not applicable** | The local `user-1` id maps to the adult `household_members` row, which carries it |

Nullability: `NOT NULL` wherever the column exists. There is no such thing as a row with no origin — bootstrap-created rows included, because the starter local ids are deterministic (`household-1`, `user-1`, `cat-kids` … `cat-coparenting`), so the server can reproduce exactly what a pristine device already holds. **That is a quietly important result: the starter set needs no id reconciliation at all.**

### 4.4 Decision D — row-upload idempotency

The `local_id` unique constraint *is* the idempotency key. Upload is `INSERT ... ON CONFLICT (<boundary>) DO UPDATE`, guarded by base-revision comparison. A device that crashes after the server commits but before it persists the response replays the same `local_id` and receives the same cloud row.

Three retry classes and their outcomes:

| Situation | Outcome |
|---|---|
| Response lost, row committed | Replay hits the unique constraint, resolves to the same row, returns the same cloud id. No duplicate |
| Response lost, transaction rolled back | Replay inserts cleanly |
| Device crashed mid-claim, whole local map lost | `account_claims.claim_key` replay returns the household and the **complete** id map in one call (SD4-022) |

### 4.5 Decision E — second-device `local_id` collision semantics

This is the sharpest constraint in the design, so the mechanism is stated precisely.

`createId` is `<prefix>-<base36 ms>-<base36 counter><4 random base36 chars>` and **the counter resets every process** (checkpoint hazard 12). Two devices of the same account, both offline, can therefore mint the same local id: same millisecond, same counter value, same four random characters — roughly one in 1.7 million per coinciding (ms, counter) pair, which is small but not zero, and Build 4 explicitly supports a second device.

Naive handling is a data-loss bug. `ON CONFLICT (household_id, local_id) DO UPDATE` would silently merge two genuinely different tasks into one row.

**The resolution: a local id is device-relative evidence, not a cross-device handle (SD4-006).**

- **Push.** The uploading device sends `local_id` and `origin_device_id`. If a row already exists with that `(household_id, local_id)` and a **different** `origin_device_id`, the server treats it as a distinct entity: it inserts a new row with a fresh cloud uuid and returns `local_id_collision` alongside the new cloud id. It never merges.
- **Pull.** A device receiving a row whose `local_id` it already uses for a *different* cloud id **mints a fresh local id for the incoming row** and records `cloud_id → its own local id` in the map. It never rewrites the local id of a row it already holds.

This keeps B4-P0-005 exactly (existing local ids stay stable — a device only ever chooses an id for a row it has never seen) and B4-P0-006 (the durable map carries the translation, so foreign keys resolve).

**The consequence is SD4-007**, and it is the reason the Phase 0 soft-reference proposal had to be reversed: if a local id is device-relative, a local id stored in the cloud is ambiguous. Section 5 works this through against Build 3 integrity checking, where it would otherwise break sync outright.

### 4.6 Decision R — TEXT + CHECK, not native enum

TEXT with a CHECK constraint is kept for every enumerated column.

- The baseline is already built that way: 84 of its 130 constraints are CHECKs, and the local source of truth is a set of Zod enums in `src/domain/state.ts`, not a database type.
- A CHECK is narrowed or widened by dropping and re-adding a constraint inside an ordinary transaction. `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that then uses the value, and a native enum cannot have a value *removed* without a full type rewrite. SD4 narrows two enumerations immediately (`events.source`, One Move `target_type`), which a native enum would make materially harder.
- PostgREST exposes TEXT cleanly; a native enum adds a type-mapping step to the generated client types (B4-P0-062) for no benefit.

The trade is real and accepted: a CHECK does not give the client library a generated union type. Local Zod enums already provide that, and they are the authority.

### 4.7 Decision S — JSONB payload versioning

The baseline accepts any JSON object in `reason`, `before_state` and `after_state`. SD4 adds: `payload_version smallint NOT NULL DEFAULT 1`; a required string `reason.code`; a 4 KiB `pg_column_size` bound per column; an agreement CHECK binding `action_type`, `approval` and `reason.code` to the seven legal combinations; and a uuid-shape CHECK on the four reference paths of SD4-008. Arbitrary JSON stops being storable.

---

## 5. Local and cloud contract reconciliation

Local persistence is **schema version 2**. Local v3 is **not implemented** and is not implemented here. Everything below marked `NOT YET IMPLEMENTED` is a requirement handed to the local-v3 design phase, not work SD4 performs.

Two local hazards govern this whole section:

- **`EnvelopeSchema` is a `z.strictObject`** (`src/persistence/envelope.ts:34`). Any new envelope-level field is rejected outright by the current decoder.
- **`migrationPlan` transforms `data` only, never the envelope** (`migrateStoredState` passes `envelope.data.data`). So an envelope-level addition **cannot ride the existing migration mechanism**. Introducing sibling envelope sections requires a schema-version bump *and* a change to the migration machinery itself, not merely a new migration step.

### 5.1 Concept-by-concept

| Concept | Cloud design | Local state today | Verdict |
|---|---|---|---|
| **Cloud uuid / id** | `uuid` PK, `gen_random_uuid()`, trigger-pinned (SD4-001) | No concept of a cloud id anywhere | **MISSING LOCALLY** — v3 must store it per entity |
| **`local_id`** | `text NOT NULL`, uniqueness per ownership boundary (SD4-004) | Every entity already has a stable local id from `createId` or a fixed constant | **MATCH** — the cloud adopts the local shape unchanged, including the id pattern |
| **id map** | The server returns `local_id → cloud_id` from push, bootstrap and claim | Does not exist | **MISSING LOCALLY** — B4-P0-006 requires it; v3 must own it, durably, in the same atomic write as the domain data |
| **Row revision** | `revision bigint`, server-incremented by trigger, client-unwritable (SD4-010) | Does not exist. State is one blob with no per-entity revision (hazard 2) | **MISSING LOCALLY** |
| **Dirty state** | Not a cloud concept — correctly local-only | Does not exist. The write queue is a whole-state saver, not an operation log | **MISSING LOCALLY**, and **MISSING IN CLOUD DESIGN by design** |
| **Tombstone** | `status` values for events/tasks/needs-me/categories; `deleted_at` on `discovery_records`; `cleared` status on One Move (SD4-014) | Partially present: `removed`, `archived`, `resolved` exist. **Absent for discovery** (cleared to `null`) and **absent for One Move** (record is physically deleted) | **DIFFERENT SEMANTICS** — see 5.2 |
| **Pull cursor** | `change_log` on `committed_xid` behind an xmin barrier (SD4-012) | Does not exist | **MISSING LOCALLY** |
| **Claim idempotency** | `account_claims.claim_key`, `UNIQUE (profile_id, claim_key)` (SD4-022) | Does not exist | **MISSING LOCALLY** — v3 must persist `claimId` as a request identity, never an entity key (B4-P0-061) |
| **Queue operation identity** | Not a cloud concept. Cloud idempotency is the `local_id` constraint plus base revision, so the queue needs no server-side operation id | **MISSING LOCALLY** (no durable queue) | **MISSING IN CLOUD DESIGN by design** — recorded so it is not mistaken for an omission |
| **Conflict evidence** | Deliberately **no cloud table** (SD4-015); `sync_push` returns the authoritative row so the device can record evidence | Does not exist | **MISSING LOCALLY**, and **MISSING IN CLOUD DESIGN by design** |
| **Account namespace** | Cloud has no notion of it; binding is the Supabase user uuid | Does not exist | **MISSING LOCALLY** |
| **Envelope carrier for all of the above** | — | `EnvelopeSchema` is strict and the migration plan cannot extend it | **NOT YET IMPLEMENTED** — and it is the gating local work |

### 5.2 Where local and cloud semantics genuinely differ

These five are the places a naive implementation breaks, so each carries its resolution.

**1. One Move is physically deleted locally, and must not be in the cloud.**
`resolveOneMoveForToday` returns `{ ...state, oneMoves: history }` when an unfinished record loses its target and no replacement candidate exists (`src/domain/oneMove.ts`) — the record is *removed*, not marked. A physical delete is invisible to an offline second device (B4-P0-024). The cloud models it as `status = 'cleared'` with `cleared_at` set, and because the row is uniquely keyed by `(household_id, profile_id, logical_day)`, a later candidate revives the same row rather than inserting a second one. **This is why the Phase 0 "completed-only, so no tombstone needed" premise had to be withdrawn, and it is now resolved.**

**2. Local domain timestamps are nullable; cloud row timestamps are not.**
`event.createdAt` and `event.updatedAt` are `InstantSchema.nullable()`, and `migrateV1ToV2` deliberately backfills them as `null` because the values are genuinely unknown. The baseline cloud columns are `NOT NULL DEFAULT now()`. Mapping one onto the other would **fabricate history** — a hostile-review item in its own right. Resolution SD4-011: `created_at`/`updated_at` stay server row-lifecycle metadata, and new nullable `origin_created_at`/`origin_updated_at` carry the domain facts verbatim, nulls included. Two exceptions where local is non-nullable and the cloud column follows: `needs_me_items.origin_created_at` and `action_records.origin_created_at` are `NOT NULL`.

**3. `household_members.display_name` is NOT NULL; local `user.displayName` is nullable.**
Real users never have a display name — no screen collects one (checkpoint section 3), and only the demo seed sets it. Bootstrap and claim therefore need an explicit placeholder rule for the adult member row, and it must be a documented product decision rather than an invented string. **Recorded as a P2 in section 11** because SD4 will not invent user-visible copy.

**4. Local relational integrity will reject cross-device action records unless references are translated.**
`findIntegrityProblems` requires that `action.reason.windowBeforeEventId`, `windowAfterEventId`, `recommendedTaskId`, `consideredTaskId` and every `targetId` resolve to a real local entity (`src/domain/state.ts`). `encodeStoredState` then refuses to persist a state that fails. So a pulled action record naming another device's local ids does not merely look odd — **it fails the write and stalls sync**. This is the concrete reason for SD4-007 and SD4-008: the cloud stores cloud uuids, and the pull translates the closed four-path manifest plus `target_id` back into this device's local ids before the state is written.

**5. `discovery` changes identity on a topic change.**
`updateDiscovery` mints a new local id when the topic changes (`src/domain/discovery.ts:74`) but the cloud holds at most one row per `(household_id, profile_id)`. The cloud row is updated in place — new `topic_id`, new `local_id`, answers replaced — rather than inserted. `local_id` is therefore one of the few columns a client may UPDATE on that table, which the column grants reflect.

### 5.3 Local invariants the pull must never violate

`findIntegrityProblems` enforces unique category `sortOrder`, unique category `systemRole`, one One Move per date, and referential resolution for every category, subject, One Move target and action reference. A pull that violated any of these would be refused by `encodeStoredState` at the moment of writing. **A pull is therefore applied whole or not at all**, through the validated path (`commit`, never `dispatch` — hazard 3, B3-AUD-026). The cloud constraints mirror each local invariant so that the server refuses the bad state first: `household_categories_household_id_sort_order_key`, `household_categories_system_role_uq`, `one_move_records_household_profile_logical_day_key`.

---

## 6. Sync and concurrency model

### 6.1 Shape

Unchanged from the approved architecture (B4-P0-001, 002, 022): the UI renders from local durable state and never waits on the network; the canonical write is local first; cloud propagation is asynchronous; push on canonical write, foreground, authenticated startup and explicit retry; pull on authenticated startup, foreground, after a successful push and explicit retry; no continuous polling; no realtime subscriptions.

### 6.2 Write concurrency — base revision, and nothing else

Every mutation carries the base revision the device last saw. The server accepts it only when `revision` still matches, and the `set_row_updated_at()` trigger increments `revision` on the accepted write. A mismatch returns `{ status: 'stale', cloud_id, current_revision, current_row }`; the device applies the authoritative row through the validated path and keeps its losing intent as conflict evidence (SD4-015). There is **no timestamp last-write-wins, no automatic field merge and no merge engine** (B4-P0-021), and the device clock is never authority. An edit against a tombstoned row is stale and the tombstone wins.

### 6.3 The global change cursor — and the proof

**The per-row `revision` is not the cursor.** They answer different questions: `revision` answers "is my write stale?", the cursor answers "what changed since I last looked?". Conflating them loses writes, because a device that tracked "highest revision seen" would have no way to notice a *different* row whose revision happens to be lower.

**Why the obvious mechanisms are wrong.** A cursor on `updated_at` (or on a plain `BIGSERIAL`) fails because both values are fixed *before* commit while visibility happens *at* commit:

> T1 starts at t=100 and commits at t=105. T2 starts at t=102 and commits at t=103. A device pulls at t=104: it sees only T2's row, stamped 102, and advances its cursor to 102. T1 then commits, carrying stamp 100. Every future pull asks for `> 102`. **T1's row is never delivered.**

A `BIGSERIAL` sequence has the identical flaw: sequence numbers are allocated at insert time, not commit time, so an earlier number can become visible after a later one has already been consumed.

**The mechanism (SD4-012).** `public.change_log` records one pointer row per entity change, written by a `SECURITY DEFINER` trigger the client cannot forge or suppress, and stamped `committed_xid xid8 DEFAULT pg_current_xact_id()`. The cursor axis is `committed_xid`, never `seq`. A pull runs:

```
barrier := pg_snapshot_xmin(pg_current_snapshot());

SELECT entity_table, entity_id, op
FROM public.change_log
WHERE household_id  = private.current_household_id()
  AND committed_xid >= $cursor
  AND committed_xid <  barrier
ORDER BY committed_xid, seq;

next_cursor := barrier;
```

**Proof that two simultaneous changes to independent rows cannot make a device miss one.**

Let `B` be the barrier this pull read, and let `C` be the cursor it started from.

1. `pg_snapshot_xmin(pg_current_snapshot())` returns the oldest transaction id still in progress. By definition **every transaction with `xid < B` has already settled** — committed or aborted — and every committed one is visible to this snapshot.
2. The pull returns exactly the log rows with `C ≤ committed_xid < B`. Since those transactions are settled and committed, every one of their rows is readable now.
3. The cursor advances only to `B`. It never advances past a transaction that had not settled.
4. Take any change written by a transaction `T` with `xid(T) ≥ B` — the in-flight or future case, which includes a transaction that started *before* this pull and commits *after* it. It is excluded from this pull by the `< B` predicate. Its `committed_xid` is fixed at write time and never changes.
5. A later pull reads a new barrier `B'`. Because `xid8` is monotonic and never wraps, and because the new cursor is `B ≤ xid(T)`, the later pull asks for `committed_xid ≥ B`. Once `T` settles, `xid(T) < B'`, so `T` satisfies `B ≤ xid(T) < B'` and **is delivered**.
6. Therefore no committed change is ever skipped. The two-concurrent-transaction case from the counterexample is handled precisely at step 4: T1 has the lower xid, and if it is still in flight when the barrier is read, the barrier *is* at or below T1's xid, so the cursor cannot advance past it. T2 is simply deferred with it until both are settled.

**At-least-once, never at-most-once.** Boundary rows may be re-delivered. That is safe and deliberate: `change_log` carries pointers, so the device re-reads the current row and upserts it by cloud id. Re-delivery is idempotent; loss would not be recoverable.

**Retention (SD4-013).** `change_log` is pruned at 90 days. A device presenting a cursor older than the horizon receives `{ status: 'cursor_expired' }` and performs a full resync. The failure mode is expensive, never silent.

**Deletes.** Nothing is hard-deleted in normal operation, so `op = 'tombstone'` is written when a row gains `deleted_at` or a tombstoning status. The `DELETE` branch of the trigger exists only for the account-deletion purge and household cascade.

### 6.4 Access patterns and indexes

| Access pattern | Index | Notes |
|---|---|---|
| Household incremental pull | `change_log (household_id, committed_xid, seq)` | Covers the predicate and the ordering in one index |
| Owner incremental pull | `change_log (household_id, owner_profile_id, committed_xid, seq) WHERE owner_profile_id IS NOT NULL` | Partial, so household-scoped rows do not bloat it |
| Tombstone pull | the same two indexes | A tombstone is an ordinary log row with `op='tombstone'`; it needs no separate path |
| By-id reconciliation | primary keys | `uuid` PKs; the push response is keyed by cloud id |
| Idempotent re-upload | the `local_id` unique constraints (SD4-004) | Constraint and index in one |
| Logical-day One Move lookup | `one_move_records (household_id, profile_id, logical_day DESC)` + the `(household_id, profile_id, logical_day)` unique constraint | The second-device same-day lookup B4-P0-058 requires |
| Today view — events | `events (household_id, starts_at, ends_at)` | Carried from the baseline |
| Today view — tasks | `tasks (household_id, status, due_date)`, plus partial indexes on `planned_date` and `planned_starts_at` | Carried from the baseline |
| Needs Me list | `needs_me_items (household_id, profile_id, status, origin_created_at DESC)` | Widened from the baseline to include `profile_id` and to sort on the domain timestamp the list actually orders by |
| Action ledger, recent first | `action_records (household_id, actor_profile_id, logical_date DESC, created_at DESC)` | Widened with `actor_profile_id`; supports the bounded pull of SD4-021 |
| Owner-scoped row filtering | `(household_id, owner_profile_id) WHERE owner_profile_id IS NOT NULL` on the five content tables | New; serves the scope-aware policies |
| Retention pruning | `change_log (logged_at)` | New |
| Foreign-key maintenance | the baseline `(category_id, household_id)` and `(subject_member_id, household_id)` indexes | Retained unchanged |

Phase 1 recorded 29 `unused_index` INFO advisories, which is the expected posture for an empty database. SD4 adds indexes and does not remove any, so that count will rise before any row exists. **That is not drift and must not be treated as a regression**; index usefulness is measured after real traffic, not before (B4-P0-025).

---

## 7. Ownership and the future RLS contract

**No RLS is implemented by SD4.** The scenarios below are the acceptance criteria the later RLS phase (phase 14, the security/RLS test suite) must satisfy. Every row is a test.

### 7.1 The predicate

```
private.can_access_scoped_row(household_id, scope, owner_profile_id) :=
      private.is_household_member(household_id)
  AND ( scope IN ('household','child') OR owner_profile_id = auth.uid() )
```

`personal`, `professional` and `coparent-shared` are owner-only. **`coparent-shared` is owner-only for the whole of Build 4** (B4-P0-038): it is a private category for co-parenting logistics, never permission to share with another account. `child` rows are household-visible in Build 4; finer child-scope semantics are deferred (B4-P0-038, B4-P0-066).

Build 4 has exactly one adult per household, so "member who is not the owner" is not a state the product can currently reach. The scenarios are specified anyway, because the policies must already be correct when collaboration is eventually built — that is the point of establishing them while the databases are empty.

### 7.2 Scenario matrix

Actors: **O** household owner; **M** non-owner household member; **X** authenticated user of a *different* household; **U** unauthenticated (`anon`); **S** trusted server path (`service_role` / `SECURITY DEFINER` RPC).

| Table | Row | O | M | X | U | S |
|---|---|---|---|---|---|---|
| `profiles` | own row | SELECT ALLOW · UPDATE ALLOW (`display_name`, `timezone` only) · INSERT **DENY** (SD4-003) · DELETE DENY | same, own row only | **DENY** all | **DENY** all | ALLOW (bootstrap creates; purge deletes) |
| `profiles` | another user row | **DENY** all | **DENY** all | **DENY** all | **DENY** | ALLOW |
| `households` | own household | SELECT ALLOW · INSERT/UPDATE/DELETE **DENY** | SELECT ALLOW · rest DENY | **DENY** all | **DENY** all | ALLOW (created only by bootstrap/claim) |
| `households` | another household | **DENY** | **DENY** | **DENY** | **DENY** | ALLOW |
| `household_members` | any row of own household | SELECT ALLOW · INSERT/UPDATE/DELETE **DENY** (B4-P0-019) | SELECT ALLOW · rest DENY | **DENY** | **DENY** | ALLOW |
| `household_members` | child row of own household | SELECT ALLOW · rest DENY | SELECT ALLOW · rest DENY | **DENY** | **DENY** | ALLOW |
| `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries` | `scope='household'` or `'child'`, own household | SELECT/INSERT/UPDATE ALLOW · DELETE **DENY** | SELECT/INSERT/UPDATE ALLOW · DELETE DENY | **DENY** | **DENY** | ALLOW |
| the same five | `scope='personal'`/`'professional'`/`'coparent-shared'`, `owner_profile_id = self` | SELECT/INSERT/UPDATE ALLOW · DELETE DENY | ALLOW for own rows | **DENY** | **DENY** | ALLOW |
| the same five | `scope='personal'`/`'professional'`/`'coparent-shared'`, **another member is the owner** | **DENY** all — *including the owner of the household* | **DENY** all | **DENY** | **DENY** | ALLOW |
| the same five | INSERT of a private-scope row naming **someone else** as `owner_profile_id` | **DENY** (`WITH CHECK` fails) | **DENY** | **DENY** | **DENY** | ALLOW |
| the same five | INSERT of a private-scope row with `owner_profile_id IS NULL` | **DENY** (CHECK constraint) | **DENY** | **DENY** | **DENY** | **DENY** — the constraint binds every role |
| `onboarding_state`, `one_move_records`, `needs_me_items`, `discovery_records` | own row (`profile_id = self`) | SELECT/INSERT/UPDATE ALLOW · DELETE DENY | ALLOW for own rows | **DENY** | **DENY** | ALLOW |
| the same four | another member row of the same household | **DENY** all | **DENY** all | **DENY** | **DENY** | ALLOW |
| `discovery_answers` | answers of own discovery record | SELECT/INSERT/UPDATE/DELETE ALLOW | own only | **DENY** | **DENY** | ALLOW |
| `discovery_answers` | answers of another member record | **DENY** | **DENY** | **DENY** | **DENY** | ALLOW |
| `action_records` | own row | SELECT/INSERT ALLOW · **UPDATE DENY · DELETE DENY** (policy, privilege and trigger) | own only | **DENY** | **DENY** | INSERT/SELECT ALLOW; UPDATE **DENY even for `service_role`**; DELETE only under the purge setting |
| `action_records` | another member row | **DENY** | **DENY** | **DENY** | **DENY** | ALLOW |
| `change_log` | own household, `owner_profile_id IS NULL` or self | SELECT ALLOW · INSERT/UPDATE/DELETE **DENY** (no privilege at all) | SELECT ALLOW | **DENY** | **DENY** | ALLOW |
| `change_log` | own household, another member owner-scoped row | **DENY** | **DENY** | **DENY** | **DENY** | ALLOW |
| `account_claims` | own claim | SELECT ALLOW · INSERT/UPDATE/DELETE **DENY** | own only | **DENY** | **DENY** | ALLOW |

Cross-cutting rows that must each be a test:

| Scenario | Expected |
|---|---|
| `anon` SELECT on any application table | **DENY** — no policy names `anon` and no privilege is granted to it |
| Authenticated user with **no** household membership, any table | **DENY** — `is_household_member` is false |
| `X` supplies a valid cloud uuid from another household and asks for it by id | **DENY** — RLS filters before the key lookup |
| Any client attempts to write `revision`, `updated_at`, `created_at`, `id`, `household_id` or `local_id` | **DENY** at the privilege layer, before RLS is consulted (SD4-040) |
| Any client attempts `TRUNCATE` on any table | **DENY** — privilege revoked (SD4-039); RLS would not have governed it |
| `X` attempts to INSERT a row naming another `household_id` | **DENY** — `WITH CHECK` fails |
| A second device of the **same** account | **ALLOW** — it is the same `auth.uid()`; second-device behavior is a data question (SD4-023), never a permission question |

### 7.3 `owner_profile_id` placement (Decision F)

| Table | `owner_profile_id`? | Reason |
|---|---|---|
| `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries` | **Yes**, NULL-able, CHECK-bound to scope | Scope-bearing with rows in both shared and private scopes |
| `household_members` | **No** — flagged as SD4-009a | `profile_id` is already the owner attribution for adults, and child rows are child-scoped by construction. A second column would be a second source of truth |
| `onboarding_state`, `one_move_records`, `needs_me_items`, `discovery_records`, `action_records` | **No** | Pinned to `scope='personal'` and already carry `profile_id`, which *is* the owner |
| `households`, `profiles` | **No** | Ownership is membership (`role='owner'`) and identity respectively |

Bootstrap assigns owner attribution deterministically for the eight starter categories: `cat-work` (`professional`), `cat-wellbeing` and `cat-relationships` (`personal`), `cat-coparenting` (`coparent-shared`) get `owner_profile_id = auth.uid()`; `cat-kids`, `cat-home`, `cat-money`, `cat-meals` (`household`) get NULL.

### 7.4 Child-identifying data (Decision V)

`household_members` stores, for a child, a display name and an **exact birth date**. The only use is `ageOn` (`src/domain/logicalDay.ts`) and labeling.

Honest current exposure: **Build 3 has no production create, edit or remove path for children** (checkpoint section 3), so a real Build 4 household holds zero child rows. The risk is prospective, not live.

Recorded recommendations, deferred to a privacy review (SD4-028):

- Exact date of birth is more than the product needs; only age is consumed. A future revision should consider storing a birth month or a derived age band, and keeping the exact date local. Changing it now would break Build 3 local shape parity, which is why it is a recommendation and not a Build 4 change.
- No index is created on child names or birth dates, and none should be.
- Child rows must never be logged. Existing local practice already logs ids and paths only, never stored values (`validateAppState` issues are explicitly id-and-path only) — the cloud side must match.
- The account-deletion purge must remove child member rows; SD4-029 makes the profile cascade reach them via the household delete, and SD4-030 names them in the explicit order.
- Child rows are household-scoped and readable only by household members. They are unreachable by `anon` (no grant, no policy) and by any other household.

---

## 8. One Move, the action ledger, and bootstrap

### 8.1 One Move — full state machine (Decision L)

States: `selected`, `withheld`, `completed`, `cleared`. `cleared` is the addition.

| From | To | Trigger | Legal |
|---|---|---|---|
| (no row) | `selected` | A candidate exists for the logical day | yes |
| (no row) | `withheld` | The day is overloaded and the candidate adds work | yes |
| `selected` | `selected` | The target disappeared and a replacement candidate exists (retarget, same row) | yes |
| `selected` | `completed` | "I did it", or the target task/item is completed from her own list | yes |
| `selected` | `cleared` | The target disappeared and **no** replacement candidate exists | yes |
| `withheld` | `cleared` | Only via the same no-candidate path | yes |
| `cleared` | `selected` | A candidate appears later the same logical day | yes |
| `completed` | anything | — | **no.** A completed move is never replaced (`decisionStands` returns true; `completeOneMove` is terminal) |
| `withheld` | `selected` | — | **no.** A day that was too full stays that way even if time frees up |
| any | (row deleted) | — | **no.** Physical deletion is never used (B4-P0-024) |

Invariants, all enforced by CHECK constraints:

- `(status = 'completed') = (completed_at IS NOT NULL)`
- `(status = 'cleared') = (cleared_at IS NOT NULL)`
- `withheld` and `cleared` carry no target; `selected` and `completed` carry exactly one typed target
- one row per `(household_id, profile_id, logical_day)`

**Uniqueness is household + owner + logical day** (exact constraint quoted in 8.2), which is what the baseline already had and what B4-P0-058 requires: a second device signing in on the same logical day finds the persisted decision rather than computing a different one.

**Targets are typed (SD4-018).** `target_task_id` and `target_needs_me_id` are real foreign keys with `ON DELETE CASCADE`. CASCADE rather than RESTRICT is deliberate: both tables already cascade from `households`, and a RESTRICT edge between two siblings of the same cascade can make a household delete fail depending on the order PostgreSQL picks. `target_type = 'catalog'` is rejected outright — the catalog exists only in demo households, and demo never syncs.

### 8.2 One Move logical day and timezone — **OWNER-APPROVED** (HR-03 / SD4-017)

#### The profile timezone contract

`profiles.timezone` is the authoritative account timezone for logical-day behavior after bootstrap.

- **`NOT NULL`**, as the baseline already has it, with no default. Both write paths must supply it: bootstrap from the device timezone, claim from local `user.timezone`. A missing value is a hard insert failure, never a silent fallback.
- **Validated at write time** as a real IANA identifier. A CHECK constraint can only bound length (1..64); PostgreSQL cannot validate an IANA name in a CHECK without a lookup. Validation therefore lives in the bootstrap / claim / profile-update RPC, which tests the candidate with `now() AT TIME ZONE <candidate>` inside an exception block and rejects it if that raises. Local state already enforces the same thing through `isValidTimeZone` (`src/domain/state.ts:78`), so both sides agree on what a valid value is.
- **Authoritative across devices.** A second device adopts it. Device-local timezone does not independently redefine the logical day.
- **Travel does not silently overwrite it.** A user physically in London with `profiles.timezone = America/Chicago` keeps getting Chicago logical days until the profile timezone is intentionally changed.

**Product observation, recorded as such and not as an open schema issue:** that last rule is deliberate and it is user-visible. Someone who travels will see "today" roll over at their home midnight rather than the local one until they change the setting. The alternative — letting the device redefine the day — is exactly what B4-P0-058 exists to forbid, because it makes two devices silently choose different One Moves.

#### The stored day key — history is frozen, never recomputed

**Chosen representation:**

```
logical_day           date NOT NULL
timezone_at_decision  text NOT NULL
```

Rationale for this shape over the alternatives:

- A bare `timestamptz` would force every reader to re-derive the day from some timezone, which is precisely the recomputation being forbidden. A `date` **is** the decision, not an input to it.
- Keeping `timezone_at_decision` as a separate column rather than folding it into a composite key preserves it as historical evidence while keeping it out of the uniqueness rule. It answers "which timezone produced this day" for audit, and nothing else.
- It replaces the earlier `for_date` / `for_date_timezone` pair. The rename is deliberate: `for_date` invited the reading "the date this is for", which is ambiguous about whether it may be recomputed. `logical_day` names the frozen product concept.

**`timezone_at_decision` is NOT part of any unique key.** Including it would let the same product logical day acquire a second row merely because the timezone string changed — the precise failure the owner directive names.

**Honest limitation.** Build 3 local One Move records carry no timezone field at all. For records backfilled by claim, `timezone_at_decision` is the profile timezone *at claim time* — evidence of interpretation, not of the original decision. That is recorded in the SQL and here rather than papered over.

#### Day-key computation authority — the server derives it

The server derives the accepted `logical_day` from the authoritative stored `profiles.timezone` at insert time, in a `BEFORE INSERT OR UPDATE` trigger (`public.set_one_move_logical_day()`, `SECURITY DEFINER`, `search_path` pinned to the empty string).

```
LIVE PATH   insert:  new.logical_day := (now() AT TIME ZONE profiles.timezone)::date
                     -- whatever the client sent is DISCARDED
CLAIM PATH  insert:  keep the supplied day (historical backfill); reject any future day
ANY PATH    update:  logical_day and timezone_at_decision are pinned to their OLD values
```

**There is no stale-timezone race to reconcile, because the client value is never trusted on the live path.** A device holding a cached old timezone cannot write a wrong day; it either lands on the correct row or collides with it. The claim path is distinguished by a session setting (`herkeys.claim = 'on'`) that only the bootstrap/claim RPC sets — the same pattern the account-deletion purge uses.

`logical_day` is granted to `authenticated` on INSERT only, so the claim path can supply history, and **never on UPDATE**. `timezone_at_decision` is granted on neither.

#### The exact unique constraint

```sql
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_household_profile_logical_day_key
  UNIQUE (household_id, profile_id, logical_day);
```

Three columns. `timezone_at_decision` is absent by design.

#### Timezone-transition hostile scenario, step by step

Setup: `profiles.timezone = America/Chicago`. It is 2026-09-19 19:00 in Chicago, which is already 2026-09-20 01:00 in London.

| Step | Event | Server behavior | Result |
|---|---|---|---|
| 1 | Device A holds a cached timezone | irrelevant — it is never consulted | — |
| 2 | Device A creates today's One Move | trigger derives `(now() AT TIME ZONE 'America/Chicago')::date` = **2026-09-19**; sets `timezone_at_decision = America/Chicago` | Row R1 on day 2026-09-19, status `selected` |
| 3 | User explicitly changes `profiles.timezone` to `Europe/London` | profile row updated; **R1 is not touched** | R1 still reads 2026-09-19 / America/Chicago |
| 4 | Device B observes the new timezone | — | — |
| 5 | Device A is still stale | — | — |
| 6a | Device B submits "today" | trigger derives `(now() AT TIME ZONE 'Europe/London')::date` = **2026-09-20** | New row R2 on 2026-09-20. **Not a duplicate** — a genuinely different product day |
| 6b | Stale Device A submits "today", sending 2026-09-19 | trigger **discards** the client value and derives 2026-09-20 | Collides with R2 on the unique key and resolves to it. **No duplicate, no invalid row** |
| 7 | R1 was `selected` and still pending during the transition | R1 is history; its `logical_day` is stored, never derived | R1 keeps day 2026-09-19 permanently |
| 8 | Device A retargets or completes R1 by id | the UPDATE branch pins `logical_day` and `timezone_at_decision` to OLD | R1 can still be completed; it can never migrate to another day |

**Proof obligations discharged:**

- *Historical record never reinterprets* — `logical_day` is a stored `date` and no read path derives it; the UPDATE branch pins it (step 8).
- *At most one decision per product logical day* — `UNIQUE (household_id, profile_id, logical_day)` (steps 6a, 6b).
- *Stale Device A cannot create an invalid duplicate* — its supplied day is discarded before the constraint is even consulted (step 6b).
- *Device B does not create a conflicting duplicate* — 2026-09-20 is a different logical day from 2026-09-19, and one row each is the correct outcome (step 6a).
- *Deterministic* — exactly one evaluator of "today" exists (the server, reading one authoritative column), so two devices cannot disagree by construction.

**The reverse transition** (London to Chicago, day 20 back to day 19) is equally safe: the server derives 2026-09-19, a row for that day may already exist, and the unique constraint resolves to it rather than duplicating it.

#### The frozen-date principle applied to the other date fields

| Field | Derived from an instant + timezone? | Frozen? | Treatment |
|---|---|---|---|
| `one_move_records.logical_day` | **Yes** | **Yes**, explicitly | Server-derived once, stored, pinned on UPDATE |
| `action_records.logical_date` | **Yes** — identical semantics | **Yes**, by construction | The ledger is immutable (SD4-020), so it can never be recomputed. It carries no `timezone_at_decision`; recorded as **NHR-04 (P3)** |
| `meal_plan_entries.meal_date` | **No** | n/a | A calendar day the user authored directly. Nothing derives it from an instant, so a timezone change cannot move it |
| `tasks.planned_date` | **No** | n/a | As above — a chosen calendar day |
| `tasks.due_date` | **No** | n/a | As above |
| `tasks.planned_starts_at` | It **is** an instant, not a date | n/a | An unambiguous `timestamptz`. Its wall-clock rendering follows the profile timezone, which is intended and is not a recomputation of stored truth |
| `events.starts_at` / `ends_at` | Instants | n/a | As above |

The distinction that matters: a field **derived** from `now()` plus a timezone can be silently reinterpreted and must be frozen; a field **authored** as a calendar day cannot be.

#### Local contract consequence — recorded, not implemented

For the later local-v3 phase: once account-backed operation begins, `src/domain/logicalDay.ts` must derive the product logical day from the **authoritative profile timezone**, not simply the device timezone. Today `logicalDateAt(now(), state.user.timezone)` reads a device-captured value frozen at first launch (`src/state/initialState.ts`). **This is not implemented now** and is not part of SD4.

### 8.3 Action ledger — immutability and retention (Decision N)

**Immutability, three layers** (SD4-020): no UPDATE or DELETE policy; `UPDATE`, `DELETE` and `TRUNCATE` revoked from `authenticated`; and a `BEFORE UPDATE OR DELETE` trigger that raises. The third layer is what binds `service_role` and the table owner, so a mistaken privileged script cannot quietly rewrite history. The only escape is `herkeys.purge = 'on'`, which only the purge function sets, and it permits DELETE only.

**Retention (SD4-021).** Cloud retention is unbounded in Build 4. Local state caps `actions` at 10,000 and trims. **Local trimming is cache eviction and must never emit a cloud delete** — the sync engine has no delete path for `action_records` at all, by construction, which is the structural answer to "local action trimming deleting cloud truth". The pull for `action_records` is bounded by recency so a trimmed device does not re-download the entire ledger and immediately re-trim it.

**Purge order (SD4-030).** `action_records.actor_profile_id` is `ON DELETE RESTRICT`. Deleting the `auth.users` row alone therefore **fails** while ledger rows exist — `auth.users` cascades to `profiles`, and `profiles` is restricted by the ledger. The mandatory order is:

1. `set_config('herkeys.purge', 'on', true)`
2. `DELETE FROM action_records WHERE household_id = <hh>`
3. `DELETE FROM discovery_answers` (cascades from `discovery_records`, listed for explicitness)
4. `DELETE FROM discovery_records`, `one_move_records`, `needs_me_items`, `onboarding_state`
5. `DELETE FROM events`, `tasks`, `meal_plan_entries`, `household_systems` — **before** categories and members, because of the `RESTRICT` edges on `(category_id, household_id)` and `(subject_member_id, household_id)`
6. `DELETE FROM household_categories`, then `household_members`
7. `DELETE FROM households`
8. `DELETE FROM account_claims WHERE profile_id = <p>`
9. `DELETE FROM auth.users WHERE id = <p>` — cascades to `profiles`
10. `change_log` rows cascade with the household

Steps are idempotent and the function reports the step reached, as B4-P0-048 requires. **The RESTRICT edges are kept on purpose**: they are a genuine integrity guarantee that a category or member cannot vanish from under an event, and the price is that deletion order is explicit rather than implicit. That price is paid here.

### 8.4 Bootstrap and claim (Decision O)

**Is `account_claims` needed? Yes** (SD4-022, resolving B4-P0-034). Row-level idempotency alone handles a simple retry, but it cannot handle the crash case: a device that dies between the server commit and its own durable write has lost its entire `local_id → cloud_id` map and, without a server-side record, has no way to ask for it back. With the claim record it replays the same `claim_key` and receives the household and the complete map in one call. That is the deciding argument, and it is a correctness argument, not bookkeeping.

Shape: `UNIQUE (profile_id, claim_key)` for request identity, plus a partial unique index on `status = 'complete'` giving at-most-once completion per account. `claim_key` is a client-generated request identity and **never an entity primary key** (B4-P0-061). Rejection reasons are enumerated (`refused_demo`, `nothing_to_claim`, `superseded_by_cloud`, `payload_invalid`), matching the discriminated claim-eligibility result B4-P0-011 expects.

**Duplicate cloud households are structurally impossible** (SD4-023): `household_members` carries a partial unique index on `profile_id WHERE role='owner'` and another on `household_id WHERE role='owner'`. An account that already owns a household resolves to it; a second creation attempt fails on a constraint rather than on a code path remembering to check. An unrelated local real household is quarantined locally, never uploaded or merged (B4-P0-031, B4-P0-035) — a client-side behavior with no cloud representation, which is correct, since quarantined state must never reach the server.

**Demo is refused fail-closed** (B4-P0-010): claim rejects a payload declaring `origin: 'demo'` or carrying any demo-sourced row outright, rather than filtering demo rows out of an otherwise accepted payload. SD4-018 and SD4-019 additionally remove the schema-level ability to *store* demo artifacts, so a bug in the refusal cannot produce a demo row in the cloud.

**The starter set needs no reconciliation.** Bootstrap inserts the eight starter categories with their fixed local ids (`cat-kids` … `cat-coparenting`), sort orders 0..7 in **one multi-row INSERT** — which is also why the non-deferrable `(household_id, sort_order)` unique constraint (B4-P0-057) is never a problem: a single statement never transiently collides.

---

## 9. Baseline delta — summary

The object-by-object delta is [BUILD4_SD4_DELTA_MATRIX.md](BUILD4_SD4_DELTA_MATRIX.md). Headline counts:

| | Baseline | Proposed | Change |
|---|---|---|---|
| Application tables | 14 | **16** | `+change_log`, `+account_claims` |
| Functions (`public` + `private`) | 3 | **13** | `+is_household_owner`, `+can_access_scoped_row`, `+current_household_id`, `+force_server_owned_id`, `+forbid_ledger_mutation`, `+log_row_change`, `+set_one_move_logical_day` (HR-03); `is_household_member` re-signed `text`→`uuid`; `rls_auto_enable` retained unchanged |
| Policies | 37 | **39** | Scope-aware rewrite; `profiles_insert_own` removed; `discovery_answers_delete_own`, `change_log_select_scoped`, `account_claims_select_own` added |
| Revision triggers | 12 of 14 | **13 of 16** | Unchanged pattern; `account_claims` added; `discovery_answers`, `action_records` and `change_log` correctly excluded |
| Other triggers | 0 | **+28** | 12 `log_row_change`, 9 `force_server_owned_id`, 1 `forbid_ledger_mutation`, 1 `set_one_move_logical_day` (HR-03), 5 `set_subject_member_type` (NHR-01). Triggers total 12 → **41** |
| Indexes | 51 | **84** | 51 explicit + 17 UNIQUE + 16 PK. The baseline decomposes the same way (31 + 6 + 14 = 51), which is how this count was checked |
| Primary key type | `text` ×13, `uuid` ×1 | **`uuid` ×16** | SD4-001 |
| Column-level grants | 0 | **20** | SD4-040 |

**No change is made to `supabase/migrations/20260919230054_build4_baseline.sql`.** The SD4 SQL lives only at `docs/builds/drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql` and is marked non-executable. `supabase/migrations/` still contains exactly one `.sql` file, verified after writing this design.

---

## 10. Privilege design (Decision T)

Phase 1 proved that a fresh replay of the baseline grants `anon` all eight privileges on all fourteen tables and `PUBLIC` EXECUTE on all three functions, purely from inherited defaults. **Every object below therefore states its intended privileges explicitly and nothing relies on a default.**

| Object class | `anon` | `authenticated` | `service_role` | `PUBLIC` | owner/`postgres` | Explicit revokes required |
|---|---|---|---|---|---|---|
| `households`, `household_members`, `account_claims`, `change_log` | **none** | `SELECT` only | `ALL` | **none** | implicit owner rights | `REVOKE ALL ... FROM PUBLIC, anon, authenticated` first, then grant `SELECT` |
| `profiles` | **none** | `SELECT`; `UPDATE (display_name, timezone)`; **no INSERT** | `ALL` | **none** | implicit | as above |
| `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries`, `onboarding_state`, `one_move_records`, `needs_me_items`, `discovery_records` | **none** | `SELECT`; `INSERT`/`UPDATE` on **named columns only**; **no DELETE, no TRUNCATE, no REFERENCES, no TRIGGER** | `ALL` | **none** | as above |
| `discovery_answers` | **none** | `SELECT, INSERT, UPDATE, DELETE` (the one legitimate client delete path) | `ALL` | **none** | as above |
| `action_records` | **none** | `SELECT`; `INSERT` on named columns; **no UPDATE, no DELETE** | `ALL` *(UPDATE still blocked by trigger; DELETE only under the purge setting)* | **none** | as above |
| All sequences in `public` | **none** | **none** | `ALL` | **none** | `REVOKE ALL ON ALL SEQUENCES ... FROM authenticated, anon, PUBLIC` |
| `private.is_household_member(uuid)`, `is_household_owner(uuid)`, `can_access_scoped_row(uuid,text,uuid)`, `current_household_id()` — all `SECURITY DEFINER`, `search_path=''` | **none** | `EXECUTE` | (not granted; reached via policies) | **none** | `REVOKE ALL ... FROM PUBLIC, anon` then `GRANT EXECUTE TO authenticated` |
| `public.set_row_updated_at()`, `force_server_owned_id()`, `forbid_ledger_mutation()` — trigger functions | **none** | **none** | **none** | **none** | `REVOKE ALL ... FROM PUBLIC, anon, authenticated`. Triggers do not need the invoker to hold EXECUTE |
| `public.log_row_change()` — `SECURITY DEFINER`, `search_path=''` | **none** | **none** | **none** | **none** | as above. Being DEFINER is what stops a client forging or suppressing a change entry |
| `public.bootstrap_account`, `claim_local_household`, `sync_push`, `sync_pull` (signatures only) | **none** | `EXECUTE` | `ALL` | **none** | revoke first, then grant. `sync_push`/`sync_pull` are `SECURITY INVOKER` so RLS still guards every row (B4-P0-025) |
| `private.purge_account`, `private.prune_change_log` | **none** | **none** | `EXECUTE` | **none** | revoke from everything else |
| Schema `private` | **none** | `USAGE` | implicit | **none** | `REVOKE ALL ON SCHEMA private FROM anon, PUBLIC` |

### 10.1 Layer 1 — secure default privileges (HR-02, **OWNER-APPROVED**)

**Which role creates migration objects.** Supabase CLI migrations connect and create objects as **`postgres`**. Every `ALTER DEFAULT PRIVILEGES` below is scoped `FOR ROLE postgres`, which is the same role the Phase 1 capture recorded its own default-privilege statements against. A rule attached to any other role would simply not apply to objects a migration creates — a quiet way for a hardening pass to accomplish nothing.

**Current hosted behavior, inferred from the Phase 1 capture** (the nine `ALTER DEFAULT PRIVILEGES` statements retained in the baseline, plus PostgreSQL built-ins):

| Object kind created by `postgres` in `public` | Inherited grantees |
|---|---|
| TABLES | `anon`, `authenticated`, `service_role` each get SELECT, INSERT, UPDATE, DELETE |
| SEQUENCES | `anon`, `authenticated`, `service_role` each get SELECT, USAGE |
| ROUTINES | `anon`, `authenticated`, `service_role` each get ALL |
| any new FUNCTION | **`PUBLIC` gets EXECUTE** — a PostgreSQL built-in, not a Supabase choice |

That is what made a fresh local replay 112 relation-privileges and 5 function-privileges *more permissive* than hosted Staging until Phase 1 added compensating REVOKEs. **Those REVOKEs fixed the baseline objects and did nothing about the next object anyone creates.**

**Intended Build 4 default behavior:**

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE ALL     ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE ALL     ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE ALL     ON ROUTINES  FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE ALL     ON ROUTINES  FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE EXECUTE ON ROUTINES  FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL     ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL     ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL     ON ROUTINES  FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE EXECUTE ON ROUTINES  FROM PUBLIC;
```

Reasoning for each choice, including the deliberate non-changes:

- **`anon` loses everything, in both schemas.** Nothing in Her Keys is anonymously readable; every policy in this design is `TO authenticated`. An `anon` default therefore grants access that no feature wants.
- **`PUBLIC` loses the built-in default EXECUTE on routines.** This is the sharper half. A table created without a policy is still covered by RLS, because the retained `ensure_rls` event trigger enables it automatically — but a **function has no RLS at all**. A future `SECURITY DEFINER` helper inheriting `PUBLIC` EXECUTE is a real privilege escalation, and it is the failure mode the baseline is currently wide open to.
- **`authenticated` loses its default on ROUTINES** for the same reason: function EXECUTE must be a deliberate act, per function.
- **`authenticated` KEEPS its default on TABLES, and `service_role` keeps its defaults.** Removing the table default adds no security — RLS governs, and Layer 2 narrows every table to named columns anyway — while making every future migration fail in a confusing way. This is defense in depth, not defense by obstruction.

This changes only the default for objects created from here on. It alters no existing object, and it does not touch the historical Phase 1 baseline file.

### 10.2 Layer 2 — per-object privileges

Layer 2 is the per-object treatment in the table above and in sections 9 Steps 1–3 of the SQL draft: every table and function this migration creates or materially alters names its own privileges explicitly and inherits nothing. **RLS is never treated as a substitute for withholding an unnecessary SQL privilege** — which is why `TRUNCATE`, `REFERENCES` and `TRIGGER` are revoked even though RLS would be irrelevant to them.

Layer 1 exists precisely so that a *future* migration which forgets Layer 2 still cannot expose an object to `anon` or `PUBLIC`.

### 10.3 Layer 3 — fingerprint drift detection

The deterministic fingerprint in `supabase/tools/` is a standing verification gate. The privilege dimensions (`privileges.relations`, `privileges.functions`, `privileges.effective`, `privileges.schemas`, `privileges.default_acl`, and the newly populated `privileges.columns`) must detect accidental widening or narrowing after implementation.

**The intended Build 4 privilege delta is enumerated in [BUILD4_SD4_DELTA_MATRIX.md](BUILD4_SD4_DELTA_MATRIX.md) section 10. Any dimension change outside that enumeration is drift, not design.** Equally: a future reviewer must **not** "repair" an intended Build 4 privilege delta back to the Phase 1 baseline digest. The Phase 1 digest `c55d9b80d604211a5841260709b27f47` is the *pre-Build-4* baseline, not a target to restore.

### 10.4 Load-bearing helper privileges — the over-revoke hazard

An RLS policy expression is evaluated **as the querying role**. So `authenticated` must be able to reach every helper a policy calls, regardless of whether that helper is `SECURITY DEFINER`. `SECURITY DEFINER` changes the privileges *inside* the function body; it does not waive the EXECUTE check on the call itself.

| Function | Security | Schema USAGE needed by | EXECUTE needed by | Why |
|---|---|---|---|---|
| `private.is_household_member(uuid)` | DEFINER, `search_path=''` | `authenticated` on `private` | **`authenticated`** | Called directly by policies on `households`, `household_members`, `onboarding_state`, `one_move_records`, `needs_me_items`, `discovery_records`, `discovery_answers`, `action_records`, `change_log`. **Removing this grant breaks every scoped read in the product.** |
| `private.can_access_scoped_row(uuid, text, uuid)` | DEFINER, `search_path=''` | `authenticated` on `private` | **`authenticated`** | Called directly by all 15 scope-aware policies on the five content tables |
| `private.is_household_owner(uuid)` | DEFINER, `search_path=''` | `authenticated` on `private` | **`authenticated`** | Reserved for owner-only policies; granted now so a later policy cannot be added against a function the client cannot call |
| `private.current_household_id()` | DEFINER, `search_path=''` | `authenticated` on `private` | **`authenticated`** | Called by `sync_pull`, which is `SECURITY INVOKER` so that RLS still guards it |
| `public.set_row_updated_at()` | INVOKER, `search_path=''` | — | **nobody** | Trigger function. PostgreSQL checks EXECUTE on a trigger function when the trigger is **created**, not each time it fires |
| `public.force_server_owned_id()` | INVOKER, `search_path=''` | — | **nobody** | Trigger function, as above |
| `public.set_one_move_logical_day()` | DEFINER, `search_path=''` | — | **nobody** | Trigger function. DEFINER so it can read `profiles.timezone` regardless of the caller |
| `public.forbid_ledger_mutation()` | INVOKER, `search_path=''` | — | **nobody** | Trigger function |
| `public.log_row_change()` | DEFINER, `search_path=''` | — | **nobody** | Trigger function. DEFINER is what stops a client forging or suppressing a change entry |
| `public.rls_auto_enable()` | DEFINER, `search_path='pg_catalog'` | — | `service_role` (retained) | Event-trigger handler. Retained from the baseline, unmodified |
| `public.bootstrap_account`, `claim_local_household` | DEFINER (signatures only) | — | **`authenticated`** | Client entry points |
| `public.sync_push`, `sync_pull` | **INVOKER** (signatures only) | `authenticated` on `private` | **`authenticated`** | Deliberately INVOKER so RLS still guards every row (B4-P0-025) |
| `private.purge_account`, `private.prune_change_log` | DEFINER (signatures only) | — | **`service_role` only** | Never reachable by a client |

Two grants are the ones a careless hardening pass would strand, so the SQL draft **re-asserts them after every blanket revoke**:

```sql
GRANT USAGE   ON SCHEMA   private                                         TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_household_member(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_household_owner(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_scoped_row(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_household_id()                  TO authenticated;
```

A blanket REVOKE that runs *after* a GRANT is the classic way a security pass takes an application down. The ordering in section 9 of the draft was checked specifically for this: the `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public ...` statements are scoped to `public` and cannot reach the `private` helpers, and the re-assertion block is last regardless.

**The trigger-function claim (no EXECUTE holders) is the one privilege statement here that rests on engine behavior rather than on a rule this design wrote.** Implementation acceptance **Test D** exists to demonstrate it on an ephemeral local database before any remote apply. It is not claimed as proven.

### 10.5 Retained baseline objects — no legacy posture hidden behind new defaults

Not every baseline object is replaced. These survive the delta, and each one is accounted for rather than left to inherit whatever it had.

| Retained object | Baseline privilege posture | Hardened by the Build 4 delta? |
|---|---|---|
| `public.rls_auto_enable()` | EXECUTE held by `postgres` and `service_role` only, after the Phase 1 ACL normalization | **No — intentionally unchanged.** Platform machinery for the `ensure_rls` event trigger. Its posture is already minimal, and it is scored in the non-gating `info.event_triggers` dimension. Touching it would add fingerprint noise for no security gain |
| `ensure_rls` event trigger | n/a (event triggers carry no ACL) | **Unchanged, and load-bearing.** It is what makes a forgotten future table RLS-protected by default, which is part of why keeping the `authenticated` TABLES default is acceptable |
| `public.set_row_updated_at()` | EXECUTE held by `anon`, `authenticated`, `postgres`, `service_role` | **Yes — hardened.** Revoked from `anon` and `authenticated`. It is a trigger function; no caller needs EXECUTE. This is a deliberate tightening beyond restoring the baseline posture |
| `private.is_household_member(**text**)` | EXECUTE held by `authenticated`, `postgres` | **Dropped**, not retained — superseded by the `uuid` signature. Leaving the `text` overload in place would be a live, callable function with a stale contract |
| The nine baseline `ALTER DEFAULT PRIVILEGES` statements | grant `anon`, `authenticated`, `service_role` on new TABLES / SEQUENCES / ROUTINES | **Yes — superseded** by the Layer 1 statements in 10.1. The historical baseline file is **not** edited; the new statements are additive and take effect for objects created after them |
| The 17 baseline replay-normalization REVOKEs | remove the inherited `anon` / `PUBLIC` grants from the 14 baseline tables and 3 functions | **Superseded by teardown.** Those 14 tables are dropped and recreated, so the REVOKEs no longer apply to anything; the recreated tables get explicit Layer 2 treatment instead. This is why the delta must not be read as "the Phase 1 ACL work was undone" |
| `auth.users` and all `auth.*` | platform-managed | **Untouched.** SD4 proposes no change to any Supabase-managed schema |



### 10.6 GUC security audit (NHR-05) — **PASS**

**METHOD** `grep -n "current_setting('herkeys\|set_config('herkeys\|SET herkeys" docs/builds/drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql`

| Call site (before this pass) | Could it alter authorization, RLS, integrity, server-owned field acceptance, historical backfill, or claim behavior? | Classification | Action |
|---|---|---|---|
| `current_setting('herkeys.purge')` in `forbid_ledger_mutation()` | **Yes** — it gated DELETE on the immutable ledger | **SECURITY-RELEVANT** | **REMOVED.** Replaced by `private.is_trusted_server_context()` |
| `current_setting('herkeys.claim')` in `set_one_move_logical_day()` | **Yes** — it gated the historical-backfill branch, i.e. whether a caller may supply `logical_day` | **SECURITY-RELEVANT** | **REMOVED.** Same replacement |

**RAW after the change:** the only remaining match is the explanatory comment at line 313 describing what was removed. **Zero security-relevant `herkeys.*` call sites remain, and no diagnostic-only ones were introduced.**

### 10.7 Re-attestation after this pass

**§10.4 helper reachability matrix — PASS.** Three functions were added and each was placed in the matrix:

| Function | Security | Schema USAGE | EXECUTE needed by | Why |
|---|---|---|---|---|
| `public.set_subject_member_type()` | INVOKER, `search_path=''` | — | **nobody** | Trigger function; EXECUTE is checked at `CREATE TRIGGER`, not per fire |
| `private.is_trusted_server_context()` | INVOKER, STABLE, `search_path=''` | — | **nobody** | Called only from inside definer-owned functions, which run as their owner |
| `private.assert_app_schema_secured()` | DEFINER, `search_path=''` | — | **`service_role`** | Called by migrations, never by a client |

The load-bearing set is unchanged and still re-asserted after every blanket revoke: `USAGE ON SCHEMA private` plus EXECUTE on `is_household_member(uuid)`, `is_household_owner(uuid)`, `can_access_scoped_row(uuid,text,uuid)`, `current_household_id()`. **No new function joined the load-bearing set**, so the over-revoke surface did not grow.

**§10.5 retained-baseline-object audit — PASS, with one classification promoted to evidence.** `public.rls_auto_enable()` and the `ensure_rls` event trigger are now formally classified **PLATFORM-MANAGED / INFORMATIONAL** on repo-owned Phase 1 evidence (§12, NHR-02), not merely left alone by convention. Every other row of §10.5 is unchanged.

**Reverse-path verification (NHR-02 2F) — PASS by design.** For a newly created application table carrying an explicit `authenticated` grant, explicit RLS policies, and the helper permissions above, every link in the chain survives the new revokes:

| Link | Survives? | Why |
|---|---|---|
| Relation privilege | **Yes** | Layer 1 removes only the `anon` and `PUBLIC` defaults and the `authenticated` ROUTINES default. The `authenticated` TABLES default is deliberately kept, and Layer 2 grants named columns explicitly |
| Schema USAGE | **Yes** | `GRANT USAGE ON SCHEMA private TO authenticated` is re-asserted after every revoke |
| Helper EXECUTE | **Yes** | All four re-asserted in the same block |
| Applicable RLS policy | **Yes** | Policies are created per table and `assert_app_schema_secured()` refuses a table that has none |

**No legitimate `authenticated` path that this design expects to work becomes impossible.** This is a design-review conclusion; **Test D** is what demonstrates it.


---

## 11. Hostile review

Severity: **P0** blocks the schema · **P1** serious correctness, security or architecture · **P2** important follow-up · **P3** minor · **P4+** future/documentation.

### 11.1 Re-attestation of all 30 original attacks

Extracted from this artifact, not from a prior prose summary. **METHOD** `awk -F'|' '/^\| H-[0-9]/ {print $2, $4}'`. **RAW** 24 `STILL RESOLVED`, 6 `CHANGED ANSWER`, 0 `REGRESSED`.

| # | Prior status | Current status | Why |
|---|---|---|---|
| H-01 | STILL RESOLVED | **STILL RESOLVED** | Three layers intact; NHR-05 removes `logical_day` from the INSERT grant, adding a fourth server-owned field the client cannot dictate |
| H-02 | STILL RESOLVED | **STILL RESOLVED** | Two partial unique indexes unchanged |
| H-03 | STILL RESOLVED | **STILL RESOLVED** | `local_id` unique constraints unchanged |
| H-04 | STILL RESOLVED | **STILL RESOLVED** | `account_claims` replay unchanged; NHR-05 specifies the retry contract in full |
| H-05 | STILL RESOLVED | **STILL RESOLVED** | Device-relative local ids unchanged |
| H-06 | STILL RESOLVED | **STILL RESOLVED** | Revision and cursor remain separate mechanisms |
| H-07 | STILL RESOLVED | **STILL RESOLVED** | xmin-barrier proof unchanged |
| H-08 | STILL RESOLVED | **STILL RESOLVED** | Cursor indexes unchanged; NHR-01 adds five `subject_member_id` partial indexes |
| H-09 | STILL RESOLVED | **STILL RESOLVED** | Tombstones unchanged |
| H-10 | CHANGED ANSWER | **STILL RESOLVED** (stable) | No further change this pass |
| H-11 | CHANGED ANSWER | **STILL RESOLVED** (stable) | No further change this pass |
| H-12 | STILL RESOLVED | **STILL RESOLVED** | Trigger + withheld column grant |
| H-13 | STILL RESOLVED | **STILL RESOLVED** | As above |
| H-14 | STILL RESOLVED | **STILL RESOLVED** | `origin_*` columns still nullable and never defaulted |
| H-15 | CHANGED ANSWER | **CHANGED ANSWER → now fully resolved** | The gap H-15 opened *was* NHR-01. Closed this pass by owner decision A2: the child-subject invariant is now structural on all five child-capable tables |
| H-16 | STILL RESOLVED | **STILL RESOLVED** | Payload bounds unchanged |
| H-17 | STILL RESOLVED | **STILL RESOLVED** | Ledger immutability unchanged; its escape hatch is now a role boundary rather than a GUC, which strengthens it |
| H-18 | STILL RESOLVED | **STILL RESOLVED** | No delete path for `action_records` |
| H-19 | STILL RESOLVED | **STILL RESOLVED** | Demo unrepresentable |
| H-20 | STILL RESOLVED | **STILL RESOLVED** | `coparent-shared` owner-only |
| H-21 | STILL RESOLVED | **STILL RESOLVED** | Private-scope predicate unchanged |
| H-22 | CHANGED ANSWER | **CHANGED ANSWER → now three-layer** | Its residual *was* NHR-02. Closed this pass: Layer 1 secure defaults, Layer 2 per-object grants, Layer 3 fingerprint, plus an application assertion layer |
| H-23 | CHANGED ANSWER | **CHANGED ANSWER → three more DEFINER functions** | `set_subject_member_type` (INVOKER), `is_trusted_server_context` and `assert_app_schema_secured` (DEFINER). All pin `search_path`; the two new DEFINER functions hold no EXECUTE for client roles |
| H-24 | STILL RESOLVED | **STILL RESOLVED** | The new composite FK points content → `household_members`, the same direction as the existing edges. No cycle introduced |
| H-25 | CHANGED ANSWER | **CHANGED ANSWER → one more requirement** | NHR-01 adds a second local-v3 reconciliation item (adult subjects) alongside the HR-03 `logicalDay.ts` item |
| H-26 | STILL RESOLVED | **STILL RESOLVED** | Re-verified this pass: `supabase/migrations/` holds one file, hash unchanged |
| H-27 | STILL RESOLVED | **STILL RESOLVED** | `profiles_insert_own` still removed |
| H-28 | STILL RESOLVED | **STILL RESOLVED** | Strengthened: `display_name` is now nullable for adults, so the orphan-avoidance CHECK no longer forces a fabricated string |
| H-29 | STILL RESOLVED | **STILL RESOLVED** | Cross-household reads blocked; the composite FK additionally blocks cross-household *subject references*, which no prior layer covered |
| H-30 | STILL RESOLVED (P2 deferred) | **STILL RESOLVED (P2 deferred)** | Minimization still deferred as SD4-028 |

**Summary: 24 STILL RESOLVED · 6 CHANGED ANSWER · 0 REGRESSED.**

### 11.2 The six changed-answer attacks — named and reconciled

The prior prose report named only H-10, H-11 and H-22. **The artifact recorded all six correctly; the prose under-reported them.** There is no evidence gap.

| # | Prior answer | Current answer | Why it changed | Stable now? |
|---|---|---|---|---|
| **H-10** | Unique constraint on a client-supplied `for_date` | Day is **server-derived**; a wrong day cannot reach the constraint | HR-03 moved day computation to the server | **Yes** — untouched this pass |
| **H-11** | `for_date_timezone` made divergence *detectable* | Divergence is *impossible* on the live path; `timezone_at_decision` is audit evidence only | HR-03 | **Yes** |
| **H-15** | Ownership unambiguous, but a scope-integrity gap opened | Gap closed structurally: composite FK proves the subject is a child of the same household | The gap was NHR-01; owner decision A2 resolved it | **Yes** — closed this pass |
| **H-22** | "Resolved, with an owner decision outstanding" | Three-layer defense with the hazard removed, not documented | HR-02, then NHR-02 added the application assertion layer | **Yes** — closed this pass |
| **H-23** | Five DEFINER functions, `search_path` pinned | Eight functions total; reachability matrix and over-revoke analysis added | HR-02 added the matrix; NHR-01/02/05 added three functions | **Yes**, pending Test D |
| **H-25** | Section 5 reconciled eleven concepts | Two explicit local-v3 obligations now recorded | HR-03 added the timezone item; NHR-01 added the adult-subject item | **Yes** |

### 11.3 New hostile review — this pass

#### NHR-01, the eight owner-specified attacks

| # | Attempt | Outcome | Mechanism |
|---|---|---|---|
| 1 | `scope='child'`, `subject_member_id` NULL | **REJECTED** | `*_child_scope_subject_check` on all five tables |
| 2 | non-null subject points at an **adult** | **REJECTED** | Composite FK `(subject_member_id, household_id, subject_member_type)` → `household_members(id, household_id, member_type)`. `subject_member_type` is pinned to `'child'`, so an adult parent row has no match |
| 3 | subject points at **another household's** child | **REJECTED** | `household_id` is the second column of the same FK |
| 4 | new row references an **archived** child | **DORMANT** — no archival state exists (B4-P0-066 DEFERRED). Activation dependency recorded in §12 |
| 5 | existing row references a child, child later archived | **DORMANT**, same reason. When activated, rule 3 preserves existing references |
| 6 | referenced child's `member_type` changed to adult | **REJECTED** | The parent UPDATE leaves referencing rows unmatched; the FK raises. **No trigger involved** |
| 7 | referenced child's `household_id` changed | **REJECTED** | Same FK, same mechanism |
| 8 | unauthorized actor adds or archives a child | **DENIED** | `household_members` is SELECT-only for `authenticated`; creation and removal are RPC-only (B4-P0-019). Archival does not exist |

Additional attacks run: **client asserts `subject_member_type='adult'`** to smuggle an adult subject → triple-blocked (no column grant, trigger overwrites, CHECK pins to `'child'`). **Demo row with an adult subject** → demo never syncs and claim fails closed.

#### NHR-02

| Attempt | Outcome |
|---|---|
| Future migration creates a table and forgets every GRANT | `anon`/`PUBLIC` blocked by Layer 1; `authenticated` reaches a table with RLS enabled and no policy → all rows denied |
| Future migration forgets `ENABLE ROW LEVEL SECURITY` | `private.assert_app_schema_secured()` raises and **aborts the migration transaction** |
| Future migration forgets to *call* the assertion | **Not caught by Layer 2** → NHR-08 (P3). Layers 1 and 3 still apply |
| Her Keys layer breaks `auth` / `storage` / `extensions` / temp DDL | **Cannot.** The function inspects `nspname='public'` only, and runs only when a migration calls it |
| Over-revocation strands a policy | **Survives.** Blanket revokes are `public`-scoped; §10.4 re-asserts `private` USAGE and all helper EXECUTEs afterwards |
| `service_role` over-restricted | Explicit `GRANT ALL` on tables plus named EXECUTEs |

#### NHR-05

| Attempt | Outcome |
|---|---|
| Client sets `herkeys.claim` / `herkeys.purge` | **Impossible to exploit — the GUCs no longer exist.** Both branches now test `private.is_trusted_server_context()` |
| Client sets any other `herkeys.*` value | **No security-relevant call site remains.** Audit in §10.6 |
| Client writes `logical_day`, `timezone_at_decision`, `revision`, `subject_member_type`, ids or server timestamps | **DENIED at the privilege layer**, before RLS. Prevention, not trigger-correction |
| Claim another account | **Not expressible.** The argument shape carries local content only — no `profile_id`, no `household_id`, no cloud id |
| Duplicate claim | `account_claims` `UNIQUE (profile_id, claim_key)` + partial unique on `status='complete'` |
| Crash then retry, One Move already inserted | `ON CONFLICT (household_id, profile_id, logical_day) DO UPDATE` where identical; **material mismatch preserves conflict evidence and does not overwrite** |
| Malicious historical day (future-dated) | Rejected by the claim branch |
| Malformed timezone | Rejected by `now() AT TIME ZONE <candidate>` inside an exception block |

#### HR-05

| Attempt | Outcome |
|---|---|
| Provider returns NULL | Stored as NULL. No placeholder |
| Whitespace-only | Normalizes to empty → NULL |
| Internal whitespace runs | CHECK rejects `'  '`; the client must collapse first |
| Control characters | CHECK rejects `[[:cntrl:]]` |
| NFD instead of NFC | **Not enforceable as a CHECK** → NHR-07 (P3). Client/RPC obligation |
| One character, punctuation-only, emoji-only | **Stored honestly.** The database does not police semantic content |
| Extremely long | 80-character cap |
| UI fallback `"You"` accidentally persisted | **Not structurally preventable** — indistinguishable from a user who typed it → NHR-09 (P3). UI obligation |

### 11.4 Open findings

**No P0 open. No P1 open.**

| # | Sev | Finding | Disposition |
|---|---|---|---|
| **NHR-06** | **P3** | `private.is_trusted_server_context()` rests on `current_user = 'postgres'` inside a definer-owned function — a Supabase deployment assumption SD4 cannot execute to confirm | **Test D** must demonstrate it. If migrations ever run as a non-`postgres` owner, the predicate must be widened to that owner |
| **NHR-07** | **P3** | NFC normalization cannot be expressed as a CHECK | Client/RPC obligation, documented. Everything else in the normalization contract *is* enforced by the database |
| **NHR-08** | **P3** | The assertion layer only fires when a migration calls it | Accepted residual of the owner-sanctioned alternative to an event trigger. Layers 1 and 3 remain independent |
| **NHR-09** | **P3** | A persisted `"You"` is indistinguishable from a typed `"You"` | UI obligation: never send the fallback |
| HR-06 | P2 | Child data minimization | **DEFERRED** (SD4-028). *Note:* A2 widens the child-reference surface to three more tables, which the future privacy review must cover |
| HR-07 | P2 | `systems` / `meals` sync paths have no production producer | Carried forward. A2 gives them a child reference they equally cannot exercise yet |
| HR-08 | P2 | `change_log` growth unbounded between prunes | Carried forward |
| HR-09 | P2 | `log_row_change` adds a write per mutation | Carried forward |
| HR-10 | P3 | `unused_index` advisory count rises | Carried forward; A2 adds five more partial indexes |
| HR-11 | P3 | `discovery_answers` has no revision / change-log trigger | Carried forward |
| HR-12 | P3 | Cursor protocol never executed | Carried forward; **Test C/E** |
| HR-13 | P4 | Non-owner member scenarios unreachable in Build 4 | Carried forward |
| HR-14 | P4 | Production backup / PITR deferred | Carried forward (B4-P0-052 / OD-2) |

**NHR-01, NHR-02, NHR-05 and HR-05 are closed** by the owner decisions recorded in §12.


---

## 12. Owner resolutions — decision history

Original findings are preserved verbatim in 11.3 of the prior revision and in the register rows; nothing is erased or overwritten.

### HR-01 — `household_members.owner_profile_id`

**RESOLVED BY OWNER**

| | |
|---|---|
| Original status | **P1 OPEN**, PENDING-OWNER |
| Original finding | `owner_profile_id` omitted from `household_members`, the sixth scope-bearing table named by the approved B4-P0-038 (OD-1). Defensible under "where needed", but narrowing an approved decision is the owner call |
| Owner resolution | **APPROVED: do not add `owner_profile_id` to `household_members`.** The rationale is *not* that every membership row has a profile identity — Build 4 may represent children as `member_type='child'` with `profile_id IS NULL`. It is that for profile-backed rows `profile_id` already identifies the member, and for child/non-profile rows `owner_profile_id` would still not denote a meaningful alternate owner *of the membership itself*. No Build 4 product case exists where ownership of a membership row differs from the membership relationship the row represents. The column would be redundant-or-nullable with no independent semantics, and would license future contradictory interpretations. `owner_profile_id` remains **required on content rows** where row ownership or visibility scope can differ from ordinary household membership |
| Resulting status | **OWNER-APPROVED** |
| Effective date | 2026-09-19 |
| Affected SD4 IDs | SD4-009a (PENDING-OWNER → OWNER-APPROVED), SD4-009 (unchanged), SD4-029 (unchanged) |
| Affected B4-P0 IDs | B4-P0-038 (OD-1), B4-P0-019, B4-P0-066 |
| Re-review outcome | Five of six attacks failed (11.2). One succeeded: **NHR-01**, a *scope-integrity* gap, not an ownership gap — no ownership case was found without a structural home |
| Acceptance criteria | The RLS matrix rows in 7.2 for `household_members` become tests. `household_members_check` must reject: adult with NULL profile; child with a profile; child with NULL birth date; child with a scope other than `child` |
| Substantive design changed? | **No.** No schema change resulted from this resolution |

### HR-02 — secure default privileges

**RESOLVED BY OWNER**

| | |
|---|---|
| Original status | **P1 OPEN**, PENDING-OWNER |
| Original finding | The `anon` default privilege survives unless Option 2 is approved; one forgetful future migration silently exposes a table |
| Owner resolution | **APPROVED: three-layer defense in depth.** Layer 1 secure `ALTER DEFAULT PRIVILEGES` for the migration-owning role; Layer 2 explicit per-object privileges in the same migration; Layer 3 the fingerprint as a standing drift gate. The design must not rely only on developers remembering Layer 2. RLS is not a substitute for withholding an unnecessary SQL privilege |
| Resulting status | **OWNER-APPROVED** |
| Effective date | 2026-09-19 |
| Affected SD4 IDs | SD4-026 (PENDING-OWNER → OWNER-APPROVED), SD4-039, SD4-040, SD4-027 |
| Affected B4-P0 IDs | **B4-P0-040** (the never-rely-on-default-grants decision now has a concrete mechanism), B4-P0-041 |
| Design change applied | Nine `ALTER DEFAULT PRIVILEGES` statements (10.1); a load-bearing re-assertion block for `private` USAGE and the four helper EXECUTEs (10.4); a retained-baseline-object audit (10.5) |
| Acceptance criteria | Test D (privilege reachability). Plus: create a throwaway table and function in an ephemeral local database *without* any privilege statement and assert `anon` and `PUBLIC` hold nothing on either |
| Verification status | **DESIGN REVIEW ONLY.** No empirical runtime proof is claimed |

### HR-03 — logical-day / timezone authority

**RESOLVED BY OWNER**

| | |
|---|---|
| Original status | **P1 OPEN**, PENDING-OWNER |
| Original finding | Making `profiles.timezone` authoritative changes a Build 3 behavior and is a product decision, not only a schema choice |
| Owner resolution | **APPROVED: `profiles.timezone` is the authoritative account timezone for logical-day behavior after bootstrap**, intentionally refining Build 3 device-local behavior. NOT NULL after initialization, initialized from an explicit device/user timezone, validated as a real IANA identifier at write time. A second device adopts it. Travel does not silently overwrite it; the UX consequence is a product observation, not an unresolved schema issue. Historical logical-day identity is **frozen at write time** and never recomputed. Physical field design explicitly delegated to this pass |
| Resulting status | **OWNER-APPROVED** |
| Effective date | 2026-09-19 |
| Affected SD4 IDs | SD4-017 (PENDING-OWNER → OWNER-APPROVED), SD4-016, SD4-018, SD4-011 |
| Affected B4-P0 IDs | **B4-P0-059** (One Move cloud model and timezone — SD4 now carries a proposed resolution), B4-P0-058, B4-P0-027 |
| Design change applied | `for_date` → **`logical_day date NOT NULL`**; `for_date_timezone` → **`timezone_at_decision text NOT NULL`**; server-side derivation trigger `public.set_one_move_logical_day()`; `herkeys.claim` path for historical backfill; unique key changed to `(household_id, profile_id, logical_day)` with `timezone_at_decision` deliberately excluded; index renamed; column grants narrowed so neither field is client-writable on UPDATE |
| Acceptance criteria | Test E. Plus every row of the transition table in 8.2 becomes a test, including the stale-device case (6b) and the pinned-UPDATE case (8) |
| Local consequence | `logicalDay.ts` must derive the product day from the profile timezone once account-backed operation begins. **Recorded for local-v3; not implemented** |

### HR-04 — destructive migration interlock

**RESOLVED BY OWNER**

| | |
|---|---|
| Original status | **P1 OPEN**, PENDING-OWNER |
| Original finding | The migration is destructive and valid only at zero rows; the window closes the moment a real user exists |
| Owner resolution | **APPROVED WITH STRUCTURAL INTERLOCK.** A procedural pre-flight is insufficient — the migration itself must enforce the empty-database precondition, as an in-migration `DO ... RAISE EXCEPTION` guard that is the first executable database statement, covering all 16 application tables plus `auth.users` by explicit schema-qualified name. No `TRUNCATE`, no `DELETE`, no dropping data-bearing objects to satisfy the guard, no automatic export-and-restore. If rows exist: ABORT |
| Resulting status | **OWNER-APPROVED** |
| Effective date | 2026-09-19 |
| Affected SD4 IDs | SD4-041 (PENDING-OWNER → OWNER-APPROVED), SD4-001 (the change the interlock protects) |
| Affected B4-P0 IDs | B4-P0-050, B4-P0-051, **B4-P0-052 / OD-2** (recovery posture is materially more important given a destructive migration) |
| Design change applied | Guard rewritten to enumerate 16 tables plus `auth.users` with `to_regclass` tolerance, collecting and reporting every offending relation; a top-level `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` closing the check-then-act window and making the single-transaction requirement self-enforcing; a second census under the locks |
| Acceptance criteria | **Tests A, B and C**, recorded in section 11 of the SQL draft. Test C specifically proves the transaction boundary |
| Production gate | Unchanged and separate. Before any eventual Production migration, repeat an explicit row and auth census. If Production is not empty: **STOP** — do not apply, truncate, delete, or export-and-restore. Return to the owner for a non-destructive design |


### NHR-01 — child-scope structural integrity

**RESOLVED BY OWNER**

| | |
|---|---|
| Original status | **P2 OPEN** (raised by the HR-01 re-review), then two PENDING-OWNER sub-questions |
| Original finding | Child-scoped content rows had no cloud constraint requiring a subject member, while Build 3 local integrity requires one. A pulled row naming nobody would be rejected locally and stall sync |
| PENDING-OWNER-A | Three of the five child-capable tables (`household_categories`, `household_systems`, `meal_plan_entries`) had no member reference column, so the rule was unsatisfiable on them. **Owner chose A2:** add the column, do not narrow child scope out of those tables |
| PENDING-OWNER-B | Rules 3–4 presumed an archived state that does not exist; building one would ship DEFERRED **B4-P0-066**. **Owner accepted the dormant-rule treatment** |
| Resulting status | **CLOSED** |
| Effective date | 2026-09-19 |
| Owner rationale for A2 | Child scope is part of the Her Keys product framework, not a Build 3 implementation detail. A category, household system or meal plan associated with a particular child is structurally coherent, and removing that capability during the pre-data window would only manufacture a future migration. The invariant is consistent: **if a row says `scope='child'`, the row identifies which child** |
| Mechanism — rules 1, 2, 3 | Rule 1: `CHECK (scope <> 'child' OR subject_member_id IS NOT NULL)` on all five tables. Rules 2 **and** 3: one composite foreign key `(subject_member_id, household_id, subject_member_type) → household_members(id, household_id, member_type)`, backed by a new `UNIQUE (id, household_id, member_type)` on `household_members`. **Both directions are proved structurally; no trigger and no RLS participates in relational integrity.** Changing a referenced child's `member_type` or `household_id` leaves referencing rows unmatched and raises |
| `subject_member_type` | A derived carrier column for the FK's third position. Set by `public.set_subject_member_type()`, pinned by CHECK to `'child'`, and **granted to no one** — so a client cannot assert that an adult is a child |
| Naming | The owner's generic phrase `child_member_id` maps to the artifact's existing `subject_member_id`. Per owner instruction the existing terminology is kept |
| Affected SD4 IDs | SD4-009, SD4-024, SD4-029, SD4-039, SD4-040 |
| Affected B4-P0 IDs | B4-P0-038 (OD-1), B4-P0-019, **B4-P0-066 (DEFERRED)** |
| Acceptance criteria | The eight attacks in §11.3 become tests, plus: client-asserted `subject_member_type='adult'` must fail; a cross-household child subject must fail |

**LOCAL/CLOUD SEMANTIC DIFFERENCE (NHR-01).** Rule 2 tightens Build 3. Locally, `findIntegrityProblems` permits `subjectMemberId` to name **any** member including the adult (`memberIds = {user.id} ∪ childIds`, `src/domain/state.ts:410`). The cloud permits **children only**.

*Verified impact on real data: none.* Extraction found **no production writer** of `subjectMemberId` — the only non-null assignments are in `src/data/seed/demoHousehold.ts` (which never syncs, B4-P0-010) and `createEvent`/`createTask` default it to `null`. `KidsOverview.tsx` only reads it. So no real Build 3 household can hold an adult-subject row, and claim cannot be blocked by one.

**Local-v3 reconciliation required:** `findIntegrityProblems` must narrow `checkSubject` so a non-null `subjectMemberId` must be a child, matching the cloud. **Not implemented now.**

**FUTURE ACTIVATION DEPENDENCY**

```
B4-P0-066  ->  child-reference archived-target validation
```

Any future implementation that activates B4-P0-066 (child/system/meal removal semantics) **must also activate** the rule that new child references cannot target an archived child. A future migration that introduces archival or removal state **without** that validation is incomplete. Existing historical references must survive archival; archival must not destroy them. This dependency is design metadata and **does not approve B4-P0-066 now**.

### NHR-02 — privileges and RLS defense in depth

**RESOLVED BY OWNER**

| | |
|---|---|
| Original status | **P2 OPEN** |
| Original finding | `authenticated` keeps the TABLES default, so a forgotten future table relied on `ensure_rls` — and `rls_auto_enable()` swallows its own exceptions (`EXCEPTION WHEN OTHERS THEN RAISE LOG`) |
| Owner resolution | **APPROVED.** Secure default privileges; no automatic `anon` or `authenticated` table access; no accidental `PUBLIC` EXECUTE; explicit `service_role` disposition; per-object grants; explicit `ENABLE ROW LEVEL SECURITY` in every migration; narrowly re-granted helper permissions; fingerprint privilege dimensions as standing drift detectors |
| Resulting status | **CLOSED** |
| Effective date | 2026-09-19 |
| **Platform classification** | `public.rls_auto_enable()` and the `ensure_rls` event trigger are **PLATFORM-MANAGED / INFORMATIONAL**, on repo-owned evidence: `phase1-staging-fingerprint.json` scores `info.event_triggers` with `"class": "PLATFORM-MANAGED/INFO"`, and `phase1-baseline-review.md` lists the other two functions as `app-owned` while placing `rls_auto_enable` under *"Platform/informational machinery"*. **Her Keys therefore does not rewrite, replace or depend on it** |
| Her Keys fail-closed layer | `private.assert_app_schema_secured()`, called at the end of every application migration. **Event:** none — it is an ordinary function call, not an event trigger. **Schemas governed:** `public` only. **Predicate:** every `relkind='r'` in `public`. **Checks:** RLS enabled; at least one policy exists; `anon` holds no table privilege. **Failure:** `RAISE EXCEPTION`, which aborts the creating transaction. **Non-app DDL:** cannot be affected — the function never inspects `auth`, `storage`, `extensions`, temp or any platform schema, and runs only when a migration calls it |
| Why not an event trigger | An application event trigger on the same DDL events could not be justified as portable or safe from existing repo evidence: it would sit beside platform machinery on `ddl_command_end`, would need to exclude every platform object by predicate, and nothing in SD4 can validate that without executing it. Inventing one would claim ownership of a platform concern |
| Explicit RLS | All **16** tables carry `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (extracted: 16 statements / 16 `CREATE TABLE`). Automation does not replace explicit DDL |
| Residual | **NHR-08 (P3)** — the assertion fires only when called. Layers 1 and 3 remain independent |
| Affected SD4 IDs | SD4-026 (already OWNER-APPROVED), SD4-027, SD4-039, SD4-040 |
| Affected B4-P0 IDs | B4-P0-039, **B4-P0-040**, B4-P0-041 |
| Verification | **DESIGN REVIEW ONLY.** No empirical runtime proof claimed. Test D |

### NHR-05 — GUCs may not be a security boundary

**RESOLVED BY OWNER**

| | |
|---|---|
| Original status | **P2 OPEN** |
| Original finding | `herkeys.claim` and `herkeys.purge` gated privileged behavior, resting on the unproven claim that a client cannot set a custom GUC |
| Owner resolution | **APPROVED.** No security-sensitive logic may depend on a `herkeys.*` GUC |
| Resulting status | **CLOSED** |
| Effective date | 2026-09-19 |
| Mechanism | Both call sites replaced by `private.is_trusted_server_context()`, which tests `current_user = 'postgres'` — true only inside a `SECURITY DEFINER` function owned by `postgres`, and unreachable by anything a client can set on its own session. **This is a prevention property:** there is no value a client can send, on any connection it can open, that makes the predicate true |
| GUC audit result | **Zero security-relevant `herkeys.*` call sites remain.** See §10.6 |
| Server-owned columns | Enforced by **column-level privilege** (prevention), not trigger-overwrite (correction). `logical_day` and `timezone_at_decision` are now granted on **neither** INSERT nor UPDATE — the live path does not need them and the claim path is a definer RPC that bypasses column grants entirely |
| Trusted RPC contract | Fully specified in the SQL draft §10: name, arguments, security mode, `search_path`, PUBLIC/`anon`/`authenticated` grant posture, caller identity validation, account-ownership validation, idempotency, server-written fields, refusals, retry semantics and cross-account denial |
| Dependency on SD4-034 | The trusted claim/backfill path depends on the `account_claims` model. **NHR-05 does not approve SD4-022/SD4-034.** If that model is later **revised**, this RPC contract requires focused re-review. If it is **deferred**, claim/backfill remains possible but loses crash-recovery of the id map: a device that crashes between server commit and local write would have to rebuild its map by replaying `local_id` pushes through SD4-005 idempotency, which is slower and leaves no server-side record of the claim. It does **not** become impossible, so SD4-034 does not become implementation-blocking on that ground alone |
| Affected SD4 IDs | SD4-017, SD4-020, SD4-022, SD4-030, SD4-040 |
| Affected B4-P0 IDs | B4-P0-030, B4-P0-033, B4-P0-034, B4-P0-049, B4-P0-061 |
| Residual | **NHR-06 (P3)** — the `current_user = 'postgres'` assumption needs Test D |

### HR-05 — display name

**RESOLVED BY OWNER**

| | |
|---|---|
| Original status | **P2 OPEN** |
| Original finding | `household_members.display_name` was `NOT NULL` but real users have no display name and no screen collects one |
| Owner resolution | **APPROVED.** `display_name` may be NULL. **No fabricated placeholder is persisted** |
| Resulting status | **CLOSED** |
| Effective date | 2026-09-19 |
| Mechanism | `household_members.display_name` becomes nullable, with `CHECK (member_type <> 'child' OR display_name IS NOT NULL)` — the NOT NULL obligation is kept exactly where the data supports it, since a child is always created with a non-blank name locally (`ChildSchema.displayName`) |
| Normalization contract | Identical for provider-supplied and user-entered names: **Unicode NFC**; trim; collapse internal whitespace runs to a single space; reject control characters; **empty after normalization ⇒ NULL**; **length cap 80** — chosen now, matching the existing `char_length <= 80` bound on both tables |
| Enforced by the database | Already-trimmed, no control characters, no internal whitespace runs, length 1..80 — on both `profiles` and `household_members` |
| Not enforceable in SQL | NFC normalization → client/RPC obligation (**NHR-07, P3**) |
| Semantic content | A one-character, punctuation-only or emoji-only name is **stored honestly**. The database does not police semantic content; the UI decides how to render it |
| UI fallback | `"You"` is presentation-only and is never synced or stored unless the user actually typed it (**NHR-09, P3**) |
| Affected SD4 IDs | SD4-029, SD4-040 |
| Affected B4-P0 IDs | B4-P0-016 (Apple first-authorization name), B4-P0-029, B4-P0-030 |


---

## 13. Register accounting correction

Recorded per owner direction. Nothing is erased.

| | |
|---|---|
| **Earlier reported counts** (SD4 completion report, prior pass) | 41 total · 8 INHERITED-APPROVED · 27 PROPOSED · 4 PENDING-OWNER · 2 DEFERRED |
| **Actual as-found counts** (verified against the artifact this pass) | **42 total · 6 INHERITED-APPROVED · 31 PROPOSED · 3 PENDING-OWNER · 2 DEFERRED** |

**The earlier 41 / 8 / 27 / 4 / 2 summary was incorrect.** The artifact was never in that state. Three distinct errors:

1. **`SD4-009a` explains the row count.** The register runs `SD4-001`…`SD4-041` — 41 *numbered IDs* — plus `SD4-009a`, a 42nd *row* carrying the `household_members` sub-decision. The prior report counted numbered IDs and described them as rows.
2. **INHERITED-APPROVED was miscounted** as 8; the actual membership is six: SD4-031, 032, 033, 035, 036, 038.
3. **PROPOSED followed from both errors** and was reported as 27 against an actual 31.

**The `SD4-017` inconsistency was a genuine artifact defect, not a reporting error.** The HR-03 disposition recorded `**PENDING-OWNER** (SD4-017)` and the status table asserted "4 P1 open, all PENDING-OWNER", while the `SD4-017` register row read `PROPOSED`. The same decision carried two different statuses in the same document. Per owner direction the HR-03 disposition is authoritative as the pre-owner-resolution state.

| | |
|---|---|
| **Corrected pre-owner counts** | **42 total · 6 INHERITED-APPROVED · 30 PROPOSED · 4 PENDING-OWNER · 2 DEFERRED** |
| Pre-owner PENDING-OWNER membership | SD4-009a → HR-01 · SD4-017 → HR-03 · SD4-026 → HR-02 · SD4-041 → HR-04 — an exact 1:1 mapping |
| **Final post-owner-resolution counts** | **42 total · 6 INHERITED-APPROVED · 4 OWNER-APPROVED · 30 PROPOSED · 2 DEFERRED · 0 PENDING-OWNER** |

**Status transitions applied this pass:**

| SD4 ID | Finding | From | To |
|---|---|---|---|
| SD4-009a | HR-01 | PENDING-OWNER | **OWNER-APPROVED** (2026-09-19) |
| SD4-026 | HR-02 | PENDING-OWNER | **OWNER-APPROVED** (2026-09-19) |
| SD4-017 | HR-03 | PROPOSED → *corrected to* PENDING-OWNER | **OWNER-APPROVED** (2026-09-19) |
| SD4-041 | HR-04 | PENDING-OWNER | **OWNER-APPROVED** (2026-09-19) |

`OWNER-APPROVED` is deliberately distinct from `INHERITED-APPROVED`: these four were approved **during SD4**, not inherited from Phase 0.

**No substantive design changed during the bookkeeping correction itself.** The SD4-017 status fix moved a label to match a disposition that already existed in the same document. All design changes in this pass flow from the four owner decisions.

### 13.1 Correction 3 — the dependency-count defect and the tier-classification conflict (2026-09-19)

**The defect.** A prior prose report claimed *"9 implementation-blocking decisions."* Extraction found no support for it anywhere in the artifacts; the string "nine" appears in no SD4 file. The `Dep?` column actually held three distinct values:

| Raw `Dep?` value | Count |
|---|---|
| `**YES — blocking**` | 4 |
| `**YES**` | 23 |
| `No — …` (three different phrasings) | 3 |
| **Total PROPOSED** | **30** |

Two separate faults: the "nine" was written from recollection rather than extracted, **and** the column itself was ambiguous — two different markers in a column whose own definition made both blocking. Neither reading yields nine.

**The corrected authorization fact:** **27 implementation-required PROPOSED decisions**, composed of **T1 = 7** and **T2 = 20**, with **T3 = 3** non-blocking. 7 + 20 + 3 = 30.

**The conflict.** A boundary sweep of all non-T1 proposals surfaced three additional candidates beyond the original four (`SD4-001`, `SD4-004`, `SD4-007`, `SD4-012`): **SD4-006** (strong), **SD4-002** and **SD4-008** (moderate). Rather than re-tier them, the conflict was returned to the owner.

**Agent recommendation:** Option C — adopt SD4-006 only, leaving SD4-002 in T2 because it preserves the baseline and SD4-008 in T2 because its manifest is verifiably complete against frozen Build 3 schemas. Proposed T1 = 5.

**Owner selection: Option B** — adopt all three. T1 = 7. The owner rationale, which supersedes the recommendation:

- **SD4-002 is T1** because `profiles.id = auth.users.id` establishes the account identity topology. Preserving the current baseline does not make it safely retrofittable; *"status quo today"* and *"cheap to reverse after data"* are different questions.
- **SD4-006 is T1** because it and SD4-004 are the behavioral and structural halves of one durable identity-mapping contract, now recorded as **IDENTITY-MAPPING-CONTRACT-01** (§14.3).
- **SD4-008 is T1** because verified-complete lowers the *probability* of error, not the *cost* of correction. Repair would require rewriting records the design declares immutable.

The governing principle the owner set: **probability of later change is irrelevant, and whether implementation can technically begin is irrelevant.** The question is what correction costs if the decision is wrong after durable data exists.

**Final tier counts, mechanically extracted from the artifact after relabelling:** T1 = 7, T2 = 20, T3 = 3, total 30.

**This was a tier-classification decision only. It approved no substantive proposal.** All 30 decisions in the package remain `PROPOSED`; the register status counts are unchanged at 42 / 6 / 4 / 30 / 2. Tier metadata is orthogonal to decision status, and no new SD4 decision ID was created for the tier model or for the Option B resolution.

---

## 14. SD4 implementation authorization package

### 14.1 Authorization tier model

Tier is **governance metadata about a decision, not a decision status.** It is orthogonal to `PROPOSED` / `OWNER-APPROVED` / `INHERITED-APPROVED` / `DEFERRED`, and it creates no new SD4 decision IDs.

| Tier | Meaning |
|---|---|
| **T1 — PRE-DATA STRUCTURAL** | If this design choice is wrong after durable account-backed data exists, correcting it requires foundational identity, namespace, reference, key, or sync-protocol migration |
| **T2 — IMPLEMENTATION-REQUIRED** | Schema implementation requires the decision to be settled, but a later correction is retrofittable without foundational migration |
| **T3 — NON-BLOCKING** | Not required for schema implementation |

**T1 is *not* determined by** whether the proposal preserves the current baseline, whether implementation could technically begin without settling it, or how likely a later change appears. The only question is: *what happens if this decision is wrong after real data exists?*

**Tier changes sequencing and the level of individual owner attention. It does not change gate membership.** All **27** T1 + T2 decisions require explicit owner disposition before schema implementation is authorized. **T2 does not mean optional. T1 classification does not mean approved. Presence in the SQL draft does not mean approved.**

### 14.2 T1 justification — auditable without the conversation

Owner-classified 2026-09-19 (Option B). Each entry records the proposal source, the criterion triggered, and why correction after durable data would be foundational.

| ID | Verbatim proposal (source: `BUILD4_SD4_CLOUD_SCHEMA.md` §2 register) | Criterion triggered | Irreversibility rationale |
|---|---|---|---|
| SD4-001 | *"Cloud primary keys become native PostgreSQL `uuid`, server-generated by `DEFAULT gen_random_uuid()`. Not server-generated TEXT."* (L75) | **primary-key re-keying** | The physical key type of all 16 tables. Correcting it after rows exist means re-keying every primary key and all 26 foreign keys, including the five composite `(id, household_id)` edges |
| SD4-002 | *"`profiles.id` stays the Supabase Auth user id — a shared primary key with `auth.users(id) ON DELETE CASCADE`. No surrogate account id and no separate account table."* (L76) | **identity rewriting / primary-key re-keying** | Establishes the account identity topology. Introducing a surrogate account key later means account identity migration plus migration of six dependent foreign keys and reconciliation of existing ownership references. **Preserving the current baseline does not make it cheap to reverse** — "status quo today" and "cheap to reverse after data" are different questions |
| SD4-004 | *"`local_id text NOT NULL`, same id pattern as the baseline. Uniqueness boundary follows the ownership boundary: `(household_id, local_id)` on household-scoped tables, `(household_id, profile_id, local_id)` on owner-private tables…"* (L78) | **local/cloud ID namespace migration** | The structural half of the durable identity-mapping contract, across 11 tables. Changing the boundary after devices have persisted mappings invalidates every idempotency key derived from it. **Atomic with SD4-006** |
| SD4-006 | *"A local id is device-relative, not a global handle. On pull, a device adopts the origin local id when it is free and mints a fresh local id when it is not, recording the mapping either way."* (L80) | **local/cloud ID namespace migration** | The behavioral half of the same contract: what happens when a second device meets an occupied `local_id`, and how a fresh mapping is minted. Changing it after devices have persisted mappings requires map reconstruction, collision reconciliation, cross-device sync migration, and potentially local identifier rewriting — which **B4-P0-005 forbids**. **Atomic with SD4-004** |
| SD4-007 | *"Soft references are stored in the cloud as cloud uuids, not as local ids."* (L81) | **durable reference migration** | Decides the namespace of every durable soft reference. Reversal makes stored reference values meaningless rather than merely reshaped, and Build 3 local integrity rejects the alternative outright |
| SD4-008 | *"A closed reference manifest for JSONB payloads: exactly four paths carry references (`reason.windowBeforeEventId`, `reason.windowAfterEventId`, `reason.recommendedTaskId`, `reason.consideredTaskId`), plus the `target_id` column."* (L82) | **reinterpretation/rewrite of immutable durable references** | Determines which values inside the **immutable** action ledger are durable references requiring translation. The manifest is verified complete against the frozen Build 3 action schemas, which lowers the probability of error but **not the cost of correction**: repair would require reinterpreting historical JSONB, reference-namespace migration, and rewriting records SD4-020 declares immutable. Future schema versions may add reference paths *prospectively* under SD4-025 versioning; that does not change the classification of the current frozen manifest |
| SD4-012 | *"The global change cursor is `public.change_log` keyed on `committed_xid xid8`, read behind a `pg_snapshot_xmin` barrier."* (L87) | **cursor-protocol migration** | The sync change-discovery protocol. Every device persists a cursor in this coordinate system; changing the coordinate invalidates all of them and requires a full-resync migration across the fleet |

### 14.3 Atomic contract groups

A dependency edge does **not** by itself require identical owner disposition. An atomic group is used only where splitting the decisions would produce an internally incoherent schema or protocol.

| Group | Members | Why atomic |
|---|---|---|
| **IDENTITY-MAPPING-CONTRACT-01** | **SD4-004**, **SD4-006** | The structural and behavioral halves of the durable `local_id`/`cloud_id` mapping contract. Approving one while deferring or incompatibly revising the other is incoherent: a uniqueness boundary with no collision semantics, or collision semantics with no boundary, is not an implementable contract. **If an owner disposition would split this pair, STOP and return it to the owner** |

All other dependency relationships are assessed individually. Atomicity is not inferred from dependency.

### 14.4 Boundary sweep — non-T1 proposals reviewed under the refined criterion

Every non-T1 PROPOSED decision was reviewed against the refined rule (probability irrelevant; "can implementation begin" irrelevant). The five closest calls are recorded so the classification is auditable rather than asserted.

| ID | Adjacent to | T1 qualifies | Why retrofittable |
|---|---|---|---|
| SD4-005 | `local_id`, idempotency | **NO** | Adds no durable structure of its own. The constraint it uses as the `ON CONFLICT` target belongs to SD4-004, which is already T1; changing SD4-005 alone changes the form of an SQL statement, not a stored namespace |
| SD4-018 | reference representation | **NO** | A *shape* change within one namespace, not a namespace change: both the typed FK columns and any alternative hold cloud uuids. Migration between the two is a mechanical, lossless, single-table transform with referential integrity intact throughout |
| SD4-023 | account identity | **NO** | Correction cost is **conditional**, unlike every T1 entry whose cost is unconditional. Relaxing the constraint is trivial; the expensive direction (adding it once duplicates exist) requires a household merge, but duplicates are structurally prevented by a separate approved mechanism — households are creatable only through the bootstrap/claim RPC (B4-P0-029, B4-P0-039) |
| SD4-025 | immutable ledger | **NO** | It is the **mitigation**, not the risk. `payload_version` is precisely the mechanism that makes future payload changes prospective, so correction applies to new rows and never requires rewriting existing immutable rows |
| SD4-037 | cloud mapping | **NO** | `origin_device_id` is provenance evidence consumed by SD4-006, not a stored namespace. If a device registry were later required, it is an additive table backfillable from the existing column values |

The remaining 18 non-T1 proposals are policies, grants, helper functions, CHECK constraints, nullable columns, status values and FK actions — all alterable in place without identity, namespace, reference, key or sync-protocol migration.


### 14.5 PART A — T1 PRE-DATA STRUCTURAL (7 decisions)

#### SD4-001 — Cloud PK type

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 75):

> **Cloud primary keys become native PostgreSQL `uuid`**, server-generated by `DEFAULT gen_random_uuid()`. Not server-generated TEXT. Rationale in section 4.1.

| Field | Value |
|---|---|
| Authorization tier | T1 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-007 (PENDING) |
| Owner-facing summary | Cloud PK type |
| Affected objects | All 16 tables |
| B4-P0 mapping | B4-P0-007 |
| Depends on | NONE |
| Atomic contract group | — |
| **Irreversibility criterion** | **primary-key re-keying** |
| **Why it must precede durable data** | Every primary key and all 26 foreign keys, including five composite `(id, household_id)` edges, change type. Free at zero rows; a fleet-wide data migration afterwards. |
| Consequence of DEFER | Implementation proceeds on the global `text` keys of the baseline, keeping the `cat-kids` collision class alive permanently. |
| Risk / tradeoff | Breaking change to every PK and FK; only free while both databases are empty. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-002 — profiles / Auth relationship

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 76):

> **`profiles.id` stays the Supabase Auth user id** — a shared primary key with `auth.users(id) ON DELETE CASCADE`. No surrogate account id and no separate account table.

| Field | Value |
|---|---|
| Authorization tier | T1 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | CONSISTENT B4-P0-012 |
| Owner-facing summary | profiles / Auth relationship |
| Affected objects | `profiles` |
| B4-P0 mapping | B4-P0-012 |
| Depends on | SD4-001 |
| Atomic contract group | — |
| **Irreversibility criterion** | **identity rewriting / primary-key re-keying** |
| **Why it must precede durable data** | Establishes the account identity topology. Introducing a surrogate account key later means account identity migration plus six dependent FKs. Preserving the baseline does not make it cheap to reverse. |
| Consequence of DEFER | Ambiguity between account and profile persists, and a surrogate key could be introduced later at far higher cost. |
| Risk / tradeoff | Very low — it preserves the existing baseline arrangement. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-004 — local_id type and uniqueness boundaries

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 78):

> **`local_id text NOT NULL`**, same id pattern as the baseline. Uniqueness boundary follows the ownership boundary: `(household_id, local_id)` on household-scoped tables, `(household_id, profile_id, local_id)` on owner-private tables. Not applicable to `onboarding_state` and `discovery_answers` (no local identity). `households.local_id` is deliberately not unique.

| Field | Value |
|---|---|
| Authorization tier | T1 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-008 (PENDING) |
| Owner-facing summary | local_id type and uniqueness boundaries |
| Affected objects | 11 tables |
| B4-P0 mapping | B4-P0-008 |
| Depends on | SD4-001 |
| Atomic contract group | **IDENTITY-MAPPING-CONTRACT-01** |
| **Irreversibility criterion** | **local/cloud ID namespace migration** |
| **Why it must precede durable data** | The structural half of the durable identity-mapping contract across 11 tables. Changing the boundary after devices persist mappings invalidates every idempotency key derived from it. |
| Consequence of DEFER | No idempotency key exists; retries duplicate rows. |
| Risk / tradeoff | The boundary choice is load-bearing for idempotency and cannot be widened later without dedup. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-006 — Cross-device local_id collision semantics

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 80):

> **A local id is device-relative, not a global handle.** On pull, a device adopts the origin local id when it is free and mints a fresh local id when it is not, recording the mapping either way. Existing local ids are never rewritten.

| Field | Value |
|---|---|
| Authorization tier | T1 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-005 |
| Owner-facing summary | Cross-device local_id collision semantics |
| Affected objects | 11 tables, sync RPCs |
| B4-P0 mapping | B4-P0-005, B4-P0-006 |
| Depends on | SD4-004 |
| Atomic contract group | **IDENTITY-MAPPING-CONTRACT-01** |
| **Irreversibility criterion** | **local/cloud ID namespace migration** |
| **Why it must precede durable data** | The behavioral half of the same contract. Changing it after devices persist mappings requires map reconstruction, collision reconciliation and cross-device sync migration, and the only clean repair — rewriting local ids — is forbidden by B4-P0-005. |
| Consequence of DEFER | A same-`local_id` collision silently merges two different entities — data loss. |
| Risk / tradeoff | `createId` resets its counter per process, so collision is reachable rather than theoretical. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-007 — Soft references are cloud uuids

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 81):

> **Soft references are stored in the cloud as cloud uuids, not as local ids.** The Phase 0 sketch proposed keeping `action_records.target_id`, One Move `target_id` and ids inside action payloads in the local namespace. That is unsafe the moment a second device exists (SD4-006) and is rejected by Build 3 local integrity checking.

| Field | Value |
|---|---|
| Authorization tier | T1 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | **CONTRADICTS the B4-P0-009 proposal** (B4-P0-009 is PENDING, not approved — not a P1) |
| Owner-facing summary | Soft references are cloud uuids |
| Affected objects | `action_records`, `one_move_records` |
| B4-P0 mapping | B4-P0-009 |
| Depends on | SD4-001, SD4-006 |
| Atomic contract group | — |
| **Irreversibility criterion** | **durable reference migration** |
| **Why it must precede durable data** | Decides the namespace of every durable soft reference. Reversal makes stored values meaningless rather than merely reshaped. |
| Consequence of DEFER | Local ids stored in the cloud become ambiguous the moment a second device exists, and Build 3 local integrity rejects the pulled rows, stalling sync. |
| Risk / tradeoff | Requires a translation layer on push and pull. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-008 — Closed JSONB reference manifest

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 82):

> **A closed reference manifest** for JSONB payloads: exactly four paths carry references (`reason.windowBeforeEventId`, `reason.windowAfterEventId`, `reason.recommendedTaskId`, `reason.consideredTaskId`), plus the `target_id` column. `before_state` and `after_state` contain none. The sync engine translates that manifest in both directions; a CHECK enforces uuid shape.

| Field | Value |
|---|---|
| Authorization tier | T1 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-009 |
| Owner-facing summary | Closed JSONB reference manifest |
| Affected objects | `action_records` |
| B4-P0 mapping | B4-P0-009 |
| Depends on | SD4-007, SD4-020, SD4-025 |
| Atomic contract group | — |
| **Irreversibility criterion** | **reinterpretation/rewrite of immutable durable references** |
| **Why it must precede durable data** | Determines which values inside the immutable ledger are durable references. Repair after data would require rewriting records SD4-020 declares immutable. |
| Consequence of DEFER | Untranslated local ids are stranded inside immutable ledger rows. |
| Risk / tradeoff | Verified complete against the frozen Build 3 action schemas, which lowers the probability of error but not the cost. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-012 — Global change cursor

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 87):

> **The global change cursor is `public.change_log` keyed on `committed_xid xid8`, read behind a `pg_snapshot_xmin` barrier.** It is a pointer log, never content. The per-row `revision` is not and never becomes the cursor. Proof in section 6.3.

| Field | Value |
|---|---|
| Authorization tier | T1 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-026 (PENDING) |
| Owner-facing summary | Global change cursor |
| Affected objects | `change_log`, 12 triggers |
| B4-P0 mapping | B4-P0-026 |
| Depends on | NONE |
| Atomic contract group | — |
| **Irreversibility criterion** | **cursor-protocol migration** |
| **Why it must precede durable data** | Every device persists a cursor in this coordinate system; changing the coordinate invalidates all of them and forces a fleet-wide full resync. |
| Consequence of DEFER | No correct incremental pull exists; `updated_at` and `BIGSERIAL` both silently lose writes. |
| Risk / tradeoff | Adds one write per mutation (HR-09) and a retention job (HR-08). |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

### 14.6 PART B — T2 IMPLEMENTATION-REQUIRED (20 decisions)

#### SD4-003 — No client profile INSERT

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 77):

> **The client cannot INSERT a profile.** `profiles_insert_own` is removed; a profile exists only because the bootstrap transaction created it alongside household, owner membership, starter categories and onboarding state.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-029 |
| Owner-facing summary | No client profile INSERT |
| Affected objects | `profiles` |
| B4-P0 mapping | B4-P0-029 |
| Depends on | SD4-002 |
| Atomic contract group | — |
| Reversibility assessment | Re-adding a policy is a one-line migration. |
| **Why it does NOT satisfy T1** | Touches no identity, namespace, reference, key or sync protocol. |
| Consequence of DEFER | A client can create a profile with no household, membership or categories — the orphan bootstrap exists to prevent. |
| Risk / tradeoff | None material. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-005 — Row-upload idempotency

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 79):

> **Row-upload idempotency is the `local_id` unique constraint.** Upload is `INSERT ... ON CONFLICT (<local_id key>) DO UPDATE`, so a retry after a lost response can never create a duplicate.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-006 |
| Owner-facing summary | Row-upload idempotency |
| Affected objects | 11 tables |
| B4-P0 mapping | B4-P0-006 |
| Depends on | SD4-004 |
| Atomic contract group | — |
| Reversibility assessment | Changing the `ON CONFLICT` target is a statement change, not a schema migration. |
| **Why it does NOT satisfy T1** | Adds no durable structure of its own; the constraint it uses belongs to SD4-004, which is already T1. |
| Consequence of DEFER | Retries after a lost response create duplicates. |
| Risk / tradeoff | Correctness depends on the boundary of SD4-004 being right. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-009 — owner_profile_id placement rule

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 83):

> **`owner_profile_id` placement rule:** present and NOT NULL exactly when `scope IN ('personal','professional','coparent-shared')`; NULL for `household` and `child`; enforced by CHECK. Placed on the five content tables (`household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries`).

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-038 |
| Owner-facing summary | owner_profile_id placement rule |
| Affected objects | 5 content tables |
| B4-P0 mapping | B4-P0-038 |
| Depends on | SD4-002 |
| Atomic contract group | — |
| Reversibility assessment | Backfill is derivable — Build 4 has exactly one adult per household. |
| **Why it does NOT satisfy T1** | A nullable column plus a CHECK; correcting it is an ALTER and an UPDATE. |
| Consequence of DEFER | Scope-aware RLS has no ownership column to test; private rows cannot be distinguished from shared ones. |
| Risk / tradeoff | Adds a nullable column and a CHECK to five tables. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-010 — Server-owned revision

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 85):

> **`revision` is server-owned.** The existing `set_row_updated_at()` trigger keeps its behavior unchanged; server ownership is additionally enforced by withholding the column-level INSERT and UPDATE privilege from `authenticated`.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | CONSISTENT B4-P0-020 |
| Owner-facing summary | Server-owned revision |
| Affected objects | 13 tables |
| B4-P0 mapping | B4-P0-020 |
| Depends on | NONE |
| Atomic contract group | — |
| Reversibility assessment | Grants and trigger behavior are alterable in place. |
| **Why it does NOT satisfy T1** | No stored namespace changes. |
| Consequence of DEFER | A client can assert its own revision, defeating optimistic concurrency. |
| Risk / tradeoff | None material. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-011 — Origin vs server timestamps

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 86):

> **Server row lifecycle and local domain time are separate columns.** `created_at` / `updated_at` stay server-owned. New nullable `origin_created_at` / `origin_updated_at` carry the local domain timestamps verbatim, including their nullness. Nothing defaults them.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-020 |
| Owner-facing summary | Origin vs server timestamps |
| Affected objects | 7 tables |
| B4-P0 mapping | B4-P0-020 |
| Depends on | NONE |
| Atomic contract group | — |
| Reversibility assessment | Adding nullable columns later is additive; NULL remains the honest value. |
| **Why it does NOT satisfy T1** | Timestamp semantics are not identity, namespace, reference, key or sync protocol. |
| Consequence of DEFER | Local domain time is conflated with server row time, fabricating history for rows whose timestamps are genuinely unknown. |
| Risk / tradeoff | Two extra nullable columns on seven tables. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-014 — Tombstone realization per entity

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 89):

> **Tombstone realization per entity.** Existing status values serve events, tasks, needs-me and categories. `discovery_records` gains `deleted_at`. One Move gains the status value `cleared` — not a `deleted_at` column — because its row is uniquely keyed by logical day and is revived in place.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-027 (PENDING) |
| Owner-facing summary | Tombstone realization per entity |
| Affected objects | `discovery_records`, `one_move_records` |
| B4-P0 mapping | B4-P0-024, B4-P0-027 |
| Depends on | SD4-016 |
| Atomic contract group | — |
| Reversibility assessment | A column or status value can be added and backfilled later. |
| **Why it does NOT satisfy T1** | No hard deletes exist to recover, since the design forbids them. |
| Consequence of DEFER | Build 3 physically deletes One Move records and clears discovery; both are invisible to an offline second device. |
| Risk / tradeoff | Adds one column and one status value. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-015 — Conflict evidence is local-only

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 90):

> **Conflict evidence lives locally only.** No cloud conflict table. `sync_push` returns `{ status: stale, cloud_id, current_revision, current_row }` and the device keeps the losing intent. Rationale: the evidence is unaccepted client intent, and uploading it would create a retention and child-data surface for data the server has explicitly rejected.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-028 (PENDING) |
| Owner-facing summary | Conflict evidence is local-only |
| Affected objects | `sync_push` contract |
| B4-P0 mapping | B4-P0-028 |
| Depends on | SD4-012 |
| Atomic contract group | — |
| Reversibility assessment | A cloud conflict table could be added later, additively. |
| **Why it does NOT satisfy T1** | Produces no cloud object at all. |
| Consequence of DEFER | Unaccepted client intent would need a cloud home, creating a retention and child-data surface for data the server rejected. |
| Risk / tradeoff | No cloud review surface; advanced conflict UI is already a non-goal. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-016 — One Move state machine

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 91):

> **One Move state machine** with four states and an explicit legal-transition set (section 8.1).

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-059 (PENDING) |
| Owner-facing summary | One Move state machine |
| Affected objects | `one_move_records` |
| B4-P0 mapping | B4-P0-058, B4-P0-059 |
| Depends on | SD4-014, SD4-018 |
| Atomic contract group | — |
| Reversibility assessment | CHECK constraints widen and statuses backfill. |
| **Why it does NOT satisfy T1** | Status values are not a namespace. |
| Consequence of DEFER | No legal-transition set; a replaced or cleared record has no representation. |
| Risk / tradeoff | Adds a fourth status value and CHECK constraints. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-018 — Typed One Move targets

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 93):

> **One Move cloud targets are typed, not polymorphic**: `target_task_id` and `target_needs_me_id`, real foreign keys, exactly one set. `target_type = 'catalog'` is rejected by CHECK, because the catalog exists only in demo households.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | CONSISTENT B4-P0-010 |
| Owner-facing summary | Typed One Move targets |
| Affected objects | `one_move_records` |
| B4-P0 mapping | B4-P0-010, B4-P0-059 |
| Depends on | SD4-001, SD4-016 |
| Atomic contract group | — |
| Reversibility assessment | A shape change within one namespace: both forms hold cloud uuids, and migration between them is mechanical and lossless. |
| **Why it does NOT satisfy T1** | Not a namespace change — referential integrity is intact throughout. |
| Consequence of DEFER | A polymorphic `target_id` with no FK leaves One Move targets unverifiable, and `catalog` lets demo artifacts into the cloud. |
| Risk / tradeoff | Two nullable FK columns instead of one text column. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-019 — events.source narrowed to user

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 94):

> **`events.source` is narrowed to `'user'`.** The baseline still permits `'demo'`. Demo never syncs, so the cloud must be unable to hold a demo row at all — fail closed at the database, not by client filtering.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | CONSISTENT B4-P0-010 |
| Owner-facing summary | events.source narrowed to user |
| Affected objects | `events` |
| B4-P0 mapping | B4-P0-010 |
| Depends on | NONE |
| Atomic contract group | — |
| Reversibility assessment | A CHECK widens in one statement. |
| **Why it does NOT satisfy T1** | A value-domain narrowing, not a structural one. |
| Consequence of DEFER | The cloud remains able to store a demo row, so B4-P0-010 depends on client filtering rather than the database. |
| Risk / tradeoff | None — no real row carries `source='demo'`. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-020 — Ledger immutability in three layers

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 95):

> **The action ledger is immutable in three layers**: no UPDATE or DELETE policy, `UPDATE`/`DELETE`/`TRUNCATE` revoked from `authenticated`, and a trigger that raises on UPDATE or DELETE — binding `service_role` and the table owner too. The only escape is the account-deletion purge, which must announce itself via a session setting.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | CONSISTENT B4-P0-039 |
| Owner-facing summary | Ledger immutability in three layers |
| Affected objects | `action_records` |
| B4-P0 mapping | B4-P0-039 |
| Depends on | SD4-030 |
| Atomic contract group | — |
| Reversibility assessment | Relaxing immutability is trivial; it is the direction that matters and it is cheap. |
| **Why it does NOT satisfy T1** | Correcting it never requires rewriting stored data. |
| Consequence of DEFER | History can be rewritten, including by a mistaken privileged script. |
| Risk / tradeoff | Requires an explicit escape for the deletion purge, now a role boundary rather than a GUC. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-022 — account_claims is required

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 97):

> **`account_claims` is required.** The deciding argument is crash recovery, not bookkeeping: row-level idempotency survives a retry but cannot rebuild the id map after a crash between server commit and local write. `UNIQUE (profile_id, claim_key)` plus a partial unique index on `status = 'complete'` give exactly-once.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-034 (PENDING) |
| Owner-facing summary | account_claims is required |
| Affected objects | `account_claims` |
| B4-P0 mapping | B4-P0-033, B4-P0-034 |
| Depends on | SD4-005 |
| Atomic contract group | — |
| Reversibility assessment | The table can be added later; the id map also lives on devices. |
| **Why it does NOT satisfy T1** | Additive table; no existing namespace or reference changes. |
| Consequence of DEFER | A device that crashes between server commit and local write cannot recover its id map from the server; it must rebuild by replaying `local_id` pushes. |
| Risk / tradeoff | One extra table and one extra round trip on claim. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-023 — One household per account

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 98):

> **One household per account, one owner per household**, enforced by two partial unique indexes on `household_members`. A duplicate cloud household becomes impossible rather than merely unlikely.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | CONSISTENT B4-P0-031 |
| Owner-facing summary | One household per account |
| Affected objects | `household_members` |
| B4-P0 mapping | B4-P0-031 |
| Depends on | SD4-002 |
| Atomic contract group | — |
| Reversibility assessment | Relaxing is trivial; the expensive direction is conditional on a state a separate approved mechanism prevents. |
| **Why it does NOT satisfy T1** | Correction cost is conditional, unlike every T1 entry whose cost is unconditional. Households are creatable only through the bootstrap/claim RPC. |
| Consequence of DEFER | Duplicate cloud households become possible if the RPC is ever wrong, and merging them is a B4-P0-069 non-goal. |
| Risk / tradeoff | If duplicates ever existed, adding the index would require a merge. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-024 — TEXT + CHECK over native enum

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 99):

> **TEXT + CHECK is kept; native enums are rejected.** Rationale in section 4.6.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | CONSISTENT with the baseline |
| Owner-facing summary | TEXT + CHECK over native enum |
| Affected objects | All enumerated columns |
| B4-P0 mapping | — |
| Depends on | NONE |
| Atomic contract group | — |
| Reversibility assessment | A CHECK is dropped and re-added inside an ordinary transaction. |
| **Why it does NOT satisfy T1** | A physical value-domain choice; identity and references are untouched. |
| Consequence of DEFER | Native enums would make the two narrowings this design performs materially harder and add a PostgREST type-mapping step. |
| Risk / tradeoff | No generated union type for the client; local Zod enums already provide it. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-025 — JSONB payload versioning and bounds

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 100):

> **JSONB payloads are versioned and bounded**: `payload_version`, a required `reason.code`, a 4 KiB size bound per column, an `action_type`/`approval`/`reason.code` agreement CHECK, and a uuid-shape CHECK on the four reference paths. The baseline accepted any JSON object.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-064 |
| Owner-facing summary | JSONB payload versioning and bounds |
| Affected objects | `action_records` |
| B4-P0 mapping | B4-P0-064 |
| Depends on | SD4-008 |
| Atomic contract group | — |
| Reversibility assessment | It is the mitigation, not the risk: versioning makes every future payload change prospective. |
| **Why it does NOT satisfy T1** | Correction applies to new rows and never requires rewriting existing immutable rows. |
| Consequence of DEFER | The ledger accepts any JSON object, unbounded and unversioned. |
| Risk / tradeoff | CHECKs must track the seven action types. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-027 — Private RLS helper functions

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 102):

> **Four private helper functions** for later RLS: `is_household_member(uuid)`, `is_household_owner(uuid)`, `can_access_scoped_row(uuid, text, uuid)`, `current_household_id()`. All STABLE, SECURITY DEFINER, `search_path` pinned to `''`, EXECUTE revoked from PUBLIC and `anon`, granted only to `authenticated`.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-039 |
| Owner-facing summary | Private RLS helper functions |
| Affected objects | `private.*` |
| B4-P0 mapping | B4-P0-039, B4-P0-040 |
| Depends on | SD4-001 |
| Atomic contract group | — |
| Reversibility assessment | Functions are replaceable in place. |
| **Why it does NOT satisfy T1** | No stored data depends on their signatures. |
| Consequence of DEFER | Policies must inline membership logic, recursing through the very table they guard. |
| Risk / tradeoff | Over-revoking their EXECUTE breaks every scoped read — the single largest over-revoke hazard, documented in §10.4. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-029 — Member FK CASCADE and adult CHECK

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 104):

> **`household_members.profile_id` becomes `ON DELETE CASCADE`** and a CHECK requires an adult member to have a profile. The baseline `SET NULL` leaves a profile-less adult member row behind after account deletion, which nothing forbids and no purge step names.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-019 |
| Owner-facing summary | Member FK CASCADE and adult CHECK |
| Affected objects | `household_members` |
| B4-P0 mapping | B4-P0-019 |
| Depends on | SD4-002 |
| Atomic contract group | — |
| Reversibility assessment | FK actions and CHECKs are ALTERable. |
| **Why it does NOT satisfy T1** | No re-keying; the referenced identity is unchanged. |
| Consequence of DEFER | A profile-less adult member row survives account deletion, forbidden by nothing and named by no purge step. |
| Risk / tradeoff | Changes an FK action the baseline set differently. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-037 — origin_device_id, no device registry

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 112):

> **`origin_device_id uuid` on client-originated rows, with no device registry table.** It is provenance evidence for collision diagnosis, not an access-control input.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | new |
| Owner-facing summary | origin_device_id, no device registry |
| Affected objects | 11 tables |
| B4-P0 mapping | — |
| Depends on | SD4-006 |
| Atomic contract group | — |
| Reversibility assessment | A registry table would be additive and backfillable from the existing column. |
| **Why it does NOT satisfy T1** | Provenance evidence, not a stored namespace. |
| Consequence of DEFER | Collisions cannot be diagnosed or distinguished from retries. |
| Risk / tradeoff | One nullable column on 11 tables. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-039 — Revoke TRUNCATE, REFERENCES, TRIGGER

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 114):

> **`TRUNCATE`, `REFERENCES` and `TRIGGER` are revoked from `authenticated` on every table**, and `DELETE` everywhere except `discovery_answers`. RLS does not govern TRUNCATE, so the client role should not hold a verb RLS cannot restrain.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-040 |
| Owner-facing summary | Revoke TRUNCATE, REFERENCES, TRIGGER |
| Affected objects | All tables |
| B4-P0 mapping | B4-P0-040 |
| Depends on | NONE |
| Atomic contract group | — |
| Reversibility assessment | Grants are re-issuable. |
| **Why it does NOT satisfy T1** | Privilege posture only. |
| Consequence of DEFER | `authenticated` retains verbs RLS cannot restrain — notably TRUNCATE. |
| Risk / tradeoff | None material. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-040 — Column-level client write privileges

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 115):

> **Client write privileges are column-level**, so `id`, `household_id`, `local_id`, `revision`, `created_at` and `updated_at` are unwritable by a client even if a policy were later widened by mistake.

| Field | Value |
|---|---|
| Authorization tier | T2 |
| Register status | **`OWNER-APPROVED`** 2026-09-19, content frozen at Commit D `95dff1f4` |
| Relationship | REFINES B4-P0-040 |
| Owner-facing summary | Column-level client write privileges |
| Affected objects | 11 tables |
| B4-P0 mapping | B4-P0-040 |
| Depends on | SD4-010, SD4-011 |
| Atomic contract group | — |
| Reversibility assessment | Grants are re-issuable. |
| **Why it does NOT satisfy T1** | Privilege posture only. |
| Consequence of DEFER | Server-owned fields rely on trigger correction rather than prevention, which the owner ruled the weaker property. |
| Risk / tradeoff | 20 column grants to maintain as the schema evolves. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

### 14.7 PART C — T3 NON-BLOCKING (3 decisions)

#### SD4-013 — Change-log retention horizon

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 88):

> **`change_log` retention is 90 days.** A cursor older than the horizon returns `cursor_expired` and the device performs a full resync rather than silently missing changes.

| Field | Value |
|---|---|
| Authorization tier | T3 |
| Register status | **`DEFERRED`** 2026-09-19 — no executable mechanism ships |
| Relationship | REFINES B4-P0-026 |
| Owner-facing summary | Change-log retention horizon |
| Affected objects | `change_log`, `prune_change_log` |
| B4-P0 mapping | B4-P0-026 |
| Depends on | SD4-012 |
| Atomic contract group | — |
| Mechanism present in SQL? | Signature and comment only — no DDL enforces 90 days |
| Consequence of non-adoption | A retention job must exist before volume matters (HR-08). |
| Consequence of DEFER | Without a horizon `change_log` grows without bound; the value itself is tunable at any time. |
| Risk / tradeoff | Too short forces avoidable full resyncs. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-021 — Action retention asymmetry

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 96):

> **Cloud action retention is unbounded in Build 4; local retention is a window.** Local trimming at the 10,000 cap is cache eviction and must never emit a cloud delete. Pull for `action_records` is bounded by recency, so a trimmed device does not re-download the whole ledger.

| Field | Value |
|---|---|
| Authorization tier | T3 |
| Register status | **`DEFERRED`** 2026-09-19 — no executable mechanism ships |
| Relationship | REFINES B4-P0-023 |
| Owner-facing summary | Action retention asymmetry |
| Affected objects | `action_records`, sync engine |
| B4-P0 mapping | B4-P0-023 |
| Depends on | SD4-020 |
| Atomic contract group | — |
| Mechanism present in SQL? | No — a sync-engine rule, not DDL |
| Consequence of non-adoption | Local trimming could emit cloud deletes; SD4-020 structurally prevents it regardless. |
| Consequence of DEFER | Local trimming at the 10,000 cap could emit cloud deletes and destroy the ledger. |
| Risk / tradeoff | A trimmed device re-pulls a bounded window. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

#### SD4-030 — Account-deletion purge order

**VERBATIM PROPOSAL** (source: `BUILD4_SD4_CLOUD_SCHEMA.md` section 2 decision register, line 105):

> **Mandatory purge order** for account deletion, driven by the RESTRICT edges (section 8.3). Deleting `auth.users` alone fails while ledger rows exist.

| Field | Value |
|---|---|
| Authorization tier | T3 |
| Register status | **`DEFERRED`** 2026-09-19 — no executable mechanism ships |
| Relationship | REFINES B4-P0-049 (PENDING) |
| Owner-facing summary | Account-deletion purge order |
| Affected objects | `private.purge_account` |
| B4-P0 mapping | B4-P0-048, B4-P0-049 |
| Depends on | SD4-020 |
| Atomic contract group | — |
| Mechanism present in SQL? | Signature only — `private.purge_account` has no body in the draft |
| Consequence of non-adoption | Account deletion (B4-P0-048) cannot be implemented correctly without it. Linked to B4-P0-049, PENDING under its own authority. |
| Consequence of DEFER | Deleting `auth.users` fails while ledger rows exist, because of the RESTRICT edge. |
| Risk / tradeoff | Deletion correctness depends on order being followed exactly. |
| **Recommendation** | **APPROVE** — *a recommendation is not authorization* |

### 14.8 Deferred decisions (2)

| ID | Title | Maps to an open P0/P1? | Can schema implementation begin without it? |
|---|---|---|---|
| SD4-028 | Child-data minimization | **No** — HR-06 is P2. No production create path for children exists, so a real household holds zero child rows | **Yes.** *Note:* NHR-01 / A2 widens the child-reference surface to three more tables, which the future privacy review must cover |
| SD4-034 | Production backup / PITR posture | **No** — HR-14 is P4, gated at Checkpoint #2 (B4-P0-052 / OD-2) | **Yes for Staging. NO for Production** — a destructive migration against a database with no PITR is exactly what Checkpoint #2 weighs |

**No P0 or P1 hides behind a DEFERRED item.**

### 14.11 Owner authorization record — 2026-09-19

**Content frozen at Commit D `95dff1f4ef43f696dc28db196f99e6b1ddeb5ff5`.** The owner adopted the exact proposal content at that SHA. This adoption does **not** pre-authorize later material edits under the same IDs.

| Disposition | Count | IDs |
|---|---|---|
| **OWNER-APPROVED — T1 PRE-DATA STRUCTURAL** | **7** | SD4-001, 002, 004, 006, 007, 008, 012 |
| **OWNER-APPROVED — T2 IMPLEMENTATION-REQUIRED** (bulk adoption) | **20** | SD4-003, 005, 009, 010, 011, 014, 015, 016, 018, 019, 020, 022, 023, 024, 025, 027, 029, 037, 039, 040 |
| **DEFERRED — T3** | **3** | SD4-013, 021, 030 |

`IDENTITY-MAPPING-CONTRACT-01` (SD4-004 + SD4-006) is preserved as one internally coherent implementation contract; both halves are approved together.

The T2 bulk adoption expressly includes the Commit-D resolutions arising from **NHR-01 decision A2** and the **dormant archival rule**, and accepts the recorded **80-character display-name cap**.

**T3 deferral:** documented intent is preserved, but **no executable mechanism from SD4-013, SD4-021 or SD4-030 ships now**. SD4-030 remains linked to **B4-P0-049**; neither decision silently resolves the other.

**Final register:** 42 total — 6 INHERITED-APPROVED, 31 OWNER-APPROVED, 0 PROPOSED, 5 DEFERRED, 0 PENDING-OWNER (6 + 31 + 5 = 42).

### 14.9 Bulk-adoption package control

A bulk-adoption decision for non-blocking SQL-shipping proposals must cite **both**:

1. the exact SD4 IDs adopted, and
2. the exact **package commit SHA** (Commit D).

IDs alone are insufficient: the SHA freezes the proposal content being approved. If the artifact changes after the package commit, the bulk adoption does not automatically apply to the changed content. The instrument must exclude every DEFERRED decision and every REVISE item, and be recorded in the register. **Approval by implication is prohibited.**

### 14.10 Owner disposition semantics

| Disposition | Meaning |
|---|---|
| **APPROVE** | The documented decision is accepted as proposed |
| **REVISE** | The owner changes the decision. **The revised mechanism must undergo focused hostile review before it may be implemented** |
| **DEFER** | The mechanism is not part of Build 4 implementation. The package must then state what capability is lost, what SQL object is removed, and whether any dependency becomes blocked. **A DEFERRED decision cannot remain implemented in the SQL** |

**No one may infer that T2 means optional, that a T1 classification means approved, or that presence in the SQL draft means approved.**

---

## 15. Expected future fingerprint delta

A verification contract for whoever runs the fingerprint after Build 4 implementation.

**`c55d9b80d604211a5841260709b27f47` over 961 facts is the PRE-Build-4 baseline.** It is not a target to restore. Applying the intended Build 4 delta **will** produce a different gating digest, and that is designed, not corruption.

| Dimension | Baseline | Expected after implementation | Class |
|---|---|---|---|
| `schemas` | 2 | **2** | **INVARIANT** — any change is drift |
| `relations` | 14 | **16** (exact) | INTENDED |
| `columns` | 148 | up, roughly +60 (estimate) | INTENDED |
| `constraints` | 130 | up, roughly +50 (estimate) | INTENDED |
| `indexes` | 51 | **78** (exact) | INTENDED |
| `triggers` | 12 | **35** (exact) | INTENDED |
| `functions` | 3 | **10** (exact — 9 plus `set_one_move_logical_day`) | INTENDED |
| `policies` | 37 | **39** (exact) | INTENDED |
| `privileges.relations` | 336 | **down** — fewer verbs held by `authenticated` | INTENDED |
| **`privileges.columns`** | **0 — empty, emits no output row** | **populated (~20 grants)** | **INTENDED, and it changes the fingerprint ROW COUNT from 16 to 17.** A reviewer expecting 16 rows must not read the 17th as corruption |
| `privileges.functions` | 8 | up | INTENDED |
| `privileges.effective` | 205 | changes | INTENDED |
| `privileges.default_acl` | 6 | **changes** — the nine Layer 1 statements | **INTENDED**, newly so: under the pre-HR-02 design this dimension was expected to stay fixed |
| `privileges.schemas` | 9 | changes — `private` USAGE narrowed | INTENDED |
| `info.event_triggers` | 7 | **7** | **INVARIANT** (informational) |
| `info.extensions` | 5 | **5** | **INVARIANT** (informational; the hosted/local `pg_net` difference remains explained and non-gating) |
| `types`, and any dimension not listed | empty / unchanged | unchanged | **INVARIANT — any change is drift** |

Three standing rules:

1. **Any change outside this enumeration is drift, not design.** It must be investigated, not absorbed.
2. **Do not "repair" the intended Build 4 delta back to the Phase 1 digest.** The Phase 1 artifacts record the pre-Build-4 state and remain historically accurate; they are not a restoration target.
3. **Unexpected privilege widening must not hide inside the intended delta.** `privileges.relations` is expected to move **downward**; an increase is a failure signal even though the dimension is on the intended-change list. This is the specific way a privilege regression would otherwise be camouflaged by a large legitimate diff.

---

## 16. Status — SD4 CLOSED

| Item | Status |
|---|---|
| Entry gate | **PASS** |
| Commit D provenance | **PASS** — every reported closure artifact verified present |
| Owner resolutions applied | **8** — HR-01..HR-04, NHR-01, NHR-02, NHR-05, HR-05 |
| 30 original attacks | 24 STILL RESOLVED · 6 CHANGED ANSWER · **0 REGRESSED** |
| Open findings | **0 P0 · 0 P1**; P2/P3 carried with dispositions |
| SQL-SHIPPING + PROPOSED | **0** |
| SQL-SHIPPING + DEFERRED | **0** |
| APPROVED-BUT-NOT-SHIPPED | **0** |
| Register | 42 = 6 INHERITED-APPROVED + 31 OWNER-APPROVED + 5 DEFERRED |
| SQL draft syntax / runtime | **UNVERIFIED** — design-only; Tests A–E run at implementation |
| Remote contact | **NOT_EXECUTED** |
| **SD4 DESIGN QUALITY** | **PASS** |
| **SD4 OWNER AUTHORIZATION** | **PASS** |
| **SD4 LOCAL IMPLEMENTATION AUTHORIZATION** | **PASS** |
| **FINAL SD4** | **CLOSED** |

Production apply remains separately gated at Checkpoint #2 (B4-P0-050/051/052). Tests A–E are the first work of the implementation phase.

---

## 17. Bidirectional SQL ↔ decision audit

### 17.1 Direction 1 — SQL mechanism → governing decisions

Every substantive mechanism in `drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql`, with **all** governing decision IDs. One statement may serve several decisions; no one-to-one mapping is forced.

| SQL mechanism | Governing SD4 IDs | Status of governing decisions |
|---|---|---|
| Zero-data interlock + `LOCK TABLE` + re-census | SD4-041 | **OWNER-APPROVED** |
| `uuid` PKs, `gen_random_uuid()`, `force_server_owned_id()` | SD4-001, SD4-002 | PROPOSED ×2 |
| `local_id` columns + uniqueness boundaries | SD4-004, SD4-005, SD4-006, SD4-037 | PROPOSED ×4 |
| `origin_device_id` | SD4-006, SD4-037 | PROPOSED ×2 |
| `owner_profile_id` + `*_owner_scope_check` | SD4-009, SD4-033 | PROPOSED, INHERITED-APPROVED |
| `subject_member_id` / `subject_member_type` / composite FK / `*_child_scope_subject_check` / `set_subject_member_type()` | SD4-009, SD4-024, SD4-029, SD4-040 (mechanism added by **NHR-01** closure) | PROPOSED ×4 |
| `household_members_id_household_id_member_type_key` | SD4-029 (NHR-01) | PROPOSED |
| `origin_created_at` / `origin_updated_at` | SD4-011 | PROPOSED |
| `set_row_updated_at()` + revision triggers | SD4-010, SD4-035 | PROPOSED, INHERITED-APPROVED |
| `change_log`, `log_row_change()`, cursor indexes | SD4-012, SD4-013 | PROPOSED ×2 |
| Tombstones: `deleted_at`, `cleared` status | SD4-014 | PROPOSED |
| One Move state machine + CHECKs | SD4-016 | PROPOSED |
| `logical_day`, `timezone_at_decision`, `set_one_move_logical_day()`, `UNIQUE (household_id, profile_id, logical_day)` | SD4-017, SD4-016 | **OWNER-APPROVED**, PROPOSED |
| Typed One Move targets, `catalog` rejected | SD4-018, SD4-032 | PROPOSED, INHERITED-APPROVED |
| `events.source = 'user'` | SD4-019, SD4-032 | PROPOSED, INHERITED-APPROVED |
| Ledger immutability: policies, revokes, `forbid_ledger_mutation()` | SD4-020, SD4-021 | PROPOSED ×2 |
| `private.is_trusted_server_context()` | SD4-020, SD4-030 (mechanism added by **NHR-05** closure) | PROPOSED ×2 |
| `account_claims` + unique indexes | SD4-022 | PROPOSED |
| Two partial unique indexes on `household_members` | SD4-023, SD4-038 | PROPOSED, INHERITED-APPROVED |
| TEXT + CHECK enumerations throughout | SD4-024 | PROPOSED |
| `payload_version`, reason CHECKs, uuid-shape CHECKs | SD4-025, SD4-007, SD4-008 | PROPOSED ×3 |
| Four `private` RLS helpers | SD4-027 | PROPOSED |
| `private.assert_app_schema_secured()` | SD4-026 (mechanism added by **NHR-02** closure) | **OWNER-APPROVED** |
| `ALTER DEFAULT PRIVILEGES` ×9 | SD4-026 | **OWNER-APPROVED** |
| Blanket revokes + per-object grants + load-bearing re-assertion | SD4-026, SD4-039, SD4-040, SD4-027 | OWNER-APPROVED + PROPOSED ×3 |
| Column-level grants (20) | SD4-040, SD4-010, SD4-011, SD4-017 | PROPOSED ×3 + OWNER-APPROVED |
| `display_name` nullability + normalization CHECKs | SD4-029, SD4-040 (mechanism added by **HR-05** closure) | PROPOSED ×2 |
| `household_members.profile_id` CASCADE + adult CHECK | SD4-029 | PROPOSED |
| `household_categories (household_id, sort_order)` **non-deferrable** | SD4-031 | **INHERITED-APPROVED** |
| RPC signatures + trusted claim contract | SD4-022, SD4-030, SD4-015 | PROPOSED ×3 |
| Acceptance tests A–E | SD4-041 | **OWNER-APPROVED** |

### 17.2 SQL-SHIPPING + PROPOSED — **0**

**METHOD** re-extract the register status of every decision whose mechanism appears in the SQL draft, after the 2026-09-19 owner dispositions.

**RAW** register tally: `6 INHERITED-APPROVED · 31 OWNER-APPROVED · 5 DEFERRED · 0 PROPOSED`, total 42.

**INTERPRETATION:** no decision anywhere in the register remains `PROPOSED`, so no SQL-shipping mechanism can be governed by a `PROPOSED` decision. **Target met: 0.** The 27 previously counted here are now OWNER-APPROVED at Commit D content.

### 17.3 SQL-SHIPPING + DEFERRED — **0**

| DEFERRED ID | Mechanism | Present in SQL? |
|---|---|---|
| SD4-028 — child-data minimization | a narrowed child data shape | **No** |
| SD4-034 — Production backup / PITR | any plan or recovery change | **No** |
| **SD4-013** — 90-day retention horizon | anything enforcing a horizon | **No.** The horizon exists only in a signature comment. *Boundary note:* `change_log_logged_at_idx` exists in the draft but is governed by **SD4-012** (the `change_log` table design, approved); an index is not a retention mechanism, and no prune job ships |
| **SD4-021** — action retention asymmetry | any DDL | **No.** It is a sync-engine rule; the draft contains none of it |
| **SD4-030** — purge order | `private.purge_account` body | **No.** Signature comment only. *Boundary note:* `private.is_trusted_server_context()` and the DELETE branch of `forbid_ledger_mutation()` do ship, but both are governed by **SD4-020** (ledger immutability, approved) and by the NHR-05 closure; SD4-030's governance over them is documentary, not mechanical |
| B4-P0-057 — deferrable sort order | `DEFERRABLE` | **No.** One grep hit, and it is a comment stating the constraint stays NON-DEFERRABLE |
| B4-P0-066 — child/system/meal removal | archival state on `household_members` | **No.** Dormant with a recorded activation dependency |

**No DEFERRED mechanism ships. Target met: 0.**

### 17.4 Direction 2 — approved decision → expected SQL

| Approved decision | Expected mechanism | Present? |
|---|---|---|
| SD4-009a (OWNER-APPROVED) | *absence* of `owner_profile_id` on `household_members` | **Shipped as absence** — verified: the column does not exist on that table |
| SD4-017 (OWNER-APPROVED) | `logical_day`, `timezone_at_decision`, derivation trigger, unique key | **Yes** |
| SD4-026 (OWNER-APPROVED) | 9 × `ALTER DEFAULT PRIVILEGES`, per-object grants, assertion layer | **Yes** |
| SD4-041 (OWNER-APPROVED) | interlock, `LOCK TABLE`, re-census, tests A–E | **Yes** |
| SD4-031 (INHERITED-APPROVED) | sort_order unique, non-deferrable | **Yes** |
| SD4-032 (INHERITED-APPROVED) | demo unrepresentable: `source='user'`, no `catalog` target | **Yes** |
| SD4-033 (INHERITED-APPROVED) | `coparent-shared` owner-only in the scope predicate | **Yes** |
| SD4-035 (INHERITED-APPROVED) | base-revision concurrency; no LWW, no merge | **N/A — SEMANTIC-ONLY.** A prohibition produces no DDL. Partially expressed by the revision trigger and the `sync_push` contract |
| SD4-036 (INHERITED-APPROVED) | baseline unaltered; draft outside `supabase/migrations/` | **Yes** — verified by hash and directory listing |
| SD4-038 (INHERITED-APPROVED) | membership SELECT-only; no client INSERT/UPDATE/DELETE | **Yes** |
| SD4-034, SD4-028 (DEFERRED) | — | **Correctly absent** |

**APPROVED-BUT-NOT-SHIPPED: 0.**

**N/A — SEMANTIC-ONLY / NO SQL EXPECTED**, the complete bucket with a reason each:

| SD4 ID | One-line reason |
|---|---|
| SD4-035 | A prohibition (no timestamp LWW, no field merge, no merge engine) produces no DDL; it is expressed by the revision trigger and the `sync_push` contract |
| SD4-015 | Its mechanism is the deliberate *absence* of a cloud conflict table plus an RPC return shape |
| SD4-005 | Uses the unique constraint SD4-004 already ships; it adds no object of its own |
| SD4-021 | A sync-engine rule, not schema |
| SD4-036 | Governance rule (baseline unaltered, draft outside `migrations/`), verified by hash and directory listing |

One decision (SD4-009a) ships as a **verified absence** — `owner_profile_id` confirmed not present on `household_members`. That is not an N/A; it is a checked negative.

---

## 18. Post-resolution tier revalidation

Re-run after the four closures, in all four directions the owner specified.

| Question | Answer | Evidence |
|---|---|---|
| **1.** Does any T2/T3 decision now meet the T1 criterion? | **No** | The only new durable structures are nullable FK columns (`subject_member_id`), a derived carrier column, a unique constraint, three functions and CHECK constraints. Adding or removing a nullable FK column is additive; correcting any of them touches no identity, namespace, reference, key or sync protocol |
| **2.** Does any T1 decision no longer meet the criterion? | **No** | None of the seven changed. SD4-008's manifest is untouched; SD4-017 (already OWNER-APPROVED, outside the package) gained enforcement but not scope |
| **3.** Does a T1 rationale now depend on a revised T2/T3 mechanism in a way that changes classification? | **No** | SD4-008's irreversibility rests on SD4-020 (ledger immutability), which this pass *strengthened* — the GUC escape became a role boundary. A stronger dependency does not weaken the T1 case |
| **4.** Did any new substantive mechanism create a new foundational-decision dependency? | **No** | `is_trusted_server_context()` and `assert_app_schema_secured()` are replaceable helpers. The composite FK is an ordinary constraint. Neither introduces a new namespace or protocol |

**Tier counts unchanged: T1 = 7 · T2 = 20 · T3 = 3 · total 30.** No tier conflict to report.

**Deletion cross-register linkage (addendum N).** The T3 decision whose rationale reads *"needed at the deletion phase"* is **SD4-030** (mandatory purge order). It depends explicitly on **B4-P0-049** (deletion mechanism, **PENDING** under its own authority). SD4 tier classification does **not** decide B4-P0-049, and a later B4-P0-049 decision must not silently change SD4-030 without reconciliation; at final authorization the two must be dispositionally consistent. This linkage does **not** make SD4-030 implementation-blocking now, because its mechanism (`private.purge_account`) exists in the draft only as a signature, not as executable DDL.

---

## Annotation only — implementation cross-reference (added 2026-09-20)

**SD4 is CLOSED. Nothing above is reopened, and no decision content is altered.**
This note exists so a reader of the closed proposal is not left with a stale
picture of what the claim RPC actually carries.

The RPC contract in §10 of `drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql` specifies
`p_payload` as carrying **local content only** and designs bodies nowhere. The
first implementation carried One Move records and nothing else, which made any
real household with a targeted One Move unclaimable. The implemented claim
dependency closure — and the `claimPayloadVersion: 1` payload shape — are
recorded in:

- **B4-BE02-OR-001** — CLAIM-ONE-MOVE-DEPENDENCY-CLOSURE
- **B4-BE02-OR-002** — LEGACY-REAL-CATALOG-ONE-MOVE-REMEDIATION

both in `docs/builds/BUILD4_BE02_CLAIM_CORRECTION.md`. They are
implementation-level corrections satisfying requirements SD4 already approved,
not new proposals.
