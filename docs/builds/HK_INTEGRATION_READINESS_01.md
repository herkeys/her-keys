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
| A5 | `BUILD4_BE03_SYNC_ENGINE.md` row `PULL_BATCH_SIZE = 200`: "a multi-year household is many batches, and the engine supports many" | It did not. The real `sync_pull` has no limit and its cursor is a transaction id (a claim is one transaction), so a response cannot be paged by count; the engine kept 200 rows and stayed at the old cursor, re-reading them forever (IR-D11). The test fakes ignored the limit exactly as the server does, which hid it. The constant is now `PULL_FETCH_CHUNK` (row requests, not batches). That historical document is left as it was; this record supersedes it. |

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

### 3b. HA-009 / HA-010 / HA-011 — observed before and after (`scripts-dev/ir01-semantics-probe.mjs`, read-only)

The same probe run against the untouched audit tip (`ROOT=<checkout of c2e56b9>`) and against the repaired branch:

| | Pre-repair `c2e56b9` | Repaired |
|---|---|---|
| **HA-009** a task `requires` an event; the event is removed | `isDone(event)` = **true**; `blockersOf` = 0; the dependent is **unblocked** (`isBlocked` = false); no vocabulary for "gone" | `isDone` = false; `blockersOf` = 0 (a removed thing is not "needed"); the dependent is **not** ready: `readinessOf` = `needsReview` |
| **HA-010** an explicit 15 and a defaulted 15 | both `durationMinutes` = 15, **no source field**; the two task rows are byte-identical apart from id/title (`indistinguishable: true`) | `default` vs `user`; distinguishable |
| **HA-011** the cloud row of a child's routine is pulled (`scope: 'child'`, `subject_member_id` set) | schema has **no** `subjectMemberId`; the pulled routine keeps `scope: 'child'` and **silently loses the child**; the state is still accepted | the routine keeps `child-1`; the integrity rules refuse a child-scoped routine without one |

Each of these is also pinned by a regression that fails when the defect is put back (mutants M15, M16, M19–M23, M26–M29 in §6.4).

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

## 6. Ledger

See `HK_INTEGRATION_READINESS_01_BACKEND.md` (composition, seed, RLS, migration, multi-device evidence) and
`HK_INTEGRATION_READINESS_01_SEMANTICS.md` (final contracts). Everything below is recomputed, not copied.

### 6.1 Commits on `repair/hk-integration-readiness-01` (local only, never pushed; nothing amended, squashed or rebased)

| Step | Commit | What |
|---|---|---|
| IR0 | `d18a19c` | source gate, plan, trace, HA-001 reproduction |
| IR1 | `17cd68c` | HA-009: a removed prerequisite is not a completed prerequisite (`standingOf`, `readinessOf`) |
| IR2 | `a584d52` | HA-010 duration knowledge and HA-011 System subject in the local canonical model |
| IR3 | `66c5440` | additive migration (`tasks.duration_source`), claim payload v3, and their backend evidence |
| IR4 | `01e6aca` | HA-001: account binding now operates durable sync, composed once |
| IR5 | `2b68e59` | real PostgreSQL/PostgREST journey through the production composition |
| IR6 | `7239a82` | schema fingerprint re-baselined intentionally; backend and composition document |
| IR6b | `08dcf02` | store seam: a change and its sync intent are one durable fact |
| IR6c | `d686bb6` | journey uses a short placeholder session token (a secret-scan false positive) |
| IR6d | `ec0ebe9` | attack matrix rows R and T |
| IR7 | `7032f86` | a pull is complete for its range; the runtime tops up after each cycle (IR-D10, IR-D11) |
| IR7b | `4168cfc` | a refused row is not "owed" again (IR-D12); source artifacts carry no text (foundation half) |
| IR7c | `c2e3411` | the task form's provenance rule is a domain function; the 31-mutant check is committed |
| IR8 | this commit | ledger, scenario map, compatibility results, gates, completion report (documentation only) |

Validation branches (isolated, never merged into anything, one per feature): `validate/hk-ir01-f01..f04`, worktrees `Her-Keys-IR01-F01..F04`.
The four feature branches, their audit branches and the shared checkout were not touched.

### 6.2 Decisions taken under the product-WHY doctrine (no owner stop was needed)

| Ambiguity | Decision | Tie-breaker used |
|---|---|---|
| Removal of a prerequisite: done, gone, or waiting? | Neither done nor waiting: **unavailable** (retired or missing), surfaced as `needsReview`. History preserved; the correction is the existing `removeDependency`. No schema | preserve truth > reduce mental load |
| A number of minutes with no recorded origin | Unknown (`null`), never promoted to hers and never assumed to be the default | preserve truth |
| An untouched prefilled 15 in the task form | The default she was shown, not what she said; touching the field makes it hers | preserve truth > preserve agency |
| Where a System's child lives | The existing member identity (`state.children[].id` ↔ `household_members.id`); children only, exactly as the cloud's composite FK; no new person concept | one coherent product |
| Who queues sync work | The infrastructure, by observing canonical mutation in the same write; features neither queue nor import sync mechanisms | one coherent product > don't create work to manage the tool |
| A fresh device's first pull vs. seeding | The device reads before it says anything (`unhydrated` sends nothing); a pull is complete for its range | preserve truth (never duplicate the cloud's rows) |
| A row the server refuses for its content | Recorded once as evidence, not re-sent by any trigger; it waits for a decision | preserve truth > don't create work |
| Backlog flag that never clears | Left conservative and recorded (debt D10): clearing it would claim an un-queued update was safe | preserve truth |

### 6.3 Defects found during the repair (this is not a second audit; P0–P3 repaired, P4+ recorded)

