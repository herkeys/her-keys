# Her Keys — iOS Build 2 candidate audit (executable continuation)

Date: 2026-10-13. Role: iOS release-candidate auditor. Branch `audit/ios-build2-candidate` (isolated worktree `C:\Users\jsmit\Her-Keys-IOS01`),
stacked on the Build 2 integration candidate. Nothing was built, signed, uploaded or deployed; nothing in Supabase or Render was written.

```
IOS_EXECUTABLE_AUDIT=PASS
IOS_CONSUMER_FEATURE_EXPOSURE=PASS            (every implemented feature is reachable and wired; store-required surfaces are ABSENT — see Register B)
IOS_APPLE_SIGN_IN_SOURCE=PASS                 (IOS-D01 repaired; real-device Apple sign-in NOT RUN)
IOS_NATIVE_PREFLIGHT=PASS                     (source-level; owner prerequisites listed in §8; macOS prebuild and Xcode compile NOT RUN)
IOS_SUPABASE_CONTRACTS=PASS                   (deployed contracts); IOS_SUPABASE_AUTH_DASHBOARD=BLOCKED (dashboard not signed in)
IOS_RENDER_DEPENDENCY=NOT_APPLICABLE
IOS_ONLY_REPAIRS=PASS                         (3 repaired, 1 documented for owner decision)
IOS_SHARED_DEFECT_REGISTER=PASS
IOS_WELCOME_TREE_AUDIT=FAIL                   (ordinary product-flow and copy defects only; none is a security or native defect)
IOS_WELCOME_TREE_EXCEPTION=DOCUMENTED
IOS_EXACT_SHA_CI=PASS
IOS_ENGINEERING_IPA_SOURCE_READY=PASS
IOS_EXTERNAL_TESTER_READY=FAIL                (known store-review gaps; §11)
IOS_APP_STORE_RELEASE_READY=FAIL              (not submitted or assessed by Apple; known gaps; §11)
IOS_DEVICE_RUNTIME_CERTIFICATION=NOT_RUN
```

`IOS_ENGINEERING_IPA_SOURCE_READY=PASS` means only: the source is safe to consider for an **internal engineering build**. It does not certify the onboarding
journey, Premium, or any real-device behaviour. It does not authorise external testing.

## 1. Source identity

