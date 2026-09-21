# HK-FEATURE-06-HOME — Home OS: build ledger

Feature 06, Wave 2. Branch `feature/06-home-os`, worktree `C:\Users\jsmit\Her-Keys-F06`. **Local only: no push, PR, merge, rebase, squash or amend; no remote, staging, production, credential or provider change.**

This ledger is written phase by phase (HM0 … HM8). The status table says which sections are complete at the commit that carries it.

| Ledger status | |
|---|---|
| Sections 1-5 | HM0 (`10b9adb`) |
| Sections 6-10 and Appendix A (foundation maps) | HM1 (`a9368ba`) |
| Sections 11-26 | written at HM8 from what HM2-HM7 built and tested |
| Sections 27-45 | HM8 — **complete** (numbers filled mechanically from the final gate logs) |

**All 45 required sections are present.** Commits: HM0 `10b9adb` · HM1 `a9368ba` · HM2 `347102b` · HM3-HM5 `46dd787` · HM6 `12dad6a` · HM7 `68f9b87` · HM8 (this ledger). The code at HM7 is the code every gate in §44 ran against; HM8 adds only this document.

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
| Backend harness (`node supabase/tests/run.mjs`) | **800/800** on the retry (first attempt aborted environmentally) — see §2.2 |
| IR01 mutation check (`scripts-dev/ir01-mutation-check.cjs`, 35 mutants) | Not re-run at HM0 (a long run on a memory-starved host). **Re-run at the final gate against this branch: 35 caught, 0 survived, 0 broken** — the repair build's evidence reproduces here (§44). |
| Expo Doctor / Android export | Recomputed at the final gate (§44). |

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

**RETRY (same worktree, after free commit memory recovered to 13.5 GB, again with no `b4_%` sessions and no other harness process): `800/800 checks passed`, exit 0.** This verifies the repair ledger's 800/800 claim mechanically. The first attempt is kept in this record because it happened; it is superseded, not erased. The harness is re-run at HM6 and at the final gate.

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

---

## 6. Home-context contract (HM1)

**The Home context is the household category that carries system role `home`** (`src/domain/categories.ts:16`, resolved by `categoryWithRole`, `:50`). Implemented once in `src/features/home/model/homeContext.ts` (`homeContextOf`, `isHomeRecord`, `homeCategoryIdOf`, `homeLabelOf`). A record is a Home record **iff its own single `categoryId` equals that category's id**. There is no other test.

| Contract point | Result | Proof (`tests/hk-f06/homeContext.test.mjs`) |
|---|---|---|
| 1. Name independence | **HOLDS** | §7 |
| 2. Context lifecycle | **DEFINED and proven** | §8 |
| 3. Single-context limitation | **DOCUMENTED and pinned** | §9 |
| 4. Coverage honesty | **RULE stated** (§10); enforced in HM2/HM3 by the projection and the copy audit | §10 |
| 5. Round trip | **HOLDS**: create → local persistence → restart → account sync → cloud → second device | HOME CONTEXT 4 (5 tests) |

**HM1 result: no new durable semantic and no schema change is needed for Home V1.** Every capability the replacement floor needs (context, tasks, events, recurrence rules, dependencies, responsibility, completion evidence, sync) exists as canonical state on `14bd58e`. Anything Home would like but the model does not have is in `HK_FEATURE_06_MISSING_PRIMITIVES.md`, each with "owner checkpoint? no" or the reason. **No owner checkpoint is triggered by this build so far.**

## 7. Name independence

Renaming "Home" to "House stuff" — or to "Money" — changes the display label only; the context id, the role and every record's association are unchanged. A role-less category the household names "Home" is not the Home context and its records are not Home records ("naming something 'Money Stuff' doesn't make it the money category" — `categories.ts`). The Life stack header already uses the household's own name for the Home screen (`app/(app)/life/_layout.tsx`, `titleFor('home', …)`), so the rename reads the same everywhere.

Tests: *renaming "Home" to "House stuff" …*, *renaming the Home area to another area's name …*, *a role-less category that is literally named "Home" is NOT the Home context …*, *STRUCTURAL: nothing under src/features/home decides by a name, a title or a keyword* (a scan of every Home source file for seven ways of deciding from words) and *the scan can see …* (nine offending snippets are caught, four legitimate ones are not). The rename also survives restart and the cloud round trip (HOME CONTEXT 4).

## 8. Context lifecycle

| State | How it arises | Home OS behaviour |
|---|---|---|
| `active` | starter category, or restored | Full Home OS. |
| `archived` | `archiveCategory` (only the internal dev-tools call it today), or an `archived` category row pulled from the cloud | Home still opens (the route exists; the Life hub simply stops listing an archived category, because `categoriesInOrder` lists active ones). It **resolves the archived category by role over ALL categories**, lists every record still pointing at it, and **says the area is archived**. Creating new Home items is withheld with an explanation and one explicit action, "Restore Home area" (`restoreCategory`). Records are never disassociated by archiving. |
| `missing` | no category carries `home` (damaged or partial state; the app has no way to delete one) | Home reports **that it cannot identify the Home area** — never an empty Home. No items, no create. |
| renamed | `renameCategory` (presentation only) | No change in behaviour; the label follows the name. |
| deleted | **impossible**: `categories.ts` exports no removal, and applying a pulled category row only upserts | Not applicable. Proven, not assumed. |

Tests: *ARCHIVED …*, *the Life hub's own category list drops an archived Home area — which is exactly why Home resolves by role over ALL categories*, *RESTORED …*, *MISSING …*, *NO DELETION …*, *NO DELETION ACROSS SYNC …*, *a category the pulled row does not name as home cannot displace the real Home area*.

## 9. Single-context limitation (V1, documented)

A task, an event and a System each carry exactly one `categoryId` (`state.ts:159,125,195`) and there is no multi-context field. Consequences, stated plainly:

* Something she filed under her own "Yard", "Errands" or "Pets" category has **no Home association** and does not appear in Home, however its title reads.
* Home does **not** parse titles, match keywords, show every household task, or silently reclassify her records to make them appear.
* Every record Home creates uses the Home category, so it stays visible in Home.
* A record belonging to several contexts is a **new durable semantic** and needs owner approval. Register entry `MP-06-06`, "owner checkpoint: yes, only if the owner wants it".

Tests: *the certified model gives a task, an event and a System exactly ONE category …*, *a task filed under her own "Yard" category has NO Home association, however its title reads*, *a Home-created record uses the Home context …*.

## 10. Coverage-honesty rule

> Home OS sees only canonical state associated with the Home context. "Home shows no items" **never** means "nothing around the physical house needs attention."

Enforced rules (each becomes a test in HM2/HM3, and a mutation in HM7):

1. Empty, loading and unrecovered are three different screens. Loading is never rendered as empty (`isSettled`/`status`), and a `recovery` snapshot (which swaps in a FRESH household) is never rendered as empty.
2. The empty state says what Her Keys knows (nothing is saved under the Home area) and what it does not (the state of the house).
3. Copy never says or implies: all clear, all set, nothing needs attention, everything is handled, nothing to worry about, safe, fixed, repaired, verified.
4. A missing Home context and an archived one are stated as such, never as empty.
5. The header states its own scope ("what's saved under <the household's name for it>").

---

## Appendix A — HM1 foundation maps

### A1. Completion / observation map (source of "Last done")

| Evidence | Where | Used for Last Done? | Note |
|---|---|---|---|
| `completed` observation about the SAME `task` ref | `state.observations` (`observation.ts`), appended by `completeTask` in the same transition that sets `completedAt` | **YES** — evidence type `completion_observation` | Append-only; carries `occurredAt` and `logicalDate` in the household timezone. |
| `Task.completedAt` while `status === 'completed'` | `state.ts:169,177` (paired by schema) | **YES, only when no completion observation exists for that task** — evidence type `task_completed_at` | For tasks completed before observations, or arriving without them. If both exist, the later instant wins. |
| `completed` observation about the SAME `system` ref | `VALID_OUTCOMES.system` | **YES** — `system_completion_observation` | No producer on this baseline; Home reads it if an integrated System run records one. |
| `Task.updatedAt`, `CalendarEvent.updatedAt`, `createdAt`, `dueDate`, `plan`, `startsAt` | rows | **NEVER** | Edit / creation / scheduled time is not completion. Mutation M8 flips this on purpose. |
| `reopened` / `deferred` / `skipped` / `missed` / `cancelled` observations | `VALID_OUTCOMES.task` | No | `skipped` is used only by the shared `nextOccurrence` as a rule exception. |
| Responsibility `completed` (`completeResponsibility`) | `state.responsibilities` | No — shown only as "<name> reported it finished on …" | It is the other person's handoff state, not proof the task or the physical condition is done. |
| An event | — | **NEVER** | The calendar does not know whether an event was attended (`standingOf` says so). SERVICE SCHEDULED ≠ SERVICE COMPLETED. |
| `executions` / `outcomes` / `actions` | foundation | No | Records of what Her Keys itself proposed or did; not of what she did around the house. |

