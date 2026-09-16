# Her Keys — Build 3 Hostile Audit

Audit date: 2026-09-16 (America/New_York)

Final verdict: **REPAIRED_CONTINUE_BUILDING**

## Source authority

| Item | Verified value |
| --- | --- |
| Build under audit | Build 3 — Real-Life Daily Load |
| Source branch | `build/03-real-life-daily-load` |
| Source SHA (audited) | `62990ab712128cf0f70cbca7d907d1c5082607cf` |
| Build 3 base | `a546ec274709d503d43bd18f5a9185a66caf594d` (Build 2.5) — ancestor of the source, 8 Build 3 commits on top |
| Audit branch | `audit/build3-hostile`, created from the exact source SHA |
| Final audited source | `264357de2d85308d4af83d61daa5ed3c5ff09882` — the source under final validation. Only the smoke launch configuration (`4da65e0`) and this document are committed on top of it. |
| `main` / `origin/main` | `89eeea7` / `7f6cf22` — not moved; nothing fetched, pushed, merged or rebased |
| Product authority | `HER_KEYS_PRODUCT.md` (read in full; not modified) |

**Lineage.** History is linear: `origin/main` (7f6cf22) → `main` (89eeea7, Build 2 + its audit) → `a546ec2` (Build 2.5) → 8 Build 3 commits → `62990ab`. Per the owner's instruction the local lineage was treated as authoritative. `origin/main` is as of the last fetch (2026-09-15 06:30); no fetch was run.

**Environment.** Windows 11 Home 10.0.26200; Node 24.14.0; npm 11.9.0; Expo SDK 57 (`expo` 57.0.22, `expo-router` 57.0.21, React Native 0.86.3, TypeScript 6.0.3, Zod 4.6.5). Android emulator `Pixel_8_Pro` (API 37, x86_64, WHPX), Expo Go 57.0.9. Per `AGENTS.md`, the SDK 57 reference, Expo Router and protected-route documentation were read before any code was written.

## Verdict summary

| Severity | Found | Repaired | Deferred | Open |
| --- | ---: | ---: | ---: | ---: |
| P0 | 0 | 0 | — | 0 |
| P1 | 4 | 4 | — | 0 |
| P2 | 7 | 7 | — | 0 |
| P3 | 10 | 10 | — | 0 |
| **P0–P3** | **21** | **21** | — | **0** |
| P4 | 10 | 1 | 9 | — |
| P5 | 10 | 2 | 8 | — |
| P6 | 3 | 0 | 3 | — |
| P7 | 2 | 0 | 2 | — |
| P8 | 2 | 0 | 2 | — |
| P9 | 2 | 0 | 2 | — |
| P10 | 1 | 0 | 1 | — |
| **P4–P10** | **30** | **3** | **27** | — |

Every P0–P3 repair has regression coverage. 27 of 27 mutants were killed. The runtime smoke was **executed** on the emulator: 20 of 20 steps passed.

## Baseline (reproduced before any change)

| Check | Build 3 report | Reproduced |
| --- | --- | --- |
| `npm run typecheck` | PASS | **PASS** |
| `npm test` | 248/248, 50 suites | **248/248, 50 suites** |
| `npx expo-doctor` | 20/21 | **20/21** — only failure: `expo` expected `~57.0.23`, found `57.0.22` (pre-existing) |
| `npx expo export --platform android` | 1,474 modules, 5,253,387 bytes | **PASS — 1,474 modules, 5,253,388 bytes** |

The one-byte bundle difference is Hermes packaging, not source. The Build 3 session's own export (still in the git-ignored `dist/`, 5,253,387 bytes) and the reproduced export share:
- the content-hash filename `entry-c5fa5d07…hbc`;
- an identical `metadata.json`;
- identical first 32 bytes (magic, version and source hash).

The files first differ at the file-length field.

Build 3 did not modify:
- Build 2 persistence: `writeQueue`, `appStateRepository`, the storage adapters, `appStore` and `AppStateProvider`;
- Build 2.5 monetization: `src/monetization/*` and `app/onboarding/plus.tsx`.

Build 3's persistence-layer changes were limited to the four files the owner singled out:
- `envelope.ts`: schema v2 and `migrateV1ToV2`;
- `legacySchemas.ts`: new;
- `initialState.ts`: one line;
- `ScheduleContext.tsx`.

## Architecture (as audited)

- **Persisted** (one schema-v2 envelope, `herkeys.appState`): origin, household, user (timezone), children, categories, events (commitment, active/removed, travel/prep minutes, source, timestamps), tasks (open/completed/archived, notes, completedAt), systems, meals, onboarding, One Move records (catalog/task/needsMe target), Needs Me items, discovery, action records (7 types).
- **Write paths.**
  - `commit` (save, then show): event and task editors, Needs Me capture; the event move, drop, shorten, keep-capacity and protect buttons; ledger Undo; onboarding completion.
  - `dispatch` (show, then save): task move and transition keep-plan, One Move "I did it", Needs Me "Resolved", onboarding choices, Talk It Out, internal category tools.
  - Hydration writes: first launch, recovery, mode mismatch, catalog repair, One Move decision.
- **Derived.** `projectDay` → `computeDailyLoad` (tightest gap, task candidates) → `assessDailyLoadIssues` (overlap > transition conflict > capacity > tight window > overdue; tier) → card, header, meter, One Move withholding; Tomorrow Preview runs the same pipeline on today + 1; decisions and the ledger read action records.
- **Acceptance.** Card → `ScheduleContext` → `commit`/`dispatch` of a pure approval that re-checks the live verdict and the one-decision-per-day gate, changes the fact and appends an action record.
- **Restart.** `hydrate` once → load → loaded / empty / invalid (quarantined in development) / future version (preserved, memory-only) / read failure (memory-only) → origin check → catalog repair → One Move resolution. Route guards wait for a settled state.
- **Migration.** Envelope check → `migrateV1ToV2` validated by the frozen v1 schema on input and the v2 schema on output → shape → integrity.
- **Demo vs real.** Data mode from `EXPO_PUBLIC_HERKEYS_DATA_MODE`; any origin mismatch starts fresh; a demo build that finds a real household runs memory-only; internal tools and the One Move catalog are demo-only.
- **Categories.** Everything references `categoryId`; integrity requires the category to exist (archived still valid); `systemRole` is unique and never inferred; Life screens are keyed by role.

## Owner decisions taken during the audit

Four repairs changed product behavior, so they were put to the owner before implementation. The owner chose the recommended option each time.

1. **Task lists** (B3-AUD-004): every Life category list shows all of its open tasks; the Life hub links to "Other open tasks" for everything else.
2. **Capacity** (B3-AUD-007): count all of today's work (due today or planned, fixed or flexible; overdue excluded) against the 6 AM–10 PM window minus every active event and its entered travel/prep. Drop/Shorten still only name flexible, not-due tasks; otherwise the verdict is a notice.
3. **Overlaps** (B3-AUD-006): any overlap between active events is flagged. When exactly one side is flexible, Her Keys offers to move it; two fixed or two flexible stay notice-only.
4. **"I did it"** (B3-AUD-011): completing a task- or Needs Me-based One Move also completes the task or resolves the item, in the same change.