| ID | Sev | Type | Location | Reproduction | Impact | Repair / suggestion |
|---|---|---|---|---|---|---|
| IR-D1 | P1 | DATA-LOSS | first pull after bind (`pullEngine` + `apply`, latent) | compose a coordinator by hand; sign in with onboarding choices; first pull | server default overwrites her onboarding | **Repaired.** The seed adopts the server-created row, then queues hers as an UPDATE |
| IR-D2 | P2 | SYNC | `sync_push` allow-list | queue an `onboarding` create | permanent validation evidence; her onboarding never reaches the cloud | **Repaired** (adopt, then update only) |
| IR-D3 | P1 | DATA-LOSS | `coordinator.commit(state, namespace)` | edit while a pull or push is in flight | the edit is silently replaced when the cycle commits | **Repaired** (store turn, fetch/apply split, `mergePushResult`) |
| IR-D4 | P2 | SYNC | `pullEngine` | a child-subject row on a second device | `household_members` never pulled, so the child cannot be resolved and the cursor stalls | **Repaired** (child hydration) |
| IR-D5 | P2 | LIFECYCLE | `SyncNamespace.hydration` | fresh device | never advanced; seeding it would duplicate the cloud's rows | **Repaired** (advanced by the pull; runtime gates on it) |
| IR-D6 | P3 | UI-DEFAULT | `TaskForm.tsx` | save a new task without touching the duration | the prefilled 15 was indistinguishable from a typed 15 (the audit missed it) | **Repaired** (`durationSourceForSave`; mutant M24/M30/M31) |
| IR-D10 | P3 | SYNC | `syncRuntime.request` (my own loop) | sign in with 450 local tasks | 400 sent; the last 50 wait for some later trigger | **Repaired** (look again after each cycle; 450 leave in one sign-in, in-model and on PostgreSQL) |
| IR-D11 | P2 | SYNC | `pullEngine.fetchPullBatch`, `supabaseSyncTransport.pull` (since Build 4) | second device of a 450-task household | 200 rows kept, cursor held: the same 200 re-read forever; the device never hydrates (191 of 450 tasks in-model) | **Repaired** (a pull is complete for its range; only row requests are chunked). Real `sync_pull` proven with 450 tasks |
| IR-D12 | P3 | SYNC | `changeBridge.unsyncedRows` (my own top-up) | a scripted server refusal of one row | the same refused row re-sent on every trigger with new evidence each time (4 attempts, expected 1) | **Repaired** (a row whose create ended as evidence is not owed) |
| IR-D7 | P4 | SEMANTICS | `needsMe.ts:56` | promote a Needs Me item | `resolved` also means "promoted to a task", so a dependent reads satisfied though the work moved | recorded; owner decision |
| IR-D8 | P4 | PARITY | Task/Event integrity | subject = the adult user id | local rule admits it; the cloud FK will not | recorded |
| IR-D9 | P4 | PARITY | Meal, Category | child-scoped meal | cloud has `subject_member_id`, local has none | recorded |

Feature-layer findings from the validations are in §6.6, item 13 of the completion report (§7) and the compatibility documents.

### 6.4 Test-the-test (`scripts-dev/ir01-mutation-check.cjs`, re-runnable; one node process at a time)

A mutant is one source line changed the way the defect it guards against would change it; the tests meant to catch it are run; the file is
restored byte for byte. **A surviving mutant is a test that proves nothing.** The check found one survivor in this build (M24), which is why
IR7c exists.

| Guard | Mutants (all CAUGHT at the final code HEAD) |
|---|---|
| HA-001 composition | M1 composition stops telling the runtime about account state · M2 production root does not compose sync · M3 production store without the observer · M4 observer stops queueing · M5 sign-out does not stop the coordinator · M6 seed not applied at bind |
| HA-001 defects | M7 runtime stops after a drained queue (IR-D10) · M8 cursor held · M9 transport slices the list · M10 engine keeps the first 200 · M11 unbounded row request · M12 partial apply on failure · M13 hydration never completes (IR-D11/D5) · M14 top-up re-queues a refused row (IR-D12) |
| HA-009 | M15 **a removed event reads as satisfied again** · M16 a missing task reads as satisfied · M17 `blockersOf` names a retired prerequisite · M18 a dependent with only gone prerequisites reads ready |
| HA-010 | M19 **a defaulted duration recorded as user-provided (default 15 → user 15)** · M20 legacy number upgraded to user · M21 a changed number keeps the old provenance · M22 the projection drops provenance · M23 apply drops provenance · M24/M30/M31 the form records the prefilled default as hers · M25 an accepted reading recorded as the user's |
| HA-011 | M26 **the projection drops a System's subject** · M27 apply drops it · M28 a child-scoped System with no child accepted · M29 the adult user accepted as subject |

The composition test fails with 22 failures when the composition is disconnected (M1) and one each for M2/M3. Three further mutants of the
pull and runtime were also proved against **real PostgreSQL** (450-task journey: M7, M8, M10 fail 3, 1 and 2 checks respectively).

### 6.4b What each blocker is tested for (spec: reproduce · regress · restart · persistence · sync · malformed/stale · cross-feature)

| | HA-001 | HA-009 | HA-010 | HA-011 |
|---|---|---|---|---|
| Reproduce on the untouched tip | §3, `scripts-dev/ir01-ha001-repro.mjs` on `c2e56b9` (8 findings) | §3b, `scripts-dev/ir01-semantics-probe.mjs` | §3b | §3b |
| Regression that fails when the defect returns | `syncComposition` (31), `productionWiring` (7), `changeBridge` (32), `storeObserve` (10), `pullProgress` (9); M1–M14 | `dependencyStanding` (14); M15–M18 | `durationSource` (24); M19–M25, M30, M31 | `systemSubject` (16); M26–M29 |
| Restart | "restart: the queue and mappings survive process death…"; real DB "restart restores the same account" | "the standing survives a restart: it is derived from durable lifecycle state" | "each source survives encode → restart → decode, and a legacy row stays unrecorded across a second save" | "the subject survives encode → restart → decode" |
| Persistence | intent and state in ONE envelope write (`storeObserve`); a failed write rolls the staged intent back | lifecycle statuses are stored fields; nothing new is stored | envelope round trip; legacy key absent ⇒ `null`; ENV D on a populated DB | envelope round trip; legacy System ⇒ household-level |
| Sync (model AND real PostgreSQL) | journeys A→cloud→B, 450 tasks | "a second device still holding the live target says 'blocked'; the removal arriving by sync moves it to 'review'"; real DB "HA-009 across devices" | projection/apply/`rowMatchesLocal`; real DB "explicit 15 and default 15 are different rows in the cloud" | "LOCAL → CLOUD ROW → LOCAL"; "THROUGH THE REAL PULL ENGINE"; real DB "the child-scoped System kept its child" |
| Malformed / stale | matrix I, K, R, S, T; a refused row (IR-D12); an interrupted pull (K) | "a stale reader that sees no such target treats it as missing, never as satisfied" | "a source the schema does not know is refused rather than trusted" | dangling child is a validation failure, not a silent erase; unknown child refuses the batch instead of becoming a household routine |
| Cross-feature consumer | F01–F04 validations (§6.6); `productionWiring` proves no feature imports a sync mechanism | F01 `canWait`/Today wording; F03 `blockersFor` | F01 wording; F03 capacity wording; F02 accepted duration | F04 (§6.6.4) |

