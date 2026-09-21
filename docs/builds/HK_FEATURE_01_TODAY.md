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
| Status | **COMPLETE — builder verification PASS (§11.1).** Ready for the independent audit; not itself audited |
| Independent audit | NOT performed here. This ledger is builder evidence, not an audit. |

Authority, in order of precedence: the HK-FEATURE-01-TODAY prompt and its Addendum 01; the HK-PARALLEL-SOURCE-01
common-source addendum; the owner's **PRODUCT WHY** message sent mid-build (§9 — used only to resolve ambiguity
inside approved scope, never to expand it).

Requirement states: `NOT STARTED` · `IN PROGRESS` · `IMPLEMENTED` · `VERIFIED (builder)` · `STOPPED`. `VERIFIED (builder)` means a mechanical test or a
recorded measurement proves it and a put-back-the-defect mutation (§11.2) fails it; it is **not** an audit finding.

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
4. *Replacement behavior:* one line is rendered **only** when the view model supplies a constraint (built as
   `model/upcoming.ts` plus a `TodayList` row; no separate `TodayUpcoming` component turned out to be needed).
   Sources, in order of strength: an unmet dependency of a commitment today/tomorrow; the domain
   `tomorrowPreview()` headline when tomorrow has an overlap / tight transition (its text used verbatim); a
   high-consequence task due tomorrow.
5. *Original guarantee preserved:* the domain `tomorrowPreview()` and its tests (`tomorrowPreview.test.mjs`, the
   Tomorrow-preview block of `build3Audit.dailyLoad.test.mjs`) are unchanged and remain the source of the
   overlap/tight wording.

### 2.9 Existing test disposition (T0 — **finalized in §6: every row below is PRESERVED, none replaced, none removed**)

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
| FR-01 | Orientation: logical-day label + concise framing (§9A, J) | VERIFIED (builder) | model: scenarios A, J; UI: `TodayHeader` |
| FR-02 | "What matters today" prioritized, not every item (§11) | VERIFIED (builder) | model: scenarios A, I; UI: `TodayMatters` (`components.test.mjs`) |
| FR-03 | One Move — full presentation lifecycle, all registered target kinds (§15, N) | VERIFIED (builder) | model: scenarios D, F, N (`tests/today/oneMove.test.mjs`: none / selected / completed / withheld / rollover, all six kinds); UI: `OneMoveCard` (`components.test.mjs`) |
| FR-04 | "Why this One Move" from structured evidence, progressive (§16) | VERIFIED (builder) | model: scenario F (reasons re-checked, stale links dropped, unknown codes never rendered); UI: "See why" → reasons → "Evidence and source" (`components.test.mjs`); T9: what the target waits on / what waits on it is shown one level down as *context* (from `relatedTo`), kept out of `reasons` and `basis` on both the fallback and the recorded-evidence path (`dependencies.test.mjs`; mutant M21) |
| FR-05 | Needs Me — things that exist vs things that need her (§12) | VERIFIED (builder) | model: scenarios B, C; UI: `TodayAttention` (`attentionUi.test.mjs`) — delegated / requested / acknowledged / accepted / declined / returned are each their own state |
| FR-06 | Risk / attention — specific, evidence-based (§13) | VERIFIED (builder) | model: scenarios B, C, E; UI: `TodayAttention`; specific, evidence-based rows, no risk score |
| FR-07 | Capacity — "does the day fit", no scores (§14) | VERIFIED (builder) | model: scenario B (Daily Load classification only); UI: `LoadMeter` + `DailyLoadCard` + capacity-profile note (TODAY-FD-001) |
| FR-08 | What can wait — bounded, only when provably safe (§17, T) | VERIFIED (builder) | model: scenario H (six look-alikes stay unlisted; bounded at three); UI: `TodayList` "Can wait today" |
| FR-09 | Responsibility / waiting; delegated ≠ covered (§18) | VERIFIED (builder) | model: scenario C; UI: `TodayAttention`, `TodayList` "Waiting"; take-back through `useTodayActions` -> `returnToSelf` |
| FR-10 | "Handled by Her Keys" only with execution **and** outcome (§19, O) | VERIFIED (builder) | model: scenario G (execution AND success outcome; unconfirmed / approved-not-run / failed / undone / yesterday); UI: `TodayHandled` (`attentionUi.test.mjs`) |
| FR-11 | Upcoming constraint — one, only if material (§20) | VERIFIED (builder) | `tests/today/lifecycle.test.mjs` "the upcoming constraint": dependency (today and tomorrow, several blockers), tomorrow overlap verbatim, consequential deadline, none = null, strongest wins, four days out = null; T9: a dependency is said as strongly as its own provenance allows — "needs" for a stated edge, "may need" + the unconfirmed badge for one Her Keys inferred, never folded into a stated count (`dependencies.test.mjs`; mutants M19, M22) |
| FR-12 | What changed — no presentation markers in state (§21, P) | VERIFIED (builder) | scenario C (`changedToday` from dated observations); `lifecycle.test.mjs` "what changed": no presentation marker in `AppState` or the model; yesterday is not "today" |
| FR-13 | Correction / adjustment through existing paths only (§22, H) | VERIFIED (builder) | Scenario M (`tests/today/correction.test.mjs`): real store, persisted, re-derived; task edit, take-back, approve / decline; MP-01..04 offer nothing |
| FR-14 | Progressive disclosure, accessible (§23) | VERIFIED (builder) | UI: `TodayDisclosure` (`components.test.mjs`); "See why" -> "Evidence and source"; "More that needs you"; "N more"; "Everything today"; "Also checked"; "Changes you approved" |
| FR-15 | Adaptive density; ≤3 primary blocks on an ordinary day (§24, S) | VERIFIED (builder) | scenarios A, D, I; `guarantees.test.mjs` "structure": over 33 corpus entries never more than 3 primary blocks, every list bounded, a section is in the composition iff it has content |
| FR-16 | Time: household timezone, logical day, DST, time-of-day, rollover (§25, P, W) | VERIFIED (builder) | scenarios J (zone, near-midnight, spring-forward, fall-back), P (08:00 / 15:00 / 21:00), W (real store + real hook across midnight: `lifecycle.test.mjs`, `hooks.test.mjs`) |
| FR-17 | Local-first; unknown ≠ light; unrecovered ≠ light; sync stays infrastructure (§26, J, K, M) | VERIFIED (builder) | scenarios K, O (`lifecycle.test.mjs`): real-store recoveries — newer version, unreadable storage, other mode, corrupt — Today is unavailable or honestly empty, never "light"; no sync surface in Today |
| FR-18 | Demo isolation and onboarding guard intact (L) | VERIFIED (builder) | scenario L (`lifecycle.test.mjs`): demo renders, is pure, claims no handled work, names no account/cloud; the model imports no account/storage/network module; onboarding guard and single Today route intact |
| FR-19 | Typed future-LLM seam, nothing wired (§27) | VERIFIED (builder) | `model/narrative.ts`; `guarantees.test.mjs` "seam": a provider replaces the headline and nothing else; no model / network / key / library anywhere |
| FR-20 | Tone: calm, precise, adult; no cheerleading / dramatization (Q) | VERIFIED (builder) | `guarantees.test.mjs` "tone": every projected string in 33 scenarios AND every string literal in the components and model (>150 checked) against eight banned families |
| FR-21 | Minimum sensitive detail at first glance (R) | VERIFIED (builder) | `guarantees.test.mjs` "first-glance privacy": locations, notes, amounts, a child's name and birth date, travel never enter the projection; deeper detail stays behind disclosure |
| FR-22 | Accessibility: order, headings, dynamic text, targets, non-color status, expand state (§38) | VERIFIED (builder) | `guarantees.test.mjs` "accessibility": role + name + 44pt on every control, headings, reading order, status as words, expanded state, no truncation / fixed heights / font-scaling off, long titles and names wrap; T9: an unconfirmed claim on a row that is itself a button is spoken, not only seen — the button's own label carries the badge's words (`dependencies.test.mjs`; mutants M23, M24) |
| FR-23 | Dense reference derivation < 100 ms, measured and reported (X) | VERIFIED (builder) | `guarantees.test.mjs` "performance": dense reference (20 events, 40 tasks, 6 delegations, 5 captured) median 4.8-6.5 ms, p95 8-11 ms over 40 runs (target < 100 ms); no cache added |
| FR-24 | Permanent UI system consumed; ≤15 feature-local components; no new dependency (§7, Y, Z, AC) | VERIFIED (builder) | §11.6 (every primitive actually imported, by file) and §11.7 (10 new named components ≤ 15); `git diff --stat 5007b0f HEAD` shows no change to `src/design`, `package.json` or `package-lock.json` (§11.1); the `guarantees.test.mjs` seam test asserts Today's model imports nothing that can call out and that no AI / network / key dependency exists |

