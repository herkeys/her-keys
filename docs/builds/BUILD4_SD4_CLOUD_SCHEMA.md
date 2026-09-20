# Build 4 — SD4 cloud schema design gate

| | |
|---|---|
| Gate | **SD4**, the cloud schema design gate inserted by owner direction (B4-P0-063). Not "Phase 4" |
| Status | **HOSTILE DESIGN QUALITY: PASS** (P0 = 0, P1 = 0). **IMPLEMENTATION AUTHORIZATION: PENDING-OWNER** (30 PROPOSED + 2 DEFERRED decisions unapproved — section 14). **FINAL SD4 STATUS: PENDING-OWNER** |
| Nature | **DESIGN ONLY.** No Supabase connection, no Staging, no Production, no credentials, no CLI remote command, no migration change, no RLS, no Auth, no local v3, no sync, no RPC, no deletion, no push |
| Branch / HEAD | `build/04-cloud-identity-sync` at `d34ca5816b978a2cd2feacf856ae67b57a3ccbce`, working tree clean at entry |
| Database authority | `supabase/migrations/20260919230054_build4_baseline.sql`, gating digest `c55d9b80d604211a5841260709b27f47` over 961 catalog facts |
| Companions | [BUILD4_SD4_DELTA_MATRIX.md](BUILD4_SD4_DELTA_MATRIX.md), [drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql](drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql) |
| Contract | [BUILD4.md](BUILD4.md), [BUILD4_PHASE0_CHECKPOINT.md](BUILD4_PHASE0_CHECKPOINT.md), [BUILD4_PHASE1_COMPLETION.md](BUILD4_PHASE1_COMPLETION.md) |
| Revision | **Owner-resolution pass, 2026-09-19.** HR-01..HR-04 resolved (section 12); register accounting corrected (section 13) |

