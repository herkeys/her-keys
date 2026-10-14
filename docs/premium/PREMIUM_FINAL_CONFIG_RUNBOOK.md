# Her Keys Premium — Final configuration and Staging certification runbook
**Environment:** Staging `fhhudicklmpofuzkxeqe`, Production `npykvnxnehlsdlbumzwk`.
**Source lane:** `codex/v2-premium-final-config` based on independent Premium CI.
**Operating rule:** All secrets are entered ONLY in their secure dashboards or the operator's ephemeral shell environment, NEVER chat, Git, source, a committed dotenv, or command arguments. Production new Premium computation, webhook processing, and account deletion remain OFF in this sprint.

## 0. First read-back (safe before credentials)
From a clean checked-out certification branch with Node 22 and `npm ci`, run:

```bash
node scripts-dev/premium-final-config.mjs preflight --env staging
node scripts-dev/premium-final-config.mjs preflight --env production
```

Both commands intentionally report FAIL until all required shell credentials, Supabase secrets and webhook dashboard settings exist. Only check names and booleans appear in their output; no keys are printed. A failure here is expected **today**; it is not a reason to weaken the validator.

The validator checks actual unauthenticated HTTP endpoint behavior: the three JWT endpoints deny untrusted calls; webhook and ops must return 401 for unauthenticated POST after configuration (503 `not_configured` means missing credentials). It also reads both Premium runtime rows via scoped admin credentials and refuses a wrong environment, enabled Production, Production webhook processing, or enabled test fixtures. It requires locally supplied Staging and Production credentials to differ.

### Privileged operator shell environment, not a dotenv
Supply scoped variables in an ephemeral secure terminal session. Variable names only are listed here — do **not** put literal values in the shell command history or scripts:

```
export HK_STAGING_PREMIUM_ENVIRONMENT=staging
export HK_PRODUCTION_PREMIUM_ENVIRONMENT=production
```

For each environment prefix `HK_STAGING_` / `HK_PRODUCTION_`, securely enter the values of `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_WEBHOOK_HMAC_SECRET`, `REVENUECAT_SECRET_API_KEY`, `PREMIUM_OPS_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`. The final one is an **operator-only** admin credential used to query the runtime and manage Staging-only test user app metadata; it is not an Edge secret to create and must never go into Expo public variables. Existing modern scoped Supabase secret keys may be used only if they have the required admin/RPC permissions.

For example, using a shell's no-echo prompt (paste at the prompt, not in source):

```bash
read -r -s -p 'Staging RevenueCat webhook auth: ' HK_STAGING_REVENUECAT_WEBHOOK_AUTH; echo
export HK_STAGING_REVENUECAT_WEBHOOK_AUTH
```

Repeat for the other variable names and each environment. **Do not run `set -x`, `env`, `printenv`, command tracing or `echo "$VARIABLE"` in this session**. At completion, `unset` the operator variables and close the shell.

## 1. Dashboard-only step: RevenueCat webhook Authorization and HMAC
Open in your authenticated RevenueCat project `proj93809efe`:

- **Staging Sandbox:** https://app.revenuecat.com/projects/93809efe/integrations/webhooks/whintgr2afbbcfb32
- **Production events:** https://app.revenuecat.com/projects/93809efe/integrations/webhooks/whintgrf7d1c93842

These destinations are already registered and should NOT be duplicated. In each webhook's settings, set its own random Authorization header value, enable HMAC signing and capture the signing secret, which may only be shown once. Make the pairs different across environments. The callback URLs MUST remain exactly:

- Sandbox: `https://fhhudicklmpofuzkxeqe.supabase.co/functions/v1/revenuecat-webhook`
- Production: `https://npykvnxnehlsdlbumzwk.supabase.co/functions/v1/revenuecat-webhook`

RC signing header: `X-RevenueCat-Webhook-Signature` of the form `t=<seconds>,v1=<HMAC-SHA256>` over `<seconds>.<unmodified raw body>`. The server rejects signatures older/newer than 300 seconds. The human may trigger a RevenueCat **TEST** delivery after all secret settings are saved. **Do not simulate a purchase in Production.**

