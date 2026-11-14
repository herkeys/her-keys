# Her Keys AI V2 — Final Android pre-EAS release audit (2026-11-14)

Auditor: Claude (Android release engineer / independent QA / Play compliance role). Audit branch
`audit/android-v2-final-pre-eas-20261114`, worktree `C:\Users\jsmit\Her-Keys-AND03`, cut from the exact baseline below.
Documentation only: no app, backend, migration, permission, identity, signing, billing or release-script change was made. No EAS build
was started, no AAB was produced or uploaded, nothing was merged or deployed, and every Production read was read-only.

Evidence labels: **PASS(src)** source + automated test; **PASS(live)** read-only probe of the deployed system this session;
**PASS(artifact)** inspected from a locally built release APK with the same dependency tree and Android config; **NOT_RUN** not
executed; **NOT VERIFIED** needs access this session did not have; **SKIPPED** deliberately not executed (reason given).

---

## REPORT A — Executive Android release audit

| Item | Value |
|---|---|
| Audit date | 2026-11-14 |
| Canonical branch | `integration/v2-autonomous-upgrade-20261112` |
| Canonical baseline SHA | `b8ec2a7dee42edfca60614b0611159309bbd8c70` (PR #59 merge). `git fetch` this session: remote tip = expected SHA. No drift during the audit. |
| Final candidate SHA | `b8ec2a7dee42edfca60614b0611159309bbd8c70` (unchanged — zero Android repairs; this audit branch adds only this report and its lane registration) |
| Working tree at baseline | Clean (`git status --short` = 0 lines before and after every gate; prebuild's `package.json` script rewrite was reverted) |
| Lockfile identity | `package-lock.json` SHA-256 `3092e6ca7ff8a3c028881be0d8aad819e9fcfaf1fa16e0a302611efae6d6aeb9`; `package.json` `7d5e4088…98e4be`. Unchanged since `494bcf8` and since `9b75343`. |
| Previous Android audit | `audit/android-v2-eas-readiness-20261113` @ `b5595ac` — 2 unique commits, both documentation (its report + a docs-only lane in `scripts-dev/meals-boundary-scan.cjs`). No Android code repair exists there to reconcile; its lane entry is not needed on integration. Not merged. Integration is 15 commits ahead of it. |
| Changes since last Android certification (`494bcf8`) | iPad readable column (`readableColumn.ts` + 4 call sites; returns `null` unless `Platform.OS === 'ios' && isPad` — Android style arrays unchanged), `ios.supportsTablet: true`, account-deletion backend repairs (HK-DEL-FIX-001..003) + one migration, docs. No Android config, dependency, permission or native change. |
| CI at exact SHA | Her Keys V2 Integration Gate, push run `43597346736`: success |
| Scope | Full Android app source, resolved config, generated native project, same-deps release APK, Production backend (read-only), public website, Play policy |
| Issues discovered | 14 (0 Android-only P0–P3; 6 Android-only P5–P9 observations; 5 shared; 3 external/operator) — see B, C, D |
| Issues repaired | 0 (no confirmed Android-only defect that can be repaired safely without device evidence) |
| Outstanding by severity | P1: 3 (EXT-01, EXT-02 web deletion/recovery not configured; SH-02 processor disabled) · P5–P6: 5 · P8–P9: 3 · gates: 3 |
| Tests | Full suite 5,680/5,682 (2 load-sensitive timing tests; 6/6 on immediate rerun; CI green at SHA) · focused Android/auth/deletion/Premium/calendar/AI subset 1,697/1,697 · tsc 0 errors · expo-doctor 21/21 · release preflight PASS |
| Backend | Production deletion request/recovery functions + recovery-delivery migration promoted; processor still `enabled=false, dry_run=true`; Premium checkout off |
| RevenueCat | **SKIPPED by owner direction** (known connection issue). Not an EAS blocker. Billing library version verified from source; purchase flow NOT YET DEVICE/STORE VERIFIED. |

**ANDROID EAS BUILD READINESS: PASS** at `b8ec2a7`. **GOOGLE PLAY SUBMISSION READINESS: FAIL** (public deletion and
recovery website non-functional; permanent deletion disabled in Production; Play Console unverified).

---

## Mandatory test execution (section 12)

All at `b8ec2a7`, Windows 11, Node 24.14.0 / npm 11.9.0, worktree `Her-Keys-AND03`, clean shell (no `EXPO_PUBLIC_*` exported).

| # | Command | Result | Notes |
|---|---|---|---|
| 1 | `npm ci --no-audit --no-fund` | PASS | 591 packages, 3 min; tree clean after |
| 2 | `npx -y npm@10.9.4 ci --dry-run --ignore-scripts` (CI's npm) | PASS | Lockfile accepted by npm 10 |
| 2b | `npm ls --all --omit=optional --depth=0` | PASS | No missing/invalid packages |
| 3 | `node --max-old-space-size=2048 node_modules/typescript/bin/tsc --noEmit` | PASS | 0 errors |
| 4 | ESLint | N/A | Repository has no ESLint config or lint script; `tsc` + `expo-doctor` are the static gates |
| 5 | `npm test` | 5,680 pass / 2 fail / 0 skipped of 5,682 | Fails: `tests/calendarPerformance.test.mjs:54`, `:65` (median 129 / 177 ms vs budget) with host at 0.6 GB free RAM and other sessions running. Rerun alone: 6/6 pass. CI run 43597346736 at this SHA: success. Classified as host load, not a defect (known flaky). |
| 6–12 | Focused subset: 105 files matching android/platformParity/releaseIdentity/nativeConfig/productionConsentBuild/permission/notification/deeplink/accountDeletion/revenue/premiumFinalConfig/calendar/inbox/consent/isolation/talkItOut/ai | 1,697/1,697 PASS | Auth + consent, household isolation, AI, Premium/RevenueCat (source-level), deletion/recovery, calendar, Smart Inbox |
| 13 | `npx -y expo-doctor@latest` | PASS | 21/21 |
| 14 | `npx expo install --check` | PASS | Dependencies up to date for SDK 57 |
| 15 | `npx expo config --type public --json` | PASS | `com.heykeys.app`, version 1.0.0, scheme `herkeys`, plugins as expected |
| 16 | `CI=1 npx expo prebuild --platform android --no-install` | PASS | Generated manifest/Gradle reviewed (Report §8); `/android` git-ignored |
| 17 | `npx expo export --platform android --max-workers 2` | PASS | `index-16237eb9….hbc`, 8.75 MB, Hermes magic `c6 1f bc 03`; contains Android deletion copy; no `IOS-FIX-002` string |
| 18 | Native dependency review (Gradle cache + POMs) | PASS | `react-native-purchases` 10.9.1 → `purchases-hybrid-common` 18.37.0 → `purchases` 10.20.0 → **Play Billing 8.3.0** |
| 19 | `eas env:exec production "npm run release:preflight"` (fresh clone `Her-Keys-REL01` fast-forwarded to `b8ec2a7`) | PASS | `RELEASE_IDENTITY=PASS`, `SOURCE_SHA = REMOTE_SOURCE_SHA = b8ec2a7`, branch authorized |
| 19b | Same with `EAS_BUILD=true` (exercises the in-build backend-target guard) | PASS | Production URL/key/data-mode/consent flag validated without printing values |
| 20 | `node scripts/verify-release-identity.mjs` | PASS | `ANDROID_APPLICATION_ID=com.heykeys.app` |
| 20b | `eas build:version:get -p android --profile production` | PASS | Remote versionCode **3** → next production build becomes **4** (`autoIncrement`) |
| 21 | `npm audit --omit=dev` | 3 high / 3 moderate, 0 critical | All Expo SDK transitive; see SH-04. Fix requires a semver-major SDK move. |
| 21b | Hermes bundle secret/endpoint scan | PASS | Staging ref, `sb_secret_`, `localhost` hits are the backend-match table, supabase-js key-prefix check and library dev fallbacks; no secret, no Staging URL, no `10.0.2.2` |
| 22 | Repair regression tests | N/A | No repairs |
| — | Meals boundary scan | Re-run after registering this lane (see commit) | Prior audit-branch change was a docs lane only; not needed on integration |
| — | Android emulator runtime | NOT_RUN | Host 0.6–1.8 GB free RAM with other agent sessions active; not represented as device certification |

---

## REPORT B — Android-only repair register

**Android-only repairs: 0.** Unsuccessful attempts: none.

No Android-only P0–P3 defect was confirmed. Every Android-specific observation either needs device evidence before a safe repair
(B-01, B-02), is an owner/product decision (B-03, B-04), or is cosmetic (B-06). All carry forward from the 11-13 audit unchanged,
re-verified against `b8ec2a7` (no Android file changed since).

| ID | Sev | Finding | Evidence | Why not repaired |
|---|---|---|---|---|
| B-01 (AND-OBS-01) | P5 unconfirmed | Keyboard under edge-to-edge (`edgeToEdgeEnabled=true`, target 36): forms rely on `adjustResize`; `SystemEditor` uses `behavior={Platform.OS==='ios'?'padding':undefined}`. Bottom fields may sit under the IME. | Generated `gradle.properties`, manifest `adjustResize` | Fix lives in shared `Screen`/editor; offset needs device measurement |
| B-02 (AND-OBS-02) | P5 unconfirmed | Process death while a Custom Tab is open drops the `herkeys://auth/callback` / `calendar-connected` return; user must retry | Source trace | Shared auth/calendar code; needs "Don't keep activities" repro |
| B-03 (AND-OBS-03) | P6 | At target 36, Android 16 ignores `screenOrientation="portrait"` on sw≥600dp; tablets/foldables get resizable landscape windows. (iOS now ships iPad with a readable column; Android has no equivalent.) | Manifest + platform change | Product decision + large-screen device pass |
| B-04 (AND-OBS-04) | P6 owner | `allowBackup="true"`; AsyncStorage household/child data is in Auto Backup; secure-store excluded by generated rules | Generated manifest | Privacy/product decision; must match Data Safety + privacy text |
| B-05 (AND-OBS-05) | P7 | Hardware Back swallowed while a welcome-tree request is in flight | Source | Intended, bounded by deadlines |
| B-06 (AND-OBS-06) | P9 | No monochrome adaptive icon (Android 13 themed icons); unused `USE_BIOMETRIC`/`USE_FINGERPRINT`; inert FCM receiver | Merged manifest | Cosmetic; needs a design asset |

---

## REPORT C — SHARED ANDROID/iOS DEFECTS — DOCUMENTED, NOT REPAIRED

| ID | Sev | File / lines | Component | Type | Evidence | Root cause | Android impact | iOS impact | Suggested repair | Verification | Release impact | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SH-01 (was AND-SH-01) | — | `scripts/verify-release-identity.mjs:21` | Release control | — | Preflight PASS this session | Fixed by PR #56 | — | — | — | — | — | **CLOSED** |
| SH-02 (was AND-SH-02) | P1 | Production `public.account_deletion_control`; cron `herkeys-account-deletion`; copy at `src/features/account/DeleteAccountPanel.tsx:26` | Account deletion | Operational / disclosure | Read-only SQL: `enabled=false, dry_run=true, last_run_at=null`; purge cron `active=false`. Panel says "automated permanent deletion removes your account-owned … records". | Processor intentionally not activated; promotion doc says destructive activation needs separate approval + legal sign-off | Requests are accepted and access is restricted, but no account is ever permanently deleted | Same | Owner/legal approval, then enable processor per the deletion runbook (emergency stop documented) | Hosted Staging + scoped Production activation evidence | Both — Play/App Store submission, not EAS | Documented — not repaired |
| SH-03 | P8 | `src/features/account/DeleteAccountPanel.tsx:30-31` | Account deletion UI | UX | Both "Apple subscriptions" and "Google Play subscriptions" buttons render on every platform | No platform gate | Android user sees an irrelevant Apple link | iOS user sees a Play link | Show the store matching `Platform.OS` (keep both in the email) | Panel render test per platform | Both, cosmetic | Documented — not repaired |
| SH-04 | P6 | `node_modules/expo-router` → `query-string` → `decode-uri-component` (high); `expo` → `@expo/fingerprint` → `minimatch` (moderate, build-time) | Deep-link parsing / tooling | Dependency security | `npm audit --omit=dev`: 3 high, 3 moderate | Pinned by Expo SDK 57; npm's "fix" is a semver-major SDK change | A crafted `herkeys://` link with malformed percent-encoding could stall URL decoding in the app (local DoS of the app only) | Same | Track the Expo SDK 57 patch that bumps `query-string`; do not force-override | `npm audit` + deep-link tests after bump | Both, low | Documented — not repaired |
| SH-05 | P5 unconfirmed | `app/+native-intent.tsx` (see B-02) | Auth / calendar return | Functional | Source | Cold-start return path not resumable on Android; iOS keeps the auth session in-process | See B-02 | Lower risk | Persist pending auth/calendar intent across process death | Device repro | Android mostly | Documented — not repaired |

Note: SH-02's in-app recovery dependency on the website is tracked as EXT-02 (Report D) because the defect is in the web deployment,
not in shared app code.

---

## REPORT D — Google Play submission-blocker register

Policy references (checked 2026-11-14): Target API requirements (Play Console Help 11926878), Account deletion requirements (13327111),
User Data policy (10144311), Policy announcement 2026-10-29 (18100766), Play Billing Library deprecation schedule.

| ID | Sev | Policy | Evidence | Status | Root cause | Android-only repair authorized? | Required action | EAS impact | Play impact | Verification needed |
|---|---|---|---|---|---|---|---|---|---|---|
| **EXT-01** | **P1** | Account deletion — working web resource without reinstall | `https://herkeys.app/delete-account` now serves the full flow (OTP, receipt, status). Read-only probe this session (fake 43-char receipt → "Check saved receipt"): page answered **"Account service is not configured for this deployment."** and made **no** network call. The deployed client chunk contains literal `n.env.NEXT_PUBLIC_SUPABASE_URL` / `…PUBLISHABLE_KEY` reads, i.e. the values were not inlined at build. | **CONFIRMED** | Website (`her-keys-web`) Production deployment built without `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | No (web repo / hosting) | Set both for the Production deployment (Production project `npykvnxnehlsdlbumzwk`, publishable key only), rebuild, verify OTP → receipt with a controlled inbox | None | **Blocks submission** | Controlled-inbox OTP + receipt + status |
| **EXT-02** | **P1** | Account deletion — recovery during grace; data-loss/lockout risk | `https://herkeys.app/account/restore` is now 200 (was 404) but its chunk has the same un-inlined env reads → recovery fails the same way. Recovery emails link only to this page (`deletionService.ts:139-140`), and the in-app gate's "Recovery and support" opens it (`DeletionGate.tsx:63`). | **CONFIRMED (static) / SUSPECTED end-to-end** | Same as EXT-01 | No | Same deployment fix; then hosted recovery test | Testers must **not** request deletion on accounts they need until fixed — the account would be locked with no working recovery | **Blocks submission** | Request → email → restore on a scoped account |
| SH-02 | P1 | Account deletion — associated data actually deleted | Processor disabled/dry-run in Production (Report C) | CONFIRMED | Activation not approved | No (shared/operator) | Approve + activate after legal review | None | **Blocks submission** (in-app and web copy promise deletion) | Activation evidence |
| PRIV | — | Privacy policy (HTML, contact) | `/privacy` now lists a privacy contact; full HTML policy at `/legal/her-keys-full-privacy-policy.html` (200). Summary does not name Supabase or RevenueCat as processors; no legal entity named. | Previously FAIL → now **PASS with notes** | — | — | Legal: name processors/entity in the full policy if not already | — | Low | Legal read of full policy |
| TGT | — | Target API 36 for new apps/updates after 2026-08-31 | target 36, compile 36, min 24 (RN catalog; APK `targetSdkVersion:'36'`) | PASS | — | — | — | — | — | — |
| BILL | — | Play Billing Library ≥ 8 (PBL 7 deprecated 2026-08-31) | PBL **8.3.0** via RevenueCat chain (Gradle cache POMs) | PASS(src) | — | — | — | — | — | Store purchase test (**SKIPPED**: RevenueCat by owner direction; checkout disabled in Production) |
| PERM | — | Restricted permissions | Merged manifest (APK, same deps/config): coarse location, camera, notifications, boot, vibrate, internet, network state, wake lock, BILLING, biometric, storage ≤ API 32, install-referrer bind, launcher badges. **Absent:** fine/background location, SMS/call log, contacts, `READ_MEDIA_*`, all-files, exact alarm, foreground service, accessibility, `RECORD_AUDIO` (removed), `SYSTEM_ALERT_WINDOW` (removed), `AD_ID`. | PASS | — | — | — | — | No declaration form needed | — |
| OCT29 | — | Local Network (API 37+), Manage Contacts, AppFunctions, subscription disclosures | No such permission/API; target 36 | N/A now | — | — | Revisit before targeting API 37 | — | — | — |
| 16KB | — | 16 KB page size | `expo.useLegacyPackaging=false`; NDK r27, AGP 8.12; x86_64 APK (same deps) passes `zipalign -c -P 16`; prior run: 24/24 `.so` 16 KB LOAD-aligned | PARTIAL | — | — | Recheck arm64-v8a on the real AAB | — | Verify on AAB | `zipalign -P 16` + ELF check on AAB |
| DS | gate | Data Safety | Proposed reconciliation in the 11-13 report still applies; add install-referrer (RevenueCat) and ML Kit/datatransport diagnostics review | NOT VERIFIED | — | — | Owner fills form | — | Required | Console |
| CONSOLE | gate | App access, signing, tracks, content rating, target audience (18+ per privacy page), store listing, subscription products, deletion URL field | No Play Console access this session | **NOT VERIFIED** | — | — | Owner review; deletion URL field must point to `https://herkeys.app/delete-account` **after** EXT-01 is fixed | — | Required | Console |
| AAB | gate | Real artifact | No AAB built (by mandate) | NOT VERIFIED | — | — | Build, inspect signing SHA-1 (`27:EF…` expected), versionCode 4, ABIs, 16 KB | — | Required | Artifact audit |

No claim is made that Google will approve or reject the app.

---

## REPORT E — Production feature activation matrix

`Implemented | Integrated | Enabled | Authorized/Entitled | User-facing | Tested | Accurately advertised`. Device columns are
NOT VERIFIED throughout (no emulator/device run this session). "Tested" = source + automated suite.

| Feature | Impl | Integr | Enabled (Prod) | Auth/Entitled | User-facing | Tested | Advertised |
|---|---|---|---|---|---|---|---|
| Welcome / onboarding / consent gate | PASS | PASS | PASS (consent flag `true` in EAS prod) | PASS | PASS | PASS(src) | PASS |
| Email/password, OTP, forgot password | PASS | PASS | PASS (prior live settings read) | PASS | PASS | PASS(src) | PASS |
| Google sign-in | PASS | PASS | PASS (provider on) | PASS | PASS | PASS(src); native consent NOT VERIFIED | PASS |
| Apple sign-in | iOS only | n/a | n/a | n/a | Not on Android | PASS(src) | n/a |
| Session persistence / logout | PASS | PASS | PASS | PASS | PASS | PASS(src) | PASS |
| Today / Daily Load | PASS | PASS | PASS (`daily_load_premium` released) | PASS (Premium tier server-gated) | PASS | PASS(src) | PASS |
| Talk It Out / AI assistant | PASS | PASS | PASS (`herkeys-ai` v15, verify_jwt; `talk_it_out` free, released) | PASS (consent + JWT) | PASS | PASS(src); live Gemini turn NOT VERIFIED | PASS |
| AI response reporting | PASS | PASS | PASS (expiry cron active) | PASS | PASS | PASS(src) | PASS |
| Smart Inbox | PASS | PASS | PASS (`smart-inbox-extract` v7; feature released, Premium, AI consent) | PASS | Premium only — checkout off, so not reachable for new users | PASS(src) | NOT VERIFIED (depends on store listing copy) |
| Momentum weekly review | PASS | PASS | PASS (released, Premium) | PASS | Premium only | PASS(src) | NOT VERIFIED |
| Village / Co-Parent Plus | PASS | PASS | **Not released** (`enabled=false`) | n/a | No | PASS(src) | Must not be advertised |
| Calendar (local) + Google Calendar | PASS | PASS | PASS (`calendar-oauth` v14, `calendar-data` v12) | PASS | PASS | PASS(src); live OAuth NOT VERIFIED | PASS |
| Kids, Home, Co-parenting, Meals, Money, Work, Me, Life Admin, People | PASS | PASS | PASS (sync contract) | PASS (RLS) | PASS | PASS(src) | PASS |
| Documents + on-device OCR | PASS | PASS | PASS | n/a | PASS | PASS(src) | PASS |
| Weather / coarse location | PASS | PASS | PASS (`weather-context` v12) | PASS | PASS | PASS(src) | PASS |
| Local notifications | PASS | PASS | PASS | n/a | PASS (opt-in) | PASS(src) | PASS |
| Push notifications | Not implemented | — | — | — | No | — | Must not be advertised |
| Premium state / gating | PASS | PASS | PASS (`premium_enabled=true`) | PASS | PASS | PASS(src) | PASS |
| Subscription purchase / restore | PASS | PASS (PBL 8.3.0) | **Not enabled** (`checkout_enabled=false`) | — | No | **SKIPPED** (RevenueCat, owner direction) | Must not be advertised as purchasable |
| Account deletion — request (in-app) | PASS | PASS | PASS (`request-account-deletion` v8) | PASS (recent verified session) | PASS | PASS(src) | **FAIL** (promises automated permanent deletion) |
| Account deletion — restrict access | PASS | PASS | PASS | PASS | PASS | PASS(src) | PASS |
| Account deletion — recovery | PASS | PASS (function v8 + migration applied) | **FAIL** (website not configured — EXT-02) | — | Link opens broken page | PASS(src) | FAIL |
| Account deletion — permanent processing | PASS | PASS | **FAIL** (`enabled=false, dry_run=true`) | — | — | PASS(src) | FAIL |
| Account deletion — provider cleanup proof | PASS | PASS | Not exercised (processor off); monitor + proof-expiry crons active, retention last success 2026-11-14 13:25 UTC | — | — | PASS(src) | n/a |
| Web deletion request | PASS (deployed UI) | **FAIL** (no backend config) | **FAIL** | — | Error shown | PASS(live probe) | FAIL |

---

## Production backend (read-only, this session)

| Check | Result |
|---|---|
| Migrations | 40 applied, newest `20261114132025 account_deletion_recovery_delivery_20261114` (the repo's `20261114020529` under a promotion timestamp) |
| Edge Functions | 19 ACTIVE. Deletion set + Premium set at v8 (updated 2026-11-14); `herkeys-ai` v15, `calendar-oauth` v14, `calendar-data` v12, `weather-context` v12, `smart-inbox-extract` v7 |
| Deletion control | `enabled=false`, `dry_run=true`, `batch_size=1`, `last_run_at=null`; no deletion requests exist |
| Cron | purge `*/5` **inactive**; monitor `2-59/5` active; proof expiry `17 3 * * *` active; AI report expiry active |
| Retention control | enabled, last success 2026-11-14 13:25 UTC |
| Premium runtime | `premium_enabled=true`, `checkout_enabled=false`, `test_store_checkout_enabled=false`, `allow_test_fixtures=false`, `webhook_processing=true` |
| EAS `production` env | `EXPO_PUBLIC_SUPABASE_URL`, `…PUBLISHABLE_KEY`, `REVENUECAT_ANDROID/IOS_API_KEY`, `HERKEYS_BACKEND`, `DATA_MODE`, `V2_CONSENT_GATE`; profile overrides to `production`/`empty`/`true`, store `native`. Validated by the EAS-mode guard; values not printed. |

Not verified: Production function secrets, SMTP/Resend delivery, Supabase redirect allow-list, live Gemini output, Google consent screen,
RevenueCat (skipped).

---

## Android native configuration (section 8)

- Expo SDK 57 (`expo ~57.0.33`), RN 0.86.3, AGP 8.12.0, Kotlin 2.1.20, Gradle 9.3.1, build-tools 36.0.0, NDK 27.1.12297006, min 24 /
  target 36 / compile 36, New Architecture on, Hermes on, edge-to-edge on, `useLegacyPackaging=false`, 4 ABIs.
- `MainActivity`: `singleTask`, exported (launcher), `adjustResize`, portrait, `enableOnBackInvokedCallback=false` (predictive back opted
  out; allowed at 36, must be revisited before API 37).
- Intent filters: LAUNCHER; `herkeys` scheme only (no host/path, no App Links). Every link passes `+native-intent` and route guards.
- `allowBackup=true` with secure-store backup + data-extraction rules; no cleartext flag; `expo-updates` `ENABLED=false`.
- Release signing: template `signingConfigs.debug` is replaced by EAS-managed credentials at build; historic EAS keystore for
  `com.heykeys.app` = SHA-1 `27:EF…C1:E5`. Current Play upload/app-signing certificates NOT VERIFIED.
- Release identity guard runs inside EAS via `eas-build-post-install`.

---

## REPORT F — Final release decision

**DECISION 1: ANDROID EAS BUILD READINESS — PASS**

Pinned source `b8ec2a7dee42edfca60614b0611159309bbd8c70` on `integration/v2-autonomous-upgrade-20261112`; clean locked install
(npm 11 and CI's npm 10); typecheck, expo-doctor, install check, prebuild and Hermes export pass; full suite passes except two
host-load timing tests that pass on rerun and in CI at this SHA; real `release:preflight` with EAS Production values passes, including
the in-build backend guard; remote versionCode 3 → 4. No unresolved defect prevents creating or safely testing the Android artifact.
Conditions: owner confirms EAS build quota and that versionCode 4 exceeds every Play upload; testers must not request account deletion
on accounts they need until EXT-01/02 are fixed.

**DECISION 2: GOOGLE PLAY SUBMISSION READINESS — FAIL**

Confirmed blockers EXT-01, EXT-02 (website deletion/recovery not configured) and SH-02 (permanent deletion disabled while the app and
website promise it). Not verified: Play Console declarations, Data Safety, signing certificates, AAB 16 KB/arm64, store purchase
(RevenueCat skipped), device/runtime evidence on Android 13–16.

---

## ANDROID RELEASE CANDIDATE

- Branch: `integration/v2-autonomous-upgrade-20261112` (audit report on `audit/android-v2-final-pre-eas-20261114`)
- Baseline SHA: `b8ec2a7dee42edfca60614b0611159309bbd8c70`
- Final SHA: `b8ec2a7dee42edfca60614b0611159309bbd8c70`
- Working-tree status: clean
- Tests passed: 5,680 full suite (+1,697 focused rerun, +6 timing rerun); 9 config/static gates PASS
- Tests failed: 2 (calendar timing under host load; pass on rerun and in CI)
- Tests skipped: 0 automated; SKIPPED by design: RevenueCat/store purchase, emulator runtime, AAB checks
- Android-only repairs: 0
- Shared defects documented: 4 open (SH-02..SH-05), 1 closed (SH-01)
- Confirmed Google Play blockers: 3 (EXT-01, EXT-02, SH-02)
- Remaining verification: Play Console, Data Safety, AAB signing/16 KB, device pass (Android 13–16, large screen, keyboard, process death), RevenueCat purchase on an uploaded build

**ANDROID EAS BUILD READINESS: PASS**

**GOOGLE PLAY SUBMISSION READINESS: FAIL**

**BUILD AUTHORIZATION: APPROVED** (EAS production build of `b8ec2a7` for internal testing; not approved for Play production submission)
