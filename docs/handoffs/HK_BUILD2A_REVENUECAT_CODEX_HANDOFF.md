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

## 0. The owner's Premium decision (2026-10-12) and what it means for RevenueCat

> Welcome → Get Started → **Premium offer** → Continue Free or Select Premium → Account Choice → Signup → Email Confirmation → Legal and AI
> Consent → Permissions/Onboarding → App. An existing user taps "I Already Have An Account" and goes straight to sign-in, with current consents
> and entitlements respected. Premium selection may be retained before signup, but **actual RevenueCat checkout must wait until account ownership
> is established and required consent is complete. No anonymous purchase transfer is authorized.** The stable `her_keys_plus` identifier stays.

How the source honours it:

1. **The welcome tree cannot reach RevenueCat at all.** "Select Premium" and "Continue Free" only record an in-memory *intent*
   (`PremiumChoice = 'premium' | 'free'`, `src/monetization/entitlement.ts`). A test scans every file under `src/features/welcome` and
   `src/features/account` for `react-native-purchases`, `RevenueCat`, `Purchases.`, `presentPaywall`, `PaywallOutcome`, `useEntitlement`, `revenueCatClient`: none may appear.
2. **Checkout happens in exactly one place**, `src/monetization/PremiumCheckoutAfterConsent.tsx`, mounted by `app/_layout.tsx` **inside the consent gate** and
   **around the navigator**. It acts only when the account is `accountBound` and the intent is `premium`, presents the existing **`welcome_premium`** placement through
   `presentPaywall`, **once**, and never blocks the app (a throw or an unavailable offering still lets her in).
3. **A purchase can only belong to the account that makes it**: the runtime calls `identifyRevenueCatAccount(uuid)` (`Purchases.logIn`) *before* publishing a bound
   account, and the gate does not exist until after that. There is no code path that buys while the SDK identity is still anonymous.
4. The intent is **not persisted**. A killed process restarts the tree at Welcome with no intent; a persisted "wanted Premium" could outlive its owner on a shared device.
5. "I Already Have An Account" clears the intent; going back to the offer or Welcome withdraws it; sign-out or another account never inherits one (tests below).

## 1. Repository, branch and commit