See official documentation: https://www.revenuecat.com/docs/integrations/webhooks

## 2. Dashboard-only step: Supabase Edge secrets in both isolated projects
Set these exact names under **Supabase project → Edge Functions → Secrets**, separately in Staging and Production:

| Secret | Staging value source | Production value source |
|---|---|---|
| `PREMIUM_ENVIRONMENT` | literal `staging` | literal `production` |
| `REVENUECAT_WEBHOOK_AUTH` | Staging webhook Authorization in RC | Production webhook Authorization in RC |
| `REVENUECAT_WEBHOOK_HMAC_SECRET` | Staging RC HMAC signing secret | Production RC HMAC signing secret |
| `REVENUECAT_SECRET_API_KEY` | Her Keys RevenueCat private subscriber-lookup key | separate Production private key scoped to same project |
| `PREMIUM_OPS_SECRET` | dedicated random operations-only credential | different dedicated random operations-only credential |

The database value `premium_runtime_config.environment` does **not** populate `Deno.env.get('PREMIUM_ENVIRONMENT')` in Edge Functions. Check both. The connected Supabase action cannot set these secrets; using the dashboard or a local authenticated Supabase CLI is required.

Run **both** preflights again; each check should turn PASS without revealing credentials:

```bash
node scripts-dev/premium-final-config.mjs preflight --env staging
node scripts-dev/premium-final-config.mjs preflight --env production
```

Production preflight is READ-ONLY; it should verify `premium_enabled=false`, `webhook_processing=false`, fixture prohibition and environment identity. Never run an activation command against Production.

## 3. Staging-only server enforcement migration
The source contains additive Staging-only server guard `supabase/migrations/20261015140000_premium_staging_tester_guard.sql`. This overrides `premium_authorize` while preserving the original account lifecycle, entitlement, quota, consent and RLS requirements. It only adds a check that a Staging Premium account's `auth.users.raw_app_meta_data.herkeys_premium_tester` is `true` when a feature has `rollout_status='staging_only'`.

**Deployment read-back, October 14:** this migration was applied to Staging **only** and `SELECT public.premium_staging_allowlist_guard_ready()` returned `true`. Production has no such guard function, and its Premium/webhook switches remain OFF. Future operators should verify the same query before activating and should **not re-apply** the migration. **Do not apply to Production in this sprint.**

Only a Supabase Admin API can set `raw_app_meta_data`. The user's client-writable `raw_user_meta_data`, an `isPremium` request body, or an app UI flag does not grant tester membership or Premium.

## 4. Signed Staging webhook receipt test
The CLI's local fixture library contains each required RevenueCat event shape and local HMAC tests, including `INITIAL_PURCHASE`, `TRANSFER` and deprecated `SUBSCRIBER_ALIAS`. Its default remote smoke is a **TEST** event, which cannot prove a paid purchase. It checks HTTP 200 **and** that a matching Staging `premium_events` row was durably persisted.

```bash
node scripts-dev/premium-final-config.mjs smoke --type TEST --env staging
```

For a deliberately synthetic `INITIAL_PURCHASE` event, require an existing allowlisted Staging test account and the explicit `--synthetic-only` switch. This transport test is NOT subscription proof, and the backend must NOT issue Premium from the event alone; it must authenticate the subscriber state with RevenueCat.

Only where the owner explicitly permits a synthetic purchase-shaped Staging transport exercise (never Production), the command is:

```bash
node scripts-dev/premium-final-config.mjs smoke --type INITIAL_PURCHASE --account-id "$HK_STAGING_TESTER_ACCOUNT_ID" --synthetic-only --env staging
```

**Expected:** an accepted/durable event does *not* by itself grant Premium. The runner emits `actualPurchaseVerified:false` and `entitlementGrantVerified:false`. Genuine subscriber evidence must come from RevenueCat and the reconciliation runner. For genuine subscription certification, make an actual RC Sandbox purchase or restore in a signed-in test build and inspect its RevenueCat event + server projection. **Do not substitute a forged purchase fixture for that verification.**

