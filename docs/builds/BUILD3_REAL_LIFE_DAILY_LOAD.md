# Build 3 — Real-Life Daily Load

**Branch:** `build/03-real-life-daily-load`
**Base SHA:** `a546ec274709d503d43bd18f5a9185a66caf594d` (Build 2.5 monetization foundation)
**Final SHA:** `8312372682e829814c90afa96e38db027cabe979` (this documentation commit; `3cf331e16d4fbef25b9066957b4a46c5e41db025` is the last code commit it documents)
**Not pushed. No PR. No merge.**

---

## 1. What this build is

Build 2 gave Her Keys a real, audited persistence foundation, but only the seeded "Ellis Household" ever had events, tasks, systems or a One Move — a real/empty household got nothing to reason about. Build 3's mandate: let a real household enter real events, tasks and loose obligations, and have the Daily Load, Recommendation, One Move and Tomorrow Preview machinery reason over that real data instead of a fixture.

**The final product test this build was built to pass:** can a real mother enter the obligations of an ordinary Wednesday and have Her Keys tell her something specific, correct, and useful that she would otherwise have had to mentally figure out herself? See §11 for the answer.

---

## 2. Architecture changes

### Schema v2 (`src/domain/state.ts`, `src/persistence/envelope.ts`)

`CURRENT_SCHEMA_VERSION` bumped 1 → 2, with a real migration (the first one this codebase has ever needed — `migrationPlan.migrations` was an empty `Map` before this build).

- **`CalendarEvent`** gains `commitment` (`'fixed'|'flexible'`), `status` (`'active'|'removed'` — soft delete, never hard-deleted, because a historical `ActionRecord` can reference an event id and `findIntegrityProblems` would otherwise flag it as corrupt), `notes`, `travelMinutesBefore`/`travelMinutesAfter`/`preparationMinutes` (all nullable — user-entered only, never computed), `source` (`'user'|'demo'`), `createdAt`/`updatedAt` (nullable).
- **`Task`** gains `status` (`'open'|'completed'|'archived'`), `notes`, `completedAt`, `createdAt`/`updatedAt` (nullable). A `superRefine` enforces `completedAt !== null ⟺ status === 'completed'`, mirroring the existing `OneMoveRecordSchema` pattern.
- **New `NeedsMeItem`**: `{ id, title, status: 'open'|'resolved', dueDate, categoryId, createdAt, scope }` — `categoryId` and `dueDate` nullable, so capture never requires classification.
- **`OneMoveRecord`** gains `targetType: 'catalog'|'task'|'needsMe'`, so it can point at real data instead of only the demo catalog.
- **`ActionRecord`** union gains `daily_load.move_event`, `daily_load.drop_task`, `daily_load.shorten_task`, `daily_load.keep_capacity_plan`, `daily_load.protect_item`.
- **`findIntegrityProblems`** extended for `needsMe` uniqueness/category references, `OneMoveRecord` target references, and reference checks for all five new action types.

**Migration `migrateV1ToV2`**: every pre-existing event becomes `commitment: 'fixed'` (never assumes an existing commitment was safe to move) and `source: 'demo'` (only the demo seed ever produced an event before this build); every unknown timestamp becomes `null`, never fabricated. A frozen `AppStateSchemaV1` lives in the new `src/persistence/legacySchemas.ts` — a deliberate, permanent duplicate of the v1 shape, used only to validate data before migration, so it can never accidentally drift when `domain/state.ts` changes again for v3.

**Design decisions worth flagging:**
- **No `householdId` field was added to individual records.** `AppState` is already scoped to exactly one household; every existing record type already omits it for the same reason. This differs from the owner's abstract field list, deliberately — adding it would be a schema-consistency regression.
- **`createdAt`/`updatedAt` are nullable** rather than backfilled with an invented timestamp. Real gaps in history are represented honestly as `null`.

### Real CRUD (`src/domain/events.ts`, `src/domain/tasks.ts`, `src/domain/needsMe.ts`)

The first real, persistent write paths a real/empty household has for these entities. `addTask`/`addEvent` default sensibly (`durationMinutes: 15`, `commitment: 'flexible'`) so capture stays fast (title + category is enough for a task; title alone for a Needs Me item). Edit/complete/archive/remove all follow the existing pure `(state, ctx, input) => AppState` transition shape used throughout the codebase.