## Findings

| ID | Sev | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| B3-AUD-001 | P1 | Persistence | `commit()` handed a second, different change the first one's promise: it was never applied, yet reported as saved | REPAIRED |
| B3-AUD-002 | P1 | Needs Me | "Promote to task" resolved the item before the task existed; backing out lost it | REPAIRED |
| B3-AUD-003 | P1 | One Move | A completed task/Needs Me One Move was deleted and replaced on relaunch once its item was closed | REPAIRED |
| B3-AUD-004 | P1 | Capture | Tasks with no due date, a future due date, or a category without a Life list were unreachable after saving | REPAIRED (owner decision) |
| B3-AUD-005 | P2 | Daily Load | Travel/prep minutes were only checked on the tightest raw gap | REPAIRED |
| B3-AUD-006 | P2 | Daily Load | Overlaps involving a flexible event were ignored ("room between them") | REPAIRED (owner decision) |
| B3-AUD-007 | P2 | Daily Load | Capacity ignored due-today/fixed work and flexible events; unreachable for real households; Protect hid overloads | REPAIRED (owner decision) |
| B3-AUD-008 | P2 | One Move | Withholding ignored the overlap, travel-aware and capacity verdicts | REPAIRED |
| B3-AUD-009 | P2 | Ledger / Undo | Undo applied stale snapshots (over newer plans, onto protected events), was offered forever, and left Today saying "moved" | REPAIRED |
| B3-AUD-010 | P2 | Tomorrow Preview | Overdue and today's open tasks were counted as "due tomorrow" | REPAIRED |
| B3-AUD-011 | P2 | One Move | "I did it" left the task open; it was later reported overdue | REPAIRED (owner decision) |
| B3-AUD-012 | P3 | Today | Header sentence and load meter contradicted the card for overlap/travel/capacity verdicts | REPAIRED |
| B3-AUD-013 | P3 | Daily Load | Verdict and offered move depended on event entry order when two events started together | REPAIRED |
| B3-AUD-014 | P3 | Decisions | Event moves bypassed the documented one-decision-per-day gate; no "Adjusted" card | REPAIRED |
| B3-AUD-015 | P3 | Decisions | "Keep today as planned" / "Got it" did nothing for a travel-aware verdict with an open raw gap | REPAIRED |
| B3-AUD-016 | P3 | Card copy | Travel-aware recommendation showed raw numbers and a negative shortfall | REPAIRED |
| B3-AUD-017 | P3 | Persistence | A tap dispatched while a commit was saving was silently dropped | REPAIRED |
| B3-AUD-018 | P3 | Capture | Values past stored limits were accepted, failed as "try again", and raised a false "may not be saved" notice | REPAIRED |
| B3-AUD-019 | P3 | Capture | Editing a task or event overwrote its visibility scope | REPAIRED |
| B3-AUD-020 | P3 | One Move | A real household's first capture got no One Move until a relaunch | REPAIRED |
| B3-AUD-021 | P3 | UX | Recommendation buttons, Undo, quick capture and promotion gave no feedback on a failed save | REPAIRED |
| B3-AUD-022 | P4 | Card | "Shorten it" was offered when nothing could be shortened; the tap did nothing | FIXED (with B3-AUD-007) |
| B3-AUD-023 | P5 | Tasks | `archiveTask` on a completed task produced a state the store refuses | FIXED |
| B3-AUD-024 | P5 | Accessibility | Ledger toggle lacked expanded state; Undo and Needs Me buttons lacked item context; ledger rows showed no day | FIXED |
| B3-AUD-025 | P4 | Persistence | Production discards unreadable state without keeping a copy | DEFERRED — release gate |
| B3-AUD-026 | P4 | Persistence | Dispatch-based decisions are shown before they are saved | DEFERRED |
| B3-AUD-027 | P4 | Card copy | "Leave a few minutes early this afternoon" is time-blind | DEFERRED |
| B3-AUD-028 | P4 | Daily Load | Capacity is not time-of-day aware | DEFERRED |
| B3-AUD-029 | P4 | Daily Load | Every pair of events needs 45 minutes, back-to-back calls included | DEFERRED |
| B3-AUD-030 | P4 | Daily Load | A long fixed event makes every fixed event inside it an overlap notice | DEFERRED |
| B3-AUD-031 | P4 | One Move | Default 15-minute tasks count as "reduces load" and pass withholding | DEFERRED |
| B3-AUD-032 | P4 | Calendar | Future events can't be reviewed, edited or removed until their day | DEFERRED |
| B3-AUD-033 | P4 | Daily Load | A planned task whose day passes unfinished drops off Today | DEFERRED |
| B3-AUD-034 | P5 | Needs Me | Classification (category, due date) has no UI though the code promises it | DEFERRED |
| B3-AUD-035 | P5 | Calendar | Overnight events can't be entered or edited | DEFERRED |
| B3-AUD-036 | P5 | Decisions | Moving an event that began on an earlier day re-times it | DEFERRED |
| B3-AUD-037 | P5 | Migration | Every pre-existing event is labelled `source: 'demo'` regardless of origin | DEFERRED |
| B3-AUD-038 | P5 | Ledger | Grows without bound; times use the device timezone | DEFERRED |
| B3-AUD-039 | P5 | Monetization | Systems "Learn about Her Keys+" gives no feedback when the paywall is unavailable | DEFERRED |
| B3-AUD-040 | P5 | Capture | New items default to the first category chip; an archived category shows no chip | DEFERRED |
| B3-AUD-041 | P5 | Tooling | The web target still can't render: `react-native-web` isn't installed (HK-AUDIT-028) | DEFERRED (carried forward) |
| B3-AUD-042 | P6 | Domain | Protect and event edits accept archived/removed items | DEFERRED |
| B3-AUD-043 | P6 | Routing | Task editor link with an unknown `taskId` silently becomes a new-task form | DEFERRED |
| B3-AUD-044 | P6 | Migration | `legacySchemas.ts` reuses eight live schemas | DEFERRED (now guarded) |
| B3-AUD-045 | P7 | Performance | Tomorrow Preview and the ledger recompute on every Today render | DEFERRED |
| B3-AUD-046 | P7 | Tests | Link-resolution table test doesn't list the editor routes | DEFERRED |
| B3-AUD-047 | P8 | Docs | Build 3 completion report inaccuracies | DEFERRED |
| B3-AUD-048 | P8 | Dependencies | Expo Doctor patch drift (`expo` 57.0.22 vs ~57.0.23) | DEFERRED (pre-existing) |
| B3-AUD-049 | P9 | Governance | Build 2, 2.5 and 3 exist only on this machine | DEFERRED |
| B3-AUD-050 | P9 | Tooling | Emulator screen capture went black mid-session | DEFERRED |
| B3-AUD-051 | P10 | Schema | `totalFlexibleNeededMinutes` now holds all of today's demand | DEFERRED |

