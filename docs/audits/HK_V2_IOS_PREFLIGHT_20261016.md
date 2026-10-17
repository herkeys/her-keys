# Her Keys V2 — iOS Hostile Submission Preflight

**Audit date:** 2026-10-16 (America/New_York)  
**Scope:** iOS only, `com.herkeys.app`.  
**Authoritative candidate:** `integration/v2-ui02dm-rc-ai-convergence-20261016` @ `d775b1fadea6e4d5b1da4a8e81738f539231a5e5`; draft [PR #32](https://github.com/herkeys/her-keys/pull/32).  
**Isolated iOS repair/review branch:** `audit/ios-v2-preflight-20261016`, forked from that exact SHA.  
**Overall decision:** **IOS_RELEASE_CANDIDATE=FAIL**. No upload, distribution, store submission, Production mutation, entitlement grant or shared-source edit authorized by this audit.

## A. Executive assessment

The nominated source was independently confirmed as the current exact head of PR #32. It includes the UI02 design stack, adaptive appearance, a selected RevenueCat actor/identity hardening patch and a source-only unconditional AI-consent guard. CI is red with 11 failed application tests. Production Premium backend infrastructure is deployed and Stage 1 feature flags are marked released, but Production checkout is OFF; native Apple product catalog mapping is absent in RevenueCat and its App Store Connect API credential is not installed. The live Talk It Out AI Edge Function still has an environment-conditional consent check unlike the candidate's unconditional source check. Production deletion infrastructure exists but its processor is disabled and dry-run; operational deletion has not been certified. No signed iOS binary, App Store Connect metadata, or real iPhone runtime evidence could be inspected here. These are real release gates, not assumptions.

**Evidence levels:** VERIFIED = direct connector/provider/source read; SOURCE_ONLY = source or CI static validation without device execution; FAILED = test/provider control returned a failure; NOT_VERIFIED/NOT_RUN = inaccessible, untested or cannot be certified from available access. No previous iOS PASS was carried forward as a present-day native PASS.

## B. Exact source and CI

| Field | Evidence |
|---|---|
| GitHub repo and candidate | `herkeys/her-keys`, `integration/v2-ui02dm-rc-ai-convergence-20261016` |
| ENTRY SHA | `d775b1fadea6e4d5b1da4a8e81738f539231a5e5` |
| PR | [#32](https://github.com/herkeys/her-keys/pull/32), open/draft/unmerged, base `design/hk-fe-ui-02-adaptive-appearance-20261016` |
| Source ancestry | PR27 `23dc2d7`; PR28 `c97d4f2`; PR29 `ca9e792`; PR31 `f88648b` |
| CI evidence | [Run 38979428222](https://github.com/herkeys/her-keys/actions/runs/38979428222), job `117236536429`, completed FAILURE; 5,042 total / 5,031 pass / 11 fail |
| Failed CI | 8 deletion checks (`unclassified_resource` / `terminal_verification_failed`); 3 `tests/premiumHome/home.test.mjs` tests: purchase didn't invoke `manual_upgrade` and cancellation/no-offering copy didn't match |
| Passing CI steps | dependency install; backend protection; release identity; TypeScript; launch-critical Welcome/Premium 125 tests; Expo install; Expo Doctor; public/native Expo config; evidence boundary |
| Native artifact | None confirmed; no EAS build ID, IPA hash, signature, Xcode version or App Store Connect processing result |
| Repair commits | `006d75fb2144c0050b52e1b840f95799d9154829` (iOS photo purpose); `2f98261992b5c08811efed25520f6380aa28678b` (iOS purpose regression assertions) |
| Repair diff | Exactly `app.json` and `tests/ios/nativeConfig.test.mjs`; 2 commits ahead, 0 behind ENTRY. No merge. |
| Exit validation | **NOT_RUN** in this connector environment; do not label this repair CI-certified |

The integrated design/appearance source deliberately supersedes the October 13 light-only policy. Do not force `UIUserInterfaceStyle=Light` back into this candidate.

## C. Apple compliance matrix (official baseline checked 2026-10-16)

| Requirement | Applicability, evidence and disposition |
|---|---|
| 2.1 App Completeness | FAIL for public release: red CI, no native build or authorized iPhone E2E, missing native subscription products |
| 2.3 Accurate metadata | NOT_VERIFIED: App Store Connect listing/screenshots not accessible; app's Premium promises need real feature demonstrations |
| 3.1.1 Purchase/restore | FAIL commercially: iOS RC app has no mapped native Apple products; account-level Restore control exists in current `AccountPanel.tsx` but not tested against StoreKit |
| 3.1.2 Subscription value/trials | NOT_VERIFIED for Apple: Stage 1 features source/backend exist; no paid customer E2E or ASC product/trial/region proof |
| 4.2 Minimum functionality | SOURCE_ONLY: Today/Life/Calendar/Systems/AI modules and client integration present; no physical-device evidence |
| 4.8 Login alternatives | SOURCE_ONLY: native Apple, Google and email sign-in adapters exist; eligible Apple-auth runtime test NOT_RUN |
| 5.1.1 Privacy / deletion | FAIL release evidence: current Production deletion processor is disabled and dry-run; no completed user-visible delete E2E proven |
| 5.1.2 Data use / AI | FAIL certification: deployed `herkeys-ai` has a conditional server consent guard; exact runtime toggle and authenticated denial tests not demonstrated |
| Native privacy manifests / SDK signatures | NOT_VERIFIED: pods and actual aggregated binary manifests not inspected |
| Current toolchain | Since 2026-04-28, upload requires Xcode 26+ and iOS 26 SDK; actual build version NOT_RUN |
| Minimum deployment target | Since 2026-09-09 upload target must be iOS 13+; actual generated iOS target NOT_RUN |
| Updated age-rating questions | Required in ASC by 2026-01-31; current app's questionnaire NOT_VERIFIED |

Official sources: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [upcoming requirements](https://developer.apple.com/news/upcoming-requirements/), [deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [Photos usage string](https://developer.apple.com/documentation/bundleresources/information-property-list/nsphotolibraryusagedescription), [StoreKit restore](https://developer.apple.com/documentation/storekit/restoring-purchased-products), [privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files).

## D. iOS native and signing preflight

SOURCE_ONLY: `app.json` declares name Her Keys, version `1.0.0`, bundle `com.herkeys.app`, build number `2`, Apple Sign-In, `supportsTablet=false`, portrait orientation, `userInterfaceStyle=automatic` and light/dark splash assets. Correct app EAS project `7b25f8fe-d7de-49c1-ba69-1fd3a065826a`. The native config test expects Sign in with Apple and push-APNs entitlements and automatic appearance, but generated signed entitlement bytes are NOT_RUN. `expo-system-ui`, `expo-status-bar`, native purchase SDK and `expo-apple-authentication` are declared.

`eas.json` profile `production` selects Production backend with consent gate true and empty data mode; `preview` selects Staging. Effective EAS remote variables, provisioning team, signing cert/profile, push capability, privacy manifest, iOS deployment target, Xcode version, asset validation, URL scheme in actual Info.plist, installed StoreKit framework behavior and compiled `.ipa`: **NOT_VERIFIED / NOT_RUN**. The prior audit's no-registered-UDID observation relates to ad hoc internal installation; TestFlight instead needs a processed App Store-signed binary.

**IOS-I01 iOS-only controlled repair:** The original `expo-image-picker` plugin specified `photosPermission:false` even though the app can pick a document photo and its dependency references protected Photos APIs. Apple documents that read/write library APIs need `NSPhotoLibraryUsageDescription`. A platform-scoped purpose string was added to `app.json` and the native-config guard updated to require five purpose strings and assert truthful on-device/no-upload wording. This does **not** force a new photo permission prompt, prove a store rejection, change Android identity, or certify the generated Info.plist. The provider/library runtime and actual Xcode output still need confirmation. No broader access was requested.

## E. Welcome Tree and complete Free journeys

Source inspected: `app/_layout.tsx` uses account binding, `DeletionGate`, `ConsentGate`, `PremiumStateProvider` and bounded post-consent Premium checkout; `src/platform/appleProvider.ts` uses a 32-byte random nonce hashed for Apple and raw nonce for Supabase and attempts server-side capture of Apple's authorization code. `AccountPanel.tsx` includes Premium account section, one Restore Purchases control, appearance and Privacy & Data access. This **supersedes** Oct 13 findings that claimed Restore or deletion backend were entirely absent. Current `SystemChrome.tsx` explicitly handles native status bar scheme and root background.

Source-identified journeys: Welcome -> Get Started -> Premium intro / Continue Free -> provider choice -> Apple/Google/email and recovery -> account binding -> legal and AI consent -> onboarding -> Today. Returning auth includes sign-out/account-switch and recovery paths. Actual iOS visual, keyboard, safe-area, Dynamic Type, VoiceOver, onboarding restart, callback handling and system Light/Dark behavior are **NOT_VERIFIED on device**. Free Today, Life, Calendar, Systems, Talk It Out, local persistence and optional permission flows remain SOURCE_ONLY, not certified E2E. Production AI consent deployment drift obstructs verified Talk It Out denial/authorization claims.

## F. Live Staging/Production findings

Both Supabase projects directly report `ACTIVE_HEALTHY`: Production `npykvnxnehlsdlbumzwk` and Staging `fhhudicklmpofuzkxeqe`. Public tables enumerated in Production have RLS enabled. Production `premium_runtime_config`: `premium_enabled=true`, `checkout_enabled=false`, `webhook_processing=true`, `allow_test_fixtures=false`. Stage 1 `daily_load_premium` / `smart_inbox_extract` / `momentum_report` are `enabled=true`, `released=true`, rollout `general` in Production; Staging rollout `staging_only`. Village and Co-Parent Plus not released. Production counts `premium_entitlements=0`, `premium_events=0`, `premium_decisions=0`. Zero rows are not evidence of a processing failure alone; they demonstrate no durable paid execution in the observed dataset.

`premium-gate`, `premium-reconcile` and `smart-inbox-extract` deployed in both projects with matching function bundle hashes. `revenuecat-webhook` and `premium-ops` differ by environment and need owner explanation/parity acceptance. Source `herkeys-ai` in PR32 has mandatory affirmative version-matched consent check; both live function bundles still condition that check on `HER_KEYS_AI_REQUIRE_CONSENT === 'true'`. Exact runtime secret and authenticated refusal tests NOT_VERIFIED. Source/Production **drift is confirmed**, actual bypass is **not** confirmed. This is shared and must go to Build Manager.

Production account deletion includes active Edge Functions for initiation, credential capture, status, restoration, processing, monitoring and proof expiry, plus schema tables. Processor flag: `enabled=false`, `dry_run=true`, `last_run_at=null`. Do not call deletion missing entirely, but do not claim Apple-compliant completed deletion.

## G. RevenueCat / Apple commerce

Read-only connected RevenueCat project `proj93809efe`; iOS app `app55f51de583` has bundle `com.herkeys.app`. iOS app's `app_store_connect_api_key_configured=false`; valid app_store_subscriptions signing key confirmed. Apple subscription groups query returned HTTP 422 due to missing ASC API key. **Zero RevenueCat product entries for iOS app**. Entitlement `her_keys_plus` active but all its attached products are associated with Test Store app `app3bba22bc6a` (`monthly`, `yearly`, `lifetime`). Current offering `ofrng40c3008072` has exactly the same Test Store products; published paywall `pw9aa8edf9bdb34338` attached. Listed Test Store package prices are **not** evidence of Apple prices/trials. Apple plan identifiers, trial length, current store region/prices, review localizations and status: NOT_VERIFIED.

RC Production webhook destination targets Production /sandbox targets Staging; names include 'security setup pending'. Both deployed webhook implementations contain Authorization/signature validation code, but no credential state, signed event or reconciliation receipt was verified in the present session. **Do not infer insecure webhooks solely from names.**

No native sandbox App Store transaction, real `her_keys_plus` grant, renewal, restore after reinstall, revocation, duplicate-event or refund test. Paid checkout was intentionally not enabled.

## H. Defect ledger (priorities denote release impact, not proof beyond stated evidence)

| ID | Pri | Owner / classification | Evidence / reproduction | Required action / test | Public-release blocking |
|---|---|---|---|---|---|
| IOS-I01 | P2 | iOS native | `app.json` photo purpose absent on ENTRY; check expo-image-picker/Photos API usage | Added iOS string + native-config assertions on repair branch. Revalidate resolved Info.plist, device picker and upload | Yes until validated |
| IOS-S01 | P1 | Shared CI / deletion owner | CI run 38979428222: eight failed deletion tests (`unclassified_resource` / terminal verification) | Fix all eight, rerun full suite, certify production-class deletion without touching real users | Yes |
| IOS-S02 | P1 | Shared Premium owner | CI: Premium Home did not open expected `manual_upgrade` paywall (one failed test) | Confirm intended checkout-OFF behavior vs fixtures; repair code/test contract without waiver | Yes |
| IOS-S03 | P2 | Shared Premium owner | CI: two cancellation/no-offering expected-copy regressions | Align truthful copy and error outcomes; rerun UI tests | Yes for exact green CI |
| IOS-S04 | P1 | Shared backend consent owner | Production and Staging `herkeys-ai` guard conditional, PR32 unconditional | Review env toggle; deploy reviewed guard Staging then Production; verify no/declined/outdated/affirmative receipts | Yes |
| IOS-S05 | P1 | Shared billing/store owner | RevenueCat iOS product catalog empty; current offering/entitlement points to Test Store; missing ASC API key | Configure ASC credential + store products, import/map offerings/entitlement; preserve approved prices/trial; native StoreKit sandbox E2E | Yes |
| IOS-S06 | P1 | Shared deletion owner | Production processor disabled, dry-run; no terminal deletion proof/test; UI initiated request not exercised | Finish controlled full deletion + third-party credential erasure and status tests, Apple reviewer-safe flow | Yes |
| IOS-S07 | P2 | Shared Premium/backend | Premium launch flags ON but checkout OFF, zero entitlements and decisions, real execution not tested | Dedicated approved iOS test identities; verify 3 Stage 1 features, server grants, persistence, undo, isolation | Yes |
| IOS-S08 | P2 | Shared billing/backend | RC integrations configured; signed webhook delivery and reconciliation not shown; staging/prod bundle drift | Review auth config, source diff, signed/duplicate/delayed event proofs; do not enable checkout | Yes |
| IOS-S09 | P2 | Shared client auth owner | Apple/Google/email sign-in source exists, but native callback, restore/switch, recovery and consent E2E absent | iPhone first/returning/offline/cancel tests; no cross-account data | Yes (evidence) |
| IOS-M01 | P2 | ASC/release owner | No accessible live ASC metadata record, build, screenshots, privacy labels or age rating | Read live record; fill correct review notes/screenshots/pricing/legal before submit | Yes |
| IOS-M02 | P2 | iOS signing owner | No signed candidate IPA or entitlement/SDK/manifest inspection | Build authorized exact SHA on Xcode26+/iOS26+; validate IPA hash, schemes, signing, manifests, min target | Yes |
| IOS-I02 | P3 | iOS appearance owner | New adaptive appearance passed static guard, no physical display audit | iPhone Light/Dark/System, keyboard, splash, paywall, VoiceOver, Dynamic Type | Yes (certification evidence) |
| IOS-I03 | P4 | iOS UX owner | Native Apple button and UIKit sheet quality not fully verified | Test branding/HIG and native button parity; document remaining cosmetic issues | Not independently |
| IOS-G01 | P7 | Documentation/governance | Prior light-only audit was superseded by adaptive appearance and earlier restore/deletion conclusions stale | Maintain exact-SHA separate source/runtime gates | No |
| IOS-G02 | P10 | Evidence only | Repo/build credentials for cloud IPA and current ASC login unavailable | Do not fabricate an artifact or store state | No independent defect; blocks certification |

P0 confirmed vulnerabilities: **none demonstrated**. The P1 consent issue is a real deployed-code drift and unverified security boundary, not a proven exploitable bypass. Additional P4–P10 observations must be supplemented by a full native/device/ASC audit when access exists. This report does not claim exhaustive inspection of all 5,042 test cases or all consumer screens.

## I. Repairs performed — strict iOS-only boundary

An isolated GitHub audit branch was created at ENTRY. Only `app.json` plugin iOS photo purpose and `tests/ios/nativeConfig.test.mjs` were changed and committed, two commits total; no unified candidate mutation, no merge and no Production write. The purpose string reads: “Her Keys lets you select a document photo from your library for on-device text recognition. The selected photo stays on this device and is never uploaded.” The regression now expects `NSPhotoLibraryUsageDescription`, matches the on-device/no-upload wording and expects five declared usage strings instead of four. Actual test execution, mutation proof, EAS native build and final signed Info.plist **NOT_RUN**. No other defect was authorized for direct iOS-only source editing with adequate proof.

## J. Required shared-defect handoff to V2 Build Manager

Priority 1: close eight account-deletion tests and Production deletion safety; close absent App Store commerce product mapping/ASC credential; ensure live AI consent is unconditional and test refusals; fix Premium Home three failures. Priority 2: prove signed webhook/reconciliation, sandbox native purchase/restore, account isolation and all three Premium experiences, plus staging/prod function drift decisions. No shared app/domain/backend code was edited by this iOS audit. Checkout OFF and deletion dry-run/disabled must remain until separately approved.

## K. Final release gates (binary disposition)

| Gate | Result | Rationale |
|---|---|---|
| IOS_SOURCE_AUTHORITY | PASS | PR32 exact HEAD matches nomination |
| IOS_EXACT_SHA_CI | FAIL | 11 failures on ENTRY; repair-branch EXIT CI NOT_RUN |
| IOS_NATIVE_BUILD | NOT_RUN | No compiled signed iOS artifact available |
| IOS_SIGNING | NOT_RUN | No signing/IPA inspection |
| IOS_APPLE_AUTH | NOT_VERIFIED | nonce source checked; real login absent |
| IOS_GOOGLE_AUTH | NOT_VERIFIED | Source route exists; actual callback not tested |
| IOS_EMAIL_AUTH | NOT_VERIFIED | No real iOS sign-in/reset/verification run |
| IOS_WELCOME_TREE | NOT_VERIFIED | Source/readability + CI subsets only |
| IOS_CONSENT | FAIL | live conditional function vs unconditional candidate; E2E absent |
| IOS_APPEARANCE | NOT_VERIFIED | adaptive source guards; no iPhone test |
| IOS_FREE_FEATURES | NOT_VERIFIED | production-bound device functionality not demonstrated |
| IOS_PREMIUM_FEATURES | NOT_VERIFIED | flags exist, real authorized E2E absent |
| IOS_REVENUECAT_NATIVE_PRODUCTS | FAIL | RC iOS app has zero native products / ASC key absent |
| IOS_NATIVE_PURCHASE_RESTORE | NOT_RUN | no native sandbox StoreKit purchase/restore |
| IOS_PRODUCTION_BACKEND | NOT_VERIFIED | healthy backend + deployed functions; authorized E2E absent |
| IOS_PRODUCTION_FEATURE_ACTIVATION | FAIL | checkout OFF, paid access unverified; live deployment drift |
| IOS_PRIVACY_COMPLIANCE | FAIL | consent enforcement not demonstrated; manifests/ASC labels unverified |
| IOS_ACCOUNT_DELETION_APPLE_REQUIREMENT | FAIL | processor disabled and dry-run; no completed journey proof |
| IOS_APP_STORE_METADATA | FAIL | live ASC review record not accessible/completeness unverified |
| IOS_APPLE_POLICY_REVIEW | FAIL | material unverified/unsatisfied guidelines |
| IOS_INTERNAL_TESTFLIGHT_READY | FAIL | no signed processed build; runtime not tested |
| IOS_EXTERNAL_TESTFLIGHT_READY | FAIL | no build/reviewer/access metadata |
| IOS_APP_STORE_SUBMISSION_READY | FAIL | commerce, consent, deletion, CI, binary and metadata gaps |
| **IOS_RELEASE_CANDIDATE** | **FAIL** | mandatory public gates unmet |

**Minimum path to PASS:** (1) green exact-SHA candidate CI incl. all 11; (2) unconditional consent guard deployed/certified, deletion lifecycle certified; (3) Apple ASC products/credentials/offering/entitlement reconciled with approved plans and native sandbox + webhook proof; (4) exact-SHA Xcode 26+/iOS 26+ signed IPA inspected; (5) iPhone Free + all three Premium + identity/consent/account-switch/appearance E2E; (6) live ASC listing/metadata/privacy/age rating/reviewer access complete and verified. No automatic PASS upon builds compiling.

**Actions NOT performed:** no paid checkout activation, deletion run, EAS build, IPA upload, App Store submission, ASC metadata mutation, account impersonation, real customer data mutation, Production Edge Function deploy, shared-source fix or integration merge.
