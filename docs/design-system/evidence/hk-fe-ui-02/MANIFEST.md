# HK-FE-UI-02 — Phase 1 evidence manifest

All images are **source-rendered**: the real shared components and the real Welcome/consent/audit components rendered with fixed
props by `src/dev/Ui02Evidence.tsx`, captured from an Android emulator. None is a design mock-up or a screenshot of the concept
image. **This is source-level visual evidence, not native device certification.**

| Field | Value |
|---|---|
| Rendering environment | Android emulator `HerKeys_Runtime` (Pixel 8 Pro profile, API 37, software GPU `swiftshader_indirect`) running **Expo Go 57.0.9**, JS served by Metro from the design worktree (`Her-Keys-UI02`) |
| Entry | Router-free evidence entry (`scripts-dev/ui02-evidence/evidence-entry.js`, temporary, never committed) — the baseline app root cannot mount in this Expo Go because `expo-notifications 57.0.23` needs the native `ExpoTopicSubscriptionModule` that Expo Go 57.0.9 does not ship (independent of the redesign) |
| Source | Branch `design/hk-fe-ui-02-foundation`; captures taken on top of `a50bc25` (D05b) plus the uncommitted changes later committed in D06 (consent-view/harness inset fix, scroll wrapper on Welcome and Premium introduction). Final Phase 1 SHA is in the report. |
| Viewport | 1344×2992 px at 480 dpi ≈ **420×934 dp**; compact captures 640×1136 px at 320 dpi = **320×568 dp** |
| Platform represented | **Android rendering only.** `04-account-selection-ios` shows the iOS provider *order* (Apple first) rendered on Android — it is not an iOS render. No iOS capture exists. |
| Interactivity | Static: each capture is one fixed state. Provider/auth buttons are inert in the harness. Real interactions are exercised by the component and flow tests (`tests/welcome*.test.mjs`, `tests/design-system/**`). |
| Expo Go chrome | The grey gear (and "Tools" pill) at top-right is Expo Go's own developer menu button, not the app. |

## Captured (30 images in `android-emulator-expo-go/`)

| # | File | Screen / state | Viewport |
|---|---|---|---|
| 01 | `01-tokens.png` | Palette and typography guide | 420 dp |
| 02 | `02-welcome.png` | Welcome (curve + sprig, key badge, pinned headline, both decisions) | 420 dp |
| 03 | `03-premium-intro.png` | Premium introduction (Luxury Black badge, three real Stage 1 benefit rows, Continue Free, no price) | 420 dp |
| 04 | `04-account-selection-ios.png` | Account selection, iOS provider order | 420 dp |
| 05 | `05-account-selection-android.png` | Account selection, Android provider order | 420 dp |
| 06 | `06-signup.png` | Email signup (disabled primary shown) | 420 dp |
| 07 | `07-signin.png` | Email sign-in | 420 dp |
| 08 | `08-invalid-credentials.png` | Sign-in — invalid credentials | 420 dp |
| 09 | `09-connection-error.png` | Sign-in — connection error | 420 dp |
| 10 | `10-provider-unavailable.png` | Provider unavailable | 420 dp |
| 11 | `11-confirm-email.png` | Signup — confirm email | 420 dp |
| 12 | `12-forgot-password.png` | Forgot password (recovery request) | 420 dp |
| 13 | `13-otp.png` | OTP verification | 420 dp |
| 14 | `14-provider-pending-disabled.png` | Provider in flight (loading + disabled controls) | 420 dp |
| 15 | `15-session-restore-degraded.png` | Auth-degraded / reconnect | 420 dp |
| 16 | `16-account-conflict.png` | Account conflict | 420 dp |
| 17 | `17-consent-legal.png` | Legal + AI consent (unselected) | 420 dp |
| 18 | `18-consent-legal-filled.png` | Legal + AI consent (all selected) | 420 dp |
| 19 | `19-consent-recovery-error.png` | Consent verification error / recovery | 420 dp |
| 20 | `20-permissions.png` | Optional permissions | 420 dp |
| 21–23 | `21-audit-goals.png`, `22-audit-strengths.png`, `23-audit-struggles.png` | Life Systems Audit steps 1–3 (real option data) | 420 dp |
| 24 | `24-audit-talk-it-out.png` | Life Systems Audit step 4 (Talk It Out introduction) | 420 dp |
| 25 | `25-components.png` | Shared component states (buttons, fields, chips, tags, notices, cards) | 420 dp |
| 26 | `26-ai-language.png` | AI language: label + shape + icon | 420 dp |
| 27 | `27-assets.png` | Icon, badge and botanical asset sheet | 420 dp |
| 28–30 | `28-compact-320dp-welcome.png`, `29-compact-320dp-signup.png`, `30-compact-320dp-premium-intro.png` | Compact-width states: decoration suppressed, body scrolls, footer and disclosure visible | **320×568 dp** |

Capture QA: every file was checked for an OS "not responding" dialog and for the launcher being on screen; several captures that
contained one were retaken (02, 05, 08, 15 and the compact set; 04 was retaken as a precaution). A software-GPU emulator is slow; **no timing or frame-rate
claim is made from these captures.**

## NOT captured — visual verification pending

| Screen | Why it cannot be rendered here | What covers it instead |
|---|---|---|
| **Life Operating Profile** (`app/onboarding/profile.tsx`) | Route-bound: it reads the onboarding context and is pinned by source tests, so it was not extracted into a presentational component (the pin would break) | `tests/onboardingLayout.test.mjs` (layout contract), token/contrast tests; presentation is dashed-outline + `understood` mark. **Structural correctness only — appearance on a device is unverified.** |
| **Final Premium decision** (`app/onboarding/plus.tsx`) | Route-bound and hook-heavy (RevenueCat, Premium state, onboarding completion); extraction would change pinned purchase-sequencing sources | `tests/premiumSequencing.test.mjs`, `tests/premiumFeedback.test.mjs`. **Structural correctness only — appearance on a device is unverified.** |
| iOS (any screen) | No iOS device or simulator on this host | — |
| Native Android build | No EAS/APK build is authorised in this workstream | — |
| Dark-mode / system-UI mismatches | Needs a device with a dark system preference | Listed in the spec §8, not verified |

`ANDROID_NATIVE_VISUAL_CERTIFICATION=NOT_RUN` · `IOS_NATIVE_VISUAL_CERTIFICATION=NOT_RUN`

## Compact-width findings (320×568 dp)

- Decoration (sprig, wave, header badges) is correctly **absent** below 360 dp.
- Defect found and fixed in this pass: the Premium introduction's body was a non-scrolling centred column, so on a 568 dp screen its
  title was pushed off the top. Welcome and Premium introduction bodies now scroll (`flexGrow` + centred), with the footer
  (Select Premium / Continue Free / disclosure) pinned and always visible (`30-compact-320dp-premium-intro.png`).
- Residual: on 568 dp only ~270 dp remains for the scrolling Premium body; acceptable, but a candidate for density tuning (OD-UI02-04).

`31-compact-320dp-consent` (consent at 320 dp) was attempted; the emulator showed its launcher, the capture was discarded and is
**NOT RUN**. Consent at compact width is covered structurally only (a scrolling view with safe-area insets, pinned by
`tests/onboardingLayout.test.mjs`).