## 5. Staging tester allowlist
Use the UUID of an existing **Staging Supabase Auth** account, not a Production account. Account IDs belong in a secure test evidence record, not an unrestricted public ledger.

```bash
node scripts-dev/premium-final-config.mjs tester add --account-id "$HK_STAGING_TESTER_ACCOUNT_ID" --env staging
node scripts-dev/premium-final-config.mjs tester remove --account-id "$HK_STAGING_TESTER_ACCOUNT_ID" --env staging
```

The command preserves existing app metadata and changes only the service-admin Staging tester marker. It reads back the marker for proof. A nonallowlisted user must receive `feature_disabled` from `premium_authorize` on every paid Stage 1 feature; a tester still must have an RC-confirmed entitlement. A local App User ID is **always** the matching Supabase Auth UUID.

## 6. Staging reconciliation and mismatch repair
```bash
node scripts-dev/premium-final-config.mjs reconcile --account-id "$HK_STAGING_TESTER_ACCOUNT_ID" --env staging
node scripts-dev/premium-final-config.mjs reconcile --account-id "$HK_STAGING_TESTER_ACCOUNT_ID" --env staging --resync
```

The runner fetches the current subscriber state through RC REST API (server secret), reads the Staging Premium projection via service role, and classifies `matched`, `missing`, `stale`, or `conflicting`. `--resync` calls existing `premium-ops` force-reconcile once, then rechecks. Any unresolved mismatch exits nonzero. A paid subscriber requires RC-provider verified state; synthetic webhook receipt does NOT suffice.

## 7. Controlled Staging activation, verification, rollback
Only after authenticated signed TEST receipt, backend negative auth/HMAC checks, tester marker, guard migration and a real subscription reconciliation PASS, activate paid features for allowlisted Staging users. **The command independently verifies an authenticated TEST receipt less than 15 minutes old AND a currently provider-confirmed Premium entitlement for the named tester; the `--signed-smoke-passed` flag alone is never sufficient.**

```bash
node scripts-dev/premium-final-config.mjs window enable --account-id "$HK_STAGING_TESTER_ACCOUNT_ID" --env staging --signed-smoke-passed
node scripts-dev/premium-final-config.mjs window verify --env staging
```

This updates only Staging's three paid rows `daily_load_premium`, `smart_inbox_extract`, `momentum_report` to `enabled=true`, `released=true`, `rollout_status='staging_only'` and resumes Staging webhook processing. The server `premium_authorize` guard refuses nonallowlisted accounts and still requires real entitlements, correct household ownership, AI consent and quota.

**Immediate Staging fail-closed rollback, safe without secret preflight:**

```bash
node scripts-dev/premium-final-config.mjs window disable --env staging
```

It disables the global Premium computation gate and webhook processing FIRST, then clears release flags for the three features. Free Talk It Out and saved user data stay available. No Production write path exists in the CLI.

## 8. Proof and stop/go
Certification checklist: missing/wrong auth 401; missing/bad/stale signature 401; hostile Production event ignored in Staging; duplicate event ID idempotent; older event cannot replace newer projection; TRANSFER never grants from event alone; real provider-verified Sandbox purchase and A/B restore; nonallowlisted Free denied; per-account quota concurrency, expiry/grace/cancel/revoke, and consent; Daily Load approved change durable/undo; Smart Inbox real provider consent/quota; Momentum report persisted after restart.

If any of these fails: execute the rollback command above, preserve event/decision evidence, do not delete rows or fake an entitlement. Production remains with `premium_enabled=false`, `webhook_processing=false`, account deletion disabled/dry-run.

**Evidence levels:** source implementation and local fixtures are not `STAGING_VERIFIED`. Only signed live RC deliveries, actual JWT testers, durable rows and a store Sandbox purchase count as hosted certification.

**Final operational blocker:** human security setup plus RC test delivery and actual Staging subscriber context. This runbook cannot create real paid store products; existing offering only has Test Store products, and Play/Apple provider readiness must be checked separately.
