# HK-FEATURE-08-MEALS — Meals OS build ledger

Status: **COMPLETE. `HK-FEATURE-08-MEALS = PASS WITH DOCUMENTED DEBT`** (section 55). All 55 required sections are filled. Companion files: `HK_FEATURE_08_MISSING_PRIMITIVES.md`, `HK_FEATURE_08_SCENARIO_MAP.md` (generated), `tests/fixtures/meals/scenario-map.json` (source of truth).
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

---

## 35. Tier 1 scenario results (A-AQ and the resume-brief additions)

Core truth, domain and durability scenarios. Every row is a titled test (`[ID] ...`) whose named assertions passed in the final full run; the integrity test (`tests/meals/scenarioMap.test.mjs`) fails if a scenario has no test.

Result: 46 scenarios; 45 PASS, 1 NOT-APPLICABLE. No scenario FAILED, was SKIPPED or is UNVERIFIED.

| ID | Scenario | Result | Evidence (test set) | Mutants |
| --- | --- | --- | --- | --- |
| A | No meal entries | PASS | `VIEW` `COPY` | M3 |
| B | Loading / hydrating state | PASS | `VIEW` `SCREEN` | M13 |
| C | One entry | PASS | `VIEW` | - |
| D | Several dates | PASS | `VIEW` | - |
| E | Several entries on one date | PASS | `VIEW` | M20 |
| F | Several entries on one date and slot | PASS | `VIEW` `ACT` | M9 M20 |
| G | UNSPECIFIED slot | PASS | `ACT` `VIEW` `SCREEN` | - |
| H | Other closed-enum slots | PASS | `ENTRY` `SYNC` `VIEW` | - |
| I | Create | PASS | `ACT` `ENTRY` `SYNC` | - |
| J | Edit title | PASS | `ACT` | - |
| K | Move date | PASS | `ACT` `DATE` | M8 |
| L | Change slot | PASS | `ACT` | - |
| M | Move into an occupied date and slot | PASS | `ACT` | M9 |
| N | Archive / remove | PASS | `ACT` `VIEW` `LIFE` | M18 |
| O | Archive propagates to a second device | PASS | `SYNC` `JRN` | M14 |
| P | Removed does not become skipped or eaten | PASS | `ACT` `COPY` | M18 |
| Q | A past planned entry does not become eaten | PASS | `VIEW` | M2 |
| R | A blank date stays neutral | PASS | `VIEW` `COPY` | M3 |
| S | No planning score or streak | PASS | `VIEW` `COPY` | - |
| T | Plan This Again creates a new stable entry | PASS | `ACT` | M19 |
| U | The original is unchanged after Plan This Again | PASS | `ACT` | M19 |
| V | Grocery task creation | PASS | `TASK` `COPY` | - |
| W | Prep task creation | PASS | `TASK` | - |
| X | Meals context present: task discoverable | PASS | `TASK` | - |
| Y | Meals context absent: truthful degradation | PASS | `TASK` `VIEW` `SCREEN` | - |
| Z | Unknown task duration | PASS | `TASK` `VIEW` | - |
| AA | Default duration remains default | PASS | `TASK` | M17 |
| AB | A due-date default is not laundered into a user fact | PASS | `TASK` | M15 |
| AC | An assigned task is not automatically covered | PASS | `TASK` `COPY` | M7 |
| AD | Grocery completion is not pantry inventory | PASS | `TASK` `COPY` | M4 |
| AE | Prep completion is not a meal served | PASS | `TASK` `VIEW` | M5 |
| AF | Restart preserves the MealPlanEntry | PASS | `ENTRY` `SYNC` | - |
| AG | Offline create then reconnect | PASS | `SYNC` | M11 |
| AH | A second client receives the logical date | PASS | `SYNC` `JRN` | M1 |
| AI | A device timezone change does not move the logical date | PASS | `DATE` | M1 |
| AJ | Household timezone follows the logical-date contract | PASS | `DATE` | M1 |
| AK | Account switch isolates households | PASS | `SYNC` | - |
| AL | An unrelated account is denied (backend introduced) | PASS | `SQL77` `JRN` | M10 |
| AM | No allergy record does not produce a safe claim | PASS | `VIEW` `COPY` | M6 |
| AN | A user-provided dietary fact stays attributed | NOT-APPLICABLE | `BOUND` | - |
| AO | A meal plan does not become Calendar scheduled time | PASS | `LIFE` `VIEW` | - |
| AP | The same title on several dates stays separate | PASS | `VIEW` `REC` `COPY` | - |
| AQ | A stale editor cannot silently overwrite | PASS | `ACT` `SYNC` | M12 |
| CE | Today never treats an empty meal slot as unfinished work (resume brief) | PASS | `LIFE` | M3 |
| CF | Account bind keeps Tuesday (resume brief) | PASS | `SYNC` | M1 |
| CG | Life hub row is truthful (resume brief) | PASS | `LIFE` `COPY` | - |

## 36. Tier 2 scenario results (AR-BV)

Adversarial, scale, sync, offline, concurrency and boundary scenarios.

Result: 31 scenarios; 31 PASS. No scenario FAILED, was SKIPPED or is UNVERIFIED.

| ID | Scenario | Result | Evidence (test set) | Mutants |
| --- | --- | --- | --- | --- |
| AR | Dense 60+ MealPlanEntries | PASS | `VIEW` | - |
| AS | 100+ Meals-context tasks | PASS | `VIEW` `TASK` | - |
| AT | UTC midnight | PASS | `DATE` | M1 |
| AU | Spring-forward | PASS | `DATE` | - |
| AV | Fall-back | PASS | `DATE` | - |
| AW | Travel timezone change | PASS | `DATE` | - |
| AX | Malformed MealPlanEntry | PASS | `SYNC` `ENTRY` | - |
| AY | Double save | PASS | `ACT` | - |
| AZ | Move while a second client edits | PASS | `SYNC` | M12 |
| BA | Archive while a second client edits | PASS | `SYNC` | M12 M14 |
| BB | Sync retry | PASS | `SYNC` | - |
| BC | Permanent server refusal | PASS | `SYNC` | - |
| BD | A large household above historical limits | PASS | `SYNC` `ACT` | - |
| BE | Demo and account isolation | PASS | `SYNC` | - |
| BF | Local-only state is excluded | PASS | `ACT` `SYNC` | - |
| BG | Stable same-slot ordering | PASS | `VIEW` `SYNC` | M20 |
| BH | Screen-reader logical date and slot | PASS | `SCREEN` | - |
| BI | Screen-reader unknown and default task state | PASS | `SCREEN` | - |
| BJ | Loading is not empty (rendered) | PASS | `SCREEN` | M13 |
| BK | Quarantined or recovered is not empty | PASS | `SCREEN` `VIEW` | M13 |
| BL | Life-hub integration is not required | PASS | `BOUND` | - |
| BM | No sibling imports | PASS | `BOUND` | - |
| BN | Copy-truth audit | PASS | `COPY` | - |
| BO | Secret and privacy scan | PASS | `BOUND` `SYNC` | - |
| BP | Fresh-install migration | PASS | `SQL77` | - |
| BQ | Populated upgrade | PASS | `SQL77` | - |
| BR | RLS owner behavior | PASS | `SQL77` | - |
| BS | Same-household RLS | PASS | `SQL77` | M10 |
| BT | Unrelated-account RLS | PASS | `SQL77` `JRN` | M10 |
| BU | A disconnected central sync composition is caught | PASS | `SYNC` | M11 |
| BV | Semantic-boundary scan | PASS | `BOUND` | M16 |

