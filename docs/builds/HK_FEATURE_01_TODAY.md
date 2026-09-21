# HK-FEATURE-01-TODAY — Build Ledger

**This is a live ledger, not an approval gate.** It is the working record of the Today / Chief-of-Staff
feature build. It is written to be resumable: a mid-build STOP leaves the branch, this file and the tests
in a state the next session can pick up from.

| | |
|---|---|
| Feature | HK-FEATURE-01-TODAY — Today / Chief-of-Staff experience |
| Branch | `feature/01-today-chief-of-staff` |
| Source branch | `design/01-front-end-system` |
| Source HEAD (EXPECTED_SOURCE_HEAD) | `5007b0f2e6de34e8ce476fac11a8acd2cf1e69a1` (`5007b0f`) — final HK-FE-UI-01 closure |
| Status | **IN PROGRESS** |
| Independent audit | NOT performed here. This ledger is builder evidence, not an audit. |

Authority, in order of precedence: the HK-FEATURE-01-TODAY prompt and its Addendum 01; the HK-PARALLEL-SOURCE-01
common-source addendum; the owner's **PRODUCT WHY** message sent mid-build (§9 — used only to resolve ambiguity
inside approved scope, never to expand it).

Requirement states: `NOT STARTED` · `IN PROGRESS` · `IMPLEMENTED` · `VERIFIED` · `STOPPED`.

---

## 1. Entry gate (recomputed, not quoted)

Every value below was measured on this machine at `5007b0f` before any change. The expected values come from
the prompt; the "measured" column is what the tools said.