- Repository `herkeys/her-keys`, branch **`integration/build2a-candidate`** (stacked on PR #8 head `f57aaee`). The exact final SHA and its CI run are in
  `docs/builds/HK_BUILD2A_SOURCE_CONVERGENCE.md`.
- Build 2A changes under RevenueCat's neighbourhood: `src/monetization/entitlement.ts` (adds the `PremiumChoice` type only), new `src/monetization/PremiumCheckoutAfterConsent.tsx`,
  new `src/store/PremiumIntentContext.tsx`, `app/_layout.tsx` and `app/index.tsx` (wiring). **Not touched:** `revenueCatClient.ts`, `RevenueCatProvider.tsx`, `config.ts`,
  `accountRuntimeInstance.ts`, `app/onboarding/plus.tsx`.

Identity, unchanged and verified from the **resolved** Expo config (`npm run verify:release-identity`): Android application ID
`com.heykeys.app`; iOS bundle identifier `com.herkeys.app`; URL scheme `herkeys://`; EAS project `7b25f8fe-d7de-49c1-ba69-1fd3a065826a`;
owner `ams2dad`. They differ on purpose; a test rejects `com.herkeys.app` as the Android ID. RevenueCat must be associated with **each
store app under its own identifier**.

## 2. Contract the source implements

| Requirement | Implementation | Source |
|---|---|---|
| Display tier "Her Keys Premium" | one constant, `HER_KEYS_PREMIUM_DISPLAY_NAME`; customer strings use it (only two code *comments* still say "Her Keys+") | `src/monetization/entitlement.ts:11` |
| Stable entitlement `her_keys_plus` | `HER_KEYS_PLUS_ENTITLEMENT`; the only value ever tested against `CustomerInfo.entitlements.active`; a test asserts it is unchanged | `entitlement.ts:13`, `revenueCatClient.ts:95-98`, `welcomePremiumFlow.test.mjs` |
| Premium offered BEFORE account choice, as an intent | `begin` → `premium` step; `premiumSelected` / `premiumContinueFree` record a `PremiumChoice` | `src/features/account/welcomeFlowModel.ts` |
| Checkout only after account + consent | `PremiumCheckoutAfterConsent` inside `ConsentGate`, `accountBound` required, consumed once | `app/_layout.tsx`, `PremiumCheckoutAfterConsent.tsx` |
| Entitlement is never stored as household truth | status is a transient read; M3 test | `monetization.test.mjs` |
| Fail open when RevenueCat cannot answer | `fetchActiveEntitlementIds()` → `null` → `unknown` (never "unsubscribed") | `revenueCatClient.ts:100-108`, `entitlement.ts:64` |
| One SDK boundary | only `revenueCatClient.ts` imports `react-native-purchases(-ui)` | test "feature-access layer does not import RevenueCat" |
| `Purchases.logIn(<Supabase user UUID>)` on sign-in | `identifyRevenueCatAccount(accountId)` is the runtime's `onAccountIdentified` callback; the UUID is the **only** identity sent | `revenueCatClient.ts:77-89`, `accountRuntimeInstance.ts:124-126`, `accountRuntime.ts:146-152` |
| `Purchases.logOut()` on sign-out | same function with `null` | same |
| Identify before a bound account is published | runtime calls `identify` first; a failure is reported, never thrown, and never undoes a server claim | `accountRuntime.test.mjs` #8, #20, #25 |
| UI refreshes entitlement after an account change | `RootNavigator` calls `refresh()` when the account becomes `accountBound` or `unauthenticated` | `app/_layout.tsx` |
| Shared device, user A then B | sign-out → `logOut()` → `refresh()` → B signs in → `logIn(B)` → `refresh()`; a different account on a device bound to A is **quarantined** and never offered a checkout | `accountRuntime.test.mjs` #24, `syncEngine.test.mjs` 16/W, `welcomePremiumFlow.test.mjs` |
| Paywall | `presentPaywallIfNeeded({ offering, requiredEntitlementIdentifier: 'her_keys_plus' })` for `offerings.current`; no offering identifier is hard-coded; RevenueCat skips presenting for an already-entitled account | `revenueCatClient.ts:127-152` |
| Restore Purchases | `Purchases.restorePurchases()`; result is `restored` only if `her_keys_plus` is active | `revenueCatClient.ts:154-163`; UI in `app/onboarding/plus.tsx` |
| No secret in the client | public SDK keys only (`EXPO_PUBLIC_REVENUECAT_{IOS,ANDROID}_API_KEY`); test M7 forbids `sk_…` | `config.ts`, `monetization.test.mjs` |
| Soft paywall policy | `PAYWALL_POLICY = 'soft'`; dismissal never blocks onboarding | `entitlement.ts:24` |

Where paywalls appear **now**: `welcome_premium` (new user chose Premium; after bound account and consent), `onboarding_complete` (final onboarding step, `app/onboarding/plus.tsx`,
primary action "Continue to Her Keys"), and `systems_upgrade` (`app/(app)/systems/index.tsx`).

## 3. Tests and results (METHOD / RAW / INTERPRETATION)

METHOD: each suite run alone with `node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs --test <file>` on Node 24.14.0 (Windows), then the full
suite in a fresh clone and on GitHub Actions at the final SHA (see the main report).

| Suite | RAW | INTERPRETATION |
|---|---|---|
| `tests/welcomePremiumFlow.test.mjs` | 26 / 26 | the offer's state machine (incl. a seeded 3,000-sequence fuzz with invariants), the checkout gate, and whole journeys through the **real** welcome flow and **real** account runtime where the paywall presenter is the only spy: new user selecting Premium (no checkout during signup, none before consent, exactly one after), free, existing user, interrupted signup with email confirmation, back navigation, session recovery, same account returning, a different account quarantined, checkout failure |
| `tests/welcomeAuthShell.test.mjs`, `welcomeAuthFlow.test.mjs`, `routeAccess.test.mjs` | pass | the offer screen, the "nothing is purchased here / no price / no plan" copy rule, the no-RevenueCat scan, back model, entry-route pin |
| `tests/monetization.test.mjs` | 23 / 23 | entitlement mapping, unknown ≠ free, no persisted entitlement, no hard-coded price, no `sk_` key |
| `tests/accountRuntime.test.mjs` | 32 / 32 | identify before bound, sign-out returns to anonymous, a RevenueCat failure never undoes a claim |

**Mutants (each caught by assertion failures):** Get Started skips the offer; Select Premium forgets the intent; going back keeps the intent; checkout before an account is bound; the
intent is never consumed; checkout placed outside the consent gate; wrong placement; RevenueCat imported into the welcome tree; the post-confirmation sign-in shortcut becomes
permanent; an existing user is sent through the offer. Earlier: sign-out no longer anonymizes; sign-in identifies with the wrong id.

These are **scripted-SDK-boundary tests**. `react-native-purchases` is not exercised; in Expo Go it swaps in a Preview mock that simulates purchases, so a device run in Expo Go proves
nothing about real entitlement. Real behaviour needs a development/preview native build.

## 5. Known defects and gaps (source level)

| ID | Sev | Finding | Suggested handling |
|---|---|---|---|
| R-01 | resolved | Premium placement was an owner decision. **Decided: before account choice, as an intent; checkout after account and consent** (section 0). | — |
| R-02 | P2 | **No persistent "Restore Purchases" entry** after onboarding: the only one is on `onboarding/plus`, which closes for good once onboarding completes. Later upgrades go through RevenueCat's own paywall UI, whose restore link depends on its dashboard template. App Store review expects a restore path (Guideline 3.1.1). | Add a restore action to Your Account, or confirm the paywall template exposes it; test on a sandbox account |
| R-03 | resolved in source / open in config | **No anonymous purchase transfer is authorized (owner).** The app can no longer purchase while anonymous (section 0). What remains is the **project-level RevenueCat "transfer behavior"** setting, which also governs what happens when a *different* app user restores a purchase made by the same store account (user A buys, signs out, user B on the same phone taps Restore). It must be set so a purchase is **not** moved to another App User ID without an authorized policy. | Verify/choose in the RevenueCat dashboard (section 6, step 4) and prove with the A/B sandbox test |
| R-04 | P2 | `identifyRevenueCatAccount` returns `not_configured` silently if the SDK is not configured (for example the platform API key is absent) and is **never retried**; the caller discards the result. A build without keys therefore behaves as signed-out for entitlements with no visible warning. | Surface the result in the existing `report` channel; keep fail-open behaviour |
| R-05 | P3 | Stale wording: two comments say "Her Keys+" (`app/onboarding/profile.tsx:55`, `src/monetization/featureAccess.ts:14`). Not customer-visible. | Cosmetic |
| R-06 | info | `Purchases.logOut()` throws when the user is already anonymous; the function swallows it as `sdk_error`. | none |
| R-07 | info | The Android and iOS API keys come only from EAS environment variables; `eas.json` carries **none** of them. | verify in section 6 |
| R-08 | P2 | The comment in `revenueCatClient.ts` (lines ~65–72) still says the upfront Premium offer "may begin under RevenueCat's anonymous SDK identity" and that `logIn` must be checked for transfer. That is **no longer the design** (no anonymous purchase exists); the comment is stale and should be corrected in the next RevenueCat edit. | Edit comment; no behaviour change |
| R-09 | P2 | The new `welcome_premium` post-consent checkout has **no device proof**: that the paywall opens once over the first onboarding screen, that a purchase is recorded under the account UUID, and that dismissing it leaves the app usable. | section 6, step 3 |
| R-10 | info | The Premium intent lives in memory: if Android kills the process while she is away confirming her email, she restarts at Welcome and sees the offer again. A persisted intent was rejected on purpose (shared-device risk). | owner may revisit |

## 6. Live configuration that must be verified (not done)

1. RevenueCat project has two store apps: Google Play `com.heykeys.app` and App Store `com.herkeys.app`, each with its own **public SDK key**;
   those keys are the values of `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` / `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` in the correct EAS
   environment (`development`, `preview`, `production`). PR #7's closeout recorded "an invalid configured key and unavailable emulator billing".
2. Entitlement identifier is exactly `her_keys_plus` and is attached to the live products.
3. **New-user path on a native build** (Staging, sandbox tester): Get Started → Select Premium → create account → confirm email → sign in → consent → **the paywall appears once**, over the first
   onboarding screen → purchase → entitlement active **under the Supabase UUID as App User ID**; repeat with **Continue Free** → no paywall until the final onboarding step.
4. Project **transfer behaviour** matches the "no transfer authorized" decision: A buys, signs out; B signs in on the same device and **does not** receive A's entitlement, including after B taps Restore.
5. A current **offering** exists with a paywall; its products are approved in both stores; customer-facing names read "Her Keys Premium".
6. **Existing subscriber**: "I Already Have An Account" → sign in → recognised as entitled, no paywall, no consent re-ask if receipts are current.
7. Restore Purchases (R-02) works from wherever it is offered.

## 7. Access required

RevenueCat dashboard (read, then the minimum writes the owner approves); App Store Connect and Play Console (products, tester/sandbox accounts);
EAS environment variable read access (names and presence, not values); a physical iOS device (none available per PR #7) and an Android device or
an emulator with Play billing; two Supabase test accounts on Staging (cannot be created by this agent: account creation is out of scope).

## 8. Recommended next actions

1. Codex: configure/verify section 6 on Staging builds, then run the sandbox matrix; record PASS/FAIL per step with the exact build SHA.
2. Codex or Claude: R-02 (restore entry), R-04 (surface not-configured), R-08 (stale comment), each with a focused test.
3. Only then re-evaluate `REVENUECAT_LIVE_CERTIFICATION`.