---

## 4. Files owned, shared files touched, primitives

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
| `tests/today/inheritance.test.mjs` | The PRESERVE guarantees of the inherited Today, and regression tests for TODAY-PD-001..004 | T9 |
| `src/features/today/model/requirements.ts` | What a thing waits on / what waits on it, with each `requires` edge's own provenance (through `relatedTo`); which requirements one sentence may speak of | T9 |
| `tests/today/dependencies.test.mjs` | A dependency is said as strongly as its provenance allows; One Move context; an unconfirmed claim is spoken, not only seen | T9 |
| `scripts-dev/today-mutation-check.cjs` | The 24-mutant put-the-defect-back check (§11.2). Refuses a dirty tree and a non-green baseline. Not app code, not bundled | T9 |

**Existing Today files modified** are listed with their classification in §2.8 and their commits in the commit series (§11.12).

**SHARED FILES TOUCHED** (path · reason · commit · likely sibling collision · reconciliation need). Only Today consumes
any of these, but they live outside `src/features/today/`, so a sibling branch that edits the same file will collide:

| Path | Reason | Commit | Likely sibling collision | Reconciliation |
|---|---|---|---|---|
| `src/features/daily-load/DailyLoadCard.tsx` | REFINE: remove the filler branches (empty household, nothing scheduled, overdue, "nothing needs moving") the view model now owns; every action and guard untouched | T3 | **Feature 03 (Calendar / Capacity)** is the likeliest to edit `daily-load/*` | Small, deletion-only diff in one region; take Feature 03's version and re-apply the four deletions |
| `src/features/daily-load/LoadMeter.tsx` | REFINE: takes the estimate as a prop from the view model instead of reading `useSchedule()`; adds the optional capacity-profile note | T3 | Feature 03 | Only Today imports it |
| `src/features/life/LifeStatusSummary.tsx` | REFINE: wrapped in a collapsed disclosure | T3 | Feature 02 (Life Inbox mount) | Only Today imports it; one wrapper |
| `src/features/one-move/OneMoveCard.tsx` | REFINE: props from the view model; Why disclosure; T9 adds the relationship context lines under "Evidence and source" | T4, T9 | Feature 04 (`system` One Move targets) | Only Today imports it |
| `app/(app)/today.tsx` | REFINE: the route is `useTodayView()` + `<TodayBriefing />`; the onboarding guard and the single Today route are untouched (`lifecycle.test.mjs`, scenario L) | T3 | any feature that adds a tab / route guard in `app/(app)/` | Only the body of the screen changed |
| `scripts-dev/today-mutation-check.cjs` | ADD: the mutation check | T9 | none (a new file in an existing folder) | none |

**MISSING GLOBAL PRIMITIVE register** (semantic need · current limitation · feature-local solution · sibling relevance):

| # | Need | Limitation | Feature-local solution | Sibling relevance |
|---|---|---|---|---|
| MGP-01 | An accessible expand/collapse ("Why this?", "Everything today", "Can wait") | `WhyThis` always renders open; `HandledLedger` had an ad-hoc `Pressable`+`Overline` toggle; no design-system disclosure exists | `TodayDisclosure` (+ `SectionLabel`, a real heading) in `src/features/today/TodayDisclosure.tsx`, built only from `AppText` and tokens, exposing `accessibilityState.expanded`, a 44pt target, chevron hidden from a screen reader. `HandledLedger` now uses it too | High — Talk It Out, Calendar, Systems will each want one. Integration wave should promote **one** shared disclosure. |
| MGP-02 | A heading role for the design-system `Overline` | `Overline` renders `Text` with no way to pass `accessibilityRole="header"`, so a section eyebrow cannot be a heading | `SectionLabel`: `AppText variant="label"` upper-cased, `accessibilityRole="header"` | Medium — every screen with eyebrow section titles |

---

