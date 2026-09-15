# Her Keys Build 2.5 — Her Keys+ Monetization Foundation

| Item | Value |
| --- | --- |
| Authoritative base | `main` at `89eeea75056069bc85e966552e5fac32d7bfe8c9` (Build 2 plus the hostile-audit repairs, promoted by fast-forward from `7f6cf2278ebb5ca4f12294e2b35c9368d0093e52`) |
| Branch | `build/025-monetization-foundation` |
| Date | 2026-09-15 |
| Product/business authority | This document; `HER_KEYS_PRODUCT.md` (unchanged) |

**Build question:** can Her Keys carry the RevenueCat subscription/entitlement architecture without deciding a production price?

Build 2.5 is an architecture build, same discipline as Build 2. No production price, product identifier strategy, trial, or discount is decided here — see [Pricing](#pricing).

---

## 1. Scope

1. RevenueCat SDK integration, concentrated behind one boundary.
2. `her_keys_plus` entitlement, read from RevenueCat CustomerInfo only.
3. A soft paywall as the final onboarding step, participating in existing resume/completion persistence.
4. A reusable paywall presentation method, callable from any placement.
5. A restrained Systems upgrade entry point.
6. A premium feature-access layer and gate hook, with two placeholder feature keys.
7. Development-build configuration for real native RevenueCat behavior.

**Out of scope, deliberately:** production pricing, real subscription product IDs, trials, discounts, annual/monthly strategy, referral programs, family plans, web billing, backend webhooks, authenticated account linking, server-side entitlement enforcement, aggressive conversion experiments, a full visual redesign.

---

## 2. RevenueCat configuration

| Item | Value |
| --- | --- |
| `react-native-purchases` | `^10.9.1` (current at build time; peer requires `react-native >= 0.73.0`, satisfied by `0.86.3`) |
| `react-native-purchases-ui` | `^10.9.1` |
| `expo-dev-client` | `~57.0.19` |
| Install method | `npx expo install react-native-purchases react-native-purchases-ui expo-dev-client` |
| Entitlement identifier | `her_keys_plus` |
| App User ID | Anonymous (RevenueCat-generated); Her Keys never passes an `appUserID` |

**Key handling.** Two client-safe public keys, read from Expo public env vars in `src/monetization/config.ts`:

```
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
```

Documented (empty) in `.env.example`; real values stay in an uncommitted local `.env` (already covered by `.gitignore`'s `.env`/`.env.*` rule). No RevenueCat secret (`sk_...`) key exists anywhere in this session, this repository, or this document. `tests/monetization.test.mjs` scans `app/` and `src/monetization` source text for the `sk_` pattern as a standing regression control (M7).

**SDK import boundary.** Only `src/monetization/revenueCatClient.ts` imports `react-native-purchases` or `react-native-purchases-ui`. Every other module — `entitlement.ts`, `featureAccess.ts`, `config.ts`, `usePremiumGate.ts` — works only with `EntitlementState`, `PaywallOutcome`, `RestoreOutcome` and similar plain types. This mirrors the existing Build 2 convention (`asyncStorageAdapter.ts` is the only file importing AsyncStorage).

---

## 3. Entitlement model

```
RevenueCat CustomerInfo (authority)
        │  entitlements.active[...]
        ▼
revenueCatClient.ts            (the only RevenueCat import; returns string[] | null)
        │
resolveEntitlementState()      src/monetization/entitlement.ts — pure
        │
EntitlementState = 'unknown' | 'free' | 'plus'
        │
RevenueCatProvider / useEntitlement()   React boundary — src/monetization/RevenueCatProvider.tsx
        │
{ status, isPlus, refresh, presentPaywall, restore }
        │
Screens (onboarding/plus.tsx, Systems) and usePremiumGate()
```

`her_keys_plus active in CustomerInfo.entitlements.active` is the only source of `isPlus`. `null` (RevenueCat unconfigured, offline, or an SDK error) always becomes `'unknown'` through `resolveEntitlementState`, one function every caller shares rather than re-deciding the fallback itself.

**Nothing persisted.** `isPlus`, `subscriptionStatus`, `expirationDate`, `productPrice` and `revenueCatUserId` do not exist in `src/domain/state.ts`'s `AppStateSchema`/`OnboardingSchema`, in `AppStateV1`, or in AsyncStorage. `RevenueCatProvider` keeps only an in-memory `EntitlementStatus` for rendering; it is rebuilt from RevenueCat on every mount and app-foreground event. `tests/monetization.test.mjs` scans `src/domain/state.ts` for these tokens as a standing regression control (M3).

---

## 4. Paywall architecture

**RevenueCat owns:** the purchase/restore transaction UI (`RevenueCatUI.presentPaywallIfNeeded`), the configured Offering, product/store price, purchase processing, restore result, and `CustomerInfo`/entitlement state.

**Her Keys owns:** navigation, placement, entitlement interpretation, fallback state, diagnostic logging, and the soft/enforced policy. Her Keys never renders its own purchase button UI beyond the shell (copy, benefits, and the three affordances below); the actual paywall surface is RevenueCat's.

`presentRevenueCatPaywall` calls `presentPaywallIfNeeded({ offering, requiredEntitlementIdentifier: 'her_keys_plus' })` rather than the unconditional `presentPaywall`, so RevenueCat itself can skip presentation (`NOT_PRESENTED` → `already_entitled`) when the customer's freshest CustomerInfo already carries the entitlement — this is what keeps an already-entitled customer from seeing the paywall flash.

**Placements** (`src/monetization/entitlement.ts`, `PAYWALL_PLACEMENTS`): `onboarding_complete`, `systems_upgrade`, `premium_feature`, `manual_upgrade`. A route name is never treated as a business reason.

**Paywall policy** (`PaywallPolicy = 'soft' | 'enforced'`, `PAYWALL_POLICY = 'soft'` for Build 2.5): application/business configuration, not persisted in household state. `canResolveOnboardingPlus(resolution, policy)` in `entitlement.ts` is the single rule for which onboarding resolutions are allowed under which policy — `already_entitled`/`purchased`/`restored` always resolve; `continued_without_plus`/`no_offering_fallback` resolve only under `soft`.

---

## 5. Onboarding

Flow: `goals → strengths → struggles → talk-it-out → profile → plus → (app)`.

- `ONBOARDING_STEPS` (`src/domain/state.ts`) gained `'plus'` as its final value — an additive, backward-compatible widening of an already-existing enum field (`Onboarding.lastStep`); no schema version bump or migration was needed.
- `onboardingStepAccess` gates `plus` on the same prerequisite as `profile` (`hasStruggles`), matching the existing `talk-it-out`/`profile` pairing.
- `completeOnboarding` now requires `.plus` access instead of `.profile`, and records `lastStep: 'plus'`. It still takes no entitlement parameter — completion is a household-side fact only ("onboarding finished"), never *why*. Which resolutions may call it is decided entirely in `canResolveOnboardingPlus`.
- `app/onboarding/profile.tsx`'s button now advances to `/onboarding/plus` instead of completing onboarding directly.
- `app/onboarding/plus.tsx` is the paywall screen: benefits shell, "See Her Keys+" (→ `presentPaywall('onboarding_complete')`), "Restore purchases", and "Continue without Her Keys+" (soft-policy fallback, always available). If `status` is already `'plus'` on mount or becomes so, the screen resolves onboarding itself with no purchase UI shown.
- `app/_layout.tsx` adds the matching `Stack.Protected` guard and `ROOT_SCREEN_GUARDS['onboarding/plus']`.

**Resume.** Reaching `plus` records it as the furthest step via the existing `recordOnboardingStep`/`onboardingResumeStep` machinery — no new persisted field was needed. A force-stop on the paywall resumes there on relaunch (`tests/monetization.test.mjs`, "force-stop and resume at the plus step..."), unless `completedAt` is already set.

**No loop.** Once `completedAt` is set, every onboarding screen (including `plus`) closes and `(app)` opens, exactly like the rest of Build 2's guard table — verified for `plus` alongside the rest of `ROOT_SCREEN_GUARDS` in `tests/monetization.test.mjs`.

---

## 6. Contact points implemented

1. **Onboarding final step** — `app/onboarding/plus.tsx` (above). Primary acquisition placement (`onboarding_complete`).
2. **Systems** — `app/(app)/systems.tsx` gained one restrained "Her Keys+" card (hidden once `isPlus`) with a single secondary-styled button calling `presentPaywall('systems_upgrade')`. `SystemsList` itself is unchanged.
3. **Premium feature gate** — `src/monetization/usePremiumGate.ts`, exposing `requirePlus({ placement, feature })`. It checks `checkFeatureAccess` first and only presents the paywall if the feature is actually gated. Not wired to any existing Build 1/2 screen — infrastructure only, per instruction not to lock existing free functionality yet.
4. **Manual presentation** — the same `useEntitlement().presentPaywall(placement)` the other three call is itself the reusable method for any future contextual prompt (e.g. `manual_upgrade`).

---

## 7. Feature access

`src/monetization/featureAccess.ts` defines a tiny manifest:

| Feature key | Level |
| --- | --- |
| `daily_load_core` | `free` (documents existing Build 1/2 functionality explicitly, rather than by omission) |
| `advanced_daily_load_patterns` | `plus` |
| `momentum_insights` | `plus` |

`checkFeatureAccess(featureKey, entitlement)` returns `{ allowed, reason }`; a `plus`-only feature checked against `'unknown'` reports `entitlement_unknown`, never a false "you're not subscribed" claim. This file imports nothing from `react-native-purchases` (a source-scan regression control, M-equivalent to the "does not import RevenueCat directly" test requirement). Future premium code calls `usePremiumGate()`'s `requirePlus(...)` — it never touches RevenueCat or `CustomerInfo` directly.

---

## 8. Purchase / restore

- **Purchase:** `presentPaywall(placement)` → RevenueCat's `presentPaywallIfNeeded` → on `PURCHASED`/`RESTORED`, `RevenueCatProvider` immediately calls its own `refresh()` (re-fetches `CustomerInfo`) before returning the outcome, so `isPlus` reflects a *verified* refreshed read, not just a button's reported success.
- **Restore:** `useEntitlement().restore()` → `Purchases.restorePurchases()` → `'restored'` only if `her_keys_plus` is actually active afterward; otherwise `'no_purchases_found'`.
- **Cancellation/error:** the paywall screen shows a short nontechnical note (or nothing, for a plain cancel) and stays put — no retry nagging, no forced re-presentation.
- **Already entitled:** short-circuited both in `RevenueCatProvider.presentPaywall` (checked before asking RevenueCat) and inside RevenueCat itself via `presentPaywallIfNeeded`.

Required entitlement everywhere above: `her_keys_plus`, from `HER_KEYS_PLUS_ENTITLEMENT`.

---

## 9. Pricing

**PRODUCTION_PRICE_HARDCODED=NO.**

No monthly/annual price, trial, discount, or "save X%" exists anywhere in this build's source or copy. `app/onboarding/plus.tsx` and `app/(app)/systems.tsx` describe Her Keys+ only in terms of what it will unlock, explicitly marked as **coming**, never as available now. `tests/monetization.test.mjs` scans `app/` and `src/monetization` for a `$<digits>` pattern as a standing regression control (M4). When a RevenueCat Test Store product exists, its synthetic price is real dashboard configuration but is never read into Her Keys UI copy in this build — the paywall surface itself is entirely RevenueCat's (`presentPaywallIfNeeded`), so Her Keys source never touches a price string at all, dev or production.

---

## 10. Persistence / privacy

**SUBSCRIPTION_TRUTH_IN_HOUSEHOLD_STATE=NO.**
**SECRET_REVENUECAT_KEY_IN_CLIENT=NO.**

See [§3](#3-entitlement-model) and [§2](#2-revenuecat-configuration). No RevenueCat customer data (subscription status, expiration date, product price, RevenueCat user ID) is written into the Build 2 household envelope, `AppStateV1`, or AsyncStorage. The Build 2 hostile audit's finding that local AsyncStorage is unencrypted (`HK-B2-AUDIT-013`) is unaffected by this build — Build 2.5 does not add anything to that store.

---

## 11. Customer identity (anonymous)

Her Keys has no production authentication yet, so `Purchases.configure({ apiKey })` is called with no `appUserID`. RevenueCat generates and persists (natively, on-device) its own random anonymous App User ID; Her Keys never sees or stores it, and never uses a household ID, child ID, or personal name as a RevenueCat identifier.

**Future migration, when Her Keys authentication exists:** call `Purchases.logIn(appUserID)` right after a user authenticates, using Her Keys' own stable account identifier (never PII). If the anonymous device already purchased Her Keys+, RevenueCat aliases the anonymous App User ID's purchase history onto the newly-identified one automatically, so a purchase made before login is not lost. Call `Purchases.logOut()` on sign-out to return to a fresh anonymous identity for the next person on that device. Until that exists, two people sharing a device share one anonymous RevenueCat identity and its entitlement — an acceptable Build 2.5 limitation, consistent with Build 2 having no accounts either.

---

## 12. Customer Center — decision

`react-native-purchases-ui` (installed) ships RevenueCat's Customer Center components, but Build 2.5 does not build a "Manage Her Keys+" entry point. Rationale: there is no real subscription to manage yet (no production price/product), and Systems is explicitly not being redesigned this build. **Decision: defer.** When a "Manage Her Keys+" surface is needed, `RevenueCatUI`'s Customer Center can be wired in without adding a dependency — it's already present.

---

## 13. Offline / unavailable behavior

Soft policy fails open by construction:

- `resolveEntitlementState(null)` → `'unknown'`, never a false `'free'`.
- `checkFeatureAccess(featureKey, 'unknown')` → `allowed: true` for a `free` feature (existing functionality never locks because a check failed), `allowed: false, reason: 'entitlement_unknown'` for a `plus` feature (honest, not a false "unsubscribed" claim).
- `app/(app)/today.tsx` has no dependency on `src/monetization` at all (verified by source scan, M6) — RevenueCat being completely unreachable cannot touch Today.
- The onboarding paywall's "Continue without Her Keys+" affordance is always present under the soft policy, independent of whether an Offering, RevenueCat, or the API key itself is available.

---

## 14. Tests / negative controls

`tests/monetization.test.mjs` — 23 tests across 7 `describe` blocks, all passing. Combined with the unmodified Build 2 suite: **167/167 tests, 36/36 suites.**

| Requirement | Covered by |
| --- | --- |
| 1. entitlement active → Plus | "her_keys_plus active resolves to plus" |
| 2. entitlement absent → free | "a fake or unrelated entitlement never resolves to plus" |
| 3. RevenueCat unavailable → fallback | "an unresolvable check ... is unknown" |
| 4. no Offering → onboarding resolves (soft) | "continuing without Plus, or falling back with no Offering, resolves only under the soft policy" |
| 5. paywall is final onboarding step | "the step order ends with plus..." / "reaching the plus step does not, by itself, open the app" |
| 6. force-stop/resume at paywall | "force-stop and resume at the plus step returns to it" |
| 7. already entitled skips/resolves | "already entitled resolves regardless of policy" |
| 8–12. purchase/restore success, cancel, error, no-entitlement | The domain-level resolution rule (`canResolveOnboardingPlus`) and outcome types are tested; the live RevenueCat call sequence lives in `.tsx`/`RevenueCatProvider.tsx`, which — like every other `.tsx` in this repository — is outside `node --test`'s reach (see `tests/support/register-ts.mjs`) and is verified by code review plus the Expo Go / development-build runs in §15 |
| 13. SDK missing/unconfigured fallback | "an unset key is reported as not configured" + the `resolveEntitlementState(null)` chain |
| 14. pricing never hard-coded | M4 source scan |
| 15. subscription truth not in AppStateV1 | M3 source scan |
| 16. feature-access layer doesn't import RevenueCat | "the feature-access layer does not import RevenueCat directly" |
| 17. placement IDs typed/stable | "placement ids are a fixed, typed set" |
| 18. existing Build 2 route guards remain valid | All 144 pre-existing tests still pass unmodified, including the guard-table structural test |
| 19. no paywall loop after completion | "no paywall loop after completion..." |
| 20. free functionality accessible in soft mode | M6 + `daily_load_core` free-path tests |

**Hostile / negative controls implemented as standing regressions** (not one-shot mutate-and-revert, but tests that fail if the guarantee is removed):

| Control | Guarantee | Test |
| --- | --- | --- |
| M1 | A fake/unrelated entitlement id never grants Plus | "a fake or unrelated entitlement never resolves to plus" |
| M2 | Soft fallback can't be silently dropped without failing a test | "continuing without Plus, or falling back with no Offering, resolves only under the soft policy" — fails if `PAYWALL_POLICY` or the resolution rule changes |
| M3 | No subscription field in `AppStateV1` | source scan |
| M4 | No hard-coded price | source scan |
| M5 | Paywall resume state isn't lost | "force-stop and resume at the plus step..." |
| M6 | RevenueCat outage can't lock free Today | source scan + free-feature-access test |
| M7 | No `sk_...` secret key in client source | source scan |

---

## 15. Development build

**Expo Go (Preview validation):**

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 167/167 tests, 36/36 suites** |
| `npx expo-doctor` | **PASS — 21/21** |
| `npx expo config --type public --json` | **PASS — SDK 57.0.0, scheme `herkeys`** |
| `npx expo export --platform android` | **PASS — 1,455 modules, 5,180,575-byte Hermes bundle** (was 1,420 modules / 3,550,416 bytes before this build; the +1.63 MB is the RevenueCat SDK and paywall UI code) |
| `npm audit` | expected baseline — 13 moderate, unchanged from Build 2 |
| `npm ls --all` | expected baseline failure — pre-existing `react-native-worklets` optional-peer drift (`HK-B2-AUDIT-011`), unchanged; RevenueCat introduced no new dependency problem |

Expo Go itself boots `react-native-purchases`' Preview API mode automatically (no crash on import), so navigation/placement/fallback paths are exercisable there, but `getCustomerInfo`/purchase/restore results are simulated, not real.

**Native RevenueCat / Test Store validation: NOT_EXECUTED.** Blocked on two independent things this session does not have:

1. **No RevenueCat dashboard access.** There is no configured RevenueCat project, `her_keys_plus` entitlement, Offering, or Test Store product reachable from this session, and no dashboard credentials were available to create one. Exact steps for the owner:
   - Create (or open) the Her Keys project at [app.revenuecat.com](https://app.revenuecat.com).
   - Add the `her_keys_plus` entitlement (Entitlements tab).
   - Create a Test Store product and attach it to an Offering (Products/Offerings tabs — Test Store is provisioned automatically per project, no extra setup beyond that).
   - Copy the iOS and Android **public** SDK API keys (not `sk_...` secret keys) into a local `.env` using the names in `.env.example`.
2. **No EAS build / device.** This session could not reach an authenticated EAS account, and this machine's Android emulator/adb did not respond (adb server did not come up within a bounded wait; no confirmed booted AVD). Exact commands for the owner, once `.env` above is filled in:
   ```
   eas login
   eas build --profile development --platform android
   ```
   installed on a device/emulator, then repeat the Expo Go checks above natively, plus:
   - a Test Store purchase → confirm `her_keys_plus` becomes active in `CustomerInfo`
   - the gated Systems/onboarding UI recognizes it live
   - force-stop and relaunch → entitlement still recognized (via RevenueCat, not local storage)

Marking this **NOT_EXECUTED** rather than assuming a pass, per this build's own instruction not to fake success.

---

## 16. Manual acceptance

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Fresh onboarding reaches Her Keys+ last | NOT_EXECUTED — no running emulator/device this session; structurally proven by §14's automated route/resume tests |
| 2 | Continue without Plus (soft) reaches Today | NOT_EXECUTED — same; proven by the "no paywall loop" and `canResolveOnboardingPlus` tests |
| 3 | Force-stop on paywall → relaunch → resumes | NOT_EXECUTED — same; proven by "force-stop and resume at the plus step" |
| 4 | Already-entitled test customer resolves correctly | NOT_EXECUTED — requires a real RevenueCat Test Store customer |
| 5 | Systems upgrade opens the same monetization layer | NOT_EXECUTED — same underlying `presentPaywall` call as onboarding; not independently re-verified live |
| 6 | Paywall cancellation returns safely | NOT_EXECUTED |
| 7 | Restore path produces correct result | NOT_EXECUTED — requires Test Store |
| 8 | No Offering/config failure doesn't trap onboarding | NOT_EXECUTED live; proven structurally (soft-policy resolution test + "Continue without Plus" is unconditional in `plus.tsx`) |
| 9 | Existing Today/Life/Calendar/Systems/Talk It Out still work | NOT_EXECUTED live this session; `npm test` (167/167) and `expo export` cover everything reachable without a device |
| 10 | RevenueCat unavailable doesn't lock existing free functionality | NOT_EXECUTED live; proven structurally (M6) |
| 11 | Development build native RevenueCat initialization | **NOT_EXECUTED** — see §15 |
| 12 | Test Store purchase → `her_keys_plus` active | **NOT_EXECUTED** — see §15 |
| 13 | Relaunch after test purchase → Plus still recognized | **NOT_EXECUTED** — see §15 |

No manual scenario is claimed as PASS without having actually run. Every one of 1–10 is structurally proven by an automated test named above; none of them substitutes for actually watching the app do it on a device, which this session could not reach.

---

## 17. Known limitations

- **No native/Test Store verification this session** — see §15. This is the build's largest open item before it can be called done rather than architecturally ready.
- **One anonymous RevenueCat identity per device** until Her Keys has authentication; two people sharing a device share one entitlement.
- **No Customer Center UI** — deferred (§12); the dependency is present for later.
- **Bundle growth**: +1.63 MB Hermes bundle from the RevenueCat SDKs, on top of Build 2's already-deferred bundle-size item (`HK-B2-AUDIT-012`). Not measured in a release build.
- **`usePremiumGate`/`requirePlus` is unused infrastructure** — no existing screen calls it yet, by design (Build 2.5 doesn't decide the free/plus boundary for real features).
- **The onboarding paywall can very briefly render before an already-entitled status resolves** if RevenueCat's first check is slow; it disappears once `status` becomes `'plus'`. Acceptable for Build 2.5's soft policy; would need a hard loading gate if this become the enforced paywall later.
- **Everything under §16 (1–13)** is unexecuted live and should be run for real before treating this build as verified end-to-end, not just architecturally sound.

## 18. Prerequisites before any placement becomes "enforced"

- Production pricing decided and configured in RevenueCat (real Offering, real products).
- Purchase flow certified on both platforms with real store products (sandbox or TestFlight/Play internal testing), not just Test Store.
- Restore certified the same way.
- Legal/subscription copy approved (terms, restore instructions, cancellation instructions per store policy).
- A decision on whether any currently-free Build 1/2 functionality should move behind `plus` in `featureAccess.ts` — none does today.

None of the above changes the architecture built here; `PaywallPolicy` moving from `'soft'` to `'enforced'` for a given placement is the only code change anticipated.