**Wording follows the evidence:** the value reads "Marked done Jun 12", not "Filter changed Jun 12" (TASK COMPLETED ≠ CONDITION VERIFIED). With no evidence it reads "No completion recorded" — never "Never". A later `reopened` observation does not retract the earlier completion: it is history that she marked it done then. There is no shared way to retract a mistaken completion (`MP-06-01`).

### A2. Responsibility action map (transitions Home may invoke)

| Transition (`src/domain/responsibility.ts`) | Home may invoke? | How Home uses it |
|---|---|---|
| `delegate` | **Yes** | "Ask <person or child>". Offered only for an existing active person or a child; only when the item has no live responsibility. |
| `acknowledge` | **Yes** (recording) | "They've seen it" — she records what she was told. |
| `accept` | **Yes** (recording) | "They said yes". **Home always passes `stillNeedsMe` explicitly** (default `true`, i.e. still needs her) — the domain default is `false`, which would read as "no longer needs her" without her saying so. Accepting is not covering. |
| `decline` | **Yes** (recording) | "They said no" — it is hers again. |
| `returnToSelf` | **Yes** | "Take it back". |
| `reassign` | No | Two intents in one call; "Take it back" then "Ask" is explicit. |
| `completeResponsibility` | **No** | The task's completion is hers to record (`completeTask`); a handoff completing is not the work verified. Home only DISPLAYS a completed handoff. |
| `addPerson` / `archivePerson` | **No** | People OS owns people. No production surface creates a person on this baseline (`MP-06-05`). |

**Coverage (derived, never stored):** `covered` iff a live responsibility is held by someone other than her, is `accepted`, is not unacknowledged, **and** `needsMePersonally(state, ref, now) === false` — i.e. she said it no longer needs her. Everything else is `not delegated`, `requested`, `seen`, `accepted — still needs you`, `declined`, `no answer yet`. Even `covered` is worded as what she said ("accepted, and you've marked it as not needing you"), never as completion or safety.

### A3. Recurrence capability map

| Capability | On this baseline | Home V1 |
|---|---|---|
| Rule about a task | `addRecurrence` (`structure.ts:213`), one active rule per subject; `recurrence` sync kind | **Create** together with the task in ONE transition, or add to an existing Home task. Trigger `schedule` only; frequency weekly/monthly/yearly (+daily) with interval; anchor = due date, else today. |
| Rule about a System | rule schema allows `system`; **no System can be created** (`MP-06-04`) | **Display** an existing Home System's rule; never create one; never convert a task to a System. |
| Next expected | `nextOccurrence` (`:330`), derived, only for `schedule` + `active` | Shown as **Next expected**, separate from **Last done**. |
| `after_completion` / `manual` | no derivation (`MP-06-02`) | Described in words ("repeats after each time it's done"), **no date is invented**. |
| Which cycle is done | no occurrence/run engine (`MP-06-03`) | Not tracked. Completing the task records a completion; **"It's due again"** reopens it (status `open`, `completedAt` cleared, a `reopened` observation) with **no due date carried over**, so a stale date can't read as overdue. |
| Pause / end | `setRecurrenceStatus` | "Stop repeating" (`ended`). History is kept. |
| A rule is not a completion | — | A rule never produces a completion, a "done" or a "due" by itself; Home shows "expected", not "overdue". |

### A4. Shared attention map

Home reuses `attentionFor(state, nowMs)` (`reasoning/attention.ts:44`) and keeps only items about a Home record.

| `AttentionReason` | About | Home wording (factual) |
|---|---|---|
| `deadline` / `now` | Home task | "Overdue — was due <date>" |
| `deadline` / `today` | Home task | "Due today" |
| `deadline` / `soon` | Home task | "Due <weekday date>" |
| `unacknowledged_delegation` | a responsibility whose `about` is a Home record | "No answer yet from <name>" |
| `risk` | Home task | "Marked high-consequence and due" (what she set; not a Home-made risk judgment) |
| `external_source_changed` | linked Home task/event | "The source changed since this was last updated" |
| `approval_required` | an intent about a Home record | not shown as Home attention (belongs to the approval surface) |
| `conflict`, `capacity_overload`, `needs_me` | not about a Home record | not Home |

Everything else Home says about timing is a **fact**, not a judgment: due today/tomorrow/<date>, planned <date>, scheduled <weekday time>, unresolved, waiting on someone, prerequisite unavailable, repeats, no completion recorded. There is **no Home priority, urgency, risk or attention score**.

### A5. Round-trip map (Home association)

`addTask({ categoryId: <home category id> })` → `store.commit` (validates, durable) → repository envelope → **restart** (hydrate) → `changeObserver` queue intent in the same envelope → `composeAccountApp` sync runtime → `tasks.category_id` = cloud id of the `household_categories` row whose `system_role = 'home'` → pull on a **second device** → `applyCloudRow('task')` resolves `category_id` to the local category id → `homeContextOf` finds the role-bound category (`applyCloudRow('category')` carries `name`, `system_role`, `status`). Proven in HOME CONTEXT 4 (in-memory cloud) and re-proven against real PostgreSQL in HM6.

---

## 11. Projection

`buildHomeView(state, nowMs)` in `src/features/home/model/buildHomeView.ts` — one bounded, deterministic, read-only reading of canonical state through the Home context. It reads tasks, events and Systems whose single `categoryId` is the Home category, builds each index once (completions, rules, responsibilities, prerequisites, people, children), calls the shared `attentionFor` once, and returns items plus sections. It never mutates state (a deep-freeze test proves it) and its output is independent of collection order (a shuffle test proves it).

* **Items are the canonical records** (`task:<id>`, `event:<id>`, `system:<id>`). There is no `HomeRecord`, `HomeItem` table or Home state of its own: after Home operations the household has exactly the collections it started with (test AX).
* **Sections.** Work sections are mutually exclusive by precedence — Needs attention (shared attention) › Waiting on someone › Coming up (dated within 14 days, and visits) › Unresolved — so a row appears once. Repeats, Recently marked done (30 days) and Past visits are **lenses over the same items**, with the same facts. A visit that ended today stays in Coming up until the day turns, so nothing moves between sections as the hours pass; a visit that ended on an earlier logical day is listed under Past visits for 7 days.
* **Clock.** `nowMs` is used for exactly two things: the household's logical day, and two instant-level facts that genuinely change — a visit being under way or over, and a request passing the time an answer was due. Identical state at 08:00, 15:00 and 21:00 has identical sections (test AJ/AK/AL).
* **Every open Home task is reachable.** `TASK_LIST_ROLES` makes the Life hub exclude open tasks of an active Home category from "Other open tasks", so Home lists all of them (test: every open task is in a work section; UI: sections collapse to 5 rows and "Show all N" reveals every one).
* **Set aside and removed are not shown**; old completed non-repeating tasks leave the hub after 30 days. `coverage.recordsConsidered` still counts them, so "nothing open" and "nothing saved" are different statements.

## 12. Create / edit

Home owns its editors (`HomeTaskEditor`, `HomeVisitEditor`) built from the domain's own transitions (`addTask`, `updateTask`, `addEvent`, `updateEvent`, `addRecurrence`, …) and committed through `store.commit` — no Home-specific persistence or sync.

| Guarantee | Where enforced | Test |
|---|---|---|
| Created under the Home context; creation withheld (with a reason) when the area is archived or missing | `createHomeTask`/`createHomeVisit` | J tests |
| No category chooser; an edit's patch never carries `categoryId`; even a forced one is ignored | `updateHomeTask` | "an edit CANNOT move a record out of Home" |
| Only Home records can be touched (edit, done, remove, ask, restore) | `isHomeRecord` guard in every mutation | "an edit only touches records in the Home context" |
| **Stale-editor protection**: baseline captured at mount; a save applies only if the record is still exactly that, judged by CONTENT (a same-millisecond change is caught) | `taskBaselineOf`/`visitBaselineOf` fingerprints | AS ×3, real-database cross-device check |
| A refusal is reported, never shown as "saved" (`store.commit` resolves true on an unchanged state) | `commitHomeChange` | "a refusal from the store wrapper is REPORTED" |
| Double save → one record | `createSubmitGuard` | AT ×2 |
| Invalid input refused in words | `forms.ts` + `REFUSAL_COPY` | homeForms tests |

