# Build 5 release readiness

**Date:** 2026-11-23
**Scope:** Build 5 Milestone A, the iPad and iPhone Duo adaptive layout on Expo SDK 57.
**Outcome:** source-ready for review as draft PRs. Native certification, the SDK 58 Duo milestone, and store work are not done.

## 1. Provenance

| Item | Value |
|---|---|
| Original baseline | `5ed5b30` = `integration/v2-autonomous-upgrade-20261112` (merge of PR #68) |
| Build 4 (frozen, untouched) | EAS `19da0220`, build 4, `com.herkeys.app`, `store-sandbox`, source `ef229eb`, submitted 2026-11-15 |
| PR 1: responsive foundation | `build5/01-responsive-foundation` @ `967724d` (code `cd20863`, a RevenueCat scope note, and its lane registration) |
| PR 2: navigation and iPad layout | `build5/02-adaptive-navigation-ipad` @ `b9b9cee` |
| PR 3: Duo spec, matrices, certification docs | `feature/build5-ipad-iphone-duo-adaptive` (this commit and its link update) |
| Branch names | The two lower branches sit outside `feature/*` on purpose. The Meals boundary scan treats every other local `feature/*` branch holding history above its baseline as a sibling feature (finding G). A stack of three `feature/*` branches would fail it on any developer machine holding all three. |
| Draft PRs | §6 |
| Candidate SHA | the tip of `feature/build5-ipad-iphone-duo-adaptive` once the PR links are recorded (§6). The code is identical to `b9b9cee`. |
| Worktree | `C:\Users\jsmit\Her-Keys-B5` (own `npm ci`, not shared `node_modules`) |

## 2. Changed files

**PR 1: responsive foundation**
- `src/design/adaptive/sizeClass.ts` (new)
- `src/design/adaptive/useAdaptiveLayout.ts` (new)
- `src/design/adaptive/AdaptiveSplit.tsx` (new)
- `src/design/adaptive/index.ts` (new)
- `src/design/readableColumn.ts`
- `src/design/components/Screen.tsx`
- `src/design/components/Sheet.tsx`
- `app/(app)/ai.tsx`
- `app/talk-it-out.tsx`
- `src/features/consent/ConsentFlow.tsx`
- `tests/build5/adaptiveLayout.test.mjs` (new)
- `tests/ios/ipadSupport.test.mjs`
- `tests/onboardingLayout.test.mjs`
- `tests/support/rn-stub.tsx`
- `docs/audits/HK_PLATFORM_PARITY_REGISTRY.json`
- `docs/audits/HK_IOS_ANDROID_PLATFORM_PARITY.md`
- `scripts-dev/meals-boundary-scan.cjs` (adds the HK-BUILD-05 lane for all three PRs)
- `docs/build5/BUILD5_ADAPTIVE_BASELINE_AUDIT.md`
- `docs/build5/BUILD5_SDK_COMPATIBILITY.md`

**PR 2: navigation and iPad layout**
- `src/design/adaptive/appTabs.tsx` (new)
- `app/(app)/_layout.tsx`
- `app/(app)/today.tsx`
- `src/features/today/TodayBriefing.tsx`
- `src/features/calendar/CalendarScreen.tsx`
- `app/(app)/life/index.tsx`
- `app/(app)/systems/index.tsx`
- `tests/build5/adaptiveNavigation.test.mjs` (new)
- `docs/build5/BUILD5_IPAD_UX_SPEC.md`

**PR 3: documentation only**
- `docs/build5/BUILD5_IPHONE_DUO_UX_SPEC.md`
- `docs/build5/BUILD5_RESPONSIVE_TEST_MATRIX.md`
- `docs/build5/BUILD5_ANDROID_REGRESSION_REPORT.md`
- `docs/build5/BUILD5_PERFORMANCE_REPORT.md`
- `docs/build5/BUILD5_SCREENSHOT_PLAN.md`
- `docs/build5/BUILD5_RELEASE_READINESS.md`

**Not changed:**
- `package.json` and `package-lock.json`
- `app.json` and `eas.json`
- native configuration and plugins
- migrations, schemas and the backend
- RevenueCat, the Supabase clients and the auth flows

## 3. Gates (commands and actual results)

| Gate | Command | Result |
|---|---|---|
| Clean install | `npm ci` | PASS (591 packages) |
| Typecheck | `npx tsc --noEmit` | PASS at baseline, at PR 1 and at the tip |
| Full suite, baseline | `npm test` at `5ed5b30` | 5707 / 5707 |
| Full suite, PR 1 alone | `npm test` in a detached worktree at `cd20863` (PR 1 code) | see §3.1 |
| Full suite, Build 5 code | `npm test` at the final code | **5767 / 5767** |
| Design system, accessibility, platform parity, auth, Calendar, AI, consent, Premium, deletion | Part of `npm test`, including `design-system/*`, `platformParity/*`, `calendar*`, `consent*`, `premium*`, `accountDeletion/*`, `ios/*` | PASS (inside 5767) |
| Build 5 tests | `tests/build5/*.test.mjs` | 54 / 54 |
| Mutation check | 5 hand mutants against `tests/build5` | 5 / 5 caught |
| Expo Doctor | `npx expo-doctor` | **1 check failed: pre-existing and environmental.** Seven SDK 57 patch releases (`expo-router` 57.0.32 and others) were published after the lockfile was set. Build 5 changes no dependency, and the 2026-10 audits warn against these patch bumps (nested `expo-modules-core`). Left for a dependency PR. |
| iOS export | `expo export --platform ios` (own TEMP / Metro cache) | PASS, see §3.2 |
| Android export | `expo export --platform android` (own TEMP / Metro cache) | PASS, see §3.2 |
| Byte scan | U+0000, U+0085, U+2028, U+2029, CR in authored files | clean |
| Build configuration | `app.json`, `eas.json`, release identity unchanged | PASS (`git diff 5ed5b30 -- app.json eas.json package.json` is empty) |

### 3.1 PR 1 standalone

Recorded in the final report of this build. (This file is written before that run finishes; see §6 for where the result is recorded.)

### 3.2 Bundle provenance

Both exports ran from the final code with their own `TEMP` (a cold Metro cache). Each Hermes bundle was checked for a control string and a Build 5-only string, which guards against the known trap of bundling another checkout through a shared cache.

| Bundle | `Life Inbox` (control) | `adaptive-split-panes-row` (Build 5 only) |
|---|---|---|
| iOS `index-891e5fea….hbc` | 3 | 1 |
| Android `index-6f0c4741….hbc` | 4 | 1 |

## 4. Native evidence

**None.** This host has no macOS, Xcode, Device Hub, iPad or iPhone Duo. Every native row in `BUILD5_RESPONSIVE_TEST_MATRIX.md` is **NOT RUN**.

Hermes provenance can be checked with the method from the 2026-11-17 IPA audit:
- Hermes header bytes 12..32 are the SHA-1 of the JS source.
- `expo export:embed --eager --platform ios --dev false` with the profile's `EXPO_PUBLIC_*` env reproduces it.

## 5. Report

```
BUILD 4 ISOLATION: PASS
RESPONSIVE FOUNDATION: PASS
IPAD OPTIMIZATION: NOT FULLY VERIFIED
IPHONE DUO OPTIMIZATION: NOT FULLY VERIFIED
EXPO SDK COMPATIBILITY: MIGRATION REQUIRED
ACCESSIBILITY: NOT FULLY VERIFIED
ANDROID REGRESSION: PASS
FULL TEST SUITE: PASS
NATIVE DEVICE TESTING: NOT RUN
BUILD 5 SOURCE READINESS: PASS
BUILD 5 EAS READINESS: PENDING NATIVE EVIDENCE
BUILD 5 APP STORE SUBMISSION READINESS: PENDING REVIEW
```

**Unresolved items and the exact action for each:**

1. **iPad, native.**
   - Build a development build from the candidate on macOS (Xcode 26.6).
   - Run the iPad rows of the test matrix, covering mini, 11-inch and 13-inch; portrait and landscape; 1/3, 1/2 and 2/3 Split View; Slide Over; and Stage Manager resizing through 600pt and 840pt.
   - Capture screenshots.
2. **iPad, household modules list/detail.** Not built. Schedule it as a separate work package (baseline audit §6.1).
3. **iPhone Duo.**
   - Do the SDK 58 migration PR first (`BUILD5_SDK_COMPATIBILITY.md` §4).
   - Then Milestone B (`BUILD5_IPHONE_DUO_UX_SPEC.md` §4).
   - Then the Device Hub pass: folded, partially open, open, Split View left and right, fold with an unsaved form.
   - Known gaps until then: rail placement and hinge avoidance.
4. **Accessibility, native.** VoiceOver order through the sidebar and both panes, Dynamic Type at AX5, Increase Contrast, Reduce Motion, an external keyboard (Tab and arrow keys through the sidebar), and pointer hover. Run on the iPad and iPhone rows.
5. **Android, device.** Phone and tablet AVD pass on a development build (`BUILD5_ANDROID_REGRESSION_REPORT.md` §4).
6. **EAS readiness.**
   - After items 1, 4 and 5, run `eas env:exec production "npm run release:preflight"` on the integration branch, after the owner merges.
   - The Build 5 branches are not in `RELEASE_BRANCHES`, by design.
   - Build number 5 or later.
   - **No Production EAS build was triggered.**
7. **App Store submission.** It needs:
   - owner review of the draft PRs
   - a Production-profile build (Build 4 is a `store-sandbox` / Staging binary)
   - screenshots per `BUILD5_SCREENSHOT_PLAN.md`
   - a separate submission authorization
8. **Owner decisions:**
   - OD-B5-01: iPhone landscape
   - OD-B5-02: Talk It Out context panel
   - OD-B5-03: SDK 58 timing
9. **Expo Doctor patch drift.** A separate dependency PR, using the npm 10 lockfile procedure.

**RevenueCat:** out of scope for Build 5. It has a known connection issue, is untested here, and is not a blocker or a FAIL reason for any item above (owner direction 2026-11-23). Build 5 does not touch it; the Systems paywall entry only moved panes.

## 6. Draft PRs

Recorded after the branches are pushed (see the next commit on this branch).
