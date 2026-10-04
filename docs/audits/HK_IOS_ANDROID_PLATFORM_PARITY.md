# Her Keys V1: iOS / Android Platform Parity Audit (Finalization Part 1)

PART1_RESULT=FAIL

- **Audit branch:** `audit/ios-android-platform-parity`.
- **Worktree:** `C:\Users\jsmit\Her-Keys-PP01`.
- **Form factor:** phone.
- **Machine-readable registry:** [`HK_PLATFORM_PARITY_REGISTRY.json`](HK_PLATFORM_PARITY_REGISTRY.json). `tests/platformParity/registryGuard.test.mjs` consumes it.
- **Remote checks ledger:** [`HK_PLATFORM_PARITY_REMOTE_CHECKS.md`](HK_PLATFORM_PARITY_REMOTE_CHECKS.md).
- **Work not done:** no EAS build, no signing, no store work, no merge. `REMOTE_CONFIG_MUTATIONS=0`.

---

## 0. P0–P3 repair pass (2026-09-28)

This section records the repair pass that followed the audit. It did not rerun the full audit; the Part 1 verdict below stands until Part 1 is re-certified.

- **Start:** `73b7703`.
- **Repair commits:**

| Commit | Content |
|---|---|
| `9d4c643` | PP-D21 (new P1): the navigator no longer collapses while a sign-in is in flight |
| `24adfbf` | PP-D04: Your Account entry, sign-out, and switching through quarantine |
| `1618299` | PP-D03: the Apple portability gap closed as an owner-approved exception |
| `85ad422` | Mutation check extended: S6–S9 |
| (docs commit) | This report and the remote-checks ledger |

**P0–P3 state after the pass:**

| Defect | Original priority | State | Resolution |
|---|---|---|---|
| CFG-01 | P1 | **OPEN** | Owner-gated. The in-app browser is not signed in to Supabase. The agent may not enter the owner's password or the client secret, and has no other route to Staging auth settings. Re-probed 2026-09-28 17:32 UTC: still `mrhq0…` → `redirect_uri_mismatch`. |
| PP-D21 | **P1 (new)** | **CLOSED** | Repaired in `9d4c643`. See §16 and §17. |
| PP-D01 | P2 | CLOSED | Regression-checked: `systemLinks` 15/15; mutant S3 still caught. |
| PP-D03 | P2 | **CLOSED** | `PRODUCT_APPROVED_INTENTIONAL_EXCEPTION`: EX-01 portability limitation, plus a disclosure on iOS. |
| PP-D04 | P2 | **CLOSED** | Repaired in `24adfbf`. Scenarios 10, 12 and 34 are now reachable through the UI. |
| PP-D02 | P3 | CLOSED | Regression-checked: `googleAuthParity` 38/38 on Windows. |

- **Result:** `P0_OPEN=0`, `P1_OPEN=1` (CFG-01), `P2_OPEN=0`, `P3_OPEN=0`.
- **Gates:** see §6.1.

## 1. Binary verdict

**`PART1_RESULT=FAIL`**

This is the verdict of the original audit at `73b7703`. It is unchanged until Part 1 is re-certified.

Status after the repair pass:
- **PP-D04:** closed.
- **PP-D03:** closed as an owner-approved exception.
- **PP-D21:** a P1 found during the repairs, now closed.
- **CFG-01:** still the one open blocker.

| Blocking item | Priority | Why it blocks | Owner / agent | State |
|---|---|---|---|---|
| **CFG-01**: the Staging Google provider uses an `installed` (native) OAuth client, so Google answers `redirect_uri_mismatch` | P1 | Google identity sign-in cannot complete on Staging on either platform. Staging is the Part 2 device backend, so every Google device scenario is impossible. | Owner-gated configuration | **OPEN** |
| **PP-D04**: no in-app entry to sign in, and sign-out appears only on the conflict screen (OD-HK13-02) | P2 | Part 2 scenarios 10, 12 and 34 could not be performed through the UI. | Manager decision → agent | CLOSED `24adfbf` |
| **PP-D03**: an Apple account created with "Hide My Email" cannot be reached from Android, and no document accepted that | P2 | This was an undocumented account-access gap. | Owner decision: accepted as an intentional V1 limitation | CLOSED `1618299` |

## 2. Source reconciliation

