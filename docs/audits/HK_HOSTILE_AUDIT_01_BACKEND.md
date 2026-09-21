# HK-HOSTILE-AUDIT-01 — Hostile Supabase/backend audit

## A. Backend architecture actually observed

The backend is a local-first application with:

- one canonical versioned `AppState` envelope on device;
- a separately persisted identity block containing account binding, claim receipt, quarantine and sync namespace;
- Supabase Auth UUID as profile/account identity;
- one household membership boundary with owner/private/shared scopes;
- an idempotent bootstrap/claim RPC seam;
- a local-id ↔ cloud-UUID mapping, bounded outbound queue, durable conflict evidence and xid8 change cursor;
- explicit revision/CAS for mutable rows;
- Postgres RLS/grants/constraints/triggers as a second authorization and integrity boundary;
- two SQL migrations: an immutable baseline and a destructive zero-data Build 4 schema migration;
- no application Edge Functions.

The pure claim, queue, projection, push, pull and coordinator modules exist and are heavily tested. The production app composes auth/claim but does **not** compose the sync coordinator or a domain-mutation-to-queue bridge. That distinction controls the verdict.

## B. Schema/domain parity

| Canonical concept | Local representation | Cloud representation | Identity / revision | Round-trip result |
|---|---|---|---|---|
| Household/profile/child member | `household`, `user`, `children` | `households`, `profiles`, `household_members` | claim-only UUID mappings; membership not ordinarily pushable | Household/profile bootstrap is represented; children outside claim closure cannot obtain an ordinary-sync mapping (HA-001) |
| Category | `categories[]` | `household_categories` | `(household_id, local_id)`, revision | Core fields sync; cloud also has child subject while local category has no subject — currently unused/latent loss |
| Event | `events[]` | `events` | local/cloud mapping + revision | Represented, including subject, scope, travel/preparation and provenance |
| Task | `tasks[]` | `tasks` | mapping + revision | Structurally represented; missing/default duration provenance is lost on both sides (HA-010) |
| System | `systems[]` | `household_systems` | mapping + revision | **Lossy:** cloud subject member has no local field/projection (HA-011) |
| Meal | `meals[]` | `meal_plan_entries` | mapping + revision | Core/facet representation exists |
| Needs Me | `needsMe[]` | `needs_me_items` | mapping + revision | Represented; owner-private scope enforced |
| One Move | `oneMoves[]` | `one_move_records` | logical day + profile; revision | Typed target and server-owned logical day represented; claim carries history |
| Discovery/onboarding | singleton-ish local fields | `discovery_records`/answers, `onboarding_state` | profile identity + revision | Represented; discovery tombstone is the only soft-delete transport |
| Action record | `actions[]` | `action_records` | append-only UUID mapping | Insert-only; mutation forbidden |
| Source artifact / external reference / interpretation | foundation collections | dedicated tables | mapping + revision where mutable | Metadata/digest/reference sync; raw words are intentionally absent |
| Observation / intent / decision | foundation collections | dedicated append-only/mutable tables | mapping/revision per manifest | Represented with typed references and provenance |
| Execution / outcome | foundation collections | server-written tables | pull only | Correctly not client-pushable |
| Person / responsibility | foundation collections | dedicated tables | mapping + revision | Represented; runtime semantics repaired in features |
| Dependency / recurrence / goal / system step / capacity / pattern / evidence link | foundation collections/singleton | 18 generated foundation tables | manifest-derived mapping, ops, rank and columns | Structural representation exists; removed-prerequisite meaning and occurrence materialization remain product gaps |
| Migration evidence/lineage | local-only arrays | none | local envelope only | Intentionally local; survives sync activity but does not travel |

Unknown values are generally nullable in both representations. Money uses integer minor units/currency/direction. Scope and owner-profile pairing are constrained. Server-owned ids/timestamps/revisions are not accepted as ordinary client truth. The demonstrated parity failures are HA-010 and HA-011; the first-sync seam makes otherwise valid mappings unreachable in production (HA-001).

## C. Row-level security

