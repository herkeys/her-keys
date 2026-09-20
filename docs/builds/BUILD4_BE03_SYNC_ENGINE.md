# Build 4 — B4-BACKEND-03: the local-v3 sync engine

Local only. No Staging, no Production, no remote command, no credential.

| | |
|---|---|
| Branch | `build/04-cloud-identity-sync` |
| Entry HEAD | `15b275ceb1a642aef0e86949c325891f8ed276df` |
| Baseline migration SHA-256 | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` |
| Entry shipping migration SHA-256 | `9feac67283896d310ed4239776dcd10f3d624cc57be742683e8fa5de35e06b86` |
| Entry local fingerprint | `0fc7b9bf380faaf9fa20b4859e8adf6d` over 1294 facts |
| Entry app tests | 419 / 419 |
| Entry backend harness | 281 / 281 |

> **ATTESTATION UPDATE — B4-FOUNDATION-BUILDOUT-01.** The values below labelled **CURRENT** or **POST** were current as of this wave (B4-BACKEND-03). The migration, the fingerprint and several interfaces have moved on. The chain continues here; the body is **kept unchanged** as history.

| Statement | PRE-B4-FOUNDATION-BUILDOUT-01 | CURRENT (as of B4-FOUNDATION-BUILDOUT-01) |
|---|---|---|
| Shipping migration SHA-256 (working-tree form) | entry `9feac672…`; this wave's **CURRENT** `529e3891101231fa…`; and `275e9d1cd81a3d4361715a6d91a084ad95de2ccbd83c67f56e6ca0d3143e8436` after the sync journeys | **`1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb`** |
| Local gating digest | entry `0fc7b9bf…` / 1294; this wave's **POST** `db61912018a5c32f97c0b9ea40b752bf` / 1300; and `d2b319d0253613d6a5c1dd36ef906da6` / 1300 immediately before the buildout | **`199ed4d4c1b37cd654b5853e91cbde27` / 3613** |
| Claim contract | `claimPayloadVersion: 1` | 2 |
| Pull | `sync_pull(p_cursor xid8)`, household from `private.current_household_id()` | `sync_pull(p_cursor xid8, p_household_id uuid)`. `current_household_id()` is removed; `private.resolve_household_context(uuid)` refuses an unnamed household when the caller belongs to several. The transport is `pull(cursor, limit, householdId)` |
| Push | "CREATE, for the eight entity kinds that carry `(household_id, local_id, origin_device_id)`" | the allow-list is **25 tables**, the 16 client-written foundation tables among them. Executions and outcomes are deliberately absent: the server writes them, a device only pulls them |
| Synced kinds | the core kinds | **28**: 10 core and 18 foundation. Pull applies oldest-first in dependency rank; a pending create from another device is a collision; a concurrent identical fact is ADOPTED and a competing answer DISPLACES the loser, whose intent is kept as conflict evidence |
| Envelope (section 6) | the local-v3 envelope | local schema v4; the sync namespace's shape is unchanged |
| Conflict principle | server revision is authority; no automatic field merge | **unchanged** |
| Backend harness | 281 / 281 at entry, 365 / 365 at the end of this wave | 684 / 684 |

---

## §A — the completed-claim divergent replay contract

**METHOD.** `node supabase/tests/run.mjs 72`, suite `72-claim-closure.sql`, USER F
(`7f000000-…-00000000000f`). First claim carries `task-1` and one One Move.
The replay reuses the SAME `claim_key` — which is exactly the crash case, since a
client that persisted its id map would never replay — and carries a divergent
payload with a second task and a second One Move added afterwards.

**RAW RESULT**

```
ok  16a. the first claim completes
ok  16b. replaying a COMPLETED claim returns the authoritative result
ok  16c. the divergent retry was NOT merged: still one task, not two (1)
ok  16d. the later local One Move stays local for B4-BACKEND-03 (1 cloud row)
ok  16e. the divergence is recorded as evidence in the existing claim row, with no schema expansion
ok  16f. the divergent replay created no second household and no second claim topology
ok  16g. the replayed claim is settled complete, with no lockout
```

**INTERPRETATION.** All nine required properties hold. 16f and 16g were **added
in this wave** under §A's instruction — the behaviour was already correct, the
assertions were missing. `16f` proves one owner membership, one household and
one claim row; `16g` proves the claim settles `complete` with a null
`rejected_reason`, so there is no lockout. The second local One Move exists only
locally and is therefore ordinary B4-BACKEND-03 sync work, which is the seam
this wave picks up.

---

## §B — sync participation matrix

Extracted, not summarised. Sources:

- **Privileges** — `information_schema.column_privileges` and
  `role_table_grants` for `authenticated`, live against the local database.
- **RLS** — `pg_policies`, `schemaname='public'`.
- **Triggers / tombstones** — the shipping migration.
- **Local producer/consumer** — `src/domain/state.ts` (`AppStateSchema`) and the
  modules that write each collection.
- **Claim contract** — B4-BE02-OR-001, `claimPayloadVersion: 1`.

Table-level privilege for `authenticated` is `SELECT` on all sixteen tables
except `discovery_answers`; every write is a **column-level** grant. That is the
privilege architecture SD4-026 built, and it is what makes the push path
expressible as ordinary DML rather than needing a privileged RPC.

| Table | Classification | Local producer | Local consumer | Server surface | Authority / extraction | Rationale |
|---|---|---|---|---|---|---|
| `profiles` | **PUSH+PULL** (narrow) | `state.user.displayName`, `state.user.timezone` | `state.user` | `SELECT`, `UPDATE(display_name, timezone)`; no INSERT policy | `profiles_select_own`, `profiles_update_own`; column grant `UPDATE -> display_name,timezone` | SD4-003 removed client INSERT: a profile exists only because bootstrap made one. Two mutable fields, both hers |
| `households` | **CLAIM-ONLY** | claim/bootstrap | `state.household` | `SELECT` only | one policy, `households_select_member`; no INSERT/UPDATE grant | B4-P0-029/039 — households are created by the RPC and by nothing else |
| `household_members` | **CLAIM-ONLY** | claim (owner + child closure) | `state.user`, `state.children` | `SELECT` only | one policy, `household_members_select_member`; no write grant | B4-P0-019 — "ordinary client sync can never create, change or remove a membership" |
| `household_categories` | **PUSH+PULL** | `addCategory`, `renameCategory`, `archiveCategory`, `reorderCategories` | `state.categories` | `SELECT`/`INSERT`/`UPDATE`, scoped policies | `categories_*_scoped`; `INSERT` 12 cols, `UPDATE` 6 cols | Ordinary household content, scope-gated. No DELETE anywhere |
| `events` | **PUSH+PULL** | event editor | `state.events` | `SELECT`/`INSERT`/`UPDATE`, scoped | `events_*_scoped`; `INSERT` 20 cols, `UPDATE` 14 cols | Removal is `status='removed'`, an UPDATE — never a DELETE |
| `tasks` | **PUSH+PULL** | task editor, One Move completion, Daily Load actions | `state.tasks` | `SELECT`/`INSERT`/`UPDATE`, scoped | `tasks_*_scoped`; `INSERT` 19 cols, `UPDATE` 14 cols | The main mutable entity. `revision` is SELECT-only, so CAS is structural |
| `household_systems` | **PUSH+PULL** | systems screens | `state.systems` | `SELECT`/`INSERT`/`UPDATE`, scoped | `systems_*_scoped`; `INSERT` 11, `UPDATE` 6 | Ordinary content. Removal semantics deferred under B4-P0-066 |
| `meal_plan_entries` | **PUSH+PULL** | meals screens | `state.meals` | `SELECT`/`INSERT`/`UPDATE`, scoped | `meals_*_scoped`; `INSERT` 11, `UPDATE` 6 | Same. Removal deferred under B4-P0-066 |
| `onboarding_state` | **PUSH+PULL** (singleton) | onboarding flow | `state.onboarding` | `SELECT`/`INSERT`/`UPDATE`, own-profile | `onboarding_*_own`; `UPDATE` 5 cols | One row per (household, profile). `log_row_change` keys it by `profile_id`: it has no surrogate id |
| `one_move_records` | **PUSH+PULL, server-owned day** | `resolveOneMoveForToday`, `completeOneMove` | `state.oneMoves` | `SELECT`/`INSERT`/`UPDATE`, own-profile | `one_move_*_own`; `logical_day` + `timezone_at_decision` are **SELECT only** | Today's row is ordinary sync; historical days can only enter through claim (B4-BE02-OR-001) |
| `needs_me_items` | **PUSH+PULL** | capture, One Move resolution | `state.needsMe` | `SELECT`/`INSERT`/`UPDATE`, own-profile | `needs_me_*_own`; `INSERT` 10, `UPDATE` 4 | Resolution is `status='resolved'`, an UPDATE |
| `discovery_records` | **PUSH+PULL + TOMBSTONE** | Talk It Out | `state.discovery` | `SELECT`/`INSERT`/`UPDATE(local_id, topic_id, deleted_at)` | `discovery_*_own`; migration comment: *"deleted_at is the tombstone"* | **The only authorised tombstone.** Build 3 clears discovery to null; a hard delete would be invisible to an offline second device (B4-P0-024) |
| `discovery_answers` | **PUSH+PULL, hard DELETE** | Talk It Out answers | `state.discovery.answers` | `SELECT`/`INSERT`/`UPDATE`/**`DELETE`** | the only table with a `DELETE` policy and table-level `DELETE` grant | Child rows of a discovery record, replaced wholesale. No `revision`, no own change_log trigger — the parent's covers them |
| `action_records` | **PUSH-ONLY, IMMUTABLE** | Daily Load decisions, One Move decisions | `state.actions` | `SELECT`/`INSERT` only | `actions_insert_own`, `actions_select_own`; **no UPDATE/DELETE grant or policy**; `forbid_ledger_mutation` trigger binds even the table owner | Historical evidence. Never regenerated, never re-targeted |
| `change_log` | **TRANSPORT/METADATA** | server triggers only | the pull cursor | `SELECT` + `sync_pull(xid8)` | `change_log_select_scoped`; no write grant | A pointer log. It is the cursor axis, never a domain entity |
| `account_claims` | **SERVER-ONLY** | `bootstrap_account` / `claim_local_household` | claim retry state | `SELECT` only | `account_claims_select_own`; no write grant | "The client may READ its own claim record… It may never write one" |

**Deletion participation (§33).** Exactly two: `discovery_records.deleted_at`
(soft tombstone) and `discovery_answers` (hard delete of child rows). Every other
table has no DELETE policy and no DELETE privilege, so deletion is not
transportable and this wave does not invent it. `one_move_records.status =
'cleared'` is **not** a tombstone — the row is revived in place under
`UNIQUE (household_id, profile_id, logical_day)`.

---

## §C — callable server surface inventory

**METHOD.** `pg_proc` joined to `pg_namespace` for `public`/`private`, with
`has_function_privilege('authenticated', …, 'EXECUTE')`.

**RAW OUTPUT (client-callable only)**

```
public.bootstrap_account(uuid, text, uuid)                secdef=true   authenticated=true  anon=false
public.claim_local_household(uuid, text, jsonb, uuid)     secdef=true   authenticated=true  anon=false
public.sync_pull(xid8)                                    secdef=false  authenticated=true  anon=false
private.can_access_scoped_row(uuid, text, uuid)           secdef=true   authenticated=true  anon=false
private.current_household_id()                            secdef=true   authenticated=true  anon=false
private.is_household_member(uuid)                         secdef=true   authenticated=true  anon=false
private.is_household_owner(uuid)                          secdef=true   authenticated=true  anon=false
```

| Path | Surface | Status |
|---|---|---|
| **Safe barrier** | `sync_pull(p_cursor xid8)` — `pg_snapshot_xmin(pg_current_snapshot())`, returns `{rows, next_cursor}` | **PRESENT.** SECURITY INVOKER, so RLS guards every row it reports |
| **Change-log pull** | same RPC | **PRESENT** |
| **Row fetch** | direct `SELECT` under RLS via PostgREST | **PRESENT** on all sixteen tables |
| **Update / CAS** | direct `PATCH … &revision=eq.<base>` under column grants + RLS | **PRESENT.** `revision` is SELECT-only and bumped by `set_row_updated_at` on UPDATE, so a stale base simply matches zero rows |
| **Create** | direct `POST` with `Prefer: return=representation`, returning the server `id` and `revision` | **PRESENT — with one gap, below** |

### The gap: SD4-006 push-side collision

**SD4-006** (OWNER-APPROVED, T1, half of IDENTITY-MAPPING-CONTRACT-01):

> **Push.** The uploading device sends `local_id` and `origin_device_id`. If a
> row already exists with that `(household_id, local_id)` and a **different**
> `origin_device_id`, the server treats it as a distinct entity: it inserts a new
> row with a fresh cloud uuid and returns `local_id_collision` alongside the new
> cloud id. It never merges.

A direct `POST` cannot do this. `UNIQUE (household_id, local_id)` rejects the
insert with `23505`, and the client may not rename its own row — B4-P0-005 keeps
existing local ids stable, so "a device only ever chooses an id for a row it has
never seen". Minting therefore has to happen server-side, and no callable surface
does it.

**Classification: P2 implementation defect inside already-approved
architecture.** The behaviour is fully specified by frozen SD4 — name, arguments,
security mode, grant posture, stale-return shape and the no-merge rule are all in
`drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql` §10 — so §C directs a local forward-fix
rather than a STOP. It is P2 rather than P1 because the unfixed failure mode is a
`23505` that becomes durable failure evidence with `needsSyncAttention` set: an
honest, visible, non-destructive outcome for a collision the design itself rates
at roughly one in 1.7 million per coinciding `(ms, counter)` pair.

Forward-fixed as `public.sync_push` under the full migration / hash / harness /
fingerprint discipline. See **§53 result** below.

---

## §53 result — B4-BE03-OR-001, the `sync_push` forward fix

`public.sync_push(p_entity_table text, p_device_id uuid, p_row jsonb)`,
**SECURITY INVOKER**, granted to `authenticated` only. Scope is deliberately
narrow: it handles CREATE, for the eight entity kinds that carry
`(household_id, local_id, origin_device_id)`. Updates, tombstones and every read
stay on PostgREST, because those already work.

Three outcomes:

| Situation | Status | Behaviour |
|---|---|---|
| local_id free | `created` | ordinary insert; server owns `id`, `revision`, timestamps |
| local_id taken by the **same** `origin_device_id` | `already_exists` | the lost-acknowledgement seam — returns the existing identity so a retry settles instead of duplicating |
| local_id taken by a **different** `origin_device_id` | `local_id_collision` | mints a fresh cloud uuid **and** a fresh local_id; **never merges** |

It probes on each table's own uniqueness boundary (SD4-004):
`(household_id, local_id)` for household-scoped tables,
`(household_id, profile_id, local_id)` for owner-private ones. Probing the wrong
boundary would either miss a real collision or invent one.

SECURITY INVOKER is load-bearing. The insert happens as the caller, so RLS and
column grants still decide what may be written. A DEFINER function would hand a
client the `postgres` role's reach — and would satisfy
`private.is_trusted_server_context()`, which is the historical-backfill key and
has no business in an ordinary push.

The entity table is an **allow-list**, not a pattern, because the statement is
dynamic SQL. Server-owned columns (`id`, `revision`, `created_at`, `updated_at`,
`subject_member_type`, `logical_day`, `timezone_at_decision`) are stripped from
the payload rather than trusted; the column grants would refuse them anyway, but
stripping gives the client a clear answer instead of a privilege error.

### Migration hash

| | |
|---|---|
| Convention | sha256 of the working-tree file (CRLF) |
| PRE-B4-BE03-OR-001 | `9feac67283896d310ed4239776dcd10f3d624cc57be742683e8fa5de35e06b86` |
| **CURRENT** | `529e3891101231faf1743f0ecbbe2dc3ccbc701037e0f2e7b5cb2fccdc63fb26` |
| Baseline (unchanged) | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` |