> **Most of this document is still unapproved.** Every `SD4-###` marked `PROPOSED` is a proposal awaiting owner review. `INHERITED-APPROVED` restates existing Phase 0 authority. `OWNER-APPROVED` marks the four decisions the owner settled during SD4 on 2026-09-19 — **and approving those four did not approve anything else.**

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
| **SD4-001** | PROPOSED | REFINES B4-P0-007 (PENDING) | **Cloud primary keys become native PostgreSQL `uuid`**, server-generated by `DEFAULT gen_random_uuid()`. Not server-generated TEXT. Rationale in section 4.1. |
| **SD4-002** | PROPOSED | CONSISTENT B4-P0-012 | **`profiles.id` stays the Supabase Auth user id** — a shared primary key with `auth.users(id) ON DELETE CASCADE`. No surrogate account id and no separate account table. |
| **SD4-003** | PROPOSED | REFINES B4-P0-029 | **The client cannot INSERT a profile.** `profiles_insert_own` is removed; a profile exists only because the bootstrap transaction created it alongside household, owner membership, starter categories and onboarding state. |
| **SD4-004** | PROPOSED | REFINES B4-P0-008 (PENDING) | **`local_id text NOT NULL`**, same id pattern as the baseline. Uniqueness boundary follows the ownership boundary: `(household_id, local_id)` on household-scoped tables, `(household_id, profile_id, local_id)` on owner-private tables. Not applicable to `onboarding_state` and `discovery_answers` (no local identity). `households.local_id` is deliberately not unique. |
| **SD4-005** | PROPOSED | REFINES B4-P0-006 | **Row-upload idempotency is the `local_id` unique constraint.** Upload is `INSERT ... ON CONFLICT (<local_id key>) DO UPDATE`, so a retry after a lost response can never create a duplicate. |
| **SD4-006** | PROPOSED | REFINES B4-P0-005 | **A local id is device-relative, not a global handle.** On pull, a device adopts the origin local id when it is free and mints a fresh local id when it is not, recording the mapping either way. Existing local ids are never rewritten. |
| **SD4-007** | PROPOSED | **CONTRADICTS the B4-P0-009 proposal** (B4-P0-009 is PENDING, not approved — not a P1) | **Soft references are stored in the cloud as cloud uuids, not as local ids.** The Phase 0 sketch proposed keeping `action_records.target_id`, One Move `target_id` and ids inside action payloads in the local namespace. That is unsafe the moment a second device exists (SD4-006) and is rejected by Build 3 local integrity checking. |
| **SD4-008** | PROPOSED | REFINES B4-P0-009 | **A closed reference manifest** for JSONB payloads: exactly four paths carry references (`reason.windowBeforeEventId`, `reason.windowAfterEventId`, `reason.recommendedTaskId`, `reason.consideredTaskId`), plus the `target_id` column. `before_state` and `after_state` contain none. The sync engine translates that manifest in both directions; a CHECK enforces uuid shape. |
| **SD4-009** | PROPOSED | REFINES B4-P0-038 | **`owner_profile_id` placement rule:** present and NOT NULL exactly when `scope IN ('personal','professional','coparent-shared')`; NULL for `household` and `child`; enforced by CHECK. Placed on the five content tables (`household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries`). |
| **SD4-009a** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-038 | **`owner_profile_id` is NOT placed on `household_members`.** Owner-decided rationale: for profile-backed membership rows `profile_id` already identifies the member; for child/non-profile rows (`member_type='child'`, `profile_id IS NULL`) an `owner_profile_id` would still not denote a meaningful alternate owner *of the membership itself*. There is no Build 4 product case where ownership of a membership row differs from the membership relationship the row represents, so the column would be redundant-or-nullable with no independent semantics and would license future contradictory readings. `owner_profile_id` remains **required on content rows** where row ownership or visibility scope can differ from ordinary household membership. Resolves **HR-01**. |
| **SD4-010** | PROPOSED | CONSISTENT B4-P0-020 | **`revision` is server-owned.** The existing `set_row_updated_at()` trigger keeps its behavior unchanged; server ownership is additionally enforced by withholding the column-level INSERT and UPDATE privilege from `authenticated`. |
| **SD4-011** | PROPOSED | REFINES B4-P0-020 | **Server row lifecycle and local domain time are separate columns.** `created_at` / `updated_at` stay server-owned. New nullable `origin_created_at` / `origin_updated_at` carry the local domain timestamps verbatim, including their nullness. Nothing defaults them. |
| **SD4-012** | PROPOSED | REFINES B4-P0-026 (PENDING) | **The global change cursor is `public.change_log` keyed on `committed_xid xid8`, read behind a `pg_snapshot_xmin` barrier.** It is a pointer log, never content. The per-row `revision` is not and never becomes the cursor. Proof in section 6.3. |
| **SD4-013** | PROPOSED | REFINES B4-P0-026 | **`change_log` retention is 90 days.** A cursor older than the horizon returns `cursor_expired` and the device performs a full resync rather than silently missing changes. |
| **SD4-014** | PROPOSED | REFINES B4-P0-027 (PENDING) | **Tombstone realization per entity.** Existing status values serve events, tasks, needs-me and categories. `discovery_records` gains `deleted_at`. One Move gains the status value `cleared` — not a `deleted_at` column — because its row is uniquely keyed by logical day and is revived in place. |
| **SD4-015** | PROPOSED | REFINES B4-P0-028 (PENDING) | **Conflict evidence lives locally only.** No cloud conflict table. `sync_push` returns `{ status: stale, cloud_id, current_revision, current_row }` and the device keeps the losing intent. Rationale: the evidence is unaccepted client intent, and uploading it would create a retention and child-data surface for data the server has explicitly rejected. |
| **SD4-016** | PROPOSED | REFINES B4-P0-059 (PENDING) | **One Move state machine** with four states and an explicit legal-transition set (section 8.1). |
| **SD4-017** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-059 | **`profiles.timezone` is the authoritative account timezone for logical-day behavior after bootstrap.** It is `NOT NULL`, initialized from an explicit device/user timezone at bootstrap or claim, validated as a real IANA identifier at write time. A second device adopts it; device-local timezone never independently redefines the logical day; travel never silently overwrites it. Historical logical-day identity is **frozen at write time**: `one_move_records.logical_day date NOT NULL` plus `timezone_at_decision text NOT NULL`, and an old record is never reinterpreted against a later `profiles.timezone`. The day key is **server-derived** on the live path. Resolves **HR-03**. Intentionally refines Build 3 device-local behavior. |
| **SD4-018** | PROPOSED | CONSISTENT B4-P0-010 | **One Move cloud targets are typed, not polymorphic**: `target_task_id` and `target_needs_me_id`, real foreign keys, exactly one set. `target_type = 'catalog'` is rejected by CHECK, because the catalog exists only in demo households. |
| **SD4-019** | PROPOSED | CONSISTENT B4-P0-010 | **`events.source` is narrowed to `'user'`.** The baseline still permits `'demo'`. Demo never syncs, so the cloud must be unable to hold a demo row at all — fail closed at the database, not by client filtering. |
| **SD4-020** | PROPOSED | CONSISTENT B4-P0-039 | **The action ledger is immutable in three layers**: no UPDATE or DELETE policy, `UPDATE`/`DELETE`/`TRUNCATE` revoked from `authenticated`, and a trigger that raises on UPDATE or DELETE — binding `service_role` and the table owner too. The only escape is the account-deletion purge, which must announce itself via a session setting. |
| **SD4-021** | PROPOSED | REFINES B4-P0-023 | **Cloud action retention is unbounded in Build 4; local retention is a window.** Local trimming at the 10,000 cap is cache eviction and must never emit a cloud delete. Pull for `action_records` is bounded by recency, so a trimmed device does not re-download the whole ledger. |
| **SD4-022** | PROPOSED | REFINES B4-P0-034 (PENDING) | **`account_claims` is required.** The deciding argument is crash recovery, not bookkeeping: row-level idempotency survives a retry but cannot rebuild the id map after a crash between server commit and local write. `UNIQUE (profile_id, claim_key)` plus a partial unique index on `status = 'complete'` give exactly-once. |
| **SD4-023** | PROPOSED | CONSISTENT B4-P0-031 | **One household per account, one owner per household**, enforced by two partial unique indexes on `household_members`. A duplicate cloud household becomes impossible rather than merely unlikely. |
| **SD4-024** | PROPOSED | CONSISTENT with the baseline | **TEXT + CHECK is kept; native enums are rejected.** Rationale in section 4.6. |
| **SD4-025** | PROPOSED | REFINES B4-P0-064 | **JSONB payloads are versioned and bounded**: `payload_version`, a required `reason.code`, a 4 KiB size bound per column, an `action_type`/`approval`/`reason.code` agreement CHECK, and a uuid-shape CHECK on the four reference paths. The baseline accepted any JSON object. |
| **SD4-026** | **OWNER-APPROVED** (2026-09-19) | REFINES B4-P0-040 | **Three-layer privilege defense.** Layer 1: secure `ALTER DEFAULT PRIVILEGES` for role `postgres` in `public` and `private`, so a new object cannot inherit `anon` or `PUBLIC` access even if its migration forgets. Layer 2: explicit per-object privileges in the same migration that creates or alters the object. Layer 3: the deterministic fingerprint as a standing drift gate over the privilege dimensions. The design must not rely on developers remembering Layer 2. Resolves **HR-02**. |
| **SD4-027** | PROPOSED | REFINES B4-P0-039 | **Four private helper functions** for later RLS: `is_household_member(uuid)`, `is_household_owner(uuid)`, `can_access_scoped_row(uuid, text, uuid)`, `current_household_id()`. All STABLE, SECURITY DEFINER, `search_path` pinned to `''`, EXECUTE revoked from PUBLIC and `anon`, granted only to `authenticated`. |
| **SD4-028** | **DEFERRED** | CONSISTENT B4-P0-069 | **Child-data minimization.** `household_members` stores a child name and exact birth date. No production create path exists, so a real Build 4 household holds zero child rows. Recorded with concrete recommendations (section 7.4) and deferred to a privacy review; a full privacy dashboard remains a non-goal. |
| **SD4-029** | PROPOSED | REFINES B4-P0-019 | **`household_members.profile_id` becomes `ON DELETE CASCADE`** and a CHECK requires an adult member to have a profile. The baseline `SET NULL` leaves a profile-less adult member row behind after account deletion, which nothing forbids and no purge step names. |
| **SD4-030** | PROPOSED | REFINES B4-P0-049 (PENDING) | **Mandatory purge order** for account deletion, driven by the RESTRICT edges (section 8.3). Deleting `auth.users` alone fails while ledger rows exist. |
| **SD4-031** | INHERITED-APPROVED | CONSISTENT B4-P0-057 | **`household_categories (household_id, sort_order)` stays non-deferrable.** Bootstrap and claim insert the eight starter categories in one multi-row INSERT with distinct orders, which never transiently collides. |
| **SD4-032** | INHERITED-APPROVED | CONSISTENT B4-P0-010 | **Demo households never sync**, enforced fail-closed: claim refuses a demo payload outright rather than filtering it, and SD4-018 / SD4-019 remove the schema-level ability to store demo rows. |
| **SD4-033** | INHERITED-APPROVED | CONSISTENT B4-P0-038 | **`coparent-shared` is owner-only for all of Build 4.** It is a private category for co-parenting logistics, never a grant of access to another account. |
| **SD4-034** | DEFERRED | CONSISTENT B4-P0-052 | **Production backup and PITR posture** stays deferred to Checkpoint #2. SD4 proposes no plan change. |
| **SD4-035** | INHERITED-APPROVED | CONSISTENT B4-P0-020, 021 | **No timestamp last-write-wins, no automatic field merge, no general merge engine.** Base-revision optimistic concurrency only. The device clock is never authority. |
| **SD4-036** | INHERITED-APPROVED | CONSISTENT B4-P0-063 | **The Phase 1 baseline is never altered, and SD4 SQL never enters `supabase/migrations/`** without explicit owner approval. |
| **SD4-037** | PROPOSED | new | **`origin_device_id uuid` on client-originated rows, with no device registry table.** It is provenance evidence for collision diagnosis, not an access-control input. |
| **SD4-038** | INHERITED-APPROVED | CONSISTENT B4-P0-019 | **Membership stays privileged infrastructure**: `household_members` and `households` are SELECT-only for clients; creation and removal live behind the server boundary. |
| **SD4-039** | PROPOSED | REFINES B4-P0-040 | **`TRUNCATE`, `REFERENCES` and `TRIGGER` are revoked from `authenticated` on every table**, and `DELETE` everywhere except `discovery_answers`. RLS does not govern TRUNCATE, so the client role should not hold a verb RLS cannot restrain. |
| **SD4-040** | PROPOSED | REFINES B4-P0-040 | **Client write privileges are column-level**, so `id`, `household_id`, `local_id`, `revision`, `created_at` and `updated_at` are unwritable by a client even if a policy were later widened by mistake. |
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
| Functions (`public` + `private`) | 3 | **10** | `+is_household_owner`, `+can_access_scoped_row`, `+current_household_id`, `+force_server_owned_id`, `+forbid_ledger_mutation`, `+log_row_change`, `+set_one_move_logical_day` (HR-03); `is_household_member` re-signed `text`→`uuid`; `rls_auto_enable` retained unchanged |
| Policies | 37 | **39** | Scope-aware rewrite; `profiles_insert_own` removed; `discovery_answers_delete_own`, `change_log_select_scoped`, `account_claims_select_own` added |
| Revision triggers | 12 of 14 | **13 of 16** | Unchanged pattern; `account_claims` added; `discovery_answers`, `action_records` and `change_log` correctly excluded |
| Other triggers | 0 | **+23** | 12 `log_row_change`, 9 `force_server_owned_id`, 1 `forbid_ledger_mutation`, 1 `set_one_move_logical_day` (HR-03). Triggers total 12 → **36** |
| Indexes | 51 | **78** | 46 explicit + 16 UNIQUE + 16 PK. The baseline decomposes the same way (31 + 6 + 14 = 51), which is how this count was checked |
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