## 13. Responsibility

Uses the shared lifecycle only (Appendix A2). Home invokes `delegate`, `acknowledge`, `accept`, `decline`, `returnToSelf` and nothing else from `responsibility.ts` (a test reads the import line). It never invokes `completeResponsibility` (a handoff finishing is not the work verified), `reassign`, or anything that creates a person. **"They said yes" requires her explicit answer to "does this still need you?"**, defaulting to "yes, it still needs me" — the domain's own default (`false`) would read as "no longer needs her" without her saying so. Derived coverage: `not_delegated · asked · no_answer · seen · accepted_needs_you · covered · declined · returned · reported_finished`; **`covered` only when accepted AND she said it no longer needs her**, and even then it is worded as what she said and never as done. A contractor holder carries an explicit "not verified who's qualified" note. Tests: Q, R, S, T, U, the responsibility mutation suite, mutants H13–H17, H47.

## 14. Dependency

Uses `standingOf` / `readinessOf` unchanged. Only `satisfied` is met: a completed prerequisite is `ready`; a pending one blocks; a removed (archived) or missing one is `unavailable` and the item "needs review" — never ready, never completed. Home reads the edges; it does not create them (see §43: dependency creation from the editor is deferred). Preserved across edit, persistence, sync and a second device (real database check: the completed prerequisite makes the task `ready` on device B). Tests: V, W, X; mutants H10–H12.

## 15. Duration provenance

Uses `durationKnowledgeOf` / `durationSourceForSave`. **Creation:** no number typed → the planning default is recorded as `default`; a typed number (even 15) is `user`. **Edit:** the number and its source are sent only if she touched the field; an untouched prefilled number is not hers, an unrecorded (`null`) source stays unrecorded. The form says how far the number can be trusted ("You entered this" / "A planning estimate, not from you" / "Estimated by Her Keys" / "How this number got here isn't recorded"). Every row states unknown/default/inferred durations in words; an unrecorded duration never shows its stored number as fact (UNKNOWN ≠ ZERO). Preserved through the real database (`duration_source`). Tests: G/H/I, J/K duration tests, form tests, mutants H7–H9, H40.

## 16. Recurrence / Systems relationship

See Appendix A3. Home creates a recurring task only through the shared `addRecurrence` (trigger `schedule`; daily/weekly/monthly/yearly with an interval), in the same transition as the task, and ends one with `setRecurrenceStatus`. It never creates a System (no shared creation path exists, MP-06-04), never converts a task to one, and never renders System steps, templates, runs or completion: a System is a row that links to `/systems` (structural scan + UI test). A rule created elsewhere that Home cannot express (`after_completion`, `manual`) is **locked** in the editor and never overwritten. A rule is described as a rule ("Repeats every 3 months") and never as something done; "Next expected" is the shared derivation, separate from "Last done".

## 17. Completion / observation history

See Appendix A1. The evidence used is exactly: a `completed` observation about the same task or System, and a task's own `completedAt` (schema-paired with `status: completed`). Nothing else. `executions`, `outcomes` and `actions` record what Her Keys did, not what she did.

## 18. Last Done derivation

`lastDoneOf` (`model/facts.ts`): the later instant among completion observations and the paired `completedAt`; a tie names the observation. Never `updatedAt`, creation, due date, plan or an edit (test BD; mutants H23, H24). Worded **"Marked done <date>"** — what the evidence proves — and, with none, **"No completion recorded"**, never "Never" (copy audit forbids the word). A visit has no completion concept: `lastDoneApplicable: false`, and it is neither "done" nor "never done". "It's due again" reopens a done task without carrying a stale date and leaves the earlier completion in history.

## 19. Home hub

`HomeScreenView` (presentational; no router or store import) driven by `homeScreenState`: loading, missing context, recovered-and-empty, empty ("nothing saved" vs "nothing open"), content. Notices for recovery, memory-only, and archived (with one explicit "Restore Home area"). Create controls appear only while the area is active. Systems get one note and a link. All strings come from `copy.ts`. Behind the existing `/life/home` route; the Life hub, its registration and every sibling feature are untouched (`HK-INT-WAVE2-LIFE-REGISTRATION`).

## 20. Detail / edit

`HomeItemDetailView`: title (a header), status, grouped facts (Needs attention · When · Needs first · Who has it · Time it takes · Repeats · Last done), where/notes, **"What Her Keys doesn't know"**, and only the actions the projection says are available. Groups are announced as summaries with spoken labels; errors are alerts. A gone item says it is gone. Actions in progress disable every control. Removal asks first and says it doesn't mean done.

## 21. Completion / outcome truth

Marked done is a record that she marked it, nothing more: rows say "Marked done <date>" and "Her Keys doesn't check that the problem is actually fixed"; the detail lists "Whether the problem is actually fixed" under what is not known. A completed task is offered "It's due again" and not "Mark done". Removing is "removed", never "done". Mutants H18–H20, H42.

## 22. Safety boundary

Home tracks maintenance and safety-related work; it does not certify the physical home. Nothing renders or can render "safe", "all clear", "verified", "fixed", "repaired", "resolved" or "handled" as an assertion (`NEVER_ASSERTED` + a scan of every string literal in Home source); such words appear only inside an explicit "not known" statement. For user-entered gas, electrical, fire, structural, water or environmental conditions Home preserves her facts and tracks work, appointments and unresolved state; it does not diagnose, certify or infer severity. A completed appointment is never "safe": a past visit says Her Keys doesn't know whether it happened.

## 23. Backend / sync

Home adds no table, column, migration, RLS policy, RPC, sync kind or transport (schema fingerprint unchanged, §38). Every Home record is an existing canonical kind (`task`, `event`, `recurrence`, `responsibility`, `dependency`, `observation`, `category`) that the production composition already syncs "with no feature involved". Proven: in-memory cloud (HOME CONTEXT 4, N, M, AU, AV, AW) and **real PostgreSQL** (`supabase/tests/journey-home.mjs`: 26 Home checks; `node supabase/tests/run.mjs home` prints 34/34 because it includes 8 setup checks, and the full harness is 826/826): Home rows filed under the home-role category; typed duration `user`, untouched `default`; the rename reached the database without re-pointing tasks; the recurrence rule, a `requested` responsibility, the prerequisite edge and exactly one completed observation; **device B reads identical Home facts**; a stale cross-device save is refused; a restart makes no duplicate row.

## 24. RLS / security

**RLS = INHERITED CERTIFIED COMMON POSTURE.** Home introduces no new durable backend representation and changes no access path, so the common RLS matrix is not duplicated. Spot checks in the Home journey against the real database: an unrelated authenticated account cannot read the household's Home tasks or categories, cannot plant a task in its Home category (insert `WITH CHECK`, `42501`) and cannot edit one; the attacks changed nothing; the owner's own Home operations succeed. Same-household second member: not applicable (a household has one account; other people are not accounts). Unauthenticated: covered by the common matrix (`10-rls-matrix.sql`).

## 25. Offline / restart

Create offline → restart offline → reconnect: one row, in the Home category, `duration_source: user`, no duplicate (M). An edit made offline is retried on reconnect and converges at revision 2 with no false conflict (AU). A row the server refuses for its content stays in her Home locally, is recorded once and asked about once (AV). Restart keeps the item, association and duration provenance (L). Two devices editing, repeating or delegating the same task offline leave both valid, nothing lost or duplicated, the disagreement recorded (HM7).

---

## 26. Scenario assertion map

Every scenario maps to a deterministic fixture, named assertion(s), a test file and a result. State-based scenarios are the catalog in `tests/support/homeScenarios.mjs` (fixture + assertion, plus a committed evidence file `tests/fixtures/home/scenarios/<id>.json` that must regenerate byte-for-byte); the rest map to the named test. **Results are as recomputed at the final HEAD (§44).**

**Tier 1**

