# HK F01–F13 — Integration Map

Campaign: F01–F13 Full Product Integration / Hostile Audit (Phase 3). Branch `integration/f01-f13-convergence`, traced at `9d0073d`
(repairs after that commit are noted where they change a fact).

**Method.** Traced from code, not from build documents: four read-only traces (F01–F03, F04–F07, F08–F10, F11–F13), each citing
`file:line`, plus direct reading while auditing and repairing. Where a feature's own document disagrees with its code, the code is what
is recorded here and the disagreement is listed under "known deferred seams" or in the defect ledger. Paths are relative to the
repository root.

## 0. The shared ground every feature stands on

| Concern | Where it lives | What it means for every feature |
|---|---|---|
| Local state | `src/domain/state.ts` `AppStateSchema` (574–645); integrity `findIntegrityProblems` | One validated root per collection. Collections added after Build 4 default to `[]` so an older save still loads (HK13-D08). |
| Cloud tables | `supabase/migrations/20260919231500_build4_cloud_schema.sql` (the shipping migration) + additive migrations F08, F05, F09, F10, F11, F12, F13 (chain: `supabase/tests/migration-chain.mjs`) | The baseline file creates tables the shipping migration drops and recreates; the shipping migration is authoritative for every pre-Wave-3 table. |
| RLS model 1 — scoped rows | `private.can_access_scoped_row` (shipping 315–334): tasks, events, household_systems, household_categories | `household` / `child` → every member; `personal` / `professional` / `coparent-shared` → the owner only. A row's scope is fixed when it is created; a new row takes its category's scope (HK13-D14, `scopeForNewRow`). |
| RLS model 2 — owner-private | `(SELECT auth.uid()) = profile_id AND private.is_household_member(household_id)`: household_people, responsibilities, dependencies, recurrence_rules, system_steps, behavior_observations (select/insert), one_move_records, needs_me_items, source_artifacts, interpretations, discovery_records, capacity_profiles, and every Wave 3/4 table | No DELETE policy or grant anywhere; retirement is a status change. |
| Sync registration | `src/domain/sync/syncTypes.ts` (`CORE_SYNC_KINDS`, `CLOUD_TABLE`, `ALLOWED_OPS`, `DEPENDENCY_RANK`, `UPDATABLE_COLUMNS`) + `src/domain/sync/foundationSpecs.ts` (the manifest: `FOUNDATION_KIND_NAMES`, generated SQL via `supabase/tools/gen-foundation-sql.mjs`) | A kind is either hand-registered (core + F12's two) or manifest-registered (Build 4's eighteen + F10, F11, F13). Pull applies tables in `DEPENDENCY_RANK` order; `clash.ts` resolves domain uniqueness races (HK13-D13 added `personContext`); `sync_push` (SECURITY INVOKER) carries the owner-private allow-list, re-declared cumulatively by each additive migration (HK13-D03). |
| Today | `buildTodayView` (`src/features/today/model/todayView.ts:67`) = `attentionFor` (`src/domain/reasoning/attention.ts:56`) + `projectStateDay` (`src/domain/projectDay.ts:83`) + sections | Reads tasks, events, needsMe, responsibilities, externalReferences, careerOpportunities (F10's follow-up dates), approvals. Never reads rebuildFocuses, lifeRecords, personContexts or their links. |
| One Move | `src/domain/oneMove.ts` `candidatePoolFor` (151–) | Open, unblocked Tasks on today's radar (smallest first) + open Needs Me items. Only a duration she gave counts as a size (HK13-D12); expected income and pre-due autopay bills are never offered (HK13-D19). A demo household reads the catalog. |
| Calendar | `src/features/calendar/model/collect.ts` `collectDayItems` (193–) | Reads only events and open tasks; a recurrence is a "repeats" note; child names resolved by id. |
| Life hub | `app/(app)/life/index.tsx`; `src/features/life/lifeStatus.ts` `LIFE_SCREEN_ROUTES`; `src/domain/taskLists.ts` `TASK_LIST_ROLES` | "Where things stand": one row per category whose role has a Life screen (kids, home, money, meals, work, coparenting) + Other open tasks + Life Inbox + Needs Me. "Just for you": Me / Rebuild, Life Admin, People (HK13-D10). |

## 1. Per-feature map

### F01 — Today / Chief of Staff (Wave 2, integrated at WAVE3_BASE `363e473`)

| Field | Traced fact |
|---|---|
| Canonical entities | `OneMoveRecord` → `oneMoves`; `ActionRecord` (the seven `daily_load.*` actions) → `actions` (shared with F03); Today itself is computed (`TodayView`, `AttentionItem`, `OneMoveView`), never stored. |
| Routes / screens | `/today` tab (`app/(app)/today.tsx`) → `TodayBriefing`; cards `DailyLoadCard`, `LoadMeter`, `OneMoveCard`; links out to `/task-editor`, `/event-editor`, `/life/needs-me`, `/opportunity-editor`. |
| Commands | `resolveOneMoveForToday` (store-driven, `src/state/appStore.ts`), `completeOneMove`; Daily Load decisions (`src/domain/dailyLoadDecisions.ts`, `recommendationActions.ts`); `decideIntent`, `returnToSelf`. |
| Projections | `buildTodayView` and its sections (`attentionView`, `mattersSection`, `oneMoveSection`, `decisionView`, `executionView`, `canWaitSection`, `upcomingSection`). |
| Tables / migration / RLS | one_move_records, action_records, behavior_observations, evidence_links, needs_me_items (owner-private); tasks, events (scoped). Shipping migration. |
| Sync kinds | `oneMove`, `action`, `observation`, `evidenceLink`, `needsMe`, `task`, `event`, `decision`, `responsibility` (`execution`/`outcome` pull-only). |
| Today / One Move / Calendar / Life | Owner of Today and One Move; shares Daily Load and the actions ledger with Calendar; shows `LifeStatusSummary` ("Also checked"). |
| Cross-feature deps | today → daily-load, life, one-move, talk-it-out; one-move ↔ today and life ↔ today import cycles (P7, documented). |
| Deferred seams | TODAY-FD-001..005, MP-01..04, OD-01 (removed prerequisite wording) — `docs/builds/HK_FEATURE_01_TODAY.md:483–540`. |

### F02 — Talk It Out / Life Inbox (Wave 2)

| Field | Traced fact |
|---|---|
| Canonical entities | `SourceArtifact` → `sourceArtifacts`, `Interpretation` → `interpretations` (pending, clarifying, accepted, rejected, superseded), `DiscoveryRecord` → `discovery`. Captured text lives in memory for the session only. |
| Routes / screens | `/talk-it-out` (modal), `/ai` tab, `/life/inbox`; `TalkItOutView`, `LifeInboxView`, `CaptureGroup`. |
| Commands | capture coordinator (`src/features/talk-it-out/capture/coordinator.ts`): submit, interpret, answerClarification, correct, accept, reject, dismiss — over `src/domain/interpretations.ts`. LISTEN → HYPOTHESIS → CLARIFY is the scripted discovery conversation (`engine.ts:66`); capture runs interpret → propose → supersede → accept/reject. |
| Tables / RLS | source_artifacts, interpretations, discovery_records (owner-private). An accepted row takes its category's scope (HK13-D14; before: `child` or `household` always). |
| Sync kinds | `sourceArtifact`, `interpretation`, `discovery` (the only kind with a delete marker). |
| Today / One Move / Calendar / Life | Accepted rows reach Today/Calendar as ordinary Tasks/Events; interpretations never do. Unresolved captures never reach Today (pending seam, F02 doc 415–417). Life Inbox row on the hub. |
| Cross-feature deps | none outbound; `src/domain/discovery.ts` imports the Talk It Out engine (domain → feature, P7). |
| Deferred seams | OD-1 (raw text retention), OD-2 (high-stakes policy), G1–G5, voice, capture attention into Today; OD-B, OD-C (`HK_INTEGRATION_READINESS_01.md`). |

### F03 — Calendar + Capacity (Wave 2)

| Field | Traced fact |
|---|---|
| Canonical entities | `CalendarEvent` → `events`; `Task` with `plan` and `durationSource` → `tasks`; capacity profile → `capacity` (no UI writes it). |
| Routes / screens | `/calendar` tab, `/event-editor` (`EventForm`); `/task-editor` belongs to `src/features/tasks`. |
| Commands | `addEvent`, `updateEvent`, `removeEvent`; Daily Load commands through previews (`applyIntent`, `acceptIntent`), today only. |
| Projections | `projectCalendarDay`, `projectCalendarWeek`, `collectDayItems`, `capacityStateOf`. |
| Tables / RLS | events, tasks (scoped), action_records; capacity_profiles owner-private (not read). |
| Sync kinds | `event`, `task`, `action`, `capacity`, `observation`. |
| Integration | Money/F12/F13 create no Events; F10 interviews are canonical Events on the Calendar; F07 handoffs are Events (anchor date only). |
| Deferred seams | OD-01 (defaulted duration), F03-FG-01..13, capacity profile unconnected (`HK_FEATURE_03_CALENDAR_CAPACITY.md`). |

### F04 — Systems + Routines (Wave 2)

| Field | Traced fact |
|---|---|
| Canonical entities | reuses `HouseholdSystem` → `systems`, `SystemStep` → `systemSteps`, `RecurrenceRule` (about a system) → `recurrences`, `Responsibility`; skips are `skipped` observations. |
| Routes / screens | `/systems` tab, `/systems/[id]`, `/systems/edit` (modal); `SystemsHub`, `SystemDetail`, `SystemEditor`. |
| Commands | `applySystemDraft` (System `household`, steps `personal`), schedule commands, responsibility commands. |
| Tables / RLS | household_systems (scoped, household); system_steps, recurrence_rules, responsibilities, observations (owner-private) — a System is shared, its steps and schedule are the owner's (P9, documented). |
| Today / One Move / Calendar / Life | None directly: Systems are not in the day projection; a System is never a One Move candidate; no Calendar occurrences (MP-08); Home lists home-category Systems read-only. |
| Deferred seams | MP-01 (no System status/archive — "top product gap"), MP-02 (child subject; `subjectMemberId` exists but F04 writes null), MP-03..MP-17 (`HK_FEATURE_04_MISSING_PRIMITIVES.md`). |

### F05 — Kids OS (Wave 2 + `20260921190000_f05_add_child_after_binding.sql`)

| Field | Traced fact |
|---|---|
| Canonical entities | `Child` → `children` (the ONLY place a child's identity and name are stored); reuses Task/Event (`scope: 'child'`, `subjectMemberId`), Responsibility, HouseholdPerson, `part_of` Dependency. |
| Routes / screens | `/life/kids`, `/life/child/[childId]`, `/life/child-add`, `/life/child-item`; `KidsHub`, `ChildDetailScreen`, `ItemEditorScreen`, `AddChildScreen`. |
| Commands | `addChildToHousehold`, child task/event CRUD, `removeChildItem`, handoffs (`requestHandoff`, `recordAcknowledged/Accepted/Declined`, `takeBack`). |
| Tables / RLS | household_members (children written only via `private.push_household_child`, owner-only, ≤ 20); tasks/events scoped. |
| Sync kinds | `member` (create-only, rank 0) + task, event, responsibility, person, dependency, observation. |
| Integration | Child identity is referenced BY ID by F12 (`LifeRecord.subjectMemberId`), F13 (`PersonContext.childId`, FK to household_members), F09 (`subjectMemberId`); names are read at render time only (cross-seam tests: a pulled rename shows everywhere). |
| Deferred seams | MP-K-04 (remove a child), MP-K-05 (rename a child — no path exists), MP-K-13, SD4-028 (child-data minimization review). |

### F06 — Home OS (Wave 2)

| Field | Traced fact |
|---|---|
| Canonical entities | none new: Home = the `home`-role category; tasks and visits (Events) `household`; repeats are RecurrenceRules; completion/reopen are observations. |
| Routes / screens | `/life/home`, `/life/home-item`, `/life/home-task-editor`, `/life/home-visit-editor`. |
| Commands / projections | `createHomeTask` … `restoreHomeArea` (`src/features/home/model/mutations.ts`); `buildHomeView` (reuses `attentionFor`, so Home and Today agree). |
| Integration | Tasks/visits reach Today/Calendar as ordinary rows; People (F13) creates no service workflow; Life Admin records hold durable record truth only. |
| Deferred seams | MP-06-01..13 (`HK_FEATURE_06_MISSING_PRIMITIVES.md`); Home can never show a System "last done" (nothing writes it; P9). |

### F07 — Co-Parent Logistics (Wave 2)

| Field | Traced fact |
|---|---|
| Canonical entities | none new: handoff = Event (`coparent-shared`, child subject) + replaced RecurrenceRule; preparation = Task + `requires` Dependency; reimbursement follow-up = Task with `value`; counterpart = HouseholdPerson + Responsibility. |
| Route / screens | one route `/life/coparent?mode=…` (`CoParentScreen`); reached from the Co-parenting category row since HK13-D10. |
| Commands | `createHandoff`, `editHandoff`, `removeHandoff`, `recordCounterpart`, `recordAnswer`, preparations, `createMoneyFollowUp`, `completeFollowUp`, `removeFollowUp`. |
| Done ≠ paid | done = `Task.status 'completed'` ("Marked done. Her Keys has no record of a payment."); paid = server-written evidence only (`paymentEvidence: 'service_reported_paid'`), which no provider writes yet (MP-07-06). |
| Tables / RLS | everything `coparent-shared` or owner-private: a second member reads nothing. |
| Integration | Money reads F07 through its public exports only (`src/features/money/reimbursements.ts`), never mutates it; People shows the co-parent read-only (`read_only_identity`). Kids can still act on child-linked F07 rows (documented, P5). |
| Deferred seams | OC-1 (handoff outcome), MP-07-01..14 (`HK_FEATURE_07_MISSING_PRIMITIVES.md`); MP-07-14 (generic editors create `household` rows) resolved by HK13-D14. |

### F08 — Meals OS (Wave 2 + `20260921160000_f08_meal_slot_and_status.sql`)

| Field | Traced fact |
|---|---|
| Canonical entities | `MealPlanEntry` → `meals` (+ `slot`, `status`); meal tasks are canonical Tasks. |
| Route / screens | `/life/meals` (`MealsOverview`, `MealsBody`, `MealSheet`, `MealTaskSheet`); tasks open `/task-editor`. |
| Commands / projections | `addMeal`, `updateMeal`, `archiveMeal`, `addMealTask`; `buildMealsView`, `upcomingMealsOf`, `recurringMealWork`. |
| Tables / RLS | meal_plan_entries (scoped, household); meal tasks household. |
| Sync kinds | `meal` (create/update) — no new kind. |
| Integration | A meal never reaches Today/One Move; only a dated meal Task. The Meals exit gate (`scripts-dev/meals-boundary-scan.cjs`) now registers every later lane and accounts for every change by who could have made it (HK13-D11, HK13-D22). |
| Deferred seams | MP-01..16; MP-02 (Meals in `TASK_LIST_ROLES`) kept deferred — Meals shows at most 30 tasks with no reveal, so the duplicate listing under "Other open tasks" is what keeps the rest reachable (P6, documented). |

### F09 — Money OS (`feature/09-money-os @ 17580d4`, merged `cc15e9a`)

| Field | Traced fact |
|---|---|
| Canonical entities | none new: a Money item is a Task in the `money`-role category with a `value` (integer `amountMinor`, USD, direction) and a due date; `paymentMechanism` manual/autopay on outflows (`20260922180000_f09_task_payment_mechanism.sql`). |
| Route / screens | `/life/money` (`MoneyOverview`, `MoneyBody`, `MoneySheet`). |
| Commands | `createObligation`, `createExpectedIncome`, `editMoneyItem`, `resolveMoneyItem` (completeTask = paid/received), `cancelMoneyItem`, `duplicateMoneyItemForward`. |
| Projections | `buildMoneyHomeView` — every open Money task in exactly one section since HK13-D17 (Needs attention + "Show N more", Coming up, Expected in, Later, Other open tasks); `reimbursementProjections` (F07, read-only). |
| Tables / RLS | tasks only; Money items are `household` (F09's decision, `HK_FEATURE_09_MONEY.md:97–104`); F07 reimbursements shown stay `coparent-shared`. |
| Sync kinds | `task` (`payment_mechanism` hand-listed). |
| Today / One Move / Calendar / Life | Today via `attentionFor` deadlines (autopay suppressed pre-due); One Move only manual bills and past-due autopay (HK13-D19); Calendar as date-only task items (no Event); Life row "Nothing due today" (HK13-D23). |
| Deferred seams | MP-09-01 (recurring bills), MP-09-02 (Calendar marker), MP-09-03 (household currency), MP-09-05..07. |

### F10 — Work / Career OS (`feature/10-work-career-os @ 8f2f7d4`, merged `2fadc79`)

| Field | Traced fact |
|---|---|
| Canonical entities | `CareerOpportunity` → `careerOpportunities` (stages exploring…accepted, closed + reason; `archivedAt` orthogonal; scope `personal`); reuses Task (next action, `professional`), Event (interview, `professional`), Dependency (`part_of`, opportunity endpoints). |
| Routes / screens | `/life/work` (`WorkOverview` + `CareerNext`), `/opportunity-editor` (`OpportunityForm`, root modal). |
| Commands | `addOpportunity` (always `exploring`), `updateOpportunity`, `setOpportunityStage` (the only stage writer, explicit only), `archiveOpportunity`/`restoreOpportunity`, `addOpportunityNextAction`, `scheduleOpportunityInterview`. |
| Projections | `careerListsOf` (open / closed / archived — HK13-D16), `linkedTasksOf`, `linkedInterviewsOf`, `hasOpenNextAction`, `workCareerVerdict`, attention `opportunity_follow_up`. |
| Tables / migration / RLS | career_opportunities (owner-private) + the dependencies widening, both in `20260922181000_f10_career_opportunities.sql` (created by the integration from F10's manifest entry — HK13-D01). |
| Sync kinds | `opportunity` (manifest) + task, event, dependency. |
| Integration | An opportunity never becomes a One Move; attention only from a date she recorded; no stage moves without her (no automatic advancement after an interview — cross-seam test); no capacity effect of its own. |
| Deferred seams | F10-MP-01..08 (`HK_FEATURE_10_MISSING_PRIMITIVES.md`). |

### F11 — Me / Rebuild OS (`feature/11-me-rebuild-os @ 03585f9`, merged `cbf8050`)

| Field | Traced fact |
|---|---|
| Canonical entities | `RebuildFocus` → `rebuildFocuses` (active/paused/archived, `personal`), `RebuildFocusLink` → `rebuildFocusLinks` (task/goal/system/event; `next_action` ⇒ task). |
| Route / screens | `/life/rebuild?mode=…` (`RebuildScreen` → home, detail, editor bodies). |
| Commands / projections | `addRebuildFocus`, rename/note/state, `linkToFocus`, `unlinkFromFocus`, `addNextStep` (one private Task, undated, + link); `buildRebuildHome`, `buildFocusDetail`. No score, streak, timer or missing-step attention. |
| Tables / migration / RLS | rebuild_focuses, rebuild_focus_links (owner-private; link target checked as the caller) — `20260922182000_f11_rebuild_focus.sql` (renamed from `180000`, HK13-D02). |
| Sync kinds | `rebuildFocus`, `rebuildFocusLink` (manifest); clash: one live link per (Focus, target) is adopted. |
| Integration | Only the next-step Task reaches Today/One Move, and only once dated; the Focus itself never. Hub row counts active (and now paused, HK13-D23). |
| Deferred seams | MP-11-01..06 (`HK_FEATURE_11_MISSING_PRIMITIVES.md`). |

### F12 — Life Admin / Documents (`feature/12-life-admin-documents @ 54da29c`, merged `02fa959`)

| Field | Traced fact |
|---|---|
| Canonical entities | `LifeRecord` → `lifeRecords` (metadata only: title + kind minimum, dates, masked reference, `subjectMemberId` = a child by id), `LifeRecordTaskLink` → `lifeRecordLinks` (renewal / follow_up / next_step; Task must be `personal`). |
| Route / screens | `/life/admin` (`LifeAdminScreen` → container, body, record / detail / task sheets). |
| Commands / projections | `addLifeRecord`, `updateLifeRecord`, `archiveLifeRecord`, `restoreLifeRecord`, `addLifeRecordTask`; `buildLifeAdminView` (Needs Review cap 3, Coming Up 14 days / cap 5; "expires today" is not passed), `buildRecordDetail` (masked reference). |
| Tables / migration / RLS | life_records, life_record_task_links (owner-private; link guard requires her own private Task) — `20260922183000_f12_life_records.sql` (renamed, HK13-D02). |
| Sync kinds | `lifeRecord`, `lifeRecordLink` (hand-registered in `CORE_SYNC_KINDS`). |
| Integration | The record never reaches Today/One Move/Calendar; its Task does (the Task title defaults to "Renew <title>", her own words, private). |
| Deferred seams | MP-12-01..20 incl. search (MP-12-03), supersession (MP-12-18), hard delete (MP-12-19). |

### F13 — People OS (`feature/13-people-os @ 3eb2ba0`, merged `85c585a`)

| Field | Traced fact |
|---|---|
| Canonical entities | reuses `household_people` (`people`) and `children`; owns `PersonContext` → `personContexts` (one per owner and child/person, private note) and `PersonTaskLink` → `personTaskLinks` (`follow_up` only, create-only). |
| Routes / screens | `/life/people`, `/life/person?key=child:<id>|person:<id>`, `/life/person-add`, `/life/person-follow-up`. |
| Commands / projections | `openPersonContext`, `editPersonContext`, archive/restore, `addExternalPerson` (never merges by name), `renamePerson`/`archiveExternalPerson` (refused for the co-parent), `addFollowUp` (one private Task in Relationships + one link, idempotent by draft key); `peopleRows`, `buildPeopleHome` (Needs Follow-up cap), `peopleLifeTile`. |
| Tables / migration / RLS | person_contexts, person_task_links (owner-private; `guard_follow_up_task`; links immutable) — `20260922200000_f13_people_os.sql`. |
| Sync kinds | `personContext`, `personTaskLink` (manifest); clash: a context two devices opened for one person is ONE context (HK13-D13). |
| Integration | A person never reaches Today/One Move; only a follow-up Task does. The current user is never a person; the co-parent is read-only; no contacts permission, no communication log. |
| Deferred seams | MP-13-01..12 and IC-13-01..14 (`HK_FEATURE_13_MISSING_PRIMITIVES.md`), incl. merge (MP-13-03), existence probes (MP-13-05), delete (MP-13-09). |

## 2. Cross-feature dependencies (imports between feature folders)

- today → daily-load, life, one-move, talk-it-out; one-move → today; life → today (cycles, P7).
- money → coparent (public exports only, read-only), today (`FIRST_GLANCE_ATTENTION`, notices), life (list helpers).
- work → life (`CategoryTaskList`), daily-load; kids → life; meals → today, life; rebuild → today (`relativeDay`); lifeAdmin → today (notices).
- coparent, home, systems, people, talk-it-out: no outbound feature imports.
- Domain → feature imports (layering, P7): `src/domain/dailyLoadDecisions.ts` → daily-load; `src/domain/discovery.ts` → talk-it-out.

## 3. Canonical owners (who may write what)

| Object | Canonical owner | Allowed consumers (read / reference by id) |
|---|---|---|
| Task | the Task system (`src/domain/tasks.ts`) | every feature; each creates Tasks only through `addTask`, with its category's scope |
| Event | Calendar (`src/domain/events.ts`) | Today, F05, F06, F07, F10 (interviews) |
| Goal | foundation (`goals`) | F11 links |
| System | F04 | F06 (read-only), F05 (routines by subject), F11 links |
| Child | F05 (`children`) | F07, F09, F12, F13 — by id, never a copied name |
| Co-parent logistics | F07 | Money (read), People (read-only identity), Kids (acts on child-linked rows — P5) |
| Money semantics | F09 | Today, One Move (honours F09's rules — HK13-D19), Calendar (date-only) |
| CareerOpportunity | F10 | Today (follow-up dates she recorded) |
| RebuildFocus | F11 | none outside F11 |
| LifeRecord | F12 | none outside F12 |
| PersonContext | F13 | none outside F13 (a static test guards the note) |
