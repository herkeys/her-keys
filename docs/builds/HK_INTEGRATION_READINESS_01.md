# HK-INTEGRATION-READINESS-01 — repair plan, trace and ledger

Repairs four shared blockers from HK-HOSTILE-AUDIT-01 (HA-001, HA-009, HA-010, HA-011) so the four audited
feature branches can integrate against truthful, durable common semantics. **No new features. No merge.**
Local only: no remote, staging, production, credential or provider change.

## 1. Provenance (source gate)

| Item | Value |
|---|---|
| Common original fork | `design/01-front-end-system` = `5007b0f2e6de34e8ce476fac11a8acd2cf1e69a1` |
| Audit report/foundation branch | `audit/hk-hostile-01-report` = `c2e56b9fc860a60eb51dde9f1a55ab8a6025beb9` |
| Its history | `5007b0f → d762418 (state/responsibility/recurrence) → 3f567d2 (local-content classifier) → c2e56b9 (audit report, docs only)` |
| **Repair branch** | `repair/hk-integration-readiness-01`, created from `c2e56b9` in worktree `C:\Users\jsmit\Her-Keys-IR01` |
| F01 / F02 / F03 / F04 audit tips | `223d632` / `7e6c08b` / `90dd7e1` / `6b6a221` (all verified, all worktrees clean) |
| Baseline before any edit | `tsc` exit 0; app suite **812/812** (matches the audit's figure) |

Two facts recorded from the gate:

* The expected hashes `d762418`/`3f567d2` are **ancestors**, not the branch tip: a later commit (`c2e56b9`, docs only) exists.
  Nothing was reset to an expected hash; the repair starts from the real tip.
* The four feature audit branches fork from `5007b0f` and do **not** contain `d762418`/`3f567d2` as ancestors (the audit
  cherry-picked equivalents: `df44a0f`/`223d632`, `6dd7fa2`/`7e6c08b`, `5fbd6df`/`90dd7e1`, `d9852dc`/`6b6a221`).
  `src/domain/**`, `src/persistence/**`, `src/state/**`, `src/store/**` and `supabase/**` are byte-identical across all five
  trees, so a foundation repair is a repair for all of them.

Audit documents read in full: `HK_HOSTILE_AUDIT_01_DEFECTS.md`, `_BACKEND.md`, `_FOUNDATION.md`, `_RECONCILIATION.md`,
`_OWNER_DECISIONS.md` (OD-01 removal of a prerequisite, OD-02 duration knowledge, OD-03 child-specific Systems).

## 2. Where the audit was incomplete or slightly wrong (documented per FIND → REPRODUCE → UNDERSTAND)

| # | Audit statement | Actual finding |
|---|---|---|
| A1 | HA-009 cites `unmetPrerequisites` in `structure.ts:70-85` | That symbol does not exist in any tree. The functions are `isDone` (`structure.ts:70`) and `blockersOf` (`:81`). The defect is real: `isDone` returns true for an **event** exactly when `status === 'removed'` (`:74`). F03 has its own, third answer in `collect.ts:120-150` (a removed **or missing** event is *skipped*, i.e. satisfied). |
| A2 | HA-001: "no production coordinator; unclaimed rows have no outbound work" | Confirmed by reproduction (§3). Additionally found: (a) the first pull overwrites local onboarding with the server default; (b) `sync_push` refuses `onboarding_state` (it is in neither allow-list) although `onboarding` is a create/update sync kind; (c) the pull engine ignores `household_members`, so a second device never learns a child exists; (d) the coordinator's `commit(state, namespace)` replaces state derived at cycle start, so a user edit made during a network wait would be silently lost the moment a coordinator is composed. |
| A3 | HA-010 cites `tasks.ts:13,38` | `DEFAULT_TASK_DURATION_MINUTES` is `tasks.ts:15`, used at `:40`. There is a **second, UI-level default**: `TaskForm.tsx:34` pre-fills `'15'`, so an untouched prefilled 15 is indistinguishable from a typed 15. |
| A4 | HA-011 cites `state.ts:185`, `projection.ts:123` | Actual `state.ts:188-196` and `projection.ts:124`. On **pull** the subject is dropped and `scope: 'child'` is kept, and `validateAppState` does not object because `checkSubject` is applied to tasks/events only. Meal and Category have the same latent gap (out of scope, listed as debt). |

## 3. HA-001 reproduction (untouched code, real modules, scripted platform leaves)

`repro-ha001.mjs` composes exactly what `src/store/accountRuntimeInstance.ts` composes (real `createAppStore`,
`createAppStateRepository`, `createAccountRuntime`, secure-session store; only AsyncStorage/SecureStore/Apple/Supabase are stand-ins):

```
1. account state after signIn            : accountBound
2. claim payload carried tasks           : 0   (the permission-slip task is outside the One Move closure)
3. local tasks / durable mappings for it : 1 / 0
4. outbound queue after bind             : 0 item(s)   <-- the pre-claim task has NO outbound work
5. onboarding mapping present            : false
6. queue after a post-bind mutation      : 0 item(s)   <-- mutation is not bridged to the queue
7. production callers of createSyncCoordinator: [coordinator.ts]  (definition only)
8. local onboarding goals before first pull: ["calmer-household"]
   local onboarding goals after  first pull: []   <-- server default overwrote local content
```

## 4. Source trace

### HA-001 — account binding → operating durable sync

| Stage | Symbol | Location |
|---|---|---|
| composition root | `accountRuntime` (auth + claim only) | `src/store/accountRuntimeInstance.ts:49` |
| provider mirror | `AccountProvider` (reads `snapshot.identity.sync`; never starts anything) | `src/store/AccountProvider.tsx` |
| restore / sign-in / resume | `restore`, `signIn`, `resolveBinding` | `src/domain/account/accountRuntime.ts:128,183,205` |
| bind decision | `decideBinding`, `describeLocalHousehold` | `src/domain/account/claim.ts:33,96` |
| claim payload | `buildClaimPayload` (v2, One Move closure only) | `claim.ts:366` |
| namespace birth | `namespaceFromClaim` → `emptyNamespace` + id-map mappings, **empty queue** | `src/domain/sync/claimSeam.ts:53` |
| durable identity | `identity.sync` written with the household in one envelope | `appStateRepository.ts:117`, `appStore.ts:344` |
| engine | `createSyncCoordinator`, `pullOnce`, `pushPending`, `enqueue`, `scheduled` | `coordinator.ts:67`, `pullEngine.ts:92`, `pushEngine.ts:33`, `queue.ts:53` |
| transport | `createSupabaseSyncTransport` (**never constructed by the app**) | `src/platform/supabaseSyncTransport.ts:24` |
| server | `bootstrap_account`, `claim_local_household` (v2; children must be in the One Move closure), `sync_push` (allow-list), `sync_pull` | migration `20260919231500…` `:4692, :4897, :5586, :5533` |
| harness | `makeDevice` hand-assembles a coordinator and hand-calls `enqueue` | `supabase/tests/sync-integration.mjs:89-159` |

**Sync-capable canonical kinds (28)** and their classification (final table in the BACKEND doc): 10 core
(`category event task system meal needsMe oneMove discovery onboarding action`) + 18 foundation
(`sourceArtifact interpretation externalReference observation authority intent decision execution outcome person responsibility
dependency recurrence goal systemStep capacity pattern evidenceLink`). `execution`/`outcome` are server-written (pull-only).
Mapping-only (claim-only, no client write grant): `household`, `member`. Local-only by design: `migrationEvidence`,
`migrationLineage`, session-only Talk It Out source text, presentation state, quarantined corrupt bytes.

### HA-009 — removed prerequisite

`isDone` (`structure.ts:70-78`); `blockersOf` (`:81`); `isBlocked` (`:88`); `goalProgress` (`:133`); edge lifecycle
`removeDependency` (`:64`, `Dependency.status: 'active'|'removed'`). Lifecycles: task `open|completed|archived`, event
`active|removed`, needsMe `open|resolved`, goal `active|achieved|paused|abandoned`, system/meal none. Removal is **always a
status change, never a deletion**, and `validateAppState` requires every dependency endpoint to exist, so no edge ever dangles.
Consumers: F01 `requirements.ts`, `canWait.ts`, `attentionView.ts`; F03 `collect.ts:120-150`; F04 `detail.ts:27-43` (neutral).
An existing internal vocabulary already separates the meanings: `oneMove.ts:42` `TargetStanding = 'open'|'done'|'gone'`.

### HA-010 — duration knowledge

`DEFAULT_TASK_DURATION_MINUTES` `tasks.ts:15`; writers: `addTask :40`, `updateTask :65`, `TaskForm :34/:62`, `acceptInterpretation
interpretations.ts:236`, `approveShortenTask recommendationActions.ts:162`, sync `apply.ts:81`. Schema `state.ts:160`. Cloud
`tasks.duration_minutes integer NOT NULL` (hand-written, outside the generated block). Precedent for typed "not known": facet
fields declared `.nullable().default(null)` (`commitment.ts:37`) — absent key ⇒ unknown, no envelope version bump needed.
Consumers: F03 `collect.ts:253,310` (`durationBasis: 'task_estimate'` for any positive number), F01 `oneMoveView.ts`,
F02 `coordinator.ts:357`, F04 (already null-aware).

### HA-011 — System subject

Local `HouseholdSystem` (`state.ts:188`) has no subject; cloud `household_systems.subject_member_id` exists, with composite FK to
`household_members(id, household_id, member_type='child')`, `child_scope_subject_check`, trigger-derived `subject_member_type`,
column grants (INSERT/UPDATE) and the `sync_push` allow-list already in place. Identity model: a subject is a **member** id
(`user.id ∪ children[].id` locally; `household_members.id` in the cloud); `people` are a different identity (not members,
never subjects). Task/Event already use `childRef` for the mapping; System does not.

## 5. Repair boundary and decisions

### Will change
1. **HA-001** — one composition path: a pure change bridge observing every canonical state change inside the store's write
   turn (state + queue intent in the same envelope write); an initial seed at bind that adopts server-created rows and queues
   every unmapped syncable row (bounded, dependency-ordered, never dropped); a lifecycle-managed `SyncRuntime` owning exactly
   one coordinator per bound account (start/stop/switch/sign-out/restart); race-safe commit of pull/push results against
   concurrent edits; a composition function that both the production root and the tests call; claim payload **v3** so every
   child gets its mapping; pull-side hydration of children; harness devices built from the production runtime.
2. **HA-009** — one shared standing vocabulary derived from the *existing* lifecycles (no new persisted primitive, no schema
   change, no history rewrite): `satisfied | pending | unavailable`. Removed ≠ done; missing ≠ satisfied; `blockersOf` names
   only live prerequisites so nothing keeps asserting a removed thing exists; `readinessOf` is three-valued and conservative;
   `removeDependency` remains the correction path.
3. **HA-010** — `Task.durationSource: 'user' | 'default' | 'inferred' | null` next to `durationMinutes` (`null` = provenance not
   recorded ⇒ legacy/ambiguous). `DEFAULT ≠ USER-PROVIDED`. The number is retained for computation only. Cloud column +
   CHECK + grants via a new **additive** migration; claim v3 carries it; `TaskForm` distinguishes touched from prefilled.
4. **HA-011** — `HouseholdSystem.subjectMemberId` (`Id.nullable().default(null)`), the same integrity rule as Task/Event but
   children-only (matches the cloud), projected and applied through the existing `childRef`/`resolve` helpers.

### Will not change
No feature branch merge; no new screen/tab/dashboard; no LLM; no autonomous execution; no run/occurrence engine; no deletion UX;
no Edge Function; no remote change. No F01–F04 sync helper. No edit to the shipping migration
(`1e9169de…`) or the baseline. Not implemented and recorded as debt: adopting an existing cloud household on a new device
(recorded contract R7/R10 in `BUILD4_PHASE0_CHECKPOINT.md §4`), Meal/Category subject parity, adult-subject looseness for
Task/Event, `discovery_answers` transport, row-level pull quarantine (HA-014).

### Stop conditions evaluated
* HA-009: existing semantics **can** represent a truthful answer (derived standing + existing edge retirement) → no owner stop.
* HA-011: parity with the *existing* member identity, not a new identity model → no owner stop.
* Migration: additive only; existing rows keep `NULL` (uncertainty preserved); nothing discarded → no stop.

## 6. Ledger (filled in as work completes)

See `HK_INTEGRATION_READINESS_01_BACKEND.md` (composition, seed, RLS, migration, multi-device evidence),
`HK_INTEGRATION_READINESS_01_SEMANTICS.md` (final contracts) and the completion report appended below at IR9.