| ID | Fixture / setup | Named assertion(s) | Test file | Result |
|---|---|---|---|---|
| A | scenario A: household, no Home records | items `[]`, sections empty, `canCreate`, `recordsConsidered 0`, screen "empty — nothing saved" | homeScenarios · homeView | PASS |
| B | store mid-hydration (`unhydrated`, `hydrating` with a delayed load) | screen state `loading`, never `empty`; progress shown, no empty copy | homeReadiness · homeUi | PASS |
| C | real store over corrupt / newer-version / unreadable storage | `recovery` surfaced, `unrecovered_empty`, never `empty`; notice persists after a task is added | homeReadiness · homeUi | PASS |
| D | scenario D | one item, `unresolved`, `cat-home`/`home`, `not_delegated` | homeScenarios | PASS |
| E | scenario E | three items, each once across work sections | homeScenarios · homeView | PASS |
| F | scenario F | `scheduled_visit`, `lastDoneApplicable false` | homeScenarios | PASS |
| G / H / I | scenarios G, H, I | `durationSource` null / default / user with matching unknown facts | homeScenarios · homeView | PASS |
| J | `createHomeTask` | Home context, `user-action`, default vs typed duration, atomic rule, refusals | homeMutations | PASS |
| K | `updateHomeTask` | association intact, default stays default, no coverage upgrade, history intact, stale refused | homeMutations · homeForms | PASS |
| L | create + edit, then new store from same storage | item, association, duration knowledge intact | homeMutations | PASS |
| M | offline create → process death → restore | one cloud row, home category, `user`, queue drained | homeMutations | PASS |
| N | device A → fake cloud → device B; and real PostgreSQL | identical Home facts on both devices | homeMutations · journey-home | PASS |
| O | scenario O; rename before sync and restart | label changes, `homeContextId` unchanged, evidence identical | homeScenarios · homeContext | PASS |
| P | scenarios P1 (archived), P2 (missing); lifecycle tests | archived lists records and withholds creation; missing is not empty | homeScenarios · homeContext · homeUi | PASS |
| Q | scenarios Q, Q2, Q3, Q4 | `asked`; `no_answer` + attention only after the answer time; `seen`; `declined` | homeScenarios · homeView | PASS |
| R / S | scenarios R, S | `accepted_needs_you`; `covered` only with her explicit "no longer needs me", still `unresolved` | homeScenarios · homeMutations | PASS |
| T / U | scenarios T, U | `not_delegated`; other person owns it and it stays `unresolved` and "waiting" | homeScenarios | PASS |
| V / W / X | scenarios V, V2, W, X | `ready`; `blocked`; removed → `needsReview`/`retired`; missing → `needsReview`/`missing` | homeScenarios · homeView | PASS |
| Y | scenario Y | rule via shared `addRecurrence`; `nextExpected` equals shared `nextOccurrence` | homeScenarios · homeView | PASS |
| Z | scenario Z | no last done, no observation added, "no completion recorded" | homeScenarios | PASS |
| AA | scenario AA; observation-less legacy fixture | `completion_observation`; `task_completed_at` | homeScenarios · homeView | PASS |
| AB | scenario AB | `lastDone null`, applicable, "No completion recorded", never "never" | homeScenarios · homeCopy | PASS |
| AC | scenario AC, AC2 | visit `scheduled` while task `unresolved`; past visit `visit_outcome_unknown` | homeScenarios | PASS |
| AD | scenario AD | `marked_done`, `condition_not_verified`, actions `[due_again, edit]` | homeScenarios · homeCopy · homeUi | PASS |
| AE | homeContext round trip | association survives restart | homeContext | PASS |
| AF | scenario AF (kids-category "home" title; role-less category named "Home") | never in Home | homeScenarios · homeContext | PASS |
| AG | scenario AG | one item object, two sections, same facts | homeScenarios · homeView | PASS |
| AH | scenario AH; copy audit | "nothing open", never all-clear; empty copy says what is not known | homeScenarios · homeCopy · homeUi | PASS |

**Tier 2**

| ID | Fixture / setup | Named assertion(s) | Test file | Result |
|---|---|---|---|---|
| AI | dense: 240 Home tasks, 30 visits, 12 Systems, 20 repeating, 24 handoffs, 30 prerequisites, +3000 unrelated | projection median 6.9 ms (<100), detail 0.02 ms (<50), every open task reachable | homePerformance | PASS |
| AJ / AK / AL | same state at 08:00, 15:00, 21:00 | sections identical; only a visit's own `when` changes | homeView | PASS |
| AM | 23:59 vs 00:01 next day | "today" becomes "overdue" | homeView | PASS |
| AN / AO | 2027-03-14 spring-forward; 2026-11-01 fall-back (both 1:30s) | logical day stable; turns at local midnight | homeView | PASS |
| AP | A → sign out → B on one device | A's Home task never uploaded under B | homeMutations | PASS |
| AQ | demo household | `demo-seed`, never syncs | homeMutations | PASS |
| AR | stored task → missing category; pulled row with unresolvable category | recovered + quarantined, never re-filed; integrity gate refuses | homeHardening | PASS |
| AS | two editors, same-millisecond change, task completed elsewhere | second save `stale`, nothing overwritten | homeMutations · journey-home | PASS |
| AT | concurrent double submit; failed then retry | one task; guard releases on failure | homeMutations | PASS |
| AU | edit offline then reconnect | converges at revision 2, no false conflict | homeMutations | PASS |
| AV | server refuses a title | recorded once, asked once, still in Home | homeMutations | PASS |
| AW | 450 Home tasks (> one fetch batch) | second device hydrates all; Home lists all | homeMutations | PASS |
| AX | Home operations | no new top-level collection | homeMutations | PASS |
| AY | every collection reversed | identical sections and items | homeView | PASS |
| AZ / BA | `describeItem` accessibility labels | responsibility, unknown, default, completion, dependency and timing state spoken; no orphaned punctuation | homeCopy · homeUi | PASS |
| BB | dense fixture | Home's attention facts equal `attentionFor` filtered to Home | homeView | PASS |
| BC | copy audit | completion never certifies an outcome | homeCopy | PASS |
| BD | edit after completion | Last Done unchanged | homeScenarios · homeView | PASS |
| BE | Home-created repeat | shared rule, anchored to the due date | homeMutations | PASS |
| BF | scan + UI test | no System step / run / template / completion surface | homeView · homeUi | PASS |
| BG / BH / BI / BJ | real PostgreSQL | inherited posture; unrelated account refused; owner succeeds; same-household member not applicable | journey-home | see §24 |
| BK | second client, real database | identical facts | journey-home · homeContext | PASS |
| BL | mechanical scan | zero sibling imports | homeView · §41 | PASS |

**Tier 3** — see §29.

## 27. Tier 1 results

**All Tier 1 scenarios PASS** (A through AH, including the store-level B and C and the round-trip J–N). No Tier 1 scenario is SAFE-UNAVAILABLE, NOT-APPLICABLE or DEFERRED-IN-RUN. Evidence: §26, the 33 committed scenario files, and the test files named there, all green at the final HEAD (§44).

## 28. Tier 2 results

**PASS:** AI, AJ, AK, AL, AM, AN, AO, AP, AQ, AR, AS, AT, AU, AV, AW, AX, AY, AZ, BA, BB, BC, BD, BE, BF, BH, BI, BK, BL.
**NOT-APPLICABLE (with reason):**
* **BG** (unauthenticated RLS attack) — Home adds no backend representation or access path; the unauthenticated attack is part of the common RLS matrix (`10-rls-matrix.sql`), which is unchanged and passes in the harness (§44).
* **BJ** (same-household member RLS) — a household has one account holder; other people are not accounts, so no second authorized member exists to test.

BH (unrelated account) and BI (owner) were run as spot checks against real PostgreSQL in the Home journey (§24).

## 29. Tier 3 results

Conditional capabilities. None was manufactured.