---

## 11. Hostile review

Severity: **P0** blocks the schema · **P1** serious correctness, security or architecture · **P2** important follow-up · **P3** minor · **P4+** future/documentation.

### 11.1 Re-verification of all 30 original attacks

Every attack from the first SD4 hostile review, re-run against the design as changed by the four owner resolutions. No attack **REGRESSED**.

| # | Attack | Verdict | Affected by | Note |
|---|---|---|---|---|
| H-01 | Client-supplied cloud PKs | **STILL RESOLVED** | HR-03 (reinforces) | `uuid` + `gen_random_uuid()` + `force_server_owned_id()` + no column grant. HR-03 adds `logical_day` and `timezone_at_decision` to the set of fields the client cannot dictate |
| H-02 | Duplicate cloud households | **STILL RESOLVED** | — | Two partial unique indexes on `household_members` |
| H-03 | Duplicate inserts after retry | **STILL RESOLVED** | — | `local_id` unique constraints as idempotency key |
| H-04 | Local/cloud mapping loss after crash | **STILL RESOLVED** | — | `account_claims.claim_key` replay |
| H-05 | Cross-device `local_id` collisions | **STILL RESOLVED** | — | Device-relative local ids; server never merges on collision |
| H-06 | Row revision used as pull cursor | **STILL RESOLVED** | — | Separate mechanisms; `change_log.committed_xid` is the cursor |
| H-07 | Incomplete global change cursor | **STILL RESOLVED** | — | xmin-barrier protocol with the proof in 6.3 |
| H-08 | Missing pull indexes | **STILL RESOLVED** | HR-03 (rename) | The One Move lookup index is now `(household_id, profile_id, logical_day DESC)` |
| H-09 | Hard deletes invisible to offline devices | **STILL RESOLVED** | — | Status tombstones, `deleted_at`, `cleared` |
| H-10 | Duplicate One Move day rows | **CHANGED ANSWER** — strengthened | **HR-03** | Was: a unique constraint on a client-supplied `for_date`. Now: the day is **server-derived**, so a wrong day cannot reach the constraint in the first place. Scenario proof in 8.2 |
| H-11 | Timezone divergence | **CHANGED ANSWER** — structural, not evidential | **HR-03** | Was: `for_date_timezone` made divergence *detectable*. Now: divergence is *impossible* on the live path because the client value is discarded; `timezone_at_decision` is retained purely as audit evidence |
| H-12 | Client-writable `revision` | **STILL RESOLVED** | — | Trigger overwrite plus no column grant |
| H-13 | Client-writable `updated_at` | **STILL RESOLVED** | HR-03 (extends) | Same two layers, now also covering `logical_day` and `timezone_at_decision` |
| H-14 | Fabricated historical timestamps | **STILL RESOLVED** | HR-03 (nuance) | `origin_*` columns stay nullable. HR-03 adds one honest caveat: `timezone_at_decision` for claim-backfilled rows is the claim-time profile timezone, recorded as such in 8.2 |
| H-15 | Ambiguous ownership | **CHANGED ANSWER** — rationale now precise, one gap opened | **HR-01** | Ownership itself is unambiguous and now carries the owner-issued child-member rationale. The re-review surfaced a *scope-integrity* gap that is not an ownership gap: **NHR-01** |
| H-16 | Arbitrary JSON | **STILL RESOLVED** | — | `payload_version`, required `reason.code`, size bound, agreement CHECK |
| H-17 | Mutable audit ledger | **STILL RESOLVED** | — | Three layers including a trigger binding `service_role` |
| H-18 | Local action trimming deleting cloud truth | **STILL RESOLVED** | — | No delete path exists for `action_records` in the sync engine |
| H-19 | Demo data becoming syncable | **STILL RESOLVED** | — | Fail-closed refusal plus schema-level inability to represent demo rows |
| H-20 | Accidental co-parent collaboration | **STILL RESOLVED** | HR-01 (confirms) | `coparent-shared` owner-only; explicit DENY rows in 7.2 |
| H-21 | Personal/professional leakage | **STILL RESOLVED** | HR-01 (confirms) | Owner-only predicate; private-scope row with NULL owner rejected for every role |
| H-22 | Unsafe default grants | **CHANGED ANSWER** — now fully resolved | **HR-02** | Was: "resolved, with an owner decision outstanding". The owner approved the three-layer design, so Layer 1 now removes the hazard rather than documenting it (10.1). Residual: **NHR-02** |
| H-23 | `SECURITY DEFINER` / `search_path` risk | **CHANGED ANSWER** — one more DEFINER function, and an over-revoke analysis added | **HR-02, HR-03** | `set_one_move_logical_day()` is a sixth DEFINER function, `search_path` pinned, EXECUTE held by nobody. 10.4 adds the full reachability matrix that the first pass lacked |
| H-24 | Circular FK hazards | **STILL RESOLVED** | — | None found; dependency graph is acyclic |
| H-25 | Mismatch with local v2/v3 contract | **CHANGED ANSWER** — one requirement added | **HR-03** | `logicalDay.ts` must derive the product day from the profile timezone once account-backed operation begins. Recorded for local-v3, not implemented |
| H-26 | Design SQL accidentally placed in migrations | **STILL RESOLVED** | — | Re-verified this pass: `supabase/migrations/` holds one file, the baseline, byte-identical |
| H-27 | Orphanable rows — profile with no household | **STILL RESOLVED** | — | `profiles_insert_own` removed |
| H-28 | Orphanable rows — adult member with no profile | **STILL RESOLVED** | HR-01 (confirms) | FK `CASCADE` plus the adult-requires-profile CHECK. The owner rationale explicitly contemplates `member_type='child'` with `profile_id IS NULL`, which this CHECK already permits and constrains |
| H-29 | Cross-household authenticated read | **STILL RESOLVED** | — | `is_household_member` gates every policy |
| H-30 | Child-data leakage | **STILL RESOLVED** (P2 deferred) | HR-01 (adjacent) | Access control is correct; minimization stays deferred as SD4-028. NHR-01 is a distinct issue — integrity, not leakage |