Observed live local schema: **85 policies across 34 application tables**. Every application table has RLS enabled; the fingerprint also includes effective/default/schema/function/column privileges.

Policy families:

- `households` and `household_members`: member SELECT only; ordinary clients cannot create/change membership.
- scoped content (`events`, `tasks`, `household_categories`, `household_systems`, `meal_plan_entries`): SELECT/INSERT/UPDATE through `private.can_access_scoped_row`, with household/owner/subject checks and no ordinary DELETE.
- owner-private content (Needs Me, One Move, onboarding, discovery and most foundation rows): profile/household-bound SELECT/INSERT/UPDATE as allowed by lifecycle.
- append-only ledgers/evidence: SELECT/INSERT only; trigger/grant defense prevents mutation.
- server-written execution/outcome: SELECT only to the authorized owner.
- `change_log`: scoped SELECT; rows are filtered by accessible household/profile context.
- `account_claims`: caller’s own claim receipts only.

The real harness tested positive and negative authorization, cross-user household attachment, owner/private/shared scopes, child subjects, trusted context and privilege drift. User A could not read/update/attach to User B’s records; ordinary client roles did not inherit service-role capabilities. No `USING`/`WITH CHECK` asymmetry producing a demonstrated reassignment hole was found.

## D. Auth/identity boundary

- Auth UUID becomes `profiles.id` and the account id used by binding.
- `bootstrap_account` is idempotent by claim key, validates caller/timezone, creates profile/household/owner membership/starter categories and returns an id map.
- `claim_local_household` first obtains/replays bootstrap, refuses demo origin, requires payload v2, validates a minimal transitive One Move closure and returns stable mappings.
- The client writes a receipt before the request, reuses the same key on retry, and only calls the account bound after binding + namespace are durably saved.
- Sign-out clears the credential but retains the binding. Same-account sign-in resumes; different-account sign-in quarantines local state.
- Expired/unavailable secure sessions degrade rather than erase or rebind.

HA-002 repaired the local-content decision boundary. HA-001 remains: a correct durable binding is not equivalent to a running sync integration.

## E. Claim/migration

Claim strengths:

- idempotent claim key and replay result;
- demo refusal on client and server;
- exact payload version and strict object/lifecycle validation;
- no filtering of malformed/extraneous closure rows;
- stable local-id/cloud-id map;
- CAS starts at server revision 1;
- conflicts/refusals are explicit, not optimistic success;
- provenance and exact task facets are carried for claimed rows.

Claim boundary:

- it intentionally carries One Move history plus only the dependencies necessary for that history;
- unrelated events, tasks, Systems, meals, Discovery and most foundation rows are excluded;
- unrelated children are also excluded, but household members are claim-only and ordinary sync cannot create them.

That boundary is safe only if the subsequent initial-sync composition proves every excluded row can be queued and all mapping-only dependencies already exist. It currently does not. The repaired classifier selects claim rather than bootstrap for those households, but the transfer remains stopped.

## F. Sync

The implemented engine has good internal properties:

- bounded queue (500), one pending item per `(kind, localId)`, deterministic dependency scheduling;
- create/update/tombstone coalescing without payload snapshots;
- projection reads latest canonical state while preserving original CAS base;
- explicit unresolved-reference handling;
- idempotent create collision semantics based on `(household_id, local_id)` and origin device;
- pull-before-push coordinator, one active cycle/account, account guard at every network boundary;
- durable state+namespace+cursor commit contract;
- terminal failures become evidence rather than hot loops;
- append-only and server-written kinds cannot be mutated through queue ops.

The integration failure is equally clear:

- `namespaceFromClaim` maps returned ids and returns `queue: []`;
- production code has no caller of `createSyncCoordinator`;
- production mutations do not atomically add queue intent to the identity namespace;
- the existing tests manually construct/enqueue namespaces and therefore cannot prove app composition.

Result: the engine is suitable material for integration, but the application does not currently operate it.

## G. CAS, writeSeq and revisions

