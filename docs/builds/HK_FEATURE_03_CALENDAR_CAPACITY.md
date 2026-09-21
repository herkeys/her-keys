# HK-FEATURE-03-CALENDAR-CAPACITY — Build Ledger

Feature 03 of the parallel wave (Today · Talk It Out · **Calendar + Capacity** · Systems).
Contract: HK-FEATURE-03 CONSOLIDATED PRE-SOURCE BUILD CONTRACT v2 + COMMON SOURCE ADDENDUM 01.

> Calendar answers **"can my life actually fit?"** — not merely "when?".

STATUS: **IN PROGRESS** (see §20). Builder validation only; this is not the independent audit.

---

## 1. Source, branch and entry gate (recomputed, not copied)

| Item | Addendum value | Recomputed at entry | Result |
|---|---|---|---|
| Source branch | `design/01-front-end-system` | `design/01-front-end-system` | match |
| EXPECTED_SOURCE_HEAD | `5007b0f` | `5007b0f2e6de34e8ce476fac11a8acd2cf1e69a1` (branch + source branch agree) | match |
| Feature branch | `feature/03-calendar-capacity` | created from source, independently of feature/01 | ok |
| Worktree | clean | clean before and after `npm ci` | ok |
| TypeScript | PASS | `tsc --noEmit` exit 0 | PASS |
| App tests | 808 / 808, 169 suites | 808 pass / 0 fail, 169 suites (TAP, parsed mechanically) | match |
| Backend harness | 684 / 684 | `node supabase/tests/run.mjs` → 684/684 checks passed | match |
| Expo Doctor | 21 / 21 | 21/21 checks passed | match |
| Expo Android export | PASS | bundle written (6.2 MB hbc) | PASS |
| Shipping migration SHA-256 | `1e9169de…a7cb` | `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` (working-tree CRLF bytes) | match |
| Baseline migration SHA-256 | `8bc38d66…f16f` | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` (committed blob and LF-normalised bytes) | match — see E-001 |
| Local fingerprint / facts | `199ed4d4c1b37cd654b5853e91cbde27` / 3613 | `#GATING\|3613\|199ed4d4c1b37cd654b5853e91cbde27` | match |

Fingerprint was recomputed with the locked tool's `print-sql --mode digest`, run through
`docker exec supabase_db_Her_Keys psql` (the documented route; the CLI route is known to fail).

### Entry observations

- **E-001 — baseline migration line endings in a fresh checkout.** `core.autocrlf=true` wrote the baseline migration
  to this new worktree with CRLF, so its *raw working-tree* hash is `81909daa…3b47`. The committed blob and the
  LF-normalised bytes both hash to the expected `8bc38d66…f16f`, and `git diff 5007b0f -- supabase/` is empty.
  The shipping migration's expected value is defined on the CRLF working-tree file and matches. This is a checkout
  representation artefact, not foundation drift. **Exit-gate rule:** baseline is verified as
  `git show HEAD:<path> | sha256sum` (must equal `8bc38d66…`), shipping as the working-tree file (must equal `1e9169de…`),
  plus an empty `git diff 5007b0f -- supabase/`.
- **E-002 — inherited K9 harness fix present** (`supabase/tests/sync-integration.mjs`, `sync: 23` derives `today` in
  `America/Chicago`). Not touched, not re-fixed, not counted as drift.
- **E-003 — worktree isolation.** Feature 01's branch is checked out in the primary worktree, so Feature 03 is built in a
  separate git worktree (`C:\Users\jsmit\her-keys-f03`) to avoid disturbing a possibly concurrent session. Dependencies
  installed with `npm ci` from the committed lockfile (no lockfile change; `git status` clean afterwards).
- **E-004 — shared local Supabase container.** The backend harness drops and recreates its own `b4_env_*` databases inside the
  shared `supabase_db_Her_Keys` container. Parallel features running it concurrently could interfere with each other; this
  is a property of the parallel-wave design, recorded for the integration wave.

### Entry test baseline artifact

`docs/builds/HK_FEATURE_03_ENTRY_TEST_INVENTORY.txt` lists all 808 entry leaf tests as `suite > … > test`.
The exit gate verifies mechanically that **every entry test still exists and passes** (named removals: none planned).

---

## 2. WHY-doctrine decisions log

The owner supplied a product WHY (mid-build). Where the spec was ambiguous, the rule was: preserve truth → reduce mental
load → preserve agency → preserve context → make the next moment easier → build for learning → one coherent product →
do not create work to manage the tool. Each decision below is inside already-approved behaviour.