**Summary: 24 STILL RESOLVED, 6 CHANGED ANSWER, 0 REGRESSED.**

### 11.2 New hostile review

Attacks run specifically against the revised design. Framed as attempts to break it.

#### HR-01 attack surface

| Attempt | Outcome |
|---|---|
| Construct an ambiguous profile-backed membership | **Failed.** `household_members_check` forces `member_type='adult' ⇒ profile_id IS NOT NULL AND scope='personal'`. One profile per household (`household_members_profile_per_household_uq`), one owner per household, one household per owner. There is no second candidate owner for a membership row |
| Construct an ambiguous child membership (`member_type='child'`, `profile_id IS NULL`) | **Failed as an ownership question.** The CHECK forces `birth_date IS NOT NULL AND scope='child'`. The row is owned by the household, and `owner_profile_id` would have no second meaning to express — exactly the owner rationale. The row is reachable only by household members |
| Unauthorized child add / archive / update | **Failed.** `household_members` has a SELECT policy and nothing else; `authenticated` holds `SELECT` only. Creation and removal live behind the server boundary (B4-P0-019). Child archival semantics remain deferred (B4-P0-066) and no client path exists to invent them |
| CHILD-scope leakage to a non-member | **Failed.** `can_access_scoped_row` requires `is_household_member` before the scope test; `child` rows are household-visible but never cross-household |
| Content row lacking required owner/scope metadata | **Failed.** `*_owner_scope_check` on all five content tables makes a private-scope row with NULL owner, and a shared-scope row with a non-NULL owner, both unstorable — for every role, including `service_role` |
| Child-scoped content row naming **no child** | **SUCCEEDED → NHR-01 (P2)** |

