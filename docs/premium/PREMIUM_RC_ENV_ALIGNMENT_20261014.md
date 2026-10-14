# Her Keys — RevenueCat / Supabase Staging + Production Alignment
**Live configuration date:** 2026-10-14 (UTC). **Evidence level:** ENVIRONMENT_CONFIGURED_PARTIAL. This document records verified live changes and remaining security blockers; it does not certify Sandbox payments, live model or Production activation.

## Provenance and project boundaries
- RevenueCat **Her Keys** project `proj93809efe` (do not substitute K Scan AI). App IDs: Play `app3311d4868e` / `com.heykeys.app`; App Store `app55f51de583` / `com.herkeys.app`; Test Store `app3bba22bc6a`.
- Entitlement ID `entlb9fcb75481`, immutable identifier `her_keys_plus`. Display name changed to **Her Keys Premium** and read back successfully. No product entitlement, price, trial, or offering assignment edited.
- Default RC offering: `ofrng40c3008072`, key `default`, current; monthly / annual / lifetime packages each map only to Test Store products, **no native iOS/Android products**. Do not claim paid native purchase readiness.
- Staging Supabase `fhhudicklmpofuzkxeqe`, Production `npykvnxnehlsdlbumzwk`. The two Premium migrations already existed in both environments before this operation.

## Production deployment: completed
Deployed the **exact live Staging bundled source** to Production through Supabase Edge Functions. Bundle SHA-256 matches the currently deployed Staging source. All are ACTIVE version 1, with JWT at the gateway enabled for all client-accessible functions:

| Function | JWT? | Staging and Production SHA-256 | State |
|---|---|---|---|
| premium-gate | true | `366307e1be3369f38031d3f29bd835a89568e703d272101021189b9202264bab` | ACTIVE v1 both |
| premium-reconcile | true | `c115d42e4fb4d91ed52696153d3f0466bd0f0790ccaacd5657b104a2ffd07cab` | ACTIVE v1 both |
| smart-inbox-extract | true | `52f7187bf041051d088c694c09145e41d3947920fefe4660075e725992e976e8` | ACTIVE v1 both |
| revenuecat-webhook | false; own Auth/HMAC | `0261ac7e7b20dfe54c08ec6fc1e5792ebe9ab305771af379d487d5dabb5fd694` | ACTIVE v1 both |
| premium-ops | false; own operator secret | `65a8829ac70012f1b515a5d7965e65edb018fcc2a6f63cba11ed9f30e2760557` | ACTIVE v1 both |

**Production safety remained intact:** `premium_runtime_config.environment=production`, `premium_enabled=false`, `webhook_processing=false`, `allow_test_fixtures=false`; `account_deletion_control.enabled=false,dry_run=true`. Staging runtime `staging`, Premium core `true`, webhook `false`, fixtures `false`, deletion `false/dry_run`. All three new Premium-feature registry entries remain `enabled=false,released=false` in both. Village/Co-Parent Plus likewise not released. Premium base-table unsafe RLS count **0**, anon SELECT count **0** in both. Health shows only intentionally disabled-switch alerts, with no backlog/dead-letter issues.

### Real unauthenticated HTTP negative checks
Produced via Supabase Staging and Production `pg_net` against the **live hosted** Edge endpoints; status-code rows read from `net._http_response`:
- GET Staging request ids `378–382`, Production `1–5`: `premium-gate` `401`, `premium-reconcile` `401`, `smart-inbox-extract` `401`, `revenuecat-webhook` `405`, `premium-ops` `405` (all expected).
- Unauthenticated POST Staging `383–384`, Production `6–7`: both webhook and ops endpoint `503 not_configured`. **This is a FAIL-CLOSED blocker**, not successful configured webhook-auth verification. No valid callback or real purchase attempted. No subscription granted.

## RevenueCat integration registrations: created/read back
| Environment filter | Webhook integration ID | Destination | Status |
|---|---|---|---|
| Sandbox | `whintgr2afbbcfb32` | `https://fhhudicklmpofuzkxeqe.supabase.co/functions/v1/revenuecat-webhook` | **REGISTERED BUT SECURITY SETTINGS INCOMPLETE** |
| Production | `whintgrf7d1c93842` | `https://npykvnxnehlsdlbumzwk.supabase.co/functions/v1/revenuecat-webhook` | **REGISTERED BUT SECURITY SETTINGS INCOMPLETE** |

RC connected action cannot set webhook Authorization header or enable HMAC; **the created integrations begin delivering matching events automatically, but the receivers are not configured to accept them**. Configure secure settings immediately; any failed deliveries may require an explicit RevenueCat dashboard retry after setup. HMAC must match the raw-body `X-RevenueCat-Webhook-Signature: t=...,v1=...` protocol and `300` second tolerance.