### Fingerprint

| | |
|---|---|
| PRE | `0fc7b9bf380faaf9fa20b4859e8adf6d` / 1294 facts |
| **POST** | `db61912018a5c32f97c0b9ea40b752bf` / **1300** facts |
| Dimensions changed | **3** |
| **UNEXPLAINED** | **0** |

```
functions            19 -> 20   +1  the new routine, no existing body changed
privileges.functions 37 -> 40   +3  its ACL: authenticated, postgres, service_role — no PUBLIC, no anon
privileges.effective 157 -> 159 +2  the two roles-of-interest holding EXECUTE; anon holds none
                                --
                                +6  1294 + 6 = 1300, the observed count
```

Fourteen dimensions byte-identical, including `relations`, `columns`,
`constraints`, `indexes`, `triggers`, `policies`, `privileges.columns`,
`privileges.relations` and `privileges.default_acl`. No relation topology, RLS,
policy, trigger or column-grant change at all. Both locked tool hashes unchanged.

**Backend harness: 281 → 365** (+29 in `74-sync-push.sql`, +2 in
`72-claim-closure.sql` for the addendum-A replay topology, and +53 sync journeys
against the real local Supabase; 0 removed, 0 failures).

The hash and digest above are the values as finally shipped: `sync_push` gained
the action ledger later in the same wave, which moved the one routine body it
owns and nothing else.