`projectDay` now filters to `status === 'active'` events / `status === 'open'` tasks, carries `commitment`/travel-prep minutes onto the projected event, and adds `daysOverdue` to the projected task (additive — the existing `dueToday` field's meaning is untouched, so nothing that already read it changed behavior).

---

## 3. Daily Load rules

`computeDailyLoad` (the tested, transition-buffer engine from Build 2) is **completely untouched** — not one line changed. All new detection lives in `src/domain/dailyLoadIssues.ts`, layered on top:

| Issue kind | What it detects | Maps to tier |
|---|---|---|
| `overlap` | Two **fixed** commitments whose ranges intersect. Notice only — nothing here can be safely automated. | `overloaded` |
| `transition_conflict` | The tightest raw gap is overloaded (`source: 'raw'`, unchanged from `computeDailyLoad`'s own number), **or** a separately-computed travel-aware read pushes an otherwise-open gap into overloaded once her own entered travel/prep minutes are subtracted (`source: 'travel_aware'`). These are deliberately kept as **separate detections**, never merged into one buffer formula. | `overloaded` |
| `capacity_pressure` | Today's flexible, not-due, not-overdue task minutes exceed what's left in a fixed, named, tested day window (`CAPACITY_DAY_START_MINUTES` = 6:00 AM, `CAPACITY_DAY_END_MINUTES` = 10:00 PM, household-timezone wall clock), after fixed commitments (and their own entered travel/prep) are subtracted. | `overloaded` |
| `tight_window` | The tightest raw gap is tight (23–44 min) but not yet overloaded. | `tight` |
| `overdue` | A task past its due date. Reporting only — never a movable candidate (already excluded from `computeDailyLoad`'s candidates via the existing `!dueToday` rule, which also now catches overdue items). | does not affect tier |

**Vocabulary is fixed at `open`/`tight`/`overloaded`** — Build 2's existing `LoadTier`. No new status words anywhere. `assessDailyLoadIssues` selects exactly one `primary` issue by a fixed severity order — **overlap > transition conflict > capacity pressure > tight window > overdue** — with deterministic tie-breaks inside each detector (earliest start time, then id). Today only ever shows this one verdict, matching "one thing at a time" rather than a multi-card surface.

**Negative controls, tested:** travel time is never invented (no travel/prep minutes entered → the travel-aware detection never fires, however tight the raw gap); overdue minutes never enter capacity math; a genuinely reasonable day reports no material issue.

---

## 4. Recommendation rules (`src/domain/recommendationActions.ts`)

**Built: MOVE, DROP, SHORTEN, PROTECT.** **Not built: DELEGATE, REPLACE** — there is no delegate-target concept (no co-parent/partner data model exists) and no alternative-item catalog to offer, and faking either would mean claiming an execution capability Her Keys doesn't have.

- **MOVE**, per entity, defined precisely: a task's move writes `Task.plan = { kind: 'day', date: tomorrow }` (not `dueDate`, which stays the original obligation deadline — existing Build 2 behavior, unchanged). An event's move shifts `startsAt`/`endsAt` by one logical day, preserving duration exactly, computed DST-safely from the household's own wall clock (`zonedTimeToEpochMs`/`wallClockMinutesAt`) rather than adding 24 hours. A flexible event move **shares the existing, tested one-decision-per-day transition gate** with task moves (`latestTransitionDecision`, exported from `dailyLoadDecisions.ts`) — it's the same tightest-window issue, just a different candidate item type.
- **DROP** archives the exact task the current capacity-pressure verdict names (`largestTaskId`) — never an arbitrary other task.
- **SHORTEN** reduces that same task's duration by exactly the reported shortfall, floored at 15 minutes. Both numbers in the action's `reason` are read straight from the live `CapacityPressureIssue` — never fabricated.
- **PROTECT** flips a flexible task or event's `commitment` to `'fixed'`. No new schema field needed — every existing candidate filter across the codebase already respects `commitment === 'flexible'`, so this is honestly reversible (by editing the item) and immediately effective everywhere.
- **DROP/SHORTEN/keep** share their own independent one-decision-per-day gate (`latestCapacityDecision`), separate from the transition gate, since capacity pressure is a different issue family — declining a transition-move recommendation does not block a later capacity-pressure recommendation the same day, and vice versa.

Every approval function re-validates the target against a **freshly computed** assessment before mutating anything — a stale screen can never move/drop/shorten/protect something that is no longer the live issue.

**Persist-before-acknowledge:** the four new dispatchers in `ScheduleContext` use `store.commit(...)` (durable-before-shown, `Promise<boolean>`) rather than `dispatch()` (fire-and-forget). The existing, tested `move_task`/`keep_plan` dispatchers were deliberately left exactly as `dispatch()` — this is a scoped inconsistency, not an oversight: retrofitting tested code for a stronger guarantee it wasn't built against was judged riskier than the inconsistency itself.

---

## 5. One Move (`src/domain/oneMove.ts`)

Real/empty households now draw from her own **open tasks already on today's radar** (due today, overdue, or planned/timed for today — the same day view Daily Load reads) and **open Needs Me items**, instead of the prior "a real household has no catalog yet, so it is offered none" design. Smallest task first (`durationMinutes` ascending), then Needs Me items oldest-first. A task's own `durationMinutes` is its estimate — never invented. A Needs Me item has no reliable size, so `OneMoveItem.estimatedMinutes` is now **optional**, and a Needs Me-sourced move never claims a duration at all (`OneMoveCard` only renders "ABOUT X MINUTES" when a real estimate exists).

Withholding is unchanged in spirit: a candidate whose `effect` is `'adds_work'` is withheld on an `'overloaded'` day. Tasks ≤15 minutes are classified `'reduces_load'` (offered even when overloaded — they don't add meaningful work); everything else, including every Needs Me item (unknown size, conservatively treated as adding work), is `'adds_work'`.

Demo households are **completely unaffected** — `oneMoveCatalogFor`/the demo catalog path is untouched.

---

## 6. Tomorrow Preview (`src/domain/tomorrowPreview.ts`)

Pure, read-only. Projects `addDays(today, 1)` through the exact same `projectStateDay` → `computeDailyLoad` → `assessDailyLoadIssues` pipeline Today uses — no second engine, no second code path. "Tomorrow" is today's logical date plus one day in `state.user.timezone`, the same timezone authority every other logical-day calculation in Her Keys already uses; DST is handled the same way it already is everywhere else (`zonedTimeToEpochMs`/`wallClockMinutesAt`), with no special-casing needed. Never writes to tomorrow's facts — tested explicitly.

---

## 7. UI

- New modal routes `event-editor`/`task-editor` (same pattern as the existing `talk-it-out` modal), backed by `EventForm`/`TaskForm`. Date/time entry is **plain validated text** (`YYYY-MM-DD` / `HH:MM`), not a native picker — deliberately, to avoid a new native dependency mid-build. Both forms save via `store.commit`.
- Calendar gets an "Add event" button; `TimelineList` gained an optional `onPressItem` prop (default unset, so Today's usage is unchanged) that Calendar uses to open the editor for a tapped row.
- Life: a new shared `CategoryTaskList` (press-to-edit + "Add task" pre-filled with the category) is used by all five Overview components.
- Needs Me: a quick-add (title only) on the Life hub, a full triage list at `life/needs-me` (Promote to task / Resolved), and a bounded "On your mind" chip on Today — a count-plus-top-item pointer, never a growing list, labeled distinctly from the "Needs you" recommendation cards per the concern that the two names read too similarly side by side.
- `DailyLoadCard` now routes through all five issue kinds, still showing exactly one verdict, plus a "Protect it" action on every recommendation.
- Today gained a read-only Tomorrow Preview and a collapsed "Handled by Her Keys" ledger — built entirely from existing `ActionRecord`s (no new schema), with Undo on MOVE entries re-applying the stored `before` snapshot. Whether Today keeps its full timeline chronology, versus a bounded next-few-items slice, is left **open** — nothing about the existing `TimelineList` usage on Today was removed or changed.
- Empty real households get factual "nothing entered yet" copy (in `DailyLoadCard`, Calendar, Life task lists) rather than a blank view or a spinner, and rather than the "day is reasonable" verdict — those are different moments.

---

## 8. Persistence implications

No change to the write-serialization, hydration, mode-isolation, or corrupt-state-recovery mechanisms from Build 2 — all of it is reused exactly as audited. The only persistence-layer change is the schema bump itself, handled through the existing migration seam (previously unused). Demo/real mode isolation (`origin` field, checked at hydration) is untouched and still governs every new array (`needsMe`) the same way it already governed `events`/`tasks`.

---

## 9. Files changed

58 files, +3294/-135 (`git diff a546ec2...3cf331e --stat`). New domain modules: `events.ts`, `tasks.ts`, `needsMe.ts`, `dailyLoadIssues.ts`, `recommendationActions.ts`, `tomorrowPreview.ts`, `legacySchemas.ts`. New UI: `EventForm.tsx`, `TaskForm.tsx`, `CategoryTaskList.tsx`, `NeedsMeQuickAdd.tsx`, `NeedsMeList.tsx`, `HandledLedger.tsx`, `NeedsMeChip.tsx`, `TomorrowPreview.tsx`, `TextField.tsx`, plus the two new routes and `life/needs-me.tsx`. 9 new test files (`events`, `tasks`, `needsMe`, `dailyLoadIssues`, `recommendationActions`, `tomorrowPreview`, plus extensions to `oneMove`, `schema`, `persistence`, `categories`, `logicalDay`, `appStore`, `monetization`).

---

## 10. Test results

**248/248 tests passing** (168 pre-existing + 80 new/extended), typecheck clean, across 6 logical commits:

1. `241cd76` — schema v2 + migration + CRUD + tests (194 tests)
2. `7a566d1` — Daily Load issues + recommendation engine + tests (231 tests)
3. `31455f8` — One Move real-data + Tomorrow Preview + tests (248 tests)
4. `3cf331e` — capture UI (248 tests, no new domain tests — UI has no rendering harness in this codebase, matching the existing pattern where UI is verified by review + manual testing, not unit tests)

Every existing Build 1/2/2.5 test passes with its original intent preserved; a handful of hand-built fixtures and version-literal assumptions that predated the v2 schema bump were updated (documented in commit `241cd76`'s message) — this is expected schema-migration maintenance, not a regression.

**Validation commands** (matching Build 2.5's exact set):

| Command | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 248/248 tests, 50 suites** |
| `npx expo-doctor` | **20/21 — 1 pre-existing failure** (expo patch version 57.0.22 vs. expected 57.0.23; unrelated to this build, present before it) |
| `npx expo export --platform android` | **PASS — 1,474 modules, 5,253,387-byte Hermes bundle** (was 1,455 modules / 5,180,575 bytes before this build; +19 modules / +72,812 bytes is the new domain and UI code) |

---

## 11. Interactive smoke testing — NOT EXECUTED, with rationale

No Android emulator is available in this environment. `expo start --web` was attempted as a substitute (the project has a working `web` script) but **fails to render**: `react-native-web` is not installed in this project (a pre-existing gap — not introduced by this build), so the bundler returns a 500 for the web entry point and the page never mounts. Asked directly, the owner chose to skip live testing rather than add `react-native-web` as a new dependency mid-build.

**All 18 of the owner's specified emulator smoke-test steps are therefore NOT_EXECUTED.** Below is the human checklist for running them on a real device or emulator:

1. Fresh real/empty household — launch a build in empty mode, confirm onboarding starts clean.
2. Complete onboarding (goals/strengths/struggles/Talk It Out/profile/plus step).
3. Add a work event (fixed), a school/sports pickup event (fixed), and a flexible errand event, via Calendar → "Add event."
4. Give the pickup event `travelMinutesBefore` on the editor, sized so raw buffer looks fine but travel-adjusted buffer doesn't.
5. Confirm Daily Load on Today shows a `transition_conflict` (source: travel_aware) verdict, naming the two real commitments.
6. Confirm the recommendation proposes moving the **flexible** errand (or a flexible task in the window), never the fixed pickup — try tapping "Protect it" on a flexible item too and confirm it becomes fixed and stops being offered.
7. Accept the recommendation ("Move it to tomorrow").
8. Force-quit and relaunch the app.
9. Verify the accepted move persisted (the moved item shows on tomorrow, Today shows "Adjusted").
10. Add a task via Life → any category → "Add task," then mark it complete.
11. Capture a Needs Me item from the Life hub quick-add (title only).
12. Force-quit and relaunch.
13. Verify the completed task and the Needs Me item both persisted.
14. Verify One Move shows a real task or Needs Me item (not the demo catalog) once onboarded on a real/empty household with something captured.
15. Verify Tomorrow Preview on Today shows a factual line about tomorrow's real commitments.
16. Create a custom category (via existing category UI) and confirm it's selectable on both the event and task editors.
17. Switch to demo mode (or a fresh demo install) and confirm only Ellis Household data appears — no real-household facts leak in.
18. Open the Systems screen and the onboarding `plus` step; confirm the RevenueCat/paywall routes still work exactly as in Build 2.5 (untouched by this build).

No observations from these steps are claimed here — none were made.

---

## 12. IMPLEMENTED / TESTED / DEFERRED / NOT_EXECUTED

**IMPLEMENTED & TESTED** (unit-level, 248/248 passing): schema v2 + migration; real event/task/Needs Me CRUD; Daily Load issue detection (overlap, transition conflict raw + travel-aware, capacity pressure, tight window, overdue); MOVE (task + event)/DROP/SHORTEN/PROTECT recommendation actions; One Move on real data; Tomorrow Preview.

**IMPLEMENTED, not independently unit-tested** (no React rendering harness exists in this codebase — matches the existing pattern for all prior UI, verified by code review instead): `EventForm`, `TaskForm`, `CategoryTaskList`, `NeedsMeQuickAdd`/`NeedsMeList`/`NeedsMeChip`, `HandledLedger`, `TomorrowPreview` UI, the rewritten `DailyLoadCard`, `ScheduleContext` extension.

**DEFERRED** (not built this session, with rationale):
- **DELEGATE, REPLACE** — no delegate-target or alternative-item concept exists; building either would fabricate an execution capability.
- **Native date/time picker** — plain validated text fields used instead, to avoid a new native dependency mid-build.
- **Recurrence, provenance-tagged household defaults for travel/duration, configurable per-household day-window settings, a signature-keyed rejection ledger, and destination-day validation for MOVE** — the first supplementary addendum's ideas. Confirmed buildable inside the existing UTC-instant + LocalDate architecture (not a stop condition), but each is a real feature in its own right; sequencing them into a future build was judged safer than rushing all of them into this one. Recorded as an explicit roadmap in the working plan for the next build to pick up.
- **One Move "Not today" (skip) and "Already done" (retroactive correction) affordances** — the second addendum assumed these already existed; they don't (`OneMoveCard` only ever had "I did it"). Inventing them was new scope beyond the approved plan, so it wasn't done here.
- **Whether Today keeps its full `TimelineList` chronology** — left as an explicit open question for the owner rather than resolved unilaterally.

**NOT_EXECUTED**: all 18 interactive smoke-test steps (§11) — no Android emulator available, web target non-functional without a new dependency the owner chose not to add this session.

---

## 13. New product concepts vs. `HER_KEYS_PRODUCT.md`

Three concepts this build introduces aren't named in the canonical product document and should be folded into an explicit framework revision:

- **Needs Me** — the low-friction capture inbox (§3.3 of the owner's build brief; not previously part of `HER_KEYS_PRODUCT.md`'s described intelligence architecture).
- **Tomorrow Preview** — a compact, read-only look-ahead on Today.
- **PROTECT** — the recommendation action that converts a flexible item to fixed. Kept (not deferred) in this build since it needed no new schema, but it's a genuinely new concept in the recommendation taxonomy beyond what §16 of the product doc anticipated (Recommend / Approve & Execute / Autopilot).

---

## 14. Known limitations

- Capacity pressure's day window (6 AM–10 PM) is a fixed constant, not per-household configurable yet.
- Travel-aware transition conflict only fires when it would newly push a gap into `overloaded`; it doesn't separately surface a travel-caused `open → tight` shift (judged out of scope for this build; the raw/tight signal still exists, it just doesn't distinguish travel as the cause in that milder case).
- No destination-day validation before proposing a MOVE (see Deferred, above) — a proposed move could, in principle, make tomorrow tighter. The UI-level candidate filtering to prevent this was scoped out; noted as the top item for the next build.
- `expo-doctor`'s one failure (patch version drift) predates this build and wasn't addressed, matching the "don't fix what isn't broken by this build" principle.

---

## 15. Final product test

**Can a real mother enter the obligations of an ordinary Wednesday and have Her Keys tell her something specific, correct, and useful that she would otherwise have had to mentally figure out herself?**

Structurally, yes, and it's covered by tests exercising exactly this path: she can add a fixed pickup and a fixed soccer practice with a genuine transition problem (raw or travel-aware), and Daily Load names the two real commitments and the real minutes short, recommends moving a specific flexible item (never the fixed ones), and that recommendation persists correctly when accepted. She can capture "Call insurance" in three seconds without picking a category. She gets One Move sourced from her own actual list, not a stranger's. She sees a factual line about tomorrow. All of this is proven at the unit level (248 tests) against real domain logic, not mocked. It has **not** been proven by a human tapping through the real app on a device this session — that remains the one honest gap, tracked in §11.