### 6.5 Scenario map — HA-001 lifecycle attack matrix A–T

In-model = `tests/hk-ir01/syncComposition.test.mjs` (real `composeAccountApp`, real store, runtime, coordinator; a model of the cloud).
Real DB = `supabase/tests/journey-composition.mjs` (real PostgreSQL, PostgREST, RLS, claim RPC).

| Row | Scenario | Evidence |
|---|---|---|
| A | brand-new user, no local content | in-model "A." (one pull, nothing uploaded, no starter duplicated) |
| B | brand-new user, local content | in-model "binding an account makes the sync runtime OPERATIONAL…"; real DB "content the claim did NOT carry reached PostgreSQL" |
| C | existing cloud account, no local content | in-model "C." and "device B pulls A's rows…"; real DB "second device resumes… and hydrates"; 450-task variant both |
| D | existing account + local content | in-model "a server refusal (superseded_by_cloud) is recorded, nothing starts, nothing is uploaded"; SQL suites 72/73/75. **Adopting an existing household on a new binding is a recorded contract, not implemented (debt D1)** |
| E | same auth session applied twice | in-model "the same session applied twice… still runs ONE coordinator" |
| F | app restart while bound | in-model "restart: the queue and mappings survive process death…"; real DB "restart restores the same account" |
| G | sign out | in-model "sign-out STOPS sync…" |
| H | account A → account B | in-model "account A -> account B on one device…"; real DB "…quarantines: nothing of A is uploaded under Q" |
| I | interrupted claim | in-model "a failed claim leaves nothing running and the household untouched; the retry seeds" |
| J | interrupted initial push | in-model "restart…" (dies during the third create) |
| K | interrupted initial pull | in-model "K." (all or nothing; relaunch completes once); `pullProgress` "a failure in a LATER chunk discards the whole fetch" |
| L | offline at bind | in-model "the seed is durable in the SAME write as the binding: offline at bind…" |
| M | retry after network recovery | same test (`networkRestored` converges); "a lost acknowledgement settles on the SAME cloud row" |
| N | duplicate queue item | `changeBridge` "three edits… ONE queue item", "the seed is stateless: applying it twice… queues nothing twice", "rows the claim already carried… NOT queued again" |
| O | stale queued mutation | in-model "another device edited the same row she has pending: the disagreement is RECORDED"; `mergePushResult` tests |
| P | second device | in-model "device B pulls A's rows…"; real DB "CLIENT A → queue → PostgreSQL → CLIENT B" |
| Q | demo mode → account mode | in-model "a DEMO household never starts sync, never queues, never reaches the cloud"; real DB "a DEMO household is refused as a whole" |
| R | account mode → demo mode | in-model "a real household that meets a DEMO build is never adopted by it and never uploaded" |
| S | quarantined local content | in-model "account A -> account B…" (quarantine); `syncEngine` "15/26. an unrelated local household is quarantined with its sync state intact" |
| T | malformed local content | in-model "malformed local storage after binding: nothing crashes, nothing is uploaded, nothing starts" |

### 6.6 Feature compatibility (each feature validated separately on its own isolated branch; nothing merged)

Method: a worktree per feature (`Her-Keys-IR01-F0N`, branch `validate/hk-ir01-f0n`) from the audit tip, the repair commits cherry-picked in
order (no conflict on any of the four), then only the adaptation the repaired semantics require, with tests, a per-feature compatibility
document (`docs/builds/HK_IR01_F0N_COMPATIBILITY.md` on that branch) and mutation checks. Each branch was brought to the final repair code
tip afterwards and re-run. No feature imports a sync mechanism, and none introduced feature-specific sync architecture.

| | Audit tip | Validation tip | tsc | Suite: audit tip → final at the repair tip | Verdict |
|---|---|---|---|---|---|
| **F01 Today** | `223d632` | `2706377` | clean | 1022 → **1216 / 1216** | **READY WITH DOCUMENTED DEBT** |
| **F02 Talk It Out** | `7e6c08b` | `47f831f` | clean | 1079 → **1273 / 1273** | **READY WITH DOCUMENTED DEBT** (OD-A gates wiring to real accounts) |
| **F03 Calendar + Capacity** | `90dd7e1` | `daed728` | clean | 1062 → **1270 / 1270** | **READY WITH DOCUMENTED DEBT** |
| **F04 Systems + Routines** | `6b6a221` | `e552fb7` | clean | 958 → **1140 / 1140** | **READY WITH DOCUMENTED DEBT** |

