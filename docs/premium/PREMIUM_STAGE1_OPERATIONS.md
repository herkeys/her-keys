# Her Keys Premium — Stage 1: Operations Runbook

Audience: whoever is on call for Her Keys Premium once the owner authorizes a Staging (and later Production) deployment.
**Nothing in this runbook has been executed against Staging or Production** — Stage 1 deploys nothing. Every procedure below was written from the migrations and
Edge Functions in this branch and is exercised at the source level by the SQL suites and the journey harness; its first real rehearsal is the Staging plan's step 9.

Principles: **forward-fix over downgrade; never delete customer evidence; Free is never degraded by any Premium switch; a switch stops *new* Premium work only —
what a person already has stays readable.** Every query below is read-only unless marked **WRITE**. Run SQL as `service_role` (Supabase SQL editor / MCP `execute_sql`); the app roles cannot reach these objects.

## 1. Switches (what each does and does not do)

| Switch | Where | Effect | Does NOT affect |
|---|---|---|---|
| **Global Premium off** | `UPDATE premium_runtime_config SET premium_enabled=false` **WRITE** | every Premium authorization is denied with `service_unavailable`; alert `premium_globally_disabled` fires | Free features; saved data; webhook ingestion; reading receipts and saved reviews |
| **Stop webhook processing** | `webhook_processing=false` **WRITE** | events are still **stored durably**, not applied; alert `webhook_processing_halted` | entitlement reads (last projection stands); authorization |
| **One feature off** | `UPDATE premium_feature_config SET enabled=false WHERE feature_key='…'` **WRITE** | that feature's new operations are denied with `feature_disabled` | other features; its saved receipts |
| **Kill an AI feature** | `kill_switch=true` on `smart_inbox_extract` **WRITE** | denied with `feature_disabled` before any quota is reserved, so the model is never called | Free Talk It Out (deterministic reader) |
| **Unrelease a feature** | `released=false` / `rollout_status='not_released'` **WRITE** | invisible in the manifest | — |
| **Min app version** | `min_app_version='x.y.z'` **WRITE** | older builds get `update_app` | newer builds |

Each write bumps nothing automatically: increment `manifest_version` on the feature row when a change should invalidate clients' cached manifest.
`premium_runtime_config.environment` and `allow_test_fixtures` are **structural**: a production row can never hold `allow_test_fixtures=true` (CHECK constraint), and the health function pages if a
`test_fixture` entitlement ever exists in production.

## 2. Is it healthy? (one call)

```sql
SELECT public.premium_health();
```
Returns `{environment, ok, alerts:[{rule, severity, value, threshold}], counts}`. Alert rules and first response:

| Rule | Severity | Meaning | First response |
|---|---|---|---|
| `dead_letter_events` > 0 | **page** | an event failed 5 times | §4.2 inspect and replay; if a provider outage, §4.3 |
| `webhook_backlog_age_seconds` > 600 | **page** | events waiting > 10 min | §4.1 run the backlog processor; check the function logs |
| `accounts_needing_reconcile` > 25 | warn | projections disagree or transfers pending | §4.4 force-reconcile |
| `paid_projection_not_reconciled_30d` > 0 | warn | a paid account was never re-read for 30 days | §4.4 |
| `failed_or_blocked_decisions_24h` > 10 | warn | receipts failing or undo blocked | inspect `premium_metrics_decisions`; a Daily Load regression looks like this |
| `webhook_processing_halted` / `premium_globally_disabled` | warn | a switch is off | confirm it is intentional |
| `test_fixture_entitlement_in_production` | **page** | a fabricated entitlement exists in production | §6 immediately |

Dashboards are SQL views, service-role only, metadata only (no content, no e-mail, no household text): `premium_metrics_denials` (denial reasons per day/feature),
`premium_metrics_webhook` (hourly counts, processing time, provider delay), `premium_metrics_backlog`, `premium_metrics_projection` (needing reconcile, never reconciled, stale),
`premium_metrics_usage` (operations / units / cost units per feature), `premium_metrics_decisions` (receipts by feature, kind, status). **Exporting them to an external
dashboard or alerting product needs a privacy and retention review first (OD-P1-05).**

## 3. Secrets

Hosted values live in Supabase **Edge Function secrets**, never in the app and never in git. The RevenueCat **public SDK keys are not credentials** and are rejected if offered as one.

| Secret | Used by | Rotation |
|---|---|---|
| `REVENUECAT_WEBHOOK_AUTH` | `revenuecat-webhook` (Authorization header, constant-time) | change in RevenueCat's webhook settings **and** the secret in the same window; during the window both ends disagree, so events queue at RevenueCat (it retries) — do it in a quiet period and then run §4.1 |
| `REVENUECAT_WEBHOOK_HMAC_SECRET` | same (`X-RevenueCat-Webhook-Signature: t=…,v1=…`, 300 s tolerance) — **required when `PREMIUM_ENVIRONMENT=production`** | RevenueCat shows it once when HMAC signing is enabled; rotate by re-enabling signing, then update the secret |
| `REVENUECAT_SECRET_API_KEY` | reconcile (REST read of the authenticated subscriber record) | create the new key in RevenueCat, set it, then revoke the old; until set, reconcile returns `provider_unavailable` and events that need it **fail and retry** rather than guess |
| `PREMIUM_OPS_SECRET` (≥ 24 chars) | `premium-ops` (operator endpoint, header `x-premium-ops-secret`) | set a new value and tell the on-call; there is no app caller |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | `smart-inbox-extract` | unset the key = Smart Inbox returns "not configured" **before reserving a unit** (nothing is charged) |
| `PREMIUM_ENVIRONMENT` | all | `staging` accepts **SANDBOX** events only; `production` accepts **PRODUCTION** only |