| | |
|---|---|
| Repository | `herkeys/her-keys` |
| Entry baseline | `68f95096dfeab85404b2f65e196ddfbee85fe86b` (`integration/build2a-candidate` remote tip; identical to the `Her-Keys-B2A` worktree) |
| Entry CI | run `38470277608`, success, on exactly that SHA |
| Change since the last certification `f965055` | docs and one boundary-scan lane line only (`git diff --stat f965055 68f9509`: 2 files, +114/−1) |
| Audit branch | `audit/ios-build2-candidate` (pushed) |
| Audit code tip (CI-certified) | `3db8279f90c882f7f21da665e114a447e0847642` |
| Final SHA | the commit that adds this report; reported in the hand-off message and verified by its own CI run |
| Exact-SHA CI at the code tip | run `38482184630` — **success, all 13 steps**: <https://github.com/herkeys/her-keys/actions/runs/38482184630> |
| Working tree | clean at the code tip. The shared checkout `C:\Users\jsmit\Her Keys` (another session's uncommitted work) was never touched. |

**Concurrent work.** `origin/codex/build2b-android-candidate-audit` (`308551b`, 4 commits over the same baseline) changes only `Button.tsx`, the parity registry and
docs, a new boundary lane block and one Android test. It shares **no source file** with this audit and appends to a different region of
`scripts-dev/meals-boundary-scan.cjs`, so the two branches merge without a semantic conflict (verified by reading `git diff 68f9509 origin/codex/…`; no checkout, no
fetch into any worktree). It has no defect register yet, so the shared findings below carry stable `IOS-S` ids for it to adopt rather than duplicate.

## 2. Executable evidence (METHOD / RAW / INTERPRETATION)

| Gate | METHOD | RAW | INTERPRETATION |
|---|---|---|---|
| Install | `npm ci --no-audit --no-fund`, Node v24.14.0, npm 11.9.0, fresh clone | exit 0 | the lockfile installs cleanly |
| Release identity | `npm run verify:release-identity` (resolves the Expo config) | `ANDROID_APPLICATION_ID=com.heykeys.app`, `IOS_BUNDLE_IDENTIFIER=com.herkeys.app`, `EAS_PROJECT_ID=7b25f8fe-…`, `IOS_BUILD_NUMBER=2`, `RELEASE_IDENTITY=PASS` | the two platform ids are intentionally different and unchanged |
| TypeScript | `npm run typecheck` | exit 0 at ENTRY and at every repair | |
| ENTRY suite (shared worktree) | `npm test` at `68f9509` | 4006 tests / 912 suites, 4004 pass, **2 fail** (`[BV]` scan, `[BV7]`) | environmental: the Meals boundary scan reads lane branches as local refs and a stale local `feature/herkeys-email-password-20261008` makes it fail. Known from the Build 2A report. It passes in a clean clone. |
| ENTRY suite (fresh clone) | `git clone`, detached `68f9509`, `npm ci`, `npm test` | `ℹ tests 4006 · suites 912 · pass 4006 · fail 0 · cancelled 0 · skipped 0`, exit 0 (backend-protection 5/5, release identity PASS, `tsc` 0) | the authoritative baseline; matches the Build 2A record (4006/4006) and the two `[BV]` failures of the shared worktree are confirmed environmental |
| EXIT suite (fresh clone) | same, detached at the audit code tip `3db8279` | `ℹ tests 4043 · suites 921 · pass 4043 · fail 0 · cancelled 0 · skipped 0`, exit 0 (backend-protection, release identity PASS, `tsc` 0, `expo install --check` clean, `expo-doctor` 21/21, `expo config` public and introspect exit 0) | +37 tests, all new, none removed; the boundary scan passes with the audit's files registered |
| EXIT suite (GitHub Actions) | Node 22, npm 10, `npm ci` + the existing gate | `# tests 4043`, `# suites 921`, `# pass 4043`, `# fail 0` | 4006 + 13 (`appleNonce`) + 12 (`nativeConfig`) + 12 (`keyboardInsets`) = 4043; no test removed or weakened |
| Expo install check | `npx expo install --check` | "Dependencies are up to date" | SDK 57 patch levels current today (this check is time-dependent) |
| Expo Doctor | `npx expo-doctor` | "21/21 checks passed. No issues detected!" | |
| Resolved config | `npx expo config --type public` and `--type introspect` | exit 0 | the plugin mods evaluate; consumed by `registryGuard` and `nativeConfig` on every run |
| iOS-specific suites | `tests/ios/*` (37), `tests/platformParity/*`, `googleAuthParity` | all pass | |
| Mutation evidence | each guard sabotaged against the real files, then restored byte-for-byte | Apple nonce **8/8**, native config **10/10**, keyboard insets **7/7** caught | the guards fail when the behaviour they protect is removed (one mutant first "survived" because of its own CRLF bug, not a guard gap; fixed and re-run) |
| EAS pre-build guard | the repo's own `checkIdentity` + `checkBackendTarget` against the **effective** environment of every profile (profile `env` merged over the live EAS environment variables) | development, preview, production, smoke-production-android: all `guard: PASS` | no value was printed |
| Route reachability | script over every `app/` route vs every in-source navigation reference | all routes reachable (see §4) | |

**Not available to this audit:** macOS, Xcode, an iOS simulator, a physical iPhone. `expo prebuild --platform ios` refuses to generate on Windows
("Run npx expo prebuild again from macOS or Linux"), so the generated `Info.plist`, `Podfile`, `PrivacyInfo.xcprivacy` and the Xcode compile are **NOT RUN**.
The strongest available substitute is the evaluated-mod introspection used by `tests/ios/nativeConfig.test.mjs`.

## 3. Register A — iOS-only repairs performed

All three are `PASS`, each with a red-then-green regression and mutants, each in its own commit. No Android behaviour, shared business logic, Supabase or Render
file changed.

| ID | Sev | Consumer impact | Files | Repair | Commit | Regression | Before → after |
|---|---|---|---|---|---|---|---|
| **IOS-D01** | P3 (security contract) | The Apple identity token was not bound to the attempt that requested it, so it could be replayed. | `src/platform/appleProvider.ts`; test stubs `tests/support/googleAuth/*` | `signInAsync({nonce})` receives the **SHA-256 hex digest** of a fresh 32-byte `expo-crypto` secure-random nonce; `signInWithIdToken({nonce})` receives the **raw** nonce. Contract verified in the installed `expo-apple-authentication` 57.0.2 (`AppleAuthenticationRequest.swift` sets `request.nonce` verbatim; Apple copies it into the token's `nonce` claim), the installed `@supabase/auth-js` 2.116.0 (hashes the raw nonce and compares) and Supabase's own reference (hashed to Apple, raw to Supabase). Fail-closed if the secure random source throws (no Apple sheet, no Supabase call). Cancellation (`ERR_REQUEST_CANCELED`) unchanged. Nothing is stored, returned or logged. | `3fc9a46` | `tests/ios/appleNonce.test.mjs` (13): digest/raw relationship, ≥256 bits, fresh per attempt, fail-closed, cancel, provider error, nonce-mismatch error leaks neither nonce nor token, source guard. Mutants 8/8. | 6 of 13 failed on the unchanged source → 13/13; related suites 89/89 |
| **IOS-D02** | P3 (visible on first launch) | `UIUserInterfaceStyle` resolved to **Automatic** although `app.json` declares `userInterfaceStyle: "light"`. The top-level key is a no-op (applied by the `expo-system-ui` legacy plugin, not installed) and the `expo-splash-screen` plugin writes Automatic whenever a `dark` splash block exists. The app has no dark theme and mounts no `StatusBar`, so an iPhone in dark mode shows a white clock/battery on the ivory background and a dark keyboard and system sheets over a light UI. | `app.json` | iOS keys only: `ios.infoPlist.UIUserInterfaceStyle = "Light"` and `expo-splash-screen` `ios.dark = {backgroundColor:null,image:null}`. The dark splash was identical to the light one, and the shared `dark` block Android reads is untouched. | `26dbbbe` | `tests/ios/nativeConfig.test.mjs` (12): resolved plist is Light; Android splash config is deep-equal with and without the override; the override is iOS-scoped; no colour-scheme reader exists in source; the iOS identity, Sign in with Apple entitlement, exact entitlement set and exact purpose-string set are pinned. Mutants 10/10 (including removing either half of the fix). | Introspection diff: only `ios.infoPlist.UIUserInterfaceStyle` Automatic → Light; `android`, `scheme`, `version`, `mods` byte-identical |
| **IOS-D04** | P3 | iOS draws the keyboard over the app instead of resizing it (Android's `adjustResize` does). Page-level editors (shared `Screen`) and the six bottom sheets that host text fields (Money, Meals ×2, Life Admin ×3 incl. OCR review: fixed 520–600 pt scroll regions, `autoFocus` on the first field) left lower fields and the sheet's Save button behind the keyboard. | `Screen.tsx`, `OcrReviewScreen`, `RecordSheet`, `RecordTaskSheet`, `MealSheet`, `MealTaskSheet`, `MoneySheet` | `automaticallyAdjustKeyboardInsets` on those `ScrollView`s. It exists only in the iOS branch of `RCTScrollView`'s native view config (verified in the installed react-native), so Android receives nothing; no `Platform` conditional and no registry entry. A `KeyboardAvoidingView` was rejected: it would lift a 560 pt sheet and could push its title off a short iPhone. | `1b150e9` | `tests/ios/keyboardInsets.test.mjs` (12): every input-hosting scroll view is inset-aware; unscrolled input sheets are a registered set; the prop is iOS-only in the native config. Mutants 7/7. | on-device check stays registry item RT-18 (**NOT RUN**) |

**IOS-D03 — documented, NOT repaired (owner decision).** `app.json` sets `expo-image-picker` `photosPermission: false`, so no `NSPhotoLibraryUsageDescription`
is declared. The bundle will nevertheless reference `PHPhotoLibrary requestAuthorization/authorizationStatus` (`expo-image-picker/ios/ImagePickerPermissionRequesters.swift`,
`MediaHandler.swift`), and the app calls `launchImageLibraryAsync` (`ocrNativeAdapter.ts:61`). Apple's upload-time purpose-string validation (ITMS-90683) keys on
referenced APIs, not on runtime use, so a **TestFlight/App Store upload may be rejected** while an ad hoc engineering IPA is unaffected. It is a prediction, not a
demonstrated failure (Apple validation: NOT RUN), and it would override a deliberate owner setting, so it is recorded rather than changed. Smallest repair: set
`photosPermission` to `"Her Keys lets you choose a photo of a document to read its text on this device. The photo is processed on this device and is never uploaded."` — no prompt is added
(PHPicker needs none) — and update the pinned permission set in `tests/ios/nativeConfig.test.mjs`. Declared strings that look unused are justified by linked code:
`NSMotionUsageDescription` (expo-location ships CoreMotion code) and `NSFaceIDUsageDescription` (expo-secure-store links LocalAuthentication); the motion wording ("may use
motion activity") overstates what the app does and could read "this entry is required by a linked location library" (P8, cosmetic, not changed).

## 4. Consumer navigation and primary-action inventory

**Method.** Source trace Visible UI → navigation → handler → domain → persistence → result for each route; `route-reach` script (every `app/` route against every
literal and object-form navigation reference in `app/` and `src/`); scan for inert handlers and placeholder copy; the full suite exercises the domain, persistence and
render layers (4043 tests). **Level reached: L1–L3 at source, L4 where a test exists. No simulator or device run (NOT RUN).**

- **Routes: 0 implemented-but-unreachable.** The only routes with no in-source reference are the tab roots (`today`, `calendar`, `ai`: reached by the tab bar), the guard-driven
  redirects (`onboarding/goals`, `account-conflict`), and `dev-tools`/`gallery`, which exist only in demo mode that **no EAS profile enables** (all four set
  `EXPO_PUBLIC_HERKEYS_DATA_MODE=empty`). `life/child/[childId]` is reached by object-form `router.push({pathname:…})`.
- **Inert controls: 0 in consumer code.** The only no-op handlers are in `app/gallery.tsx` (internal).
- **Mock AI: none.** `herKeysAiClient.ts` fails closed (client recheck + server enforcement); a provider/consent failure returns `unavailable`, never a fabricated reply.
- **Life hub:** all six role categories (`Kids, Home, Money, Meals, Work, Co-parenting`) are seeded for a new household (`src/domain/categories.ts`) and each has a row.

| Feature | UI entry | Exposure | Handler / service | Backend dependency | Persistence | Evidence | Verdict |
|---|---|---|---|---|---|---|---|
| Today briefing, One Move, pending, capacity | tab 1 `today` | yes | `TodayBriefing`, `useTodayView`, `resolveOneMoveForToday` | none (local); sync | AsyncStorage envelope + sync | full suite (`today`, `oneMove`, `dailyLoad`, `hk-f01f13`) | PASS (device NOT RUN) |
| Task create / complete | `/task-editor` modal from Today, Life, Calendar, Money, Meals, Admin | yes | `TaskForm` | — | store + sync | suite | PASS |
| Talk It Out | tab 5 `ai`, `/talk-it-out` modal, onboarding step | yes | `TalkItOutView` → `herKeysAiClient` → `herkeys-ai` | Supabase Edge Function (ACTIVE both envs, `verify_jwt` true, consent enforced server-side) | capture ledger, Life Inbox | suite; live AI **NOT RUN** (no user token) | PASS (source) |
| Life Inbox / capture review | `/life/inbox` from Life hub and Talk It Out | yes | `CaptureCards` | — | store | suite | PASS; **IOS-S04** |
| Calendar + events + capacity | tab 3 `calendar`, `/event-editor` | yes | `CalendarScreen` | — | store | suite | PASS |
| Google Calendar connect / list / select / disconnect | Calendar panel | yes | `useGoogleCalendarBridge` → `calendar-oauth`/`calendar-data` | Edge Functions (read-only scopes `calendar.calendarlist.readonly`, `calendar.events.readonly`; PKCE S256; hashed one-time state) | server-side encrypted refresh token | source + `systemLinks` tests; OAuth **NOT RUN** | PASS (source) |
| Systems / routines | tab 4 `systems`, `/systems/[id]`, `/systems/edit` | yes | `SystemsHub`, `SystemEditor` (KeyboardAvoidingView) | — | store | suite | PASS |
| Kids | Life → Kids; `/life/child*` | yes | `kids/containers` | — | store + sync | `tests/kids` | PASS |
| Home | Life → Home; item, task and visit editors | yes | `HomeScreen` | — | store | suite | PASS |
| Meals | Life → Meals | yes | `MealSheet`, `MealTaskSheet` | — | store | `tests/meals` | PASS |
| Co-parenting | Life → Co-parenting (role row) | yes | `coparent` ui | — | store | `tests/coparent` | PASS |
| Money | Life → Money | yes | `MoneySheet` | — | store | `tests/money` | PASS; **IOS-S12** |
| Work | Life → Work, `/opportunity-editor` | yes | `WorkOverview`, `OpportunityForm` | — | store | suite | PASS |
| Me / Rebuild | Life → Just for you | yes | `RebuildScreen` | — | owner-private | `tests/rebuild` | PASS |
| Life Admin + OCR scan | Life → Life Admin | yes | `ScanEntryPoint`, `ocrNativeAdapter` (camera → Apple Vision, on device) | none (verified: `recognizeText` uses `VNRecognizeTextRequest`, no networking) | owner-private | `tests/lifeAdmin` | PASS (device NOT RUN) |
| People | Life → People | yes | `people` ui | — | owner-private | `tests/people` | PASS |
| Needs Me / Other tasks | Life hub | yes | `NeedsMeQuickAdd` | — | store | suite | PASS |
| Weather | Today card, foreground approximate location | yes | `WeatherContextCard`, `deviceLocation` | `weather-context` (server-side WeatherKit) | none | `tests/weather` | PASS (device NOT RUN) |
| Local reminders | Today "Turn on"; consent-step "Enable Notifications" | yes | `localNotifications` (user-initiated, quiet, foreground list only) | — | scheduled notification | `tests/localNotification*` | PASS |
| Account, sign-in, sign-out | Today → Your account → `/sign-in` | yes | `AccountEntry`, `AccountPanel`, `AccountRuntime` | Supabase Auth | Keychain + store | `accountRuntime`, `accountAccess` | PASS (device NOT RUN) |
| Apple / Google / email+password / OTP / recovery | welcome tree account choice | yes | `WelcomeAuthFlow` | Supabase Auth | — | `googleAuthParity`, `emailPassword`, `passwordRecovery`, `appleNonce` | PASS source; **WELCOME_TREE_KNOWN_EXCEPTION** items §6 |
| Consent gate | after an account binds | yes | `ConsentGate` (fails closed; `account_consents` append-only) | Supabase | server ledger | `consent*` tests | PASS; **IOS-S07** |
| Life Systems Audit | onboarding 5 steps + profile | yes | `OnboardingProvider` | — | store + sync | `onboarding` tests | PASS functional; **IOS-S08** (answers have no downstream effect) |
| Premium offer → checkout after consent | welcome Premium offer; `PremiumCheckoutAfterConsent` | yes | `RevenueCatProvider` | RevenueCat (live **NOT RUN**) | RevenueCat | `monetization`, Premium-flow tests | PASS source |
| Premium onboarding step + Restore | `/onboarding/plus` | yes | `useEntitlement` | RevenueCat | — | tests | PASS |
| Premium gating | — | **no gated feature exists** | `checkFeatureAccess` has no consumer | — | — | grep | **FAIL — IOS-S03** |
| Persistent Restore Purchases | — | **absent** after onboarding | — | — | — | grep | **FAIL — IOS-S02** |
| Settings / support / feedback / legal re-access / manage subscription | — | **absent** (no Settings route) | — | — | — | route inventory | **FAIL (store) — IOS-S01, IOS-S19** |
| Account / data deletion | — | **absent** (no UI, RPC or function) | — | — | — | source + live catalog | **FAIL (store) — IOS-S01** |

## 5. Apple sign-in (details)

- **Source:** `appleProvider.ts` — native `AppleAuthentication.signInAsync` → `signInWithIdToken('apple')`. Offered first on iOS and **always** displayed there
  (`useOfferedPlatform` does not depend on the asynchronous availability probe). Label "Continue with Apple". The button is a custom pill with an Ionicons glyph (WT-05).
- **Native config (resolved):** `ios.usesAppleSignIn: true`; entitlement `com.apple.developer.applesignin = ["Default"]`; bundle id `com.herkeys.app`; the entitlement set is exactly
  `{applesignin, aps-environment}` (pinned by `nativeConfig`). `aps-environment: development` comes from the `expo-notifications` plugin although the app schedules **local**
  notifications only: the App ID therefore needs Push Notifications enabled (EAS capability sync does this at the first iOS build; **not verified**), and no remote-push code exists.
- **Provider config:** `apple: true` on both projects (fresh `GET /auth/v1/settings`, 2026-10-13). The Apple **client-ID list** is dashboard-only and was not readable today; the last
  recorded observation (V2 closeout, 2026-10-08, historical): Staging `com.herkeys.app`, Production `com.herkeys.app` and `com.herkeys.app.auth`. **Apple Developer portal (App ID,
  capabilities, Sign in with Apple key) was not accessible: NOT RUN.**
- **Errors/edge cases:** cancellation → `cancelled` (no error shown); missing token → `providerError`; Supabase refusal (including a nonce mismatch) → `providerError` carrying neither
  token nor nonce; first-sign-in full name is a suggestion only; the account is the Supabase user id; private-relay email is not special-cased and needs no handling.
- **Not implemented (shared, IOS-S11):** Apple `authorizationCode` is discarded, so token revocation on account deletion (Apple requirement) cannot be built without a source change; no
  `getCredentialStateAsync` check handles an Apple ID revoked in Settings (the session continues until Supabase refresh fails).
- **Real-device Apple sign-in, entitlement mapping at signing time, and first-sign-in/returning-user behaviour: NOT RUN.**

## 6. Register C — Welcome Tree exception (`WELCOME_TREE_KNOWN_EXCEPTION`)

None of these is a security, account-binding, consent or native defect. Verified in the same pass: the tree has no RevenueCat access; Premium is an in-memory intent and checkout runs only
inside `ConsentGate` for a bound account; routes are `Stack.Protected` by `routeAccess`; a returning account never sees Welcome; no guest path; Back is a visible control.

| ID | Screen / route | Actual vs intended | Sev | User impact | Evidence | Suggested correction | Independent blocker? |
|---|---|---|---|---|---|---|---|
| WT-01 | Premium offer | The note says plans are shown "by the App Store or Google Play" on an **iPhone** (`copy.ts:41`) | P7 | wrong-store reference | `copy.ts:41`, `PremiumIntroView.tsx:44` | store-neutral wording, or a platform-keyed string | no |
| WT-02 | Premium offer | Benefits promise "deeper household intelligence" while nothing is gated (see IOS-S03) (`copy.ts:34`) | P4 | expectation mismatch | `copy.ts:34-38` | reword to what exists, or gate something real | no (store review risk, IOS-S03) |
| WT-03 | Account choice | "Restoring an existing household on a different phone is not available yet" (`copy.ts:47`) although pristine-device adoption exists (`accountRuntime.ts:598`) | P5 | misleading | see IOS-S05 | state the actual rule | no |
| WT-04 | Welcome → confirmation | The Premium intent lives in memory; a process kill while she confirms her email returns her to Welcome (OD-2A-08, R-10) | P4 | repeats the offer | Build 2A report §6 | none required; owner decision | no |
| WT-05 | Account choice | The Apple button is a custom pill with an Ionicons glyph, not Apple's native button or artwork (`ProviderButton.tsx:9`) | P7 | HIG/review risk | source | render `AppleAuthenticationButton` on iOS | no |
| WT-06 | whole tree | One route with an internal reducer: no iOS edge-swipe back; a visible Back control only (`WelcomeAuthShell.tsx`) | P8 | habit mismatch | source | optional | no |
| WT-07 | Account choice / consent | Terms and Privacy open Production-hosted PDFs in external Safari, leaving the app (`legal.ts:10`, `AccountChoiceView.tsx:43`); both URLs return 200 `application/pdf` today | P7 | context switch | live HEAD | in-app browser | no |
| WT-08 | Password step | The post-confirmation "Sign in" action exists only after a confirmation-required sign-up (OD-2A-08) | P7 | owner veto pending | Build 2A §6 | keep or remove | no |

`IOS_WELCOME_TREE_AUDIT=FAIL` records only that these ordinary defects exist.

## 7. Register B — shared / non-iOS defects (DOCUMENTED — NOT MODIFIED)

`Blocks internal IPA` means: prevents considering an engineering build. `Blocks store` means: TestFlight external or App Store review.

| ID | Sev | Class | Feature | Location | Consumer impact / evidence | Root cause | Suggested minimal fix | Platforms | Owner | Blocks internal IPA | Blocks store |
|---|---|---|---|---|---|---|---|---|---|---|---|
| IOS-S01 | P2 | shared + backend | In-app account deletion | none: `AccountPanel.tsx:58` offers Sign out only; no `app/` route; **no RPC or Edge Function** in the live Production catalog (only `bootstrap_account`, `claim_local_household`, `sync_push`, `sync_pull`, welcome claim); migration comment anticipates a purge ("SD4-030") | An account holder cannot delete the account or its data in the app | never built | `delete-account` Edge Function (JWT) that purges the household and `auth.users` (`profiles.id` already references `auth.users` `ON DELETE CASCADE` and the household tables cascade from `households`; confirm that a household is removed with its last profile), revokes the Google Calendar token and, for Apple, the Apple token (needs IOS-S11); a confirmation sheet in Your Account; clear Keychain and local store | both | backend + app | no | **yes** (App Review 5.1.1(v)) |
| IOS-S02 | P3 | shared (RevenueCat UI) | Restore Purchases after onboarding | the only entry is `app/onboarding/plus.tsx:125`; `restoreRevenueCatPurchases` (`revenueCatClient.ts:154`) has no other caller | a returning subscriber who skipped it has no way to restore | OD-2A-07 open | a "Restore purchases" row in Your Account (connected mode) calling `useEntitlement().restore` | both | Codex RevenueCat workstream | no | **yes** (3.1.1) |
| IOS-S03 | P2 (store) / P4 | shared (monetization) | Premium benefit vs entitlement | `checkFeatureAccess` (`featureAccess.ts:38`) has **no consumer**; the two "plus" keys gate nothing; copy promises benefits (`plus.tsx:9`, `copy.ts:34`); the Systems card says "More of Her Keys' intelligence is on the way" | a purchaser receives nothing different | foundation shipped without a gated feature | gate one real capability, or reword to "support Her Keys while it grows"; do not take payment until a benefit exists | both | product + Codex | no (sandbox only) | **yes** (3.1.2 / 2.3.1) |
| IOS-S04 | P3 | shared (layout) | Talk It Out capture "Fix" sheet | `CaptureCards.tsx:258` — six-plus inputs and chip groups with **no ScrollView** inside a bottom-anchored Modal | on smaller phones or larger text the controls (and Apply) can sit off-screen, worse with the iOS keyboard | missing scroll container | wrap the sheet body in a ScrollView with `keyboardShouldPersistTaps="handled"` and `automaticallyAdjustKeyboardInsets` (already enforced by `keyboardInsets.test.mjs`, which currently registers this file as the one allowed gap) | both | F02 | no | no |
| IOS-S05 | P5 | shared (copy) | Household restoration copy | `AccountPanel.tsx:70,80`, `copy.ts:47` say restoring on a new phone is "not available yet"; `accountRuntime.ts:598` + `composeAccountApp.ts:71` adopt a household on a **pristine** device | copy contradicts the implemented behaviour | stale text | state the real rule | both | welcome-tree workstream | no | no |
| IOS-S06 | P4 | shared (account/persistence) | Cross-device restoration limits | `accountRuntime.ts:592-640` | pristine device: adopts and pulls. A device **with local data** signing in to an account that already has a household is **refused** (`superseded_by_cloud`): local content is never merged; a storage-recovery fallback is not eligible | by design (no silent merge) | a user-visible explanation and a choice (keep local / use cloud); no code change here | both | owner decision | no | no |
| IOS-S07 | P4 | shared (consent UX) | Consent read failure | `ConsentFlow.tsx:55` — "reopen Her Keys to continue": no Retry, no Sign out | offline at the consent step strands her; fails closed correctly (no bypass) | missing control | add Retry and Sign out to the error stage | both | consent owner | no | no |
| IOS-S08 | P3 | shared (product) | Life Systems Audit effect | goals/strengths/struggles reach only `profile.tsx:10` (one-time result) and sync; nothing in Today, One Move or Systems reads them (grep) | the audit has no lasting effect | not wired | feed `struggleIds` into One Move / Systems suggestions | both | product | no | no |
| IOS-S09 | P4 | shared (UI) | Silent Premium entry points | `systems/index.tsx` "Learn about Her Keys Premium" and `PremiumCheckoutAfterConsent` ignore `no_offering`/`unavailable`/`error` outcomes | tapping does nothing visible when the paywall cannot open (also the case in a build without an RC offering) | outcome discarded | show a short notice on those outcomes | both | Codex | no | no |
| IOS-S10 | P4 | shared (session) / iOS behaviour | iOS keychain survives reinstall (PP-D05) | `secureStore.ts:38` (no first-launch sentinel) | after deleting and reinstalling, iOS returns signed in to the old account with an empty local household, then adopts it | Keychain persists across app deletion | first-launch sentinel in AsyncStorage; clear the secure session when it is missing. **Not done**: it changes session persistence and would sign existing installs out once | iOS-visible, shared code | owner decision | no | before TestFlight |
| IOS-S11 | P5 | shared (account) | Apple credential lifecycle | `appleProvider.ts:58` discards `authorizationCode`; no `getCredentialStateAsync` | revocation and deletion cannot clean up Apple; a revoked Apple ID is not noticed | not built | capture the code at sign-in, check state on foreground, revoke on deletion (with IOS-S01) | iOS | account owner | no | with IOS-S01 |
| IOS-S12 | P6 | shared (UX) | Dates typed as text | `MoneySheet.tsx:76` `placeholder="2026-09-25"`; free-text date fields also in `MealSheet.tsx:97` and `AddChildView.tsx:37` | ISO strings typed by hand; mistakes surface as validation errors | no date picker | a date control | both | design | no | no |
| IOS-S13 | P7 | shared (config) | Legal documents | `legal.ts:10` points every build (including Staging) at the **Production** storage bucket | none today (both return 200 `application/pdf`) | single constant | per-environment URL or a stable site URL | both | owner | no | no |
| IOS-S14 | P4 | Android / EAS | RevenueCat Android key in the **preview** environment | the stored `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` begins `<PLAY` (a placeholder, value not printed) | preview Android builds cannot configure RevenueCat | placeholder never replaced | set the real `goog_…` key | Android | Android audit | no (iOS key present) | no |
| IOS-S15 | P1 prerequisite | EAS / Apple | Signing prerequisites | `eas device:list --apple-team-id Y9K3XPR9J2`: **"Could not find devices"**; credentials menu is interactive and not drivable | an ad hoc `distribution: internal` IPA cannot be provisioned for any iPhone yet | no device registered | `eas device:create`; confirm the credential and capability sync at the first build | iOS | owner | **yes (prerequisite, not a source defect)** | yes |
| IOS-S16 | P6 | Supabase | Advisor findings | both projects: `auth_leaked_password_protection` (plan-blocked, known); `bootstrap_account` / `claim_local_household` are `SECURITY DEFINER` and executable by `authenticated` (intentional claim API; **not** executable by `anon`, verified); RLS-on tables with no policy are service-role-only by design (Production 3: `calendar_oauth_states`, `external_calendar_connections`, `herkeys_welcome_email_receipts`; Staging 2) | none | — | none now | both | backend | no | no |
| IOS-S17 | P8 | dependency | `expo-ocr-kit` 0.1.4 | single-maintainer package; its iOS module also links an unused WebView view | supply-chain note; the OCR path itself is on-device Vision with no networking | — | pin and review at upgrade | both | — | no | no |
| IOS-S18 | P8 | shared | Reachability gaps for store review | no Settings route, no support contact, no way to re-open Terms/Privacy after onboarding (`legal.ts` is used only by the welcome tree and the consent gate), no "manage subscription" | none for engineering | not built | a Settings destination holding Legal, Support, Restore, Subscription, Delete account (one place satisfies IOS-S01/S02/S18) | both | product | no | yes |
| IOS-S19 | info | iOS verification gap | Generated `Info.plist` ATS | introspection prints `NSAllowsArbitraryLoads: true` — a stub from `withIosBaseMods.js` ("TODO: fetch the versioned template"), not the real template; all in-app endpoints are HTTPS (no `http://` in `app/`/`src/`) | cannot be proven on Windows | no macOS | read the generated `Info.plist` at the first EAS iOS build's prebuild log | iOS | owner | no | confirm |

## 8. iOS native and EAS preflight

- **Identity (resolved):** bundle `com.herkeys.app`, build number `2`, version `1.0.0`, scheme `herkeys` (+ `com.herkeys.app`), owner `ams2dad`, EAS project `7b25f8fe-…`, `supportsTablet:false`, `ITSAppUsesNonExemptEncryption:false`. Release-identity tests (10) reject the Android id as the iOS id.
- **Permissions (resolved plist):** exactly Camera (document scan, on device), Location When-In-Use (approximate, foreground, weather), Motion and Face ID (linked-API requirements, never requested). No background modes, no tracking, no microphone, no contacts/calendar/Bluetooth, no Always location (verified: `expo-location` links no `requestAlwaysAuthorization`). Notifications are requested only from a user action. Pinned by `nativeConfig`.
- **Privacy manifest:** `ios.privacyManifests` is not set, so Expo's template manifest applies, together with the manifests shipped inside React Native and the Expo/AsyncStorage pods (present in `node_modules`: react-native, async-storage, expo-application/constants/file-system/notifications). RevenueCat's native SDK manifest arrives through its CocoaPods dependency and **cannot be inspected on Windows**. Apple's aggregated privacy report: **NOT RUN**.
- **Dependencies:** `expo ~57.0.28`, `react-native 0.86.3`, `expo-router ~57.0.26`, `react-native-purchases ^10.9.1`; `expo install --check` clean; `expo-doctor` 21/21; Hermes is the SDK 57 default. Native compile: **NOT RUN**.
- **Effective EAS environments (live read, secret-class values never printed):**

| Environment | Supabase URL | Publishable key matches the project | iOS RevenueCat key | Server-secret names |
|---|---|---|---|---|
| production | Production `npykvnxnehlsdlbumzwk` ✔ | ✔ | present, `appl_` prefix | none |
| preview | Staging `fhhudicklmpofuzkxeqe` ✔ | ✔ | present, `appl_` prefix | none |
| development | Staging ✔ | ✔ | **absent** | none |

  The profile `env` blocks add backend, `DATA_MODE=empty` and `EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE=true` on every profile; the EAS build hook (`eas-build-post-install` → `verify-release-identity.mjs`) fails a build that lacks any of them. Dry-run of that guard against each effective environment: PASS.
- **Lifecycle and layout (source):** `AppState` foreground → `setSessionRefreshActive`, `syncRuntime.request('foreground')`, RevenueCat refresh; cold start holds the navigator until hydration and session restore (no Welcome flash); deep links pass `+native-intent` then `Stack.Protected` guards; the two OAuth returns are swallowed by the router. `Screen` and the tabs handle safe areas; welcome views use `KeyboardAvoidingView padding`. VoiceOver labels and roles present on the provider buttons, back control and tabs. Dynamic Type: the tab bar label is the one documented fixed-size exception. Device behaviour: **NOT RUN**.
- **Owner prerequisites before an IPA exists:** (1) register at least one iPhone (`eas device:create`); (2) the first iOS build will create/validate the distribution certificate and provisioning profile and must sync **Sign in with Apple** and **Push Notifications** on the `com.herkeys.app` App ID (interactive; not drivable from here); (3) confirm the Apple provider client-ID list in the Supabase dashboard; (4) confirm the RevenueCat iOS app, `her_keys_plus` entitlement, offering and paywall exist (live **NOT RUN**).

## 9. Supabase (read-only)

Both projects `ACTIVE_HEALTHY`, `us-west-2`, Postgres 17. No other project was touched. No write, no deploy, no credential or account request.

| Check | Result |
|---|---|
| Deployed functions (fresh) | `weather-context`, `calendar-oauth`, `calendar-data`, `herkeys-ai` exist in both with **identical bundle hashes**; `herkeys-welcome-email` exists in Production only (intentional; its activation flag `HERKEYS_TRANSACTIONAL_EMAILS_ENABLED` is an open owner item P-4) |
| JWT settings | `herkeys-ai`, `calendar-data`, `weather-context`, `herkeys-welcome-email`: `verify_jwt=true`. `calendar-oauth`: **false by necessity** (Google's callback carries no JWT); its POST path calls `requireUser`, the GET callback requires a hashed single-use state with a 10-minute expiry. |
| Consent enforcement | `herkeys-ai` source: when `HER_KEYS_AI_REQUIRE_CONSENT === 'true'` it reads the account's newest `ai_processing` receipt and refuses unless `policy_version === 'ai-data-processing-initial-v1'` and `granted === true`, failing closed on error (403). The client's `HER_KEYS_CONSENT_VERSIONS.ai_processing` is pinned equal by `productionConsentBuildProfile.test.mjs`. The flag's value is a secret-class setting and was not read here (previous owner-session evidence: set `true` in both). **Server refusal behaviour: NOT RUN (needs a user token).** |
| Migrations | Production 15, Staging 14; names align one-to-one, versions differ because Staging was replayed; the one extra is `herkeys_welcome_email_receipts` (Production-only function) — INTENTIONAL |
| RLS / grants | public tables: Production 45, Staging 44; **0 without RLS in either**; **0 table grants to `anon`**; 106 policies in each; `account_consents` has `insert_own` and `select_own` only (append-only) |
| RPC exposure | `bootstrap_account`, `claim_local_household`: executable by `authenticated`, **not `anon`** (both environments) |
| Auth (fresh, public `/auth/v1/settings`) | Apple ✔, Google ✔, Email ✔ in both; phone off; anonymous users off; sign-ups open; **email confirmation required** (`mailer_autoconfirm=false`) |
| Auth (dashboard-only) | OTP length, password minimum, SMTP, Site URL, **redirect allow-list (`herkeys://auth/callback`)**, Apple/Google client-ID lists, secret names: **BLOCKED** — the built-in browser redirected to Supabase sign-in and no credential was entered. Last owner-session record (2026-10-13 closeout, historical): OTP 6, password minimum 8, templates and SMTP corrected; leaked-password protection unavailable on this plan. |
| Advisors | see IOS-S16 |
| Schema/RLS parity | `DRIFT=none observed`; Production-only objects `INTENTIONAL`; dashboard-only settings `UNKNOWN_AUTHORITY` until the dashboard is readable |

## 10. Render (read-only)

`IOS_RENDER_DEPENDENCY=NOT_APPLICABLE`. The connected workspace (`Her's workspace`, one team) has **no web services, no static sites, no Postgres and no Key Value
instances** (`list_services` empty; `list_postgres_instances`, `list_key_value`: none). The repository contains **no** reference to `render.com`/`onrender.com`, and every outbound
host in `app/`, `src/` and `supabase/functions` is Supabase, Google (OAuth/Calendar), Gemini, Resend or WeatherKit; there is no `http://`, localhost or embedded server secret in app code. The mobile app's
only backend is Supabase; the functions' third-party calls are server-side. No Render write, deploy or restart occurred.

## 11. Release decisions

- **Engineering IPA (`IOS_ENGINEERING_IPA_SOURCE_READY=PASS`).** No unresolved P0–P2 iOS-native, security or essential-consumer blocker outside the Welcome Tree exception: consent cannot be bypassed (gate wraps the navigator
  for every bound account; fail-closed on an unreadable ledger); household isolation holds in the live catalog (RLS on every table, no anon grants); identity is the Supabase user id with RevenueCat logged in to that id before the runtime publishes a
  bound account; no token reaches any logger (every reporter is `__DEV__`-guarded and passes no session value); the Apple token is nonce-bound. What cannot be claimed: any device behaviour.
- **External testers (`FAIL`)** and **App Store (`FAIL`)**: IOS-S01 (account deletion), IOS-S02 (Restore Purchases), IOS-S03 (Premium delivers no differentiated value), IOS-S18 (no Settings/support/legal re-access), IOS-S10, IOS-D03, plus device certification, RevenueCat sandbox certification and the Welcome Tree repair. These are known gaps, not an Apple assessment.

## 12. Recommended iOS EAS profile (for owner consideration — nothing was built)

`preview` already works for iOS (internal distribution, Staging backend, consent gate, empty data, `appl_` RevenueCat key). To mirror the Android Build 2B smoke (Production backend), add one
profile; `productionConsentBuildProfile.test.mjs` already enforces its env (the iOS block is not needed beyond `simulator:false`):

```json
"smoke-production-ios": {
  "environment": "production",
  "distribution": "internal",
  "ios": { "simulator": false },
  "env": {
    "EXPO_PUBLIC_HERKEYS_BACKEND": "production",
    "EXPO_PUBLIC_HERKEYS_DATA_MODE": "empty",
    "EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE": "true"
  }
}
```

Suggested command, to be run by the owner only after the prerequisites in §8, from the audited SHA, and **not executed here**:

```
eas build --platform ios --profile smoke-production-ios
```

Note: `npm run release:preflight` only accepts the store branch `build/02-gemini-integration`; it is for store builds and is not part of an internal build. The EAS install hook runs the identity and backend-target guard on its own.

## 13. NOT RUN (honestly)

Real-iPhone anything (launch, Apple/Google/email sign-in, keyboard, safe areas, VoiceOver, Dynamic Type, camera/OCR, location, notifications, deep links, background/foreground); simulator runs; macOS prebuild and the generated
`Info.plist`/`PrivacyInfo.xcprivacy`; Xcode compile; Apple Developer portal checks; App Store Connect validation (ITMS-90683); RevenueCat dashboard, sandbox purchase and restore; Supabase dashboard-only Auth settings; the
server-side AI consent refusal and every authenticated runtime test (no user token, no account created); Google Calendar OAuth end to end.
