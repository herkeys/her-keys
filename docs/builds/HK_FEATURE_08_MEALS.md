# HK-FEATURE-08-MEALS — Meals OS build ledger

Status: **IN PROGRESS** (ML0 and ML1 complete; no implementation code exists yet). This ledger is appended phase by phase; the 55 required sections are filled as each phase closes. Companion files: `HK_FEATURE_08_MISSING_PRIMITIVES.md`, `HK_FEATURE_08_SCENARIO_MAP.md` (generated), `tests/fixtures/meals/scenario-map.json` (source of truth).
Scope: LOCAL ONLY. No push, PR, merge, rebase, squash or amend. Explicit staging only. Nothing remote is touched.

---

## 1. Source / fork

| Item | Value |
| --- | --- |
| Feature | Feature 08 — Meals OS (`HK-FEATURE-08-MEALS`), Wave 2 clean-branch feature build |
| Branch | `feature/08-meals-os` |
| Worktree | `C:\Users\jsmit\Her-Keys-F08` (new, isolated) |
| Forked from | `repair/hk-integration-readiness-01` @ `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1` |
| Sibling ancestry | none — no sibling feature branch is an ancestor (F01–F07 are unmerged and not imported) |
| Build model | repaired common foundation → clean feature branch → build → verify → freeze/certify tip → integrate verified features later |

## 2. Baseline verification (ML0)

Nothing in the build prompt was trusted; each claim was checked mechanically on 2026-09-21.

| Claim | Expected | Actual | Result |
| --- | --- | --- | --- |
| Baseline branch HEAD | `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1` | `repair/hk-integration-readiness-01` = `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1` | MATCH |
| Recorded tested code state | `9dbe02a` is an ancestor of the report HEAD | `9dbe02aa9a581505381ebe4589e0b6c7c9e671fb`; `git merge-base --is-ancestor` = yes | MATCH |
| Code above the tested state | none | exactly one commit, `14bd58e` (IR10 ledger update); it changes only `docs/builds/HK_INTEGRATION_READINESS_01.md` (63 insertions, 54 deletions); zero non-`docs/` paths | MATCH (docs-only) |
| Baseline migration | blob `8bc38d66…` | blob `8bc38d66fcffbb9f…`; worktree raw hash `81909daa46a9a2d1…` is the documented `core.autocrlf` CRLF checkout artifact, not drift | MATCH |
| Shipping migration (worktree bytes) | `1e9169de…` | `1e9169de4cf21c46…` (blob `7582e5e6db96b973…`) | MATCH |
| IR01 additive migration | LF-pinned by `.gitattributes` | `73db663974354f0c…` (worktree = blob) | MATCH |
| Schema fingerprint | `43e7c8a4…` / 3617 gated facts | live shared local DB measured read-only: `43e7c8a4402a3387cb2e1add4170921e`, 3617 gated facts (3630 total incl. 13 non-gated `info.*` facts); `verify` against `supabase/tools/baselines/ir01-local-fingerprint.json` = MATCH | MATCH |
| Typecheck | clean | `tsc --noEmit` exit 0 in the F08 worktree | MATCH |
| App suite | 975 / 975 | 975 tests, 207 suites, 975 pass, 0 fail (serial, `--test-concurrency=1`, 64.5 s) | MATCH |
| Targeted IR01 suite | 163 / 163 | inside the 975 (`tests/hk-ir01`); not run separately at ML0 | RECORDED, recomputed at the final gate |
| Backend harness | 800 / 800 | not re-run at ML0 (a shared-container harness must not run beside other sessions); recomputed at the final gate | RECORDED, recomputed at the final gate |
| Mutation check | 35 / 35 | not re-run at ML0; recomputed at the final gate | RECORDED, recomputed at the final gate |

### Discrepancy register

| # | Discrepancy | Class | Evidence |
| --- | --- | --- | --- |
| D-ML0-1 | Report HEAD `14bd58e` sits one docs-only commit above the tested code state `9dbe02a` | **NON-MATERIAL** (this is the documented relationship: "final report HEAD 14bd58e, recorded tested code state underneath it 9dbe02a") | `git log 9dbe02a..14bd58e` = one commit; `git diff --name-only 9dbe02a 14bd58e` = `docs/builds/HK_INTEGRATION_READINESS_01.md` only |

No MATERIAL discrepancy. Fork proceeded from the exact prompt commit.

