# Automation certification

Runtime status: NOT_DEPLOYED. Source blueprint: supabase/blueprints/account_deletion_scheduler.sql. Proposed cadence: every five minutes, batch 5 (bounded 1–20), five-minute lease, 8 attempts, exponential backoff capped at one day. All destructive processing defaults disabled and dry-run.

The blueprint creates a disabled managed pg_cron job; it does not activate Production. A scheduled job must be observed invoking the worker without manual dispatch, with correlated database run IDs and end-to-end fixture evidence before ACTIVE_CERTIFIED can be reported. None has been observed yet.

Kill switch: UPDATE public.account_deletion_control SET enabled=false WHERE singleton. Scheduler stop: UPDATE cron.job SET active=false WHERE jobname='herkeys-account-deletion'. Kill-switch refusal is checked before claims and each resource boundary; bounded in-flight HTTP operations may finish. Recovery/email processing remains a separate concern and must remain available during the grace period.

Recovery/outbox configuration requires EXTERNAL_TOKEN_ENCRYPTION_KEY_B64, RESEND_API_KEY, DELETION_EMAIL_ENABLED, DELETION_STAGING_RECIPIENT. Apple and RevenueCat need their own server secrets. No key is placed in client bundles. Staging authorized recipient and operational alert recipient: herkeysnow@gmail.com, supplied by owner in this chat.

Independent stale-scheduler monitoring, alert delivery/deduplication, delivery webhooks, and recurring Staging certification remain required. CLI secret/API-key access returned 403. The connector can inspect/deploy but has no exposed secret setter. RevenueCat connector exposes only K Scan; no K Scan credentials or resources may be reused.