## REQUIRED OWNER/DASHBOARD CONFIGURATION — per environment, never disclose values
### Supabase Edge Function secrets (distinct per project)
Staging `fhhudicklmpofuzkxeqe`:
- `PREMIUM_ENVIRONMENT=staging`
- `REVENUECAT_WEBHOOK_AUTH`: long cryptographically random value **matching the Staging RC webhook Authorization header**.
- `REVENUECAT_WEBHOOK_HMAC_SECRET`: Staging RC webhook's signing secret, copied at enablement.
- `REVENUECAT_SECRET_API_KEY`: private RevenueCat key with read-only subscriber permissions for project `proj93809efe` (not an SDK public key).
- `PREMIUM_OPS_SECRET`: separate cryptographically random operator secret.
- `GEMINI_API_KEY` / `GEMINI_MODEL` only once owner approves spend and live Smart Inbox evaluation.

Production `npykvnxnehlsdlbumzwk`:
- `PREMIUM_ENVIRONMENT=production`
- Distinct Production-specific `REVENUECAT_WEBHOOK_AUTH` and `REVENUECAT_WEBHOOK_HMAC_SECRET`, matching the **Production RC integration**.
- `REVENUECAT_SECRET_API_KEY` scoped to the same Her Keys RC project; `PREMIUM_OPS_SECRET` separate and different from Staging.
- Keep Production Premium switches **OFF** and `allow_test_fixtures=false`. No live AI configuration needed before approved activation.

**Important:** Database `premium_runtime_config.environment` does not write Edge `Deno.env`. There is no connected Supabase `set_secrets` action available in this session. Secrets were NOT installed by this operation. Never put these values in GitHub, a chat message or a public client `EXPO_PUBLIC_*` variable.

### RevenueCat dashboard
1. [Staging webhook](https://app.revenuecat.com/projects/93809efe/integrations/webhooks/whintgr2afbbcfb32): set Authorization to **exactly the secret configured in Staging**, enable HMAC signing, copy the signing secret immediately into Staging Edge secrets.
2. [Production webhook](https://app.revenuecat.com/projects/93809efe/integrations/webhooks/whintgrf7d1c93842): use distinct Production Authorization/HMAC pair; copy signing secret into Production Edge secrets. Leave DB webhook processing and Premium computation OFF.
3. Once secrets are set, rerun missing/bad Authorization and bad/missing/stale HMAC negative matrix; should change from `503` to `401`. Test Sandbox `TEST` and purchase/replay/TRANSFER on Staging before enabling `webhook_processing=true`.
4. **Do not** flip Production authorization or webhook processing without the release owner verifying actual subscriber identity/reconciliation and quota/consent RLS gates.

## Provider/store-readiness findings
- RevenueCat Android Play app package matches `com.heykeys.app`. Play service-account credential validation `status=unknown`: `subscriptions_api_permissions` cannot locate matching package, although `inapp_products_permissions` and `monetization_api_permissions` are valid. Play Console package/app linkage needs correction or Google-side publication/readability before purchase testing.
- App Store `com.herkeys.app` StoreKit subscription key **VALID**. App Store Connect API key **NOT CONFIGURED** (validation returns 422).
- RC has active legacy `homeos_pro` entitlement alongside `her_keys_plus`; left untouched to avoid altering existing rights. Default offering remains Test Store product only.
- Client has public RC keys in project (iOS key prefix `appl_`, Android key prefix `goog_`) but Expo EAS environment presence is unverified. App source reads `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.
- No native products/prices/trials/store changes made.

**Status:** `STAGING_PREMIUM_SCHEMA=PASS`, `PROD_PREMIUM_SCHEMA=PASS`, `EDGE_PARITY=PASS`, `RC_PLATFORM_IDENTITY=PASS`, `RC_WEBHOOK_DESTINATIONS_REGISTERED=PASS`, `RC_SECURE_DELIVERY=BLOCKED`, `STAGING_SANDBOX_E2E=BLOCKED`, `PRODUCTION_PREMIUM_ACTIVATION=NOT AUTHORIZED`, `ACCOUNT_DELETION=OFF`.

## Next owners
- Owner: configure per-project Supabase Edge secrets and per-webhook Authorization/HMAC in RC dashboard. **This is the sole hard integration blocker** for authenticated webhook validation, along with availability of two Staging tester JWT sessions.
- Platform owner: fix Play package subscription permissions, install App Store Connect key, establish native offerings via approved store products and restore/transfer policy. See [#17](https://github.com/herkeys/her-keys/issues/17).
- Premium backend owner: real Staging signed-event/reconcile/quotas/auth/ops tests after owner secret setup. See [#16](https://github.com/herkeys/her-keys/issues/16).
- Deletion owner [#9](https://github.com/herkeys/her-keys/issues/9): deferred for internal testing per owner instruction; cannot activate irreversible erasure.