## P0–P3 repairs

### B3-AUD-001 — P1 — `commit()` reported another change's success

- **Location:** `src/state/appStore.ts` (`commit`).
- **Evidence / reproduction:** with a Needs Me capture's write in flight, a second `commit(addTask(…))` returned the first commit's promise. Both resolved `true`; the task was never applied and was absent after relaunch (`tests/build3Audit.persistence.test.mjs`). Build 2 used `commit` once (onboarding); Build 3 made it the write path for every capture and recommendation, so any two saves within one native write (saves took 5–449 ms on the emulator) could collide, and the editor would close on a save that never happened.
- **Repair:** commits run in order on one chain, each against the state the previous one left, each with its own result. `reset` runs on the same chain. Editors, quick capture, the card and the ledger guard same-frame double taps with a ref, since the store no longer merges different taps.
- **Regression:** `build3Audit.persistence` — three overlapping commits (capture, task, event) all apply and survive relaunch; a failed commit does not decide the next one; identical commits apply in turn; reset after a pending commit. Mutant M10.

### B3-AUD-002 — P1 — Promoting a Needs Me item could lose it

- **Location:** `src/features/life/NeedsMeList.tsx` (`onPromote`), `src/features/tasks/TaskForm.tsx`, `app/task-editor.tsx`, `src/domain/needsMe.ts`.
- **Evidence:** `onPromote` committed `resolveNeedsMeItem` and then navigated to the editor. Backing out (or a failed save) left the item resolved, hidden from every list, with no task created.
- **Repair:** the inbox only navigates, passing `needsMeId`. The editor prefills from the item and, on save, `promoteNeedsMeItem` adds the task and resolves the item in one change.
- **Regression:** `build3Audit.capture` — promotion is atomic and carries the item's details; an abandoned promotion leaves the item open across relaunch; a failed promotion changes nothing; source check that the inbox never resolves on promote. Mutant M11.

### B3-AUD-003 — P1 — A done One Move was deleted and replaced

- **Location:** `src/domain/oneMove.ts` (`findOneMoveView`, `resolveOneMoveForToday`).
- **Evidence:** after "I did it" on a task-based move, marking the task done from its list turned the card into "No One Move today". On the next launch the completed record was removed from history and a new move was offered for the same day (reproduced through the store). This regressed Build 2's "completion survives relaunch, no replacement".
- **Repair:** completed decisions are history and are never replaced. Finishing the offered item from her list reads as doing the move. Only an unfinished move whose item was removed is replaced (the documented rule).
- **Regression:** `build3Audit.oneMove` — done state survives list completion and relaunch; list completion counts as doing the move; resolving the Needs Me item likewise; removed item still replaced; completed move never replaced. Mutant M13.

### B3-AUD-004 — P1 — Saved tasks became unreachable (owner decision)

- **Location:** `src/features/life/CategoryTaskList.tsx`, new `src/domain/taskLists.ts`, new `app/(app)/life/other-tasks.tsx`, `app/(app)/life/index.tsx`.
- **Evidence:** every task list read today's projection. The editor's default (no due date) produced a task that appeared on no day. Future-dated tasks were hidden until due. Tasks in Meals, Wellbeing, Relationships, Co-parenting, custom or archived categories had no list. None could be edited, completed or removed.
- **Repair (per owner):** each Life category list shows all its open tasks (overdue, due today, on today, upcoming, then undated), labelled. The hub shows one "Other open tasks" row leading to a full list for everything else. Today and Daily Load are unchanged.
- **Regression:** `build3Audit.capture` — every open task is in exactly one list; undated and future tasks are listed; order and labels; standings match Today's projection; archived categories fall to "Other"; screen wiring source checks. Mutant M19. Verified on the emulator (undated Home task listed as "No date"; Pets task under "Other open tasks").

### B3-AUD-005 — P2 — Travel only counted on the tightest raw gap

- **Location:** `src/domain/dailyLoadIssues.ts` (`detectTransitionIssues`).
- **Evidence:** Work 9–12, lunch 12:50–1:30, pickup 3:00 with 75 minutes of travel before → 15 real minutes, but the verdict was "Your commitments have room between them" because the raw tightest gap (50 min) had no travel.
- **Repair:** the travel-aware read walks every transition (same gap walk as `computeDailyLoad`, now exported as `listTransitionGaps`) and reports the worst one her entered travel pushes into overloaded. Raw and travel-aware reads stay separate.
- **Regression:** `build3Audit.dailyLoad` (B3-AUD-005 block). Mutants M2, M14. Verified on the emulator: the smoke day's raw tightest gap had no travel, and the repaired build still flagged the pickup.

### B3-AUD-006 — P2 — Flexible double bookings were invisible (owner decision)

- **Location:** `src/domain/dailyLoadIssues.ts` (`detectOverlaps`), `src/domain/recommendationActions.ts`, `src/domain/dailyLoadDecisions.ts`, `src/features/daily-load/DailyLoadCard.tsx`.
- **Evidence:** a flexible errand booked over a fixed pickup (or two flexible events overlapping) produced no issue at all.
- **Repair (per owner):** all overlaps are reported; `movableEventId` names the flexible side when exactly one side is flexible; the card offers Move / Keep / Protect for it. Moves and keeps are recorded against the pair (negative buffer = overlap). Two fixed or two flexible events are notices.
- **Regression:** `build3Audit.dailyLoad` (B3-AUD-006 block); updated `dailyLoadIssues.test.mjs`. Mutants M1, M23.

### B3-AUD-007 — P2 — Capacity missed common overloads (owner decision)

- **Location:** `src/domain/dailyLoadIssues.ts` (`detectCapacityPressure`), `DailyLoadCard.tsx`, `recommendationActions.ts`.
- **Evidence:** a 6 AM–9 PM shift plus 180 minutes due today, or 20 hours of due-today work, read "room between them". Only flexible, not-due tasks counted, and the task editor cannot create one, so real households never saw the verdict. Protecting the named task removed it from demand and the overload vanished.
- **Repair (per owner):** demand = every open task on today except overdue; available = window minus the union of all active events' time and their entered margins. Drop/Shorten name only a flexible, not-due task (`largestTaskMinutes` also decides whether Shorten is offered); otherwise a notice. Capacity approvals require the capacity verdict to be the one showing.
- **Regression:** `build3Audit.dailyLoad` (B3-AUD-007 block); updated `dailyLoadIssues.test.mjs`. Mutants M7, M15.

### B3-AUD-008 — P2 — One Move added work on days Daily Load called overloaded

