# Build 2A — RevenueCat handoff for Codex (source findings and live work still open)

Responsibility boundary (owner, 2026-10-12): Claude Code owns source-level RevenueCat integration and regression checks and is
**not** required to complete live RevenueCat configuration or purchase certification. Nothing here was changed in RevenueCat, App
Store Connect, Google Play or any dashboard, no purchase was made, and no sandbox credential was used.

```
REVENUECAT_SOURCE_INTEGRATION=PASS          (with the findings in section 5; none blocks source convergence)
REVENUECAT_LIVE_CERTIFICATION=NOT_RUN       (needs dashboard, store and sandbox access; section 7)
```

Do **not** declare Premium functionality certified, or the full Build 2 candidate ready for real testing, until section 6 has passed or the
test scope explicitly excludes Premium.

## 1. Repository, branch and commit

- Repository `herkeys/her-keys`, branch **`integration/build2a-candidate`** (stacked on PR #8 head `f57aaee`).
- Code commits: `2641898` (recovered keyboard repair), `db282ed`, `5a36946` (SDK 57 patches), `ab3822f` (consent gating); the branch tip is
  the final commit that adds the Build 2A reports (see `docs/builds/HK_BUILD2A_SOURCE_CONVERGENCE.md` for the exact tip and its CI run).
- Nothing under `src/monetization/`, `app/onboarding/plus.tsx` or `src/store/accountRuntimeInstance.ts` was modified by Build 2A.

Identity, unchanged and verified from the **resolved** Expo config (`npm run verify:release-identity`): Android application ID
`com.heykeys.app`; iOS bundle identifier `com.herkeys.app`; URL scheme `herkeys://`; EAS project `7b25f8fe-d7de-49c1-ba69-1fd3a065826a`;
owner `ams2dad`. They differ on purpose; a test rejects `com.herkeys.app` as the Android ID. RevenueCat must be associated with **each
store app under its own identifier**.

## 2. Contract the source implements

| Requirement | Implementation | Source |
|---|---|---|
| Display tier "Her Keys Premium" | one constant, `HER_KEYS_PREMIUM_DISPLAY_NAME`; customer strings use it (only two code *comments* still say "Her Keys+") | `src/monetization/entitlement.ts:11` |
| Stable entitlement `her_keys_plus` | `HER_KEYS_PLUS_ENTITLEMENT`; the only value ever tested against `CustomerInfo.entitlements.active` | `entitlement.ts:13`, `revenueCatClient.ts:95-98` |
| Entitlement is never stored as household truth | status is a transient read; M3 test | `monetization.test.mjs` |
| Fail open when RevenueCat cannot answer | `fetchActiveEntitlementIds()` → `null` → `unknown` (never "unsubscribed") | `revenueCatClient.ts:100-108`, `entitlement.ts:64` |
| One SDK boundary | only `revenueCatClient.ts` imports `react-native-purchases(-ui)` | test "feature-access layer does not import RevenueCat" |
| `Purchases.logIn(<Supabase user UUID>)` on sign-in | `identifyRevenueCatAccount(accountId)` is the runtime's `onAccountIdentified` callback; the UUID is the **only** identity sent (no email/provider subject/household id) | `revenueCatClient.ts:77-89`, `accountRuntimeInstance.ts:124-126`, `accountRuntime.ts:146-152` |
| `Purchases.logOut()` on sign-out | same function with `null` | same |
| Identify before a bound account is published | runtime calls `identify` first; a failure is reported, never thrown, and never undoes a server claim | `accountRuntime.test.mjs` #8, #20, #25 |
| UI refreshes entitlement after an account change | `RootNavigator` calls `refresh()` when the account becomes `accountBound` or `unauthenticated` | `app/_layout.tsx` (effect above the settled check) |
| Shared device, user A then B | sign-out → `logOut()` (anonymous id) → `refresh()` → B signs in → `logIn(B)` → `refresh()`; A's cached state is not reused | `accountRuntime.test.mjs` #24 (`[A, null]`), `syncEngine.test.mjs` 16/W |
| Paywall | `presentPaywallIfNeeded({ offering, requiredEntitlementIdentifier: 'her_keys_plus' })` for `offerings.current`; no offering identifier is hard-coded | `revenueCatClient.ts:127-152` |
| Restore Purchases | `Purchases.restorePurchases()`; result is `restored` only if `her_keys_plus` is active | `revenueCatClient.ts:154-163`; UI in `app/onboarding/plus.tsx:64-79,125` |
| No secret in the client | public SDK keys only (`EXPO_PUBLIC_REVENUECAT_{IOS,ANDROID}_API_KEY`); test M7 forbids `sk_…` | `config.ts`, `monetization.test.mjs` |
| Soft paywall policy | `PAYWALL_POLICY = 'soft'`; dismissal never blocks onboarding | `entitlement.ts:24` |

Where the paywalls appear **today**: `onboarding_complete` (after the Life Systems Audit, `app/onboarding/plus.tsx`) and `systems_upgrade`
(`app/(app)/systems/index.tsx`). `welcome_premium` is in the placement list but unreachable (section 5, R-01).

## 3. Tests and results (METHOD / RAW / INTERPRETATION)

METHOD: each suite run alone with `node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs --test <file>`
on Node 24.14.0 (Windows), tree `integration/build2a-candidate` at `ab3822f`.

| Suite | RAW | INTERPRETATION |
|---|---|---|
| `tests/monetization.test.mjs` | 23 / 23 pass | entitlement mapping, unknown ≠ free, no persisted entitlement, no hard-coded price, no `sk_` key, onboarding step order, no paywall loop |
| `tests/accountRuntime.test.mjs` | 32 / 32 pass | includes #8/#20 (identify), #24 (sign-out returns RevenueCat to anonymous), #25 (RevenueCat down never undoes a claim) |
| `tests/syncEngine.test.mjs` 16/W | covered in the full app suite | "B never sees A's entitlements" is asserted as `identified === [null]` after sign-out |
| `tests/hk-f01f13/accountSwitch.test.mjs` | 1 / 1 pass | account switch quarantine |

These are **scripted-SDK-boundary tests**. `react-native-purchases` is not exercised; in Expo Go it swaps in a Preview mock that simulates
purchases, so even a device run in Expo Go proves nothing about real entitlement. Real behavior needs a development/preview native build.

## 4. Mutation evidence

None added for RevenueCat in Build 2A (no RevenueCat source changed). Existing guards are listed above.

## 5. Known defects and gaps (source level)

| ID | Sev | Finding | Suggested handling |
|---|---|---|---|
| R-01 | P1 decision | **Premium placement conflict.** The Build 2A brief orders Premium *before* account choice; the repository's V2 documents and commits order it *after* the Life Systems Audit. Today the welcome `premium` step is unreachable (`begin` → account choice; `app/index.tsx` passes no `presentWelcomePaywall`). Which is intended is an owner decision (see the main report). | Wait for the decision. If front-door is chosen, R-03 must be settled first |
| R-02 | P2 | **No persistent "Restore Purchases" entry** after onboarding: the only one is on `onboarding/plus`, which closes for good once onboarding completes. Later upgrades go through RevenueCat's own paywall UI, whose restore link depends on its dashboard template. App Store review expects a restore path (Guideline 3.1.1). | Add a restore action to Your Account, or confirm the paywall template exposes it; test on a sandbox account |
| R-03 | P1 decision | **Anonymous → account transfer has no approved policy.** `configure()` starts anonymous and `logIn(uuid)` follows. If a purchase ever happens before sign-in (only possible on the unreachable `welcome_premium` path), what happens to it depends on RevenueCat's project "transfer behavior" and whether the UUID already exists. The code comment at `revenueCatClient.ts:65-72` says this "must be checked on real store sandbox accounts". | Owner chooses a policy; verify with sandbox accounts (section 6) |
| R-04 | P2 | `identifyRevenueCatAccount` returns `not_configured` silently if the SDK is not configured (for example the platform API key is absent) and is **never retried**; the caller discards the result. A build without keys therefore behaves as signed-out for entitlements with no visible warning. | Surface the result in the existing `report` channel; keep fail-open behavior |
| R-05 | P3 | Stale wording: two comments say "Her Keys+" (`app/onboarding/profile.tsx:55`, `src/monetization/featureAccess.ts:14`). Not customer-visible. | Cosmetic |
| R-06 | info | `Purchases.logOut()` throws when the user is already anonymous; the function swallows it as `sdk_error`. Harmless, but means a sign-out cannot distinguish "already anonymous" from failure. | none |
| R-07 | info | The Android and iOS API keys come only from EAS environment variables; `eas.json` carries **none** of them, so a build is functional only if the matching EAS environment holds valid keys. | verify in section 6 |

## 6. Live configuration that must be verified (not done)

1. RevenueCat project has two store apps: Google Play `com.heykeys.app` and App Store `com.herkeys.app`, each with its own **public SDK key**;
   those keys are the values of `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` / `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` in the correct EAS
   environment (`development`, `preview`, `production`). PR #7's closeout recorded "an invalid configured key and unavailable emulator billing".
2. Entitlement identifier is exactly `her_keys_plus` and is attached to the live products.
3. A **current offering** exists with a paywall; its products are approved in both stores; customer-facing names read "Her Keys Premium".
4. Project **transfer behavior** matches the policy decided in R-03.
5. Sandbox: new subscriber; **existing subscriber** recognized after fresh install and sign-in; Restore Purchases; user A purchases, signs out, user B
   signs in on the same device and sees **no** entitlement; A signs back in and sees it again; sign-in with the Supabase UUID appears as the App User ID.
6. If anonymous purchase before sign-in is kept at all: purchase anonymously, then create an account, and record where the purchase lands.

## 7. Access required

RevenueCat dashboard (read, then the minimum writes the owner approves); App Store Connect and Play Console (products, tester/sandbox accounts);
EAS environment variable read access (names and presence, not values); a physical iOS device (none available per PR #7) and an Android device or
an emulator with Play billing; two Supabase test accounts on Staging (cannot be created by this agent: account creation is out of scope).

## 8. Recommended next actions

1. Owner decides Premium placement (R-01) and the anonymous-transfer policy (R-03).
2. Codex: configure/verify section 6 on Staging builds, then run the sandbox matrix; record PASS/FAIL per step with the exact build SHA.
3. Codex or Claude: R-02 (restore entry) and R-04 (surface not-configured), each with a focused test.
4. Only then re-evaluate `REVENUECAT_LIVE_CERTIFICATION`.
