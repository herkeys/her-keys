# Production account-deletion infrastructure deployment — 2026-10-14

**Scope:** Owner-authorized Production infrastructure deployment only. No Production customer deletion, Apple/Google revocation, runtime E2E, EAS build, or destructive worker activation was performed.

## Source and verification

- Production project: `npykvnxnehlsdlbumzwk`; Staging: `fhhudicklmpofuzkxeqe`.
- Source commit: `5bebb6853ef686f6346dbe48055554bf05382309`; [exact-SHA validation](https://github.com/herkeys/her-keys/actions/runs/38580669018) succeeded.
- This commit fixes the Apple server secret contract to `APPLE_DELETION_CLIENT_ID`, `APPLE_DELETION_TEAM_ID`, `APPLE_DELETION_KEY_ID`, `APPLE_DELETION_PRIVATE_KEY`, and adds a regression check.
- Staging redeployed: `capture-apple-credential` v3 and `process-account-deletions` v6; their returned bundles contain all four correct secret names and none of the legacy names.
- Production: eight canonical lifecycle migrations were **already applied** and were not replayed.

## Production Edge Function deployment

All 14 expected functions were observed `ACTIVE` after deployment:

| Function | Version | verify_jwt |
|---|---:|---|
| capture-apple-credential | 1 | true |
| request-account-deletion | 1 | true |
| deletion-status | 1 | false (opaque receipt) |
| restore-account | 1 | false (single-use recovery token) |
| resend-restoration-email | 1 | false (anti-enumeration/rate limiting) |
| begin-web-deletion | 1 | false (verification challenge) |
| process-account-deletions | 1 | false (signed internal request) |
| monitor-account-deletions | 1 | false (signed internal request) |
| expire-account-deletion-proofs | 1 | false (signed internal request) |
| calendar-data | 6 | true |
| calendar-oauth | 6 | false (Google callback state guard) |
| weather-context | 7 | true |
| herkeys-ai | 7 | true |
| herkeys-welcome-email | 5 | true |

Production `capture-apple-credential` and `process-account-deletions` bundles were independently read back: all four approved Apple names present, legacy names absent. The `herkeys-ai` shared auth bundle was read back and includes the account-state guard.

## Scheduler installed INACTIVE

Applied the reviewed `supabase/blueprints/account_deletion_scheduler.sql` as migration `account_deletion_scheduler_installed_disabled`, creating `pg_cron` and `pg_net`, the private invocation helper and three schedules:

- `herkeys-account-deletion`: `*/5 * * * *` — **inactive**
- `herkeys-account-deletion-monitor`: `2-59/5 * * * *` — **inactive**
- `herkeys-account-deletion-proof-expiry`: `17 3 * * *` — **inactive**

Scheduler target pinned to `https://npykvnxnehlsdlbumzwk.supabase.co`; exactly one internal worker-key row exists (value never read).

Post-deployment database verification: `account_deletion_control.enabled=false`, `dry_run=true`, `batch_size=1`, `max_attempts=8`; `account_deletion_retention_control.enabled=false`; zero deletion requests and zero saved Apple revocation credentials. No scheduled job is active.

## What is NOT certified

The user configured the four Apple secret names in the dashboard, but the connected tools cannot read or test their values. A valid Apple-signed JWT, native authorization-code capture, real Apple or Google revocation, authenticated customer deletion, email delivery, full live RevenueCat deletion, device-local erasure and unattended Production processing have **NOT RUN** under this deployment. No native artifact exists for the complete account-opening and deletion journeys. Staging prior fixture tests do not replace these skipped live-provider tests.

**Verdict:** `PRODUCTION_DELETION_INFRASTRUCTURE=DEPLOYED_INACTIVE`; `APPLE_SECRET_NAME_CONTRACT=PASS_SOURCE_AND_DEPLOYED`; `PRODUCTION_APPLE_REVOCATION=NOT_RUN`; `PRODUCTION_AUTO_PURGE=DISABLED`; `PUBLIC_RELEASE_CERTIFICATION=NOT_READY`.

Separate owner approval remains required to activate schedules or destructive worker processing.