---

# Implementation

## §6 — the local-v3 sync envelope

The sync namespace lives beside the identity block B4-BACKEND-02 added to the v3
envelope (`IdentityRecord.sync`). No parallel SyncState, CloudState or
RemoteHousehold framework: one canonical local household, and metadata about it.

| Field | Holds |
|---|---|
| `accountId`, `householdId` | which account and cloud household this namespace is |
| `deviceId` | `origin_device_id`, per INSTALL — two devices of one account must differ, or SD4-006 cannot tell a lost acknowledgement from a genuine collision |
| `hydration` | `unhydrated` / `hydrating` / `ready` |
| `cursor` | the last cursor whose batch is **durable**, never the highest seen |
| `mappings` | `kind:localId` → cloud uuid + last-seen server revision |
| `queue` | durable outbound work |
| `evidence` | conflicts and permanent failures |
| `backlog` | the queue or evidence store is full; work stops before intent is lost |
| `lastSyncedAt` | for the product signal only |

It holds **no credential**. Tokens stay behind the secure-session boundary.

## §11 / §H / §M — bounds

No numeric bound exists in the frozen authority, only "bounded", so these are
named technical parameters, documented rather than scattered as literals:

| Constant | Value | What it bounds |
|---|---|---|
| `MAX_QUEUE_ITEMS` | **500** | pending work items per namespace |
| `MAX_UNRESOLVED_EVIDENCE` | **200** | unresolved conflicts before backlog |
| `PULL_BATCH_SIZE` | **200** | change-log rows per round trip; a multi-year household is many batches, and the engine supports many |