| ID | Capability | Result | Reason |
|---|---|---|---|
| BM | Existing canonical System projected in Home | **PASS** | A System in the Home category is a row in "Repeats" with its rule, next expected and last completion evidence if any, linking to `/systems`. It is read, never run, edited or completed. |
| BN | Existing repair/service amount displayed truthfully | **SAFE-UNAVAILABLE** | A `Money` facet (`value`) exists on tasks and events, but it is documented as "what it is worth" (task) and "what attending costs or earns" (event), so its sign and meaning are ambiguous, and nothing in Home writes it. Showing it could assert a cost. Deferred to `HK-INT-HOME-MONEY-01` (MP-06-13). |
| BO | Existing Home document/admin relationship | **SAFE-UNAVAILABLE** | No such relationship exists on the baseline. Life Admin owns it (`HK-INT-HOME-LIFEADMIN-01`). |
| BP | Existing inventory / supply semantic | **SAFE-UNAVAILABLE** | None exists. A supply need is an ordinary task ("Buy 20x25 furnace filter"); no stock, availability or purchased/installed state is claimed, and the source audit bans stock and inventory words. |
| BQ | Existing professional / service-provider semantic | **PASS (limited)** | `HouseholdPerson.relationship` includes `contractor`. Home shows the holder as she recorded them and says Her Keys hasn't verified who is qualified. A name never means booked, qualified, completed or verified. |
| BR | Existing archive / retire semantics | **PASS** | Home area (archived: stated, records listed, one restore action), task (removed = set aside, not completed), visit (removed), recurrence (ended). |
| BS | Existing recurring occurrence semantics | **SAFE-UNAVAILABLE** | No occurrence/run engine exists (MP-06-03); Home shows Last Done and Next expected as separate derived facts. |
| BT | Existing shared cross-feature intelligence abstraction | **NOT-APPLICABLE** | None exists on the baseline; Home builds none and adds no AI type. |

## 30. Mutation evidence

`scripts-dev/f06-mutation-check.cjs` is committed and re-runnable (`node scripts-dev/f06-mutation-check.cjs`; `DRY=1` checks that every mutation applies exactly once). Each mutant changes one source line the way the defect it guards against would, runs the tests meant to catch it, and restores the file byte for byte; the run fails if any mutant survives, a mutation does not apply exactly once, or a file is not restored.

**Result at the final HEAD: **47 caught, 0 survived, 0 broken**** (clean tree before and after).

The ten required checks:

| Required | Mutants | Caught by |
|---|---|---|
| 1 HOME CONTEXT dropped in persistence/sync | H1, H2, H3 | homeMutations, homeContext |
| 2 NAME INDEPENDENCE | H4, H5, H6 | homeContext, homeView |
| 3 DURATION PROVENANCE default → user | H7, H8, H9, H40 | homeMutations, homeCopy, homeForms |
| 4 DEPENDENCY removed → satisfied | H10, H11, H12 | homeView |
| 5 RESPONSIBILITY assigned/accepted → covered | H13–H17, H47 | homeView, homeCopy, homeMutations, homeUi |
| 6 COMPLETION TRUTH → "fixed/safe" | H18–H21, H42 | homeView, homeCopy, homeUi |
| 7 RECURRENCE definition → completed occurrence | H22 | homeMutations, homeView |
| 8 LAST DONE from `updatedAt` | H23, H24 | homeView, homeMutations |
| 9 SYNC COMPOSITION disconnected | H25 | homeContext, homeMutations |
| 10 LOADING vs EMPTY / UNRECOVERED vs EMPTY | H26, H27, H28, H46 | homeView, homeReadiness, homeUi |

Two findings of the check itself, kept as evidence that it can fail:
* **H7 first survived, and was an EQUIVALENT mutant.** It only forced `durationSource: 'user'`, which the shared `addTask` already ignores when no number is supplied. It was replaced by the realistic defect — Home pre-filling the planning default (15) and marking it hers, the very bug the repair build fixed in `TaskForm` — which the tests catch.
* **H46 and H47 first survived and exposed two real test gaps**: the recovery notice was only tested at the model level (not that it stays beside content), and the default answer to "does this still need you?" was only tested when she chose explicitly. Both now have screen-level tests.

Full table (from the final run):

| ID | Guards | Mutation | Result |
|---|---|---|---|
| H1 | 1 HOME CONTEXT | creating a Home task files it under the first category instead of the Home context | CAUGHT (11 failing) |
| H2 | 1 HOME CONTEXT | applying a pulled task drops its category (the association does not survive sync to a second device) | CAUGHT (4 failing) |
| H3 | 1 HOME CONTEXT | an edit moves the record to another category | CAUGHT (6 failing) |
| H4 | 2 NAME INDEPENDENCE | Home finds its area by the name "Home" instead of the system role | CAUGHT (8 failing) |
| H5 | 2 NAME INDEPENDENCE | a record is a Home record if its title mentions home (title parsing) | CAUGHT (5 failing) |
| H6 | 2 LIFECYCLE | an archived Home area is treated as missing (records lose their association) | CAUGHT (6 failing) |
| H7 | 3 DURATION | Home pre-fills the planning default (15) and records it as user-provided at creation | CAUGHT (2 failing) |
| H8 | 3 DURATION | an edit that never touched duration upgrades a default (or unknown) source to user-provided | CAUGHT (3 failing) |
| H9 | 3 DURATION | the copy states a planning default as if she had said it | CAUGHT (1 failing) |
| H10 | 4 DEPENDENCY | a REMOVED (archived) prerequisite reads as satisfied (the shared standing) | CAUGHT (1 failing) |
| H11 | 4 DEPENDENCY | a MISSING prerequisite reads as satisfied (the shared standing) | CAUGHT (1 failing) |
| H12 | 4 DEPENDENCY | Home re-derives readiness itself and treats an unavailable prerequisite as ready | CAUGHT (2 failing) |
| H13 | 5 RESPONSIBILITY | an accepted handoff is covered without her saying it no longer needs her | CAUGHT (3 failing) |
| H14 | 5 RESPONSIBILITY | merely asking someone reads as covered | CAUGHT (4 failing) |
| H15 | 5 RESPONSIBILITY | "they said yes" relies on the domain default and so reads as "no longer needs her" | CAUGHT (1 failing) |
| H16 | 5 RESPONSIBILITY | asking someone records that it no longer needs her | CAUGHT (1 failing) |
| H17 | 5 RESPONSIBILITY | Home starts invoking completeResponsibility | CAUGHT (1 failing) |
| H18 | 6 COMPLETION TRUTH | a completed task no longer carries "condition not verified" | CAUGHT (5 failing) |
| H19 | 6 COMPLETION TRUTH | the "not verified" statement is replaced by "Fixed and verified" | CAUGHT (2 failing) |
| H20 | 6 COMPLETION TRUTH | Last Done is worded as "Fixed <date>" instead of "Marked done <date>" | CAUGHT (3 failing) |
| H21 | 6 COMPLETION TRUTH | an empty Home says everything at home is handled | CAUGHT (2 failing) |
| H22 | 7 RECURRENCE | creating a recurrence rule also completes the task (a definition becomes a completed occurrence) | CAUGHT (2 failing) |
| H23 | 8 LAST DONE | Last Done reads the row's updatedAt (an edit timestamp) as completion evidence | CAUGHT (2 failing) |
| H24 | 8 LAST DONE | a repeat rule with no completion is given a Last Done from its anchor date | CAUGHT (2 failing) |
| H25 | 9 SYNC COMPOSITION | the production composition stops telling the sync runtime about account state (a bound account never syncs) | CAUGHT (7 failing) |
| H26 | 10 LOADING VS EMPTY | hydration in progress renders as an empty Home | CAUGHT (1 failing) |
| H27 | 10 UNRECOVERED VS EMPTY | a recovered (started-over) household renders as an ordinary empty Home | CAUGHT (3 failing) |
| H28 | 10 UNRECOVERED VS EMPTY | the recovery is never surfaced from the store snapshot | CAUGHT (4 failing) |
| H29 | stale editor | a stale edit is applied instead of refused | CAUGHT (3 failing) |
| H30 | stale editor | staleness is judged by timestamp only, so a same-instant change is missed | CAUGHT (3 failing) |
| H31 | double save | a second Save after success runs again (a second task is created) | CAUGHT (1 failing) |
| H32 | double save | two concurrent Saves both run | CAUGHT (1 failing) |
| H33 | context guard | marking done is allowed on a record outside Home | CAUGHT (1 failing) |
| H34 | removed != completed | a removed (set aside) task is listed as marked done | CAUGHT (2 failing) |
| H35 | visit truth | a past visit no longer says its outcome is unknown | CAUGHT (3 failing) |
| H36 | due again | "It's due again" carries the old due date over (a stale date reads as overdue) | CAUGHT (1 failing) |
| H37 | progressive disclosure | a section silently keeps only its first 50 rows (tasks become unreachable) | CAUGHT (2 failing) |
| H38 | time of day | a visit that ended earlier today jumps into "Past visits" as the hours pass (membership depends on the clock) | CAUGHT (1 failing) |
| H39 | shared attention | Home drops the shared "no answer" attention reason | CAUGHT (1 failing) |
| H40 | form: duration truth | the task form sends a prefilled duration she never touched (an edit upgrades a default to hers) | CAUGHT (1 failing) |
| H41 | form: locked repeat | the task form overwrites a repeat Home cannot express | CAUGHT (1 failing) |
| H42 | completion truth | a task she marked done is offered "Mark done" again instead of only "It's due again" | CAUGHT (2 failing) |
| H43 | accessibility | the spoken label keeps the visual dash ("Asked Sam , no answer yet") | CAUGHT (3 failing) |
| H44 | progressive disclosure | a section can never be expanded past its first 5 rows (tasks become unreachable) | CAUGHT (1 failing) |
| H45 | archived context | creation controls are shown while the Home area is archived | CAUGHT (2 failing) |
| H46 | unrecovered vs empty | the screen shows the recovery notice only when there is no content (a recovered household with a task hides it) | CAUGHT (1 failing) |
| H47 | responsibility | the detail screen records "They said yes" without asking whether it still needs her (defaults to no longer needs) | CAUGHT (1 failing) |

