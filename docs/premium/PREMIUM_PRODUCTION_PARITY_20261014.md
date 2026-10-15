# Her Keys V2 — Production backend parity and artifact-host readiness

**Assessment:** October 14, 2026 (America/New_York); October 15 UTC.  
**Engineering branch:** `engineering/premium-stage1-completion-20261014`  
**Production:** `npykvnxnehlsdlbumzwk`; **Staging:** `fhhudicklmpofuzkxeqe`  
**Scope:** secure Production schema alignment, deployed-function and auth-bound source comparison, native artifact contract inspection. **NOT** an EAS build or native-store launch certificate.

## Production change actually deployed

- Additive production-only schema migration from reviewed engineering source `supabase/migrations/20261015140000_premium_stale_projection_guard.sql` was applied successfully using the connected Supabase migration API.
- Managed Production migration history: **`20261015020810_premium_stale_projection_guard`**, exactly one named migration entry. Staging's already-applied record is `20261015015427_premium_stale_projection_guard`. The repo source filename's timestamp differs from both managed history versions; account for this before any automated Supabase CLI `db push`, and do not manually rewrite migration-history records.
- Production `premium_runtime_config.max_reconciled_age_seconds`: **86400**, NOT NULL, check range **300..86400**. `premium_entitlement_state(uuid,timestamptz)` SHA computed with `md5(pg_get_functiondef())`: **`eaed1f05da39491570db258d181ed0bb`**, byte-for-byte function definition parity with Staging. Dirty `needs_reconcile`, stale, absent and suspiciously future subscriber reconciliations return `unknown`; old saved user records remain governed by their own RLS.
- `anon` and `authenticated` cannot EXECUTE the privileged state function, `service_role` can. Eleven Premium tables have forced RLS. Public schema security policy count **189 in each environment, no differences in definitions**.
- Production did NOT inherit Staging's `premium_authorize` allowlist override or `premium_staging_allowlist_guard_ready()`. Production keeps the standard production authorization procedure.
- No pre-existing user, decision or entitlement row was modified or deleted. Production had **one** Auth user before and after migration; Premium entitlements/events/decisions/authorization-audit remained **zero**.

## Production safety and smoke read-back — PASS for scoped database

| Check | Hosted Production result |
| --- | --- |
| Supabase project | ACTIVE_HEALTHY; Postgres 17.6.1.166, us-west-2 (matches Staging engine/region) |
| `premium_runtime_config.environment` | `production` |
| `premium_enabled` / `webhook_processing` | `false` / `false`, unchanged |
| `allow_test_fixtures` | `false` |
| Paid feature rows | `daily_load_premium`, `smart_inbox_extract`, `momentum_report`: all `enabled=false`, `released=false`, `rollout_status=not_released` |
| Account deletion worker | `enabled=false`, `dry_run=true`, unchanged |
| Unknown/non-member entitlement | `premium_entitlement_state(gen_random_uuid())='unknown'` |
| Premium health | No backlog, dead letters, stale projections, failed recent decisions; its two **expected** warnings concern the intentionally OFF global/webhook kill switches |
| Publishable credentials | Supabase has an enabled modern publishable and legacy anon key; value and EAS injection were not revealed/verified |

Production **was not populated with fake entitlements**. Staging performed transactional negative entitlement and paid-gate probes with explicit ROLLBACK in the preceding sprint; Production read-only checks assert schema/function identity and kill-switch safety. This is not proof of a real native store entitlement.

## Function and persistence parity inspection

- Staging has **21** ACTIVE Edge Function slugs; Production has **19** ACTIVE slugs. Only Staging's fixture and lock-probe endpoints are absent from Production, as intended. The **19 common function slugs** were retrieved from the actual deployed Supabase functions, not inferred from repository file names.
- Normalizing line endings and final blank lines, shared functions are behaviorally identical except an environment-intentional `readWebhookAuthConfig` difference in the shared Premium runtime: Staging requires HMAC on Staging **and** Production; Production requires HMAC for Production. Both reject invalid sender auth. Different function version numbers are NOT a reason to overwrite Production deployments.
- Core source-verified slugs: `weather-context`, `calendar-oauth`, `calendar-data`, `herkeys-ai`, `herkeys-welcome-email`, `premium-gate`, `premium-reconcile`, `smart-inbox-extract`, `revenuecat-webhook`, `premium-ops`; plus account/deletion functions. Deletion implementation was **not** modified; convergence and execution remain independently owned.
- Public-schema PostgreSQL constraint definitions match for **967 shared constraints** (Production has five extra constraints solely on the welcome-email receipt table); **388 shared index definitions** match (Production has the welcome-receipt primary key index); **134/134 trigger definitions** match across environments. This is based on live metadata digest comparison and excludes environment-specific auth/storage/provider configurations.
- Public schema table definitions match for **67 common tables**. Production has the additional `herkeys_welcome_email_receipts` table and `herkeys_claim_welcome_email(uuid)` function; Staging does not. All shared stored functions agree except the intentionally Staging-overridden `premium_authorize`.
- `storage.buckets` are not a meaningful parity target: Production contains its existing public `Legal docs` bucket; Staging contains an unrelated private deletion-certification test bucket. Neither was copied or changed. Bucket object contents and legal document delivery were not exercised.