## 5. Foundation consumption trace, correction map, authority-prefix index

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
| B4-FE01-009..012 | Intent → decision → execution → outcome | `foundation/authorization.ts` (schemas); `authorization.ts` (`intentLifecycle`, `pendingApprovals`, `decideIntent`) | Called directly: `intentLifecycle(state, id)`, `decideIntent`; `state.executions` / `state.outcomes`. `pendingApprovals` is reached only *inside* `attentionFor` — Today does not call it | `foundationAcceptance.test.mjs`, `foundationAcceptance2.test.mjs`, `foundationOps.test.mjs`; server rows fixture `tests/support/richHousehold.mjs` (`withServerRows`) | Approvals needing her; "handled" only for a succeeded execution **with** a success outcome; "waiting" for an approved-not-run / unconfirmed one | AS-IS |
| B4-FE01-014 | Responsibility (lifecycle) | `foundation/responsibility.ts` (`isActiveResponsibility`, `isUnacknowledged`); `responsibility.ts` (`unacknowledgedResponsibilities`, `liveResponsibilityFor`, `needsMePersonally`, `returnToSelf`) | Called directly: `needsMePersonally`, `liveResponsibilityFor`, `returnToSelf`. `isActiveResponsibility`, `isUnacknowledged`, `unacknowledgedResponsibilities` are reached only *inside* `briefingFor` / `attentionFor` — Today does not call them | `foundationAcceptance.test.mjs`, `foundationOps.test.mjs`, `foundationAcceptance2/3` | Responsibility rows: requested / acknowledged / accepted / declined / returned, "delegated ≠ covered", the unacknowledged escalation, "Take it back" | AS-IS |
| B4-FE01-015 | Commitment facets | `foundation/commitment.ts` (`commitmentFacetsOf`, `ANSWERABLE_FACETS`) | `commitmentFacetsOf({kind,row})` | `foundationAcceptance.test.mjs`, `foundationAcceptance3.test.mjs`, `foundationOps.test.mjs` | Consequence, deadline-with-time, scheduling window, flexibility, effort read through the one contract; `null` stays "not known" | AS-IS |
| B4-FE01-016 | Capacity metadata / profile | `foundation/structure.ts` (`CapacityProfileSchema`); `structure.ts` (`capacityWindowFor`, `DEFAULT_CAPACITY`) | facets via `commitmentFacetsOf`; profile via `state.capacity` | `foundationAcceptance.test.mjs`, `foundationOps.test.mjs` | **PARTIAL.** Facets: consumed. **Profile: Daily Load does not read it** — `detectCapacityPressure` uses the `CAPACITY_DAY_START/END_MINUTES` constants, `computeDailyLoad` the `REQUIRED_TRANSITION_BUFFER_MINUTES` constant, `loadThresholds` its own. `capacityWindowFor` has zero app callers. **Bridge:** none is possible without changing foundation. Today reports the verdict Daily Load actually computed, states the window it used, and when `state.capacity` holds an override that differs from the default it says so instead of implying the verdict reflects her setting. Recorded as TODAY-FD-001 | PARTIAL |
| B4-FE01-017 | Dependencies | `foundation/structure.ts` (`DependencySchema`); `structure.ts` (`blockersOf`, `isBlocked`, `isDone`) | `blockersOf(state, ref)` (in `model/requirements.ts`) and `isDone`; `state.dependencies` is also read directly in `canWait.ts` (a not-done row requires this task — deliberately conservative). `isBlocked` is not used | `foundationAcceptance.test.mjs`, `foundationAcceptance3.test.mjs`, `foundationOps.test.mjs` | Upcoming constraint (unmet `requires`); can-wait exclusion (something live requires this); the One Move's context lines. The edge's own provenance decides the wording: a stated edge is "needs", one Her Keys inferred and she has not confirmed is "may need" with the badge (D-06) | AS-IS |
| B4-FE01-019 | Attention intent (derived) | `reasoning/attention.ts` (`attentionFor`, `ATTENTION_REASONS`) | `attentionFor(state, nowMs)` | `foundationAcceptance.test.mjs`, `foundationAcceptance2.test.mjs`, `foundationAcceptance3.test.mjs` | The one source of deadline / risk / needs-me / unacknowledged delegation / approval / external-source-changed rows and their urgency. Conflict and capacity attention are shown through the Daily Load decision block, not twice | AS-IS |
| B4-FE01-024 | Reasoning evidence | `foundation/pattern.ts` (`EvidenceLinkSchema`, `KNOWN_EVIDENCE_CODES`); `patterns.ts` (`explain`, `addEvidence`) | `explain(state, {kind:'oneMove', id})` | `foundationAcceptance3.test.mjs`, `foundationOps.test.mjs` | "Why this One Move": the stored evidence links, code → fact. Unknown codes are stored and never rendered | AS-IS |
| B4-FE01-025 | Briefing projection (derived) | `reasoning/briefing.ts` (`briefingFor(state, nowMs, sinceMs)`) | `delegated`, `unacknowledged`, `handled` (narrowed); the ranked list itself comes from `attentionFor` | `foundationAcceptance.test.mjs`, `foundationAcceptance3.test.mjs` | **PARTIAL.** `briefingFor` is called once per projection and supplies `delegated` (who holds what), `unacknowledged` (which requests went unanswered) and `handled` (the candidate set, then narrowed). The ranked attention list is read from `attentionFor` directly, because two of the reasons Today must show — a pending approval and a changed external source — are not in the briefing's `atRisk` / `needsHer` lists; `atRisk` and `needsHer` are filters of that same list, so nothing is derived twice. **Gaps:** (a) `handled` = succeeded executions **not gated on an outcome** — bridge: Today narrows it to those that also have a success outcome (stricter, never broader); (b) `changed` needs a `sinceMs` "last looked" marker, which may not be persisted — bridge: not used; the changed cue comes from observations dated *today* (a logical-day boundary, not a stored marker); `sinceMs` passed to `briefingFor` is the start of today's logical day, derived; (c) `matters` is counts only — bridge: Today composes its matters block from `projectStateDay` + attention | PARTIAL |
| B4-FE01-027 / -028 | Typed reference convention / One Move target registry | `foundation/typedRef.ts` (`TYPED_REF_KINDS`, `refExists`); `oneMove.ts` (`TARGET_ADAPTERS`, private; `oneMoveForDay`); `state.ts` (`ONE_MOVE_TARGET_TYPES`) | `oneMoveForDay(state, today)`; the stored record's `targetType` / `targetId`; `ONE_MOVE_TARGET_TYPES` | `oneMove.test.mjs`, `build3Audit.oneMove.test.mjs`, `foundationTruth.test.mjs` | The registry is consumed *through* `oneMoveForDay`; Today ranks nothing. The per-kind open/complete affordance is a `Record<OneMoveTargetType, …>` so a new registered kind fails to compile until Today decides its affordance (§5.2 table N) | AS-IS |
| B4-FE01-031 | Cross-domain projection | `reasoning/related.ts` (`relatedTo`) | `relatedTo(state, ref).dependencies` and `.requiredBy`, in `model/requirements.ts` | `foundationAcceptance.test.mjs`, `foundationAcceptance2.test.mjs`, `foundationAcceptance3.test.mjs`; Today: `dependencies.test.mjs` | The provenance of each `requires` edge (so a possibility is not said as a fact) for the upcoming line, and the One Move's context lines ("Field trip needs it first") — as context, never as the recorded reason. The rest of the related set (responsibilities, observations, siblings, …) is **not** used | AS-IS |

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

## 6. Test accounting (Addendum §AE)

| | Tests | Suites | How it was established |
|---|---:|---:|---|
| **ENTRY** | 808 | 169 | recomputed on `5007b0f` before any change (§1) |
| **PRESERVED** | 808 | 169 | `git diff --name-status 5007b0f HEAD -- tests` lists **only additions**, all under `tests/today/`: no entry test file was edited, renamed or deleted, so every entry test still runs, unmodified, and passes |
| **REPLACED** | 0 | 0 | none — the only REPLACE (§2.8, `TomorrowPreview.tsx`) had no component test at source |
| **REMOVED** | 0 | 0 | none; nothing needed approval |
| **ADDED** | 210 | 51 | `tests/today/*.test.mjs` — per file below |
| **FINAL** | **1018** | **220** | `npm test` at HEAD `9e1374f`: `tests 1018 · suites 220 · pass 1018 · fail 0 · cancelled 0 · skipped 0 · todo 0` (exit 0). Equal to ENTRY − REMOVED + ADDED = 808 − 0 + 210 |
| **FAILURES** | 0 | | |

Added, by file (runner counts): `scenarios` 24 (A–E) · `scenarios2` 31 (F–J) · `oneMove` 16 (N) · `components` 27 · `attentionUi` 13 ·
`correction` 11 (M) · `lifecycle` 31 (K, L, O, P, W, the upcoming constraint, what changed) · `hooks` 2 (W, real hook) ·
`guarantees` 25 (structure, tone, privacy, purity, seam, accessibility, performance) · `inheritance` 14 (PRESERVE, PD-001..004) ·
`dependencies` 16 (T9) = **210**.

Every scenario A–P and W has mechanical coverage (§11.3). Because a test only counts once it fails with the defect put
back, the suite was also validated by mutation: **24 / 24 mutants caught** (§11.2).

**One environmental note, recorded because it looks like a test failure and is not one.** The machine was shared with other
sessions' Android emulators and Docker and repeatedly ran out of *commit* memory (`FreeVirtualMemory` fell to 0.2–1 GB of 65 GB).
While that lasted, whole test files died at load in 4–1200 ms with `Error: spawn UNKNOWN` from esbuild's service start (12 such errors in
one serial run, 54 failing tests in the parallel one), `tsc` died with `Zone Allocation failed`, and once `git` itself returned `File too large`. None of these is an assertion
failure and none occurred once memory recovered. The exit-gate suite was therefore established two ways on the same tree: **(a)** the
official `npm test`, exit 0, 1018 / 1018 (above), and **(b)** every `tests/**/*.test.mjs` file run in its own process, one at a
time, with retries allowed *only* for infrastructure spawn failures — 59 files, 1018 tests, 0 failed, **0 retries needed**
(`suite-per-file.txt`). An earlier `npm test` attempt under the memory pressure did fail this way and is not counted as evidence.