## 31. Defects found and repaired

P0–P3 inside approved Feature 06 semantics are repaired; P4–P10 are documented. No P0, P1 or P2 was found in the Home code.

| # | Found by | Defect | Severity | Disposition |
|---|---|---|---|---|
| 1 | AJ/AK/AL time-of-day test | A visit that ended at 11:00 joined the "Past visits" lens at 15:00 while still in "Coming up": a duplicate row and section membership that moved with the clock | P3 | **Repaired** — a visit that ended today stays in Coming up until the day turns; only an earlier-day visit is listed under Past visits (mutant H38 guards it) |
| 2 | Accessibility tests | The spoken label read "Asked Sam , no answer yet" (stray space) and "2:00 PM–3:00 PM" with a bare en dash | P3 | **Repaired** — `spoken()` builds the label from the same facts (mutant H43) |
| 3 | Mutation check H46 | The recovery notice was only tested at the model level, not that it stays beside content | P3 (test gap) | **Repaired** — screen-level test |
| 4 | Mutation check H47 | The default answer to "does this still need you?" was untested | P3 (test gap) | **Repaired** — screen-level test; the conservative default is "yes" |
| 5 | Mutation check H7 | First form was an equivalent mutant | test-quality | **Replaced** with the realistic defect |
| 6 | Design review of the legacy screen | `HomeOverview` said "Nothing home-related on your list.", asserted Systems were "Running in the background", and carried a filler footer | P3 (copy truth) | **Replaced** by Home OS |
| 7 | Store design (HM1) | A recovered household is a FRESH household: a screen reading only `state` would show an empty Home | P2 if shipped | **Designed out** — `homeReadiness`/`homeScreenState` read the snapshot (mutants H26–H28, H46) |
| 8 | Reading `attentionFor` | It treats an `acknowledged` handoff as "handled elsewhere" for risk (ACKNOWLEDGED ≠ COVERED) | P4 (shared) | **Documented** (MP-06-07); Home does not present `risk` as its own judgment |
| 9 | Reading the Life hub | `describeHome` renders "N systems running" (asserts operation) and "0 systems running" for an empty household; an archived category vanishes from the hub, so Home is then reachable only by route | P4 (shared) | **Documented** (`HK-INT-WAVE2-LIFE-REGISTRATION`); the shared hub is not edited |
| 10 | Reading `standingOf` | An event can never be `satisfied` (the calendar does not know whether it was attended), so a task that "requires" a visit would stay blocked until the visit is removed | P4 (shared semantic) | **Documented**; Home creates no event prerequisites (MP-06-08) |

## 32. Missing primitives

`docs/builds/HK_FEATURE_06_MISSING_PRIMITIVES.md` — 13 rows (MP-06-01 … MP-06-13) with the contract's fields. **None was built.** Those that would be a new durable semantic and would need an owner checkpoint if the owner wants them: retracting a mistaken completion (01), occurrence tracking (03), multi-context membership (06), a visit's outcome (08), an asset/property model (09), provider verification (10), money for a repair (13, only for a shared sign/meaning).

## 33. Integration candidates

Recorded in the register (§2): `HK-INT-WAVE2-LIFE-REGISTRATION`, `HK-INT-HOME-TODAY-01`, `HK-INT-HOME-CALENDAR-01`, `HK-INT-HOME-SYSTEMS-01`, `HK-INT-HOME-PEOPLE-01`, `HK-INT-HOME-MONEY-01`, `HK-INT-HOME-LIFEADMIN-01`, `HK-INT-TIO-HOME-01`, `HK-INT-HOME-PATTERN-01`, `HK-INT-HOME-REOPEN-01`. Two are worth naming for the integrator: (a) **reopen** — Home's "It's due again" is the only producer of a `reopened` task observation on this baseline; if another feature adds reopen or an undo, one shared meaning is needed (MP-06-01); (b) **attention** — Today and Calendar must show the same judgment for the same facts; Home uses `attentionFor` plus factual conditions only.

## 34. Accessibility

* **Roles and labels.** Rows are buttons with a spoken label built from the same facts they show; sections are summaries with counts; the item title is a header; groups on the detail screen are summaries; errors are alerts; sheets use the shared `Sheet` (`accessibilityViewIsModal`).
* **State never rests on color.** Every fact that is styled as attention states itself in words; the spoken label carries every stated fact (test: "critical state never relies on color").
* **Responsibility, unknown, default and completion state are spoken** (AZ, BA): "Asked Sam, no answer yet", "planning estimate, not from you", "No completion recorded", "Marked done … doesn't check that the problem is actually fixed", "doesn't know whether this happened".
* **No essential drag-only action** — there is no drag interaction. Rows are at least 56 pt tall; text uses the design system's typography (no fixed text heights).
* **Not executed:** a real screen-reader traversal, font scaling and contrast on a device (§39).

## 35. Performance methodology and results

Algorithmic evidence measured on **desktop Node**, not device rendering. Recorded by `tests/hk-f06/homePerformance.test.mjs`: environment, mode, fixture, cold vs warm, sample count, median and p95. No cache is used.

| | |
|---|---|
| Environment | Node v24.14.0 · win32/x64 · 13th Gen Intel(R) Core(TM) i7-1360P · 16 cores · 15.57 GB |
| Mode | node --test (test mode, desktop JS runtime; NOT Hermes, NOT a device) |
| Fixture | 282 Home-associated records (276 listed), 3240 tasks in the household, 62 observations; multiple recurrence states, completion histories, responsibilities, dependencies, unknown/default/explicit durations |
| Cold (first call in the process) | 41.39 ms |
| Warm projection (40 samples after 5 discarded) | **median 17.51 ms**, p95 22.03 ms |
| Warm detail projection (40 samples) | **median 0.09 ms**, p95 0.31 ms |
| Scaling (500 → 3000 unrelated tasks, 15 samples each) | median 6.31 ms → 10.35 ms |

These figures are from the final full-suite run, when the machine was busier; an earlier standalone run of the same test measured a projection median of 6.9 ms (p95 10.2 ms, cold 29.7 ms) and a detail median of 0.02 ms. Targets were projection < 100 ms median and bounded detail < 50 ms median; both are met with wide margin. Cost tracks Home records, not everything she owns: 6× the unrelated tasks (500 → 3000) does not 6× the projection.

## 36. Privacy