Nothing is ever evicted. At the queue bound the oldest item survives and the new
intent is **refused** — the caller must not report that change as cloud-safe. At
the evidence bound work stops entirely, because a conflict that cannot be
recorded durably is indistinguishable from a lost one.

## §E / §F — the coalescing table

At most one pending work item per `(account, kind, localId)`. No payload is
stored on the item; the row is read from canonical local state at push time, so
the latest intent goes out while `baseRevision` and `order` stay where the first
edit found them.

| pending | incoming | result | why |
|---|---|---|---|
| create | update | **create** | the cloud has never seen it: one create carrying the latest state |
| create | tombstone | **tombstone** | a row created and removed offline still needs its removal recorded once it exists |
| update | update | **update** | latest intent, original base revision |
| update | tombstone | **tombstone** | the removal supersedes, keeping the original base |
| tombstone | anything | **tombstone** | nothing is resurrected by a later edit racing a removal |
| `action` | update | **refused** | the ledger is immutable; the attempt becomes evidence, never a silent no-op |

Three offline edits therefore produce one CAS attempt against the revision the
first edit saw, not three sequential stale ones fighting each other.

## §G — the queue is work, evidence is history

A terminal outcome leaves the queue and becomes durable evidence, so one
permanently bad row can never fill the queue and block every future change. The
evidence records what was attempted, against which cloud row, at which base
revision, what the server said, and what happened to the queue item — and
nothing more. No transcripts, no debug blobs.