#### HR-02 attack surface

| Attempt | Outcome |
|---|---|
| **ATTACK 1, under-revoke.** A future migration creates a table and forgets every privilege statement | **anon and PUBLIC: blocked** by Layer 1. `authenticated` still inherits the TABLES default — but `ensure_rls` auto-enables RLS and no policy exists, so every row is denied. **Residual path → NHR-02 (P2)** |
| A future migration creates a `SECURITY DEFINER` function and forgets privileges | **Blocked.** Layer 1 revokes the `PUBLIC` built-in EXECUTE default and the `authenticated` ROUTINES default in both schemas. The function is uncallable until someone grants it deliberately |
| **ATTACK 2, over-revoke.** Apply every proposed revoke, then run an ordinary authenticated query | **Survives.** The blanket revokes are scoped to `public`; the `private` helpers keep their grants, and 10.4 re-asserts `USAGE ON SCHEMA private` plus all four helper EXECUTEs *after* every revoke. Ordering was checked statement by statement |
| Strand a policy by revoking EXECUTE on `private.is_household_member` | **Blocked by construction** — it is in the re-assertion block. Identified in 10.4 as the single most load-bearing grant in the design |
| Over-restrict `service_role` so the purge or prune cannot run | **Failed.** `GRANT ALL ON ALL TABLES ... TO service_role` and the `private.purge_account` / `prune_change_log` grants are explicit |
| Retained baseline object drifts unnoticed | **Addressed.** 10.5 enumerates every survivor with its posture and whether the delta hardens it |
| Client sets `herkeys.claim` or `herkeys.purge` itself | **UNPROVEN → NHR-05 (P2)** |

#### HR-03 attack surface

Evaluated against the exact constraint `UNIQUE (household_id, profile_id, logical_day)`.

| Attempt | Outcome |
|---|---|
| Stale cached timezone on the writing device | **Failed.** The client value is discarded; the trigger derives the day from `profiles.timezone` |
| Timezone changed mid-day, two devices on old and new values | **Failed to duplicate.** Full step-by-step in 8.2. Both devices derive the *same* server-side day; the second collides with the first |
| A `selected` decision pending during the transition | **Failed to corrupt.** `logical_day` is stored, and the UPDATE branch pins it, so the pending row cannot migrate days |
| Historical timezone change reinterprets old records | **Failed.** No read path derives `logical_day` |
| Duplicate `logical_day` via a changed timezone string | **Failed.** `timezone_at_decision` is deliberately outside the unique key |
| Server/client disagreement on day computation | **Cannot arise.** There is exactly one evaluator |
| London device, `America/Chicago` profile | **Behaves as specified** — Chicago days until the profile is changed. Recorded as a product observation, not a defect |
| Claim backfills a *future* logical day | **Failed.** The claim branch rejects `logical_day > v_today` |
| Claim backfills with no recorded original timezone | **SUCCEEDED as a fidelity limitation**, disclosed in 8.2 rather than hidden. Not a new finding; it is inherent to Build 3 local state carrying no per-record timezone |

#### HR-04 attack surface

Evaluated against the actual guard SQL quoted in section 8 of the owner-resolution report.