Home data can reveal routines, absence patterns (visit schedules) and private conditions. Home therefore: never logs (a source scan finds no `console.*`); has no network, analytics, crash-reporting, AI or Supabase client of its own (source scan); uses free text only for display, and only the title and location appear in a row — notes appear only in the detail; introduces no new local or cloud field, so nothing new leaves the device except through the existing, RLS-guarded canonical sync. Account switch isolates households (AP: A's Home task is never uploaded under B); a demo household stamps `demo-seed` and never syncs (AQ). No AI is wired, no prompt or model SDK added, and nothing lets AI mutate Home state.

## 37. Test accounting

Baseline (verified in this worktree before any change): **975 tests / 207 suites**. Final: **1200 tests / 247 suites, 1200 pass, 0 fail, 0 skipped, 0 cancelled** (975 + 225 new = 1200, exactly).

New tests (all in `tests/hk-f06`, plus support and fixtures):

| File | Tests | Covers |
|---|---|---|
| homeContext | 21 | the Home-context contract (§6–§10) |
| homeView | 48 | projection, scenarios, clock, DST, purity, ordering, boundary scans |
| homeMutations | 39 | create/edit/stale/double-save, responsibility, recurrence, visits, restart, offline, second device, refusal, account switch, demo, scale |
| homeCopy | 17 | copy-truth audit, accessibility wording |
| homeReadiness | 7 | loading / recovery / empty against a real store |
| homePerformance | 4 | dense-fixture methodology |
| homeForms | 16 | form rules |
| homeUi | 30 | rendered screens, source audit |
| homeScenarios | 34 | evidence files (33 scenarios + orphan check) |
| homeHardening | 9 | malformed association, hostile input, offline disagreement |
| **Total new** | **225** | 975 + 225 = 1200 |

**Disposition of inherited tests affected by the Home change.** `tests/build3Audit.capture.test.mjs`, "every Life screen with a task list is wired to its role, and the hub links to the rest" — **REWRITTEN, not weakened**: the legacy `HomeOverview.tsx` it inspected was REPLACED; the same invariant (wired to the `home` ROLE, lists every open task not only today's) is now asserted against `homeContext.ts` and, in addition, by behavior (every open Home task is listed by Home OS). Every other inherited test — 974 of 975 — is **PRESERVED** unchanged. **None REPLACED, none REMOVED.** The repair build's 163 `tests/hk-ir01` tests are among the preserved ones and pass (163 / 163 in the final run).

## 38. Schema and fingerprint

**Default expectation held: no Feature 06 schema change.** No migration, table, column, RLS policy, RPC or sync kind was added or changed (`git diff --name-only 14bd58e..HEAD` lists nothing under `supabase/migrations`, `src/domain/sync`, `src/persistence`, `src/store`, `src/state` or the shared domain). The certified fingerprint therefore stands.

| | |
|---|---|
| OLD fingerprint | `43e7c8a4402a3387cb2e1add4170921e` / 3617 (certified repair baseline) |
| NEW fingerprint | **identical** — read-only measurement after the full harness: `MATCH` |
| Intended changed dimensions | **none** |
| Migration hashes | baseline blob `8bc38d66…` (working tree `81909daa…` is the CRLF form), shipping `1e9169de…`, additive IR01 `73db6639…` — unchanged |
| Populated-database upgrade / fresh install | not applicable (no migration) |
| Rollback / irreversibility | not applicable |
| RLS impact | none — RLS = INHERITED CERTIFIED COMMON POSTURE |
| Sync impact | none — no new kind; existing kinds carry every Home record |

## 39. Device evidence

**NOT EXECUTED — ENVIRONMENTAL LIMITATION.** The only Android runtime on this host is emulator `HerKeys_Runtime` (`emulator-5554`), which belongs to another session; the contract forbids taking another session's emulator. Starting a second one is unsafe on this machine (free commit memory fell below 1 GB during this build; the repair notes record the same starvation), and `preview_start` anchors Metro to the original checkout rather than this worktree. **No screenshot was taken, and none is claimed.**

What stands in for it, and is not device evidence: rendered-component tests over the React Native stub (roles, labels, states, disclosure, copy — 30 tests) and the Android bundle export (exit 0, 1,644 modules, contains Home OS and none of the legacy Home; a first export that bundled another checkout was detected and discarded). What a device pass still owes: visual hierarchy and density of the hub on a 200-item household, a real screen-reader traversal, editor keyboard and scroll behavior, sheet presentation, Life hub → Home navigation, and the archived-area state (which needs the internal dev tools to archive it).

## 40. Shared-file changes

Everything outside `src/features/home/`, `tests/hk-f06/`, `tests/support/home*`, `tests/fixtures/home/`, `docs/builds/HK_FEATURE_06_*`, `scripts-dev/f06-*` and `supabase/tests/journey-home.mjs`:

| File | Change | Why / regression |
|---|---|---|
| `app/(app)/life/home.tsx` | now renders `HomeScreen` instead of `HomeOverview` (4 lines) | the existing route is the narrowest Home entry; regressed by the full suite |
| `app/(app)/life/home-item.tsx`, `home-task-editor.tsx`, `home-visit-editor.tsx` | NEW thin route wrappers under the existing Life stack | Home's own detail and editors; each sets its own header title, so `_layout.tsx` and the hub are untouched |
| `tests/build3Audit.capture.test.mjs` | one assertion rewritten + one import | §37 |
| `tests/support/accountDevice.mjs` | NEW test support (the production-composition device harness, extracted because `syncComposition.test.mjs` registers tests at import) | none of the original is modified |
| `supabase/tests/run.mjs` | +7 lines registering `journey-home.mjs` (`run.mjs home`, and in the full run after composition) | test infrastructure only; the full harness is re-run and passes (§44) |

No file under `src/domain`, `src/store`, `src/state`, `src/persistence`, `src/platform`, `src/design` or `supabase/migrations` changed. `CategoryTaskList`, the Life hub, `TaskForm`, `EventForm` and `SystemsList` are byte-identical to the baseline.

## 41. Sibling-import result

**ZERO.** A mechanical scan of every F06-owned file (source, routes, tests, journey) for `feature/05`, `feature/07`, `feature/08`, `src/features/kids`, `coparent`, `co-parent`, `meals` and every other feature namespace found on this baseline (`money`, `work`, `today`, `calendar`, `systems`, `talk-it-out`, `daily-load`, `one-move`, `onboarding`, `tasks`) finds no reference. Every import that leaves `src/features/home` resolves to the common foundation: `domain/*`, `design/*`, `store/AppStateProvider`, `state/appStore`. A test (`BL`) keeps it that way.

## 42. Owner checkpoints

**None triggered.** No new entity, table, durable field, relationship, sync kind, RLS change, asset model, maintenance-history model, safety-verification state, multi-context membership or ownership/identity semantic was required or built. Capabilities that WOULD need one are listed in §32 with the reason; the owner decides whether to want them.

## 43. Considered and deferred

* **Creating a prerequisite from the editor.** Home displays and preserves dependencies but does not offer to create them. The one relation that would make sense — "needs the plumber visit" — is not expressible truthfully, because an event can never satisfy a prerequisite (finding 10). Not required by the contract.
* **Occurrence tracking, an `after_completion` next date, undo of a mistaken completion, a visit's outcome, System creation, person creation** — missing primitives (§32).
* **A money amount on a repair** — BN, SAFE-UNAVAILABLE.
* **Past visits older than 7 days, and completed tasks older than 30 days,** are not listed (their history remains in canonical state).
* **Ordering by anything other than date and title.** No Home priority, urgency, risk or attention score was built, by contract.
* **Push notifications, reminders, calendar placement, capacity optimization, AI** — out of scope by contract.

## 44. Exit gates (recomputed at the final HEAD)

Every row below was recomputed at the final code HEAD (`68f9b87`); the working tree was clean before and after (`git status --short` empty).

| Gate | Result |
|---|---|
| Exact branch / HEAD | `feature/06-home-os` · code HEAD `68f9b87`, forked from `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1` |
| Clean git status | clean; every mutated file restored byte for byte (mutation run exit 0) |
| TypeScript (`tsc --noEmit`, 1.6 GB heap) | **exit 0** |
| Full app suite (serial) | **1200 tests / 247 suites, 1200 pass, 0 fail, 0 skipped, 0 cancelled** |
| Feature 06 suite | **225 / 225** (40 suites) |
| Repair build's tests (`tests/hk-ir01`) | **163 / 163** (preserved) |
| Tier 1 results | **all PASS** (§27) |
| Tier 2 results | **PASS**; BG and BJ NOT-APPLICABLE with reasons (§28) |
| Tier 3 results | BM, BQ (limited), BR PASS; BN, BO, BP, BS SAFE-UNAVAILABLE; BT NOT-APPLICABLE (§29) |
| Scenario assertion map | §26; 33 committed evidence files regenerate byte for byte |
| Mutation / test-the-test | **47 caught, 0 survived, 0 broken** |
| Backend harness (`node supabase/tests/run.mjs`, real local PostgreSQL) | **826 / 826 checks passed** (exit 0): the 800 the repair ledger reports, plus 26 Home journey checks. The HM0 attempt that aborted with `spawnSync docker UNKNOWN` (environmental) is superseded (§2.2). The repair build's 35-mutant check also re-ran here: **35 caught, 0 survived, 0 broken**. |
| Application-composition sync test | `tests/hk-ir01/syncComposition` and Home's `homeMutations` / `homeContext` start from `composeAccountApp` — pass in the suites above |
| Real PostgreSQL journey | **26 / 26** Home checks against real local PostgreSQL / PostgREST / RLS (`node supabase/tests/run.mjs home` prints 34/34 because it adds 8 setup checks): Device A (`composeAccountApp`) → real claim RPC → PostgreSQL → Device B |
| Second-device round trip | in-memory cloud and real PostgreSQL: identical Home facts on both devices |
| Offline / restart | M, L, AU, AV — pass |
| Account switch | AP — pass |
| Demo isolation | AQ — pass |
| Retry / permanent refusal | AU, AV — pass |
| Home-context name independence · lifecycle · round trip | `homeContext` (21) — pass; rename also proven in the real database |
| Last-done derivation · completion-history truth | AA, AB, Z, BD; mutants H23, H24 — pass |
| Dependency truth · duration provenance · responsibility truth · recurrence truth | V/W/X · G/H/I + form tests · Q–U · Y/Z — pass; mutants H7–H17, H22, H40, H41 |
| System-boundary prohibition | BF (source scan + UI test) — pass |
| False completion / safety tests | AD, copy audit, source audit; mutants H18–H21, H42 — pass |
| Loading ≠ empty · unrecovered ≠ empty | `homeReadiness` (7), `homeUi`; mutants H26–H28, H46 — pass |
| 08:00 / 15:00 / 21:00 stability | AJ/AK/AL — pass; DST AN/AO, midnight AM — pass |
| RLS matrix | **not materially applicable**: RLS = INHERITED CERTIFIED COMMON POSTURE. The common matrix runs unchanged inside the harness row above; Home adds spot checks (§24) |
| Privacy / secret scan | no secret-shaped string, no PII, no `console.*`, no network/analytics/AI client in Home; `app.json`, `package.json`, `eas.json` untouched |
| Expo Doctor | **21 / 21 checks passed, no issues detected** |
| Android export | **exit 0** — `expo export --platform android` bundles 1,644 modules into one 6.4 MB Hermes bundle that CONTAINS Home OS (the three new routes, `buildHomeView`, `homeContextOf`, "Restore Home area", "Marked done", "No completion recorded") and none of the legacy Home (`HomeOverview` and its two sentences are absent). **A first export exited 0 too but bundled the OTHER checkout's legacy Home** (Metro's transform cache is shared through the linked `node_modules`); it was detected by searching the bundle for a string only this tree has, discarded, and re-run with its own temp/cache directory |
| Migration hashes | baseline `8bc38d66…` (git blob; the CRLF working-tree form is `81909daa…`), shipping `1e9169de…`, additive IR01 `73db6639…` — all unchanged; nothing under `supabase/migrations` changed on this branch |
| Schema fingerprint | **MATCH** — `43e7c8a4402a3387cb2e1add4170921e` / 3617 facts, measured read-only after the harness and verified against `baselines/ir01-local-fingerprint.json`; unchanged from the certified value |
| Performance | projection median 17.51 ms (target < 100), detail 0.09 ms (< 50) — §35 |
| Accessibility | §34; real screen-reader pass not executed (§39) |
| Copy-truth audit · affordance audit | `homeCopy` (17) + `homeUi` source audit — pass |
| Shared-file report | §40 — 7 files, no schema/sync/persistence/shared-domain change |
| Mechanical sibling-import scan · feature-boundary scan | **ZERO** (§41); imports leave the feature only into the common foundation |
| Device / visual validation | **NOT EXECUTED — ENVIRONMENTAL LIMITATION** (§39) |


## 45. Final verdict

**HK-FEATURE-06-HOME = PASS WITH DOCUMENTED DEBT**

* **READY FOR INDEPENDENT FEATURE 06 AUDIT = YES**
* **READY FOR WAVE 2 INTEGRATION = YES**

This does not authorize a merge, a push or a PR, and none was made.

**Why "with documented debt" and not plain PASS.** No Tier 1 or Tier 2 scenario fails; every gate in §44 was recomputed. The debt is real and explicit: (1) **no on-device evidence** (§39, environmental); (2) four Tier 3 capabilities are SAFE-UNAVAILABLE because the foundation does not provide them (§29); (3) thirteen missing primitives (§32), three of which limit what Home can truthfully say — it cannot retract a mistaken completion, cannot know whether a visit happened, and cannot see a record filed under another category; (4) two shared-layer concerns found and not changed (`attentionFor` treats an acknowledged handoff as handled; the Life hub's Home row copy) and a shared-hub navigation gap (an archived Home area disappears from the hub).

### Completion value statement

After Feature 06, a woman can open Home from Life and see what is saved about her house — what needs attention, who was asked, what is coming (including service visits), what is unresolved, and what repeats with when it was last marked done and when it is next expected — add and edit her own Home tasks, repeats and visits, hand something to someone and see whether it is really off her plate, and trust that Her Keys will not tell her the house is fine, a repair is fixed, a visit happened or a person is qualified when it has no way to know.

### The 24 final questions

1. **Can she understand what around her home needs operational attention without reconstructing it?** Yes, for what is saved under Home: the hub groups it (needs attention, waiting on someone, coming up, unresolved, repeats, recently done, past visits) with bounded disclosure. It says plainly that it cannot see the house itself.
2. **Is Home association stable identity, not names or title parsing?** Yes — the category carrying system role `home`; a source scan and tests prove no decision is made from a name, title or keyword.
3. **What happens if the Home context is renamed?** Nothing but the label. Proven through restart, second device and the real database.
4. **Archived?** Home still opens, lists every record still filed under it, says the area is archived, withholds creation and offers one explicit "Restore Home area". The shared Life hub stops listing an archived category (a shared behavior, recorded), and only the internal dev tools can archive one today.
5. **The V1 single-category limitation?** §9: a record has exactly one category; something filed under her own "Yard" is not in Home and is never guessed into it. Multi-context membership would need owner approval.
6. **Can Home imply no records means no problems?** No — separate loading, missing, recovered and empty states, the empty copy says what is not known, and mutants that break each are caught.
7. **Can she tell unresolved, scheduled and completed apart?** Yes: "Not marked done", "Scheduled", "Marked done".
8. **Can she see when recurring work was last legitimately completed?** Yes, from completion evidence only, as "Marked done <date>".
9. **"No completion recorded" vs "Never done"?** Distinguished; the word "never" is banned in Home copy.
10. **Assignment vs coverage?** Distinguished in nine coverage states; "covered" only when accepted and she said it no longer needs her, and even then not as done.
11. **Does recurring work reuse shared recurrence/System semantics?** Yes: `addRecurrence`, `setRecurrenceStatus`, `nextOccurrence`; Systems are shown, never run.
12. **Can Home create recurring work only through approved shared paths?** Yes; it never creates a System, and a repeat it cannot express is locked, not overwritten.
13. **Can she create and edit real canonical Home state?** Yes: tasks, visits, repeats, and the handoff of either.
14. **Does the association survive restart and second-device sync?** Yes, in-memory and against real PostgreSQL.
15. **Does duration provenance survive?** Yes, as `duration_source` in the database.
16. **Does dependency truth survive?** Yes; device B reads `ready` from the pulled completed prerequisite.
17. **Can a disappeared prerequisite falsely make work ready?** No: removed or missing is "needs review".
18. **Can completion falsely become "repair verified" or "safe"?** No: "Marked done" plus an explicit "Her Keys doesn't check…".
19. **Does Home reuse shared attention rather than contradict Today/Calendar?** It reuses `attentionFor` and states only facts otherwise; cross-feature reconciliation belongs to integration.
20. **Does Home avoid an asset/property/inventory universe?** Yes; nothing was added.
21. **Can future intelligence reason from completion history without confusing edit timestamps with outcomes?** Yes: append-only `completed` / `reopened` / `skipped` observations are preserved and Home never treats a timestamp as evidence.
22. **Were durable semantics proposed?** Candidates are recorded in the register; none was required or built.
23. **Were schema owner checkpoints triggered?** No.
24. **Were sibling imports introduced?** No — zero.

### Replacement claim

Feature 06 satisfies **this approved Feature 06 contract**. Whether Home OS replaces every home-maintenance competitor is a market judgment that belongs to the owner; it is not concluded here.