- Local `writeSeq` orders envelope writes; the write queue serializes, retries once and skips safely to the newest pending state. Old writes cannot land after new writes.
- Every mutable cloud row has `revision >= 1`; CAS update paths require the expected revision and increment on success.
- Queue items capture the first pending base revision; subsequent edits coalesce without moving that base.
- Duplicate create acknowledgement is idempotent; stale update becomes durable CAS conflict evidence.
- Change cursor is xid8, independent of row revision. Pull snapshots and commits cursor only with applied state/mappings.
- No timestamp last-write-wins path was found.

The harness attacked same revision twice, stale/lower revisions, delayed/replayed mutation and two-device edits. These held against real PostgreSQL/PostgREST.

## H. Constraints

The live fingerprint contains **678 constraints**, **284 indexes**, **713 columns** and **104 non-internal triggers**. Material invariants include:

- composite household foreign keys prevent cross-household reference substitution;
- child subject/type pairing and scope constraints;
- owner-private scope/profile pairing;
- unique local identity per household;
- category/system-step ordering uniqueness and dense-order tests;
- lifecycle CHECKs for completion/decision/withdrawal/interpretation states;
- dependency cycle prevention;
- responsibility/authority/execution authorization coverage;
- immutable ledger triggers;
- revision checks and change-log triggers;
- exact money and typed-reference checks generated from the shared manifest.

Duplicate, orphan, invalid enum/lifecycle, child/person, dense/swap reorder, dependency cycle, recurrence/responsibility uniqueness and server-owned-column attacks were covered locally. No demonstrated missing index or unbounded query in the implemented RPC paths rose to P0–P3.

## I. PostgreSQL functions, RPCs and triggers

Live inventory: **27 application functions**. All have a pinned search path (`''`, except `rls_auto_enable` uses `pg_catalog`).

| Group | Functions | Mode / caller / purpose |
|---|---|---|
| Authorization/context | `private.can_access_scoped_row`, `is_household_member`, `is_household_owner`, `resolve_household_context` | SECURITY DEFINER; authenticated policies/RPC context; explicit household validation |
| Claim helpers | `private.claim_artifact_id`, `claim_result`, `insert_starter_categories` | SECURITY DEFINER; claim/bootstrap implementation; not general client mutation |
| Schema gate | `private.assert_app_schema_secured` | SECURITY DEFINER, service role only; migration-time privilege/RLS assertion |
| Pure validation | `private.is_trusted_server_context`, `is_valid_timezone` | INVOKER; trusted-context/timezone checks |
| Public RPC | `public.bootstrap_account`, `claim_local_household` | SECURITY DEFINER; authenticated, idempotent account creation/claim with explicit validation |
| Sync RPC | `public.sync_pull`, `sync_push` | INVOKER; authenticated; RLS/grants remain active, explicit household/table allowlist |
| Server-owned/change log | `public.log_row_change`, `set_one_move_logical_day` | SECURITY DEFINER; trigger-only, execute revoked from client roles |
| RLS enforcement | `public.rls_auto_enable` | SECURITY DEFINER, `pg_catalog`; event trigger prevents new public tables escaping RLS |
| Integrity triggers | `enforce_single_column_transition`, `forbid_dependency_cycle`, `forbid_ledger_mutation`, `force_server_owned_id`, `freeze_decided_interpretation`, `guard_execution_authorization`, `guard_withdrawal`, `set_child_member_type`, `set_row_updated_at`, `set_subject_member_type` | INVOKER trigger functions; validate/fill only the owning row and fail transactionally |

Security-definer inspection found no unpinned lookup path or demonstrated client execute grant on trigger-only/server-only functions. Side effects are transactional. RPC retries are keyed/idempotent where required; sync create collision and CAS behavior are explicit.

## J. Edge Functions

**ABSENT.** There is no `supabase/functions` application directory and nothing was deployed/invoked. Account deletion, provider token revocation and external action execution are not implemented capabilities. This audit did not invent them.

## K. Recovery/quarantine

Local envelope recovery distinguishes malformed, future-version, unreadable, mode-mismatch and read-failure states. Future/read-failed bytes are preserved and the session becomes memory-only. Cross-account data is quarantined and neither rendered nor uploaded.