| Failure | Classification | Disposition |
|---|---|---|
| network / 08xxx / 53xxx / 57xxx | retriable | stays queued, attempt counted, bounded backoff |
| session gone (28000) | pause | cycle stops; queue untouched, attempts not burned |
| RLS / grant (42501) | permanent | `forbidden` evidence |
| CHECK / malformed | permanent | `validation-failure` evidence |
| a uniqueness invariant that encodes a competing decision | **domain conflict** | `domain-conflict` evidence, never a generic validation failure |
| stale CAS | conflict | `cas-conflict` evidence; intent preserved, unapplied |
| tombstone vs pending edit | conflict | `tombstone-conflict`; removal authoritative, intent kept |
| reference that can never resolve | permanent | `unresolvable-dependency`; the reference is named, never stripped |

## §R — the domain-conflict taxonomy

SQLSTATE alone does not classify. `23505` is a uniqueness violation, but whether
it is malformed input or a competing valid decision depends on **which**
invariant fired. `one_move_records_household_profile_logical_day_key` is two
devices legitimately deciding different things for the same product day; calling
that a validation error would hide a real disagreement behind a generic failure.

## §33 — deletion participation

Two, both extracted: `discovery_records.deleted_at` (soft tombstone, an UPDATE)
and `discovery_answers` (hard DELETE of child rows). Every other table has no
DELETE policy and no DELETE privilege. `one_move_records.status = 'cleared'` is
**not** a tombstone — the row is revived in place under the day key. Local action
trimming at the 10,000 cap emits no cloud delete **by construction**:
`ALLOWED_OPS.action` is `['create']`, and no path produces anything else
(SD4-021).

