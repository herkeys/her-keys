# Production handoff: database migrations applied; activation remains closed

Target: npykvnxnehlsdlbumzwk. The owner authorized the eight reviewed canonical lifecycle SQL migrations; all eight were applied on 2026-10-14. Customer deletion, Edge Function deployment, scheduler installation and worker activation remain unauthorized. The pre-apply read-only inspection found no lifecycle tables/migrations and no pg_cron extension. Existing Edge Function versions are captured in deployment-manifest.json. Production RevenueCat secret names and project-ID digest were independently inspected without revealing either key.

Concrete candidate:
- Mobile source 8b59fd99daeb73ee5bde68bfef5b8baac24939f3; exact-source CI https://github.com/herkeys/her-keys/actions/runs/38558155165 succeeded.
- Website source 8a99fdd6c58faa2d2c56f7c06b468483f56671a0; exact-source CI https://github.com/herkeys/her-keys-web/actions/runs/38555077652 succeeded.
- Eight additive migrations in canonical filename order, with SHA-256 and Staging history mapping in deployment-manifest.json.
- New functions: request-account-deletion, restore-account, resend-restoration-email, deletion-status, process-account-deletions, monitor-account-deletions, expire-account-deletion-proofs, capture-apple-credential, begin-web-deletion.
- Redeploy calendar-oauth and all consumers of the changed shared requireUser guard: calendar-data, weather-context, herkeys-ai and herkeys-welcome-email. Pin dependencies and upload the reviewed shared files with every bundle.
- Never deploy staging-deletion-fixture, staging-deletion-lock-probe, their temporary RPC or Storage policy to Production.
- Scheduler blueprint installs all jobs disabled. Set the verified Production target only after deployment authorization. Control defaults enabled=false, dry_run=true; effective claim batch is 1, lease five minutes, max attempts 8.
- Daily proof retention is 365 days and daily 03:17 UTC; monitoring is separate. Production installation/activation of these jobs also requires deployment scope approval.

Required secret NAMES only: EXTERNAL_TOKEN_ENCRYPTION_KEY_B64, RESEND_API_KEY, DELETION_EMAIL_ENABLED, DELETION_RECOVERY_BASE_URL, DELETION_ALERT_RECIPIENT, REVENUECAT_PROJECT_ID, REVENUECAT_DELETION_API_KEY, APPLE_DELETION_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET. Preserve the existing HERKEYS_CALENDAR_APP_REDIRECT_URI setting and verify Google OAuth configuration independently. DELETION_STAGING_RECIPIENT is Staging-only. No secret value belongs in a manifest, client, log or approval message.

Approved policies: DELETE_ACCOUNT_OWNED_ESCALATE_SHARED; no automatic ownership transfer; never delete another adult's data; never issue false terminal purge. Shared cases target seven days. Only verified terminal proof receives the approved five-field/365-day retention treatment. Legal obligations require separate governance.

Production census: 45 public business tables; all are in the registered ownership model or the explicit households/profiles/discovery_answers paths. One existing legal-document bucket has three ownerless objects; there are no Storage objects owned by an existing Auth user. Public legal documents are not account-owned blobs and are not purge targets. The hosted privacy PDF remains unchanged; reviewed website disclosures are source changes awaiting release. Census details contain schema metadata only.

Before requesting the remaining deployment/activation approvals: complete native checks, hosted all-resource fixtures, hosted hostile/concurrency checks, independent watchdog and advisor review. The owner has deferred live Apple/Google tests; disclose their unverified coverage without calling them PASS. Public support is configured in website source using herkeysnow@gmail.com. No named disposable Production identity or accelerated expiry method is approved. A future concrete approval request must name its exact synthetic identity, time manipulation, allowed provider/Storage effects, deployed revisions and limits. After approved controlled Production certification, unattended destructive activation requires a second owner approval.

Emergency:
```sql
UPDATE public.account_deletion_control SET enabled=false,dry_run=true WHERE singleton;
SELECT cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='herkeys-account-deletion'),active:=false);
```
An in-flight bounded provider request may finish. Preserve pending restrictions, receipts, ledger, outbox and recovery. Restore only reviewed function revisions; never drop restrictions while requests remain pending, reverse a real purge, or claim external erasure is reversible.

Migration safety: MCP-generated Staging versions differ from canonical source filenames. Reconcile version history by migration name/checksum before CLI db push. Do not replay applied migrations or apply Staging operational fixtures to Production. The database-only approval has been exercised; no broader deployment or activation approval is inferred. EAS/store builds and publishing remain outside this assignment.