Sync terminal problems retain bounded evidence. Tombstone/edit races, identity collisions, validation failures, forbidden writes and unresolvable dependencies are distinguished.

Weakness: a malformed/incompatible pull row refuses the batch and retains the old cursor. That is safely fail-closed but violates the aspirational “one bad record does not stop the account” requirement. Row-level quarantine/version compatibility is P4 debt because database constraints make corruption abnormal and skipping without a designed evidence/cursor contract would be less safe.

## L. Demo/account isolation

- demo origin is stored explicitly;
- demo/real mode mismatch never adopts the other state;
- demo binding is refused locally and by `claim_local_household`;
- an encoded demo household has no sync namespace;
- account namespaces include account, household and per-install device ids;
- account switch quarantines rather than merges;
- RLS and composite foreign keys prevent cross-account/household attachment.

No demo-to-account or account-to-demo leak was reproduced.

## M. Backend harness weaknesses

What the 684-check harness genuinely proves:

- migrations run against disposable real PostgreSQL;
- client-role RLS/grants and service-role-only setup are distinct;
- claim/RPC/CAS/change-cursor behavior is not mocked;
- PostgREST multi-device sync integration is exercised;
- environment A verifies test-only producer defaults are absent;
- fingerprint and generated-SQL reconciliation detect schema drift.

What it does **not** prove:

1. The production application composes the coordinator (it does not).
2. A pre-sign-in System, event or Talk It Out artifact excluded from claim becomes initial queue work and reaches device B.
3. A child used only by an excluded row obtains the mapping ordinary sync is forbidden to create.
4. Queue seeding above 500 fails without silently omitting rows.
5. A malformed pulled row can be quarantined while later valid rows progress.
6. F04 child-subject round-trip fidelity.
7. Upgrade from a populated baseline; resets always satisfy the shipping migration’s zero-data interlock.
8. Real remote provider/session configuration; intentionally out of scope.

The material missing journey is HA-015 and must be added with HA-001’s integration repair.

## N. Performance/query findings

The relevant RPCs use explicit household context, indexed identity/household/subject columns, bounded pull batches (200) and a 50-batch coordinator cap per cycle. Queue/evidence are bounded. Generated foundation specs declare indexes for reference and uniqueness access patterns. No demonstrated N+1 or missing-index correctness defect was found.

The 50-batch cap means a very large backlog may need another trigger; the coordinator’s “again” behavior and future foreground/network triggers can continue. Because production coordinator composition is absent, runtime performance cannot yet be truthfully certified.

## O. Migration integrity

- Migration order is deterministic: `20260919230054_build4_baseline.sql`, then `20260919231500_build4_cloud_schema.sql`.
- The second migration opens its own transaction and has a zero-data/auth-user interlock before destructive rebuild.
- Generated foundation SQL reconciles with `foundationSpecs.ts`.
- Runtime-required tables, policies, privileges, functions and triggers exist in migration history and live local schema.
- Current local schema fingerprint exactly matches the committed Build 4 foundation artifact: **3,613 facts / `199ed4d4c1b37cd654b5853e91cbde27`**.
- Shipping migration hash is unchanged: `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb`.

The migration is not a populated-database upgrade. Its own interlock correctly aborts such use. This is acceptable only while every target environment is provably empty; otherwise an additive migration rehearsal is an integration requirement.

## P. F01 Today backend readiness

**Consumes:** tasks, events, Needs Me, One Move, responsibilities, dependencies, actions, observations/evidence, timezone/capacity-related facets.  
**Mutates:** approved action paths, One Move completion/correction and underlying tasks/events through existing domain commands.  
**Cloud/sync representation:** all principal records have tables and projection kinds.  
**Semantic loss:** removed prerequisite semantics unresolved; default duration provenance can affect capacity language.  
**Local-only behavior:** the Today briefing/view model itself and correction navigation are projections, correctly not cloud records.  
**Wiring-today risk:** mutations would not be enqueued by the production app; pre-binding rows can be stranded.  
**Classification:** **BACKEND GAP**.

## Q. F02 Talk It Out backend readiness

