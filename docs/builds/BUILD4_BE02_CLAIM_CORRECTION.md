# Build 4 — B4-BACKEND-02 forward corrections

Implementation-level corrections discovered while building the client side of
the account claim. **SD4 remains CLOSED.** Neither correction creates an SD4
decision row; both satisfy requirements SD4 already approved.

| | |
|---|---|
| Wave | B4-BACKEND-02 (cloud identity) |
| Branch | `build/04-cloud-identity-sync` |
| Entry HEAD | `30d46b7fdace0023606aaf302d9d875106a93dbc` |
| Evidence commit (bookkeeping only) | `59c1e2c0e894718bbc8ec99f52aec9ecb34307b5` |
| Scope | LOCAL ONLY. No Staging, no Production, no remote command, no credential |

> **ATTESTATION UPDATE — B4-FOUNDATION-BUILDOUT-01.** The values below labelled **CURRENT** were current as of this wave (B4-BACKEND-02). The shipping migration and the local fingerprint have moved on. The chain continues here; the body is **kept unchanged** as history.

| | PRE-B4-FOUNDATION-BUILDOUT-01 | CURRENT (as of B4-FOUNDATION-BUILDOUT-01) |
|---|---|---|
| Shipping migration SHA-256 (working-tree form) | `9feac67283896d310ed4239776dcd10f3d624cc57be742683e8fa5de35e06b86` (this wave's value), then `529e3891…` (B4-BE03), then `275e9d1cd81a3d4361715a6d91a084ad95de2ccbd83c67f56e6ca0d3143e8436` | **`1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb`** |
| Local gating digest | `0fc7b9bf380faaf9fa20b4859e8adf6d` / 1294 (this wave), then `db619120…` / 1300 (B4-BE03), then `d2b319d0253613d6a5c1dd36ef906da6` / 1300 | **`199ed4d4c1b37cd654b5853e91cbde27` / 3613** |
| Claim payload | `claimPayloadVersion` 1 | **2**: every claimed row states its provenance, a task carries its commitment facets and exact value, and the source artifacts the rows were read from travel with them. Version 1 is refused |
| OR-001 (dependency closure) and OR-002 (catalog One Moves) | in force | both **still in force under version 2**; the closure now also covers source artifacts (`supabase/tests/73-claim-v2.sql`) |
| Baseline migration | `8bc38d66…` | unchanged |

---

# B4-BE02-OR-001 — CLAIM-ONE-MOVE-DEPENDENCY-CLOSURE

## Finding

`public.claim_local_household` could not claim any real household whose One
Move history had a target. It ingested `p_payload -> 'oneMoves'` and nothing
else, resolved the target with

```sql
SELECT t.id INTO v_task FROM public.tasks t
WHERE t.household_id = v_household AND t.local_id = (v_move ->> 'targetLocalId');
```

and never inserted the tasks that lookup searches. `v_task` was therefore always
NULL, and `target_needs_me_id` was never written at all.

**METHOD.** Disposable local database `b4_probe` on container
`supabase_db_Her_Keys`, built from the auth stub plus both migrations,
unmodified. Three synthetic `auth.users` rows.

**RAW OUTPUT — completed move targeting a task**

```
ERROR:  new row for relation "one_move_records" violates check constraint "one_move_records_target_shape_check"
DETAIL:  Failing row contains (..., 2026-09-18, America/Chicago, task, null, null, completed, ...)
CONTEXT:  SQL statement "INSERT INTO public.one_move_records ..."
PL/pgSQL function public.claim_local_household(uuid,text,jsonb,uuid) line 94 at SQL statement
ROLLBACK
```

**RAW OUTPUT — selected move targeting a Needs Me item:** same constraint,
`..., needsMe, null, null, selected, ...`

**RAW OUTPUT — census after both failures**

```
profiles=0 households=0 members=0 one_moves=0 claims=0
```

**RAW OUTPUT — control, identical payload with `status:"withheld"`**

```
PROBE4 STATUS: complete
```

**INTERPRETATION.** The claim failed closed — nothing partial was written — and
the only difference between failure and success was whether the move had a
target.

## Impact

P1. Not P0: fails closed, loses nothing locally, no security consequence. The
deferral workaround was unavailable, because `logical_day` and
`timezone_at_decision` are granted to `authenticated` on **neither** INSERT nor
UPDATE:

```
INSERT -> cleared_at, completed_at, decided_at, household_id, local_id, origin_device_id,
          profile_id, scope, status, target_needs_me_id, target_task_id, target_type
UPDATE -> cleared_at, completed_at, decided_at, status, target_needs_me_id, target_task_id, target_type
SELECT -> ... logical_day ... timezone_at_decision ...
```

A later sync push cannot create a historical One Move: the trigger would stamp
`logical_day = today`, colliding with today's real move under
`UNIQUE (household_id, profile_id, logical_day)`. Historical One Moves can only
ever enter through the trusted claim RPC, so "claim it later" is permanent
silent history loss, not deferral.

## Why B4-BACKEND-01 did not catch it

**METHOD.** `grep -oh '"status":"[a-z]*"' supabase/tests/*.sql | sort | uniq -c`,
then inspection of each site.

**RAW OUTPUT**

```
      1 "status":"selected"
      2 "status":"withheld"
```

**INTERPRETATION.** The two `withheld` payloads (`70-claim-bootstrap.sql:157`,
`:176`) are the only ones reaching the INSERT. The single `selected` payload
(`:191`) lands on an existing `logical_day`, takes the `IF FOUND` branch,
records conflict evidence and `CONTINUE`s. **Insert-reaching One Move payloads
with a status other than `withheld`: 0.** This is a fifth test-construction
defect, alongside the four recorded in
`supabase/tools/baselines/build4-local-fingerprint.json`.

The standing rule this produced: **fixture keyword presence is not coverage —
assert the branch that was exercised.**

## Owner decision — bounded Option A

Historical One Move records that are part of a claim are preserved **atomically
with the minimum transitive dependency set** needed to make them valid. Claim
does not become the sync engine. Not authorized: dropping targeted history,
deferring it to ordinary sync, a second post-claim backfill RPC, or uploading
unrelated local content.

---

# B4-BE02-OR-002 — LEGACY-REAL-CATALOG-ONE-MOVE-REMEDIATION

## Census evidence (OR-001 addendum §B)

**METHOD.** Enumerate the persisted domain enum, every `targetType` literal in
`src/`, the frozen v1 schema, and the producers.

**RAW OUTPUT**

```
=== domain schema enum (src/domain/state.ts:187) ===
    targetType: z.enum(['catalog', 'task', 'needsMe']),

=== every targetType literal in src/ (One Move) ===
src/domain/oneMove.ts:95:  if (state.origin === 'demo') return demoOneMoves.map((item) => ({ targetType: 'catalog', item }));
src/domain/oneMove.ts:101:    .map((task) => ({ targetType: 'task', item: taskAsOneMoveItem(task) }));
src/domain/oneMove.ts:106:    .map((item) => ({ targetType: 'needsMe', item: needsMeAsOneMoveItem(item) }));
src/persistence/envelope.ts:90:    oneMoves: v1.oneMoves.map((record) => ({ ...record, targetType: 'catalog' })),

=== frozen v1 schema (src/persistence/legacySchemas.ts) ===
129:  origin: z.enum(['demo', 'empty']),          <- v1 permits a REAL household
139:  oneMoves: z.array(OneMoveRecordSchemaV1).max(4000),
```

**RAW OUTPUT — empirical decode of a real v1 household**

```
decoded.kind = valid
origin = empty | oneMoves = [{"id":"onemove-1","forDate":"2026-09-18","targetId":"task-1",
  "targetType":"catalog","status":"completed","decidedAt":"2026-09-18T12:00:00.000Z",
  "completedAt":"2026-09-18T18:00:00.000Z","scope":"personal"}]
```

**INTERPRETATION.** The persisted enum has **three** members. `oneMove.ts:95`
produces `catalog` only for demo, but the shipped v1 → v2 migration at
`envelope.ts:90` stamps `targetType: 'catalog'` on every v1 One Move
**unconditionally, regardless of `origin`**. A real household can therefore hold
catalog One Moves, and they are permanent: `resolveOneMoveForToday` only
revisits *today's* record, and a completed move is never replaced.

## Root cause

The v1 → v2 migration assumed "only the demo seed ever produced content before
Build 3" and applied that assumption to every household, including real ones.
The later cloud model then assumed the opposite premise held —
`one_move_records_target_type_check` permits only `task` and `needsMe`, on the
stated ground that "the catalog exists only in demo households".

## Why each alternative was rejected

| Alternative | Rejected because |
|---|---|
| Add `catalog` as a cloud target type | Invents a target kind and reopens the closed cloud model |
| Rewrite `selected`/`completed` to `withheld`/`cleared` | Lies about her outcome to fit a schema |
| Drop the record | Destroys history we ourselves corrupted |
| Fail the claim as malformed input | Makes claim permanently impossible for every v1-upgraded real household |

## Owner decision

Real-household `catalog` One Moves are **legacy migration evidence**, remediated
during the local v2 → v3 migration **before** claim. Demo semantics are
unchanged: for `origin = 'demo'` catalog One Moves remain local demo behavior
and never enter claim or sync.

## Authoritative target census

| | |
|---|---|
| Persisted local enum | `catalog`, `task`, `needsMe` |
| Real cloud-claim target set after v3 remediation | `task`, `needsMe` |
| Demo-only target | `catalog` |
| Legacy real catalog | migration evidence, never a claim target |

## Forward dependency

**B4-BE02-OR-002 → B4-BACKEND-03 conflict/evidence preservation.** The sync wave
must preserve legacy remediation evidence under the approved conflict/evidence
architecture. No cloud schema object is created for it now. If no approved cloud
destination exists when that wave runs, it returns to the owner rather than
inventing one.

---

# The shipping claim payload contract — `claimPayloadVersion: 1`

This is the **first shipping claim payload contract**. The earlier
One-Move-only draft was never applied remotely and does not become a public v1
merely because it existed.

Field names follow the existing local domain model (`src/domain/state.ts`).
Local identifiers are the domain `id` values; the cloud calls them `local_id`.

```jsonc
{
  "claimPayloadVersion": 1,
  "origin": "empty",              // carried truthfully; the server refuses demo independently
  "childMembers":  [ ... ],
  "categories":    [ ... ],
  "tasks":         [ ... ],
  "needsMeItems":  [ ... ],
  "oneMoves":      [ ... ]
}
```

## `oneMoves` — the root of the closure

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `localId` | text | ✓ | canonical local id (`OneMoveRecord.id`) |
| `logicalDay` | date | ✓ | `OneMoveRecord.forDate`; may not be in the future |
| `targetType` | `task` \| `needsMe` | ✓ | **`catalog` is rejected**; frozen set only |
| `targetLocalId` | text \| null | ✓ | null exactly when status is `withheld`/`cleared` |
| `status` | `selected` \| `completed` \| `withheld` \| `cleared` | ✓ | never rewritten |
| `decidedAt` | timestamptz | ✓ | |
| `completedAt` | timestamptz \| null | ✓ | set exactly when status is `completed` |

## `tasks` — carried only when a One Move targets them

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `localId` | text | ✓ | `Task.id` |
| `title` | text | ✓ | 1..200 after trim |
| `categoryLocalId` | text | ✓ | `tasks.category_id` is NOT NULL — a task always pulls its category into the closure |
| `subjectMemberLocalId` | text \| null | ✓ | `Task.subjectMemberId`; pulls a child member into the closure |
| `durationMinutes` | int | ✓ | 0..1440 |
| `commitment` | `fixed` \| `flexible` | ✓ | |
| `dueDate` | date \| null | ✓ | |
| `planKind` | `unplanned` \| `day` \| `timed` | ✓ | from `Task.plan.kind` |
| `plannedDate` | date \| null | ✓ | set exactly when `planKind = 'day'` |
| `plannedStartsAt` | timestamptz \| null | ✓ | set exactly when `planKind = 'timed'` |
| `notes` | text \| null | ✓ | ≤1000 |
| `status` | `open` \| `completed` \| `archived` | ✓ | **preserved, never reset to open** |
| `completedAt` | timestamptz \| null | ✓ | set exactly when `status = 'completed'` |
| `originCreatedAt` | timestamptz \| null | ✓ | `Task.createdAt` — her device's time, kept distinct from server `created_at` |
| `originUpdatedAt` | timestamptz \| null | ✓ | `Task.updatedAt` |
| `scope` | visibility scope | ✓ | drives `owner_profile_id` and the child-subject rule |

## `needsMeItems` — carried only when a One Move targets them

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `localId` | text | ✓ | `NeedsMeItem.id` |
| `title` | text | ✓ | 1..200 after trim |
| `status` | `open` \| `resolved` | ✓ | preserved |
| `dueDate` | date \| null | ✓ | |
| `categoryLocalId` | text \| null | ✓ | nullable here, unlike tasks — **no category is invented to fill the closure** |
| `originCreatedAt` | timestamptz | ✓ | `NeedsMeItem.createdAt`; NOT NULL in the cloud |
| `scope` | `personal` | ✓ | the only value the cloud permits |

## `categories` — carried only when a carried target requires them

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `localId` | text | ✓ | `HouseholdCategory.id` |
| `name` | text | ✓ | 1..60 after trim |
| `systemRole` | system role \| null | ✓ | must match on adoption |
| `status` | `active` \| `archived` | ✓ | |
| `sortOrder` | int | ✓ | 0..10000, unique per household and **NON-DEFERRABLE** |
| `scope` | visibility scope | ✓ | `child` is not claimable — the local category carries no subject member |

The eight starter categories are seeded by `bootstrap_account` with local ids
`cat-kids`, `cat-home`, `cat-money`, `cat-meals`, `cat-work`, `cat-wellbeing`,
`cat-relationships`, `cat-coparenting` and sort orders 0..7 — **identical** to
`starterCategories()` in `src/domain/categories.ts:14-21` (verified 8/8 on
local_id, name, system_role and scope). A required starter category is therefore
**adopted**, never re-inserted, and no translation rule is needed.

## `childMembers` — carried only when a carried target is child-subject

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `localId` | text | ✓ | `Child.id` |
| `displayName` | text | ✓ | NOT NULL for a child member in the cloud |
| `birthDate` | date | ✓ | NOT NULL for a child member in the cloud |

A child member is inserted with `member_type = 'child'`, `profile_id = NULL`,
`scope = 'child'`. No profile is created for a child.

## Server-owned fields the payload may never carry

`id` · `revision` · `created_at` · `updated_at` · `logical_day` ·
`timezone_at_decision` · `subject_member_type` · `account_claims.*`

`subject_member_type` in particular is derived by the
`set_subject_member_type()` trigger. The payload names the child by `local_id`
only; the server resolves the uuid and the type.

## Dependency closure rule

```
One Move (selected|completed)
  -> task            -> category                -> (child member, if the category were child-scoped: not claimable)
                     -> child member, if subjectMemberLocalId is set
  -> needsMe         -> category, only if categoryLocalId is not null
```

Recursion goes exactly as far as structural validity requires and no further.
Every carried object must have a direct structural path back to a One Move being
claimed.

`withheld` and `cleared` One Moves have no target and contribute nothing to the
closure.

## Server-enforced boundedness

The RPC recomputes the closure from `oneMoves` and rejects any payload carrying
an object outside it, rather than ignoring the extra. **"Claim is not sync" is
executable, not prose.**

## Insert order

```
profile -> household -> owner membership -> starter categories   (bootstrap_account)
        -> child members
        -> categories (adopt or insert)
        -> tasks
        -> needs_me_items
        -> one_move_records
        -> account_claims completion
```

## Identity resolution

Resolve-or-create on the already-approved boundary — no new mapping
architecture. Verified present:

| Entity | Unique identity boundary |
|---|---|
| `household_members` | `UNIQUE (household_id, local_id)` |
| `household_categories` | `UNIQUE (household_id, local_id)` |
| `tasks` | `UNIQUE (household_id, local_id)` |
| `needs_me_items` | `UNIQUE (household_id, profile_id, local_id)` |
| `one_move_records` | `UNIQUE (household_id, profile_id, local_id)` |
| `households` | per-account via `household_members.profile_id WHERE role='owner'` (SD4-023) |

On adoption the existing row is validated for compatibility and **never
overwritten** to make a retry succeed.

## Returned id map

`private.claim_result` returns `local_id -> cloud uuid` for the household,
members, categories, events, tasks, Needs Me items and One Move records — the
whole closure, not just One Move targets. B4-BACKEND-03 begins from that map and
recognizes these objects as already in the cloud.

## Failure and retry semantics

- **Missing or malformed target** — fail closed, whole transaction rolls back,
  structured evidence names the unresolved local id. Never fabricated, dropped,
  stripped or rewritten.
- **Completed claim replayed** — the authoritative completed result is returned
  with its mappings. A divergent retry payload is **not** merged; later local
  changes stay local and belong to B4-BACKEND-03. Divergence is recorded in the
  existing `account_claims.row_counts` jsonb; no column or table is added for the
  diagnostic.
- **Crash mid-claim** — same `claim_key` resumes; every closure object resolves
  to the same cloud uuid, with no duplicate and no second household.

## Client-side hard assertion

`buildClaimPayload` rejects any real claimable One Move whose `targetType` is
outside `{task, needsMe}`. A residual `catalog` after v3 migration is a local
invariant failure and fails locally — it is never silently filtered, sent,
restatused or dropped.

---

# Correction results

## Implementation defects found while building the correction

**A `FOUND` capture bug in the category loop.** The existence probe and the
payload lookup were two queries, and `FOUND` was read after the second one — so
a category the client *supplied* was mistaken for one the cloud *already had*,
and never inserted. Caught by the Needs Me category case failing with
`unresolved_category`; fixed by capturing `FOUND` into `v_found` at the point of
the existence probe, with a comment saying why.

## Backend harness

| | |
|---|---|
| BEFORE | **233** checks |
| AFTER | **276** checks |
| NEW | **43** (all in `72-claim-closure.sql`) |
| REMOVED | **0** |
| FAILURES | **0** |

**METHOD.** `node supabase/tests/run.mjs`, then per-file attribution of each
`ok`/`FAIL` line.

**RAW OUTPUT**

```
10 00-interlock.sql        25 50-privileges.sql       10 90-change-cursor.sql
26 10-rls-matrix.sql       13 60-trusted-context.sql  12 92-one-move.sql
 9 20-scope-isolation.sql  29 70-claim-bootstrap.sql  13 95-action-records.sql
14 30-child-subject.sql    43 72-claim-closure.sql    13 99-fail-closed.sql
11 40-server-columns.sql   10 80-revision-cas.sql
276/276 checks passed
```

**INTERPRETATION.** 233 + 43 = 276 exactly, so the delta is purely additive: no
previously passing check was removed or weakened. Every previously established
security behaviour — RLS, scope isolation, child subject, server columns,
privileges, trusted context, CAS, cursor, One Move, action records, fail-closed —
remains green.

`70-claim-bootstrap.sql` kept its count. One test inside it was **rewritten**,
not removed: its divergent-retry payload named no target at all, so after the
correction it would have been refused for malformedness before ever reaching the
historical INSERT. It now carries a real target and is turned back by the stored
row, which is the branch it always claimed to be testing.

## Migration hash

| | |
|---|---|
| Convention | sha256 of the **working-tree** file (CRLF here: `core.autocrlf=true`, no `.gitattributes`) |
| PRE-B4-BE02-OR-001 | `44603a279325514c27b55fe9a5875906e275d3757ca167230f62dcebbb08a935` |
| **CURRENT** | `9feac67283896d310ed4239776dcd10f3d624cc57be742683e8fa5de35e06b86` |
| Baseline (unchanged) | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` |
| Historical implementation commit | G2 `6db2d5a` |

The committed G2 blob converted back to CRLF reproduces `44603a27…` exactly, so
the pre-correction hash and the hashing convention are both confirmed rather
than asserted. A later Staging preflight must verify it is applying
`9feac672…`.

## Fingerprint

| | |
|---|---|
| PRE-CORRECTION DIGEST | `c70ee89ba3e8bf67155cf7cadfa42b81` |
| **POST-CORRECTION DIGEST** | `0fc7b9bf380faaf9fa20b4859e8adf6d` |
| Facts | 1294 → 1294 (unchanged) |
| Result rows | 17 → 17 |
| Dimensions changed | **1** |
| **UNEXPLAINED** | **0** |

**METHOD.** `supabase db reset --local`, then the **unmodified** locked Phase 1
tool executed read-only via psql against the local `postgres` database — the
same method as the pre-correction capture. Both tool hashes verified unchanged.

Sixteen dimensions are byte-identical: schemas, relations, columns, constraints,
indexes, triggers, policies, types, `info.event_triggers`, `info.extensions`,
and every privilege dimension. Relation topology, RLS and the privilege posture
did not move. §O warned against assuming that; it was extracted.

`functions` changed digest at an **unchanged count of 19**. To attribute it
precisely, two disposable databases were built from the same auth stub and
baseline — one with the committed G2 migration normalized back to CRLF, one with
the corrected file — and the locked tool's functions-dimension line was diffed
for every routine in `public` and `private`.

**RAW OUTPUT**

```
11c11
< public.claim_local_household(...)|body_md5=204c8021a8b6d3c9a6259da952e18dc5
---
> public.claim_local_household(...)|body_md5=9ee5d8e8115f8251d1b056d1a683e5a3
```

**INTERPRETATION.** Exactly one routine line differs, and only in `body_md5`.
Signature, return type, language, kind, security mode, volatility, leakproof,
strict, parallel, config and owner are unchanged; the other 18 routines are
byte-identical. The count did not move, so no routine was added or removed.
**GOVERNING AUTHORITY: B4-BE02-OR-001 (bounded Option A).**

## Remote command status

None. No Staging, no Production, no `supabase login`, no `db push`, no
`db remote commit`, no migration repair, no credential read, no push, no merge.
Every database touched is a disposable local one on `supabase_db_Her_Keys`.

## Correction commit

`24e9fae7403adaff45ec38743d44a694b7fabf2c` — *fix(build4): preserve one move targets during household claim*.
Preceded by `59c1e2c0e894718bbc8ec99f52aec9ecb34307b5`, the unrelated reporting
correction, banked separately so it is not mixed into the migration fix.
No amend, no rebase, no squash, no push. G1-G4 untouched.

---

# B4-BACKEND-02 implementation results

| | |
|---|---|
| Final HEAD | `4fca9613fb2e2bc04b4c2198a674b0bb3550262b` |
| Worktree | clean |
| Backend harness | **281/281** (233 at entry) |
| App tests | **419/419**, 87 suites (362 at entry) |
| TypeScript | `tsc --noEmit` clean |
| Expo Doctor | 20/21 — one **pre-existing** failure, see below |
| P0 | **0** |
| P1 | **0** open. The original claim P1 is CLOSED: both branches are green |

## Commits

```
59c1e2c  docs(build4): withdraw the unsupported P2/P3 defect count
24e9fae  fix(build4): preserve one move targets during household claim
11fa05b  docs(build4): record the claim correction commit sha
c1a2207  feat(build4): remediate legacy catalog one moves into local evidence
4fca961  feat(build4): connect the app to supabase identity
```

No amend, no rebase, no squash, no push. G1–G4 untouched.

## What the wave delivered

| Requirement | Where |
|---|---|
| One account state boundary | `src/domain/account/authState.ts` — nine states as a reducer |
| Secure session storage | `secureSession.ts` + `platform/secureStore.ts`, own key, never the household blob |
| Provider adapters, typed results | `provider.ts`, `platform/appleProvider.ts`, `platform/googleProvider.ts` |
| Local persistence v3 + v2→v3 migration | `persistence/envelope.ts`, `legacySchemasV2.ts` |
| Legacy catalog remediation | `migrateV2ToV3` → `AppState.migrationEvidence` |
| Stable-ID normalization (AMD-01) | `normalizeOnboardingIds` |
| Bootstrap / claim orchestration | `accountRuntime.ts` |
| Exact onboarding resume | `onboardingResume` — claim never restarts onboarding |
| Crash / retry recovery | claim receipt written before the request leaves; same key replays |
| Cross-account quarantine | `boundOther` + `app/account-conflict.tsx` |
| Logout and account switching | `signOut` keeps the binding; a second account is quarantined |
| RevenueCat identity | `identifyRevenueCatAccount(uuid)` before any paywall |
| State-driven routing | `routeAccess.ts` — account is one more guard condition |
| Demo isolation | demo is never claimed; the server refuses it independently |
| Auth-degraded mode | expired or unreachable keychain degrades, never signs out |

## Expo Doctor

**METHOD.** `npx expo-doctor`, then `git show 30d46b7:package.json` for the same
three ranges at the entry HEAD.

**RAW OUTPUT**

```
20/21 checks passed. 1 checks failed.
✖ Check that packages match versions required by installed Expo SDK
package         expected  found
expo            ~57.0.24  57.0.22
expo-constants  ~57.0.19  57.0.18
expo-router     ~57.0.22  57.0.21

at entry HEAD: {"expo":"~57.0.22","expo-constants":"~57.0.18","expo-router":"~57.0.21"}
now:           {"expo":"~57.0.22","expo-constants":"~57.0.18","expo-router":"~57.0.21"}
```

**INTERPRETATION.** The three ranges are byte-identical to the entry HEAD, so
the failure predates this wave and is unchanged by it. Every package added here
(`expo-secure-store`, `expo-apple-authentication`, `expo-auth-session`,
`expo-web-browser`, `expo-crypto`) matches its SDK 57 expectation — none appears
in the failure list. Left alone deliberately: bumping the router and the SDK
runtime mid-wave, with no way to smoke-test the running app from here, is the
riskier of the two options. It is a one-command fix (`npx expo install --check`)
whenever a device run is available to confirm it.

## Remote command status

None. No Staging, no Production, no `supabase login`, no `db push`, no
`db remote commit`, no migration repair, no credential read, no push, no merge.
Every database touched is a disposable local one on `supabase_db_Her_Keys`, and
the ad-hoc probe databases are now dropped deterministically by the harness at
every start.