## §36 — OR-002 migration evidence

**LOCAL EVIDENCE PRESERVED. CLOUD DESTINATION = NONE.**

There is no sync entity kind for migration evidence and no cloud table it maps
to, which is the structural reason a pull cannot touch it. A pull that rewrites
everything else leaves it verbatim — status not rewritten, catalog target not
turned into a cloud one. No cloud evidence table was invented.

## §I — the user-visible signal

`needsSyncAttention` and `needsSyncAttentionCount`, derived from unresolved
evidence and the backlog flag, surfaced as one quiet line on Today. Nothing
else: no revisions, no queue ids, no cursors, no database errors, no dashboard.
Marking a conflict resolved clears the signal and keeps the record.

## §O / §43 — single-flight

One active coordinator cycle per account namespace. Concurrent triggers join the
cycle in flight; work that arrived during it gets exactly one follow-up pass,
never a recursive spawn. Phases run serially: **account guard → pull/reconcile →
push eligible work → settle**.

## §19 / §V — the account guard

Checked before the cycle and again before **each** network phase, because a
session can change between them. On a mismatch the cycle aborts immediately:
nothing uploaded, no pull applied to the wrong namespace, the namespace
untouched.

## §N — the pull integrity gate

`validateAppState` runs on the candidate state before the cursor is allowed past
it. On failure the cursor does **not** advance, the previous durable state
stands, and actionable evidence is recorded. A server that returns valid SQL has
not thereby earned the right to corrupt her household.

---

# Defects found and fixed while proving this

All five surfaced against the real local Supabase, not against a mock.

1. **The pull settled pending, unpushed intent.** A server revision at or below
   the base means the server has not seen the change yet; the old code applied
   the row anyway, overwriting her local edit with the version it was an edit
   *of*. Now: at-or-below leaves the row alone; above the base is compared
   against what this device would send — equal means the push landed and only
   the answer was lost, different means a real conflict. Revision alone cannot
   tell those apart, which is exactly why they looked the same.

2. **Updates sent columns with no UPDATE grant.** Postgres answered `42501`, the
   transport correctly called it forbidden, and an ordinary edit became
   permanent failure evidence while the queue reported success.
   `UPDATABLE_COLUMNS` now carries the real grant per kind, extracted from
   `information_schema`.

3. **The action ledger could not be pushed at all.** `sync_push`'s allow-list
   omitted it; its uniqueness boundary names `actor_profile_id`, not
   `profile_id`; and it carries no `revision` column, being immutable. All three
   are now handled by name.

4. **Pulled timestamps failed the integrity gate.** PostgREST returned
   `2026-09-20 12:00:00+00`, which the local ISO instant rejects, so a perfectly
   good batch was refused. They are re-rendered to the canonical form on the way
   in — the same moment, written the way the household already writes it.

5. **A pulled action record was rebuilt with a `targetType` key on every action
   type.** Only `protect_item` permits one and the local schemas are strict, so
   the record was invalid on arrival. The shape is now reproduced as it was, not
   as a union of every shape.

And one design gap, which is the most interesting of them:

**Two devices can each decide a One Move for the same product day.** The cloud
rejects the second with the HR-03 day key, and local state cannot hold both
either. The pull now understands *displacement* — an incoming authoritative row
can displace a local decision under a domain uniqueness rule — and records the
displaced intent as a **domain conflict** before applying. Not a generic
validation failure, not a second row, not a silent local disappearance. The
engine does not know which rules those are; the caller says so, because that is
where domain rules live.