| | Source A: integrated prototype | Source B: Google-auth parity (PR #6) |
|---|---|---|
| Branch | `refinement/weather-calendar-scaffold` | `refinement/google-auth-platform-parity` |
| SHA | `11c50bedabfdfaeb43f052d753c34845081fe1d5` (the historical anchor itself) | `15f19a0ec6bc8b91661bb343d4b61fb71672dae3` (the historical anchor itself) |
| PR | #5 merged into it by the owner | [herkeys/her-keys#6](https://github.com/herkeys/her-keys/pull/6): OPEN, **draft**, MERGEABLE, base = Source A |

**Ancestry evidence (`git fetch --all --prune`, 2026-09-28):**
- Source B is exactly one commit on top of Source A: `git log 11c50be..15f19a0` = `15f19a0`.
- `git merge-base --is-ancestor` holds for **every** remote branch against `15f19a0`, including:
  - `main` `bab9773`
  - F01–F13 and `integration/f01-f13-convergence` `6cc0d77`
  - `refinement/ocr-assist` `4b1e72e`
  - `refinement/weather-device-location` `925d143`
  - `refinement/calendar-activation` `660f787`
  - `refinement/local-notifications` `12ca7b4`
  - `repair/hk-ei-fr01-session-continuity` `bbd77ce`
  - the repair branches

**`RECONCILIATION_CHANGES = NONE`.** The audit branch was created at `15f19a0`, which is a fast-forward of both lines. No merge, no conflict and no reconciliation commit were needed, so there is no merge artifact to classify. `SOURCE_RECONCILIATION=PASS`.

**Features present in the candidate:**
- `INTEGRATED_PROTOTYPE_WORK_PRESENT=PASS`:
  - F01–F13: routes `today`, `talk-it-out`, `calendar`, `systems/*`, and `life/{kids,home,coparent,meals,money,work,rebuild,admin,people,inbox,needs-me}`.
  - OCR (Life Admin scan).
  - Weather (device location).
  - Google Calendar.
  - Local notifications.
  - FR01 session continuity.
  - RevenueCat foundation.
- `GOOGLE_PARITY_WORK_PRESENT=PASS`: `googleIdentityOAuth.ts` and `+native-intent.tsx` are present.

Nothing planned is `NOT_PRESENT_IN_CANDIDATE`.

## 3. Source certification status

| | Status | Basis |
|---|---|---|
| `SOURCE_A_CERTIFICATION` | **UNVERIFIED_BASE** | See the notes after this table. |
| `SOURCE_B_CERTIFICATION` | **UNVERIFIED_BASE** | See the notes after this table. |
| `SOURCE_A_ENTRY_TESTS` | **3477 / 3477 pass** | Measured in this pass at `11c50be` (`Her-Keys-CAL01`; worktree clean before and after): `ℹ tests 3477 ℹ pass 3477 ℹ fail 0`. |
| `SOURCE_B_ENTRY_TESTS` | **3515, with 1 failure on Windows** | The ENTRY run (§5). The PR reports 3515/0 from a Linux container. |

**Source A.**
- No certification document covers `11c50be`.
- Its nearest certified ancestor is `integration/f01-f13-convergence` `6cc0d77`. That is "F01–F13 HOSTILE AUDIT: CERTIFIED — INTEGRATED ENGINEERING BASELINE" (`HK_F01_F13_HOSTILE_AUDIT.md` §21, gate 3322 tests).
- The 107 commits since then were builder-gated only:
  - refinement baseline, OCR, Weather, Calendar, notifications and FR01
  - `HK_OCR_ASSIST_IMPLEMENTATION.md`
  - `HK_EXTERNAL_INTELLIGENCE_ACTIVATION.md`, which says "prototype/device proof pending"
- None of them were hostile-audited.
- Known debt carried in: OD-HK13-01, OD-HK13-02 (the sign-in entry point), D20, D21, D32, D33, D37, D41 and D42.
- Known limitations: device proof not executed for OCR, Weather, Calendar or notifications.

**Source B.**
- The only document is the builder report `docs/refinements/HK_GOOGLE_AUTH_PLATFORM_PARITY.md` together with the PR body. It gives no audit verdict.
- It records 3515/0 in a Linux container.
- It says Staging auth and Google Cloud were unverified, because egress was blocked.

This pass certifies nothing either source did not earn. Its own verdict is FAIL.

## 4. Starting and ending SHA

- **Starting SHA:** `15f19a0ec6bc8b91661bb343d4b61fb71672dae3`, the audit-branch base.
  - Entry worktree `C:\Users\jsmit\Her Keys` was on `feature/01-today-chief-of-staff` @ `0a893ba` and clean.
  - `origin` is `git@github-herkeys:herkeys/her-keys.git`.
- **Ending SHA:** recorded in the commit that adds this report. The final report to the owner gives the pushed head.
- **Audit commits:**

| Commit | Content |
|---|---|
| `0bb157f` | PP-D02: host-independent Google parity source scan |
| `b44a487` | PP-D01: keep the Calendar OAuth return out of the router on Android |
| `46755e5` | Parity guards: registry, guard tests, mutation check |
| (docs commit) | This report, the remote-checks ledger, the registry-to-report guard, the mutation script header |

## 5. ENTRY baseline (after reconciliation, before any repair)

| Field | Value |
|---|---|
| ENTRY_SHA | `15f19a0` |
| ENTRY_NODE_VERSION | v24.14.0 |
| ENTRY_NPM_VERSION | 11.9.0 (the lockfile needs npm 11: PR #6 records npm 10.9.7 failing on the `react-native-worklets` optional peer) |
| Clean install | `npm ci --no-audit --no-fund`: exit 0, in 15m15s under host memory pressure |
| ENTRY_TYPESCRIPT | **PASS**: `tsc --noEmit` exit 0 |
| ENTRY_TESTS | **3515** in 805 suites |
| ENTRY_FAILURES | **1** |

- **Method:** `npm test`, which is `node --import register-ts --import register-jsx --test "tests/**/*.test.mjs"`.
- **Raw output:**
  - `ℹ tests 3515`, `ℹ suites 805`, `ℹ pass 3514`, `ℹ fail 1`.
  - Failing test: `tests\googleAuthParity.test.mjs:115`, "the literal appears exactly once in client source — the one constant".
  - `actual: [ 'src\\platform\\googleIdentityOAuth.ts' ]`, `expected: [ 'src/platform/googleIdentityOAuth.ts' ]`.
- **Interpretation:**
  - The test's `filesUnder` built paths with `path.join`, which uses `\` on Windows.
  - The test code is inherited from Source B. It is not a merge artifact, because there was no merge.
  - It was closed as PP-D02 before auditing continued.

## 6. EXIT baseline

| Check | Result | Evidence |
|---|---|---|
| Node / npm | v24.14.0 / 11.9.0 | `exit-npm-ci.log` |
| `npm ci` | **PASS**: 590 packages, 40.7 s, exit 0 | at `46755e5` |
| `npm run typecheck` | **PASS**: exit 0 | |
| `npm test` | **EXIT_TESTS = 3545, EXIT_FAILURES = 0** | See the notes after this table. |
| `npx expo install --check` | **PASS**: "Dependencies are up to date" | |
| `npx expo-doctor` | **PASS**: "21/21 checks passed. No issues detected!" | |
| `npx expo config --type introspect` | **PASS**: exit 0 | consumed by the registry guard on every run |
| `npx expo export --platform ios` | **PASS**: exit 0, 1837 modules, `entry-db44069212….hbc` 7,416,768 B | isolated TEMP cache |
| `npx expo export --platform android` | **PASS**: exit 0, 1974 modules, `entry-71b5973ef3….hbc` 7,738,637 B | isolated TEMP cache |

Notes on the `npm test` row:
- **Method:** the full `npm test` on the final tree.
- **Raw output:** `ℹ tests 3545 · ℹ suites 810 · ℹ pass 3545 · ℹ fail 0 · ℹ cancelled 0 · ℹ skipped 0 · ℹ todo 0`, exit 0. Count check: 3515 (ENTRY) + 15 (systemLinks) + 15 (registryGuard) = 3545.

Notes on the two export rows:
- **Proof that each export bundled this tree** (the shared-cache trap):
  - Control string `Rebuild your life.` = 1.
  - PP-D01-only string `/calendar-connected/` = 1.
  - `herkeys://auth/callback` = 1.
  - Removed `makeRedirectUri` = 0.
- All four held in **both** bundles.

**Test-count floor.**
- The higher source count is Source B, at 3515.
- EXIT is 3545.
- No test was removed or renamed.
- Added:
  - `tests/platformParity/systemLinks.test.mjs`: 15.
  - `tests/platformParity/registryGuard.test.mjs`: 15.
- One existing test was re-scoped: `googleAuthParity` "Android: the router is told to ignore the identity callback…" now asserts the composed router hook, because PP-D01 changed it.

**Mutation evidence.** `node scripts-dev/platform-parity-mutation-check.cjs` caught **5/5** real-file sabotages, and every file was restored byte-for-byte.

| Sabotage | Failing tests |
|---|---|
| S1: undeclared `Platform.OS` branch in `TodayBriefing.tsx` | 1 / 14 |
| S2: `GOOGLE_IDENTITY_REDIRECT` set to the Calendar route | 10 / 52 |
| S3: PP-D01 reverted | 9 / 29 |
| S4: Apple offered on Android | 3 / 14 |
| S5: Google registered iOS-only | 3 / 52 |

### 6.1 Repair-pass gates (at `85ad422`, 2026-09-28)

| Check | Result |
|---|---|
| Node / npm | v24.14.0 / 11.9.0 (lockfile untouched) |
| `npm run typecheck` | **PASS**: exit 0 |
| `npm test` | **3574 tests, 3574 pass, 0 fail**, 817 suites, exit 0 |
| `npx expo install --check` | **PASS**: "Dependencies are up to date" |
| `npx expo-doctor` | **PASS**: 21/21 |
| `npx expo config --type introspect` | **PASS**: exit 0; also consumed by the registry guard |
| `npx expo export --platform ios` | **PASS**: exit 0, 1841 modules, `entry-b133398c….hbc` 7,420,314 B |
| `npx expo export --platform android` | **PASS**: exit 0, 1978 modules, `entry-1835929c….hbc` 7,742,337 B |
| Platform-parity mutation check | **9/9 caught** (S1–S5 unchanged; S6–S9 new), every file restored byte-for-byte |

**Test count.** 3574 = 3545 (the audit's EXIT) + 25 (`accountAccess`) + 2 (`routeAccess`: PP-D21, PP-D04) + 2 (`registryGuard`: PP-D03 check and negative control). No test was removed.

**Bundle proof.** Both bundles contain:
- the control string `Rebuild your life.`
- PP-D01's `/calendar-connected/`
- PP-D04's `is connected.`
- PP-D03's note, stored as UTF-16 because of its em dash: 1 occurrence in each bundle.

**Regression.**
- PP-D01: `systemLinks` 15/15; mutant S3 caught.
- PP-D02: `googleAuthParity` 38/38 on Windows.

## 7. Capability matrix

This matrix is built by tracing the platform boundary, not by trusting shared code alone. There are no `*.ios.*`, `*.android.*`, `*.native.*` or `*.web.*` files anywhere in `app/` or `src/`.

The following columns hold the same value for every row, so they are stated once here:
- **IOS_ENTRY_POINT = ANDROID_ENTRY_POINT.** The only platform differences in entry points are Apple sign-in (EX-01) and the Android notification channel.
- **IOS_ROUTE = ANDROID_ROUTE.** No route file is platform-specific.
- **IOS_GATE = ANDROID_GATE**, with one exception: Apple sign-in's availability gate, `Platform.OS !== 'ios'` (PC-02).

| FEATURE | IOS / ANDROID AVAILABLE | ENTRY POINT / ROUTE | GATE (both) | DEPENDENCIES | BEHAVIOR EQUIVALENT | INTENTIONAL DIFFERENCE | PARITY_PROOF | DEFECT | STATUS |
|---|---|---|---|---|---|---|---|---|---|
| Onboarding | Y / Y | `index` → `onboarding/*` | `routeAccess` `Stack.Protected` | expo-router | Y | none | shared routes; `routeAccess` tests | — | PASS |
| Today / Daily Load / Capacity / One Move | Y / Y | tab `today` | `(app)` guard | — | Y | none | no platform code (registry scan) | — | PASS |
| Talk It Out | Y / Y | modal `talk-it-out` | guard | RN `KeyboardAvoidingView` | Y | keyboard behavior (PC-05, class A/E) | registry | — | PASS static; RT-18 |
| Life hub + Kids, Home, Co-Parent, Meals, Money, Work, Me/Rebuild, Life Admin, People, Inbox, Needs-me | Y / Y | tab `life` → `life/*` | guard | — | Y | none | registry scan | — | PASS |
| Calendar (canonical) | Y / Y | tab `calendar`, `event-editor` | guard | — | Y | none | registry scan | — | PASS |
| Systems / Routines | Y / Y | tab `systems`, `systems/edit` | guard | RN `KeyboardAvoidingView` | Y | keyboard behavior (PC-06, class E) | registry | PP-D10 (P7) | PASS static; RT-18 |
| Google sign-in | Y / Y | Today → "Sign in" → Your Account (`sign-in`) | `account` (every state except `boundOther`); registered where `secureStorageAvailable` | Supabase Auth, expo-web-browser | Y: one code path, Platform never read | native auth session (ND-01) | `googleAuthParity` 38; registry guard; accountAccess; S2, S5 and S6 mutants | PP-D01 (router), PP-D21 (navigator), CFG-01 (Staging) | code PASS; config FAIL (Staging) |
| Apple sign-in | Y / **N** | Your Account (iOS only) | `Platform.OS === 'ios'` then `isAvailableAsync` | expo-apple-authentication (Apple only) | n/a | **EX-01** (owner-approved, with portability limitation and iOS disclosure) | registry guard EX-01 + `exceptionViolations`; accountAccess PP-D03; S4, S8 and S9 mutants | PP-D03 (closed as exception) | INTENTIONAL_EXCEPTION |
| Session restore / refresh / degraded / reconnect | Y / Y | launch; `AccountProvider` AppState | — | expo-secure-store | Y | keychain survives reinstall on iOS (ND-06) | `accountRuntime` and FR01 tests | PP-D05 (P4) | PASS static |
| Your Account: sign out / reconnect / switch | Y / Y | Today → "Your account" / "Reconnect" | `account` | — | Y (AccountRuntime `signOut` / `signIn`; switching through quarantine) | none | accountAccess 25 (real AccountRuntime journeys); routeAccess; S6 and S7 mutants | PP-D04 closed | PASS static; RT-21 |
| Account conflict / quarantine | Y / Y | automatic (`boundOther`) | `quarantined` | — | Y | none | `routeAccess`; accountAccess 6/6b; S6 mutant | — | PASS static |
| Sync | Y / Y | automatic | `accountBound` | Supabase | Y (one runtime, `composeAccountApp`) | none | no platform code; hk-f01f13 tests | — | PASS |
| Google Calendar connect / list / select / disconnect | Y / Y | Calendar panel | `accountBound` and server "available" | expo-web-browser, Edge Functions | Y | native auth session (ND-01) | `systemLinks` 15; registry guard; S3 mutant | **PP-D01 repaired** | PASS static; RT-06..09 |
| Weather (device location) | Y / Y | Today card, "Use my location" | user action only | expo-location | Y | precision model (ND-04) | `tests/weather` 44; introspect | — | PASS static; RT-10..12 |
| OCR scan to review (Life Admin) | Y / Y | Life Admin "Scan" | camera permission on camera path only | expo-image-picker, image-manipulator, file-system, expo-ocr-kit | Y (candidate semantics) | Vision vs ML Kit (ND-02); picker (ND-03) | OCR guard tests (68) | PP-D06 (P4) | PASS static; RT-13..15 |
| Local reminder notifications | Y / Y | Today "Turn on" | user action only | expo-notifications | Y | channel (PC-03); inexact alarms on Android (PP-D11) | notification architecture tests | PP-D11 (P4) | PASS static; RT-16..17 |
| RevenueCat entitlements | Y / Y | `onboarding/plus`, Systems | fail-open `unknown` | react-native-purchases (+ui) | Y | per-store key (PC-04) | `monetization` tests | — | UNVERIFIED_RUNTIME |
| Deep links | Y / Y | `herkeys://…` | route guards | expo-router, `+native-intent` | Y | Android also delivers OAuth returns to the router (ND-01) | registry guard (`singleTask` + VIEW/BROWSABLE) | PP-D01 repaired | PASS |
| Account deletion | N / N | — | — | — | — | — | — | — | `ACCOUNT_DELETION_NOT_IMPLEMENTED` |

## 8. Intentional exceptions

- **EX-01: Sign in with Apple is iOS-only in Her Keys V1.** `PRODUCT_APPROVED_INTENTIONAL_EXCEPTION`, approved by the owner (Build Manager decision) in the P0–P3 repair pass, 2026-09-28.
  - On Android the adapter returns `isAvailable() = false` before touching the native module. Your Account renders only the providers the device reports available.
  - No Android Apple button, deep link or web flow exists.
  - Shared account code never assumes the provider: `ProviderIdentity.provider` is only provenance, and the session is keyed by the Supabase user id.
  - Guarded by `registryGuard` EX-01 and `exceptionViolations`, and by mutants S4, S8 and S9.
- **Portability limitation (part of EX-01; closes PP-D03).**
  - An Apple account that shared its real verified email reaches the same Her Keys account through Google sign-in with that email, because Supabase links identities with matching verified emails.
  - An Apple-only account that uses Hide My Email (a private-relay address) **may not be directly accessible from Android in V1**.
  - Google is the cross-platform sign-in method for V1.
  - This is an intentional V1 limitation, not accidental platform drift.
  - Apple web OAuth on Android and Supabase `linkIdentity` were deliberately **not** built: no new multi-provider linking surface during the V1 freeze.
- **User-facing disclosure (iOS only).**
  - Where Apple is offered, Your Account shows beneath the provider choice: "Planning to use Her Keys on an Android phone too? Choose Google — it works on both."
  - It is not shown on Android, where Apple is not offered.
  - It is not shown in Reconnect, which must return to the same account.
  - It is not a blocking warning.
- **Registry:** `exceptions[EX-01].portabilityLimitation` in [`HK_PLATFORM_PARITY_REGISTRY.json`](HK_PLATFORM_PARITY_REGISTRY.json). The guard fails if it (or its approval, or the disclosure) is removed while Apple stays iOS-only.

No other exception is claimed. Everything in §9 is either a necessary native difference (class A) or a runtime-proof item (class E).

## 9. Machine-readable platform registry

This section summarizes [`HK_PLATFORM_PARITY_REGISTRY.json`](HK_PLATFORM_PARITY_REGISTRY.json), which is the single source of truth.

**Platform conditionals** (every one in `app/` and `src/`, with exact counts enforced):

| ID | File | Count | Class | What |
|---|---|---|---|---|
| PC-01 | `src/platform/secureStore.ts` | 1 | A | No secure storage on web; both native platforms use SecureStore |
| PC-02 | `src/platform/appleProvider.ts` | 1 | B | Apple sign-in iOS-only (EX-01) |
| PC-03 | `src/platform/localNotifications.ts` | 2 | A | Android notification channel |
| PC-04 | `src/monetization/revenueCatClient.ts` | 3 | A | Per-store RevenueCat public key |
| PC-05 | `src/features/talk-it-out/TalkItOutView.tsx` | 2 | E | Keyboard avoidance (RT-18) |
| PC-06 | `src/features/systems/editor/SystemEditor.tsx` | 1 | E | Keyboard avoidance; Android relies on `adjustResize` (PP-D10, RT-18) |

No class C (parity defect) or D (dead) conditional remains.

**Registry contents beyond the conditionals:**
- platform files: none
- exceptions: EX-01
- the two OAuth return routes
- the native identity and permission doctrine
- native differences ND-01 to ND-06

**Guard: `tests/platformParity/registryGuard.test.mjs`.**
- **What it checks:**
  1. Scans `app/` and `src/`. Comments are ignored.
  2. Fails on any unregistered conditional, a changed count, a vanished entry, or an unregistered platform file.
  3. Checks identifiers, scheme, blocked and forbidden permissions and required plugins against the real `expo config --type introspect`.
  4. Checks the Android `singleTask` activity and its `herkeys` VIEW/BROWSABLE filter.
  5. Checks OAuth-return isolation.
  6. Checks Apple availability per platform.
  7. Checks that this report cites the registry and every PC id.
- **Negative controls:** six, each proving a check can fail.

## 10. Remote configuration verification

The full evidence is in [`HK_PLATFORM_PARITY_REMOTE_CHECKS.md`](HK_PLATFORM_PARITY_REMOTE_CHECKS.md). `REMOTE_MUTATION=NO`.

| | Staging `fhhudicklmpofuzkxeqe` | Production `npykvnxnehlsdlbumzwk` |
|---|---|---|
| Google provider enabled | yes | yes |
| Identity client Supabase sends to Google | `857660202409-mrhq0…`, an **installed/native** client (no redirect URIs) | `857660202409-109l3…`, the **Web identity client** |
| Supabase → Google redirect | `https://fhhudicklmpofuzkxeqe.supabase.co/auth/v1/callback` ✔ | `https://npykvnxnehlsdlbumzwk.supabase.co/auth/v1/callback` ✔ |
| Google's answer | **`redirect_uri_mismatch`** ✘ | sign-in page ✔ |
| Calendar client used for identity? | no (`s63d2…` unused) | no |
| Secret present | not observable (an installed client has none; the Web client needs one) | implied (Google proceeds; the exchange is not exercised) |
| `herkeys://auth/callback` allow-listed | UNVERIFIED (OA-02) | UNVERIFIED (OA-02) |

- `GOOGLE_CONFIG_STAGING=FAIL` (CFG-01).
- `GOOGLE_CONFIG_PRODUCTION=PASS` for the provider, client and callback. The allow-list is UNVERIFIED.
- `STAGING_PRODUCTION_AUTH_PARITY=FAIL`.

**Owner authorization received mid-pass.** The owner authorized updating Staging so it matches Production. I still could not apply it:
- The Chrome extension was not connected.
- The Supabase MCP has no auth-config write.
- The only local Supabase CLI login belongs to the K Scan organization, which must not be touched.
- The client secret must be entered by the owner in any case.

The exact correction is in CFG-01.

## 11. Google identity findings

**Architecture (identical on iOS and Android).**
1. `supabase.auth.signInWithOAuth({provider:'google', options:{redirectTo:'herkeys://auth/callback', skipBrowserRedirect:true}})`
2. `WebBrowser.openAuthSessionAsync`
3. Exact callback route check
4. Refuse token-bearing callbacks and `error` callbacks
5. `exchangeCodeForSession` (PKCE; verifier in memory, `persistSession:false`)
6. `sessionFromSupabase`
7. `ProviderResult`
8. `AccountRuntime`: provider client → secure store → data client `setSession`

- No `Platform` is read anywhere in the path.
- No per-platform client ID remains.
- **Redirects:**
  - `DOCTRINE_AUTH_REDIRECT=herkeys://auth/callback`
  - `ACTUAL_IOS_AUTH_REDIRECT=herkeys://auth/callback`
  - `ACTUAL_ANDROID_AUTH_REDIRECT=herkeys://auth/callback`

  All three are the constant `GOOGLE_IDENTITY_REDIRECT`, which appears exactly once in client source. `makeRedirectUri` is gone.
- `AUTH_REDIRECT_PARITY=PASS`.

**Android Custom Tabs asymmetry (traced in `expo-web-browser` 57.0.3 `build/WebBrowser.js`).**
- On Android, `openAuthSessionAsync` is a JS polyfill. It runs `Promise.race` between:
  - the Custom Tab closing, detected as AppState `active`, which resolves `{type:'dismiss'}`
  - `Linking` `url` matching `startsWith(returnUrl)`, which resolves `{type:'success', url}`
- On return, Android calls `onNewIntent` (which emits `url`) before `onResume` (which emits AppState). The `url` resolution therefore wins.
- A pure dismissal (Back or close) maps to `cancelled`, which is equivalent to iOS `cancel`.
- The same callback URL also reaches Expo Router. `+native-intent` returns `null` for it (PR #6), so no Unmatched screen appears.
- **Process recreated during auth:**
  - The PKCE verifier lived in memory and is lost.
  - The callback cold-starts the app. `redirectSystemPath` returns `null`, and expo-router's `getInitialURL` treats `null` as "no deep link".
  - The app opens normally, not signed in.
  - The iOS equivalent (the process dies inside ASWebAuthenticationSession) ends the same way.
  - Logical result on both: no session, nothing changed. The silence is PP-D13 (P7).
- **Stale or duplicate callback:**
  - A second delivery after the session closed reaches only the router, which swallows it.
  - A replayed code without the verifier never reaches the token endpoint (the supabase-js PKCE round-trip test).
- **Dismiss winning over a real callback:** discarded silently. This is theoretical given the lifecycle order, and it is PP-D12 (P7, RT-02).

**Hostile inputs (test-proven in `googleAuthParity`):**
- cancel and dismiss
- provider `error`/`error_description`
- missing code
- token-bearing (implicit) callback refused
- wrong route (`herkeys://auth/callbackX`, foreign host)
- Calendar URL delivered to the identity session
- `exchangeCodeForSession` error
- non-uuid user id
- missing verifier / replay

**State.** Wrong OAuth `state` is validated server-side by GoTrue. The PKCE `flow_state` binds the code to the verifier, and the app never sees `state`.

**Session mapping** is shared (`sessionMapping.ts`). Token ownership: the provider client holds the session only in memory, and the secure store is the single durable home. The in-memory residue is PP-D17 (P10).

**Verdicts:** `GOOGLE_CODE_PARITY_IOS_ANDROID=PASS`; `ACCOUNT_SESSION_STATIC_PARITY=PASS`; `SESSION_SECURITY_STATIC_PARITY=PASS`.

## 12. Calendar isolation findings

**The two routes:**
- Identity: `herkeys://auth/callback`.
- Calendar: `herkeys://calendar-connected`, reached through `calendar-oauth` → Edge Function → app.

**Ownership:**
- Identity code never names the Calendar route.
- Calendar code never names the identity route, `signInWithOAuth` or `exchangeCodeForSession`. Both are guarded.
- Google's Calendar client `s63d2…` is separate from the identity client `109l3…` (remote R12).
- Calendar authorization runs server-side, in Edge Functions using the Her Keys session JWT. It stores encrypted refresh tokens server-side and never calls `setSession` or touches the secure session. It therefore cannot change Her Keys identity, even when the user connects a different Google account.

**PP-D01 (P2, Android-only, REPAIRED):**
- **Before:** on Android the Calendar return URL also reached Expo Router. There is no screen for it, so every successful connection ended on Expo Router's "Unmatched Route / Page could not be found" screen (with a Sitemap link) on top of Calendar. iOS never showed it.
- **Now:** `src/platform/systemLinks.ts` swallows the exact Calendar return, both cold and warm. The auth session's own `Linking` listener still resolves `success`, so the connection and refresh are unchanged.
- **Cross-delivery:**
  - The identity callback delivered to the Calendar session: `startsWith` does not match, so it is ignored, and the router swallows it.
  - The Calendar return delivered to the identity session: `providerError`, with no exchange (test-proven).

**Verdicts:** `CALENDAR_AUTH_SEPARATION=PASS`, `CALENDAR_STATIC_IOS=PASS`, `CALENDAR_STATIC_ANDROID=PASS` (after the repair).

## 13. Native dependency findings

Versions and platform support were read from the installed packages (`expo-module.config.json`, `ios/`, `android/`, `app.plugin.js`).

| PACKAGE | VERSION | IOS | ANDROID | CONFIG_PLUGIN | NOTES / KNOWN_DIFFERENCE | PARITY_IMPACT |
|---|---|---|---|---|---|---|
| expo | ~57.0.25 | ✔ | ✔ | — | doctor 21/21 | none |
| expo-router | 57.0.23 | ✔ | ✔ | ✔ | Android delivers auth returns to the router (ND-01) | handled by `+native-intent` |
| @supabase/supabase-js | 2.116.0 | JS | JS | — | PKCE with in-memory storage | none |
| expo-web-browser | 57.0.3 | native ASWebAuthenticationSession | JS polyfill + Custom Tabs | ✔ | ND-01 | PP-D12/13 (P7) |
| expo-auth-session | 57.0.13 | — | — | — | **no longer imported** | PP-D16 (P9) |
| expo-apple-authentication | 57.0.2 | ✔ | ✘ (Apple only) | ✔ (`usesAppleSignIn`) | EX-01 | intentional |
| expo-secure-store | 57.0.4 | Keychain | Keystore + SharedPreferences | ✔ | no value-size cap in 57; backup rules exclude SecureStore; plugin adds a Face ID string | PP-D05, PP-D09 |
| @react-native-async-storage/async-storage | 2.2.0 | files | SQLite (6 MB default DB cap) | — | single-key household blob | PP-D14 (P8) |
| expo-location | 57.0.20 | When-In-Use | COARSE (FINE removed) | ✔ | Android `granted` is computed from COARSE | none |
| expo-notifications | 57.0.21 | ✔ | ✔ (POST_NOTIFICATIONS, BOOT_COMPLETED receiver) | ✔ | Android 12+ inexact without exact-alarm permission; iOS adds `aps-environment` | PP-D11 (P4) |
| expo-image-picker | 57.0.20 | PHPicker, no photo permission | Photo Picker; legacy storage permissions from the library manifest (maxSdk 32) | ✔ | Android can lose a capture on process death | PP-D06, PP-D07 |
| expo-image-manipulator | 57.0.20 | ✔ | ✔ | — | EXIF stripped by re-encode | none |
| expo-file-system | 57.0.7 | ✔ | ✔ | ✔ | temp cleanup | none |
| expo-ocr-kit | 0.1.4 (exact) | Apple Vision, iOS ≥ 15.1 | bundled ML Kit text-recognition 16.0.1 | ✔ (not registered; it only adds a camera string/permission, which image-picker already provides) | ND-02 | none |
| expo-crypto / expo-constants / expo-linking | 57.x | ✔ | ✔ | — | — | none |
| react-native-purchases / -ui | 10.9.1 | ✔ | ✔ | — | per-store key; no EAS keys yet | runtime |
| expo-dev-client | 57.0.19 | ✔ | ✔ | ✔ | development only | none |

- `NATIVE_DEPENDENCY_PARITY=PASS`: every customer-facing package supports both platforms, except Apple authentication, which is intentional.
- `REVENUECAT_PARITY=UNVERIFIED_RUNTIME`: the code is present and platform-neutral apart from the key.

## 14. Native config findings

**Workflow.**
- Managed. `ios/` and `android/` are neither present nor tracked, and none were introduced.
- Evidence: `expo config --type introspect`, plus a disposable Android prebuild (`--clean --no-install`) in a scratch copy. The copy was deleted afterwards, with zero reparse points left.
- An iOS prebuild **cannot run on Windows**: "Skipping generating the iOS native project files". Generated iOS files are therefore **ENVIRONMENT_BLOCKED**, and the iOS checks use introspection.

**iOS:**
- Identity:
  - bundle `com.herkeys.app` ✔
  - `CFBundleURLSchemes` `herkeys`, `com.herkeys.app` (plus the dev-client `exp+her-keys`) ✔
  - entitlement `com.apple.developer.applesignin` ✔; `aps-environment` = development (plugin default, local notifications only)
- Usage strings:
  - `NSCameraUsageDescription` (custom) ✔
  - `NSLocationWhenInUseUsageDescription` ✔
  - `NSMotionUsageDescription` (custom, declared but inert — required by App Store Error 90683; Weather never requests motion authorization) ✔ (TestFlight build 2 repair pass, 2026-09-28)
- Correctly absent:
  - no Always location strings
  - no `NSMicrophoneUsageDescription`
  - no `NSPhotoLibraryUsageDescription` (not needed with PHPicker)
  - no `UIBackgroundModes`
- Needs attention:
  - `NSFaceIDUsageDescription` is injected by secure-store but never used (PP-D09).
  - Introspection's base template shows `NSAllowsArbitraryLoads: true`. It is UNVERIFIED for a real prebuild (PP-D08).
  - A privacy manifest is not configured in `app.json`. This is a later release gate (P10 note inside PP-D08).

**Android (generated project):**
- Identity:
  - package `com.herkeys.app` ✔ (as observed at this audit; superseded by REL-01, the Android application id is now `com.heykeys.app`)
  - `MainActivity` is `singleTask` and exported, with VIEW/DEFAULT/BROWSABLE `herkeys` (and `exp+her-keys`) ✔
  - `adjustResize`; `screenOrientation=portrait`
- Build: `minSdk 24`, `targetSdk 36`, `compileSdk 36`, `edgeToEdgeEnabled=true`, `newArchEnabled=true`, Hermes.
- Permissions (merged from the library manifests, which were inspected directly):
  - Present: `CAMERA` (image-picker); `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED` (notifications); `ACCESS_COARSE_LOCATION`.
  - Removed: `ACCESS_FINE_LOCATION` (`tools:node="remove"`) ✔ and `RECORD_AUDIO` ✔.
  - Correctly absent: no background location and no foreground service.
- Needs attention: `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32), `SYSTEM_ALERT_WINDOW` and `VIBRATE` are declared in the release manifest (PP-D07).
- Backup: `allowBackup=true` with secure-store rules that include only SharedPreferences and exclude `SecureStore`.

**Verdicts:** `NATIVE_CONFIG_PARITY=PASS`, `DEEPLINK_STATIC_PARITY=PASS`.

**Environment selection.**
- `src/config/supabase.ts` reads only `EXPO_PUBLIC_SUPABASE_URL`, `…_PUBLISHABLE_KEY` (or `…_ANON_KEY`) and `EXPO_PUBLIC_HERKEYS_BACKEND`.
- `assertBackendMatchesUrl` fails closed when a profile's declared backend and its URL disagree.
- `eas.json` sets the backend per profile, never per platform: development → staging; preview and production → production.
- No `Platform` read, no platform fallback, and no hidden default exist.
- `ENVIRONMENT_SELECTION_PARITY=PASS`.

## 15. Hostile scenario matrix

Mock tests are regression guards, not device evidence.

| # | SCENARIO_NAME | EXECUTION_METHOD | STATUS | EVIDENCE | DEFECT_ID |
|---|---|---|---|---|---|
| 1 | New Google user | TEST_PROVEN (code) / RUNTIME_REQUIRED | UNVERIFIED_RUNTIME (Staging blocked) | googleAuthParity §1–5; bootstrap in accountRuntime tests; Today → Sign in entry (accountAccess) | CFG-01 |
| 2 | Existing Google user | TEST_PROVEN / RUNTIME_REQUIRED | UNVERIFIED_RUNTIME | accountRuntime resume tests | CFG-01 |
| 3 | Google cancel | TEST_PROVEN | PASS (code) | `cancel`/`dismiss` → `cancelled` | — |
| 4 | Google error | TEST_PROVEN | PASS (code) | `error`/`error_description` → providerError | — |
| 5 | Browser close | STATIC_PROVEN (polyfill traced) + TEST_PROVEN | PASS (code) | Android AppState → `dismiss` → cancelled | — |
| 6 | Malformed callback | TEST_PROVEN | PASS | exact-route parser; undecodable params ignored | — |
| 7 | Wrong OAuth state | STATIC_PROVEN | PASS (server-owned) | PKCE `flow_state` in GoTrue; the app never sees `state` | — |
| 8 | Duplicate callback | STATIC_PROVEN + TEST_PROVEN | PASS | second delivery swallowed by the router; replay without verifier refused | — |
| 9 | Stale callback | STATIC_PROVEN | PASS | session closed → router swallows (cold and warm) | PP-D13 (P7, silent) |
| 10 | Logout / re-login | TEST_PROVEN | PASS (code); UNVERIFIED_RUNTIME | Today → Your account → Sign out → Sign in; real AccountRuntime journey: binding kept, credential cleared, same household resumes (accountAccess 9) | PP-D04 closed |
| 11 | Session restoration | TEST_PROVEN | PASS (code); UNVERIFIED_RUNTIME | accountRuntime restore / FR01 tests | PP-D05 (P4) |
| 12 | Account switch | TEST_PROVEN | PASS (code); UNVERIFIED_RUNTIME | Sign out → Sign in as B → `boundOther` → account-conflict only; Your Account closed in quarantine (accountAccess 6, 10) | PP-D04 closed |
| 13 | Apple-created account later used from Android | STATIC_PROVEN | INTENTIONAL_EXCEPTION | Real verified email: the same account through Google. Hide My Email: not reachable in V1, owner-approved EX-01 limitation, disclosed on iOS (accountAccess PP-D03; registry `exceptionViolations`) | PP-D03 closed |
| 14 | Calendar connect after identity login | STATIC_PROVEN | UNVERIFIED_RUNTIME | bridge requires `accountBound` | — |
| 15 | Calendar with a different Google account | STATIC_PROVEN | PASS (static) | server-side tokens; identity never touched | — |
| 16 | Calendar disconnect | STATIC_PROVEN | UNVERIFIED_RUNTIME | `disconnectCalendar` + revocation (runbook) | — |
| 17 | Calendar reconnect | STATIC_PROVEN | UNVERIFIED_RUNTIME | `reauth_required` state | PP-D19 (P5) |
| 18 | Identity callback delivered to the Calendar path | STATIC_PROVEN + TEST_PROVEN | PASS | `startsWith` mismatch; router swallows | — |
| 19 | Calendar callback delivered to the identity path | TEST_PROVEN | PASS | providerError, no exchange | — |
| 20 | Location denied | TEST_PROVEN | PASS (code) | tests/weather behavior | — |
| 21 | Location permanently denied | TEST_PROVEN | PASS (code) | `canAskAgain=false` → Open Settings | — |
| 22 | Weather unavailable | TEST_PROVEN | PASS (code) | unavailable renders nothing | — |
| 23 | Camera denied | STATIC_PROVEN | PASS (code) | `permission-denied` outcome | — |
| 24 | OCR unavailable | STATIC_PROVEN + TEST_PROVEN | PASS (code) | recognize error → cleanup + error | — |
| 25 | OCR empty | TEST_PROVEN | PASS (code) | empty candidate path | — |
| 26 | Notification denied | TEST_PROVEN | PASS (code) | preference disabled, reminders cancelled | PP-D20 (P10) |
| 27 | Notification tap / open | STATIC_PROVEN | UNVERIFIED_RUNTIME | response listener + `getLastNotificationResponse` | — |
| 28 | Cold-start deep link | STATIC_PROVEN | PASS (static) | navigator waits for hydration; guards apply | — |
| 29 | Foreground / background | STATIC_PROVEN | UNVERIFIED_RUNTIME | AppState refresh (session, entitlement, permission, weather) | — |
| 30 | Android process death during auth | STATIC_PROVEN | PASS (safe), UNVERIFIED_RUNTIME | verifier lost → not signed in; `null` initial URL → normal launch | PP-D13 (P7) |
| 31 | Offline → online | TEST_PROVEN | PASS (code) | sync/transport tests | — |
| 32 | Sync conflict | TEST_PROVEN | PASS (code) | clash / keptLocal tests | — |
| 33 | Refused sync row | TEST_PROVEN | PASS (code) | refusal tests | — |
| 34 | Account switch with pending state | TEST_PROVEN (quarantine) / RUNTIME_REQUIRED | PASS (code); UNVERIFIED_RUNTIME | Sign out stops sync; B's sign-in quarantines A's household, including pending rows (never uploaded, never deleted: accountRuntime 23); account-conflict → Sign out returns to A | PP-D04 closed |
| 35 | Equivalent operation → equivalent durable state | STATIC_PROVEN | PASS | no platform branch in domain, sync or persistence (registry scan) | — |
| 36 | Account deletion | — | NOT_IMPLEMENTED | — | release item |
| 37 | Purchase succeeds (RevenueCat) | STATIC_PROVEN | UNVERIFIED_RUNTIME | shared outcome mapping | — |
| 38 | Restore purchases | STATIC_PROVEN | UNVERIFIED_RUNTIME | shared restore mapping | — |
| 39 | Unknown entitlement → fallback | TEST_PROVEN | PASS (code) | `unknown` fails open; `checkFeatureAccess` | — |

## 16. P0–P10 defect ledger

| ID | Priority | Capability | Platform(s) | Description | Status |
|---|---|---|---|---|---|
| CFG-01 | **P1** | Google identity (Staging) | both | The Staging Google provider sends an installed/native client, so Google returns `redirect_uri_mismatch` | **OPEN**: owner configuration (re-probed 2026-09-28 17:32 UTC, unchanged) |
| PP-D01 | **P2** | Calendar connect | Android | Calendar OAuth return routed to Expo Router → "Unmatched Route" screen | **REPAIRED** `b44a487` |
| PP-D03 | **P2** | Account portability | Android | Apple "Hide My Email" account unreachable from Android (no linking, no Apple on Android), undocumented | **CLOSED** `1618299`: ORIGINAL_PRIORITY=P2, RESOLUTION=PRODUCT_APPROVED_INTENTIONAL_EXCEPTION |
| PP-D21 | **P1 (found in the repair pass)** | Sign-in navigation | both | `canOpenScreen` closed every root screen while `authenticating`, leaving the root stack only Expo Router's injected `_sitemap` / `+not-found`. The sign-in modal and the app vanished mid-flow and she was left on Sitemap / Unmatched Route. | **REPAIRED** `9d4c643` |
| PP-D04 | **P2** | Account UI | both | No entry point to `/sign-in`; sign-out only on the conflict screen (OD-HK13-02) | **REPAIRED** `24adfbf` |
| PP-D02 | **P3** | Test gate | host (Windows) | Google parity source scan compared `\` paths to `/` literals | **REPAIRED** `0bb157f` |
| PP-D05 | P4 | Session restore | iOS vs Android | Documented below | documented |
| PP-D06 | P4 | OCR camera | Android | Documented below | documented |
| PP-D11 | P4 | Reminders | Android | Documented below | documented |
| PP-D19 | P5 | Calendar state | both (Android likelier) | Documented below | documented |
| PP-D07 | P6 | Permissions surface | Android | Documented below | documented |
| PP-D10 | P7 | Keyboard | Android 15+ | Documented below | documented |
| PP-D12 | P7 | Google auth resilience | Android | Documented below | documented |
| PP-D13 | P7 | Auth lifecycle | both | Documented below | documented |
| PP-D08 | P8 | Network security posture | iOS | Documented below | documented |
| PP-D14 | P8 | Local persistence | Android | Documented below | documented |
| PP-D09 | P9 | iOS usage strings | iOS | Documented below | documented |
| PP-D15 | P9 | Calendar bridge | both | Documented below | documented |
| PP-D16 | P9 | Dependencies/config | both | Documented below | documented |
| PP-D17 | P10 | Token hygiene | both | Documented below | documented |
| PP-D18 | P10 | Timezone | both | Documented below | documented |
| PP-D20 | P10 | Notifications | both | Documented below | documented |

**Counts:** P0 0; P1 2 (1 repaired [PP-D21], 1 open [CFG-01]); P2 3 (2 repaired [PP-D01, PP-D04], 1 closed as an approved exception [PP-D03], 0 open); P3 1 (1 repaired, 0 open); P4 3; P5 1; P6 1; P7 3; P8 2; P9 3; P10 3. The P4–P10 items are unchanged by the repair pass.

### P4–P10 detail

Each entry gives the evidence, the user impact, why it does not block, the recommended fix and its timing.

**PP-D05 (P4): iOS restores the previous account after a reinstall or a device restore; Android does not.**
- **Evidence:** the iOS Keychain survives app deletion and is included in encrypted and iCloud backups, as is AsyncStorage. Android's backup rules include only SharedPreferences and exclude `SecureStore`, and AsyncStorage's SQLite database is not included.
- **User impact:** after a reinstall, iOS comes back signed in to the old account with an empty local household, then hydrates it. Android needs sign-in, and cloud hydration converges it.
- **Why non-blocking:** the durable result converges after sign-in, and there is no corruption.
- **Fix:** a first-launch sentinel in AsyncStorage. When it is missing, clear the secure session before `restore()`.
- **Timing:** before TestFlight.

**PP-D06 (P4): Android loses an OCR camera capture if the OS kills Her Keys while the camera app is foreground.**
- **Evidence:** `ocrNativeAdapter.ts` never calls `ImagePicker.getPendingResultAsync`. On iOS the camera runs in-process.
- **User impact:** she must retake the photo.
- **Why non-blocking:** safe. Nothing is saved (`captured != saved`).
- **Fix:** read `getPendingResultAsync()` on the Life Admin mount and route it to review.
- **Timing:** after the Part 2 observation.

**PP-D11 (P4): Android 12+ fires the date reminder inexactly.**
- **Evidence:** `ExpoSchedulingDelegate` uses `setAndAllowWhileIdle` without `SCHEDULE_EXACT_ALARM`. iOS fires exactly.
- **User impact:** the "tomorrow" reminder can arrive minutes late.
- **Why non-blocking:** the product semantics (a quiet next-day reminder) tolerate it. The exact-alarm permission is Play-restricted.
- **Fix:** none. Document it, or state the tolerance in copy.
- **Timing:** informational.

**PP-D19 (P5): Calendar refreshes only on `success`.**
- **Evidence:** `useGoogleCalendarBridge.connect`.
- **User impact:** if she closes the tab after the server finished the exchange, the panel shows "disconnected" until the next refresh.
- **Why non-blocking:** the state self-heals on the next mount or refresh.
- **Fix:** call `refresh()` after any result.
- **Timing:** next Calendar change.

**PP-D07 (P6): legacy and surplus Android manifest permissions.**
- **Evidence:** `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32; from the image-picker and file-system library manifests); `SYSTEM_ALERT_WINDOW` and `VIBRATE` (Expo template). iOS asks for no photo permission at all.
- **User impact:** none at runtime. They appear in the Play "permissions" listing and in store review.
- **Why non-blocking:** Her Keys never requests them.
- **Fix:** add them to `android.blockedPermissions` after confirming that the Photo Picker fallback on API ≤ 32 does not need them.
- **Timing:** before the Play submission.

**PP-D10 (P7): `SystemEditor` gives Android `KeyboardAvoidingView behavior={undefined}` and relies on `adjustResize`.**
- **Evidence:** with `edgeToEdgeEnabled=true` and `targetSdk 36`, `adjustResize` may not lift content.
- **User impact:** fields low on the Systems editor may be hidden behind the keyboard on Android 15+.
- **Why non-blocking:** unproven. It needs a device (RT-18).
- **Fix:** use `behavior="height"` on Android, or keyboard-inset padding.
- **Timing:** after RT-18.

**PP-D12 (P7): if Android's AppState `active` ever resolves before `Linking`, a real Google callback is discarded silently.**
- **Evidence:** the polyfill race described in §11.
- **User impact:** sign-in silently does nothing.
- **Why non-blocking:** the Android lifecycle orders `onNewIntent` before `onResume`, so it is theoretical.
- **Fix:** keep the last identity callback URL seen by `+native-intent` for about 2 seconds and consume it on a `dismiss`, platform-neutral.
- **Timing:** only if RT-02 observes it.

**PP-D13 (P7): an auth interrupted by process death or a stale callback is silent.**
- **Evidence:** §11.
- **User impact:** she is back at the app with no message.
- **Why non-blocking:** the state is safe and identical on both platforms.
- **Fix:** a one-line "Sign-in didn't finish" note when the router swallows an identity callback without a live session.
- **Timing:** polish.

**PP-D08 (P8): iOS App Transport Security may allow arbitrary loads.**
- **Evidence:** introspection shows `NSAllowsArbitraryLoads: true` from `withIosBaseMods`. Android release blocks cleartext.
- **User impact:** none. All traffic is HTTPS.
- **Why non-blocking:** unverified (the iOS prebuild is environment-blocked) and not exploitable by the app's own traffic.
- **Fix:** verify with a macOS prebuild, then pin `ios.infoPlist.NSAppTransportSecurity` explicitly. Also add the Apple privacy manifest (`ios.privacyManifests`).
- **Timing:** before TestFlight.

**PP-D14 (P8): the whole household is one AsyncStorage value.**
- **Evidence:** `appStateRepository` `STORAGE_KEYS.primary`. Android SQLite has a 6 MB database cap and a ~2 MB CursorWindow per row; iOS has neither.
- **User impact:** none at prototype sizes. A very large household could fail to persist or load on Android only.
- **Why non-blocking:** latent.
- **Fix:** size telemetry, and `AsyncStorage_db_size_in_MB`, or split the blob.
- **Timing:** before public release.

**PP-D09 (P9): `NSFaceIDUsageDescription` is injected by the expo-secure-store plugin, but biometrics are never used.**
- **Fix:** set the plugin option `faceIDPermission: false`.
- **Timing:** cleanup.

**PP-D15 (P9): `WebBrowser.maybeCompleteAuthSession()` in `useGoogleCalendarBridge` is a web-only no-op on native.**
- **Fix:** remove it.
- **Timing:** cleanup.

**PP-D16 (P9): obsolete dependency and variables.**
- **Evidence:** `expo-auth-session` is in `package.json` but no longer imported. `EXPO_PUBLIC_GOOGLE_{IOS,ANDROID,WEB}_CLIENT_ID` remain in `.env.example` and in the EAS development environment.
- **Fix:** remove them once parity is certified.
- **Timing:** cleanup.

**PP-D17 (P10): the provider Supabase client keeps the last provider session in memory after binding or sign-out.**
- **Evidence:** it is never persisted.
- **Fix:** `providerClient.auth.signOut({scope:'local'})` after the session is handed to the runtime.
- **Timing:** hardening.

**PP-D18 (P10): `deviceTimeZone()` silently falls back to `UTC` if `Intl` cannot resolve the zone.**
- **Evidence:** both platforms; Hermes supports IANA zones.
- **Fix:** report the fallback.
- **Timing:** hardening.

**PP-D20 (P10): notification re-prompt semantics differ by OS.**
- **Evidence:** Android 13+ can re-prompt after one denial; iOS never re-prompts.
- **Handling:** Her Keys prompts only on "Turn on" and offers Settings afterwards. The difference is intentional OS behavior and is informational only.

### Separate release and store-readiness items (not parity defects)

- **Account deletion.** `ACCOUNT_DELETION_NOT_IMPLEMENTED` on both platforms. Apple requires in-app account deletion for apps with account creation, so this is a later release gate.
- **EAS environments.** Preview and production have no `EXPO_PUBLIC_*` variables yet.
- **Form factor.** `ios.supportsTablet: true` while Part 1 covers phone only.
- **Google consent.** Calendar consent is in Testing, with test users only.

## 17. Repairs (closure loop)

| DEFECT_ID | PRIORITY | ROOT_CAUSE | IOS_IMPACT | ANDROID_IMPACT | FILES_CHANGED | REPAIR | TEST | VALIDATION | PARITY_RECHECK | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| PP-D01 | P2 | `+native-intent` passed every non-identity link through. Android's Custom Tab auth session also delivers the Calendar return to the router, and no screen exists for it. | none | Unmatched Route after every Calendar connect | `src/platform/systemLinks.ts` (new), `app/+native-intent.tsx`, `tests/platformParity/systemLinks.test.mjs` (new), `tests/googleAuthParity.test.mjs` (1 assertion), `scripts-dev/meals-boundary-scan.cjs` (lane) | Compose the identity guard with an exact Calendar-return match; `null` → the router stays | 15 new tests; reverting the hook fails 8; mutant S3 caught | targeted 63/63 + boundary 10/10 + tsc 0 + full suite (§6) | iOS unchanged (the router never saw the URL); Android now ends where iOS ends | CLOSED |
| PP-D02 | P3 | `path.join` gives `\` on Windows; the assertion used `/` | n/a (test) | n/a (test) | `tests/googleAuthParity.test.mjs` | `filesUnder` returns `/`-separated repo paths | googleAuthParity 38/38 on Windows | full suite (§6) | n/a | CLOSED |
| PP-D21 | P1 | `canOpenScreen` returned `false` for every root screen while `authenticating`. expo-router 57's `Stack` renders every route node except protected ones, and its injected `_sitemap` / `+not-found` are never protected, so the stack held only those. | The sign-in modal and the app vanished mid Apple/Google flow; she was left on Sitemap / Unmatched Route | the same | `src/domain/routeAccess.ts`, `tests/routeAccess.test.mjs` | `authenticating` routes like the signed-out state it started from; `boundOther` is still checked first | routeAccess PP-D21 (restoring the early return fails it) | 66/66 targeted; full suite (§6.1) | identical on both platforms; no platform input | CLOSED |
| PP-D04 | P2 | No product path to `/sign-in`; sign-out only on `account-conflict` (OD-HK13-02) | logout/re-login and account switch impossible through the UI | the same | `app/sign-in.tsx`; `src/features/account/{accountModel.ts,AccountPanel.tsx,AccountEntryButton.tsx,AccountEntry.tsx}` (new); `src/features/today/TodayBriefing.tsx`; `src/domain/routeAccess.ts` (`signedOutOrDegraded` → `account`); tests; boundary lane | The existing route becomes Your Account (sign in / reconnect / connected with Sign out / resolving). Quiet Today entry. `account` guard opens for every non-quarantined state. Switching = Sign out, then Sign in, under the existing quarantine. | accountAccess 22 at commit (real AccountRuntime journeys, rendered panel); routeAccess; mutants S6 and S7 | 379/379 targeted; full suite (§6.1) | no platform conditional (registry exact counts unchanged) | CLOSED |
| PP-D03 | P2 | Apple sign-in is iOS-only; Hide My Email accounts cannot be linked to Google on Android; not documented | none on iOS | Apple private-relay account not reachable | registry EX-01; `accountModel.ts` / `AccountPanel.tsx` (disclosure); tests | Owner decision: PRODUCT_APPROVED_INTENTIONAL_EXCEPTION. EX-01 `portabilityLimitation` + iOS-only disclosure + guard. | accountAccess PP-D03 (3); registryGuard `exceptionViolations` + negative controls; mutants S8 and S9 | 105/105 targeted; full suite (§6.1) | Apple still iOS-only; Google on both | CLOSED |

Mini-gate after each repair commit (branch, HEAD, clean tree, targeted tests): passed for `0bb157f`, `b44a487`, `46755e5`, `9d4c643`, `24adfbf`, `1618299` and `85ad422`.

## 18. Open defects

| ID | Priority | Recommended correction | Type | Required retest |
|---|---|---|---|---|
| CFG-01 | P1 | Staging → Authentication → Sign In / Providers → Google: make `857660202409-109l3…` (the Web identity client Production uses) the first Client ID, with that client's secret. Then check that Redirect URLs contains `herkeys://auth/callback` on Staging and Production (OA-02). | Owner-gated configuration. The owner may do it, or sign the agent in to the dashboard; the secret is always pasted by the owner. | Remote checks R3–R5 and R12: `client_id` `109l3…`, Google sign-in page, no `redirect_uri_mismatch`. |

PP-D03 and PP-D04 are closed (§16, §17).

## 19. Runtime handoff (Part 2 device checklist)

Every item needs a development build on Staging, **after CFG-01 is fixed and OA-02 is verified**. All static evidence is complete.

| TEST_ID | Feature | iOS scenario | Android scenario | Expected equivalent result | Prerequisite | Static evidence |
|---|---|---|---|---|---|---|
| RT-01 | Google sign-in (new + existing user) | Today → Sign in → Continue with Google → consent | same (Custom Tab) | Bound to the same account id; the modal shows "Your account is connected" and stays mounted throughout (PP-D21); household bootstraps or hydrates; no Unmatched screen | CFG-01, OA-02, a test Google user | googleAuthParity; accountAccess |
| RT-02 | Google return race | Complete Google 5×; also press Back in the sheet | complete 5× in the Custom Tab; press Back | Success every time; Back gives `cancelled` with no error | RT-01 | §11 trace |
| RT-03 | Process death during Google auth | n/a (in-process) | Enable "Don't keep activities", sign in | App opens normally, not signed in, no crash; retry works | RT-01 | §11 |
| RT-04 | Session restore / refresh | Kill + relaunch; wait an hour, then foreground | same | Still bound; token refreshed; sync resumes | RT-01 | FR01 tests |
| RT-05 | Apple sign-in | Continue with Apple | Confirm no Apple button | iOS bound; Android offers Google only | Apple test ID | registry EX-01 |
| RT-06 | Calendar connect | Connect Google Calendar → consent | same | Returns to Calendar with **no Unmatched Route**; calendars listed | RT-01, a Calendar test user | PP-D01 tests |
| RT-07 | Calendar with a different Google account | Connect a second Google account | same | Identity unchanged; events from the second account | RT-06 | §12 |
| RT-08 | Calendar disconnect / reconnect / revoke | Disconnect; revoke at Google; reconnect | same | Disconnected → reauth → connected | RT-06 | runbook |
| RT-09 | Calendar cold return | Kill the app mid-consent, finish consent | "Don't keep activities" | App opens normally; the Calendar panel shows connected after refresh | RT-06 | PP-D01 (cold) |
| RT-10 | Weather granted (approximate) | Use my location → Allow While Using + Precise off | Allow → Approximate | "Weather · Near you" | a signed-in Staging account | tests/weather |
| RT-11 | Weather denied / permanently denied | Deny; deny again | Deny; "Don't ask again" | Weather off, then Open Settings, never re-prompts | — | tests/weather |
| RT-12 | Weather with services off / no fix | Location Services off | Location off | Unavailable, and Today unaffected | — | deviceLocation |
| RT-13 | OCR camera | Scan → Camera → allow | same | Candidate review; nothing saved until confirm | — | OCR tests |
| RT-14 | OCR library / cancel / deny | Library, cancel, deny camera | same | Candidate / no-op / permission message | — | ocrNativeAdapter |
| RT-15 | OCR after process death | n/a | "Don't keep activities" + camera | Capture lost, safe; retry works (PP-D06) | — | PP-D06 |
| RT-16 | Notification enable / deny / schedule | Turn on → allow / deny | Android 13+ allow / deny | Reminder scheduled / Settings offered | — | notification tests |
| RT-17 | Notification tap (warm and cold) | Tap the delivered reminder | same, including a killed app and a reboot | Opens Today | RT-16 | provider code |
| RT-18 | Keyboard | Talk It Out + Systems editor inputs | Android 15+ edge-to-edge | Focused input stays visible (PP-D10) | — | PC-05/06 |
| RT-19 | Android hardware Back | n/a (swipe) | Back on sheets, modals and onboarding | Sheet Back = cancel; guards hold | — | Sheet `onRequestClose` |
| RT-20 | Foreground / background / offline → online | Airplane mode, edit, reconnect | same | Queue drains; same durable rows | RT-01 | sync tests |
| RT-21 | Sign out / re-login / account switch | Today → Your account → Sign out → Sign in (same account, then another) | same | Same account resumes its household. Another account → account-conflict only → Sign out returns to the original household; nothing merged or uploaded. | RT-01, two test accounts | accountAccess 9, 10; accountRuntime 23 |
| RT-22 | RevenueCat purchase / restore / unknown | Sandbox purchase, restore | Play test purchase, restore | Same `plus` / `unknown` state | RevenueCat keys in EAS | monetization tests |

## 20. Part 2 recommendation

**Do not start Part 2 yet.** After the repair pass, one blocker remains: **CFG-01**.

1. The owner fixes Staging's Google Client ID and secret (about 2 minutes in the dashboard) and verifies OA-02 on both environments. Alternatively, the owner signs the agent in to the Supabase dashboard in the in-app browser, and the agent makes the non-secret change while the owner pastes the secret.
2. Rerun the remote probes R3–R5, R9 and R12.
3. Re-certify Part 1: `tests/platformParity`, `npm run typecheck`, `npm test`, the Expo checks and both exports. All of these are green at `85ad422` (§6.1).

The runtime checklist in §19 is ready for Part 2 as written.

## 21. Android release artifact repair (post-rejection, owner-directed)

Google Play rejected the first production upload for a package-identity mismatch. The owner directed this Android-only repair; CFG-01 (§18, §20) is unrelated to it and remains open.

| ID | PRIORITY | ROOT_CAUSE | REPAIR | FILES_CHANGED | STATUS |
|---|---|---|---|---|---|
| REL-01 | P0 | Android `applicationId` did not match the Google Play listing's required `com.heykeys.app`. | `android.package` → `com.heykeys.app` in `app.json`; iOS `bundleIdentifier` (`com.herkeys.app`) and scheme (`herkeys`) are unchanged. Registry (`HK_PLATFORM_PARITY_REGISTRY.json` `nativeIdentity.androidPackage`) and `tests/weather/architecture.test.mjs` updated to match. | `app.json`, `docs/audits/HK_PLATFORM_PARITY_REGISTRY.json`, `tests/weather/architecture.test.mjs` | CLOSED (source); AAB not rebuilt this pass |
| REL-02 | P1 | Installed label was the slug (`her-keys`) instead of the product name. | `expo.name` → `"Her Keys"` (`expo.slug` unchanged at `her-keys`). | `app.json` | CLOSED |
| REL-03 | P1 | `expo-dev-client` (pulling in `expo-dev-launcher`/`expo-dev-menu`) was a plain production `dependency`, so Android autolinking bundled dev-launcher's `SYSTEM_ALERT_WINDOW` permission and dev-menu surface into every build profile, including `production` and `preview` — not just `development`. Nothing in app source imports it (`expo-dev-client` had zero references outside `package.json`/`package-lock.json`); the project's actual on-device workflow uses Expo Go, not a custom dev client. | Removed `expo-dev-client` from `package.json` via `npm uninstall` (also drops `expo-dev-launcher`, `expo-dev-menu`, `expo-dev-menu-interface` transitively). `eas.json`'s `development` profile no longer sets `developmentClient: true` (the package it required is gone). Added `android.permission.SYSTEM_ALERT_WINDOW` to `app.json`'s `android.blockedPermissions` as defense-in-depth against reintroduction by any future dependency. | `package.json`, `package-lock.json`, `eas.json`, `app.json` | CLOSED |

**External, owner-only surfaces (cannot be changed from this environment):**
- RevenueCat's Android app configuration (dashboard mapping of package name → app). Client source does not hard-code the package name (`src/monetization/*` reads only `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`), so no source change is needed, but the RevenueCat project's registered Android package must be updated to `com.heykeys.app` externally. `REVENUECAT_EXTERNAL_PACKAGE_ACTION_REQUIRED=com.heykeys.app`.
- Google Play Console listing identity and any Google Cloud OAuth client scoped to the old Android package, if one exists — no Google Cloud/Play Console MCP or connector is available in this session.

No EAS build was run in this pass (owner directive: source repair and local gates only). REL-01/02/03 are verified against `app.json`, the introspected Expo config, and the local test/typecheck gates in this doc's §6 style — not against an actual built AAB.