## 37. Tier 3 scenario results (BW-CD)

Capability probes for primitives the foundation may or may not have. A probe row is `PASS` when Meals behaves correctly with the capability, `SAFE-UNAVAILABLE` when the capability exists but no UI exposes it (Meals then sets nothing and claims nothing), and `NOT-APPLICABLE` when the foundation has no such capability (a test fails loudly if one appears, so the row is revisited).

Result: 8 scenarios; 1 PASS, 3 SAFE-UNAVAILABLE, 4 NOT-APPLICABLE. No scenario FAILED, was SKIPPED or is UNVERIFIED.

| ID | Scenario | Result | Evidence (test set) | Mutants |
| --- | --- | --- | --- | --- |
| BW | Existing Meals systemRole / context | PASS | `TASK` | - |
| BX | Existing amount / value task facet | SAFE-UNAVAILABLE | `TASK` `COPY` | - |
| BY | Existing dietary / allergy canonical context | NOT-APPLICABLE | `BOUND` | - |
| BZ | Existing meal-related System | SAFE-UNAVAILABLE | `REC` | - |
| CA | Existing recurring meal-prep task | SAFE-UNAVAILABLE | `REC` | - |
| CB | Existing generic MealPlanEntry to Task relationship | NOT-APPLICABLE | `BOUND` `TASK` | - |
| CC | Existing observation / behavior hook | NOT-APPLICABLE | `ACT` | M18 |
| CD | Existing external recipe reference | NOT-APPLICABLE | `BOUND` | - |

Test-set keys used in the tables above:

- `ENTRY` = `tests/meals/mealPlanEntry.test.mjs`
- `ACT` = `tests/meals/mealActions.test.mjs`
- `DATE` = `tests/meals/logicalDate.test.mjs`
- `VIEW` = `tests/meals/mealsView.test.mjs`
- `TASK` = `tests/meals/mealTasks.test.mjs`
- `REC` = `tests/meals/recurringWork.test.mjs`
- `SYNC` = `tests/meals/sync.test.mjs`
- `COPY` = `tests/meals/copyAudit.test.mjs`
- `BOUND` = `tests/meals/boundary.test.mjs`
- `LIFE` = `tests/meals/lifeIntegration.test.mjs`
- `SCREEN` = `tests/meals/screen.test.mjs`
- `SQL77` = `supabase/tests/77-meals-slot-status.sql`
- `JRN` = `supabase/tests/journey-composition.mjs`

## 38. Mutation evidence (test the tests)

`scripts-dev/meals-mutation-check.cjs` injects each defect below into the real source (the SQL mutant, M10, into a scratch database through the `HERKEYS_MUTANT_SQL` hook of the harness), runs only the tests the scenario map names for it, counts a mutant CAUGHT only when a test fails on a genuine assertion (a crash, a timeout or a compile error does not count), restores the file, and verifies the restore byte for byte. It refuses to start on a dirty target, and the tree was clean before and after. Final run:

| Mutant | Truth it guards | Defect injected | Result | Guarding tests: failed / passed |
| --- | --- | --- | --- | --- |
| M1 | logical date | apply reads the meal date through an explicit-zone instant, so Tuesday becomes Monday | CAUGHT | 2 failed, 25 passed |
| M2 | planned is not eaten | a past plan offered again is marked eaten | CAUGHT | 1 failed, 28 passed |
| M3 | a blank day is not a failure | a day with no meals is projected as needing attention | CAUGHT | 1 failed, 28 passed |
| M4 | grocery is not inventory | completed tasks are projected as items in stock | CAUGHT | 1 failed, 28 passed |
| M5 | prep is not served | completing any task marks the day's meals served | CAUGHT | 2 failed, 27 passed |
| M6 | no allergy record is not safe | an entry is projected with an allergen status of safe | CAUGHT | 1 failed, 28 passed |
| M7 | assigned is not covered | a task someone was asked to do is projected as covered | CAUGHT | 1 failed, 28 passed |
| M8 | a move keeps one stable identity | moving a date creates a copy instead of moving the entry | CAUGHT | 8 failed, 29 passed |
| M9 | several entries may share a date and slot | moving into an occupied date and slot overwrites the entry already there | CAUGHT | 2 failed, 35 passed |
| M10 | account isolation (RLS) | the meal select policy is opened to every authenticated account (a scratch database) | CAUGHT | 2 check(s) failed |
| M11 | the central sync composition | the production composition no longer starts the sync runtime when an account binds | CAUGHT | 12 failed, 4 passed |
| M12 | a stale editor never overwrites | an edit is allowed against a snapshot that no longer matches | CAUGHT | 1 failed, 36 passed |
| M13 | loading is not empty | the screen gate reports ready while an account-bound device has not finished its first pull | CAUGHT | 1 failed, 28 passed |
| M14 | removal propagates | the projection never sends the archived status, so the other device keeps the meal active | CAUGHT | 3 failed, 13 passed |
| M15 | a proposed due date is not a stated one | a meal-derived due date is stored without her confirmation | CAUGHT | 2 failed, 27 passed |
| M16 | no second durable Meals semantic | a second durable Meals model (MealIdea) is added to the domain | CAUGHT | 1 failed, 8 passed |
| M17 | a default is not user-provided | a duration she did not state is recorded as hers | CAUGHT | 2 failed, 27 passed |
| M18 | removal is not skipping | archiving a meal records a skipped outcome | CAUGHT | 2 failed, 35 passed |
| M19 | plan again never changes the original | Plan This Again rewrites the date of the entry it copies from | CAUGHT | 1 failed, 36 passed |
| M20 | deterministic ordering | entries are ordered by a locale compare of their ids | CAUGHT | 2 failed, 27 passed |

**20 / 20 mutants caught** (the contract required 16). Each mutant's guarded scenarios are in the map (`tests/fixtures/meals/scenario-map.json`, column "Mutants" in the tier tables), and an integrity test fails if a mutant the map lists is not implemented by the script, or if a mutant names a test file that does not exist. The script is committed so an auditor can re-run it (`node scripts-dev/meals-mutation-check.cjs`); it rewrites source files temporarily, so nothing may be edited while it runs.

## 39. Semantic-boundary scan

`scripts-dev/meals-boundary-scan.cjs` (also asserted by `tests/meals/boundary.test.mjs`, 9 tests; `--json` for machine output, exit 1 on any finding). It compares the working tree (tracked, staged and untracked files) with the certified baseline `14bd58e` and enumerates, mechanically:

