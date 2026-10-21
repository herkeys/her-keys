# RevenueCat and store inventory
Observed 2026-10-21. Project `proj93809efe`; entitlement `her_keys_plus` (`entlb9fcb75481`); current offering `default` (`ofrng40c3008072`).

| Store | App | Monthly | Annual |
|---|---|---|---|
| Google Play | app3311d4868e / com.heykeys.app | monthly:monthly | yearly:yearly |
| Apple | app55f51de583 / com.herkeys.app | monthly | yearly |
| Test Store | app3bba22bc6a | monthly | yearly |

All six subscriptions and the preserved Test Store lifetime product are attached to her_keys_plus. Monthly and annual packages each contain the corresponding product for all three stores. Lifetime remains Test Store-only and is not added to the paywall.

Google live catalog: both base plans ACTIVE, U.S.-only, $9.99/month and $79.99/year. Each has an ACTIVE free trial offer with a single P1M phase and acquisition eligibility. Catalog/monetization credential checks pass; purchase verification remains UNKNOWN: **No application was found for the given package name.** Correct package identity is confirmed in source and RevenueCat. The accessible Google browser account exposes only the unrelated K Scan developer account; no settings there were changed. Missing evidence: Her Keys service-account email, app-specific grants, Developer API enablement and first signed internal-track AAB state. Do not infer the precise cause from catalog access alone. RevenueCat's response includes an irrelevant Apple-territory warning on the Play reads; it was not acted on.

Apple: RevenueCat still reports ASC API key not configured; validation returns HTTP 422. The subscription key is configured. Existing EAS submission credential associated with the exact Her Keys project and bundle was found: key ID XTNYDBS8T8, issuer 482fa4b7-89d8-4282-8963-5d2a1e68c960, Apple team Y9K3XPR9J2. Its private key was verified directly against Apple's Her Keys app and saved only as user-bound DPAPI encrypted data outside Git. No key was created, rotated or reused from K Scan.

Direct Apple API evidence: [apple-store.json](evidence/apple-store.json). App 6816197153; subscriptions monthly=6825188960, yearly=6825188825, same subscription group. U.S. prices $9.99 and $79.99; ONE_MONTH FREE_TRIAL, one period, 2026-10-21 through 2027-10-21. Only USA is available; automatic new-territory availability is false. Both products are MISSING_METADATA. This verifies configuration, not a StoreKit purchase or per-user eligibility.

Test Store live offers are P1M, never_subscribed, with existing prices unchanged. RevenueCat list-products has null trial_duration even when live store offers are correctly configured; the live store-state reads are authoritative.

Webhooks: Staging destination fhhudicklmpofuzkxeqe, sandbox-only; Production npykvnxnehlsdlbumzwk, production-only; all apps/events within this Her Keys project. Staging UI shows HMAC signing enabled and an existing Authorization header. A provider-issued TEST returned 200/ignored_test, with no subscription grant. Production received no synthetic event during this sprint.

[Her Keys RevenueCat apps](https://app.revenuecat.com/projects/93809efe/apps).
[Google credential requirements](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials).