## Actual native artifact environment contract

Repository `eas.json` uses `build.production.environment=production`, `EXPO_PUBLIC_HERKEYS_BACKEND=production`, `EXPO_PUBLIC_HERKEYS_DATA_MODE=empty`, `EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE=true`. `empty` denotes a **real blank household, not a demo-account placeholder**. The Android internal `smoke-production-android` profile is also configured for Production but **no build was initiated**.

`src/config/supabase.ts` requires a production HTTPS URL with exact hostname `npykvnxnehlsdlbumzwk.supabase.co` when the profile names Production, and an Expo-public publishable/anon key. `src/monetization/config.ts` requires public, platform-specific RevenueCat SDK API keys. Supabase's existence of a publishable key does NOT establish that the correct URL and key are installed in the **EAS Production environment**. Missing keys, wrong build environment or stale app config remain risks until resolved from an exact-profile build configuration inspection.

The mobile IPA/AAB itself is distributed by Apple's App Store and Google Play; Supabase hosts runtime APIs, database and Edge Functions, not the native app artifact.

## Open prerequisites: NOT production-certified

1. **Native stores / RevenueCat, current live provider read-back:** RevenueCat project `proj93809efe` has App Store app bundle `com.herkeys.app` and Google Play package `com.heykeys.app`, but the `default` offering's monthly/annual/lifetime packages contain **only Test Store products**; no native App Store or Google Play catalog products are configured in RevenueCat. No live native subscription/restore possible from this current offering. Apple subscription key is VALID, App Store Connect API key is absent; Google subscriptions purchase API validation remains UNKNOWN due to package-not-found. The Production webhook integration exists and is marked **security setup pending**. No store products, prices, offering packages or delivery filters were changed here.
2. **Webhook/Edge secrets:** Production database kill switches remain OFF. Production `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_WEBHOOK_HMAC_SECRET`, `REVENUECAT_SECRET_API_KEY`, `PREMIUM_OPS_SECRET`, `PREMIUM_ENVIRONMENT` and any Gemini key must be confirmed through secure secret management plus actual 401/503 endpoint probes. This connection cannot list secret values or verify nonsecret presence; do not label them configured without dashboard checks. Do not enable payment processing before provider-native purchase/transfer/expiry tests.
3. **Auth & delivery:** Production Auth SMTP sender/confirmation, password-reset template and resend code delivery, Apple/Google OAuth service setup, Redirect allowlist, and welcome-mail send flag still lack a current end-to-end mailbox/device test. Separate, older source doc `docs/builds/HK_V2_PRODUCTION_EMAIL_INTEGRATION.md` has **stale** remote-deployment flags: the welcome receipts table and function now exist, but successful deliverability is still NOT VERIFIED. Supabase advisor lists a leaked-password-protection configuration warning.
4. **Native EAS credentials:** Confirm Production profile `EXPO_PUBLIC_SUPABASE_URL`, public Supabase key and iOS/Android RevenueCat public keys (correct app IDs, no service secrets), OAuth redirect identity, native build/signing and consent, before authorizing IPA/AAB. No EAS build, store pricing adjustment or artifact upload was authorized/performed.
5. **Owner decisions:** Approve the 24-hour reconciliation freshness TTL (and provider lookup/cost limits); resolve Premium quota, Momentum thresholds, account-deletion #9 independent certification, paywall store metadata. Run real Production-backend free-path smoke plus external-Staging native Sandbox paid tests, and separate hostile security/release audit before opening Production Premium.
6. **Supabase advisories (existing, not caused by migration):** 24 `rls_enabled_no_policy` informational warnings (many private backend tables), 1 `pg_net` public extension WARN, 7 authenticated SECURITY DEFINER EXECUTE WARN, 1 Auth leaked-password-protection WARN. Review intentionally rather than blanket-granting or revoking permissions. Advisor: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Final disposition

```
PRODUCTION_DB_FRESHNESS_PARITY=PASS
PRODUCTION_SHARED_SCHEMA_AND_POLICIES=PASS
PRODUCTION_EDGE_SOURCE_PARITY=PASS_WITH_EXPECTED_ENVIRONMENT_DELTA
PRODUCTION_PREMIUM_SAFE_DISABLED=PASS
PRODUCTION_DELETION_SAFE_DISABLED=PASS
PRODUCTION_NATIVE_ARTIFACT_PROFILE_SOURCE=PASS
PRODUCTION_EAS_ENV_SECRET_INJECTION=UNVERIFIED
PRODUCTION_AUTH_EMAIL_DEVICE_E2E=NOT_RUN
PRODUCTION_REVENUECAT_NATIVE_PRODUCT_CATALOG=FAIL
PRODUCTION_WEBHOOK_SECURITY_DELIVERY=UNVERIFIED
PRODUCTION_PAID_LAUNCH=BLOCKED
READY_FOR_FREE_APP_PRODUCTION_SMOKE=CONDITIONAL_ON_ENV_AND_AUTH
```

**Important:** This document is an evidence report of completed production database preparation, not authorization to build a native artifact, switch on Production Premium, alter prices, modify account deletion or submit stores.