- **Location:** `src/domain/loadTier.ts` (`loadTierForDay`); thresholds moved to `src/domain/loadThresholds.ts` to avoid an import cycle.
- **Evidence:** withholding read only the raw tier, so a day with an overlap, a travel-aware conflict or capacity pressure still got a 60-minute task as its One Move.
- **Repair:** `loadTierForDay` returns the full verdict's tier.
- **Regression:** `build3Audit.dailyLoad` (three overloaded kinds withhold). Mutant M16.

### B3-AUD-009 — P2 — Undo was stale-unsafe and left a false "moved"

- **Location:** `src/features/today/HandledLedger.tsx`, `src/domain/dailyLoadDecisions.ts` (`undoableMove`, `undoRecommendedMove`, `moveWasUndone`).
- **Evidence:** Undo was offered for every past move and restored the stored snapshot blindly — over a newer plan (the task then fell off every day) and onto an event since protected as fixed. After a same-day undo the card still said "moved … enough room", and the gate blocked any new decision.
- **Repair:** Undo exists only for today's decision while the item is still exactly where the move put it (open/active, flexible, unchanged). It restores the item and records a keep-plan decision in the same change, so Today reads "Kept as planned"; the ledger marks the move "— undone".
- **Regression:** `build3Audit.recommendations` (Undo block, including relaunch). Mutant M12. Verified on the emulator, including a relaunch.

### B3-AUD-010 — P2 — Tomorrow Preview named the wrong day's work

- **Location:** `src/domain/tomorrowPreview.ts`.
- **Evidence:** one overdue and one due-today task → "2 things due tomorrow."
- **Repair:** only tasks due exactly tomorrow are counted.
- **Regression:** `build3Audit.dailyLoad` (Tomorrow block). Mutant M17.

### B3-AUD-011 — P2 — "I did it" left the item open (owner decision)

- **Location:** `src/domain/oneMove.ts` (`completeOneMove`).
- **Evidence:** after "I did it" the task stayed open; the next day Her Keys reported it overdue.
- **Repair (per owner):** completing a task- or Needs Me-based move completes the task or resolves the item in the same change.
- **Regression:** `build3Audit.oneMove` (task and Needs Me targets). Mutant M24. Verified on the emulator (the Needs Me item resolved; still done after relaunch).

### B3-AUD-012 — P3 — Today contradicted itself

- **Location:** `src/features/today/dayState.ts`, `src/features/daily-load/describeLoad.ts`, `LoadMeter.tsx`, `app/(app)/today.tsx`.
- **Evidence:** overlap day: card "Needs your attention", meter "Steady", header "Nothing needs moving".
- **Repair:** header and meter read the same verdict as the card, with wording for overlap and capacity.
- **Regression:** `build3Audit.dailyLoad` (header and meter assertions).

### B3-AUD-013 — P3 — Entry order changed the verdict

- **Location:** `src/features/daily-load/computeDailyLoad.ts` (sort), `dailyLoadIssues.ts` (focus).
- **Evidence:** A, B(flexible), C(fixed) with B and C starting together: one entry order offered "Move B", the other said nothing flexible could move.
- **Repair:** fixed tie-break (start, end, id). A flexible event is offered only when moving it would actually widen the window. Same-start events now read as the overlap they are.
- **Regression:** `build3Audit.dailyLoad` (six permutations; stored-array order).

### B3-AUD-014 — P3 — Event moves escaped the one-decision gate

- **Location:** `src/domain/dailyLoadDecisions.ts` (`latestTransitionDecision`, `dailyLoadDecisionFor`), `DailyLoadCard.tsx`.
- **Evidence:** after an event move the day read "pending", a second event move applied the same day, and no "Adjusted" card appeared. The Build 3 report claimed the gate was shared; the test named for it passed for another reason.
- **Repair:** event moves count as the day's decision and show an "Adjusted" card.
- **Regression:** `build3Audit.dailyLoad` (gate block, including a day that stays tight after a keep). Mutants M9, M20, M26, M27.

### B3-AUD-015 — P3 — "Keep" did nothing on a travel-aware verdict

- **Location:** `src/domain/dailyLoadDecisions.ts` (`keepDailyLoadPlan`).
- **Evidence:** keep required the raw assessment to be overloaded; with a 60-minute raw gap and 45 minutes of travel the button did nothing.
- **Repair:** keep records against the live verdict's window (`decisionWindowFor`).
- **Regression:** `build3Audit.dailyLoad`.

### B3-AUD-016 — P3 — Travel-aware card showed raw numbers

- **Location:** `dailyLoadIssues.ts` (focus candidates), `computeDailyLoad.ts` (`rankMoveCandidates`), `DailyLoadCard.tsx`.
- **Evidence:** "That turns your tightest 70 minutes into 90 … 70 minutes is -25 short of the 45" while the real buffer was 10.
- **Repair:** candidates are built for the verdict's window with its buffer, and the reason names the entered travel. The no-candidate and event cards say "Counting the N minutes of travel and preparation you entered…".
- **Regression:** `build3Audit.dailyLoad`.

### B3-AUD-017 — P3 — Taps during a save vanished

- **Location:** `src/state/appStore.ts` (`dispatch`).
- **Evidence:** "I did it" pressed while a capture was saving stayed "selected".
- **Repair:** a dispatch made while a commit is pending waits its turn on the same chain.
- **Regression:** `build3Audit.persistence`. Mutant M21.

### B3-AUD-018 — P3 — Out-of-range input looked like a storage failure

- **Location:** `src/state/appStore.ts` (`commitNow`), `src/domain/state.ts` (`FIELD_LIMITS`), `TextField.tsx`, both editors, quick capture.
- **Evidence:** a 201-character capture or 300 travel minutes: "couldn't save that yet — try again" (never succeeds). Two tries raised "Some recent changes may not be saved yet".
- **Repair:** the schema and the screens share `FIELD_LIMITS`; inputs are capped and minutes validated. `commit` refuses a state the store would reject before queuing it.
- **Regression:** `build3Audit.persistence`, `build3Audit.capture`. Mutant M22.

### B3-AUD-019 — P3 — Edits rewrote scope

- **Location:** `src/domain/tasks.ts`, `src/domain/events.ts`, both editors.
- **Evidence:** editing a child-scoped task or a professional event made it `household`.
- **Repair:** updates take only their editable fields (`pickFields`); editors send scope only on create.
- **Regression:** `build3Audit.capture`. Mutant M18.

### B3-AUD-020 — P3 — First capture waited for a restart

- **Location:** `src/state/appStore.ts` (`withTodaysOneMove`).
- **Evidence:** a real household adding its first due task saw "No One Move today" until relaunch.
- **Repair:** when today has no decision, the store decides it as part of the change that makes one possible; an existing decision is never touched.
- **Regression:** `build3Audit.persistence`. Mutant M25. Verified on the emulator.

### B3-AUD-021 — P3 — Silent save failures

- **Location:** `DailyLoadCard.tsx`, `HandledLedger.tsx`, `NeedsMeQuickAdd.tsx`.
- **Repair:** a short alert-role note ("couldn't save that yet — nothing changed") on failure. Promotion no longer saves before the editor.
- **Regression:** UI has no renderer here; the failure paths they display are covered by `build3Audit.persistence` and `build3Audit.capture`.

