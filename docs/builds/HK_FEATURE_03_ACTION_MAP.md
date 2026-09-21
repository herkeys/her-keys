# HK-FEATURE-03 — Calendar Action Availability Map (T1 gate)

Built **before any action renders**. Rule: if a legitimate canonical mutation does not exist for a record type,
that record is read-only in Calendar and no action is shown (contract §32, §32A). Nothing here invents a mutation.

Candidate for later integration reconciliation with the overlapping maps of Features 01/02/04. Not promoted here.

Every mutation below is a pure `(state, ctx: TransitionContext, …) => AppState` in the foundation, re-validated against the
live verdict for the *current* state. A failed precondition returns the same state reference (a silent no-op), which the
store reports as "saved" (`appStore.ts:186`), so Calendar detects "applied" with a closure flag inside the transition.

**Universal fact (F03-FG-08).** All recommendation actions read `ctx.today`, which the store builds from the device clock
only; they gate on the *live verdict for today*, offer only the item that verdict names, allow one timing decision and one
capacity decision per day, and the move destination is always `ctx.today + 1`. There is no move-to-date API. Therefore every
recommendation action is **today-only**; on any other day it is *SAFE-UNAVAILABLE* and is not rendered.

| Action | Domain Type | Mutation Module | Preconditions | Confirmation | Available | Reason |
|---|---|---|---|---|---|---|
| MOVE (flexible event → same time tomorrow) | `CalendarEvent` (`commitment: flexible`, `status: active`) | `src/domain/recommendationActions.ts` `approveMoveEvent` | selected day is logical today; no timing decision yet today; event is the one the live verdict offers (`focus.movableEventIds` or the overlap's `movableEventId`); event active + flexible | Yes — explicit review: ephemeral preview first (source and destination day), then Accept. Reversible today via UNDO | **Yes (today, when offered)** | Legitimate mutation exists. Consequence: item lands at the same wall-clock time tomorrow; Calendar's preview also projects tomorrow so a collision is visible before Accept. |
| MOVE (flexible task → tomorrow) | `Task` (`commitment: flexible`, `status: open`) | `src/domain/dailyLoadDecisions.ts` `approveDailyLoadMove` | selected day is logical today; no timing decision yet today; task is in `issues.focus.candidates` (primary verdict is a transition issue) | Yes — preview then Accept; reversible today via UNDO | **Yes (today, when offered)** | Legitimate mutation exists; sets plan to a `day` plan for tomorrow. Candidate ranking is the foundation's (`rankMoveCandidates`), not Calendar's. |
| KEEP AS PLANNED (decline the timing recommendation) | `ActionRecord` (`daily_load.keep_plan`) | `src/domain/dailyLoadDecisions.ts` `keepDailyLoadPlan` | today; no timing decision yet; a decision window exists (a fixed↔fixed overlap has none → no-op) | No (records her decision; changes no facts) | **Yes (today, when a timing recommendation is shown)** | Inherited action; lets her decline in Calendar exactly as in Today. Shares the day's one timing decision. |
| DROP (archive the largest flexible, not-due task) | `Task` (`flexible`, not due today, `status: open`) | `src/domain/recommendationActions.ts` `approveDropTask` | today; verdict primary is `capacity_pressure`; task id equals `largestTaskId`; no capacity decision yet today | Yes — `ConfirmationSheet`. **Not reversible in-app** (no unarchive API exists) | **Yes (today, when the capacity verdict offers it)** | Legitimate mutation exists. Only the exact task the verdict names; never an arbitrary task. |
| SHORTEN (reduce duration by the shortfall, floor 15 min) | `Task` (same as DROP) | `src/domain/recommendationActions.ts` `approveShortenTask` | same as DROP, plus the result must be shorter than the current duration | Yes — preview then Accept; reversible by editing the task | **Yes (today, when the capacity verdict offers it)** | Legitimate mutation exists. |
| KEEP CAPACITY PLAN (decline the capacity recommendation) | `ActionRecord` (`daily_load.keep_capacity_plan`) | `src/domain/recommendationActions.ts` `keepCapacityPlan` | today; verdict primary is `capacity_pressure`; no capacity decision yet | No | **Yes (today, when the capacity verdict is shown)** | Inherited action. |
| PROTECT (convert a flexible item to fixed) | `CalendarEvent` or `Task` with `commitment: flexible` | `src/domain/recommendationActions.ts` `approveProtectItem` | item is flexible (already-fixed is a no-op); not elapsed; day is today or later. No verdict or day gate exists in the mutation | Yes — `ConfirmationSheet` (there is no "unprotect" action; reversible only by editing the item's commitment) | **Yes (any non-elapsed flexible item)** | Legitimate mutation exists; only mutation whose target is date-agnostic (it still stamps `logicalDate = ctx.today`). |
| UNDO MOVE | `ActionRecord` (`move_task` / `move_event`) | `src/domain/dailyLoadDecisions.ts` `undoRecommendedMove` | today; action id equals `undoableMove(state, today)`; item still exactly where the move left it | No (it *is* the safety net) | **Yes (today, while `undoableMove` is non-null)** | Inherited action. |
| EDIT event | `CalendarEvent` (`status: active`) | `src/domain/events.ts` `updateEvent` via `EventForm` at route `/event-editor?eventId=` | event exists and is active | Form save; "Remove event" stays inside the form | **Yes (any day)** | Existing legitimate edit path, preserved unchanged. Not duplicated inside Calendar. |
| EDIT task | `Task` (`status: open`) | `src/domain/tasks.ts` `updateTask` via `TaskForm` at route `/task-editor?taskId=` | task exists and is open | Form save | **Yes (any day)** | Existing edit path, preserved. NOTE: it has no time-of-day field, so it cannot place a task at a time. |
| REMOVE event | `CalendarEvent` | `src/domain/events.ts` `removeEvent` (inside `EventForm`) | active | in-form | **Not surfaced separately** | Reachable only through the editor; not duplicated (contract §34). |
| COMPLETE task | `Task` (`open`) | `src/domain/tasks.ts` `completeTask` | open task | (no reopen API exists, so it would need confirmation) | **No — not surfaced** | Mutation exists, but completing work is an execution flow owned by Today/Life. Calendar is a planning surface and does not duplicate it. CONSIDERED + DEFERRED (PENDING-OWNER). |
| PLACE a task at a time | `Task` (`plan: timed`) | `src/domain/tasks.ts` `updateTask` (plan field) | — | — | **No — not surfaced** | The domain permits it, but no existing UI path sets a task's time and adding one is a new interaction, not an inherited action. Calendar *shows* where room exists and never fabricates a time. CONSIDERED + DEFERRED (PENDING-OWNER); see missing-capability register. |
| DELEGATE | — | `src/domain/responsibility.ts` `delegate` | — | — | **No** | Not a recommendation action and has no ActionRecord type (`recommendationActions.ts:17-21`). Responsibility is *displayed*, never mutated, from Calendar. |
| REPLACE / COMBINE | — | — | — | — | **No** | Not in the product model (contract §44: do not add COMBINE). |
| Recurrence edit / generation | — | `src/domain/structure.ts` | — | — | **No** | Feature 04 territory (contract §40). Calendar renders recurrence metadata only. |
| Any action on a **removed / archived / completed** record | — | — | — | — | **No** | The projection does not list them. |
| Any recommendation action on a **non-today** day | — | — | — | — | **No (SAFE-UNAVAILABLE)** | F03-FG-08. Shown as plain read-only information with the reason available in the item's detail. |

## Read-only record types (SAFE-UNAVAILABLE, contract §32A)

| Record | Why read-only in Calendar |
|---|---|
| Responsibility / person | `delegate` etc. exist but are not Calendar mutations; displayed only. |
| Dependency | `addDependency` / `removeDependency` exist but no Calendar interaction is defined; displayed only. |
| Recurrence rule | Feature 04. |
| External reference | Displayed as provenance only; no provider wiring (contract §41). |
| Capacity profile | `setCapacity` exists but Daily Load ignores it (F03-FG-02); Calendar neither edits nor reads it for classification. |

## Scenario consequence

- N (move preview): **PASS possible** for today's offered moves.
- O (DROP / SHORTEN / PROTECT): only these render, only where the map above says **Yes**.
- Every scenario that would need an action on a non-today day resolves to **SAFE-UNAVAILABLE** with this map as evidence.