| Check | Expected | 
| --- | --- |
| A new migrations | exactly the one F08 migration |
| B new durable domain types | none; `MealPlanEntry` gains exactly `slot` and `status` |
| C new tables or durable collections | none (no `CREATE TABLE`; the `AppState` root keys are unchanged) |
| D new sync kinds | none |
| E shared-file changes | every one mapped to a permitted reason (MealPlanEntry / canonical task integration / tests / approved repair): 19 files, each mapped in the script; protected files (`taskLists.ts`, `routeAccess.ts`, the root and Life layouts, `claim.ts`, shipped migrations, v3 fixtures, `app.json`, `package*.json`) untouched |
| F a second Meals durable model | none (Recipe, Ingredient, PantryItem, GroceryList, MealIdea, MealPreference, DietProfile, FavoriteMeal, FoodInventory, ShoppingTrip, MealHistory, MealExecution, MealConsumption, ...) |
| G sibling imports | none, by import scan and by git ancestry |

A finding is a failure that needs an owner checkpoint, not a workaround. Result at the final tip: **PASS** (output recorded in §54).

## 40. Defects found and repaired

Every item below was found by a test, an audit script, a real database run, or reading the code, reproduced, repaired inside the approved Feature 08 semantic, and regression-tested. None needed an owner checkpoint.

