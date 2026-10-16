# Her Keys Premium: native paywall activation checklist

Branch `integration/premium-paywall-layout-20261015`. Production paid activation stays OFF
(`PRODUCTION_PREMIUM_ENABLED=false`, `PRODUCTION_WEBHOOK_PROCESSING=false`,
`PRODUCTION_ACCOUNT_DELETION_EXECUTION=false`) until every gate below is closed and approved.

## What the source now guarantees (verified by tests, not by a device)

| Guarantee | Where |
|---|---|
| Free sign-in never waits on RevenueCat | `identifyRevenueCatAccount` reports, never throws; PR #21 |
| Every non-interactive SDK call ends (15 s identify/read, 60 s restore) | `REVENUECAT_DEADLINES` in `revenueCatClient.ts` |
| A failed bind-time identify is retried when a purchase is about to be offered | `ensureRevenueCatIdentity` |
| A paywall opens only for the signed-in account and a priced native offering | `RevenueCatProvider.presentPaywall`, `purchaseReadiness.ts` |
| A Welcome "Premium" choice is an intent; one paywall, after the audit and profile | `deferred` in `PremiumCheckoutAfterConsent`, `app/onboarding/plus.tsx` |
| Continue Free is always available; cancel/failure/unavailable never trap | `plus.tsx`, `paywallFeedback.ts` |
| Entitlement truth is server-side (webhook + reconcile + gate), never a client flag | `supabase/functions/_shared/premium/*`, `tests/premium/*` |

## Open items that need access I do not have

### RevenueCat (needs `/mcp` authentication of "claude.ai RevenueCat", or dashboard access)
1. Offering `ofrng40c3008072` holds only Test Store products. Register the real Google Play and App Store
   subscriptions in the catalog and attach them to `$rc_monthly` / `$rc_annual` and entitlement `her_keys_plus`.
   Remove or hide the Test Store lifetime package unless a native lifetime product exists and is approved.
2. Google Play: purchase-lookup validation is UNKNOWN because the configured package was not found. Confirm the
   RevenueCat Android app (`app3311d4868e`) package is exactly `com.heykeys.app` and that the Play app exists
   with the service-account permissions RevenueCat documents.
3. Apple: the App Store Connect API key is not configured (the subscription key is valid). Needed for product import.
4. Confirm the public SDK keys belong to the right apps: `goog_...` -> `app3311d4868e`, `appl_...` -> `app55f51de583`.

### EAS environment variables (I can set these once the keys are known)
| Environment | State found |
|---|---|
| `development` | no RevenueCat keys at all (the diagnostic APK therefore has no SDK key) |
| `preview` | Android key is a placeholder (not a `goog_` key); iOS key is `appl_`-shaped |
| `production` | both keys present and correctly shaped; ownership not yet confirmed against RevenueCat |

### Store products (read-only inputs I need; I will not invent or change any)
Per platform: product ID, monthly/annual base plan or duration, introductory offer or trial, price and territories as
configured today, and activation/approval state.

### Supabase (needs OAuth, the authorization URL was issued in the conversation)
- Staging `fhhudicklmpofuzkxeqe`: `revenuecat-webhook` is v2; Production `npykvnxnehlsdlbumzwk` is v1. Redeploy of
  v2 to Production is a Production change and needs approval.
- Read live flags, webhook secret presence (names only), and RLS on the Premium tables in both projects.
- Authorized Staging end-to-end: purchase event -> webhook -> projection -> `premium-gate`.

### Store-backed purchase certification
- Google Play internal testing track with licensed testers (a sideloaded diagnostic APK cannot make real Play
  Billing purchases).
- Apple sandbox tester for StoreKit; no IPA is built in this sprint.

## Production activation gate (all must hold, then explicit approval)
1. Native products registered, mapped and visible in the offering on both platforms.
2. A licensed-tester purchase on Android produces a webhook, a projection row and a granted gate decision on Staging.
3. Expiry, cancel, refund and restore verified on Staging.
4. Production `revenuecat-webhook` at v2 with secrets configured and webhook processing verified on a Sandbox event.
5. `premium_enabled` and webhook processing enabled together, so no customer can be charged while delivery is off.
6. Rollback: set `premium_enabled=false` and webhook processing off; the client degrades to Free (tested:
   `fail-closed` gate, Continue Free path).

## Premium benefits copy
`app/onboarding/plus.tsx` still states that nothing is locked behind Premium. That is true until a gated feature
ships; change it only with the approved positioning and a confirmed gated feature.
