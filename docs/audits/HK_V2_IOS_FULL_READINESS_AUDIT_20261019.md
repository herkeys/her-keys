# Her Keys V2 — iOS Full Candidate Audit and EAS Build Readiness

**Date:** 2026-10-19 America/New_York  
**Authoritative *nominated*, not merged source:** `repair/v2-ai-reporting-and-prod-convergence-20261017` @ `559e50cdc99e7858b2b259f330a0fe2f8aa87513` (draft PR #35)  
**Isolated Apple repair:** `audit/ios-v2-pr35-readiness-20261019` (separate draft review, no direct integration).  
**Decisions:** `IOS_V2_CANDIDATE=NO_GO`; `INTERNAL_EAS_BUILD=NO_GO` *until exact consolidated source/signing verification*; `SIGNED_IOS_EAS_BUILD=NO_GO`; `APPLE_APP_STORE_SUBMISSION=NO_GO`. No EAS build started.

## A. Executive summary

The candidate is a verified descendant of the older Build 2A shared consumer branch (`68f95096dfeab85404b2f65e196ddfbee85fe86b`) and contains PR #27/#28/#29/#31 design ancestry, PR #32 RC/AI source convergence, PR #34 shared AI account-fence repairs and PR #35 AI reporting/backend-source convergence. It is **259 commits ahead** of `integration/build2-shared-consumer-repair` and **29 commits ahead** of PR #32, with zero behind in each compare. Older Android candidate `codex/build2b-android-candidate-audit` is an ancestor; candidate is not in sync with that candidate's SHA. GitHub current PR #35 HEAD matches the nominated SHA. All those PRs remain drafts and are **not merged into main**.

PR #33 (earlier iOS Photos repair on PR #32) and PR #36 (Photos repair on `integration/build2-shared-consumer-repair`) both remain **unmerged** and neither patch is in nominated PR #35 source. PR #36 was created by an unrelated/misplaced audit and is not release authority. K Scan PR #633 is a separate product checkpoint and has not been touched.

**Critical evidence:** PR #35 exact-head CI [39091377651](https://github.com/herkeys/her-keys/actions/runs/39091377651) is FAILURE: 5,152 total, 5,141 pass, 11 fail (8 account deletion, 3 Premium Home). Install from lockfile, TypeScript, Expo install compatibility, Expo Doctor, release identity, launch-critical Welcome/Premium contracts and resolved Expo config all PASS. A source-only Apple Photos usage repair has been committed on this isolated audit branch with Android config unchanged, but its tests and native compilation are NOT_RUN. This is not a green release.

**Live provider evidence:** Staging and Production Supabase projects are ACTIVE_HEALTHY; Production and Staging `herkeys-ai` downloaded source has a mandatory version-matched AI consent guard, matching bundle SHA256 `6dc2998dd2b86faf54786aa9499ce8944c6fde47b87b64d560308a8877a30733`. Production Stage 1 Premium features are enabled/released but `checkout_enabled=false`. Production billing table held one SANDBOX TEST event with status `ignored_environment`; not a real Apple purchase. Permanent account-deletion worker disabled + dry-run true. RevenueCat iOS app lacks App Store Connect API key and native Apple products; current offering still maps Test Store items only. Actual signed IPA, ASC metadata and iPhone E2E unavailable.

**Findings:** no confirmed P0. Four unresolved P1 external/shared categories plus source-only Photos repair requiring integration/native validation; additional P2/verification issues. Confirmed Apple policy concerns: Apple commerce not functionally configured; permanent account deletion disabled. Other submission gates remain NOT_VERIFIED rather than falsely classified as direct violations.

## B. Source trace and CI

| Item | Direct observation | Status |
|---|---|---|
| GitHub | `herkeys/her-keys`, public repo, default `main` | VERIFIED |
| Nominee | `repair/v2-ai-reporting-and-prod-convergence-20261017` @ `559e50cdc99e7858b2b259f330a0fe2f8aa87513` | VERIFIED |
| PR32 | `d775b1fadea6e4d5b1da4a8e81738f539231a5e5` direct ancestor (29 commits before nominee) | VERIFIED |
| PR34 | `23c5c279796d11ed37fe3c977d40112d3aa995bf` ancestor | VERIFIED |
| PR35 | open draft, not merged, current remote HEAD `559e50c` | VERIFIED |
| PR33 | `fecc8426229230d6b88548824a43f13ae27770f4`; diverged from PR35, not included | OPEN/EXCLUDED |
| PR36 | `8834815cb11a0038eb7b19d6c31555bc18255d74`; branches older `c660e5927c934f7bd2c172df5fb691e2075d40ee` | OPEN/EXCLUDED |
| Local worktrees | No local Her Keys clone mounted; attempted `git ls-remote` failed DNS resolution | NOT_VERIFIED |
| Clean reproducibility | Nominated SHA GitHub CI successfully ran fresh `npm ci`; no local clone/check possible | SOURCE CI PASS; LOCAL NOT_RUN |
| Exact source CI | 39091377651 FAIL, full suite 11 failures; all other reported gates PASS | FAIL |
| Authenticated native | No physical iPhone, macOS/Xcode build, EAS credential view or IPA | NOT_RUN |
| Branch rules | No release branch changed; exact-SHA proof in CI passes; protection/allowlists for new audit branch not verified | PARTIAL |

Failures from the full GitHub Actions log:
- Account deletion: `unclassified_resource` (complete cleanup and 43-resource shared/other member cases), `terminal_verification_failed` (terminal proof).
- `tests/premiumHome/home.test.mjs:131-165`: expected `manual_upgrade` paywall placement not invoked; cancel notice and no-offering notices differ. Source hypothesis (unproven): intended `canOfferPurchase` server gating and test fixtures are inconsistent under checkout-OFF condition. Never turn checkout on or remove authorization solely to satisfy tests.

No shared PR merged, no source lineages altered by this audit.

## C. Native iOS configuration and permissions

| Requirement | Observed source | Binary/provision status |
|---|---|---|
| App and bundle | `app.json:3-18`: Her Keys, `com.herkeys.app`, version `1.0.0`, build `2` | Native app identity unverified |
| Ownership | Expo owner `ams2dad`, EAS project `7b25f8fe-d7de-49c1-ba69-1fd3a065826a` | Apple Team ID not accessible |
| Apple sign-in | `ios.usesAppleSignIn=true`; `expo-apple-authentication` plugin; native test checks entitlement | Signed binary/capability unavailable |
| Platform families | `ios.supportsTablet=false`, portrait | ASC device families NOT_VERIFIED |
| UI | `userInterfaceStyle=automatic`, light/dark splash, Expo system UI | iPhone Dark/System/splash NOT_RUN |
| iOS build profile | `eas.json:15-22` `preview` internal distribution, Staging backend, consent gate | Ad hoc credential/UDID NOT_VERIFIED |
| Store build profile | `eas.json:24-31` `production`, Production backend; distribution defaults to store | App Store signing/processing NOT_RUN |
| Xcode | `eas.json` does not pin an image; EAS resolved build image not observable | Xcode 26+/iOS 26 SDK NOT_VERIFIED |
| Deployment target | Not set explicitly in `app.json`/`eas.json` | Must inspect generated iOS min target (Apple >=iOS 13) |
| Native stack | Expo `~57.0.30`, React Native `0.86.3`, React `19.2.3`, RevenueCat SDK `^10.9.1` and UI `^10.9.1` | Expo CI compatibility PASS; CocoaPods/Swift/Hermes/ABI NOT_RUN |
| Scheme | `herkeys` custom app scheme; native test verifies | Cold-start callback NOT_RUN |
| Universal Links | No Associated Domains entitlement in native test; no confirmed universal-link requirement | Confirm routing/AASA if using app-domain link |
| Notifications | `expo-notifications`; native test expects APNs entitlement | APNs environment/token/entitlement in signed binary NOT_RUN |
| File/library import | `expo-image-picker` intended for on-device document OCR | Permission and native Photos flow NOT_RUN |
| Camera | Accurate local OCR camera usage string source present | Native picker/device NOT_RUN |
| Other privacy | location When-In-Use approximate, motion and Face ID purpose; no mic/background location/tracking intended | Aggregated native Info.plist NOT_RUN |
| Encryption | `ITSAppUsesNonExemptEncryption=false` | Declaration requires review against actual cryptography; NOT independently cleared |
| Privacy manifests | Dependencies likely generate manifests; none aggregated/validated on signed app | NOT_RUN |
| Version collision | Build `2`; existing ASC build numbers unavailable | BLOCKED until ASC lookup |

**IOS-V2-001 iOS-only repair:** `app.json:53-59` on nomination had `photosPermission:false`, which intentionally suppresses `NSPhotoLibraryUsageDescription` despite a document-photo selection journey and linked image-picker native module. This is a credible upload/privacy purpose risk, **not proof of Apple rejection** (permissionless system picker access must also be distinguished). Isolated repair changes only image picker plugin's iOS Photos purpose to: “Her Keys lets you select a document photo from your library for on-device text recognition. The selected photo stays on this device and is never uploaded.” `tests/ios/nativeConfig.test.mjs` now expects five purpose strings, the exact new wording and no `NSPhotoLibraryAddUsageDescription`. Audit readback checks: Android `app.json` config identical, explicit `ios` block identical, EAS identity identical, all other plugins identical, assertions present. Source-boundary/static diff checks PASS; real `npm ci`/introspection/Xcode build NOT_RUN. This branch is isolated and **not merged**.

## D. Full feature readiness matrix

Legend: S = source present/reviewed, U = unit/CI coverage reported (not always passing), B = Production backend present/configured, N = native signed iPhone execution; `?` means unavailable verification.

| Feature/journey | S | U | B | N | Disposition |
|---|---:|---:|---:|---:|---|
| Welcome, Get Started, Already Have Account | YES | PASS launch critical | auth present | NOT_RUN | SOURCE_ONLY |
| Free vs Premium intent, post-consent checkout | YES | partial FAIL Premium Home | feature server present, checkout OFF | NOT_RUN | COMMERCIAL BLOCKED |
| Apple Sign-In nonce and first-login name | YES | PASS targeted source tests | Supabase Apple provider configuration not independently inspected | NOT_RUN | AUTH DEVICE BLOCKED |
| Google Supabase OAuth PKCE | YES | reported | live provider settings not independently inspected | NOT_RUN | DEVICE BLOCKED |
| Email/password, email OTP, recovery | YES | reported | Supabase Auth present; deliverability not observed | NOT_RUN | DEVICE BLOCKED |
| Terms/Privacy/AI consent | YES | reported | versioned consent receipts + unconditional AI guard | NOT_RUN | NATIVE E2E BLOCKED |
| Permission screen and local notifications | YES | reported | n/a/local | NOT_RUN | DEVICE BLOCKED |
| Life Systems Audit/profile setup | YES | reported | account/sync present | NOT_RUN | DEVICE BLOCKED |
| Today/Life/Calendar/Systems | YES | large CI coverage | relevant functions/data present | NOT_RUN | DEVICE BLOCKED |
| Talk It Out with Gemini | YES | reported tests | equal active AI bundles and consent guard | NOT_RUN | DEVICE BLOCKED |
| AI response reporting | YES | tests reported | submit/review RPCs + private table; no Prod report receipt | NOT_RUN | MODERATION OPS BLOCKED |
| Daily Load Premium | YES | reported | ON/released/general in Prod | NOT_RUN | PREMIUM E2E BLOCKED |
| Smart Inbox extraction | YES | reported | ON/released/general in Prod | NOT_RUN | PREMIUM E2E BLOCKED |
| Momentum weekly review | YES | reported | ON/released/general in Prod | NOT_RUN | PREMIUM E2E BLOCKED |
| Premium Home/status | YES | **3 FAIL** | server manifest, entitlement projection | NOT_RUN | SHARED REPAIR REQUIRED |
| Purchase/restore/managing subscription | YES | some identity tests; Home 3 FAIL | Apple RC catalog incomplete | NOT_RUN | **FAIL** |
| Light/Dark/System adaptive appearance | YES | rendered contrast/source tests reported PASS | local | NOT_RUN | DEVICE BLOCKED |
| Photo camera/library OCR | YES | photo-purpose source repair untested | on-device by design | NOT_RUN | NATIVE PURPOSE PENDING |
| In-app account deletion | YES | **8 FAIL** | functions exist; worker disabled/dry-run | NOT_RUN | **FAIL** |
| Legal docs | YES | URL constants | public Storage host | NOT_RUN | HTTP/PDF content not verified |
| Account switching/isolation | YES | account-fence tests pass | Supabase/RLS configured | NOT_RUN | SYNTHETIC NATIVE PROOF PENDING |

UI tracing:
- `app/index.tsx:21-41` chooses `WelcomeAuthFlow` or resumes onboarding by account binding, not by arbitrary stored appearance flag.
- `src/features/account/WelcomeAuthFlow.tsx` offers Apple/Google/email/password and password recovery; native availability must be tested.
- `app/_layout.tsx:103-120,215-235` fences checkout after account binding and consent; canonical ownership and server readiness gate.
- `app/onboarding/plus.tsx:50-103,143-155` already entitled skips second upsell; Free continuation allowed and consumes Premium intent.
- `app/sign-in.tsx:58-74` opens Privacy & Data deletion and account-level Restore; outdated claim that both surfaces are missing is false.
- `src/platform/appleProvider.ts:23-28,58-85` generates secure nonce and exchanges Apple ID token; Apple authorization-code capture for deletion is best-effort and must be proven in native/hosted flow.
- `src/monetization/PremiumStateProvider.tsx:172-176,247-295` disallows paid offer unless current account/server purchase-readiness pass.
- `src/platform/aiResponseReporting.ts` carries metadata-only, account-fenced submission with bounded errors.
- `src/features/account/DeleteAccountPanel.tsx:17-33` can initiate deletion; hosted worker disabled, so completion unproven.

The entire UI route tree, VoiceOver, keyboard, accessibility, all screen sizes, deep links and physical-device startup are **not exhaustively certified** in a connector-only environment. No native PASS is claimed.

## E. Apple policy matrix (official, checked 2026-10-19)

| Guideline / rule | Applicability to Her Keys | Evidence and status |
|---|---|---|
| 2.1 App completeness | All launches | **BLOCKED** by 11 CI failures, no iPhone/native artifact and incomplete commerce |
| 2.3 Accurate metadata | Marketing Free/Premium/AI claims | ASC listing/screenshots unavailable; NOT_VERIFIED |
| 3.1.1 In-app purchase | Digital Premium access | **FAIL**: no RC iOS Apple products/Apple offering mapping or purchase proof |
| 3.1.2 Auto-renew subscriptions | Monthly/yearly Premium | Apple group, period/pricing, trials, localization and store availability NOT_VERIFIED |
| 4.8 Login services | Third-party social sign in | Apple provider source present; native actual Apple registration and Supabase login NOT_RUN |
| 5.1.1(v) Account deletion | Her Keys creates accounts | **FAIL** operational deletion processor disabled/dry-run |
| 5.1.1 / 5.1.2 Privacy | Household, AI and subscriptions | consent server-source positive; manifests, ASC Nutrition Labels, AI report retention and native permissions NOT_VERIFIED |
| 1.1 Harmful output | Talk It Out assistant | generation policy/test coverage source only; actual content-safety E2E NOT_RUN |
| 1.2 UGC/AI content | Applicable to AI creation/sharing as appropriate | metadata reporting UI exists; don't presume private AI conversation is public social platform; moderation response/support still to certify |
| Xcode 26+/iOS 26 SDK | Upload since Apr 28, 2026 | EAS resolved image unknown; NOT_VERIFIED |
| iOS 13+ min target | Upload since Sep 9, 2026 | generated deployment target unknown; NOT_VERIFIED |
| Updated age ratings | Required Jan 31, 2026 | ASC questionnaire inaccessible; NOT_VERIFIED |
| Privacy manifests & signatures | Required listed third-party SDKs/required reason APIs | actual compiled bundle/SDK manifest validation NOT_RUN |
| Encryption | Export declaration | source says exempt; cryptographic review and ASC flag NOT_VERIFIED |

Official sources:
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/news/upcoming-requirements/
- https://developer.apple.com/support/third-party-SDK-requirements/
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- https://developer.apple.com/help/app-store-connect/

## F. Defect register (P0-P4; status distinctions are evidence-based)

| ID | P | Owner/type | Exact location / evidence | Required repair/test | Internal EAS | ASC submit | Status |
|---|---|---|---|---|---|---|---|
| IOS-V2-001 | P1 | IOS/permission | `app.json:53-59`; `tests/ios/nativeConfig.test.mjs:122-146`; iOS Photos key missing at source | Patch in isolated branch; run Expo introspect + Android parity + real native build before merge | YES until SHA reviewed | YES | SOURCE_FIXED / TEST_NOT_RUN |
| IOS-V2-002 | P1 | REVENUECAT/ASC commerce | RC app `app55f51de583` no ASC API key; 0 native products; current offering Test Store only | Configure Apple credentials/catalog without changing approved economics; StoreKit sandbox proof | NO for Free test | YES | OPEN |
| IOS-V2-003 | P1 | BACKEND/privacy | Production `account_deletion_control`: disabled, dry-run, last run null | Safe synthetic deletion proof, owner activation approval, Apple/reviewer journey | NO for safe synthetic Free tests | YES | OPEN |
| IOS-V2-004 | P1 | SHARED CI/deletion | [CI 39091377651](https://github.com/herkeys/her-keys/actions/runs/39091377651): eight `unclassified_resource`/terminal failures | Resource registry/test fixture analysis; all 8 green + isolation tests | CONDITIONAL | YES | OPEN |
| IOS-V2-005 | P1 | SHARED CI/Premium | `tests/premiumHome/home.test.mjs:131-165` three failures; `PremiumStateProvider.tsx:247-295` | Repair semantic purchase readiness vs test contract; no guard weakening | CONDITIONAL | YES | OPEN |
| IOS-V2-006 | P2 | BACKEND/policy | `src/features/ai-safety/AiReportPanel.tsx`, `src/platform/aiResponseReporting.ts`; Production private reports count 0 | Named reviewer, retention/response SOP, authenticated iPhone report/retry | NO | YES for accurate public safety/privacy claims | OPEN |
| IOS-V2-007 | P2 | ASC/metadata | Apple app record not accessible; age rating, privacy labels, screenshots, prices, review access unknown | Live ASC read/complete once authorized | NO | YES | BLOCKED_NO_ACCESS |
| IOS-V2-008 | P2 | IOS signing | `app.json:10-18`, `eas.json:15-31`; no Apple Team or installed profiles | Validate EAS Apple credentials, build number, Xcode/SDK, target iOS, native entitlements | YES | YES | BLOCKED_NO_ARTIFACT |
| IOS-V2-009 | P2 | IOS/auth | `src/platform/appleProvider.ts:23-98` native behavior untested | Apple private relay/re-auth/cancel/revoke, device and Supabase E2E | CONDITIONAL | YES | NOT_RUN |
| IOS-V2-010 | P2 | IOS/deep link | `app.json:6` custom `herkeys` scheme, OAuth/email sources, no signed universal link evidence | Test iOS PKCE/cold-start/open-app/expired links; AASA only if universal links needed | CONDITIONAL | YES if broken | NOT_RUN |
| IOS-V2-011 | P2 | IOS/privacy | App uses native Expo/RevenueCat modules; aggregated PrivacyInfo/ATS/exempt encryption unavailable | Inspect built privacy report, SDK signatures, reason APIs | NO for first internal | YES | NOT_RUN |
| IOS-V2-012 | P2 | SHARED Premium journey | Three Stage 1 flags released; no authenticated iOS exercise | A/B household, Free denied, 3 Premium approvals, undo, consent, restarts | NO for first internal | YES | NOT_RUN |
| IOS-V2-013 | P2 | BACKEND/billing | Production `premium_events` 1 SANDBOX TEST `ignored_environment`, not Apple paid proof | Signed sandbox/Production separation, duplicate/refund/restore, webhook receipt | NO | YES | PARTIAL |
| IOS-V2-014 | P3 | LEGAL / URLs | `src/config/legal.ts:9-12` PDF URLs; web fetch failed in audit environment | Verify 200/download/PDF content and consent/reporting policy consistency | NO | YES if links fail | NOT_VERIFIED |
| IOS-V2-015 | P3 | IOS UX | Theme/root system chrome and account appearance selector source present, no native images | Small/large iPhone safe area, Dark/System, keyboard, VoiceOver, Dynamic Type | NO | Conditional | NOT_RUN |

**P0:** 0 demonstrated. **P1:** five unresolved release/prebuild categories including repaired but unmerged Photos issue. P2/P3 rows are not necessarily proven bugs: missing proof is explicitly flagged, not counted as a confirmed exploitable vulnerability. Refer to [standalone shared-owner handoff](HK_V2_IOS_SHARED_OWNER_HANDOFF_20261019.md) for reproduction, root-cause hypotheses, owner assignments and required regression specifics.

## G. Repair and evidence manifest

- ENTRY: `559e50cdc99e7858b2b259f330a0fe2f8aa87513`.
- Isolated branch: `audit/ios-v2-pr35-readiness-20261019`.
- `f5b16876f250cd92a33ad976b0929431eb708921`: `app.json` iOS library purpose.
- `28e7858048111587bb9430927a9ce341e5fe7fea`: `tests/ios/nativeConfig.test.mjs` five-purpose regression.
- Local connector-level readback compared base/repair: iOS bundle, Android object, EAS extra, entire authored ios object and all other plugins equal. PASS static diff invariant. Test file includes new exact purpose assertion and excludes add-only Photos usage. No native build, no sign-in or purchases performed.
- Upstream CI: [39091377651](https://github.com/herkeys/her-keys/actions/runs/39091377651) — install/TS/Expo/native config PASS, suite FAIL (11). No new CI run was available for this isolated repair, and no local `npm ci` could run because no network-capable local clone or node_modules; do not mislabel test as PASS.
- Supabase/RevenueCat reads are nonmutating. No secrets printed. K Scan untouched.

## H. Three release decisions

### Gate 1 — Internal iOS EAS

**NO_GO as of audit end, pending exact consolidated SHA approval and unexecuted native/signing/permission preflight.** An internal Staging build would be diagnostically valuable, and Apple store product/metadata completeness is NOT a prerequisite to first internal Free/onboarding testing. Do not require commercial launch to be perfect just to test an iPhone. Minimum GO: build manager reviews and integrates this iOS-only patch into exact approved candidate; repaired SHA runs dependency/TypeScript/iOS native-config tests plus boundary checks; confirm safe Staging env and internal Apple team/provisioning; scope testing to synthetic accounts and disable paid checkout/irreversible deletion. Eleven inherited shared test failures must be explicitly quarantined as *known test limitations*, not waived or silently relabeled green; Product Owner/Build Manager must decide whether that risk is acceptable for internal testing. A binary is not produced by this audit.

### Gate 2 — Signed TestFlight/App Store distribution build

**NO_GO.** No validated final source SHA, Xcode/SDK, Apple Developer Team ID, signing/provisioning, built privacy manifests, native auth, or native Apple commerce products. Do not treat `production` EAS profile existence as signed TestFlight readiness.

### Gate 3 — Public submission

**NO_GO.** Requires validated signed build and actual iPhone first/returning Apple auth, functional Free/Premium, real native IAP/restore/expiry, account deletion backend completion, reviewer/AI reporting SOP, legal/privacy/age-rating/ASC metadata screenshots, and appropriate no-P0/no-release-blocker evidence. Do not substitute static tests for a signed IPA.

**Owner handoff:** `docs/audits/HK_V2_IOS_SHARED_OWNER_HANDOFF_20261019.md`. Approval authority remains Build 2 Manager. Do not merge PRs #33 or #36 as shortcuts or presume that PR #35's deployed backend verification equals iOS app certification. No actual EAS build, store submission, backend deployment or purchase activation occurred in this audit.

## I. Required final machine-readable verdict (audit-time)

`IOS_V2_CANDIDATE=NO_GO`  
`INTERNAL_EAS_BUILD=NO_GO`  
`SIGNED_IOS_EAS_BUILD=NO_GO`  
`APPLE_APP_STORE_SUBMISSION=NO_GO`  
`IOS_ONLY_REPAIRS=PARTIAL`  
`SHARED_REPAIRS_REQUIRED=YES`  
`APPLE_POLICY_BLOCKERS=2` (confirmed commercial IAP + disabled deletion; other policy evidence pending)  
`UNRESOLVED_P0=0`  
`UNRESOLVED_P1=5` (includes source-patched but unmerged Photos issue)  
`SOURCE_BRANCH=repair/v2-ai-reporting-and-prod-convergence-20261017`  
`SOURCE_SHA=559e50cdc99e7858b2b259f330a0fe2f8aa87513`  
`REPAIR_BRANCH=audit/ios-v2-pr35-readiness-20261019`  
`REPAIR_CODE_SHA=28e7858048111587bb9430927a9ce341e5fe7fea`  
`SIGN_IN_WITH_APPLE=BLOCKED`  
`IOS_REVENUECAT=FAIL`  
`IOS_PRIVACY=BLOCKED`  
`IOS_ACCOUNT_DELETION=FAIL`  
`IOS_NATIVE_BUILD_PREFLIGHT=BLOCKED`  
`APP_STORE_CONNECT=BLOCKED`