## P4–P10 fixed alongside the repairs

- **B3-AUD-022 (P4).** Location: `DailyLoadCard.tsx`, `recommendationActions.ts` (`canShortenTask`). "Shorten it" is shown only when the task is over the 15-minute floor; otherwise the card recommends dropping it.
- **B3-AUD-023 (P5).** Location: `src/domain/tasks.ts` (`archiveTask`). Only open tasks can be archived. Covered by `build3Audit.capture`.
- **B3-AUD-024 (P5).** Location: `HandledLedger.tsx`, `NeedsMeList.tsx`. The ledger toggle announces expanded state, rows show their day, and Undo and inbox buttons carry item-specific hints.

## Deferred findings (P4–P10)

### B3-AUD-025 — P4 — Production discards unreadable state without a copy — **release gate**

- **Location:** `src/store/appStoreInstance.ts:22` (`quarantineCorruptState: diagnosticsEnabled(...)`), `src/persistence/appStateRepository.ts:63`.
- **Impact:** in a production build, any envelope that fails validation (a future writer bug, a downgrade, storage damage) is replaced by a fresh state with no copy kept. Build 3 makes that the user's real events, tasks and captures.
- **Recommended fix:** keep one quarantined copy in every build, and add a recovery path or export before discarding.
- **Gate:** before any real user stores real data (first external beta).

### B3-AUD-026 — P4 — Dispatch-based decisions show before they are saved

- **Location:** `src/store/ScheduleContext.tsx:94,97`; `src/store/OneMoveContext.tsx:25`; `src/features/life/NeedsMeList.tsx:22`.
- **Impact:** HK-B2-AUDIT-006 carried forward: a process kill inside the native write window can lose a task move, keep-plan, One Move completion (which now also completes a task) or Needs Me resolution.
- **Recommended fix:** move these to `commit` with the card's failure note, or add a launch-time journal.
- **Gate:** before copy promises that every tap is durably remembered.

### B3-AUD-027 — P4 — Time-blind "this afternoon" copy

- **Location:** `src/features/daily-load/DailyLoadCard.tsx` (no-candidate transition card).
- **Impact:** HK-AUDIT-033 carried forward, now the most common real-household timing card.
- **Recommended fix:** derive the part of day from the window start.
- **Gate:** next copy pass.

### B3-AUD-028 — P4 — Capacity ignores the time of day

- **Location:** `src/domain/dailyLoadIssues.ts:23-24` (fixed 6 AM–10 PM window).
- **Impact:** at 8 PM the verdict still counts the whole day as available. The card now says "between 6:00 AM and 10:00 PM" rather than implying time left.
- **Recommended fix:** product decision on "remaining capacity from now", plus a per-household window.
- **Gate:** before capacity is presented as a live, evening-accurate signal.

### B3-AUD-029 — P4 — 45 minutes between every pair of events

- **Location:** `src/features/daily-load/computeDailyLoad.ts:9`.
- **Impact:** back-to-back video calls always read as overloaded; there is no location or "same place" concept (and none may be invented).
- **Recommended fix:** user-set per-event "no transition needed", or per-household defaults with provenance.
- **Gate:** before calendar import.

### B3-AUD-030 — P4 — Long fixed events turn into overlap notices

- **Location:** `src/domain/dailyLoadIssues.ts` (`detectOverlaps`).
- **Impact:** a 9–5 work block with a fixed dentist inside, or an all-day custody note, makes the overlap notice the permanent top verdict and hides everything else.
- **Recommended fix:** product decision on "container" events (all-day or background), excluded from overlaps.
- **Gate:** before calendar import.

### B3-AUD-031 — P4 — Default 15-minute tasks pass withholding

- **Location:** `src/domain/tasks.ts:11`, `src/domain/oneMove.ts:54`.
- **Impact:** quick captures carry a 15-minute estimate she never chose and are classed "reduces load", so they're offered as One Move on overloaded days.
- **Recommended fix:** treat an untouched default as unknown size (adds work), or require an estimate.
- **Gate:** product decision before One Move tuning.

### B3-AUD-032 — P4 — Calendar is today-only

- **Location:** `app/(app)/calendar.tsx`.
- **Impact:** an event saved for another day can't be reviewed, corrected or removed until that day; Tomorrow Preview is a single line.
- **Recommended fix:** a day picker or upcoming list (new UI — owner/design decision).
- **Gate:** before real users rely on future-dated events.

### B3-AUD-033 — P4 — Planned tasks fall off Today after their day

- **Location:** `src/domain/projectDay.ts` (planned-day rule).
- **Impact:** a task moved to tomorrow and not done tomorrow leaves Today, Daily Load and One Move (it now shows in Life as "Was planned for …").
- **Recommended fix:** product decision on carry-forward of unfinished planned work.
- **Gate:** before the next Daily Load build.

### B3-AUD-034 — P5 — Needs Me classification has no UI

- **Location:** `src/domain/needsMe.ts:30` (`updateNeedsMeItem` unused).
- **Impact:** the capture component's promise ("category and due date later") has no screen. Promotion reads them if they exist.
- **Recommended fix:** add classification to the inbox, or drop the promise.
- **Gate:** next Needs Me iteration.

### B3-AUD-035 — P5 — No overnight events in the editor

- **Location:** `src/features/calendar/EventForm.tsx:79-80`.
- **Impact:** the editor can't create or save an event that ends after midnight.
- **Recommended fix:** end date field or "ends next day".
- **Gate:** with the native date/time picker.

### B3-AUD-036 — P5 — Moving an event that began earlier re-times it

- **Location:** `src/domain/recommendationActions.ts:74-75`.
- **Impact:** a flexible multi-day event moved "to tomorrow" is rebuilt from its original start time on tomorrow. The editor can't create such events.
- **Recommended fix:** shift by one logical day from its own start date, or don't offer multi-day events.
- **Gate:** before calendar import.

### B3-AUD-037 — P5 — Migration labels every event `source: 'demo'`

- **Location:** `src/persistence/envelope.ts:78`.
- **Impact:** an empty-origin v1 state carrying events (only possible by tampering) gets a false label. The field is not read anywhere.
- **Recommended fix:** derive from `origin`, or add an explicit unknown value at the next schema bump.
- **Gate:** before `source` is read by any feature.

### B3-AUD-038 — P5 — Unbounded ledger in device time

- **Location:** `src/features/today/HandledLedger.tsx:20,61`.
- **Impact:** every past approval renders forever; times use the device timezone, not the household's.
- **Recommended fix:** window or paginate; format in `user.timezone`.
- **Gate:** before history views.

### B3-AUD-039 — P5 — Systems paywall entry is silent when unavailable