## 4. Recovery procedures

### 4.1 Process the backlog (idempotent, safe to repeat)
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/premium-ops" -H "x-premium-ops-secret: $PREMIUM_OPS_SECRET" -H "content-type: application/json" -d '{"action":"backlog","limit":50}'
```
Re-processes `received` and `failed` events. An event is applied at most once (idempotent on `(environment, event_id)`).

### 4.2 Inspect a failed or dead-lettered event
```sql
SELECT id, event_type, environment, status, attempts, last_error, received_at FROM public.premium_events WHERE status IN ('failed','dead_letter','ambiguous') ORDER BY received_at DESC LIMIT 50;
```
`last_error` is a code, never payload content. **WRITE — replay** (only after fixing the cause): `UPDATE public.premium_events SET status='received', attempts=0 WHERE id = '…';` then §4.1.
Never delete an event.

### 4.3 RevenueCat unreachable
Transfer/refund/ambiguous events call the REST API; with it unreachable they **fail and retry** (they are never applied from the event alone). Expect `accounts_needing_reconcile` and backlog age to rise.
Do nothing destructive; when RevenueCat recovers run §4.1 then §4.4. Customers see "checking" (never "expired") while a state is unconfirmed; an account whose expiry has passed with no confirmation is `unknown`, not `expired`.

### 4.4 Force-reconcile one account (rate-limited server-side)
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/premium-ops" -H "x-premium-ops-secret: $PREMIUM_OPS_SECRET" -H "content-type: application/json" -d '{"action":"reconcile","accountId":"<uuid>"}'
```
Reads RevenueCat's authenticated record and rebuilds the projection by compare-and-swap. A customer can do the same for themselves with "Check again" in the app.

### 4.5 A customer says "I paid and nothing unlocked"
1. `SELECT public.premium_entitlement_state('<uuid>') AS state, source, environment, has_entitlement, expires_at, grace_expires_at, canceled_at, billing_issue_at, revoked_at, needs_reconcile, last_reconciled_at FROM public.premium_entitlements WHERE account_id='<uuid>';` (the state is **derived at read time**, so it is a function, not a stored column)
2. `premium_subscriber_identities` for that account — does the **App User ID equal the Supabase auth UUID**? A mismatch is an identity-binding problem, not a projection problem.
3. §4.4. If it still reads `free`, look for an event in `premium_events` for the subscriber (`status`, `last_error`). Sandbox purchases against Production are recorded and **not granted** by design (OD-P1-07).
4. Never edit `premium_entitlements` by hand: the projection has per-field clocks and a compare-and-swap writer; a manual edit is overwritten by the next event and hides the real fault.

### 4.6 Denial spike
`SELECT * FROM public.premium_metrics_denials WHERE day >= current_date - 2 ORDER BY decisions DESC;` A rise in `requires_ai_consent` after a policy-version change is expected (the consent version is `premium_runtime_config.ai_policy_version`);
a rise in `entitlement_unknown` means the projection is unconfirmed (§4.3); `quota_exhausted` for one feature may mean the controlled-test limit is too low for the audience (the limits are **not** owner-approved).

## 5. Cost control (AI)
`premium_feature_config.global_daily_cost_cap` is a per-feature **daily cost cap** over the day's counter in `premium_usage_global`; reaching it denies new operations for the day. Smart Inbox reserves a unit **before** calling the model and releases it if the model fails,
so a provider outage is not billed to the customer. To stop spend immediately: kill switch (§1).

## 6. Rollback
* **Disable, don't drop:** §1 switches stop all *new* Premium work in seconds without a deploy and without touching Free.
* **Bad deploy of an Edge Function:** redeploy the previous version; the functions are stateless and idempotent over the same tables.
* **Bad migration (before any Production row exists):** the reverse path is dropping the objects the two migrations created, in reverse dependency order (ledger migration, then foundation). It is **only valid while the tables are empty**.
* **After Production rows exist:** forward-fix only. Never drop `premium_events` or `premium_decisions`: they are evidence and receipts.
* **A fabricated entitlement in production (page):** `SELECT account_id FROM premium_entitlements WHERE source='test_fixture';` — the structural CHECK should make this impossible; if it appears, treat it as a security incident, preserve the rows, and escalate before deleting.

## 7. What is deliberately *not* here
No dashboard hosting, no pager integration, no external telemetry (OD-P1-05); no customer-facing status page; no automated replays. Each is an owner decision.