| # | Defect | Found by | Repair |
| --- | --- | --- | --- |
| D-01 | **A retired coverage claim on the Life hub.** The Meals row read "Planned through Tuesday" (implying contiguous coverage from the last entry's date alone) and "Nothing planned". | inheritance inventory | The row now reads "Next: Today / Tomorrow / <weekday> / <date>" and "No meals planned yet"; the internal gallery sample matches; tests `[CG]`, copy audit. |
| D-02 | **Archived plans would have read as planned.** `useHousehold().upcomingMeals` had no lifecycle filter, so once removal existed a removed meal still counted. | ML1 read of the consumers | `upcomingMealsOf` (active only, from today on), shared by the hook and its test. |
| D-03 | **A device-dependent order.** The inherited sort compared ids with `localeCompare`, so two devices could order the same entries differently. | ML1 read, then `[BG]` | One order everywhere: date, slot, id by code unit (mutant M20 breaks it). |
| D-04 | **A whole-household validation cliff.** `meals` was capped at 1000; archive-only retention would eventually stop the entire state validating, and a refused add is silently dropped by the store. | ML1 read of `state.ts` and the store gate | Cap 5000 (parity with tasks and events), `addMeal` refuses with `plan-full` instead of corrupting state, test `[BD]`. |
| D-05 | **An ambiguous day label.** `dayLabel` printed a bare weekday for any date ("Thursday" for a date 12 days out). | ML1 read | `mealDayLabel`: a weekday only for the next six days, otherwise the calendar date. |
| D-06 | **A false-empty risk.** In recovery the store holds a fresh EMPTY household, and a newly bound second device is empty until its first pull; both would have read "No meals planned yet". | ML1 read of the store and sync namespace | `mealsGate` (loading / recovery / ready), rendered tests `[BJ] [BK]`, mutant M13. |
| D-07 | **My own ML1 scenario map was wrong about the pull integrity gate.** Its AX2 assertion expected valid rows in a batch containing a malformed row to still apply; the real engine refuses the whole batch and keeps the cursor. | writing test `[AX]` | The scenario map was corrected; `apply` passes an unknown value through raw so the gate refuses it by name and nothing is coerced; a pull-level test pins the atomic-batch behavior. |
| D-08 | **Invisible characters written by the authoring layer.** The file-writing layer expanded the backslash escape sequences for U+2028, U+2029 and U+0085 (line terminators) inside a regular expression into the literal characters, and the escape for U+0000 into a real NUL byte, so `tsc` reported an unterminated regex literal and a fingerprint tool contained a NUL. | `tsc` and a byte scan | The patterns are built from `String.fromCharCode`; every file this build wrote was scanned for U+0000, U+0085, U+2028 and U+2029 (none remain), and the assembled ledger is scanned the same way. Recorded as a tooling trap in memory. |
| D-09 | **The harness would have migrated the shared database.** `run.mjs ensureLocalStackCurrent` applies migrations to the shared default database, which other sessions verify against the IR01 fingerprint. | ML1 read of `run.mjs` | Feature 08 never migrates it: scratch databases for every check, a derived fingerprint, and a private PostgREST stack for the journeys (§31). |
| D-10 | **Audit and test-of-the-test defects caught by my own gates** (not product defects): a scenario-map path to a file I never created, two scenarios with no titled test, over-broad key scans (they matched `recurringWork`, `availableActions`, `preparationMinutes`), a copy rule that flagged the app's own "started fresh", a fixture that minted a new task id per variant, and a Git-Bash path handed to Node. | the scenario-integrity test, the copy audit and first runs | Each rule or fixture was narrowed to what it guards; the integrity test now fails when a scenario has no test. |

### Observed and NOT repaired (out of scope: no opportunistic cleanup)

- `SyncNamespace.backlog` is set when the queue fills and never clears (IR01 note D10). All 620 meals in the overflow test were delivered exactly once; the flag itself is not asserted.
- `src/domain/sync/applySupport.ts:63` — a regex written `/^d{4}-d{2}.../` (backslashes missing), so `looksLikeInstant` never matches.
- `src/domain/account/claim.ts` contains a raw NUL byte at offset 13423 (search tools treat the file as binary).
- `src/domain/responsibility.ts` `accept()` defaults `stillNeedsMe` to false, contradicting its comment; `attention.ts:60-62` and `oneMove.ts:118` treat acknowledged/accepted as handled. Feature 08 does not reuse either.
- Hard-coded run-state copy elsewhere ("Working", "N systems running").

## 41. Missing primitives

See `docs/builds/HK_FEATURE_08_MISSING_PRIMITIVES.md` (16 items): the Meals-specific #1 candidate `HK-MISSING-MEALS-LINK-01` (a meal to its grocery/prep work), a Meals task-list role, a common behavior/observation hook, due-date provenance, a responsibility surface and delivery, recurrence and Systems creation, archive retention, meal creation/last-change time, dietary and allergy context, per-record conflict handling, cloud hydration exposed to screens, household timezone change, child-scoped meals, a notes field, a same-household product path, and Plan This Again lineage.

## 42. Integration candidates

Recorded, not implemented (`HK_FEATURE_08_MISSING_PRIMITIVES.md` part B): `HK-INT-MEALS-TODAY-01`, `-CALENDAR-01`, `-SYSTEMS-01`, `-KIDS-01`, `-MONEY-01`, `-HOME-01`, `-COPARENT-01`, `HK-INT-TIO-MEALS-01`, `HK-INT-MEALS-PATTERN-01`, `HK-INT-MEALS-TASKLIST-ROLE-01`, `HK-INT-WAVE2-LIFE-REGISTRATION` (the Meals route and Life row already exist at the baseline), and `HK-INT-MEALS-RUNMJS-01` (every branch that adds a migration edits the "exactly N migrations" check in `run.mjs`, so integration will conflict there).

## 43. Accessibility

Evidence is rendered-component tests and the copy audit, not a screen-reader session (see §49).

- Every pressable has an accessibility label and a role; an entry row announces the title, the meal type only when it was stated, and the full date ("Tacos, Dinner, Tuesday 22 September"); day and meal-type choices are `ChipToggle`s that announce label and selected state; each sheet has an accessibility label and a visible Cancel button.
- Defaults are visible before saving ("Day: Today, Monday 21 September", "Meal type: Not set") and announced through polite live regions.
- An entry row's minimum height is asserted at 44 points (`sizing.minTouchTarget`); shared controls keep the design system's own asserted minimums.
- Every disabled control is explained on screen (a read-only notice, or the unavailable-context notice).
- A meal-task row is worded by the same helper the Life hub already uses for open tasks (`openTaskLabel`) plus the responsibility text, so a due date is stated exactly as elsewhere in the app and never invented; the Meals hub shows no duration at all, so an assumed duration cannot be announced as stated; the due-date proposal in the task sheet is worded as a proposal ("Due Tue 23 Sep, the day of this meal") and has a separate full-date announcement.
- Not verified: dynamic type behavior (the design system has no font-scale caps and no adaptive density mechanism, so text scales uncapped at the OS setting), keyboard avoidance of the sheets on a real device, contrast beyond the design system's own token tests.

## 44. Performance

Measured, not asserted (`tests/meals/mealsView.test.mjs`, scenarios AR and AS; Node v24.14.0, win32/x64, warm, 25 samples each, on a host that was memory-starved throughout, so these are pessimistic):

| Scenario | Input | Median | p95 |
| --- | --- | --- | --- |
| AR | `buildMealsView` over a plan of 80 entries across 30 dates and every slot | 0.29 ms | 0.77 ms |
| AS | the same projection over 120 open tasks in the Meals category (plus one entry) | 0.19 ms | 1.03 ms |

Each test asserts a generous ceiling (median under 100 ms) and prints the measured figures with the Node version, platform and architecture, so a slow host does not flake and the numbers above are reproducible by re-running `node --test tests/meals/mealsView.test.mjs`. Design bounds that keep the screen cheap: the hub renders dated groups only for today through +14 days and reports everything beyond as a count ("N more later"), it renders at most a bounded number of task rows and reports the rest as a count, and the plan is capped at 5000 entries with a refusal (`plan-full`) instead of unbounded growth. Sync cost is the foundation's (one `meal` kind, chunked row requests of 100, complete pull per range); 620 meals pushed offline in the overflow test were delivered exactly once. Not measured: rendering time on a real device (see §49).

## 45. Privacy

- The only meal text that crosses the account boundary is `title` in `meal_plan_entries`, exactly as a task title does. There is no notes field, no ingredient field and no dietary field; the push payload keys are asserted against an allow-list; a title appears in no other table's row, in the client's other outbound rows, or in any log (Meals code makes no network call and no `console` call).
- No analytics or logging of any meal title, dietary or allergy information, or household food routine was added.
- A meal is `household` scope on creation; another account of another household sees none of it (real PostgreSQL over HTTP and SQL). Account switch quarantines rather than merges. Demo meals never queue or sync.
- No secret or credential pattern appears in any line Feature 08 added (regex scan over the added diff, in the suite). The private stack reuses the running stack's PostgREST settings by copying them into a container it removes afterwards; it never prints or stores a value.

## 46. Test accounting

| Suite | Baseline (IR01 @ `14bd58e`) | Final | Delta |
| --- | --- | --- | --- |
| App suite (`node --test`, serial) | 975 / 975 | **1177 / 1177** | +202 |
| Backend harness (`node supabase/tests/run.mjs`, full) | 800 / 800 | **876 / 876** | +76 |

The 202 new app tests, by file (`tests/meals/`): `mealPlanEntry` 13, `mealActions` 37, `sync` 16 (two-device harness in `support/twoDevice.mjs`), `mealsView` 29, `recurringWork` 8, `logicalDate` 11 (`support/tzProbe.mjs` runs the probe in six process timezones), `lifeIntegration` 9, `mealTasks` 29, `screen` 29 (rendered components), `boundary` 9, `copyAudit` 7, `scenarioMap` 5. Existing tests whose typed literals had to carry the two new fields were edited, never weakened or deleted (`tests/support/legacyShapes.mjs`, `richHousehold.mjs`, `foundationAcceptance{,3}.test.mjs`); no baseline test was skipped, removed, or had an assertion loosened.

The 76 new harness checks are the Feature 08 additions to ENV A (fresh install of all three migrations), ENV C (the post-apply security environment, including the SQL RLS suite `supabase/tests/77-meals-slot-status.sql`, 42 assertions in one rolled-back transaction with real roles and JWT claims), the new ENV E (populated pre-F08 upgrade), the migration-quality and fingerprint checks, and 17 `meals:` journey checks run over a real PostgREST. `node supabase/tests/run.mjs f08` (the F08-only mode) = 95 / 95; `node supabase/tests/run.mjs journeys` = 158 / 158 including the 17 meals checks. The shared foundation, sync, claim and IR01 regression suites are inside the 1177 and the 876 and are green.

## 47. Schema and fingerprint

| Item | IR01 baseline | Feature 08 (derived) |
| --- | --- | --- |
| Gated fingerprint | `43e7c8a4402a3387cb2e1add4170921e` | `2e15a718a7cf696e94c966233c7c1f81` |
| Gated facts | 3617 | 3625 |
| `columns` | 714 | 716 (+2: `meal_plan_entries.meal_slot`, `.status`) |
| `constraints` | 679 | 681 (+2: `meal_plan_entries_meal_slot_check`, `_status_check`) |
| `privileges.columns` | 721 | 725 (+4: INSERT and UPDATE on each new column for `authenticated`) |
| functions / policies / triggers / indexes | 27 / 85 / 104 / 284 | unchanged |
| `privileges.effective` / `privileges.relations` | 309 / 587 | unchanged |

Method: the tool's own SELECT-only catalog SQL was run on a scratch database before and after the migration, the delta was applied to the IR01 fact set, and the Node digest was replicated and shown to reproduce the IR01 baseline exactly (`43e7c8a4…` / 3617) before it was trusted for the new value. The new baseline is `supabase/tools/baselines/f08-local-fingerprint.json`, produced by `supabase/tools/f08-fingerprint.mjs`. Any other movement would be drift and fails the comparison.

**The shared local database was never migrated by Feature 08.** It is used by other sessions, which verify it against the IR01 baseline, so Feature 08 measured it read-only and put all of its database evidence on scratch databases and a private PostgREST stack (§48). It read `43e7c8a4…` / 3617 (MATCH) at the start of this build. **Measured again at the end it no longer matches IR01, and the difference is not Feature 08's:** exactly three dimensions moved (`functions` 27 → 28, `privileges.effective` 309 → 310, `privileges.functions` 53 → 55), all explained by one added function, `private.push_household_child(...)`, which is defined only in the Feature 05 (Kids OS) worktree's migrations, so that session applied its migration to the shared database while this build ran. Every dimension Feature 08 would touch is still at the IR01 value (`columns` 714, `constraints` 679, `privileges.columns` 721, and policies, triggers, indexes and `privileges.relations`), which is direct proof that the Feature 08 migration never reached it, and no Feature 08 file contains that function. The shared-database drift is recorded here as an environmental fact for the integration step, not as a Feature 08 defect. It also means the Feature 08 fingerprint above stays a *derived* baseline (scratch before/after), as designed, rather than a measurement of the shared database.

## 48. Migration evidence

- **Migration:** `supabase/migrations/20260921160000_f08_meal_slot_and_status.sql`, LF-pinned by `.gitattributes`; content sha256 `fdfa8aabd1188346…`. Additive only: two `ADD COLUMN ... NOT NULL DEFAULT`, two named CHECKs, two column GRANTs, the standing `private.assert_app_schema_secured()` call, inside BEGIN/COMMIT. No policy, no DELETE grant, no trigger, no index, no function replaced.
- **Shipped migrations unchanged:** the baseline migration (blob `8bc38d66fcffbb9f…`; the worktree's CRLF checkout hash `81909daa46a9a2d1…` is the documented `core.autocrlf` artifact), the shipping migration (`1e9169de4cf21c46…`, blob `7582e5e6db96b973…`) and the IR01 migration (`73db663974354f0c…`) all match, and `git diff 14bd58e -- supabase/migrations` shows only the one new file.
- **Real PostgreSQL evidence (scratch databases):** ENV A fresh install of all migrations; ENV C post-apply security environment; **ENV E** an upgrade of a *populated* pre-F08 database whose existing meal rows come out `unspecified` / `active`; the 42-assertion RLS suite (vocabulary CHECKs by reason, column grants, archive as a revision-bumping UPDATE, hard DELETE denied, anon denied, an unrelated account cannot read, insert, patch or archive, a same-household second account constructed at SQL level sees only household-scope meals, scope flips across the owner boundary refused: recorded as 42501 by RLS, not by the owner trigger).
- **Real PostgREST evidence:** a private PostgREST container (same image and settings as the running stack, copied into a container the harness removes afterwards) served from scratch database `f08_stack` on ports 54391/54392 behind a small Node proxy; the two-device meals journey (create, move, archive with a revision bump, removal reaching device two, stale write producing `cas-conflict` evidence, cross-account isolation, the title appearing only in `meal_plan_entries` rows) passed as the 17 `meals:` checks of the 158 journey checks.
- **Rollback assumption (documented, not automated):** dropping the two columns undoes the schema; archive states written in the meantime cannot be reconstructed.
- **Release order (owner-gated, unchanged from IR01's posture):** the migration must reach an environment before a client that sends `meal_slot` and `status` ships; otherwise pushes fail with 42703 and stall as validation-failure evidence. Nothing here was applied to any real environment.

## 49. Device evidence

**NOT EXECUTED — ENVIRONMENTAL LIMITATION.** An emulator (`emulator-5554`) was running, but it belongs to another session, and the host had 0.29 GB of physical memory free. Installing onto a shared device, or starting a second Metro (`preview_start` also runs in the original checkout, not this worktree), under those conditions would risk other sessions' work. No screenshot was taken and none is claimed. Substitutes, all real: 29 rendered tests of the actual components in every state (empty, loading, recovery, unavailable, read-only, planned, dense, sheets in every mode), the copy and affordance audit over every string she can read or hear, and the Android bundle export (§54). What this does NOT prove: visual proportion and Paper and Ink fidelity on a real screen, sheet behavior with the software keyboard, and touch ergonomics.

## 50. Shared-file changes

Mechanically enumerated by `scripts-dev/meals-boundary-scan.cjs` (each mapped to a permitted reason there and in §ML1-A): `src/domain/state.ts`, `src/domain/meals.ts`, `src/domain/sync/{syncTypes,projection,apply}.ts`, `src/data/seed/demoHousehold.ts`, `src/store/useHousehold.ts`, `src/features/life/lifeStatus.ts`, `app/gallery.tsx`, `app/(app)/life/meals.tsx`, the additive migration and its `.gitattributes` pin, and test infrastructure (`supabase/tests/run.mjs`, `journey-composition.mjs`, `sync-integration.mjs`, `tests/support/legacyShapes.mjs`, `tests/support/richHousehold.mjs`, `tests/foundationAcceptance{,3}.test.mjs`). Protected files that must not change (`taskLists.ts`, `routeAccess.ts`, the root and Life layouts, `claim.ts`, the shipped migrations, the v3 fixtures, `app.json`, `package*.json`, responsibility, structure, tasks, foundation, persistence) are unchanged.

## 51. Sibling-import result

**CLEAN BY ISOLATED-BRANCH CONSTRUCTION + MECHANICAL VERIFICATION.** No Meals file imports a feature module outside the baseline set (`meals`, `life`, `today`); none of `feature/01..07`, `validate/hk-ir01-*` or the audit tips above the baseline is an ancestor of HEAD, and every sibling's merge base with HEAD is at or below `14bd58e`; the diff touches no sibling-namespace path. Enforced by the scan and by `[BM]` in the suite.

## 52. Owner checkpoints

**None required.** Every open question was resolvable from the doctrine or existing repaired semantics; they are recorded as decisions DD-1 to DD-13 in ML1 supplement E. Pre-existing and owner-gated, not a build question: approval to apply the additive migration to any real environment, and to do so before a client that sends `meal_slot` and `status` ships.

## 53. Considered and deferred

- **Restore of an archived plan**, a **delegate/ask action**, a **meal to task link**, **meal recurrence**, **notes**, **hard delete or archive pruning**, a **date picker** (dates are chips or `YYYY-MM-DD`, the repo's own pattern), **per-record conflict UI**, and **meal `createdAt`/`updatedAt`** (needs no SQL if added later) were each considered and deliberately not built; each is in the missing-primitives register or the decision list.
- **Editing a Meals task in place**: the row opens the one task editor she already has (`/task-editor`); Meals builds no second task editor.
- **An `Intl`-based date formatter**: rejected; labels come from the date's own parts so no instant is ever involved.
- **A new task role for Meals**: deferred to integration (`HK-INT-MEALS-TASKLIST-ROLE-01`); a Meals task therefore appears both on the Meals screen and under the Life hub's "Other open tasks" (one canonical task, two read-only views, nothing hidden).
- **Today, Calendar and capacity reading, suggestions, and any AI**: out of Feature 08 by contract.

## 54. Exit gates

Code state under test: `65216221d0e5f5fb3ea465ea234962de1145bfc4` (`6521622`). The only commit above the last runtime/SQL change (`e50fec6`) is `6521622`, which adds the per-scenario results script and rewrites the map's results; the harness, mutation, Doctor and export runs below were made at `e50fec6`, whose runtime and SQL are byte-identical to `6521622`. The ledger commit above `6521622` is documentation only.

| Gate | Result | Evidence |
| --- | --- | --- |
| TypeScript, `tsc --noEmit` | **PASS**, exit 0 | at `6521622` |
| Full app suite, serial (`--test-concurrency=1`) | **PASS**, 1177 / 1177, 279 suites, 0 fail, 0 skipped | at `6521622` (baseline 975 + 202 new) |
| Feature 08 targeted suite (`tests/meals`) | **PASS**, 202 / 202 | inside the 1177 |
| Shared foundation, sync, claim and IR01 regression suites | **PASS** | inside the 1177 and the 876; no baseline test edited except typed literals (§46) |
| Backend harness, full (`node supabase/tests/run.mjs`) | **PASS**, 876 / 876 | at `e50fec6`; baseline 800 |
| F08-only harness mode (`run.mjs f08`) | **PASS**, 95 / 95 | scratch databases only |
| Real PostgreSQL and PostgREST journeys (`run.mjs journeys`) | **PASS**, 158 / 158, including 17 `meals:` checks | private PostgREST stack, scratch database `f08_stack` |
| Logical-date timezone and DST tests | **PASS**, 11 tests (`tests/meals/logicalDate.test.mjs`) | 23:30 New York against UTC, 00:30 Auckland, spring-forward and fall-back, a date surviving serialize and rehydrate under six process timezones (the host applied the requested `TZ` in five of the six, so the sixth is a repeat and not independent evidence) |
| Mutation / adversarial tests | **PASS**, 20 / 20 mutants caught | §38, at `e50fec6` |
| Expo Doctor | **PASS**, 21 / 21 checks | in the F08 worktree |
| Android export | **PASS**, exit 0, 1635 modules, one 6.4 MB Hermes bundle | scratch-copy recipe; the bundle was control-tested (a baseline string present) and contains five Feature 08-only strings while the retired baseline Life copy ("Planned through", "Nothing planned") is absent, so it is this tree and not another checkout's |
| Schema fingerprint comparison | **PASS**, movement is exactly the intended delta | §47: columns +2, constraints +2, privileges.columns +4, nothing else; the shared local database drifted for a reason that is not Feature 08's (§47) |
| Semantic-boundary scan | **PASS** | §39, at `6521622` |
| Sibling-import and ancestry scan | **PASS** | §51 |
| Copy-truth and affordance audit | **PASS**: 217 strings, 8 forbidden claim classes, 0 hits, 0 unsupported claims | `tests/meals/copyAudit.test.mjs` |
| Secret scan | **PASS**: no credential pattern in any line added | inside the suite |
| Scenario map integrity | **PASS**: 85 scenarios, 77 PASS, 3 SAFE-UNAVAILABLE, 5 NOT-APPLICABLE, none failed, skipped or unverified | §35-37 |
| Clean-tree verification | **PASS**: `git status` empty at `6521622` and after the ledger commit | |
| On-device validation | **NOT EXECUTED: environmental limitation** | §49 |
| Remote actions | **NONE** | §55 item 21 |

## 55. Final verdict

```
HK-FEATURE-08-MEALS = PASS WITH DOCUMENTED DEBT

READY FOR INDEPENDENT FEATURE 08 AUDIT = YES

READY FOR WAVE 2 INTEGRATION = YES
```

**This does not authorize a merge.**

Why "with documented debt" and not plain PASS: every automated gate is green and no defect is open inside Feature 08's scope, but (1) no on-device pass was possible (§49), so visual proportion, keyboard behavior and touch ergonomics are unproven; (2) sixteen missing primitives (`HK_FEATURE_08_MISSING_PRIMITIVES.md`) limit what Meals can honestly do today, most importantly a meal cannot be linked to its grocery or prep work; (3) the additive migration must be approved and applied before a client that sends `meal_slot` and `status` ships (owner-gated, as IR01 was); (4) five pre-existing defects outside this scope are recorded, not repaired (§40).

Conditions on integration (they belong to the integration step, not to this feature): an independent audit of this tip first; owner approval of the migration before any environment receives it; an on-device pass of the Meals screen before release; and the known merge points listed in §42 (`HK-INT-MEALS-RUNMJS-01`: the "exactly N migrations" check in `supabase/tests/run.mjs` will conflict with every other branch that adds a migration; `HK-INT-MEALS-TASKLIST-ROLE-01`; `HK-INT-WAVE2-LIFE-REGISTRATION`).

**Complete: "After Feature 08, a woman can ______."** After Feature 08, a woman can open Meals from the Life hub and see the meals she has already decided for the next two weeks, grouped by day; add one in a few taps with the day and the meal type visible before she saves (today, and "Not set" unless she says otherwise); change its name, move it to another day, set or clear its meal type, plan the same meal again as a fresh entry, and remove one, knowing that the removal reaches her other device and does not mean the meal was eaten or skipped; add a grocery or prep task to her ordinary task list and be told where it went ("Added to your meal tasks."), with a due date only if she chose one; and leave any day blank without Her Keys treating the blank as a gap, a failure or a job.

### Final questions

1. **Can she see what meals she already decided without reconstructing the plan?** Yes. The hub groups active entries by logical day from today through 14 days out, with the day, the meal type when stated, and the title; entries beyond the horizon are reported as a count. `[AR]`, screen tests.
2. **Can a blank day remain neutral?** Yes. Blank days and slots render nothing and score nothing; the empty copy is "No meals planned yet."; no streak, gap or catch-up wording exists (copy audit, 8 forbidden classes, 0 hits); Today never treats an empty meal slot as unfinished work. `[R] [S] [A] [CE]`, mutant M3.
3. **Does MealPlanEntry remain a planning record rather than Task or Calendar?** Yes. It has no execution, time, duration, responsibility or capacity fields; the projection labels it `semantic: 'planning-record'`, `plannedState: 'planned'`, `executionState: 'not-tracked'`; creating, moving or removing one changes no task or event and reads no capacity. `[AO]`, mutants M2, M16.
4. **Can she quick-add with truthful defaults?** Yes. The sheet states the defaults before saving ("Day: Today, Monday 21 September", "Meal type: Not set"); only a title is required.
5. **Can slot remain UNSPECIFIED rather than assuming dinner?** Yes. The default is `unspecified`; tapping a chosen meal type again returns it to "Not set"; nothing infers a slot from a title or the time of day. `[G] [H] [L]`.
6. **Can she create, edit, move and archive a meal decision?** Yes, all four, in-screen on the existing route, each durable before it is shown (`store.commit`). `mealActions`, `screen`.
7. **Does archive propagate to another device?** Yes. Removal is an ordinary revision-bumping update of `status` to `archived`; on real PostgreSQL over PostgREST the second device drops it, and a stale write produces `cas-conflict` evidence instead of overwriting. Mutant M14.
8. **Can several entries occupy the same date and slot without overwrite?** Yes; each has its own id and nothing keys on date plus slot. Mutant M9.
9. **Is ordering deterministic?** Yes: date, then a fixed slot rank with unspecified last, then id by code unit, never `localeCompare`; identical on every device. Mutant M20.
10. **Does logical date survive timezone and device changes?** Yes. An entry stores a `YYYY-MM-DD` string that is never derived from an instant; "today" comes from the household timezone; a device or process timezone change moves nothing; DST days are exact calendar arithmetic. Household timezone travel itself is deferred by the foundation (no writer exists; recorded). Mutant M1.
11. **Can she use Plan This Again without creating recurrence semantics?** Yes. It opens a draft that carries the title and meal type, she picks the day, and it saves as an independent new entry with no link to the original and no repeat rule; the original is never changed. Mutant M19.
12. **Can she create canonical grocery or prep work?** Yes, as ordinary canonical tasks through the existing `addTask` in the Meals category (household scope, unplanned). One "meal task" flow; grocery and prep are not distinguished in stored state.
13. **If no Meals task context exists, does the product degrade truthfully rather than losing work invisibly?** Yes. With no Meals category, Meals says "Meals isn't set up on this household yet.", creates neither meal nor task, and never lists "all tasks". (Not reachable in the shipped UI; covered by tests.)
14. **Can a meal-context due-date default masquerade as user-entered?** No. The meal's date is only a proposal behind an unchecked toggle; a due date is stored only when she turns it on; the projection reports `dueDateSource: 'not-recorded'` because the foundation cannot say who chose a date. Mutant M15.
15. **Does duration provenance remain truthful?** Yes (HA-010 not regressed). Typed minutes are recorded as `user`; an untouched field stays `default` (assumed); the Meals hub shows no duration. Mutant M17.
16. **Does responsibility remain truthful?** Yes. It is displayed read-only from the canonical model; `coverage` is always `not-established`, so assigned, asked, acknowledged and accepted never read as handled; Meals offers no delegate action because nothing would notify the holder. Mutant M7.
17. **Can grocery completion become pantry inventory?** No. There is no inventory, quantity or purchase field anywhere; completing a meal task changes only that task. Mutant M4, copy audit.
18. **Can prep completion become meal served or eaten?** No. Meals tasks and meal entries are not linked, and no copy or field says served, cooked or eaten. Mutant M5.
19. **Can past planning become consumption history?** No. A past date is still a plan (`executionState: 'not-tracked'`); no history, streak or "you ate" surface exists, and removal is never recorded as skipped. Mutant M18.
20. **Does Feature 08 avoid diet and body scoring?** Yes. No calorie, macro, weight, score, "healthy" or "on track" wording (copy audit), no such field.
21. **Does it avoid allergy and medical certainty?** Yes. The foundation has no dietary or allergy field and Meals adds none; the projection lists allergens, ingredients, nutrition and pantry as unknown facts; no allergy record is never rendered as safe. `[AM]`, mutant M6.
22. **Does it avoid food-safety certification?** Yes. No fresh, expired, safe-to-eat, in-stock or storage claim exists (copy audit).
23. **Does MealPlanEntry reuse the common concurrency and sync architecture?** Yes. It is the existing sync kind `meal` with two more columns; revision compare-and-set, the change bridge, queued intents in the same envelope, the pull integrity gate and column grants are the foundation's; there is no Meals queue, engine or direct Supabase call. Mutants M11, M12.
24. **Did the branch add exactly zero or one approved durable Meals semantic?** Exactly one: `MealPlanEntry`, already in the foundation, extended with `slot` and a `status` lifecycle. The boundary scan confirms no second model, table, root collection or sync kind.
25. **Were any second semantics attempted?** No. Every candidate (recipe, ingredient, pantry, grocery list, preference, history, execution, meal-to-task link) is in the non-goals and missing-primitives register, and mutant M16 guards it.
26. **Does future intelligence receive MealPlanEntry explicitly as a planning record?** Yes. `buildMealsView` is the one place that says what a meal is: a planning record, planned, execution not tracked, ingredients, allergens, nutrition and pantry unknown; a meal task has coverage not established. No consumer exists yet (Today, Pattern and Talk It Out integrations are integration candidates, §42).
27. **Were sibling imports introduced?** No (§51): no import of another feature's module, no sibling branch in the ancestry, no sibling-namespace path in the diff.

### Completion report

1. **Starting HEAD:** `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1` (`repair/hk-integration-readiness-01`, tested code state `9dbe02a`).
2. **Final HEAD:** the commit that contains this ledger, on `feature/08-meals-os` (a commit cannot record its own hash; `git log -1`). Code state tested: `65216221d0e5f5fb3ea465ea234962de1145bfc4`; the commit above it changes documentation only (`git diff --name-only 6521622 HEAD`).
3. **Branch / worktree:** `feature/08-meals-os`, `C:\Users\jsmit\Her-Keys-F08` (new, isolated; no sibling ancestry). Local only.
4. **Commits** (all local, explicit staging, none amended): `843a9aa` ML0-ML1 · `94fe2ae` ML2a · `10abd7e` ML2b · `0d0f848` ML3a · `82e627f` ML5a · `95cdbde` ML3b-ML5b · `f1cf48b` ML6 · `e50fec6` ML7a · `6521622` ML7b · the ledger commit.
5. **ML1 contracts:** §4-34 and supplements A-E (19 required contracts, closed field contract, architecture, truth contract, minimum shippable, non-goals, decision register DD-1 to DD-13). Deviations: see "Deviations from the ML1 contract".
6. **Durable semantics added or reused:** reused and extended exactly one, `MealPlanEntry` (`slot`, `status`, cap 5000). Zero new models, tables, root collections or sync kinds.
7. **Schema / migration status:** one additive migration, `20260921160000_f08_meal_slot_and_status.sql`, proven on scratch PostgreSQL databases only (fresh install, populated upgrade, RLS attacks); **not applied to any real, staging or production environment and not applied to the shared local database.** Approval is owner-gated and precedes any client that sends the new columns.
8. **Fingerprint status:** IR01 `43e7c8a4…` / 3617 → Feature 08 derived `2e15a718…` / 3625; movement exactly columns +2, constraints +2, privileges.columns +4. The shared local database has since drifted because of another session's migration (`private.push_household_child`, Feature 05), not Feature 08's (§47).
9. **Sync and claim behavior:** kind `meal` gains two columns end to end (`syncTypes`, `projection`, `apply`, migration, grants); claim v3 does not carry meals and is untouched (local meals reach the cloud as ordinary creates through the top-up); an unknown `meal_slot` or `status` is refused by the pull integrity gate by name and never coerced; removal propagates.
10. **UI and routes:** the existing `life/meals` route (now a thin file that passes task-editor navigation in) renders `MealsOverview`: the hub, an add/edit sheet (title, day chips or a typed `YYYY-MM-DD`, meal-type chips, Cancel, Save, Remove), Plan This Again, a meal-task sheet, and read-only recurring meal work. No new route, tab or root modal. **Limitation to state explicitly:** `TASK_LIST_ROLES` has no `meals` role (option B, decided in §17), so a Meals-category task appears in the Meals hub (a projection over the stable Meals category, never a title match) **and also** under the Life hub's "Other open tasks"; it is one canonical task with two read-only views and is never hidden; a meal task is not linked to a specific meal.
11. **Today / Life integration:** the Life hub's Meals row now says only what the data supports ("Next: Today / Tomorrow / <weekday> / <date>", "No meals planned yet"); the retired "Planned through ..." and "Nothing planned" claims are gone. No Today, Calendar or capacity integration, by contract (integration candidates are recorded).
12. **Truth invariants:** planned is not executed; empty is not failure; a logical date is not a timestamp; a plan is not a Calendar or capacity claim; grocery and prep work is canonical task work; a grocery task is not inventory; prep is not served; no allergy record is not safe; no diet or body scoring; no food-safety claim; assigned is not covered; a default is not user-provided; removal is not skipped or eaten; removal propagates. Each is enforced by named tests and at least one mutant (§27, supplement B, §38).
13. **Logical-date evidence:** §54 row and `tests/meals/logicalDate.test.mjs` (11 tests), mutant M1.
14. **Test counts:** app suite 975 → 1177 (+202); backend harness 800 → 876 (+76); F08 mode 95; journeys 158; RLS suite 42 assertions; mutation 20 / 20 (§46).
15. **Mutation and adversarial results:** 20 / 20 caught (§38); semantic-boundary scan PASS (§39); copy audit 217 strings, 0 hits.
16. **Real PostgreSQL evidence:** §48: scratch databases for fresh install, populated upgrade and RLS attacks with real roles and JWT claims; a private PostgREST stack for the two-device journey; 876 / 876 harness.
17. **Security and privacy findings:** no new policy, no DELETE grant, column-level grants for the two new columns only, RLS posture unchanged and re-attacked (anon denied, unrelated account denied, same-household second account constructed at SQL level); the only meal text that leaves the device is the title, exactly as a task title does, and is asserted to appear only in `meal_plan_entries` rows; no analytics, logging or network call in Meals code; account switch quarantines; demo data never syncs; no secret in any added line. No open security or privacy finding.
18. **Defects repaired:** D-01 to D-09 (§40); D-10 lists defects found in my own gates.
19. **Documented debt:** no on-device pass (§49); sixteen missing primitives, first `HK-MISSING-MEALS-LINK-01` (§41); Meals tasks also appear in Life "Other open tasks" until `HK-INT-MEALS-TASKLIST-ROLE-01`; no restore, no archive pruning (the 5000-entry cap refuses with `plan-full`); responsibility and recurring meal work are read-only; five pre-existing out-of-scope defects observed and not repaired (§40); the `run.mjs` migration-count merge point (`HK-INT-MEALS-RUNMJS-01`); accessibility verified by rendered tests and audit, not by a screen reader or dynamic type on a device (§43).
20. **Owner decisions:** none required (§52). One owner-gated release step already exists and is unchanged: approval to apply the additive migration to any real environment.
21. **Remote actions:** **NONE.** No push, PR, merge, rebase, squash, amend or deploy; no remote migration; no Production or Staging change; no OAuth or provider configuration change; K Scan untouched; no Apple, Google, EAS, Gemini, RevenueCat, grocery or delivery service touched. Everything ran on this machine, on scratch databases and a private PostgREST container that was removed afterwards; the shared local database was never migrated by this build.
22. **Final verdict:** `HK-FEATURE-08-MEALS = PASS WITH DOCUMENTED DEBT`, `READY FOR INDEPENDENT FEATURE 08 AUDIT = YES`, `READY FOR WAVE 2 INTEGRATION = YES`. This does not authorize a merge.

---

## Deviations from the ML1 contract

Nothing below changes a truth rule, a semantic, or the schema decision; each is an implementation detail that turned out different from what ML1 planned, recorded so an auditor is not surprised.

| # | ML1 said | What was built | Why |
| --- | --- | --- | --- |
| 1 | `mealsGate` takes a `recovery` flag beside the store status | `mealsGate` takes the store's own status, which already includes `recovery`, plus persistence and sync hydration | one input instead of two that could disagree |
| 2 | the meals journey in a new `supabase/tests/journey-meals.mjs` | a `mealsJourney` module inside the existing `supabase/tests/journey-composition.mjs` | that file already owns the two-device harness and the served-database name; a copy would drift |
| 3 | a private PostgREST stack "if feasible", otherwise SQL-level evidence only | the private stack was feasible and is built (`supabase/tests/private-stack.mjs`); the journeys run on it by default and `HERKEYS_SHARED_STACK=1` opts out | the real-PostgREST gap could be closed without touching the shared database |
| 4 | shared-file table of 13 rows | 19 files; the additions are `app/gallery.tsx` (its sample Life row would otherwise contradict the new copy), `app/(app)/life/meals.tsx` (the thin route, named in the architecture table but not in the shared-file table), `supabase/tests/journey-composition.mjs` and `supabase/tests/sync-integration.mjs` (the served-database name) | each is mapped to a permitted reason in the boundary scan |
| 5 | fingerprint baseline "measured" | a *derived* baseline (scratch before/after plus Node digest replication verified against IR01) | the shared local database must not be migrated by this build (§47) |
| 6 | §18 did not state limits for a meal task's fields | the title uses the foundation's own limit (`FIELD_LIMITS.titleLength`, 200) and typed minutes must be a whole number from 1 to 1440 (a Meals-side constant, `MEAL_TASK_MAX_MINUTES`) | a whole-number-of-minutes field needs a stated ceiling, and the foundation has none for it |
| 7 | the ML1 scenario map (AX2) expected valid rows to apply beside a malformed one | the engine refuses the whole batch and keeps its cursor; `apply` passes an unknown `meal_slot` or `status` through raw so the gate refuses it by name | found while writing test `[AX]` (defect D-07); the map was corrected |

## Phase log

| Phase | Status | Commit | Notes |
| --- | --- | --- | --- |
| ML0 baseline / inheritance | complete | `843a9aa` | §1-3 |
| ML1 domain / capability contracts | complete | `843a9aa` | §4-34 and supplements; scenario map and missing-primitives register written before any code |
| ML2 MealPlanEntry domain / durability | complete | `94fe2ae`, `10abd7e` | slot and lifecycle, canonical actions, sync registration; additive migration, 42-assertion RLS suite, derived fingerprint |
| ML3 Meals hub | complete | `0d0f848`, `95cdbde` | projection, gate, copy, dates, Life row; the screen |
| ML4 create / edit / move / archive / plan again | complete | `95cdbde` | in-screen sheets on the existing route |
| ML5 grocery / prep work | complete | `82e627f`, `95cdbde` | `addMealTask` over the canonical `addTask`; the task sheet |
| ML6 account / backend validation | complete | `f1cf48b` | private PostgREST stack, two-device journey on real PostgreSQL |
| ML7 adversarial hardening | complete | `e50fec6`, `6521622` | boundary scan, copy audit, scenario-map integrity, 20-mutant check; per-scenario results |
| ML8 completion | complete | the commit that contains this ledger | §35-55 |
