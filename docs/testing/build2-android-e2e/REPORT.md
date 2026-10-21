# Build 2 — Android emulator E2E, defect repair and Premium certification (2026-10-21)

Repair branch `repair/build2-android-e2e-closeout-20261020`, cut from `integration/build2-candidate-20261020` at the Build
Manager's certified SHA `84d0f6375834dee391f81b1a3ee89863aaf6b35d` (remote verified equal before any change).

## 1. Executive outcome

The real release APK of the candidate was built, installed on a clean emulator and driven against Staging. Six genuine,
reproducible defects were found on device; five are repaired with regression tests and re-verified on the emulator; one
(offline lockout) needs an owner/security decision. With a Staging test-fixture entitlement, **all three Premium Stage 1
features ran end to end from the app, authorized by the server**. RevenueCat purchase, trial and webhook-lifecycle work
was deferred by the owner and is registered in [`REVENUECAT_FOLLOW_UP.md`](REVENUECAT_FOLLOW_UP.md).

| Gate | Result |
| --- | --- |
| `ANDROID_EMULATOR_E2E` | **PASS** (after repairs D01–D05) |
| `FREE_JOURNEYS` | **PARTIAL** — onboarding, auth, consent, Today, tasks, events, calendar, restart, account switching pass; Life sub-areas, OCR, location/weather, Google OAuth not driven this run |
| `PREMIUM_FEATURES` | **PARTIAL** — Daily Load, Smart Inbox, Momentum gated and server-authorized on device; Smart Inbox accept/reject proven; Daily Load proposal/accept and Momentum active state not reachable with in-app data (PF-01, Momentum needs 3 days of history) |
| `REVENUECAT_BACKEND` | **BLOCKED** — owner deferred; webhook auth and signed TEST delivery confirmed, lifecycle not run |
| `GOOGLE_PLAY_TRIAL` | **BLOCKED_EXTERNAL_CONFIGURATION** — no store products, no trial offer, placeholder Android SDK key |
| `ACCOUNT_DELETION_STAGING` | **BLOCKED** — Staging deletion worker disabled (`enabled=false, dry_run=true`) and the Staging auth mailer quota (429) prevents the recent-auth code; the account-switch deletion-gate defect (D05) was found and fixed |
| `EXACT_HEAD_CI` | see the PR |
| `INTERNAL_EAS_BUILD` | **NO_GO (quota)** — EAS Free plan Android build quota exhausted until 2026-11-01; local release APK built from the same source instead |
| `PUBLIC_STORE_RELEASE` | **NO_GO** — RevenueCat products/keys, Staging/Production auth mail and Site URL, D06 decision |

## 2. Environment and build evidence

| Item | Value |
| --- | --- |
| Emulator | new clean AVD `HerKeys_AE2E` (Pixel 8 Pro profile, Google APIs **Play Store** image, Android 17 / API 37, x86_64, swiftshader GPU, 3 GB). API 37 is the only system image installed on this host. |
| Toolchain | Node 24.14.0, npm 11.9.0, OpenJDK 21.0.10, Gradle 9.3.1 (wrapper), Expo SDK 57 (`expo ~57.0.30`), RN 0.86.3, target SDK 36 |
| Install | `npm ci` (lockfile, 587 packages), `expo prebuild --platform android`, `gradlew assembleRelease -PreactNativeArchitectures=x86_64` |
| Environment | EAS `preview` environment pulled to a git-ignored `.env.local` plus the profile's `EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE=true` (Staging `fhhudicklmpofuzkxeqe`) |
| APK | `com.heykeys.app` versionCode 2 / 1.0.0, targetSdk 36, debug-signed local release build. First candidate APK sha256 `46502005…81a8` (84d0f63); final repaired APK sha256 `4162ad1a4e2af35ccf6711ccc4c666b0f5fc715d87b3d606fba40250ea46413a` |
| EAS | `eas build -p android --profile preview` refused: `EasBuildFreeTierLimitExceededError` (account `ams2dad`, resets 2026-11-01). Upgrading is a paid owner decision. |
| Cold start | 4.4–8.8 s on this host (heavy memory pressure: 0.3–0.9 GB free; Android System UI/launcher ANRs after boot are host-side) |

## 3. Defect register

