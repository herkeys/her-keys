# RevenueCat and free-trial follow-up (deferred by the owner, 2026-10-21 — fix next)

The owner deferred all RevenueCat dashboard work during the Android E2E run. Everything below was verified read-only or
from source; nothing in RevenueCat, Google Play Console or App Store Connect was changed.

## Verified state

| Item | State |
| --- | --- |
| Staging `revenuecat-webhook`, `premium-ops` | Deployed; unauthenticated and wrong-credential POSTs now return **401** (secrets configured — previously 503) |
| Signed delivery | Two genuine signed RevenueCat `TEST` events processed on Staging (2026-10-19) as `ignored_test` |
| "Stuck" TRANSFER events | The three Staging `TRANSFER` rows at `received` are **synthetic** `deletion-fixture-*` rows written by the deletion certification fixture, not RevenueCat deliveries. Safe to leave or delete; not a webhook defect |
| Reconcile | One Staging `source='reconcile'` row exists (`has_entitlement=false`), so `REVENUECAT_SECRET_API_KEY` reconcile works |
| Checkout | `checkout_enabled=false` in Staging and Production |
| Android SDK key | EAS `preview` env `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` = literal placeholder `<PLAY_STORE_PUBLIC_KEY>`; `development` env has no RevenueCat keys at all |
| Trial support in source | **None**: the server records `period_type` in event evidence but not in the projection; the client cannot tell a trial from a paid period |

## To do, in order

| ID | Action | Who |
| --- | --- | --- |
| R-01 | Put the real Google public SDK key (`goog_…`) in EAS `preview` (and `development`) as `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`; consider a `test_…` Test Store key for a separate internal profile. Until then, every Android Free account shows "Can't check right now" instead of an upgrade path (the store hint is `unknown`). | Owner (RevenueCat) + EAS env |
| R-02 | Optional client hardening: treat a key that does not match a public-key prefix (`goog_`, `amzn_`, `appl_`, `test_`) as not configured instead of initializing the SDK with it | Engineering |
| R-03 | Google Play: create the subscription and Monthly/Annual base plans with a 30-day free-trial offer (eligibility: new customer); Apple: one-month introductory offer. Import products into RevenueCat, attach both to the `her_keys_plus` entitlement and the current offering; configure the paywall to show the trial and post-trial renewal terms | Owner (stores + RevenueCat) |
| R-04 | Server: add a nullable `period_type` (`trial`/`intro`/`normal`) to `premium_entitlements` (additive migration), fill it from webhook `period_type` and from the subscriber record in reconcile, return it from `premium_my_entitlement`. Access stays exactly as now (a trial is `premium_active` and grants `her_keys_plus`) | Engineering |
| R-05 | Client: show "Free trial — ends {date}; renews as {plan} unless you cancel in Google Play/App Store" in Premium Home and Your Account; restore, store-managed cancellation link, expiration and revocation copy already exist | Engineering |
| R-06 | Staging lifecycle certification with a RevenueCat sandbox/Test Store purchase: INITIAL_PURCHASE (trial) → webhook → entitlement → restore → CANCELLATION → EXPIRATION → access removed; account isolation A/B; replay of the same event id | Engineering after R-01/R-03 |
| R-07 | Native Google Play trial certification: emulator signed into a licensed tester Google account, app installed from an internal testing track, real sandbox trial, renew/cancel/expire | Owner (Play Console tester + track) |
| R-08 | Only then: `checkout_enabled=true` in Staging, later Production | Owner approval |

The Staging test-fixture configuration made for the E2E run (see `REPORT.md` §5) can stay until R-06 replaces it with
real sandbox entitlements; roll it back then.