- **Location:** `app/(app)/systems.tsx` (Build 2.5, unchanged).
- **Impact:** without an Offering or key, the tap does nothing (observed on the emulator; logged `systems_upgrade` → `unavailable`).
- **Recommended fix:** a short note, like onboarding's fallback.
- **Gate:** before RevenueCat configuration ships.

### B3-AUD-040 — P5 — Default category chip

- **Location:** `src/features/tasks/TaskForm.tsx:31`, `src/features/calendar/EventForm.tsx:40`.
- **Impact:** new items default to the first category ("Kids"); editing an item in an archived category shows no selected chip (the id is kept).
- **Recommended fix:** no default, or last-used; show archived categories when already selected.
- **Gate:** next capture-UI pass.

### B3-AUD-041 — P5 — Web target still can't render (carried forward)

- **Location:** `package.json` `web` script; the `web` entry in `.claude/launch.json` (HK-AUDIT-028).
- **Impact:** `react-native-web` isn't installed, so the Build 3 report's web fallback failed to render and there is still no browser-based way to exercise the UI. This audit didn't re-test web; the runtime smoke used Android.
- **Recommended fix:** add web support, or remove the `web` script and launch entry until web is a target.
- **Gate:** tooling cleanup.

### B3-AUD-042 — P6 — Domain accepts closed items

- **Location:** `src/domain/recommendationActions.ts:219,243` (protect); `src/domain/events.ts:71` (update).
- **Impact:** no UI path reaches them today.
- **Recommended fix:** refuse archived, completed or removed targets.
- **Gate:** before an API surface.

### B3-AUD-043 — P6 — Unknown `taskId` link opens a blank form

- **Location:** `src/features/tasks/TaskForm.tsx:27`.
- **Impact:** a stale link silently becomes a new-task form.
- **Recommended fix:** show "no longer available".
- **Gate:** before shareable links.

### B3-AUD-044 — P6 — Legacy schema reuse

- **Location:** `src/persistence/legacySchemas.ts:3-12`.
- **Impact:** a later edit to a shared live schema would silently change what "v1" accepts. Now guarded: the authentic Build 2.5 fixtures must keep passing the frozen validator.
- **Recommended fix:** freeze copies at the next schema bump.
- **Gate:** schema v3.

### B3-AUD-045 — P7 — Recompute on every Today render

- **Location:** `src/features/today/TomorrowPreview.tsx:11`; `HandledLedger.tsx`.
- **Impact:** cheap today; grows with history.
- **Recommended fix:** memoize on state and today.
- **Gate:** performance pass.

### B3-AUD-046 — P7 — Link-table test gap

- **Location:** `tests/routeAccess.test.mjs` (link table).
- **Impact:** the editor routes are guarded (structural scan) but not in the link-resolution table.
- **Recommended fix:** add the two rows.
- **Gate:** next routing change.

### B3-AUD-047 — P8 — Build 3 report inaccuracies

