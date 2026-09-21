# HK-FEATURE-06-HOME — Home OS: build ledger

Feature 06, Wave 2. Branch `feature/06-home-os`, worktree `C:\Users\jsmit\Her-Keys-F06`. **Local only: no push, PR, merge, rebase, squash or amend; no remote, staging, production, credential or provider change.**

This ledger is written phase by phase (HM0 … HM8). The status table says which sections are complete at the commit that carries it.

| Ledger status | |
|---|---|
| Sections 1-5 | HM0 (this commit) |
| Sections 6-10 | HM1 |
| Sections 11-25 | HM2-HM6 |
| Sections 26-45 | HM7-HM8 |

---

## 1. Source / fork

| Item | Value |
|---|---|
| Development baseline branch | `repair/hk-integration-readiness-01` |
| Development baseline HEAD (verified) | `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1` |
| Code state the repair gates ran against | `9dbe02a` |
| Feature branch | `feature/06-home-os`, created from `14bd58e` in a NEW worktree |
| Worktree clean at fork | yes (`git status --short` empty) |

**Verified mechanically, not taken from the instruction:**

* `git rev-parse repair/hk-integration-readiness-01` = `14bd58ed…` = the requested HEAD.
* `9dbe02a` is an ancestor of `14bd58e`; the only commit between them is `14bd58e` ("IR10: ledger updated …").
* `git diff --stat 9dbe02a 14bd58e` touches exactly one file, `docs/builds/HK_INTEGRATION_READINESS_01.md`; excluding `docs/` the diff is **empty**, so the code at `14bd58e` is byte-identical to the code the repair gates ran against.
* The repair ledger (`HK_INTEGRATION_READINESS_01.md` §6.7 and §7 item 2) states the gates were computed at `9dbe02a`, that its own commit "changes only `docs/`", and records the verdict READY FOR FEATURE INTEGRATION.
* The IR01 worktree was clean at `14bd58e`.

### 1.1 Gate corrections that apply to this build (owner policy change, 2026-09-21)

The first attempt at this feature STOPPED at the previous contract's sequencing gate (no `HK-WAVE2-SOURCE-01`, no integrated Wave 1, no shared Life registry). The owner then corrected the Wave 2 build policy. For Feature 06:

| Previous gate | Now |
|---|---|
| `HK-WAVE2-SOURCE-01` must exist | **Not a prerequisite.** This branch does NOT create a competing one. The exact development baseline and verified foundation facts are recorded here. The Wave 2 source authority is created later, at integration/certification. |
| Wave 1 (F01-F04) must be merged | **Not required.** No F01-F04 branch is imported. Only common-foundation semantics present at `14bd58e` are used. |
| A generalized Life extension/registration mechanism | **Not a prerequisite.** Home is built behind the existing route `app/(app)/life/home.tsx`. No Life hub redesign, no Life registry, no sibling registrations. Recorded as integration item `HK-INT-WAVE2-LIFE-REGISTRATION`. |
| Unified cross-feature attention vocabulary | **Not a prerequisite.** Home uses the common primitive that exists (`attentionFor`) and otherwise shows factual conditions. F01 `attentionView` and F03 conflict/tightness code are NOT imported. Cross-feature reconciliation with Today/Calendar belongs to integration. |

The hard owner checkpoint for NEW durable semantics/schema is unchanged, and the true stop conditions are the revised list. Where a sub-capability is blocked, only that sub-capability stops.

---

## 2. Source-gate evidence (HM0 — baseline verification)

Recomputed in this worktree at `14bd58e`, before any product change.

| Gate | Result |
|---|---|
| `tsc --noEmit` (`node --max-old-space-size=1600 node_modules/typescript/bin/tsc --noEmit`) | **exit 0** |
| Full app suite, serial (`--test-concurrency=1`) | **975 tests / 207 suites, 975 pass, 0 fail, 0 skipped, 0 cancelled** (≈90 s). Matches the repair ledger (812 → 975; +163 in `tests/hk-ir01`). |
| Migration hashes | baseline `20260919230054_build4_baseline.sql`: git blob **`8bc38d66…`** (working tree `81909daa…` is the `core.autocrlf` CRLF form — not drift); shipping `20260919231500_build4_cloud_schema.sql` working tree **`1e9169de…`**; additive `20260921120000_ir01_duration_source_and_claim_v3.sql` **`73db6639…`** (identical in blob and working tree; LF-pinned). |
| Local schema fingerprint (read-only measurement of the shared `postgres` DB, no reset) | `schema-fingerprint.mjs verify … --against baselines/ir01-local-fingerprint.json` → **MATCH**, gating digest **`43e7c8a4402a3387cb2e1add4170921e`**, **3617** facts. |
| Backend harness (`node supabase/tests/run.mjs`) | see §2.2 |
| IR01 mutation check (`scripts-dev/ir01-mutation-check.cjs`, 35 mutants) | Not re-run at HM0: it is the repair build's own check, and it is a long run on a memory-starved host. Recomputed at the final gate (HM8) if the host allows; otherwise recorded as NOT RE-RUN with the reason. |
| Expo Doctor / Android export | Recomputed at HM8. |

