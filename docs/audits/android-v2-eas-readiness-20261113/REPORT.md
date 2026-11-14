# Her Keys V2 — Android hostile audit and EAS build readiness (2026-11-13)

Auditor: Claude (Android release manager / hostile auditor role). Audit branch `audit/android-v2-eas-readiness-20261113`, worktree
`C:\Users\jsmit\Her-Keys-AND02`. Documentation only: no app, backend, migration, permission, identity, signing or release-script
change was made. No EAS build was started, no AAB was produced, nothing was merged or deployed, and every Production read was read-only.

Evidence labels: **PASS(src)** source + automated test; **PASS(live)** read-only probe of the deployed system this session;
**PASS(artifact)** inspected from a locally built release APK of the same dependency tree; **NOT_RUN** not executed;
**BLOCKED** needs access this session did not have.

---

## 01 — Executive summary

| Item | Value |
|---|---|
| Candidate branch | `integration/v2-autonomous-upgrade-20261112` (no separate Android candidate exists) |
| Candidate SHA (original = final) | `9b75343917369f43c2fa9304e8a45f35dbad54b9` (PR #55 merge). `git ls-remote` confirms it is the remote tip. |
| Newer approved work | None. Every 11-13 lane branch (#45–#55) is 0 commits ahead of the tip. `main` and `integration/build2-candidate-20261020` are ancestors. |
| iOS work on shared source | The parallel iOS audit worktree (`Her-Keys-IOS02`, `audit/ios-ipad-v2-eas-readiness-20261113`) is also at `9b75343`; no iOS commits exist beyond it. |
| EAS profile | `production` (AAB, `autoIncrement`, `appVersionSource: remote`, EAS environment `production`) |
| CI at exact SHA | Her Keys V2 Integration Gate, push run 43512558892: success |
| Android-only repairs | 0 (no confirmed Android-only P0–P3 defect; see 03) |
| Highest risks | (1) mandatory `release:preflight` refuses the V2 branch; (2) Production account deletion is disabled/dry-run while the app promises automated deletion; (3) public deletion page is a placeholder and the privacy page has no privacy contact; (4) restore page 404; (5) Play Console state unverified |

**Verdict: ANDROID EAS BUILD READINESS: FAIL.** One cause only: the mandatory production preflight fails on the candidate branch
because the shared release allowlist does not include it (AND-SH-01). Every other build-readiness check passes. The smallest repair is
a one-entry shared release-control change (section 11).

---

## 02 — Feature implementation and activation matrix

Columns: Implemented / Integrated / Activated (Production config) / Production compatible / User-facing / Verified / Result.
"Device" means a real Android device or emulator; none was used in this pass (host had 0.8–1.4 GB free RAM).

| # | Feature | Impl | Integr | Activated | Prod compatible | User-facing | Verified | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | Welcome / onboarding | Y | Y | Y | n/a (local) | Y | PASS(src) | PARTIAL (device NOT_RUN) |
| 2 | Account creation (email/password, OTP) | Y | Y | Y (`email` provider on, signup on) | PASS(live settings) | Y | PASS(src); live recovery OTP per PR #49 | PARTIAL |
| 3 | Existing-account sign-in | Y | Y | Y | PASS(live settings) | Y | PASS(src) | PARTIAL |
| 4 | Google Sign-In | Y | Y (PKCE S256, WebCrypto shim) | Y (`google` on; authorize → 302 to Google with public Supabase callback) | PASS(live probe) | Y | PASS(src); native consent NOT_RUN | PARTIAL |
| 5 | Email / password | Y | Y | Y | PASS(live settings) | Y | PASS(src) | PARTIAL |
| 6 | Forgot password | Y | Y | Y | Codex PR #49 live OTP | Y | PASS(src) | PARTIAL |
| 7 | Session restoration | Y | Y | Y | — | Y | PASS(src) | PARTIAL |
| 8 | Terms and Privacy (in app) | Y | Y | Y (PDFs HTTP 200) | Y | Y | PASS(src) | PASS(src) |
| 9 | AI data-processing consent | Y | Y | Y (gate flag `true` in EAS Production) | PASS(live, consent RPCs present) | Y | PASS(src) | PARTIAL |
| 10 | Permissions / preferences | Y | Y | Y | n/a | Y | PASS(src) | PARTIAL |
| 11 | Today / Daily Load | Y | Y | Y | n/a (local) | Y | PASS(src) | PARTIAL |
| 12 | Talk It Out AI | Y | Y | Y (`herkeys-ai` v15 ACTIVE, verify_jwt) | Deployed; authenticated Gemini turn NOT_RUN | Y | PASS(src) | PARTIAL |
| 13 | Action Map | Y | Y | Y | n/a | Y | PASS(src) | PARTIAL |
| 14 | Calendar (Her Keys) | Y | Y | Y | n/a | Y | PASS(src) | PARTIAL |
| 15 | Google Calendar | Y | Y (handle redemption in bridge) | Y (`calendar-oauth` v14 = permanent CAL-03/CAL-05 repair; CAL-03 migration applied) | PASS(live readback) | Y | PASS(src); consent/events NOT_RUN | PARTIAL |
| 16–24 | Kids, Home, Co-parenting, Meals, Money, Work, Me/Rebuild, Life Admin, People | Y | Y | Y | Sync contract | Y | PASS(src), full suite | PARTIAL (device NOT_RUN) |
| 25 | Documents + on-device OCR | Y | Y (ML Kit, picker, camera) | Y | No upload path | Y | PASS(src) | PARTIAL |
| 26 | Smart Inbox | Y | Y | Y (`smart-inbox-extract` v7) | Deployed | Y | PASS(src) | PARTIAL |
| 27 | Premium (state, gates) | Y | Y | `premium_enabled=true`, `checkout_enabled=false` | Deployed | Free/Premium state only | PASS(src) | PARTIAL |
| 28 | Subscription purchase / restore | Y | Y (RC SDK, Play Billing 8.3.0) | **Not activated** (checkout off; published paywall rev 12 defective) | Products ACTIVE in Play per Codex | No (checkout off) | PASS(src); store NOT_RUN | NOT ACTIVATED (correctly not offered) |
| 29 | Account settings | Y | Y | Y | Y | Y | PASS(src) | PARTIAL |
| 30 | Account deletion + recovery | Y | Y | **Request yes; processing disabled + dry-run; restore page 404** | Functions ACTIVE; worker off | Y | PASS(src); live NOT_RUN | **FAIL (activation)** — AND-SH-02/03 |
| 31 | AI response reporting | Y | Y | Y | PASS(live: `submit_ai_response_report` authenticated-only, reviewer RPCs gated) | Y | PASS(src) | PARTIAL |
| 32 | Weather / device location | Y | Y (coarse only) | Y (`weather-context` v12) | Deployed | Y (user action) | PASS(src) | PARTIAL |
| 33 | Local notifications | Y | Y (channel before prompt) | Y | n/a | Y (opt-in) | PASS(src) | PARTIAL |
| 34 | Offline | Y | Y | Y | n/a | Y | PASS(src) | PARTIAL |
| 35 | Sync | Y | Y | Y | Staging RLS probe 16/16 (Codex) | automatic | PASS(src) | PARTIAL |
| — | Apple sign-in | Y | iOS only (`Platform.OS === 'ios'`) | n/a on Android | — | Not on Android | registry EX-01 | N/A (Android) |
| — | Push notifications | No | FCM components merged by `expo-notifications`, inert | No | — | No | — | NOT IMPLEMENTED, not advertised |

---

## 03 — Android defect ledger

### P0–P3 Android-only defects
None confirmed. No repair was made (section 04).

### Android-only findings below P3, not repaired (device evidence required; no low-risk repair is justified without it)

| ID | Sev | Finding | Evidence | Why not repaired |
|---|---|---|---|---|
| AND-OBS-01 | P5 UNCONFIRMED | Keyboard under edge-to-edge (`edgeToEdgeEnabled=true`, target 36): `Screen` forms rely on `adjustResize`; `SystemEditor.tsx:62` uses `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`. Under edge-to-edge the window is not resized, so bottom fields/Save may sit under the IME. Welcome-tree screens were already fixed for this (2641898). | Source; PP-D10 (P7) and RT-18 in the parity audit | Shared `Screen` component; correct Android offset needs device measurement. Device test item. |
| AND-OBS-02 | P5 UNCONFIRMED | Process death while the Custom Tab is open: `+native-intent.tsx` returns `null` for `herkeys://auth/callback` and `herkeys://calendar-connected`, so a cold-started app drops the return; the user must retry (the Calendar handle expires in 5 min). iOS keeps the session in-process. | Source trace of `routerPathForIncomingLink` + `openAuthSessionAsync` | Touches shared auth/calendar code; needs device repro ("Don't keep activities"). |
| AND-OBS-03 | P6 | Android 16 large screens: at target 36 the system ignores `screenOrientation="portrait"` for sw≥600dp, so tablets/foldables get landscape/resizable windows. iOS ships phone-only. | Manifest + platform behavior change | Product decision (tablet support vs. opt-out property); device test. |
| AND-OBS-04 | P6 owner decision | `allowBackup="true"`: AsyncStorage household/child data is in Android Auto Backup; `expo-secure-store` data is excluded by the generated rules. | Merged manifest | Privacy/product decision; the privacy summary mentions backups. |
| AND-OBS-05 | P7 | Hardware Back is swallowed while a welcome-tree request is in flight (`WelcomeAuthFlow.tsx:175`). Bounded by request deadlines. | Source | Intended; verify on device. |
| AND-OBS-06 | P9 | No monochrome adaptive icon (Android 13 themed icons); unused `USE_BIOMETRIC`/`USE_FINGERPRINT` from `expo-secure-store`; inert FCM receiver/service from `expo-notifications`. | Merged manifest | Cosmetic / harmless; affects Data Safety wording only (06). |

### Shared defects (not repaired — see 21-style handoff below)

| ID | Sev | Owner | Blocks |
|---|---|---|---|
| AND-SH-01 | P1 | Shared Integration Engineering (release control) | **EAS build (mandatory preflight)** |
| AND-SH-02 | P1 | Backend / operator | Play submission, public release |
| AND-SH-03 | P2 | Web + shared | Public release; deletion/recovery testing |
| AND-SH-04 | P3 (mitigated) | Shared dependency | Nothing currently; track |

### External / operator issues

| ID | Sev | Issue | Blocks |
|---|---|---|---|
| AND-EXT-01 | P1 | `https://herkeys.app/delete-account` is a placeholder ("disabled placeholder… no deletion API exists in this build"). Play requires a working external deletion resource. | Play submission |
| AND-EXT-02 | P1 | `https://herkeys.app/privacy` is a "Privacy Summary"; the full policy is a PDF; it says "Privacy contact email to be supplied". Play requires an HTML (no PDF) policy with a privacy point of contact. | Play submission |
| AND-EXT-03 | P1 (Premium only) | RevenueCat published paywall revision 12 is defective (example.com legal links, web-checkout action); draft 14 unpublished; Google subscription-purchase permission unverified (Codex). | Premium Play testing / launch; not EAS |
| AND-EXT-04 | gate | Play Console (app, upload key, app signing, tracks, versionCode history, declarations) not readable this session. | Play testing / submission verification |
| AND-EXT-05 | gate | EAS Free-plan Android build quota was exhausted in October; current quota not verified. | Running the build |

### Environmental limitations
Host free RAM 0.8–1.4 GB: emulator not started (directive §18). Native items are deferred to device testing (10).

### False positives (checked and cleared)
- `herkeys://dev-tools` / `gallery`: `Stack.Protected` with `internalTools`, which is false unless `demo` data mode; Production is `empty`. Gallery also returns null when `!__DEV__`.
- Bundle hits for the Staging ref, `sb_secret_` and `localhost`: the backend-match table in `verify` code, the supabase-js key-prefix check and library internals. No secret, Staging URL or test RevenueCat key is used.
- Calendar 500 / guard: Production guard is `SECURITY DEFINER` with `search_path=""`, on all 10 guarded provider tables.

---

## 04 — Repair report

**Android-only repairs: 0.** No Android-only P0–P3 defect was confirmed, and every lower-severity Android finding either needs device
evidence to repair safely or is a product decision. Unsuccessful attempts: none. The only file changes on this branch are this report
and its registration in `scripts-dev/meals-boundary-scan.cjs` (the repository's required lane register for any changed file).

---

## 05 — Staging / Production integration report (Production read-only, this session)

| Service | Production state (read back) | Classification |
|---|---|---|
| Supabase URL / key in EAS `production` | host = `npykvnxnehlsdlbumzwk.supabase.co`; key shape `sb_publishable_*`; no secret-named variables | DEPLOYED AND CONTRACT-COMPATIBLE |
| Build flags | `EXPO_PUBLIC_HERKEYS_BACKEND=production`, `DATA_MODE=empty`, `V2_CONSENT_GATE=true`, `REVENUECAT_STORE=native` (profile) | PASS |
| RevenueCat keys | Android `goog_*`, iOS `appl_*` (Codex matched them to the live RC apps) | CONFIGURED BUT NOT FUNCTIONALLY VERIFIED |
| Auth providers | `email`, `google`, `apple` enabled; signups on; Google authorize → 302 to Google | CONFIGURED; Google consent NOT_RUN |
| Edge Functions | 19 ACTIVE; every function the client calls exists (`calendar-data` v12, `calendar-oauth` v14, `herkeys-ai` v15, `weather-context` v12, `smart-inbox-extract`, `premium-gate`, `premium-reconcile`, deletion set) | DEPLOYED AND CONTRACT-COMPATIBLE |
| `calendar-oauth` v14 | Permanent CAL-03 completion-handle repair + CAL-05 public callback and client-ID check (not the emergency pause) | DEPLOYED; end-to-end NOT_RUN |
| Migrations | 39 applied incl. `provider_write_guard_definer` and `calendar_oauth_authenticated_completion`. Every one of the repo's 38 migrations is applied (four under date-suffixed names); one extra Production-only operational migration, `account_deletion_scheduler_installed_disabled` | PASS |
| Deletion guard | `private.refuse_pending_provider_write`: SECURITY DEFINER, `search_path=""`; triggers on calendar, calendar state, Apple credentials and 7 Premium tables | HISTORICALLY REPAIRED, VERIFIED PRESENT |
| AI reporting | `submit_ai_response_report` (authenticated only), reviewer functions gated by `private.require_ai_report_reviewer` | DEPLOYED AND CONTRACT-COMPATIBLE |
| Premium runtime | `premium_enabled=true`, `checkout_enabled=false`, `test_store_checkout_enabled=false`, `allow_test_fixtures=false`, webhook processing on | ACTIVATED (free gating); checkout intentionally OFF |
| Account deletion | `account_deletion_control`: `enabled=false`, `dry_run=true`, `last_run_at=null`; deletion, monitor and proof-expiry cron jobs inactive | **REQUIRED CONFIGURATION MISSING** (AND-SH-02) |
| Web restore page | `https://herkeys.app/account/restore` → 404 | **CONFIRMED BROKEN** (AND-SH-03) |

Not verified (no access or out of scope): Supabase redirect allow-list for `herkeys://auth/callback`; Production function secrets
(Gemini, Google Calendar client); SMTP / email templates; live Gemini output; webhook delivery.

---

## 06 — Google Play compliance and submission blockers

Policies checked 2026-11-13: Play target API page (answer 11926878), User Data policy (10144311), Policy announcement Oct 29 2026 (18100766).

| Area | Finding | Blocks |
|---|---|---|
| Target API | target **36**, compile **36**, min 24 (RN 0.86 catalog; confirmed in a release APK of this tree: `targetSdkVersion:'36'`). Required: API 36 for new apps and updates from Aug 31 2026 (extension to Nov 1 2026). | PASS |
| Package | `com.heykeys.app` (resolved config, release APK) | PASS |
| Signing | Historical: EAS keystore for `com.heykeys.app` = SHA-1 `27:EF:…:C1:E5`, verified on AAB ea226dc0 (2026-10-04). Current Play upload/app-signing certificates not readable. No credential touched. | NOT YET VERIFIED (owner) |
| versionCode | `appVersionSource: remote`; EAS remote Android versionCode **3**, so the next `production` build becomes **4**. `app.json` `versionCode: 2` is ignored. Play history unknown. | Owner confirms 4 is above every uploaded code |
| AAB | `production` profile builds an AAB (no `buildType` override), release Gradle task, 4 ABIs incl. arm64-v8a. | Artifact checks deferred |
| 16 KB pages | 24/24 native libraries in the local x86_64 release APK have 16 KB LOAD alignment; `zipalign -c -P 16` passes. arm64 must be rechecked on the real AAB. | PASS (partial) |
| Permissions (merged) | `ACCESS_COARSE_LOCATION`, `CAMERA`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `BILLING`, `USE_BIOMETRIC`/`USE_FINGERPRINT`, storage ≤ API 32, launcher badge permissions. **Absent:** fine/background location, `SYSTEM_ALERT_WINDOW`, `RECORD_AUDIO`, `READ_MEDIA_*`, contacts, exact alarms, foreground service, local network, `AD_ID`. | PASS — no restricted-permission declaration needed |
| Oct 29 2026 policies | Local Network (API 37+, Aug 25 2027), Manage Contacts, AppFunctions (Apr 14 2027), eligibility discounts: none apply (no such permission/API; only free-trial offers). | N/A |
| Location | Coarse only, foreground, user-initiated; `Accuracy.Low`; denial handled | PASS(src) |
| Photos / camera | System picker (no `READ_MEDIA_*`), camera on the scan path, ML Kit on-device; no upload path in source | PASS(src) |
| Notifications | Channel created before the Android 13 prompt; opt-in from Today | PASS(src) |
| Account deletion | In-app path present. **External page is a placeholder (AND-EXT-01) and Production processing is disabled (AND-SH-02).** | **Submission FAIL** |
| Privacy policy | HTML page exists but is a summary deferring to a PDF and lacks a privacy contact (AND-EXT-02) | **Submission FAIL** |
| AI content | Report control → authenticated Production RPC → reviewer workflow; expiry cron active | PASS(src + live contract) |
| Subscriptions | Checkout off; paywall rev 12 defective (AND-EXT-03); disclosures in draft 14 | Premium launch gate |
| Target audience | Privacy summary: adults 18+, no child accounts; children appear only as records entered by caregivers. Families policy should not apply if declared 18+. | Owner declaration |
| App access | Authenticated app: reviewer account plan needed; email OTP/password; no credentials recorded here | Owner action |

**Proposed Data Safety reconciliation (for the owner/legal; no policy text changed):**

| Data type | Collected | Shared (third party) | Notes |
|---|---|---|---|
| Email, account IDs | Yes | Supabase (processor) | Required |
| Household records, children's info, tasks, calendar items | Yes | Supabase (processor) | Optional, user-entered |
| AI conversation content | Yes (when used) | Google Gemini via `herkeys-ai` | Consent-gated |
| Google Calendar events | Yes (read-only, when connected) | — | Server-side token, encrypted |
| Approximate location | Yes (on request, transient) | Weather provider via `weather-context` | Not stored |
| Purchase history / subscription | Yes (when checkout enabled) | RevenueCat, Google Play | — |
| Photos / documents | Processed on device only | ML Kit on-device | ML Kit may send diagnostics to Google |
| Diagnostics | Check: ML Kit / Google datatransport, Firebase components (inert, no `google-services.json`) | Google | Confirm before declaring "no diagnostics" |
| Advertising ID | No (`AD_ID` absent) | — | Ads: No |

---

## 07 — Android native configuration report

Generated with `expo prebuild --platform android --no-install` in the audit worktree (`/android` is git-ignored); merged manifest read from
`Her-Keys-V2ACT/.../app-release.apk` (local release build, 2026-11-13 16:15, PR #55 lane; no dependency, `app.json` or `eas.json`
difference from `9b75343`).

- Expo SDK 57 (`expo ~57.0.33`), RN 0.86.3, AGP 8.12.0 and Kotlin 2.1.20 (RN version catalog), build-tools 36.0.0, NDK 27.1.12297006, New Architecture on, Hermes on, edge-to-edge on.
- `MainActivity`: `singleTask`, `exported=true`, `adjustResize`, portrait, `enableOnBackInvokedCallback=false` (predictive back opted out — still honored at target 36; keeps RN `BackHandler` semantics; must be revisited before targeting 37).
- Intent filters: LAUNCHER; `VIEW`+`DEFAULT`+`BROWSABLE` with scheme `herkeys` only (no host/path; every incoming link passes `+native-intent` → `isUnparseableLink` → route guards). No App Links / `autoVerify`.
- Other exported components are permission-protected library components (Amazon IAP receiver, Firebase IID receiver, ProfileInstaller with `DUMP`).
- No `usesCleartextTraffic`, not debuggable in release. Backup rules from `expo-secure-store` exclude secure store data.
- `expo-updates` metadata present with `ENABLED=false`.
- Icons: adaptive icon (`#000000` background + foreground); no monochrome layer.
- Release identity hook: `eas-build-post-install` runs the identity-only guard (and the backend-target check when `EAS_BUILD=true`), so a wrong package or crossed Supabase target fails inside EAS too.

---

## 08 — Test execution report (source `9b75343`, Windows 11, Node 24.14.0, npm 11.9.0)

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | 591 packages |
| `npm run typecheck` | 0 | clean |
| `npm run verify:release-identity` | 0 | PASS (`com.heykeys.app`, `com.herkeys.app`, project `7b25f8fe…`, 1.0.0) |
| `npm run release:preflight` (EAS `production` values, never printed) | **1** | Backend checks pass. **Provenance FAIL.** On the audit branch: not authorized, no upstream. Evaluated as the real V2 branch (clean, exact SHA, upstream = remote = `9b75343`): only failure is `branch "integration/v2-autonomous-upgrade-20261112" is not an authorized release branch`. |
| `npx expo install --check` | 0 | Dependencies are up to date |
| `npx expo-doctor` | 0 | 21/21 checks passed |
| Targeted suites (v2up ×7, codex ×6, platformParity ×10, androidAuthKeyboard, webCryptoShim, releaseIdentity, productionConsentBuildProfile, backendEnvironment, meals/boundary, claude.v2act ×4, AI reporting ×4, consent ×4, deletion gate, email/password, password recovery, notifications ×2, Premium launch ×3) | 0 | **484/484**, 70 suites, 0 skipped |
| `npm test` | 0 | **5,667/5,667**, 1,128 suites, 0 failed / cancelled / skipped / todo, 168 s |
| `npx expo export --platform android --no-bytecode` (Production env) | 0 | One 5.9 MB bundle via custom `index.js` (web-link guard present); Production Supabase only; no secret, service-role, Staging target or test RC key |
| `expo prebuild --platform android` | 0 | Native project generated (07) |
| CI at SHA | — | run 43512558892 success |

Not executed: device/emulator runs, an EAS build, AAB inspection, live purchases, Production writes.

---

## 09 — Historical defect reconciliation

| Issue | Recorded | Current evidence | Current state | Owner / gate |
|---|---|---|---|---|
| V2UP-DB-GUARD-01 | Repaired Staging + Prod | Prod function SECURITY DEFINER, `search_path=""`, 10 guarded tables, migration applied | REPAIRED, present | — |
| Calendar (CAL-01…05) | Promoted | Prod `calendar-oauth` v14 is the permanent repair; CAL-03 migration applied; client redeems the handle | Deployed; end-to-end NOT_RUN | Device acceptance |
| Talk It Out | Prod v15 | ACTIVE, verify_jwt true; consent and report RPCs present | Deployed; live Gemini NOT_RUN | Functional acceptance |
| V2UP-ISO-01 | Staging probe 16/16 | Isolation, quarantine and late-result suites pass | Source PASS; device switching NOT_RUN | Device |
| V2UP-SEC-01 | Mitigated in source | `+native-intent` and `webLinkGuard` refuse malformed and over-long links; tests pass; vulnerable `query-string` fallback still installed | MITIGATED (AND-SH-04) | Shared dependency upgrade |
| Premium / RevenueCat | Not activated | Checkout off; paywall rev 12 defective; Android products ACTIVE (Codex) | Unchanged | Operator |
| Wrong Android package (`com.herkeys.app`) | Fixed + guarded | Resolved config and APK show `com.heykeys.app` | No regression | — |
| AE2E D01–D05 | Fixed (PR #42) | Fixes present and tested (DeletionGate covering, WebCrypto first import, quarantine) | No regression | — |

---

## 10 — Real-device acceptance handoff (production-profile AAB via Play internal testing, real Android 14–16 phones)

1. Cold start, warm start, process death (developer option "Don't keep activities"), task restore.
2. Google Sign-In: consent, cancel, return, correct account; kill the app during the Custom Tab (AND-OBS-02).
3. Email/password sign-up, sign-in, recovery OTP, password change.
4. Account A → B switch on one device; pending AI/Smart Inbox requests; quarantine.
5. Google Calendar connect → handle redemption → events → refresh → disconnect → reconnect; background during consent.
6. Talk It Out: consented Gemini turn, uncertainty reply, timeout, revoke consent, report a response.
7. AI consent revise / withdraw.
8. Premium purchase / cancel / restore on Play test track (only after checkout and paywall are activated).
9. Account deletion request → pending gate → recovery (after AND-SH-02/03 are resolved; never on a real user).
10. Notifications: Android 13+ prompt, deny, reminder delivery, tap routing, reboot persistence.
11. Document scan: camera, picker, denial, OCR review, airplane mode (confirm no upload).
12. Offline → reconnect sync.
13. Keyboard on every form, especially Systems editor, task/event editors, Talk It Out composer (AND-OBS-01); font scale 200%.
14. Hardware Back, gesture Back, three-button navigation on every root and modal.
15. Large screen / foldable orientation (AND-OBS-03), dark mode, TalkBack, 48 dp targets.

---

## 11 — Final release decision

**Shared defect handoff**

**AND-SH-01 — release preflight refuses the V2 candidate (P1, SHARED, release control).**
`scripts/verify-release-identity.mjs:21-24` `RELEASE_BRANCHES = ['build/02-gemini-integration', 'integration/build2-candidate-20261020']`.
Reproduce: on a clean checkout of `integration/v2-autonomous-upgrade-20261112` at `9b75343` with the EAS Production values loaded, run
`npm run release:preflight` → `branch: "integration/v2-autonomous-upgrade-20261112" is not an authorized release branch`. Root cause:
a stale allowlist (the same situation PR #44 resolved for build2-candidate). Not a wrong branch selection: the only authorized V2-line
branch, `integration/build2-candidate-20261020` (`c37fa45`), is an obsolete ancestor missing all 11-13 work. Affects Android and
iOS equally. Recommended repair, by Shared Integration Engineering in a PR into the integration branch: add
`integration/v2-autonomous-upgrade-20261112` (or a dedicated release branch cut from `9b75343`) to `RELEASE_BRANCHES`, update the pin in
`tests/releaseIdentity.test.mjs:69` and the authorization note in `docs/release/ANDROID_RELEASE_IDENTITY.md`, and register the files in
the boundary scan. Do not weaken the provenance checks. Verify: `npm run release:preflight` on a clean, pushed checkout prints
`RELEASE_IDENTITY=PASS`; `tests/releaseIdentity.test.mjs` passes. Blocks: EAS build.

**AND-SH-02 — Production account deletion never runs (P1, BACKEND/OPERATOR).** `account_deletion_control` `enabled=false`,
`dry_run=true`; deletion, monitor and proof-expiry cron jobs inactive. `DeleteAccountPanel.tsx:26` tells users "automated permanent
deletion removes your account-owned household, child, task, calendar, private, and associated records" after 30 days. Play's data
deletion policy requires actual deletion. Repair: owner-approved activation with security sign-off (Phase 2 settlement), verified on
Staging first. Blocks: Play submission, public release. Not EAS.

**AND-SH-03 — recovery page 404 (P2, WEB + SHARED).** `DeletionGate.tsx:63` "Recovery and support" and
`supabase/functions/_shared/deletionService.ts:110` restoration links open `https://herkeys.app/account/restore`, which returns 404
(web restore page not deployed; web PR #10). The 30-day recovery promise cannot be used. Blocks: public release, deletion testing.

**AND-SH-04 — dependency advisory GHSA-vcc3-ghjq-m6fr (P3, SHARED, mitigated).** The `query-string` / `decode-uri-component` fallback
remains installed under Expo Router; malformed and over-long links are refused before parsing (`systemLinks.ts`, `webLinkGuard.ts`,
tests pass). Track with the next Expo Router major. Blocks: nothing now.

**Gates**

- Gate A — fails only on AND-SH-01. After that one shared change merges, rerun on the new integration SHA: `npm ci`, `release:preflight`
  (EAS `production` values), `npm test`, Android export. If they pass, the candidate meets every Gate A requirement in this report.
- Gate B — no Play Console evidence (app, signing, track, versionCode, declarations). Internal testing of free features needs only a
  signed AAB and console access; Premium tests need checkout + paywall activation.
- Gate C — fails on AND-EXT-01, AND-EXT-02 and AND-SH-02 even before the AAB exists.

**ANDROID EAS BUILD READINESS: FAIL**

**CERTIFIED SOURCE SHA:** none certified. Audited candidate `9b75343917369f43c2fa9304e8a45f35dbad54b9` (no source change by this audit).

**ANDROID-ONLY REPAIRS COMPLETED:** 0

**SHARED DEFECTS OUTSTANDING:** 4 — AND-SH-01 (EAS blocker), AND-SH-02, AND-SH-03, AND-SH-04

**GOOGLE PLAY TESTING READINESS:** NOT YET VERIFIED

**GOOGLE PLAY SUBMISSION READINESS:** FAIL

**PRODUCTION FEATURE ACTIVATION:** Partial (free features deployed and contract-compatible; checkout off; account deletion processing disabled; restore page missing)

**DEVICE TESTS DEFERRED:** all 15 items in section 10

**MANDATORY OWNER ACTIONS:**
1. Approve and merge the AND-SH-01 allowlist change (Shared Integration Engineering), then rerun the preflight.
2. Confirm EAS Android build quota and that remote versionCode 4 is above every code uploaded to Play.
3. Confirm in Play Console: app `com.heykeys.app`, upload certificate SHA-1 `27:EF:71:89:70:C6:72:0C:17:40:C8:E8:CA:EF:BD:70:61:C0:C1:E5`, Play App Signing, internal track.
4. Publish a working account-deletion web page and deploy `/account/restore` (AND-EXT-01, AND-SH-03).
5. Publish an HTML privacy policy with developer info and a privacy contact (AND-EXT-02); complete Data Safety (06).
6. Decide and enable Production account-deletion processing (AND-SH-02).
7. Before any Premium testing: publish a corrected paywall, verify Play purchase permissions, enable checkout (AND-EXT-03).
8. Prepare a reviewer test account and App access instructions; declare the 18+ target audience.

**NEXT REQUIRED STEP:** Shared Integration Engineering adds `integration/v2-autonomous-upgrade-20261112` to `RELEASE_BRANCHES` (with its
test pin and doc) in a reviewed PR; then rerun `npm run release:preflight` on the resulting pushed SHA. If it passes, that SHA may
proceed to the production-profile EAS Android build.