| Gate | Expected | Measured | Method |
|---|---|---|---|
| Source branch | `design/01-front-end-system` | `design/01-front-end-system` | `git branch --show-current` |
| Source HEAD | `5007b0f` | `5007b0f2e6de34e8ce476fac11a8acd2cf1e69a1` | `git rev-parse HEAD`, `git rev-parse design/01-front-end-system` (identical) |
| Worktree | clean | clean (0 entries) | `git status --short` |
| Feature branch | forked from source, exactly | created at `5007b0f`; no `feature/*` branch existed before | `git switch -c feature/01-today-chief-of-staff` |
| TypeScript | PASS | **PASS** (exit 0, no output) | `npx tsc --noEmit` |
| App tests | 808 / 808, 169 suites | **808 / 808, 169 suites, 0 fail, 0 skipped** | `npm test` |
| Backend harness | 684 / 684 | **684 / 684** | `node supabase/tests/run.mjs` |
| Expo Doctor | 21 / 21 | **21 / 21** (see note) | `npx expo-doctor` |
| Expo Android export | PASS | **PASS** (one Hermes bundle, 6.2 MB) | `npx expo export --platform android --output-dir <scratchpad>` |
| Shipping migration SHA-256 | `1e9169de…8a7cb` | `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` | `sha256sum` on the working-tree (CRLF) file |
| Baseline migration SHA-256 | `8bc38d66…f16f` | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` | `sha256sum` |
| Local schema fingerprint | `199ed4d4c1b37cd654b5853e91cbde27` / 3613 | **`199ed4d4c1b37cd654b5853e91cbde27` / 3613 facts — MATCH** | the locked tool's own `buildSql`, run read-only through `psql` in `supabase_db_Her_Keys`, verified with `schema-fingerprint.mjs verify --against baselines/build4-foundation-local-fingerprint.json` |

Notes on the measurements — none of these is a deviation, but each is stated so nothing is assumed:

- **Expo Doctor first read 19/21, then 21/21.** The first run happened while the Metro export was running. Two
  checks (`npm/yarn versions`, `packages match installed Expo SDK`) died with child-process exit
  `3221225773` = `0xC000012D` (Windows *commitment limit* — out of virtual memory). It is resource contention, not
  a repository defect. Re-run alone: `21/21 checks passed. No issues detected!` **Lesson for later gates: never run
  Doctor concurrently with an export.**
- **Fingerprint was measured without `supabase db reset --local`.** The tool's own SQL is a read-only `SELECT`
  inside a rolled-back transaction, so measuring the existing local database is non-destructive; the backend
  harness builds its own throwaway databases and does not touch the primary one. The result matched, so a reset
  was not needed. (The CLI path `--source local` is the known-broken one — recorded as OBS-002 in the Build 4
  foundation ledger — and was not used.)
- The export was written outside the repository, so `dist/` is untouched. `.env.local` is loaded by Expo (it is
  gitignored); it was not read or changed.
- The inherited K9 harness repair (`supabase/tests/sync-integration.mjs`, `sync: 23` now computed in
  `America/Chicago`) is present and passed. It is **not** foundation drift.

**Entry test floor:** `ENTRY = 808` app tests. Final accounting (preserved / replaced / removed / added) is in §6.

---

## 2. T0 — What Today was before Feature 01

Feature 01 **evolves** the Today that HK-FE-UI-01 (K4) delivered. It does not treat the repository as greenfield.
Everything in this section was read from source at `5007b0f`.

### 2.1 Route and navigation identity

- Route file: `app/(app)/today.tsx`. Tab `today` is the first tab in `app/(app)/_layout.tsx` (title "Today").
- It lives under the `(app)` group, declared in `app/_layout.tsx` behind `Stack.Protected guard={allow('(app)')}`.
  `canOpenScreen('(app)')` requires: state settled (`ready` | `recovery`), onboarding **complete**, account not
  `boundOther`, not `authenticating`. **So Today can never be the entry path for an incomplete onboarding.** That
  guard is the routing authority (`src/domain/routeAccess.ts`) and Feature 01 does not touch it.
- Root providers wrapping every screen, only mounted after `isSettled`: `ScheduleProvider`, `OneMoveProvider`,
  `TalkItOutProvider` (inside `OnboardingProvider`).
- The shell (5 tabs) is frozen for the parallel wave. No tab is added or reordered.

### 2.2 Files that make up Today at source

| File | Lines | Role | Data source |
|---|---:|---|---|
| `app/(app)/today.tsx` | 65 | Composes the screen: header, LoadMeter, DailyLoadCard, OneMoveCard, NeedsMeChip, LifeStatusSummary, timeline, TomorrowPreview, HandledLedger, TalkItOutEntry | `useSchedule()`, `useHousehold()` |
| `src/features/daily-load/DailyLoadCard.tsx` | 374 | The decision surface (timing verdicts, capacity pressure, overdue) and every recommendation action | `useSchedule()`, `useHouseholdState()` |
| `src/features/daily-load/LoadMeter.tsx` | 46 | Four-segment neutral "Estimated load" indicator | `useSchedule()` + `describeLoad` |
| `src/features/daily-load/describeLoad.ts` | 80 | Coarse label/caption from the Daily Load tier | pure |
| `src/features/daily-load/computeDailyLoad.ts` | 157 | Deterministic Daily Load engine (gaps, buffer, ranked move candidates) | pure — **domain-adjacent, untouched** |
| `src/features/one-move/OneMoveCard.tsx` | 66 | One Move surface: completed / withheld / none / selected | `useOneMove()` |
| `src/features/today/dayState.ts` | 25 | The one sentence under the greeting | pure |
| `src/features/today/HandledLedger.tsx` | 136 | Collapsed list of approved recommendations + Undo | `useHouseholdState()`, `useSchedule()` |
| `src/features/today/NeedsMeChip.tsx` | 41 | "On your mind: …" pointer to `/life/needs-me` | `useHouseholdState()` |
| `src/features/today/TimelineList.tsx` | 91 | "Today's shape" — every event and scheduled task; also reused by Calendar (`onPressItem`) | `useSchedule()` |
| `src/features/today/TomorrowPreview.tsx` | 26 | Always-on "Tomorrow" card; reads `Date.now()` inside the component | domain `tomorrowPreview()` |
| `src/features/today/PersistenceNotice.tsx` | 32 | "started fresh" / "some changes may not be saved" line | `useStoreSnapshot()` |
| `src/features/today/SyncNotice.tsx` | 34 | "N change(s) need your attention" (unresolved sync evidence) | `useAccount()` |
| `src/features/today/formatDay.ts` | 21 | `relativeDay`, `weekdayName`, `dayLabel` | pure |
| `src/features/life/LifeStatusSummary.tsx` | 40 | "Also checked — N of M clear" status list (shared with Life hub data) | `useLifeStatus()` |
| `src/features/talk-it-out/TalkItOutEntry.tsx` | 40 | Inline entry to `/talk-it-out` | — |
| `src/store/ScheduleContext.tsx` | 114 | Projects the logical day, runs Daily Load, exposes the recommendation actions | `useHouseholdState()` |
| `src/store/OneMoveContext.tsx` | 35 | Today's One Move view + `complete` | `oneMoveForDay` |

There are **no Today component tests**. Tests reach Today only through the pure helpers `describeDayState`,
`describeLoad`, `dayLabel` and the domain modules Today reads (§2.8).

### 2.3 Existing behavior, verified from source

**One Move (`OneMoveCard` + `OneMoveContext`).** Four presentations from `oneMoveForDay(state, today)`:
`completed` ("Done. That's enough for today."), `withheld` (InsightBlock: "Today is already full, so Her Keys isn't
adding anything."), `none` ("No one move today"), `selected` (`RecommendationBlock`, action label **"I did it"**,
`meta` "ABOUT n MINUTES", a `WhyThis` with the single `move.observation`). "I did it" → `completeOneMove` via
`store.dispatch`: completes the underlying task / resolves the Needs Me item in the same change, marks the record
`completed`, appends an observation. The decision is stored once per logical day; a completed move is never
replaced; an unfinished move whose target vanished is cleared and re-chosen.

**Recommendation decisions (`DailyLoadCard`, one timing decision per logical day — `latestTransitionDecision`):**

| Action | Trigger | Mutation (all through `store.commit`/`dispatch`) | Recorded as |
|---|---|---|---|
| MOVE task | tight/overloaded transition with a movable candidate | `approveDailyLoadMove` — task planned for tomorrow | `daily_load.move_task`, approval `approved` + `deferred` observation |
| MOVE event | overlap with one flexible side, or transition with a movable flexible event | `approveMoveEvent` | `daily_load.move_event`, `approved` |
| DROP | capacity pressure with a flexible not-due-today task | `approveDropTask` (task archived) | `daily_load.drop_task`, `approved` |
| SHORTEN | same, when `canShortenTask(minutes)` | `approveShortenTask` | `daily_load.shorten_task`, `approved` |
| PROTECT | any offered move/drop | `approveProtectItem` (flexible → fixed) | `daily_load.protect_item`, `approved` |
| KEEP (decline) | any timing / capacity verdict | `keepDailyLoadPlan` / `keepCapacityPlan` | `daily_load.keep_plan` / `keep_capacity_plan`, `declined` |
| Show another option | several candidates | local `candidateIndex` only | nothing durable |
| Undo | today's move, while the item is where the move put it | `undoRecommendedMove` | a `keep_plan` record; the day's one decision stays made |

`DailyLoadCard` branches, in order: moved-confirmation → kept-confirmation → "Nothing entered yet" (household
ever empty) → "Nothing scheduled today." → overlap → capacity pressure (with its own already-decided states) →
overdue → **"Nothing needs moving — Your commitments have room between them"** (filler success card) →
transition/tight-window with candidate or flexible event or a "leave a few minutes early" notice.

**Completion.** Only One Move has a completion gesture on Today. Tasks are completed elsewhere (`TaskForm`).

### 2.4 Foundation APIs the current Today consumes

`projectDay` / `projectStateDay`, `computeDailyLoad`, `assessDailyLoadIssues`, `dailyLoadDecisionFor`,
`undoableMove` / `undoRecommendedMove` / `moveWasUndone`, `loadTierForDay` (through One Move),
`oneMoveForDay` / `completeOneMove`, `approveMoveEvent` / `approveDropTask` / `approveShortenTask` /
`approveProtectItem` / `keepCapacityPlan`, `canShortenTask`, `tomorrowPreview`, `useLifeStatus`
(`deriveLifeStatus`), `needsSyncAttention`, the store snapshot (`recovery`, `persistenceDegraded`).

**Not consumed at all by any app code at source** (found by grep across `src/` and `app/`): `briefingFor`,
`attentionFor`, `relatedTo`, `needsMePersonally`, `explain`, `blockersOf` / `isBlocked`, `capacityWindowFor`,
`intentLifecycle`, `pendingApprovals`, `commitmentFacetsOf`, `unacknowledgedResponsibilities`. Feature 01 is their
first consumer.

### 2.5 Permanent UI-system components the current Today consumes

`Screen`, `AppText`, `Overline`, `Card` (tones `subtle` / `attention` / `success`, `raised`), `Tag`, `Button`
(primary / secondary / ghost, `sm`), `SegmentBar` (neutral), `StatusList`, `RecommendationBlock`, `InsightBlock`,
`WhyThis`, tokens `color.*` / `colors.*` / `spacing` / `radius` / `interaction`.
Not used by Today at source: `ConfidenceBadge`, `ProvenanceLabel`, `ActionStateBlock`, `ClarificationPrompt`,
`InterpretationReview`, `Sheet` / `ConfirmationSheet`, `InlineNotice`, `LoadingState` / `EmptyState`.

### 2.6 Loading / degraded / recovery behavior that affects Today

- `RootNavigator` returns `null` until `isSettled(status)`, so Today **never mounts** while `unhydrated` /
  `hydrating`; the splash screen covers the gap. Recovery (`status === 'recovery'`) *does* mount Today, on a
  freshly created state.
- `AppStore` recoveries and what they leave behind:
  - `invalid` (corrupt / integrity) → fresh state, persistence stays **enabled**, blob quarantined when possible.
  - `future_version` → fresh **in-memory** state, persistence **disabled**, the newer data is preserved untouched.
  - `read_failed` → fresh in-memory state, persistence **disabled**.
  - `mode_mismatch` → fresh state; persistence **disabled** only when the stored household was a real one.
- Today's only current treatment is `PersistenceNotice` (a metadata line) and `SyncNotice`. **Today renders an
  ordinary Today over a stand-in in-memory state in the `future_version` / `read_failed` cases** — the household the
  user actually has is not what is on screen, and nothing says so beyond "Some recent changes may not be saved yet."
  That is a truth gap Feature 01 must close (Addendum §M) without rebuilding the shell's recovery UI.

### 2.7 Runtime baseline screenshot

Inherited K9 runtime capture of the pre-feature Today (code identical at `5007b0f`; the Today files last changed in
K8 `c0098e2`, before this capture): `docs/builds/hk-feature-01-today/before/t0-today-k9.png` (a byte copy of
`docs/design-system/after/k4-today.png`). It shows: overline "TODAY · SUNDAY", "Hi, Maren", the day-state sentence,
the neutral LoadMeter ("Tight"), the attention Daily Load decision card with WhyThis and three secondary actions,
and the One Move recommendation beneath it — two clay primary buttons on one first screen, and the One Move "Why"
below the fold.

### 2.8 PRESERVE / REFINE / REPLACE

Default is PRESERVE or REFINE. Only one item is REPLACE, and its five required justifications are given.

| Surface | Class | What changes / what is guaranteed to survive |
|---|---|---|
| Route identity, tab, guard table | **PRESERVE** | One Today route. No new route. `routeAccess.ts` untouched. |
| Greeting + day-state sentence (`dayState.ts`) | **REFINE** | The overline gains the full logical-day label (weekday + date). The sentence becomes the output of a deterministic narrative function that *reuses* `describeDayState` for every verdict sentence. `describeDayState` and its two exact strings stay byte-identical and tested. |
| `LoadMeter` / `describeLoad` | **REFINE** | Rendered only when the day has commitments to measure (today it also renders "Open — Plenty of room between today's commitments" on a day with none). `describeLoad` is untouched. |
| `DailyLoadCard` (all actions) | **REFINE** | Every action, every guard, every recorded decision and Undo is kept. The two filler branches ("Nothing entered yet" / "Nothing scheduled today." / "Nothing needs moving") stop being the card's job — the view model owns sparse and empty states. |
| `OneMoveCard` | **REFINE** | Same four states, same "I did it", same completion mutation. Gains: the structured *Why this one* (evidence links) behind a disclosure, an open-target route where a legitimate one exists, and truthful copy per target kind. |
| `HandledLedger` | **REFINE** | Same list, same Undo, same one-tap-expand. **Label corrected** (see §9, D-03): an approval is a *decision*, so "Handled by Her Keys" becomes "Changes you approved". Times now use the household timezone instead of the device's. |
| `NeedsMeChip` | **REFINE** | Becomes the low-priority pointer; items due today move into the attention block as rows. |
| `LifeStatusSummary` | **REFINE** | Kept, moved to a collapsed lower-priority "Also checked" disclosure. Nothing deleted (WHY #4). |
| `TimelineList` | **REFINE** | On Today it sits behind an "Everything today" disclosure. The component and its Calendar use (`onPressItem`) are untouched. |
| `PersistenceNotice`, `SyncNotice` | **PRESERVE** | They are the shell/runtime affordance that happens to live in Today's header. No second sync UI is built. |
| `TalkItOutEntry` | **PRESERVE** | Existing entry point, unchanged. |
| `ScheduleContext`, `OneMoveContext` | **PRESERVE** | Actions still flow through them; the new pure builder reads the same domain functions. |
| `TomorrowPreview` (component) | **REPLACE** | See below. |

**REPLACE — `src/features/today/TomorrowPreview.tsx`.**
1. *Existing behavior:* always renders a "Tomorrow" card with one factual line ("Nothing fixed on the calendar yet.")
   whether or not tomorrow bears on anything today; calls the domain with `nowMs: Date.now()` from inside the component.
2. *Concrete defect:* it is a permanent box that says nothing when nothing is constrained (prompt §4, §20 — no empty
   boxes; the upcoming item must appear only when it "materially changes today's choices"), and it reads the system
   clock in a component (prompt §25).
3. *Why REFINE cannot do it:* the component owns both the computation and the always-on contract. The new "Coming
   up" content also draws on a source it never had — an unmet `requires` dependency of tomorrow's commitment
   (`blockersOf`) — so it has to be fed a typed constraint by the view model, not compute its own.
4. *Replacement behavior:* `TodayUpcoming` renders one line **only** when the view model supplies a constraint.
   Sources, in order of strength: an unmet dependency of a commitment today/tomorrow; the domain
   `tomorrowPreview()` headline when tomorrow has an overlap / tight transition (its text used verbatim); a
   high-consequence task due tomorrow.
5. *Original guarantee preserved:* the domain `tomorrowPreview()` and its tests (`tomorrowPreview.test.mjs`, the
   Tomorrow-preview block of `build3Audit.dailyLoad.test.mjs`) are unchanged and remain the source of the
   overlap/tight wording.

### 2.9 Existing test disposition (T0 — provisional; finalized in §6)

There are no Today *component* tests at source. The pre-existing tests whose subject is Today-surface code:

| Test | Current guarantee | Disposition | New test if replaced | Reason |
|---|---|---|---|---|
| `dailyLoad.test.mjs` › *approving the first recommendation leaves the day balanced* | `describeDayState(after,'moved') === 'One change made. Today has room now.'` | **PRESERVED** | — | `describeDayState` is untouched |
| `dailyLoad.test.mjs` › *the day state does not claim room after a move that left the day overloaded* | never says "room now" while still overloaded | **PRESERVED** | — | same |
| `build3Audit.dailyLoad.test.mjs` — every test that calls the `verdict()` helper (`header: describeDayState`, `meter: describeLoad`) | header and meter agree with the verdict across travel-aware, overlap, capacity, one-decision-per-day, order-independence cases | **PRESERVED** | — | both functions untouched; Today's new headline reuses them |
| `loadTier.test.mjs` › *the load meter reads the tier instead of keeping its own thresholds* | `describeLoad` owns no thresholds of its own | **PRESERVED** | — | untouched |
| `categories.test.mjs` (`deriveLifeStatus`, `dayLabel`) | life status and "Today"/weekday labels | **PRESERVED** | — | untouched (`dayLabel` gains a sibling, not a change) |
| `tomorrowPreview.test.mjs` and the Tomorrow block of `build3Audit.dailyLoad.test.mjs` | domain Tomorrow preview semantics | **PRESERVED** | — | domain untouched; the component that showed it is REPLACED (§2.8) |
| Domain suites Today reads: `dailyLoad*`, `oneMove`, `build3Audit.oneMove`, `recommendationActions`, `build3Audit.recommendations`, `appStore` | Daily Load, One Move, recommendation actions, Undo, store lifecycle | **PRESERVED** | — | domain untouched |

No test is removed or rewritten at T0.

---

## 3. Feature requirement register

| ID | Requirement (prompt §) | State | Evidence |
|---|---|---|---|
| FR-01 | Orientation: logical-day label + concise framing (§9A, J) | IN PROGRESS | model: scenarios A, J; UI: `TodayHeader` |
| FR-02 | "What matters today" prioritized, not every item (§11) | IN PROGRESS | model: scenarios A, I; UI: `TodayMatters` (`components.test.mjs`) |
| FR-03 | One Move — full presentation lifecycle, all registered target kinds (§15, N) | IMPLEMENTED | model: scenarios D, F, N (`tests/today/oneMove.test.mjs`: none / selected / completed / withheld / rollover, all six kinds); UI: `OneMoveCard` (`components.test.mjs`) |
| FR-04 | "Why this One Move" from structured evidence, progressive (§16) | IMPLEMENTED | model: scenario F (reasons re-checked, stale links dropped, unknown codes never rendered); UI: "See why" → reasons → "Evidence and source" (`components.test.mjs`) |
| FR-05 | Needs Me — things that exist vs things that need her (§12) | IMPLEMENTED | model: scenarios B, C; UI: `TodayAttention` (`attentionUi.test.mjs`) — delegated / requested / acknowledged / accepted / declined / returned are each their own state |
| FR-06 | Risk / attention — specific, evidence-based (§13) | IMPLEMENTED | model: scenarios B, C, E; UI: `TodayAttention`; specific, evidence-based rows, no risk score |
| FR-07 | Capacity — "does the day fit", no scores (§14) | IMPLEMENTED | model: scenario B (Daily Load classification only); UI: `LoadMeter` + `DailyLoadCard` + capacity-profile note (TODAY-FD-001) |
| FR-08 | What can wait — bounded, only when provably safe (§17, T) | IMPLEMENTED | model: scenario H (six look-alikes stay unlisted; bounded at three); UI: `TodayList` "Can wait today" |
| FR-09 | Responsibility / waiting; delegated ≠ covered (§18) | IMPLEMENTED | model: scenario C; UI: `TodayAttention`, `TodayList` "Waiting"; take-back through `useTodayActions` -> `returnToSelf` |
| FR-10 | "Handled by Her Keys" only with execution **and** outcome (§19, O) | IMPLEMENTED | model: scenario G (execution AND success outcome; unconfirmed / approved-not-run / failed / undone / yesterday); UI: `TodayHandled` (`attentionUi.test.mjs`) |
| FR-11 | Upcoming constraint — one, only if material (§20) | IMPLEMENTED | `tests/today/lifecycle.test.mjs` "the upcoming constraint": dependency (today and tomorrow, several blockers), tomorrow overlap verbatim, consequential deadline, none = null, strongest wins, four days out = null |
| FR-12 | What changed — no presentation markers in state (§21, P) | IMPLEMENTED | scenario C (`changedToday` from dated observations); `lifecycle.test.mjs` "what changed": no presentation marker in `AppState` or the model; yesterday is not "today" |
| FR-13 | Correction / adjustment through existing paths only (§22, H) | IMPLEMENTED | Scenario M (`tests/today/correction.test.mjs`): real store, persisted, re-derived; task edit, take-back, approve / decline; MP-01..04 offer nothing |
| FR-14 | Progressive disclosure, accessible (§23) | IMPLEMENTED | UI: `TodayDisclosure` (`components.test.mjs`); "See why" -> "Evidence and source"; "More that needs you"; "N more"; "Everything today"; "Also checked"; "Changes you approved" |
| FR-15 | Adaptive density; ≤3 primary blocks on an ordinary day (§24, S) | IMPLEMENTED | scenarios A, D, I; `guarantees.test.mjs` "structure": over 33 corpus entries never more than 3 primary blocks, every list bounded, a section is in the composition iff it has content |
| FR-16 | Time: household timezone, logical day, DST, time-of-day, rollover (§25, P, W) | IMPLEMENTED | scenarios J (zone, near-midnight, spring-forward, fall-back), P (08:00 / 15:00 / 21:00), W (real store + real hook across midnight: `lifecycle.test.mjs`, `hooks.test.mjs`) |
| FR-17 | Local-first; unknown ≠ light; unrecovered ≠ light; sync stays infrastructure (§26, J, K, M) | IMPLEMENTED | scenarios K, O (`lifecycle.test.mjs`): real-store recoveries — newer version, unreadable storage, other mode, corrupt — Today is unavailable or honestly empty, never "light"; no sync surface in Today |
| FR-18 | Demo isolation and onboarding guard intact (L) | IMPLEMENTED | scenario L (`lifecycle.test.mjs`): demo renders, is pure, claims no handled work, names no account/cloud; the model imports no account/storage/network module; onboarding guard and single Today route intact |
| FR-19 | Typed future-LLM seam, nothing wired (§27) | IMPLEMENTED | `model/narrative.ts`; `guarantees.test.mjs` "seam": a provider replaces the headline and nothing else; no model / network / key / library anywhere |
| FR-20 | Tone: calm, precise, adult; no cheerleading / dramatization (Q) | IMPLEMENTED | `guarantees.test.mjs` "tone": every projected string in 33 scenarios AND every string literal in the components and model (>150 checked) against eight banned families |
| FR-21 | Minimum sensitive detail at first glance (R) | IMPLEMENTED | `guarantees.test.mjs` "first-glance privacy": locations, notes, amounts, a child's name and birth date, travel never enter the projection; deeper detail stays behind disclosure |
| FR-22 | Accessibility: order, headings, dynamic text, targets, non-color status, expand state (§38) | IMPLEMENTED | `guarantees.test.mjs` "accessibility": role + name + 44pt on every control, headings, reading order, status as words, expanded state, no truncation / fixed heights / font-scaling off, long titles and names wrap |
| FR-23 | Dense reference derivation < 100 ms, measured and reported (X) | IMPLEMENTED | `guarantees.test.mjs` "performance": dense reference (20 events, 40 tasks, 6 delegations, 5 captured) median 4.8-6.5 ms, p95 8-11 ms over 40 runs (target < 100 ms); no cache added |
| FR-24 | Permanent UI system consumed; ≤15 feature-local components; no new dependency (§7, Y, Z, AC) | NOT STARTED | |

---

## 4. Files owned, shared files touched, primitives — *filled as the build proceeds*

**Files owned by this feature** (`src/features/today/…`, `tests/today/…`, this ledger and its evidence folder):

| Path | Role | Commit |
|---|---|---|
| `src/features/today/model/types.ts` | The view-model types — the vocabulary of the projection | T2 |
| `src/features/today/model/todayView.ts` | `buildTodayView`: the pure projection and the first-level composition | T2 |
| `src/features/today/model/refs.ts` | Typed-reference → title / route / provenance; household-timezone time labels | T2 |
| `src/features/today/model/narrative.ts` | The typed future-LLM seam and the deterministic provider (headline only) | T2 |
| `src/features/today/model/oneMoveView.ts` | One Move presentation: lifecycle, per-kind affordance table, evidence → reasons | T2 |
| `src/features/today/model/attentionView.ts` | What needs her: attention rows, the delegation lifecycle, waiting-on-others, "on your mind" | T2 |
| `src/features/today/model/executionView.ts` | Handled (execution **and** outcome), waiting, failed | T2 |
| `src/features/today/model/mattersView.ts` | What matters today (bounded, ordered, de-duplicated) | T2 |
| `src/features/today/model/canWait.ts` | What can safely wait (only ever removes from Daily Load's own movable set) | T2 |
| `src/features/today/model/upcoming.ts` | The one upcoming constraint, if it earns a line | T2 |
| `src/features/today/model/decisionView.ts` | Whether the day has a Daily Load decision to show, and its state | T2 |
| `src/features/today/model/phrases.ts` | Total maps for the closed vocabularies Today speaks about | T2 |
| `src/features/today/model/index.ts` | Public surface of the model | T2 |
| `tests/today/fixtures.mjs` | Scenario builders (domain operations; server-written rows as literals, validated) | T2 |
| `tests/today/scenarios.test.mjs`, `scenarios2.test.mjs` | Scenarios A–J, mechanical | T2 |
| `src/features/today/useTodayView.ts` | The one place the screen reads the clock; ticks each minute and on foreground, first asking the store to pick up a new day | T3 |
| `src/features/today/TodayBriefing.tsx` | Renders the projection in the order it composed; no layout logic of its own | T3 |
| `src/features/today/TodayHeader.tsx`, `TodayMatters.tsx`, `TodayList.tsx`, `TodayStateNotice.tsx` | Orientation; the anchors; the quiet one-line rung; unknown / unavailable / sparse states | T3 |
| `src/features/today/TodayDisclosure.tsx` (`TodayDisclosure`, `SectionLabel`) | MGP-01: the accessible expand/collapse and the real-heading label | T3 |
| `src/features/today/TodaySourceLine.tsx` | Provenance / confidence in the permanent design-system language | T3 |
| `tests/today/components.test.mjs`, `tests/today/support/*` | Render / props contract tests; a recording `expo-router` stub scoped to this feature's tests | T3 |
| `tests/today/oneMove.test.mjs` | Scenario N: One Move lifecycle and every registered target kind | T4 |
| `src/features/today/TodayAttention.tsx` | What needs her: specific rows, take-back, explicit approvals through `ConfirmationSheet` | T5 |
| `src/features/today/TodayHandled.tsx` | Handled by Her Keys, in the permanent action-state language | T5 |
| `src/features/today/useTodayActions.ts` | The two existing domain mutations the attention rows can make (`returnToSelf`, `decideIntent`), through `store.commit` | T5 |
| `tests/today/attentionUi.test.mjs` | Attention / approval / handled render and interaction contract | T5 |
| `tests/today/correction.test.mjs` | Scenario M: correction end to end through a real store; every route is an existing screen; no fake affordance | T6 |
| `tests/today/lifecycle.test.mjs` | Scenarios K, L, O, P, W; the upcoming constraint; what changed | T7 |
| `tests/today/hooks.test.mjs`, `tests/today/support/rn-with-appstate.mjs`, `stub-appstate.mjs` | The real `useTodayView` under the real `AppStateProvider` across midnight; a test-local `AppState` stub (shared test support untouched) | T7 |
| `tests/today/corpus.mjs` | 33 named, real households + instants: the range of days every guarantee runs over | T8 |
| `tests/today/guarantees.test.mjs` | Structure, tone, privacy, purity, no JSON-bag, the seam, accessibility, performance | T8 |

**Existing Today files modified** are listed with their classification in §2.8 and their commits in the commit series (§10).

**SHARED FILES TOUCHED** (path · reason · commit · likely sibling collision · reconciliation need). Only Today consumes
any of these, but they live outside `src/features/today/`, so a sibling branch that edits the same file will collide:

| Path | Reason | Commit | Likely sibling collision | Reconciliation |
|---|---|---|---|---|
| `src/features/daily-load/DailyLoadCard.tsx` | REFINE: remove the filler branches (empty household, nothing scheduled, overdue, "nothing needs moving") the view model now owns; every action and guard untouched | T3 | **Feature 03 (Calendar / Capacity)** is the likeliest to edit `daily-load/*` | Small, deletion-only diff in one region; take Feature 03's version and re-apply the four deletions |
| `src/features/daily-load/LoadMeter.tsx` | REFINE: takes the estimate as a prop from the view model instead of reading `useSchedule()`; adds the optional capacity-profile note | T3 | Feature 03 | Only Today imports it |
| `src/features/life/LifeStatusSummary.tsx` | REFINE: wrapped in a collapsed disclosure | T3 | Feature 02 (Life Inbox mount) | Only Today imports it; one wrapper |
| `src/features/one-move/OneMoveCard.tsx` | REFINE: props from the view model; Why disclosure | T4 | Feature 04 (`system` One Move targets) | Only Today imports it |

**MISSING GLOBAL PRIMITIVE register** (semantic need · current limitation · feature-local solution · sibling relevance):

| # | Need | Limitation | Feature-local solution | Sibling relevance |
|---|---|---|---|---|
| MGP-01 | An accessible expand/collapse ("Why this?", "Everything today", "Can wait") | `WhyThis` always renders open; `HandledLedger` had an ad-hoc `Pressable`+`Overline` toggle; no design-system disclosure exists | `TodayDisclosure` (+ `SectionLabel`, a real heading) in `src/features/today/TodayDisclosure.tsx`, built only from `AppText` and tokens, exposing `accessibilityState.expanded`, a 44pt target, chevron hidden from a screen reader. `HandledLedger` now uses it too | High — Talk It Out, Calendar, Systems will each want one. Integration wave should promote **one** shared disclosure. |
| MGP-02 | A heading role for the design-system `Overline` | `Overline` renders `Text` with no way to pass `accessibilityRole="header"`, so a section eyebrow cannot be a heading | `SectionLabel`: `AppText variant="label"` upper-cased, `accessibilityRole="header"` | Medium — every screen with eyebrow section titles |

---

## 5. Foundation consumption trace, correction map, authority-prefix index — *T1*

### 5.1 Foundation consumption trace (Addendum §F)

Every primitive the prompt says Today will consume, traced to actual code. Governance IDs are from
`docs/builds/BUILD4_FOUNDATION_BUILDOUT.md` §"FE01 rows". Paths are relative to `src/domain/`. A row's
classification is `CONSUME-AS-IS`, `CONSUME-PARTIAL` (with exactly what is missing), or `NOT-FOUND`. **Nothing is
`NOT-FOUND`**, so no requirement is STOPPED for a missing primitive; the three `PARTIAL`s each have a bridge that
introduces no new truth (bridges are stated).

| ID | Capability | Implementation | API / accessor Today uses | Test evidence | Today usage | Class |
|---|---|---|---|---|---|---|
| B4-FE01-001 | Stored provenance | `foundation/provenance.ts` (`ProvenanceSchema`, `isUserStated`, `carriesConfidence`); `reasoning/provenance.ts` (`provenanceOf`) | `row.provenance.producer`, `isUserStated`, `carriesConfidence` | `foundationTruth.test.mjs`, `foundationAcceptance.test.mjs` (`isUserStated`) | Every row Today names carries its stored producer into the view model; labels come from the design system's `PROVENANCE_LABEL`; `legacy-unknown` is never rendered as user-stated | AS-IS |
| B4-FE01-005 | Durable confidence | `reasoning/confidence.ts` (`promoteConfidence`, `promoteProvenance`); stored in `Provenance.confidence` (`possible` / `likely` / `established`, non-null exactly for `ai-inference` and `import-sync`) | read `row.provenance.confidence` only | `foundationTruth.test.mjs` | Read-side only → `ConfidenceBadge`. Today **never promotes** (the two callers of `promoteProvenance` are `acceptInterpretation` and `confirmPattern`) | AS-IS |
| B4-FE01-006 | Behavior observations (append-only) | `foundation/observation.ts`, `observations.ts` (`appendObservation`) | read `state.observations` (`logicalDate`, `about`, `outcome`) | `foundationAcceptance*.test.mjs`, `foundationOps.test.mjs` | Source of the small "changed today" cue on a responsibility (acknowledged / accepted / declined / returned today). Writes happen only inside existing transitions | AS-IS |
| B4-FE01-008 | Action category / consequence / reversibility | `foundation/authorization.ts` (`ACTION_CATEGORIES`, `CONSEQUENCE_LEVELS`, `REVERSIBILITY`, `consequenceRank`) | `consequenceRank`, `intent.consequence`, `intent.reversibility` | `foundationAcceptance.test.mjs`, `foundationOps.test.mjs` | Risk and can-wait use `consequenceRank(...) >= high`; an approval names the intent's own consequence and reversibility | AS-IS |
| B4-FE01-009..012 | Intent → decision → execution → outcome | `foundation/authorization.ts` (schemas); `authorization.ts` (`intentLifecycle`, `pendingApprovals`, `decideIntent`) | `intentLifecycle(state, id)`, `pendingApprovals(state, nowMs)`, `decideIntent`; `state.executions` / `state.outcomes` | `foundationAcceptance.test.mjs`, `foundationAcceptance2.test.mjs`, `foundationOps.test.mjs`; server rows fixture `tests/support/richHousehold.mjs` (`withServerRows`) | Approvals needing her; "handled" only for a succeeded execution **with** a success outcome; "waiting" for an approved-not-run / unconfirmed one | AS-IS |
| B4-FE01-014 | Responsibility (lifecycle) | `foundation/responsibility.ts` (`isActiveResponsibility`, `isUnacknowledged`); `responsibility.ts` (`unacknowledgedResponsibilities`, `liveResponsibilityFor`, `needsMePersonally`, `returnToSelf`) | as listed | `foundationAcceptance.test.mjs`, `foundationOps.test.mjs`, `foundationAcceptance2/3` | Responsibility rows: requested / acknowledged / accepted / declined / returned, "delegated ≠ covered", the unacknowledged escalation, "Take it back" | AS-IS |
| B4-FE01-015 | Commitment facets | `foundation/commitment.ts` (`commitmentFacetsOf`, `ANSWERABLE_FACETS`) | `commitmentFacetsOf({kind,row})` | `foundationAcceptance.test.mjs`, `foundationAcceptance3.test.mjs`, `foundationOps.test.mjs` | Consequence, deadline-with-time, scheduling window, flexibility, effort read through the one contract; `null` stays "not known" | AS-IS |
| B4-FE01-016 | Capacity metadata / profile | `foundation/structure.ts` (`CapacityProfileSchema`); `structure.ts` (`capacityWindowFor`, `DEFAULT_CAPACITY`) | facets via `commitmentFacetsOf`; profile via `state.capacity` | `foundationAcceptance.test.mjs`, `foundationOps.test.mjs` | **PARTIAL.** Facets: consumed. **Profile: Daily Load does not read it** — `detectCapacityPressure` uses the `CAPACITY_DAY_START/END_MINUTES` constants, `computeDailyLoad` the `REQUIRED_TRANSITION_BUFFER_MINUTES` constant, `loadThresholds` its own. `capacityWindowFor` has zero app callers. **Bridge:** none is possible without changing foundation. Today reports the verdict Daily Load actually computed, states the window it used, and when `state.capacity` holds an override that differs from the default it says so instead of implying the verdict reflects her setting. Recorded as TODAY-FD-001 | PARTIAL |
| B4-FE01-017 | Dependencies | `foundation/structure.ts` (`DependencySchema`); `structure.ts` (`blockersOf`, `isBlocked`, `isDone`) | `blockersOf(state, ref)`, `state.dependencies` | `foundationAcceptance.test.mjs`, `foundationAcceptance3.test.mjs`, `foundationOps.test.mjs` | Upcoming constraint (unmet `requires`); can-wait exclusion (something live requires this) | AS-IS |
| B4-FE01-019 | Attention intent (derived) | `reasoning/attention.ts` (`attentionFor`, `ATTENTION_REASONS`) | `attentionFor(state, nowMs)` | `foundationAcceptance.test.mjs`, `foundationAcceptance2.test.mjs`, `foundationAcceptance3.test.mjs` | The one source of deadline / risk / needs-me / unacknowledged delegation / approval / external-source-changed rows and their urgency. Conflict and capacity attention are shown through the Daily Load decision block, not twice | AS-IS |
| B4-FE01-024 | Reasoning evidence | `foundation/pattern.ts` (`EvidenceLinkSchema`, `KNOWN_EVIDENCE_CODES`); `patterns.ts` (`explain`, `addEvidence`) | `explain(state, {kind:'oneMove', id})` | `foundationAcceptance3.test.mjs`, `foundationOps.test.mjs` | "Why this One Move": the stored evidence links, code → fact. Unknown codes are stored and never rendered | AS-IS |
| B4-FE01-025 | Briefing projection (derived) | `reasoning/briefing.ts` (`briefingFor(state, nowMs, sinceMs)`) | `delegated`, `unacknowledged`, `handled` (narrowed); the ranked list itself comes from `attentionFor` | `foundationAcceptance.test.mjs`, `foundationAcceptance3.test.mjs` | **PARTIAL.** `briefingFor` is called once per projection and supplies `delegated` (who holds what), `unacknowledged` (which requests went unanswered) and `handled` (the candidate set, then narrowed). The ranked attention list is read from `attentionFor` directly, because two of the reasons Today must show — a pending approval and a changed external source — are not in the briefing's `atRisk` / `needsHer` lists; `atRisk` and `needsHer` are filters of that same list, so nothing is derived twice. **Gaps:** (a) `handled` = succeeded executions **not gated on an outcome** — bridge: Today narrows it to those that also have a success outcome (stricter, never broader); (b) `changed` needs a `sinceMs` "last looked" marker, which may not be persisted — bridge: not used; the changed cue comes from observations dated *today* (a logical-day boundary, not a stored marker); `sinceMs` passed to `briefingFor` is the start of today's logical day, derived; (c) `matters` is counts only — bridge: Today composes its matters block from `projectStateDay` + attention | PARTIAL |
| B4-FE01-027 / -028 | Typed reference convention / One Move target registry | `foundation/typedRef.ts` (`TYPED_REF_KINDS`, `refExists`); `oneMove.ts` (`TARGET_ADAPTERS`, private; `oneMoveForDay`); `state.ts` (`ONE_MOVE_TARGET_TYPES`) | `oneMoveForDay(state, today)`; the stored record's `targetType` / `targetId`; `ONE_MOVE_TARGET_TYPES` | `oneMove.test.mjs`, `build3Audit.oneMove.test.mjs`, `foundationTruth.test.mjs` | The registry is consumed *through* `oneMoveForDay`; Today ranks nothing. The per-kind open/complete affordance is a `Record<OneMoveTargetType, …>` so a new registered kind fails to compile until Today decides its affordance (§5.2 table N) | AS-IS |
| B4-FE01-031 | Cross-domain projection | `reasoning/related.ts` (`relatedTo`) | `relatedTo(state, ref)` | `foundationAcceptance.test.mjs`, `foundationAcceptance2.test.mjs`, `foundationAcceptance3.test.mjs` | The One Move target's own dependencies / responsibilities as second-level context (not as the recorded reason) | AS-IS |

Also consumed, not on the prompt's list: B4-FE01-013 household people (`state.people`, for the name of who holds a
delegated thing), and the store snapshot's `status` / `recovery` / `persistence` (B4-FE01-029 local persistence v4)
for the lifecycle rules (§2.6).

**One Move target kinds — what actually exists for each** (Addendum §N: "do not manufacture a completion affordance"):

| Kind | Chosen by the selection engine? | "I did it" (`completeOneMove`) does | Open / adjust route | Copy the adapter supplies |
|---|---|---|---|---|
| `task` | yes | completes the task **and** records the move done | `/task-editor` `{taskId}` | "Already on your list." |
| `needsMe` | yes | resolves the Needs Me item **and** records the move done | `/life/needs-me` | "Captured earlier and still open." |
| `catalog` (demo only) | yes, demo households only | records the move done; there is no row behind it | none | the catalog item's own observation |
| `event` | no (stored shape only) | **records the move done only**; an event has no completion state | `/event-editor` `{eventId}` | "On your calendar." |
| `system` | no | records only; running a system is Feature 04's | none (Systems tab owns it) | "One of your routines." |
| `responsibility` | no | records only ("Check that this is covered") | none — no UI for responsibility exists | "You asked someone to take this." |

### 5.2 Correction-affordance map (Addendum §H)

Rule applied throughout: **if the mutation does not exist, no affordance implying it is rendered**; the gap is
recorded (MP-xx). No Today-local mutation is invented. Every mutation goes through `store.commit` /
`store.dispatch`, which persists before or with showing.

| Thing displayed | Source domain type | Correctable? | Existing mutation / API | Destination | Explicit confirmation | Reject an inference? | Provenance / confidence effect |
|---|---|---|---|---|---|---|---|
| Task (matters, One Move target, attention row, can-wait item, upcoming constraint) | `Task` | yes | `updateTask` (title, category, subject, duration, commitment, dueDate, plan, notes), `completeTask`, `archiveTask` | `/task-editor` `{taskId}` (`TaskForm`) | Save button; "Remove task" archives immediately | only as "Remove task" (`archiveTask` → `cancelled`); **no dedicated reject** | **none** — `updateTask` cannot touch `provenance` (`EDITABLE_TASK_FIELDS`); an edited inferred task stays `ai-inference` at its stored confidence |
| Event (matters, decision block, upcoming) | `CalendarEvent` | yes | `updateEvent`, `removeEvent` | `/event-editor` `{eventId}` (`EventForm`) | Save; "Remove event" immediate | as above | none |
| Needs Me item | `NeedsMeItem` | yes | `resolveNeedsMeItem`, `promoteNeedsMeItem`; `updateNeedsMeItem` exists but has no screen | `/life/needs-me` (list: "Promote to task" → `/task-editor` `{needsMeId}`, "Resolved") | none (immediate) | n/a | none |
| **Row Her Keys inferred, confidence `possible` / `likely`** | task / event with `provenance.producer` `ai-inference` or `import-sync` | edit only | as the task / event rows above | as above | as above | **MP-01: no mutation confirms or rejects an existing canonical row.** The only writers of `confirmed` confidence are `acceptInterpretation` (a *pending candidate*, outside canonical state) and `confirmPattern`. Today shows the badge and the label and **offers edit only** — no "That's right" / "That's not it" | none |
| One Move recommendation | `OneMoveRecord` | its source item, yes | completion only (`completeOneMove`) | source item's editor per the kind table | none | **MP-02: no "not today" / "show another" for a One Move** — the day's decision is stored once and only completes. `RecommendationBlock` hides those buttons when the handlers are absent, so none are passed | none |
| Daily Load decision (timing / capacity) | `ActionRecord` | yes, while the day's one decision is unmade | `approveDailyLoadMove`, `approveMoveEvent`, `approveDropTask`, `approveShortenTask`, `approveProtectItem`, `keepDailyLoadPlan`, `keepCapacityPlan`; `undoRecommendedMove` | in place | the button *is* the approval; Undo offered only for today's move while the item is where it was put | n/a | none |
| Responsibility state | `Responsibility` | **hers** to take back; the holder's answers are not hers to fabricate | `returnToSelf` ("Take it back"), `completeResponsibility`, `reassign` exist | in place for "Take it back" only | explicit label; records `returned` | n/a | none. **MP-03: nothing in the app can receive a holder's acknowledge / accept / decline** — that is delivery integration; Today shows the true state and never offers to record it on their behalf |
| Pending approval (Her Keys proposed) | `ActionIntent` | yes | `decideIntent(approved \| declined)` | `ConfirmationSheet` naming the intent's own consequence and reversibility | **yes — always explicit** (agency) | n/a | writes a decision row; never claims it will run (D-05) |
| Handled / waiting rows | `ActionExecution` + `ActionOutcome` | **no** — server-written, pulled only | none | the underlying item's editor via `about` | — | — | — (no affordance is shown) |
| Capacity reading | derived | via its inputs | edit the events / tasks (travel, preparation, commitment, duration) | editors above | — | — | — **MP-04: `setCapacity` has no screen**, so a household cannot correct the day window; Today does not pretend to offer it |
| "What can wait" item | `Task` | yes | as the task row | `/task-editor` | Save | — | none |

### 5.3 Authority-prefix index (Addendum §G)

So a later feature does not invent meaning for an identifier it meets in the code or the docs:

| Prefix | Meaning | Where defined |
|---|---|---|
| `SD4-` | Cloud-schema **design decisions** from the Build 4 SD4 design (e.g. SD4-020 the ledger is immutable, SD4-021 local eviction never emits a cloud delete). The register is **closed**; new structures derive authority from `B4-FE01-` | `docs/builds/BUILD4_SD4_CLOUD_SCHEMA.md`, `BUILD4_SD4_DELTA_MATRIX.md` |
| `B4-P0-` | Build 4 **Phase 0 decision register** (e.g. B4-P0-010 demo households never sync; B4-P0-019 ordinary sync never removes memberships) | `docs/builds/BUILD4_PHASE0_CHECKPOINT.md`, `BUILD4.md` |
| `B4-BE02-` / `B4-BE03-` | Build 4 **backend** work items; `-OR-` suffix = *open recommendation* found at that step (e.g. `B4-BE02-OR-001/002` claim dependency closure) | `BUILD4_BE02_CLAIM_CORRECTION.md`, `BUILD4_BE03_SYNC_ENGINE.md` |
| `B4-FE01-` | The **27 foundation primitives** built in B4-FOUNDATION-BUILDOUT-01 (provenance, confidence, observation, authorization, responsibility, facets, dependency, attention, briefing, evidence, typed refs, …) — the table in §5.1 | `docs/builds/BUILD4_FOUNDATION_BUILDOUT.md` |
| `HR-nn` / `NHR-nn` | **Hostile-review findings** against the Build 4 cloud schema: `HR` from the first pass, `NHR` from the "new hostile review — this pass" (§11.3 of the SD4 document). Cited by number; e.g. NHR-01 the child-subject composite FK | `docs/builds/BUILD4_SD4_CLOUD_SCHEMA.md` |
| `HK-FE-UI-01` | The permanent **front-end system** build (tokens, shell, primitives, intelligence presentation). `K0`–`K9` are its commits | `docs/design-system/` |
| `HK-FEATURE-nn` | The **feature builds** forked from `5007b0f` (01 Today, 02 Talk It Out / Life Inbox, 03 Calendar / Capacity, 04 Systems / Routines) | this ledger and its siblings |
| `B3-AUD-nnn` / `HK-AUDIT-nnn` | Build 3 audit findings; cited in comments on the Daily Load code Today reads | `docs/audits/`, code comments |
| `OBS-` / `OOS-` | Observations / out-of-scope items recorded in a build ledger | the ledger that names them |
| **Feature-local (this feature)** | `TODAY-PD-xxx` product defects · `TODAY-TCD-xxx` test / coverage defects · `TODAY-FD-xxx` foundation findings (deferred) · `MP-xx` missing correction path · `MGP-xx` missing global primitive · `D-xx` WHY-doctrine decision. **No new global namespace is created.** | this ledger |

---

## 6. Test accounting — *filled at T9*

`ENTRY 808` · PRESERVED · REPLACED · REMOVED · ADDED · FINAL · FAILURES.

---

## 7. Defects found during the build

| ID | Severity | Root cause | Repair | Regression test | Status |
|---|---|---|---|---|---|
| — | | | | | none yet |

Deferred foundation / design findings are kept separately in §8 so an auditor can tell a feature defect from a
foundation gap.

## 8. Considered and deferred

The auditor should be able to tell **deliberately deferred** from **missed**. Each entry names the prompt section
that raised it, why it is not Feature 01, the likely owner, and whether it leaves a limitation today.

### 8.1 Foundation / design findings (not repaired here — Addendum §32: the default answer to "modify the foundation?" is no)

| ID | Finding | Raised by | Why not Feature 01 | Likely owner | Current limitation |
|---|---|---|---|---|---|
| TODAY-FD-001 | Daily Load ignores the household capacity profile. `capacityWindowFor` has no callers; `detectCapacityPressure`, `computeDailyLoad`, `loadThresholds` use constants (B4-FE01-016 is only half-wired) | §14, Addendum §F | Changing `dailyLoadIssues.ts` / `computeDailyLoad.ts` is shared foundation, and three sibling branches read them | Feature 03 (Calendar / Capacity) | Today states the window it used and says so when an override exists. A household that set its own day end still gets the default-window verdict |
| TODAY-FD-002 | Daily Load is whole-day and time-blind: it has no notion of "now", so a window that already ended still yields a verdict | §25, Scenario P | New reasoning semantics in shared foundation | Feature 03 | D-02: a *timing decision* whose window has ended is not offered as an action. Capacity pressure (a whole-day fact) is not re-derived from the clock |
| TODAY-FD-003 | `briefingFor().handled` is succeeded executions **without** requiring an outcome | §19, §6 | Changing `reasoning/briefing.ts` is foundation | foundation owner | Today narrows it (execution **and** a success outcome) before saying "handled". Any other consumer of `handled` inherits the looser meaning |
| TODAY-FD-004 | The One Move target registry (`TARGET_ADAPTERS`) is module-private, so a consumer cannot enumerate kinds or ask a kind for its affordances | §15 | Exporting it changes a shared module | foundation owner | Today keeps a total `Record<OneMoveTargetType, …>` keyed by the exported `ONE_MOVE_TARGET_TYPES`, so a new kind breaks compilation rather than silently getting no affordance |

### 8.2 Considered and deferred

| Item | Why it arose | Prompt § | Why not Feature 01 | Likely owner | Limitation today |
|---|---|---|---|---|---|
| Shared-device privacy mode, PIN lock, screenshot blocking | Today is a glance surface; children, co-parent and (later) money data live in state | Addendum §R | Explicitly a future cross-cutting concern | cross-cutting | None introduced: first-glance detail is minimized (FR-21) |
| "What changed since your last visit" | The briefing foundation can derive change from a `sinceMs` | §21, Addendum §P | Needs a last-looked marker; **no** presentation-state store exists and none may be added to `AppState` / envelope / sync / schema | whoever adds a local presentation store | A small "changed today" cue only, from dated observations (B4-FE01-006) |
| Confirm / reject an inferred canonical row (MP-01) | Scenario E needs a correction treatment for `possible` rows | §22 | No domain mutation exists; inventing one is a new durable semantic | foundation / Feature 02 | Badge, provenance label and *edit* only |
| "Not today" / "show another" for One Move (MP-02) | `RecommendationBlock` supports both | §16, §22 | The day's decision is stored once and only completes; a reject path is new semantics | foundation owner | Not offered |
| Recording a holder's acknowledge / accept / decline (MP-03) | Responsibility rows can be `requested` indefinitely | §18 | Requires delivery integration (Feature 02/04 era) | integration wave | State is shown truthfully; only "Take it back" is offered |
| Capacity settings screen (MP-04) | TODAY-FD-001 | §14 | `setCapacity` has no UI | Feature 03 | Household cannot correct its day window |
| Gemini / any LLM synthesis | Every feature will eventually want it | §27 | Forbidden in this build (no SDK, prompts, functions, secrets) | later wave | A typed seam exists (FR-19); the local provider is deterministic |
| Reschedule / drag / week view, external calendar | Calendar-shaped requests | §29 | Feature 03 | Feature 03 | Today offers only the existing Daily Load decisions |
| Running a system / routine | One Move can hold a `system` target | §30 | Feature 04 | Feature 04 | "I did it" records only; no run |
| New Talk It Out / Life Inbox flows | Entry point sits on Today | §28 | Feature 02 | Feature 02 | `TalkItOutEntry` preserved as-is |
| Money amounts on Today | `value` facets exist | Addendum §R | Not needed to act; sensitive | Money surface | Never shown at first glance |

## 9. WHY-doctrine decision log and owner-decision requests

The owner's PRODUCT WHY message (received during T0) is the tie-breaker for ambiguity, in this order: **1 preserve
truth · 2 reduce mental load · 3 preserve user agency · 4 preserve context · 5 make the next moment easier ·
6 build for learning · 7 keep one coherent product · 8 don't create work to manage the tool.** It may resolve
ambiguity inside approved behavior. It may not create durable semantics, unsupported facts, material scope, or
cross security/privacy boundaries. Where it cannot resolve a choice without a new product semantic: STOP that
decision, document options, request an owner decision.

| # | Ambiguity | Resolution | Doctrine rule |
|---|---|---|---|
| D-01 | `PersistenceNotice` is the only signal when Today is running on a *stand-in* in-memory state (`future_version`, `read_failed`) | Today withholds intelligence and says plainly that it cannot show her day from what is saved; it does **not** say "light". The shell's notice is reused, not rebuilt. | 1 truth |
| D-02 | Daily Load is a whole-day, time-blind verdict, so a window that ended at 9:30 can still headline as a live decision at 9 PM | Presentation only, no new classification: a timing decision (overlap / transition / tight window) whose window has ended is not offered as an action. The tier itself is not re-derived from the clock. Recorded as a foundation gap (§8). | 1 truth, 5 next moment |
| D-03 | `HandledLedger` says "Handled by Her Keys" for a *decision she approved* (an `ActionRecord`, which `semantics.ts` classifies as a decision) | Relabel to "Changes you approved"; keep every row, the Undo, and the history. "Handled" is reserved for execution + outcome evidence. | 1 truth, 4 context |
| D-04 | A succeeded execution with no outcome row | Not shown as handled. Shown, if at all, as waiting for confirmation. | 1 truth |
| D-05 | Whether "Approve" belongs on Today for a proposed intent, given no executor exists | Only as an explicit, confirmed decision through the existing `decideIntent`; the copy never promises it will run. Decision recorded, semantics unchanged. | 3 agency, 1 truth |

**Owner-decision requests:** none open.

## 10. Owner visual evidence (Addendum §AD)

Captured from the running app on the `HerKeys_Runtime` Android emulator (Pixel-class, 1344×2992) in Expo Go, against
the real Today components. These are for owner judgment of hierarchy, calmness, density, tone and progressive
disclosure. They are **not** acceptance evidence — the mechanical tests are (§6, §11).

| Scenario | Screenshots (`docs/builds/hk-feature-01-today/after/`) |
|---|---|
| A — ordinary day | `a-ordinary-1-first-glance.png`, `a-ordinary-2-why-expanded.png` |
| B — overloaded day | `b-overloaded-1-first-glance.png`, `b-overloaded-2-expanded.png` |
| C — delegation risk *(bonus)* | `c-delegation-risk.png` |
| D — nearly empty day | `d-nearly-empty.png` |
| E — uncertain inference | `e-uncertain-1-first-glance.png`, `e-uncertain-2-one-move-badge.png` |
| Before (inherited, K9) | `docs/builds/hk-feature-01-today/before/t0-today-k9.png` |

**How they were made — stated so nothing is assumed.** No gallery was added and nothing was committed for it. A
*temporary, untracked* dev route built each scenario with the same domain operations the tests use, committed the state
to the local store (data mode `empty` through a gitignored `.env`), and rendered the real `TodayBriefing` at a
**pinned clock time** (A 08:00, B and C 14:00, D and E 09:00) on the emulator's own calendar day, so the date label in
the shots is the emulator's date, not the tests'. The route and the `.env` were deleted afterwards (`git status` is clean
of both); Metro was stopped and `adb reverse` removed. The emulator's stored household on that dedicated scratch AVD was
replaced by the scenario state. Expanded states were reached by real taps (`adb input`), not by a special mode.

**What the shots show** (each claim is also a test): the household-day label; one clay action on the first screen where
the inherited baseline had two; a bounded "What matters" list; the One Move with "See why" collapsed and then open
(reasons → what "I did it" does → evidence one level down); B's neutral-ink meter labelled "Full" in amber, the preserved
decision card with its reasons and actions, a specific "2 days overdue" row, and the withheld move named as an
observation; D with no meter, no empty module and no capacity drama; E's `POSSIBLE — Her Keys inferred this` on the
inferred task, nothing on the stated one, `LIKELY — From an external source` on the imported event, and C's unanswered
handoff with only the two actions that exist.

**Observations offered for the owner's eye (not changed, not hidden):**
1. *Weight of the ghost "Open" button on attention rows.* With two due-today rows (E) the card carries two "Open"
   buttons. Making the whole row the target (a `›` as `StatusList` does) would be quieter, at the cost of a less explicit
   affordance and a more careful accessible label; left explicit for now.
2. *Two "NEEDS YOU" cards in B.* The preserved decision card and the attention card both carry the tag. They are different
   things (a decision, and an overdue item) but the repetition is visible.
3. *Vertical rhythm of the quiet rows.* "See why", "Everything today" and "Also checked" each sit on a 44pt row plus the
   24pt block gap; the lower half of A reads a little airy. That is the cost of the accessible target.
4. *The One Move and an attention row can name the same task* (E: it is due today *and* it is the recommendation). The
   attention row says the fact and its source; the card says the action. `What matters` de-duplicates against both.
5. *The time is pinned, the day is not:* the label is the emulator's date.