Each validation branch records, in its own `docs/builds/HK_IR01_F0N_COMPATIBILITY.md`, the exact files INTEGRATION must carry. Their cost in
new tests of their own (beyond the foundation's): F01 +51 (32 removed prerequisite, 15 duration wording, 4 sync notice), F02 +51 (24 account and source exclusion, 15 structured round trip, 12 duration), F03 +61 (34 duration knowledge, 27 prerequisite), F04 +39. None edited an existing
assertion to make it pass; the pinned-limitation tests each deliberately changed are named in §6.6.3 (F03) and §6.6.4 (F04).

#### 6.6.1 F01 (Today)
* Removed / archived / missing prerequisite: Today never says a dependent "needs" it and never says it was handled; when nothing live remains it says once, neutrally, "It was waiting on something that's no longer there." ("may have been" when the edge is only Her Keys' unconfirmed claim). One real defect fixed: `canWait` tested `!isDone(dependent)`, so a task required only by a removed event would have been pinned off the list for good.
* Duration: default, unrecorded and inferred durations read as estimates ("about 15 minutes — that's an estimate"; "Her Keys estimated about 15 minutes"); only `user` keeps the plain wording. Explicit 15 and default 15 produce different words. Every task saved before HA-010 reads as an estimate until she touches the duration.
* Sync notice: a backlog with nothing counted no longer prints "0 changes need your attention" (separable commit).
* Not resolved (owner): aggregate capacity claims in Daily Load ("Your day fits", "Today's tasks need about N minutes") sum durations of any knowledge; carrying the knowledge is shared Daily Load / F03 territory.

#### 6.6.2 F02 (Talk It Out + Life Inbox)
* **Needed no production source change.** Everything F02 writes already goes through the store, so the central observer transports it; nothing under its folders imports a sync mechanism (static scans of the feature, its context and its routes, plus `productionWiring`).
* **Raw wording never becomes a payload.** A canary utterance was searched for as a whole, as any 30-character run and by token, across cloud rows, every transport request, claim payloads, the change log, every envelope ever written, the queue, the identity block and diagnostics, through capture, acceptance, dismissal, restart and a signed-out queue: found nowhere. Queue items hold no payload by schema. The scan is proven able to fail (test-double readers). After a restart the review says her exact words are no longer held.
* **Capture-only state fabricates nothing.** No task, event or note appears locally or in the cloud from a capture alone; empty, high-stakes and draft input queue and send nothing; an unreadable capture syncs one metadata-only source row (withdrawn on dismissal); a capture-only household made before sign-in counts as content, so it is claimed and seeded rather than bootstrapped over.
* **Structured records round-trip to a second device**, pending / clarifying / a three-link superseded chain / accepted / rejected / dismissed / a retracted source; every reference resolves, including the child in device B's own id space; nothing arrives accepted that was not; both sync timings pass.
* **Duration:** a reading that carried a duration becomes a task with `inferred`; none is the planning default (`default`); `user` is unreachable on this path because F02 has no duration field.
* **Owner decisions (none decided; today's conservative behaviour ships):**
  * **OD-A — do unapproved readings leave the device?** After HA-001 every canonical change syncs, so a `pending`/`clarifying` reading is created in the cloud **before she has decided anything**, with a derived title (at most 90 characters of her words; for a note-only clause, her clause verbatim). Not the raw utterance, and structured, capped and under her own household's RLS, but a privacy-boundary choice the owner should make on purpose: (1) accept as designed — today; (2) hold undecided readings out of sync (an observer/foundation change that must handle supersession chains, whose references need the earlier rows); (3) stop deriving verbatim titles for note-only clauses (a feature change). **This is the decision that gates wiring F02 to a real signed-in account.** Before the repair nothing synced at all, so nothing could leave the device; this repair is what makes the question live.
  * **OD-B** — a duration she states in a free-text correction is recorded `inferred` (it reaches the reading through the reader): under-claims, never over-claims; recording `user` needs per-field provenance on `Interpretation` or a duration field in the Fix-it form.
  * **OD-C** — an event's end has no provenance: an assumed 30-minute end is durably identical to a stated one, and F03 will read F02's events as fact. The same class as HA-010, for events; out of this build's scope; pinned by a test as a documented gap.
* Integration must carry: the four new test files unchanged; shared files to merge deliberately with the other features (`TalkItOutContext.tsx`, `life/_layout.tsx`, `life/index.tsx`); dedupe F02's feature-local unresolved-capture attention against F01 Today's. Pre-existing gaps stay (no content store; `Interpretation` cannot carry a responsible party; no "user corrected" marker; no consequence field; clarification answer text not stored; Discovery answers have no transport).
* Not run (by rule): the real PostgreSQL proof of F02's own journeys, any device pass. The decided-reading freeze trigger is modelled, not exercised.

#### 6.6.3 F03 (Calendar + Capacity)
* Duration knowledge: `durationBasis` carries the foundation's knowledge (`task_recorded | task_default | task_inferred | task_unrecorded | none | event_span`); capacity still computes with every number (tiers and pressure are byte-identical) but every claim resting on a non-user-provided number says so ("About 15 min (assumed)", "(not confirmed)"; "Everything scheduled fits, counting estimated task lengths"); the evidence digest now includes `durationSource`; explicit 15 and default 15 produce different evidence AND different wording; no "you said" on any surface.
* Removed prerequisite: Calendar asked its own question (`blockersFor`) and answered "satisfied" for a removed event; it now asks the foundation's `standingOf`. A removed event, archived task, abandoned goal or absent row is no longer a blocker, no longer an "Out of order" conflict, no longer "Waiting"; the dependent reads "Review needed — Something this needed is no longer there — worth a look."
* Pinned tests changed deliberately: the `structure.ts` import allowlist (`isDone` → `standingOf`, read-only), one exact-wording assertion, one key whitelist. Evidence fixtures regenerated only through the branch's own mechanism and reviewed (+77 −0, six kinds of added line, no conclusion changed).
* Not resolved (owner): every existing task now reads "not confirmed" until edited and F03 has no way to confirm a length; whether a day's "Room" resting only on assumed lengths should be withheld rather than qualified.

#### 6.6.4 F04 (Systems + Routines)
* **HA-011 adaptation.** `saveDraft` / `applySystemDraft` carry `subjectMemberId` and derive scope from the subject (a draft that names a child gets child scope and that child's id; a household-level draft keeps an explicit `null`; a draft that omits the field cannot erase a child); the detail `SubjectView` says "For <child>" and is unchanged for household-level Systems (byte-identical evidence); an unknown id, the account user, a delegate's id, a display name, a padded id or an empty string is **refused** with calm copy and nothing is written or queued; the stale-editor fingerprint names the subject, so an editor opened before a change (by another save, by a raw mutation such as a pull, or by another device) is stale and the newer child stands.
* **Round trip:** create → persist → restart before first sync → sync through the central composition → the modelled cloud (which enforces the child-scope-needs-subject CHECK, "subject must be a child member" and `UNIQUE(system_id, position)`) → pull → a second device equal by child name, step order, schedule and handoff. Saving a child System changes only `systems`, `systemSteps` and `recurrences`: no task, event, observation or responsibility is created, and a child System still reports `run.supported === false` (no fake run semantics).
* **Pinned-limitation tests rewritten deliberately, none deleted:** Scenario H (evidence renamed `H-child-unavailable` → `H-child-subject`), Scenario AI (write), the detail-screen AI test (1 → 3), the editor "child-subject control" sentinel, and the Scenario B message: each described a state HA-011 now makes invalid, or asserted the limitation was true. 11 mutants of the new code caught. Audit findings HA-002/003/004/005/008 (and the F04 rows of HA-017/018, MP-04) re-verified passing; HA-007 lives on F03.
* **Confirm (owner, low):** clearing the child of a child-scoped System returns it to household scope (derived: child scope with no child is invalid); naming a child on an existing household-scope routine makes it child scope.
* **For integration:** the visual "who it's for" chooser is not rendered (`useSystemEditor().subjectChoices` and `actions.setSubject` are the contract; a sentinel test is what integration replaces); hub cards do not show the child; the types-only `SystemProposal` has no subject field; carry the evidence rename. **Found, not fixed (HA-009 wording):** the `Needs:` / `Needed by:` lines still list a removed or archived prerequisite by title with no standing — it makes no false claim (never blocked, done or ready), but the contract asks for "no longer available / review needed" wording.
* **Pre-existing, untouched:** MP-01 a System can never be removed, MP-03 steps cannot be removed, MP-04 `UNIQUE(system_id, position)` (the `layoutPositions` mitigation is left alone and re-proven through the composition). Not run (by rule): the real PostgreSQL proof of F04's own commands, any device pass.

### 6.7 Exit gates (recomputed; one node process at a time)

Computed at code HEAD `c2e3411`. This ledger's own commit changes only `docs/` and adds two read-only probe scripts under `scripts-dev/`
(`git diff --stat c2e3411 HEAD -- src app supabase tests package.json` is empty), so the code the gates ran against is the code at the final HEAD.

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit`, `--max-old-space-size=1600`) | **clean** (exit 0, no diagnostics) |
| Full application suite (serial) | **955 tests / 203 suites, 955 pass, 0 fail, 0 skipped** (baseline at `c2e56b9`: 812 / 812) |
| Targeted integration-readiness suite (`tests/hk-ir01`) | **143 tests / 34 suites, 143 pass** (changeBridge 32, dependencyStanding 14, durationSource 24, productionWiring 7, pullProgress 9, storeObserve 10, syncComposition 31, systemSubject 16) |
| Backend harness (`node supabase/tests/run.mjs`, real local PostgreSQL + PostgREST; nothing remote) | **794 / 794 checks** (the previous builds' recorded figure was 684 / 684; not re-run on `c2e56b9` in this session) |
| Account-binding application-composition test | `syncComposition` 31 + `productionWiring` 7 — start from `composeAccountApp`, the function the production root calls; **fail (22 failures) when the composition is disconnected** (M1) |
| Real local multi-device sync journey | `journey-composition.mjs`: **28 checks** against real PostgreSQL / PostgREST / RLS / the real claim RPC, including client A → queue → PostgreSQL → client B, restart, account switch, demo isolation, a 450-task household |
| Expo Doctor | **21 / 21** checks, no issues |
| Android export (`NODE_OPTIONS=--max-old-space-size=1024 npx expo export --platform android --max-workers 1`) | **exit 0**, one 6.3 MB Hermes bundle |
| Migration SHA-256 (working tree) | baseline `81909daa46a9a2d124fb69a7a2f246cb434b7defbddf17f97d4aba0956ec3b47` (LF git blob `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f`, the expected form; the working-tree form is CRLF under `core.autocrlf=true`) · shipping `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` (**unchanged**) · new `73db663974354f0c968b6b11b0a92f901aff6e5f464ad9bcfc953ff43a1901a4` (LF-pinned; identical in both forms) |
| Local schema fingerprint | **OLD (pre-repair)** `199ed4d4c1b37cd654b5853e91cbde27` / 3,613 facts · **NEW** `43e7c8a4402a3387cb2e1add4170921e` / **3,617** — `verify` against `ir01-local-fingerprint.json` prints **MATCH**. Against the OLD baseline it differs in exactly four dimensions (`columns` 713→714, `constraints` 678→679, `functions` body of `claim_local_household`, `privileges.columns` 719→721): the intended, understood effect of the additive migration, **not drift** |
| RLS negative tests | suite 76 (40 checks: `duration_source` and `household_systems.subject_member_id` as owner / stranger / anon — insert and update WITH CHECK, foreign-key substitution, `household_id` reassignment, server-owned column); ENV D (RLS and privileges hold on an upgraded populated database); journey (a stranger cannot read, update `duration_source` of, or plant a task in the household; the attacks changed nothing) |
| Account switch · restart · claim retry · initial sync/seed · demo isolation | matrix H · F · I · B/L · Q/R (§6.5), in-model and against PostgreSQL |
| Raw Talk It Out source exclusion | foundation half in `syncComposition` (a source artifact has no place to hold text; the projection has no column that could; a bound artifact arrives as metadata and a digest); F02's own path on `validate/hk-ir01-f02` (canary searched everywhere; found nowhere) |
| Dependency-removal · duration-provenance · System-subject regressions | `dependencyStanding` 14 · `durationSource` 24 · `systemSubject` 16, each also through sync and the real database |
| Test-the-test | `scripts-dev/ir01-mutation-check.cjs`: **31 caught, 0 survived, 0 broken** at `c2e3411` |
| Sibling-feature import scan | no feature imports a sync mechanism (queue, engines, coordinator, runtime, bridge, observer, transport, projection, apply); the repair changed one file under `src/features` (`tasks/TaskForm.tsx`) and created no new cross-feature import (8 cross-imports among the front-end feature folders `home`/`kids`/`money`/`work`/`life`/`today`/`daily-load` are the audit baseline's, untouched) |
| Secret scan | 0 hits in 6,656 added lines (JWT, Supabase and Stripe-style keys, AWS, private keys, Google keys, generic secret assignments, service-role material, credentialed URLs); no `service_role` in client source |
| `git status` | clean at the final HEAD (see the completion report) |

### 6.8 Remaining P4–P10 debt (documented, not repaired)

| ID | Sev | Item | This build |
|---|---|---|---|
| HA-012 | P4 | Calendar's evidence digest omits dependency endpoints, responsibility holder and `stillNeedsMe` | F03 added `durationSource` only |
| HA-013 | P4 | shipping migration drops/recreates and refuses populated databases | untouched (the new migration is additive and was proven on a populated database); applying anything to a real environment stays owner-gated |
| HA-014 | P4 | no row-level pull quarantine | unchanged, a little sharper: the batch is now everything settled, so one incompatible row refuses the household's batch (cursor stays; nothing is corrupted) |
| HA-015 | P4 | the strong harness never performed the production journey | **closed for the foundation**: pre-sign-in content → claim → seed → sync → second device, in-model and on PostgreSQL |
| HA-016 | P8 | stale comment in the shipping migration | untouched (that file must not change) |
| HA-017 | P10 | System/step removal and run absent | unchanged (F04 still definition-only) |
| HA-018 | P10 | DST not reproduced | unchanged; F04/F01/F03 keep their zone cases |
| HA-019 | P10 | exact utterance is session-only | preserved and now proven not to travel |
| HA-020 | P10 | no Edge Functions | unchanged |
| IR-D7 | P4 | Needs Me `resolved` also means "promoted to a task" | recorded (owner) |
| IR-D8 / IR-D9 | P4 | adult-as-subject looseness; Meal/Category subject parity | recorded |
| D1 | P2* | adopting an existing cloud household on a new binding is a recorded contract, not implemented | `superseded_by_cloud` stays an honest refusal. *Not a defect of this repair, but the reason a real second device cannot be bound through the app yet |
| D2 | P4 | `discovery_answers` has no transport | recorded |
| D3 | P4 | an un-queued *update* under a full queue is not auto-recovered (creates are) | recorded |
| D8 | P5 | `sync_pull` has no server-side bound; needs a composite `(xid, seq)` cursor | owner-gated server change; not needed at household scale |
| D9 | P6 | own writes come back through the next pull and are fetched again | safe optimisation, deliberately not made |
| D10 | P4 | `SyncNamespace.backlog` never clears and evidence has no resolve path | conservative on purpose; needs a resolve/recover flow |
| OD-C | P4 | event length has no provenance (HA-010 analog) | recorded; F02/F03 boundary |

### 6.9 Open owner decisions

**Gating** (decide before the thing they gate):
1. **OD-A (F02) — may unapproved readings leave the device?** Gates wiring F02 to a real signed-in account (details in §6.6.2).
2. **Production migration approval** — `20260921120000_ir01_duration_source_and_claim_v3.sql` is additive but **must be applied before any environment other than the local stack** and before any build of the repaired client is released: the repaired client sends claim payload v3 and the old server refuses an unknown version. OWNER-GATED; nothing was applied remotely.

**Not gating** (integration can proceed in parallel):
3. Adoption of an existing cloud household on a new device (D1): the quarantine UX and rules.
4. Every task saved before HA-010 now reads as an estimate ("not confirmed") until she confirms the duration: accept, or design a one-time "confirm your durations" path.
5. Aggregate capacity claims resting on assumed durations: Today's Daily Load ("Your day fits") is unqualified; Calendar's "Room" is qualified in the sentence but not in the tag. Hedge them, withhold them, or leave them.
6. Wording and placement of the "no longer there" review note across F01 / F03 / F04, and F04's `Needs:` lines.
7. Needs Me `resolved` also meaning "promoted to a task" (IR-D7).
8. A resolve/recover flow for `backlog` and evidence (D10).
9. F01: an unanswered-delegation row about a removed, archived or completed target still says NEEDS YOU (pre-existing; a stale request may still need withdrawing).
10. F02 OD-B (a stated duration in a correction is `inferred`) and OD-C (event-end provenance).
11. F04 (low): the two derived scope rules for subject edits (§6.6.4); MP-01/03/04 remain the owner's earlier decisions.

### 6.10 Integration requirements

1. **Order.** Foundation first (this branch, `c2e56b9..c2e3411` + this ledger). Then each feature with its validation adaptation commits, which are listed per branch (F01 `2706377`, F02 `47f831f`, F03 `daed728`, F04 `e552fb7`). Every cherry-pick of the foundation onto every audit tip was conflict-free, and the domain, persistence, state, store and Supabase trees are byte-identical across the audit tips, so the foundation merges once.
2. **Migration before client.** Apply the additive migration to a real environment before shipping the repaired client (owner gate above); the harness (`node supabase/tests/run.mjs`) verifies the local stack carries it.
3. **Contract every task producer must honour:** state a `durationSource` when you supply a duration (`user` only for a number she entered; nothing else claims it); a row without one reads as unrecorded; only `isUserProvidedDuration` may be worded as hers.
4. **Contract every dependency consumer must honour:** ask `standingOf` / `readinessOf`; never test `status === 'removed'` and call it done; word `needsReview` as review needed; the correction path is `removeDependency`.
5. **Features mutate canonical state through the store and nothing else.** No feature may import a sync mechanism or queue work (the repo test `productionWiring` enforces it); new canonical collections need an entry in the sync kind inventory (`syncKinds.ts`, `foundationSpecs.ts`) and a row in `changeBridge.test.mjs`'s "one of everything" test.
6. **Carry each feature's adaptation files** as listed in its compatibility document; the notable shared ones: F01 `OneMoveSection.durationKnowledge` is a **new required field**; F03's `calendarValidation` import allowlist changed deliberately (`isDone` → `standingOf`); F04's evidence rename; F02's four test files unchanged and the three shared files (`TalkItOutContext.tsx`, `life/_layout.tsx`, `life/index.tsx`) merged deliberately.
7. **Re-run after integration:** `tsc`, the full suite, `node supabase/tests/run.mjs` (owner harness, with each feature's rows), and the mutation check `node scripts-dev/ir01-mutation-check.cjs`; add the F02/F04 real-database journeys, which the validations were forbidden to run.
8. **Fakes must not ignore what the server ignores.** IR-D11 hid for a whole build because the fake transport ignored `limit` exactly as the real function does; keep fakes faithful to the server's actual behaviour.

### 6.11 Verdicts

| | Verdict |
|---|---|
| HA-001 | **PASS** |
| HA-009 | **PASS** |
| HA-010 | **PASS** |
| HA-011 | **PASS** |
| BACKEND FOUNDATION | **PASS WITH DOCUMENTED DEBT** |
| COMMON FOUNDATION | **PASS WITH DOCUMENTED DEBT** |
| F01 COMPATIBILITY | **READY WITH DOCUMENTED DEBT** |
| F02 COMPATIBILITY | **READY WITH DOCUMENTED DEBT** (OD-A gates wiring to real accounts) |
| F03 COMPATIBILITY | **READY WITH DOCUMENTED DEBT** |
| F04 COMPATIBILITY | **READY WITH DOCUMENTED DEBT** |
| **HK-INTEGRATION-READINESS-01** | **READY AFTER OWNER DECISION** |

Why not "READY FOR FEATURE INTEGRATION" outright: every condition of its definition is met in code and evidence (HA-001/009/010/011 repaired; the production app composes the existing sync system; the lifecycle starts and stops it; legitimate pre-binding content cannot stay device-only; no open P0/P1/P2 affecting shared truth; the backend harness passes; the schema state is understood; F01–F04 validate independently; no feature-specific sync architecture exists). What remains is two decisions that are the owner's to make on purpose, not defects: OD-A, because this repair is precisely what makes F02's undecided readings leave the device, and the production-migration gate, because the repaired client cannot bind against an unmigrated backend.

## 7. Completion report

1. **Exact starting HEAD.** `c2e56b9fc860a60eb51dde9f1a55ab8a6025beb9` (`audit/hk-hostile-01-report`; ancestors `5007b0f → d762418 → 3f567d2`; §1).
2. **Exact final HEAD.** The commit that carries this document on `repair/hk-integration-readiness-01` (`git log -1 --format=%H`). Its code is byte-identical to `c2e3411` (the gates in §6.7 ran there); it adds only documentation and two read-only probe scripts.
3. **Commits made.** §6.1: IR0–IR7c (13 commits) plus this one, on the repair branch; and, on four isolated validation branches, the ten-plus repair cherry-picks and each validator's adaptation commits. Nothing was pushed, merged, rebased, squashed or amended, nothing was staged with `git add -A`, and no branch, worktree or checkout that is not part of this build was modified.
4. **HA-001.** *Reproduced:* yes, on the untouched tip, eight findings (§3; `scripts-dev/ir01-ha001-repro.mjs`). *Root cause:* nothing ever constructed a coordinator (the only reference to `createSyncCoordinator` outside its own file was its definition); a claim carried only the One Move closure and left no queue; mutations were never bridged to a queue; and, once a coordinator was composed by hand, its first pull overwrote local onboarding and its commit replaced concurrent edits. *Repair:* one composition (`composeAccountApp`) that the production root and every test call; a pure change bridge observing every canonical mutation inside the store's write turn, so state and queue intent are one envelope write; a lifecycle-managed runtime with exactly one coordinator per bound account; pull/push results applied against the CURRENT state; claim payload v3; an initial seed that adopts the server-created onboarding row and queues every legitimate unmapped row (bounded, dependency-ordered, never dropped, stateless); pull-side hydration of children; and (found on the way) a pull that is complete for its range. *Production path:* the production root (`accountRuntimeInstance.ts`) calls `composeAccountApp`, which subscribes the sync runtime to every account state change (`syncRuntime.onAccountState`: bound starts it, anything else stops it); `AccountProvider` requests a cycle on foreground. *Seed:* same write as the binding; offline at bind loses nothing. *Restart:* queue and mappings survive process death and converge with no duplicate and no second claim (in-model and on PostgreSQL). *Multi-device:* client A → queue → PostgreSQL → client B, tasks equal with duration knowledge, the child and the child-scoped System intact, a removed prerequisite reads "needs review", pulled state produces no outbound work; a 450-task household in both directions.
5. **HA-009.** *Contract:* a prerequisite's standing is derived from lifecycles that already exist — `satisfied | pending | unavailable{retired|missing}`; `readinessOf` is `ready | blocked | needsReview`; removed ≠ completed, missing ≠ satisfied. *Missing:* `unavailable/missing` (validation forbids a dangling edge; this is the defensive read). *History:* no dependency row is ever rewritten, deleted or re-pointed; `removeDependency` is the explicit correction. *Consumers:* ask `standingOf`/`readinessOf`; `blockersOf` names only live prerequisites; word `needsReview` as review needed. No schema change. (SEMANTICS §1.)
6. **HA-010.** *Contract:* `Task.durationSource: 'user' | 'default' | 'inferred' | null`; the minutes are for computation only. *Explicit 15:* `user` (typed in the field) — distinguishable in the state, the envelope, the cloud row and the wording. *Default 15:* `default` (the planning default she was shown). *Unknown/legacy:* `null` — not user-provided, not a known default; a stored task with no key decodes to `null` and a second save does not upgrade it; in the cloud existing rows keep `NULL` (proved on a populated database). *Accepted reading / approved shortening:* `inferred`. *Persistence/sync:* additive `tasks.duration_source` with a CHECK and column grants; projected, applied, comparable for lost acknowledgements, carried by claim v3. (SEMANTICS §2.)
7. **HA-011.** *Contract:* `HouseholdSystem.subjectMemberId` is the child a routine is about, in the existing member identity; never a name, never guessed. *Local:* `Id.nullable().default(null)`; integrity: a subject must be a child of this household (the account user is not one); `scope: 'child'` requires one; a dangling child is a validation failure. *Cloud:* `household_systems.subject_member_id` already existed with its composite FK, check, derived type, RLS, grants and allow-list — no schema change. *Household-level:* explicit `null`, unchanged. *Child/subject:* outbound `childRef` (an unmapped child refuses to leave the device rather than sending a household routine); inbound keeps an unresolvable uuid so the gate names it and the cursor does not advance. *Round trip:* local → row → local; through the real pull engine; a second device via child hydration; on PostgreSQL. (SEMANTICS §3.)
8. **Database / backend.** *Migration:* one additive file (`tasks.duration_source` + CHECK + column grants; `CREATE OR REPLACE claim_local_household` — same signature, `SECURITY DEFINER`, empty `search_path`, ACL preserved; v2 unchanged, v3 = all children + `durationSource`). *RLS:* unchanged; no policy or trigger added. *Constraints:* one CHECK. *Functions/RPC:* the claim; no Edge Function. *Sync mapping:* `duration_source`; System `subject_member_id`; `household_members` children pulled; `onboarding` adopted then updated. *Fingerprint* OLD `199ed4d4…`/3,613 → NEW `43e7c8a4…`/3,617, four dimensions, intentional. Harness 794/794; ENV D upgrades a populated database in place with no row lost or rewritten. §6.7.
9. **Feature compatibility.** F01 / F02 / F03 / F04 each **READY WITH DOCUMENTED DEBT**, each on its own validation branch, each with a compatibility document (§6.6). One decision gates F02's wiring (OD-A).
10. **Test accounting.** App suite 812 → **955 / 955** (+143, all in `tests/hk-ir01`, 143 tests / 34 suites); harness 684 → **794 / 794**; mutation check **31 / 31 caught** (a surviving mutant found in this build, M24, led to IR7c); feature branches at the repair tip: F01 1216, F02 1273, F03 1270, F04 1140, all green. Existing tests edited (no assertion weakened): `claimPayload` (version 3; "every child is sent" replaces "only the closure's child" — the v3 contract), `accountRuntime` (version 3), `foundationAcceptance` ×3 and `foundationOps` (explicit `subjectMemberId: null`; `goalProgress` gains `unavailable`), `syncEngine` (constant renamed, range tightened), fixtures `legacyShapes`/`richHousehold`, SQL 72/73 (an "unknown future version" example 3 → 4).
11. **Performance.** No unbounded full-state scan per mutation: the observer walks only collections whose reference changed — an untouched 5,000-row collection costs ~0.01 ms per observed change and one edit inside it ~1–3 ms (measured under load). No repeated full serialization (intent rides the existing envelope write); the seed is stateless (twice → nothing twice) and bounded (ceiling 400, headroom 100); one coordinator constructed per bound account (asserted); no polling (foreground, debounced local mutation, bounded backoff only while offline with work queued). Initial sync: linear — 450 tasks sent and pulled back in about 1 s in-model, 2,000 in about 3.5 s, 5 row requests per 450 tasks on PostgreSQL. **Demonstrated issues, all repaired:** a pull that never terminated above ~200 rows (IR-D11), a half-sent household above the queue ceiling (IR-D10), a refused row re-sent on every trigger (IR-D12). Recorded: unbounded `sync_pull` metadata (D8), own-write echo re-fetch (D9), `standingOf` is a linear scan per edge.
12. **Security / privacy.** RLS negatives on PostgreSQL (§6.7); no service-role dependency in the client path (the only mention in client source is a comment forbidding it); local-only kinds never travel (a canary in migration evidence appears in no sent row and no cloud table); a demo household never syncs, is never adopted and never claimed; account switch quarantines and uploads nothing of A under B; a source artifact has no place for text (schema, projection, cloud column); 0 secrets in 6,656 added lines; no credential, provider or remote change. **The one privacy-boundary question this repair opens is OD-A.**
13. **New defects discovered.** IR-D1…IR-D6, IR-D10…IR-D12 repaired; IR-D7…IR-D9 recorded (§6.3); feature-layer: F01 sync notice printing "0 changes" (repaired, separable), F01 `canWait` pinned by a removed event (repaired), F01 unanswered-delegation row for a set-aside target (recorded), F03 `blockersFor` treating a removed event as satisfied (repaired), F04 removed prerequisite listed by title (recorded), F02 derived titles of undecided readings sync (OD-A).
14. **Remaining P4–P10 debt.** §6.8.
15. **Remote changes.** **NONE.** No push, no PR, no merge, no remote mutation; no staging or production Supabase, migration, Edge Function, RLS, auth-provider, Apple/Google/EAS or Gemini change. The only stateful action outside the repository was applying the additive migration to the shared **local** Docker database (`supabase_db_Her_Keys`), which the local sync journeys need; the harness verifies it.
16. **Owner decisions still open.** §6.9 — gating: OD-A and the production-migration approval.
17. **Integration requirements.** §6.10.
18. **Final verdicts.** §6.11 — HA-001 / HA-009 / HA-010 / HA-011 **PASS**; BACKEND FOUNDATION and COMMON FOUNDATION **PASS WITH DOCUMENTED DEBT**; F01 / F02 / F03 / F04 **READY WITH DOCUMENTED DEBT**; **HK-INTEGRATION-READINESS-01 = READY AFTER OWNER DECISION.**
