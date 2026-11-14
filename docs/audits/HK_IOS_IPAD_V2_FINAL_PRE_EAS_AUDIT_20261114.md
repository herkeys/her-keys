# Her Keys AI V2 — Final iOS / iPadOS Pre-EAS Release Audit (2026-11-14)

**iOS EAS BUILD READINESS: PASS** at `b8ec2a7dee42edfca60614b0611159309bbd8c70` on `integration/v2-autonomous-upgrade-20261112`.
**APPLE SUBMISSION READINESS: FAIL** (Production permanent deletion is disabled while the app tells users it happens automatically; App Store Connect, device, and RevenueCat evidence are not verified).

No real EAS build, TestFlight upload, App Store submission, merge, or backend change was made. Production was read only.

## Report A — Executive summary

| Item | Value |
|---|---|
| Baseline SHA | `b8ec2a7dee42edfca60614b0611159309bbd8c70` (remote integration HEAD after `git fetch --all --prune`; matches the stated checkpoint, no drift during the audit) |
| Final candidate SHA to build | `b8ec2a7dee42edfca60614b0611159309bbd8c70`. No source repairs, so the build SHA equals the baseline. |
| Audit branch | `audit/ios-ipad-v2-final-pre-eas-20261114` (worktree `Her-Keys-IOS03`), created at the baseline. It adds only this report and its boundary-scan lane entry. |
| Preflight clone | `Her-Keys-V2REL03`: fresh clone of the integration branch, reset to the remote at `b8ec2a7`, clean tree, upstream equal to HEAD |
| Working tree at baseline | Clean (0 changed files) |
| Changes since previous iOS audit (`0b1f578`) | 7 commits (#57/#58/#59). There are 23 files: Supabase deletion functions, one migration, deletion tests, docs, CI and the boundary scan. **No app source (`src/`, `app/`), `app.json`, `eas.json`, or iOS config changed.** The previous audit branch has no unmerged commits (`git log b8ec2a7..origin/audit/ios-ipad-v2-eas-readiness-20261113` is empty). |
| Defects found | 0 new iOS-only; 4 shared or operational findings (Report C); 5 submission findings (Report D) |
| Defects repaired | 0 (no confirmed iOS-only defect) |
| Tests executed | 5,682 automated tests (full suite) plus targeted reruns of 55 iOS, 106 deletion and 11 release-identity tests. Every test passed, none failed and none were skipped. Also: typecheck, identity, Production preflight, expo-doctor 21/21, config introspection and a Production iOS Hermes export. |
| RevenueCat / StoreKit | **SKIPPED by owner direction** (known RevenueCat connection issue). Untested. This is not a build-readiness blocker. |

## Test execution log (all on `b8ec2a7`)

| # | Command | Result | Ran? |
|---|---|---|---|
| 1 | `npm ci` (lockfile, Node 24.14.0 / npm 11.9.0) | PASS: 591 packages; 6 advisories (see C-03) | Yes |
| 2 | `npm run typecheck` (`tsc --noEmit`) | PASS, 0 errors | Yes |
| 3 | ESLint | No ESLint configuration or script exists in the repo | Unavailable |
| 4 | `npm test` (full `tests/**/*.test.mjs`, 1,130 suites) | **5,682 / 5,682 pass**, 0 fail, 0 skip (164 s) | Yes |
| 5 | `tests/ios/*.test.mjs` (Apple nonce, iPad support, keyboard insets, native config) | 55 / 55 | Yes |
| 6 | `tests/accountDeletion/*.test.mjs` | 106 / 106 | Yes |
| 7 | `tests/releaseIdentity.test.mjs` | 11 / 11 | Yes |
| 8 | Auth, consent, Premium, Calendar and AI suites | Included in #4 (all pass) | Yes |
| 9 | `npx expo-doctor@latest` | **21 / 21 checks pass** | Yes |
| 10 | `npx expo config --type introspect` with Production profile env | PASS: bundle `com.herkeys.app`, build 2, `supportsTablet: true`, entitlements Sign in with Apple + aps-environment | Yes |
| 11 | `npm run verify:release-identity` | `RELEASE_IDENTITY=PASS` | Yes |
| 12 | `eas env:exec production "npm run release:preflight"` (fresh clone, integration branch) | **`RELEASE_IDENTITY=PASS`**, BRANCH=`integration/v2-autonomous-upgrade-20261112`, SOURCE_SHA = REMOTE_SOURCE_SHA = `b8ec2a7…`, Production backend target and consent gate validated (values not printed) | Yes |
| 13 | `eas env:exec production "npx expo export --platform ios"` | **PASS**: 2,047 modules, Hermes bytecode `index-17171fc1….hbc` (8.4 MB) | Yes |
| 14 | Bundle scan of #13 | Production ref present. Staging ref appears once, only as the `PROJECT_REF` guard constant in `src/config/supabase.ts` (not an endpoint). No `service_role`, `sk_live`/`sk_test`, `localhost:54321`, `HK_AUTH_DIAG`, or demo credentials. The RevenueCat `appl_` key is a public SDK key. | Yes |
| 15 | `npm audit --omit=dev` | 3 moderate, 3 high (C-03) | Yes |
| 16 | Simulator or device run | No macOS or Xcode on this Windows host | **Not run** |
| 17 | Live StoreKit, sandbox or TestFlight purchase/restore | Owner-directed skip | **Skipped** |

## iOS native configuration (resolved)

| Check | Evidence | Result |
|---|---|---|
| Bundle ID / name / version / build | `com.herkeys.app`, "Her Keys", 1.0.0, build `2` (`appVersionSource: remote` + `autoIncrement` in production profile) | PASS |
| Deployment target | SDK 57 template `IPHONEOS_DEPLOYMENT_TARGET = 16.4`, Podfile `platform :ios, '16.4'` | PASS (≥ Apple's iOS 13 floor) |
| Toolchain | Apple requires Xcode 26+ / iOS 26 SDK (since 2026-04-28, checked on developer.apple.com today). `eas.json` sets no `image`, so `auto` → `sdk-57` = `macos-tahoe-26.5-xcode-26.6`. **Do not set `image: latest`** (Xcode 27 needs `ios.enableSceneSupport` on SDK 57). | PASS |
| JS engine | Template `Podfile.properties.json` `expo.jsEngine: hermes`; Hermes export succeeded | PASS |
| iPad | `supportsTablet: true`; `~ipad` all four orientations, `UIRequiresFullScreen: false` (multitasking); iPhone portrait only; iPad readable column (prior audit IOS-FIX-002, unchanged) | PASS (source); no iPad device evidence |
| ATS | The real SDK 57 template has `NSAllowsArbitraryLoads=false` and `NSAllowsLocalNetworking=true`. The `true` value in Windows introspection is only the `withIosBaseMods` fallback. | PASS |
| Device capabilities | Template `arm64` | PASS |
| Sign in with Apple | `usesAppleSignIn` → `com.apple.developer.applesignin: [Default]`; nonce tests 55/55 suite | PASS |
| Push | `aps-environment` comes from the `expo-notifications` plugin. The app uses **local notifications only**, with no remote token requests. Harmless; App Store signing sets the value to production. | PASS (note) |
| Purpose strings | Location When-In-Use (weather; foreground only, no Always). Camera and Photos (on-device OCR via `expo-image-picker`). Microphone disabled. **Motion** and **Face ID** have no direct app call, but `expo-location` links CoreMotion (`MotionActivityStreamer.swift`) and `expo-secure-store` links `LocalAuthentication`. Removing either string would risk ITMS-90683, so both stay. | PASS |
| Privacy manifests | RN `privacy_file_aggregation_enabled: true` aggregates pod manifests (async-storage, expo-application/constants/file-system/notifications/system-ui, plus RN's file-timestamp/UserDefaults/boot-time reasons). There is no app-level `ios.privacyManifests` override. | PASS (source); confirm in the built archive |
| Export compliance | `ITSAppUsesNonExemptEncryption: false` | PASS |
| URL schemes | `herkeys`, `com.herkeys.app` | PASS |

## Report B — iOS-only repair register

**None.** The app source and iOS config are byte-identical to the iOS candidate certified at `8b13fc0`, whose three earlier iOS repairs (Apple nonce, keyboard insets, iPad readable column) are still present and tested (55/55). Every iOS item reviewed passed or is an operational or shared gate. No safe, justified P0–P10 iOS-only change was identified, so none was made.

## Report C — SHARED iOS/ANDROID DEFECTS — DOCUMENTED, NOT REPAIRED

| ID | Sev | Location | Component | Type | Evidence | Root cause | iOS effect | Android effect | Suggested repair | Tests needed | Release impact | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-01 | P1 | `src/features/account/DeleteAccountPanel.tsx:26` (copy); Production `account_deletion_control` | Account deletion | Compliance / integration | Production read 2026-11-14: `enabled=false`, `dry_run=true`, cron `herkeys-account-deletion` **inactive**. The copy says "After that, automated permanent deletion removes your account-owned … records." | The permanent-deletion processor was deliberately left disabled after the backend parity work (owner gate G6). | A user can request deletion and be deactivated, but permanent erasure never runs in Production, so the in-app statement is not true today. | Same; also Play's deletion policy | Owner activates the Production worker after the G5/G6 gates (hosted Production rehearsal, rollback, Apple revocation credentials, monitoring). Do **not** soften the copy to hide the gap. | Production scoped lifecycle like Staging Phase 4 (request → recovery → deadline → verified purge → completion mail) | **Submission blocker** (Apple 5.1.1(v)); not an EAS build blocker | Documented, not modified |
| C-02 | P2 | Production Edge secrets (`APPLE_DELETION_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY`) | Deletion: Sign in with Apple revocation | Integration | These four were absent in Staging (Phase 4 doc). Production secret listing returns 403, so they were not verified. | Apple revocation credentials have not been provisioned or verified | Apple asks apps using SIWA to revoke tokens on deletion. The copy already discloses the fallback. | None (Apple-only provider, shared backend) | Provision the four secrets in Production and run one live revocation | Live SIWA revoke on a test Apple ID | Submission risk | Documented, not modified |
| C-03 | P6 | `node_modules/expo-router` → `query-string` → `decode-uri-component` (high); `expo` → `@expo/fingerprint` → `minimatch` (moderate) | Dependencies | Security (DoS) | `npm audit --omit=dev`: 3 high, 3 moderate, no critical | Upstream transitive versions in the Expo SDK 57 lockfile | A malformed percent-encoded deep link could cause slow decoding in the client. `minimatch` is build-time only. | Same | Take the next Expo SDK 57 patch that bumps `query-string`. **Do not** patch-bump `expo` alone (known nesting of expo-modules-core). | Full suite, doctor, exports | Follow-up; not a blocker | Documented, not modified |
| C-04 | P7 | `https://herkeys.app/privacy` | Privacy policy page | Content | The page is a summary that defers to a full PDF. It does not state the 30-day recovery window the app describes. | Website content lags the deletion design | Reviewers may compare the in-app copy with the policy | Same (Play Data Safety) | Publish the full policy, including the recovery window and deletion timing, once Legal approves the promotion-and-policy wording | Content review | Submission risk | Documented, not modified |

Change since the 2026-11-13 audits: `https://herkeys.app/account/restore` is now **200** with a working-looking restore form (it was 404). `/delete-account` now shows a code-verification flow (it was a placeholder). Neither flow was exercised end to end against Production in this audit.

## Report D — Apple submission blocker register

| ID | Guideline / requirement | Evidence | Confirmed? | iOS-only repair authorized? | Required resolution | EAS effect | Submission effect |
|---|---|---|---|---|---|---|---|
| D-01 | 5.1.1(v) account deletion | C-01 | Confirmed (Production read) | No (shared backend activation) | Activate and certify the Production deletion worker, or have Legal approve accurate copy for a staged rollout | None | **Blocker** |
| D-02 | 5.1.1(v) SIWA token revocation | C-02 | Suspected (credentials unverified) | No | Provision and verify Apple deletion credentials | None | Risk |
| D-03 | 3.1.1 / 3.1.2 subscriptions | Production `checkout_enabled=false`, `premium_enabled=true`. RevenueCat and StoreKit were **skipped by owner direction**. Paywall price and renewal disclosure, Restore Purchases (present in Account), and purchase were not live-tested. | Not verified | n/a | Sandbox/TestFlight purchase + restore + IAP records in ASC, or ship with Premium purchase off and no unbuyable Premium claims | None | Not verified |
| D-04 | 2.1 completeness / reviewer access | No demo account or review notes were read; App Store Connect not accessed | Not verified | n/a | Operator: create a review account and write review notes covering AI consent, calendar OAuth and deletion | None | Not verified |
| D-05 | App Store Connect metadata, App Privacy, age rating, screenshots (iPhone + 13-inch iPad) | No ASC access in this session | Not verified | n/a | Operator reads ASC and fills App Privacy (AI provider sharing, children's data entered by parents, location coarse), age rating questionnaire and iPad 13" screenshots | None | Not verified |

The toolchain (Xcode 26 / iOS 26 SDK), export compliance, purpose strings, ATS and privacy-manifest aggregation pass at the source level.

## Report E — Feature activation matrix

Columns: Implemented | Integrated | Enabled (Prod) | Entitled/Authorized | User-facing | Tested | Advertised accurately

| Feature | Impl | Integr | Enabled | Auth | User-facing | Tested | Accurate |
|---|---|---|---|---|---|---|---|
| Auth (email OTP/password, SIWA, Google) | PASS | PASS (Prod URL in bundle) | NOT VERIFIED (no device sign-in) | PASS (tests) | PASS | PASS (suite) | PASS |
| Consent gate (legal + AI) | PASS | PASS (`EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE=true` enforced by preflight) | PASS | PASS | PASS | PASS | PASS |
| Today / Home, Household, Kids, Tasks, Meals, Money, Life records, People, Rebuild | PASS | PASS | NOT VERIFIED on device | PASS (RLS/isolation tests) | PASS | PASS (suite) | PASS |
| Calendar + Google Calendar OAuth | PASS | PASS (calendar-oauth repaired in Prod per prior audits) | NOT VERIFIED this audit | PASS | PASS | PASS | PASS |
| AI assistant (Talk It Out, herkeys-ai) | PASS | PASS | NOT VERIFIED (no live call this audit) | PASS (consent + account-boundary tests) | PASS | PASS (suite; live eval not run) | NOT VERIFIED vs ASC disclosures |
| AI response reporting | PASS | PASS | PASS (`herkeys_ai_report_expiry` cron active) | PASS | PASS | PASS | PASS |
| Local notifications | PASS | n/a | PASS | n/a | PASS | PASS | PASS |
| Weather (coarse location) / OCR (on-device) | PASS | PASS | NOT VERIFIED on device | PASS | PASS | PASS | PASS |
| Premium (status, tools, restore) | PASS | NOT VERIFIED (RevenueCat skipped) | **FAIL**: purchase off (`checkout_enabled=false`) | NOT VERIFIED | PASS | PASS (source suites) | NOT VERIFIED |
| Account deletion: request, deactivate, recovery mail | PASS | PASS (Prod recovery migration `20261114132025` applied; monitor cron active) | PASS for request and recovery | PASS | PASS | PASS (106 tests; Staging hosted Phase 4) | PASS |
| Account deletion: permanent purge | PASS | PASS | **FAIL** (worker disabled in Prod) | n/a | n/a | PASS on Staging only | **FAIL** (copy says automated) |

## Report F — Final release recommendation

**Decision 1 — iOS EAS BUILD READINESS: PASS** at exact SHA `b8ec2a7dee42edfca60614b0611159309bbd8c70` on `integration/v2-autonomous-upgrade-20261112`. The candidate is pinned and pushed (remote = local). Production preflight, typecheck, the full suite (5,682/5,682), doctor (21/21) and the Production iOS Hermes export all pass. Resolved native config is valid for Xcode 26.6 / iOS 26 SDK. No EAS-blocking or unsafe behavior was found for a controlled build.

Build from the integration branch, not the audit branch (the preflight's allow-list refuses audit branches by design). Keep `image` unset (or `sdk-57`). If anything merges first, rerun `eas env:exec production "npm run release:preflight"` on the new SHA.

**Decision 2 — APPLE APP STORE SUBMISSION READINESS: FAIL**, driven by D-01 (Production permanent deletion disabled while the in-app copy says it is automated). D-02 through D-05 are NOT FULLY VERIFIED: SIWA revocation credentials, RevenueCat/StoreKit purchase and restore (skipped by owner direction), reviewer access, App Store Connect metadata, App Privacy and screenshots. No physical iPhone/iPad or simulator evidence exists from this host.

**Remaining blockers:** D-01 (Production deletion activation; owner gate G6). Before submission, verify D-02, D-03 (RevenueCat, deferred), D-04 and D-05. Device verification of the TestFlight build on an iPhone and a 13-inch iPad is also required.
