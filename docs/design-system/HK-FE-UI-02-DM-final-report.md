# HK-FE-UI-02-DM — Final report (Adaptive Appearance: Light / Dark / System)

Disposition: **SOURCE COMPLETE. Device and native evidence NOT RUN.** Nothing merged, no EAS build, no OTA, no Supabase deploy.

## A. Source

| | |
|---|---|
| Entry SHA | `ca9e7926ffa2d3b752e1a17856e1ad1310f402da` (PR #29 tip, `design/hk-fe-ui-02-premium`) |
| Branch | `design/hk-fe-ui-02-adaptive-appearance-20261016` |
| Final SHA, PR link, commit series | recorded in the draft PR description (a report cannot contain the SHA of the commit that adds it) |
| Diff vs entry | ~145 files, +1.2k/−0.35k in tracked files plus new files; **0 lines** changed in `src/monetization`, `src/domain`, `src/store`, `src/state`, `src/persistence`, `src/external`, `supabase/` |
| Dependency added | `expo-system-ui ~57.0.4` (via `npx expo install`); lockfile normalised with npm 10.9.4 (CI's `npm ci` dry-run OK) |

## B. Architecture
See [HK-FE-UI-02-DM-adaptive-appearance.md](HK-FE-UI-02-DM-adaptive-appearance.md): one `AppearanceProvider` (preference → scheme → `Theme`), `useTheme()` /
`createThemedStyles()` in every component, a 126-file codemod migration, `SystemChrome` + `ThemedNavigation` mounted only in the root layout,
device-local AsyncStorage key `herkeys.appearance.preference.v1`.

## C. Visual design
Light = the approved palette, untouched. Dark = Midnight Plum `#211B25` ground, surfaces `#302633/#2A222E/#382C3B/#403344`, text `#F7F1F6/#D1C2D0/#B8A6B7`,
luminous Berry `#CC84AC` (tuned up from the candidate `#BE729C`, which is 4.1:1 as text on a card), dark-ink primary-button label, lighter functional
siblings, Luxury Black badge with a rim, sage unchanged and decorative-only, no blue anywhere. Contrast: `contrast-matrix.md` 152 PASS / 0 FAIL across both
schemes; rendered audits below.

## D. Behaviour (all verified at source/unit level; device NOT RUN)

| Behaviour | Evidence |
|---|---|
| Default System; follows the phone live | `appearance.test.mjs` (fresh install, live device change) |
| Manual Light/Dark overrides the phone in both directions | `appearance.test.mjs`, `appearanceSection.test.mjs` |
| Immediate switch; native layer given the override | same; `Appearance.setColorScheme` asserted |
| Persists across restart | provider re-mounted on the same store reads it back |
| Survives sign-out / account change | separate key; `themeBoundary.test.mjs` proves no blanket AsyncStorage wipe exists and only two modules name the key; no account/household module imports the theme |
| Pre-auth correct | Welcome, premium intro, sign-in, recovery, OTP, consent, onboarding are in the 74-render set and in both audits; the provider is the outermost provider after safe areas; a ground-coloured veil covers the first frame until the saved choice is read (no Light flash before saved Dark) |
| Invalid / unreadable / hung store → System, startup never trapped | corrupt, failing and never-resolving stores tested (1.2 s bound) |
| No remount, no lost form state, onboarding not reset | mount-count + local-state test across Light → Dark → System; navigation state lives outside the theme context |
| RevenueCat / consent / Supabase unchanged | 0 diff lines in `src/monetization`, domain, store, supabase; consent/welcome/account diffs contain only style-factory lines (`scripts-dev/ui02dm-presentation-only-audit.mjs`: 34 non-theme lines, all provider wiring or the Appearance mount) |
| Selector accessible | radiogroup/radio roles, checked state, hints, ≥ 44 pt rows, glyph + heavier outline (not colour alone), live "Your phone is currently using …" note |
| Selector reach | Your Account only (post-auth). Pre-auth screens follow the saved/System choice and have no control — a product decision, not built |

## E. Validation (exact)

| Check | Command | Result |
|---|---|---|
| Full suite | `node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs --test "tests/**/*.test.mjs"` | **5,038 tests, 5,027 pass, 11 fail**, 173 s (entry: 4,906 / 4,895 / 11) → +132 tests, **0 new failures** |
| TypeScript | `npx tsc --noEmit` | exit 0 |
| Expo compatibility | `npx expo install --check` | "Dependencies are up to date" |
| Expo Doctor | `npx expo-doctor` | 21/21 passed |
| Release identity | `node scripts/verify-release-identity.mjs` | `RELEASE_IDENTITY=PASS` (1.0.0 / versionCode 2 / build 2) |
| Lockfile | `npx -y npm@10.9.4 ci --dry-run --ignore-scripts` | OK |
| Native config | `tests/ios/nativeConfig.test.mjs` | 14/14 (resolved plist `UIUserInterfaceStyle=Automatic`; the real `expo-system-ui` plugin function yields Android `automatic`; light+dark splash on both platforms) |
| Lane registration | `node scripts-dev/ui02-register-lane.mjs "adaptive appearance DM"` → `tests/meals/boundary.test.mjs` | 113 owned / 141 shared; boundary 13/13 (two pinned lane lists in the test were extended, not loosened) |
| Bundles | `npx expo export --platform android` / `ios` | both succeed |
| Rendered contrast — Light | `node scripts-dev/ui02-contrast-audit.mjs --scheme light --timeout-minutes 30` | **PASS**: 69 processes, 1,725 renders, 15,829 samples, 0 findings, 455 s |
| Rendered contrast — Dark | `… --scheme dark …` | **PASS**: 68 processes, 1,680 renders, 19,306 samples, 0 findings, 703 s |
| Theme-boundary / stale-capture scans | `themeBoundary.test.mjs`; `scripts-dev/ui02dm-stale-theme-scan.mjs` | 0 static colour imports, 0 hex/rgb literals outside tokens/palettes; 0 theme values captured in `useState`/`useRef`, 0 memo hooks missing theme deps, 0 module-scope hook calls (the 8 "module-scope" hits are `themed<…>()` wrappers or tokens.ts itself) |

### Audit-harness incident (recorded, repaired)
The first Light audit reported 21 findings: all were *my new Dark-provider tests* measured against the Light ground (the harness used one ground per run). Repaired by
inferring each tree's ground from its own scheme-exclusive colours. The first Dark audit then hit its bound and was reported INCOMPLETE (not a pass) after 30 min with 44 of
69 files finished: tests that pin Light values fail under the Dark default, and the failing path skips cleanup so the child process never exits. Repaired with
`--test-force-exit --test-timeout=120000`; the runner now fails with `RESULT: INCOMPLETE (not a pass)` on any timeout/signal. Only completed runs are quoted above.

### Failures
* **Deferred, untouched — 8 account-deletion (#9):** `tests/accountDeletion/{database,mutations,resourceCoverage}.test.mjs`.
* **Inherited, tracked separately — 3 `premiumHome`:** `tests/premiumHome/home.test.mjs` (purchase single-flight/placement assertions). Fail identically on the entry tree `ca9e792`.
* **New appearance-related failures: none.**

## F. Final dispositions

| Flag | Value |
|---|---|
| HK_UI02_DM_SOURCE_COMPLETE | **YES** (source); device evidence outstanding |
| LIGHT_MODE_REGRESSION | **NONE** — 74 resolved trees identical to pre-migration `ca9e792` under three provider configurations; Light rendered audit 0 findings |
| DARK_MODE_IMPLEMENTATION | **IMPLEMENTED** (whole app incl. Premium; rendered audit 0 findings) |
| SYSTEM_MODE_SWITCHING | **PASS at unit level**; on-device NOT RUN |
| PREFERENCE_PERSISTENCE | **PASS at port/provider level**; AsyncStorage on a device NOT RUN |
| PRE_AUTH_THEME_COVERAGE | **PASS (source)** |
| POST_AUTH_THEME_COVERAGE | **PASS (source)** |
| PREMIUM_THEME_COVERAGE | **PASS (source)**; final Premium decision / review sheets not reachable in the harness |
| ACCESSIBILITY_CONTRAST | **PASS** (matrix 152/0; rendered 0 findings both schemes); VoiceOver/TalkBack NOT RUN |
| NAVIGATION_STATE_PRESERVED | **PASS (unit)**: no remount, state preserved |
| ACCOUNT_ISOLATION_PRESERVED | **PASS**: device-local key, no account/household/sync coupling, no wipe path |
| REVENUECAT_BEHAVIOR_UNCHANGED | **PASS**: 0 diff lines in `src/monetization` |
| CONSENT_BEHAVIOR_UNCHANGED | **PASS**: style-only diffs in consent files |
| EXPO_NATIVE_CONFIG | **CONFIGURED**; requires a NEW native binary (userInterfaceStyle, expo-system-ui, splash) — not built |
| SPLASH_THEME_CONFIGURATION | **CONFIGURED** (light + dark by *phone* scheme only; the OS splash cannot know the in-app manual choice — documented) |
| EXACT_SHA_CI | **PENDING** — to be recorded on the PR after push |
| ANDROID_NATIVE_CERTIFICATION | **NOT_RUN** |
| IOS_NATIVE_CERTIFICATION | **NOT_RUN** |
| READY_FOR_V2_INTEGRATION | **YES, conditional** on the dependencies below |
| READY_FOR_DEVICE_SMOKE | **YES after a new dev/preview binary**; emulator captures blocked by host disk space |

## Remaining limitations
1. No visual evidence (see `evidence/hk-fe-ui-02-dm/MANIFEST.md`): host disk full (~575 MB free) when the emulator became available.
2. Native-only behaviours unverified: Android edge-to-edge system/navigation-bar glyph contrast, iOS Automatic appearance, status bar on devices, launch-splash hand-over, keyboard and alert theming.
3. Third-party/OS surfaces we do not draw (store purchase sheet, permission dialogs, Apple/Google sign-in) follow the phone or the OS override.
4. Selector exists only in Your Account; no pre-auth control.
5. Integration dependencies, deliberately **not** cherry-picked: RevenueCat repair `8cb841c`, AI-consent PR #30. New `.tsx` from either must use `useTheme()`; `themeBoundary.test.mjs` fails loudly otherwise.
6. `app.json` changed (automatic style, plugin, splash) — a new binary is required before any of it takes effect on a device.