| # | Ambiguity | Decision | Doctrine basis |
|---|---|---|---|
| D-01 | Unknown duration is not representable on a task (creation stamps 15). | A recorded duration is an **estimate** and is worded as one. A recorded `0` is *no usable duration*: no fit is claimed either way and it is never counted as zero time. The defaulted-15 residual is recorded as **OWNER-DECISION OD-01**, not fixed locally. | 1 truth; must not invent a durable "duration known" field |
| D-02 | Unknown travel: flag every gap, or only some? | Flag only when the data **implies movement**: at least one side has a location, no transition value is entered, and the two locations are not the same known place. Gaps between un-located commitments are not flagged. | 2 + 8: flagging everything would make her maintain the tool |
| D-03 | Unknown can only shrink capacity. | `tight` and `overloaded` (constraint-present verdicts) stand regardless of unknowns; `open` (a claim of room) and "fits" need complete evidence, otherwise `tier` is `null` (the foundation's "not known") and the missing canonical fields are named. | 1 truth |
| D-04 | Calendar vs Today on the two DST days. | Calendar computes geometry from instants (elapsed time) and feeds the foundation classifier elapsed-minute coordinates. On every non-DST day this equals Today exactly (equivalence-tested). Divergence on a DST day is the truthful one; recorded as an integration candidate. | 1 truth; 7 coherence |
| D-05 | Overlap where one/both sides are flexible. | Reported as `FIXED_OVERLAP` with each side's flexibility and the foundation's `movableEventId` in the evidence; no unlisted conflict type is invented. | 7 |
| D-06 | Placement "fits" vs the 45/23-minute buffer. | Feasibility is *physical fit only*; the foundation tier of the resulting buffer is attached as a consequence, never used as a Calendar threshold. | 1 + "do not invent thresholds" |
| D-07 | Future-day overdue backlog. | A future day lists only what is dated/planned/timed for it. Overdue is a today-relative state and appears on today only (mirrors `tomorrowPreview`). | 2: no backlog wall |
| D-08 | Past days. | Read-only history of active events; no capacity or Needs-a-Place claims (the foundation has no as-of view: completed rows vanish). | 1 |
| D-09 | Which week? | Sunday-first (the same `0 = Sunday` convention `byWeekday` uses); no week-start setting exists in state. Paging moves a week at a time. | 7 coherence |

---

## 3. Parallel-branch safety

- Independent branch from `5007b0f`; no sibling ancestry.
- **Shell freeze:** no new tab, no route added; Calendar keeps `app/(app)/calendar.tsx`. Week overview is a view *inside* that route.
- **Shared foundation is read-only.** Every foundation gap is recorded in §6 and worked around feature-locally.
- **Sibling independence:** verified by search at exit (§13, exit gates).
- **SHARED FILES TOUCHED:** see §9 (filled as commits land).

---

## 4. Existing Calendar inheritance (post-Kimi, inspected)

Classification: PRESERVE · REFINE · REPLACE · ABSENT · STUB. "Not migrated by Kimi" does not mean "does not exist".

| Artifact | Evidence | Class | Notes |
|---|---|---|---|
| Route `app/(app)/calendar.tsx` (tab) | 40-line screen: hero title, "Add event", weekday overline, `TimelineList` or one empty line | **REFINE** | Route file, tab registration and "Add event" behaviour kept; content becomes the projection-driven views. |
| "Add event" → `/event-editor` | `calendar.tsx:28` | **PRESERVE** | |
| Tap row → editor (`event-editor` / `task-editor`) | `calendar.tsx:14-17` | **PRESERVE** | Semantics kept and re-proven (Scenario W). |
| `EventForm` + `event-editor` route | `src/features/calendar/EventForm.tsx` | **PRESERVE** | Untouched. Source-pinned by `build3Audit.capture` tests. Real travel/prep/commitment entry lives here. |
| `TaskForm` + `task-editor` route | `src/features/tasks/TaskForm.tsx` | **PRESERVE** | Untouched; the task edit path. |
| `TimelineList` as used by Calendar | today-only via `useSchedule()`; timed tasks only; no end times, no date | **REPLACE (for Calendar only)** | Deficiency: cannot render any day but today, has no end time, state, conflict or unplaced work; it is also Feature 01 territory. Component itself is untouched and still serves Today. Semantic guarantee kept: pressing a row opens that item's editor (replacement test). |
| `weekdayName` (from `features/today/formatDay`) | imported by Calendar | **REPLACE (for Calendar only)** | Avoid coupling to a file Feature 01 may change; feature-local formatting. |
| Day projection `projectDay` / `projectStateDay` | wall-clock minutes; overdue on every future day | **CONSUME-PARTIAL** | Kept as the equivalence oracle for non-DST days; feature-local instant-based projection where insufficient (§6). |
| Daily Load engine, issue detectors, `LoadTier` | `computeDailyLoad`, `assessDailyLoadIssues`, `loadThresholds` | **PRESERVE / CONSUME-AS-IS** | The capacity vocabulary. Not modified. |
| `ScheduleContext` mutation wrappers | `moveEvent`, `dropTask`, `shortenTask`, `keepCapacity`, `protectItem` | **PRESERVE / CONSUME** | Only Calendar-relevant legitimate mutations; today-only by foundation design. |
| Day / week / month treatment | none | **ABSENT** | No day selection, no week, no month. Month not built (§16 of contract: only if inherited and useful). |
| Capacity behaviour in Calendar | none (Today shows it) | **ABSENT** | |
| Conflict presentation in Calendar | none | **ABSENT** | |
| Flexible / unscheduled work in Calendar | only *timed* tasks render; unscheduled tasks never appear | **ABSENT** (unplaced) / **STUB** (timed rows) | |
| MOVE / DROP / SHORTEN / PROTECT in Calendar | exist only in Today's `DailyLoadCard` | **ABSENT** in Calendar | |
| Filtering | none | **ABSENT** | Not introduced (§52). |
| Empty / loading / error / recovery in Calendar | one static empty sentence; nothing for unknown/recovery | **STUB** | |
| Timezone / logical day | `useHousehold().today` from one snapshot; rollover via `refreshDay` | **PRESERVE** | Selection follows `today` unless she moves away. |
| Demo behaviour | demo state in memory, separate origin | **PRESERVE** | Re-proven (Scenario X). |
| Calendar tests | **none** target `calendar.tsx`; only domain tests (events, tasks, projection, daily load) and route reachability | **ABSENT** | |

## 5. Existing test disposition

No production code that carries an existing guarantee is being modified: `EventForm`, `TaskForm`, all `src/domain/*`,
`computeDailyLoad`, `describeLoad`, `TimelineList`, tokens and design components are untouched. Therefore **every entry
test is PRESERVED** (mechanically re-verified at exit against `HK_FEATURE_03_ENTRY_TEST_INVENTORY.txt`).

| Test file (describe) | Tests | Guarantee | Disposition |
|---|---|---|---|
| `events.test.mjs` — Real events | 9 | add/update/remove events, editable-field whitelist, soft remove | PRESERVED |
| `tasks.test.mjs` — Real tasks | 10 | task capture defaults, update whitelist, complete/archive | PRESERVED |
| `logicalDay.test.mjs` — Logical day, Projecting stored facts onto a day | 7 | timezone/DST conversion, day projection | PRESERVED |
| `loadTier.test.mjs` — Load tiers | 5 | 45/23 thresholds; meter reads the tier | PRESERVED |
| `dailyLoad.test.mjs` | 12 | seeded-day verdict, recommendations, windows | PRESERVED |
| `dailyLoadIssues.test.mjs` | 26 | overlap / transition / capacity / overdue / single verdict | PRESERVED |
| `dailyLoadPersistence.test.mjs` | 7 | decisions survive relaunch | PRESERVED |
| `recommendationActions.test.mjs` | 18 | MOVE event, DROP/SHORTEN/KEEP, PROTECT, negative controls | PRESERVED |
| `build3Audit.dailyLoad.test.mjs` | 30 | audited Daily Load behaviours | PRESERVED |
| `build3Audit.recommendations.test.mjs` | 12 | undo safety, no stale application | PRESERVED |
| `build3Audit.oneMove.test.mjs` | 11 | One Move audit | PRESERVED |
| `build3Audit.capture.test.mjs` | 20 | editors' source-text pins (scope, maxLength, duration/travel bounds) | PRESERVED (EventForm/TaskForm unchanged) |
| `tomorrowPreview.test.mjs` | 8 | tomorrow projection | PRESERVED |
| `oneMove.test.mjs` | 19 | One Move selection/withholding | PRESERVED |
| `needsMe.test.mjs` | 7 | Needs Me inbox | PRESERVED |
| `routeAccess.test.mjs` | 9 | `/calendar` protected link, guard/layout parity | PRESERVED (no route added) |
| `appStore.test.mjs` — Day rollover | 3 | rollover re-derives today | PRESERVED |
| `hostileAudit.test.mjs` — Hostile logical-day | 3 | logical-day edge cases | PRESERVED |
| `categories.test.mjs` | 13 | categories; scans src/app for hard-coded names | PRESERVED (new code must comply) |
| `foundationOps.test.mjs`, `foundationAcceptance*.test.mjs` | — | structure/capacity/dependency/responsibility semantics | PRESERVED |
| `tests/design-system/**` | 58+ | contrast matrix, primitives, intelligence contract | PRESERVED (new UI uses only allowed pairings) |

Removed: **none**. Rewritten: **none**. Replaced: **none**.

---

## 6. Foundation gaps and defects found (read-only foundation → feature-local composition)

Each was located in real code. None is repaired in this branch.

| ID | Gap | Evidence | Affects | Feature-local handling | Candidate |
|---|---|---|---|---|---|
| F03-FG-01 | **Unknown task duration is not representable.** Creation stamps 15; the form pre-fills 15; an interpretation with null duration becomes 15. A defaulted 15 equals an entered 15. | `domain/tasks.ts:15,40`; `TaskForm.tsx:34`; `domain/interpretations.ts:236` | G, AF, F | Estimates worded as estimates; recorded `0` = no usable duration. | **OWNER-DECISION OD-01** (nullable effort, or a provenance marker) |
| F03-FG-02 | `state.capacity` overrides are stored and validated but **Daily Load never reads them**; constants are used. | `domain/structure.ts:303` consumed only by tests; `dailyLoadIssues.ts:23-24,225-230` | capacity | Foundation classification governs (identical to Today). No second threshold source. | INTEGRATION (capacity wiring) |
| F03-FG-03 | `projectDay` uses wall-clock minutes-of-day as if elapsed. Fall-back: 01:30 EDT→01:30 EST projects as 90→90 (zero length). Spring-forward: wall gaps overstate elapsed gaps. | `projectDay.ts:46-47`; `logicalDay.ts:162` | T, U | Feature-local instant-based geometry; elapsed-minute coordinates for the classifier. Reproduced in tests. | INTEGRATION (shared projection) |
| F03-FG-04 | `isDone(event)` is true only when the event is `removed`; an elapsed active event blocks forever in `blockersOf`. | `domain/structure.ts:74` | K | Predecessor events are resolved by their known interval; `blockersOf` used as-is for task/needsMe/goal predecessors. | INTEGRATION (temporal dependency) |
| F03-FG-05 | Dependencies are **completion-only**, not temporal; no transitive/critical-path result. | `structure.ts:81-88`; greps for transitive/critical path/predecessor found nothing | K | Direct edges only, resolved against known intervals; no solver (§65). | INTEGRATION |
| F03-FG-06 | `projectDay` on a future date lists every past-due task as overdue. | `projectDay.ts:61,73` | Week, future days | Feature-local rule D-07. | INTEGRATION |
| F03-FG-07 | **Unknown → zero sites** already inherited: `travelFootprint` `?? 0`, capacity `marginMinutes` `?? 0`, defaulted 15 counted as estimate, `apply.ts` null→0, etc. (12 sites) | `dailyLoadIssues.ts:129,232-236`; `tasks.ts:40`; `sync/apply.ts:81,111-113`; `computeDailyLoad.ts:121-128`; `describeLoad.ts:66-72` | AF, H | Calendar adds a completeness layer on top; never adds a new site. | INTEGRATION |
| F03-FG-08 | **No per-date mutation API.** Every recommendation action is gated on `ctx.today`, only the currently offered target, and one decision per day; no move-to-date. | `recommendationActions.ts`, `dailyLoadDecisions.ts`; `appStore.ts:153-154` | N, O, AB | Actions render only for logical today and only for what the live verdict offers; other days read-only (SAFE-UNAVAILABLE with reason). | INTEGRATION |
| F03-FG-09 | No all-day / date-only **events**; multi-day events are schema-legal but no UI can create one. | `state.ts:126-127`; `EventForm.tsx:78-79` | L, AD | Date-only exists for tasks; multi-day rendered from instants (clipped per day). | — |
| F03-FG-10 | No UI creates dependencies, responsibilities, recurrences or capacity; they arrive only via sync pull or tests, so real households hold empty collections today. | foundation trace §2 | K, I, J, AC | Calendar is their first reader; fully built, proven on fixtures. | INTEGRATION (Talk It Out / Systems producers) |
| F03-FG-11 | Naming trap: `DailyLoadStatus.overloaded` means buffer < 45, `LoadTier.overloaded` means ≤ 22. | `computeDailyLoad.ts:132` vs `loadThresholds.ts` | capacity | Only `LoadTier` is used. | — |
| F03-FG-12 | No store revision counter; `commit` reports success for a no-op and rejects on a throwing transition; `ctx.today` can lag the clock ≤ 60 s after midnight. | `appStore.ts:186,318-320,324-330` | AG, AB, V | Reference-identity staleness token; closure flag for "applied"; try/catch. | INTEGRATION (store revision) |
| F03-FG-13 | Protected-time and reversibility are not typed facts on events/tasks (protect = flip to fixed). | `recommendationActions.ts:216-221` | conflict types | `PROTECTED_TIME_CONFLICT` is not emitted (ABSENT); recorded in §12 of the ledger. | INTEGRATION |

`Hydration:` there is no typed *known-empty* state. Calendar derives it as `status==='ready' && recovery===null` plus empty rows.
`Account:` SESSION-UNRESOLVED has no member in `authState`; not represented, therefore not rendered.

---

## 7. Foundation consumption trace (actual code, not governance IDs)

Legend: **AS-IS** consume unchanged · **PARTIAL** consume part, compose the rest feature-locally · **NOT-FOUND**.
Paths are under `src/`. "UI reads it today?" = whether any screen consumes it (none of the foundation collections do).

| Capability | Gov. ID | Actual module · export | Tests | Feature 03 use | Class |
|---|---|---|---|---|---|
| Fixed / flexible | B4-FE01-015 | `domain/state.ts` `commitment` (event, task); `domain/foundation/commitment.ts` `commitmentFacetsOf().flexibility` | `foundationOps` | Read `commitment` directly; never inferred; fixed is never treated as movable | AS-IS |
| Start / end / window | B4-FE01-015/016 | Events: `startsAt`/`endsAt` Instants. Tasks: `plan` (`unplanned`/`day`/`timed`), `dueDate`, `dueAt`, `earliestStartAt`, `latestFinishAt` (facets; no form sets them) | `events`, `tasks` | Instant-based intervals; date-only stays date-only; windows used only when present | PARTIAL |
| Effort / duration | B4-FE01-015 | `commitmentFacetsOf().effortMinutes`; task `durationMinutes` (always a number, F03-FG-01); event effort = end − start | `foundationOps` | Estimate wording; `0` = no usable duration | PARTIAL |
| Capacity profile | B4-FE01-016 ADR-025 | `domain/structure.ts` `capacityWindowFor`, `DEFAULT_CAPACITY` — **unused by Daily Load** (F03-FG-02) | `foundationOps:563` | Not read for classification (would be a second threshold source) | PARTIAL / gap recorded |
| Daily Load reasoning | Build 3 | `features/daily-load/computeDailyLoad.ts` `computeDailyLoad`, `listTransitionGaps`, `isMovable`, `rankMoveCandidates`; `domain/dailyLoadIssues.ts` `assessDailyLoadIssues`, `detectOverlaps`, `detectTransitionIssues`, `detectCapacityPressure`; `domain/loadThresholds.ts` `loadTierForBuffer` | `dailyLoad`, `dailyLoadIssues`, `loadTier`, `build3Audit.*` | The classifier. Fed elapsed-minute coordinates (D-04) | AS-IS (logic) / PARTIAL (inputs) |
| Day projection | Build 3 | `domain/projectDay.ts` `projectStateDay` | `logicalDay` | Equivalence oracle on non-DST days; not used for geometry (F03-FG-03/06) | PARTIAL |
| Dependencies | B4-FE01-017 ADR-016 | `domain/foundation/structure.ts` `DependencySchema`; `domain/structure.ts` `blockersOf`, `isBlocked`, `isDone`; `domain/reasoning/related.ts` `relatedTo().requires` | `foundationOps`, `foundationAcceptance` | Direct `requires` edges only; predecessor events resolved by known interval (F03-FG-04/05) | PARTIAL |
| Attention | B4-FE01-* | `domain/reasoning/attention.ts` `attentionFor` — today-only, no UI consumer | — | Not consumed (Feature 01 territory) | NOT USED |
| Consequence | B4-FE01-015 | nullable `consequence` facet on event/task | — | Not used to rank; may be shown in Why only | PARTIAL |
| Reversibility | — | exists on intents/executions only | — | Not represented on event/task | NOT-FOUND |
| Responsibility lifecycle | B4-FE01-013/014 ADR-019 | `domain/foundation/responsibility.ts` states `owned/requested/acknowledged/accepted/declined/completed/returned`, `isActiveResponsibility`, `isUnacknowledged`; `domain/responsibility.ts` `liveResponsibilityFor`, `needsMePersonally` | `foundationOps` | Projected per item; delegated ≠ covered | AS-IS (data) |
| Child / person refs | NHR-01 | `subjectMemberId` on event/task; `checkSubject` (`state.ts:617-624`); `children[]`; `people[]` | `schema`, supabase 30 | Subject preserved verbatim; never collapsed to household | AS-IS |
| One Move / recommendation | Build 3 | `domain/recommendationActions.ts`, `domain/dailyLoadDecisions.ts` (§ action map) | `recommendationActions` | The only MOVE/DROP/SHORTEN/PROTECT source | AS-IS |
| Reasoning evidence | B4-FE01-* | `domain/patterns.ts` `explain`; Daily Load "why" is string fields | — | Structured evidence in the view model; `WhyThis` strings come from Calendar copy | PARTIAL |
| Logical day / timezone | Build 2 | `domain/logicalDay.ts` (see trace); household zone = `state.user.timezone` | `logicalDay`, `hostileAudit` | Sole time abstraction; no device-local assumptions | AS-IS |
| External references | B4-FE01-004 | `state.externalReferences`; `relatedTo().externalReferences` | — | Display-only provenance; no provider wiring | PARTIAL |
| Recurrence metadata | B4-FE01-018 ADR-017 | `state.recurrences` (rule only); `relatedTo().recurrences`; **occurrence records do not exist** | `foundationOps` | Show "repeats" from rule metadata on an existing concrete row. `occurrencesOf`/`nextOccurrence` are **not called** (Feature 04) | PARTIAL |
| Cross-domain projection | B4-FE01-031 | `domain/reasoning/related.ts` `relatedTo` | — | Item-detail evidence | AS-IS |
| Canonical mutation APIs | Build 2/3 | `domain/events.ts`, `tasks.ts`, `recommendationActions.ts`, `dailyLoadDecisions.ts` | many | § action map | AS-IS |
| Store / hydration | Build 2/4 | `state/appStore.ts` (`getSnapshot`, `subscribe`, `commit`, `dispatch`); `store/AppStateProvider.tsx` `useHouseholdState`, `useStoreSnapshot` | `appStore`, `hostileAudit` | Reference-identity staleness token; closure flag for applied | PARTIAL (no revision, F03-FG-12) |

## 8. Capacity classification mapping (foundation governs)

Calendar introduces **no threshold, score or percentage**. Every classification below is produced by foundation code.

| Calendar concept | Foundation source | Values | Note |
|---|---|---|---|
| Day tier | `assessDailyLoadIssues(events, tasks, computeDailyLoad(events, tasks)).tier` | `open` · `tight` · `overloaded` | Identical to Today on non-DST days (equivalence test) |
| Per-gap tier | `loadTierForBuffer(bufferMinutes)` | `open` ≥ 45 · `tight` 23–44 · `overloaded` ≤ 22 | Constants `REQUIRED_TRANSITION_BUFFER_MINUTES` 45, `TIGHT_MINIMUM_BUFFER_MINUTES` 23 |
| Verdict source | `issues.primary.kind` | `overlap` · `transition_conflict` (`raw`/`travel_aware`) · `capacity_pressure` · `tight_window` · `overdue` | Priority order is the foundation's |
| Household day window | `CAPACITY_DAY_START_MINUTES` 360, `CAPACITY_DAY_END_MINUTES` 1320 | 06:00–22:00 | Profile overrides are ignored by the foundation (F03-FG-02) and therefore by Calendar, to stay consistent with Today |
| **Unknown / insufficient** | The foundation's only "not known" convention is `null` (`commitment.ts:22`); there is no unknown tier | `tier: null` + `evidence: { status: 'insufficient', missing: [...] }` | Maps AF to the *actual* representation; no `UNKNOWN_INSUFFICIENT_INFORMATION` enum is invented |
| Week comparison | the same day tier + counts | categorical only | No ranking, no composite, no heat-map percentage |
| **Not used** | `LoadLevel` (`open/steady/tight/full`, `BUSY_SHARE = 0.25`), `DailyLoadStatus`, `describeLoad` | — | Extra presentational threshold; `DailyLoadStatus.overloaded` means < 45 (naming trap F03-FG-11) |

**Gap the foundation cannot express (recorded, not invented):** it collapses "known transition physically fits but leaves
≤ 22 minutes" and "known transition does not fit" into one tier, `overloaded`. Calendar keeps the tier as the foundation
gives it and adds a *geometric fact* (slack < 0 ⇒ the transition does not fit) to separate scenarios C and D. The slack
comparison is arithmetic on stored values, not a threshold.

**Monotonic rule (D-03).** Unknown travel/duration can only reduce capacity. Therefore an `overloaded` verdict is stated
regardless of unknowns, while `open`/`tight`/"fits" require complete evidence; without it `tier` is `null` and the missing
facts are listed.

## 9. Projection scope plan (contract §65)

Calendar is a **projection engine**, not a scheduler. Allowed, deterministic, and the only operations implemented:

1. fixed/flexible classification (read from `commitment`)
2. interval normalisation (instants → elapsed minutes from the day's start)
3. chronological ordering with the foundation's tie-break (start, end, id)
4. overlap detection (foundation `detectOverlaps`)
5. known-transition conflict (slack = gap − stored transition; stored values only)
6. feasible-gap computation against currently known occupied intervals (merge + single sweep)
7. direct dependency validation (one hop, typed edges)
8. responsibility projection (index by ref)
9. foundation tier classification
10. current-state action availability (§ action map)

**Prohibited and absent:** schedule search, permutations, backtracking, multi-step rearrangement, alternative-schedule
generation, transitive dependency solving, splittable-task chunk planning (a `splittable` task is reported as
*not evaluated*, never as "cannot fit"), heuristics that imitate an LLM planner.

**Complexity:** sorting/indexing, not repeated scans — day projection O(n log n + t·g) where *n* = commitments, *t* =
unplaced tasks, *g* = gaps; week = 7 day projections. No combinatorial growth. Measured on dense fixtures in C8 against the
soft targets (< 50 ms day, < 150 ms week, median).

**Placement rule (E/F/G/H/K/AF).** For a flexible, dated-or-planned, unscheduled task with usable duration *D* and window *W*:
- *certain fit* — a gap ≥ D exists whose edges carry no material unknown → **opening** (never auto-scheduled);
- else an *optimistic fit* (unknowns as zero) exists → **insufficient information**, missing facts named;
- else → **PLACEMENT_FAILURE** ("Needs a place") with the gaps considered as evidence.
Dependency lower bounds (a predecessor's known end) shrink *W* before any of this. `DUE BY 5 PM` is a window upper bound,
never a scheduled time.

## 10. Shared files touched (parallel-branch collision ledger)

Planned minimal surface. Filled in with commits as they land.

| Path | Reason | Commit | Likely sibling collision | Integration reconciliation |
|---|---|---|---|---|
| `app/(app)/calendar.tsx` | Calendar's own tab route; now a one-line re-export of the feature-owned `CalendarScreen` (REFINE) | C3 `0aecd5d` | none expected (Today = `today.tsx`; Life, Systems, AI have their own files) | none |
| `app/gallery.tsx` *(only if used for visual evidence)* | one import + one section rendering feature-owned scenes | C8 | **likely** — every sibling may add a section | trivial merge; each section is feature-owned |

New feature-owned paths (no sibling collision): `src/features/calendar/**` (new files; `EventForm.tsx` unchanged),
`tests/calendar*.test.mjs`, `tests/support/calendar*.mjs`, `tests/fixtures/calendar/**`, `docs/builds/HK_FEATURE_03_*`.
**Not touched:** `app/(app)/_layout.tsx`, `app/_layout.tsx`, `src/domain/**`, `src/design/**`, `src/persistence/**`,
`supabase/**`, `package.json`, `package-lock.json`, `app.json`.

## 11. Action availability map

Committed separately: `docs/builds/HK_FEATURE_03_ACTION_MAP.md` (T1 gate). Summary: MOVE (event, task), KEEP, DROP,
SHORTEN, PROTECT and UNDO are available **on the logical day only** for what the live foundation verdict offers (PROTECT
for any non-elapsed flexible item); EDIT is available on any day through the existing editors; COMPLETE, PLACE, DELEGATE
and recurrence edits are deliberately not surfaced.

## 12. Missing global primitives register (single authority)

Encountered while planning. Feature-local composition noted; likely to be re-discovered by sibling features.

| # | Need | Where | Limitation | Temporary composition | Likely elsewhere | Type |
|---|---|---|---|---|---|---|
| MGP-01 | **Agenda row**: time range + title + state marks + optional detail affordance | day list | no time-list primitive; `TimelineList` is Today-coupled and single-day | feature-local presentational `AgendaRow` from `AppText` + `Tag` + `Divider` | Today, Systems | UI |
| MGP-02 | **Day selector / segmented control** | week strip, Day/Week switch | `SegmentBar` is a progress bar, not a selector; `ChipToggle` has no `disabled`/hint | compose with `ChipToggle` (role button + selected) | Life, Systems | UI |
| MGP-03 | **`waiting` Card tone** and accessibility passthrough on `Card`/`Tag`/`SegmentBar` | responsibility marks, notes | `Card` tones lack `waiting`; no `accessibilityLabel` props | wrap in a labelled `View`; use `InlineNotice tone="waiting"` | Today, Talk It Out | UI |
| MGP-04 | **Capacity / conflict / unknown-state wording** | Calendar + Today | each feature writes its own strings | Calendar-owned `copy.ts` (see §15 shared-copy candidate) | Today | COPY |
| MGP-05 | **Time formatting** (12-hour clock, range, elapsed duration) | agenda rows | `formatTime` lives inside `daily-load/computeDailyLoad.ts` | feature-local `format.ts` (does not import Today) | Today, Systems | UI |
| MGP-06 | **Per-date schedule projection** with DST-correct elapsed minutes and no future-overdue backlog | Calendar, week | `projectDay` is wall-clock and backlog-inflating (F03-FG-03/06) | feature-local `model/` projection | Today (tomorrow preview), Systems | DOMAIN-PROJECTION |
| MGP-07 | **Store revision / snapshot token** | preview staleness | no revision counter (F03-FG-12) | reference identity of the slices Calendar reads | Talk It Out (pending interpretations) | DOMAIN-PROJECTION |
| MGP-08 | **Task time-of-day editing** | Needs a place → act | `TaskForm` has no plan/time field | none; Calendar shows openings only | Today, Systems | ACTION-MAP |

---

## 13. C1 internal engineering checkpoint — self-review

Re-read §4–§12 against each other for contradictions.

| Check | Result |
|---|---|
| Does any planned classification use a Calendar-owned threshold? | No — every tier comes from `loadTierForBuffer` / `assessDailyLoadIssues`. |
| Does any planned display convert unknown → zero? | No — the `null` tier + missing-evidence list is the only unknown representation; inherited `?? 0` sites are not extended. |
| Does any planned action lack a mutation? | No — every **Yes** row in the action map names an existing function. |
| Does preview need a mutation Calendar would invent? | No — preview runs the *same pure transition* on an in-memory copy of state and re-projects. It cannot diverge from accept. |
| Is a second source of truth created? | No — nothing derived is persisted; `RevisionToken` is in-memory. |
| Is shared foundation modified? | No — every gap is worked around feature-locally (§6). |
| Missing foundation semantics that block a requirement? | **G/AF partially** (F03-FG-01) — handled by D-01 and recorded as OD-01; not a blocker for the feature. **No blocker found.** |
| Conflicting capacity truth? | The DST divergence from Today (D-04) is deliberate, bounded to two days a year, and recorded as an integration candidate. |
| Action mutation ambiguity? | None — all actions are today-only by foundation design; read-only elsewhere. |
| Shared-foundation change required? | No. |

**Result: coherent. Continue autonomously to C2.** No owner decision is required to proceed; OD-01 and the deferred
actions (PLACE, COMPLETE) are recorded for the owner and do not block the build.

---

## 14. UI-system consumption (HK-FE-UI-01, actual exports)

Calendar consumes the permanent system and adds no second one. Everything below is imported from `src/design`.

| Need | Consumed | Notes |
|---|---|---|
| Page | `Screen` (scroll, safe area) | unchanged |
| Type | `AppText` variants `display`, `screenTitle`, `bodyStrong`, `body`, `supporting`, `metadata`; `Overline` | new rungs, not the legacy aliases the old Calendar used |
| Surfaces | `Card tone="surface"` only | other tones have no vetted text pairings, so conflict emphasis is a **text label**, not a card color |
| Status marks | `Tag` (`attention` / `neutral`) | text is always uppercase words: OVERLAP, NOT ENOUGH TIME, FITS NARROWLY, NEEDS A PLACE, NOT CONFIRMED |
| Selection | `ChipToggle` (Day/Week) | role button + selected state |
| Actions | `Button` (`primary`/`secondary`/`ghost`, `sm`) | text labels carry the meaning |
| System states | `LoadingState`, `EmptyState`, `InlineNotice tone="waiting"` | three distinct states: loading, recovery, known-empty |
| Evidence | `WhyThis` behind a Calendar-local toggle | MGP-09: `WhyThis` is always visible, so disclosure is composed locally |
| Tokens | `colors.*` flat aliases, `spacing`, `interaction.pressedOpacity`, `sizing.minTouchTarget` | every pressable has `minHeight >= 44` (tested) |

**Contrast:** the only pairings used — `text.primary/secondary/muted` and `status.waiting` on `background`/`surface.primary`,
`status.attention` on `surface.primary`, `action.primary` on `background` — are all already in the contrast matrix `INTENT`
map, so `tests/design-system/contrast.test.mjs` and `contrast-matrix.md` are untouched.

**Deliberately not used:** the intelligence blocks other than `WhyThis` (`RecommendationBlock` arrives with C6). `ConfidenceBadge`
and `InsightBlock` are for inferences; every Calendar conclusion is a deterministic fact from typed state, and the design system's own
rule is "no domain counterpart = do not invent one in the UI". `LoadMeter`/`SegmentBar` are not used: capacity is a word with evidence,
not a meter.

## 15. Shared copy candidate (contract 55A): CAPACITY / CONFLICT / UNKNOWN-STATE LANGUAGE

Feature 01 Today and Feature 03 Calendar will describe the **same** underlying states. Calendar's wording lives in
`src/features/calendar/copy.ts`; it is not imported from Today and not exported for Today, and no shared copy module is created here.

| Foundation semantic | Calendar wording | Today likely renders it? | Reconciliation needed |
|---|---|---|---|
| `tier: open`, evidence complete | "Everything scheduled fits." · category **Room** | yes ("Nothing needs moving.") | one voice for "fits" |
| `tier: tight` / narrow transition | "A to B fits, with 15 min to spare." · **Tight** / **Fits narrowly** | yes ("one window is too tight") | Today says "too tight" for a state that physically fits |
| `tier: overloaded` via overlap | "A and B overlap by 30 min." · **More than fits** | yes ("Two of today's commitments overlap.") | near-identical; pick one |
| `tier: overloaded` via capacity pressure | "More is planned than the day has room for: X planned, Y available." | yes ("more on it than it can hold") | Today's phrase edges toward the day having a character |
| transition longer than its gap | "…is shorter than what you entered for getting there." | partly | Today calls it "travel-aware" |
| `tier: null` (not known) | "Not enough is entered to say whether this day fits." | **no** — Today has no unknown state | Today should adopt one, or it will contradict Calendar |
| unknown travel / duration | "Travel time after X isn't entered." · "X: no duration is recorded." | no | new to Today |
| delegated, not accepted | "Waiting for Marcus to accept" | possibly (attention: unacknowledged delegation) | one responsibility vocabulary |
| PLACEMENT_FAILURE | "Needs a place" | possibly | one term |

**Known cross-feature contradiction to reconcile:** on the two DST days Calendar and Today can disagree (F03-FG-03); on every other
day they are equal (equivalence-tested against `loadTierForDay`).

## 16. Minimum-shippable calendar core — checkpoint recorded at C4

**MINIMUM SHIPPABLE CALENDAR CORE = YES**

This is the clean, high-value, resumable point before week view and hardening. It is **not** a full Feature 03 PASS.

| Gate | Result |
|---|---|
| C2 projection / view model | done (`src/features/calendar/model`, 10 modules + availability + presentation) |
| C3 operational day / agenda | done (day view; route `calendar.tsx` refined) |
| C4 conflict + capacity + Needs-a-Place presentation | done (summary category word, conflict cards with evidence, "fits narrowly" cards, not-on-the-schedule-yet section, named unknowns) |
| Tier 1 projection scenarios through that scope | A, B, D, F, G, I, L, P, AF have explicit assertions **and** committed structural evidence; W's model + press-to-editor path also proven |
| TypeScript | green (`tsc --noEmit`) |
| App tests | 913 pass / 0 fail (808 entry + 105 new); **no entry test missing** (mechanical check against the entry inventory) |
| Backend baseline | 684 / 684 checks passed (re-run at this checkpoint) |
| Foundation drift | none: `git diff 5007b0f -- src/domain src/persistence src/design src/store src/state src/platform src/config src/data supabase src/features/daily-load src/features/today src/features/tasks src/types package.json package-lock.json app.json` is empty |
| Shell drift | none: `app/_layout.tsx`, `app/(app)/_layout.tsx`, `app/gallery.tsx`, `event-editor.tsx`, `task-editor.tsx` unchanged |
| Shared files touched | exactly one: `app/(app)/calendar.tsx` (Calendar's own tab route) |

**Design correction made at C4 (found by re-reading the UI against the scenarios):** the foundation tiers a transition that fits with
15 minutes to spare as `overloaded`, the same as one that cannot fit. A tier tag reading "More than fits" over a sentence saying it fits
would be false (scenario C vs D). The foundation tier is left untouched as audit data; a deterministic word-level `category`
(`room` / `tight` / `more_than_fits` / `not_known`) is derived from the tier and the physical facts (a stored fact violated, or less time
than needed) — no threshold is introduced. Tests pin both the category and the rendered wording.

---

## 17. Scenario matrix (A–AI)

Every applicable scenario maps to a fixture, foundation inputs, view-model assertions, action assertions where relevant, structural
evidence and render evidence. **Scenario prose is not coverage**: each row names where it is asserted.

Files — projection `calendarProjection` · time `calendarTime` · UI `calendarUi` · week `calendarWeek` · actions `calendarActions` · action UI
`calendarActionsUi` · hardening `calendarHardening` · a11y `calendarA11y` · render `calendarRender` · validation `calendarValidation` · perf `calendarPerformance`.
Fixtures are built through the app's own domain mutations in `tests/support/calendarScenarios.mjs`.
Evidence: `tests/fixtures/calendar/scenarios/<ID>.json` (structural) · `tests/fixtures/calendar/render/day-<ID>.txt` (render).

| ID | Tier | Scenario | Status | Where asserted | Structural / render evidence |
|---|---|---|---|---|---|
| A | 1 | Ordinary feasible day | **PASS** | projection "A —"; UI first-glance | A.json · day-A |
| B | 1 | Fixed overlap | **PASS** | projection "B —"; UI | B.json · day-B |
| D | 1 | Impossible transition | **PASS** | projection "C / D"; UI | D.json · day-D |
| F | 1 | Flexible item cannot fit | **PASS** | projection "E / F", category | F.json · day-F |
| G | 1 | Unknown duration | **PASS** (representable subset — see OD-01) | projection "G / H / AF"; UI | G.json · day-G |
| I | 1 | Delegated but unresolved | **PASS** | projection "I / J"; UI | I.json · day-I |
| L | 1 | Date-only | **PASS** | projection "L"; UI | L.json · day-L |
| P | 1 | Sparse day | **PASS** | projection "P"; UI | P.json · day-P |
| W | 1 | Correction / edit route | **PASS** | projection "W" (a real `updateEvent` changes the conclusion); UI (press → that item's editor); validation (route is a one-line re-export) | — |
| AF | 1 | Insufficient information | **PASS** | projection "G / H / AF" (all five assertions); UI | AF.json · day-AF |
| C | 2 | Tight but feasible transition | **PASS** | projection "C / D" + category; UI | C.json · day-C |
| E | 2 | Flexible item fits | **PASS** | projection "E / F"; UI | E.json · day-E |
| H | 2 | Unknown travel | **PASS** | projection "G / H / AF"; UI | H.json · day-H |
| K | 2 | Dependency order | **PASS** | projection "K" (control included) | K.json · day-K |
| M | 2 | Child-scoped commitments | **PASS** | projection "M" | M.json · day-M |
| N | 2 | Move preview | **PASS** on today; **SAFE-UNAVAILABLE** on any other day (F03-FG-08) | actions "N"; action UI | N.json · day-N · preview-N-current/-stale |
| Q | 2 | Dense day | **PASS** | UI "never a wall of cards", "dense"; perf | Q.json · day-Q · day-dense |
| R | 2 | Week overview | **PASS** | week suite | R.json · R.week.json · week-R |
| S | 2 | Timezone | **PASS** | projection "S"; hardening "S" | — |
| V | 2 | Logical-day rollover | **PASS** | projection "V"; UI presentation state | — |
| AG | 2 | Preview staleness | **PASS** | actions "AG"; action UI (stale + updated panels) | preview-N-stale |
| J | 3 | Accepted responsibility | **PASS** | projection "I / J" | J.json · day-J |
| O | 3 | DROP / SHORTEN / PROTECT | **PASS** — only these render | actions "O"; action UI | O.json · day-O · preview-O-shorten |
| T | 3 | DST spring forward | **PASS** | time "T"; hardening "T" | — |
| U | 3 | DST fall back | **PASS** | time "U"; hardening "U" | — |
| X | 3 | Demo isolation | **PASS** | hardening "X" | — |
| Y | 3 | Loading vs empty | **PASS** | hardening gate; UI | state-loading |
| Z | 3 | Recovery / quarantine | **PASS** | hardening gate (projection never reached) | state-recovery |
| AA | 3 | Preview cancel | **PASS** | actions "AA" (same state object, no write) | — |
| AB | 3 | Idempotent accepted move | **PASS** | actions "AB" (concurrent double accept) | — |
| AC | 3 | Recurrence foundation input | **PASS** (rule metadata only; no engine, no Feature 04) | projection "AC/AD"; validation scan | AC.json · day-AC |
| AD | 3 | Multi-day | **PASS** (supported at the common fork via instants) | projection "AC/AD"; UI | AD.json · day-AD |
| AE | 3 | Same day at 08:00 / 15:00 / 21:00 | **PASS** | projection "AE" | — |
| AH | 3 | Restart during preview | **PASS** | actions "AH" | — |
| AI | — | Move then emergent conflict | **PASS** | projection "AI" | — |

**Summary:** 0 FAIL · 0 DEFERRED-IN-RUN · 0 NOT-APPLICABLE · PASS 35 (all 35 scenarios in the contract) · SAFE-UNAVAILABLE noted for N off-today
and for the PLACE / COMPLETE actions (§11, §21). All Tier 1 and Tier 2 resolved; all Tier 3 resolved.

## 18. Structural and render evidence

| Artifact | Path | Count |
|---|---|---|
| Structural evidence, day view model | `tests/fixtures/calendar/scenarios/<ID>.json` | 21 (A–R, AC, AD, AF) |
| Structural evidence, week | `tests/fixtures/calendar/scenarios/R.week.json` | 1 |
| Render evidence (what is shown + what a screen reader announces) | `tests/fixtures/calendar/render/*.txt` | 29 |
| Entry test inventory | `docs/builds/HK_FEATURE_03_ENTRY_TEST_INVENTORY.txt` | 808 |

Each is compared byte-for-byte by a test. A changed conclusion is a visible diff; regenerate only after review with
`UPDATE_CALENDAR_EVIDENCE=1`. **Evidence review changed the product four times** (§20: DEF-04..DEF-07) — the point of committing it.

**Not captured — pixel screenshots.** A second Android emulator could not start (host commit charge exhausted: 3.8 GB free, 4 GB
needed) and the only running emulator was in active use by another session, serving another branch on Metro 8081 — it was not
touched. **Layout, color and native focus behaviour are therefore NOT verified at runtime**; they are verified only by the
component-tree assertions above and by design-system reuse. This is the honest gap in this run, recorded as EXTERNAL-CONSTRAINT.

## 19. Performance (contract §65, §70) — medians of repeated runs, local reference environment

| Measurement | Fixture | Median | Target |
|---|---|---|---|
| Single-day projection | 60 commitments + 20 tasks | **11.3 ms** | < 50 ms |
| Seven-day projection | 210 commitments + 70 tasks | **5.3 ms** | < 150 ms |
| Day with 10 handoffs + 9 dependencies | 30 commitments + 12 tasks | 4.8 ms | < 50 ms |
| One day of a household with 3000 stored rows | — | 8.5 ms (digest of the whole state 8.9 ms) | < 50 ms |
| Growth: 25 → 100 commitments (4× input) | dense | **×3.3** | not combinatorial |

**A regression I introduced was found by measuring and fixed** (DEF-02): action availability dry-ran every flexible item's mutation and
each foundation mutation recomputes the whole day's verdict, so a dense day cost **108 ms** and 4× input cost **×28.7**. Availability now
reads which items the foundation's own verdict names (computed once) and still confirms each with the real dry-run: **11.3 ms, ×3.3**.
A test now guards the growth ratio. No cache, optimizer shortcut or duplicated truth was added.

## 20. Defects found and repaired (builder validation — not the independent audit)

| ID | Defect | How found | Repair | Guard |
|---|---|---|---|---|
| DEF-01 | Capacity word contradicted the sentence: the foundation tiers a transition that fits with 15 min to spare as `overloaded`, so a tag read "More than fits" over "fits, with 15 min to spare" (scenario C vs D) | re-reading the UI against the scenarios | deterministic `category` from tier + physical facts; tier untouched | projection + UI tests |
| DEF-02 | Cubic-cost action availability (108 ms dense day) | performance measurement | candidates from the foundation's verdict, dry-run to confirm | growth-ratio test |
| DEF-03 | Fall-back day displayed an event across the repeated hour as "1:30–1:30 AM" although geometry was right | reading the DST scenario's output | frame finds the repeated hour; labels inside it carry the zone | hardening "U" tests |
| DEF-04 | Headline repeated the conflict card's own sentence | reading render evidence | headline names the kind; card names the commitments | UI "never repeats" test |
| DEF-05 | A task with **no place anywhere** sat under a "Tight" tag | reading render evidence | `PLACEMENT_FAILURE` counts as more than fits, at any tier | projection tests |
| DEF-06 | "Not known yet" list was alphabetical | reading render evidence | day order, then travel-to, travel-after | UI test |
| DEF-07 | Dense day rendered **eleven** identical "fits narrowly" cards ahead of the schedule | adding scenario Q | more than two tight windows become one grouped card; headline no longer echoes a card | UI tests, Q evidence |
| DEF-08 | Screen-reader hints hard-coded in components, outside `copy.ts` | copy-verification scan | moved to `copy.ts` | scan |

Test-authoring errors caught by running tests (wrong expected string, a fixture with a hidden 5-hour gap, an over-broad regex matching
"log**ical**Day") were corrected in the tests; the product was right each time and each is recorded in the commit history, not as a defect.

## 21. Owner decisions and CONSIDERED + DEFERRED (contract §78)

### OD-01 — Unknown task duration is not representable (owner decision; not resolvable by the WHY-doctrine)

`addTask` stamps 15 minutes when none is given; the form pre-fills 15; an interpretation with a null duration becomes a 15-minute task.
A defaulted 15 is indistinguishable from an entered 15 (F03-FG-01). Calendar words every duration as an **estimate**, treats a recorded
`0` as *no usable duration* (no fit claimed either way, never counted as zero time), and cannot detect a defaulted 15.
Options (each needs a **new durable semantic**, which this build may not invent): **(A)** make task duration nullable (the cloud column
`duration_minutes` is already nullable in `foundationSpecs`); **(B)** add a provenance / `durationSource` marker (`entered` | `defaulted`);
**(C)** keep the default and label every duration "about" everywhere. The doctrine ranks *preserve truth* first, which favours A or B,
but choosing between them changes canonical state and migration — an owner call.

| Item | State | Why not built here |
|---|---|---|
| PLACE a task at a time (`updateTask` plan) | **PENDING-OWNER** | the domain allows it but no UI sets a task's time; adding one is a new interaction, not an inherited action. Calendar shows *where room exists*, never fabricates a time |
| COMPLETE a task from Calendar | **PENDING-OWNER** | a mutation exists (`completeTask`, no reopen); completing work is an execution flow owned by Today/Life |
| Task time-of-day editing (MGP-08) | **PENDING-INTEGRATION** | prerequisite for PLACE |
| Timed-task vs event overlap as a conflict | **PENDING-INTEGRATION** | the foundation's tier does not classify it; reporting it would make the word contradict the tier |
| Splittable-task chunk planning | **PENDING-INTEGRATION** | reported as *not evaluated*, never as "cannot fit" (§65 forbids a chunk solver) |
| `PROTECTED_TIME_CONFLICT` | **ABSENT** | no typed protected-time fact exists (protect = flip to fixed) |
| Month view | **DROPPED** | not inherited and not needed for "can my life fit" |
| Filtering | **DROPPED** | not inherited; not introduced (§52) |
| All-day events | **ABSENT in foundation** | events are two Instants; date-only exists only for tasks (F03-FG-09) |
| Per-date recommendation actions | **PENDING-INTEGRATION** | foundation is today-only by design (F03-FG-08) |
| Household capacity profile overrides | **PENDING-INTEGRATION** | stored but unread by Daily Load (F03-FG-02); reading it here would make a second threshold source |
| External calendar providers / sync | **PERMANENT-DEFER (out of scope)** | no provider, credential, OAuth or polling exists anywhere in Calendar (validation scan) |
| Planner (LLM) implementation | **PENDING-INTEGRATION** | contract documented in `HK_FEATURE_03_PLANNING_CONTRACT.md`; no code |
| Gallery section for Calendar scenes | **DROPPED** | would touch the shared `app/gallery.tsx`; replaced by committed render evidence |
| Meals and Needs Me items on the day | **DROPPED for now** | date-only sources outside events/tasks; Needs Me is excluded from capacity by the foundation |
| Pixel screenshots | **EXTERNAL-CONSTRAINT** | see §18 |

## 22. Integration candidates (contract §77)

| Candidate | Feature 03 side | Expected other side | Common-fork assumption | No-direct-dependency proof | Future question |
|---|---|---|---|---|---|
| Calendar capacity → Today | `capacityState` (foundation tier + word) and conflicts, derived per day | Today renders the same states from `computeDailyLoad` | both read the same foundation classification; equal on every non-DST day (equivalence-tested) | no `features/today` import (validation scan) | one wording (§15); Today gains a "not known" state; DST projection fix (F03-FG-03) |
| Shared capacity/conflict/unknown copy | `copy.ts` | Today's strings | wording lives feature-locally | no shared module created | reconcile into one product voice |
| Talk It Out accepted commitments → Calendar | reads `events`/`tasks` from canonical state | Feature 02 writes accepted interpretations as rows | rows appear in canonical state | Calendar reads state only | do accepted rows carry duration/travel, or default (OD-01)? |
| Talk It Out unresolved time-sensitive attention | none (Calendar does not read attention) | shared attention layer | — | no import | should an unplaced due-today item feed attention? |
| Systems recurrence → Calendar | shows rule *metadata* on an existing concrete row; never evaluates a rule | Feature 04 produces occurrence rows or a projection | occurrence = a concrete event/task row (no occurrence collection exists) | no `structure.ts` occurrence calls (scan) | where do generated occurrences live, and do they carry a rule ref? |
| External calendar providers | none | provider adapters | `externalReferences` exist as provenance | no provider code | mapping provider events → canonical events |
| LLM planning | typed contract only | planner | previews run the real mutation | no AI code (scan) | who validates suggestions? (answer given: dry-run through `computePreview`) |
| Store revision | reference-identity token (F03-FG-12) | a real revision on the store | — | Calendar-local | replace the token with the store's revision |

## 23. Future planning contract / LLM readiness

Defined in `docs/builds/HK_FEATURE_03_PLANNING_CONTRACT.md`: `CalendarPlanningInput`, `CalendarPlanningSuggestion`,
`CalendarPlanningResult`, and the rules that keep the deterministic projection authoritative. **No planner code, prompt, model
configuration, Gemini call or generic AI service exists** (validation scan). The *downstream half* of the flow — typed suggestion →
review → legitimate mutation — is built and tested (`PreviewableIntent`, `computePreview`, `acceptIntent`).

## 24. Missing global primitive register — additions found in C3–C8

| # | Need | Where | Limitation | Temporary composition | Likely elsewhere | Type |
|---|---|---|---|---|---|---|
| MGP-09 | **Disclosure toggle** for evidence | conflict cards, rows | `WhyThis` is always visible | `ToggleLink` + `WhyDisclosure` (feature-local) | Today, Talk It Out | UI |
| MGP-10 | **Grouped summary card** so dense days are not a card wall | narrow transitions | no grouping primitive | `MAX_INDIVIDUAL_NARROW_CARDS` + one grouped card | Today, Life | UI |
| MGP-11 | **Repeated-hour clock label** | fall-back day | no shared time formatter knows the zone | `formatClock(..., { ambiguous })` in `format.ts` | Today, Systems | UI |
| MGP-12 | **RecommendationBlock secondary label control** | capacity offer | "Show another option" label is fixed | primary + alternative wired to preview | Today | UI |
| MGP-13 | **Reading order / heading contract** for a day | day view | no shared rule for heading count | one heading per view (tested) | Life | UI |

---

*Section 25 (exit gates, completion status, verdicts) is appended when the gates finish.*
