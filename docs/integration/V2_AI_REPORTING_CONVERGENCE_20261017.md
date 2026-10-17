# Her Keys V2 — AI safety reporting and production convergence

**Source base:** PR #34 `23c5c279796d11ed37fe3c977d40112d3aa995bf`.  
**Branch:** `repair/v2-ai-reporting-and-prod-convergence-20261017`.  
**Status:** Source implementation candidate. Do not call provider/runtime/production certification PASS without real probes.

## Shared AI response reporting

The Talk It Out consumer surface now provides a themed, accessible **Report response** action on Her Keys responses and a functional form with five allowlisted reasons: unsafe, offensive, inaccurate, privacy, other. Only a message reference, explicit reason and idempotency key are submitted; **no prompt, conversation, response text or email is transmitted**.

Shared client `src/platform/aiResponseReporting.ts` verifies the originating account's session and pins its JWT before the RPC call. The UI aborts pending work when account/household/binding changes and ignores late completions. Errors never display server internals. A stored successful receipt is distinguished from a failed attempt. This is not a purchase/monetization feature.

The new forward-only `supabase/migrations/20261017180000_ai_response_reporting.sql` defines a **private** report queue, an authenticated-only, server-identity-derived SECURITY DEFINER submission RPC, RLS, explicit role grants, per-account idempotency, maximum five reports per rolling 24h (serialized by account advisory lock), 30-day maximum metadata retention, and an hourly? **daily** cron expiration job. Foreign-key deletion on account removal is cascading. A consumer cannot read or edit the report queue. The queue stores **no user messages or AI outputs**.

A private report queue is an intake mechanism, not proof it is operationally monitored. Before inviting real consumers to rely on reporting, the product owner must assign **an actual project-admin reviewer**, establish a review cadence and reviewer permissions/process, confirm 30-day metadata retention against the legal/privacy policy, and validate a reviewer read/disposition rehearsal. The current implementation intentionally has no automatic response-text attachment. A reply to a user should say only **submitted**, not claim human moderation or investigation occurred.

## Billing/RevenueCat environment configuration — confirmed 503

Both Staging and Production webhook/ops endpoints reported `503 not_configured` in the prior shared audit. Source review verifies the specific configuration contract:

| Edge function/role | Required secret and source rule |
|---|---|
| Both webhook environments | `REVENUECAT_WEBHOOK_AUTH` at least 16 characters and **identical to the configured RevenueCat delivery Authorization header** |
| Both webhook environments | `REVENUECAT_WEBHOOK_HMAC_SECRET` at least 16 chars, identical to that integration's HMAC signing secret; both Staging and Production require HMAC |
| Both projects | `PREMIUM_ENVIRONMENT`: literal `staging` or `production` respectively |
| Both ops endpoints | `PREMIUM_OPS_SECRET` at least 24 characters, submitted only through the protected `x-premium-ops-secret` operator header |
| Reconciliation | `REVENUECAT_SECRET_API_KEY` is required for positive RevenueCat subscriber queries |
| Supabase server role | Hosted `SUPABASE_URL` and supported `SUPABASE_SECRET_KEYS`/`SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` must be present and protected |

**Do not copy secret values into Git, chat, logs, tickets or client bundles.** The available Supabase connector can deploy functions, but does **not** expose Edge Function secret creation/update; the RevenueCat integration connector also cannot set the webhook Authorization header. These settings must be applied through the provider's authenticated console or an approved secrets-management workflow. Do not try to repair `503` by weakening HMAC requirements, accepting anonymous posts, or hard-coding credentials.

The existing destinations are:

- Staging sandbox: `https://fhhudicklmpofuzkxeqe.supabase.co/functions/v1/revenuecat-webhook`
- Production: `https://npykvnxnehlsdlbumzwk.supabase.co/functions/v1/revenuecat-webhook`

After **both** provider settings and Supabase secrets are installed, verify `503` becomes `401` for unsigned/bad requests; independently require a valid **provider-originated signed sandbox event** to reach durable `premium_events`, idempotent processing and account-safe reconciliation. Then reproduce valid signed delivery and negative controls in Production. Changing a descriptive integration name from `security setup pending` is not evidence of security.

**Never enable checkout.** Leave `premium_enabled` and Stage 1 flags unchanged. No manual Production entitlement grants.

## Production AI-consent promotion

Staging `herkeys-ai` v11 has verified exact source parity with the unconditional consent guard; Production v7 retains the prior conditional switch. PR #34's `V2_SHARED_BACKEND_PROMOTION_20261017.md` contains the tested source hashes and constrained deployment manifest.

Before promoting to Production, complete a legitimate authenticated Staging account matrix for missing/declined/outdated/affirmative AI consent, authorized real Gemini call, no provider call when denied, and actor-switch isolation using synthetic content only. A reported mock handler pass does **not** satisfy this positive hosted E2E gate. On successful Staging certification and after approval, deploy exactly the pinned three AI function files to Production, preserving `verify_jwt=true`, re-download for byte-for-byte comparison, then run safe Production probes. Do not roll back to the conditional v7 bundle.

## Source and migration acceptance

Run exact-SHA CI, TypeScript, Expo compatibility, full suite, security/boundary checks, SQL migration execution on Staging, privileged RPC call negative/positive role tests, live reporting submission/retry/duplicate/rate-limit, and reviewer read/disposition. No iOS/Android-only changes, account-deletion edits, purchases, Production schema change, EAS artifacts or provider credential changes are included in source scope.

**The eight inherited deletion and three inherited Premium Home failures remain separately assigned.** Classify missing proof as NOT_RUN; identify actual newly introduced source failures as defects.

## Pending owner/operational steps

- Configure RevenueCat delivery Authorization/header and HMAC to match Supabase in both environments using protected provider dashboards.
- Provide the legitimate Staging synthetic session/test user for AI consent and real Gemini tests.
- Appoint a reviewer with a real monitored queue/cadence and approve 30-day metadata retention (no content attachments).
- Review migration evidence before Production application and AI function promotion.