| ID | Sev | Found on device | Root cause | Repair | Regression | Emulator retest |
| --- | --- | --- | --- | --- | --- | --- |
| AE2E-D01 | P1 | Home → return 5 s later threw the welcome flow back to Welcome | `DeletionGate` calls `restrict()` (→ `checking`) on every AppState change and rendered its own screen *instead of* its children, unmounting `AccountProvider` and the whole app: OTP/confirmation round trips, Google custom-tab sign-in, permission dialogs and open editors all lost state | A `checking` that follows `active` covers the mounted app with an opaque, touch- and accessibility-hidden gate; every other non-active answer still unmounts as before (`48b04a5`) | `tests/deletionGateCovering.test.mjs` (fails on the original) | PASS — form and typed email kept across Home/return; permission dialog no longer resets the screen |
| AE2E-D02 | P2 (security) | logcat `WebCrypto API is not supported. Code challenge method will default to use plain` | Hermes has no `crypto`; supabase-js used a `Math.random` verifier and the `plain` PKCE method for Google OAuth on both platforms | Fill-only WebCrypto shim backed by expo-crypto, installed first by the root layout (`f727672`) | `tests/webCryptoShim.test.mjs` (RFC 7636 vector; supabase-js now returns `s256`) | PASS — warning gone from logcat |
| AE2E-D03 | P1 | "Create account" returned to Welcome; no "check your email" | `PremiumStateProvider` keyed its subtree (the root navigator) on the account-state *kind* while unbound, so `unauthenticated → authenticating → unauthenticated` remounted the app | Unbound kinds share one key; bind / household change / leaving bound / sign-out still reset (`ef6b290`) | `tests/premium/providerSignInContinuity.test.mjs` (fails on the original); 136 existing Premium provider tests pass | PASS — the flow stays and shows the server's answer |
| AE2E-D04 | P2 | Sign-up refused with 429 `over_email_send_rate_limit` showed "Check your details" | Email/password mapped every non-5xx error to `rejected` | `rateLimited` outcome and copy, as the OTP path already does (`f1479e6`) | `tests/emailPassword.test.mjs`, `tests/welcomeAuthFlow.test.mjs` | Source-verified; live 429 was observed before the fix |
| AE2E-D05 | P1 (trap) | Signing in as B on A's phone showed "Account status unavailable" with only "Reset this device's local data" and no sign-out | `deletionRuntime.check()` treated the quarantine (B's session over A's namespace) as `session_namespace_mismatch`; at launch it also ran before the runtime restored B and, by unmounting `AccountProvider`, prevented that restore (deadlock) | Another account's session (quarantine, or not yet restored) decides only its own status with its own token; a session contradicting a known actor is still refused (`20ab8c8`) | 4 new cases in `tests/accountDeletion/runtime.test.mjs` (2 fail on the original); 93/93 deletion tests | PASS — "This phone already belongs to someone" → Sign out → A signs back in to its own household (A→B→A) |
| AE2E-D06 | P1 (UX) | Signed-in user opening the app offline is locked out of her local household; the screen's prominent action is a local-data reset | `check()` fails closed on any transport error → `unavailable` → app unmounted | **Owner/security decision required** (see §6) — not changed | — | Data intact; recovers with "Check status" once online |

Findings that are not code defects in this repository:

| ID | Finding | Owner action |
| --- | --- | --- |
| PF-01 | Daily Load (Free One Move and Premium review) can only offer a flexible task *planned for today and due later*; the task editor cannot plan a task for a day, so in-app data always yields "Nothing here is safe to move". This is the open Feature 03 "PLACE" decision. | Decide task day/time placement |
| E-01 | Staging Auth sends through Supabase's built-in mailer (2 emails/hour, `noreply@mail.app.supabase.io`, default template) — sign-up, OTP, recovery and deletion re-auth hit 429 during testing | Configure custom SMTP (Resend) for Staging |
| E-02 | Staging confirmation links redirect to `http://localhost:3000` (Site URL unset); tapped on a phone they land on an error page | Set Staging Site URL / redirect allow-list |
| E-03 | EAS `preview` env `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` is the literal placeholder `<PLAY_STORE_PUBLIC_KEY>`: RevenueCat logs `InvalidCredentialsError`, billing is unavailable, and a Free account's Premium status reads "Can't check right now" instead of offering an upgrade | RevenueCat follow-up R-01 |
| E-04 | No Staging account had the `herkeys_premium_tester` marker, so Staging Premium had never been usable; set for the two disposable test accounts (owner-approved) | none |
| F-01 (P3) | AI "Report response" opens with *Unsafe or harmful* pre-selected | Product: require an explicit reason |
| F-02 (P3) | The post-audit Premium screen tells an already-entitled account "you can continue Free" | Copy |
| F-03 (P3) | Denying notification permission gives no feedback on the permissions screen | Copy |

## 4. Emulator journey matrix (source SHA as noted; Staging; test accounts: two disposable `hk-ae2e-*` addresses on the Her Keys test receiving domain)