### 2.1 The 18 source-gate items

| # | Item | Evidence at `14bd58e` |
|---|---|---|
| 1 | Exact HEAD | `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1` |
| 2 | Clean worktree | yes |
| 3 | Integrated Wave 1 state | **N/A by owner policy** (§1.1). F01-F04 are not imported. |
| 4 | HA-001 operating account sync | `composeAccountApp` (`src/store/composeAccountApp.ts:40`) is the one composition production (`accountRuntimeInstance.ts`) and tests share; `tests/hk-ir01/syncComposition.test.mjs` starts from it. Every canonical mutation becomes queue intent in the same envelope write through `changeObserver` → store `observe` (`appStore.ts:55,184`), "with no feature involved". |
| 5 | HA-009 dependency truth | `standingOf` (`src/domain/structure.ts:92`), `blockersOf` `:128`, `unavailablePrerequisitesOf` `:137`, `readinessOf` `:149`. A removed event/archived task is `unavailable`, never `satisfied`. |
| 6 | HA-010 duration provenance | `Task.durationSource` (`state.ts:163`), `durationKnowledgeOf` / `durationSourceForSave` / `isUserProvidedDuration` (`src/domain/foundation/duration.ts:29,48,54`). |
| 7 | HA-011 subject/member identity | `HouseholdSystem.subjectMemberId` (`state.ts:201`), children-only integrity rule (`state.ts:646`); Task/Event `subjectMemberId` (`state.ts:160,126`). |
| 8 | Life exists | `app/(app)/life/{_layout,index,home,kids,meals,money,work,needs-me,other-tasks}.tsx` |
| 9 | Shared Life registration mechanism | **ABSENT** (the hub is a hard-coded `StatusList` in `app/(app)/life/index.tsx`; routes come from `LIFE_SCREEN_ROUTES` in `src/features/life/lifeStatus.ts:28`). **Not a stop condition under the corrected policy.** Home uses the existing `/life/home` route. Integration item `HK-INT-WAVE2-LIFE-REGISTRATION`. |
| 10 | Canonical task create/edit | `addTask` (`src/domain/tasks.ts:37`), `updateTask` `:71`, `completeTask` `:99`, `archiveTask` `:122`, applied through `store.commit` (`appStore.ts:81`); UI `src/features/tasks/TaskForm.tsx`. |
| 11 | Canonical commitment/event create/edit | `addEvent` (`src/domain/events.ts:36`), `updateEvent` `:79`, `removeEvent` `:90`; UI `src/features/calendar/EventForm.tsx` (no initial-category parameter — see §3). |
| 12 | Systems definitions and recurrence | `HouseholdSystemSchema` (`state.ts:191`); `RecurrenceRuleSchema` (`foundation/structure.ts:105`); `addRecurrence` (`structure.ts:213`), `setRecurrenceStatus` `:245`, `occurrencesOf` `:250`, `nextOccurrence` `:330`. **No System creation function exists** (only `addSystemStep`). |
| 13 | Responsibility lifecycle | `src/domain/responsibility.ts`: `delegate` `:105`, `acknowledge` `:133`, `accept` `:141`, `decline` `:149`, `completeResponsibility` `:156`, `returnToSelf` `:164`, `reassign` `:177`, `liveResponsibilityFor` `:79`, `needsMePersonally` `:220`. |
| 14 | Shared attention/timing — actual symbols | `attentionFor(state, nowMs)` and `ATTENTION_REASONS` / `AttentionItem` / `AttentionUrgency` in `src/domain/reasoning/attention.ts:22-99`. Derived, never persisted. |
| 15 | Canonical Home context | starter category `cat-home` with `systemRole: 'home'` (`src/domain/categories.ts:16`), `categoryWithRole(state, 'home')` `:50` ("whatever it is called and whether or not it is archived"), `requireUnique('category systemRole')` (`state.ts:577`). Proven in HM1. |
| 16 | Completion / outcome / observation history | `BehaviorObservation` with closed outcomes (`foundation/observation.ts:23-89`); `completeTask` appends `completed` in the same transition that sets `completedAt` (`tasks.ts:99-115`); `appendObservation` / `observationsAbout` (`observations.ts:34,75`). |
| 17 | Household timezone / logical day | `state.user.timezone`; `logicalDateAt` (`logicalDay.ts:157`); `TransitionContext.today` (`appStore.ts:172`). |
| 18 | Fingerprint and migration hashes | §2 table. |

