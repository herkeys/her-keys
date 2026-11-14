# Her Keys AI V2 — iOS / iPadOS Hostile Audit, Integration Certification and EAS Build Readiness

Date: 2026-11-13 · Auditor: Claude (iOS Release Manager / hostile auditor role) · Host: Windows 11 (no macOS, Xcode, simulator, iPhone or iPad)

| | |
|---|---|
| Candidate branch | `integration/v2-autonomous-upgrade-20261112` |
| Original candidate SHA | `9b75343917369f43c2fa9304e8a45f35dbad54b9` (PR #55 merge; identical to the "most recently verified integration SHA") |
| Audit / repair branch | `audit/ios-ipad-v2-eas-readiness-20261113` (worktree `C:\Users\jsmit\Her-Keys-IOS02`) |
| Final source SHA | `f0a7a3fc55f847fcdfcf4a4854ec7b0916220392` (repairs) — this report is committed on top of it |
| package-lock.json SHA-256 | `3092e6ca7ff8a3c028881be0d8aad819e9fcfaf1fa16e0a302611efae6d6aeb9` (unchanged by the audit) |
| Build profile assessed | EAS `production` (Production backend `npykvnxnehlsdlbumzwk`, RevenueCat `native`, data mode `empty`, consent gate `true`) |
| Toolchain resolved | Node 24.14.0, npm 11.9.0, Expo CLI 57.0.34, `expo` 57.0.33, `expo-router` 57.0.31, `react-native` 0.86.3, `expo-apple-authentication` 57.0.2, `react-native-purchases` 10.9.1 |

Evidence labels: **PASS(src)** source/test evidence · **PASS(live)** read from the live Supabase projects in this pass · **NOT RUN** needs a device, simulator or store · **UNVERIFIED** could not be read with the access available · **EXTERNAL** owned outside the repository.

---

## Final verdicts (summary)

| Verdict | Result |
|---|---|
| **iPhone EAS BUILD READINESS** | **FAIL** — one release-control blocker (REL-01), no code or native-configuration defect |
| **iPad EAS BUILD READINESS** | **FAIL** — the same REL-01; iPad source and native configuration pass at `f0a7a3fc55f847fcdfcf4a4854ec7b0916220392` |
| **COMBINED UNIVERSAL iOS EAS BUILD READINESS** | **FAIL** — REL-01 only |
| **iPad OPTIMIZATION** | **PARTIAL** — no confirmed blocking iPad defect remains; no visual or device iPad evidence was possible from this host |
| **Apple App Store submission readiness** (separate gate) | **NOT READY** — see §11 |

**Why FAIL and not PASS.** Every engineering gate passes: typecheck, dependency resolution, `expo-doctor` 21/21, `expo install --check`, release identity, iOS development and production-mode (Hermes) exports, 45 mandatory/targeted suites and the full suite, live backend parity and the deletion-guard regression check. The one failure is the repository's own pre-build release gate: `npm run release:preflight` refuses the candidate because `scripts/verify-release-identity.mjs` authorizes only `build/02-gemini-integration` and `integration/build2-candidate-20261020` as release branches, and prints "Do not build." The V2 candidate branch is not on that list, so by the repository's own policy the intended candidate is not authorized for an EAS store build. That list is shared release policy (it gates Android too), so the audit did not change it.

**Exact path to PASS (no code change needed):**
1. Owner authorizes the release branch: add `integration/v2-autonomous-upgrade-20261112` to `RELEASE_BRANCHES` (one line, the same shape as PR #44).
2. Merge this audit branch into the candidate branch (iPad configuration and the iPad layout repairs; required for the universal scope). Not merged by this audit.
3. Re-run `npm run release:preflight` on the pushed merge SHA with the `production` EAS environment loaded (`eas env:pull production` or the build environment). The audit confirmed every non-provenance check it contains already passes.
4. Then a real EAS iOS `production` build is authorized.

### Post-audit update — REL-01 resolved in source (2026-11-13)

- **Step 1 done.** The owner authorized the V2 branch. Commit `c1111fc09586a3afd7d551c964595779bfc16f09` adds the exact literal `integration/v2-autonomous-upgrade-20261112` to `RELEASE_BRANCHES`. Tests pin the new list and still refuse near-miss names, pattern entries and the audit branch. The boundary scan registers the change. Full suite at `c1111fc`: **5,681/5,681**.
- **Preflight evidence.** `eas env:exec production "npm run release:preflight"` at `c1111fc` (pushed, `REMOTE_SOURCE_SHA` matches) passes identity, Production backend target, consent gate, data mode, clean tree, upstream and live `ls-remote`. The only refusal is the branch name `audit/ios-ipad-v2-eas-readiness-20261113`, which is the intended behavior for an audit branch.
- **Step 2 pending.** The changes are in [herkeys/her-keys#57](https://github.com/herkeys/her-keys/pull/57) into `integration/v2-autonomous-upgrade-20261112`. It is not merged.
- **Verdict once merged.** After the merge and a passing preflight on the V2 branch at the merge SHA (step 3), all three EAS readiness verdicts become **PASS** for that exact SHA. Nothing in this audit is left blocking an EAS build. Every device, store and external item in §09–§11 and §SH remains open.

---

## 01 — Executive hostile audit

**Source control.** The candidate is the tip of `integration/v2-autonomous-upgrade-20261112` and equals the verified SHA `9b75343`. There are **no open PRs** in `herkeys/her-keys`; PRs #45–#55 are merged into the candidate; every sibling V2 branch (`claude/v2-*`, `codex/v2-*`) is 0 commits ahead of it. The historical checkpoint `2e0bcfb` (PR #53 merge) is an ancestor, 6 commits behind (PR #54 guard repair, PR #55 Calendar callback/client-ID repair and their docs). No unmerged change is required for the release except this audit's iPad work.

**Overall.** The iPhone application is technically build-ready. The audit found no iOS P0–P3 code defect. It found one configuration gap against the new product scope (iPad support off — repaired), one iPad presentation issue (repaired), one release-control blocker (REL-01), and three shared/external problems that do not affect building but do affect store certification or public release:

| Highest risks | Gate affected |
|---|---|
| REL-01 release branch not authorized by the repository's preflight | EAS build (process gate) |
| EXT-WEB-01 the account-recovery page `https://herkeys.app/account/restore` returns **404**; both the in-app "Recovery and support" button and every recovery email link there | Public release (and App Store review if exercised) |
| BE-RC-01 the RevenueCat cross-environment guard (RC-V2-ENV-01, P1) is deployed to Staging only; Production still runs the 2026-10-21 Premium functions | Before Production checkout is enabled / any purchase certification |
| OPS-PREM-01 `checkout_enabled=false` in Production: Premium cannot be bought | App Store submission decision (IAP review) |
| No native evidence of any kind (no Mac, no device) | TestFlight acceptance |

---

## 02 — Full feature activation matrix

Columns: Impl = implemented · Integ = integrated into navigation/state · Activ = switched on for the production profile · Prod = production-compatible contract · UF = user-facing · Verified = evidence in this pass.

| # | Feature | Impl | Integ | Activ | Prod | UF | Verified | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Welcome + onboarding | Y | Y (`index`, `onboarding/*`, route guards) | Y | Y | Y | PASS(src) `codex.onboardingUncertainty` 4/4, `onboardingLayout` 5/5 | Device NOT RUN |
| 2 | Account registration | Y | Y | Y | Y | Y | PASS(src) `welcomePremiumFlow` 27/27 | Device NOT RUN |
| 3 | Apple Sign-In | Y (`appleProvider.ts`, nonce SHA-256→Apple / raw→Supabase) | Y (iOS only) | Y (`usesAppleSignIn`, entitlement `Default`) | Y (`signInWithIdToken`; `capture-apple-credential` v6 ACTIVE in Prod) | Y | PASS(src) `ios/appleNonce` 13/13 | Supabase Apple client-ID list UNVERIFIED; device NOT RUN |
| 4 | Google Sign-In | Y (Supabase OAuth + `ASWebAuthenticationSession`) | Y | Y (no client IDs needed in the app — none referenced) | Y | Y | PASS(src) | Device NOT RUN |
| 5 | Email/password | Y | Y | Y | Y | Y | PASS(src); live login PASS per Codex 11-13 handoff | — |
| 6 | Password recovery (numeric code) | Y | Y | Y | Y | Y | PASS(src) `codex.recoveryJourney`; live OTP PASS per PR #49 | Template wording not re-read (EXTERNAL) |
| 7 | Legal acceptance | Y | Y (mandatory consent gate) | Y (`V2_CONSENT_GATE=true` in production EAS env) | Y | Y | PASS(src) `productionConsentBuildProfile` 5/5, `consentLegalLinks` 4/4; legal PDFs **200** live | — |
| 8 | AI Data Processing consent | Y | Y | Y | Y (`ai_policy_version=ai-data-processing-initial-v1` both envs, PASS(live)) | Y | PASS(src) `codex.aiConsentManagement` 7/7, `aiConsentHandler` 23/23 | Names Google Gemini (5.1.2(i) disclosure present) |
| 9 | Permissions and preferences | Y | Y | Y | n/a | Y | Purpose strings present (camera, photos, location when-in-use, motion, Face ID) | OS prompts NOT RUN |
| 10 | Today / Daily Load | Y | Y | Y | Y | Y | PASS(src) `v2up.today` 30/30, `v2up.integration.today` 10/10 | — |
| 11 | Talk It Out AI | Y | Y (AI tab, modal, onboarding) | Y | Y — `herkeys-ai` Prod v15 = Staging v23 bundle `3d2181e4…` PASS(live), `verify_jwt=true` | Y | PASS(src) `talkItOutAi` 12/12, `talkItOutAccountFence` 14/14, `aiClientAccountBoundary` 11/11 | Real Gemini turn NOT RUN |
| 12 | Action Map / capture → Life Inbox | Y | Y | Y | local | Y | PASS(src) `codex.captureCancellation`; full suite | — |
| 13 | Calendar (Her Keys) | Y | Y (tab) | Y | local | Y | PASS(src) full suite (calendar* suites) | — |
| 14 | Google Calendar | Y | Y | Y | Y — `calendar-oauth` Prod v14 = Staging v17 `b942d261…`; `calendar-data` both `1a19d3bc…` PASS(live); emergency pause superseded | Y | PASS(src) `calendarConnection` 24/24, `calendarOAuthBinding` 18/18, `calendarHardening` 15/15 | OAuth + events device NOT RUN (deferred by mandate) |
| 15 | Kids | Y | Y | Y | Y | Y | PASS(src) full suite | — |
| 16 | Home | Y | Y | Y | Y | Y | PASS(src) | — |
| 17 | Co-parenting | Y | Y | Y | Y | Y | PASS(src) | — |
| 18 | Meals | Y | Y | Y | Y | Y | PASS(src) `meals/boundary` 13/13 | — |
| 19 | Money | Y | Y | Y | Y | Y | PASS(src) | — |
| 20 | Work and Career | Y | Y | Y | Y | Y | PASS(src) | — |
| 21 | Me / Rebuild | Y | Y | Y | Y | Y | PASS(src) | — |
| 22 | Life Admin / Documents (+ on-device OCR) | Y | Y | Y | Y | Y | PASS(src); `expo-image-picker` presents PHPicker as a popover on iPad (library source verified) | Camera/photo device NOT RUN |
| 23 | People | Y | Y | Y | Y | Y | PASS(src) | — |
| 24 | Smart Inbox | Y | Y | Y (released per manifest) | Y — `smart-inbox-extract` bundle `924cad23…` identical both envs PASS(live) | Y | PASS(src) | — |
| 25 | Premium | Y | Y | **Partially**: `premium_enabled=true`, `checkout_enabled=false` both envs PASS(live) | Prod Premium functions **older** than Staging (BE-RC-01) | Y (Premium home, locked/unavailable copy) | PASS(src) `premiumLaunchState`, `premiumCheckoutSwitch`, `v2up.premiumStaleState` 17/17 | Purchase not offered in Production |
| 26 | Subscription purchase / restore | Y (RevenueCat UI paywall, Restore control in Your Account) | Y | Purchase OFF; Restore available | iOS SDK key `appl_…` set in production EAS env | Y | PASS(src) `platformParity/*` (restoreControl 8/8, restoreIdentity 7/7, purchaseReadiness 16/16) | StoreKit NOT RUN |
| 27 | Account deletion + recovery | Y (OTP re-verification, 30-day recovery) | Y | Y (functions ACTIVE both envs) | Deletion: Y. **Recovery: broken** — web page 404 (EXT-WEB-01) | Y | PASS(src) `deletionGateCovering` 9/9; guard PASS(live) | Worker dry-run state UNVERIFIED |
| 28 | AI response reporting | Y | Y | Y | Y | Y | PASS(src) `aiResponseReporting` 9/9, `aiReportingRuntime` 9/9 | Live report NOT RUN |
| 29 | Offline + sync | Y | Y | Y | Y | Y (offline notices) | PASS(src) full suite | Airplane-mode NOT RUN |
| + | Weather (device location, coarse) | Y | Y | Y | `weather-context` deployed both envs | Y | PASS(src) | Permission prompt NOT RUN |
| + | Local reminders | Y | Y | Y | n/a | Y | PASS(src) | Delivery NOT RUN |
| + | Appearance (Light/Dark automatic) | Y | Y | Y (`UIUserInterfaceStyle=Automatic`) | n/a | Y | PASS(src) design-system suites | Rendering NOT RUN |
| + | Internal tools / design gallery | Y | guarded | **Off** (no `EXPO_PUBLIC_HERKEYS_INTERNAL_TOOLS` in production env) | n/a | No | PASS(src) | Correctly not shipped to users |

**Advertising check.** No copy promises a feature that is switched off, with two exceptions to resolve before review: (a) Premium is presented while checkout is off in Production (OPS-PREM-01); (b) the deletion gate says "Use your recovery email to restore your account" while the recovery page does not exist (EXT-WEB-01).

---

## 03 — iOS defect ledger

### Repaired P0–P3
| ID | Sev | Ownership | Summary |
|---|---|---|---|
| IOS-FIX-001 | P2 | IOS-ONLY (config) | `ios.supportsTablet:false` contradicted the universal iPhone + iPad release scope: iPad users would have received the iPhone app in compatibility mode, and no iPad target existed. Enabled; iPad gets all four orientations and no full-screen opt-out; iPhone unchanged. |

### Remaining P0–P3
None that is iOS-only. REL-01 (below, shared release control) is the only build-gate item.

### Repaired P4–P10
| ID | Sev | Ownership | Summary |
|---|---|---|---|
| IOS-FIX-002 | P6 (UNPOLISHED) | IOS-ONLY (iPad idiom only) | On iPad, Talk It Out (AI tab + modal), the non-scrolling account/welcome/deletion shells and every bottom sheet stretched to the window width (up to 1,366pt). Capped at the existing 680pt content width and centered, on iPad only. |

### Remaining lower-priority (iOS)
| ID | Sev | Class | Finding | Disposition |
|---|---|---|---|---|
| IOS-OBS-01 | P5 | UNCONFIRMED | `TalkItOutView` uses a fixed iOS `keyboardVerticalOffset` of 90 (phone-calibrated). On an iPad page sheet, Stage Manager window or floating/split keyboard the composer may sit too high or be partly covered. No runtime evidence. | Not repaired (speculative without a device). Device test D-03. |
| IOS-OBS-02 | P6 | IOS-ONLY | Apple sign-in awaits `capture-apple-credential` before completing; a stalled function delays sign-in by up to the 90s function timeout (failure is already swallowed). | Documented; function ACTIVE in both envs. |
| IOS-OBS-03 | P5 | IOS-ONLY / submission risk | The "Continue with Apple" control is a custom button on the paper/dark surface, not an Apple-provided or black/white button (HIG). | App Store risk ASR-07; owner design decision. |
| IPAD-UP-01 | P7 | UNPOLISHED | Sheet scroll areas use fixed `maxHeight` 520–600pt; in a short Stage Manager window the sheet top clips (content still scrolls; actions are inside the scroll). | Deferred; full-screen iPad heights (≥744pt) fit. |

### Shared defects (not repaired — handoff in §SH below)
REL-01, EXT-WEB-01, BE-RC-01, SH-A11Y-01, HK-V2ACT-LINK-02 (existing).

### External / operator
OPS-PREM-01 checkout off · RevenueCat App Store Connect / product / paywall state UNVERIFIED · Supabase Apple provider client IDs UNVERIFIED · deletion worker mode UNVERIFIED · Apple Developer capabilities/profiles · App Store Connect metadata (see §11).

### False positives / closed on evidence
| Claim | Evidence | Result |
|---|---|---|
| V2UP-DB-GUARD-01 still broken | Both DBs: `private.refuse_pending_provider_write` SECURITY DEFINER, `search_path=""`, no `service_role` USAGE on `private`, no anon/authenticated EXECUTE; 10 guard triggers enabled | Repaired, no regression |
| Talk It Out Production promotion missing | Prod v15 / Staging v23 same hash | Closed |
| Calendar emergency pause / OAuth 500 / invalid client | Prod `calendar-oauth` hash = Staging permanent-flow hash | Closed as historical |
| Google client IDs missing from production EAS env | No source reference to `EXPO_PUBLIC_GOOGLE_*`; Google sign-in is Supabase OAuth | Not a defect |
| `expo-image-picker` crashes on iPad (popover) | Module sets `popoverPresentationController` for `.pad` | Not applicable |
| RN `Modal` portrait-only on iPad | RN 0.86 defaults an unset mask to `UIInterfaceOrientationMaskAll` on iPad | Not applicable |
| `Dimensions.get` stale sizes | No `Dimensions.get` in app/src; the three measurement users use `useWindowDimensions` | PASS |

---

## 04 — Repair evidence report

### IOS-FIX-001 — Universal device family (iPhone + iPad)
- **Severity / category / ownership:** P2 · native configuration · IOS-ONLY (`ios.*` key; Android reads no part of it)
- **Feature:** all (device scope) · **Location:** `app.json:11`
- **Observed failure:** `"supportsTablet": false` → `TARGETED_DEVICE_FAMILY=1`; on iPad the app would run as a scaled iPhone app; no `UISupportedInterfaceOrientations~ipad`.
- **Evidence:** resolved config (`expo config --type introspect`) and `@expo/config-plugins` `DeviceFamily`/`RequiresFullScreen`/`Orientation` source.
- **Root cause:** the release scope changed to universal (Addendum A); the configuration predates it.
- **Change:** `"supportsTablet": true`. Nothing else: `orientation` stays `portrait` (iPhone), no `isTabletOnly`, no `requireFullScreen`.
- **Native consequences (resolved):** `TARGETED_DEVICE_FAMILY="1,2"`; `UISupportedInterfaceOrientations~ipad` = Portrait, PortraitUpsideDown, LandscapeLeft, LandscapeRight; `UIRequiresFullScreen=false`; iPhone `UISupportedInterfaceOrientations` unchanged (Portrait, PortraitUpsideDown). Required by Apple for resizable iPad scenes (TN3192; `UIRequiresFullScreen` is deprecated and ignored when built with the iOS 27 SDK). See `### Resolved iOS configuration at f0a7a3f (excerpt of `npx expo config --type introspect`)

```json
{
  "ios.supportsTablet": true,
  "orientation": "portrait",
  "UISupportedInterfaceOrientations": [
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationPortraitUpsideDown"
  ],
  "UISupportedInterfaceOrientations~ipad": [
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationPortraitUpsideDown",
    "UIInterfaceOrientationLandscapeLeft",
    "UIInterfaceOrientationLandscapeRight"
  ],
  "UIRequiresFullScreen": false,
  "UILaunchStoryboardName": "SplashScreen",
  "UIUserInterfaceStyle": "Automatic",
  "bundleIdentifier": "com.herkeys.app",
  "entitlements": {
    "com.apple.developer.applesignin": [
      "Default"
    ],
    "aps-environment": "development"
  }
}
```

Introspection uses Expo's stub base Info.plist (for example `NSAllowsArbitraryLoads`, `armv7`), so only plugin-written keys are evidence; the real `Info.plist` must be read from the built IPA (D-12).` below.
- **Justification:** a universal release needs an iPad target; locking iPad to portrait or full screen would fail ITMS-90474 / TN3192.
- **Regression risk:** iPad now renders in landscape and resizable windows (covered by IOS-FIX-002 and the deferred plan). iPhone: none (same plist keys).
- **Android impact:** none — `ios.supportsTablet` is read only by the iOS config plugins; `android.*` untouched; release identity PASS.
- **Verification:** `tests/ios/ipadSupport.test.mjs` (6 config tests); mutants M1–M4 killed; `expo-doctor` and `install --check` re-run (§07).
- **iPad device/window class:** all iPads · **Before:** iPhone-only target · **After:** universal target (resolved config) · **Orientation impact:** iPad all four; iPhone unchanged · **Resizing impact:** iPad scenes resizable · **Accessibility impact:** none · **Runtime verification:** SOURCE REPAIRED (no simulator) · **Commit:** `f0a7a3fc55f847fcdfcf4a4854ec7b0916220392` · **Disposition:** Fixed / source-verified; device verification deferred (D-01, D-11).

### IOS-FIX-002 — iPad readable column
- **Severity / category / ownership:** P6 · UNPOLISHED layout · IOS-ONLY (iPad idiom)
- **Feature:** Talk It Out, welcome/auth, Your Account (sign-in, Premium, Restore, privacy/deletion), account conflict, every `Sheet`/`ConfirmationSheet`
- **Location:** new `src/design/readableColumn.ts`; `src/design/components/Screen.tsx` (non-scroll body), `src/design/components/Sheet.tsx` (sheet card), `app/(app)/ai.tsx`, `app/talk-it-out.tsx`
- **Observed failure:** scrolling screens already cap content at `sizing.contentWidth` (680pt) on every platform, but four surfaces did not: on a 13-inch iPad in landscape, Talk It Out bubbles (88% of width) would run ~1,200pt wide, and provider/account buttons and sheet cards ~1,300pt. Usable, so UNPOLISHED, but Addendum A7.2 forbids excessively wide conversation text.
- **Evidence:** source (`Screen.tsx` caps only `scrollContent`; `ai.tsx`/`talk-it-out.tsx` have no cap; `Sheet` card is full width); iPad window widths (1,024–1,366pt).
- **Root cause:** layouts were designed for portrait phones; the cap was applied only in the scrolling branch.
- **Change:** `iPadReadableColumn()` returns `{width:'100%', maxWidth:680, alignSelf:'center'}` only when `Platform.OS==='ios' && Platform.isPad===true`, else `null`; each caller adds it only when non-null, so iPhone and Android style arrays are byte-for-byte what they were. It is a cap, not a width, so narrow Split View/Stage Manager windows keep full width. No token changed.
- **Regression risk:** low; iPad only. Keyboard math in `TalkItOutView` is vertical and unaffected by a width cap.
- **Android impact:** none by construction (`Platform.isPad` is undefined on Android; the predicate also requires `OS==='ios'`); proven by test (Android render identical) and mutant M5.
- **iPhone preservation:** iPhone `isPad` is false → identical arrays (test + mutant M10). REGRESSION VERIFIED at source level only.
- **Verification:** 8 tests in `tests/ios/ipadSupport.test.mjs`; mutants M5–M10 killed; full suite re-run (§07).
- **iPad device/window class:** all; most visible on 11–13-inch landscape · **Before evidence:** source only · **After evidence:** source/render-tree test only · **Orientation/resizing impact:** cap re-evaluates per render (`maxWidth`, no measurement) · **Accessibility impact:** shorter line length; no text-size change · **Runtime verification:** SOURCE REPAIRED, not VISUALLY VERIFIED · **Commit:** `f0a7a3fc55f847fcdfcf4a4854ec7b0916220392` · **Disposition:** Fixed / source-verified.

### Mutation evidence (iPad suite)
10/10 killed: M1 baseline `app.json` (3 fails) · M2 `requireFullScreen:true` (2) · M3 `isTabletOnly:true` (2) · M4 iPhone orientation unlocked (1) · M5 predicate ignores OS — Android leak (1) · M6 column on every device (3) · M7 baseline `Screen.tsx` (2) · M8 baseline `Sheet.tsx` (2) · M9 baseline AI tab (2) · M10 null entry on iPhone/Android arrays (2).

---

## 05 — Staging / Production integration report (read-only, live, 2026-11-13)

| Integration | Staging `fhhudicklmpofuzkxeqe` | Production `npykvnxnehlsdlbumzwk` | Classification |
|---|---|---|---|
| `herkeys-ai` | v23 `3d2181e4…` jwt=true | v15 `3d2181e4…` jwt=true | Verified compatible (deployment); live Gemini turn not run → source-compatible |
| `calendar-oauth` | v17 `b942d261…` jwt=false (own auth) | v14 `b942d261…` | Verified compatible (deployment); OAuth device run deferred |
| `calendar-data` | v16 `1a19d3bc…` | v12 `1a19d3bc…` | Verified compatible (deployment) |
| `smart-inbox-extract` | v8 `924cad23…` | v7 `924cad23…` | Verified compatible |
| `capture-apple-credential` | v10 `032f9675…` | v6 `032f9675…` | Verified compatible |
| Deletion set (`request-account-deletion`, `deletion-status`, `restore-account`, `resend-restoration-email`, `begin-web-deletion`, `process-`/`monitor-account-deletions`, `expire-account-deletion-proofs`) | identical hashes | identical hashes | Verified compatible (deployment); worker dry-run mode UNVERIFIED (secret/env, not readable) |
| `premium-gate` / `premium-reconcile` / `revenuecat-webhook` / `premium-ops` | v9/v10/v11/v11 (RC-V2-ENV-01 fence, 2026-11-13) | v7 each (2026-10-21) | **Partially verified — Production behind** (BE-RC-01). No client contract change (handoff: "exports and response status unions remain unchanged"), so the iOS build is compatible with both; the Production server lacks the cross-environment guard |
| `weather-context` | v16 `b3945bfa…` | v12 `31cda8f3…` | Different bundles; not re-diffed in this pass → source-compatible, not functionally tested |
| `herkeys-welcome-email` | v8 `78a70fe5…` | v10 `b62cd7dc…` | Different bundles (Production newer); not re-diffed → external validation |
| Premium runtime config | premium on, checkout **off**, test checkout off, fixtures off, webhook on | premium on, checkout **off**, test checkout off, fixtures off, webhook on | Functional parity; purchasing disabled in both |
| Deletion guard (V2UP-DB-GUARD-01) | SECURITY DEFINER, 10 triggers enabled | same | Verified (no regression) |
| Latest applied migration | `20261113211130` | `20261113211418` | Both include the guard migration |
| EAS `production` env (names only) | — | `SUPABASE_URL` host `npykvnxnehlsdlbumzwk.supabase.co`, publishable key set, `HERKEYS_BACKEND`, `DATA_MODE`, `V2_CONSENT_GATE`, RevenueCat iOS `appl_` + Android `goog_` keys | Required build configuration present (values not printed) |
| Legal / support URLs | — | Terms PDF 200, Privacy PDF 200, `herkeys.app/privacy` 200, `/support` 200, `/delete-account` 200, **`/account/restore` 404** | EXT-WEB-01 |
| Supabase Auth Apple provider (client IDs incl. `com.herkeys.app`), recovery email template | — | — | UNVERIFIED (no tool exposes Auth provider config) — operator check |

Nothing was deployed, migrated, toggled or written in either environment.

---

## 06 — Apple platform compliance report

| Item | Evidence | Status |
|---|---|---|
| Bundle ID / team | `com.herkeys.app`, EAS project `7b25f8fe…`, owner `ams2dad`; release identity PASS | PASS(src); Apple team/profile UNVERIFIED (no App Store Connect access) |
| Device family | `1,2` after IOS-FIX-001 | PASS(src) |
| Orientations | iPhone portrait; iPad all four; `UIRequiresFullScreen=false` | PASS(src) |
| Launch screen | `UILaunchStoryboardName=SplashScreen` (required for iOS 27 SDK submissions, TN3208) | PASS(src) |
| Sign in with Apple | `usesAppleSignIn`, entitlement `com.apple.developer.applesignin=[Default]` | PASS(src); capability on App ID must sync on first build |
| Push entitlement | `aps-environment` from `expo-notifications` (only local notifications used) | Harmless; capability sync on first build |
| Encryption | `ITSAppUsesNonExemptEncryption=false` | PASS(src) |
| Purpose strings | Camera, Photo Library, Location When In Use, Motion, Face ID — all present, specific, no "Always" location | PASS(src); motion string describes an unused capability (low risk) |
| Privacy manifests | RN core and AsyncStorage ship `PrivacyInfo.xcprivacy`; 12 manifests in node_modules; aggregated manifest is produced at prebuild | NOT RUN — Windows cannot prebuild iOS; inspect the IPA's `PrivacyInfo.xcprivacy` (D-12) |
| ATS | The introspected `NSAllowsArbitraryLoads=true` is Expo's introspection stub, not prebuild output | UNVERIFIED — inspect the built `Info.plist` (D-12) |
| Account deletion (5.1.1(v)) | In-app: Your Account → Privacy & Data → Delete Account | PASS(src); recovery path broken (EXT-WEB-01) |
| Third-party AI disclosure (5.1.2(i)) | Consent names "external AI providers, including Google Gemini" and requires affirmative consent before any AI request (client and server) | PASS(src) |
| Subscriptions (3.1.2) | RevenueCat paywall shows store price; Terms/Privacy links in app; Restore in Your Account; deletion copy says store subscriptions are not cancelled | PASS(src); checkout off (OPS-PREM-01); StoreKit NOT RUN |
| Minimum OS / SDK | Set by Expo SDK 57 template and the EAS image | UNVERIFIED on this host |

Gates are separated in §10.

---

## 07 — Test execution report

All runs on Windows 11, Node 24.14.0, serially. "Baseline" = candidate `9b75343` (clean tree); "post-repair" = `f0a7a3fc55f847fcdfcf4a4854ec7b0916220392`.

| Check | Command | Baseline | Post-repair |
|---|---|---|---|
| TypeScript | `npm run typecheck` | PASS (exit 0) | PASS (exit 0) |
| Release identity | `npm run verify:release-identity` | PASS (`RELEASE_IDENTITY=PASS`) | PASS |
| Release preflight | `npm run release:preflight` | **FAIL** — branch not authorized; no upstream (audit branch, before push); consent/backend env not loaded locally | not re-run (same policy outcome; see REL-01) |
| Expo doctor | `npx expo-doctor` | PASS 21/21 | PASS 21/21 |
| Dependency check | `npx expo install --check` | PASS ("Dependencies are up to date") | PASS |
| Lockfile | `npm ci` | PASS (591 packages, lock unchanged) | unchanged |
| iOS export (dev) | `npx expo export --dev --platform ios --no-bytecode` (flags supported by CLI 57.0.34) | PASS — 6.6 MB bundle; module 0 = `index.js`; `installWebLinkGuard`, `expo-router/entry`, `redirectSystemPath`, `isUnparseableLink` present | PASS — 6.6 MB; `iPadReadableColumn` present in the bundle |
| iOS export (production mode) | `npx expo export --platform ios --source-maps` with production profile flags | PASS — Hermes bytecode 7 MB + map | PASS — Hermes bytecode 7 MB |
| Mandatory + targeted suites | 45 suites (list below) | **502/502 pass**, 0 fail, 0 skipped | 47 suites (45 + `ios/ipadSupport` 14 + design-system `primitives` 29): 544/545 on the first run — the one failure was `meals/boundary` refusing the two new files until the audit lane was registered; after registration `meals/boundary` 13/13, `ios/nativeConfig` 14/14 (pin moved from iPhone-only to universal), `ios/ipadSupport` 14/14 |
| New iPad suite | `tests/ios/ipadSupport.test.mjs` | n/a | 14/14; 10/10 mutants killed |
| Full suite | `npm test` | **5,667/5,667 pass**, 1,128 suites, 0 fail/cancelled/skipped/todo (158 s) | **5,681/5,681 pass**, 1,130 suites, 0 fail/cancelled/skipped/todo (at `f0a7a3f`, committed tree) |

Targeted suites (baseline counts): v2up.today 30 · v2up.integration.today 10 · v2up.premiumStaleState 17 · v2up.e.announce 8 · v2up.e.consentSummary 10 · v2up.e.nativeA11y 14 · codex.aiConsentManagement 7 · codex.recoveryJourney 1 · codex.linkEntryPoints 7 · codex.captureCancellation 1 · codex.onboardingUncertainty 4 · codex.statusAnnouncements 5 · meals/boundary **13/13** · platformParity: registryGuard 17, accountAccess 26, restoreControl 8, persistentRestore 6, purchaseReadiness 16, restoreIdentity 7, returningUserCopy 3, systemLinks 15, androidButtonTarget 3, androidVersionCode 1 · ios/appleNonce 13 · ios/keyboardInsets 14 · v2up.deepLinkHardening 22 · aiClientAccountBoundary 11 · aiResponseReporting 9 · aiReportingRuntime 9 · aiConsentHandler 23 · talkItOutAi 12 · talkItOutAccountFence 14 · claude.v2act.calendarConnection 24 · calendarOAuthBinding 18 · calendarMitigation 9 · consentLegalLinks 4 · calendarHardening 15 · premiumLaunchState 5 · premiumCheckoutSwitch 5 · welcomePremiumFlow 27 · v2up.premiumHomeFreeCopy 5 · deletionGateCovering 9 · consentRecovery 15 · productionConsentBuildProfile 5 · onboardingLayout 5.

Not executed: anything native (Xcode compile, prebuild Info.plist/PrivacyInfo, simulator, device, StoreKit, real OAuth). An export proves the JavaScript bundles; it does not prove native compilation.

---

## 08 — Historical defect reconciliation

| Historical item | Historical status | Current evidence (this pass) | Disposition | Release concern? |
|---|---|---|---|---|
| V2UP-DB-GUARD-01 | Repaired, regression check required | Live: SECURITY DEFINER, empty search_path, no broad grant, 10/10 triggers enabled (Apple, 2 Calendar, 7 Premium) in both envs | VERIFIED — no regression | No |
| Talk It Out Production promotion | Deployed / parity | Live hashes match (v23/v15) | VERIFIED | Device AI turn still deferred |
| Google Calendar promotion | Promoted / device deferred | Live hashes match; pause superseded | VERIFIED (deployment) | Device run deferred (not a build blocker) |
| PR #47 `index.js` entry | Regression tests required | Native: `installWebLinkGuard()` returns true when there is no `document` (React Native), so `expo-router/entry` always loads; web path guarded; module 0 in both exports; `codex.linkEntryPoints` 7/7, `v2up.deepLinkHardening` 22/22, `platformParity/systemLinks` 15/15 | PASS(src) | Cold start / deep links: device D-01 (HIGH) |
| PR #48 onboarding uncertainty | Review | `codex.onboardingUncertainty` 4/4 | PASS(src) | No |
| PR #49 Smart Inbox abort / recovery | Review | `codex.recoveryJourney`, `codex.captureCancellation`, full suite | PASS(src) | No |
| PR #53/#54/#55 Calendar | Reconcile | Live Production runs the permanent handler; client uses completion handles (`calendarOAuthBinding` 18/18) | PASS | No |
| V2UP-SEC-01 router advisory (GHSA-vcc3-ghjq-m6fr) | Mitigated | Resolved `expo-router` 57.0.31 still installs `query-string` 7.1.3 / `decode-uri-component` 0.2.2; native intent and web guards reject malformed/oversized links before the router (22 tests) | **MITIGATED** (not FIXED — upstream fix is a major router upgrade) | No for build |
| V2UP-ISO-01 account isolation | Partially verified | Source suites pass (accountAccess 26, aiClientAccountBoundary 11, talkItOutAccountFence 14, premiumStaleState 17) | PASS(src); hostile device switching NOT RUN | TestFlight check D-10 |
| RevenueCat App Store Connect API key / Apple product reads 422 | Historical | No RevenueCat access in this pass | UNVERIFIED | Purchase certification |
| Paywall revision 13 unpublished | Historical | Not readable here; Codex 11-13 handoff records the published paywall as defective and draft 13 unpublished | UNVERIFIED (likely still open) | Before checkout is enabled |
| Google Play package discovery | Android | Out of iOS scope | NOT APPLICABLE to iOS | No |
| Deletion workers dry-run | Historical | Mode is an Edge Function secret/env, not readable | UNVERIFIED | Before public release |
| IOS-D03 photo purpose string (Build 2 audit) | Owner had set `photosPermission:false` | Now present (`NSPhotoLibraryUsageDescription`) | CLOSED | No |
| IOS-D02 Light-only plist (Build 2 audit) | Repaired then | Superseded by owner's adaptive appearance (`UIUserInterfaceStyle=Automatic`, `expo-system-ui` installed) | Intentional change | No |

---

## 09 — Real-device deferred certification plan

Priority order (iPhone first; iPad rows marked ◆ are required because iPad is in scope):

1. **D-01 (HIGH) `index.js` cold start and deep links** — cold launch from icon; cold and warm launch via `herkeys://`; malformed link (`herkeys://%E0%E0…`, >2,048 chars) leaves the app on its screen; `herkeys://auth/callback` and `herkeys://calendar-connected` never show "Unmatched Route"; background→foreground; repeated links. ◆ repeat on iPad in landscape.
2. **D-02 Apple Sign-In** — first registration (name captured once), returning user, cancel, Hide My Email, sign-out → sign-in, re-consent, deleted account, backgrounding mid-sheet. ◆ sheet presentation on iPad.
3. **D-03 Password recovery + session restoration** — numeric code flow, app kill/relaunch restore, expired session. ◆ keyboard on iPad (incl. IOS-OBS-01 Talk It Out composer with docked, floating and split keyboards).
4. **D-04 Talk It Out against Production** — real authenticated turn, uncertainty quick replies, provider failure shows a non-model notice (not a fake reply), report submission.
5. **D-05 AI consent accepted / declined / revoked** — 403 path visible as a clear state.
6. **D-06 Google Calendar** — consent, native return, redemption, list, events, refresh, selection, disconnect/reconnect.
7. **D-07 Premium** — only after BE-RC-01 promotion and the owner enables checkout: sandbox purchase monthly/annual, restore, expiry, account switch.
8. **D-08 Account deletion and recovery** — on a marked test account only; recovery link must open a working page (blocked by EXT-WEB-01).
9. **D-09 Critical UI/navigation** — tabs, modals, sheets, Dynamic Type at AX sizes, VoiceOver, Light/Dark.
10. **D-10 Account isolation and offline** — A→B switch with requests in flight; airplane mode and recovery.
11. ◆ **D-11 iPad layout matrix** — see Addendum §B/§H.
12. **D-12 Built-artifact inspection** — unzip the IPA: `Info.plist` (ATS, orientations, `UIRequiresFullScreen`, device family), entitlements, aggregated `PrivacyInfo.xcprivacy`.

---

## 10 — Final release recommendation

| Gate | Status | What is required |
|---|---|---|
| **A. Before EAS build** | FAIL on REL-01 only | (1) owner authorizes the release branch in `RELEASE_BRANCHES`; (2) merge this audit branch (needs explicit authorization); (3) `release:preflight` PASS on the pushed merge SHA with the production env |
| **B. Before TestFlight testing** | Open | Apple Developer: App ID capabilities (Sign in with Apple, Push), distribution profile; confirm Supabase Apple provider includes `com.herkeys.app`; D-12 artifact inspection; D-01/D-02 smoke |
| **C. Before App Store submission** | NOT READY | §11 items ASR-01…ASR-10, incl. the IAP decision, the recovery page, 13-inch iPad screenshots, review demo account |
| **D. Before public release** | NOT READY | EXT-WEB-01 fixed; BE-RC-01 promoted before any checkout; deletion workers out of dry-run with sign-off; full device plan D-01…D-12 |

**Next required release action:** owner decision on REL-01 (and authorization to merge this audit branch). Then re-run the preflight and start a real EAS iOS `production` build.

---

## 11 — Apple App Store submission risk assessment (separate from EAS readiness)

| ID | Risk | Guideline / source | Likelihood | Gate | Required action |
|---|---|---|---|---|---|
| ASR-01 | Premium is shown but cannot be purchased in Production (`checkout_enabled=false`). If the subscriptions are attached to the version, review cannot complete a purchase; if they are not, a "Premium" surface with no way to buy reads as incomplete | 2.1 App Completeness, 3.1.1 | **High** | C | Decide: (a) enable checkout for review after BE-RC-01 promotion and a published, verified paywall, with IAPs submitted with the binary; or (b) ship without IAPs and hide/soften Premium surfaces (shared UI change, not iOS-only) |
| ASR-02 | Account recovery page 404 while the app and emails promise recovery | 5.1.1(v) (deletion itself is compliant), 2.1 | Medium (only if exercised) — **certain for users** | C/D | Publish `https://herkeys.app/account/restore` (web PR #10 lane) and verify a real recovery email end to end |
| ASR-03 | 13-inch iPad screenshots required now that the app runs on iPad (2064×2752 / 2752×2064 or 2048×2732 / 2732×2048) | App Store Connect screenshot specs | Certain | C | Capture from a real iPad or iPad simulator running the release build — never upscaled iPhone captures |
| ASR-04 | iPad review: reviewers test universal apps on iPad; layout unverified visually | 2.4.1 / 4.0 Design | Medium | C | Run D-11 before submission |
| ASR-05 | Sign-in required → reviewer needs a working demo account (email/password) on Production, AI consent and onboarding path documented in review notes | 2.1 | High if omitted | C | Prepare a marked review account and notes |
| ASR-06 | Privacy nutrition labels must reflect what is collected (contact info, user content incl. household/children data, AI processing by Google) and the privacy manifest must cover required-reason APIs | 5.1.1, 5.1.2 | Medium | C | Complete App Privacy in App Store Connect; inspect aggregated `PrivacyInfo.xcprivacy` (D-12) |
| ASR-07 | Custom "Continue with Apple" button not in Apple's black/white styles | 4.8 + HIG Sign in with Apple | Low–Medium | C | Owner decision: use `AppleAuthenticationButton` or match HIG colors (iOS-only change) |
| ASR-08 | Subscription metadata: Terms of Use (EULA) and Privacy links in the App Store description/metadata, subscription group, localized names, review screenshot of the paywall | 3.1.2 | High if IAPs ship | C | App Store Connect work |
| ASR-09 | Third-party AI disclosure and consent | 5.1.2(i) | Low (implemented) | C | Ensure the Privacy Policy PDF matches the in-app disclosure |
| ASR-10 | Age rating questionnaire (AI chat, user-generated content) and support URL (`/support` 200) | App Store Connect | Low | C | Complete in App Store Connect |
| ASR-11 | Unused capability strings (Motion, Face ID) | 5.1.1 | Low | C | Optional cleanup in a later build |

Inaccessible to this audit: App Store Connect (app record, agreements, IAP products, screenshots, privacy labels), Apple Developer portal (capabilities, profiles, devices), RevenueCat dashboard.

---

## SH — Shared and external defect handoff

### REL-01 — Candidate branch not authorized by the release preflight
1. ID REL-01 · 2. P1 for the build gate (process) · 3. Release control · 4. All builds
5. `scripts/verify-release-identity.mjs:21-24` (`RELEASE_BRANCHES`)
6. On the candidate branch with the production env loaded: `npm run release:preflight` → `branch: "integration/v2-autonomous-upgrade-20261112" is not an authorized release branch`
7. Audit run on the audit branch shows the same branch refusal; all identity checks PASS
8. The allow-list was last updated for Build 2 (PR #44); V2 was never authorized
9. iOS: preflight says "Do not build" · 10. Android: identical · 11. Production: none (process gate)
12. Owner adds the V2 branch (or the branch they designate) · 13. Re-run preflight with production env on the pushed SHA
14. **Blocks EAS build (process)**; not TestFlight/App Store beyond that · 15. Owner / release authority

### EXT-WEB-01 — Account recovery page missing (404)
1. EXT-WEB-01 · 2. P1 for public release · 3. External web / shared · 4. Account deletion recovery
5. App: `src/features/account/DeletionGate.tsx:63`; backend: `supabase/functions/_shared/deletionService.ts:110-111` (recovery link base hard-pinned to `https://herkeys.app/account/restore`); site: `herkeys.app`
6. `curl -L https://herkeys.app/account/restore` → 404 (also with a query string); `/delete-account` → 200
7. Live HTTP probe 2026-11-13 · 8. Web route not deployed (web deletion phase 2 is a draft PR in the web repo per prior records)
9. iOS: pending-deletion users cannot restore; button opens a 404 · 10. Android: same · 11. Production: every recovery email links to a 404
12. Deploy the restore page; keep the pinned origin · 13. Real recovery email → page → restore → sign in
14. Not EAS/TestFlight; **must be fixed before App Store submission (if deletion is demoed) and before public release** · 15. Web owner

### BE-RC-01 — RevenueCat environment guard not promoted to Production
1. BE-RC-01 (RC-V2-ENV-01) · 2. P1 for purchase certification · 3. Backend · 4. Premium
5. `supabase/functions/_shared/premium/reconcile.ts` (commit 961acca); live Production Premium functions v7 (2026-10-21) vs Staging v9–v11 (2026-11-13)
6. `list_edge_functions` on both projects (hashes in §05)
7. Live read · 8. Promotion awaits specific Production authorization (Codex handoff)
9. iOS: TestFlight purchases are sandbox; without the guard a sandbox subscription could be projected as a Production entitlement once checkout is on · 10. Android: same · 11. Production: latent while checkout is off
12. Promote the four reviewed bundles per the handoff's rollback-ready plan · 13. Authenticated reconcile, sandbox-into-Production refusal
14. **Not EAS build; must precede enabling checkout, TestFlight purchase tests on Production and submission with IAPs** · 15. Premium/backend owner (Codex lane)

### SH-A11Y-01 — Non-scrolling auth steps at accessibility text sizes
1. SH-A11Y-01 · 2. P4 · 3. Shared accessibility · 4. Welcome account choice, email entry, code entry
5. `src/features/welcome/WelcomeAuthShell.tsx` uses `<Screen scroll={false}>` for `AccountChoiceView`, `EmailEntryView`, `OtpEntryView` (no ScrollView inside those three)
6. Largest accessibility size on a short window (iPhone SE portrait; iPad mini landscape 744pt or a small Stage Manager window) → provider buttons may be pushed below the fold with no scroll
7. Source only (UNCONFIRMED rendering) · 8. Fixed-height layout · 9/10. Both platforms · 11. none
12. Wrap those views' content in a ScrollView (shared layout change) · 13. Render tests at fontScale 2–3 and device check
14. Before public release (verify first) · 15. Shared frontend owner

### HK-V2ACT-LINK-02 (existing, P4) — `DeletionGate` drops `openURL` failures
Still open (`DeletionGate.tsx:63`); now compounded by EXT-WEB-01 (the URL opens, but to a 404).

---

# ADDENDUM A — iOS / iPadOS optimization and release readiness

## A. Scope gate matrix

| Setting | Before (`9b75343`) | After (`f0a7a3fc55f847fcdfcf4a4854ec7b0916220392`) | Source | Result |
|---|---|---|---|---|
| `ios.supportsTablet` | `false` | `true` | `app.json` | Repaired (IOS-FIX-001) |
| `ios.isTabletOnly` | absent | absent | `app.json` | Correct for universal |
| `ios.requireFullScreen` | absent → `UIRequiresFullScreen=false` | same | resolved plist | Correct (TN3192) |
| `expo.orientation` | `portrait` | `portrait` (iPhone) | `app.json` | iPhone unchanged |
| `UISupportedInterfaceOrientations~ipad` | absent | all four | config plugin `RequiresFullScreen` | Correct |
| Runtime orientation locks | none (`expo-screen-orientation` not installed) | none | `package.json` | No conflict |
| `app.config.*` | none | none | repo | n/a |
| Generated native project | not generated (Windows) | not generated | — | D-12 on the IPA |

Apple implications: iPad screenshots become mandatory (ASR-03); iPad review applies (ASR-04).

## B. Device and window coverage

| Device class | Portrait | Landscape | Windowed | Dynamic Type | Appearance | Result |
|---|---|---|---|---|---|---|
| iPad mini (744×1133pt) | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | No macOS/Xcode host and no iPad |
| iPad 11-inch (820×1180 / 834×1194) | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | 〃 |
| iPad Pro/Air 13-inch (1024×1366 / 1032×1376) | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | 〃 |

Source-level reasoning only: the scrolling `Screen` already caps content at 680pt; with IOS-FIX-002 every user surface is capped on iPad; measurement users (`Botanical`, `HeaderBadge`, `CaptureCards`) use `useWindowDimensions`, which re-renders on resize. An Android emulator was **not** used as a substitute.

## C. Feature × iPad state matrix

Legend: NR = naturally responsive by source (rendering NOT RUN) · UP = unpolished · BR = broken · RP = repaired (source).

| Surface | Reach | Render | Main task | Controls | Resize/rotate | Keyboard | Large text | Modals/sheets | Status |
|---|---|---|---|---|---|---|---|---|---|
| Welcome / onboarding | Y | RP (cap) | NR | NR | NR | KAV (welcome views) | SH-A11Y-01 risk | n/a | RP + NOT RUN |
| Apple / Google / email sign-in | Y | RP (cap) | NR | NR | NR | KAV | SH-A11Y-01 risk | system sheets | NOT RUN (D-02) |
| Password reset | Y | NR (scroll) | NR | NR | NR | KAV | NR | — | NOT RUN |
| Legal + AI consent | Y | NR (scroll + insets) | NR | NR | NR | n/a | NR | — | NOT RUN |
| Today / Daily Load | Y (tab) | NR (Screen cap) | NR | NR | NR | n/a | NR | sheets RP | NOT RUN |
| Talk It Out | Y (tab + modal) | RP (cap) | NR | NR | NR | IOS-OBS-01 risk | NR | report panel inline | NOT RUN (D-03/D-04) |
| Action Map / capture | Y | NR | NR | NR | NR | inset-aware | NR | sheets RP | NOT RUN |
| Calendar + Google Calendar | Y | NR (Screen) | NR | NR | NR | editors inset-aware | NR | `presentation:'modal'` → iPad page sheet | NOT RUN (D-06) |
| Kids, Home, Co-parent, Meals, Money, Work, Me/Rebuild, Life Admin, People | Y | NR (Screen) | NR | NR | NR | inset-aware | NR | sheets RP; IPAD-UP-01 in short windows | NOT RUN |
| Smart Inbox / Life Inbox | Y | NR | NR | NR | NR | n/a | NR | — | NOT RUN |
| Premium + paywall | Y | NR (Screen) / RevenueCat UI native | Purchase OFF | Restore reachable | NR | n/a | NR | native paywall modal | NOT RUN |
| Your Account / settings | Y (modal) | RP (cap) | NR | NR | NR | n/a | NR | page sheet | NOT RUN |
| Account deletion + recovery | Y | RP (cap; panel scrolls) | NR | NR | NR | inset-aware | NR | — | NOT RUN; recovery EXT-WEB-01 |
| Document/photo pickers | Y | native | NR | native | native | n/a | native | PHPicker popover on iPad (verified in library source) | NOT RUN |
| Offline / error states | Y | NR | NR | NR | NR | n/a | NR | — | NOT RUN |

## D. BROKEN findings
None confirmed. (No iPad core-flow defect was reproduced; no runtime was available to reproduce one.)

## E. UNPOLISHED findings
| ID | Sev | Impact | Proposed change | Status |
|---|---|---|---|---|
| IOS-FIX-002 | P6 | Edge-to-edge text and controls on large iPads | iPad readable column | **Repaired (source)** |
| IPAD-UP-01 | P7 | Sheet top clipped in very short windows | Window-relative max height (iPad) | Deferred until a rendered check shows need |
| IPAD-UP-02 | P8 | Bottom tab bar on iPad uses the phone design (labels beside icons on wide windows, React Navigation default) | none — sidebar/top tabs are out of scope (A13) | Accepted |
| IOS-OBS-01 | P5 | Talk It Out composer offset is phone-calibrated | Measure the frame on iOS too (as on Android) once observed on device | Deferred (needs evidence) |

## F. SHARED / iPad-adjacent defects
SH-A11Y-01 (non-scrolling auth steps at large text, worse on short iPad windows). Left unrepaired; see §SH.

## G. Repair and regression evidence
See §04 (IOS-FIX-001, IOS-FIX-002) and §07. iPhone preservation: identical style arrays when `isPad` is false (tested, mutant M10). Android isolation: predicate requires `OS==='ios'` (tested, mutant M5); `app.json` change is an `ios.*` key. No screenshots exist (no renderer for iOS on this host).

## H. Deferred iPad device-verification plan (D-11)
Minimum targets: one compact iPad (mini, iPadOS 26/27), one 13-inch iPad, one reduced-width window (Split View / Stage Manager), one accessibility text size, Light and Dark.
1. Rotate on every tab and modal; state (drafts, scroll position, open sheet) survives.
2. Resize via Stage Manager/windowing to the minimum width; no control leaves the window; tab bar not overlapping content.
3. Talk It Out: docked, floating and split keyboards; hardware keyboard; composer stays visible (IOS-OBS-01).
4. Apple Sign-In and Google OAuth sheets present and return in landscape and in a window.
5. Your Account → Premium → Restore; Delete Account confirmation reachable in landscape at AX5.
6. Document camera / photo picker (popover) present and dismiss correctly.
7. VoiceOver order on Welcome, consent, Your Account; reduced motion.
8. Cold-start deep link in landscape (D-01).
Record device, OS, orientation, window size, text size, appearance and a screenshot for each.

## I. App Store screenshot readiness
Required now: at least one **13-inch iPad** screenshot (2064×2752 or 2752×2064; 2048×2732 or 2732×2048 also accepted), PNG/JPEG without alpha, captured from the release candidate on an iPad or iPad simulator. Plus the required iPhone set. Not prepared by this audit.

## J. Final verdict (Addendum)
- **iPhone EAS BUILD READINESS: FAIL** (REL-01 only)
- **iPad EAS BUILD READINESS: FAIL** (REL-01 only; iPad source/config PASS at `f0a7a3fc55f847fcdfcf4a4854ec7b0916220392`)
- **COMBINED UNIVERSAL iOS EAS BUILD READINESS: FAIL** (REL-01 only)
- **iPad OPTIMIZATION: PARTIAL** — no confirmed blocking iPad defect; required visual/device evidence not available from this host.
- Certified source: `f0a7a3fc55f847fcdfcf4a4854ec7b0916220392` on `audit/ios-ipad-v2-eas-readiness-20261113`.

### Resolved iOS configuration at f0a7a3f (excerpt of `npx expo config --type introspect`)

```json
{
  "ios.supportsTablet": true,
  "orientation": "portrait",
  "UISupportedInterfaceOrientations": [
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationPortraitUpsideDown"
  ],
  "UISupportedInterfaceOrientations~ipad": [
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationPortraitUpsideDown",
    "UIInterfaceOrientationLandscapeLeft",
    "UIInterfaceOrientationLandscapeRight"
  ],
  "UIRequiresFullScreen": false,
  "UILaunchStoryboardName": "SplashScreen",
  "UIUserInterfaceStyle": "Automatic",
  "bundleIdentifier": "com.herkeys.app",
  "entitlements": {
    "com.apple.developer.applesignin": [
      "Default"
    ],
    "aps-environment": "development"
  }
}
```

Introspection uses Expo's stub base Info.plist (for example `NSAllowsArbitraryLoads`, `armv7`), so only plugin-written keys are evidence; the real `Info.plist` must be read from the built IPA (D-12).
