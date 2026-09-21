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
| FR-01 | Orientation: logical-day label + concise framing (§9A, J) | NOT STARTED | |
| FR-02 | "What matters today" prioritized, not every item (§11) | NOT STARTED | |
| FR-03 | One Move — full presentation lifecycle, all registered target kinds (§15, N) | NOT STARTED | |
| FR-04 | "Why this One Move" from structured evidence, progressive (§16) | NOT STARTED | |
| FR-05 | Needs Me — things that exist vs things that need her (§12) | NOT STARTED | |
| FR-06 | Risk / attention — specific, evidence-based (§13) | NOT STARTED | |
| FR-07 | Capacity — "does the day fit", no scores (§14) | NOT STARTED | |
| FR-08 | What can wait — bounded, only when provably safe (§17, T) | NOT STARTED | |
| FR-09 | Responsibility / waiting; delegated ≠ covered (§18) | NOT STARTED | |
| FR-10 | "Handled by Her Keys" only with execution **and** outcome (§19, O) | NOT STARTED | |
| FR-11 | Upcoming constraint — one, only if material (§20) | NOT STARTED | |
| FR-12 | What changed — no presentation markers in state (§21, P) | NOT STARTED | |
| FR-13 | Correction / adjustment through existing paths only (§22, H) | NOT STARTED | |
| FR-14 | Progressive disclosure, accessible (§23) | NOT STARTED | |
| FR-15 | Adaptive density; ≤3 primary blocks on an ordinary day (§24, S) | NOT STARTED | |
| FR-16 | Time: household timezone, logical day, DST, time-of-day, rollover (§25, P, W) | NOT STARTED | |
| FR-17 | Local-first; unknown ≠ light; unrecovered ≠ light; sync stays infrastructure (§26, J, K, M) | NOT STARTED | |
| FR-18 | Demo isolation and onboarding guard intact (L) | NOT STARTED | |
| FR-19 | Typed future-LLM seam, nothing wired (§27) | NOT STARTED | |
| FR-20 | Tone: calm, precise, adult; no cheerleading / dramatization (Q) | NOT STARTED | |
| FR-21 | Minimum sensitive detail at first glance (R) | NOT STARTED | |
| FR-22 | Accessibility: order, headings, dynamic text, targets, non-color status, expand state (§38) | NOT STARTED | |
| FR-23 | Dense reference derivation < 100 ms, measured and reported (X) | NOT STARTED | |
| FR-24 | Permanent UI system consumed; ≤15 feature-local components; no new dependency (§7, Y, Z, AC) | NOT STARTED | |

---

## 4. Files owned, shared files touched, primitives — *filled as the build proceeds*

**Files owned by this feature** (`src/features/today/…`, `tests/today/…`, this ledger and its evidence folder): TBD.

**SHARED FILES TOUCHED** (path · reason · commit · likely sibling collision · reconciliation need): none yet.

**MISSING GLOBAL PRIMITIVE register** (semantic need · current limitation · feature-local solution · sibling relevance):

| # | Need | Limitation | Feature-local solution | Sibling relevance |
|---|---|---|---|---|
| MGP-01 | An accessible expand/collapse ("Why this?", "Everything today", "Can wait") | `WhyThis` always renders open; `HandledLedger` has an ad-hoc `Pressable`+`Overline` toggle; no design-system disclosure exists | `TodayDisclosure` in `src/features/today/` built only from `AppText`/`Overline`/tokens, with `accessibilityState.expanded` | High — Talk It Out, Calendar, Systems will each want one. Integration wave should promote **one** shared disclosure. |

---

## 5. Foundation trace, correction map, prefix index — *T1*

(Filled in the T1 commit.)

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

## 8. Considered and deferred — *filled as found*

(Initial entries recorded in the T1 commit.)

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