**Consumes/mutates:** source artifacts, interpretations, external references, accepted tasks/events/Needs Me and unresolved attention.  
**Cloud/sync representation:** foundation tables and projection specs exist; raw source content intentionally does not.  
**Semantic loss:** exact words are session-only by policy; metadata round-trip exists.  
**Local-only behavior:** deterministic reader/conversation coordinator and session text store.  
**Wiring-today risk:** a capture-only household was previously bootstrapped (repaired), but the artifact/interpretation still has no initial production queue/coordinator.  
**Classification:** **BACKEND GAP**.

## R. F03 Calendar backend readiness

**Consumes:** events, tasks, plans, recurrence, responsibility, dependencies, capacity, actions and timezone.  
**Mutates:** legitimate task/event plan edits and approved action records; preview remains ephemeral.  
**Cloud/sync representation:** tables/specs exist and CAS supports these rows.  
**Semantic loss:** duration provenance is absent; removed prerequisite meaning unresolved.  
**Local-only behavior:** projections, conflict geometry, previews and week summaries, correctly derived.  
**Wiring-today risk:** HA-001 plus a known capacity falsehood.  
**Classification:** **OWNER/SCHEMA DECISION REQUIRED**.

## S. F04 Systems backend readiness

**Consumes/mutates:** Systems, ordered steps, recurrence, responsibility, dependency and categories.  
**Cloud/sync representation:** tables/specs/CAS exist for all definition records.  
**Semantic loss:** cloud child subject is absent locally; no run/occurrence entity; no removal lifecycle.  
**Local-only behavior:** editor drafts/view models and definition-only scheduling.  
**Wiring-today risk:** HA-001 strands pre-binding Systems, and child-scoped cloud rows cannot round-trip.  
**Classification:** **OWNER/SCHEMA DECISION REQUIRED**.

## T. P0–P3 backend repairs

- **HA-002 / P2 IDENTITY:** repaired `describeLocalHousehold` so every durable non-default canonical collection, changed profile and changed category configuration prevents empty bootstrap. Audit commit `3f567d2`, regression in `tests/claimPayload.test.mjs`.
- Foundation P2 state/responsibility/recurrence repairs (`d762418`) also protect backend-bound canonical state from invalid publication, partial responsibility writes and false recurrence termination.
- HA-001, HA-009, HA-010 and HA-011 are not papered over: they cross the explicit no-wiring/schema/owner boundary and their paths are classified as not ready.

## U. P4–P10 backend debt

- P4 destructive zero-data-only migration (HA-013).
- P4 whole-batch pull refusal/no row quarantine (HA-014).
- P4 missing initial-claim-to-second-device harness journey (HA-015).
- P8 stale `sync_push` migration comment (HA-016).
- P10 Edge Functions absent (HA-020).

## V. Integration requirements

1. Design and implement the one production sync composition root; do not let features enqueue independently.
2. Before sending claim, calculate the complete set of mapping-only children/household identities needed by every pre-existing row.
3. Atomically seed create work for all unclaimed pushable rows with the binding/namespace, in dependency order, with explicit overflow refusal.
4. Make every accepted canonical mutation persist its queue intent in the same envelope write.
5. Prove local → queue → Postgres/RLS → second client → canonical state for each feature and for process death/retry.
6. Resolve duration-source schema, removed prerequisite lifecycle and System subject parity.
7. Decide whether the destructive shipping migration will only ever target empty environments; otherwise author/rehearse an additive path.
8. Add row-version compatibility/quarantine before independently shipping schema producers and older clients.

## W. Final backend verdict

**BACKEND FOUNDATION: FAIL**

The database schema, RLS, constraints, RPCs, CAS and local harness are strong and internally coherent. The foundation still fails as an application backend because account binding is live while operating sync composition is absent, allowing durable local content to remain device-only without an honest failure state.

**FEATURE BACKEND READINESS**

- **F01 — BACKEND GAP**
- **F02 — BACKEND GAP**
- **F03 — OWNER/SCHEMA DECISION REQUIRED**
- **F04 — OWNER/SCHEMA DECISION REQUIRED**