| Attempt | Outcome |
|---|---|
| Insert a row between the check and the DDL | **Blocked.** `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` is taken before any DDL and held to COMMIT, and a second census runs under the locks |
| `auth.users` populated | **Blocked.** `auth.users` is in the protected list and is the first thing a real deployment would have |
| One of the 16 app tables populated | **Blocked.** All 16 are enumerated by schema-qualified name; the exception names the offending relation and its count |
| Wrong or incomplete protected list | **Addressed.** The list is enumerated literally, not computed. `change_log` and `account_claims` are guarded by `to_regclass` so a first run tolerates their absence without weakening the guard on a re-run |
| `change_log` / `account_claims` omitted from `LOCK TABLE` | **Not exploitable.** They are censused. A row can only enter `change_log` via a trigger on a table that is itself ACCESS EXCLUSIVE locked, so they are transitively protected |
| DDL placed before the guard | **Failed.** The `DO $interlock$` block is the first executable statement in the file. The only statement between it and the teardown is `SET check_function_bodies = false`, which is not DDL and touches nothing |
| Non-transactional execution weakening atomicity | **Blocked structurally.** PostgreSQL rejects `LOCK TABLE` outside a transaction block, so a non-transactional run **errors out at the lock, before any destructive DDL**. Confirmation is implementation acceptance Test C; it is not claimed as proven here |
| Partial migration after a successful guard | **Prevented by the same transaction** the lock requires |
| Data deletion used to bypass the interlock | **Forbidden in text and in behavior.** The migration contains no `TRUNCATE`, no `DELETE`, and no export-restore. The exception message explicitly instructs the operator not to do it manually and to return to the owner |

### 11.3 Open findings

**No P0 open. No P1 open.**

| # | Sev | Finding | Failure scenario | Disposition |
|---|---|---|---|---|
| **NHR-01** | **P2** | Child-scoped content rows have **no cloud constraint requiring a subject member**. Build 3 local integrity requires it (`findIntegrityProblems`: "a `child`-scoped record must name a real child") | A non-conforming client inserts `events(scope='child', subject_member_id=NULL)`. The cloud accepts it. A second device pulls it, local integrity rejects the state, `encodeStoredState` refuses the write and **sync stalls**. Requires a modified client and is confined to the actor's own household, so it is not cross-tenant and not data loss | **NOT APPLIED — owner decision required.** Proposed: `CHECK (scope <> 'child' OR subject_member_id IS NOT NULL)` on `events` and `tasks`, one-way, not a biconditional. The stronger form (proving the subject is actually a *child*) needs a composite FK carrying `member_type` and is a larger change. `household_systems`, `meal_plan_entries` and `household_categories` need nothing: they carry no subject and local integrity does not check them either |
| **NHR-02** | **P2** | Residual under-revoke path: `authenticated` keeps the TABLES default, so a forgotten future table relies on `ensure_rls` to be safe — and `rls_auto_enable()` **swallows its own exceptions** (`EXCEPTION WHEN OTHERS THEN RAISE LOG`) | A future table is created, the event trigger fails for any reason and only logs, no policy is written, and `authenticated` holds full DML on it with RLS disabled. Any authenticated user reads every household's rows in that table | Options for the owner: (a) accept, relying on Layer 2 discipline plus the fingerprint; (b) also revoke the `authenticated` TABLES default, making a forgotten table fail loudly instead of silently; (c) add a migration-time assertion that every `public` table has RLS enabled. **(c) is the cheapest and is recommended**, but it is a design change and is not applied |
| **NHR-05** | **P2** | The `herkeys.claim` and `herkeys.purge` escape hatches are **only as strong as a client's inability to set them**, and that has not been established | If a client can set `herkeys.claim='on'`, it can write One Move rows with arbitrary past `logical_day` values; `herkeys.purge='on'` would let it delete its own `action_records`, destroying its own audit ledger. Confined to the actor's own household in both cases | Recommended hardening, **not applied**: have both guards additionally assert the executing role (`current_user`/`session_user` is the service identity), so the GUC becomes a second factor rather than the only one. Must be verified in the implementation phase |
| **NHR-03** | **P3** | Layer 1 revokes the `authenticated` ROUTINES default, so the future `sync_push` / `sync_pull` / `bootstrap_account` / `claim_local_household` RPCs will be **uncallable** unless their migration grants EXECUTE explicitly | A later phase adds the RPCs, relies on the old inherited default, and every client call fails with "permission denied for function" | Fail-closed, so it breaks loudly rather than silently. Recorded here so the later phase expects it. Already stated in the SQL draft |
| **NHR-04** | **P3** | `action_records.logical_date` carries no `timezone_at_decision`, unlike `one_move_records.logical_day` | An auditor cannot tell which timezone produced a historical ledger date | Frozen by immutability so it can never be *reinterpreted*; only the audit evidence is missing. Recommendation recorded, not applied |
| HR-05 | P2 | `household_members.display_name` NOT NULL but real users have no display name | carried forward unchanged | Owner decides the placeholder rule; SD4 will not invent product copy |
| HR-06 | P2 | Child data minimization | carried forward unchanged | **DEFERRED** (SD4-028), recommendations in 7.4 |
| HR-07 | P2 | `systems` / `meals` sync paths have no production producer | carried forward unchanged | Must not be claimed as verified at certification |
| HR-08 | P2 | `change_log` growth unbounded between prunes | carried forward unchanged | `prune_change_log` signature recorded; scheduling is a later decision |
| HR-09 | P2 | `log_row_change` adds a write to every mutation | carried forward unchanged | Measure at sync implementation |
| HR-10 | P3 | New indexes raise the `unused_index` advisory count | carried forward unchanged | Expected, not drift |
| HR-11 | P3 | `discovery_answers` has no revision and no change-log trigger | carried forward unchanged | Intentional; documented |
| HR-12 | P3 | `xid8` / `pg_snapshot_xmin` cursor protocol never executed | carried forward unchanged | Must be proved by test at sync implementation |
| HR-13 | P4 | Non-owner member scenarios unreachable in Build 4 | carried forward unchanged | Correct to establish while empty |
| HR-14 | P4 | Production backup / PITR posture still deferred | carried forward, **and sharpened** | A destructive migration plus absent recovery is a worse combination than either alone. Checkpoint #2 (B4-P0-052 / OD-2) |

