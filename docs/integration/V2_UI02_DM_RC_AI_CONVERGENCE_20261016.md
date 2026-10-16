# Her Keys V2 — UI02 / Adaptive Appearance / RC Identity / AI Consent Convergence

**Date:** 2026-10-16  
**Status:** Integrated source candidate, **NOT YET CI/NATIVE/BACKEND CERTIFIED**. No production deployment or release authorized.

## Pinned source, ancestry and ownership

The candidate is branched directly from **PR #31** `design/hk-fe-ui-02-adaptive-appearance-20261016` at `f88648bd638da2cc3125ee62f630753ec4f9dc94`. That SHA already contains:

| Source | Pinned head | Incorporated through |
|---|---|---|
| UI02 Foundation / Welcome Tree PR #27 | `23dc2d73a87a78ac4064d569f8d2c8e00b6f0595` | PR #28 / #29 / #31 ancestry |
| UI02 Core PR #28 | `c97d4f2ea1354662057691af28b97c5b9c1e8195` | PR #29 / #31 ancestry |
| UI02 Premium PR #29 | `ca9e7926ffa2d3b752e1a17856e1ad1310f402da` | PR #31 ancestry |
| UI02 Adaptive Appearance PR #31 | `f88648bd638da2cc3125ee62f630753ec4f9dc94` | **Direct parent of convergence branch** |

**The original four draft PRs were not merged, modified or rebased.** Ancestry is the source of their incorporation in this review branch. The base for this convergence PR remains #31, not `main` or any production release branch.

## RevenueCat identity — deliberate conflict resolution

Reviewed the separate historical RevenueCat fix commit `8cb841c2d0b22e0586901075f485e4c3d18c55ee` against its parent `8f80ce93551a56faa12d31b6cd50eb0ea56ed8a2` and the PR #31 baseline.

**Rejected a wholesale cherry-pick.** The newer PR #31 code already has stricter native identity-work quarantine: `nativeIdentityWorkUnsettled` stays true until actual async native work settles, meaning a timed-out late `logIn`/`logOut` cannot overlap with a newer native account mutation. The historical fix's model allowed the next native mutation after a timeout, then relied on late identity detection. Overwriting the newer code would weaken protection.

**Retained without change:**
- Bounded `getAppUserID()` reads and 15-second production read deadline.
- Native work quarantine and release only on actual settlement.
- Sequential SDK account operation queue.
- Fenced entitlement, restore and paywall transactions.
- Published identity epoch and desired account tracking.
- Existing negative tests covering late native `logIn`, late `logOut`, and indefinite ID-read timeouts.

**Ported only remaining protections:**
- A readable SDK ID mismatch now withdraws `identifiedAccountId`, never displays entitlements or a paywall under the mismatched SDK actor, and allows a subsequent **current-actor** re-identification.
- Bounded SDK identity verification now captures and checks the actor epoch plus desired account across an awaited native ID read.
- `ensureRevenueCatIdentity()` serializes its verification, refuses a stale actor after a concurrent account switch, and never starts a second native mutation solely because an ID read was timed-out/unreadable.
- Targeted tests added: SDK drift recovery; actor-switch during slow ID read; unreadable ID never triggers a redundant native `logIn`.
- Test fixture gained a controlled delayed identity-read promise; existing quarantine tests were retained.

**The historical commit is not an ancestor of this branch; its safety purpose is reconciled via reviewed, narrower source changes.** Native SDK behavior still needs exact-SHA CI and an Android/iOS native test before any paid purchase activation.

## AI Data Processing consent — exact reviewed repair

Integrated PR #30's two changed files into the PR #31 source (the originals had identical blob SHAs in both bases):

- `supabase/functions/herkeys-ai/index.ts`: remove optional `HER_KEYS_AI_REQUIRE_CONSENT` server switch. Every authenticated caller must have a current affirmative, version-matched `account_consents` receipt before the provider is contacted. Any read failure fails closed.
- `tests/productionConsentBuildProfile.test.mjs`: enforce unconditional consent read ordering before Gemini; reject any reintroduction of an optional server-consent switch.

There are **no live Edge Function deployments** in this convergence. The corresponding live functions remain unpatched until the deployment owner certifies tests and safely promotes the change.

## Exact diff boundary

Compared with PR #31 `f88648b`, the convergence modifies **only**:
1. `src/monetization/revenueCatClient.ts` — bounded/native identity drift verification and current-actor recovery;
2. `tests/platformParity/purchaseReadiness.test.mjs` — regression cases preserving quarantine;
3. `tests/platformParity/support/purchases.mjs` — synthetic held identity read;
4. `supabase/functions/herkeys-ai/index.ts` — server-side consent guard;
5. `tests/productionConsentBuildProfile.test.mjs` — consent guard regression tests;
6. `.github/workflows/v2-integration-validation.yml` — adds only the exact unified branch to the existing validation-only push allowlist, preserving full tests and **without** triggering EAS builds or deployment;
7. this integration report.

No design token, UI component, navigation, feature-gate, EAS configuration, Supabase migration, deletion logic or deployed function was changed in this convergence layer.

## Required certification before advancement

1. **Exact-SHA CI** (validation-only workflow registered for this branch; completion/conclusion must be independently inspected): fresh `npm ci`; `npx tsc --noEmit`; `npx expo install --check`; `npx expo-doctor`; full JS test suite, platform parity, welcome/auth/consent, UI02 theme boundary and rendered contrast, account isolation, premium lifecycle, release identity and backend checks. Tests were **not executable in this connector-only integration workspace**. No CI PASS claimed.
2. **Native RevenueCat actor races**: timed-out/hung identity read, late native login/logout, SDK ID drift, account A→B while verifying, account B restore and purchase boundaries, Free path unaffected. The checkout flag remains OFF.
3. **Server AI consent certification**: deploy to Staging only after TypeScript/Deno checks; test a legitimate synthetic opted-in account and declined/missing/outdated consent, then review Production promotion. No real LLM invocation was made by this integration work.
4. **UI02 adaptive appearance**: new native binary and physical-device Light/Dark/System startup and switching, real Your Account, final Premium choice and review sheets, iOS and Android chrome/splash. Expo Go gallery is not native certification.
5. **Known inherited failures**: 8 account-deletion failures **deferred to owner**; 3 `premiumHome` failures separately tracked. Do not disable or weaken tests to imply PASS. New failures must be investigated.
6. **Billing**: no native store purchase/restore, no entitlement grants, no webhook activation switch, no user/test PII in this source integration. Keep `checkout_enabled=false` until commercial and webhook certification.

## Integration disposition

- `SOURCE_ANCESTRY=VERIFIED`
- `DESIGN_AND_ADAPTIVE_APPEARANCE_INCLUDED=YES`
- `REVENUECAT_IDENTITY_SAFETY=RECONCILED_SOURCE_ONLY`
- `AI_CONSENT_GUARD=RECONCILED_SOURCE_ONLY`
- `FUNCTIONAL_CODE_CHANGES=2_TARGETED_AUTHORIZATION_BOUNDARIES`
- `EXACT_SHA_CI=PENDING`
- `NATIVE_CERTIFICATION=NOT_RUN`
- `REAL_LLM_TEST=NOT_RUN`
- `DATABASE_OR_PRODUCTION_CHANGES=NONE`
- `READY_FOR_INTEGRATION_REVIEW=YES`
- `READY_FOR_PRODUCTION_RELEASE=NO`