### 2.2 Backend harness at HM0

**INCOMPLETE — environmental abort, NOT counted as a pass and NOT a code failure.** `node supabase/tests/run.mjs` printed 14 consecutive `ok` lines of the `composition:` journeys (sync runtime operating; unclaimed content reached PostgreSQL; explicit 15 vs default 15 are different cloud rows; child-scoped System kept its child; post-bind mutation reached PostgreSQL through the queue; removal reached the cloud as a status and the dependency edge was not rewritten; second device hydrated with duration knowledge intact; HA-009 across devices; RLS: stranger cannot read/plant/update; quarantine on account switch; demo household refused) and then aborted with `HARNESS ERROR: composition query failed: spawnSync docker UNKNOWN`. That is the host memory-starvation signature recorded for this machine (`parallel-worktree-gotchas`): free commit memory was 0.44 GB (`Win32_OperatingSystem.FreeVirtualMemory`). No other session held a `b4_%` database (checked with `pg_stat_activity` beforehand), so it is not the shared-database collision either.

The full harness (repair ledger claims 800/800) is therefore **not yet re-verified in this worktree**. It is re-run at HM6 (backend validation) and at the final gate; if the host still cannot complete it, that is reported as NOT COMPLETED with this reason rather than as a pass.

---

## 3. Inherited implementation (inventory)

Classified PRESERVE / REFINE / REPLACE / ABSENT / STUB. REPLACE requires evidence.

| Inherited item | Class | Evidence and disposition |
|---|---|---|
| `app/(app)/life/home.tsx` | **REFINE** | Still the route. It composes the new Home screen instead of `HomeOverview`. Nothing else in the Life stack changes. |
| `src/features/home/HomeOverview.tsx` | **REPLACE** | *Current:* one shared `CategoryTaskList` (open tasks only, sorted by date) plus a bare list of the Home category's Systems under the label "Running in the background". *Deficiencies:* no events/service visits; no responsibility, dependency, duration-provenance, recurrence or last-done facts; its empty text "Nothing home-related on your list." and footer "Her Keys preserves what already works instead of replacing it." say nothing true about coverage; "Running in the background" asserts that Systems are operating, which no canonical fact supports. *Replacement:* `src/features/home/*` (this build). *Test disposition:* the single test that pins it, `build3Audit.capture.test.mjs:118-133`, is REWRITTEN (same invariant — Home resolves its context by system role, never by name — expressed against the new module). |
| `src/features/life/CategoryTaskList.tsx`, `openTaskLabel.ts` | **PRESERVE** | Shared by Kids/Money/Work Life screens. Home stops using it; the files are not modified. |
| `src/domain/taskLists.ts` (`TASK_LIST_ROLES` includes `'home'`) | **PRESERVE** | Consequence to honour: because Home "has its own task list", the Life hub's "Other open tasks" excludes open tasks of an ACTIVE Home category. **Home must therefore keep every open Home task reachable** (progressive disclosure may collapse, never drop). |
| `src/features/life/lifeStatus.ts` (`describeHome`), Life hub `index.tsx` | **PRESERVE** | Shared Life landing surface; not edited. Observation for integration: `describeHome` renders "0 systems running" when a household has no Home tasks and no Systems, and "N systems running" asserts operation. Recorded in the copy-truth notes; not changed here. |
| `src/features/tasks/TaskForm.tsx`, `app/task-editor.tsx` | **PRESERVE** | Shared canonical task editor. Not modified. It always offers a category chooser and edits by whole-field patch with no stale check, so Home owns a Home-context editor (HM2/HM4) built from the same domain functions. |
| `src/features/calendar/EventForm.tsx`, `app/event-editor.tsx` | **PRESERVE** | Defaults the category to the first active category and accepts no initial category, so a service visit created there does not land in Home. Home owns a visit editor (`addEvent` / `updateEvent` / `removeEvent`). |
| `src/features/systems/SystemsList.tsx`, `app/(app)/systems.tsx` | **PRESERVE** | Read-only list; the only approved Systems surface. Home links to `/systems` and never renders System templates or runs. |
| `src/domain/categories.ts` | **PRESERVE** | The Home context. Not modified. |
| Recurrence domain (`addRecurrence`, `nextOccurrence`, …) | **PRESERVE / ABSENT consumer** | Domain functions exist and sync (`recurrence` kind); **no store mutation, screen, or reader on this baseline uses them.** Home is the first consumer. |
| Reopen of a completed task | **ABSENT** | The observation vocabulary allows `reopened` for a task (`observation.ts:49`) and the cloud CHECK accepts it, but no producer exists. Decided in HM1/HM5. |
| Person creation UI | **ABSENT** | No production surface can create a `HouseholdPerson`. People OS owns it. Home offers delegation only to existing people/children. |
| System creation | **ABSENT** | No `addSystem`. Home may not create a System (contract rule). |

