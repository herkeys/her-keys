# Build 4 — Phase 0 Checkpoint (repo-owned record)

| | |
|---|---|
| Purpose | Repo-owned record of the Build 4 Phase 0 discovery and architecture work, so later phases cite the repository and not a chat transcript |
| Companion | [BUILD4.md](BUILD4.md), the master Build 4 contract |
| Materialized | 2026-09-19 |
| Provenance | A transcription of the owner-approved Phase 0 final architecture report (HARD CHECKPOINT #1) and the owner directions that followed it. **It introduces no new decisions.** The original report text lives in the session record |
| Source authority | Build 3 certified `bab9773226e3b81928af04d5a303596b16502710` |
| Branch | `build/04-cloud-identity-sync` (local; not pushed) |
| Checkpoint #1 | Owner **APPROVED**, subject to the owner addendum (section 19) |
| Phase 1 | **PHASE 1 = COMPLETE** (`docs/builds/BUILD4_PHASE1_COMPLETION.md`), awaiting owner review |
| SD4 | **Design complete, hostile quality PASS.** Four decisions owner-approved 2026-09-19 (HR-01..HR-04). **Implementation authorization PENDING-OWNER.** See section 18 for which Phase 0 PENDING items SD4 answers, and with what status |

> **Read this first.** Phase 1 baseline capture must complete before SD4 (the cloud schema design gate) can use the repo baseline as database authority. Nothing in this document is a repo-owned database baseline. The catalog observations in section 5 were made by read-only inspection during Phase 0 and Phase 1 discovery. They do not substitute for Phase 1 completion.

## Reading guide

**STATUS**

- `APPROVED`: an owner-approved decision.
- `PENDING`: proposed or unresolved. It must not be treated as decided.
- `DEFERRED`: intentionally postponed by the owner or by scope.

**SOURCE**

- `PHASE-0`: the Build 4 execution prompt, the ten binding owner decisions issued at Phase 0 finalization, and the owner-approved Phase 0 final architecture report.
- `OWNER-ADDENDUM`: the owner's Checkpoint #1 approval and Phase 1 authorization.
- `LATER-OWNER-DIRECTION`: later explicit owner instructions (the Phase 1 CLI bridge addendum, the SD4 prompt, and the repo-authority-repair instruction that produced this file).

**Rule applied throughout.** Where the approved Phase 0 architecture and a *physical* mechanism differ, only the architecture is recorded as `APPROVED`. Mechanisms the Phase 0 report proposed, such as exact columns, constraints, RPC names, queue bounds and table names, are recorded as `PENDING` with the proposal preserved. Where an owner direction conflicts with the Phase 0 report, the later direction is recorded.

---

## Decision register

| ID | STATUS | SOURCE | Decision |
|---|---|---|---|
| B4-P0-001 | APPROVED | PHASE-0 | **Authority split.** Supabase is the durable account and shared-household data authority. Local durable state remains the offline execution and cache layer. The UI never calls Supabase or knows table mechanics; a repository/sync boundary sits between them. |
| B4-P0-002 | APPROVED | PHASE-0 | **Rendering never waits on the network.** Primary screens render from local durable state. Supabase is not a startup rendering dependency. No route oscillation (Welcome, blank, Today, Welcome). |
| B4-P0-003 | APPROVED | PHASE-0 | **Persist facts and accepted actions; recompute intelligence.** Daily Load conflict detection, One Move source logic and Talk It Out stay deterministic. Derived output never becomes cloud authority. |
| B4-P0-004 | APPROVED | PHASE-0 (binding 2) | **Cloud primary identity is server-generated and server-authoritative.** Local ids (`cat-kids`, `evt-1`, `task-1`, `child-1`, ...) are never trusted as globally unique cloud primary keys. |
| B4-P0-005 | APPROVED | PHASE-0 (binding 2) | **Existing local ids are not rewritten.** They stay stable in durable local state. |
| B4-P0-006 | APPROVED | PHASE-0 (binding 2) | **A durable `local id <-> cloud id` mapping is required.** Foreign-key translation goes through that map. Retries are idempotent. A retry never creates a duplicate cloud object. |
| B4-P0-007 | **PENDING** | — | **Physical PostgreSQL type of cloud primary keys is not settled.** Open question: migrate cloud PKs from `text` to native `uuid` while both environments are still empty. History: the Phase 0 report sketched server-generated ids stored as `text` (uuid-string default). That was a design sketch, not an owner-approved physical type. **Native `uuid` is not an inherited-approved constraint.** Resolved by SD4. |
| B4-P0-008 | **PENDING** | — | **Exact `local_id` representation and idempotency constraint** (type, nullability, uniqueness boundary per entity). Phase 0 proposal: `local_id text`, `UNIQUE (household_id, local_id)` on household-scoped tables. Resolved by SD4 per ownership scope. |
| B4-P0-009 | **PENDING** | — | **Soft references stay in the local id namespace.** Phase 0 proposal: `action_records.target_id`, ids inside action jsonb payloads and One Move `target_id` remain local ids, to avoid rewriting ledger history. Confirmed or changed by SD4 against the action-ledger design. |
| B4-P0-010 | APPROVED | PHASE-0 (binding 1) | **Demo households never sync.** Claim and upload refuse `origin === 'demo'`. No cloud origin field is added to admit demo fiction. |
| B4-P0-011 | **PENDING** | — | **Claim eligibility is a discriminated result**, not a boolean and not derived from `origin` alone (`demo`, `onboarding-incomplete`, `nothing-to-claim`, `eligible`). From the owner's *draft* Phase 1 prompt (status: draft). The `nothing-to-claim` predicate must come from the state census. |
| B4-P0-012 | APPROVED | PHASE-0 (binding 4) | **Supabase Auth is the identity authority.** No custom email-based account merging. Actual behavior for Apple to Google, Google to Apple (same verified email) and different emails is to be documented and tested. (Supabase docs read in Phase 0: identities sharing a verified email are linked automatically by default.) |
| B4-P0-013 | APPROVED | PHASE-0 | **Authentication is required** for the account-backed Build 4 app. No permanent alternate local-only mode. Existing local data is never destroyed merely because the user is unauthenticated. Cancelled auth leaves local state intact. Nothing uploads before successful authentication. |
| B4-P0-014 | APPROVED | PHASE-0 | **Auth state is distinct** from hydration, onboarding, bootstrap, migration, sync and entitlement. States: `loading`, `signedOut`, `signedIn`, `reauthRequired`, `error`. |
| B4-P0-015 | APPROVED | PHASE-0 | **Degraded session mode.** Expiry, revocation, refresh failure or an unreachable Supabase never discards local state. Local execution and durable local writes continue and the pending queue persists. Sync shows paused / reauth required. Same-account reauth resumes safely. Only explicit logout performs account-switch isolation. |
| B4-P0-016 | APPROVED | PHASE-0 | **Provider abstraction.** Native Apple (ID-token flow) and Google behind semantic results `success / cancelled / unavailable / configurationError / providerError`. Apple's full name is written immediately when returned. If saving fails, the login is kept and a retryable profile-completion state is recorded. Missing Google configuration yields a configuration-unavailable result. No provider credentials are invented. |
| B4-P0-017 | APPROVED | PHASE-0 (binding 7) | **Account and onboarding routing.** New user: Welcome, Auth, bootstrap, onboarding, personalized preview, optional Plus paywall, Today. Existing Build 3 user with completed onboarding: Welcome/account transition, Auth, "Bring your current Her Keys with you", claim, optional paywall, Today. Onboarding is never repeated. Existing user with incomplete onboarding: Auth, preserve local state, resume the exact prior step. |
| B4-P0-018 | APPROVED | PHASE-0 | **Root routing matrix R1–R21** (section 4) is the recorded routing contract. Each meaningful row requires a test. Deep links pass the same guard table. |
| B4-P0-019 | APPROVED | PHASE-0 (binding 5) | **`household_members` is privileged infrastructure.** Ordinary client sync cannot delete or remove memberships. Creation and removal stay behind secure server/RPC authority. Child archival semantics, if needed, are proposed separately. |
| B4-P0-020 | APPROVED | PHASE-0 (binding 3) | **Optimistic revision concurrency.** Local action writes locally at once. The cloud mutation carries `baseRevision` and is accepted only if the current revision matches. A stale mutation is rejected and authoritative cloud state is pulled. The losing local intent remains explicit conflict/retry evidence and is never silently discarded. The device clock is never authority. |
| B4-P0-021 | APPROVED | PHASE-0 (binding 3) | **No automatic field-level merge, no timestamp last-write-wins, no general merge engine** in Build 4. |
| B4-P0-022 | APPROVED | PHASE-0 | **Single-user offline sync.** No realtime collaboration or subscriptions. The local canonical write happens first and cloud propagation is asynchronous. Push triggers: canonical local write, foreground, authenticated startup, explicit retry. Pull triggers: authenticated startup, foreground, after a successful push, explicit retry. No continuous polling. |
| B4-P0-023 | APPROVED | PHASE-0 | **Pending cloud operations are durable, serialized, retryable, idempotent and bounded.** Queue overflow enters an explicit sync-needs-attention state, keeps local data, and never silently drops facts. The maximum queue policy is documented. |
| B4-P0-024 | APPROVED | PHASE-0 | **No synced entity relies on hard deletion as its normal sync mechanism.** Existing semantic tombstones (`archived`, `removed`, `resolved`) are used where sufficient. A durable tombstone is added where an entity could otherwise be physically deleted without one. Required test: offline archive, sync, fresh pull, entity stays archived. |
| B4-P0-025 | **PENDING** | — | **Concrete sync mechanism** (Phase 0 proposal): per-entity dirty map with local diffing at the persist seam, bounds of 1,000 dirty entities and 50 open conflicts, about 1.5 s debounce, at most three tiered push calls, `SECURITY INVOKER` `sync_push` / `sync_pull` RPCs so RLS still guards. Confirmed at sync implementation. |
| B4-P0-026 | **PENDING** | — | **Incremental pull cursor.** Phase 0 proposal: `sync_pull(household_id, since)` using server time plus an overlap window. A per-row revision alone is not a global cursor. SD4 must design a complete mechanism. |
| B4-P0-027 | **PENDING** | — | **Physical tombstone realization per entity.** Phase 0 proposal: `deleted_at` on `discovery_records` plus purge of its answers, and existing status values elsewhere. The earlier premise that One Move needs no tombstone because only completed records sync is **withdrawn** (see B4-P0-058). Treatment of replaced or deleted unfinished One Move records is open (SD4). |
| B4-P0-028 | **PENDING** | — | **Conflict evidence home.** Phase 0 proposal: local `conflicts` list (cap 50) and a minimal review surface (count plus "Keep cloud" / "Re-apply mine"), with no cloud conflict table. SD4 must assign an explicit home. Advanced conflict UI remains a non-goal (B4-P0-069). |
| B4-P0-029 | APPROVED | PHASE-0 | **Bootstrap is transactional.** Never a client-side chain of independent inserts. It is a narrow secure RPC or backend boundary that is authenticated, least-privilege, idempotent, retry-safe, stable-id and duplicate-safe. RLS is not weakened to enable it. |
| B4-P0-030 | APPROVED | PHASE-0 | **Existing real local household claim** uses a narrow secure transactional mechanism. It is idempotent, retry-safe, id-preserving, partial-failure aware, with an exactly-once semantic outcome. Only existing structured discovery facts migrate. The raw Talk It Out transcript is never uploaded (no such field exists in local state). |
| B4-P0-031 | APPROVED | PHASE-0 | **Second device.** An authenticated account that already owns a cloud household resolves to it (cloud is authority) and never creates a duplicate. An unrelated local real household is preserved locally in quarantine (not uploaded, not merged, not deleted) with a visible notice. General household merge is out of scope. |
| B4-P0-032 | APPROVED | PHASE-0 | **Claim and routine sync never race.** Routine sync is paused (or an explicit migration mode is used) while a first claim runs. |
| B4-P0-033 | APPROVED | PHASE-0 | **Claim and migration state is explicit and persisted**, never inferred from row counts. |
| B4-P0-034 | **PENDING** | — | **Claim mechanics** (Phase 0 proposal): one implementation shared by bootstrap and claim; client states `not_started / in_progress / complete / failed_retryable / failed_rejected / refused_demo / superseded_by_cloud`; a server `account_claims` table. SD4 must evaluate whether `account_claims` is needed. |
| B4-P0-035 | APPROVED | OWNER-ADDENDUM | **Bound-other account cache quarantine.** Durable state bound to another Supabase user is never rendered to the current account, never uploaded, never merged, and is preserved in quarantine with evidence. The current account proceeds independently. |
| B4-P0-036 | APPROVED | PHASE-0 (referenced by OWNER-ADDENDUM) | **Explicit logout cleanup.** Attempt a flush. If changes remain, require an explicit "sign out and discard N unsynced changes" confirmation. No parked copies. Local account state is then cleared. |
| B4-P0-037 | **PENDING** | — | **iOS keychain install marker** (Phase 0 security proposal). A stored session with no local install marker is signed out locally on launch, so a reinstall cannot resurrect a previous person's session. Confirmed at client/auth implementation. |
| B4-P0-038 | APPROVED | OWNER-ADDENDUM (OD-1) | **Scope-aware RLS direction.** `household` rows: authorized household semantics. `child` rows: future child-scope semantics. `personal` and `professional`: owner only. `coparent-shared`: owner only until collaboration is intentionally built (it is never permission to share with another account). `owner_profile_id` (and scope-aware enforcement) is expected on the six scope-bearing tables where needed. Established while the databases are empty. **Not part of Phase 1** unless required for the baseline. |
| B4-P0-039 | APPROVED | PHASE-0 | **RLS is not weakened for convenience.** The current restrictions are intentional: no ordinary client household creation, no ordinary client membership creation, append-oriented action ledger. |
| B4-P0-040 | APPROVED | PHASE-0 | **Privileged function posture.** `SECURITY DEFINER` only when justified. Fixed safe `search_path`. `auth.uid()` asserted. `EXECUTE` revoked from PUBLIC and `anon` unless intended, with explicit grants. Never rely on default grants (baseline default privileges auto-grant new public objects to `anon`, `authenticated` and `service_role`). |
| B4-P0-041 | APPROVED | PHASE-0 | **Secrets.** Only the publishable key reaches the client. Service-role key, `sb_secret_` keys, database passwords, management tokens, Apple private keys, provider secrets and RevenueCat server secrets are never in the bundle. Service-role use stays in trusted server contexts. A bundle-scan test enforces it. |
| B4-P0-042 | APPROVED | PHASE-0 | **Environment mapping.** Development and preview builds use Staging (`fhhudicklmpofuzkxeqe`). Production builds use Production (`npykvnxnehlsdlbumzwk`). Wrong-target mapping is a defect in both directions and is asserted at one validated configuration boundary. Tests and CI never target Production. |
| B4-P0-043 | **PENDING** | — | **Client env variable names and mechanics** (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, gitignored `.env.local`, placeholder-only `.env.example`, EAS profile mapping). From the owner's *draft* Phase 1 prompt (status: draft). |
| B4-P0-044 | APPROVED | PHASE-0 | **Permanent identifiers.** iOS `com.herkeys.app`, Android `com.herkeys.app`, scheme `herkeys`. Not changed without explicit owner instruction. (At this checkpoint `app.json` already has scheme `herkeys`; bundle id and package are not yet added.) |
| B4-P0-045 | APPROVED | PHASE-0 (binding 9) | **RevenueCat identity.** The RevenueCat App User ID is the authenticated Supabase user UUID. Sequence: Supabase signed in, RevenueCat identified, fetch CustomerInfo, resolve entitlement, then show the registration paywall. Explicit sign-out transitions RevenueCat with the supported logout. Entitlement never leaks between accounts. CustomerInfo remains entitlement authority (`unknown / free / plus`). AsyncStorage is never subscription authority. Only the monetization boundary imports the SDK. |
| B4-P0-046 | APPROVED | PHASE-0 (binding 8) | **Registration paywall is soft and non-blocking**, after the personalized preview and before Today. Purchase, Restore Purchases and Continue with Free are all visible. Continue with Free is never hidden, disguised, delayed or blocked. RevenueCat failure, timeout, no offering, unknown entitlement or config error never prevents entry. Unknown entitlement behaves free-compatibly. |
| B4-P0-047 | APPROVED | PHASE-0 | **Paywall content and access.** Approved positioning "Feed a Healthy Home" with its four bullets. A reusable post-onboarding upgrade entry is preserved or provided. Typed analytics events (`paywall_viewed`, `plus_purchase_started`, `plus_activated`, `continued_free`, `restore_started`, `restore_succeeded`, `restore_failed`) go to a typed no-op transport, with no vendor and no private household content. |
| B4-P0-048 | APPROVED | PHASE-0 (binding 10) | **Account deletion is part of Build 4.** In-app initiation. Irreversible-result explanation and explicit confirmation. Recent authentication where appropriate. Secure server-side deletion (no service-role credentials in the client). Cloud cleanup. Local account-namespace cleanup. Pending-sync cleanup. RevenueCat logout/transition. Auth deletion/revocation handling. Apple token revocation is implemented where credentials permit. Otherwise it is recorded `NOT_EXECUTED` and deletion is not certified production-ready. |
| B4-P0-049 | **PENDING** | — | **Deletion mechanism** (Phase 0 proposal): an Edge Function `delete-account`; a service-role-only purge function that deletes in explicit dependency order; Apple authorization-code exchange plus revoke; idempotent, resumable steps. |
| B4-P0-050 | APPROVED | PHASE-0 (binding 6) | **No Production mutation is authorized** without an explicit owner gate. This includes schema migrations, migration repair, baseline history marking, functions, RLS changes, test users and any metadata write. |
| B4-P0-051 | APPROVED | PHASE-0 | **Staging first, Production gated.** Every schema change: implement locally, apply to Staging, verify, advisors, exact SQL artifact, owner review, STOP, explicit authorization, apply, re-verify, parity. Production failures are forward-fix only. A partially failed Production migration is never blindly rerun. |
| B4-P0-052 | DEFERRED | OWNER-ADDENDUM (OD-2) | **Production backup/PITR posture** is deferred until Checkpoint #2. Before any Production mutation: re-check recovery capability, report backup/export/PITR options, present the risk, obtain explicit owner approval. **No plan is upgraded automatically.** |
| B4-P0-053 | APPROVED | OWNER-ADDENDUM | **Phase 1 scope is database baseline / migration foundation only.** No local schema v3, Supabase runtime client, auth, Apple/Google, account namespaces, claim/bootstrap/sync runtime, RevenueCat identity changes, account deletion, application schema deltas S1–S12, RLS changes, RPCs or Edge Functions. |
| B4-P0-054 | APPROVED | LATER-OWNER-DIRECTION | **Phase 1 CLI execution model.** Credentialed CLI commands are executed by the **owner** in a dedicated PowerShell terminal at the repo. `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` (the **Staging** password only) are process-scoped and are never in chat, the repo, `.env` files or Windows User/System environment. No `supabase login`; the stored K Scan login is untouched. One remote command at a time. Identity gate first (`projects list`, `orgs list`). Staging-only link; Production never linked. Production parity comes only from the read-only MCP fingerprint. No Production DB password is requested or used. Credentials are cleared from the shell at the end. |
| B4-P0-055 | APPROVED | OWNER-ADDENDUM + LATER-OWNER-DIRECTION | **Staging migration-history reconciliation.** Baseline captured from Staging by `db pull`. If `db pull` offers to update remote history, the answer is **NO**. The baseline is inspected and reproduced locally first. `supabase migration repair <baseline_version> --status applied` runs against Staging only, after all gates pass and after the exact command and version are shown. No manual insert into migration tables and no `db push` to establish the baseline. Post-repair verifications are required (migration list, zero-pending dry run, unchanged fingerprint, zero rows, zero auth users, advisors). |
| B4-P0-056 | APPROVED | PHASE-0 | **Account isolation.** Only the two Her Keys Supabase projects (under org `qouxjbueadjitgpchwtj`) may be touched. K Scan Supabase and K Scan GitHub are out of scope. `gh` is never switched away from the existing account. Her Keys Git uses the `github-herkeys` SSH alias. The Her Keys Supabase identity is positively verified before any remote CLI operation. |
| B4-P0-057 | DEFERRED | OWNER-ADDENDUM | **Category reorder constraint.** Do **not** make the `household_categories (household_id, sort_order)` UNIQUE constraint DEFERRABLE in Build 4. User-facing category reorder is out of Build 4 scope. (Phase 0 sketch item S7 is removed.) |
| B4-P0-058 | APPROVED | OWNER-ADDENDUM (amends Phase 0) | **One Move sync (amended).** Sync the persisted logical-day One Move decision, including `selected`, `withheld` and `completed`. This replaces the Phase 0 proposal to sync completed records only. Signing in on another device on the same logical day must not silently choose a different One Move. The recommendation engine may still recompute future logical days. Unrelated derived Daily Load output is not persisted. |
| B4-P0-059 | **PENDING** | — | **One Move cloud model.** State machine and legal transitions, uniqueness (household plus owner/profile plus logical day), logical-day storage format, authoritative timezone source, `profiles.timezone` initialization, and the fate of replaced or deleted unfinished records. Resolved by SD4. |
| B4-P0-060 | APPROVED | PHASE-0 | **Local persistence advances to `schemaVersion` 3** with an explicit, additive v2 to v3 migration that never resets valid v2 state. Sync, claim and account metadata lives beside the domain data in the envelope, not inside domain entities. States are explicit. **Not implemented yet** (section 2). |
| B4-P0-061 | **PENDING** | — | **Exact v3 envelope shape and naming.** The Phase 0 report proposed `data` unchanged plus an `account` sibling section. The owner's *draft* Phase 1 prompt proposes a sibling `sync` section including `sync.identity = { profileId, cloudHouseholdId, claimId, claimedAt }` (`claimId` is an idempotency/request identity only and never an entity primary key). It also proposes: account namespace derived only from the Supabase user UUID (never email, display name or household id); no ownership fields on every domain entity; a v1 to v2 to v3 chain test; a sync write-isolation test; a corrupt-sync-metadata recovery test that preserves the domain data; a v2 shape census before the migration. **The naming difference (`account` vs `sync`) is unreconciled.** Resolved at local-v3 design. |
| B4-P0-062 | **PENDING** | — | **Other owner-draft Phase 1 requirements**, not executed under B4-P0-053 and carried forward for confirmation: generated Supabase types after the final Staging schema (CLI 2.109.1 pinned, hash recorded); advisor acceptance rules; a Production drift gate that re-runs the committed fingerprint; end-of-phase link-state reporting; Expo Doctor left at 20 / 21 with no patch-drift upgrades in Phase 1; no new runtime dependencies in Phase 1. |
| B4-P0-063 | APPROVED | LATER-OWNER-DIRECTION | **SD4 (schema design gate) is inserted before schema implementation.** It is a design-only gate with a mandatory entry gate (repo-owned artifacts), and it produces only three design artifacts. Artifacts and reports use the name "SD4", not "Phase 4". |
| B4-P0-064 | **PENDING** | — | **Phase 0 required-schema sketch (S1–S12).** Proposed only. Not approved as executable DDL. S7 is removed (B4-P0-057) and the `owner_profile_id` direction is approved (B4-P0-038). The remainder (server-generated ids, `local_id`, claim table, discovery tombstone, owner-per-profile index, `events.source` tightening, immutability trigger, grants hardening, RPC set, Edge Function) is designed by SD4. Application to Staging occurs at implementation phases. Production only through the gate (B4-P0-050). |
| B4-P0-065 | DEFERRED | PHASE-0 | **Google Sign-In library choice** (`@react-native-google-signin/google-signin` vs the nitro variant) is a technical verification against Expo SDK 57 and React Native 0.86 at implementation time. |
| B4-P0-066 | DEFERRED | PHASE-0 | **Child, system and meal removal semantics.** No production create/edit/remove path exists for them today. Proposed separately if such a path is built (B4-P0-019). |
| B4-P0-067 | DEFERRED | PHASE-0 | RevenueCat customer-record deletion (server API, secret key); on-device encryption at rest for household state (HK-B2-AUDIT-013); multi-household support; co-parent collaboration. |
| B4-P0-068 | APPROVED | PHASE-0 | **Governance.** Runtime honesty: anything not executed is classified `NOT_EXECUTED` and no claim exceeds what was tested. Hostile audit: P0–P3 may be repaired with a regression run; P4–P10 are documented and deferred. No `PRODUCTION_READY` verdict unless every gate supports it. |
| B4-P0-069 | APPROVED | PHASE-0 | **Non-goals.** No LLM or live AI inference, voice capture, realtime collaboration, co-parent invitations, shared household editing, calendar provider sync, push notifications, transactional email platform, broad visual redesign, domain purchase, unrelated refactors, generalized household merge, advanced conflict UI, or full privacy dashboard. |
| B4-P0-070 | APPROVED | PHASE-0 | **Product document.** `HER_KEYS_PRODUCT.md` is not broadly rewritten during implementation. BUILD4.md records the newer architecture. At Build 4 hostile-audit time, recommend whether the product document should advance to a new revision. |

### Owner binding decisions 1–10 (Phase 0 finalization) mapped to IDs

| # | Subject | IDs |
|---|---|---|
| 1 | Demo data | B4-P0-010 |
| 2 | Local ids vs cloud ids | B4-P0-004, 005, 006 (physical PK type: 007 PENDING) |
| 3 | Conflict policy | B4-P0-020, 021 |
| 4 | Supabase Auth identity linking | B4-P0-012 |
| 5 | Membership | B4-P0-019 |
| 6 | Production | B4-P0-050 |
| 7 | Account / onboarding routing | B4-P0-017, 018 |
| 8 | Paywall | B4-P0-046 |
| 9 | RevenueCat identity | B4-P0-045 |
| 10 | Account deletion | B4-P0-048 |

---

## 1. Source and build verification

Verified 2026-09-19 (Phase 0).

| Item | Result |
|---|---|
| Source authority | `bab9773226e3b81928af04d5a303596b16502710` on HEAD, local `main`, the `origin/main` tracking ref, and the live remote (`git ls-remote`, `github-herkeys` alias) |
| Tests | 336 / 336 (Node's runner). An earlier 248 figure in historical Build 2/3 reports is an intermediate checkpoint and is not reopened |
| TypeScript | clean |
| Expo Doctor | 20 / 21. The only failing check is patch drift: `expo` 57.0.22 vs ~57.0.24, `expo-constants` 57.0.18 vs ~57.0.19, `expo-router` 57.0.21 vs ~57.0.22. No package was changed |
| Android export | passes (5.3 MB Hermes bundle, exported outside the repo) |
| Toolchain | Node 24.14.0, npm 11.9.0, Expo 57.0.22, Supabase CLI 2.109.1, JDK 21 |
| Docker | daemon verified running during Phase 1 (Docker Desktop 29.6.2) |

**Expo SDK 57 documentation** (AGENTS.md requires versioned docs) was read for Apple authentication, SecureStore and the Google sign-in guide. Findings: `expo-apple-authentication` is iOS/tvOS only and returns `fullName` only on first authorization; SecureStore values are limited to roughly 2 KB and iOS keychain items persist across reinstall; neither Google Sign-In library works in Expo Go, so a development build is mandatory.

**Installed at this checkpoint:** `react-native-purchases` 10.9.1 and `react-native-purchases-ui` 10.9.1 (`logIn`, `logOut`, `isAnonymous` verified in the typings), `@react-native-async-storage/async-storage` 2.2.0, `expo-router` 57.0.21, `expo-dev-client`. **Not installed:** `@supabase/supabase-js`, `expo-secure-store`, `expo-apple-authentication`, `expo-crypto`, a Google Sign-In library.

## 2. Current local persistence model

All facts are read from the Build 3 source at the source-authority SHA.

**Storage.** One JSON envelope under the AsyncStorage key `herkeys.appState`, containing the entire `AppState`. Auxiliary keys: `herkeys.appState.corrupt` (diagnostics/internal builds only) and `herkeys.appState.future` (state written by a newer app, every build). AsyncStorage is unencrypted local storage; credentials and tokens must never be stored there.

**Envelope.** `{ schemaVersion, appVersion, savedAt, writeSeq, data }`, validated by `EnvelopeSchema`, a `z.strictObject`. **`CURRENT_SCHEMA_VERSION = 2`.**

**Migration machinery.**
- `migrationPlan.migrations` contains one step, `1 -> 2` (`migrateV1ToV2`).
- `migrationPlan` transforms `data` only, never the envelope. Envelope-level additions cannot ride the current mechanism.
- Validators run on every step's input and output (`isValidV1AppState` for v1, `AppStateSchema` for v2).
- `migrateV1ToV2` backfills conservatively: events get `commitment:'fixed'`, `status:'active'`, `source:'demo'` and null timestamps and travel fields (only the demo seed produced events before Build 3); tasks get `status:'open'` and null timestamps; One Move records get `targetType:'catalog'`; `needsMe` becomes `[]`.

**Decode path** (`decodeStoredState`): parse JSON, require an object, require `schemaVersion`, a version greater than current is `future_version` (preserved under `.future`, never read with older rules), `EnvelopeSchema` (strict), migrate, then `validateAppState` (shape plus relational integrity). **Encode** refuses to write any state that would not validate on the next launch.

**Repository** (`AppStateRepository`: `loadAppState`, `saveAppState`, `resetAppState`). Load outcomes: `empty`, `loaded`, `invalid` (quarantined only in diagnostics builds), `future_version` (preserved), `read_failed` (nothing discarded).

**Write queue.** Latest-value-wins, serialized, sequence-numbered, one immediate retry, degraded after two failed cycles. It is a *whole-state* saver, not an operation log.

**Store** (`createAppStore`). Lifecycle `unhydrated`, `hydrating`, `ready`, `recovery`. Hydration writes only when it created or repaired state. `dispatch` applies immediately and does **not** validate first. `commit` validates and saves before showing. A stored state whose `origin` differs from the build's data mode is replaced in memory (`mode_mismatch`), and real-user state is never overwritten by a demo build.

**Data mode.** `demo` (fictional Ellis household plus internal tools) or `empty` (real user). Dev builds default to `demo`, other builds to `empty`.

**Concepts absent from code (design only at this checkpoint).** Local persistence v3 is **not implemented**. None of the following exist as fields, types or logic: account namespace, `local_id`/`cloud_id` map, per-record revision, dirty state, tombstones, pull cursor, claim idempotency, conflicts, durable sync queue.

## 3. Current domain census

`AppState` (strict object, schema v2): `origin`, `household`, `user`, `children`, `categories`, `events`, `tasks`, `systems`, `meals`, `onboarding`, `oneMoves`, `needsMe`, `discovery`, `actions`. Caps: children 20, categories 200, events 5,000, tasks 5,000, systems 500, meals 1,000, oneMoves 4,000, needsMe 1,000, actions 10,000.

| Entity | Local id | Scope | Removal / lifecycle today | Timestamps | Notes |
|---|---|---|---|---|---|
| household | fixed `household-1` (demo `hh-1`) | `household` | none | none | no edit path |
| user (adult) | fixed `user-1` | `personal` | none | none | timezone frozen at first launch. `displayName` is set only in the demo seed; real users have `null` and no screen collects it |
| children | demo only (`child-1`, `child-2`) | `child` | none | none | **no create, edit or remove path exists in production** |
| categories | 8 fixed `cat-*`; custom `cat-<time>-<n><rand>` | starter scopes: kids/home/money/meals `household`; work `professional`; wellbeing/relationships `personal`; coparenting `coparent-shared` | archive / restore only | none | rename, reorder and add exist only in dev-tools (demo). Production has the fixed 8 |
| events | `evt-<time>-<n><rand>` (demo `evt-1..4`) | any | `status:'removed'` (no restore) | createdAt, updatedAt (nullable) | `source: 'user' \| 'demo'`; only the demo seed and the v1 migration ever set `demo` |
| tasks | `task-...` (demo `task-1..3`) | any | `completed`, `archived` (no reopen) | both (nullable) | the system also edits plan, duration, commitment |
| systems | demo only (`sys-1..4`) | any | no path | none | no create path |
| meals | demo only (`meal-1..3`) | any | no path | none | no create path |
| onboarding | none (embedded) | `personal` | arrays shrink in place | `completedAt` only | complete iff `completedAt != null`; `lastStep` is monotonic; `plus` is the final step |
| oneMoves | derived `onemove-<logicalDate>` | `personal` | the system **physically replaces or deletes** unfinished records; a `completed` record is never replaced | `decidedAt`, `completedAt` | `targetType`: `catalog` (demo), `task`, `needsMe`; `withheld` iff no target; `completed` iff `completedAt` |
| needsMe | `needsme-...` | `personal` | `resolved` only | `createdAt` | cannot be deleted or reopened |
| discovery | `discovery-...`, regenerated after a clear or topic change | `personal` | wholesale replace, or clear to `null` | none | up to 2 `{questionId, optionId}` answers; structured only, no transcript field exists |
| actions | `act-...` | `personal` | append-only; never removed or edited | `createdAt` | undo appends a new record |

**Recomputed, never persisted:** Daily Load, load tier, life status, Tomorrow Preview, operating profile, child age, Talk It Out hypothesis, "was undone". **Never persisted locally:** entitlement.

**Relational integrity** (`findIntegrityProblems`): unique ids per entity; unique category `sortOrder` and unique category `systemRole`; one One Move per date; every category/subject/One Move/action reference must resolve; a `child`-scoped record must name a real child. A pulled state that violates any of these would be rejected on write.

## 4. Route and account-state matrix

**Current routing (Build 3).** `routeAccess.ts` decides each root screen from hydration status, onboarding state and internal-tools only. The Welcome screen (`index`) is open only while onboarding is incomplete. `(app)`, `talk-it-out` and the editors open only once it is complete. `dev-tools` opens only with internal tools. The registration paywall today is the *final onboarding step* (`onboarding/plus`) and completes onboarding.

**Recorded matrix (B4-P0-018).** Auth is classified locally with no network: a stored session counts as `signedIn` optimistically, refresh runs in the background, and only an invalid or revoked refresh token yields `reauthRequired`.

| # | Auth | Local household | Binding | Cloud household | Claim | Onboarding | Entitlement | Route |
|---|---|---|---|---|---|---|---|---|
| R1 | loading | hydrating | any | unknown | any | any | any | Splash. Nothing renders until local classification is done |
| R2 | signedOut | pristine (no real data) | unbound | – | not_started | not started | – | Welcome, then Auth (new user) |
| R3 | signedOut | real | unbound | – | not_started | incomplete | – | Welcome / account transition. Local preserved, nothing uploaded |
| R4 | signedOut | real | unbound | – | not_started | complete | – | Welcome / account transition ("Bring your current Her Keys with you" follows auth) |
| R5 | any | demo (dev builds) | any | – | refused_demo | any | – | Build 3 routing unchanged. No auth gate, sync off, claim refused |
| R6 | signedIn | pristine | unbound | none | not_started | – | any | Bootstrap interstitial, then onboarding start |
| R7 | signedIn | pristine | unbound | exists | – | from cloud | any | Hydrate from cloud, then Today or resume onboarding at the cloud step |
| R8 | signedIn | real | unbound | none | not_started | incomplete | – | Claim under an interstitial, then resume the exact `lastStep` |
| R9 | signedIn | real | unbound | none | not_started | complete | any | "Bring your current Her Keys with you", claim, registration paywall (soft), Today. **Onboarding is not repeated** |
| R10 | signedIn | real, unrelated | unbound | exists | superseded_by_cloud | any | any | Cloud is authority. Local household quarantined, visible notice, cloud hydrated |
| R11 | signedIn | real | bound, same user | consistent | complete | complete | any | Today rendered from local at once, sync in the background |
| R12 | signedIn | real | bound, same user | consistent | complete | incomplete | any | Resume the exact onboarding step |
| R13 | signedIn | real | bound, same user | – | in_progress / failed_retryable | any | any | Today from local with a "finish account setup, retrying" status. Retry is idempotent |
| R14 | signedIn | real | **bound, other user** | – | – | any | any | The other account's cache is never rendered. It is quarantined, then R6 or R7 (B4-P0-035) |
| R15 | reauthRequired | real | bound | – | any | any | any | Stay in the app on local data. "Sync paused, sign in again" banner. Same-user reauth resumes |
| R16 | error (auth storage unreadable) | any | any | – | – | any | – | Bound: as R15. Unbound: as R2 |
| R17 | signedIn | real | bound | – | complete | complete | plus | Skip the paywall (already entitled), then Today |
| R18 | signedIn | real | bound | – | complete | complete | unknown / free | Registration paywall, then Today. RevenueCat failure never blocks: Continue with Free, then Today |
| R19 | any | any | any | – | – | any | – | Deep links pass the same guard table, including the new `auth`, `claim` and `paywall` screens |
| R20 | explicit sign-out | bound | – | – | – | – | – | Flush, confirm if pending (B4-P0-036), wipe local account state, RevenueCat logout, then R2 |
| R21 | account deleted | – | – | – | – | – | – | Purge (section 15), then R2 |

The matrix is a recorded contract, not an implementation. It becomes a tested artifact in the routing phase.

## 5. Current Supabase baseline observations

**Status: observations only.** These come from read-only catalog inspection during Phase 0 and Phase 1 discovery. **No repo-owned baseline migration exists**, migration history has not been reconciled, and the fingerprint tool is uncommitted. None of this substitutes for Phase 1 completion.

**Projects (both us-west-2, Postgres 17.6.1.166, `ACTIVE_HEALTHY`, created 2026-09-18):** Staging `fhhudicklmpofuzkxeqe`, Production `npykvnxnehlsdlbumzwk`, organization `qouxjbueadjitgpchwtj`. Organization plan: **free**.

**State at inspection.** Both have 0 rows in every application table, 0 `auth.users`, 0 storage objects, 0 vault secrets, empty migration history and no Edge Functions. Security advisors: no findings on either. Performance advisors: the same 29 `unused_index` INFO findings on either (expected on empty tables).

**Application schema observed (`public` plus `private`).** 14 application tables: `profiles`, `households`, `household_members`, `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries`, `onboarding_state`, `one_move_records`, `needs_me_items`, `discovery_records`, `discovery_answers`, `action_records`. All have RLS enabled. Three functions in scope: `public.set_row_updated_at()` (revision/`updated_at` trigger function), `public.rls_auto_enable()` (event-trigger function), and `private.is_household_member(text)` (`SECURITY DEFINER`, `search_path=''`, granted to `authenticated`). 12 user triggers (the revision/`updated_at` trigger on 12 of the 14 tables; not on `discovery_answers` or `action_records`). 37 policies. 130 constraints. 51 indexes.

**Structural parity, Staging vs Production.** Established by read-only catalog fingerprint on 2026-09-19 with the deterministic method in `supabase/tools/` (currently uncommitted). The output has 16 rows: the `#GATING` summary plus 15 populated dimensions (13 gating and 2 informational). Both environments returned identical digests on every row.

| Dimension | Items | Digest |
|---|---|---|
| **#GATING** (all non-`info`) | **961** | **`c55d9b80d604211a5841260709b27f47`** |
| columns | 148 | `527434610f02d031d82388728c31c5d1` |
| constraints | 130 | `0e578ac3ba4bfde81617d06477ebe3e6` |
| functions | 3 | `d3af6016d064126836c9d3a1167db4ae` |
| indexes | 51 | `cd927d9e7a87ac13003cefa7f5229cca` |
| policies | 37 | `91143424fa627e83c880350d2c65ccfd` |
| privileges.default_acl | 6 | `4a7c603501d17bcbe920767aa2c44f43` |
| privileges.effective | 205 | `9eddf0ee99d9689e89d65e2c2b491adf` |
| privileges.functions | 8 | `a9de8549d700fee1a55c65000bd7f6d7` |
| privileges.relations | 336 | `0e9abb1dce98fcc21d9cdfa8ff726013` |
| privileges.schemas | 9 | `40418c430a18a79b5fd6429048164dbb` |
| relations | 14 | `7610c6ad7e67808ac5566776b9521e57` |
| schemas | 2 | `0e57bd8fd092941a34193a365f9fd211` |
| triggers | 12 | `269aa8b8fe00f8efaf0be23fa7fb0fe6` |
| info.event_triggers (informational) | 7 | `460fef42355350673d98786b2395e9f7` |
| info.extensions (informational) | 5 | `79a0122710537a34641e3743cd7b7729` |

The `types` and `privileges.columns` dimensions are empty (no rows), so they produce no output row. An earlier, coarser 13-category comparison, extended to the `private` schema, event triggers, storage buckets and vault, also matched.

**Read-only Production inspection occurred during Phase 0 and Phase 1 discovery and caused no Production mutation** (Appendix A).

## 6. Mutable and static entity classification

| Class | Entities | Consequence |
|---|---|---|
| **Mutable in production** (real households) | events, tasks, needsMe, oneMoves, discovery, onboarding | need revision and conflict handling |
| **Append-only** | actions | insert-only; never updated |
| **Static after creation** (uploaded once by bootstrap/claim) | household, user, the 8 fixed categories | no sync-driven mutation in production today |
| **No production path** | children, systems, meals | only the demo seed populates them; a real household has none |
| **Local-only by design** | demo households, everything with `origin: 'demo'` | never sync (B4-P0-010) |
| **Derived / never persisted** | Daily Load and the recomputed items in section 3 | never cloud authority (B4-P0-003) |
| **Not part of AppState** | entitlement (RevenueCat), auth session (Supabase), install marker | separate authorities |

The generic sync engine still supports categories, systems and meals, but nothing in production produces mutations for them today.

## 7. Local and cloud responsibility split

| Concern | Local | Cloud |
|---|---|---|
| Rendering and every user action | **authority** (offline execution) | – |
| Canonical write order | local first, always | asynchronous propagation |
| Account identity | session only (never household data) | **authority** (Supabase Auth) |
| Household existence, ownership, membership | cache | **authority** (RPC-only creation) |
| Revision, conflict outcome | records last known server revision | **authority** |
| Entitlement | never persisted | RevenueCat CustomerInfo |
| Demo data | local only | never |
| Intelligence (Daily Load, One Move candidate, hypotheses) | recomputed | not stored |

## 8. Identity strategy

- **Auth identity.** Supabase Auth is authority (B4-P0-012). The existing baseline already has `profiles.id` as a `uuid` primary key referencing `auth.users(id)` with `ON DELETE CASCADE`.
- **Cloud primary identity is server-generated** (B4-P0-004). Local ids stay stable and are never trusted as global keys (B4-P0-004/005). The reason: every install starts with `household-1`, `user-1` and `cat-kids`, and the baseline primary keys are global text. Without server-generated identity the first user to claim would occupy `cat-kids` for everyone.
- **Physical type of the cloud PK is open** (B4-P0-007, PENDING).
- **Idempotency key** for client-originated rows is a local reference; its exact form is open (B4-P0-008).
- **Bound identity** on a device is the Supabase user UUID, never email, display name or household id.

## 9. local_id / cloud_id mapping strategy

Approved: durable mapping, FK translation, idempotent retries (B4-P0-006). The following is the Phase 0 **proposal**; the physical form is PENDING (B4-P0-007, 008, 009, 064).

| Local | Cloud table | Write path (proposal) | Notes |
|---|---|---|---|
| user | `profiles` and `household_members` (adult, owner) | claim/bootstrap RPC; name via a narrow profile RPC | adult member `display_name` is NOT NULL non-blank whereas local `displayName` is nullable, so a placeholder rule is needed |
| household | `households` | claim/bootstrap RPC only | local `household-1` is recorded against the server id |
| children | `household_members` (child) | claim RPC only | sync never writes or removes members (B4-P0-019) |
| categories | `household_categories` | claim creates; sync updates | |
| events, tasks | `events`, `tasks` | sync | hard FKs `category_id`, `subject_member_id` are translated through the map |
| systems, meals | `household_systems`, `meal_plan_entries` | claim, then sync | none exist for real households |
| onboarding | `onboarding_state` (PK household plus profile) | sync | no local id |
| oneMoves | `one_move_records` | sync (all statuses, per B4-P0-058) | id is date-derived and per user; existing unique (household, profile, date) |
| needsMe | `needs_me_items` | sync | |
| discovery | `discovery_records`, `discovery_answers` | sync | structured answers only |
| actions | `action_records` | sync, insert-only | immutable |
| Talk It Out transcript | none | – | no such field exists |

**Proposed mechanics** (PENDING): a durable `account.map` of `localId -> { cloudId, revision, hash }`; hard FK columns are translated through it; soft references stay local (B4-P0-009); a new device adopts each cloud row's local reference as its local id; a pushed batch returns the id map so a crash between cloud commit and local persistence is repaired by retrying idempotently.

## 10. Bootstrap and claim architecture

Approved principles: B4-P0-029 through 033. Proposed mechanics: B4-P0-034 (PENDING).

- **Bootstrap** (new user with a pristine local state): a transactional server-side function creates profile, household, owner membership, starter categories and onboarding state, and returns the id map. It is idempotent per account.
- **Claim** (existing real local household): the same transaction with the local content as payload. It is refused for `origin: 'demo'` and for any demo-source row (fail closed, never filter). Only structured facts upload.
- **Client states** (proposal): `not_started`, `in_progress`, `complete`, `failed_retryable`, `failed_rejected`, `refused_demo`, `superseded_by_cloud`. An interrupted claim is retried with the same claim identity. Local edits made during a claim are pushed afterwards through normal sync.
- **Second device and unrelated local household:** see B4-P0-031 and B4-P0-035.
- **Uniqueness:** one household per account is required by the approved second-device rule. How it is enforced is open (B4-P0-034, SD4).

## 11. Sync architecture

Approved principles: B4-P0-001, 002, 022, 023, 024. Proposed mechanism: B4-P0-025, 026 (PENDING).

`UI -> existing transitions (dispatch/commit) -> persist seam (change tracker) -> local durable state (data plus account metadata, one atomic write) <-> sync engine <-> gateway -> Supabase`.

- The engine is plain TypeScript with an injected gateway. Tests can only import plain `.ts` (no React Native or Expo modules), so the engine is tested against a fake gateway. Only the future Supabase client module imports `@supabase/supabase-js`.
- Startup renders from local state with no network calls before the first screen.
- The queue is a coalesced per-entity dirty map, so it is idempotent by construction.
- Overflow goes to needs-attention. Recovery is a full content-hash scan, so no fact is dropped.
- A pull that would violate local integrity is never partially applied.
- Measurement (hydration query count, first-pull size, batching, N+1 risks) is recorded during implementation, not optimized in advance.

## 12. Conflict architecture

Approved: B4-P0-020, 021. Proposed: B4-P0-028 (PENDING).

- A stale mutation (base revision behind the server) is rejected. The authoritative row is pulled and its content hash compared with the local intent. Equal content means an idempotent replay and is adopted. Different content means the cloud row is applied locally through the validated path and the local version is retained as conflict evidence.
- Nothing is merged or overwritten by timestamp. Re-applying local intent is an explicit user action on the pulled revision.
- Edit against a tombstoned row is stale, and the tombstone wins.
- Cloud time is server-managed and is never a conflict winner. Local `createdAt` / `updatedAt` remain domain facts.

## 13. One Move sync semantics

**Approved (B4-P0-058, amended by the owner).** Sync the persisted logical-day One Move decision including `selected`, `withheld` and `completed`. A second device on the same logical day must not silently choose a different One Move. Future days may be recomputed. Unrelated derived Daily Load output is not persisted.

**Current local facts.** The record id is derived per date (`onemove-<logicalDate>`); one record per date locally. `status`: `selected | completed | withheld`; `withheld` iff no target; `completed` iff `completedAt` is set. The system replaces an unfinished record when the candidate changes and physically deletes it when no candidate remains; a completed record is never replaced. Records are written as a side effect of any change or of hydration/day rollover.

**Baseline observation.** `one_move_records` has `UNIQUE (household_id, profile_id, for_date)`, status check `selected|completed|withheld`, and `target_type` check `catalog|task|needsMe`.

**Open (B4-P0-059, PENDING; SD4).** The state machine and legal transitions; uniqueness on household plus owner plus logical day; the logical-day stored format and the authoritative timezone (`profiles.timezone` is NOT NULL with no default); how replaced or deleted unfinished records reach other devices; the polymorphic-target integrity question. The Phase 0 statement "completed-only, so no tombstone needed" is withdrawn.

## 14. RevenueCat identity architecture

Approved: B4-P0-045, 046, 047.

- Only `revenueCatClient.ts` imports the RevenueCat SDK. Entitlement stays `unknown | free | plus`, derived from CustomerInfo.
- **Sequence:** Supabase signed in, RevenueCat `logIn(<supabase user uuid>)`, CustomerInfo, resolve entitlement, then the paywall. During every identity transition the entitlement status is `loading` and is resolved only from fresh CustomerInfo. Nothing is cached in local storage.
- **Logout:** call `logOut` only if the customer is not already anonymous, then re-resolve. Test: User A Plus, logout, User B Free must not inherit A's entitlement (with a negative control that substitutes a local cache).
- **Failure:** `logIn` failure or timeout gives `unknown`, which behaves free-compatibly. RevenueCat calls carry timeouts and the screen never awaits them to render.
- **Registration paywall** is a route independent of onboarding completion. Today it is the last onboarding step and completes onboarding, so it must be reusable for existing completed users after a claim. A device-level "registration paywall shown" flag is not entitlement authority.
- **Copy and access:** "Feed a Healthy Home" with its four approved bullets; Continue with Free always visible. The existing systems upgrade entry is retained. No production price is hard-coded (an existing test enforces this).
- **Owner-side check (not code):** RevenueCat's restore/transfer behavior when an anonymous purchase meets an existing user id is a dashboard setting, to be verified with the Test Store.

## 15. Account-deletion architecture

Approved requirements: B4-P0-048. Proposed mechanism: B4-P0-049 (PENDING).

Flow: Settings, Account, Delete Account, irreversible explanation (a store subscription is not cancelled by deletion), explicit confirmation, recent authentication, secure server-side deletion, local cleanup, sign out, Welcome.

Proposed server side: an Edge Function verifies the session is recent, exchanges Apple's authorization code and revokes when credentials exist, then a service-role-only purge function deletes in explicit dependency order, then the auth user is deleted. Steps are idempotent and report the step reached. Deletion proceeds even when Apple credentials are absent, with `apple_revocation: NOT_EXECUTED`, and is not certified production-ready in that case. Client cleanup: RevenueCat logout, delete session, wipe household state, id map, queue, conflicts and quarantine entries for that account. Baseline note: several foreign keys are `ON DELETE RESTRICT`, so a household cascade-delete can fail depending on cascade order, which is why purge order is explicit.

## 16. Known schema caveats

Observed in the baseline at inspection (section 5). These are facts, not decisions.

1. `households` and `household_members` have SELECT policies only: clients cannot create or change them.
2. There are no DELETE policies on any table; hard deletion happens only via cascade or service role.
3. Six tables carry `scope` with the five values: `household_members`, `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries`. Five personal-only tables pin `scope='personal'`: `onboarding_state`, `one_move_records`, `needs_me_items`, `discovery_records`, `action_records`.
4. Policies on the scope-bearing tables are **membership-only** (`private.is_household_member`); none inspects `scope`, and none of the tables has an owner attribution column. (Direction approved by OD-1, B4-P0-038.)
5. Cloud primary keys are global text ids validated only by a regex; local ids are not globally unique (B4-P0-004, 007).
6. `authenticated` holds TRUNCATE, REFERENCES and TRIGGER (and DELETE) on all public tables; `anon` holds no table privileges. RLS does not govern TRUNCATE (the Data API does not expose it).
7. Default privileges auto-grant `anon`, `authenticated` and `service_role` on every new public table and function, so each new function needs explicit REVOKE (B4-P0-040).
8. Foreign keys on `category_id` and `subject_member_id` are `ON DELETE RESTRICT`.
9. `household_categories UNIQUE (household_id, sort_order)` is not deferrable. Deferral is deferred (B4-P0-057).
10. `events.source` CHECK still allows `'demo'`.
11. `profiles.timezone` is NOT NULL with no default. `household_members.display_name` is NOT NULL and non-blank while local `displayName` is nullable.
12. `action_records` has no UPDATE policy (append-only) and `actor_profile_id` is `RESTRICT`.
13. No tombstone (`deleted_at`) columns, no `local_id`, no claim marker and no sync metadata exist in the baseline.
14. A revision/`updated_at` trigger (`set_row_updated_at`) increments `revision` on every UPDATE unconditionally; server-managed revision is a property to confirm, not a defect (B4-P0-020).
15. Supabase Auth automatically links identities that share a verified email; this is not configurable (B4-P0-012).
16. Organization plan is `free`: no daily backups and no PITR (B4-P0-052).

## 17. Known implementation hazards

Local code, at the source-authority SHA:

1. `EnvelopeSchema` is a `z.strictObject`; any new envelope field needs a schema-version bump, and the current migration plan cannot carry it because it transforms `data` only.
2. State is one blob with no per-entity revision or timestamp; several entities have no timestamps at all (household, user, children, categories, systems, meals, discovery).
3. `dispatch` shows a change before it is validated or saved; `commit` validates first. Remote-applied changes must use a validated path (B3-AUD-026).
4. A hydration `invalid` outcome replaces state with a fresh state and persists it. Production builds do not quarantine the unreadable original (B3-AUD-025, a P4 release gate). Cloud sync raises the stakes.
5. `withTodaysOneMove` writes a One Move record as a side effect of hydration, day rollover and any change.
6. `approveDailyLoadMove` changes `task.plan` without bumping `updatedAt`; some transitions stamp no timestamp at all.
7. Local invariants (unique category `sortOrder` and `systemRole`; one One Move per date) can be broken by a naive merge, and `encodeStoredState` would then refuse to write.
8. `user.timezone` is fixed at first launch; `displayName` is never collected for real users; children, systems and meals have no production create path; production categories are the fixed 8.
9. Demo is the default in dev builds, and `origin: 'demo'` is the only discriminator (`event.source` is unused by application code). `simulateDamage` and `store.reset` have weaker gating than the screen guard.
10. The registration paywall is coupled to onboarding completion (`onboarding/plus` completes onboarding).
11. Tests can import only plain `.ts`: no `.tsx`, no `react-native`, `expo-*` or AsyncStorage. The store singleton and screens are untested this way.
12. `local_id`-style ids come from `createId`: `<prefix>-<time>-<counter><rand>`, not UUIDs; the counter resets per process.

Environment and process:

13. The machine holds a stored Supabase CLI login that belongs to K Scan. Setting `SUPABASE_ACCESS_TOKEN` in any process overrides it for that process only. Her Keys credentials are therefore process-scoped (B4-P0-054) and are never set at User or System level, nor by launching the desktop app from a credentialed shell.
14. iOS keychain items survive an uninstall (B4-P0-037).
15. A pure `SELECT` inside `BEGIN` / `ROLLBACK` is used for all read-only remote inspection; deparsed catalog text is stable only with `search_path` pinned.

## 18. Unresolved and pending decisions

> **SD4 cross-reference (added 2026-09-19).** SD4 has produced answers for most of these. **A PROPOSED SD4 answer does not make a PENDING Phase 0 decision approved.** Only two rows below carry owner approval, and both were approved during SD4, not inherited from Phase 0. Nothing in Phase 0 history is rewritten. Full register: [BUILD4_SD4_CLOUD_SCHEMA.md](BUILD4_SD4_CLOUD_SCHEMA.md) section 2; remaining unapproved items: section 14.

| ID | SD4 answer | SD4 status |
|---|---|---|
| B4-P0-007 | Native PostgreSQL `uuid` cloud PKs (SD4-001) | **PROPOSED — NOT owner-approved** |
| B4-P0-008 | `local_id text`, uniqueness per ownership boundary (SD4-004) | **PROPOSED** |
| B4-P0-009 | Soft references stored as cloud uuids, reversing the Phase 0 sketch (SD4-007) | **PROPOSED** |
| B4-P0-026 | `change_log` on `committed_xid` behind an xmin barrier (SD4-012) | **PROPOSED** |
| B4-P0-027 | Status tombstones, `deleted_at` on discovery, `cleared` on One Move (SD4-014) | **PROPOSED** |
| B4-P0-028 | Conflict evidence local-only, no cloud table (SD4-015) | **PROPOSED** |
| B4-P0-034 | `account_claims` is required (SD4-022) | **PROPOSED** |
| B4-P0-038 | `owner_profile_id` on the five content tables; **not** on `household_members` (SD4-009, SD4-009a) | **OWNER-APPROVED 2026-09-19** (HR-01) — the placement question only |
| B4-P0-040 | Three-layer privilege defense: secure default privileges, per-object grants, fingerprint drift gate (SD4-026) | **OWNER-APPROVED 2026-09-19** (HR-02) |
| B4-P0-059 | One Move state machine (SD4-016) and typed targets (SD4-018) | **PROPOSED** |
| B4-P0-059 | Logical-day authority: `profiles.timezone`, frozen `logical_day` + `timezone_at_decision` (SD4-017) | **OWNER-APPROVED 2026-09-19** (HR-03) |
| B4-P0-064 | Full proposed schema (`drafts/BUILD4_SD4_PROPOSED_SCHEMA.sql`) | **PROPOSED — design only, never executed** |

The original Phase 0 table follows unchanged.

| ID | Question | Resolved by |
|---|---|---|
| B4-P0-007 | Migrate cloud PKs from `text` to native `uuid` while both environments are empty | SD4 |
| B4-P0-008 | `local_id` type, nullability and uniqueness boundary per entity | SD4 |
| B4-P0-009 | Soft references in the local id namespace | SD4 |
| B4-P0-011 | Claim eligibility as a discriminated result | local-v3 / claim design |
| B4-P0-025 | Concrete sync mechanism and its parameters | sync implementation |
| B4-P0-026 | Incremental pull cursor | SD4 |
| B4-P0-027 | Physical tombstones per entity, including One Move | SD4 |
| B4-P0-028 | Home of conflict evidence and the review surface | SD4 |
| B4-P0-034 | Claim table and client state names | SD4 |
| B4-P0-037 | iOS install marker | client/auth implementation |
| B4-P0-043 | Client env variable names and mechanics | environment phase |
| B4-P0-049 | Deletion mechanism | account-deletion phase |
| B4-P0-059 | One Move cloud model and timezone | SD4 |
| B4-P0-061 | Exact v3 envelope shape and naming | local-v3 design |
| B4-P0-062 | Carried-forward draft requirements | when each phase is authorized |
| B4-P0-064 | Final schema (S1–S12 sketch) | SD4, then Checkpoint #2 for Production |

## 19. Owner addenda

**Checkpoint #1 addendum** (approval of the final Phase 0 architecture report):

| Item | Outcome | ID |
|---|---|---|
| OD-1, scope-aware RLS | **APPROVED.** `owner_profile_id` and scope-aware enforcement on the six scope-bearing tables. `household`: authorized household members. `child`: household/child membership semantics. `personal` and `professional`: owner only. `coparent-shared`: owner only during Build 4. Not part of Phase 1 unless required for the baseline | B4-P0-038 |
| OD-2, Production backup posture | **DEFERRED** to Checkpoint #2. No Production write authorized. Re-check recovery, report options and risk, obtain explicit approval. No automatic plan upgrade | B4-P0-052 |
| Bound-other account cache | **APPROVED.** Quarantine, never render, upload or merge | B4-P0-035 |
| One Move sync | **AMENDED.** Sync `selected`, `withheld` and `completed`, not completed-only | B4-P0-058 |
| Category reorder constraint (S7) | **DEFERRED.** No deferrable sort-order migration in Build 4 | B4-P0-057 |
| Phase 1 scope | **Database baseline / migration foundation only** | B4-P0-053 |

**Later owner directions:**

| Direction | Recorded as |
|---|---|
| Phase 1 owner-executed CLI bridge (process-scoped credentials, one remote command at a time, Staging-only link, Production parity from the read-only MCP fingerprint, Staging repair gating) | B4-P0-054, 055 |
| SD4 schema design gate, with mandatory repo-owned entry artifacts | B4-P0-063 |
| Repo authority repair: the physical Postgres type of the cloud PK is **not** settled; native `uuid` is **not** an inherited-approved constraint | B4-P0-007 |

## 20. Deferred items and current status

### 20.1 Deferred

B4-P0-052 (Production backup posture), 057 (category reorder), 065 (Google library choice), 066 (child/system/meal removal semantics), 067 (customer-record deletion, encryption at rest, multi-household, collaboration).

Also deferred to later phases by scope: Apple and Google authentication runtime, household bootstrap and claim runtime, sync runtime, RevenueCat identity runtime, account deletion runtime, local schema v3, the environment configuration boundary, the Supabase client, and all Build 4 application schema deltas. **None of these is implemented at this checkpoint.**

Runtime items that remain `NOT_EXECUTED` until real credentials and devices exist: real Apple sign-in, real Google sign-in, Production provider configuration, real RevenueCat purchase and restore, iOS development build and physical-device login, production account deletion and Apple revocation, second physical device sync, network-loss recovery, migration from an actual prior Build 3 installation.

### 20.2 Phase 1 status: IN PROGRESS / NOT COMPLETE

**Completed**

- Build 4 branch created locally from the certified SHA (no push).
- Docker verified.
- The pre-existing `supabase/` scaffold classified: no secrets, no PAT, no DB password, no K Scan reference, no Production ref, no link state, and adequate ignore coverage.
- Deterministic fingerprint tooling created under `supabase/tools/`. **It is uncommitted.**
- Read-only Staging and Production parity checked (section 5).

**Still required**

- CLI identity gate: `supabase projects list` and `supabase orgs list` must positively show the Her Keys org and both projects and no K Scan project.
- Staging-only link, with the linked ref verified.
- Repo baseline capture (`db pull` from Staging, history prompt answered NO).
- Baseline review, statement by statement, with a written record of everything removed or normalized.
- Local Docker reproduction and comparison using the same catalog method.
- A committed, repo-owned fingerprint artifact.
- Staging migration-history reconciliation (`migration repair ... --status applied`, Staging only).
- Zero-pending verification (`db push --dry-run`), advisors, zero rows and users.
- The Phase 1 completion report.

**Credentials.** The owner reports the personal access token and the Staging database password issue resolved. Claude has not run any credentialed command, and the CLI identity gate has **not yet been verified** from terminal output.

**Production during Phase 1.** Remains unlinked. No Production database password is required or used. No Production migration repair, migration, function, auth change, user or metadata write until separately authorized (B4-P0-050, 054).

---

## Appendix A — Remote-call ledger (Phase 0 and Phase 1 discovery)

Recorded for honesty. **No remote call mutated anything.**

- **Git.** `git ls-remote origin main` (read-only).
- **Identity checks.** `supabase projects list` and `supabase orgs list` under the *stored K Scan* CLI login, and the Supabase MCP `list_organizations` / `list_projects` while it was still connected to a K Scan account. Listing only: no K Scan project was queried or modified. The MCP connector was later reconnected by the owner to the Her Keys organization.
- **Her Keys Supabase MCP (read-only).** `list_organizations`, `list_projects`, `get_organization`, `get_project`, `list_tables`, `list_migrations`, `list_edge_functions`, `get_advisors` (security and performance) on Staging and Production, and `execute_sql` for catalog `SELECT` queries on Staging and Production, including the fingerprint (`BEGIN; SET LOCAL search_path = ''; SELECT ...; ROLLBACK;`). `SET LOCAL` is session-local and nothing is persisted. Two fingerprint attempts failed with SQL syntax errors before returning data and changed nothing.
- **Documentation fetches** (Expo SDK 57, Supabase, RevenueCat SDK typings): read-only.
- **Local only.** The test, typecheck, Expo Doctor and Android export baselines, the untracked fingerprint tooling, this file and `BUILD4.md`.

Production: read-only catalog and advisor queries only. **Zero Production mutations.** Staging: none. No migration history was written anywhere. No project was linked. No Edge Function was deployed. No Auth configuration was changed.

## Appendix B — Working-tree state at materialization

Branch `build/04-cloud-identity-sync` at `bab9773`, with no commits beyond `main`. Untracked: `supabase/` (the owner's stock scaffold plus the uncommitted `supabase/tools/`), `docs/builds/BUILD4.md` and this file. No tracked file is modified. Nothing has been committed or pushed.