| Test | Steps | Result | Evidence |
| --- | --- | --- | --- |
| W-01 First run | Clean install → Welcome | PASS | `screens/A01-welcome.png` |
| W-02 Premium offer before account choice | Get Started → offer → Back → Welcome → Get Started | PASS (no purchase surface; "Nothing is purchased on this screen") | `screens/A02-premium-offer.png` |
| W-03 New user, Free, email/password | Continue Free → Create account | PASS after D03 (was FAIL); server created user and sent confirmation | — |
| W-04 Email confirmation | Real confirmation email read from the test inbox, link followed | PASS server-side; E-02 for on-phone tap | — |
| W-05 Existing user | I Already Have an Account → Sign in | PASS — Premium offer not repeated | — |
| W-06 Duplicate tap | Create account tapped twice | PASS — one request | — |
| W-07 Background mid-flow | Home → return | PASS after D01 (was FAIL) | — |
| W-08 Rate-limited signup | 429 from Staging | PASS after D04 (was misleading) | — |
| C-01 Consent gating | Required boxes one by one, then AI choice | PASS — button enabled only with all 3 + an explicit AI choice | `screens/C02-consent-ready.png` |
| C-02 Consent persistence | `account_consents` rows | PASS — terms/privacy/age18 true; `ai_processing` false (A) / true (B) | — |
| C-03 Notification denied | Enable → Don't allow | PASS (F-03) | — |
| O-01 Life Systems Audit | 4 steps → profile → Premium summary | PASS | `screens/C06-profile.png` |
| O-02 Kill mid-onboarding | force-stop at step 2 → relaunch | PASS — resumes at 2 of 4, session restored | — |
| P-01 Free account Premium surface | Explore Premium; Your account | PASS (honest "can't be reached", never trapped); E-03 | — |
| T-01 Task create/persist | Add task → restart | PASS | `screens/D03-today-with-task.png` |
| T-02 Task complete | Open → Mark done | PASS | — |
| E-01 Event create/edit | Add event → edit time → save | PASS | — |
| K-01 Calendar | Day view, tight window detection | PASS | — |
| A-01 Account switch A→B→A on one phone | Sign out A, sign in B, sign out, sign in A | PASS after D05 (was a trap) | `screens/E04-quarantine-conflict.png` |
| PR-01 Premium status (B) | Your account | PASS — "Her Keys Premium is on… through November 19, 2026"; all three tools READY | `screens/F02-B-account-premium.png` |
| PR-02 Daily Load | Overloaded day → Review this day | PASS for gate/authorization/explanation (2 server `allowed` decisions, usage unit completed); proposal/accept NOT REACHABLE (PF-01) | `screens/F07-…`, `screens/F08-…` |
| PR-03 Smart Inbox | Typed message → two AI proposals → accept one, reject one | **PASS** — server `smart_inbox_extract allowed`; nothing written before approval; accepted task synced with the right date; rejected item never saved | `screens/H02-…`, `screens/H05-…` |
| PR-04 Momentum | Open weekly review: empty, then 1 record | PASS for empty and insufficient states; active state NOT_RUN (needs ≥5 records over ≥3 days; Play image cannot change the clock) | `screens/F05-…`, `screens/F10-…` |
| PR-05 Persistence | Kill, offline, online | PASS — Premium still on | — |
| AI-01 Report response | Choose reason → Submit | PASS — metadata only (account, surface, message ref, reason), 30-day expiry, no text | `screens/H07-report-submitted.png` |
| AI-02 Duplicate report | Same response again | By design: new form = new key; 5 per 24 h per account | — |
| AI-03 Reviewer disposition | — | BLOCKED — no approved Staging reviewer (none granted) | — |
| N-01 Offline launch | Airplane mode → relaunch | FAIL (D06, owner decision); no data loss; reminders not cancelled | `screens/I01-offline-relaunch.png` |

Not driven this run (time / host memory): Kids, Home, Co-parenting, Meals, Money, Work, Me/Rebuild, People, Life Admin
create→edit→delete journeys; Systems; OCR camera/photo picker; location/weather; dark mode; Google OAuth; email OTP and
password recovery (Staging mail quota, E-01); account deletion on device (worker disabled + mail quota).

## 5. Staging changes made (owner-approved 2026-10-21; Production untouched)

* `premium_runtime_config.allow_test_fixtures = true` (a CHECK makes this impossible in a production-configured database).
* `app_metadata.herkeys_premium_tester = true` on the two disposable `hk-ae2e-*` accounts only.
* One `premium_entitlements` row, `source='test_fixture'`, `environment='SANDBOX'`, `store='TEST_STORE'`, expiring
  2026-11-20 — a fixture, **not** a store purchase.

Rollback: `allow_test_fixtures=false`; delete the `test_fixture` row; remove `herkeys_premium_tester` from the two accounts.

Production (read-only check): `premium_enabled=true`; Daily Load, Smart Inbox and Momentum `enabled=true, released=true,
rollout=general`; no tester guard; `checkout_enabled=false`. Premium is therefore already on in Production for any account
RevenueCat reports as entitled; fixtures are structurally impossible there, and enabling checkout waits on the RevenueCat
follow-up.

## 6. D06 — offline lockout: decision needed

Today any transport failure of the deletion status check publishes `unavailable` and removes the app, so a signed-in user
cannot open her own on-device household offline. Proposed repair (not applied): when there is **no local deletion receipt**
and the last positive server answer for this account was `active`, treat a transport failure as "offline": keep sync stopped,
keep the app usable locally, show an offline banner, and re-check on reconnect/foreground; any definitive server answer
(`pending`, `purged`, inactive) still restricts immediately, and the receipt path is unchanged. Move "Reset this device's
local data" behind an explicit secondary disclosure on that screen.
