# Build 4 — Cloud Identity, Account, Sync and Monetization Foundation

The master contract for Build 4. Detailed discovery, the state census, the approved architecture and every decision ID live in [BUILD4_PHASE0_CHECKPOINT.md](BUILD4_PHASE0_CHECKPOINT.md). IDs below (`B4-P0-###`) refer to its decision register. This document is deliberately concise, and it does not replace that record.

| | |
|---|---|
| Status | **In progress.** Phase 0 complete (Checkpoint #1 approved subject to addendum). **PHASE 1 = COMPLETE** (`docs/builds/BUILD4_PHASE1_COMPLETION.md`), awaiting owner review |
| Source authority | Build 3, certified: `bab9773226e3b81928af04d5a303596b16502710` |
| Branch | `build/04-cloud-identity-sync`, local only. No push, PR or merge without explicit owner authorization |
| Product document | `HER_KEYS_PRODUCT.md` stays canonical and is not rewritten during implementation (B4-P0-070). This file records newer architecture. A revision is recommended at the Build 4 hostile audit |

> **ATTESTATION UPDATE — B4-FOUNDATION-BUILDOUT-01.** This contract's status text was last edited at `29cbc26`, before B4-BACKEND-01 to 03 and before the foundation buildout. The statements below are the ones a later wave has changed, each paired with the value it holds now. The original text is **kept unchanged** further down as history. Only what this wave touched or verified is updated here: phase-map rows not listed were **not re-audited** by this wave and should be read as they were written until the hostile audit.

| Statement | PRE-B4-FOUNDATION-BUILDOUT-01 (as written below) | CURRENT (as of B4-FOUNDATION-BUILDOUT-01) |
|---|---|---|
| Shipping migration | not cited | `supabase/migrations/20260919231500_build4_cloud_schema.sql`. SHA-256 (working-tree form) `275e9d1cd81a3d4361715a6d91a084ad95de2ccbd83c67f56e6ca0d3143e8436` before the buildout; **`1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb`** now. The whole chain is in `BUILD4_FOUNDATION_BUILDOUT.md` §13 |
| Baseline migration | `20260919230054` | unchanged; SHA-256 `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` re-verified |
| SD4 (section L, section M.4) | "Implementation authorization PENDING-OWNER: 30 PROPOSED + 2 DEFERRED decisions unapproved" | `BUILD4_SD4_CLOUD_SCHEMA.md` records **SD4 = CLOSED**: 6 INHERITED-APPROVED, 31 OWNER-APPROVED, 5 DEFERRED, 0 PROPOSED, local implementation authorized. The buildout did not reopen it and created no SD4 decision row; its decisions are `B4-FE01-xxx` and ADR-001..026 in the ledger |
| Local schema (section E) | "Local persistence schema v3 is approved as a direction and is not implemented. Today `CURRENT_SCHEMA_VERSION = 2`" | `CURRENT_SCHEMA_VERSION = 4`. v3 exists, is frozen in `legacySchemasV3.ts` with 13 byte-exact fixtures, and migrates to v4 (stored provenance and 18 foundation collections) |
| Cloud tables | SD4 designed 16 | **34** application tables, RLS enabled on all 34; the zero-data interlock enumerates all 34 plus `auth.users` |
| Claim (section F) | "Mechanics (claim table, state names, eligibility result) are PENDING" | implemented and tested locally: `account_claims`, `claim_local_household`, payload **version 2** (version 1 is refused) |
| Sync (section G) | "Concrete mechanism, pull cursor … are PENDING and are designed by SD4" | implemented and tested locally against the real local Supabase: the `change_log` `xid8` cursor, rank-ordered push and pull, **28** synced kinds, `sync_pull(cursor, household)` |
| Household resolution | not mentioned | `private.current_household_id()` (`LIMIT 1`, no order) is removed. `private.resolve_household_context(uuid)` names the household or refuses |
| Local fingerprint | only the hosted pair is quoted: `c55d9b80…` / 961 (Staging equals Production) | unchanged for Staging and Production, which this wave never contacted. **Local:** `d2b319d0253613d6a5c1dd36ef906da6` / 1300 before the buildout, **`199ed4d4c1b37cd654b5853e91cbde27` / 3613** now, every change attributed (`supabase/tools/baselines/build4-foundation-reconciliation.json`) |
| Phase map rows 2, 9, 10 | Not started | implemented **locally** (see `BUILD4_BE02_CLAIM_CORRECTION.md`, `BUILD4_BE03_SYNC_ENGINE.md` and the ledger). Not applied to Staging or Production, and not certified on a device |
| Section N, "Not implemented at this point" | lists the claim runtime, sync runtime and local schema v3 | the claim runtime, the sync runtime and the local schema now exist locally. The rest of that list was **not verified by this wave** |
| Remote state | no Production mutation authorized | unchanged. No remote command was run, nothing was pushed, and Staging and Production were not contacted |

Status vocabulary: `APPROVED`, `PENDING`, `DEFERRED`. Anything marked pending in the checkpoint is not a decision.

## A. Objective

Give Her Keys a trustworthy account and cloud foundation without breaking the local-first system that already works.

Identity is correct. Household ownership is correct. Private data stays private. Existing users keep their data. Offline use keeps working. Staging and Production stay controlled. RevenueCat never leaks entitlement between users. The registration paywall never blocks the free product. Account deletion is real. No runtime claim exceeds what was actually tested (B4-P0-068).

Build 4 is the first build that introduces durable cloud authority, real accounts, social authentication, cross-device data authority and production database migrations. Its blast radius is treated accordingly.

## B. Source authority

Build 3 baseline: `bab9773226e3b81928af04d5a303596b16502710`, 336 / 336 tests, Android runtime certified, no P0–P3 defects remaining, Expo Doctor 20 / 21 with known patch-level drift only. Build 3 behavior is preserved unless Build 4 changes an architectural boundary explicitly. Verification details: checkpoint section 1.

## C. Major architecture constraints

- **Authority split.** Supabase is the durable account and shared-household authority. Local durable state remains the offline execution and cache layer. UI components never call Supabase. Screens render from local state and never wait on the network (B4-P0-001, 002).
- **Persist facts and accepted actions; recompute intelligence.** Daily Load, One Move source logic and Talk It Out stay deterministic. Derived output is never cloud authority (B4-P0-003).
- **Identity.** Cloud primary identity is server-generated. Local ids are stable, never rewritten and never trusted as cloud keys. A durable `local id <-> cloud id` map, foreign-key translation and idempotent retries are required (B4-P0-004 to 006). The physical Postgres type of the cloud key is **still PENDING** (B4-P0-007): SD4 carries a **PROPOSED** resolution (native `uuid`, SD4-001) which the owner has **not** approved.
- **Demo households never sync** (B4-P0-010).
- **Membership is privileged.** Ordinary client sync never deletes or removes memberships (B4-P0-019).
- **Scope-aware access.** `household`: authorized household members. `child`: future child-scope semantics. `personal` and `professional`: owner only. `coparent-shared`: owner only until collaboration is intentionally built (B4-P0-038).
- **RLS is never weakened for convenience.** Privileged functions are explicit, least-privilege and never rely on default grants (B4-P0-039, 040). B4-P0-040 now has an **owner-approved mechanism**: the three-layer privilege defense (secure default privileges, per-object grants, fingerprint drift detection) resolved as SD4-026 / HR-02 on 2026-09-19.
- **No secrets in the bundle.** Only the publishable key reaches the client (B4-P0-041).

## D. Authentication and account authority

- Supabase Auth is the identity authority. There is no custom identity or email merging. Provider behavior (Apple and Google, same and different emails) is documented and tested (B4-P0-012).
- Authentication is required for the account-backed app. There is no permanent local-only mode, and existing local data is never destroyed because the user is unauthenticated (B4-P0-013).
- Auth states: `loading`, `signedOut`, `signedIn`, `reauthRequired`, `error`, distinct from hydration, onboarding, bootstrap, migration, sync and entitlement (B4-P0-014).
- An expired or revoked session enters a degraded "sync paused / reauth required" mode and never discards local work. Only explicit logout performs account isolation (B4-P0-015, 036).
- Native Apple and Google sit behind a provider abstraction with semantic results. Apple's first-authorization full name is saved best-effort and a failed save never invalidates the login (B4-P0-016).
- Routing follows the recorded matrix (checkpoint section 4). New users go Welcome, Auth, bootstrap, onboarding, preview, optional Plus paywall, Today. Existing Build 3 users go through Auth and claim, never repeat completed onboarding, and resume incomplete onboarding at the exact step (B4-P0-017, 018).

## E. Local and cloud authority

Local screens always render from local durable state. Cloud propagation is asynchronous. A device holding another account's cache never renders it: it is quarantined and never uploaded or merged (B4-P0-035). Explicit logout flushes, confirms any discard, and clears local account state (B4-P0-036).

**Local persistence schema v3 is approved as a direction and is not implemented.** Today `CURRENT_SCHEMA_VERSION = 2`. `EnvelopeSchema` is a strict object and `migrationPlan` transforms `data` only. Account namespace, id map, revision, dirty state, tombstones, pull cursor, claim idempotency, conflicts and the durable sync queue are design concepts, not code (B4-P0-060, 061).

## F. Bootstrap and claim model

- **Bootstrap** creates profile, household, owner membership and starter categories transactionally through a narrow secure server boundary. It is authenticated, least-privilege, idempotent and retry-safe, and never a client-side chain of inserts (B4-P0-029).
- **Claim** brings an existing real local household to the cloud through a secure, idempotent, exactly-once transaction. Demo state is refused. Only structured facts move. A raw Talk It Out transcript is never uploaded (B4-P0-030).
- **Second device.** An account that already owns a cloud household resolves to it and never creates a duplicate. An unrelated local real household is quarantined, not merged, deleted or uploaded, with a visible notice (B4-P0-031).
- Claim state is explicit and persisted, never inferred from row counts. Routine sync pauses while a first claim runs (B4-P0-032, 033).
- Mechanics (claim table, state names, eligibility result) are **PENDING** (B4-P0-011, 034).

## G. Sync and conflict principles

- Single-user offline sync. No realtime collaboration. Local write first, then asynchronous propagation. Push on canonical write, foreground, authenticated startup and retry. Pull on authenticated startup, foreground, after a successful push and retry. No continuous polling (B4-P0-022).
- Pending operations are durable, serialized, retryable, idempotent and bounded. Overflow goes to an explicit needs-attention state and never drops a fact (B4-P0-023).
- **Server revision is authority.** Every mutation carries a base revision and is accepted only when it matches. A stale mutation is rejected, the authoritative row is pulled, and the losing local intent is kept as explicit evidence. There is no automatic field merge, no timestamp last-write-wins, no general merge engine, and the device clock is never authority (B4-P0-020, 021).
- No synced entity relies on hard deletion. Semantic tombstones are used, with a durable tombstone added only where an entity would otherwise vanish (B4-P0-024).
- One Move syncs the persisted logical-day decision (`selected`, `withheld`, `completed`) so a second device on the same day does not silently choose differently (B4-P0-058).
- Concrete mechanism, pull cursor, tombstone realization, conflict-evidence home and the One Move cloud model are **PENDING** and are designed by SD4 (B4-P0-025 to 028, 059). SD4 carries **PROPOSED** resolutions for 026 (change-log cursor), 027 (tombstones) and 028 (local-only conflict evidence); none is owner-approved. **B4-P0-059 is partly settled**: its logical-day and timezone half is **OWNER-APPROVED** via SD4-017 (2026-09-19), while the rest of the One Move cloud model remains PROPOSED.

## H. RevenueCat identity requirements

The RevenueCat App User ID is the authenticated Supabase user UUID. The identity transition happens before registration-paywall entitlement resolution. Explicit sign-out transitions RevenueCat with the supported logout. Entitlement never leaks between accounts, is never persisted locally, and CustomerInfo stays the only entitlement authority (`unknown | free | plus`). The registration paywall is **soft**: purchase, Restore Purchases and Continue with Free are always visible, and RevenueCat failure or unknown entitlement never blocks entry to free Her Keys. A reusable post-onboarding upgrade entry is preserved (B4-P0-045 to 047).

## I. Account-deletion requirement

Build 4 includes real, in-app account deletion: irreversible-result explanation and confirmation, recent authentication, secure server-side deletion with no privileged credentials in the client, cloud cleanup, local account-namespace and pending-queue cleanup, RevenueCat transition and auth deletion. Apple token revocation is implemented where credentials permit and otherwise recorded `NOT_EXECUTED`, with deletion not certified production-ready in that case (B4-P0-048). The mechanism is **PENDING** (B4-P0-049).

## J. Environment, Staging and Production rules

- **Projects.** Only two Supabase projects, under organization `qouxjbueadjitgpchwtj` (herkeys's Org): Staging `fhhudicklmpofuzkxeqe` and Production `npykvnxnehlsdlbumzwk`. K Scan Supabase and GitHub are out of scope, and the stored K Scan CLI login is never replaced (B4-P0-056).
- **Mapping.** Development and preview builds use Staging. Production builds use Production. Cross-targeting is a defect in both directions and is asserted at one validated configuration boundary. Tests and CI never target Production (B4-P0-042).
- **Identifiers.** iOS `com.herkeys.app`, Android `com.herkeys.app`, scheme `herkeys` (B4-P0-044).
- **Staging first.** Every schema change is implemented locally, applied to Staging, verified with advisors and a fingerprint, presented as exact SQL with evidence, then **stops for explicit owner authorization** before any Production apply. Production failures are forward-fix only (B4-P0-051).
- **No Production mutation is authorized** without an explicit owner gate, including migration repair, baseline marking, functions, RLS, test users and metadata writes (B4-P0-050).
- **Phase 1 execution model.** Credentialed CLI work is run by the owner, with process-scoped credentials and one remote step at a time. The repository is linked to Staging only. Production stays unlinked and read-only, measured through the read-only MCP fingerprint. No Production database password is requested or used (B4-P0-054, 055).
- **Backup and recovery.** Organization plan is `free` (no daily backups, no PITR). The Production backup posture is **deferred** to Checkpoint #2, with no automatic plan upgrade (B4-P0-052).
- **Parity method.** All Staging, Production and local parity claims use the deterministic fingerprint tool in `supabase/tools/`. Current read-only result: Staging equals Production, gating digest `c55d9b80d604211a5841260709b27f47` over 961 catalog facts. This is Phase 0/1 discovery evidence only and does not substitute for a repo-owned baseline (checkpoint section 5).

## K. Explicit non-goals

No LLM or live AI inference, voice capture, realtime collaboration, co-parent invitations, shared household editing, calendar provider sync, push notifications, transactional email platform, broad visual redesign, domain purchase, unrelated refactors, generalized household merge, advanced conflict UI or full privacy dashboard (B4-P0-069). Category reorder work stays deferred (B4-P0-057). Daily Load, One Move logic and Talk It Out are not converted into cloud-stored authority.

## L. Phase and checkpoint map

Phase numbers follow the original Build 4 execution prompt. The master implementation plan may number differently. **SD4 is a schema design gate inserted by owner direction, and artifacts must say "SD4", not "Phase 4"** (B4-P0-063).

| Stage | Name | Status |
|---|---|---|
| 0 / 0A | Preflight and state census | **Complete** |
| Checkpoint #1 | Architecture checkpoint | **Approved**, subject to the owner addendum |
| Repo authority repair | Materialize Phase 0 decisions (this file and the checkpoint record) | Written, **uncommitted** |
| 1 | Repo-owned Supabase baseline (Staging-only) | **PHASE 1 = COMPLETE**. Baseline `20260919230054`, Staging history reconciled, local parity exact |
| SD4 | Cloud schema design gate | **Design complete.** Hostile design quality **PASS** (P0 = 0, P1 = 0). Four owner decisions applied 2026-09-19 (HR-01..HR-04). **Implementation authorization PENDING-OWNER**: 30 PROPOSED + 2 DEFERRED decisions unapproved. Artifacts: `BUILD4_SD4_CLOUD_SCHEMA.md`, `BUILD4_SD4_DELTA_MATRIX.md`, `drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql` (design only, unverified, never executed) |
| 2 | Local persistence schema v3 | Not started |
| 3 | Environment configuration | Not started |
| 4 | Supabase client | Not started |
| 5 | Auth state machine | Not started |
| 6 | Apple and Google authentication | Not started |
| 7 | Welcome / registration tree | Not started |
| 8 | Profile and household bootstrap | Not started |
| 9 | Existing local household claim | Not started |
| 10 | Sync foundation | Not started |
| 11 | RevenueCat identity | Not started |
| 12 | Registration paywall | Not started |
| 13 | Account deletion | Not started |
| 14 | Security / RLS test suite | Not started |
| 15 | Data privacy UI | Not started |
| 16 | Failure cases | Not started |
| 17 | Development build / runtime certification | Not started |
| 18 | Parity verification | Not started (tooling exists, uncommitted) |
| Checkpoint #2 | Production migration authorization | Not started |
| 19 | Production apply | **Not authorized** |
| 20 | External OAuth configuration | Not started (owner actions) |
| — | Hostile audit and completion report | Not started |

## M. Owner gates

1. **Checkpoint #1**: approved.
2. **Repo authority repair**: owner review of this file and the checkpoint record.
3. **Phase 1**: owner-executed credentialed CLI steps, then the completion report and owner review.
4. **SD4**: owner review and explicit authorization before any schema implementation. HR-01..HR-04 were resolved on 2026-09-19; **this gate remains open** for the remaining implementation authorization package (SD4 section 14).
5. **Each Staging schema change**: shown before it runs, per phase authorization.
6. **Checkpoint #2**: before any Production mutation. Exact SQL, Staging evidence, advisors, fingerprints, destructive-change assessment, backup and recovery posture (OD-2), forward-fix plan and expected impact. Nothing changes between approval and apply.
7. **Push, PR and merge**: only on explicit owner authorization.
8. **Provider configuration** (Apple, Google, RevenueCat, Supabase Auth, EAS): owner actions. A provider is not certified until real credentials are configured and tested.

## N. Deferred items

Production backup and PITR posture (OD-2, checkpoint #2); the deferrable category sort-order constraint; the Google Sign-In library choice; child, system and meal removal semantics; RevenueCat customer-record deletion; on-device encryption at rest for household state; multi-household support; co-parent collaboration. The following remain `NOT_EXECUTED` until real credentials and devices exist: real Apple and Google sign-in, Production provider configuration, real RevenueCat purchase and restore, iOS development build and device login, production account deletion with Apple revocation, second-device sync, network-loss recovery and migration from a real Build 3 installation.

**Not implemented at this point:** Apple and Google runtime, household bootstrap, claim runtime, sync runtime, RevenueCat account identity, account deletion, local schema v3, the environment boundary and the Supabase client. Full list: checkpoint section 20.