**HR-01, HR-02, HR-03 and HR-04 are closed by owner decision** and are recorded in section 12.

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


### 14.5 The package

**Resolving HR-01 through HR-04 did not approve the rest of the schema.** These 30 decisions remain `PROPOSED` and 2 remain `DEFERRED`. None has been self-promoted. Each is listed with what the owner would be approving.

Columns: **Dep?** = does schema implementation depend on this decision being settled first. **Defer?** = can it remain unresolved past schema implementation.

| ID | Title | Exact design choice | Rationale | Affected objects | B4-P0 | Authorization Tier | Defer? |
|---|---|---|---|---|---|---|---|
| SD4-001 | Cloud PK type | Native `uuid`, `DEFAULT gen_random_uuid()`, trigger-pinned | Makes server authority structural; ends the global-text-id collision class (`cat-kids`); matches `profiles.id`; smaller composite FKs | All 16 tables | **B4-P0-007** | **T1 — PRE-DATA STRUCTURAL** | No |
| SD4-002 | profiles/Auth relationship | Shared PK with `auth.users(id) ON DELETE CASCADE`; no surrogate account key | Auth is identity authority; removes account/profile ambiguity | `profiles` | B4-P0-012 | **T1 — PRE-DATA STRUCTURAL** | No |
| SD4-003 | No client profile INSERT | Drop `profiles_insert_own` | Closes the profile-with-no-household orphan | `profiles` | B4-P0-029 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-004 | `local_id` type + uniqueness | `text NOT NULL`, baseline id pattern; `(household_id, local_id)` household-scoped, `(household_id, profile_id, local_id)` owner-private | Uniqueness boundary follows the ownership boundary | 11 tables | **B4-P0-008** | **T1 — PRE-DATA STRUCTURAL** | No |
| SD4-005 | Row-upload idempotency | The `local_id` unique constraint is the idempotency key; `ON CONFLICT` upsert | A retry after a lost response cannot duplicate | 11 tables | B4-P0-006 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-006 | Cross-device collision semantics | Local ids are device-relative; server never merges on a same-`local_id`/different-`origin_device_id` push; puller mints a fresh local id when its own is taken | `createId` resets its counter per process, so collision is reachable | 11 tables, sync RPCs | B4-P0-005, 006 | **T1 — PRE-DATA STRUCTURAL** | No |
| SD4-007 | Soft references are cloud uuids | Cloud stores cloud uuids, not local ids | A local id is ambiguous once a second device exists; Build 3 local integrity would reject the pulled row and stall sync | `action_records`, `one_move_records` | **B4-P0-009** | **T1 — PRE-DATA STRUCTURAL** | No |
| SD4-008 | JSONB reference manifest | Exactly four paths carry references, plus `target_id`; translated both ways; uuid-shape CHECK | Bounded, enumerable translation surface | `action_records` | B4-P0-009 | **T1 — PRE-DATA STRUCTURAL** | No |
| SD4-009 | `owner_profile_id` placement | NOT NULL exactly when scope is private; NULL for `household`/`child`; CHECK-bound | Scope-aware ownership without a second source of truth | 5 content tables | B4-P0-038 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-010 | Server-owned `revision` | Existing trigger unchanged, plus no column grant | Two independent layers | 13 tables | B4-P0-020 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-011 | Origin vs server timestamps | `origin_created_at`/`origin_updated_at` nullable, never defaulted | Stops the server fabricating history the device never had | 7 tables | B4-P0-020 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-012 | Global change cursor | `change_log` keyed on `committed_xid xid8` behind a `pg_snapshot_xmin` barrier; pointer log, not content | `updated_at` and `BIGSERIAL` both lose writes; proof in 6.3 | `change_log`, 12 triggers | **B4-P0-026** | **T1 — PRE-DATA STRUCTURAL** | No |
| SD4-013 | Cursor retention | 90 days; `cursor_expired` forces a full resync | Expensive, never silent | `change_log`, `prune_change_log` | B4-P0-026 | T3 — NON-BLOCKING | **Yes**, the horizon value only |
| SD4-014 | Tombstone realization | Status values; `deleted_at` on `discovery_records`; `cleared` status on One Move | Build 3 physically deletes One Move records; invisible to offline devices | `discovery_records`, `one_move_records` | **B4-P0-027** | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-015 | Conflict evidence is local-only | No cloud conflict table; `sync_push` returns the authoritative row | Evidence is unaccepted client intent; uploading creates a retention and child-data surface | `sync_push` | **B4-P0-028** | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-016 | One Move state machine | Four states with an explicit legal-transition set | `cleared` replaces a physical delete | `one_move_records` | **B4-P0-059** | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-018 | Typed One Move targets | `target_task_id` / `target_needs_me_id` FKs, exactly one set; `catalog` rejected | Real referential integrity; demo cannot be represented | `one_move_records` | B4-P0-010, 059 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-019 | `events.source` narrowed to `'user'` | CHECK narrowed from `('user','demo')` | Fail closed at the database rather than by client filtering | `events` | B4-P0-010 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-020 | Ledger immutability | No UPDATE/DELETE policy + revoked verbs + raising trigger; purge escape via session setting | Third layer binds `service_role` too | `action_records` | B4-P0-039 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-021 | Action retention asymmetry | Cloud unbounded; local windowed; trimming never emits a cloud delete | Local cache eviction must not destroy cloud truth | `action_records`, sync engine | B4-P0-023 | T3 — NON-BLOCKING | **Yes** |
| SD4-022 | `account_claims` required | `UNIQUE (profile_id, claim_key)` + partial unique on `status='complete'` | Crash recovery of the id map, not bookkeeping | `account_claims` | **B4-P0-034** | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-023 | One household per account | Two partial unique indexes on `household_members` | Makes a duplicate cloud household structurally impossible | `household_members` | B4-P0-031 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-024 | TEXT + CHECK over native enum | Keep TEXT + CHECK everywhere | Baseline is built that way; CHECKs narrow inside a transaction; SD4 narrows two enumerations immediately | All enumerated columns | — | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-025 | JSONB payload versioning | `payload_version`, required `reason.code`, 4 KiB bound, agreement CHECK, uuid-shape CHECK | Baseline accepted any JSON object | `action_records` | B4-P0-064 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-027 | Private helper signatures | Four helpers, STABLE, DEFINER, `search_path=''`, EXECUTE to `authenticated` only | RLS needs them; over-revoking breaks every scoped read (10.4) | `private.*` | B4-P0-039, 040 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-029 | Member FK CASCADE + adult CHECK | `profile_id` FK `SET NULL` → `CASCADE`; adult requires a profile | Baseline leaves a profile-less adult member orphan | `household_members` | B4-P0-019 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-030 | Account-deletion purge order | Explicit 10-step order driven by the RESTRICT edges | Deleting `auth.users` alone fails while ledger rows exist | `private.purge_account` | **B4-P0-049** | T3 — NON-BLOCKING | **Yes** |
| SD4-037 | `origin_device_id`, no registry | `uuid NULL` column; no device table | Provenance for collision diagnosis, not an access-control input | 11 tables | — | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-039 | Revoke TRUNCATE/REFERENCES/TRIGGER | And DELETE except `discovery_answers` | RLS does not govern TRUNCATE | All tables | B4-P0-040 | T2 — IMPLEMENTATION-REQUIRED | No |
| SD4-040 | Column-level client writes | ~20 column grants so `id`, `household_id`, `local_id`, `revision`, `created_at`, `updated_at` are unwritable | Survives a policy being widened by mistake | 11 tables | B4-P0-040 | T2 — IMPLEMENTATION-REQUIRED | No |