---

## 4. Feature WHY

Home OS exists so a woman does not have to keep the physical household running in her head: what needs attention, what is coming, what is unresolved, what was actually done, what repeats, who owns something and whether it is really covered.

CORE TEST for every choice: *does this help Her Keys carry more of the household's operational burden without claiming knowledge, completion, safety, coverage or authority it does not possess?*

Non-negotiable distinctions carried into code, copy and tests:
`NO HOME RECORDS ≠ NOTHING IS WRONG` · `NO COMPLETION RECORD ≠ NEVER DONE` · `TASK COMPLETED ≠ CONDITION VERIFIED` · `SERVICE SCHEDULED ≠ SERVICE COMPLETED ≠ SAFE` · `ASSIGNED ≠ ACKNOWLEDGED ≠ ACCEPTED ≠ COVERED` · `DEFAULT ≠ USER-PROVIDED` · `UNKNOWN ≠ ZERO` · `REMOVED ≠ COMPLETED` · `LAST DONE ≠ NEXT DUE` · `LOADING ≠ EMPTY ≠ UNRECOVERED`.

---

## 5. Foundation trace (actual common-foundation sources at `14bd58e`)

| Concern | Actual symbol / file (line) |
|---|---|
| HOME CONTEXT / AREA | `cat-home`, `systemRole: 'home'` (`src/domain/categories.ts:16`); `categoryWithRole` `:50`; `HouseholdCategorySchema` (`state.ts:110`); `SYSTEM_ROLES` (`schemaPrimitives.ts:29`); one category per role `state.ts:577` |
| HOME CONTEXT LIFECYCLE | `renameCategory` (presentation only) `categories.ts:79`; `archiveCategory` `:97`; `restoreCategory` `:101`; **no delete**. Only producer in the app: `app/dev-tools.tsx` (internal tools). Cloud round trip: `sync/apply.ts:58-59` (`name`, `system_role`, `status`). Life hub lists ACTIVE categories only (`store/useHousehold.ts` → `categoriesInOrder`) |
| TASK | `TaskSchema` `state.ts:155`; `addTask`/`updateTask`/`completeTask`/`archiveTask` `tasks.ts:37/71/99/122` |
| TASK CONTEXT | `Task.categoryId` — exactly ONE (`state.ts:159`); integrity `state.ts:622-641` |
| COMMITMENT | `CalendarEventSchema` `state.ts:121`; `events.ts:36/79/90` |
| COMMITMENT CONTEXT | `CalendarEvent.categoryId` — exactly ONE (`state.ts:125`) |
| SYSTEM | `HouseholdSystemSchema` `state.ts:191`; steps `structure.ts:358` (`addSystemStep`); no creator |
| SYSTEM CONTEXT | `HouseholdSystem.categoryId` — exactly ONE |
| RECURRENCE | rule `foundation/structure.ts:105`; one active rule per subject `state.ts:845`; `addRecurrence` `structure.ts:213`; derived `nextOccurrence` `:330` (only `trigger: 'schedule'` yields dates); exceptions are `skipped` observations `:352` |
| COMPLETION HISTORY | `Task.status`/`completedAt` paired by schema `state.ts:177`; `completeTask` `tasks.ts:99` |
| ACTION / OUTCOME HISTORY | `state.actions` (Daily Load decisions `state.ts:379`); `executions`/`outcomes` are server-written records of external actions Her Keys took (`state.ts:491-492`) — NOT evidence that she did a household task |
| BEHAVIORAL OBSERVATIONS | `foundation/observation.ts:23-89`; `appendObservation` `observations.ts:34`; `observationsAbout` `:75`; valid outcomes per kind `VALID_OUTCOMES` `observation.ts:48` (task: completed, reopened, deferred, skipped, cancelled, missed; system: completed, skipped, missed) |
| RESPONSIBILITY | `ResponsibilitySchema` `foundation/responsibility.ts:55`; states `owned/requested/acknowledged/accepted/declined/completed/returned` |
| RESPONSIBILITY TRANSITIONS | `responsibility.ts:105-186` (see §2.1 item 13) |
| DEPENDENCY | `DependencySchema` `foundation/structure.ts:28`; `addDependency`/`removeDependency` `structure.ts:37/64` |
| standingOf / readinessOf | `structure.ts:92` / `:149` |
| DURATION / DURATION SOURCE | `Task.durationMinutes` `state.ts:161`; `foundation/duration.ts:19-55` |
| SHARED ATTENTION / TIMING | `attentionFor` `reasoning/attention.ts:44` (deadline now/today/soon, risk, unacknowledged_delegation, approval_required, needs_me, …); `unacknowledgedResponsibilities` `responsibility.ts:191` |
| HOUSEHOLD TIMEZONE | `state.user.timezone` (`state.ts:96-101`) |
| LOGICAL DAY | `logicalDateAt` `logicalDay.ts:157`; `zonedTimeToEpochMs` `:174`; `TransitionContext { nowMs, today, createId }` |
| PROVENANCE / CONFIDENCE | `foundation/provenance.ts`; `provenanceFor(origin, truth)` `:125`; `userProvenance` `:101`; `isUserStated` `:61` |
| CANONICAL MUTATION | `Transition = (state, ctx) => AppState`; `store.commit` (durable, refuses invalid state) / `store.dispatch` (`appStore.ts:47,74,81`). **`commit` resolves `true` when a transition returns state unchanged**, so a refusal must be signalled by the caller (used for stale-editor protection). |
| PERSISTENCE | `persistence/appStateRepository.ts`, `writeQueue.ts`, `envelope.ts` |
| SYNC COMPOSITION | `store/composeAccountApp.ts:40`; `domain/sync/changeObserver.ts`, `syncRuntime.ts`, `coordinator.ts`; 28 sync-capable kinds incl. `category task event system responsibility dependency recurrence observation person` |
| DEMO NAMESPACE | `AppState.origin: 'demo' | 'empty'`; `provenanceFor` turns every creation in a demo household into `demo-seed`; `isSyncable` excludes it (`provenance.ts:66`); a build never adopts the other mode's state (`appStore.ts:274-286`) |
| RECOVERY / QUARANTINE | `StoreSnapshot.recovery` / `persistence` / `persistenceDegraded` (`appStore.ts:33-45`); `recovery` swaps in a FRESH household, so a screen that only reads `state` would show an empty Home — Home gates on the snapshot |
| LIFE FEATURE REGISTRATION | ABSENT (§2.1 item 9) |
| Route guards | `routeAccess.ts`: `(app)` opens only when hydration is `ready` or `recovery` and onboarding is complete; `isSettled` includes `recovery` |

Foundation facts that shape the design (and are re-derived as tests in HM1):

* A task, event and System each belong to exactly **one** category. The V1 single-context limitation is a property of the certified model, not of Home (§9, HM1).
* Recurrence is a stored RULE; the next occurrence is derived; there is **no occurrence/run engine** on this baseline, and `after_completion` / `manual` rules yield no derived date.
* "Last done" has real evidence on this baseline (append-only `completed` observations and the row's own paired `completedAt`) — `updatedAt` is not evidence.
* The Life hub excludes open tasks of an active Home category from "Other open tasks" (`TASK_LIST_ROLES`).
* `attentionFor`'s risk rule treats an `acknowledged` responsibility as "handled elsewhere" (`attention.ts:60-62`). That conflicts with ACKNOWLEDGED ≠ COVERED. It is a common-foundation concern, not changed here; recorded for integration (§32/§33) and worked around by not presenting the `risk` reason as a Home judgment.