Environment facts recorded for later gates: Windows 11, Node via the repo's esbuild registration, commit memory 10.5 GB free at fork time (physical 0.45 GB free — starvation-prone, so suites run serially), shared Supabase container `supabase_db_Her_Keys` up and healthy, no other session running `supabase/tests/run.mjs` at fork time. `node_modules` is a PowerShell junction to the main checkout's install (typescript 6.0.3, esbuild 0.28.2, expo 57.0.24, react-native 0.86.3, zod 4.6.5 — all equal to this branch's pins).

---

## 3. Inherited implementation (ML0 inventory)

Classification: PRESERVE = used as is · REFINE = changed additively · REPLACE = superseded · ABSENT = does not exist · STUB = present in the schema/vocabulary but has no writer or reader.

| Inherited item | Class | Evidence and decision |
| --- | --- | --- |
| `MealPlanEntrySchema` / `state.meals` (`src/domain/state.ts:207`) — id, `date` (LocalDate), title, categoryId, prep/energy facets, provenance, scope | **REFINE** | This IS the MealPlanEntry equivalent: a household-scoped planning record for a logical date. It lacks exactly the two authorized product fields (slot, lifecycle). Extended additively; not replaced; no second model. |
| Sync kind `meal` → table `public.meal_plan_entries` (`syncTypes.ts:34,73,123,167,205`, `projection.ts:147`, `apply.ts:141`, `foundationSpecs.ts:704,728`) | **REFINE** | Already a registered canonical kind with create/update ops. Two column names are added by hand (the IR01 `duration_source` pattern). No new sync kind. |
| RLS, triggers, grants on `meal_plan_entries` (MIG:1613-1697, 4166-4172, 4381-4384) | **PRESERVE** + 2 column grants | `can_access_scoped_row` policies unchanged. There is no DELETE grant or policy, which fits archive-only removal. |
| Category `cat-meals`, `systemRole: 'meals'` (`categories.ts:18`) and `categoryWithRole` | **PRESERVE** | Name-independent Meals context; seeded locally and by server bootstrap/claim. |
| Life hub registration: `LIFE_ROUTES.meals = '/life/meals'` (`lifeStatus.ts:32`), `app/(app)/life/_layout.tsx:34`, `app/(app)/life/meals.tsx` | **PRESERVE** (route) / **REFINE** (thin route file gains navigation callbacks) | The direct Meals route already exists and is reachable from the Life hub. No new route, no new tab, no routeAccess change. |
| `MealsOverview.tsx` ("Nothing planned." plus a `StatusList` of `upcomingMeals`) | **REPLACE** | Read-only, no lifecycle, no actions, ambiguous labels. |
| `useHousehold().upcomingMeals` (`store/useHousehold.ts:25`) | **REFINE** | Must exclude archived entries; its `dayLabel` is ambiguous past 7 days ("Thursday" for a date 12 days out). |
| `lifeStatus.describeMeals` (`lifeStatus.ts:113`) — "Planned through X" / "Nothing planned" | **REFINE** | "Planned through" implies contiguous coverage the data cannot support. Reworded. |
| Demo seed meals (`demoHousehold.ts:75-127`) | **PRESERVE** (+ defaulted new fields) | Demo never syncs. |
| Domain actions for meals (add / edit / move / archive) | **ABSENT** | Meals come only from the demo seed and cloud pull today. |
| A Meals task list | **ABSENT** | `TASK_LIST_ROLES = [kids, home, money, work]` (`taskLists.ts:16`) omits `meals`; Meals-category tasks fall into the Life hub's "Other open tasks". See §17 for the decision. |
| `openTasksInCategory`, `describeOpenTask`, `openTaskLabel` | **PRESERVE** (reused) | Role-agnostic canonical task lister and row wording. |
| `RECURRENCE_SUBJECT_KINDS` includes `meal` (`foundation/structure.ts:103`) | **STUB** | No writer, no lister, no caller anywhere. Its only exception path is `skipOccurrence`, which records a skipped meal. F08 never uses it. |
| Observation outcomes for `meal` = `['completed','skipped']` (`foundation/observation.ts:53`) | **STUB** | Zero writers. F08 records nothing (see §31). |
| Responsibility `about` may be a `meal` (`domain/responsibility.ts:105`) | **STUB** | No UI anywhere. F08 does not attach responsibility to a meal decision. |
| Dietary / allergy / nutrition / recipe / URL semantics | **ABSENT** | Zero grep hits in `src`, `app`, migrations. |

---

## 4. Feature WHY

Her Keys exists to reduce how much life a woman must keep in her head. Meals are not primarily an information problem; they are a repeated decision plus operational follow-through. Feature 08 holds what she has **decided**, leaves what she has not decided **blank without comment**, makes a decided meal **reusable** (Plan This Again), and keeps the **work** that follows (groceries, prep) as ordinary canonical tasks.

Governing test: *does this choice help Her Keys carry more of the household's meal decision burden without claiming food, inventory, nutrition, preparation or execution facts it does not actually know?* Tie-breakers, in order: preserve truth, reduce mental load, preserve user agency, preserve context/history, make the next moment easier, build for learning, keep one coherent product, do not create work to manage the tool.

## 5. Non-negotiables and reconciliation with the resume brief

The twelve invariants of the build contract stand unchanged (one pre-approved semantic; planned ≠ executed; empty ≠ failure; logical date not timestamp; planned meal ≠ Calendar state; grocery/prep = canonical Task work; grocery completion ≠ pantry proof; prep completion ≠ served; no allergy record ≠ safe; no diet/body scoring; build, verify, integrate later).

Where the resume brief and the build contract could be read differently, this ledger follows the build contract (the higher authority) and records the reconciliation:

| Resume-brief wording | Reconciliation |
| --- | --- |
| "Today/Life integration at the appropriate level" | **Life:** the hub row and route already exist at the baseline; F08 refines that row's copy and its lifecycle filter (a truth defect otherwise: removed meals would still read as planned). **Today:** F08 writes nothing into Today. Meal decisions are planning records; `projectDay` does not read meals (grep-verified) and a test pins that invariance. Meal tasks with a *confirmed* due date reach Today through the existing task projection with no Meals code. Explicit Today projection stays `HK-INT-MEALS-TODAY-01`. |
| "How Meals observes Calendar/Capacity without reimplementing it" | Meals does **not** read Calendar or capacity in V1 and makes no suggestions, so no capacity, "easy" or "realistic" claim exists to be wrong. A test pins that adding, moving or archiving meals leaves the Daily Load output identical. |
| "Whether Meals needs a new TASK_LIST_ROLE" | Decided in §17: **no**. |
| "Which meals are realistic given capacity" / "what Her Keys can remember" | Reuse is delivered by Plan This Again. Capacity-aware suggestion is a future, separately reviewed capability (suggestion ≠ decision). |

---

## 6. Foundation trace (ML1)

| Topic | Actual source | Finding |
| --- | --- | --- |
| Meals context / system role | `categories.ts:14-23`, `schemaPrimitives.ts:29` (`SYSTEM_ROLES` has `meals`), `categoryWithRole` (`categories.ts:49`) | Stable, keyed on `systemRole`, ignores rename/archive. Not schema-guaranteed to exist: `validateAppState` never requires it, and a cloud client may update `system_role`/`status`. `categoryIdForRole` returns `string \| null`. |
| Category lifecycle | `categories.ts:60-109` | add / rename / reorder / archive / restore; no delete; only `app/dev-tools.tsx` calls them, so real users cannot change it in the shipped UI. |
| Task, context, due date | `tasks.ts:16-35` (`AddTaskInput`), `taskLists.ts`, `projectDay.ts:58-78` | `dueDate <= day` or a `day`/`timed` plan puts an open task into Today, the Calendar timeline and capacity. A future `dueDate` is only "upcoming". |
| Due-date provenance | grep `dueSource`, `dateSource`, `dueProvenance` = 0 hits | **None exists.** |
| Responsibility | `foundation/responsibility.ts:52`, `domain/responsibility.ts` | Seven states, **no `covered` state**, no UI, nothing delivers a message. `attention.ts:60-62` and `oneMove.ts:118` wrongly treat acknowledged/accepted as handled. |
| Duration and provenance | `foundation/duration.ts:48`, `tasks.ts:46` | HA-010 `durationSource` user \| default \| inferred \| null. `addTask` with no number records `default` (15 min). |
| Recurrence | `foundation/structure.ts:90-140`, `domain/structure.ts:213-354` | Rules stored, next occurrence derived; **no caller, no lister, no materialization**; rules are `scope: 'personal'`. |
| Systems | `state.ts:191`, `initialState.ts:19` | No production create path; a real household has zero systems. |
| Household timezone / logical day | `logicalDay.ts`, `appStore.ts:173`, `initialState.ts:14` | `today = logicalDateAt(now, state.user.timezone)`. The timezone is stored once at creation and never updated (travel deferred, `logicalDay.ts:9`); a device timezone change cannot move `today`. `householdLogicalToday` does not exist. |
| Date-only representation | `schemaPrimitives.ts:19`, cloud `meal_date date` | `LocalDate` `YYYY-MM-DD`; no date-only fact is stored as a UTC-midnight timestamp. |
| Provenance | `foundation/provenance.ts:74-93` | `{producer, artifactId, confidence}`; `artifactId` must name a SourceArtifact, so it cannot reference a prior meal. |
| Privacy scope | `schemaPrimitives.ts:32` | five scopes; a `child` meal needs `subject_member_id`, which the local schema lacks, so `child` cannot be produced for a meal. |
| Concurrency | migration `set_row_updated_at`; `syncTypes.ts:249-275`; `pushEngine.ts:156-177` | server `revision` CAS; a stale write returns zero rows and becomes unapplied `cas-conflict` evidence. `origin_updated_at` is informational. No last-write-wins. |
| Local persistence | `envelope.ts:20` | schemaVersion 4; additive `.default()` fields need no bump (IR2 precedent). |
| Sync composition | `composeAccountApp`, `changeBridge.ts`, `syncRuntime.ts` | intent and state land in ONE envelope write; row read at push time; restart re-tops-up. |
| Sync registration | `syncTypes.ts` | `meal` already registered. |
| RLS | MIG:1688-1697, `319-334` | `can_access_scoped_row`; household and child rows visible to every member; personal, professional, coparent-shared owner-only. No DELETE grant. |
| Deletion / tombstone | `changeBridge.ts:53`, `apply.ts:250` | Only `discovery` has a tombstone; every other kind is retired by a `status` change. |
| Demo namespace | `dataMode.ts`, `changeObserver.ts:38` | demo never syncs; mode mismatch gives a fresh state and disables persistence. |
| Recovery / quarantine | `appStore.ts:272-342`, `appStateRepository.ts:75-77` | Status `unhydrated \| hydrating \| ready \| recovery`; in recovery the state is a fresh EMPTY household. Production quarantine is off. |
| Observation | `foundation/observation.ts:53` | Meal outcomes are `completed`/`skipped` only. |
| Existing meal types | `state.ts:207`, `commitment.ts:76` | `mealFacetFields` (`prepMinutes`, `energyDemand`) exist; nothing reads them. |

---

## 7. Meal representation decision (contract 1)

**Decision: REUSE and REFINE the existing `MealPlanEntry`. Introduce no second Meals durable model.**

Why it is not a new model: the existing record already means "this household plans this meal for this logical date". The two pre-approved product fields it lacks (meal slot, active/archive lifecycle) are added to that same record. A new parallel MealPlanEntry would duplicate an existing canonical kind, table, sync registration and RLS posture.

Why existing primitives cannot supply the two fields (evidence, not assumption):

- **Removal that propagates.** No synced table has a DELETE grant; `discovery` is the only tombstone; `ALLOWED_OPS.meal` is create/update; the observation vocabulary for a meal is `completed`/`skipped`, which would assert execution. A `status` update is the only removal transport the architecture supports for a content kind.
- **Slot.** No facet, ref or relation expresses it, and parsing it out of the title is forbidden.

**Schema change is therefore REQUIRED**, is additive, and is the only backend change (§31).

## 8. Closed MealPlanEntry field contract (contract 2)

| Field (local ↔ cloud) | Type | Default | Source of the field |
| --- | --- | --- | --- |
| `id` ↔ `local_id` (server `id` is server-owned) | stable string id, `meal-<ms36>-<counter36><rand4>` | — | authorized #1 (existing) |
| household ownership ↔ `household_id` | server-set | — | authorized #2 (existing) |
| `date` ↔ `meal_date` | `LocalDate`, never a timestamp | — | authorized #3 (existing) |
| **`slot` ↔ `meal_slot`** | `unspecified \| breakfast \| lunch \| dinner \| snack \| other` | `unspecified` | authorized #4 (**NEW**) |
| `title` ↔ `title` | trimmed, single-line, ≤120 (input contract); storage tolerance stays 200 | — | authorized #5 (existing) |
| `provenance` ↔ `producer`, `source_artifact_id`, `confidence` | canonical provenance | `user-action` on create | authorized #6 (existing) |
| `scope` ↔ `scope` | canonical scope | `household` on create | authorized #7 (existing) |
| **`status` ↔ `status`** | `active \| archived` | `active` | authorized #8 (**NEW**) |
| concurrency ↔ `revision` (+ client `baseRevision`) | common CAS | server-owned | authorized #9 (existing) |
| infrastructure timestamps ↔ `created_at`, `updated_at`, `origin_*` | server / common | server-owned | authorized #10 (existing) |

Pre-existing fields of the reused record that F08 adds **no** meaning to: `categoryId` ↔ `category_id` (the Meals context; required by the schema and a foreign key) and the `prepMinutes` / `energyDemand` facets (never set, never read, so no "easy" or "prep time" claim can exist). No notes field, no ingredient field, no recurrence field, no link field.

The two new fields are **not** added to `EXISTING_FACETS` or `mealFacetFields` (that would make `gen-foundation-sql.mjs --check` demand an edit to the shipped migration and would change `commitmentFacetsOf`); they are hand-listed, exactly as IR01 did for `duration_source`.

## 9. Provenance (contract 7)

- Manual create and Plan This Again: `provenanceFor(state.origin, userProvenance())` (a demo household is stamped `demo-seed`).
- `artifactId` must name a SourceArtifact, so it **cannot** reference the prior entry. Plan This Again therefore records no lineage. That is documented as debt, not faked.
- Edits, moves and archive never restamp provenance (the `pickFields` convention).
- Future Talk It Out / AI / import producers already exist in the vocabulary; F08 writes only `user-action`, and any future suggestion must remain a separate proposal until she accepts it (suggestion ≠ decision).

## 10. Scope (contract 8)

Default and only F08-created scope: `household`. F08 exposes no scope control. `child` exists in the enum and the cloud but a local meal has no subject field, so it cannot be produced; F08 adds no child-specific behavior (capability recorded, not exercised). Rows of other scopes that are visible to her are shown and can be edited or archived like any other entry.

## 11. Logical-date contract (contract 3)

- Representation: `LocalDate` `YYYY-MM-DD` (existing `LocalDateSchema`), cloud column `date`. Never a timestamp; nothing in F08 converts it through `Date`, UTC or the device timezone.
- "Today" is `logicalDateAt(now, state.user.timezone)`, the household timezone stored at creation, exposed as `useHouseholdState().today`. It follows the household timezone, **not** the device's, so a device timezone change cannot move Tuesday. Household travel (changing `user.timezone`) is deferred by the foundation; when it lands, stored entries stay on their calendar date and only "today" moves.
- Date arithmetic uses `addDays`/`weekdayOf` (UTC arithmetic on the calendar date, DST-immune).
- No new general datetime convention is created.
- Evidence to be produced: persistence round trip; projection→apply round trip; sync push payload equals the stored string; UTC-midnight boundary (23:30 in a zone behind UTC); spring-forward and fall-back days; device timezone change; and the mutation that shifts Tuesday to Monday by an explicit-zone conversion, which must fail the suite.

## 12. Meal-slot contract (contract 12 of the build contract)

Closed enum `MEAL_SLOTS = ['unspecified','breakfast','lunch','dinner','snack','other']`, default `unspecified`. Nothing defaults to `dinner`. Display order within a day: breakfast, lunch, dinner, snack, other, unspecified (unspecified sorts last, claiming no time of day). CHECK constraint in the cloud enforces the same set. `unspecified` is an explicit "not stated" value, not a plausible guess, so it does not violate the "null means not known, never a plausible default" doctrine (`commitment.ts:22`).

## 13. Title contract

Required for an active entry; user-entered; trimmed; single-line (line-break characters `\r \n U+0085 U+2028 U+2029` collapse to one space before trimming); Unicode permitted; **maximum 120 characters counted as JS string length (UTF-16 units)**, the unit the schema and cloud already use, so 120 always fits the 200 storage tolerance even for astral characters. No slug, no ingredient inference, no notes field. Legacy rows up to 200 characters stay valid (a hostile or older-client row must never fail whole-state validation).

## 14. Lifecycle and removal transport (contract 5)

- `active → archived` only. "Remove" in the UI means archive: a removal from active planning, **not** eaten, skipped or completed, and no observation is written.
- No hard delete as product behavior; no restore in V1 (Plan This Again is the recovery path and creates a new entry).
- Removal transport: archive is an ordinary `UPDATE` of `status` (column grant) that the generic `log_row_change` trigger records as an upsert pointer; the other device pulls the row and its projections drop it. No feature-specific deletion queue, no tombstone. Required behavior: device A archives → sync → device B's active projection no longer shows it.
- Archived rows remain in state so typed references still resolve (removed ≠ deleted) and so planning history stays truthful.
- Capacity: `state.meals` cap raised from 1000 to **5000** (parity with tasks/events) because archive-only retention would otherwise reach 1000 and make the whole state stop validating; `addMeal` refuses with `plan-full` at the cap. Retention/pruning is documented debt (§ missing primitives).

## 15. Concurrency contract (contract 4)

Reuse the common primitive: server `revision` CAS with the client's `baseRevision` (fixed at first enqueue and kept through coalescing). A stale cross-device write returns zero rows and becomes unapplied `cas-conflict` evidence, never merged and never a silent overwrite; the existing pull path applies the newer cloud row. Whole-row granularity: archive on one device collides with a rename on another (documented). F08 adds **no** Meals conflict engine, no timestamp last-write-wins, and no per-record conflict UI (existing `SyncNotice`: "N changes need your attention").

On-device stale-editor guard: an editor opens against a snapshot of the entry's editable fields and `status`; `updateMeal`/`archiveMeal` take that snapshot as `expected` and refuse with `stale` if the current row differs, so a change that arrived by pull while the sheet was open is never silently overwritten.

## 16. Sync registration contract (contract 6)

No new sync kind. The existing kind `meal` gains two column names: `UPDATABLE_COLUMNS.meal` (`syncTypes.ts:167`), `projection.ts:147-161` (send `meal_slot`, `status`), `apply.ts:141-153` (read them; an absent `status` reads `active`, an absent slot reads `unspecified`, key order kept identical to the schema for the `JSON.stringify` two-device comparison). `ALLOWED_OPS.meal` stays `['create','update']` (archive is an update). The claim does **not** carry meals (`claim.ts:208-211`), so claim v3 is untouched; a household's local meals reach the cloud as ordinary creates through the seed top-up carrying slot and status. No `MealsSyncService`, no Meals queue, no retry engine, no direct Supabase call from Meals.

---

## 17. Meals-context contract (contract 9) — TASK_LIST_ROLES decision

Stable association: tasks whose `categoryId` is the category with `systemRole: 'meals'` (`categoryWithRole`); never by display name, never by title parsing, never by hidden local metadata.

Options considered (as the resume brief required):

| Option | Verdict |
| --- | --- |
| A. Add `meals` to `TASK_LIST_ROLES` (first-class shared role list) | **Deferred to integration.** A cross-cutting semantic change: it moves every existing household's Meals-category tasks out of the Life hub's "Other open tasks", forces an edit to `tests/build3Audit.capture.test.mjs:125` (exact equality), and is a one-line array edit that will conflict with sibling branches. Recorded as `HK-INT-MEALS-TASKLIST-ROLE-01`. |
| **B. Ordinary Tasks + a Meals-specific projection over the existing `openTasksInCategory`** | **CHOSEN.** No shared-role edit; reversible; a task is never hidden (it stays in Life "Other open tasks" as well as in Meals, which is one canonical task with two read-only views). |
| C. Stay outside shared classification (Meals lists no tasks) | Rejected: fails the minimum-shippable grocery/prep behavior when a stable context exists. |
| D. Another existing canonical mechanism | None exists (no tags, lists or links for tasks). |

Degradation: if `categoryIdForRole('meals')` is `null` (a validation gap the schema permits), Meals shows an honest unavailable notice, creates no meal or task, and never lists "all tasks". An archived Meals category still resolves and works. Test-only case; not reachable in the shipped UI.

## 18. Grocery / prep task contract

Both are ordinary canonical `Task` rows created through `addTask` in the Meals category with `scope: 'household'`, `plan: unplanned`, `commitment: flexible` (the canonical default), no subject, no value, no notes, provenance `user-action`. F08 does **not** distinguish "grocery" from "prep" in stored state (that would be a second semantic); the UI offers one flow, "Add a meal task", with a placeholder that names both. A task means only that she chose to track the work: it proves no pantry state, no quantity, no purchase, no preparation.

Truthful creation feedback: "Added to your meal tasks." The task then appears in the Meals hub. It is not linked to a specific meal (§ missing primitives, `HK-MISSING-MEALS-LINK-01`), so no copy ever says or implies "for Tacos".

## 19. Due-date default / confirmation contract

No due-date provenance exists in the foundation. Therefore, in a "for this meal" flow, the meal's date is only a **proposal**: an unchecked toggle labelled "Due Tue 23 Sep (the day of this meal)". `addMealTask` persists `dueDate` **only** when the input carries `due: { date, confirmed: true }`, set by her explicit toggle; otherwise `dueDate` is `null`. A confirmed date becomes a user-provided date because she chose it. `plan` is never set (no Calendar or capacity claim beyond canonical task semantics). Mutation 15 breaks exactly this rule. Read-side, the projection reports `dueDateSource: 'not-recorded'` for any dated task because the foundation cannot say who chose a date.

## 20. Duration provenance

The task flow follows HA-010: an untouched duration stays `default` (15 min, assumed), a typed value is `user`, and the flow never reports a defaulted or unknown duration as stated. The Meals hub shows **no** duration at all (nothing to overstate).

## 21. Responsibility capability map (contract 12)

Read-only, task-level, canonical: `liveResponsibilityFor(state, {kind:'task', id})`. Wording never says covered, handled, taken care of or assigned-and-done:

| Canonical state | Meals wording |
| --- | --- |
| none | nothing shown |
| `owned` (holder self) | "Yours" |
| `requested` | "Asked {name}, no answer yet" (past `ackDueAt`: "Asked {name}, still waiting") |
| `acknowledged` | "{name} has seen this" |
| `accepted` | "{name} said yes" plus " · still needs you" when `stillNeedsMe` |
| declined / completed / returned | not live, nothing shown |

The projection reports `coverage: 'not-established'` for every task regardless of state. F08 builds **no** delegate/ask action: nothing delivers a message to the holder, so an "Ask Sam" control would imply a notification that does not exist (assigned ≠ notified). The meal decision itself has no owner.

## 22. Systems / recurrence capability map

MealPlanEntry has no recurrence; repeated meal decisions stay separate entries and nothing implies they repeat, even with identical titles. A "Recurring meal work" section is a **read-only** projection of canonical recurrence on Meals-category **tasks** (active rules, cadence text derived from the rule, next occurrence derived by `nextOccurrence`) plus Meals-category **Systems** (name only; no "running" or "working" claim). Rules about a `meal` are ignored on purpose. The section is hidden when empty, which is the state at this baseline because nothing writes recurrence or Systems yet (F04 owns creation). F08 creates no recurrence and no System.

## 23. Plan This Again

From any visible entry (or the bounded "Plan again" list), one action opens the create sheet prefilled with that entry's title and slot; the date defaults to logical today as a **visible** value she confirms or changes; saving creates a NEW entry with a new stable id. The source entry is not mutated, no recurrence is inferred, no favorite/library entity exists, and no lineage is stored (provenance cannot reference it).

---

## 24. Meals projection

`buildMealsView(state, logicalToday)` in `src/features/meals/mealsView.ts` — pure, deterministic, no mutation, no reasoning in JSX. It returns: `mealsCategoryId`, `context` (`ok` | `no-meals-context`), `upNext` (today and tomorrow day groups), `nextDays` (days 2 to 14, only days that hold entries), `later` (at most 5 entries beyond the horizon plus a count of the rest), `planAgain` (at most 5 distinct recent title+slot pairs from active entries in the 14 days before today), `mealTasks`, `recurringWork`, and `isEmpty`. Every entry view carries the structural evidence facts: `mealPlanEntryId`, `logicalDate`, `mealSlot`, `title`, `scope`, `provenance`, `lifecycle`, `semantic: 'planning-record'`, `plannedState: 'planned'`, `executionState: 'not-tracked'`, `unknownFacts: ['ingredients','allergens','nutrition','pantry']`, `availableActions`. Task views carry `taskId`, `standing`, `dueDate`, `dueDateSource: 'not-recorded'`, `durationSource`, `responsibility`, `coverage: 'not-established'`. Ordering: `(date, slot rank, id)` with a plain code-unit id comparison (the existing `localeCompare` on ids is locale-dependent, so it is not device-independent). Ids embed creation time (`sequentialIds`), so this is creation order in practice; the determinism does not depend on that.

Screen gate (separate pure function, so the projection can never be mistaken for "loaded"): `mealsScreenState({ storeStatus, persistence, recovery, sync })` returns `loading` while the store is not `ready` or an account-bound device's `hydration` is not `ready`, `recovery` when the store started fresh, else `ready`. Empty copy renders only in `ready`.

## 25. Meals hub (UI/navigation contract)

One route, `life/meals` (existing). No new tab, no new route, no modal route; create and edit use the shared `Sheet` inside the screen. Sections, all by omission when empty (adaptive density): **Up next** (today and tomorrow) · **Next 14 days** (days that hold entries) · **Later** (at most 5) · **Meal tasks** · **Recurring meal work** · **Plan again**. Primary action: "Add a meal". Every control has an accessibility label, role and state; date and slot choices are `ChipToggle`s (existing shared control); sheets carry an explicit visible close button (the shared `Sheet` has none). Screen copy lives in one `mealCopy.ts` so the copy audit can inspect it mechanically. Visible defaults before save: date shown as chosen chip ("Today · Tue 23 Sep"), meal type shown as "Not set". No parallel component system; Paper and Ink tokens only; no expo-router import inside the rendered component (the thin route file passes navigation callbacks), so it can be rendered in tests.

## 26. Blank-day neutrality

Blank days are not rendered, counted, coloured or worded. No gap count, no percentage, no streak, no weekly score, no "unplanned" language. Blank Today or Tomorrow inside "Up next" reads "No meals planned." in muted text. The hub empty state reads "No meals planned yet." with one primary action. A test reads every string the screen can produce and rejects the prescriptive and shaming vocabulary.

## 27. Planned-versus-executed truth

`MealPlanEntry` is a **planning record**, typed as such in the projection (`semantic: 'planning-record'`, `executionState: 'not-tracked'`). A past date does not change it: no eaten, cooked, served, skipped or completed state exists or is inferred, and no observation is written. Removal is `archived`, never `skipped`. Any future intelligence receives the type explicitly as a planning record, not consumption history.

## 28. Dietary / allergy boundary

Capability fact: **no canonical dietary or allergy context exists** (zero hits). F08 renders nothing about allergens or safety, and infers nothing from a title. `unknownFacts` in the structural evidence names what is not known. If such context appears in a later feature it must be surfaced with attribution ("You noted: …") and never as safe or allergen-free.

## 29. Diet / body safety

No calories, weight, macros, body goals, dieting score, restriction, compensation, food morality, good/bad labels, ranking, scoring, healthier-meal suggestion, or AI meal recommendation. Enforced by the copy audit and the semantic-boundary scan.

## 30. Food-safety boundary

No spoilage, expiry, storage, temperature, contamination or edibility claim, and no "fresh", "safe to eat", "in stock", "available" or "bought" wording.

---

## 31. Backend and sync contract

**Schema change: REQUIRED and additive.** New migration `supabase/migrations/20260921160000_f08_meal_slot_and_status.sql` (LF-pinned by `.gitattributes`, structure copied from IR01):

```
BEGIN;
ALTER TABLE public.meal_plan_entries ADD COLUMN meal_slot text NOT NULL DEFAULT 'unspecified';
ALTER TABLE public.meal_plan_entries ADD COLUMN status    text NOT NULL DEFAULT 'active';
ALTER TABLE ... ADD CONSTRAINT meal_plan_entries_meal_slot_check CHECK (meal_slot = ANY (ARRAY['unspecified','breakfast','lunch','dinner','snack','other']));
ALTER TABLE ... ADD CONSTRAINT meal_plan_entries_status_check    CHECK (status    = ANY (ARRAY['active','archived']));
GRANT INSERT (meal_slot, status) ON public.meal_plan_entries TO authenticated;
GRANT UPDATE (meal_slot, status) ON public.meal_plan_entries TO authenticated;
SELECT private.assert_app_schema_secured();
COMMIT;
```

`NOT NULL DEFAULT` is the truthful choice here: every existing row is a live plan with no stated slot, and existing raw INSERTs in `supabase/tests/30, 56` and `helpers/05` keep working. No function is replaced (`sync_push`/`sync_pull`/`log_row_change` are generic; the claim never touches meals). No policy, DELETE grant, index or trigger change. Rollback assumption (documented, not automated): dropping the two columns undoes the schema; archive states written meanwhile cannot be reconstructed.

**Fingerprint.** Baseline `43e7c8a4402a3387cb2e1add4170921e` / 3617. Expected movement, exactly: `columns` 714→716, `constraints` 679→681, `privileges.columns` 721→725, gating 3617→**3625**; unchanged: functions 27, policies 85, triggers 104, indexes 284, `privileges.effective` 309, `privileges.relations` 587. New baseline `supabase/tools/baselines/f08-local-fingerprint.json`. Any other movement is drift.

**Release order (owner-gated, same posture as IR01).** The migration must reach an environment before a client that projects the new columns does, otherwise pushes fail with 42703 and stall as validation-failure evidence; an older client would also show archived meals as live and cannot un-archive them, and an older binary rejects a newer-written `slot` (production quarantine is off). Nothing here is applied to any real environment.

**Shared local database hazard.** `supabase/tests/run.mjs` auto-applies migrations to the shared default `postgres` database and uses fixed `b4_env_*` names, and sibling sessions verify that database against the IR01 baseline. F08 therefore never applies its migration to the shared default database. Every F08 database check uses uniquely named scratch databases in the shared container (before/after fingerprint, fresh install, populated upgrade, RLS attacks) and, for the real PostgREST journey, a private PostgREST instance pointed at a scratch database; if that proves infeasible, the SQL-level real-PostgreSQL evidence stands and the PostgREST gap is recorded as a limitation.

**Observation.** No approved common hook can record create/move/archive of a meal without asserting `completed` or `skipped`; extending the vocabulary needs a Zod and CHECK migration and is a new semantic. F08 records nothing, exactly as tasks and events do for create and edit. Missing primitive: common behavior/observation hook.

## 32. RLS and security contract

Unchanged policies (`can_access_scoped_row`). Real-PostgreSQL attacks (SQL level, real roles and JWT claims) to add as `supabase/tests/77-*.sql`: vocabulary CHECKs asserted by reason; column grants (new columns writable by the owner, server-owned columns still refused with 42501); archive as UPDATE with a revision bump; hard DELETE denied for `authenticated` (the existing gap: no meal-specific delete test); anon denied; unrelated account (USER C) cannot read, insert, patch or archive; same-household second account (USER B, constructed actor) can read and archive household-scope meals but sees no personal/professional/coparent-shared meals, and scope flips across the owner boundary are refused by `owner_scope_check`. "Same-household second account" is **APPLICABLE as a constructed-actor RLS attack and NOT-APPLICABLE as a product journey** (no product path creates a second adult).

## 33. Offline, restart, sync behavior

Account-backed: every `meal` row (including `slot`, `status`) and every meal task (existing kinds). Local-only: transient UI state (open sheet, drafts) only; nothing else. Restart preserves state and queue in one envelope; offline create/edit/move/archive queue as intents and replay on reconnect (top-up covers rows never queued). Second device: a bound-new device hydrates fully (pull is complete for its range; chunked row requests of 100) and must not show "No meals planned yet" before hydration is `ready`. Account switch: another account's household gives `boundOther` and only the conflict route opens. Demo data never syncs. A permanently refused row is not re-owed (IR7b). Privacy: the only meal text that crosses the account boundary is `title` in `meal_plan_entries` (like task titles); there is no notes field, and a test asserts the push payload keys.

---

## 34. Scenario assertion map

Source of truth: `tests/fixtures/meals/scenario-map.json` (machine-readable; a generated table is `docs/builds/HK_FEATURE_08_SCENARIO_MAP.md`). It was written **before** any UI or domain code. Every Tier 1, 2 and 3 scenario of the build contract, the additional adversarial cases of the resume brief, and 20 mutants map to: deterministic setup, named assertions, the structural evidence fields asserted, the test file, and (later) a result. Tests carry the scenario id in their title (`[K] …`); an integrity test at the end of the build fails if any scenario has no test or if a result disagrees with the run. Prose is not coverage: a scenario counts only when a named assertion in a named test passes.

---

## ML1 supplement A — Architecture contract

| Layer | Owner | Files |
| --- | --- | --- |
| Durable type, defaults, cap | common domain (MealPlanEntry implementation) | `src/domain/state.ts` (`MEAL_SLOTS`, `MEAL_STATUSES`, `MealPlanEntrySchema`, cap 5000) |
| Canonical mutation | common domain, beside `tasks.ts` / `events.ts` | `src/domain/meals.ts`: `addMeal`, `updateMeal`, `archiveMeal`, `mealDraftFrom`, `addMealTask`, `normalizeMealTitle`, refusal codes. Pure `(state, ctx, …) → { state, refusal }`; a refusal returns the same state reference; a changed row is a new object and unchanged rows keep their reference (the change bridge diffs by reference) |
| Sync | common infra, registration only | `syncTypes.ts`, `projection.ts`, `apply.ts` (two column names) |
| Backend | common infra | one additive migration, `.gitattributes` pin, run.mjs and SQL/JS tests, fingerprint baseline |
| Feature | `src/features/meals/` | `mealsView.ts` (projection), `mealsGate.ts` (loading/recovery/ready), `mealDates.ts` (labels, day choices), `mealCopy.ts` (every user-facing string), `recurringMealWork.ts`, `MealsOverview.tsx` (composition, no expo-router import), `MealSheet.tsx`, `MealTaskSheet.tsx`, small row components |
| Route | thin | `app/(app)/life/meals.tsx` passes `onOpenTask` navigation into the component |
| Tests | feature | `tests/meals/*`, `tests/meals/support/*`, `tests/fixtures/meals/*`, `supabase/tests/77-*`, `scripts-dev/meals-*` |

Reads use `useHouseholdState()`; writes use `useAppStore().commit(...)` (durable before shown). No direct Supabase call, no feature queue, no alternate responsibility or recurrence model, no new person/member identity.

Planned shared-file changes, each mapped to a permitted reason (MealPlanEntry / canonical task integration / tests / approved repair):

| File | Reason |
| --- | --- |
| `src/domain/state.ts` | MealPlanEntry (two fields, cap) |
| `src/domain/sync/syncTypes.ts`, `projection.ts`, `apply.ts` | MealPlanEntry (registration of two columns of an existing kind) |
| `src/data/seed/demoHousehold.ts` | MealPlanEntry (typed literal must supply the new fields) |
| `src/store/useHousehold.ts` | MealPlanEntry lifecycle consumer (archived excluded; truthful day label) |
| `src/features/life/lifeStatus.ts` | MealPlanEntry truth consumer (Meals row copy) |
| `supabase/migrations/20260921160000_f08_meal_slot_and_status.sql` (new), `.gitattributes` | MealPlanEntry |
| `supabase/tests/run.mjs`, `supabase/tests/77-*.sql`, journeys, `supabase/tools/baselines/f08-local-fingerprint.json`, READMEs | MealPlanEntry / test infrastructure |
| `tests/support/legacyShapes.mjs`, `tests/support/richHousehold.mjs`, `tests/foundationAcceptance.test.mjs`, `tests/foundationAcceptance3.test.mjs` | test infrastructure (typed literals and the v3→v4 shape helper) |

Explicitly **not** touched: `taskLists.ts` (`TASK_LIST_ROLES`), `tests/build3Audit.capture.test.mjs`, `routeAccess.ts`, `app/_layout.tsx`, `app/(app)/life/_layout.tsx`, `claim.ts`, the shipped migrations, the v3 fixtures (SHA-pinned), `app.json`.

## ML1 supplement B — Truth and negative-definition contract

| The product never treats… | …as… | Enforced by |
| --- | --- | --- |
| a planned meal | prepared, cooked, served, eaten, a Calendar event, scheduled time, or a capacity claim | planning-record type; no execution fields; AO/CE invariance; copy audit |
| a past plan | consumption history | Q; `executionState: 'not-tracked'` |
| removal | skipped, eaten, completed | archive only; zero observations (P, M18) |
| a blank day/slot/week | a gap, failure, or attention item | R, S, A; neutral copy; structural key scan |
| a grocery task (created or completed) | pantry state, quantity, purchase | AD; no inventory field; copy audit |
| prep completion | meal prepared or served | AE |
| a prefilled due date | a user-provided date | AB, M15 |
| an untouched default duration | user-authored | AA; HA-010 |
| an assigned/asked/acknowledged/accepted task | covered or handled | AC; `coverage: 'not-established'` |
| a meal title | an ingredient list or allergen statement | AM |
| no allergy record | safe | AM, M6 |
| a title used on several dates | a recurring meal | AP |
| absence of hydration | an empty plan | B, BJ, M13 |
| a recovered (fresh) state | an empty plan | BK |
| household tz vs device tz | interchangeable | AI |

## ML1 supplement C — Minimum shippable definition (finalized)

Feature 08 passes only if a woman can: open Meals by its direct route; see near-term decisions grouped by logical date; add a decision with visible defaults (date today, meal type "Not set"); edit its title; move it to another date; change its slot or leave it unspecified; have several entries in one date and slot; remove an entry without it meaning eaten or skipped, with that removal reaching a second device; reuse a decision with Plan This Again; leave days blank without guilt; add a canonical meal task (explicit or defaulted duration, optional confirmed due date) and be told truthfully where it went; see her Meals-category tasks with factual due wording and read-only responsibility; see existing recurring meal work read-only; restart, go offline and sync accounts without loss, duplicate, date shift or stale overwrite; and encounter no pantry, nutrition, allergy, food-safety, diet or scheduling claim. A static idea list, or a filtered task list without decisions, does not pass.

## ML1 supplement D — Non-goals

Recipes, ingredients, pantry or inventory, nutrition, diet, calories, allergy or safety claims, grocery ordering or delivery, budgets, AI suggestion or recommendation, Talk It Out capture, MealPlanEntry→Task links, meal recurrence, capacity or Calendar reading, Today projection of meals, scheduled times, notes, favorites or a meal library, hard delete or restore, per-record conflict UI, delegate/ask actions, new routes or tabs, Life hub redesign, any sibling-feature integration.

## ML1 supplement E — Owner-decision list

**No genuinely required owner decision.** Every open question was resolvable from Her Keys doctrine or existing repaired semantics; they are recorded here so they are visible, not asked:

| # | Question | Resolution (doctrine rank) |
| --- | --- | --- |
| DD-1 | Extend the existing MealPlanEntry or add a second model? | Extend; the two fields are pre-approved and a duplicate would fork a canonical kind (truth, one coherent product). |
| DD-2 | New `TASK_LIST_ROLE` for Meals? | No; option B, integration candidate recorded (no cross-cutting change, task never hidden). |
| DD-3 | Restore an archived entry? | No (lifecycle is active→archived); Plan This Again recovers. |
| DD-4 | Title limit unit | 120 UTF-16 units (matches schema unit; always fits storage tolerance). |
| DD-5 | Cap with archive-only retention | Raise to 5000, refuse at the cap, retention is documented debt. |
| DD-6 | Persist grocery vs prep? | No (second semantic); one "meal task" flow. |
| DD-7 | Delegate action in Meals? | No; nothing notifies the holder, so it would imply delivery. Read-only display. |
| DD-8 | Create recurrence for meal work? | No (another Systems engine); read-only. |
| DD-9 | `createdAt`/`updatedAt` on meals? | Not needed (id order is deterministic); considered and deferred, no SQL needed if added later. |
| DD-10 | Edit surface | In-screen sheet on the existing route; a root modal would need four shared edits. |
| DD-11 | Shared local DB | Never modified by F08; scratch databases only. |
| DD-12 | Observation writes for meals | None (no truthful vocabulary). |
| DD-13 | Meals into Today | No (integration candidate). |

Pre-existing, already owner-gated (not a build question): approval to apply the additive migration to any real environment before the repaired client ships.

---

## Phase log

| Phase | Status | Notes |
| --- | --- | --- |
| ML0 baseline / inheritance | complete | §1–3 |
| ML1 domain / capability contracts | complete | §4–34 and supplements; scenario map and missing-primitives register written before any code |
| ML2 MealPlanEntry domain / durability | pending | |
| ML3 Meals hub | pending | |
| ML4 create / edit / move / archive / plan again | pending | |
| ML5 grocery / prep work | pending | |
| ML6 account / backend validation | pending | |
| ML7 adversarial hardening | pending | |
| ML8 completion | pending | |

Sections 35–55 (tier results, mutation evidence, semantic-boundary scan, defects, missing primitives, integration candidates, accessibility, performance, privacy, test accounting, schema/fingerprint, migration evidence, device evidence, shared-file changes, sibling-import result, owner checkpoints, considered/deferred, exit gates, final verdict) are completed at ML8. Missing primitives and integration candidates already exist in `docs/builds/HK_FEATURE_08_MISSING_PRIMITIVES.md`.