- **Location:** `docs/builds/BUILD3_REAL_LIFE_DAILY_LOAD.md`.
- **Impact:** the report contains these inaccuracies:
  - it claims event moves share the decision gate (they didn't — B3-AUD-014);
  - it says no emulator was available (a working `Pixel_8_Pro` AVD exists);
  - it says the shared task list is used by "all five" overviews (Meals has none — B3-AUD-004);
  - it counts "9 new test files" (there are 6) and "168 pre-existing" tests (there were 167);
  - its bundle size is one byte off.
- **Recommended fix:** annotate when the build is next documented.
- **Gate:** next build doc.

### B3-AUD-048 — P8 — Expo Doctor patch drift

- **Location:** `package.json` (`expo` ~57.0.22).
- **Impact:** pre-existing 20/21.
- **Recommended fix:** `npx expo install --check` in a dependency change.
- **Gate:** next dependency update.

### B3-AUD-049 — P9 — Remote lag

- **Location:** local branches.
- **Impact:** `main` is 6 commits ahead of `origin/main`; Build 2.5 and Build 3 branches exist only on this machine — a single-disk risk. Documented per the owner's instruction; not an audit blocker.
- **Recommended fix:** push to a private remote at the owner's discretion.
- **Gate:** owner.

### B3-AUD-050 — P9 — Emulator screen capture went black

- **Location:** AVD `Pixel_8_Pro` (host GPU mode), mid-session.
- **Impact:** `screencap` and the console screenshot returned black frames while the view hierarchy stayed live. Runtime evidence was taken from UI trees, as in the Build 2 audit.
- **Recommended fix:** run the smoke with `-gpu swiftshader_indirect` when screenshots are required.
- **Gate:** tooling.

### B3-AUD-051 — P10 — Stored field name no longer matches meaning

- **Location:** `src/domain/state.ts:277` (`CapacityReason.totalFlexibleNeededMinutes`).
- **Impact:** it now stores all of today's task demand (commented in `recommendationActions.ts`); renaming needs a schema change.
- **Recommended fix:** rename at schema v3.
- **Gate:** schema v3.

## Phase coverage

- **Schema / migration (Phase 3).** Seven envelopes written by the Build 2.5 store itself (`tests/fixtures/build25-v1-envelopes.json`) migrate losslessly. Ten untouched sections are byte-identical. Events become fixed, tasks open, timestamps null, One Moves catalog. There is no double migration; loading writes nothing, and the first write lands as v2 with the sequence continued. Demo/real isolation holds in both directions. Partial, unknown, mixed-version, malformed, fractional and absurd v1 input fails closed; broken relationships are integrity violations; v1 data labelled v2 is invalid; v3 is preserved. No P0–P3 found.
- **Daily Load (Phase 4).** Overlaps (fixed/fixed, fixed/flexible, flexible/flexible, touching, nested) and transitions (none, before, after, prep, back-to-back, 0/1-minute, raw vs travel-aware across gaps; no location assumption) were probed. So were capacity cases (no tasks, due today, undated, exact fit, slight and severe overload, all-fixed, mostly flexible, nested events), priority pairs and ordering. Findings 005–008, 012, 013.
- **Recommendations (Phase 5).** Fixed items are never moved, dropped or shortened; travel is never invented. Every action names the right item and re-checks the live verdict, and rejection changes no facts. Drop archives (never deletes); Shorten has a 15-minute floor; Protect adds no time. Stale edit, complete, archive, protect and category-rename races were covered, plus the one-decision gates. Findings 009, 014–016. No cross-household path exists (one household per state; ids only resolve inside it).
- **Needs Me (Phase 6).** Rapid and duplicate capture, empty and whitespace (blocked), long titles (capped), promotion, restart, same-name items and bounded chip were checked. There is no forced classification and no demo contamination. Findings 002, 018, 034.
- **One Move (Phase 7).** Real state only, never invented, task and Needs Me sources, overloaded withholding, completed and closed items, cross-day, restart and deterministic ties. Findings 003, 008, 011, 020, 031.
- **Tomorrow Preview (Phase 8).** Read-only (tested); correct next date across DST eves and at a Honolulu offset boundary. Finding 010.
- **Categories (Phase 9).** Custom, rename, reorder, archive and restore work; a same-name second "Money" gets no role; references are stable by id through a rename (also on the emulator: Kids → "Family" kept its data). Archived categories now fall to "Other open tasks". Action records reference items, not categories.
- **Persistence / race / restart (Phase 10).** Overlapping commits, commit then dispatch, failed then successful commit, reset during a commit, refused states, memory-only sessions, sequence continuation and relaunch. Findings 001, 017, 018, 020, 026.
- **Ledger (Phase 11).** Only approved actions; declined ones hidden; no duplicates (gates); survives restart; missing titles fall back safely; never used as current-state authority (Undo now checks current state). Findings 009, 024, 038.
- **Build 2 regression (Phase 12).**
  - The 167 tests that existed at `a546ec2` (144 Build 2 + 23 Build 2.5) all still pass.
  - Build 3 itself had edited 8 of those files (+184 / −22), and each edit was reviewed:
    - fixture shapes updated for schema v2;
    - schema-version constants moved in the future-version and `__proto__` tests, with the intent unchanged;
    - the post-onboarding "screen stays closed" loop now skips the two new editor screens, which are app screens;
    - the real-household One Move test renamed for Build 3's intended behavior, with new cases added.
  - None of those edits weakens a Build 2 or Build 2.5 guarantee.
  - The audit touched no pre-Build-3 test. Among existing tests it changed only two tests in Build 3's own `dailyLoadIssues.test.mjs` (to the owner decisions) and added one there.
  - These all hold: serialized writes, quarantine, reset safety, demo/real isolation, One Move persistence (repaired), deep-link guards (the structural scan covers the editor routes and the new Life route), category identity, durable-success semantics (strengthened), sequence safety, and corrupt/future-version handling.
- **RevenueCat (Phase 13).** No monetization file changed; `her_keys_plus` is the only entitlement id. No subscription fields are in household state, no Build 3 feature imports RevenueCat, and no key-like strings or prices were found. Paywall routes compile and ran on the emulator (Preview API mode): onboarding "See Her Keys+" fell back to "Continue without Her Keys+", and Systems opened without a crash (finding 039).
- **Accessibility / UX (Phase 15).** Findings 021, 024, 027, 040. Touch targets meet 44 dp (button `sm` min height); fields are labelled; editors are modal with Back and "Navigate up".
- **Performance (Phase 16).** Overlap detection is O(n²) over one day's events (bounded); there are no hydration loops (one hydrate per launch on the emulator, 86–382 ms dev-mode); a valid load writes nothing; saves took 5–449 ms (the native write alone 4–443 ms). Bundle +20,708 bytes / +5 modules for the repairs. Finding 045.

## Negative controls (mutation testing)

Each mutant was applied to the committed source, the full suite run, and the file restored byte-for-byte (SHA-256 compared) with `git diff --quiet` confirmed. The tree was clean after the run.

Result counts are failing tests: out of 335 in the main run, and out of 336 in the follow-up run (M9, M26, M27).

| ID | Mutation | Result | Example failing test |
| --- | --- | --- | --- |
| M1 | overlap comparator reversed | killed (48) | a new day keeps yesterday as history and decides today afresh |
| M2 | entered travel ignored | killed (7) | a pickup with only 15 real minutes is flagged… |
| M3 | commit shows success after a failed write | killed (3) | a commit that exhausts its retry is not shown as completed |
| M4 | a fixed event can be moved | killed (3) | only the flexible side can be moved… |
| M5 | household ownership check disabled | killed (2) | broken relationships are integrity violations… |
| M6 | rename changes the category id | killed (12) | relaunching with valid state writes nothing… |
| M7 | tight window outranks capacity | killed (1) | priority order: capacity pressure outranks tight window |
| M8 | logical-day rollover skipped | killed (2) | midnight passing while the app stays open is picked up |
| M9 | keep-plan ignores the gate | killed (1)* | keeping the plan is the day's decision too… |
| M10 | commit returns another change's promise | killed (3) | two different commits in flight both apply… |
| M11 | promote resolves before the task exists | killed (1) | the inbox screen only navigates on promote… |
| M12 | Undo ignores later changes | killed (1) | a move she has since re-planned is not undone… |
| M13 | a completed One Move can be replaced | killed (1) | a completed move is never replaced… |
| M14 | travel on the tightest raw gap only | killed (3) | a pickup with only 15 real minutes is flagged… |
| M15 | capacity counts only flexible, not-due work | killed (6) | work due today that cannot fit is flagged… |
| M16 | withholding reads the raw tier | killed (3) | a double booking: a move that adds work is withheld |
| M17 | Tomorrow counts overdue as due tomorrow | killed (1) | overdue items and today's open items are not "due tomorrow" |
| M18 | task edit writes every passed field | killed (1) | editing a task or event keeps its visibility scope… |
| M19 | category list limited to dated, due work | killed (3) | each open task appears in exactly one list… |
| M20 | event moves outside the gate | killed (3) | an event move is the day's decision… |
| M21 | a tap during a save is dropped | killed (2) | "I did it" pressed while a capture is saving… |
| M22 | refused state reaches the write queue | killed (1) | a capture beyond the stored limits is refused… |
| M23 | flexible overlaps ignored | killed (8) | a double-booked flexible errand is flagged… |
| M24 | "I did it" leaves the task open | killed (1) | completing a task-based move completes the task… |
| M25 | first capture waits for a restart | killed (1) | a real household's first capture gets today's One Move… |
| M26 | task move ignores the gate | killed (2) | keeping the plan is the day's decision too… |
| M27 | event move ignores the gate | killed (2) | keeping the plan is the day's decision too… |

\* M9 survived the first run: the existing checks only requested a second decision on a day the first one had already resolved. A test that keeps the day tight after a keep was added (commit `264357d`); M9, M26 and M27 were then killed.

## Runtime certification — EXECUTED

- **Device:** `emulator-5554`, AVD `Pixel_8_Pro`, API 37.
- **Runtime:** Expo Go 57.0.9; Metro via `.claude/launch.json` `metro-expo-go` (`expo start --go --clear`).
- **Data mode:** a temporary, gitignored `.env` (removed afterwards).
- **Driver:** adb + uiautomator; taps from UI-tree bounds.
- **Evidence:** screenshots went black mid-session (B3-AUD-050), so evidence is the recorded UI-tree text and Metro/logcat output.

| # | Step | Result | Evidence |
| ---: | --- | --- | --- |
| 1 | Fresh real/empty household | PASS | An envelope left on the AVD by an earlier session decoded (`hydrated: loaded`, 381.6 ms). Being demo-origin, it was replaced by a fresh empty household (`recovered: mode_mismatch`, saved as seq 12). Welcome screen shown. |
| 2 | Complete onboarding | PASS | Welcome → Life Systems Audit 1–3 (goals, strengths, struggles) → 4 (Talk It Out) → Life Operating Profile → Her Keys+ → "Continue without Her Keys+" → Today: "Hi there", "Her Keys looked across today. Nothing needs moving.", "Nothing entered yet.", "No One Move today." |
| 3 | Work event | PASS | Work 9:00–13:00, fixed, category Work |
| 4 | School pickup | PASS | School pickup 15:15–15:30, fixed, Kids, Lincoln Elementary |
| 5 | Flexible errand | PASS | Return library books 13:45–14:15, flexible, Home |
| 6 | Travel/prep | PASS | 45 minutes of travel before the pickup |
| 7 | Genuine tight window | PASS | "Your day works — but one window is too tight." Meter Full. Card: "Counting the 45 minutes of travel and preparation you entered, only 15 minutes sit between Return library books and School pickup." The raw tightest gap (Work → errand, 45 min) has no travel. The audited source checked travel only there, so it would have reported nothing (B3-AUD-005). |
| 8 | Recommendation targets the flexible item | PASS | "Move “Return library books” to tomorrow." |
| 9 | Accept | PASS | "ADJUSTED — “Return library books” moved to tomorrow." Header: "One change made. Today has room now." Meter: Steady. Ledger entry "Today, 5:42 PM · approved by you" with Undo. |
| 10 | Restart | PASS | force-stop + relaunch; `hydrated: loaded` in 86.5 ms, no writes |
| 11 | Persistence | PASS | Adjusted card, moved errand and onboarding intact |
| 12 | Add / complete task | PASS | Undated "Replace the air filter" listed on Home as "No date"; "Mark done" removed it |
| 13 | Needs Me item | PASS | "Call the insurance company" captured; hub "Needs Me: 1 captured". One Move offered it at once, with no restart (B3-AUD-020) and no invented duration. |
| 14 | Restart | PASS | relaunch to Today |
| 15 | One Move | PASS | Same move after restart. "I did it" → "Done. That's enough for today." Item resolved ("Needs Me: Nothing captured"). Still done after another restart. |
| 16 | Tomorrow Preview | PASS | "Nothing fixed on the calendar yet." (tomorrow holds only the flexible errand) |
| 17 | Custom category | PASS | Demo internal tools: Kids → "Family" (id `cat-kids`, role kids), "Pets" added (role none). Pets selectable in the event and task editors. A Pets task listed under "Other open tasks" as "No date · Pets". |
| 18 | Demo isolation | PASS | The demo build found the real household: `recovered: mode_mismatch`, memory-only, no saves for the whole demo session. Today showed Build 2's memory-only notice ("Some recent changes may not be saved yet."). Only demo data was shown: "Hi, Maren", and the demo seed's own "Return library books". The real School pickup, insurance item and air-filter task were absent, and internal tools reported `Persistence: disabled, degraded`. Back in real mode, the household loaded unchanged: "Hi there"; Pets, "Family" and the vet task absent; Work and School pickup on the calendar; the move and the done One Move intact. |
| 19 | RevenueCat / paywall routes | PASS | Onboarding Her Keys+ step rendered; "See Her Keys+" → `unavailable` → hidden (soft fallback); Systems "Learn about Her Keys+" opened without a crash (`systems_upgrade` → `unavailable`) |
| 20 | Console / logcat | PASS | No `FATAL EXCEPTION`, ANR, red screen or unhandled rejection in logcat. The only app warnings were "Cannot connect to Expo CLI", during the two deliberate Metro restarts that switched data mode. Metro's error filter on the final server: "No server errors found." |
| + | Undo (B3-AUD-009) | PASS | Ledger Undo → "“Return library books” moved to tomorrow — undone", with no Undo offered again. Header "Today stays as you planned it."; card "KEPT AS PLANNED". Today's calendar showed Work, Return library books and School pickup again. Saved (seq 31); after relaunch the "Kept as planned" state and the done One Move remained. |

**Not exercised at runtime:**
- a development or standalone build (Expo Go only);
- a real RevenueCat purchase or restore (Preview API mode, no key);
- runtime day rollover and DST;
- iOS, TalkBack and large fonts.

## Final validation (at `264357d`)

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 336/336 tests, 73 suites** (baseline 248/50; +88 tests) |
| `npx expo-doctor` | **20/21** — the same pre-existing `expo` 57.0.22 vs ~57.0.23 patch drift |
| `npx expo export --platform android` | **PASS — 1,479 modules, 5,274,096-byte Hermes bundle** (+5 modules, +20,708 bytes) |
| Mutants | 27/27 killed, all reverted, tree clean |
| Runtime smoke | **EXECUTED — 20/20 PASS** |

## Git state

Audit commits on `audit/build3-hostile` (nothing pushed, merged or opened as a PR):

1. `ed76498` audit: add Build 3 migration evidence against authentic Build 2.5 data
2. `ae52852` audit: serialize saves so none is lost or dropped (B3-AUD-001, -017, -018, -020)
3. `4a153dd` audit: keep every saved task and captured item reachable (B3-AUD-002, -004, -018, -019, -021)
4. `d9b3f93` audit: a done One Move stays done, and doing it does the item (B3-AUD-003, -011)
5. `c8dcbd9` audit: make Daily Load verdicts, decisions and Undo match reality (B3-AUD-005..-010, -012..-016, -021)
6. `264357d` audit: prove the one-decision gate itself refuses a second timing decision
7. `4da65e0` audit: add the Expo Go Metro launch configuration used for the runtime smoke
8. this document (the final audit commit)

Commits 1–6 were each checked out on their own; each typechecks and passes its suite (261 → 271 → 287 → 297 → 335 → 336 tests). Commits 7 and 8 change no source. Source diff against `62990ab`: 38 app/source files (+1,385 / −540); tests: 8 files (+1,386 / −4).

## Remaining release gates

- **B3-AUD-025:** keep unreadable state in production builds before real users store real data.
- **B3-AUD-026:** durable (commit-based or journalled) decisions before promising every tap is remembered.
- **B3-AUD-029, B3-AUD-030, B3-AUD-036:** transition and overlap rules for real calendars before calendar import.
- **B3-AUD-028, B3-AUD-031, B3-AUD-033:** capacity time-awareness, default durations and carry-forward — product decisions for the next Daily Load build.
- **B3-AUD-032:** a way to see and fix future events.
- Carried forward:
  - a development/native build with real RevenueCat Test Store purchase and restore (Build 2.5 §15);
  - HK-AUDIT-012 (Talk It Out safety routing);
  - HK-B2-AUDIT-013 (unencrypted local storage, no backup);
  - HK-AUDIT-025 (public repository licensing).

## Final verdict

**REPAIRED_CONTINUE_BUILDING**

- P0: 0. P1: 4. P2: 7. P3: 10. All 21 repaired, each with regression coverage and a killed mutant where the defect is logic.
- P4–P10: 30 (3 fixed alongside, 27 deferred with location, impact, fix and gate).
- Runtime certification was executed on the emulator; every step passed.