---

## 7. Defects found during the build

Product defects (`TODAY-PD-`) are defects in Today's behavior. Test / coverage defects (`TODAY-TCD-`) are defects in the
proof. Every repair below has a regression test that **fails with the defect put back** (mutant ids: §11.2).

| ID | Severity | Root cause | Repair | Regression test | Status |
|---|---|---|---|---|---|
| TODAY-PD-001 | High — truth | `HandledLedger` listed the household's own *approved decisions* (`ActionRecord`s, which `semantics.ts` classifies as decisions) under the title "Handled by Her Keys": an approval was presented as work Her Keys had done | Relabelled "Changes you approved", each row "approved by you". "Handled" is reserved for a succeeded execution **with** a success outcome (`TodayHandled`). Every row and the Undo are kept (D-03) | `inheritance.test.mjs` PD-001 ×2; `scenarios2` G; mutant M15 | FIXED |
| TODAY-PD-002 | Medium — truth | The ledger formatted times with the device's zone, wrong for a household whose day is elsewhere | Times come from `wallClockMinutesAt(epochMsOf(createdAt), household timezone)` | `inheritance.test.mjs` PD-002; `scenarios2` J | FIXED |
| TODAY-PD-003 | High — correctness | Two things in one: a component read the system clock itself (so a screen left open across the household's midnight kept yesterday's briefing) and an always-on "Tomorrow" card that said something even when nothing was constrained | One clock read, in `useTodayView` (60 s tick and on foreground, first asking the store to pick up a new day); `TomorrowPreview` removed; the upcoming line exists only when it earns one | `inheritance.test.mjs` PD-003 ×2; `hooks.test.mjs`; `lifecycle` W; mutant M06 | FIXED |
| TODAY-PD-004 | Medium — mental load | `DailyLoadCard` and `LoadMeter` filled an empty day with "Nothing scheduled" / "Open — plenty of room" filler | Filler branches removed (deletion only); the view model owns sparse / empty states; the meter is not rendered over an empty calendar | `inheritance.test.mjs` PD-004 ×2; `scenarios` D | FIXED |
| TODAY-PD-005 | High — truth | An ordinary Today rendered over a *stand-in* in-memory state (`future_version`, `read_failed`) as though it were her household | Intelligence is withheld; Today says plainly it cannot show her day from what is saved and that nothing saved was changed (D-01). Unknown and hydrating are never "a light day" | `lifecycle` K, O (real-store recoveries); mutants M04, M05 | FIXED |
| TODAY-PD-006 | Low — mental load | The Life status widget was always on, at the same weight as the day's decisions | Kept (nothing deleted — WHY #4) inside a collapsed "Also checked" disclosure, in the secondary tier | `scenarios` A (composition), `guarantees` structure | FIXED |
| TODAY-PD-007 | Medium — truth | The One Move "why" showed the item's own observation as the reason regardless of what evidence was recorded | Reasons come from the stored evidence links, each re-checked against the row it points at; a stale link is dropped, an unknown code is stored and never rendered; the item's observation is the fallback only when there is no evidence | `scenarios2` F; mutant M07 | FIXED |
| TODAY-PD-008 | Medium — truth | (found in the T9 self-audit of Today's own code) "Coming up" said "needs" for every `requires` edge, though an edge is a stored row with its own provenance: one Her Keys inferred and she has not confirmed is a possibility | `model/requirements.ts` reads the edge's provenance through `relatedTo`; a stated edge is "needs", an unconfirmed one is "may need" with the permanent badge and is never folded into a stated requirement's count (D-06) | `dependencies.test.mjs` "Coming up" ×5; mutants M19, M22 | FIXED |
| TODAY-PD-009 | Medium — accessibility / truth | (found while adding the badge to "Coming up") a row that is itself a button carries its own `accessibilityLabel`, which hides the badge inside it from a screen reader — an unconfirmed claim was seen and never heard. Present in "What matters" from T3 | `sourceLabelOf` adds the badge's words to the button's own label in "What matters" and "Coming up" (D-07) | `dependencies.test.mjs` "spoken, not only seen" ×3; mutants M23, M24 | FIXED |
| TODAY-TCD-001 | Medium | The inherited Today had **no component tests at source**, so none of its behavior was pinned | 210 tests, including render/props contract tests fed by real view models (never hand-made props) | `components`, `attentionUi`, `inheritance` | FIXED |
| TODAY-TCD-002 | Low | A tone-lint regex written through a shell heredoc had its `\b` turned into a backspace character and silently matched nothing (the lint passed vacuously) | Regex rewritten byte-precisely; a scan of every Today file for stray control characters (0 in 52) | `guarantees` tone (over the corpus and every string literal) | FIXED |
| TODAY-TCD-003 | Medium | The first mutation harness reported "18 / 18 caught" because its own test command (`--test tests/today/`, a directory) is invalid and failed on the *unmutated* tree, so every mutant "failed" | The harness runs the glob exactly as `package.json` does, **refuses to run unless the unmutated baseline is green and substantial**, refuses a dirty tree, retries Windows file-lock restores and `git checkout`s on exit | `scripts-dev/today-mutation-check.cjs` (§11.2) | FIXED |
| TODAY-TCD-004 | Medium | Mutant M18 (reversing the order of what needs her) survived: no test pinned the ordering | Ordering is asserted over the whole 33-scenario corpus, first by urgency and then within an urgency in the foundation's own `ATTENTION_REASONS` order (Today preserves `attentionFor`'s ordering; it invents none) | `guarantees` structure ×2 (commits `5d776d6`, `c0e13f9`); mutant M18 | FIXED |
| TODAY-TCD-005 | Low | Mutant M21 (dependency context leaking into the One Move's reasons) survived: the first test exercised only the fallback path, not a move chosen on recorded evidence | A second test on the recorded-evidence path | `dependencies.test.mjs` (commit `9e1374f`); mutant M21 | FIXED |

No defect is left open. Nothing in this table required a foundation change.

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
| TODAY-FD-005 | A `requires` edge survives its prerequisite being *removed*. `isDone` treats only a `completed` task as done, and "Remove task" archives (`archiveTask`), so an event that requires a removed task still has an unmet requirement: `blockersOf` returns it and Today says "needs “X” first", with a route to the editor of a task she removed. Verified by a probe on the final tree (live → "needs", archived → "needs", completed → nothing) | §20 | Whether a removed prerequisite satisfies, voids or still blocks a requirement is a new durable domain semantic; `isDone` / `blockersOf` are shared foundation | foundation owner (with **OD-01**, §9) | Today follows the foundation: the line is shown. No test pins it, deliberately — it is undecided, and a pin would ossify the guess |

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
| D-06 | A `requires` edge has its own provenance, but the "Coming up" line said "needs" for all of them | An edge she stated is "needs". An edge Her Keys inferred and she has not confirmed is "may need", with the permanent badge, and is spoken of only when there is no stated requirement to speak of — never folded into a stated requirement's count. Presentation only; no confidence is promoted or invented. | 1 truth (possible ≠ established) |
| D-07 | A row that is a button hides the badge inside it from a screen reader | The badge's words are added to the button's own accessible label. Wording is the design system's own (`PROVENANCE_LABEL`, confidence level); nothing new is said. | 1 truth, 5 next moment |
| D-08 | Whether the One Move should show what its target waits on / what waits on it | Yes, one level down under "Evidence and source", from the typed relation as it stands now — as **context**, never as a reason: the stored decision did not cite it, so it stays out of `reasons` and `basis`. Only live task / event / captured rows are named. | 4 context, 1 truth |

**Owner-decision requests: one open, and it does not block this feature.**

**OD-01 — what should Today say when a requirement's prerequisite was removed?** (TODAY-FD-005.) An event that `requires` a task she
then removed ("Remove task" archives it) still has an unmet requirement in the foundation, so Today says the event "needs" that task
first and offers to open its editor. Options:

| Option | Effect | Cost |
|---|---|---|
| **A. Keep the foundation's answer** (today's behavior) | Nothing is hidden; a requirement that was recorded and never satisfied is still said | Names a task she removed and cannot be done; may read as stale |
| **B. The foundation voids the edge when its prerequisite is archived** (or `isDone` counts archived as no longer required) | Every consumer inherits one answer; Today needs no change | A foundation decision: it changes what "requires" means for every reader, and loses the fact that the event once needed something |
| **C. Today says it plainly** ("…needs “X” first, which you removed") | True, and lets her decide | New copy and a new state in a shared line; still a semantic call about what "removed" means for a requirement |

