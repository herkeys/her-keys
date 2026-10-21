# Account deletion operational runbook (2026-10-20)

**Gate `INDEPENDENT_WATCHDOG=BLOCKED`.** Implemented and tested; activation needs the owner's GitHub secret and variables after merge (DEL-P2-005).

## Components

| Component | Where | Schedule (blueprint) | Default |
|---|---|---|---|
| Worker `process-account-deletions` | Edge Function, HMAC | pg_cron `*/5` | job inactive; `enabled=false, dry_run=true` |
| Monitor `monitor-account-deletions` | Edge Function, HMAC; emails `DELETION_ALERT_RECIPIENT` via Resend | pg_cron `2-59/5` | job inactive in Production |
| Proof expiry `expire-account-deletion-proofs` | Edge Function | pg_cron `17 3 * * *` | job inactive in Production |
| **External watchdog** | GitHub Actions `account-deletion-watchdog.yml` → monitor | `7,37 * * * *` | inert until enabled |

## Health signals (`command('health')`, aggregate only)

| Signal | Meaning | Action |
|---|---|---|
| `scheduler_stale` | Worker enabled but no claim for >15 min | Check the cron job is active and pg_net succeeds; check the worker function's logs |
| `failed` | Requests in `failed_requires_action` / `partial_purge_pending_review` | Triage by `failure_category` (below) |
| `overdue_cases` | Shared-resource cases past the 7-day target | Escalate; resolve per shared-household policy; never transfer ownership automatically |
| `overdue_requests` | Not purged >1 day after the recovery deadline (even while disabled) | Processing is off or stuck. Decide whether to activate or communicate the delay |
| `stale_leases` | Processing lease expired >5 min | Worker crashed mid-run; the next claim re-fences it automatically |
| `email_problems` | Outbox failed / bounced / unconfirmed >30 min | Check the Resend key, domain and suppression list |
| `retention_stale/failed/overdue` | Proof expiry not running | Check the daily job; >26 h raises an alert |

## Failure categories and responses

| `failure_category` | Response |
|---|---|
| `shared_resources_pending_review` | Open restricted cases. Verify the departing adult's rows are gone and the other adult's are intact, resolve each case, then `requeue` (refused while any case is open) |
| `unclassified_resource` | A new table exists without classification. Engineering adds a reviewed registry/exception entry via migration. Never bypass |
| `attempts_exhausted` / `operation_unavailable` | Read the request `evidence` keys with `requires_retry`. Fix the provider config or outage, then `requeue` |
| Apple `requires_retry` with credentials present | Apple outage or misconfiguration (`invalid_client`, missing `APPLE_DELETION_*`). Fix it, then requeue. Note: credentials are purged at the attempt ceiling, so a requeue then settles as `manual_revocation_required` (truthful; the user gets manual steps) |
| `apple_revoked='manual_revocation_required'` | Not a failure. Deletion completes; the user was told how to remove the Apple grant |
| `google_revoked='credential_already_invalid'` | Not a failure. Google reported the grant already invalid |
| `terminal_verification_failed:*` | Something remained after cleanup. The suffix names the table/group. Investigate; never force finish |

## Interrupted worker

A worker killed mid-run leaves the request in `processing` with a lease. After expiry the next claim increments `fence`, and the old worker's later calls fail `lease_or_control_refused`. Already acknowledged providers are not repeated (Phase 1 AD-013). If it repeats until `max_attempts`, the request becomes `failed_requires_action`, `health.failed>0`, the monitor emails, and the external watchdog run fails. It never disappears silently.

## External watchdog activation

1. Merge to the default branch (schedules run only there).
2. Repository secret `DELETION_WORKER_KEY` = the target project's `private.deletion_worker_key.secret` (read by an owner over a secure channel; never pasted into chat or logs).
3. Repository variables `DELETION_WATCHDOG_PROJECT_URL` (exact project URL) and `DELETION_WATCHDOG_ENABLED=true`.
4. Run it once via `workflow_dispatch`; expect `{"ok":true,"reason":"healthy"}`.
5. Make sure the owner account receives "failed workflow" notifications (GitHub settings → Notifications → Actions).

Each run also triggers the monitor's own alert path (deduplicated hourly), which is intended.

## Emergency kill switch

```sql
UPDATE public.account_deletion_control SET enabled=false, dry_run=true WHERE singleton;
SELECT cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='herkeys-account-deletion'), active:=false);
```

In-flight work stops at the next fenced boundary; an already sent provider HTTP call may finish. Do not delete requests, cases or evidence when stopping. Restoration and deactivation reconciliation keep working while destructive processing is off.

## Customer support

- Status: the customer's private receipt on `/delete-account` (web) or in the app.
- Support address (owner-approved): `herkeysnow@gmail.com`. Never ask for passwords, codes or recovery links.
- "Failed / under review" means not deleted yet; the target is 7 days after escalation.
- Missing or expired proof never confirms deletion. After 365 days the proof is gone by design.
