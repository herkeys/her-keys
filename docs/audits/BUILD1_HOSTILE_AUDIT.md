# Her Keys Build 1 — Initial Hostile Audit

## Source Authority

| Item | Value |
| --- | --- |
| Repository | `git@github-herkeys:herkeys/her-keys.git` (GitHub visibility: **public**) |
| Authoritative branch | `main` |
| Authoritative base SHA | `df2be64ef9b5010fc3f12bd4897b372486081552` (merge of PR #1, `build/01-core-experience`) |
| Audit branch | `audit/build1-hostile-initial` (created from the base SHA) |
| Audit date | 2026-09-13 |
| Product authority | `HER_KEYS_PRODUCT.md` (read in full; not modified) |

**Phase 1 gate note.** At audit start, local `main` (`16abb3d52da5233ebb739e7c5761b50a4f9f898a`) was 2 commits behind `origin/main`. It was a strict fast-forward with no divergence, and `origin/main`'s tree (`7643af31…`) was identical to the checked-out `build/01-core-experience`. The audit stopped and asked the product owner. With their approval, local `main` was fast-forwarded (`git fetch . origin/main:main`) so that `main == origin/main == df2be64…` exactly, before the audit branch was created. No commit was made to `main`.

**Runtime environment used.**
- Node 24.14.0 / npm 11.9.0.
- Expo SDK 57 (`expo` 57.0.22, `expo-router` 57.0.21, React Native 0.86.3).
- Android emulator `Pixel_8_Pro`: API 37, 1344×2992 at 480 dpi (448×997 dp), gesture navigation, font scale 1.0.
- Expo Go 57.0.9, driven with adb + uiautomator.
- Metro ran on port 8090, because 8081 was already held by an unrelated `node.exe` (PID 11928) that the audit did not touch.

---

## Baseline

Pre-audit checks, run before any edit on the audit branch:

| Check | Result |
| --- | --- |
| `npm ci` | **FAIL** (exit 1). `ERESOLVE`: `react-dom@19.3.0` needs `react ^19.3.0`, but the project pins `react 19.2.3`. Reproduced in an isolated clean copy. |
| `npm run typecheck` | PASS |
| lint | not configured (`npm run lint --if-present`: no script) |
| tests | none existed (`npm test --if-present`: no script) |
| `npx expo-doctor` | PASS: 21/21 checks |
| `npx expo config` (public and `--json`) | PASS |
| `npx expo export --platform android` | PASS: 1295 modules, 2.8 MB Hermes bundle |
| `npm audit` | **FAIL** (exit 1): 13 moderate, 0 high/critical |
| `npm ls --all` | **FAIL** (exit 1): `react@19.2.3` invalid vs `react-dom` peer; `react-native-worklets@0.12.2` invalid vs `expo-modules-core` peer range |
| App boot (Expo Go, emulator) | PASS: Welcome rendered about 9 s after launch |

```
KNOWN_BASELINE_FAILURES=3   (npm ci, npm audit, npm ls)
```

---

## Executive Summary

| Priority | Found | Fixed | Unresolved | Documented (deferred) |
| --- | --- | --- | --- | --- |
| P0 | 0 | 0 | 0 | — |
| P1 | 0 | 0 | 0 | — |
| P2 | 5 | 5 | 0 | — |
| P3 | 6 | 6 | 0 | — |
| P4 | 14 | — | — | 14 |
| P5 | 10 | — | — | 10 |
| P6 | 4 | — | — | 4 |
| P7 | 2 | — | — | 2 |
| P8 | 2 | — | — | 2 |
| P9 | 3 | — | — | 3 |
| P10 | 2 | — | — | 2 |
| **Total** | **48** | **11** | **0** | **37** |

- **P0–P3 fixed:** 11.
- **P0–P3 unresolved:** 0.
- **P4–P10 documented:** 37.

The highest-risk deferred item is **HK-AUDIT-012**: Talk It Out answers safety and distress disclosures with scheduling or cleaning theories. It is rated P4 only because Build 1 is an internal scripted prototype with no users. It is a **release gate** that needs a product-owner safety policy before any real person uses Talk It Out.

### How severity was assigned

- **Reachable in the shipped seeded experience:** rated by the actual user impact observed at runtime.
- **Latent engine defects:** not reachable with Build 1 seed data, but reproducible with realistic, well-formed input that the engine will receive once real calendars and tasks connect.
  - Rated **P3** by default.
  - Rated **P2** where they corrupt state or misstate a commitment's due status (HK-AUDIT-005).
- **Fix requires new product policy, copy or UI states** (forbidden in this audit): documented at the severity the current impact supports, with an explicit gate.

---

## Fixed Findings

### HK-AUDIT-001
**Priority:** P2
**Type:** DEPENDENCY / CONFIGURATION

**Location:**
- `package.json` → `dependencies`
- `package-lock.json` → `node_modules/react-dom`

**Evidence:**
- Baseline `npm ci` exit 1, `ERESOLVE … Conflicting peer dependency: react@19.3.0`.
- Reproduced with `npm ci --ignore-scripts` in an empty scratch directory containing only the committed `package.json` and lockfile.
- `npm explain react-dom` shows `react-dom` pulled in as a **required** peer by expo-router's bundled web UI packages (`@radix-ui/react-collection`, `react-presence`, `react-primitive`, `react-roving-focus`, `react-tabs`, `vaul`).
- `node_modules/expo/bundledNativeModules.json` pins `react-dom` 19.2.3 for SDK 57.

**Reproduction:** clone the repo → `npm ci` → ERESOLVE. CI, EAS Build (which runs `npm ci` when a lockfile exists) and any new developer setup all fail.

**Root Cause:** npm auto-installed the newest `react-dom` (19.3.0) to satisfy a required transitive peer. That version needs `react ^19.3.0`, which conflicts with the SDK-pinned `react 19.2.3`. The committed lockfile already encoded the unsatisfiable tree.

**Fix:**
- Declared `react-dom` at the SDK-aligned version `19.2.3`.
- Regenerated the lockfile with `npm install --package-lock-only`.
- The lockfile diff is exactly: root dependency added; `react-dom` 19.3.0 → 19.2.3 with peer `react ^19.2.3`; nested `react-dom/node_modules/scheduler@0.28.0` removed.
- No other package changed, and nothing was force-upgraded.

**Regression Test:** install reproducibility check (`npm ci` on a clean tree). No unit test applies.

**Verification:**
- Fresh `npm ci` in an isolated directory with the new lockfile: exit 0 (548 packages).
- Phase 8 `npm ci` in the project: see Final Regression.

### HK-AUDIT-002
**Priority:** P2
**Type:** ROUTING

**Location:**
- `src/features/life/LifeStatusSummary.tsx` (row `onPress`)
- `app/(app)/life/_layout.tsx` (no anchor for the nested stack)

**Evidence (emulator, fresh launch):**
- Today → *Also checked* → **Kids** opens the Life tab on the Kids screen with **no back button** (no `Navigate up` node; screenshot `06-kids-from-today`).
- Tapping the focused Life tab does nothing.
- Switching tabs and returning still shows Kids.
- Hardware Back switches to the Today tab.
- The Life hub cannot be reached again for the rest of the session.
- Control: opening the hub first, then Money, gives a working back button.

**Reproduction:** launch → Today → tap Kids / Home / Money / Meals / Work under *Also checked* → try to reach the Life hub.

**Root Cause:** pushing a nested route into a tab whose stack has not mounted creates that stack with only the target route. The Life stack declared no anchor (`initialRouteName`), and the push did not request one.

**Fix:**
- `export const unstable_settings = { initialRouteName: 'index' }` in the Life layout. This also fixes deep links.
- `router.push(s.route, { withAnchor: true })` for the Today rows.
- Per the SDK 57 router-settings docs, `withAnchor` loads the `initialRouteName` screen beneath the target. The expo-router source (`getNavigationAction.js`) confirms it sets `initial: false` on the nested params.

**Regression Test:** runtime check on the emulator. The repo has no component or navigation test harness.

**Verification:**
- Today → Kids now shows `Navigate up` → Life hub (*Where things stand*).
- Deep link `exp://…/--/life/kids` → `Navigate up` present → Back → Life hub.

### HK-AUDIT-003
**Priority:** P2
**Type:** ROUTING

**Location:** `app/onboarding/profile.tsx` → "Show me my day"

**Evidence (emulator):**
- After completing onboarding, hardware Back from Today returned to onboarding step **4 of 4**.
- Further Backs walked through steps 3, 2, 1 and Welcome.
- The user could redo onboarding from inside the app.

**Reproduction:** Begin → complete all steps → Show me my day → press Android Back on Today.

**Root Cause:** `router.replace('/(app)/today')` replaces only the top route (Profile). Welcome and the four onboarding routes stayed in the root stack underneath the app.

**Fix:** onboarding now leaves history on completion:
- `if (router.canDismiss()) router.dismissAll();` then `router.replace('/(app)/today')`.
- The `canDismiss` guard avoids an unhandled `POP_TO_TOP` when Profile is opened directly.

**Regression Test:** runtime check on the emulator.

**Verification:** after completing onboarding, Back from Today exits the experience. `dumpsys activity` shows the launcher (`FallbackHome`) resumed, and no onboarding screen appears.

### HK-AUDIT-004
**Priority:** P2
**Type:** RESPONSIVE (input)

**Location:** `src/features/talk-it-out/TalkItOutView.tsx` → `KeyboardAvoidingView` (`keyboardVerticalOffset` was `0` on Android)

**Evidence (emulator, before fix):**
- **Modal** `/talk-it-out` with the keyboard open: the whole composer (input, Send, Voice) was hidden behind the keyboard (screenshot `08-modal-keyboard`).
- A tap on **Send** typed the letter "o" into the draft instead.
- **Her Keys AI tab:** the composer was half-covered (screenshot `11-ai-tab-keyboard`).
- IME top was at y = 1984 px.

**Reproduction:** open Talk It Out → focus "Message to Her Keys" → type.

**Root Cause:**
- `KeyboardAvoidingView` compares the keyboard's **screen** `screenY` with its own frame **relative to its parent**, so `keyboardVerticalOffset` must equal the view's distance from the top of the screen.
- Android used `0`.
- Diagnostics:
  - The keyboard reported `screenY` 661.33 dp, which matches the IME frame.
  - `measureInWindow` reported y = 56 (modal) and 0 (tab), excluding the 50.33 dp status bar.
  - `measure` `pageY` reported 106.33 (modal) and 50.33 (tab), which is the correct offset.

**Fix:**
- A wrapper `View` measures its screen `pageY` on layout and passes it as `keyboardVerticalOffset` on Android.
- The iOS branch is unchanged (see HK-AUDIT-044).
- The temporary diagnostic logging was removed.

**Regression Test:** runtime check on the emulator, with measured bounds.

**Verification:**
- Both surfaces with the keyboard open: IME top 1984 px, Send bottom 1879 px, disclaimer bottom 1948 px, so nothing overlaps.
- Tapping **Send** with the keyboard open delivered the message in both the modal and the AI tab (screenshots `23-final-modal-keyboard`, `24-final-ai-keyboard`).

### HK-AUDIT-005
**Priority:** P2
**Type:** LOGIC / STATE

**Location:**
- `src/features/daily-load/computeDailyLoad.ts` → candidate selection
- `src/store/ScheduleContext.tsx` → `moveRecommendedTask`

**Evidence:**
- Pure-engine probe, 75-minute pickup→soccer window with a flexible task **due today** (40 min) → recommended as "Move … to tomorrow".
- Approving through the store's reducer wrote `dueToday: false`, silently deleting the obligation's due status.
- The function's own doc comment says candidates are "flexible, not-due-today tasks".
- Not reachable with Build 1 seed data (both in-window tasks are not due today).

**Reproduction:** `computeDailyLoad([pickup 15:00–15:15, soccer 16:30–17:30], [{flexible, dueToday: true, start 15:20, 40 min}])`.

**Root Cause:** the in-window filter never checked `dueToday`, and the move reducer overwrote `dueToday` instead of only unscheduling.

**Fix:**
- `isMovable(task)` requires `flexible && !dueToday && durationMinutes > 0`.
- A due-today task still counts against the buffer.
- The reducer now only clears `scheduledStartMinutes`.

**Regression Test:** `tests/dailyLoad.test.mjs` → "never recommends moving a task that is due today, but still counts its time". Negative control M1.

**Verification:** test passes; the mutant is caught; seeded flow unchanged on device.

### HK-AUDIT-006
**Priority:** P3
**Type:** LOGIC / PRODUCT_CONTRACT

**Location:**
- `src/features/daily-load/DailyLoadCard.tsx` (moved state)
- `src/features/today/dayState.ts`
- `computeDailyLoad.ts` (candidates)

**Evidence (probe):**
- **Insufficient move.** Tasks of 50 + 10 min in a 75-minute window leave a 15-minute buffer. Choosing "Show another option" and moving the 10-minute task gives a 25-minute window that is still overloaded. The card nonetheless said *"That window now has 25 minutes instead of 15 — enough room before Soccer"*, and the day state said *"One change made. Today has room now."*
- **Second tight window.** With two tight windows, fixing one left the day overloaded while still claiming room.
- **Zero-minute task.** A 0-minute task was offered as a recovery (35 → 35).

**Reproduction:** see `tests/dailyLoad.test.mjs` fixtures.

**Root Cause:** the post-approval copy was unconditional and never consulted the recalculated assessment. Candidates were not checked for actually freeing time.

**Fix:**
- Recommendations carry `resolvesShortfall`.
- The moved card says "better, but still short of the 45 before …" when a move does not clear the shortfall.
- The day state claims room only when the recomputed status is `balanced` (otherwise "One change made. Today is still tight.").
- Zero-minute tasks are not candidates.

**Regression Test:**
- "does not offer a zero-minute task as a way to recover time"
- "flags a move that would still leave the window short"
- "the day state does not claim room after a move that left the day overloaded"
- Negative control M4.

**Verification:** tests pass. Seeded move on device still shows "enough room before Josie's soccer practice" and "Today has room now", which is correct because the recalculated day is balanced.

### HK-AUDIT-007
**Priority:** P3
**Type:** LOGIC

**Location:** `computeDailyLoad.ts` → `evaluateGap`

**Evidence:** probe with a **fixed** 60-minute task scheduled inside the 75-minute window gave status `balanced`, buffer 75, and the card "Your commitments have room between them".

**Reproduction:** a `commitment: 'fixed'` task with `scheduledStartMinutes` inside a gap.

**Root Cause:** the window filter kept only flexible tasks when summing scheduled time, so immovable work did not use up any buffer.

**Fix:** every scheduled task in the window reduces the buffer. Movability is decided separately by `isMovable`.

**Regression Test:** "a fixed task scheduled inside a window still uses up its time". Negative control M2.

**Verification:** test passes; the mutant is caught.

### HK-AUDIT-008
**Priority:** P3
**Type:** LOGIC

**Location:** `computeDailyLoad.ts` → gap walk (previously consecutive pairs of events)

**Evidence (probe):**
- Work 9:00–17:00, dentist 14:00–15:00 and soccer 16:00–17:00 gave `balanced`, with a "free" 3–4 PM window measured while Work was still running.
- An all-day event with nested 9:00–10:00 and 10:05–11:00 items gave "overloaded, 5 minutes between them", even though the enclosing commitment covers that time.

**Root Cause:** a gap was measured from the end of the immediately preceding event, not from the end of the latest-running commitment.

**Fix:** walk events in start order, tracking the latest-ending commitment. A gap opens only once it has ended.

**Regression Test:**
- "a gap is only measured once every earlier commitment has finished"
- "events nested inside a longer commitment do not open a gap of their own"

**Verification:** tests pass.

**Note:** surfacing the *conflict* itself is still unimplemented (HK-AUDIT-018).

### HK-AUDIT-009
**Priority:** P3
**Type:** PRODUCT_CONTRACT

**Location:** `computeDailyLoad.ts` → recommendation `reason`

**Evidence:** the primary Today card (screenshot `03-today-top`) said *"35 minutes is 10 short of the 45 **you usually need** to get there unrushed."* The 45 is a hard-coded constant, not something observed about this user. That contradicts §14 (keep stated beliefs separate from evidence) and §15 (never fabricate certainty).

**Fix:** reworded to *"35 minutes is 10 short of the 45 Her Keys allows by default to get there unrushed."*

**Regression Test:** "explains the shortfall against a default, not something it claims to know about her".

**Verification:** test passes; the new copy is visible on device.

### HK-AUDIT-010
**Priority:** P3
**Type:** PRODUCT_CONTRACT

**Location:**
- `src/data/seed/talkItOutScript.ts` (all `outcomes`)
- `src/features/talk-it-out/engine.ts` (`refineHypothesis`, `concludeDiscovery`)

**Evidence:**
- Every reachable conclusion (41 of 41) was labelled **"Likely pattern"** after two self-reported taps.
- The internal hypothesis was raised to `likely` after a single answer.
- The only "Possible pattern" labels were in `fallbackOutcome`, which is unreachable (every follow-up option has an outcome).
- On device: "LIKELY PATTERN" on the result card.
- §15 defines *Likely* as "conversation **and** behavioral evidence"; Build 1 has no behavioral evidence.

**Fix:**
- All conclusions are labelled "Possible pattern".
- The hypothesis confidence stays `possible` through every stage.
- A comment on `outcomes` records the contract reason.
- Summary wording itself is deferred (HK-AUDIT-016).

**Regression Test:** `tests/talkItOut.test.mjs` → "a conversation on its own never concludes more than a possible pattern" (walks all 41 paths). Negative control M5.

**Verification:** test passes; the device shows "POSSIBLE PATTERN".

### HK-AUDIT-011
**Priority:** P3
**Type:** RESPONSIVE / ACCESSIBILITY

**Location:** `app/(app)/_layout.tsx` → `tabBarStyle.height`

**Evidence:**
- In `expo-router/build/react-navigation/bottom-tabs/views/BottomTabBar.js`, `getTabBarHeight` returns a custom `height` verbatim, and the bar applies `paddingBottom: insets.bottom` **inside** that height before merging `tabBarStyle`.
- With `height: 68` and `paddingTop: 8`, the labels get `68 − 8 − insets.bottom` dp.
- On 3-button navigation (48 dp inset) that leaves 12 dp, less than the item's own 16 dp vertical padding plus the 15 dp label line.
- Labels are the tabs' only affordance (icons are hidden).
- On the gesture-navigation emulator `insets.bottom` is 0 (no `navigationBars` insets source in `dumpsys window`).
- Not reproduced visually: the audit did not change the emulator's system navigation mode.

**Fix:** `height: 68 + insets.bottom` via `useSafeAreaInsets()`. The bar is pixel-identical where the inset is 0 and grows only by the system bar's height elsewhere.

**Regression Test:** runtime comparison on the emulator.

**Verification:** typecheck passes; after-fix Today screenshot (`20-after-fix-today`) matches the baseline (`03-today-top`) tab bar exactly.

---

## Deferred Findings

### HK-AUDIT-012
**Priority:** P4 — **RELEASE GATE**
**Type:** PRODUCT_CONTRACT / SAFETY

**Location:** `src/features/talk-it-out/engine.ts` → `openTopic` / `matchTopic`; `src/data/seed/talkItOutScript.ts` keyword lists

**Evidence (pure-engine probe):**
- "He came to the house and threatened me" → *household*: "It might not be about cleaning more — sometimes a messy house means there's no clear landing spot…", then "When things pile up, where does most of it end up?"
- "Custody handoffs at his house are awful" → the same cleaning theory.
- "I've been crying all day" → *overload*: "This may not be a motivation problem. Your day may be getting overloaded during one particular transition."
- "I don't want to be here anymore" → "I'm not sure I understood that yet. Pick one of these…", with the quick replies "I'm always behind / The house is a mess / Money stresses me out / Sundays are rough".

**Impact:** for mothers after separation, disclosures of threats, abuse, crisis or distress are realistic input. The prototype answers them with dismissive household or scheduling theories. Harm is limited today (scripted prototype, disclaimer shown, no users), but this must not reach real users.

**Suggested Fix:** product-owner-defined safety policy: risk-language detection ahead of topic routing, a non-theorizing response, and region-appropriate resources. Any real Discovery Agent needs server-side safety handling.

**Why Deferred:** a correct fix requires new product policy and new safety copy, which this audit may not invent. Build 1 has no users.

### HK-AUDIT-013
**Priority:** P4
**Type:** LOGIC

**Location:** `engine.ts` → `matchTopic` (summed scores, `score > best.score` tie-break), `matchOption` (`bestPhraseScore`), `tokenize`

**Evidence:**
- **Ties** silently go to whichever comes first in the array: "money on the weekend" → *money* (tie with *weekend*); "after dinner, before work" → *before-work*.
- **Negation is inverted into evidence:** "definitely not in the morning" is recorded as evidence "The day tips before work starts".
- **Single common words hijack routing:** 'house', 'account', 'all day', 'open', 'first'.
- **No competing hypotheses** are generated (§6 loop).
- **Typos** ("hosue is a mes") do not match.

**Impact:** wrong follow-up questions, and occasionally false entries in the "Based on" evidence list. The user can Start over or use quick replies.

**Suggested Fix:**
- When top scores tie or fall within a margin, ask a clarifying question instead of choosing.
- Treat answers containing negation near the matched phrase as not understood.
- Ultimately replace with the real Discovery Agent.

**Why Deferred:** a deterministic placeholder slated for replacement; quick replies are the primary path.

### HK-AUDIT-014
**Priority:** P4
**Type:** ROUTING / STATE

**Location:** `app/index.tsx` (Begin); `app/onboarding/goals.tsx`, `strengths.tsx`, `struggles.tsx`, `talk-it-out.tsx` (Continue) → `router.push`

**Evidence (emulator):**
- **Control:** single tap Continue, then one Back, returns to step 1.
- **Test:** two taps 150 ms apart on Continue → Strengths pushed twice; one Back is still on "2 of 4", a second Back reaches step 1.
- Same result for Begin.

**Impact:** an extra Back press; no state corruption. Onboarding is now cleared from history on completion (HK-AUDIT-003), so duplicates don't leak into the app. A 150 ms double-tap on a Talk It Out quick reply did **not** reproduce any issue.

**Suggested Fix:** use `router.navigate` or `dangerouslySingular` for step-to-step onboarding moves, or add an in-flight navigation guard in `OnboardingScaffold`.

**Why Deferred:** low impact.

### HK-AUDIT-015
**Priority:** P4
**Type:** PRODUCT_CONTRACT / UX

**Location:** `src/features/one-move/OneMoveCard.tsx` (completed state); `app/(app)/today.tsx`

**Evidence (emulator):** tapping "I did it" while Daily Load is pending shows *"Done. That's enough for today. Her Keys won't ask for anything else."* directly below a Daily Load card still tagged **NEEDS YOU**. One Move is a static seed that ignores Daily Load, so the §7 path "No additional One Move today" does not exist.

**Impact:** contradictory state on the primary screen. One Move could add work on a day already flagged as overloaded.

**Suggested Fix:**
- Scope the completion copy to One Move ("That's your one move for today").
- Derive One Move eligibility from the Daily Load assessment.

**Why Deferred:** copy and product decision; no broken action.

### HK-AUDIT-016
**Priority:** P4
**Type:** PRODUCT_CONTRACT

**Location:** `talkItOutScript.ts` → `outcomes[*].summary`

**Evidence:**
- After two taps: *"Your day isn't consistently overloaded from morning to night. The bottleneck is the 4–7 PM transition…"* The user never mentioned 4–7 PM, and the seeded pickup is at 3 PM.
- Conclusions are phrased as findings.
- The agent never says "I don't know yet" (§6), apart from the generic unmatched reply.

**Impact:** fabricated specificity. HK-AUDIT-010 mitigates it (label now "Possible pattern"; stage label "What I think is happening").

**Suggested Fix:** content pass so summaries are phrased as theories to test, with no invented specifics.

**Why Deferred:** requires product voice and content review.

### HK-AUDIT-017
**Priority:** P4
**Type:** LOGIC / UX

**Location:** `src/features/daily-load/describeLoad.ts` → `pickLevel`, `copyFor`

**Evidence (probe):**
- A single tight window with 55+ minutes' shortfall gives *"Full — Several transitions are short on room."*
- The *Tight* caption "The rest of the day has space" is never checked.
- One event plus a 10-hour task gives *"Steady — Every transition has room."*

**Impact:** the at-a-glance meter can state things that aren't true once real data flows. With seed data its copy happens to be correct.

**Suggested Fix:** count short windows and base the copy on that count and on total capacity.

**Why Deferred:** latent; needs a small copy design.

### HK-AUDIT-018
**Priority:** P4
**Type:** LOGIC / PRODUCT_CONTRACT

**Location:** `computeDailyLoad.ts`; `DailyLoadCard.tsx` (no-candidate branch)

**Evidence (probe):**
- A task overrunning into the next event gives buffer **−15**, so the card would read "That turns your tightest -15 minutes into 75."
- Double-booked events are never reported as conflicts.
- Unscheduled due-today tasks (for example "Pay orthodontist invoice") and single-event days never count toward capacity.
- Contract §4 requires detecting conflicts and estimating realistic capacity.

**Impact:** gaps in the core Daily Load question ("what is likely to go wrong today?") once real calendars connect.

**Suggested Fix:**
- Explicit conflict state and copy.
- Clamp or explain negative buffers.
- A capacity model covering unscheduled due work.

**Why Deferred:** new capability and UI state beyond a narrow repair; unreachable with seed data. **Gate:** before calendar or task integration.

### HK-AUDIT-019
**Priority:** P4
**Type:** PRODUCT_CONTRACT / UX

**Location:**
- `app/onboarding/goals.tsx:26`, `strengths.tsx:26`, `struggles.tsx:26` (`continueDisabled={… .length === 0}`)
- `app/onboarding/profile.tsx` (empty state)

**Evidence:**
- Every step requires at least one selection, so a user who identifies with none of the six struggles must pick an inaccurate label to proceed. That label then becomes a "Starting hypothesis".
- The profile's "Nothing selected" state is unreachable.
- Goals are unbounded, with no "about three / next 90 days" framing (§8).
- Only 6 of the contract's 15 struggle examples are offered.

**Impact:** forced self-labeling (§14: don't permanently label from onboarding); a slight contract drift.

**Suggested Fix:**
- Allow "None of these" or Skip.
- Frame goals as "about three for the next 90 days".

**Why Deferred:** product/UX decision.

### HK-AUDIT-020
**Priority:** P4
**Type:** RESPONSIVE

**Location:** `src/design/components/StatusList.tsx` → `styles.label` (`flexShrink: 0`)

**Evidence:** on the 448 dp baseline, Kids → *On your list* shows the long title "Email Josie's teacher about the field trip form", which squeezes "Not due today" into two lines (screenshot `06-kids-from-today`). Narrower phones and larger fonts make it worse.

**Impact:** value text becomes cramped or illegible for long labels.

**Suggested Fix:** let the label shrink (`flexShrink: 1`), or stack label and value when the label is long.

**Why Deferred:** readable on the baseline device.

### HK-AUDIT-021
**Priority:** P4
**Type:** RESPONSIVE / ACCESSIBILITY

**Location:** `app/index.tsx:8` (`<Screen scroll={false}>`, footer `paddingBottom: spacing.xxl`); `src/design/components/Screen.tsx:13` (`edges` omit `bottom`)

**Evidence:**
- The "Begin" button sits 24 dp above the screen bottom, and the bottom safe-area edge is not applied.
- On 3-button navigation (48 dp) about half the button would sit under the navigation bar.
- At large font scales the fixed, non-scrolling layout can overflow into the footer.
- Baseline (gesture navigation) renders correctly (screenshot `01-welcome`).
- Static analysis only: emulator system settings were not changed.

**Impact:** partial obstruction of the only entry into the app on some devices.

**Suggested Fix:** include the `bottom` safe-area edge on non-scrolling screens, or make Welcome scroll.

**Why Deferred:** the top half of the button stays tappable; not runtime-verified.

### HK-AUDIT-022
**Priority:** P4
**Type:** ACCESSIBILITY

**Location:** `src/design/components/AppText.tsx` (`Overline`); screen titles in `app/(app)/*.tsx` and `OnboardingScaffold`

**Evidence:** no element has `accessibilityRole="header"`.

**Impact:** TalkBack and VoiceOver users cannot navigate by heading on long screens (Today holds six sections).

**Suggested Fix:** add a header role to hero titles and section overlines.

**Why Deferred:** screens remain usable by linear navigation.

### HK-AUDIT-023
**Priority:** P4
**Type:** ACCESSIBILITY

**Location:** `src/features/talk-it-out/TalkItOutView.tsx` (message list, quick replies)

**Evidence:**
- New Her Keys replies are not announced (no `accessibilityLiveRegion` or `AccessibilityInfo.announceForAccessibility`).
- Quick-reply buttons unmount after a tap, so the element holding screen-reader focus disappears.
- Static analysis; not exercised with TalkBack.

**Impact:** screen-reader users must re-explore the whole conversation after each turn.

**Suggested Fix:** announce new replies, and move focus to the newest question.

**Why Deferred:** needs a TalkBack/VoiceOver pass to design properly.

### HK-AUDIT-024
**Priority:** P4
**Type:** DEPENDENCY / SECURITY

**Location:** transitive chain `expo-router@57.0.21` → `query-string@7.1.3` → `decode-uri-component@0.2.2`, used by `getStateFromPath` / `getPathFromState`

**Evidence:**
- GHSA-vcc3-ghjq-m6fr / CVE-2026-45822: denial of service through exponential decoding of malformed percent-encoded input.
- CVSS 6.6, availability impact only. Fixed in 0.5.0; affects ≤ 0.4.2.
- Reachable at runtime through deep-link URL parsing.

**Impact:** a crafted `herkeys://` link opened by the user could hang the JS thread. No data exposure.

**Suggested Fix:** track an expo-router release that drops or upgrades `query-string`. Do not force an `overrides` jump to 0.5 (semver-major under `query-string@7`).

**Why Deferred:** no compatible upstream fix; local, user-initiated availability impact only.

### HK-AUDIT-025
**Priority:** P4
**Type:** REPOSITORY / LEGAL

**Location:** `LICENSE:1-3`; GitHub repository visibility

**Evidence:**
- The GitHub API reports `herkeys/her-keys` as **public** with license MIT.
- `LICENSE` is the create-expo-app template: "The MIT License (MIT) … Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)".
- The product code and `HER_KEYS_PRODUCT.md` are therefore published under a permissive license attributed to Expo.

**Impact:** an unintended open-source grant and incorrect copyright attribution for the product.

**Suggested Fix:** the owner decides on visibility and licensing (for example, make the repo private or add a proprietary license). Not something an engineering audit should change.

**Why Deferred:** legal and ownership decision.

### HK-AUDIT-026
**Priority:** P5
**Type:** DEPENDENCY

**Location:** `npm audit`

**Evidence:**
- 13 moderate advisories with two root causes.
- `uuid@7.0.3` (< 11.1.1, GHSA-w5hq-g745-h8pq) via `xcode` → `@expo/config-plugins`: build and prebuild tooling only.
- `decode-uri-component` (HK-AUDIT-024).
- npm's suggested "fix" is `expo@46.0.21`, a semver-major downgrade.

**Impact:** tooling only, apart from HK-AUDIT-024.

**Suggested Fix:** take Expo patch releases as they ship. Never apply `npm audit fix --force`.

**Why Deferred:** no safe fix available.

### HK-AUDIT-027
**Priority:** P5
**Type:** DEPENDENCY

**Location:** `package-lock.json` (auto-installed optional peers)

**Evidence:**
- `react-native-reanimated@4.6.0` (SDK 57 expects 4.5.1) and `react-native-worklets@0.12.2` (SDK expects 0.10.1).
- worklets falls outside `expo-modules-core`'s peer range `^0.7.4 || … ^0.10.0`, hence the `npm ls` "invalid" and the ERESOLVE warning.
- Not imported by the app at runtime (only in expo-router's testing mocks). expo-doctor passes.

**Impact:** version drift that would surface as a native/JS mismatch if these libraries are adopted.

**Suggested Fix:** `npx expo install react-native-reanimated react-native-worklets` when first used, or keep them out of the tree.

**Why Deferred:** unused at runtime.

### HK-AUDIT-028
**Priority:** P5
**Type:** CONFIGURATION

**Location:** `README.md` ("npm run web"); `package.json` `web` script

**Evidence:** `react-native-web` is not installed, and web is not a Build 1 target.

**Impact:** a documented command that cannot work.

**Suggested Fix:** remove it from the README, or install web support via `npx expo install react-native-web`.

**Why Deferred:** web is out of scope.

### HK-AUDIT-029
**Priority:** P5
**Type:** RESPONSIVE

**Location:** `src/design/components/Screen.tsx:13` used under the native header in `app/(app)/life/_layout.tsx`

**Evidence:** Kids, Home, Money, Meals and Work add the top safe-area inset below an already-inset native header. That leaves about 50 dp of extra blank space between "Kids" and "TODAY" (screenshot `06-kids-from-today`).

**Impact:** wasted space; content is pushed down.

**Suggested Fix:** let `Screen` accept `edges`, and omit `top` on screens that show a header.

**Why Deferred:** cosmetic.

### HK-AUDIT-030
**Priority:** P5
**Type:** ACCESSIBILITY

**Location:**
- `AppText.tsx` (`Overline` uses `toUpperCase()`)
- `Tag.tsx:24`
- `OneMoveCard.tsx` ("ABOUT {n} MINUTES")
- `SystemsList.tsx` ("WORKING")
- `ChipToggle.tsx` (`role="button"` + `selected`)
- `OnboardingScaffold` (disabled Continue)

**Evidence:**
- Uppercased strings can be spelled out letter by letter by screen readers.
- Chips announce as buttons rather than toggles or checkboxes.
- The disabled Continue gives no reason why.

**Impact:** a noisier, less clear screen-reader experience.

**Suggested Fix:**
- Uppercase through styling with a mixed-case accessibility label.
- Use `accessibilityRole="checkbox"` with `checked` on chips.
- Give Continue a hint ("Choose at least one").

**Why Deferred:** minor.

### HK-AUDIT-031
**Priority:** P5
**Type:** MAINTAINABILITY / STATE

**Location:**
- `src/features/kids/KidsOverview.tsx:8-9`
- `src/features/money/MoneyOverview.tsx:8`
- `src/features/work/WorkOverview.tsx:8`
- the claim in `src/features/life/lifeStatus.ts:14-21`

**Evidence:** the Life sub-screens read `todaysEvents` / `todaysTasks` straight from seed, bypassing `ScheduleContext`. `lifeStatus.ts` says summaries "can never drift… from what actually happened when the user moved something", which holds only for Today and the Life hub.

**Impact:** no visible drift with the current fields, but a second source of truth that will diverge once tasks mutate further.

**Suggested Fix:** read `events` and `tasks` from `useSchedule()` everywhere.

**Why Deferred:** latent.

### HK-AUDIT-032
**Priority:** P5
**Type:** DATA

**Location:** `src/data/seed/oneMove.ts:10`; `src/data/seed/systems.ts` (sys-2, sys-3); `talkItOutScript.ts` (overload/pickup outcomes)

**Evidence:**
- One Move observes "Mail has been piling up on the kitchen counter for about two weeks".
- Systems marks both "Bill envelope — … instead of scattering across the counter" and "Sunday reset" as **WORKING**.
- Talk It Out cites a "4–7 PM" bottleneck while the seeded pickup is 3:00 PM.

**Impact:** seeded reasoning contradicts itself in a demo.

**Suggested Fix:** align the seed narratives.

**Why Deferred:** demo data only.

### HK-AUDIT-033
**Priority:** P5
**Type:** UX / LOGIC

**Location:** `computeDailyLoad.ts` (`observation` template); `DailyLoadCard.tsx` (no-candidate branch, `kept`/`moved` terminal states)

**Evidence:**
- "Scheduled in your **only** gap before X" appears even when earlier gaps exist.
- The no-candidate card hard-codes "Leave a few minutes early **this afternoon**". A probe window at 10:00 AM would still say "afternoon".
- After *Keep* or *Move* the decision is terminal: no "Ask for another solution" and no follow-up recommendation for another tight window.

**Impact:** small copy inaccuracies; limited recovery options.

**Suggested Fix:**
- Say "the gap before X".
- Derive the time-of-day wording from the window.
- Allow reopening a decision.

**Why Deferred:** minor, and partly product behavior.

### HK-AUDIT-034
**Priority:** P5
**Type:** CONFIGURATION

**Location:** `app.json` (`name`, `android.adaptiveIcon.backgroundColor`, `ios.supportsTablet` / `orientation`)

**Evidence:**
- Launcher label is "her-keys".
- The template adaptive-icon background `#E6F4FE` is still in place.
- No `android.package` or `ios.bundleIdentifier`.
- `supportsTablet: true` with portrait-only orientation: App Store iPad multitasking validation typically requires all orientations or `requireFullScreen`. Unverified; no iOS build.

**Impact:** release-readiness friction.

**Suggested Fix:**
- Set the display name, identifiers and icon background.
- Decide on iPad support and orientation.

**Why Deferred:** no release in scope.

### HK-AUDIT-035
**Priority:** P5
**Type:** TEST_COVERAGE

**Location:** repository

**Evidence:**
- No lint configuration.
- Before the audit there were no tests.
- This audit added a zero-dependency `node:test` suite covering only the pure logic (`computeDailyLoad`, `dayState`, the Talk It Out engine).
- Rendering and navigation (`.tsx`) were verified manually on an emulator.

**Impact:** navigation and UI regressions (HK-AUDIT-002/003/004/011) have no automated guard.

**Suggested Fix:**
- Add ESLint (`npx expo lint`).
- Add `jest-expo` + React Native Testing Library, or Maestro flows, for navigation and keyboard cases.

**Why Deferred:** new tooling beyond audit repairs.

### HK-AUDIT-036
**Priority:** P6
**Type:** HARDENING

**Location:**
- `computeDailyLoad.ts` → `formatTime`, `evaluateGap`
- `src/features/meals/MealsOverview.tsx:5` (key `m.day`)
- `TalkItOutView.tsx` (`TextInput` has no `maxLength`)
- `TalkItOutContext.tsx` (message array)

**Evidence (probe):**
- `formatTime(1440)` returns "12:00 PM", `formatTime(-30)` returns "11:-30 AM", and `formatTime(90.5)` returns "1:30.5 AM".
- A −500-minute task duration turns buffer into 575.
- Meals rows are keyed by day name.
- Talk It Out accepts unbounded input: 100 kB routed without error.
- The resolved stage appends two messages per send forever into a non-virtualized `ScrollView`.

**Impact:** malformed or large inputs produce wrong output or unbounded growth.

**Suggested Fix:**
- Validate the schedule at the data boundary (duration ≥ 0, 0 ≤ minutes < 1440).
- Use stable ids as keys.
- Cap input length.
- Virtualize or bound the conversation.

**Why Deferred:** unreachable with seed data.

### HK-AUDIT-037
**Priority:** P6
**Type:** HARDENING / STATE

**Location:**
- `src/store/TalkItOutContext.tsx` → `submit` (uses render-closure `state`)
- `src/store/ScheduleContext.tsx` (`candidateIndex` never reset)
- `engine.ts` → `restartFallback` (keeps `topicId` and `evidence`)

**Evidence:**
- **Code review:** two submits processed before a re-render would advance from the same stale state; `candidateIndex` can point past a shrunken candidate list; a fallback restart would carry old evidence into the next topic.
- **Runtime:** a 150 ms double-tap did not reproduce the stale-state issue.

**Impact:** latent duplication and stale-evidence risks.

**Suggested Fix:**
- Functional state update with the conversation in a reducer.
- Reset `candidateIndex` when candidates change.
- Clear `topicId` and evidence in `restartFallback`.

**Why Deferred:** not reproducible today.

### HK-AUDIT-038
**Priority:** P6
**Type:** SECURITY / FUTURE_ARCHITECTURE

**Location:** `app.json` (`scheme: "herkeys"`); expo-router default `_sitemap`; `app/_layout.tsx` (no route guards)

**Evidence:** deep link `exp://127.0.0.1:8090/--/today` opened Today directly, bypassing onboarding. Every route is reachable by URL, and expo-router's sitemap lists them all.

**Impact:** harmless without authentication or data; becomes an access-control gap as soon as auth arrives.

**Suggested Fix:** gate routes with `Stack.Protected` / redirects based on auth and onboarding state, and override `_sitemap` in production.

**Why Deferred:** no auth in Build 1.

### HK-AUDIT-039
**Priority:** P6
**Type:** FUTURE_ARCHITECTURE / SECURITY

**Location:**
- `engine.ts` (`topic.branches[option.id]`, `branch.outcomes[option.id]`)
- `src/types/talkItOut.ts` (`ConversationState`)
- `src/store/ScheduleContext.tsx`

**Evidence:**
- Conversation stage, topic, evidence and schedule mutations are all client-authoritative.
- Script lookups use plain-object keys. If ids ever arrive from a server or client payload, keys such as `constructor` would resolve to `Object.prototype` members and crash or misroute. Today every id comes from the static script.

**Impact:** a pattern that becomes unsafe when the engine seam is backed by a server (§17: AI actions through controlled server capabilities).

**Suggested Fix:**
- Server owns conversation state, hypotheses and approvals.
- Validate ids against allow-lists.
- Use `Map` or `Object.hasOwn` for lookups.

**Why Deferred:** no backend yet.

### HK-AUDIT-040
**Priority:** P7
**Type:** TECHNICAL_DEBT

**Location:**
- `talkItOutScript.ts` (`fallbackOutcome` ×13)
- `app/onboarding/profile.tsx` (empty state)
- `src/design/components/Divider.tsx`
- `ConversationState.hypothesis` / `.result`
- `DailyLoadGap.beforeEventId` / `afterEventId` / `rawWindowMinutes`

**Evidence:**
- A probe confirmed every follow-up option has an outcome, so no `fallbackOutcome` is reachable.
- The empty profile state is unreachable (HK-AUDIT-019).
- `Divider` is exported but never used.
- The listed state and gap fields are written but never read.

**Impact:** dead paths imply behavior that doesn't exist.

**Suggested Fix:** remove them, or wire them up deliberately.

**Why Deferred:** no user impact.

### HK-AUDIT-041
**Priority:** P7
**Type:** TECHNICAL_DEBT

**Location:** `src/store/ScheduleContext.tsx` (move reducer inline in `.tsx`); route strings in `lifeStatus.ts` (`route: string`)

**Evidence:**
- The move/keep reducer lives inside a JSX provider, so it can't be tested without a React renderer. The HK-AUDIT-005 reducer change could only be verified at runtime.
- Routes are untyped strings (`experiments.typedRoutes` is off).

**Impact:** harder to test and refactor safely.

**Suggested Fix:**
- Extract a pure `applyDecision(tasks, recommendation)`.
- Enable typed routes.

**Why Deferred:** refactor.

### HK-AUDIT-042
**Priority:** P8
**Type:** POLISH

**Location:** `src/design/tokens.ts:7` (comment), `colors.textTertiary` on `colors.accentSoft`, disabled `Button`

**Evidence:**
- The comment claims every pairing is "≥ 4.8:1".
- Measured `textTertiary` on `accentSoft` is **4.76:1** (still WCAG AA); every other pairing checked is ≥ 4.82:1.
- The disabled primary label is 1.77:1 (disabled controls are exempt).

**Impact:** documentation accuracy only.

**Suggested Fix:** correct the comment, or nudge the token.

**Why Deferred:** passes AA.

### HK-AUDIT-043
**Priority:** P8
**Type:** POLISH

**Location:** `app/(app)/_layout.tsx` (five text-only tabs, 11 px labels)

**Evidence:** "Her Keys AI" nearly fills its 20%-width tab at 448 dp.

**Impact:** truncation risk on narrow phones or large font scales.

**Suggested Fix:** a shorter label or icons with accessible labels.

**Why Deferred:** fits on the baseline device.

### HK-AUDIT-044
**Priority:** P9
**Type:** RESPONSIVE (observation)

**Location:** `TalkItOutView.tsx` → `keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : screenTop}`

**Evidence:** the iOS offset is a hard-coded 90. By the same geometry as HK-AUDIT-004, the correct value differs between the modal (header plus status bar) and the AI tab (status bar only).

**Impact:** possible over- or under-padding above the iOS keyboard.

**Suggested Fix:** verify on iOS; if wrong, apply the measured `pageY` on both platforms.

**Why Deferred:** no iOS runtime available to verify.

### HK-AUDIT-045
**Priority:** P9
**Type:** CONFIGURATION (observation)

**Location:** runtime verification environment

**Evidence:** all runtime checks used Expo Go 57.0.9 on an API 37 emulator. A development or standalone build's window, edge-to-edge and `softwareKeyboardLayoutMode` behavior may differ from Expo Go's.

**Impact:** HK-AUDIT-004 and HK-AUDIT-011 could behave differently in a dev build.

**Suggested Fix:** re-verify keyboard and tab-bar behavior in the first development build, including a 3-button-navigation device.

**Why Deferred:** no dev build exists yet.

### HK-AUDIT-046
**Priority:** P9
**Type:** PRIVACY (observation)

**Location:** public repository contents and history

**Evidence:**
- The full product strategy (`HER_KEYS_PRODUCT.md`) is public.
- Commit metadata exposes author names and personal email addresses (normal for git).
- The secret and PII scan found no credentials, keys, `.env` files, build output, emulator artifacts or real user data in the current tree or in history (deleted files: template `App.tsx`, `index.ts` only).
- Seed people and places are fictional.

**Impact:** strategic exposure, depending on the owner's intent.

**Suggested Fix:** confirm the repository visibility is intended (see HK-AUDIT-025).

**Why Deferred:** owner decision.

### HK-AUDIT-047
**Priority:** P10
**Type:** FUTURE_ARCHITECTURE

**Location:** `app/_layout.tsx` / all stores (in-memory state)

**Evidence:** every launch starts at Welcome and resets onboarding, schedule decisions and conversations. This is by design for Build 1.

**Impact:** none now. Persistence must also persist onboarding completion, or HK-AUDIT-003 and HK-AUDIT-038 routing needs a guard.

**Suggested Fix:** when adding persistence, add an onboarding-complete flag with protected routes.

**Why Deferred:** future build.

### HK-AUDIT-048
**Priority:** P10
**Type:** FUTURE_ARCHITECTURE

**Location:** Daily Load, Discovery Agent and One Move seams

**Evidence:** Build 1's deterministic engines are placeholders for the intelligence layer.

**Impact:** guardrails to carry forward, beyond HK-AUDIT-012/018/039:
- An explicit confidence model backed by behavioral evidence (§15).
- An approval log for high-consequence moves (§16).
- Conflict and capacity modeling before calendar ingestion.

**Suggested Fix:** make these acceptance criteria for the builds that add real data and AI.

**Why Deferred:** future builds.

---

## Negative Controls

Each mutant was applied with `sed` to the repaired source, then the full `node:test` suite was run, the file restored from a byte copy, the restored file's `git hash-object` compared with the pre-mutation hash, and the suite re-run.

| ID | Mutant | Expected failing test | Actual | Revert |
| --- | --- | --- | --- | --- |
| M1 | `isMovable` drops `!task.dueToday` (`computeDailyLoad.ts`) | never recommends moving a task that is due today… | **Failed as expected** (only that test) | hash identical; suite green |
| M2 | `evaluateGap` counts only flexible tasks again | a fixed task scheduled inside a window still uses up its time | **Failed as expected** (only that test) | hash identical; suite green |
| M3 | `advance` treats a clarifying answer as a new topic (`refineHypothesis` → `openTopic`): Talk It Out loses context | each free-text reply is read as an answer to the question on the table | **Failed as expected**, plus the confidence walk | hash identical; suite green |
| M4 | `describeDayState` always claims room after a move | the day state does not claim room after a move that left the day overloaded | **Failed as expected** (only that test) | hash identical; suite green |
| M5 | refined hypothesis confidence reset to `'likely'` | a conversation on its own never concludes more than a possible pattern | **Failed as expected** (only that test) | hash identical; suite green |

The "duplicate action application" control was **not practical**. The move reducer lives inline in `ScheduleContext.tsx` (JSX), and the repo has no component test harness (see HK-AUDIT-041). Idempotence was checked by code review: a repeat move writes the same fields.

After all controls, `git status` showed only the intended repair files, and no mutation remained.

---

## Tests Added

The harness adds no new packages:
- `tests/support/register-ts.mjs` is a Node module hook that resolves the app's extensionless `.ts` imports for Node 24's built-in type stripping.
- `npm test` → `node --import ./tests/support/register-ts.mjs --test "tests/**/*.test.mjs"`.

`tests/dailyLoad.test.mjs` (10 tests):
- seeded day: pickup → soccer window, both candidates, projections and `resolvesShortfall`
- seeded day: approving the first recommendation leaves the day balanced
- HK-AUDIT-009: reason is framed as a default, not learned knowledge
- HK-AUDIT-005: due-today tasks are never recommended, but still count against the buffer
- HK-AUDIT-006: zero-minute tasks are not offered
- HK-AUDIT-006: a move that doesn't clear the shortfall is flagged
- HK-AUDIT-006: day state doesn't claim room while still overloaded
- HK-AUDIT-007: fixed tasks in a window use up its time
- HK-AUDIT-008: gaps open only after the latest-running commitment ends
- HK-AUDIT-008: nested events don't open gaps of their own

`tests/talkItOut.test.mjs` (3 tests):
- conversation memory: free-text answers are read against the pending question
- symbol- or emoji-only input does not open a topic
- HK-AUDIT-010: all 41 conversation paths conclude at "Possible pattern", with hypothesis confidence `possible` at every stage

Before the repairs: **3 passed, 10 failed**, each defect test failing for the recorded reason. After the repairs: **13 passed, 0 failed**.

---

## Residual Risk

This audit cannot certify systems that Build 1 intentionally lacks:

- **Authentication and authorization.** None exists. Route guarding, session handling and cross-user isolation are unaudited. Every route is reachable by deep link today (HK-AUDIT-038).
- **Persistence.** None exists. There are no data-at-rest, migration, sync, conflict or corruption-recovery paths to test, and every launch resets state.
- **Supabase / PostgreSQL.** Not connected. Row-level security, schema, policies and service-role handling are unaudited.
- **Real AI.** None exists. The Discovery Agent and Daily Load engine are deterministic placeholders. Model safety, prompt injection, crisis handling (HK-AUDIT-012), cost, latency and evidence-backed confidence (§15) are unaudited.
- **External providers.** None connected (calendars, email, banking, school portals). OAuth scopes, token storage, webhook trust and data minimization are unaudited.
- **Production data.** None; all data is fictional seed. Real-world schedule shapes (overlaps, overruns, all-day events, time zones, DST, midnight crossings) were probed only through the pure engine (HK-AUDIT-008/018/036).
- **Platforms.** Verified on one Android emulator (API 37, gesture navigation, font scale 1.0) in Expo Go. Not verified: iOS, tablets, web, 3-button navigation, small screens, large font scales, TalkBack/VoiceOver, or a development/standalone build (HK-AUDIT-044/045). Those were assessed statically.
- **Release pipeline.** No EAS configuration, signing, store metadata or OTA updates to audit.

---

## Final Regression

### Automated checks (Phase 8, after all repairs)

| Check | Baseline | Final | Notes |
| --- | --- | --- | --- |
| `npm ci` | FAIL | **PASS** (exit 0, 64 s) | HK-AUDIT-001 repaired; installed `react-dom` is 19.2.3 |
| `npm run typecheck` | PASS | **PASS** | |
| lint | not configured | not configured | HK-AUDIT-035 |
| `npm test` | no tests | **PASS: 13/13** | 5 suites; was 3 pass / 10 fail against the unrepaired code |
| `npx expo-doctor` | 21/21 | **21/21** | |
| `npx expo config` (public, `--json`) | PASS | **PASS** | SDK 57.0.0, scheme `herkeys` |
| `npx expo export --platform android` | PASS | **PASS** | 1295 modules, Hermes bundle exported |
| `npm audit` | FAIL (13 moderate) | FAIL (13 moderate, unchanged) | known: HK-AUDIT-024, HK-AUDIT-026 |
| `npm ls --all` | FAIL (react + worklets invalid) | FAIL (worklets invalid only) | `react` problem resolved by HK-AUDIT-001; worklets drift known (HK-AUDIT-027) |

The remaining failures are baseline failures, carried over or improved. None is new:

```
KNOWN_BASELINE_FAILURES=3
NEW_UNEXPECTED_FAILURES=0
```

### Runtime regression (emulator, Expo Go, fresh bundle after `npm ci`)

This scripted adb/uiautomator run has hard gates: it aborts unless Metro reports ready and the app boots.

| Area | Checks | Result |
| --- | --- | --- |
| Onboarding | boots to Welcome; Begin → goals; deselect/reselect; goals → strengths → struggles → invite; profile shows selected and omits deselected goal; profile confidence "possible"; profile → Today; **Back from Today leaves the app, no re-entry into onboarding** | 14/14 PASS |
| Today / Daily Load | pending day state; default-buffer reason copy; meter "Tight"; alternate option 2; alternates cycle back; move applied; moved card "enough room before Josie's soccer practice"; day state "Today has room now"; meter "Steady"; move cannot be applied twice | 10/10 PASS |
| One Move | completes; cannot complete twice; rapid double-tap renders exactly one completion card | 3/3 PASS* |
| Life / navigation | Home from Today has a back button → Life hub; hub → Money → back → hub; Calendar tab; Systems tab | 6/6 PASS |
| Talk It Out | modal route opens; punctuation-only input unmatched; quick reply opens topic; free-text answer read against pending question; result "Possible pattern"; no "Likely pattern"; evidence trail; Start over clears; AI tab reachable | 9/9 PASS |
| Keyboard (HK-AUDIT-004) | composer and disclaimer above IME in modal and AI tab; Send works with keyboard open | PASS (verified earlier in this build; unchanged since) |

\* In the first scripted pass the two One Move checks failed: the driver tapped "I did it" while the button sat partly under the tab bar (uiautomator reports covered nodes as tappable). A focused re-run scrolled until the button's bounds (y 1942–2074) were fully above the tab bar (y 2837). The tap then completed One Move, and a 150 ms double-tap produced exactly one completion. This was a test-driver visibility artifact, not an application regression.

Metro printed one environment warning on restart: `Error while reading cache, falling back to a full crawl` (stale file-map cache after the clean reinstall). It recovered automatically and produced no application errors.

---

## Final Verdict

**REPAIRED_CONTINUE_BUILDING**

- All 11 verified P0–P3 defects (5 × P2, 6 × P3) were repaired at their root cause, verified at runtime or by tests, and guarded by regression tests where a harness exists. Five negative controls proved those tests catch reintroduced defects.
- `NEW_UNEXPECTED_FAILURES=0`. The remaining automated failures (`npm audit`, `npm ls`) are known baseline items documented as HK-AUDIT-024/026/027.
- 37 P4–P10 findings are documented and deferred. Before later builds:
  - Before any real user touches Talk It Out: **HK-AUDIT-012** (safety/distress routing).
  - Before calendar or task integration: **HK-AUDIT-018** (conflicts and capacity).
  - Owner decision: **HK-AUDIT-025** (public repository under Expo's MIT license).