**Deferred decisions:**

| ID | Title | Maps to an open P0/P1? | Can schema implementation begin without it? |
|---|---|---|---|
| SD4-028 | Child-data minimization | **No** — HR-06 is P2. No production create path for children exists, so a real household holds zero child rows | **Yes.** It is a future data-shape question, not a Build 4 blocker |
| SD4-034 | Production backup / PITR posture | **No** — HR-14 is P4, and it is gated at Checkpoint #2 (B4-P0-052 / OD-2) | **Yes for Staging. NO for Production.** A destructive migration against a database with no PITR is exactly what Checkpoint #2 exists to weigh |

**No P0 or P1 hides behind a DEFERRED item.** Both deferrals map to P2 or P4 findings, and both are explicitly re-raised at their gates.

**Also requiring an owner answer before implementation** (not register decisions, but open questions this design cannot close on its own):

| Item | Question |
|---|---|
| **NHR-01** (P2) | Apply the child-scope subject CHECK to `events` and `tasks`? |
| **NHR-02** (P2) | Accept the `ensure_rls` residual, revoke the `authenticated` TABLES default, or add a migration-time RLS assertion? |
| **NHR-05** (P2) | Harden the `herkeys.*` escape hatches with a role assertion? |
| **HR-05** (P2) | What placeholder rule fills `household_members.display_name` for a real user who has no display name? |

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

## 16. Status

| Item | Status |
|---|---|
| Entry gate (this pass) | **PASS** after the authorized accounting correction |
| Register accounting correction | **COMPLETE** (section 13) |
| Four owner resolutions applied | **COMPLETE** — HR-01, HR-02, HR-03, HR-04 |
| 30 original attacks re-verified | **COMPLETE** — 24 STILL RESOLVED, 6 CHANGED ANSWER, **0 REGRESSED** |
| New hostile review | **COMPLETE** — 0 P0, 0 P1, 3 new P2, 2 new P3 |
| SQL draft syntax / runtime correctness | **UNVERIFIED** — design-only; no parse, no apply, no database contact |
| Schema implementation, RLS, Auth, sync, local v3, bootstrap, deletion | **NOT_EXECUTED** |
| Staging / Production contact | **NOT_EXECUTED** — zero connections, zero credentials, zero remote CLI |
| Push / PR / merge | **NOT_EXECUTED** |
| **A. HOSTILE DESIGN QUALITY** | **PASS** — P0 open = 0, P1 open = 0 |
| **B. IMPLEMENTATION AUTHORIZATION** | **PENDING-OWNER** — 30 PROPOSED and 2 DEFERRED decisions remain unapproved (section 14) |
| **FINAL SD4 STATUS** | **PENDING-OWNER** |

These two statuses are distinct and are not collapsed. The design survived hostile review; the owner has not yet approved the complete implementation package.

**HARD STOP.** No SQL moved into `supabase/migrations/`. No schema applied. No Supabase, Staging or Production contact. No RLS, Auth, sync, local-v3 or bootstrap implementation. Nothing pushed. Awaiting owner review of the remaining implementation authorization package.