**Why the WHY-doctrine does not resolve it:** truth (1) says not to hide a recorded, unmet requirement; reducing mental load (2)
says not to hand her a to-do that cannot be done. They pull in opposite directions, and choosing between them is exactly a new
durable semantic (what "removed" does to a requirement), which the doctrine forbids using it to invent. **Recommendation: B** —
decide it once in the foundation. Until then Today keeps A.

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

**These screenshots predate T9 (the dependency wording, the One Move context lines, the spoken badge) and were not re-shot:**
T9 adds a line or a badge only where a dependency exists, and none of scenarios A–E has one. The T9 behavior is proven by tests
(`dependencies.test.mjs`), not by a picture. A dependency-bearing shot would be a fair thing to ask for at owner review.

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

---

## 11. Verification and completion report

Builder evidence for the independent Feature 01 audit. **Nothing here is an audit finding, and this branch is not "audited".**

### 11.1 Exit gates (recomputed at HEAD; not copied from the entry table)

| Gate | Expected | Result | Evidence |
|---|---|---|---|
| Fork point | exactly `5007b0f` | `git merge-base 5007b0f HEAD` = `5007b0f2e6de34e8ce476fac11a8acd2cf1e69a1`; sibling branches `feature/02`, `03`, `04` exist in their own worktrees and were **not** created, checked out or modified by this build | `git merge-base`, `git branch -vv` |
| TypeScript | PASS | **PASS** — exit 0, no output. Run as `node --max-old-space-size=1600 node_modules/typescript/bin/tsc --noEmit` (the same compiler and `tsconfig`) because the shared machine's commit memory was exhausted; a plain `npx tsc --noEmit` had died with `Zone Allocation failed` for that reason alone | `gates/tsc-final.txt` |
| App tests — before → after | 808 / 808 → ≥ 808 | **808 / 808 (169 suites) → 1018 / 1018 (220 suites)**, 0 fail, 0 skipped. Official `npm test`, exit 0. Also run one file per process, serially: 59 files, 1018 tests, 0 failed, 0 retries (§6) | `gates/npm-test-official.txt`, `gates/suite-per-file.txt` |
| Today tests | all green | **210 / 210** (51 suites) | §6 |
| Backend harness | 684 / 684 | **684 / 684 checks passed** (includes the inherited K9 `sync: 23` repair, which is not drift) | `gates/backend-final.txt` |
| Expo Doctor | 21 / 21 | **21 / 21 — No issues detected** (run alone, never beside an export) | `gates/doctor-final.txt` |
| Expo Android export | PASS | **PASS** — one Hermes bundle, 6.3 MB (entry 6.2 MB), written outside the repository so `dist/` is untouched | `gates/export-final.txt` |
| Shipping migration SHA-256 | `1e9169de…8a7cb` | `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` — **equal** (`supabase/migrations/20260919231500_build4_cloud_schema.sql`) | `sha256sum` |
| Baseline migration SHA-256 | `8bc38d66…f16f` | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` — **equal** (`…230054_build4_baseline.sql`) | `sha256sum` |
| Local schema fingerprint | `199ed4d4c1b37cd654b5853e91cbde27` / 3613 | `199ed4d4c1b37cd654b5853e91cbde27` / 3613 facts — **RESULT: MATCH (gating digest equal)**, measured read-only through the locked tool's own SQL in `supabase_db_Her_Keys` | `gates/fingerprint-final.txt` |
| Foundation delta | none | `git diff --stat 5007b0f HEAD -- src/domain supabase src/persistence src/design package.json package-lock.json app.json` is **empty**. Outside `src/features/today/`, `tests/today/` and the docs, the branch changes exactly: `app/(app)/today.tsx`, `src/features/daily-load/{DailyLoadCard,LoadMeter}.tsx`, `src/features/life/LifeStatusSummary.tsx`, `src/features/one-move/OneMoveCard.tsx` and adds `scripts-dev/today-mutation-check.cjs` (§4) | `git diff --name-status 5007b0f HEAD` |
| Worktree | clean | clean after the final commit (checked and reported with the final status); no unrelated or owner change existed at entry or exit; `app.json` untouched | `git status --short` |

The gate outputs live in this session's scratchpad (`gates/*.txt`), not in the repository.

### 11.2 Mutation validation — "a test counts only once it fails with the defect put back"

`node scripts-dev/today-mutation-check.cjs` (optionally `ONLY=M07,M19`) puts each defect back into the Today source, runs the Today
suite serially, requires it to **fail**, and restores the file byte for byte. It refuses a dirty worktree and an unmutated baseline
that is not green and substantial (see TODAY-TCD-003). "Failing" is the number of Today tests that fail with the defect in.

| # | Defect put back | File | Failing | Result |
|---|---|---|---:|---|
| M01 | "handled" without requiring a success outcome (execution taken as success) | `executionView.ts` | 1 | CAUGHT |
| M02 | an unanswered delegation drops out of Today | `attentionView.ts` | 11 | CAUGHT |
| M03 | can-wait ignores a stated high consequence | `canWait.ts` | 2 | CAUGHT |
| M04 | a stand-in state is shown as her household | `todayView.ts` | 4 | CAUGHT |
| M05 | a hydrating state is treated as resolved | `todayView.ts` | 1 | CAUGHT |
| M06 | the screen never re-reads the clock | `useTodayView.ts` | 1 | CAUGHT |
| M07 | a stale One Move evidence link is kept as evidence | `oneMoveView.ts` | 1 | CAUGHT |
| M08 | elapsed commitments still count as what matters | `mattersView.ts` | 4 | CAUGHT |
| M09 | the three-primary-block cap is removed | `todayView.ts` | 2 | CAUGHT |
| M10 | an unconfirmed claim is presented like a stated fact | `refs.ts` | 6 | CAUGHT |
| M11 | the approval confirmation is bypassed (one tap approves) | `TodayAttention.tsx` | 4 | CAUGHT |
| M12 | a timing decision is offered after its window ended | `decisionView.ts` | 2 | CAUGHT |
| M13 | exclamation-mark cheerleading in copy | `narrative.ts` | 4 | CAUGHT |
| M14 | an accepted handoff is described as taken care of | `attentionView.ts` | 2 | CAUGHT |
| M15 | the approvals ledger is labelled "Handled by Her Keys" again | `HandledLedger.tsx` | 1 | CAUGHT |
| M16 | the day comes from UTC, not the household's timezone | `todayView.ts` | 9 | CAUGHT |
| M17 | take-back is offered for an accepted handoff | `attentionView.ts` | 1 | CAUGHT |
| M18 | the foundation's order of what needs her is reversed | `attentionView.ts` | 1 | CAUGHT (*) |
| M19 | a dependency Her Keys inferred is stated as fact ("needs") | `requirements.ts` | 10 | CAUGHT |
| M20 | a dropped / finished / removed commitment is still "waiting" | `requirements.ts` | 1 | CAUGHT |
| M21 | the One Move's context leaks into its reasons | `oneMoveView.ts` | 1 | CAUGHT (*) |
| M22 | the unconfirmed badge is dropped from "Coming up" | `upcoming.ts` | 3 | CAUGHT |
| M23 | a button row hides its unconfirmed badge from a screen reader (list) | `TodayList.tsx` | 1 | CAUGHT |
| M24 | a button row hides its unconfirmed badge from a screen reader (matters) | `TodayMatters.tsx` | 1 | CAUGHT |

**24 / 24 caught. (\*) Two mutants survived at first and were closed by adding the missing test, which is how the harness earned its
place:** M18 (reversed ordering — TODAY-TCD-004) and M21 (context leak on the recorded-evidence path — TODAY-TCD-005). A first run of
this harness "caught" 18 / 18 only because its own test command was broken (TODAY-TCD-003); the count above is from the corrected one.

### 11.3 Scenario assertion map (Addendum §7 / report table 7)

Fixtures are built from real domain operations (`tests/today/fixtures.mjs`; server-written rows as literals, each run through
`validateAppState`), and components are fed real view models, never hand-made props. **All scenarios: PASS.**

| Scenario | Fixture | View-model assertions | Render / runtime evidence |
|---|---|---|---|
| **A** ordinary day | `household()` + a few events and tasks, 08:00 | ready, on the household's logical day; calm — no decision, no attention, no manufactured warning; first level = matters then One Move; matters names the next commitment first, then fixed ones in time order; One Move is the smallest task with a route and a truthful completion effect; the other flexible task can wait | `TodayMatters`, `OneMoveCard` (`components`); screenshots `a-ordinary-1/2` |
| **B** overloaded | overlapping fixed events + an overdue task, 14:00 | a live, undecided timing conflict in Daily Load's own classification; the day is described in the existing verdict sentence; the overdue obligation is surfaced specifically; **no work added** — the One Move is deliberately withheld; first level is exactly decision + what needs her + withheld move | `DailyLoadCard`, `OneMoveCard` withheld; screenshots `b-overloaded-1/2` |
| **C** delegation risk | delegated task past its ack window, colliding with a fixed commitment | an unanswered request stays visible and most urgent and is **not** treated as covered; specific about what it collides with; take-back through the existing `returnToSelf`; acknowledged ≠ accepted ≠ done, each its own state; a decline hands it back plainly | `TodayAttention` (`attentionUi`); screenshot `c-delegation-risk` |
| **D** nearly empty | one task, 09:00 | one item dominates; no empty intelligence module; no capacity or risk claim it cannot support; the item is the One Move | screenshot `d-nearly-empty` |
| **E** uncertain inference | an `ai-inference` `possible` task, an `import-sync` `likely` event, a stated task | a `possible` inference is Her Keys' claim, never something she said; correction is edit-only (MP-01); every producer keeps its own truth; a stated fact carries no badge; viewing never upgrades confidence | `TodaySourceLine`; screenshots `e-uncertain-1/2` |
| **F** One Move: the machinery chooses | tasks entered in different orders | the choice is the machinery's; Today follows the **stored** decision even if it would have picked another; "why" is recorded evidence, each reason re-checked; a stale link is dropped; an unknown code is stored and never rendered; a Needs Me move invents no minutes | `OneMoveCard` "See why" (`components`) |
| **G** handled needs execution AND outcome | `richHousehold` server-row fixture + literals | no records → no claim; succeeded + success outcome → handled; succeeded with **no** outcome → unconfirmed, not handled; a non-success outcome → neither; approved-not-run → waiting; failed today → needs her; undone → not handled; yesterday's → not today's; a proposal is an approval row, never a promise | `TodayHandled` (`attentionUi`) |
| **H** what can wait | six look-alikes, one provable | only Daily Load's own movable set minus anything that says otherwise; every look-alike genuinely looks deferrable to the engine and is still not listed; bounded at three; a day with nothing provably deferrable says nothing | `TodayList` (`components`) |
| **I** data density | sparse → dense | never-entered is told plainly with one place to begin; history-but-nothing-today is genuinely light; dense: ≤ 3 primary blocks, every list bounded and counted, and it is "what matters" that steps down — never the decision, what needs her, or the One Move | `guarantees` structure over the 33-scenario corpus |
| **J** logical day | instants in several zones | the same instant projects into the household's day and label; near midnight (last second / first second); event day in the household zone; spring-forward and fall-back keep the day and the clock times | header label (`TodayHeader`) |
| **K** unknown / hydrating | real store through `unhydrated → hydrating → ready` | no state, or unsettled state, is UNKNOWN — no briefing at all; "light" only over resolved, genuinely light state; Today builds no sync surface | `TodayStateNotice` (`components`) |
| **L** demo & onboarding guard | `demoState()` | renders from demo-seed with real reasoning and mutates nothing; claims nothing Her Keys did; says nothing of accounts, sync or the cloud; the model imports no account, storage, network or platform module; the guard is intact and there is one Today route | `lifecycle` |
| **M** correction | a real store | every route maps to a real route file with the params it reads; a wrong due date is corrected through the real editor mutation and Today re-derives (persisted); editing an inferred row does **not** confirm it; take-back through `returnToSelf`; approve records a decision and is not execution; decline claims nothing; the only actions ever offered are open, take back, review an approval | `correction` |
| **N** One Move lifecycle & kinds | all six registered kinds | none / selected / completed / withheld; rollover never carries yesterday; `open` and `completion` are exactly what the domain supports per kind; a `records_only` kind changes nothing else | `OneMoveCard` (`components`); §11.4 |
| **O** recovery & quarantine | real store recoveries | stand-in state withholds the briefing; newer-version data is preserved and withheld; unreadable storage is untouched and withheld; another mode's household is preserved and not shown; corrupt storage is quarantined and then a normal, honest "nothing entered"; a session that merely stopped writing is still her real day | `TodayStateNotice`; §11.5 |
| **P** time of day | one household at 08:00, 15:00, 21:00 | elapsed commitments stop presenting as upcoming and the next moves; a commitment in progress still matters until it ends; no tier is invented from the clock; completed work stops demanding action; a timing decision whose window ended is no longer offered (D-02) | `lifecycle` |
| **W** across the logical-day boundary | real store + the real hook under mocked timers | the minute tick asks the store for the new day, then re-projects: label, One Move, matters — nothing of yesterday survives; the projection is a pure function of state and instant; a fixed instant starts no timer | `hooks` |

Beyond A–P and W: the upcoming constraint, "what changed", tone, first-glance privacy, purity, the seam, accessibility and
performance each have their own named tests (`lifecycle`, `guarantees`).

### 11.4 One Move lifecycle (report table 5)

| Stored state for the day | What Today renders | Where proven |
|---|---|---|
| no decision | **nothing** — not a filler card; yesterday's decision is never today's (lookup is by logical day) | `oneMove` "NO DECISION YET", "LOGICAL-DAY ROLLOVER" |
| `selected` | a **recommendation** ("What I recommend") with one gesture, "I did it"; "See why" → reasons → what "I did it" does → "Evidence and source" → open the row; no "not today" and no "show another" because no mutation exists (MP-02) | `oneMove`, `components` |
| `completed` | done; asks for nothing (no button); no replacement move is generated | `oneMove` "COMPLETED" |
| `withheld` | Her Keys noticing the day is full — an observation, not "no data"; nothing manufactured to fill the space | `oneMove` "WITHHELD" |

Per-kind affordances are in the table at the end of §5.1 and are proven for every registered kind (`oneMove` "every registered target
kind"), with a compile-time total `Record<OneMoveTargetType, …>` so a new kind cannot get no affordance silently (TODAY-FD-004).

### 11.5 Lifecycle / demo / recovery evidence (report table 6)

| Situation | Today shows | Evidence |
|---|---|---|
| no state / hydrating | unknown — a loading state, never "light" | `lifecycle` K (incl. a real store through `unhydrated → hydrating → ready`) |
| never entered | "Nothing entered yet." and one place to begin | `scenarios2` I, `lifecycle` O |
| demo household | normal reasoning from demo seed; no handled claim; no account / sync / cloud wording; nothing written | `lifecycle` L |
| newer-version data (`future_version`) | unavailable notice; briefing withheld; stored data preserved | `lifecycle` O (real store) |
| unreadable storage (`read_failed`) | unavailable notice; briefing withheld; stored data untouched | `lifecycle` O (real store, `failReads`) |
| another data mode's household (`mode_mismatch`) | not shown; preserved | `lifecycle` O (real store) |
| corrupt storage | quarantined, recreated empty; then a normal, honest "nothing entered" | `lifecycle` O (real store) |
| session stopped writing over her real state | her real day, as it is | `lifecycle` O |
| screen open across midnight | re-derived for the new day; nothing stale | `hooks`, `lifecycle` W |

### 11.6 UI-system consumption (report table 8 / Addendum §AC)

Every primitive below is imported from `src/design/components` or `src/design/tokens` — the permanent HK-FE-UI-01 system. No hex
colour, `rgba(`, `fontSize`, `fontFamily` or `fontWeight` appears in any new Today component or in `OneMoveCard` (grep, T9); every colour,
space, size, radius and interaction value is a token.

| Need | Actually used | Where |
|---|---|---|
| Screen shell | `Screen` | `app/(app)/today.tsx` |
| Typography | `AppText` (`display`, `screenTitle`, `sectionTitle`, `body`, `bodyStrong`, `supporting`, `metadata`, `label`) and `Overline` | every Today component; `TodayHeader`, `OneMoveCard`, `DailyLoadCard`, `LoadMeter` |
| Surfaces | `Card` (tones `surface`, `subtle`, `attention`, `success`) | `TodayMatters`, `TodayAttention`, `TodayStateNotice`, `HandledLedger`, `OneMoveCard`, `DailyLoadCard` |
| Buttons / actions | `Button` (variants `secondary` and `ghost`, sizes as the system defines them); the primary "I did it" is `RecommendationBlock`'s own | `TodayAttention` ("Take it back", "Open"), `OneMoveCard` ("Open it"), `HandledLedger` ("Undo"), `DailyLoadCard`, `TodayStateNotice` |
| Status | `Tag` ("Needs you"), `SegmentBar` (the load meter), `StatusList` (Life status), `ActionStateBlock` (approvals; handled), `InlineNotice` | `TodayAttention`, `DailyLoadCard`, `LoadMeter`, `LifeStatusSummary`, `TodayHandled`, `TodayStateNotice` |
| AI / inference display | `RecommendationBlock` (a recommendation is a recommendation until she acts), `InsightBlock` (a withheld move is an observation), `ConfidenceBadge` | `OneMoveCard`, `TodaySourceLine` |
| Reasoning / Why | `WhyThis` | `OneMoveCard`, `DailyLoadCard` |
| Provenance | `ProvenanceLabel`, `PROVENANCE_LABEL` | `TodaySourceLine` (also feeds the spoken label, D-07) |
| Disclosure / sheet | `ConfirmationSheet` (an approval is always confirmed, naming the intent's own consequence and reversibility); disclosure has no design-system primitive → the one feature-local `TodayDisclosure` (MGP-01) | `TodayAttention`; `TodayDisclosure` |
| Loading / recovery | `LoadingState`, `InlineNotice`, `Button`; the shell's own `PersistenceNotice` and `SyncNotice` are preserved, not rebuilt | `TodayStateNotice`; `TodayHeader` children slot |
| Tokens | `color`, `spacing`, `sizing`, `interaction`, `radius` (the pre-existing files also use the legacy `colors` alias) | all |

### 11.7 Feature-local component budget

**New named components: 10, budget 15** — `TodayBriefing`, `TodayHeader`, `TodayMatters`, `TodayList`, `TodayStateNotice`,
`TodayAttention`, `TodayHandled`, `TodaySourceLine`, `TodayDisclosure`, `SectionLabel` (plus two hooks that render nothing:
`useTodayView`, `useTodayActions`). Pre-existing Today-surface components were **refined, not multiplied**: `OneMoveCard`, `DailyLoadCard`,
`LoadMeter`, `HandledLedger`, `NeedsMeChip`, `LifeStatusSummary`. `TomorrowPreview` was replaced (§2.8). No parallel design system, token set,
type ramp or icon set was created; no runtime dependency was added (`package.json` and the lockfile are byte-identical to the fork point).

### 11.8 Performance measurement (report table 9 / Addendum §X)

One complete derivation (`buildTodayView`), on the dense reference household, 40 runs, on a machine with free memory:

| Household | Median | p95 | Max | Target |
|---|---:|---:|---:|---|
| dense reference — 20 events, 40 tasks, 6 delegations, 5 captured | 1.95 ms | 2.70 ms | 2.73 ms | < 100 ms |
| the same **plus 30 unmet `requires` edges** in the next two days (50 events, 70 tasks) — the worst case for `relatedTo` | 5.36 ms | 15.19 ms | 15.53 ms | < 100 ms |

(Earlier T8 readings of 4.8–6.5 ms median were taken while the machine was starved of memory.) No cache, memo or index was added; the
projection stays a pure function of state and an instant.

### 11.9 Tone and high-stakes copy review (report table 10)

Tone is enforced mechanically (`guarantees` "tone": every projected string in all 33 corpus scenarios, and every string literal in the
Today components and model, against eight banned families — cheerleading, exclamation marks, emoji, manufactured urgency, diminutives,
therapy-speak, productivity judgment / shame, scores and gamification) and reviewed here by hand for the surfaces where a wrong word costs the most. Each line says
what it claims and why that is true.

| Surface | Copy | What it claims — and why that is true |
|---|---|---|
| Unanswered request | "You asked {holder} to take “X”. No answer yet." / "{holder} hasn’t answered your request about “X”." | A request was made and no answer is recorded. No motive, no blame |
| Acknowledged | "{holder} has seen “X” but hasn’t said yes yet." | acknowledged ≠ accepted |
| Accepted, she still needs it | "{holder} agreed to take “X”. You marked it as still needing you." | accepted ≠ done; she said so herself; no take-back is offered |
| Accepted | "{holder} agreed to take “X”." | Says "agreed", never "handled" or "done" |
| Declined / returned | "{holder} said no to “X”. It’s yours again." / "“X” is back with you." | The recorded state, plainly |
| Proposal needing her yes | "{summary} It needs your yes." — confirmation: "If it went wrong, the impact would be {level}." "It can be undone." / "It can’t be undone." | Names the intent's own stored consequence and reversibility; never promises it will run (approval is a decision, not an execution) |
| Failed attempt | "Her Keys tried to {verb} for “X”, but it didn’t work." | A failed outcome is recorded |
| Unconfirmed attempt | "Her Keys tried to {verb} … It went through, but nothing has confirmed it yet." / "… but the result isn’t clear." | Execution without an outcome is not success |
| Handled | section "Handled by Her Keys" | Only with a succeeded execution **and** a success outcome |
| External source changed | "“X” may be out of date — the outside source it came from has changed." | "may": a possibility, sourced |
| Dependencies | "“X” needs “Y” first." / "“X” may need “Y” first." | "needs" only for a stated edge; "may need" + badge for an inferred one (D-06) |
| Unconfirmed claim | badge "Her Keys inferred this" / "From an external source" + level | The design system's own words; nothing is upgraded |
| Save failure | "Her Keys couldn’t save that yet. Nothing changed — try again." | The commit did not persist; nothing changed |
| Stand-in state | "Her Keys can’t show your day right now" + reason + "This session isn’t saving anything, so nothing you’ve saved has been changed." | Withholds intelligence rather than show a stand-in as her household |
| Never entered | "Nothing entered yet." / "Add your first event or task to see what Her Keys notices about your day." | Unknown is not "light" |
| Withheld One Move | "Today is already full, so Her Keys isn’t adding anything." | An observation, not a gap |
| Completed One Move | "Done. That’s enough for today." / "Her Keys won’t ask for anything else." | **Preserved from the certified copy — flagged for the owner:** the second sentence is a promise about the future that Today can contradict on the same screen (a new approval or an overdue row can still appear). It is not changed here because changing certified copy is the owner's call |

### 11.10 Conventions chosen (Addendum §AA — a repeatable feature shape, not a framework)

- **Directory:** `src/features/<feature>/model/` holds the pure projection (`types.ts`, one `<thing>View.ts` per section, `refs.ts`, `index.ts`);
  presentation components sit at the feature root; `use<Feature>View.ts` is the only place the clock is read; `use<Feature>Actions.ts` is
  the only place a mutation is made, and only through `store.commit`. Tests mirror it in `tests/<feature>/`.
- **View-model shape:** a discriminated union on availability (`unknown` · `unavailable` · `never_entered` · `ready`); in `ready`, every section is
  `null` unless supported, and a `composition` list says which sections appear, in what order and at what tier. Components render that
  list and carry no layout logic of their own. Provenance travels as a `SourceLine`, never as a bare string.
- **Scenario fixtures:** builders over real domain operations in `fixtures.mjs`; server-written rows as literals passed through `valid()`; a named
  `corpus.mjs` of real households and instants that every cross-cutting guarantee runs over; tests grouped by scenario letter.
- **Component naming:** `<Feature><Thing>`. A primitive the design system lacks is recorded as `MGP-nn` with the feature-local solution,
  so an integration wave can promote one shared version (`TodayDisclosure`, `SectionLabel`).
- **Evidence presentation:** a claim → "See why" (short, re-checked facts) → "Evidence and source" (structured evidence, context, provenance) → the
  editor. The unconfirmed badge appears at first glance only for Her Keys' unconfirmed claims; the honest source ("Source unknown", "Demo data")
  appears one level down.
- **Correction paths:** a typed `TodayRoute` per destination, verified against the real route files; only existing domain mutations, each through the
  store; a missing path is recorded as `MP-nn` and **no affordance implying it is rendered**.
- **UI primitives:** import from `design/components` and `design/tokens` only; no literal colour, size or font.
- **Deliberately not generalised:** nothing above is a shared abstraction; each is a habit a sibling can copy.

### 11.11 Self-check (base prompt §43)

| Check | Result | Evidence |
|---|---|---|
| no dashboard creep | pass | ≤ 3 primary blocks over the whole corpus; the rest is one disclosure away (`guarantees` structure) |
| no empty permanent sections | pass | a section is in the composition iff it has content (`guarantees` structure; scenario D) |
| no fake confidence | pass | confidence is read from storage and passed through; Today never promotes (§5.1); M10 |
| no inference-as-fact | pass | badge at first glance, "may need", spoken label; scenario E; M10, M19, M22–M24 |
| no delegation-as-completed | pass | acknowledged ≠ accepted ≠ done; M14, M17; scenario C |
| no execution claim without outcome | pass | scenario G; M01 |
| no duplicate One Move ranking algorithm | pass | Today follows the stored decision; scenario F ("Today ranks nothing") |
| no screen-local fake domain state | pass | components hold only expand flags and an in-flight guard; every change is an existing mutation through the store (`correction`) |
| no network dependency | pass | the model imports no account, storage, network or platform module (`lifecycle` L; `guarantees` seam) |
| no new design system | pass | §11.6, §11.7 |
| no foundation mutation | pass | §11.1 (empty diff; both migration hashes and the fingerprint equal) |
| no feature bleed into 02 / 03 / 04 | pass | no Talk It Out, Calendar or Systems file touched; the shared files that are touched are listed with collision notes in §4 |
| no inaccessible progressive disclosure | pass | `accessibilityState.expanded`, 44 pt targets, real headings (`guarantees` accessibility) |
| no raw unsupported AI prose stored as state | pass | Today stores nothing; the seam's prose is for one slot and is never stored (`guarantees` seam) |

### 11.12 Commit series

Stacking only — no amend, no rebase, no squash, no push, no PR, no merge. Explicit paths staged each time.

| Phase | Commits |
|---|---|
| T0 baseline | `026c6ea` |
| T1 foundation trace | `e11a417` |
| T2 projection + scenarios A–J | `6a7a2f3` |
| T3 composition and density | `08eacf1` |
| T4 One Move + Why | `b7f0249` |
| T5 what needs her | `54dd5b5` |
| T6 correction | `c5c0a82` |
| T7 lifecycle | `66d72ac` |
| T8 guarantees, owner evidence | `41d6f76`, `f7090e2` |
| T9 builder validation and repair | `855dcb1`, `fde2bc8`, `5d776d6`, `c0e13f9`, `c50f07e`, `1989711`, `9e1374f`, and the ledger-finalization commit(s) that carry this section |

### 11.13 LLM readiness (report F)

A typed seam **was** needed and exists: `model/narrative.ts`. `BriefingNarrativeProvider = (BriefingNarrativeInput) => BriefingNarrativeResult`.
It accepts only facts deterministic reasoning has *already* established — logical date, whether the household has entries, the existing day-state
sentence verbatim, the load tier, the day's recorded decision, the live issue, counts, the next commitment, how many things need her — and returns
`{ headline: string }` for one slot. It cannot add a fact: which sections exist, what they hold and which actions are offered are decided before it
runs, and its prose is never stored. `deterministicNarrative` is the only provider and is what runs. **No LLM, model, prompt, SDK, key, Edge
Function, network call or new dependency exists anywhere in Today** (`guarantees` seam tests; §11.1).

### 11.14 Feature verdict

**Does Today now function as a real local-first Her Keys chief-of-staff experience rather than a task dashboard? — PASS (builder).**
It works from real local canonical state; it reasons only through the established foundation and never invents a fact; its hierarchy adapts
to sparse, ordinary and dense days and shows at most three primary blocks; it says what is unresolved, specifically and without judgment; it
keeps user-stated, inferred, external and unknown claims distinct in words a screen reader speaks too; it never says handled without an
execution and an outcome, or covered while a request is unanswered; and it offers only corrections that exist. Open items for the owner, none
blocking: **OD-01** (§9, a removed prerequisite), the preserved "won't ask for anything else" copy (§11.9), the T9 behavior not being in the owner's
screenshots (§10), and TODAY-FD-001..005 (§8).
